import app, { initApp } from '../src/server.js';

function resolveRequestUrl(req) {
  // 1. Check if x-matched-path has the full /api/... path
  const matched = req.headers['x-matched-path'];
  if (matched && matched.startsWith('/api/') && matched !== '/api/index.js') {
    return matched;
  }

  // 2. Check if Vercel rewrite passed :path* as req.query.path
  if (req.query && req.query.path) {
    const p = Array.isArray(req.query.path) ? req.query.path.join('/') : String(req.query.path);
    const searchParams = new URLSearchParams();
    for (const [k, v] of Object.entries(req.query)) {
      if (k !== 'path' && v !== undefined) {
        if (Array.isArray(v)) {
          v.forEach((val) => searchParams.append(k, val));
        } else {
          searchParams.append(k, v);
        }
      }
    }
    const qs = searchParams.toString();
    const basePath = '/api/' + p.replace(/^\/+/, '');
    return qs ? `${basePath}?${qs}` : basePath;
  }

  // 3. Check req.url directly
  if (req.url && req.url.startsWith('/api/') && !req.url.startsWith('/api/index.js')) {
    return req.url;
  }

  // 4. Fallback: extract path from search params in req.url
  try {
    const parsed = new URL(req.url, 'http://localhost');
    const pathParam = parsed.searchParams.get('path');
    if (pathParam) {
      parsed.searchParams.delete('path');
      const qs = parsed.searchParams.toString();
      const basePath = '/api/' + pathParam.replace(/^\/+/, '');
      return qs ? `${basePath}?${qs}` : basePath;
    }
    if (parsed.pathname.startsWith('/api/') && parsed.pathname !== '/api/index.js') {
      return parsed.pathname + parsed.search;
    }
  } catch {}

  return req.url;
}

export default async function handler(req, res) {
  if (req.url?.includes('debug') || req.headers['x-debug']) {
    return res.json({
      url: req.url,
      headers: req.headers,
      query: req.query,
    });
  }
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
