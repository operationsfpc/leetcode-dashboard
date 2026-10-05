import app, { initApp } from '../src/server.js';

export default async function handler(req, res) {
  try {
    await initApp();
  } catch (e) {
    console.error('[vercel serverless error] init failed:', e);
    return res.status(500).json({ error: 'Database initialization failed: ' + e.message });
  }
  return app(req, res);
}
