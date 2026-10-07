const $ = (sel) => document.querySelector(sel);
const adminToken = () => { try { return localStorage.getItem('lc_admin_token') || ''; } catch { return ''; } };

let pendingRequests = 0;
function showGlobalLoader() {
  let bar = $('#globalTopLoader');
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'globalTopLoader';
    bar.className = 'top-loader';
    document.body.appendChild(bar);
  }
  bar.classList.add('active');
}
function hideGlobalLoader() {
  if (pendingRequests <= 0) {
    pendingRequests = 0;
    const bar = $('#globalTopLoader');
    if (bar) bar.classList.remove('active');
  }
}

function tableSkeletonHtml(cols = 9, rows = 6) {
  return Array.from({ length: rows }, () => `
    <tr class="skeleton-row">
      ${Array.from({ length: cols }, (_, i) => `
        <td><div class="skeleton-cell skeleton-w-${(i % 3) + 1}"></div></td>
      `).join('')}
    </tr>
  `).join('');
}

function cardsSkeletonHtml(count = 6) {
  return Array.from({ length: count }, () => `
    <div class="card skeleton-card">
      <div class="skeleton-cell" style="width:60%;height:28px;margin-bottom:8px"></div>
      <div class="skeleton-cell" style="width:40%;height:14px"></div>
    </div>
  `).join('');
}

function drawerSkeletonHtml() {
  return `
    <div class="drawer-skeleton" style="padding:10px 0">
      <div style="display:flex;align-items:center;gap:14px;margin-bottom:20px">
        <div class="skeleton-cell" style="width:48px;height:48px;border-radius:50%;flex-shrink:0"></div>
        <div style="flex:1">
          <div class="skeleton-cell" style="width:50%;height:20px;margin-bottom:8px"></div>
          <div class="skeleton-cell" style="width:30%;height:14px"></div>
        </div>
      </div>
      <div class="cards" style="grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:20px">
        ${Array.from({ length: 6 }, () => `
          <div class="card skeleton-card" style="padding:12px">
            <div class="skeleton-cell" style="width:50%;height:10px;margin-bottom:8px"></div>
            <div class="skeleton-cell" style="width:70%;height:20px"></div>
          </div>
        `).join('')}
      </div>
      <div class="skeleton-cell" style="width:40%;height:16px;margin:20px 0 12px"></div>
      <div class="skeleton-cell" style="width:100%;height:120px;border-radius:10px;margin-bottom:20px"></div>
      <div class="skeleton-cell" style="width:50%;height:16px;margin:20px 0 12px"></div>
      ${Array.from({ length: 4 }, () => `
        <div class="skeleton-cell" style="width:100%;height:36px;margin-bottom:8px;border-radius:6px"></div>
      `).join('')}
    </div>
  `;
}

const api = (path, opts = {}) => {
  pendingRequests++;
  showGlobalLoader();
  const t = adminToken();
  const headers = Object.assign({}, opts.headers || {}, t ? { 'x-admin-token': t } : {});
  return fetch('/api' + path, { ...opts, headers })
    .then(async (r) => {
      const data = await r.json().catch(() => ({}));
      if (r.status === 401 && /admin/i.test(data.error || '')) { showAdminLogin(); throw new Error(data.error); }
      if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
      return data;
    })
    .finally(() => {
      pendingRequests--;
      hideGlobalLoader();
    });
};

let state = {
  collegeId: null, students: [], monthlyChart: null, practiceCollegeId: null,
  practiceDomain: '__all', // selected domain tab in the Practice section
  // dashboard pagination + filters
  dash: { batch: '', department: '', campus: '', q: '', sort: '', dir: '', risk: false, page: 1, pageSize: 100, total: 0 },
  filtersFor: null, // college id the filter dropdowns were populated for
};

// Charts read tick/grid colors from the active theme's CSS variables.
function lcChartColors() {
  const cs = getComputedStyle(document.documentElement);
  return {
    tick: cs.getPropertyValue('--muted').trim() || '#8b92a5',
    grid: cs.getPropertyValue('--border').trim() || 'rgba(128,134,149,.2)',
  };
}
function lcChartTheme() {
  if (!window.Chart) return;
  const { tick, grid } = lcChartColors();
  Chart.defaults.color = tick;
  Chart.defaults.borderColor = grid;
}
// Re-apply colors to an already-built chart (Chart.js bakes defaults at creation).
function recolorChart(c) {
  if (!c || !c.options || !c.options.scales) return;
  const { tick, grid } = lcChartColors();
  for (const ax of Object.values(c.options.scales)) {
    ax.ticks = Object.assign(ax.ticks || {}, { color: tick });
    if (!ax.grid || ax.grid.display !== false) ax.grid = Object.assign(ax.grid || {}, { color: grid });
  }
  c.update('none');
}
lcChartTheme();
window.__onTheme = () => { lcChartTheme(); recolorChart(state.monthlyChart); };

// ---- Tabs -------------------------------------------------------------------
document.querySelectorAll('.tab').forEach((t) => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('active'));
    t.classList.add('active');
    $('#tab-' + t.dataset.tab).classList.add('active');
    if (t.dataset.tab === 'practice') populatePracticeColleges().then(loadPractice);
    if (t.dataset.tab === 'colleges') loadCollegesTab();
  });
});

function smartCode(name) {
  const clean = (name || 'LC').replace(/[^a-zA-Z0-9]/g, '').slice(0, 4).toUpperCase() || 'LC';
  return `${clean}-${new Date().getFullYear()}`;
}


const ic = {
  key: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="7.5" cy="15.5" r="5.5"/><path d="m21 2-9.6 9.6"/><path d="m15.5 7.5 3 3L22 7l-3-3"/></svg>`,
  copy: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>`,
  external: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h6v6"/><path d="M10 14 21 3"/><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/></svg>`,
  sparkles: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  more: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>`,
  download: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" y2="3"/></svg>`,
  rotate: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12a9 9 0 1 1-9-9c2.52 0 4.93 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/></svg>`,
  edit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
  trash: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" x2="10" y1="11" y2="17"/><line x1="14" x2="14" y1="11" y2="17"/></svg>`
};

let cachedCollegesList = [];
let activeRowDropdown = null;

function closeRowDropdown() {
  if (activeRowDropdown) {
    activeRowDropdown.remove();
    activeRowDropdown = null;
  }
}
document.addEventListener('click', (e) => {
  if (!e.target.closest('.row-menu-btn') && !e.target.closest('.shad-dropdown-menu')) {
    closeRowDropdown();
  }
});
window.addEventListener('resize', closeRowDropdown);
window.addEventListener('scroll', closeRowDropdown, true);

