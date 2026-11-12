/* SONU UI component library.
 *
 * VIEW CONFIG CONTRACT (used by js/views.js):
 *
 *  Common: { type, title, filters?, table?, rows?() }
 *    table:  DB table name; rows come from DB.all(table)
 *    where(row, ctx): optional base predicate
 *    rows(ctx): optional function returning rows (overrides table/where)
 *
 *  type 'grid':
 *    filters:  [{ field, label, type: 'text'|'select'|'daterange'|'checkbox'|'number',
 *                 options?: [..] | () => [..], test?: (row, value) => bool, default? }]
 *    columns:  [{ field, label, type?: 'date'|'datetime'|'number'|'money'|'status'|'bool',
 *                 render?: (row) => html }]
 *    rowActions: [{ label, onClick?: (row, ctx) => void, view?: viewId, tab?: index,
 *                   edit?: sectionsArray (opens edit modal), details?: true, show?: (row)=>bool }]
 *    toolbar:  [{ label, onClick: (ctx, gridApi) => void, cls? }]   (Refresh + XLS are built in)
 *    rowClass: (row) => 'row-red'|'row-orange'|'row-blue'|'row-green'|''
 *    legend:   html string shown above grid
 *    indexField: field whose first character builds the quick index bar ("Code: 1 754  2 457 ... All")
 *    selectable: true -> checkbox column; gridApi.selected() returns rows
 *    pageSize: default 15;  sort: { field, dir: 'asc'|'desc' }
 *    gridTitle: panel title (defaults to title)
 *
 *  type 'form':
 *    sections: [{ title, fields: [{ field, label, type: 'text'|'textarea'|'number'|'date'|'datetime'|
 *                 'select'|'checkbox'|'readonly', options?, required?, default?: value|(ctx)=>value,
 *                 wide? }] }]
 *    saveLabel, onSave(values, ctx) -> optional; default DB.insert(table, values)
 *    (if ctx.record is set, the form edits it: DB.update(table, record.id, values))
 *
 *  type 'tabs':
 *    tabs: [{ label, view: config | viewId, needsRecord?: bool }]
 *    A row action { tab: n } in tab 0 selects the record and opens tab n.
 *
 *  type 'chart':
 *    filters (as grid), chart: { kind: 'bar'|'hbar'|'stacked'|'hstacked'|'line'|'pie'|'doughnut',
 *      groupBy: field | (row)=>key, stackBy?: field | fn, value?: field (sum) | (rows)=>number,
 *      dateGroup?: 'month' (when groupBy is a date field), label?: 'Count' }
 *    table: true -> also show the aggregated crosstab below the chart
 *
 *  type 'kpi':     kpis: [{ label, value: (rows, ctx) => number|string }]  (+ optional chart / grid via 'then')
 *  type 'catalog': items: [{ icon, title, text, view?, onClick? }]
 *  type 'custom':  render(container, ctx)
 *
 * ctx passed everywhere: { record, params, open(viewId, params), refresh(), toast(msg), user }
 */
