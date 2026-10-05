import app, { initApp } from '../src/server.js';

function resolveRequestUrl(req) {
  // 1. Check if Vercel passed the original API route in _url query parameter
  try {
    const parsed = new URL(req.url, 'http://localhost');
    const urlParam = parsed.searchParams.get('_url');
    if (urlParam) {
      parsed.searchParams.delete('_url');
      const qs = parsed.searchParams.toString();
      const basePath = urlParam.startsWith('/api') ? urlParam : '/api/' + urlParam.replace(/^\/+/, '');
      return qs ? `${basePath}?${qs}` : basePath;
    }
  } catch {}

  // 2. Check if x-matched-path has the full /api/... path
  const matched = req.headers['x-matched-path'];
  if (matched && matched.startsWith('/api/') && matched !== '/api/index.js') {
    return matched;
  }

  // 3. Check if req.url is already a valid API path
  if (req.url && req.url.startsWith('/api/') && !req.url.startsWith('/api/index.js')) {
    return req.url;
  }

  return req.url;
}

export default async function handler(req, res) {
  try {
    await initApp();
  } catch (e) {
    console.error('[vercel serverless error] init failed:', e);
    return res.status(500).json({ error: 'Database initialization failed: ' + e.message });
  }

  // Reconstruct exact requested API route path for Express routing
  req.url = resolveRequestUrl(req);

  return app(req, res);
}