// Modal dialog state for editing access code
let activeEditingCollege = null;
function openCodeModal(college) {
  activeEditingCollege = college;
  const suggested = smartCode(college.name);
  $('#codeModalTitle').textContent = `Set Access Code · ${college.name}`;
  $('#codeModalSub').textContent = `Students choose their name and type this access code on the login page.`;
  $('#modalCodeInput').value = college.access_code || suggested;
  $('#modalCodeSuggest').textContent = suggested;
  $('#codeModalBackdrop').classList.add('open');
  setTimeout(() => $('#modalCodeInput').focus(), 50);
}
function closeCodeModal() {
  $('#codeModalBackdrop').classList.remove('open');
  activeEditingCollege = null;
}
$('#codeModalCancelBtn')?.addEventListener('click', closeCodeModal);
$('#codeModalBackdrop')?.addEventListener('click', (e) => { if (e.target.id === 'codeModalBackdrop') closeCodeModal(); });
$('#modalUseSuggestBtn')?.addEventListener('click', () => {
  if (activeEditingCollege) {
    $('#modalCodeInput').value = smartCode(activeEditingCollege.name);
  }
});
$('#codeModalSaveBtn')?.addEventListener('click', async () => {
  if (!activeEditingCollege) return;
  const code = $('#modalCodeInput').value.trim();
  if (!code) return alert('Please enter an access code.');
  try {
    await api(`/colleges/${activeEditingCollege.id}/access-code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    closeCodeModal();
    loadCollegesTab();
    loadColleges();
  } catch (e) { alert(e.message); }
});

function renderCollegesTableRows(colleges) {
  const tbody = $('#collegeTable').querySelector('tbody');
  const countEl = $('#collegeTableCount');
  if (countEl) countEl.textContent = `Showing ${colleges.length} of ${cachedCollegesList.length} colleges`;

  if (!colleges.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="empty" style="padding:28px 18px;text-align:center;color:var(--muted)">No matching colleges found.</td></tr>';
    return;
  }

  tbody.innerHTML = colleges.map((c) => {
    const suggested = smartCode(c.name);
    const viewUrl = c.view_token ? `${location.origin}/view/${encodeURIComponent(c.view_token)}` : '';
    const sMode = c.sync_mode || 'on', rMode = c.refresh_mode || 'on';

    const codeHtml = c.access_code
      ? `<button class="shad-badge-code copy-code-btn" data-code="${esc(c.access_code)}" title="Click to copy access code">
          ${ic.key}
          <code>${esc(c.access_code)}</code>
          <span class="copy-icon" title="Copy">${ic.copy}</span>
        </button>`
      : `<button class="shad-btn shad-btn-ghost-sm open-code-modal-btn" data-id="${c.id}" title="Set student access code">
          ${ic.sparkles} <span class="muted-tag" style="margin:0">Set code</span>
        </button>`;

    const linkHtml = c.view_token
      ? `<div class="row" style="margin:0;gap:6px;align-items:center">
          <a href="/view/${encodeURIComponent(c.view_token)}" target="_blank" class="shad-btn shad-btn-outline-sm" title="Open read-only view in new tab">
            ${ic.external} View
          </a>
          <button class="shad-btn shad-btn-ghost-sm copy-link-btn" data-url="${viewUrl}" title="Copy shareable link">
            ${ic.copy} Copy
          </button>
        </div>`
      : `<button class="shad-btn shad-btn-outline-sm gen-link" data-id="${c.id}">
          ${ic.sparkles} Gen Link
        </button>`;

    return `
      <tr data-id="${c.id}">
        <td>
          <div style="display:flex;flex-direction:column;gap:3px">
            <span style="font-weight:600;font-size:14px;color:var(--text)">${esc(c.name)}</span>
            <span class="shad-badge" style="width:fit-content">${c.student_count} students</span>
          </div>
        </td>
        <td>${codeHtml}</td>
        <td>${linkHtml}</td>
        <td>
          <div class="row auto-cell" data-id="${c.id}" style="margin:0;gap:8px;align-items:center">
            <label class="row" style="margin:0;gap:4px;align-items:center;font-size:12px;color:var(--muted)">
              <span>🛰</span>
              <select class="shad-select-sm cset-sync-mode">
                <option value="on"${sMode === 'on' ? ' selected' : ''}>Sync: On</option>
                <option value="off"${sMode === 'off' ? ' selected' : ''}>Sync: Off</option>
              </select>
            </label>
            <label class="row" style="margin:0;gap:4px;align-items:center;font-size:12px;color:var(--muted)">
              <span>🔄</span>
              <select class="shad-select-sm cset-ref-mode">
                <option value="on"${rMode === 'on' ? ' selected' : ''}>Refresh: On</option>
                <option value="off"${rMode === 'off' ? ' selected' : ''}>Refresh: Off</option>
              </select>
            </label>
          </div>
        </td>
        <td style="text-align:right">
          <button class="shad-btn-icon row-menu-btn" data-id="${c.id}" title="Actions">
            ${ic.more}
          </button>
        </td>
      </tr>`;
  }).join('');

  // Per-college auto-sync / auto-refresh settings — save on any change.
  tbody.querySelectorAll('.auto-cell').forEach((box) => {
    const id = box.dataset.id;
    const save = async () => {
      const syncMode = box.querySelector('.cset-sync-mode').value;
      const refMode = box.querySelector('.cset-ref-mode').value;
      const body = { sync_mode: syncMode, refresh_mode: refMode };
      try {
        await api(`/colleges/${id}/settings`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
        if (state.collegesById && state.collegesById[id]) Object.assign(state.collegesById[id], body);
      } catch (e) { alert('Could not save settings: ' + e.message); }
    };
    box.querySelectorAll('select').forEach((el) => el.addEventListener('change', save));
  });

  // Copy code buttons
  tbody.querySelectorAll('.copy-code-btn').forEach((b) => b.addEventListener('click', () => {
    const code = b.dataset.code;
    if (!code) return;
    navigator.clipboard?.writeText(code);
    const iconSpan = b.querySelector('.copy-icon');
    if (iconSpan) {
      const orig = iconSpan.innerHTML;
      iconSpan.textContent = '✓';
      setTimeout(() => { iconSpan.innerHTML = orig; }, 1600);
    }
  }));

  // Open modal from Set Code button
  tbody.querySelectorAll('.open-code-modal-btn').forEach((b) => b.addEventListener('click', () => {
    const col = cachedCollegesList.find((x) => String(x.id) === String(b.dataset.id));
    if (col) openCodeModal(col);
  }));

  // Copy link buttons
  tbody.querySelectorAll('.copy-link-btn').forEach((b) => b.addEventListener('click', () => {
    const url = b.dataset.url;
    if (!url) return;
    navigator.clipboard?.writeText(url);
    const old = b.textContent;
    b.textContent = '✓ Copied';
    setTimeout(() => { b.textContent = old; }, 1600);
  }));

  // Generate link
  tbody.querySelectorAll('.gen-link').forEach((b) => b.addEventListener('click', async () => {
    try {
      await api(`/colleges/${b.dataset.id}/view-link`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
      });
      loadCollegesTab();
    } catch (e) { alert(e.message); }
  }));

  // Row Action Menu (••• Dropdown)
  tbody.querySelectorAll('.row-menu-btn').forEach((btn) => btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = btn.dataset.id;
    const col = cachedCollegesList.find((x) => String(x.id) === String(id));
    if (!col) return;

    if (activeRowDropdown && activeRowDropdown._targetBtn === btn) {
      closeRowDropdown();
      return;
    }
    closeRowDropdown();

    const menu = document.createElement('div');
    menu.className = 'shad-dropdown-menu';
    menu._targetBtn = btn;
    menu.innerHTML = `
      <button class="shad-dropdown-item menu-edit-code">${ic.edit} Edit Access Code</button>
      <button class="shad-dropdown-item menu-regen-link">${ic.rotate} Regenerate Live Link</button>
      <button class="shad-dropdown-item menu-export-roster">${ic.download} Export Student Roster</button>
      <div class="shad-dropdown-divider"></div>
      <button class="shad-dropdown-item destructive menu-del-college">${ic.trash} Delete College</button>
    `;

    document.body.appendChild(menu);
    const r = btn.getBoundingClientRect();
    menu.style.top = (r.bottom + 4) + 'px';
    menu.style.right = (window.innerWidth - r.right) + 'px';
    activeRowDropdown = menu;

    menu.querySelector('.menu-edit-code').addEventListener('click', () => {
      closeRowDropdown();
      openCodeModal(col);
    });

    menu.querySelector('.menu-regen-link').addEventListener('click', async () => {
      closeRowDropdown();
      if (!confirm(`Generate a new live link for "${col.name}"? The previous link will stop working.`)) return;
      try {
        await api(`/colleges/${col.id}/view-link`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ regenerate: true }),
        });
        loadCollegesTab();
      } catch (err) { alert(err.message); }
    });

    menu.querySelector('.menu-export-roster').addEventListener('click', async () => {
      closeRowDropdown();
      try {
        const res = await fetch(`/api/colleges/${col.id}/export`, {
          headers: adminToken() ? { 'x-admin-token': adminToken() } : {},
        });
        if (!res.ok) throw new Error('Export failed (' + res.status + ')');
        const blob = await res.blob();
        const cd = res.headers.get('Content-Disposition') || '';
        const filename = (cd.match(/filename="([^"]+)"/) || [])[1] || `${col.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_students.xlsx`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
        a.remove(); URL.revokeObjectURL(url);
      } catch (err) { alert('Export failed: ' + err.message); }
    });

    menu.querySelector('.menu-del-college').addEventListener('click', async () => {
      closeRowDropdown();
      if (!confirm(`Delete "${col.name}" and ALL of its ${col.student_count} student(s), practice problems, and progress?\n\nThis cannot be undone.`)) return;
      try {
        await api(`/colleges/${col.id}`, { method: 'DELETE' });
        if (state.collegeId == col.id) state.collegeId = null;
        if (state.practiceCollegeId == col.id) state.practiceCollegeId = null;
        loadCollegesTab();
        loadColleges();
      } catch (err) { alert(err.message); }
    });
  }));
}

async function loadCollegesTab() {
  $('#studentLink').textContent = location.origin + '/student';
  $('#studentLink').href = '/student';
  cachedCollegesList = await api('/colleges');
  const q = ($('#collegeSearchInput')?.value || '').trim().toLowerCase();
  const filtered = q
    ? cachedCollegesList.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.access_code || '').toLowerCase().includes(q))
    : cachedCollegesList;
  renderCollegesTableRows(filtered);
}

// Real-time table search
$('#collegeSearchInput')?.addEventListener('input', (e) => {
  const q = e.target.value.trim().toLowerCase();
  const filtered = q
    ? cachedCollegesList.filter((c) => (c.name || '').toLowerCase().includes(q) || (c.access_code || '').toLowerCase().includes(q))
    : cachedCollegesList;
  renderCollegesTableRows(filtered);
});

// Bulk generate links for all colleges missing one
$('#bulkGenLinksBtn')?.addEventListener('click', async () => {
  if (!confirm('Generate read-only share links for all colleges that do not have one yet?')) return;
  const btn = $('#bulkGenLinksBtn');
  const orig = btn.textContent;
  btn.textContent = '⏳ Generating…';
  btn.disabled = true;
  try {
    const r = await api('/colleges/bulk-generate-links', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    alert(`Generated view links for ${r.generated} college(s). Total: ${r.total}.`);
    loadCollegesTab();
  } catch (e) { alert('Failed: ' + e.message); }
  btn.textContent = orig;
  btn.disabled = false;
});

// Bulk generate access codes for all colleges missing one
$('#bulkGenCodesBtn')?.addEventListener('click', async () => {
  if (!confirm('Auto-generate student access codes for all colleges missing one? (e.g. PREFIX-2026)')) return;
  const btn = $('#bulkGenCodesBtn');
  const orig = btn.textContent;
  btn.textContent = '⏳ Generating…';
  btn.disabled = true;
  try {
    const r = await api('/colleges/bulk-generate-codes', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) });
    alert(`Generated access codes for ${r.generated} college(s). Total: ${r.total}.`);
    loadCollegesTab();
    loadColleges();
  } catch (e) { alert('Failed: ' + e.message); }
  btn.textContent = orig;
  btn.disabled = false;
});

// Export all colleges summary and links to Excel
$('#exportAllCollegesBtn')?.addEventListener('click', async () => {
  const btn = $('#exportAllCollegesBtn');
  const orig = btn.textContent;
  btn.textContent = '⏳ Exporting…';
  btn.disabled = true;
  try {
    const res = await fetch(`/api/colleges-export?origin=${encodeURIComponent(location.origin)}`, {
      headers: adminToken() ? { 'x-admin-token': adminToken() } : {},
    });
    if (!res.ok) throw new Error('Export failed (' + res.status + ')');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const filename = (cd.match(/filename="([^"]+)"/) || [])[1] || `colleges_summary_${new Date().toISOString().slice(0, 10)}.xlsx`;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  } catch (e) { alert('Export failed: ' + e.message); }
  btn.textContent = orig;
  btn.disabled = false;
});

// Master on/off for auto-sync / auto-refresh across ALL colleges.
async function applyBulkMode(body, label) {
  if (!confirm(`Set ${label} for EVERY college?`)) return false;
  try {
    await api('/colleges/bulk-settings', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    await loadColleges();       // refresh the cached settings (browser refresh gating)
    await loadCollegesTab();    // redraw the per-college rows
    return true;
  } catch (e) { alert(e.message); return false; }
}
$('#allSyncMode')?.addEventListener('change', async (e) => {
  const v = e.target.value; e.target.value = '';
  if (v) await applyBulkMode({ sync_mode: v }, `auto-sync ${v.toUpperCase()}`);
});
$('#allRefreshMode')?.addEventListener('change', async (e) => {
  const v = e.target.value; e.target.value = '';
  if (v) await applyBulkMode({ refresh_mode: v }, `auto-refresh ${v.toUpperCase()}`);
});

$('#addCollegeBtn').addEventListener('click', async () => {
  const name = $('#newCollegeName').value.trim();
  const code = $('#newCollegeCode').value.trim();
  if (!name) return setMsg('#addCollegeMsg', 'Enter a college name.', 'err');
  if (!code) return setMsg('#addCollegeMsg', 'Set an access code so students can log in.', 'err');
  try {
    const r = await api('/colleges', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, code }),
    });
    setMsg('#addCollegeMsg', `Added "${r.name}" with an access code. Now upload its roster in the Upload tab.`, 'ok');
    $('#newCollegeName').value = '';
    $('#newCollegeCode').value = '';
    loadCollegesTab();
    loadColleges();
  } catch (e) { setMsg('#addCollegeMsg', e.message, 'err'); }
});

// ---- College picker ---------------------------------------------------------
async function loadColleges() {
  const colleges = await api('/colleges');
  // Cache per-college settings so the browser auto-refresh can follow them.
  state.collegesById = Object.fromEntries(colleges.map((c) => [c.id, c]));

  // Keep the Upload tab's college dropdown in sync with existing colleges.
  const up = $('#uploadCollege');
  const prevUp = up.value;
  const opts = colleges.length
    ? colleges.map((c) => `<option value="${esc(c.name)}">${esc(c.name)}</option>`).join('')
    : '<option value="">No colleges yet — add one in the Colleges tab</option>';
  up.innerHTML = opts;
  if (colleges.some((c) => c.name === prevUp)) up.value = prevUp;
  // Mirror the same college list into the single-student form.
  const ssc = $('#singleStudentCollege');
  if (ssc) { const prev = ssc.value; ssc.innerHTML = opts; if (colleges.some((c) => c.name === prev)) ssc.value = prev; }
  if (typeof loadSSOptions === 'function') loadSSOptions(); // prefetch dropdown values for the single-student form

  const sel = $('#collegeSelect');
  sel.innerHTML = '';
  if (!colleges.length) {
    sel.innerHTML = '<option value="">No colleges yet — upload a roster</option>';
    renderEmptyDashboard();
    return;
  }
  for (const c of colleges) {
    const o = document.createElement('option');
    o.value = c.id;
    o.textContent = `${c.name} (${c.student_count})`;
    sel.appendChild(o);
  }
  const prevCollege = state.collegeId;
  state.collegeId = state.collegeId && colleges.some((c) => c.id == state.collegeId)
    ? state.collegeId : colleges[0].id;
  if (state.collegeId !== prevCollege) resetDash(); // switched/auto-picked a different college
  sel.value = state.collegeId;
  loadDashboard();
  loadAccessCode();
}
$('#collegeSelect').addEventListener('change', (e) => {
  state.collegeId = Number(e.target.value);
  resetDash();
  loadDashboard();
  loadAccessCode();
});

async function loadAccessCode() {
  if (!state.collegeId) return;
  try {
    const c = await api(`/colleges/${state.collegeId}`);
    $('#accessCode').value = '';
    $('#accessCode').placeholder = c.has_code ? '•••••• (set — type to replace)' : 'e.g. ABC-2026';
    setMsg('#accessMsg', c.has_code ? 'Code is set.' : 'No code yet — students can’t log in.', c.has_code ? 'ok' : '');
  } catch {}
}
$('#saveCodeBtn').addEventListener('click', async () => {
  if (!state.collegeId) return;
  const code = $('#accessCode').value.trim();
  try {
    const r = await api(`/colleges/${state.collegeId}/access-code`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code }),
    });
    setMsg('#accessMsg', r.has_code ? 'Saved.' : 'Cleared — students can’t log in.', r.has_code ? 'ok' : 'err');
    $('#accessCode').value = '';
    $('#accessCode').placeholder = r.has_code ? '•••••• (set — type to replace)' : 'e.g. ABC-2026';
  } catch (e) { setMsg('#accessMsg', e.message, 'err'); }
});

// ---- Dashboard --------------------------------------------------------------
function renderEmptyDashboard() {
  $('#summaryCards').innerHTML = '';
  $('#studentTable').querySelector('tbody').innerHTML =
    '<tr><td colspan="8" class="empty">No data yet. Go to the Upload tab to add a student roster.</td></tr>';
  if ($('#pageInfo')) $('#pageInfo').textContent = '';
}

let dashAbort = null;
async function loadDashboard(opts = {}) {
  if (!state.collegeId) return renderEmptyDashboard();
  const dq = state.dash;
  const params = {
    batch: dq.batch, department: dq.department, campus: dq.campus, q: dq.q,
    sort: dq.sort || '', dir: dq.dir || '', risk: dq.risk ? '1' : '',
    page: String(dq.page), pageSize: String(dq.pageSize),
  };
  if (opts.chart === false) params.light = '1'; // auto-refresh: skip monthly/filter queries
  const qs = new URLSearchParams(params);
  dashAbort?.abort();
  const ctrl = new AbortController();
  dashAbort = ctrl;
  let d;
  try {
    d = await api(`/colleges/${state.collegeId}/dashboard?${qs}`, { signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError' || /abort/i.test(e.message || '')) return; // superseded by a newer load
    if (/admin/i.test(e.message || '')) return; // handled by showAdminLogin
    console.warn('Dashboard load warning:', e.message);
    return;
  }
  state.students = d.students;
  state.dash.total = d.total;

  const label = (dq.batch || dq.department || dq.campus || dq.q) ? 'Students (filtered)' : 'Students';
  $('#summaryCards').innerHTML = `
    <div class="card"><div class="v">${d.totals.students}</div><div class="l">${label}</div></div>
    <div class="card"><div class="v">${d.totals.total}</div><div class="l">Total solved</div></div>
    <div class="card easy"><div class="v">${d.totals.easy}</div><div class="l">Easy</div></div>
    <div class="card medium"><div class="v">${d.totals.medium}</div><div class="l">Medium</div></div>
    <div class="card hard"><div class="v">${d.totals.hard}</div><div class="l">Hard</div></div>
    <div class="card"><div class="v">${d.practiceTotal}</div><div class="l">Practice problems</div></div>`;

  if (state.filtersFor !== state.collegeId && d.filters) { populateFilters(d.filters); state.filtersFor = state.collegeId; }
  renderStudents(d.students);
  renderPager();
  if (opts.chart !== false) loadMonthly(); // chart loads on its own, never blocks the table
}

// The monthly chart is fetched separately (cached server-side) so it loads
// immediately and stays accurate without holding up the students table.
let monthlyAbort = null;
async function loadMonthly() {
  if (!state.collegeId) return;
  const status = $('#monthlyStatus');
  if (status && !state.monthlyChart) status.textContent = 'Loading…';
  const dq = state.dash;
  const qs = new URLSearchParams({ batch: dq.batch, department: dq.department, campus: dq.campus });
  monthlyAbort?.abort();
  const ctrl = new AbortController();
  monthlyAbort = ctrl;
  let d;
  try {
    d = await api(`/colleges/${state.collegeId}/monthly?${qs}`, { signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError' || /abort/i.test(e.message || '')) return; // superseded
    if (status) status.textContent = 'Couldn’t load the chart. If you just updated the app, restart the server.';
    return;
  }
  const monthly = d.monthly || [];
  if (status) status.textContent = monthly.length ? '' : 'No submission activity yet.';
  renderMonthlyChart(monthly);
}

function resetDash() {
  state.dash = { batch: '', department: '', campus: '', q: '', sort: '', dir: '', risk: false, page: 1, pageSize: 100, total: 0 };
  state.filtersFor = null;
  state.studentsSig = null; // force a repaint for the new college
  state.monthlySig = null;
  if (state.monthlyChart) { state.monthlyChart.destroy(); state.monthlyChart = null; } // drop old college's chart
  const ss = $('#studentSearch'); if (ss) ss.value = '';
  // Instant feedback: drop the old college's rows and show a loading state so the
  // switch feels immediate instead of showing stale data until the fetch returns.
  $('#summaryCards').innerHTML = cardsSkeletonHtml(6);
  const tb = $('#studentTable').querySelector('tbody');
  if (tb) tb.innerHTML = tableSkeletonHtml(9, 6);
  if ($('#pageInfo')) $('#pageInfo').textContent = '';
}

function fillSel(sel, allLabel, opts, cur) {
  const el = $(sel);
  el.innerHTML = `<option value="">${allLabel}</option>` + opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  el.value = opts.includes(cur) ? cur : '';
}
function populateFilters(f) {
  // drop any active filter that no longer exists for this college
  if (!f.campuses.includes(state.dash.campus)) state.dash.campus = '';
  if (!f.departments.includes(state.dash.department)) state.dash.department = '';
  if (!f.batches.includes(state.dash.batch)) state.dash.batch = '';
  fillSel('#filterCampus', 'All campuses', f.campuses, state.dash.campus);
  fillSel('#filterDept', 'All departments', f.departments, state.dash.department);
  fillSel('#filterBatch', 'All batches', f.batches, state.dash.batch);
}
function renderPager() {
  const { page, pageSize, total } = state.dash;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  $('#pageInfo').textContent = `${from}–${to} of ${total}`;
  $('#prevPage').disabled = page <= 1;
  $('#nextPage').disabled = page >= pages;
}

$('#filterBatch').addEventListener('change', (e) => { state.dash.batch = e.target.value; state.dash.page = 1; loadDashboard(); });
$('#filterDept').addEventListener('change', (e) => { state.dash.department = e.target.value; state.dash.page = 1; loadDashboard(); });
$('#filterCampus').addEventListener('change', (e) => { state.dash.campus = e.target.value; state.dash.page = 1; loadDashboard(); });

// At-risk filter toggle
$('#riskToggle').addEventListener('click', () => {
  state.dash.risk = !state.dash.risk;
  state.dash.page = 1;
  $('#riskToggle').classList.toggle('btn-primary', state.dash.risk);
  $('#riskToggle').classList.toggle('btn-ghost', !state.dash.risk);
  loadDashboard();
});

// Sortable column headers
document.querySelectorAll('#studentTable th.sortable').forEach((th) => th.addEventListener('click', () => {
  const key = th.dataset.sort;
  if (state.dash.sort === key) {
    state.dash.dir = state.dash.dir === 'asc' ? 'desc' : 'asc';
  } else {
    state.dash.sort = key;
    state.dash.dir = key === 'rank' ? 'asc' : 'desc'; // rank: lower is better
  }
  state.dash.page = 1;
  state.studentsSig = null; // force repaint
  loadDashboard();
  markSortHeaders();
}));
function markSortHeaders() {
  document.querySelectorAll('#studentTable th.sortable').forEach((th) => {
    const active = th.dataset.sort === state.dash.sort;
    th.dataset.arrow = active ? (state.dash.dir === 'asc' ? '▲' : '▼') : '';
    th.classList.toggle('sorted', active);
  });
}

// Export the current (filtered/sorted) view to Excel. Uses fetch+blob because
// the endpoint is admin-gated and a plain link can't send the auth header.
$('#exportBtn').addEventListener('click', async () => {
  if (!state.collegeId) return;
  const dq = state.dash;
  const qs = new URLSearchParams({
    batch: dq.batch, department: dq.department, campus: dq.campus, q: dq.q,
    sort: dq.sort || '', dir: dq.dir || '', risk: dq.risk ? '1' : '',
  });
  const btn = $('#exportBtn'); const orig = btn.textContent; btn.textContent = '⏳ Exporting…'; btn.disabled = true;
  try {
    const res = await fetch(`/api/colleges/${state.collegeId}/export?${qs}`, {
      headers: adminToken() ? { 'x-admin-token': adminToken() } : {},
    });
    if (!res.ok) throw new Error('Export failed (' + res.status + ')');
    const blob = await res.blob();
    const cd = res.headers.get('Content-Disposition') || '';
    const name = (cd.match(/filename="([^"]+)"/) || [])[1] || 'students.xlsx';
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  } catch (e) { alert(e.message); }
  btn.textContent = orig; btn.disabled = false;
});
$('#prevPage').addEventListener('click', () => { if (state.dash.page > 1) { state.dash.page--; loadDashboard(); } });
$('#nextPage').addEventListener('click', () => {
  const pages = Math.max(1, Math.ceil(state.dash.total / state.dash.pageSize));
  if (state.dash.page < pages) { state.dash.page++; loadDashboard(); }
});

function avInitial(name) { return (name || '?').trim().charAt(0).toUpperCase(); }
function avColor(name) {
  let h = 0;
  for (const c of String(name || '')) h = (h * 31 + c.charCodeAt(0)) % 360;
  return `hsl(${h}, 58%, 50%)`;
}
function rankCell(r) {
  if (r === 1) return '<span class="medal">🥇</span>';
  if (r === 2) return '<span class="medal">🥈</span>';
  if (r === 3) return '<span class="medal">🥉</span>';
  return `<span class="rank-num">${r}</span>`;
}
function difficultyCell(s) {
  const e = s.solved_easy || 0, m = s.solved_medium || 0, h = s.solved_hard || 0, sum = e + m + h || 1;
  return `<div class="dbar">
      <span style="width:${(e / sum) * 100}%;background:var(--easy)"></span>
      <span style="width:${(m / sum) * 100}%;background:var(--medium)"></span>
      <span style="width:${(h / sum) * 100}%;background:var(--hard)"></span>
    </div>
    <div class="dcounts"><span style="color:var(--easy)">${e}</span> · <span style="color:var(--medium)">${m}</span> · <span style="color:var(--hard)">${h}</span></div>`;
}
function practiceCell(s) {
  const tot = s.practiceTotal || 0, done = s.practiceCompleted || 0;
  const pct = tot ? Math.round((done / tot) * 100) : 0;
  return `<div class="pp"><span class="bar"><span style="width:${pct}%"></span></span><span class="hint">${done}/${tot}</span></div>`;
}

function renderStudents(students) {
  const rows = students; // filtering/search now handled server-side
  const tbody = $('#studentTable').querySelector('tbody');
  // Skip the DOM rebuild when nothing changed (avoids flicker on the 2s refresh).
  const sig = JSON.stringify(rows.map((s) => [s.id, s.classRank, s.name, s.username, s.section, s.department,
    s.register_number, s.email, s.year, s.campus,
    s.ranking, s.baseline_ranking, s.solved_easy, s.solved_medium, s.solved_hard, s.solved_total,
    s.baseline_easy, s.baseline_medium, s.baseline_hard, s.baseline_total, s.practiceCompleted, s.practiceTotal,
    s.sync_status, s.sync_error, s.last_synced_at, s.at_risk]));
  if (sig === state.studentsSig) return;
  state.studentsSig = sig;
  if (!rows.length) {
    tbody.innerHTML = '<tr><td colspan="9" class="empty">No students match.</td></tr>';
    updateBulkBar();
    return;
  }
  tbody.innerHTML = rows.map((s) => `
    <tr data-id="${s.id}">
      <td><input type="checkbox" class="row-sel" data-id="${s.id}"${selectedStudents.has(s.id) ? ' checked' : ''} /></td>
      <td>${rankCell(s.classRank)}</td>
      <td>
        <div class="s-cell">
          <div class="s-av" style="background:${avColor(s.name)}">${esc(avInitial(s.name))}</div>
          <div>
            <div class="s-name">${esc(s.name)}${s.at_risk ? ' <span class="risk-badge" title="Inactive: no new problems solved since tracking began">⚠ inactive</span>' : ''}</div>
            <div class="s-user">@${esc(s.username)}</div>
            ${(s.section || s.department) ? `<div class="s-tags">${s.section ? `<span class="tag">${esc(s.section)}</span>` : ''}${s.department ? `<span class="tag">${esc(s.department)}</span>` : ''}</div>` : ''}
          </div>
        </div>
      </td>
      <td>${s.found ? (s.ranking ? '#' + s.ranking.toLocaleString() : '—') : '<span class="cross">private</span>'}<span class="rank-delta">${rankDelta(s)}</span></td>
      <td>${difficultyCell(s)}</td>
      <td class="tot-td"><span class="tot">${s.solved_total}</span>${gain(s.solved_total, s.baseline_total)}</td>
      <td>${practiceCell(s)}</td>
      <td><span class="dot ${s.sync_status}"></span>${fmtAgo(s.last_synced_at)}${s.sync_status === 'error' ? ` <span class="cross" title="${esc(s.sync_error || 'sync failed')}">⚠</span>` : ''}</td>
      <td>
        <div class="row" style="margin:0;gap:4px;justify-content:flex-end;flex-wrap:nowrap">
          <button class="btn btn-sm btn-ghost edit-student-btn" data-id="${s.id}" title="Edit student data">${ic.edit}</button>
          <button class="btn btn-sm btn-ghost sync-one" data-id="${s.id}" title="Sync stats">⟳</button>
        </div>
      </td>
    </tr>`).join('');

  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.sync-one') || e.target.closest('.row-sel') || e.target.closest('.edit-student-btn')) return;
      openStudent(tr.dataset.id);
    });
  });
  tbody.querySelectorAll('.edit-student-btn').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditStudentModal(b.dataset.id);
    });
  });
  tbody.querySelectorAll('.sync-one').forEach((b) => {
    b.addEventListener('click', async (e) => {
      e.stopPropagation();
      b.textContent = '…';
      try { await api(`/students/${b.dataset.id}/sync`, { method: 'POST' }); }
      catch (err) { alert(err.message); }
      loadDashboard();
    });
  });
  tbody.querySelectorAll('.row-sel').forEach((cb) => cb.addEventListener('click', (e) => {
    e.stopPropagation();
    const id = Number(cb.dataset.id);
    cb.checked ? selectedStudents.add(id) : selectedStudents.delete(id);
    updateBulkBar();
  }));
  updateBulkBar();
}

// ---- Bulk select students ---------------------------------------------------
const selectedStudents = new Set();
function updateBulkBar() {
  const bar = $('#bulkBar'); if (!bar) return;
  const n = selectedStudents.size;
  bar.style.display = n ? 'flex' : 'none';
  if (n) $('#bulkCount').textContent = `${n} selected`;
  const all = $('#selAll');
  if (all) {
    const boxes = document.querySelectorAll('#studentTable .row-sel');
    all.checked = boxes.length > 0 && [...boxes].every((b) => b.checked);
  }
}
$('#selAll')?.addEventListener('change', (e) => {
  document.querySelectorAll('#studentTable .row-sel').forEach((cb) => {
    cb.checked = e.target.checked;
    const id = Number(cb.dataset.id);
    e.target.checked ? selectedStudents.add(id) : selectedStudents.delete(id);
  });
  updateBulkBar();
});
$('#bulkClear')?.addEventListener('click', () => {
  selectedStudents.clear();
  document.querySelectorAll('#studentTable .row-sel').forEach((cb) => { cb.checked = false; });
  updateBulkBar();
});
$('#bulkSync')?.addEventListener('click', async () => {
  const ids = [...selectedStudents];
  if (!ids.length) return;
  const btn = $('#bulkSync'); btn.disabled = true; btn.textContent = '⟳ Syncing…';
  for (const id of ids) { try { await api(`/students/${id}/sync`, { method: 'POST' }); } catch {} }
  btn.disabled = false; btn.textContent = '⟳ Sync selected';
  loadDashboard();
});
$('#bulkDelete')?.addEventListener('click', async () => {
  const ids = [...selectedStudents];
  if (!ids.length) return;
  if (!confirm(`Delete ${ids.length} selected student(s)? This can’t be undone.`)) return;
  const btn = $('#bulkDelete'); btn.disabled = true; btn.textContent = '🗑 Deleting…';
  for (const id of ids) { try { await api(`/students/${id}`, { method: 'DELETE' }); } catch {} }
  selectedStudents.clear();
  btn.disabled = false; btn.textContent = '🗑 Delete selected';
  state.studentsSig = null;
  loadDashboard();
});
let searchTimer = null;
$('#studentSearch').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const v = e.target.value.trim();
  searchTimer = setTimeout(() => { state.dash.q = v; state.dash.page = 1; loadDashboard(); }, 350);
});

function renderMonthlyChart(monthly) {
  const sig = JSON.stringify(monthly);
  if (sig === state.monthlySig && state.monthlyChart) return; // unchanged — no rebuild/flicker
  state.monthlySig = sig;
  const ctx = $('#monthlyChart');
  if (state.monthlyChart) state.monthlyChart.destroy();
  state.monthlyChart = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: monthly.map((m) => m.ym),
      datasets: [{ label: 'Submissions', data: monthly.map((m) => m.submissions), backgroundColor: '#ffa116' }],
    },
    options: {
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true },
      },
    },
  });
}

// ---- Student drawer ---------------------------------------------------------
function renderStudentPracticeSection(containerEl, practiceList, options = {}) {
  const totalAll = (practiceList || []).length;
  const solvedAll = (practiceList || []).filter((p) => p.completed).length;
  const pendingAll = totalAll - solvedAll;
  const solvedPct = totalAll ? Math.round((solvedAll / totalAll) * 100) : 0;

  const PAGE_SIZE = 10;
  const filterState = {
    q: '',
    diff: '',
    status: 'all',
    page: 1,
  };

  const wrap = document.createElement('div');
  wrap.className = 'stu-practice-section';
  wrap.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap;margin-top:22px;margin-bottom:8px">
      <h2 style="margin:0">Practice problems <span class="hint" style="font-size:12px;font-weight:normal">(mark / unmark)</span></h2>
      <span class="sync-status" style="font-size:12px;font-weight:600">${solvedAll}/${totalAll} solved (${solvedPct}%)</span>
    </div>
    ${totalAll > 0 ? `
    <div class="drawer-filter-bar" style="margin:8px 0 12px">
      <div class="drawer-filter-row" style="margin-bottom:6px">
        <div class="drawer-tabs stu-prac-status-tabs">
          <button type="button" class="drawer-tab active" data-status="all">All (${totalAll})</button>
          <button type="button" class="drawer-tab" data-status="solved">✓ Solved (${solvedAll})</button>
          <button type="button" class="drawer-tab" data-status="pending">✗ Pending (${pendingAll})</button>
        </div>
        <select class="drawer-filter-sel stu-prac-diff-sel" style="margin-left:auto">
          <option value="">All difficulties</option>
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <div class="drawer-filter-row">
        <input type="search" class="drawer-filter-search stu-prac-search" placeholder="Search problem title / topic…" autocomplete="off" />
      </div>
      <div class="drawer-filter-meta">
        <span class="stu-prac-count hint"></span>
        <button type="button" class="stu-prac-clear drawer-clear-btn" style="display:none">Clear filters</button>
      </div>
    </div>
    <div class="stu-prac-table-wrap">
      <table class="mini-table">
        <thead>
          <tr>
            <th>Problem</th>
            <th style="width:75px">Difficulty</th>
            <th style="width:85px">Status</th>
            ${options.isAdmin ? '<th style="width:90px;text-align:right">Action</th>' : ''}
          </tr>
        </thead>
        <tbody class="stu-prac-tbody"></tbody>
      </table>
      <div class="drawer-pager stu-prac-pager" style="margin-top:8px">
        <span class="stu-prac-page-info hint"></span>
        <button type="button" class="btn btn-sm btn-ghost stu-prac-prev">‹ Prev</button>
        <button type="button" class="btn btn-sm btn-ghost stu-prac-next">Next ›</button>
      </div>
    </div>` : '<p class="empty" style="margin-top:8px">No problems assigned.</p>'}`;

  containerEl.appendChild(wrap);
  if (totalAll === 0) return;

  function renderRows() {
    const q = filterState.q.trim().toLowerCase();
    const diff = filterState.diff.trim().toLowerCase();
    const status = filterState.status;

    const filtered = (practiceList || []).filter((p) => {
      if (status === 'solved' && !p.completed) return false;
      if (status === 'pending' && p.completed) return false;
      if (diff && (p.difficulty || '').toLowerCase() !== diff) return false;
      if (q) {
        const t = (p.title || '').toLowerCase();
        const s = (p.slug || '').toLowerCase();
        const tp = (p.topic || '').toLowerCase();
        const dm = (p.domain || '').toLowerCase();
        if (!t.includes(q) && !s.includes(q) && !tp.includes(q) && !dm.includes(q)) return false;
      }
      return true;
    });

    const isFiltered = Boolean(q || diff || status !== 'all');
    const countEl = wrap.querySelector('.stu-prac-count');
    if (countEl) {
      countEl.textContent = isFiltered
        ? `Showing ${filtered.length} of ${totalAll} problems`
        : `${totalAll} problems`;
    }
    const clearBtn = wrap.querySelector('.stu-prac-clear');
    if (clearBtn) clearBtn.style.display = isFiltered ? 'inline-block' : 'none';

    const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
    filterState.page = Math.min(Math.max(1, filterState.page), totalPages);
    const start = (filterState.page - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    const tbody = wrap.querySelector('.stu-prac-tbody');
    if (!filtered.length) {
      tbody.innerHTML = `<tr><td colspan="${options.isAdmin ? 4 : 3}" class="empty">No matching problems found.</td></tr>`;
    } else {
      tbody.innerHTML = pageItems.map((p) => {
        const diffPill = p.difficulty ? `<span class="pill ${(p.difficulty || '').toLowerCase()}">${esc(p.difficulty)}</span>` : '—';
        const vidBtn = p.video_url ? ` <button class="vid-link" data-video="${esc(p.video_url)}" title="YouTube video">▶ video</button>` : '';
        const duePill = p.due_date ? ` <span class="due-pill${p.due_date < new Date().toISOString().slice(0,10) ? ' overdue' : ''}">⏰ ${esc(p.due_date)}</span>` : '';
        const statusHtml = p.completed ? '<span class="check">✓ solved</span>' : '<span class="cross">pending</span>';
        const actHtml = options.isAdmin
          ? `<td style="text-align:right"><button class="btn btn-sm ${p.completed ? 'btn-ghost' : 'btn-primary'} toggle-comp-btn" data-pid="${p.id}" data-done="${p.completed ? 1 : 0}" style="padding:2px 7px;font-size:11px">${p.completed ? 'Unmark' : 'Mark done'}</button></td>`
          : '';
        return `
          <tr>
            <td>
              <a href="${esc(p.url)}" target="_blank" rel="noopener" style="font-weight:500">${esc(p.title)}</a>${vidBtn}${duePill}
              ${p.topic || p.domain ? `<div style="font-size:11px;color:var(--muted);margin-top:2px">${esc([p.domain, p.topic].filter(Boolean).join(' · '))}</div>` : ''}
            </td>
            <td>${diffPill}</td>
            <td>${statusHtml}</td>
            ${actHtml}
          </tr>`;
      }).join('');

      if (options.isAdmin && options.onToggle) {
        tbody.querySelectorAll('.toggle-comp-btn').forEach((btn) => {
          btn.addEventListener('click', async () => {
            const pid = Number(btn.dataset.pid);
            const curDone = btn.dataset.done === '1';
            btn.disabled = true;
            await options.onToggle(pid, curDone);
          });
        });
      }
    }

    const pageInfo = wrap.querySelector('.stu-prac-page-info');
    if (pageInfo) {
      pageInfo.textContent = filtered.length === 0 ? '0 of 0' : `${start + 1}–${Math.min(start + PAGE_SIZE, filtered.length)} of ${filtered.length}`;
    }
    const prevBtn = wrap.querySelector('.stu-prac-prev');
    const nextBtn = wrap.querySelector('.stu-prac-next');
    if (prevBtn) prevBtn.disabled = filterState.page <= 1;
    if (nextBtn) nextBtn.disabled = filterState.page >= totalPages;
  }

  wrap.querySelectorAll('.stu-prac-status-tabs .drawer-tab').forEach((btn) => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.stu-prac-status-tabs .drawer-tab').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      filterState.status = btn.dataset.status;
      filterState.page = 1;
      renderRows();
    });
  });

  const diffSel = wrap.querySelector('.stu-prac-diff-sel');
  if (diffSel) {
    diffSel.addEventListener('change', (e) => {
      filterState.diff = e.target.value;
      filterState.page = 1;
      renderRows();
    });
  }

  const searchInput = wrap.querySelector('.stu-prac-search');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterState.q = e.target.value;
      filterState.page = 1;
      renderRows();
    });
  }

  const clearBtn = wrap.querySelector('.stu-prac-clear');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      filterState.q = '';
      filterState.diff = '';
      filterState.status = 'all';
      filterState.page = 1;
      if (searchInput) searchInput.value = '';
      if (diffSel) diffSel.value = '';
      wrap.querySelectorAll('.stu-prac-status-tabs .drawer-tab').forEach((b, i) => b.classList.toggle('active', i === 0));
      renderRows();
    });
  }

  const prevBtn = wrap.querySelector('.stu-prac-prev');
  if (prevBtn) prevBtn.addEventListener('click', () => { if (filterState.page > 1) { filterState.page--; renderRows(); } });
  const nextBtn = wrap.querySelector('.stu-prac-next');
  if (nextBtn) nextBtn.addEventListener('click', () => { filterState.page++; renderRows(); });

  renderRows();
}

