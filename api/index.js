import app, { initApp } from '../src/server.js';

export default async function handler(req, res) {
  try {
    await initApp();
  } catch (e) {
    console.error('[vercel serverless error] init failed:', e);
    return res.status(500).json({ error: 'Database initialization failed: ' + e.message });
  }
  // 1. Check if rewrite passed explicit ?_url= parameter
  try {
    const host = req.headers.host || 'localhost';
    const parsed = new URL(req.url, `https://${host}`);
    const explicitUrl = parsed.searchParams.get('_url');
    if (explicitUrl) {
      parsed.searchParams.delete('_url');
      const remaining = parsed.searchParams.toString();
      req.url = '/api/' + explicitUrl.replace(/^\/+/, '') + (remaining ? '?' + remaining : '');
    } else {
      // 2. Check headers
      const matched = req.headers['x-matched-path'] || req.headers['x-original-url'] || req.headers['x-forwarded-uri'];
      if (matched && !matched.startsWith('/api/index.js') && !matched.startsWith('/api/index')) {
        const qIdx = (req.url || '').indexOf('?');
        const qs = qIdx !== -1 && !matched.includes('?') ? req.url.slice(qIdx) : '';
        req.url = matched + qs;
      }
    }
  } catch {}

  // Ensure req.url has /api prefix for Express router mounting
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return app(req, res);
}
