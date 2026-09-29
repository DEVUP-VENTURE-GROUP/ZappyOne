'use strict';

/**
 * OpenRouter API integration for ZI AI agents.
 * Uses process.env.OPENROUTER_API_KEY
 * Base URL: https://openrouter.ai/api/v1
 */

const https = require('https');
const logger = require('../../../utils/logger');

const OPENROUTER_BASE = 'https://openrouter.ai/api/v1';

// Task → model routing map
const TASK_MODEL_MAP = {
  strategy:         'anthropic/claude-opus-4-8',
  financial_report: 'anthropic/claude-opus-4-8',
  risk_analysis:    'anthropic/claude-opus-4-8',
  ops_question:     'anthropic/claude-sonnet-4-6',
  city_analysis:    'anthropic/claude-sonnet-4-6',
  partner_review:   'anthropic/claude-sonnet-4-6',
  anomaly_summary:  'anthropic/claude-haiku-4-5-20251001',
  alert_message:    'anthropic/claude-haiku-4-5-20251001',
  simple_lookup:    'anthropic/claude-haiku-4-5-20251001',
  sql_generation:   'deepseek/deepseek-r1',
};

// Token cost per million (USD) — approximate OpenRouter pricing
const TOKEN_COSTS = {
  'anthropic/claude-opus-4-8':          { input: 15.0,  output: 75.0  },
  'anthropic/claude-sonnet-4-6':        { input: 3.0,   output: 15.0  },
  'anthropic/claude-haiku-4-5-20251001': { input: 0.8,   output: 4.0   },
  'deepseek/deepseek-r1':               { input: 0.55,  output: 2.19  },
};

/**
 * Make an HTTPS POST request to OpenRouter.
 * Returns parsed JSON body.
 */
function openRouterRequest(path, body, stream = false) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return reject(new Error('OPENROUTER_API_KEY is not set'));
    }

    const payload = JSON.stringify(body);
    const options = {
      hostname: 'openrouter.ai',
      path: `/api/v1${path}`,
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload),
        'HTTP-Referer': 'https://zappyone.com',
        'X-Title': 'Zappy Intelligence Platform',
      },
    };

    const req = https.request(options, (res) => {
      if (stream) {
        // Caller handles the raw response for SSE streaming
        return resolve(res);
      }

      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.error) {
            return reject(new Error(`OpenRouter error: ${parsed.error.message || JSON.stringify(parsed.error)}`));
          }
          resolve(parsed);
        } catch (e) {
          reject(new Error(`Failed to parse OpenRouter response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

/**
 * Make a GET request to OpenRouter API.
 */
function openRouterGet(path) {
  return new Promise((resolve, reject) => {
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
      return reject(new Error('OPENROUTER_API_KEY is not set'));
    }

    const options = {
      hostname: 'openrouter.ai',
      path: `/api/v1${path}`,
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'HTTP-Referer': 'https://zappyone.com',
        'X-Title': 'Zappy Intelligence Platform',
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch (e) {
          reject(new Error(`Failed to parse OpenRouter GET response: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.end();
  });
}

/**
 * Picks model from task, calls OpenRouter API, returns {content, model, usage}.
 */