async function openStudent(id) {
  // Instant visual feedback: open drawer immediately with animated loader and skeleton
  $('#drawerContent').innerHTML = `
    <div class="spinner-wrap" style="padding:32px 16px">
      <div class="spinner spinner-lg"></div>
      <p style="margin:0;font-size:13px;font-weight:500">Loading student profile…</p>
    </div>
    ${drawerSkeletonHtml()}`;
  openDrawer();

  let d;
  try {
    d = await api(`/students/${id}`);
  } catch (e) {
    $('#drawerContent').innerHTML = `
      <p class="empty" style="padding:24px">${esc(e.message || 'Could not load student profile.')}</p>`;
    return;
  }

  const s = d.student;
  const growth = d.monthlySolvedGrowth || [];
  $('#drawerContent').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;margin-bottom:8px">
      <div>
        <h2 style="margin:0 0 4px">${esc(s.name)}</h2>
        <p class="hint" style="margin:0"><a href="${esc(s.profile_url || '#')}" target="_blank">@${esc(s.username)}</a>
          ${s.found ? '' : '· <span class="cross">profile not found / private</span>'}</p>
      </div>
      <button class="btn btn-sm btn-ghost edit-student-from-drawer" data-id="${s.id}" title="Edit student details" style="display:inline-flex;align-items:center;gap:6px">
        ${ic.edit} Edit
      </button>
    </div>
    ${(s.register_number || s.department || s.section || s.campus || s.year) ? `<p class="hint" style="line-height:1.7">
      ${s.register_number ? `Reg: <b>${esc(s.register_number)}</b> · ` : ''}${s.section ? `Batch: <b>${esc(s.section)}</b> · ` : ''}${s.department ? `${esc(s.department)} · ` : ''}${s.campus ? `${esc(s.campus)}` : ''}${s.year ? ` · ${esc(s.year)}` : ''}</p>` : ''}
    <div class="kv">
      <div><div class="l">Global rank</div><div class="v">${s.ranking ? '#' + s.ranking.toLocaleString() : '—'}</div></div>
      <div><div class="l">Total solved</div><div class="v">${s.solved_total}</div></div>
      <div><div class="l">Easy</div><div class="v" style="color:var(--easy)">${s.solved_easy}</div></div>
      <div><div class="l">Medium</div><div class="v" style="color:var(--medium)">${s.solved_medium}</div></div>
      <div><div class="l">Hard</div><div class="v" style="color:var(--hard)">${s.solved_hard}</div></div>
      <div><div class="l">Contest rating</div><div class="v">${s.contest_rating || '—'}</div></div>
    </div>
    ${progressBlock(s)}
    <h2>Monthly submissions</h2>
    <canvas id="drawerMonthly" height="120"></canvas>
    ${growth.length ? `<h2 style="margin-top:18px">Problems solved per month</h2>
      <table><thead><tr><th>Month</th><th>Easy</th><th>Med</th><th>Hard</th><th>Total</th></tr></thead>
      <tbody>${growth.map((g) => `<tr><td>${g.ym}</td><td>${g.easy}</td><td>${g.medium}</td><td>${g.hard}</td><td><b>${g.total}</b></td></tr>`).join('')}</tbody></table>
      <p class="hint">Computed from snapshot diffs — accumulates as the app keeps running.</p>` : ''}
    <div id="stuPracticeContainer"></div>
    <div style="margin-top:24px; border-top:1px solid var(--border); padding-top:16px">
      <button class="btn btn-sm btn-danger del-student" data-id="${s.id}" data-name="${esc(s.name)}">Delete this student</button>
    </div>`;

  const ed = $('#drawerContent').querySelector('.edit-student-from-drawer');
  if (ed) ed.addEventListener('click', () => {
    openEditStudentModal(ed.dataset.id);
  });

  renderStudentPracticeSection($('#stuPracticeContainer'), d.practice || [], {
    isAdmin: true,
    onToggle: async (pid, curDone) => {
      try {
        await api(`/students/${id}/completions/${pid}`, { method: curDone ? 'DELETE' : 'POST' });
        state.studentsSig = null; // dashboard counts changed
        // Optimistically update local practice array and re-render
        const item = (d.practice || []).find((p) => p.id === pid);
        if (item) item.completed = !curDone;
        $('#stuPracticeContainer').innerHTML = '';
        renderStudentPracticeSection($('#stuPracticeContainer'), d.practice || [], {
          isAdmin: true,
          onToggle: arguments.callee,
        });
      } catch (err) {
        alert(err.message);
      }
    }
  });

  const m = d.monthlyActivity || [];
  if ($('#drawerMonthly')) {
    new Chart($('#drawerMonthly'), {
      type: 'line',
      data: { labels: m.map((x) => x.ym), datasets: [{ data: m.map((x) => x.submissions), borderColor: '#ffa116', backgroundColor: 'rgba(255,161,22,.15)', fill: true, tension: .3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }

  const ds = $('#drawerContent').querySelector('.del-student');
  if (ds) ds.addEventListener('click', async () => {
    if (!confirm(`Delete "${ds.dataset.name}" and all their data (stats, progress, completions)? This cannot be undone.`)) return;
    try {
      await api(`/students/${ds.dataset.id}`, { method: 'DELETE' });
      closeDrawer();
      loadDashboard();
    } catch (e) { alert(e.message); }
  });

  const rb = $('#drawerContent').querySelector('.reset-baseline');
  if (rb) rb.addEventListener('click', async () => {
    if (!confirm('Reset this student’s baseline to their current stats? Progress will restart from now.')) return;
    try {
      await api(`/students/${rb.dataset.id}/reset-baseline`, { method: 'POST' });
      openStudent(rb.dataset.id);
      loadDashboard();
    } catch (e) { alert(e.message); }
  });
}
function openDrawer() { $('#drawer').classList.add('open'); $('#drawerBackdrop').classList.add('show'); }
function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerBackdrop').classList.remove('show'); }
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawerBackdrop').addEventListener('click', closeDrawer);

// ---- Edit Student Modal ----------------------------------------------------
let activeEditingStudent = null;

async function openEditStudentModal(id) {
  setMsg('#editStudentMsg', '', '');
  const saveBtn = $('#editStudentSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }

  let student = (state.students || []).find((s) => String(s.id) === String(id));

  if (!student || !student.username) {
    try {
      const res = await api(`/students/${id}`);
      student = res.student;
    } catch (e) {
      alert('Could not load student: ' + e.message);
      return;
    }
  }

  activeEditingStudent = student;
  $('#editStudentId').value = student.id;
  $('#editStudentName').value = student.name || '';
  $('#editStudentUrl').value = student.profile_url || student.username || '';
  $('#editStudentReg').value = student.register_number || '';
  $('#editStudentEmail').value = student.email || '';
  $('#editStudentDept').value = student.department || '';
  $('#editStudentSection').value = student.section || '';
  $('#editStudentYear').value = student.year || '';
  $('#editStudentCampus').value = student.campus || '';

  $('#editStudentModalTitle').textContent = `Edit Student · ${student.name || ''}`;
  $('#editStudentModalBackdrop')?.classList.add('open');
  setTimeout(() => $('#editStudentName')?.focus(), 50);
}

function closeEditStudentModal() {
  $('#editStudentModalBackdrop')?.classList.remove('open');
  activeEditingStudent = null;
  setMsg('#editStudentMsg', '', '');
}

$('#editStudentModalCloseBtn')?.addEventListener('click', closeEditStudentModal);
$('#editStudentCancelBtn')?.addEventListener('click', closeEditStudentModal);
$('#editStudentModalBackdrop')?.addEventListener('click', (e) => {
  if (e.target.id === 'editStudentModalBackdrop') closeEditStudentModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#editStudentModalBackdrop')?.classList.contains('open')) {
    closeEditStudentModal();
  }
});

$('#editStudentForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeEditingStudent) return;
  const id = $('#editStudentId').value;
  const name = $('#editStudentName').value.trim();
  const url = $('#editStudentUrl').value.trim();

  if (!name) return setMsg('#editStudentMsg', 'Student name is required.', 'err');
  if (!url) return setMsg('#editStudentMsg', 'LeetCode profile URL or username is required.', 'err');

  const body = {
    name,
    url,
    register_number: $('#editStudentReg').value.trim(),
    email: $('#editStudentEmail').value.trim(),
    department: $('#editStudentDept').value.trim(),
    section: $('#editStudentSection').value.trim(),
    year: $('#editStudentYear').value.trim(),
    campus: $('#editStudentCampus').value.trim(),
  };

  const saveBtn = $('#editStudentSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving…';
  }
  setMsg('#editStudentMsg', 'Saving changes…', '');

  try {
    await api(`/students/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    closeEditStudentModal();
    state.studentsSig = null; // force table repaint
    await loadDashboard();

    // If drawer is open and viewing this student, refresh drawer
    if ($('#drawer')?.classList.contains('open') && activeEditingStudent && String(activeEditingStudent.id) === String(id)) {
      openStudent(id);
    }
  } catch (err) {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = 'Save Changes';
    }
    setMsg('#editStudentMsg', err.message || 'Failed to update student.', 'err');
  }
});

