const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);
config.server.enhanceMiddleware = (metroMiddleware) => (req, res, next) => {
  if (!req.url.startsWith('/api/netmirror/') && !req.url.startsWith('/api/prime/')) return metroMiddleware(req, res, next);
  // The local catalog API lives beside the app workspace. Load it only for
  // local API requests so remote EAS bundling does not require that file.
  const { handleNetMirror, createNetMirrorProvider } = require('../netmirror-service');
  const primeProvider = createNetMirrorProvider('pv');
  const url = new URL(req.url, `http://${req.headers.host}`);
  const handle = url.pathname.startsWith('/api/prime/') ? primeProvider.handleNetMirror : handleNetMirror;
  handle(req, res, url).catch(() => {
    if (!res.headersSent) { res.writeHead(502, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ error: 'The video service is unavailable.', code: 'SOURCE_UNAVAILABLE' })); }
    else res.destroy();
  });
};
module.exports = config;
