const config = require('../../config');
const logger = require('../../utils/logger');

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

/**
 * JSON schema the model must return. OpenRouter forwards this as the
 * OpenAI-compatible `response_format: json_schema` to providers that support it;
 * for providers that don't, the system prompt also demands strict JSON and we
 * parse defensively. Either way the server re-validates against the catalog.
 */
const RESULT_SCHEMA = {
  name: 'zappy_lens_result',
  strict: true,
  schema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      detected_object: { type: 'string', description: 'What is in the photo, plain words.' },
      image_quality:   { type: 'string', enum: ['good', 'blurry', 'dark', 'unclear', 'not_relevant'], description: 'Photo usability for diagnosis.' },
      is_serviceable:  { type: 'boolean', description: 'True if it maps to at least one provided service code.' },
      matches: {
        type: 'array',
        description: 'Best service matches, most confident first. Empty if nothing matches.',
        items: {
          type: 'object',
          additionalProperties: false,
          properties: {
            service_code:    { type: 'string', description: 'MUST be one of the provided catalog codes, verbatim.' },
            confidence:      { type: 'number', description: '0 to 1.' },
            severity:        { type: 'string', enum: ['low', 'moderate', 'high', 'unknown'] },
            issue_summary:   { type: 'string', description: 'One short line the customer sees.' },
            notes_for_worker:{ type: 'string', description: 'What the pro should know/bring before arriving.' },
          },
          required: ['service_code', 'confidence', 'severity', 'issue_summary', 'notes_for_worker'],
        },
      },
    },
    required: ['detected_object', 'image_quality', 'is_serviceable', 'matches'],
  },
};

function buildSystemPrompt(catalog) {
  const lines = catalog
    .map((s) => `- ${s.code} | ${s.name} | ${s.category}${s.description ? ' | ' + s.description.slice(0, 90) : ''}`)
    .join('\n');
  return [
    'You are ZappyLens, the visual diagnosis engine for Zappy, an on-demand home & vehicle services app in India.',
    'Look at the photo(s) and identify the problem, then map it to services Zappy actually offers.',
    '',
    'RULES:',
    '1. `service_code` MUST be copied verbatim from the catalog below. Never invent a code.',
    '2. Even if the photo is blurry, dark, or partial, make your BEST GUESS — return your most likely matches with lower confidence rather than giving up. Only return an empty matches array if the photo truly relates to nothing in the catalog (e.g. a selfie, a landscape, food).',
    '3. Set image_quality honestly: good | blurry | dark | unclear | not_relevant.',
    '4. Rank matches by confidence (0..1). Include up to 3.',
    '5. Be concrete in issue_summary (e.g. "Cracked rear screen, display lit") and notes_for_worker (e.g. "Bring 6.1\\" OLED panel + adhesive").',
    '6. Do not quote prices or time — the app computes those.',
    '7. Output ONLY the JSON object, no prose, no markdown fences.',
    '',
    'CATALOG (code | name | category | description):',
    lines,
  ].join('\n');
}

/** Pull a JSON object out of a model response that may be wrapped in fences/prose. */
function parseJsonLoose(text) {
  if (!text) return null;
  let t = String(text).trim();
  // strip ```json ... ``` fences
  const fence = t.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) t = fence[1].trim();
  try { return JSON.parse(t); } catch { /* fall through */ }
  // last resort: first {...} span
  const start = t.indexOf('{');
  const end = t.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(t.slice(start, end + 1)); } catch { /* noop */ }
  }
  return null;
}

/**
 * Call OpenRouter with a vision model and return the parsed result object,
 * or null if the model produced unparseable output. Retries 429/5xx once.
 */
async function analyzeImage({ imageUrls, catalog, model }) {
  if (!config.lens.apiKey) {
    throw Object.assign(new Error('ZappyLens is not configured.'), { status: 503, code: 'LENS_DISABLED' });
  }

  const body = {
    model,
    max_tokens: 900,
    temperature: 0.2,
    response_format: { type: 'json_schema', json_schema: RESULT_SCHEMA },
    messages: [
      { role: 'system', content: buildSystemPrompt(catalog) },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'Diagnose the issue in this photo and map it to Zappy services. Respond with the JSON object only.' },
          ...imageUrls.map((url) => ({ type: 'image_url', image_url: { url } })),
        ],
      },
    ],
  };

  let lastErr;
  let useSchema = true; // some providers reject json_schema with 400 — retry without it
  for (let attempt = 0; attempt < 3; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.lens.timeoutMs);
    try {
      const payload = useSchema ? body : { ...body, response_format: { type: 'json_object' } };
      const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        signal: controller.signal,
        headers: {
          Authorization: `Bearer ${config.lens.apiKey}`,
          'Content-Type': 'application/json',
          'HTTP-Referer': config.lens.publicUrl,
          'X-Title': 'Zappy ZappyLens',
        },
        body: JSON.stringify(payload),
      });

      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`OpenRouter ${res.status}`);
        await new Promise((r) => { setTimeout(r, 400 * (attempt + 1)); });
        continue;
      }
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        // 400 often means this provider doesn't accept json_schema — drop to
        // json_object and retry once before giving up.
        if (res.status === 400 && useSchema) {
          useSchema = false;
          logger.warn({ model, detail: errText.slice(0, 200) }, 'ZappyLens json_schema rejected — retrying as json_object');
          continue;
        }
        throw Object.assign(new Error(`OpenRouter error ${res.status}`), { status: 502, code: 'LENS_UPSTREAM', detail: errText.slice(0, 300) });
      }

      const data = await res.json();
      const content = data?.choices?.[0]?.message?.content;
      const parsed = parseJsonLoose(content);
      return { parsed, raw: content, model: data?.model || model };
    } catch (err) {
      if (err.name === 'AbortError') {
        lastErr = Object.assign(new Error('ZappyLens timed out.'), { status: 504, code: 'LENS_TIMEOUT' });
      } else {
        lastErr = err;
      }
    } finally {
      clearTimeout(timer);
    }
  }
  logger.warn({ err: lastErr?.message, model }, 'ZappyLens OpenRouter call failed');
  throw lastErr || Object.assign(new Error('ZappyLens failed.'), { status: 502, code: 'LENS_UPSTREAM' });
}

module.exports = { analyzeImage };