// ---- Practice tab -----------------------------------------------------------
// The Practice tab has its own college selector (state.practiceCollegeId),
// independent of the dashboard's top-bar selection.
const practiceCid = () => state.practiceCollegeId || state.collegeId;
// Where an add goes: one college, or every college when "All colleges" is picked.
const practiceAddPath = () => (practiceCid() === '__all' ? '/practice/all-colleges' : `/colleges/${practiceCid()}/practice`);

async function populatePracticeColleges() {
  const colleges = await api('/colleges');
  const sel = $('#practiceCollege');
  const cur = practiceCid();
  sel.innerHTML = '<option value="__all">🌐 All colleges</option>'
    + colleges.map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join('');
  if (cur === '__all') sel.value = '__all';
  else if (colleges.some((c) => c.id == cur)) sel.value = String(cur);
  else sel.value = colleges.length ? String(colleges[0].id) : '__all';
  state.practiceCollegeId = sel.value === '__all' ? '__all' : (Number(sel.value) || null);
}
$('#practiceCollege').addEventListener('change', (e) => {
  state.practiceCollegeId = e.target.value === '__all' ? '__all' : Number(e.target.value);
  // Instant feedback + force repaint for the newly selected college.
  state.practiceSig = null;
  state.practiceDomain = '__all';
  $('#completionDist').innerHTML = '';
  $('#practiceTable').querySelector('tbody').innerHTML = '<tr><td colspan="5" class="empty">Loading…</td></tr>';
  loadPractice();
});

