const { createProxyMiddleware } = require('http-proxy-middleware');
module.exports = function(app) {
  app.use('/webapp', createProxyMiddleware({
    target: 'http://localhost:3001',
    changeOrigin: true,
    secure: false,
    logLevel: 'warn'
  }));
};