(function () {
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const h = (html) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild; };
  const pad = (n) => String(n).padStart(2, '0');
  const toDate = (v) => (v ? new Date(v) : null);
  const fmtDate = (v) => { const d = toDate(v); return d && !isNaN(d) ? `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}` : ''; };
  const fmtDT = (v) => { const d = toDate(v); return d && !isNaN(d) ? `${fmtDate(v)} ${pad(d.getHours())}:${pad(d.getMinutes())}` : ''; };
  const fmtNum = (v, dp = 0) => (v === '' || v == null || isNaN(v) ? '' : Number(v).toLocaleString('en-US', { minimumFractionDigits: dp, maximumFractionDigits: dp }));
  const isoDay = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const opts = (o, ctx) => (typeof o === 'function' ? o(ctx) : o || []);

  const STATUS_CLASS = (s) => {
    s = String(s || '').toLowerCase();
    if (/(reject|cancel|expired|stopped|overdue|error)/.test(s)) return 'bad';
    if (/(complet|closed|approved|issued|valid|done|verified)/.test(s)) return 'ok';
    if (/(hold|pending|wait|request|review|draft|open)/.test(s)) return 'warn';
    return 'info';
  };

  function cell(row, col) {
    if (col.render) return col.render(row);
    const v = row[col.field];
    switch (col.type) {
      case 'date': return esc(fmtDate(v));
      case 'datetime': return esc(fmtDT(v));
      case 'number': return esc(fmtNum(v));
      case 'money': return esc(fmtNum(v, 2));
      case 'bool': return v ? 'Yes' : 'No';
      case 'status': return v ? `<span class="badge ${STATUS_CLASS(v)}">${esc(v)}</span>` : '';
      default: return esc(v);
    }
  }
  const plain = (row, col) => {
    const v = row[col.field];
    if (col.type === 'date') return fmtDate(v);
    if (col.type === 'datetime') return fmtDT(v);
    return v == null ? '' : String(v);
  };

  /* ---------- date presets ---------- */
  const PRESETS = ['', 'Today', 'This Week', 'This Month', 'This Year', 'Last Week', 'Last Month', 'Last Year', 'Date Range'];
  function presetRange(p) {
    const n = new Date(); const d0 = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    const add = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);
    const wk = add(d0, -d0.getDay());
    switch (p) {
      case 'Today': return [d0, add(d0, 1)];
      case 'This Week': return [wk, add(wk, 7)];
      case 'Last Week': return [add(wk, -7), wk];
      case 'This Month': return [new Date(n.getFullYear(), n.getMonth(), 1), new Date(n.getFullYear(), n.getMonth() + 1, 1)];
      case 'Last Month': return [new Date(n.getFullYear(), n.getMonth() - 1, 1), new Date(n.getFullYear(), n.getMonth(), 1)];
      case 'This Year': return [new Date(n.getFullYear(), 0, 1), new Date(n.getFullYear() + 1, 0, 1)];
      case 'Last Year': return [new Date(n.getFullYear() - 1, 0, 1), new Date(n.getFullYear(), 0, 1)];
      default: return null;
    }
  }

  /* ---------- filter panel ---------- */
  function filterControl(f, ctx) {
    const id = 'f_' + f.field + '_' + Math.random().toString(36).slice(2, 7);
    let ctl;
    switch (f.type) {
      case 'select':
        ctl = `<select data-k="${f.field}"><option value=""></option>${opts(f.options, ctx).map((o) => `<option>${esc(o)}</option>`).join('')}</select>`; break;
      case 'daterange':
        ctl = `<select data-k="${f.field}" data-part="preset" style="max-width:110px">${PRESETS.map((p) => `<option${p === (f.default || '') ? ' selected' : ''}>${p}</option>`).join('')}</select>
               <span>From</span><input type="date" data-k="${f.field}" data-part="from"><span>To</span><input type="date" data-k="${f.field}" data-part="to">`; break;
      case 'checkbox':
        ctl = `<input type="checkbox" data-k="${f.field}"${f.default ? ' checked' : ''}>`; break;
      case 'number':
        ctl = `<input type="number" data-k="${f.field}">`; break;
      default:
        ctl = `<input type="text" data-k="${f.field}" id="${id}">`;
    }
    return `<div class="fld"><label>${esc(f.label)}</label><div class="ctl">${ctl}</div></div>`;
  }
  function readFilters(root, filters) {
    const vals = {};
    filters.forEach((f) => {
      if (f.type === 'daterange') {
        const g = (p) => root.querySelector(`[data-k="${f.field}"][data-part="${p}"]`).value;
        vals[f.field] = { preset: g('preset'), from: g('from'), to: g('to') };
      } else if (f.type === 'checkbox') {
        vals[f.field] = root.querySelector(`[data-k="${f.field}"]`).checked;
      } else vals[f.field] = root.querySelector(`[data-k="${f.field}"]`).value.trim();
    });
    return vals;
  }
  function applyFilters(rows, filters, vals) {
    return rows.filter((r) => filters.every((f) => {
      const v = vals[f.field];
      if (f.test) return f.test(r, v);
      if (f.type === 'daterange') {
        let range = presetRange(v.preset);
        if (v.preset === 'Date Range' || (!range && (v.from || v.to))) range = [v.from ? new Date(v.from) : null, v.to ? new Date(new Date(v.to).getTime() + 864e5) : null];
        if (!range) return true;
        const d = toDate(r[f.field]); if (!d) return false;
        return (!range[0] || d >= range[0]) && (!range[1] || d < range[1]);
      }
      if (f.type === 'checkbox') return !v || !!r[f.field];
      if (v === '' || v == null) return true;
      if (f.type === 'select') return String(r[f.field]) === v;
      return String(r[f.field] == null ? '' : r[f.field]).toLowerCase().includes(v.toLowerCase());
    }));
  }
  function filterPanel(cfg, ctx, onShow) {
    if (!cfg.filters || !cfg.filters.length) return null;
    const el = h(`<div class="panel"><div class="panel-head"><span class="ttl">Filter</span>
      <button class="btn" data-a="show">Show</button><button class="btn" data-a="clear">Clear</button></div>
      <div class="filter-grid">${cfg.filters.map((f) => filterControl(f, ctx)).join('')}</div></div>`);
    el.querySelector('[data-a=show]').onclick = () => onShow(readFilters(el, cfg.filters));
    el.querySelector('[data-a=clear]').onclick = () => {
      el.querySelectorAll('input,select').forEach((i) => { if (i.type === 'checkbox') i.checked = false; else i.value = ''; });
      onShow(readFilters(el, cfg.filters));
    };
    el.querySelectorAll('input[type=text]').forEach((i) => i.addEventListener('keydown', (e) => { if (e.key === 'Enter') onShow(readFilters(el, cfg.filters)); }));
    el.read = () => readFilters(el, cfg.filters);
    return el;
  }

  function baseRows(cfg, ctx) {
    let rows = cfg.rows ? cfg.rows(ctx) : cfg.table ? DB.all(cfg.table) : [];
    if (cfg.where) rows = rows.filter((r) => cfg.where(r, ctx));
    return rows;
  }

  function viewHead(title, extra = '') {
    return h(`<div class="view-head"><h2>${esc(title)}</h2>${extra}<div class="tools">
      <button title="Print" onclick="window.print()">&#128424;</button>
      <button title="E-mail link" data-mail>&#9993;</button></div></div>`);
  }

  /* ---------- CSV export (opens in Excel) ---------- */
  function exportCSV(name, columns, rows) {
    const q = (s) => `"${String(s).replace(/"/g, '""')}"`;
    const csv = [columns.map((c) => q(c.label)).join(','), ...rows.map((r) => columns.map((c) => q(plain(r, c))).join(','))].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
    a.download = name.replace(/[^\w-]+/g, '_') + '.csv'; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }

  /* ---------- GRID ---------- */
  function renderGrid(root, cfg, ctx, opt = {}) {
    const state = { vals: {}, col: {}, sort: cfg.sort || null, page: 0, idx: '', size: cfg.pageSize || 15, sel: new Set() };
    const columns = cfg.columns || [];
    const fp = filterPanel(cfg, ctx, (vals) => { state.vals = vals; state.page = 0; draw(); });
    if (fp) { root.appendChild(fp); state.vals = fp.read(); }
    const panel = h(`<div class="panel"><div class="panel-head"><span class="ttl">${esc(cfg.gridTitle || (opt.inTab ? cfg.title : cfg.gridTitle) || 'Records')}</span></div>
      ${cfg.legend ? `<div class="legend">${cfg.legend}</div>` : ''}<div class="index-bar" hidden></div>
      <div class="grid-wrap"><table class="grid"><thead></thead><tbody></tbody></table></div><div class="pager"></div></div>`);
    root.appendChild(panel);
    const head = panel.querySelector('.panel-head');
    const api = { selected: () => [...state.sel].map((id) => DB.get(cfg.table, id)).filter(Boolean), refresh: () => draw(), rows: () => current };
    const mk = (label, fn, cls = '') => { const b = h(`<button class="btn ${cls}">${esc(label)}</button>`); b.onclick = fn; head.appendChild(b); };
    mk('Refresh', () => draw());
    (cfg.toolbar || []).forEach((t) => mk(t.label, () => t.onClick(ctx, api), t.cls));
    mk('XLS', () => exportCSV(cfg.title, columns, current));

    const thead = panel.querySelector('thead'); const tbody = panel.querySelector('tbody');
    const acts = cfg.rowActions || [];
    const lead = (cfg.selectable ? '<th style="width:30px"><input type="checkbox" data-all></th>' : '') + (acts.length ? '<th></th>' : '');
    const leadF = (cfg.selectable ? '<th></th>' : '') + (acts.length ? '<th></th>' : '');
    thead.innerHTML = `<tr>${lead}${columns.map((c) => `<th data-s="${c.field}">${esc(c.label)} <span class="si"></span></th>`).join('')}</tr>
      <tr class="frow">${leadF}${columns.map((c) => `<th><input data-c="${c.field}"></th>`).join('')}</tr>`;
    thead.querySelectorAll('th[data-s]').forEach((th) => th.onclick = () => {
      const f = th.dataset.s; state.sort = state.sort && state.sort.field === f ? { field: f, dir: state.sort.dir === 'asc' ? 'desc' : 'asc' } : { field: f, dir: 'asc' }; draw();
    });
    thead.querySelectorAll('input[data-c]').forEach((i) => i.oninput = () => { state.col[i.dataset.c] = i.value.trim().toLowerCase(); state.page = 0; draw(); });
    const all = thead.querySelector('[data-all]');
    if (all) all.onchange = () => { current.forEach((r) => (all.checked ? state.sel.add(r.id) : state.sel.delete(r.id))); draw(); };

    let current = [];
    function draw() {
      let rows = applyFilters(baseRows(cfg, ctx), cfg.filters || [], state.vals);
      rows = rows.filter((r) => columns.every((c) => !state.col[c.field] || plain(r, c).toLowerCase().includes(state.col[c.field])));
      // quick index bar
      const ib = panel.querySelector('.index-bar');
      if (cfg.indexField) {
        const counts = {};
        rows.forEach((r) => { const k = String(r[cfg.indexField] || '').charAt(0).toUpperCase(); counts[k] = (counts[k] || 0) + 1; });
        ib.hidden = false;
        ib.innerHTML = `<b>${esc(columns.find((c) => c.field === cfg.indexField)?.label || '')}:</b> ` +
          Object.keys(counts).sort().map((k) => `<a data-i="${esc(k)}" class="${state.idx === k ? 'on' : ''}">${esc(k)}</a><sup>${counts[k]}</sup>`).join(' ') +
          ` <a data-i="" class="${state.idx ? '' : 'on'}">All</a><sup>${rows.length}</sup>`;
        ib.querySelectorAll('a').forEach((a) => a.onclick = () => { state.idx = a.dataset.i; state.page = 0; draw(); });
        if (state.idx) rows = rows.filter((r) => String(r[cfg.indexField] || '').charAt(0).toUpperCase() === state.idx);
      }
      if (state.sort) {
        const { field, dir } = state.sort; const m = dir === 'asc' ? 1 : -1;
        rows = rows.slice().sort((a, b) => {
          const x = a[field], y = b[field];
          if (typeof x === 'number' && typeof y === 'number') return (x - y) * m;
          return String(x ?? '').localeCompare(String(y ?? ''), undefined, { numeric: true }) * m;
        });
      }
      thead.querySelectorAll('th[data-s] .si').forEach((s) => { s.textContent = state.sort && s.parentElement.dataset.s === state.sort.field ? (state.sort.dir === 'asc' ? '▲' : '▼') : ''; });
      current = rows;
      const pages = Math.max(1, Math.ceil(rows.length / state.size));
      state.page = Math.min(state.page, pages - 1);
      const slice = rows.slice(state.page * state.size, (state.page + 1) * state.size);
      tbody.innerHTML = slice.length ? slice.map((r) => {
        const a = acts.filter((x) => !x.show || x.show(r)).map((x) => `<a data-act="${acts.indexOf(x)}">${esc(x.label)}</a>`).join('');
        return `<tr data-id="${esc(r.id)}" class="${cfg.rowClass ? cfg.rowClass(r) : ''}">` +
          (cfg.selectable ? `<td><input type="checkbox" data-sel${state.sel.has(r.id) ? ' checked' : ''}></td>` : '') +
          (acts.length ? `<td class="acts">${a}</td>` : '') +
          columns.map((c) => `<td class="${['number', 'money'].includes(c.type) ? 'num' : ''}" title="${esc(plain(r, c))}">${cell(r, c)}</td>`).join('') + '</tr>';
      }).join('') : `<tr><td colspan="${columns.length + 2}" class="noresults">No records to display.</td></tr>`;
      tbody.querySelectorAll('tr[data-id]').forEach((tr) => {
        const row = rows.find((r) => String(r.id) === tr.dataset.id);
        tr.querySelectorAll('[data-act]').forEach((a) => a.onclick = () => runAction(acts[+a.dataset.act], row));
        const cb = tr.querySelector('[data-sel]'); if (cb) cb.onchange = () => (cb.checked ? state.sel.add(row.id) : state.sel.delete(row.id));
      });
      const pg = panel.querySelector('.pager');
      pg.innerHTML = `<a class="${state.page ? '' : 'dis'}" data-p="-1">Previous</a><span>Page ${state.page + 1} of ${pages}</span><a class="${state.page < pages - 1 ? '' : 'dis'}" data-p="1">Next</a><span style="margin-left:auto">${rows.length} records</span>`;
      pg.querySelectorAll('[data-p]').forEach((a) => a.onclick = () => { state.page += +a.dataset.p; draw(); });
    }
    function runAction(act, row) {
      if (act.onClick) return act.onClick(row, ctx, api);
      if (act.tab != null && opt.selectTab) return opt.selectTab(act.tab, row);
      if (act.view) return ctx.open(act.view, { id: row.id });
      if (act.edit) return UI.editModal(cfg.table, row, act.edit, act.label, () => { draw(); ctx.refresh && ctx.refresh(); });
      return UI.detailsModal(cfg.title, row, columns);
    }
    draw();
    return api;
  }

  /* ---------- FORM ---------- */
  function fieldHTML(f, val, ctx) {
    const req = f.required ? '<span class="req">*</span>' : '';
    const v = val == null ? '' : val;
    let ctl;
    switch (f.type) {
      case 'textarea': ctl = `<textarea data-f="${f.field}">${esc(v)}</textarea>`; break;
      case 'select': ctl = `<select data-f="${f.field}"><option value=""></option>${opts(f.options, ctx).map((o) => `<option${String(o) === String(v) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select>`; break;
      case 'checkbox': ctl = `<input type="checkbox" data-f="${f.field}"${v ? ' checked' : ''}>`; break;
      case 'readonly': ctl = `<div class="ro" data-f="${f.field}" data-ro>${esc(f.render ? f.render(v, ctx) : v)}</div>`; break;
      case 'date': ctl = `<input type="date" data-f="${f.field}" value="${esc(v ? isoDay(new Date(v)) : '')}">`; break;
      case 'datetime': ctl = `<input type="datetime-local" data-f="${f.field}" value="${esc(v ? new Date(new Date(v) - new Date().getTimezoneOffset() * 6e4).toISOString().slice(0, 16) : '')}">`; break;
      case 'number': ctl = `<input type="number" step="any" data-f="${f.field}" value="${esc(v)}">`; break;
      default: ctl = `<input type="text" data-f="${f.field}" value="${esc(v)}">`;
    }
    return `<div class="fld${f.wide || f.type === 'textarea' ? ' wide' : ''}"><label>${esc(f.label)}${req}</label><div class="ctl">${ctl}</div></div>`;
  }
  function buildForm(sections, record, ctx) {
    const wrap = h('<div></div>');
    sections.forEach((s) => {
      wrap.appendChild(h(`<div class="form-sec"><div class="panel"><div class="panel-head"><span class="ttl">${esc(s.title || '')}</span></div>
        <div class="form-grid">${s.fields.map((f) => fieldHTML(f, record && record[f.field] !== undefined ? record[f.field] : typeof f.default === 'function' ? f.default(ctx) : f.default, ctx)).join('')}</div></div></div>`));
    });
    wrap.read = () => {
      const vals = {}; let missing = [];
      sections.flatMap((s) => s.fields).forEach((f) => {
        const el = wrap.querySelector(`[data-f="${f.field}"]`); if (!el || el.dataset.ro !== undefined) return;
        let v = el.type === 'checkbox' ? el.checked : el.value.trim();
        if (f.type === 'number' && v !== '') v = Number(v);
        if (f.type === 'date' && v) v = new Date(v + 'T00:00:00').toISOString();
        if (f.type === 'datetime' && v) v = new Date(v).toISOString();
        if (f.required && (v === '' || v == null)) missing.push(f.label);
        vals[f.field] = v;
      });
      return { vals, missing };
    };
    return wrap;
  }
  function renderForm(root, cfg, ctx) {
    const rec = ctx.record || null;
    const bar = h(`<div class="panel"><div class="panel-head"><span class="ttl">${esc(cfg.formTitle || (rec ? 'Edit Record' : 'New Record'))}</span>
      <button class="btn primary" data-save>&#128190; ${esc(cfg.saveLabel || 'Save')}</button></div></div>`);
    root.appendChild(bar);
    const form = buildForm(cfg.sections, rec, ctx); root.appendChild(form);
    bar.querySelector('[data-save]').onclick = () => {
      const { vals, missing } = form.read();
      if (missing.length) return UI.toast('Please fill required fields: ' + missing.join(', '), true);
      let saved;
      if (cfg.onSave) saved = cfg.onSave(vals, ctx);
      else if (rec) saved = DB.update(cfg.table, rec.id, vals);
      else saved = DB.insert(cfg.table, vals);
      if (saved === false) return;
      UI.toast(cfg.savedMsg ? cfg.savedMsg(saved) : 'Saved successfully' + (saved && saved.id ? ' — ID ' + saved.id : ''));
      if (cfg.after) cfg.after(saved, ctx); else if (!rec) { root.innerHTML = ''; renderForm(root, cfg, ctx); }
    };
  }

  /* ---------- CHART ---------- */
  const PALETTE = ['#0f766e', '#f59e0b', '#2563eb', '#dc2626', '#7c3aed', '#16a34a', '#db2777', '#0891b2', '#ea580c', '#4f46e5', '#65a30d', '#be123c', '#0d9488', '#ca8a04', '#9333ea', '#475569'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function keyOf(row, by, dateGroup) {
    let k = typeof by === 'function' ? by(row) : row[by];
    if (dateGroup === 'month' && k) { const d = new Date(k); k = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; }
    return k == null || k === '' ? '(blank)' : k;
  }
  function aggregate(rows, c) {
    const groups = {}; const stacks = new Set();
    rows.forEach((r) => {
      const g = keyOf(r, c.groupBy, c.dateGroup); const s = c.stackBy ? keyOf(r, c.stackBy) : (c.label || 'Count');
      stacks.add(s); groups[g] = groups[g] || {}; (groups[g][s] = groups[g][s] || []).push(r);
    });
    let labels = Object.keys(groups).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    if (c.order) labels = c.order.filter((x) => groups[x]).concat(labels.filter((x) => !c.order.includes(x)));
    const val = (rs) => (!rs ? 0 : typeof c.value === 'function' ? c.value(rs) : c.value ? rs.reduce((a, r) => a + (Number(r[c.value]) || 0), 0) : rs.length);
    const series = [...stacks].sort();
    return { labels, series, data: series.map((s) => labels.map((l) => +val(groups[l][s]).toFixed(2))) };
  }
  function renderChart(root, cfg, ctx) {
    const c = cfg.chart;
    const fp = filterPanel(cfg, ctx, (v) => { vals = v; draw(); });
    let vals = {}; if (fp) { root.appendChild(fp); vals = fp.read(); }
    const panel = h(`<div class="panel"><div class="panel-head"><span class="ttl">${esc(cfg.gridTitle || cfg.title)}</span><span class="sp"></span><button class="btn" data-x>XLS</button></div>
      <div class="chart-box"><canvas></canvas></div><div class="ct"></div></div>`);
    root.appendChild(panel);
    let chart; let agg;
    panel.querySelector('[data-x]').onclick = () => {
      const cols = [{ field: 'k', label: 'Group' }, ...agg.series.map((s, i) => ({ field: 's' + i, label: s }))];
      exportCSV(cfg.title, cols, agg.labels.map((l, li) => Object.assign({ k: l }, ...agg.series.map((s, si) => ({ ['s' + si]: agg.data[si][li] })))));
    };
    function draw() {
      const rows = applyFilters(baseRows(cfg, ctx), cfg.filters || [], vals);
      agg = aggregate(rows, c);
      if (c.dateGroup === 'month') agg.labelsShown = agg.labels.map((l) => { const [y, m] = l.split('-'); return m ? `${MONTHS[+m - 1]} ${y}` : l; });
      const kind = c.kind || 'bar';
      const horizontal = kind === 'hbar' || kind === 'hstacked';
      const stacked = kind === 'stacked' || kind === 'hstacked';
      const round = kind === 'pie' || kind === 'doughnut';
      const ds = agg.series.map((s, i) => ({
        label: s, data: agg.data[i], borderWidth: kind === 'line' ? 2 : 0, tension: .3,
        backgroundColor: round ? agg.labels.map((_, j) => PALETTE[j % PALETTE.length]) : PALETTE[i % PALETTE.length],
        borderColor: PALETTE[i % PALETTE.length]
      }));
      if (chart) chart.destroy();
      if (!window.Chart) { panel.querySelector('.chart-box').innerHTML = '<div class="noresults">Chart library could not load (offline?). Data table below.</div>'; }
      else chart = new Chart(panel.querySelector('canvas'), {
        type: round ? kind : kind === 'line' ? 'line' : 'bar',
        data: { labels: agg.labelsShown || agg.labels, datasets: ds },
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: horizontal ? 'y' : 'x',
          plugins: { legend: { display: round || agg.series.length > 1, position: 'right' } },
          scales: round ? {} : { x: { stacked, beginAtZero: true }, y: { stacked, beginAtZero: true } }
        }
      });
      const ct = panel.querySelector('.ct');
      if (cfg.crosstab !== false) {
        const lbls = agg.labelsShown || agg.labels;
        ct.innerHTML = `<div class="grid-wrap"><table class="grid"><thead><tr><th>${esc(c.groupLabel || 'Group')}</th>${agg.series.map((s) => `<th>${esc(s)}</th>`).join('')}${agg.series.length > 1 ? '<th>Total</th>' : ''}</tr></thead><tbody>
        ${lbls.map((l, li) => `<tr><td>${esc(l)}</td>${agg.series.map((s, si) => `<td class="num">${fmtNum(agg.data[si][li], c.value ? 2 : 0)}</td>`).join('')}${agg.series.length > 1 ? `<td class="num"><b>${fmtNum(agg.series.reduce((a, s, si) => a + agg.data[si][li], 0), c.value ? 2 : 0)}</b></td>` : ''}</tr>`).join('') || '<tr><td class="noresults">No records to display.</td></tr>'}
        </tbody></table></div>`;
      }
    }
    draw();
  }

  /* ---------- TABS ---------- */
  function renderTabs(root, cfg, ctx) {
    const bar = h(`<div class="tabs">${cfg.tabs.map((t, i) => `<div class="tab" data-t="${i}">${esc(t.label)}</div>`).join('')}</div>`);
    const body = h('<div></div>');
    root.appendChild(bar); root.appendChild(body);
    let rec = ctx.record || null; let cur = 0;
    function select(i, record) {
      if (record !== undefined) rec = record;
      if (cfg.tabs[i].needsRecord && !rec) return UI.toast('Select a record first.', true);
      cur = i;
      bar.querySelectorAll('.tab').forEach((t, j) => { t.classList.toggle('on', j === i); t.classList.toggle('dis', !!cfg.tabs[j].needsRecord && !rec); });
      body.innerHTML = '';
      const t = cfg.tabs[i];
      const sub = typeof t.view === 'string' ? window.SONU_VIEWS[t.view] : t.view;
      const subctx = Object.assign({}, ctx, { record: t.needsRecord ? (rec && cfg.tabs[i].reload !== false && sub.table ? DB.get(sub.table, rec.id) || rec : rec) : null, selectTab: select });
      if (rec && t.needsRecord) body.appendChild(h(`<div class="legend" style="font-weight:600">Selected: ${esc(cfg.recordLabel ? cfg.recordLabel(rec) : rec.id)}</div>`));
      UI.renderInto(body, sub, subctx, { inTab: true, selectTab: select });
    }
    bar.querySelectorAll('.tab').forEach((t) => t.onclick = () => select(+t.dataset.t));
    select(0);
  }

  /* ---------- other types ---------- */
  function renderKpi(root, cfg, ctx) {
    const rows = baseRows(cfg, ctx);
    root.appendChild(h(`<div class="kpis">${cfg.kpis.map((k) => `<div class="kpi"><b>${esc(k.value(rows, ctx))}</b><span>${esc(k.label)}</span></div>`).join('')}</div>`));
    (cfg.then || []).forEach((sub) => UI.renderInto(root, sub, ctx, { inTab: true }));
  }
  function renderCatalog(root, cfg, ctx) {
    const g = h('<div class="catalog"></div>');
    cfg.items.forEach((it) => {
      const c = h(`<div class="cat-card"><div class="ci">${it.icon || '★'}</div><h4>${esc(it.title)}</h4><p>${esc(it.text || '')}</p></div>`);
      c.onclick = () => (it.onClick ? it.onClick(ctx) : it.view && ctx.open(it.view, it.params || {}));
      g.appendChild(c);
    });
    root.appendChild(g);
  }

  /* ---------- modals ---------- */
  function modal(title, bodyEl, buttons = []) {
    const bg = h(`<div class="modal-bg"><div class="modal"><div class="m-head"><h3>${esc(title)}</h3><button>&times;</button></div><div class="m-body"></div><div class="m-foot"></div></div></div>`);
    bg.querySelector('.m-body').appendChild(bodyEl);
    const close = () => bg.remove();
    bg.querySelector('.m-head button').onclick = close;
    bg.onclick = (e) => { if (e.target === bg) close(); };
    buttons.concat([{ label: 'Close', onClick: close }]).forEach((b) => {
      const el = h(`<button class="btn ${b.cls || ''}">${esc(b.label)}</button>`); el.onclick = () => b.onClick(close); bg.querySelector('.m-foot').appendChild(el);
    });
    document.body.appendChild(bg);
    return close;
  }

  const UI = window.SONU_UI = {
    esc, h, fmtDate, fmtDT, fmtNum, exportCSV, modal, buildForm,
    toast(msg, err) { const t = h(`<div class="toast ${err ? 'err' : ''}">${esc(msg)}</div>`); document.body.appendChild(t); setTimeout(() => t.remove(), 3200); },
    detailsModal(title, row, columns) {
      const cols = columns && columns.length ? columns : Object.keys(row).map((k) => ({ field: k, label: k }));
      modal(title + ' — Details', h(`<div class="detail-grid">${cols.map((c) => `<div><span>${esc(c.label)}</span><b>${cell(row, c) || '&nbsp;'}</b></div>`).join('')}</div>`));
    },
    editModal(table, row, sections, title, after) {
      const f = buildForm(sections, row, {});
      modal(title || 'Edit', f, [{ label: 'Save', cls: 'primary', onClick: (close) => {
        const { vals, missing } = f.read();
        if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
        DB.update(table, row.id, vals); UI.toast('Record ' + row.id + ' updated'); close(); after && after();
      } }]);
    },
    renderInto(root, cfg, ctx, opt = {}) {
      if (!cfg) { root.appendChild(h('<div class="noresults">This view is not available.</div>')); return; }
      if (cfg.intro) root.appendChild(h(`<div class="legend" style="font-weight:400;color:var(--muted)">${cfg.intro}</div>`));
      switch (cfg.type) {
        case 'grid': return renderGrid(root, cfg, ctx, opt);
        case 'form': return renderForm(root, cfg, ctx);
        case 'tabs': return renderTabs(root, cfg, ctx);
        case 'chart': return renderChart(root, cfg, ctx);
        case 'kpi': return renderKpi(root, cfg, ctx);
        case 'catalog': return renderCatalog(root, cfg, ctx);
        case 'custom': return cfg.render(root, ctx);
        default: root.appendChild(h(`<div class="noresults">Unknown view type: ${esc(cfg.type)}</div>`));
      }
    },
    renderView(container, cfg, ctx) {
      container.innerHTML = '';
      const v = h('<div class="view"></div>');
      const head = viewHead(cfg.title);
      head.querySelector('[data-mail]').onclick = () => { location.href = 'mailto:?subject=' + encodeURIComponent('SONU — ' + cfg.title) + '&body=' + encodeURIComponent(location.href); };
      v.appendChild(head);
      container.appendChild(v);
      UI.renderInto(v, cfg, ctx);
    }
  };
})();