const domName = (p) => (p.domain && p.domain.trim()) || 'Uncategorized';
const topName = (p) => (p.topic && p.topic.trim()) || 'Uncategorized';
const sortGroups = (a, b) => (a === 'Uncategorized' ? 1 : b === 'Uncategorized' ? -1 : a.localeCompare(b));
const collapsedDomains = new Set(); // domains folded in the practice list
const collapsedTopics = new Set(); // topics folded (keyed by domain|topic)

// Small deadline pill: red when the due date has passed, muted otherwise.
function dueLabel(due) {
  if (!due) return '';
  const today = new Date().toISOString().slice(0, 10);
  const overdue = due < today;
  return ` <span class="due-pill${overdue ? ' overdue' : ''}" title="Deadline">⏰ ${esc(due)}${overdue ? ' · overdue' : ''}</span>`;
}

let practiceAbort = null;
async function loadPractice() {
  const cid = practiceCid();
  if (!cid) return;
  if (cid === '__all') {
    // "All colleges" is an add-only mode; the list/breakdown need a specific college.
    $('#domainTabs').innerHTML = '';
    $('#completionDist').innerHTML = '';
    $('#practiceTable').querySelector('tbody').innerHTML =
      '<tr><td colspan="5" class="empty">Adding to <b>all colleges</b>. Pick a specific college above to view or manage its assigned questions.</td></tr>';
    setVideoToggleLabel && setVideoToggleLabel();
    return;
  }
  practiceAbort?.abort();
  const ctrl = new AbortController();
  practiceAbort = ctrl;
  let d;
  try {
    d = await api(`/colleges/${cid}/practice`, { signal: ctrl.signal });
  } catch (e) {
    if (e.name === 'AbortError' || /abort/i.test(e.message || '')) return;
    throw e;
  }
  state.lastPractice = d;
  renderPracticeData(d);
}

// Render the practice tab from cached data — used by loadPractice and by
// instant (no-fetch) domain-tab / fold clicks.
function renderPracticeData(d) {
  // Skip the rebuild when nothing relevant changed (no flicker on auto-refresh).
  const sig = JSON.stringify([
    d.studentCount, d.domains, d.topics, state.practiceDomain, [...collapsedDomains], [...collapsedTopics],
    d.problems.map((p) => [p.id, p.title, p.difficulty, p.topic, p.domain, p.completedCount, p.due_date, p.video_url]),
  ]);
  if (sig === state.practiceSig) return;
  state.practiceSig = sig;

  renderCompletionDist(d);
  state.showVideo = !!d.showVideo;
  setVideoToggleLabel();
  const tbody = $('#practiceTable').querySelector('tbody');
  if (!d.problems.length) {
    $('#domainTabs').innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="5" class="empty">No practice problems assigned yet.</td></tr>';
    return;
  }
  $('#topicList').innerHTML = (d.topics || []).map((t) => `<option value="${esc(t)}">`).join('');
  $('#domainList').innerHTML = (d.domains || []).map((t) => `<option value="${esc(t)}">`).join('');

  // topic comparator honouring the saved order
  const torder = new Map((d.topics || []).map((n, i) => [n, i]));
  const tcmp = (a, b) => {
    if (a === 'Uncategorized') return 1;
    if (b === 'Uncategorized') return -1;
    const ia = torder.has(a) ? torder.get(a) : 1e9, ib = torder.has(b) ? torder.get(b) : 1e9;
    return ia - ib || a.localeCompare(b);
  };

  // domain tabs in saved order (+ Uncategorized last)
  const present = new Set(d.problems.map(domName));
  const domainSet = [...(d.domains || []).filter((n) => present.has(n))];
  if (present.has('Uncategorized')) domainSet.push('Uncategorized');
  if (state.practiceDomain && state.practiceDomain !== '__all' && !domainSet.includes(state.practiceDomain)) {
    state.practiceDomain = '__all';
  }
  const sel = state.practiceDomain || '__all';
  $('#domainTabs').innerHTML =
    `<button class="dom-tab ${sel === '__all' ? 'active' : ''}" data-dom="__all">All domains</button>` +
    domainSet.map((dn) => `<button class="dom-tab ${sel === dn ? 'active' : ''}" data-dom="${esc(dn)}">${esc(dn)}</button>`).join('');
  $('#domainTabs').querySelectorAll('.dom-tab').forEach((b) => b.addEventListener('click', () => {
    state.practiceDomain = b.dataset.dom;
    renderPracticeData(state.lastPractice); // instant, no refetch
  }));

  const rowHtml = (p) => {
    const pct = d.studentCount ? Math.round((p.completedCount / d.studentCount) * 100) : 0;
    return `<tr>
      <td><a href="${esc(p.url)}" target="_blank">${esc(p.title)}</a>${p.video_url ? ` <button class="vid-link" data-video="${esc(p.video_url)}" title="YouTube video">▶ video</button>` : ''}${dueLabel(p.due_date)}</td>
      <td>${p.difficulty ? `<span class="pill ${(p.difficulty || '').toLowerCase()}">${esc(p.difficulty)}</span>` : '—'}</td>
      <td class="prog-cell" data-pid="${p.id}" data-title="${esc(p.title)}" style="cursor:pointer" title="Click to see who completed / didn't">${p.completedCount}/${d.studentCount}</td>
      <td class="prog-cell" data-pid="${p.id}" data-title="${esc(p.title)}" style="cursor:pointer" title="Click to see who completed / didn't"><span class="progress"><span style="width:${pct}%"></span></span> ${pct}%</td>
      <td><button class="btn btn-sm btn-danger del-prob" data-id="${p.id}">Delete</button></td>
    </tr>`;
  };
  // topic sub-group within a set of problems (foldable)
  const byTopic = (probs) => {
    const groups = {};
    for (const p of probs) (groups[topName(p)] ||= []).push(p);
    return Object.keys(groups).sort(tcmp).map((t) => {
      const g = groups[t];
      const key = domName(g[0]) + '|' + t;
      const collapsed = collapsedTopics.has(key);
      const head = `<tr class="topic-foldrow" data-topic="${esc(key)}"><td colspan="5" style="background:var(--panel-2);font-weight:600;padding-left:18px;cursor:pointer">${collapsed ? '▸' : '▾'} ${esc(t)} <span style="color:var(--muted);font-weight:400">· ${g.length}</span><button class="btn btn-sm btn-danger del-topic" data-domain="${esc(domName(g[0]))}" data-topic="${esc(t)}" style="float:right;font-weight:600" title="Remove every question under this topic">🗑 Remove all</button></td></tr>`;
      return head + (collapsed ? '' : g.map(rowHtml).join(''));
    }).join('');
  };

  let html = '';
  if (sel === '__all') {
    // group by domain (foldable header), then topic
    const domGroups = {};
    for (const p of d.problems) (domGroups[domName(p)] ||= []).push(p);
    html = domainSet.map((dn) => {
      const collapsed = collapsedDomains.has(dn);
      const head = `<tr class="dom-foldrow" data-dom="${esc(dn)}"><td colspan="5" style="background:var(--accent);color:#1a1300;font-weight:700;cursor:pointer">${collapsed ? '▸' : '▾'} ${esc(dn)} <span style="font-weight:400">· ${domGroups[dn].length}</span></td></tr>`;
      return head + (collapsed ? '' : byTopic(domGroups[dn]));
    }).join('');
  } else {
    html = byTopic(d.problems.filter((p) => domName(p) === sel));
  }
  tbody.innerHTML = html;

  tbody.querySelectorAll('.dom-foldrow').forEach((r) => r.addEventListener('click', () => {
    const dn = r.dataset.dom;
    collapsedDomains.has(dn) ? collapsedDomains.delete(dn) : collapsedDomains.add(dn);
    renderPracticeData(state.lastPractice); // instant, no refetch
  }));
  tbody.querySelectorAll('.topic-foldrow').forEach((r) => r.addEventListener('click', () => {
    const k = r.dataset.topic;
    collapsedTopics.has(k) ? collapsedTopics.delete(k) : collapsedTopics.add(k);
    renderPracticeData(state.lastPractice); // instant, no refetch
  }));
  tbody.querySelectorAll('.del-topic').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation(); // don't toggle the fold
    const dn = b.dataset.domain, tp = b.dataset.topic;
    if (!confirm(`Remove ALL questions under “${tp}”? This can’t be undone.`)) return;
    b.disabled = true;
    try {
      const r = await api(`/colleges/${practiceCid()}/practice-by-topic?domain=${encodeURIComponent(dn)}&topic=${encodeURIComponent(tp)}`, { method: 'DELETE' });
      setMsg('#practiceMsg', `Removed ${r.removed} question(s) from “${tp}”.`, 'ok', 5000);
    } catch (err) { setMsg('#practiceMsg', err.message, 'err'); }
    loadPractice();
  }));
  tbody.querySelectorAll('.del-prob').forEach((b) => b.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Remove this practice problem?')) return;
    await api(`/practice/${b.dataset.id}`, { method: 'DELETE' });
    loadPractice();
  }));
  tbody.querySelectorAll('.prog-cell').forEach((c) => c.addEventListener('click', () =>
    showProblemCompletion(Number(c.dataset.pid), c.dataset.title)));
}

function filterDrawerStudents(list, { q = '', dept = '', sec = '', campus = '' } = {}) {
  const query = (q || '').trim().toLowerCase();
  return (list || []).filter((s) => {
    if (dept && (s.department || '') !== dept) return false;
    if (sec && (s.section || '') !== sec) return false;
    if (campus && (s.campus || '') !== campus) return false;
    if (query) {
      const name = (s.name || '').toLowerCase();
      const user = (s.username || '').toLowerCase();
      const reg = (s.register_number || '').toLowerCase();
      if (!name.includes(query) && !user.includes(query) && !reg.includes(query)) return false;
    }
    return true;
  });
}