async function routeToModel(task, messages, options = {}) {
  const model = TASK_MODEL_MAP[task] || 'anthropic/claude-sonnet-4-6';

  const body = {
    model,
    messages,
    max_tokens:   options.maxTokens   || 4096,
    temperature:  options.temperature !== undefined ? options.temperature : 0.3,
    top_p:        options.topP        || 1.0,
    stream:       false,
  };

  if (options.systemPrompt) {
    body.messages = [{ role: 'system', content: options.systemPrompt }, ...messages];
  }

  try {
    const response = await openRouterRequest('/chat/completions', body);

    const choice  = response.choices && response.choices[0];
    const content = choice ? choice.message.content : '';
    const usage   = response.usage || { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

    logger.debug({ task, model, tokens: usage.total_tokens }, 'OpenRouter call complete');

    return {
      content,
      model,
      usage: {
        inputTokens:  usage.prompt_tokens     || 0,
        outputTokens: usage.completion_tokens || 0,
        totalTokens:  usage.total_tokens      || 0,
      },
      finishReason: choice ? choice.finish_reason : null,
    };
  } catch (err) {
    logger.error({ err, task, model }, 'OpenRouter routeToModel failed');
    throw err;
  }
}

/**
 * SSE streaming version — pipes OpenRouter stream to Express response.
 * Writes SSE events; caller is responsible for setting headers before calling.
 */
async function streamToModel(task, messages, res) {
  const model = TASK_MODEL_MAP[task] || 'anthropic/claude-sonnet-4-6';
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    res.write('data: {"error":"OPENROUTER_API_KEY not set"}\n\n');
    res.end();
    return;
  }

  const body = {
    model,
    messages,
    max_tokens:  4096,
    temperature: 0.3,
    stream:      true,
  };

  const payload = JSON.stringify(body);

  const options = {
    hostname: 'openrouter.ai',
    path:     '/api/v1/chat/completions',
    method:   'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type':  'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'HTTP-Referer': 'https://zappyone.com',
      'X-Title': 'Zappy Intelligence Platform',
    },
  };

  return new Promise((resolve, reject) => {
    const req = https.request(options, (apiRes) => {
      apiRes.on('data', (chunk) => {
        const lines = chunk.toString().split('\n');
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const jsonStr = line.slice(6).trim();
            if (jsonStr === '[DONE]') {
              res.write('data: [DONE]\n\n');
            } else if (jsonStr) {
              try {
                const parsed = JSON.parse(jsonStr);
                const delta = parsed.choices?.[0]?.delta?.content || '';
                if (delta) {
                  res.write(`data: ${JSON.stringify({ delta, model })}\n\n`);
                }
              } catch {
                // skip malformed SSE chunks
              }
            }
          }
        }
      });

      apiRes.on('end', () => {
        res.write('data: [DONE]\n\n');
        res.end();
        resolve();
      });

      apiRes.on('error', (err) => {
        logger.error({ err }, 'OpenRouter stream error');
        res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
        res.end();
        reject(err);
      });
    });

    req.on('error', (err) => {
      logger.error({ err }, 'OpenRouter stream request error');
      res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
      res.end();
      reject(err);
    });

    req.write(payload);
    req.end();
  });
}

/**
 * Estimate cost in USD for a given task and token counts.
 */
function estimateCost(task, inputTokens, outputTokens) {
  const model  = TASK_MODEL_MAP[task] || 'anthropic/claude-sonnet-4-6';
  const costs  = TOKEN_COSTS[model] || { input: 3.0, output: 15.0 };
  const inputCost  = (inputTokens  / 1_000_000) * costs.input;
  const outputCost = (outputTokens / 1_000_000) * costs.output;
  return {
    model,
    inputTokens,
    outputTokens,
    inputCostUsd:  parseFloat(inputCost.toFixed(6)),
    outputCostUsd: parseFloat(outputCost.toFixed(6)),
    totalCostUsd:  parseFloat((inputCost + outputCost).toFixed(6)),
  };
}

/**
 * Returns current usage/quota from OpenRouter API.
 */
async function checkQuota() {
  try {
    const data = await openRouterGet('/auth/key');
    return {
      label:           data.data?.label || null,
      usageUsd:        data.data?.usage || 0,
      limitUsd:        data.data?.limit || null,
      isFreeTier:      data.data?.is_free_tier || false,
      rateLimitPerMin: data.data?.rate_limit?.requests || null,
    };
  } catch (err) {
    logger.error({ err }, 'checkQuota failed');
    throw err;
  }
}

module.exports = {
  routeToModel,
  streamToModel,
  estimateCost,
  checkQuota,
  TASK_MODEL_MAP,
};
