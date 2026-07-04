import cron from 'node-cron';
import { config } from './config.js';
import { runSync } from './sync.js';
import { store } from './store.js';

// Admin-controlled server-sync mode. Persisted in app_settings so it survives
// restarts. mode: 'on' | 'off' | 'scheduled' (only sync within from–to window).
let syncCfg = { mode: 'on', from: '', to: '' };
export function getSyncCfg() { return syncCfg; }
export async function setSyncCfg(patch) {
  syncCfg = { mode: 'on', from: '', to: '', ...syncCfg, ...patch };
  if (!['on', 'off', 'scheduled'].includes(syncCfg.mode)) syncCfg.mode = 'on';
  try { await store.setSetting('sync_cfg', JSON.stringify(syncCfg)); } catch (e) { console.error('[scheduler] save cfg failed', e.message); }
  return syncCfg;
}
async function loadSyncCfg() {
  try { const v = await store.getSetting('sync_cfg'); if (v) syncCfg = { mode: 'on', from: '', to: '', ...JSON.parse(v) }; } catch {}
}
// Whether the server sync should run right now (server local time for the window).
function syncAllowed() {
  if (syncCfg.mode === 'off') return false;
  if (syncCfg.mode === 'scheduled') {
    const { from, to } = syncCfg;
    if (!from || !to) return true;
    const cur = new Date().toTimeString().slice(0, 5);
    return from <= to ? (cur >= from && cur < to) : (cur >= from || cur < to);
  }
  return true; // 'on'
}

export function startScheduler() {
  if (!cron.validate(config.pollCron)) {
    console.error(`[scheduler] invalid POLL_CRON "${config.pollCron}" — auto-poll disabled`);
    return;
  }
  loadSyncCfg();
  cron.schedule(config.pollCron, async () => {
    if (!syncAllowed()) return; // admin turned server sync off / outside window
    try {
      const r = await runSync({ batch: config.syncBatchSize });
      // Quiet logging (fires often): only log real work or errors.
      if (r && !r.skipped) console.log('[scheduler] auto-poll done:', JSON.stringify(r));
    } catch (e) {
      console.error('[scheduler] auto-poll failed:', e.message);
    }
  });
  console.log(`[scheduler] auto-poll scheduled: "${config.pollCron}" (batch ${config.syncBatchSize || 'all'})`);

  if (config.pollOnStartup) {
    // delay a few seconds so the server is fully up first
    setTimeout(() => {
      if (!syncAllowed()) return; // respect an admin "off"/off-hours setting
      console.log('[scheduler] running startup sync...');
      runSync({ batch: config.syncBatchSize }).then(
        (r) => console.log('[scheduler] startup sync done:', JSON.stringify(r)),
        (e) => console.error('[scheduler] startup sync failed:', e.message)
      );
    }, 4000);
  }
}