const DRAWER_PAGE_SIZE = 10;
function renderDrawerTablePage({
  idPrefix,
  list,
  page,
  pageSize = DRAWER_PAGE_SIZE,
  depts,
  campuses,
  emptyMsg = 'None.'
}) {
  const total = list.length;
  if (!total) {
    return `<p class="empty" style="margin:6px 0 14px">${emptyMsg}</p>`;
  }
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const curPage = Math.min(Math.max(1, page), pages);
  const start = (curPage - 1) * pageSize;
  const pageRows = list.slice(start, start + pageSize);

  const tableHtml = `<table class="mini-table">
    <thead>
      <tr>
        <th>Name</th><th>Username</th><th>Reg no</th><th>Section</th>
        ${depts && depts.length ? '<th>Dept</th>' : ''}
        ${campuses && campuses.length > 1 ? '<th>Campus</th>' : ''}
      </tr>
    </thead>
    <tbody>
      ${pageRows.map((s) => `<tr data-id="${s.id}" style="cursor:pointer">
        <td>${esc(s.name || '')}</td><td>@${esc(s.username || '')}</td>
        <td>${esc(s.register_number || '—')}</td><td>${esc(s.section || '—')}</td>
        ${depts && depts.length ? `<td>${esc(s.department || '—')}</td>` : ''}
        ${campuses && campuses.length > 1 ? `<td>${esc(s.campus || '—')}</td>` : ''}
      </tr>`).join('')}
    </tbody>
  </table>`;

  const pagerHtml = pages > 1 ? `
    <div class="drawer-pager">
      <button type="button" class="btn btn-sm btn-ghost ${idPrefix}-prev" ${curPage === 1 ? 'disabled' : ''}>‹ Prev</button>
      <span class="hint">${start + 1}–${Math.min(start + pageSize, total)} of ${total}</span>
      <button type="button" class="btn btn-sm btn-ghost ${idPrefix}-next" ${curPage === pages ? 'disabled' : ''}>Next ›</button>
    </div>` : '';

  return tableHtml + pagerHtml;
}

// Who completed / didn't complete one specific problem (drawer with search, filters & pagination).
async function showProblemCompletion(problemId, title) {
  const cid = practiceCid(); if (!cid) return;
  $('#drawerContent').innerHTML = '<p class="hint">Loading…</p>';
  openDrawer();
  let d;
  try { d = await api(`/colleges/${cid}/practice/${problemId}/completion`); }
  catch { $('#drawerContent').innerHTML = '<p class="empty">Could not load.</p>'; return; }

  const completedAll = d.completed || [];
  const notCompletedAll = d.notCompleted || [];
  const totalAll = completedAll.length + notCompletedAll.length;
  const allStudents = [...completedAll, ...notCompletedAll];

  const depts = [...new Set(allStudents.map((s) => s.department).filter(Boolean))].sort();
  const secs = [...new Set(allStudents.map((s) => s.section).filter(Boolean))].sort();
  const campuses = [...new Set(allStudents.map((s) => s.campus).filter(Boolean))].sort();

  const filterState = { q: '', dept: '', sec: '', campus: '', compPage: 1, notCompPage: 1 };

  const deptOpts = depts.length ? `<select id="prob_dept" class="drawer-filter-sel"><option value="">All depts</option>${depts.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>` : '';
  const secOpts = secs.length ? `<select id="prob_sec" class="drawer-filter-sel"><option value="">All sections</option>${secs.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>` : '';
  const campusOpts = campuses.length > 1 ? `<select id="prob_campus" class="drawer-filter-sel"><option value="">All campuses</option>${campuses.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>` : '';

  const filterBar = totalAll > 0 ? `
    <div class="drawer-filter-bar">
      <div class="drawer-filter-row">
        <input type="search" id="prob_q" class="drawer-filter-search" placeholder="Search name / username / reg no…" autocomplete="off" />
        ${deptOpts}
        ${secOpts}
        ${campusOpts}
      </div>
      <div class="drawer-filter-meta">
        <span id="prob_filter_count" class="hint"></span>
        <button type="button" id="prob_filter_clear" class="drawer-clear-btn" style="display:none">Clear filters</button>
      </div>
    </div>` : '';

  const compPct = totalAll ? Math.round((completedAll.length / totalAll) * 100) : 0;
  const notCompPct = totalAll ? 100 - compPct : 0;

  const statGraphHtml = totalAll > 0 ? `
    <div class="prob-stat-bar">
      <div class="prob-stat-track">
        <div class="prob-stat-fill comp" style="width:${compPct}%" title="Completed: ${completedAll.length} (${compPct}%)"></div>
        <div class="prob-stat-fill notcomp" style="width:${notCompPct}%" title="Not completed: ${notCompletedAll.length} (${notCompPct}%)"></div>
      </div>
      <div class="prob-stat-labels">
        <span style="color:var(--green)">✓ <b>${completedAll.length}</b> completed (${compPct}%)</span>
        <span style="color:var(--hard)">✗ <b>${notCompletedAll.length}</b> not completed (${notCompPct}%)</span>
      </div>
    </div>` : '';

  $('#drawerContent').innerHTML = `
    <h2 style="margin-top:0">${esc(title || 'Problem')}</h2>
    ${statGraphHtml}
    ${filterBar}
    <div id="prob_tables_container"></div>`;

  function render() {
    const compFiltered = filterDrawerStudents(completedAll, filterState);
    const notCompFiltered = filterDrawerStudents(notCompletedAll, filterState);
    const totalFiltered = compFiltered.length + notCompFiltered.length;

    const isFiltered = Boolean(filterState.q || filterState.dept || filterState.sec || filterState.campus);

    const countEl = $('#prob_filter_count');
    if (countEl) {
      countEl.textContent = isFiltered
        ? `Showing ${totalFiltered} of ${totalAll} students`
        : `${totalAll} total student${totalAll === 1 ? '' : 's'}`;
    }
    const clearBtn = $('#prob_filter_clear');
    if (clearBtn) clearBtn.style.display = isFiltered ? 'inline' : 'none';

    const compHtml = renderDrawerTablePage({
      idPrefix: 'prob-comp',
      list: compFiltered,
      page: filterState.compPage,
      depts,
      campuses,
      emptyMsg: isFiltered ? 'No matching completed students.' : 'None.'
    });

    const notCompHtml = renderDrawerTablePage({
      idPrefix: 'prob-notcomp',
      list: notCompFiltered,
      page: filterState.notCompPage,
      depts,
      campuses,
      emptyMsg: isFiltered ? 'No matching not completed students.' : 'None.'
    });

    const tablesHtml = `
      <h2 style="color:var(--green);margin-top:14px">✓ Completed (${compFiltered.length}${compFiltered.length !== completedAll.length ? ` / ${completedAll.length}` : ''})</h2>
      <div id="prob_comp_wrap">${compHtml}</div>
      <h2 style="color:var(--hard);margin-top:20px">✗ Not completed (${notCompFiltered.length}${notCompFiltered.length !== notCompletedAll.length ? ` / ${notCompletedAll.length}` : ''})</h2>
      <div id="prob_not_comp_wrap">${notCompHtml}</div>`;

    const container = $('#prob_tables_container');
    if (container) {
      container.innerHTML = tablesHtml;
      container.querySelectorAll('tr[data-id]').forEach((tr) =>
        tr.addEventListener('click', () => openStudent(tr.dataset.id)));

      const compPrev = container.querySelector('.prob-comp-prev');
      const compNext = container.querySelector('.prob-comp-next');
      if (compPrev) compPrev.addEventListener('click', () => { filterState.compPage--; render(); });
      if (compNext) compNext.addEventListener('click', () => { filterState.compPage++; render(); });

      const notCompPrev = container.querySelector('.prob-notcomp-prev');
      const notCompNext = container.querySelector('.prob-notcomp-next');
      if (notCompPrev) notCompPrev.addEventListener('click', () => { filterState.notCompPage--; render(); });
      if (notCompNext) notCompNext.addEventListener('click', () => { filterState.notCompPage++; render(); });
    }
  }

  if (totalAll > 0) {
    const qInput = $('#prob_q');
    if (qInput) qInput.addEventListener('input', (e) => { filterState.q = e.target.value; filterState.compPage = 1; filterState.notCompPage = 1; render(); });
    const deptSel = $('#prob_dept');
    if (deptSel) deptSel.addEventListener('change', (e) => { filterState.dept = e.target.value; filterState.compPage = 1; filterState.notCompPage = 1; render(); });
    const secSel = $('#prob_sec');
    if (secSel) secSel.addEventListener('change', (e) => { filterState.sec = e.target.value; filterState.compPage = 1; filterState.notCompPage = 1; render(); });
    const campusSel = $('#prob_campus');
    if (campusSel) campusSel.addEventListener('change', (e) => { filterState.campus = e.target.value; filterState.compPage = 1; filterState.notCompPage = 1; render(); });

    const clearBtn = $('#prob_filter_clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        filterState.q = ''; filterState.dept = ''; filterState.sec = ''; filterState.campus = '';
        filterState.compPage = 1; filterState.notCompPage = 1;
        if (qInput) qInput.value = '';
        if (deptSel) deptSel.value = '';
        if (secSel) secSel.value = '';
        if (campusSel) campusSel.value = '';
        render();
      });
    }
  }

  render();
}

// ---- Completion breakdown (how many students solved how many questions) -----
let distPage = 1;
const DIST_PER_PAGE = 10;
function renderCompletionDist(d) {
  const el = $('#completionDist');
  if (!el) return;
  const total = d.problems.length;
  if (!d.studentCount) {
    el.innerHTML = '<p class="hint" style="margin:0">No students in this college yet.</p>';
    return;
  }
  // One row per level 0..total (fill empty levels with 0 students) so pagination
  // spans every 10 questions, not just the levels that happen to have students.
  const distMap = new Map((d.completionDist || []).map((x) => [x.completed, x.students]));
  const dist = [];
  for (let i = 0; i <= total; i++) dist.push({ completed: i, students: distMap.get(i) || 0 });
  const pages = Math.max(1, Math.ceil(dist.length / DIST_PER_PAGE));
  distPage = Math.min(Math.max(1, distPage), pages);
  const start = (distPage - 1) * DIST_PER_PAGE;
  const pageRows = dist.slice(start, start + DIST_PER_PAGE);
  const maxStudents = Math.max(...dist.map((x) => x.students), 1);
  const rowsHtml = pageRows.map((x) => {
    const pct = Math.round((x.students / maxStudents) * 100);
    const all = total && x.completed === total ? ' <span class="dist-all">all</span>' : '';
    const label = x.completed === 0
      ? 'Solved 0 questions'
      : `Solved ${x.completed} question${x.completed > 1 ? 's' : ''}${all}`;
    const shareOfCohort = Math.round((x.students / d.studentCount) * 100);
    return `<button class="dist-row" data-count="${x.completed}" title="Click to list these students">
      <span class="dist-label">${label}</span>
      <span class="dist-bar"><span style="width:${pct}%"></span></span>
      <span class="dist-num">${x.students} <span class="hint">(${shareOfCohort}%)</span></span>
    </button>`;
  }).join('');
  const pager = pages > 1 ? `<div class="dist-pager">
      <button class="btn btn-sm btn-ghost dist-prev" ${distPage === 1 ? 'disabled' : ''}>‹ Prev</button>
      <span class="hint">${start + 1}–${Math.min(start + DIST_PER_PAGE, dist.length)} of ${dist.length}</span>
      <button class="btn btn-sm btn-ghost dist-next" ${distPage === pages ? 'disabled' : ''}>Next ›</button>
    </div>` : '';
  el.innerHTML = rowsHtml + pager;
  el.querySelectorAll('.dist-row').forEach((b) =>
    b.addEventListener('click', () => showCompleters(Number(b.dataset.count), d.studentCount)));
  const prev = el.querySelector('.dist-prev'), next = el.querySelector('.dist-next');
  if (prev) prev.addEventListener('click', () => { distPage--; renderCompletionDist(d); });
  if (next) next.addEventListener('click', () => { distPage++; renderCompletionDist(d); });
}

async function showCompleters(count, totalStudentsInCollege) {
  const cid = practiceCid();
  if (!cid) return;
  $('#drawerContent').innerHTML = '<p class="hint">Loading…</p>';
  openDrawer();
  let d;
  try {
    d = await api(`/colleges/${cid}/practice-completers?count=${count}`);
  } catch (e) {
    $('#drawerContent').innerHTML = '<p class="empty">Could not load that list.</p>';
    return;
  }
  const rawList = d.students || [];
  const total = rawList.length;
  const cohortTotal = totalStudentsInCollege || total;

  const depts = [...new Set(rawList.map((s) => s.department).filter(Boolean))].sort();
  const secs = [...new Set(rawList.map((s) => s.section).filter(Boolean))].sort();
  const campuses = [...new Set(rawList.map((s) => s.campus).filter(Boolean))].sort();

  const filterState = { q: '', dept: '', sec: '', campus: '', page: 1 };

  const head = `<h2 style="margin-top:0">${total} student${total === 1 ? '' : 's'} solved exactly ${count} question${count === 1 ? '' : 's'}</h2>`;

  const sharePct = cohortTotal ? Math.round((total / cohortTotal) * 100) : 0;
  const compStatHtml = cohortTotal > 0 ? `
    <div class="prob-stat-bar">
      <div class="prob-stat-track">
        <div class="prob-stat-fill comp" style="width:${sharePct}%" title="${total} students (${sharePct}%)"></div>
        <div class="prob-stat-fill notcomp" style="width:${100 - sharePct}%"></div>
      </div>
      <div class="prob-stat-labels">
        <span><b>${total}</b> of ${cohortTotal} students (${sharePct}% of cohort)</span>
        <span class="hint">Bucket: solved ${count}</span>
      </div>
    </div>` : '';

  const deptOpts = depts.length ? `<select id="comp_dept" class="drawer-filter-sel"><option value="">All depts</option>${depts.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>` : '';
  const secOpts = secs.length ? `<select id="comp_sec" class="drawer-filter-sel"><option value="">All sections</option>${secs.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>` : '';
  const campusOpts = campuses.length > 1 ? `<select id="comp_campus" class="drawer-filter-sel"><option value="">All campuses</option>${campuses.map((x) => `<option value="${esc(x)}">${esc(x)}</option>`).join('')}</select>` : '';

  const filterBar = total > 0 ? `
    <div class="drawer-filter-bar">
      <div class="drawer-filter-row">
        <input type="search" id="comp_q" class="drawer-filter-search" placeholder="Search name / username / reg no…" autocomplete="off" />
        ${deptOpts}
        ${secOpts}
        ${campusOpts}
      </div>
      <div class="drawer-filter-meta">
        <span id="comp_filter_count" class="hint"></span>
        <button type="button" id="comp_filter_clear" class="drawer-clear-btn" style="display:none">Clear filters</button>
      </div>
    </div>` : '';

  $('#drawerContent').innerHTML = `${head}${compStatHtml}${filterBar}<div id="comp_table_container"></div>`;

  function render() {
    const filtered = filterDrawerStudents(rawList, filterState);
    const isFiltered = Boolean(filterState.q || filterState.dept || filterState.sec || filterState.campus);

    const countEl = $('#comp_filter_count');
    if (countEl) {
      countEl.textContent = isFiltered
        ? `Showing ${filtered.length} of ${total} students`
        : `${total} student${total === 1 ? '' : 's'}`;
    }
    const clearBtn = $('#comp_filter_clear');
    if (clearBtn) clearBtn.style.display = isFiltered ? 'inline' : 'none';

    const tableWithPagerHtml = renderDrawerTablePage({
      idPrefix: 'comp-list',
      list: filtered,
      page: filterState.page,
      depts,
      campuses,
      emptyMsg: isFiltered ? 'No matching students found.' : 'No students in this bucket.'
    });

    const container = $('#comp_table_container');
    if (container) {
      container.innerHTML = tableWithPagerHtml;
      container.querySelectorAll('tr[data-id]').forEach((tr) =>
        tr.addEventListener('click', () => openStudent(tr.dataset.id)));

      const prevBtn = container.querySelector('.comp-list-prev');
      const nextBtn = container.querySelector('.comp-list-next');
      if (prevBtn) prevBtn.addEventListener('click', () => { filterState.page--; render(); });
      if (nextBtn) nextBtn.addEventListener('click', () => { filterState.page++; render(); });
    }
  }

  if (total > 0) {
    const qInput = $('#comp_q');
    if (qInput) qInput.addEventListener('input', (e) => { filterState.q = e.target.value; filterState.page = 1; render(); });
    const deptSel = $('#comp_dept');
    if (deptSel) deptSel.addEventListener('change', (e) => { filterState.dept = e.target.value; filterState.page = 1; render(); });
    const secSel = $('#comp_sec');
    if (secSel) secSel.addEventListener('change', (e) => { filterState.sec = e.target.value; filterState.page = 1; render(); });
    const campusSel = $('#comp_campus');
    if (campusSel) campusSel.addEventListener('change', (e) => { filterState.campus = e.target.value; filterState.page = 1; render(); });

    const clearBtn = $('#comp_filter_clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        filterState.q = ''; filterState.dept = ''; filterState.sec = ''; filterState.campus = '';
        filterState.page = 1;
        if (qInput) qInput.value = '';
        if (deptSel) deptSel.value = '';
        if (secSel) secSel.value = '';
        if (campusSel) campusSel.value = '';
        render();
      });
    }
  }

  render();
}

