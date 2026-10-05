import path from 'node:path';
import { fileURLToPath } from 'node:url';
import express from 'express';
import helmet from 'helmet';
import { config } from './config.js';
import { router } from './routes.js';
import { startScheduler } from './scheduler.js';
import { initStore } from './store.js';

const app = express();
app.set('trust proxy', 1); // behind a hosting proxy (Vercel/Render/Railway) — correct client IPs for rate limiting

// Security headers. CSP allows our inline scripts/styles + the Chart.js CDN, and
// blocks framing (anti-clickjacking).
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https://i.ytimg.com'],
      connectSrc: ["'self'", 'https://cdn.jsdelivr.net', 'https://*.jsdelivr.net'],
      frameSrc: ["'self'", 'https://www.youtube.com', 'https://www.youtube-nocookie.com'], // embedded video player
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' }, // let the Chrome extension fetch the API
  crossOriginEmbedderPolicy: false,
  // Send the origin (not "no-referrer") so embedded YouTube can verify the host
  // — otherwise the player fails with "Error 153".
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
}));

app.use(express.json({ limit: '8mb' })); // ingest payloads can be large
app.use(express.urlencoded({ extended: true }));

// Allow the Chrome extension (a chrome-extension:// origin) to call the API.
app.use('/api', (req, res, next) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET,POST,DELETE,OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, x-admin-token');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

app.use('/api', router);

// Student-facing SPA (gated by college access code, separate from the admin UI).
app.get(['/student', '/student/'], (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile('student.html', { root: config.publicDir });
});

// Read-only shared college view (resolved client-side by the token in the URL).
app.get('/view/:token', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile('view.html', { root: config.publicDir });
});

// Public questions-only page (no login) — resolved client-side by the token.
app.get('/q/:token', (req, res) => {
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile('questions.html', { root: config.publicDir });
});

// Don't let browsers cache the app files — otherwise a tab (e.g. the student
// page) can keep running an old student.js/HTML after an update. The data still
// comes fresh from /api; this only stops stale code/markup being reused.
app.use(express.static(config.publicDir, {
  setHeaders: (res, path) => {
    if (/\.(html|js|css)$/.test(path)) res.setHeader('Cache-Control', 'no-cache');
  },
}));

let initialized = false;
let initPromise = null;
export async function initApp() {
  if (initialized) return;
  if (!initPromise) {
    initPromise = initStore().then(() => {
      initialized = true;
    });
  }
  return initPromise;
}

// Check if file is being executed directly in Node
const currentFilePath = fileURLToPath(import.meta.url);
const isDirectRun = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(currentFilePath) ||
  process.argv[1].endsWith('server.js')
);

if (isDirectRun && !process.env.VERCEL) {
  try {
    await initApp();
    app.listen(config.port, () => {
      console.log(`\n  LeetCode Admin Dashboard`);
      console.log(`  → http://localhost:${config.port}`);
      console.log(`  mode: ${config.mock ? 'MOCK (fake data)' : 'LIVE (scraping leetcode.com)'}`);
      console.log(`  admin auth: ${config.adminPassword ? 'ON (password required)' : 'OFF — set ADMIN_PASSWORD to protect the admin dashboard'}`);
      startScheduler();
    });
  } catch (e) {
    console.error(`\n[startup] Data layer failed to initialize:\n  ${e.message}\n`);
    console.error('  Check DB_DRIVER and your SUPABASE_* env vars (see README / .env.example).');
    process.exit(1);
  }
}

export default app;
