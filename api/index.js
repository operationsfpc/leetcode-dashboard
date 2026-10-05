import app, { initApp } from '../src/server.js';

export default async function handler(req, res) {
  try {
    await initApp();
  } catch (e) {
    console.error('[vercel serverless error] init failed:', e);
    return res.status(500).json({ error: 'Database initialization failed: ' + e.message });
  }
  // Restore the original request URL from Vercel headers if rewritten
  const original = req.headers['x-matched-path'] || req.headers['x-original-url'] || req.headers['x-forwarded-uri'];
  if (original && !original.startsWith('/api/index.js') && !original.startsWith('/api/index')) {
    const queryIdx = (req.url || '').indexOf('?');
    const qs = queryIdx !== -1 && !original.includes('?') ? req.url.slice(queryIdx) : '';
    req.url = original + qs;
  } else if (req.url && (req.url.startsWith('/api/index.js') || req.url === '/api' || req.url.startsWith('/api?'))) {
    try {
      const host = req.headers.host || 'localhost';
      const urlObj = new URL(req.url, `https://${host}`);
      const subpath = urlObj.searchParams.get('0') || urlObj.searchParams.get('path');
      if (subpath) {
        urlObj.searchParams.delete('0');
        urlObj.searchParams.delete('path');
        const remainingQs = urlObj.searchParams.toString();
        req.url = '/api/' + subpath.replace(/^\/+/, '') + (remainingQs ? '?' + remainingQs : '');
      }
    } catch {}
  }

  // Ensure req.url has /api prefix for Express router mounting
  if (req.url && !req.url.startsWith('/api')) {
    req.url = '/api' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }

  return app(req, res);
}
