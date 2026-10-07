const $ = (s) => document.querySelector(s);
const token = decodeURIComponent(location.pathname.split('/view/')[1] || '').replace(/\/+$/, '');

const ic = {
  edit: `<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>`,
};

let chart = null, drawerChart = null, lastMonthlySig = null, filtersLoaded = false;
let lastData = null, viewPracticeDomain = '__all';
const collapsedDomains = new Set(); // folded domains in the practice list
const collapsedTopics = new Set(); // folded topics (keyed by domain|topic)
const dash = { batch: '', department: '', campus: '', q: '', risk: false, page: 1, pageSize: 100, total: 0 };

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
window.__onTheme = () => { lcChartTheme(); recolorChart(chart); recolorChart(drawerChart); };

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

function tableSkeletonHtml(cols = 7, rows = 6) {
  return Array.from({ length: rows }, () => `
    <tr class="skeleton-row">
      ${Array.from({ length: cols }, (_, i) => `
        <td><div class="skeleton-cell skeleton-w-${(i % 3) + 1}"></div></td>
      `).join('')}
    </tr>
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
  return fetch('/api' + path, opts)
    .then(async (r) => {
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || ('HTTP ' + r.status));
      return d;
    })
    .finally(() => {
      pendingRequests--;
      hideGlobalLoader();
    });
};
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

// progress helpers (same logic as admin)
function gain(cur, base) {
  if (base == null || cur == null) return '';
  const d = cur - base;
  if (d > 0) return ` <span class="delta">+${d}</span>`;
  if (d < 0) return ` <span class="delta down">${d}</span>`;
  return '';
}
function rankDelta(s) {
  if (s.baseline_ranking == null || s.ranking == null) return '';
  const d = s.baseline_ranking - s.ranking;
  if (d > 0) return ` <span class="delta">▲${Math.abs(d).toLocaleString()}</span>`;
  if (d < 0) return ` <span class="delta down">▼${Math.abs(d).toLocaleString()}</span>`;
  return '';
}

async function load(opts = {}) {
  let d;
  try {
    const params = {
      batch: dash.batch, department: dash.department, campus: dash.campus, q: dash.q,
      risk: dash.risk ? '1' : '',
      page: String(dash.page), pageSize: String(dash.pageSize),
    };
    if (opts.chart === false) params.light = '1'; // auto-refresh: skip monthly/filter queries
    const qs = new URLSearchParams(params);
    d = await api(`/view/${encodeURIComponent(token)}?${qs}`);
  } catch (e) {
    const vLoad = $('#viewLoading');
    if (vLoad) vLoad.style.display = 'none';
    $('#content').style.display = 'none';
    const err = $('#error');
    err.style.display = 'block';
    err.innerHTML = `<h2 style="margin:0 0 6px">Link not available</h2><p class="hint" style="margin:0">${esc(e.message)}</p>`;
    return;
  }
  render(d, opts);
}

function render(d, opts) {
  lastData = d;
  document.title = `${d.college.name} — Progress`;
  $('#collegeName').textContent = d.college.name;
  const vLoad = $('#viewLoading');
  if (vLoad) vLoad.style.display = 'none';
  $('#error').style.display = 'none';
  $('#content').style.display = 'block';
  dash.total = d.total;

  const filtered = dash.batch || dash.department || dash.campus || dash.q;
  $('#cards').innerHTML = `
    <div class="card"><div class="v">${d.totals.students}</div><div class="l">${filtered ? 'Students (filtered)' : 'Students'}</div></div>
    <div class="card"><div class="v">${d.totals.total}</div><div class="l">Total solved</div></div>
    <div class="card easy"><div class="v">${d.totals.easy}</div><div class="l">Easy</div></div>
    <div class="card medium"><div class="v">${d.totals.medium}</div><div class="l">Medium</div></div>
    <div class="card hard"><div class="v">${d.totals.hard}</div><div class="l">Hard</div></div>
    <div class="card"><div class="v">${d.practiceTotal}</div><div class="l">Practice problems</div></div>`;

  const sig = JSON.stringify(d.monthly);
  if (opts.chart !== false && sig !== lastMonthlySig) {
    if (chart) chart.destroy();
    chart = new Chart($('#monthly'), {
      type: 'bar',
      data: { labels: d.monthly.map((m) => m.ym), datasets: [{ data: d.monthly.map((m) => m.submissions), backgroundColor: '#ffa116' }] },
      options: { plugins: { legend: { display: false } }, scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true } } },
    });
    lastMonthlySig = sig;
  }

  if (!filtersLoaded && d.filters) { populateFilters(d.filters); filtersLoaded = true; }
  renderStudents(d.students);
  renderPager();
  renderPractice(d);
}

function fillSel(sel, allLabel, opts, cur) {
  const el = $(sel);
  el.innerHTML = `<option value="">${allLabel}</option>` + opts.map((o) => `<option value="${esc(o)}">${esc(o)}</option>`).join('');
  el.value = opts.includes(cur) ? cur : '';
}
function populateFilters(f) {
  if (!f.campuses.includes(dash.campus)) dash.campus = '';
  if (!f.departments.includes(dash.department)) dash.department = '';
  if (!f.batches.includes(dash.batch)) dash.batch = '';
  fillSel('#filterCampus', 'All campuses', f.campuses, dash.campus);
  fillSel('#filterDept', 'All departments', f.departments, dash.department);
  fillSel('#filterBatch', 'All batches', f.batches, dash.batch);
}
function renderPager() {
  const { page, pageSize, total } = dash;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  $('#pageInfo').textContent = `${total === 0 ? 0 : (page - 1) * pageSize + 1}–${Math.min(total, page * pageSize)} of ${total}`;
  $('#prevPage').disabled = page <= 1;
  $('#nextPage').disabled = page >= pages;
}

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
  const sig = JSON.stringify(students.map((s) => [s.id, s.classRank, s.name, s.username, s.section,
    s.department, s.found, s.ranking, s.baseline_ranking, s.solved_easy, s.solved_medium, s.solved_hard,
    s.solved_total, s.baseline_total, s.practiceCompleted, s.practiceTotal, s.at_risk]));
  if (sig === renderStudents._sig) return; // skip rebuild when unchanged
  renderStudents._sig = sig;
  const tbody = $('#studentTable').querySelector('tbody');
  if (!students.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="empty">No students match.</td></tr>';
    return;
  }
  tbody.innerHTML = students.map((s) => `
    <tr data-id="${s.id}" style="cursor:pointer">
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
      <td>
        <div class="row" style="margin:0;gap:4px;justify-content:flex-end;flex-wrap:nowrap">
          <button class="btn btn-sm btn-ghost edit-student-btn" data-id="${s.id}" title="Edit student data">${ic.edit}</button>
        </div>
      </td>
    </tr>`).join('');
  tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
    tr.addEventListener('click', (e) => {
      if (e.target.closest('.edit-student-btn')) return;
      openStudent(tr.dataset.id);
    });
  });
  tbody.querySelectorAll('.edit-student-btn').forEach((b) => {
    b.addEventListener('click', (e) => {
      e.stopPropagation();
      openEditStudentModal(b.dataset.id);
    });
  });
}

function renderPractice(d) {
  const sig = JSON.stringify([d.studentCount, d.domainOrder, d.topicOrder, viewPracticeDomain,
    [...collapsedDomains], [...collapsedTopics], d.practice.map((p) => [p.id, p.title, p.difficulty, p.topic, p.domain, p.completedCount, p.video_url, p.due_date])]);
  if (sig === renderPractice._sig) return; // skip rebuild when unchanged
  renderPractice._sig = sig;
  renderViewDist(d);
  const tbody = $('#practiceTable').querySelector('tbody');
  const tabsEl = $('#practiceDomainTabs');
  if (!d.practice.length) {
    tabsEl.innerHTML = '';
    tbody.innerHTML = '<tr><td colspan="4" class="empty">No practice problems assigned.</td></tr>';
    return;
  }
  const dom = (p) => (p.domain && p.domain.trim()) || 'Uncategorized';
  const top = (p) => (p.topic && p.topic.trim()) || 'Uncategorized';
  const mkCmp = (arr) => {
    const idx = new Map((arr || []).map((n, i) => [n, i]));
    return (a, b) => {
      if (a === 'Uncategorized') return 1;
      if (b === 'Uncategorized') return -1;
      const ia = idx.has(a) ? idx.get(a) : 1e9, ib = idx.has(b) ? idx.get(b) : 1e9;
      return ia - ib || a.localeCompare(b);
    };
  };
  const domCmp = mkCmp(d.domainOrder), topCmp = mkCmp(d.topicOrder);
  const row = (p) => {
    const pct = d.studentCount ? Math.round((p.completedCount / d.studentCount) * 100) : 0;
    return `<tr>
      <td><a href="${esc(p.url)}" target="_blank" rel="noopener">${esc(p.title)}</a>${p.video_url ? ` <button class="vid-link" data-video="${esc(p.video_url)}" title="YouTube video">▶ video</button>` : ''}${p.due_date ? ` <span class="due-pill${p.due_date < new Date().toISOString().slice(0,10) ? ' overdue' : ''}">⏰ ${esc(p.due_date)}</span>` : ''}</td>
      <td>${p.difficulty ? `<span class="pill ${(p.difficulty || '').toLowerCase()}">${esc(p.difficulty)}</span>` : '—'}</td>
      <td class="prog-cell" data-pid="${p.id}" data-title="${esc(p.title)}" style="cursor:pointer" title="Click to see who completed / didn't">${p.completedCount}/${d.studentCount}</td>
      <td class="prog-cell" data-pid="${p.id}" data-title="${esc(p.title)}" style="cursor:pointer" title="Click to see who completed / didn't"><span class="progress"><span style="width:${pct}%"></span></span> ${pct}%</td></tr>`;
  };
  const topicRows = (probs) => {
    const groups = {};
    for (const p of probs) (groups[top(p)] ||= []).push(p);
    return Object.keys(groups).sort(topCmp).map((t) => {
      const g = groups[t];
      const key = dom(g[0]) + '|' + t;
      const collapsed = collapsedTopics.has(key);
      const head = `<tr class="topic-foldrow" data-topic="${esc(key)}"><td colspan="4" style="background:var(--panel-2);font-weight:600;padding-left:18px;cursor:pointer">${collapsed ? '▸' : '▾'} ${esc(t)} <span style="color:var(--muted);font-weight:400">· ${g.length}</span></td></tr>`;
      return head + (collapsed ? '' : g.map(row).join(''));
    }).join('');
  };
  const wireTopicFold = () => tbody.querySelectorAll('.topic-foldrow').forEach((r) => r.addEventListener('click', () => {
    const k = r.dataset.topic;
    collapsedTopics.has(k) ? collapsedTopics.delete(k) : collapsedTopics.add(k);
    if (lastData) renderPractice(lastData);
  }));
  const wireProgCells = () => tbody.querySelectorAll('.prog-cell').forEach((c) => c.addEventListener('click', () =>
    showProblemCompletion(Number(c.dataset.pid), c.dataset.title)));
  const domGroups = {};
  for (const p of d.practice) (domGroups[dom(p)] ||= []).push(p);
  const domNames = Object.keys(domGroups).sort(domCmp);

  // No domains assigned -> plain topic grouping, no tabs.
  if (domNames.length === 1 && domNames[0] === 'Uncategorized') {
    tabsEl.innerHTML = '';
    tbody.innerHTML = topicRows(d.practice);
    wireTopicFold();
    wireProgCells();
    return;
  }

  // Domain tabs (All + one per domain).
  if (viewPracticeDomain !== '__all' && !domNames.includes(viewPracticeDomain)) viewPracticeDomain = '__all';
  const sel = viewPracticeDomain;
  tabsEl.innerHTML =
    `<button class="dom-tab ${sel === '__all' ? 'active' : ''}" data-dom="__all">All</button>` +
    domNames.map((dn) => `<button class="dom-tab ${sel === dn ? 'active' : ''}" data-dom="${esc(dn)}">${esc(dn)}</button>`).join('');
  tabsEl.querySelectorAll('.dom-tab').forEach((b) => b.addEventListener('click', () => {
    viewPracticeDomain = b.dataset.dom;
    if (lastData) renderPractice(lastData);
  }));

  tbody.innerHTML = sel === '__all'
    ? domNames.map((dn) => {
        const collapsed = collapsedDomains.has(dn);
        const head = `<tr class="dom-foldrow" data-dom="${esc(dn)}"><td colspan="4" style="background:var(--accent);color:#1a1300;font-weight:700;cursor:pointer">${collapsed ? '▸' : '▾'} ${esc(dn)} <span style="font-weight:400">· ${domGroups[dn].length}</span></td></tr>`;
        return head + (collapsed ? '' : topicRows(domGroups[dn]));
      }).join('')
    : topicRows(domGroups[sel]);

  tbody.querySelectorAll('.dom-foldrow').forEach((r) => r.addEventListener('click', () => {
    const dn = r.dataset.dom;
    collapsedDomains.has(dn) ? collapsedDomains.delete(dn) : collapsedDomains.add(dn);
    if (lastData) renderPractice(lastData);
  }));
  wireTopicFold();
  wireProgCells();
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

// Who completed / didn't complete one problem (read-only drawer with search, filters & pagination).
async function showProblemCompletion(problemId, title) {
  $('#drawerContent').innerHTML = '<p class="hint">Loading…</p>';
  $('#drawer').classList.add('open');
  $('#drawerBackdrop').classList.add('show');
  let d;
  try { d = await api(`/view/${encodeURIComponent(token)}/practice/${problemId}/completion`); }
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

// ---- read-only student drawer ----------------------------------------------
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
      <h2 style="margin:0">Practice problems</h2>
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
            ${options.isAdmin ? '<th style="width:85px;text-align:right">Action</th>' : ''}
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
  $('#drawer').classList.add('open');
  $('#drawerBackdrop').classList.add('show');

  let d;
  try {
    d = await api(`/view/${encodeURIComponent(token)}/student/${id}`);
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
    ${(s.register_number || s.section || s.department || s.campus || s.year) ? `<p class="hint" style="line-height:1.7">
      ${s.register_number ? `Reg: <b>${esc(s.register_number)}</b> · ` : ''}${s.section ? `Batch: <b>${esc(s.section)}</b> · ` : ''}${s.department ? `${esc(s.department)} · ` : ''}${s.campus ? esc(s.campus) : ''}${s.year ? ` · ${esc(s.year)}` : ''}</p>` : ''}
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
      <tbody>${growth.map((g) => `<tr><td>${g.ym}</td><td>${g.easy}</td><td>${g.medium}</td><td>${g.hard}</td><td><b>${g.total}</b></td></tr>`).join('')}</tbody></table>` : ''}
    <div id="stuPracticeContainer"></div>`;

  const ed = $('#drawerContent').querySelector('.edit-student-from-drawer');
  if (ed) ed.addEventListener('click', () => {
    openEditStudentModal(ed.dataset.id);
  });

  renderStudentPracticeSection($('#stuPracticeContainer'), d.practice || [], { isAdmin: false });

  const m = d.monthlyActivity || [];
  if (drawerChart) drawerChart.destroy();
  if ($('#drawerMonthly')) {
    drawerChart = new Chart($('#drawerMonthly'), {
      type: 'line',
      data: { labels: m.map((x) => x.ym), datasets: [{ data: m.map((x) => x.submissions), borderColor: '#ffa116', backgroundColor: 'rgba(255,161,22,.15)', fill: true, tension: .3 }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } },
    });
  }
}
function progressBlock(s) {
  if (s.baseline_at == null) return '';
  const r = (label, base, cur, isRank) => {
    let delta = '—';
    if (base != null && cur != null) delta = (isRank ? rankDelta({ baseline_ranking: base, ranking: cur }) : gain(cur, base)) || '—';
    const fmt = (v) => v == null ? '—' : (isRank ? '#' + Number(v).toLocaleString() : v);
    return `<tr><td>${label}</td><td>${fmt(base)}</td><td>${fmt(cur)}</td><td>${delta}</td></tr>`;
  };
  return `<h2 style="margin-top:18px">Progress since first tracked <span class="hint">(${esc(String(s.baseline_at).slice(0, 10))})</span></h2>
    <table><thead><tr><th>Metric</th><th>Started</th><th>Now</th><th>Change</th></tr></thead><tbody>
      ${r('Global rank', s.baseline_ranking, s.ranking, true)}
      ${r('Easy', s.baseline_easy, s.solved_easy)}
      ${r('Medium', s.baseline_medium, s.solved_medium)}
      ${r('Hard', s.baseline_hard, s.solved_hard)}
      ${r('Total', s.baseline_total, s.solved_total)}
    </tbody></table>`;
}
// ---- Completion breakdown (read-only, paginated 10/page) -------------------
let viewDistPage = 1;
const VIEW_DIST_PER_PAGE = 10;
function renderViewDist(d) {
  const el = $('#completionDist');
  if (!el) return;
  const total = (d.practice || []).length;
  if (!d.studentCount) {
    el.innerHTML = '<p class="hint" style="margin:0">No students yet.</p>';
    return;
  }
  // One row per level 0..total so pagination spans every 10 questions.
  const distMap = new Map((d.completionDist || []).map((x) => [x.completed, x.students]));
  const dist = [];
  for (let i = 0; i <= total; i++) dist.push({ completed: i, students: distMap.get(i) || 0 });
  const pages = Math.max(1, Math.ceil(dist.length / VIEW_DIST_PER_PAGE));
  viewDistPage = Math.min(Math.max(1, viewDistPage), pages);
  const start = (viewDistPage - 1) * VIEW_DIST_PER_PAGE;
  const pageRows = dist.slice(start, start + VIEW_DIST_PER_PAGE);
  const maxStudents = Math.max(...dist.map((x) => x.students), 1);
  const rowsHtml = pageRows.map((x) => {
    const pct = Math.round((x.students / maxStudents) * 100);
    const all = total && x.completed === total ? ' <span class="dist-all">all</span>' : '';
    const label = x.completed === 0
      ? 'Solved 0 questions'
      : `Solved ${x.completed} question${x.completed > 1 ? 's' : ''}${all}`;
    const share = Math.round((x.students / d.studentCount) * 100);
    return `<button class="dist-row" data-count="${x.completed}" title="Click to list these students">
      <span class="dist-label">${label}</span>
      <span class="dist-bar"><span style="width:${pct}%"></span></span>
      <span class="dist-num">${x.students} <span class="hint">(${share}%)</span></span>
    </button>`;
  }).join('');
  const pager = pages > 1 ? `<div class="dist-pager">
      <button class="btn btn-sm btn-ghost dist-prev" ${viewDistPage === 1 ? 'disabled' : ''}>‹ Prev</button>
      <span class="hint">${start + 1}–${Math.min(start + VIEW_DIST_PER_PAGE, dist.length)} of ${dist.length}</span>
      <button class="btn btn-sm btn-ghost dist-next" ${viewDistPage === pages ? 'disabled' : ''}>Next ›</button>
    </div>` : '';
  el.innerHTML = rowsHtml + pager;
  el.querySelectorAll('.dist-row').forEach((b) =>
    b.addEventListener('click', () => showViewCompleters(Number(b.dataset.count), d.studentCount)));
  const prev = el.querySelector('.dist-prev'), next = el.querySelector('.dist-next');
  if (prev) prev.addEventListener('click', () => { viewDistPage--; renderViewDist(d); });
  if (next) next.addEventListener('click', () => { viewDistPage++; renderViewDist(d); });
}

async function showViewCompleters(count, totalStudentsInCollege) {
  $('#drawerContent').innerHTML = '<p class="hint">Loading…</p>';
  $('#drawer').classList.add('open');
  $('#drawerBackdrop').classList.add('show');
  let d;
  try {
    d = await api(`/view/${encodeURIComponent(token)}/practice-completers?count=${count}`);
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

function closeDrawer() { $('#drawer').classList.remove('open'); $('#drawerBackdrop').classList.remove('show'); }
$('#drawerClose').addEventListener('click', closeDrawer);
$('#drawerBackdrop').addEventListener('click', closeDrawer);

// ---- filters / pager / search ----------------------------------------------
$('#riskToggle').addEventListener('click', () => {
  dash.risk = !dash.risk;
  dash.page = 1;
  $('#riskToggle').classList.toggle('btn-primary', dash.risk);
  $('#riskToggle').classList.toggle('btn-ghost', !dash.risk);
  renderStudents._sig = null; // force repaint
  load();
});
$('#filterBatch').addEventListener('change', (e) => { dash.batch = e.target.value; dash.page = 1; load(); });
$('#filterDept').addEventListener('change', (e) => { dash.department = e.target.value; dash.page = 1; load(); });
$('#filterCampus').addEventListener('change', (e) => { dash.campus = e.target.value; dash.page = 1; load(); });
$('#prevPage').addEventListener('click', () => { if (dash.page > 1) { dash.page--; load(); } });
$('#nextPage').addEventListener('click', () => {
  const pages = Math.max(1, Math.ceil(dash.total / dash.pageSize));
  if (dash.page < pages) { dash.page++; load(); }
});
let searchTimer = null;
$('#studentSearch').addEventListener('input', (e) => {
  clearTimeout(searchTimer);
  const v = e.target.value.trim();
  searchTimer = setTimeout(() => { dash.q = v; dash.page = 1; load(); }, 350);
});

// Dashboard / Practice tab switching.
document.querySelectorAll('.tab').forEach((t) => t.addEventListener('click', () => {
  document.querySelectorAll('.tab').forEach((x) => x.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach((x) => x.classList.remove('active'));
  t.classList.add('active');
  $('#tab-' + t.dataset.tab).classList.add('active');
}));

load();
// Read-only shared link auto-refresh — 30s (was 5s) to cut bandwidth/egress.
setInterval(() => {
  if (document.hidden) return;
  if ($('#drawer').classList.contains('open')) return; // don't disrupt an open drawer
  load({ chart: false });
}, 30000);

// ---- Read-only Sync now button + polling -----------------------------------
let viewPollTimer = null;
function pollViewSync() {
  clearInterval(viewPollTimer);
  const statusEl = $('#syncStatus');
  if (statusEl) statusEl.textContent = 'syncing…';
  viewPollTimer = setInterval(async () => {
    try {
      const st = await api(`/view/${encodeURIComponent(token)}/sync-state`);
      if (st.running) {
        if (statusEl) statusEl.textContent = 'syncing…';
      } else {
        clearInterval(viewPollTimer);
        if (statusEl) {
          statusEl.textContent = st.lastRun
            ? `synced ${st.lastRun.ok}/${st.lastRun.students}` + (st.lastRun.newCompletions ? `, +${st.lastRun.newCompletions} completions` : '')
            : 'synced ✓';
          setTimeout(() => { if (statusEl.textContent.startsWith('synced')) statusEl.textContent = ''; }, 6000);
        }
        load({ chart: true });
      }
    } catch {
      clearInterval(viewPollTimer);
      if (statusEl) statusEl.textContent = '';
    }
  }, 2500);
}

const syncBtn = $('#syncNowBtn');
if (syncBtn) {
  syncBtn.addEventListener('click', async () => {
    try {
      syncBtn.disabled = true;
      const statusEl = $('#syncStatus');
      if (statusEl) statusEl.textContent = 'starting sync…';
      await api(`/view/${encodeURIComponent(token)}/sync`, { method: 'POST' });
      pollViewSync();
    } catch (e) {
      alert('Could not start sync: ' + (e.message || e));
    } finally {
      setTimeout(() => { syncBtn.disabled = false; }, 3000);
    }
  });
}

// ---- Edit Student Modal ----------------------------------------------------
let activeEditingStudent = null;
const setMsg = (sel, text, kind) => {
  const el = $(sel);
  if (!el) return;
  el.textContent = text || '';
  el.className = 'msg ' + (kind || '');
  el.style.display = text ? 'block' : 'none';
};

async function openEditStudentModal(id) {
  setMsg('#editStudentMsg', '', '');
  const saveBtn = $('#editStudentSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = 'Save Changes';
  }

  let student = (lastData && lastData.students ? lastData.students : []).find((s) => String(s.id) === String(id));

  if (!student || !student.username) {
    try {
      const res = await api(`/view/${encodeURIComponent(token)}/student/${id}`);
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
    await api(`/view/${encodeURIComponent(token)}/student/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    closeEditStudentModal();
    renderStudents._sig = null; // force table repaint
    await load();

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

// ---- Add Student Modal ----------------------------------------------------
function openAddStudentModal() {
  setMsg('#addStudentMsg', '', '');
  const saveBtn = $('#addStudentSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = false;
    saveBtn.textContent = '＋ Add Student';
  }
  $('#addStudentName').value = '';
  $('#addStudentUrl').value = '';
  $('#addStudentReg').value = '';
  $('#addStudentEmail').value = '';
  $('#addStudentDept').value = '';
  $('#addStudentSection').value = '';
  $('#addStudentYear').value = '';
  $('#addStudentCampus').value = '';

  $('#addStudentModalBackdrop')?.classList.add('open');
  setTimeout(() => $('#addStudentName')?.focus(), 50);
}

function closeAddStudentModal() {
  $('#addStudentModalBackdrop')?.classList.remove('open');
  setMsg('#addStudentMsg', '', '');
}

$('#addStudentBtn')?.addEventListener('click', openAddStudentModal);
$('#addStudentModalCloseBtn')?.addEventListener('click', closeAddStudentModal);
$('#addStudentCancelBtn')?.addEventListener('click', closeAddStudentModal);
$('#addStudentModalBackdrop')?.addEventListener('click', (e) => {
  if (e.target.id === 'addStudentModalBackdrop') closeAddStudentModal();
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && $('#addStudentModalBackdrop')?.classList.contains('open')) {
    closeAddStudentModal();
  }
});

