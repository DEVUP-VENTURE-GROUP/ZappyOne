'use strict';

const commandService = require('../services/command.service');

function initZICommandSocket(io) {
  const ziNs = io.of('/zi-command');

  ziNs.on('connection', async (socket) => {
    // Send initial data immediately
    try {
      const [metrics, cityHealth, alerts] = await Promise.all([
        commandService.getLiveMetrics(),
        commandService.getCityHealthScores(),
        commandService.getAlerts(),
      ]);
      socket.emit('live_metrics', metrics);
      socket.emit('city_health', cityHealth);
      socket.emit('alerts', alerts);
    } catch (err) {
      socket.emit('error', { message: 'Failed to load initial data' });
    }

    // Live metrics every 5 seconds
    const metricsInterval = setInterval(async () => {
      try {
        const metrics = await commandService.getLiveMetrics();
        socket.emit('live_metrics', metrics);
      } catch {}
    }, 5000);

    // City health every 30 seconds
    const cityInterval = setInterval(async () => {
      try {
        const cityHealth = await commandService.getCityHealthScores();
        socket.emit('city_health', cityHealth);
      } catch {}
    }, 30000);

    // Alerts every 60 seconds
    const alertsInterval = setInterval(async () => {
      try {
        const alerts = await commandService.getAlerts();
        socket.emit('alerts', alerts);
      } catch {}
    }, 60000);

    socket.on('disconnect', () => {
      clearInterval(metricsInterval);
      clearInterval(cityInterval);
      clearInterval(alertsInterval);
    });

    // Client can request a manual refresh
    socket.on('refresh_metrics', async () => {
      try {
        const metrics = await commandService.getLiveMetrics();
        socket.emit('live_metrics', metrics);
      } catch {}
    });
  });

  return ziNs;
}

module.exports = { initZICommandSocket };
