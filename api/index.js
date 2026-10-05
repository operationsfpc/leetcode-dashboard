import app, { initApp } from '../src/server.js';

export default async function handler(req, res) {
  res.setHeader('x-app-version', '2026-10-05-v4');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    await initApp();
  } catch (e) {
    console.error('[vercel serverless error] init failed:', e);
    return res.status(500).json({ error: 'Database initialization failed: ' + e.message });
  }

  try {
    const host = req.headers.host || 'localhost';
    const parsed = new URL(req.url, `https://${host}`);
    const explicitUrl = parsed.searchParams.get('_url') || req.query?._url;

    if (explicitUrl) {
      parsed.searchParams.delete('_url');
      if (req.query) delete req.query._url;
      const remaining = parsed.searchParams.toString();
      req.url = '/api/' + String(explicitUrl).replace(/^\/+/, '') + (remaining ? '?' + remaining : '');
    } else if (req.query?.path) {
      const p = Array.isArray(req.query.path) ? req.query.path.join('/') : req.query.path;
      const remaining = parsed.searchParams.toString();
      req.url = '/api/' + String(p).replace(/^\/+/, '') + (remaining ? '?' + remaining : '');
    } else {
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

