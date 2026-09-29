'use strict';

const aiService = require('../services/ai.service');

async function askAI(req, res) {
  try {
    const { question, agent = 'coo', context = {} } = req.body;
    if (!question) return res.status(400).json({ success: false, message: 'question is required' });

    let result;
    switch (agent.toLowerCase()) {
      case 'cfo': result = await aiService.askCFO(question, context); break;
      case 'cro': result = await aiService.askCRO(question, context); break;
      case 'strategy': result = await aiService.askStrategy(question, context); break;
      default: result = await aiService.askCOO(question, context);
    }
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function streamAI(req, res) {
  try {
    const { question, agent = 'coo', context = {} } = req.body;
    if (!question) return res.status(400).json({ success: false, message: 'question is required' });

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    await aiService.streamToAgent(agent, question, context, res);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
}

async function getDailyInsights(req, res) {
  try {
    const data = await aiService.getDailyInsights();
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function generateReport(req, res) {
  try {
    const { type = 'weekly_ops', scope = {} } = req.body;
    const data = await aiService.generateReport(type, scope);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

async function askStrategy(req, res) {
  try {
    const { question, context = {} } = req.body;
    if (!question) return res.status(400).json({ success: false, message: 'question is required' });
    const data = await aiService.askStrategy(question, context);
    res.json({ success: true, data });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
}

module.exports = { askAI, streamAI, getDailyInsights, generateReport, askStrategy };
