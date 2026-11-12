/* SONU app shell: auth guard, sidebar (modules > processes > tasks), search, favorites,
   header/user menu, hash router (#/home, #/v/<viewId>?id=..), home dashboard. */
(function () {
  const UI = window.SONU_UI, esc = UI.esc, h = UI.h;
  if (!DB.init()) { location.replace('index.html'); return; }
  const user = DB.me();
  const isAdmin = user.role === 'Administrator';
  const MENU = window.SONU_MENU.filter((m) => !m.adminOnly || isAdmin);
  try { sessionStorage.setItem('sonu_user', JSON.stringify(user)); } catch (e) {}

  const ICONS = {
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
    star: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.3 6.5 20.2l1-6.2L3 9.6l6.2-.9z"/></svg>',
    headset: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><rect x="2" y="14" width="5" height="6" rx="1"/><rect x="17" y="14" width="5" height="6" rx="1"/></svg>',
    wrench: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z"/></svg>',
    gears: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m9 12 2 2 4-4"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 11 9-7 9 7v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>'
  };
  const LOGO = '<svg viewBox="0 0 40 40"><rect width="40" height="40" rx="9" fill="#f59e0b"/><path d="M27 13.5c-1.6-1.6-4-2.5-6.8-2.5-4.2 0-7.2 2.2-7.2 5.6 0 6.6 13.6 4 13.6 9.4 0 2.2-2.2 3.6-5.4 3.6-2.8 0-5.2-1-7-2.8" fill="none" stroke="#062b28" stroke-width="3.4" stroke-linecap="round"/></svg>';

  /* ---------- favorites (per browser) ---------- */
  const FAV_KEY = 'sonu_favs_' + user.username;
  const favs = (() => { try { return new Set(JSON.parse(localStorage.getItem(FAV_KEY) || '[]')); } catch (e) { return new Set(); } })();
  const saveFavs = () => { try { localStorage.setItem(FAV_KEY, JSON.stringify([...favs])); } catch (e) {} };

  /* flat task index (for search / favorites / breadcrumbs) */
  const TASKS = [];
  MENU.forEach((m) => m.processes.forEach((p) => p.tasks.forEach((t) => { if (t.view) TASKS.push({ ...t, module: m, process: p, key: m.id + '/' + p.id + '/' + t.view }); })));

  /* ---------- layout ---------- */
  document.body.innerHTML = `
  <div class="shell" id="shell">
    <aside class="sidebar">
      <div class="brand">${LOGO}<span>SONU<small>FACILITIES PORTAL</small></span></div>
      <nav class="side-nav" id="sideNav"></nav>
      <div class="side-foot"><button id="collapse" title="Collapse menu">&#10094;</button></div>
      <div class="drawer" id="drawer1"></div>
      <div class="drawer tasks" id="drawer2"></div>
    </aside>
    <div class="nav-overlay" id="navOverlay"></div>
    <div class="main">
      <header class="topbar">
        <button class="icon-btn mob-only" id="mobMenu" title="Menu">&#9776;</button>
        <div class="crumb" id="crumb"></div>
        <span class="org">SONU</span>
        <button class="icon-btn" id="helpBtn" title="Help">?</button>
        <button class="icon-btn ghost" id="userBtn" title="${esc(user.name)}">${esc(user.name.split(' ').map((x) => x[0]).join('').slice(0, 2).toUpperCase())}</button>
        <div class="menu-pop" id="userMenu">
          <div class="who"><b>${esc(user.name)}</b><small>${esc(user.position || '')} · ${esc(user.username)}</small></div>
          <a data-u="home">Home</a><a data-u="profile">My Profile</a><a data-u="password">Change Password</a><a data-u="theme">Toggle Dark / Light</a>
          ${isAdmin ? '<a data-u="admin">Administration</a>' : ''}
          ${user.role !== 'Contractor' ? '<a data-u="audit">Activity Log</a>' : ''}${user.role === 'Administrator' ? '<a data-u="reset">Reset Demo Data</a>' : ''}<a data-u="logout">Sign Out</a>
        </div>
      </header>
      <main class="content" id="content"></main>
    </div>
  </div>`;

  const shell = document.getElementById('shell');
  const nav = document.getElementById('sideNav');
  const d1 = document.getElementById('drawer1');
  const d2 = document.getElementById('drawer2');
  const content = document.getElementById('content');

  const sideItems = [
    { id: 'home', title: 'Home', icon: 'home' },
    { id: 'search', title: 'Search', icon: 'search' },
    { id: 'favorites', title: 'Favorites', icon: 'star' },
    ...MENU.map((m) => ({ id: m.id, title: m.title, icon: m.icon, module: m }))
  ];
  nav.innerHTML = sideItems.map((s) => `<div class="side-item" data-s="${s.id}" title="${esc(s.title)}"><span class="ico">${ICONS[s.icon] || ''}</span><span class="lbl">${esc(s.title)}</span>${s.id !== 'home' ? '<span class="chev"></span>' : ''}</div>`).join('');

  /* Drawer behaviour follows the reference navigator:
     - module with several processes: "Shortcuts" (the user's starred tasks of that module) + "Browse all" process list,
       and the chosen process's tasks open in a second panel;
     - module with a single process: its tasks open directly in the first panel (no process list);
     - while a drawer is open the page behind it is dimmed; clicking the dimmed area closes it. */
  let openSide = null;
  const overlay = document.getElementById('navOverlay');
  function closeDrawers() { d1.classList.remove('open'); d2.classList.remove('open'); shell.classList.remove('drawer-open'); openSide = null; nav.querySelectorAll('.side-item').forEach((x) => x.classList.remove('active')); }
  function markActive(id) { nav.querySelectorAll('.side-item').forEach((x) => x.classList.toggle('active', x.dataset.s === id)); }
  function openD1() { d1.classList.add('open'); shell.classList.add('drawer-open'); }
  overlay.onclick = closeDrawers;

  const TASK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8"><rect x="4" y="5" width="16" height="14" rx="1"/><path d="M4 9.5h16M4 14h16M9.5 9.5V19M14.5 9.5V19"/></svg>';
  function taskRow(t) {
    const on = favs.has(t.key);
    return `<div class="t-item" data-k="${esc(t.key)}"><span class="tico">${TASK_ICON}</span><span class="t">${esc(t.title)}</span><button class="star ${on ? 'on' : ''}" title="${on ? 'Remove from' : 'Add to'} favorites" data-star="${esc(t.key)}">&#9733;</button></div>`;
  }
  function tasksHTML(m, p) {
    return p.tasks.map((t) => (!t.view ? `<div class="t-group">${esc(t.title)}</div>` : taskRow(TASKS.find((x) => x.key === m.id + '/' + p.id + '/' + t.view)))).join('');
  }
  function bindTaskRows(el) {
    el.querySelectorAll('.t-item').forEach((r) => r.onclick = (e) => {
      const star = e.target.closest('[data-star]');
      if (star) {
        const k = star.dataset.star; favs.has(k) ? favs.delete(k) : favs.add(k); saveFavs();
        document.querySelectorAll(`[data-star="${CSS.escape(k)}"]`).forEach((s) => s.classList.toggle('on', favs.has(k)));
        if (openSide === 'favorites') showFavorites();
        else { const m = MENU.find((x) => x.id === openSide); if (m) renderShortcuts(m); }
        return;
      }
      const t = TASKS.find((x) => x.key === r.dataset.k); closeDrawers(); shell.classList.remove('mob-open'); go(t.view, {}, t);
    });
  }
  function renderShortcuts(m) {
    const box = d1.querySelector('.shortcuts'); if (!box) return;
    const list = TASKS.filter((t) => t.module.id === m.id && favs.has(t.key));
    box.innerHTML = list.length ? `<h3>Shortcuts</h3>${list.map(taskRow).join('')}` : '';
    box.classList.toggle('has', list.length > 0);
    bindTaskRows(box);
  }
  function showProcess(m, p) {
    d1.querySelectorAll('.d-item').forEach((x) => x.classList.toggle('active', x.dataset.p === p.id));
    d2.innerHTML = `<h3 class="ttl">${esc(p.title)}</h3>${tasksHTML(m, p)}`;
    d2.classList.add('open'); bindTaskRows(d2);
  }
  function showModule(m) {
    d2.classList.remove('open');
    if (m.processes.length === 1) {
      const p = m.processes[0];
      d1.innerHTML = `<div class="shortcuts"></div><h3 class="ttl">${esc(p.title)}</h3>${tasksHTML(m, p)}`;
      openD1(); bindTaskRows(d1); renderShortcuts(m); return;
    }
    d1.innerHTML = `<div class="shortcuts"></div><h3>Browse all</h3>` + m.processes.map((p) => `<div class="d-item" data-p="${p.id}"><span class="sq"></span><span class="t">${esc(p.title)}</span><span class="arr">&#8250;</span></div>`).join('');
    openD1(); renderShortcuts(m);
    d1.querySelectorAll('.d-item').forEach((x) => x.onclick = () => showProcess(m, m.processes.find((p) => p.id === x.dataset.p)));
  }
  function showSearch() {
    d1.innerHTML = `<h3>Search all tasks</h3><input class="search-box" placeholder="Type to search…" id="srch"><div id="srchRes"></div>`;
    openD1(); d2.classList.remove('open');
    const inp = d1.querySelector('#srch'); const res = d1.querySelector('#srchRes');
    const run = () => {
      const q = inp.value.trim().toLowerCase();
      const seen = new Set();
      const list = TASKS.filter((t) => !q || (t.title + ' ' + t.process.title + ' ' + t.module.title).toLowerCase().includes(q)).filter((t) => (seen.has(t.view + t.title) ? false : seen.add(t.view + t.title)));
      res.innerHTML = list.length ? list.map((t) => taskRow(t).replace('</span><button', `<br><small style="color:var(--muted)">${esc(t.module.title)} › ${esc(t.process.title)}</small></span><button`)).join('') : '<div class="empty">No tasks found.</div>';
      bindTaskRows(res);
    };
    inp.oninput = run; run(); setTimeout(() => inp.focus(), 50);
  }
  function showFavorites() {
    const list = TASKS.filter((t) => favs.has(t.key));
    d1.innerHTML = '<h3>Favorites</h3>' + (list.length ? list.map(taskRow).join('') : '<div class="empty">No favorites yet. Click the ★ next to any task to add it here.</div>');
    openD1(); d2.classList.remove('open'); bindTaskRows(d1);
  }
  nav.querySelectorAll('.side-item').forEach((el) => el.onclick = () => {
    const id = el.dataset.s;
    if (id === 'home') { closeDrawers(); shell.classList.remove('mob-open'); location.hash = '#/home'; return; }
    if (openSide === id) return closeDrawers();
    closeDrawers(); openSide = id; markActive(id);
    if (id === 'search') showSearch(); else if (id === 'favorites') showFavorites(); else showModule(MENU.find((m) => m.id === id));
  });
  document.getElementById('collapse').onclick = () => { closeDrawers(); shell.classList.toggle('collapsed'); };
  document.getElementById('mobMenu').onclick = () => shell.classList.toggle('mob-open');
  content.addEventListener('click', () => { closeDrawers(); userMenu.classList.remove('open'); });

  /* ---------- header ---------- */
  const userMenu = document.getElementById('userMenu');
  document.getElementById('userBtn').onclick = (e) => { e.stopPropagation(); closeDrawers(); userMenu.classList.toggle('open'); };
  document.querySelector('.topbar').addEventListener('click', (e) => { if (!e.target.closest('#userBtn, #userMenu, #mobMenu')) { closeDrawers(); userMenu.classList.remove('open'); } });
  userMenu.querySelectorAll('[data-u]').forEach((a) => a.onclick = () => {
    userMenu.classList.remove('open');
    const u = a.dataset.u;
    if (u === 'home') location.hash = '#/home';
    if (u === 'logout') { DB.logout(); sessionStorage.removeItem('sonu_user'); location.replace('index.html'); }
    if (u === 'reset') { if (confirm('Reset all demo data to its original state?') && DB.reset()) { UI.toast('Demo data reset'); route(); } }
    if (u === 'audit') location.hash = '#/v/audit-log';
    if (u === 'admin') location.hash = '#/v/admin-dashboard';
    if (u === 'password') {
      const f = UI.buildForm([{ title: 'Change your password', fields: [
        { field: 'current', label: 'Current Password', type: 'text', required: true },
        { field: 'password', label: 'New Password', type: 'text', required: true },
        { field: 'confirm', label: 'Confirm New Password', type: 'text', required: true }] }], null, {});
      f.querySelectorAll('input').forEach((i) => { i.type = 'password'; i.autocomplete = 'new-password'; });
      UI.modal('Change Password', f, [{ label: 'Change Password', cls: 'primary', onClick: (close) => {
        const { vals, missing } = f.read();
        if (missing.length) return UI.toast('Please fill all fields', true);
        if (vals.password !== vals.confirm) return UI.toast('New passwords do not match', true);
        if (DB.request('POST', '/api/auth/password', { current: vals.current, password: vals.password }).ok) { UI.toast('Password changed'); close(); }
      } }]);
    }
    if (u === 'theme') { const r = document.documentElement; const dark = r.dataset.theme ? r.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches; r.dataset.theme = dark ? 'light' : 'dark'; try { localStorage.setItem('sonu_theme', r.dataset.theme); } catch (e) {} }
    if (u === 'profile') UI.modal('My Profile', h(`<div class="detail-grid">${[['Name', user.name], ['Username', user.username], ['Position', user.position], ['Company', user.company], ['Phone', user.phone], ['E-mail', user.email], ['Role', user.role]].map(([k, v]) => `<div><span>${k}</span><b>${esc(v || '')}</b></div>`).join('')}</div>`));
  });
  document.getElementById('helpBtn').onclick = () => UI.modal('SONU Help', h(`<div style="padding:16px;line-height:1.7">
    <p><b>Navigation:</b> open a module in the left menu (Service Desk, Corrective Maintenance, Preventive Maintenance, Health &amp; Safety), pick a process, then a task.</p>
    <p><b>Grids:</b> use the <b>Filter</b> panel and press <b>Show</b>; type in the boxes under column headers to filter further; click a header to sort; <b>XLS</b> exports the rows.</p>
    <p><b>Favorites:</b> click ★ next to any task. <b>Search</b> finds any task by name.</p>
    <p><b>Workflow:</b> Work Request → Estimate/Schedule → (RFE for extra resources) → Issue + Permit to Work (E-PTW) → Daily hours → Contractor Completed → Close → Invoice.</p>
    <p style="color:var(--muted)">All data in this demo is fictional and stored only in your browser.</p></div>`));

  /* ---------- router ---------- */
  const ctxBase = {
    user,
    open: (view, params) => go(view, params),
    toast: UI.toast,
    refresh: () => route()
  };
  function go(view, params = {}, task) {
    const q = Object.keys(params).length ? '?' + new URLSearchParams(params).toString() : '';
    location.hash = '#/v/' + view + q;
  }
  function setCrumb(parts) { document.getElementById('crumb').innerHTML = parts.map((p, i) => (i === parts.length - 1 ? `<b>${esc(p)}</b>` : esc(p))).join(' › '); }
  function route() {
    const hash = location.hash || '#/home';
    const m = hash.match(/^#\/v\/([^?]+)(?:\?(.*))?$/);
    if (!m) { setCrumb(['Home']); markActive('home'); return renderHome(); }
    const viewId = decodeURIComponent(m[1]);
    const params = Object.fromEntries(new URLSearchParams(m[2] || ''));
    const cfg = window.SONU_VIEWS[viewId];
    const t = TASKS.find((x) => x.view === viewId);
    setCrumb(t ? [t.module.title, t.process.title, t.title] : [cfg ? cfg.title : viewId]);
    document.title = (cfg ? cfg.title : 'Not found') + ' — SONU';
    if (!cfg) { content.innerHTML = '<div class="view"><div class="noresults">This page does not exist.</div></div>'; return; }
    if ((cfg.adminOnly && !isAdmin) || (viewId === 'audit-log' && user.role === 'Contractor')) { content.innerHTML = '<div class="view"><div class="noresults">You do not have access to this page.</div></div>'; return; }
    let record = null;
    if (params.id && cfg.table) record = DB.get(cfg.table, isNaN(params.id) ? params.id : Number(params.id)) || DB.get(cfg.table, params.id);
    UI.renderView(content, cfg, Object.assign({}, ctxBase, { params, record }));
    content.scrollTop = 0;
  }
  window.addEventListener('hashchange', route);

  /* ---------- home dashboard ---------- */
  function renderHome() {
    document.title = 'Home — SONU';
    const sites = DB.all('sites'); const blds = DB.all('buildings');
    const cities = [...new Set(sites.map((s) => s.city))].sort();
    content.innerHTML = '';
    const v = h('<div class="view" style="padding-bottom:0"></div>'); content.appendChild(v);
    /* one-row console like the reference home page: type-ahead CITY / SITE / BUILDING, Filter, My Building, shortcuts */
    const bar = h(`<div class="home-bar">
      <input id="hCity" list="dlCity" placeholder="CITY" autocomplete="off"><datalist id="dlCity">${cities.map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      <input id="hSite" list="dlSite" placeholder="SITE" autocomplete="off"><datalist id="dlSite"></datalist>
      <input id="hBld" list="dlBld" placeholder="BUILDING" autocomplete="off"><datalist id="dlBld"></datalist>
      <button class="btn accent" id="hFilter">Filter</button><button class="btn" id="hMine">My Building</button>
      <button class="btn" data-v="campus-map">Campus Map</button><button class="btn" data-v="workplace-catalog">Workplace</button>
      <button class="btn" data-v="fi-dashboard">FI Dashboard</button><button class="btn" data-v="wr-dashboard">WR Dashboard</button></div>`);
    v.appendChild(bar);
    const val = (id) => bar.querySelector(id).value.trim();
    const codeOf = (s) => s.split(' — ')[0].trim().toUpperCase();
    const pickCity = () => { const c = val('#hCity').toLowerCase(); return c ? cities.find((x) => x.toLowerCase() === c) || c : ''; };
    const matchSite = (s) => { const q = val('#hSite'); return !q || s.id === codeOf(q) || s.name.toLowerCase().includes(q.toLowerCase()); };
    const matchBld = (b) => { const q = val('#hBld'); return !q || b.id === codeOf(q) || b.name.toLowerCase().includes(q.toLowerCase()); };
    const cityOk = (city) => { const c = pickCity(); return !c || city.toLowerCase() === String(c).toLowerCase(); };
    const fillLists = () => {
      const ss = sites.filter((s) => cityOk(s.city));
      bar.querySelector('#dlSite').innerHTML = ss.map((s) => `<option value="${esc(s.id)} — ${esc(s.name)}">`).join('');
      bar.querySelector('#dlBld').innerHTML = blds.filter((b) => cityOk(b.city) && (!val('#hSite') || ss.some((s) => s.id === b.site_id && matchSite(s)))).map((b) => `<option value="${esc(b.id)} — ${esc(b.name)}">`).join('');
    };
    ['#hCity', '#hSite'].forEach((id) => bar.querySelector(id).addEventListener('input', fillLists)); fillLists();
    bar.querySelectorAll('input').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') bar.querySelector('#hFilter').click(); }));
    bar.querySelectorAll('[data-v]').forEach((b) => b.onclick = () => go(b.dataset.v));

    const GRID_ICON = '<svg viewBox="0 0 16 16" width="16" height="16"><rect x="1" y="1" width="6" height="6" fill="#f59e0b"/><rect x="9" y="1" width="6" height="6" fill="#0f766e"/><rect x="1" y="9" width="6" height="6" fill="#0f766e"/><rect x="9" y="9" width="6" height="6" fill="#f59e0b"/></svg>';
    const mapPanel = h(`<div class="panel home-panel"><div class="panel-head"><span class="ttl">Buildings</span><button class="icon-plain" id="mapToggle" title="Switch between map and list">${GRID_ICON}</button><span class="sp"></span><span style="color:var(--muted);font-size:12px" id="mapCount"></span></div><div id="map"></div><div id="bldList" hidden></div></div>`);
    v.appendChild(mapPanel);
    const splitter = h('<div class="splitter" title="Drag to resize"></div>'); v.appendChild(splitter);
    const surveyBox = h('<div class="home-panel"></div>'); v.appendChild(surveyBox);

    /* drag the splitter to resize the map (remembered per browser) */
    const mapEl = mapPanel.querySelector('#map');
    try { const hgt = +localStorage.getItem('sonu_map_h'); if (hgt >= 160 && hgt <= 900) mapEl.style.height = hgt + 'px'; } catch (e) {}
    splitter.onpointerdown = (e) => {
      const y0 = e.clientY, h0 = mapEl.offsetHeight; splitter.setPointerCapture(e.pointerId);
      splitter.onpointermove = (m) => { mapEl.style.height = Math.max(160, Math.min(900, h0 + m.clientY - y0)) + 'px'; if (map) map.invalidateSize(); };
      splitter.onpointerup = () => { splitter.onpointermove = null; try { localStorage.setItem('sonu_map_h', mapEl.offsetHeight); } catch (e2) {} };
    };

    /* layout icon: switch the Buildings panel between map and list */
    let current = blds;
    const drawList = () => {
      const box = mapPanel.querySelector('#bldList'); box.innerHTML = '';
      UI.renderInto(box, { type: 'grid', gridTitle: 'Buildings', noToolbar: true, pageSize: 10, rows: () => current,
        columns: [{ field: 'id', label: 'Building Code' }, { field: 'name', label: 'Building Name' }, { field: 'site_id', label: 'Site' }, { field: 'city', label: 'City' }],
        rowActions: [{ label: 'Work Requests', onClick: (r) => go('wr-review', { bl_id: r.id }) }] }, ctxBase);
    };
    mapPanel.querySelector('#mapToggle').onclick = () => {
      const showList = !mapEl.hidden; mapEl.hidden = showList; mapPanel.querySelector('#bldList').hidden = !showList;
      if (showList) drawList(); else if (map) map.invalidateSize();
    };

    let map, layer;
    const drawMap = (list) => {
      current = list; if (!mapPanel.querySelector('#bldList').hidden) drawList();
      mapPanel.querySelector('#mapCount').textContent = list.length + ' buildings';
      if (!window.L) { mapPanel.querySelector('#map').innerHTML = '<div class="noresults">Map library could not load (offline?).</div>'; return; }
      if (!map) { map = L.map('map', { scrollWheelZoom: false }); L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map); }
      if (layer) layer.remove();
      const colors = {}; const pal = ['#0f766e', '#f59e0b', '#2563eb', '#dc2626', '#7c3aed', '#16a34a', '#db2777', '#0891b2'];
      layer = L.layerGroup(list.map((b) => {
        colors[b.site_id] = colors[b.site_id] || pal[Object.keys(colors).length % pal.length];
        const open = DB.all('wr').filter((w) => w.bl_id === b.id && !/Closed|Completed|Cancelled|Rejected/.test(w.status)).length;
        return L.circleMarker([b.lat, b.lng], { radius: 8, color: '#062b28', weight: 1, fillColor: colors[b.site_id], fillOpacity: .85 })
          .bindPopup(`<b>${esc(b.name)}</b><br>${esc(b.id)} · Site ${esc(b.site_id)}<br>${esc(b.city)}<br>Open work requests: <b>${open}</b><br><a href="#/v/wr-review?bl_id=${encodeURIComponent(b.id)}">View work requests</a>`);
      })).addTo(map);
      if (list.length) map.fitBounds(L.latLngBounds(list.map((b) => [b.lat, b.lng])).pad(0.2)); else map.setView([25.3, 51.4], 9);
    };
    const filtered = () => blds.filter((b) => cityOk(b.city) && (!val('#hSite') || sites.some((s) => s.id === b.site_id && matchSite(s))) && matchBld(b));
    bar.querySelector('#hFilter').onclick = () => { const list = filtered(); if (!list.length) UI.toast('No buildings match the filter.', true); drawMap(list); };
    bar.querySelector('#hMine').onclick = () => { const mine = blds.filter((b) => b.id === user.bl_id); if (!mine.length) return UI.toast('No building is assigned to your profile.', true); drawMap(mine); };
    setTimeout(() => drawMap(blds), 0);

    UI.renderInto(surveyBox, {
      type: 'grid', title: 'We Are Waiting to Hear From You', gridTitle: 'We Are Waiting to Hear From You', table: 'surveys', pageSize: 5, noToolbar: true,
      where: (r) => r.status === 'Pending' && r.requestor === user.username,
      columns: [{ field: 'wr_id', label: 'Work Request' }, { field: 'description', label: 'Description' }, { field: 'bl_id', label: 'Building' }, { field: 'date_completed', label: 'Completed On', type: 'date' }],
      rowActions: [{ label: 'Give Feedback', onClick: (row, ctx, api) => {
        const f = UI.buildForm([{ title: 'How satisfied are you with this service?', fields: [
          { field: 'rating', label: 'Rating (1-5)', type: 'select', options: ['5', '4', '3', '2', '1'], required: true },
          { field: 'comment', label: 'Comments', type: 'textarea' }] }], null, {});
        UI.modal('Satisfaction Survey — WR ' + row.wr_id, f, [{ label: 'Submit', cls: 'primary', onClick: (close) => {
          const { vals, missing } = f.read(); if (missing.length) return UI.toast('Please select a rating', true);
          DB.update('surveys', row.id, { rating: Number(vals.rating), comment: vals.comment, status: 'Answered', date_answered: new Date().toISOString() });
          UI.toast('Thank you for your feedback!'); close(); api.refresh();
        } }]);
      } }]
    }, ctxBase);
  }

  route();
})();