$('#addStudentForm')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const name = $('#addStudentName').value.trim();
  const url = $('#addStudentUrl').value.trim();

  if (!name) return setMsg('#addStudentMsg', 'Student name is required.', 'err');
  if (!url) return setMsg('#addStudentMsg', 'LeetCode profile URL or username is required.', 'err');

  const body = {
    name,
    url,
    register_number: $('#addStudentReg').value.trim(),
    email: $('#addStudentEmail').value.trim(),
    department: $('#addStudentDept').value.trim(),
    section: $('#addStudentSection').value.trim(),
    year: $('#addStudentYear').value.trim(),
    campus: $('#addStudentCampus').value.trim(),
  };

  const saveBtn = $('#addStudentSaveBtn');
  if (saveBtn) {
    saveBtn.disabled = true;
    saveBtn.textContent = 'Adding…';
  }
  setMsg('#addStudentMsg', 'Adding student and syncing LeetCode stats…', '');

  try {
    await api(`/view/${encodeURIComponent(token)}/students`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    closeAddStudentModal();
    renderStudents._sig = null; // force table repaint
    await load();
  } catch (err) {
    if (saveBtn) {
      saveBtn.disabled = false;
      saveBtn.textContent = '＋ Add Student';
    }
    setMsg('#addStudentMsg', err.message || 'Failed to add student.', 'err');
  }
});

