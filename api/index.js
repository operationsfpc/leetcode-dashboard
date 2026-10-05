import app, { initApp } from '../src/server.js';

export default async function handler(req, res) {
  try {
    await initApp();
  } catch (e) {
    console.error('[vercel serverless error] init failed:', e);
    return res.status(500).json({ error: 'Database initialization failed: ' + e.message });
  }

  // Vercel serverless rewrites may set req.url to /api/index.js.
  // The actual requested client URL path is available in x-matched-path, x-forwarded-url, or query parameters.
  let targetPath = req.headers['x-matched-path'] || req.headers['x-forwarded-url'] || req.headers['x-now-route-matches'];
  
  if (targetPath && targetPath !== '/api/index.js' && !targetPath.startsWith('/api/index.js')) {
    req.url = targetPath;
  }

  // Ensure req.url has /api prefix for Express router mounting
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return app(req, res);
}
