import app, { initApp } from '../src/server.js';

export default async function handler(req, res) {
  try {
    await initApp();
  } catch (e) {
    console.error('[vercel serverless error] init failed:', e);
    return res.status(500).json({ error: 'Database initialization failed: ' + e.message });
  }
  // Ensure req.url has /api prefix for Express router mounting
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return app(req, res);
}
