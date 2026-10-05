# Deploying the LeetCode Dashboard

This app can be deployed on **Vercel** or **Render** with a Postgres database (such as Supabase).

---

## Deploying on Vercel

### 1. Requirements & Environment Variables
In your Vercel Project Settings → **Environment Variables**, add:
- `SUPABASE_DB_URL` — your Postgres / Supabase connection string URI (e.g. `postgresql://postgres.[ref]:[pass]@aws-0-[region].pooler.supabase.com:6543/postgres`)
- `DB_DRIVER` — `supabase`
- `ADMIN_USERNAME` — your chosen admin username (default: `admin`)
- `ADMIN_PASSWORD` — your chosen admin password

### 2. Deploy to Vercel
1. Push your repository to GitHub.
2. Go to [vercel.com](https://vercel.com) → **Add New Project** → Import your repository.
3. Keep the default settings (`vercel.json` and `api/index.js` handle routing automatically).
4. Add the environment variables above and click **Deploy**.

> **Note on Background Cron/Syncing on Vercel:**  
> Vercel Serverless Functions sleep between requests. For automatic background student syncs on Vercel, you can set up a free scheduled trigger (such as GitHub Actions cron or cron-job.org) or use Render if you want a continuous background scheduler.

---

## Deploying on Render

1. Sign up at **render.com** (free tier).
2. Click **New → Blueprint** and connect this repository (Render reads `render.yaml`).
3. Set `SUPABASE_DB_URL`, `ADMIN_USERNAME`, and `ADMIN_PASSWORD`.
4. Click **Apply / Deploy**.

