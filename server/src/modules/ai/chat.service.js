// Text chat through OpenRouter for admin analysis: tries each configured model in order and returns the first real answer, or null.
const config = require('../../config');
const logger = require('../../core/logger');

const enabled = () => Boolean(config.ai?.apiKey);

async function chat(messages, { maxTokens = 4000, timeoutMs = 60000 } = {}) {
  if (!enabled()) return null;
  for (const model of config.ai.textModels) {
    try {
      const r = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.ai.apiKey}`, 'Content-Type': 'application/json', 'X-Title': 'ZappyOne admin' },
        // Reasoning models otherwise spend the whole budget thinking and return no text.
        body: JSON.stringify({ model, max_tokens: maxTokens, temperature: 0.2, reasoning: { effort: 'low', exclude: true }, messages }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const d = await r.json().catch(() => ({}));
      const text = d.choices?.[0]?.message?.content?.trim();
      if (r.ok && text) return { text, model: d.model || model };
      logger.warn({ model, status: r.status, err: d.error?.message?.slice(0, 120) }, '[ai] model gave no answer, trying the next');
    } catch (e) {
      logger.warn({ model, err: e.message }, '[ai] model call failed, trying the next');
    }
  }
  return null;
}

module.exports = { chat, enabled };
