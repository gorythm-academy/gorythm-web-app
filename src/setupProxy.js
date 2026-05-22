const { createProxyMiddleware } = require('http-proxy-middleware');

/** Dev-only: proxy /api to local backend when REACT_APP_API_URL is unset. */
module.exports = function setupProxy(app) {
  const target = process.env.REACT_APP_API_URL || 'http://localhost:5000';
  if (!target.includes('localhost') && !target.includes('127.0.0.1')) {
    return;
  }
  app.use(
    '/api',
    createProxyMiddleware({
      target,
      changeOrigin: true,
    })
  );
};