// ---- Reorder domains / topics (drag & drop) --------------------------------
let sortInstances = [];
function fillSortList(sel, names) {
  $(sel).innerHTML = (names && names.length)
    ? names.map((n) => `<div class="sort-item" data-name="${esc(n)}">⠿ ${esc(n)}</div>`).join('')
    : '<div class="hint">None yet</div>';
}
function bindReorderSortables() {
  sortInstances.forEach((s) => s.destroy());
  sortInstances = [];
  if (!window.Sortable) return;
  sortInstances.push(Sortable.create($('#domainOrderList'), { animation: 150, ghostClass: 'sortable-ghost', onEnd: () => saveOrder('domain', '#domainOrderList') }));
  sortInstances.push(Sortable.create($('#topicOrderList'), { animation: 150, ghostClass: 'sortable-ghost', onEnd: () => saveOrder('topic', '#topicOrderList') }));
}
function renderTopicReorder() {
  const dom = $('#reorderTopicDomain').value; // selected domain -> only its topics
  fillSortList('#topicOrderList', topicsForDomain(dom));
  bindReorderSortables();
}
function openReorderPanel() {
  const d = state.lastPractice;
  fillSortList('#domainOrderList', d && d.domains);
  const domains = (d && d.domains) || [];
  const tdSel = $('#reorderTopicDomain');
  const prev = tdSel.value;
  tdSel.innerHTML = domains.map((dn) => `<option value="${esc(dn)}">${esc(dn)}</option>`).join('');
  if (domains.includes(prev)) tdSel.value = prev; else if (domains.length) tdSel.value = domains[0];
  renderTopicReorder();
}
$('#reorderTopicDomain').addEventListener('change', renderTopicReorder);

async function saveOrder(kind, sel) {
  let names = [...$(sel).querySelectorAll('.sort-item')].map((el) => el.dataset.name);
  if (!names.length) return;
  // Topics are reordered within the selected domain — merge that new order back
  // into the full global topic order, keeping other domains' topics in place.
  if (kind === 'topic') {
    const full = (state.lastPractice && state.lastPractice.topics) || [];
    const inDomain = new Set(names);
    let di = 0;
    const merged = full.map((t) => (inDomain.has(t) ? names[di++] : t));
    for (const t of names) if (!full.includes(t)) merged.push(t); // any brand-new topic
    names = merged;
  }
  // Use the all-colleges endpoint when the box is checked OR when "All colleges" is the selected college.
  const all = $('#reorderAllColleges')?.checked || practiceCid() === '__all';
  const path = all ? '/practice-order/all-colleges' : `/colleges/${practiceCid()}/practice-order`;
  try {
    await api(path, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ kind, names }),
    });
    if (!all) loadPractice(); // refresh tabs/table in the new order (per-college only)
  } catch (e) { alert(e.message); }
}
$('#reorderToggle').addEventListener('click', () => {
  const p = $('#reorderPanel');
  const show = p.style.display === 'none';
  p.style.display = show ? 'block' : 'none';
  if (show) openReorderPanel();
});

// ---- Custom domain/topic dropdown (stays open until you pick or click away) -
const comboPop = document.createElement('div');
comboPop.className = 'combo-pop';
comboPop.style.display = 'none';
document.body.appendChild(comboPop);
let comboInput = null;

function renderCombo(options, filter) {
  const f = (filter || '').toLowerCase();
  // Coerce to string — some values (e.g. year "2027") may come through as numbers,
  // and number.toLowerCase() would throw and break the dropdown.
  const opts = (options || []).map((o) => String(o)).filter((o) => o.toLowerCase().includes(f));
  comboPop.innerHTML = opts.length
    ? opts.map((o) => `<div class="combo-item">${esc(o)}</div>`).join('')
    : '<div class="combo-empty">No matches — type to add a new one</div>';
}
function openCombo(input, options) {
  comboInput = input;
  const r = input.getBoundingClientRect();
  comboPop.style.left = r.left + 'px';
  comboPop.style.top = (r.bottom + 3) + 'px';
  comboPop.style.minWidth = r.width + 'px';
  renderCombo(options, input.value);
  comboPop.style.display = 'block';
}
function closeCombo() { comboPop.style.display = 'none'; comboInput = null; }

comboPop.addEventListener('mousedown', (e) => {
  const it = e.target.closest('.combo-item');
  if (it && comboInput) {
    e.preventDefault(); // stop the input from blurring/closing first
    comboInput.value = it.textContent;
    comboInput.dispatchEvent(new Event('input', { bubbles: true }));
    closeCombo();
  }
});
document.addEventListener('click', (e) => {
  if (comboInput && e.target !== comboInput && !comboPop.contains(e.target)) closeCombo();
});
window.addEventListener('resize', closeCombo);

function attachCombo(sel, getOptions) {
  const input = $(sel);
  if (!input) return;
  input.removeAttribute('list'); // replace native datalist with our dropdown
  const open = () => openCombo(input, getOptions());
  input.addEventListener('focus', open);
  input.addEventListener('click', open);
  input.addEventListener('input', () => { if (comboInput === input) renderCombo(getOptions(), input.value); });
}
const domainOpts = () => (state.lastPractice && state.lastPractice.domains) || [];
// Topics under the currently-selected domain only (all topics if no domain chosen).
function topicsForDomain(domainVal) {
  const d = (domainVal || '').trim();
  const allTopics = (state.lastPractice && state.lastPractice.topics) || [];
  if (!d) return allTopics;
  const probs = (state.lastPractice && state.lastPractice.problems) || [];
  const under = new Set();
  for (const p of probs) {
    if (((p.domain && p.domain.trim()) || '') === d && p.topic && p.topic.trim()) under.add(p.topic.trim());
  }
  return allTopics.filter((t) => under.has(t));
}
attachCombo('#singleDomain', domainOpts);
attachCombo('#singleTopic', () => topicsForDomain($('#singleDomain').value));
attachCombo('#practiceDomain', domainOpts);
attachCombo('#practiceTopic', () => topicsForDomain($('#practiceDomain').value));

// Single-student form: dept/section/year/campus dropdowns from the selected
// college's existing values (you can still type a new value).
state.ssOptions = { departments: [], batches: [], campuses: [], years: [] };
function ssCollegeId() {
  const name = $('#singleStudentCollege')?.value;
  const c = Object.values(state.collegesById || {}).find((x) => x.name === name);
  return c ? c.id : null;
}
async function loadSSOptions() {
  const id = ssCollegeId();
  if (!id) { state.ssOptions = { departments: [], batches: [], campuses: [], years: [] }; return; }
  try { state.ssOptions = await api(`/colleges/${id}/options`); } catch {}
}
attachCombo('#ssDept', () => state.ssOptions.departments || []);
attachCombo('#ssSection', () => state.ssOptions.batches || []);
attachCombo('#ssYear', () => state.ssOptions.years || []);
attachCombo('#ssCampus', () => state.ssOptions.campuses || []);
$('#singleStudentCollege')?.addEventListener('change', loadSSOptions);

// Add a single question (own link + topic + difficulty).
// Per-college "show video links to students" toggle.
function setVideoToggleLabel() {
  const b = $('#videoToggle');
  if (!b) return;
  b.textContent = state.showVideo ? '🎬 Videos: shown to students' : '🎬 Videos: hidden from students';
  b.classList.toggle('btn-primary', state.showVideo);
  b.classList.toggle('btn-ghost', !state.showVideo);
}
$('#videoToggle').addEventListener('click', async () => {
  const cid = practiceCid();
  if (!cid) return;
  if (cid === '__all') { alert('Pick a specific college to change its video visibility.'); return; }
  const next = !state.showVideo;
  try {
    await api(`/colleges/${cid}/video-visibility`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ show: next }),
    });
    state.showVideo = next;
    setVideoToggleLabel();
  } catch (e) { /* ignore; label stays */ }
});

// Generate/show the public questions-only link (reuses the college's share token).
$('#questionsLinkBtn').addEventListener('click', async () => {
  const cid = practiceCid();
  const out = $('#questionsLinkOut');
  if (!cid) { out.innerHTML = '<span class="msg err">Pick a college first.</span>'; return; }
  if (cid === '__all') { out.innerHTML = '<span class="msg err">Pick a specific college for its questions link.</span>'; return; }
  try {
    const r = await api(`/colleges/${cid}/view-link`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    });
    const url = location.origin + '/q/' + r.token;
    out.innerHTML = `<input class="search" style="flex:1;min-width:220px" readonly value="${esc(url)}" />
      <button class="btn btn-sm btn-ghost" id="qCopy">Copy</button>
      <a class="btn btn-sm btn-ghost" href="${esc(url)}" target="_blank">Open ↗</a>`;
    $('#qCopy').addEventListener('click', () => { navigator.clipboard?.writeText(url); $('#qCopy').textContent = 'Copied'; });
  } catch (e) { out.innerHTML = `<span class="msg err">${esc(e.message)}</span>`; }
});

$('#addSingleBtn').addEventListener('click', async () => {
  const link = $('#singleLink').value.trim();
  const domain = $('#singleDomain').value.trim();
  const topic = $('#singleTopic').value.trim();
  const difficulty = $('#singleDifficulty').value;
  const video = $('#singleVideo').value.trim();
  const dueDate = $('#singleDue').value;
  if (!practiceCid()) return setMsg('#singleMsg', 'Pick a college first.', 'err');
  if (!link) return setMsg('#singleMsg', 'Enter a LeetCode link or slug.', 'err');
  try {
    const r = await api(practiceAddPath(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ links: link, topic, domain, difficulty, video, dueDate }),
    });
    if (r.added) {
      setMsg('#singleMsg', practiceCid() === '__all' ? `Added to all ${r.colleges} colleges.` : `Added.`, 'ok', 5000);
      $('#singleLink').value = ''; $('#singleVideo').value = ''; // keep topic + difficulty for the next one
    } else {
      setMsg('#singleMsg', 'That link could not be parsed.', 'err');
    }
    loadPractice();
  } catch (e) { setMsg('#singleMsg', e.message, 'err'); }
});

// Remove ALL questions from the selected college.
$('#removeAllPracticeBtn').addEventListener('click', async () => {
  const cid = practiceCid();
  if (!cid) return;
  if (cid === '__all') { alert('Pick a specific college to clear its questions.'); return; }
  const cname = (state.collegesById && state.collegesById[cid] && state.collegesById[cid].name) || 'this college';
  if (!confirm(`Remove ALL practice questions from “${cname}”?\n\nThis deletes every assigned question and its completion records for this college. It cannot be undone.`)) return;
  try {
    const r = await api(`/colleges/${cid}/practice-all`, { method: 'DELETE' });
    setMsg('#practiceMsg', `Removed ${r.removed} question(s) from “${cname}”.`, 'ok', 5000);
    state.practiceSig = null;
    loadPractice();
  } catch (e) { setMsg('#practiceMsg', e.message, 'err'); }
});

$('#addPracticeBtn').addEventListener('click', async () => {
  const links = $('#practiceLinks').value;
  const videos = $('#practiceVideos').value;
  const domain = $('#practiceDomain').value.trim();
  const topic = $('#practiceTopic').value.trim();
  const difficulty = $('#practiceDifficulty').value;
  const dueDate = $('#practiceDue').value;
  if (!practiceCid()) return setMsg('#practiceMsg', 'Pick a college first.', 'err');
  if (!links.trim()) return setMsg('#practiceMsg', 'Paste at least one link.', 'err');
  try {
    const r = await api(practiceAddPath(), {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ links, videos, topic, domain, difficulty, dueDate }),
    });
    setMsg('#practiceMsg', practiceAddSummary(r, topic), 'ok', 9000);
    $('#practiceLinks').value = ''; $('#practiceVideos').value = '';
    loadPractice();
  } catch (e) { setMsg('#practiceMsg', e.message, 'err'); }
});

$('#practiceFile').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file || !practiceCid()) return;
  const fd = new FormData();
  fd.append('file', file);
  const topic = $('#practiceTopic').value.trim();
  const domain = $('#practiceDomain').value.trim();
  const difficulty = $('#practiceDifficulty').value;
  if (topic) fd.append('topic', topic); // fallbacks for rows missing these columns
  if (domain) fd.append('domain', domain);
  if (difficulty) fd.append('difficulty', difficulty);
  setMsg('#practiceMsg', 'Uploading…', '');
  try {
    const r = await api(practiceAddPath(), { method: 'POST', body: fd });
    setMsg('#practiceMsg', practiceAddSummary(r, topic, true), 'ok', 12000);
    loadPractice();
  } catch (err) { setMsg('#practiceMsg', err.message, 'err'); }
  e.target.value = '';
});

// Build a clear result summary: how many added, to which college(s), how many skipped.
function practiceAddSummary(r, topic, fromFile) {
  const cid = practiceCid();
  const scope = cid === '__all'
    ? `all ${r.colleges} colleges`
    : `“${(state.collegesById && state.collegesById[cid] && state.collegesById[cid].name) || 'this college'}”`;
  const skipped = (r.skipped && r.skipped.length) || 0;
  const total = r.added + skipped;
  let msg = `✅ Added ${r.added}${skipped ? ' of ' + total : ''} question(s)${fromFile ? ' from the sheet' : ''} to ${scope}`;
  if (topic) msg += ` under “${topic}”`;
  msg += '.';
  if (skipped) msg += `\n⚠ Skipped ${skipped} row(s) — couldn’t read a valid LeetCode link.`;
  return msg;
}

// ---- Upload tab -------------------------------------------------------------
$('#uploadBtn').addEventListener('click', async () => {
  const college = $('#uploadCollege').value.trim();
  const file = $('#rosterFile').files[0];
  if (!college) return setMsg('#uploadResult', 'Enter a college name.', 'err');
  if (!file) return setMsg('#uploadResult', 'Choose an Excel file.', 'err');
  const fd = new FormData(); fd.append('college', college); fd.append('file', file);
  setMsg('#uploadResult', 'Uploading…', '');
  try {
    const r = await api('/upload', { method: 'POST', body: fd });
    let msg = `Added/updated ${r.added} of ${r.total} students for "${r.college.name}".`;
    if (r.skipped.length) msg += `\nSkipped ${r.skipped.length} row(s): ` + r.skipped.map((s) => `row ${s.row} (${s.reason})`).join(', ');
    msg += `\nStarting LeetCode sync in the background…`;
    setMsg('#uploadResult', msg, 'ok');
    state.collegeId = r.college.id;
    resetDash();
    await api(`/colleges/${r.college.id}/sync`, { method: 'POST' });
    pollSync();
    await loadColleges();
  } catch (e) { setMsg('#uploadResult', e.message, 'err'); }
});

// Add a single student individually.
$('#addStudentBtn').addEventListener('click', async () => {
  const college = $('#singleStudentCollege').value.trim();
  const name = $('#ssName').value.trim();
  const url = $('#ssUrl').value.trim();
  if (!college) return setMsg('#addStudentMsg', 'Pick a college.', 'err');
  if (!name) return setMsg('#addStudentMsg', 'Enter the student name.', 'err');
  if (!url) return setMsg('#addStudentMsg', 'Enter the LeetCode profile.', 'err');
  const body = {
    college, name, url,
    register_number: $('#ssReg').value.trim(),
    email: $('#ssEmail').value.trim(),
    department: $('#ssDept').value.trim(),
    section: $('#ssSection').value.trim(),
    year: $('#ssYear').value.trim(),
    campus: $('#ssCampus').value.trim(),
  };
  setMsg('#addStudentMsg', 'Adding…', '');
  try {
    const r = await api('/students', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    setMsg('#addStudentMsg', `Added @${r.username}. Syncing…`, 'ok', 5000);
    // clear the per-student fields, keep college for the next add
    ['#ssName', '#ssUrl', '#ssReg', '#ssEmail'].forEach((s) => { $(s).value = ''; });
    if (r.id) { try { await api(`/students/${r.id}/sync`, { method: 'POST' }); } catch {} }
    await loadColleges();
  } catch (e) { setMsg('#addStudentMsg', e.message, 'err'); }
});

// ---- Sync button + polling --------------------------------------------------
$('#syncCollegeBtn').addEventListener('click', async () => {
  if (!state.collegeId) return;
  await api(`/colleges/${state.collegeId}/sync`, { method: 'POST' });
  pollSync();
});

let pollTimer = null;
function pollSync() {
  clearInterval(pollTimer);
  $('#syncStatus').textContent = 'syncing…';
  pollTimer = setInterval(async () => {
    const st = await api('/sync/state');
    if (st.running) {
      $('#syncStatus').textContent = 'syncing…';
    } else {
      clearInterval(pollTimer);
      $('#syncStatus').textContent = st.lastRun
        ? `synced ${st.lastRun.ok}/${st.lastRun.students}` + (st.lastRun.newCompletions ? `, +${st.lastRun.newCompletions} completions` : '')
        : '';
      loadColleges();
      if ($('#tab-practice').classList.contains('active')) loadPractice();
    }
  }, 2500);
}

// ---- helpers ----------------------------------------------------------------
function setMsg(sel, text, cls, autoMs) {
  const el = $(sel);
  el.textContent = text;
  el.className = 'msg ' + (cls || '');
  if (el._clearTimer) clearTimeout(el._clearTimer);
  if (autoMs) el._clearTimer = setTimeout(() => { el.textContent = ''; el.className = 'msg'; }, autoMs);
}
function esc(s) { return String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

// ---- Inline YouTube player -------------------------------------------------
function ytEmbed(url) {
  if (!url) return null;
  let id = null;
  try {
    const u = new URL(url, location.href);
    if (u.hostname.includes('youtu.be')) id = u.pathname.slice(1);
    else if (u.searchParams.get('v')) id = u.searchParams.get('v');
    else if (u.pathname.includes('/embed/')) id = u.pathname.split('/embed/')[1];
    else if (u.pathname.includes('/shorts/')) id = u.pathname.split('/shorts/')[1];
  } catch {}
  if (!id) return null;
  id = id.split(/[/?&]/)[0];
  return 'https://www.youtube.com/embed/' + encodeURIComponent(id) + '?autoplay=1&rel=0';
}
function openVideoModal(url) {
  const embed = ytEmbed(url);
  if (!embed) { window.open(url, '_blank', 'noopener'); return; }
  let m = document.getElementById('videoModal');
  if (!m) {
    m = document.createElement('div');
    m.id = 'videoModal'; m.className = 'video-modal';
    m.innerHTML = '<div class="video-modal-inner"><button class="video-modal-close" aria-label="Close">✕</button><div class="video-frame"></div></div>';
    document.body.appendChild(m);
    m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('.video-modal-close')) closeVideoModal(); });
  }
  m.querySelector('.video-frame').innerHTML = `<iframe src="${embed}" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>`;
  m.classList.add('open');
}
function closeVideoModal() {
  const m = document.getElementById('videoModal');
  if (m) { m.querySelector('.video-frame').innerHTML = ''; m.classList.remove('open'); }
}
document.addEventListener('click', (e) => {
  const v = e.target.closest('[data-video]');
  if (v) { e.preventDefault(); openVideoModal(v.getAttribute('data-video')); }
});
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeVideoModal(); });

// Progress since first tracked. `gain` for solved counts (up is good),
// `rankDelta` for global rank (a smaller number is better).
function gain(current, baseline) {
  if (baseline == null || current == null) return '';
  const d = current - baseline;
  if (d > 0) return ` <span class="delta" title="since first tracked">+${d}</span>`;
  if (d < 0) return ` <span class="delta down">${d}</span>`;
  return '';
}
function rankDelta(s) {
  if (s.baseline_ranking == null || s.ranking == null) return '';
  const d = s.baseline_ranking - s.ranking; // positive => rank improved
  if (d > 0) return ` <span class="delta" title="rank improved since first tracked">▲${Math.abs(d).toLocaleString()}</span>`;
  if (d < 0) return ` <span class="delta down" title="rank dropped">▼${Math.abs(d).toLocaleString()}</span>`;
  return '';
}

// "Started at … → now" comparison shown in the student drawer.
function progressBlock(s) {
  if (s.baseline_at == null) return '';
  const row = (label, base, cur, isRank) => {
    let delta = '';
    if (base != null && cur != null) {
      if (isRank) delta = rankDelta({ baseline_ranking: base, ranking: cur });
      else delta = gain(cur, base);
    }
    const fmt = (v) => v == null ? '—' : (isRank ? '#' + Number(v).toLocaleString() : v);
    return `<tr><td>${label}</td><td>${fmt(base)}</td><td>${fmt(cur)}</td><td>${delta || '—'}</td></tr>`;
  };
  return `<h2 style="margin-top:18px">Progress since first tracked <span class="hint">(${fmtAgo(s.baseline_at)})</span>
      <button class="btn btn-sm btn-ghost reset-baseline" data-id="${s.id}" title="Re-anchor progress to current stats" style="float:right">Reset baseline</button></h2>
    <table><thead><tr><th>Metric</th><th>Started</th><th>Now</th><th>Change</th></tr></thead><tbody>
      ${row('Global rank', s.baseline_ranking, s.ranking, true)}
      ${row('Easy', s.baseline_easy, s.solved_easy)}
      ${row('Medium', s.baseline_medium, s.solved_medium)}
      ${row('Hard', s.baseline_hard, s.solved_hard)}
      ${row('Total', s.baseline_total, s.solved_total)}
    </tbody></table>`;
}
function fmtAgo(iso) {
  if (!iso) return 'never';
  const t = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return Math.floor(s / 60) + 'm ago';
  if (s < 86400) return Math.floor(s / 3600) + 'h ago';
  return Math.floor(s / 86400) + 'd ago';
}

// ---- Admin login gate -------------------------------------------------------
function showAdminLogin() {
  try { localStorage.removeItem('lc_admin_token'); } catch {}
  $('#adminLogin').classList.add('show');
  $('#adminLogout').style.display = 'none';
  setTimeout(() => $('#adminUser').focus(), 50);
}
async function adminLogin() {
  const username = $('#adminUser').value.trim();
  const password = $('#adminPass').value;
  if (!username || !password) return setMsg('#adminLoginMsg', 'Enter your username and password.', 'err');
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }),
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.error || 'Login failed');
    if (d.token) { try { localStorage.setItem('lc_admin_token', d.token); } catch {} }
    $('#adminLogin').classList.remove('show');
    $('#adminPass').value = '';
    $('#adminUser').value = '';
    $('#adminLogout').style.display = 'inline-block';
    loadColleges();
  } catch (e) { setMsg('#adminLoginMsg', e.message, 'err'); }
}
$('#adminLoginBtn').addEventListener('click', adminLogin);
$('#adminUser').addEventListener('keydown', (e) => { if (e.key === 'Enter') adminLogin(); });
$('#adminPass').addEventListener('keydown', (e) => { if (e.key === 'Enter') adminLogin(); });
$('#adminLogout').addEventListener('click', async () => {
  try { await fetch('/api/admin/logout', { method: 'POST', headers: { 'x-admin-token': adminToken() } }); } catch {}
  showAdminLogin();
});

(async function boot() {
  let authRequired = false;
  try { authRequired = (await fetch('/api/admin/status').then((r) => r.json())).authRequired; } catch {}
  // Show which DB is actually live (Supabase vs local SQLite).
  try {
    const m = await fetch('/api/meta').then((r) => r.json());
    const el = $('#dbDriver');
    if (el) { el.textContent = 'DB: ' + m.driver; el.classList.add(m.driverKey === 'supabase' ? 'ok' : 'warn'); }
  } catch {}
  if (authRequired && !adminToken()) { showAdminLogin(); return; }
  if (authRequired) $('#adminLogout').style.display = 'inline-block';
  loadColleges();
})();

// ---- Per-college auto-refresh gating ---------------------------------------
// The browser auto-refresh follows the *selected college's* refresh setting
// (configured in the Colleges tab, evaluated against the browser's local time).
function windowActiveNow(from, to) {
  if (!from || !to) return true;
  const cur = new Date().toTimeString().slice(0, 5);
  return from <= to ? (cur >= from && cur < to) : (cur >= from || cur < to);
}
function refreshActiveFor(collegeId) {
  const c = state.collegesById && state.collegesById[collegeId];
  if (!c) return true; // unknown -> default to refreshing
  const mode = c.refresh_mode || 'on';
  if (mode === 'off') return false;
  if (mode === 'scheduled') return windowActiveNow(c.refresh_from, c.refresh_to);
  return true;
}

// Auto-refresh the admin view every 2s so scheduler/extension updates show up
// without a manual reload. This only re-reads the database (no LeetCode calls).
setInterval(() => {
  if (document.hidden) return;                              // tab not visible
  if ($('#adminLogin').classList.contains('show')) return;  // not logged in
  if ($('#drawer').classList.contains('open')) return;      // don't disrupt an open student drawer
  const active = document.querySelector('.tab.active')?.dataset.tab;
  if (active === 'dashboard') { if (refreshActiveFor(state.collegeId)) loadDashboard({ chart: false }).catch(() => {}); }
  else if (active === 'practice') { if (refreshActiveFor(practiceCid())) loadPractice().catch(() => {}); }
}, 2000);

// Refresh the monthly chart on a slower cadence (it's cached server-side, and
// the data only changes on sync). Keeps it accurate without blocking anything.
setInterval(() => {
  if (document.hidden) return;
  if ($('#adminLogin').classList.contains('show')) return;
  if (document.querySelector('.tab.active')?.dataset.tab !== 'dashboard') return;
  if (!refreshActiveFor(state.collegeId)) return;
  loadMonthly().catch(() => {});
}, 20000);
