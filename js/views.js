/* SONU views: window.SONU_VIEWS = { viewId: config }. See the VIEW CONFIG CONTRACT in components.js. */
(function () {
  'use strict';
  const UI = window.SONU_UI, esc = UI.esc, DB = window.DB;
  const DAY = 864e5;
  const V = {};

  /* ---------------------------------------------------------- helpers ---------------------------------------------------------- */
  const me = () => { try { return JSON.parse(sessionStorage.getItem('sonu_user') || localStorage.getItem('sonu_user') || 'null') || {}; } catch (e) { return {}; } };
  const nowIso = () => new Date().toISOString();
  const cols = (...specs) => specs.map((s) => { const p = s.split('|'); return { field: p[0], label: p[1], type: p[2] }; });
  const uniq = (t, f) => () => [...new Set(DB.all(t).map((r) => r[f]).filter((x) => x !== '' && x != null))].sort();
  const siteOpts = uniq('sites', 'id'), bldOpts = uniq('buildings', 'id'), tradeOpts = uniq('trades', 'id'), teamOpts = uniq('work_teams', 'id');
  const fT = (field, label) => ({ field, label, type: 'text' });
  const fS = (field, label, options) => ({ field, label, type: 'select', options });
  const fD = (field, label, def) => ({ field, label, type: 'daterange', default: def });
  const fC = (field, label, def) => ({ field, label, type: 'checkbox', default: def });
  const fYN = (field, label, fn) => ({ field, label, type: 'select', options: ['Yes', 'No'], test: (r, v) => !v || (v === 'Yes') === !!fn(r) });
  const PRIO = ['1', '2', '3', '4', '5'];
  const WR_STATUS = ['Requested', 'Reviewed but On Hold', 'Rejected', 'Approved', 'Assigned to Work Order', 'Issued and In Process', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor', 'Stopped', 'Cancelled', 'Completed', 'Closed', 'Contractor Completed'];
  const PTW_STATUS = ['Requested', 'Applied', 'Authorized', 'Issued', 'Completed By Applicant', 'Completed By Controller', 'Re Issued', 'Waiting For Re Issuing', 'Closed', 'Rejected'];
  const PTW_NEXT = { Requested: ['Applied', 'Rejected'], Applied: ['Authorized', 'Rejected'], Authorized: ['Issued', 'Rejected'], Issued: ['Completed By Applicant', 'Waiting For Re Issuing'], 'Re Issued': ['Completed By Applicant', 'Waiting For Re Issuing'], 'Waiting For Re Issuing': ['Re Issued'], 'Completed By Applicant': ['Completed By Controller'], 'Completed By Controller': ['Closed'] };
  const CLOSED_WR = ['Completed', 'Closed', 'Cancelled', 'Rejected', 'Contractor Completed'];
  const isOpen = (r) => !CLOSED_WR.includes(r.status);
  const isOverdue = (r) => isOpen(r) && r.date_agreed_target && Date.parse(r.date_agreed_target) < Date.now();
  const doneAt = (r) => r.date_contractor_completed || r.date_completed;
  const onTime = (r) => Date.parse(doneAt(r)) <= Date.parse(r.date_agreed_target);
  const avg = (rs, f) => (rs.length ? +(rs.reduce((a, r) => a + (Number(r[f]) || 0), 0) / rs.length).toFixed(2) : 0);
  const sum = (rs, fn) => rs.reduce((a, r) => a + (fn(r) || 0), 0);
  const thisMonth = (v) => { if (!v) return false; const d = new Date(v), n = new Date(); return d.getFullYear() === n.getFullYear() && d.getMonth() === n.getMonth(); };
  const refresh = (api) => { if (api && api.refresh) api.refresh(); };
  const WRX = (w) => Object.assign({}, w, { wr_priority: w.priority, wr_status: w.status, wr_code: w.id });

  function fmt(row, c) {
    if (c.render) return c.render(row);
    const v = row[c.field];
    switch (c.type) {
      case 'date': return esc(UI.fmtDate(v));
      case 'datetime': return esc(UI.fmtDT(v));
      case 'money': return esc(UI.fmtNum(v, 2));
      case 'number': return esc(UI.fmtNum(v));
      case 'bool': return v ? 'Yes' : 'No';
      default: return esc(v == null ? '' : v);
    }
  }
  function kvPanel(title, row, columns) {
    const w = UI.h(`<div class="panel"><div class="panel-head"><span class="ttl">${esc(title)}</span></div></div>`);
    w.appendChild(UI.h(`<div class="detail-grid">${columns.map((c) => `<div><span>${esc(c.label)}</span><b>${fmt(row, c) || '&nbsp;'}</b></div>`).join('')}</div>`));
    return w;
  }
  function formModal(title, sections, onSave, rec) {
    const f = UI.buildForm(sections, rec || null, { user: me() });
    UI.modal(title, f, [{ label: 'Save', cls: 'primary', onClick: (close) => {
      const r = f.read();
      if (r.missing.length) return UI.toast('Please fill: ' + r.missing.join(', '), true);
      if (onSave(r.vals) === false) return;
      close();
    } }]);
  }
  const confirmAct = (msg, fn) => { if (typeof confirm !== 'function' || confirm(msg)) fn(); };

  function newWr(o) {
    const b = DB.get('buildings', o.bl_id) || {};
    return DB.insert('wr', Object.assign({
      action_item_id: 2000000 + Math.floor(Math.random() * 989999 + 10000), date_requested: nowIso(), requestor: '', requestor_username: '', site_id: b.site_id || '', bl_id: '', bl_name: b.name || '', fl_id: 'GF',
      prob_type: 'GSER', description: '', priority: 3, status: 'Requested', wr_type: 'On Demand', pm_procedure: '', date_review_confirmed: null, date_assigned: null, date_to_perform: null,
      date_agreed_target: null, date_contractor_completed: null, date_completed: null, work_team: '', cause_type: '', repair_type: '', account_code: '', eq_id: '', eq_name: '', eq_std: '', criticality: '',
      request_nature: 'Service Request', ptw_id: '', ptw_status: '', est_cost: 0, act_cost: 0, est_hours: 0, act_hours: 0, has_rfe: false, completion_feedback: '', reason_non_completion: '',
      assigned_to_me: false, substitute: false, craftsperson: ''
    }, o));
  }
  /* ---------------------------------------------------------- shared columns ---------------------------------------------------------- */
  const WR_COLS = cols('action_item_id|Action Item Id', 'date_requested|Date Requested|date', 'requestor|Requestor', 'site_id|Site Code', 'bl_id|Building Code', 'bl_name|Building Name', 'prob_type|Problem Type', 'pm_procedure|PM Procedure', 'description|Description', 'priority|Priority', 'status|Status', 'wr_code|Work Request Code', 'wr_priority|Work Request Priority', 'wr_status|Work Request Status|status', 'date_review_confirmed|Date Review Confirmed|date', 'date_to_perform|Date to Perform|date', 'date_agreed_target|Agreed Target Date|date', 'date_contractor_completed|Contractor Date Completed|date', 'date_completed|Date Work Completed|date', 'work_team|Work Team Code', 'reason_non_completion|Reason for Non-Completion', 'cause_type|Cause Type', 'repair_type|Repair Type', 'account_code|Account Code', 'eq_id|Equipment Code', 'eq_name|Equipment Name', 'eq_std|Equipment Standard', 'criticality|Criticality', 'request_nature|Request Nature', 'ptw_id|PTW Ref No', 'ptw_status|PTW Status', 'completion_feedback|Completion Feedback');
  const WR_SHORT = cols('id|Work Request Code', 'date_requested|Date Requested|date', 'site_id|Site Code', 'bl_id|Building Code', 'prob_type|Problem Type', 'description|Description', 'priority|Priority', 'status|Status|status', 'work_team|Work Team', 'date_agreed_target|Agreed Target|date', 'ptw_id|PTW Ref No');

  const WR_SECTIONS_UPDATE = [{ title: 'Update Work Request', fields: [
    { field: 'status', label: 'Status', type: 'select', options: WR_STATUS },
    { field: 'act_hours', label: 'Actual Hours', type: 'number' }, { field: 'act_cost', label: 'Actual Cost', type: 'number' },
    { field: 'cause_type', label: 'Cause Type', type: 'select', options: ['Normal Wear', 'Age', 'Misuse', 'Vandalism', 'Design Defect', 'Poor Maintenance', 'Weather'] },
    { field: 'repair_type', label: 'Repair Type', type: 'select', options: ['Repair', 'Replace', 'Adjust', 'Clean', 'Inspect', 'Reset'] },
    { field: 'date_contractor_completed', label: 'Contractor Completed Date', type: 'date' },
    { field: 'completion_feedback', label: 'Completion Feedback', type: 'textarea' }] }];

  /* ---------------------------------------------------------- Work request review / console ---------------------------------------------------------- */
  const wrReviewFilters = () => [
    fD('date_requested', 'Date Requested', 'This Month'), fD('date_review_confirmed', 'Date Review Confirmed'), fD('date_completed', 'Date Completed'),
    fD('date_agreed_target', 'Agreed Target Date'), fD('date_contractor_completed', 'Contractor Completed Date'),
    fS('status', 'Work Request Status', WR_STATUS), fT('work_team', 'Work Team Code')];
  V['wr-review'] = {
    type: 'grid', title: 'Review Work Requests', gridTitle: 'Work Requests', table: 'wr', rows: () => DB.all('wr').map(WRX),
    where: (r, ctx) => r.wr_type === 'On Demand' && (!ctx || !ctx.params || !ctx.params.bl_id || r.bl_id === ctx.params.bl_id),
    filters: wrReviewFilters(), columns: WR_COLS, rowActions: [{ label: 'Details', details: true }], sort: { field: 'date_requested', dir: 'desc' }
  };
  V['wr-console'] = Object.assign({}, V['wr-review'], { title: 'Work Requests Console - On Demand + PM', gridTitle: 'Work Requests', where: () => true, filters: wrReviewFilters() });

  /* ---------------------------------------------------------- PTW ---------------------------------------------------------- */
  const sod = (v) => { const d = new Date(v); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const ptwDays = (r) => Math.round((sod(r.date_upto) - sod(Date.now())) / DAY); // whole days from today to validity end
  // Row colours: skip Closed / Waiting For Re Issuing; 0 <= d < 3 orange; d < 0 without date_end red; d < 0 with date_end blue.
  const ptwRowClass = (r) => {
    if (!r.date_upto || r.status === 'Closed' || r.status === 'Waiting For Re Issuing') return '';
    const d = ptwDays(r);
    if (d >= 0 && d < 3) return 'row-orange';
    if (d < 0) return r.date_end ? 'row-blue' : 'row-red';
    return '';
  };
  const swatch = (c, t) => `<div><span style="display:inline-block;width:12px;height:12px;background:${c};border-radius:2px;margin-right:6px;vertical-align:middle"></span>${t}</div>`;
  const PTW_LEGEND = swatch('#ef4444', 'Permit validity has expired.') + swatch('#f59e0b', 'Permit expires within 2 days.') + swatch('#3b82f6', 'Permit was stopped / ended (end date set).');
  const userOf = (ctx) => (ctx && ctx.user && ctx.user.username ? ctx.user : me());
  const WR_READY = ['Contractor Completed', 'Completed', 'Closed'];
  const wrsByPtw = () => { const m = {}; DB.all('wr').forEach((w) => { if (w.ptw_id) (m[w.ptw_id] = m[w.ptw_id] || []).push(w); }); return m; };
  // permit rows enriched with the linked work request codes and "ready for applicant closure"
  const ptwRows = () => { const m = wrsByPtw(); return DB.all('ptw').map((p) => { const ws = m[p.id] || []; return Object.assign({}, p, { wr_ids: ws.map((w) => w.id).join(', '), ready_for_closure: ws.some((w) => WR_READY.includes(w.status)) }); }); };
  const WHO = { Requestor: 'created_by', Applicant: 'applicant_username', Controller: 'controller_username', Authority: 'authority_username', 'Building Focal Point': 'blfp_username', 'TRAM Reviewer': 'tram_username' };
  const withTest = (f, test) => Object.assign(f, { test });
  const ptwFilters = (more) => [
    { field: 'who', label: 'Who Are You?', type: 'select', options: ['All'].concat(Object.keys(WHO)), test: (r, v) => !v || v === 'All' || r[WHO[v]] === me().username },
    withTest(fC('ready_for_closure', 'Ready for Applicant Closure'), (r, v) => !v || r.ready_for_closure),
    withTest(fC('daily_endorsement_needed', 'Need Daily Endorsement'), (r, v) => !v || r.daily_endorsement_needed === 'Yes'),
    withTest(fC('blfp_endorsement_pending', 'Waiting for BLFP Endorsement'), (r, v) => !v || !!r.blfp_endorsement_pending),
    withTest(fC('hsse', 'HSSE Permits'), (r, v) => !v || Number(r.priority) === 2),
    withTest(fC('include_closed', 'Include Closed / Rejected'), (r, v) => v || !['Closed', 'Rejected'].includes(r.status)),
    fT('id', 'Permit to Work Code'), fS('status', 'Permit to Work Status', PTW_STATUS), fT('project_code', 'Project'), fT('bl_id', 'Building Code'), fT('site_id', 'Site Code'), fT('wr_ids', 'Work Request Code'),
    fD('date_start', 'PTW Start Date From/To'), fD('date_upto', 'Valid Until From/To')].concat(more || []);
  const PTW_COLS = cols('id|Permit to Work Code', 'wr_ids|Work Request Code', 'project_code|Project', 'site_id|Site Code', 'bl_id|Building Code', 'work_type|Work Type', 'applicant|Applicant', 'controller_username|Controller', 'authority_username|Authority',
    'date_created|Date Created|date', 'date_start|Start Date|datetime', 'date_upto|Valid Until|datetime', 'date_end|End Date|datetime', 'date_issued|Date Issued|datetime', 'status|Status|status', 'description|Description');
  const PTW_ALL_COLS = cols('id|Permit to Work Code', 'wr_ids|Work Request Code', 'project_code|Project Code', 'site_id|Site Code', 'site_name|Site Name', 'bl_id|Building Code', 'bl_name|Building Name', 'fl_id|Floor', 'zone|Zone Name', 'work_type|Work Type', 'status|Status|status', 'priority|Priority',
    'applicant|Applicant', 'controller_username|Controller', 'authority_username|Authority', 'blfp_username|Building Focal Point', 'tram_username|TRAM Reviewer', 'contractor|Contractor', 'requestor_phone|Phone', 'work_team|Work Team Code',
    'date_created|Date Created|datetime', 'date_start|Start Date|datetime', 'date_upto|Valid Until|datetime', 'date_end|End Date|datetime', 'date_issued|Date Issued|datetime', 'date_closed|Date Closed|datetime', 'processing_days|Processing Days|number',
    'daily_endorsement_needed|Daily Endorsement', 'blfp_endorsement_pending|BLFP Endorsement Pending|bool', 'reject_reason|Reject Reason', 'description|Description');
  const reasonModal = (title, label, fn) => formModal(title, [{ title: label, fields: [{ field: 'reason', label, type: 'textarea', required: true }] }], (v) => fn(String(v.reason).trim()));

  function ptwSelectGrid(extra) {
    return {
      type: 'grid', title: 'View PTW Request', gridTitle: 'Click Permit to Work Code and navigate to PTW details for status changes, RENEW, STOP and PRINT functions', table: 'ptw',
      rows: ptwRows, where: (r, ctx) => !extra || extra(r, ctx), indexField: 'id', legend: PTW_LEGEND, rowClass: ptwRowClass, columns: PTW_COLS, sort: { field: 'date_created', dir: 'desc' },
      filters: ptwFilters(),
      rowActions: [{ label: 'Open', tab: 1 }, { label: 'History', tab: 2 }, { label: 'WR', tab: 3, show: (r) => !!r.wr_ids }, { label: 'ISO', tab: 4 }, { label: 'Messages', tab: 5 }]
    };
  }
  const roDT = (field, label) => ({ field, label, type: 'readonly', render: (v) => UI.fmtDT(v) });
  const roF = (field, label) => ({ field, label, type: 'readonly' });
  const PTW_FORM = {
    type: 'form', title: 'PTW Details', table: 'ptw', formTitle: 'Permit to Work Details', saveLabel: 'Save Changes',
    sections: [
      { title: 'Permit', fields: [
        roF('id', 'Permit to Work Code'), roF('status', 'Status'), roF('project_code', 'Project'), roF('applicant', 'Applicant'), roF('controller_username', 'Controller'), roF('authority_username', 'Authority'),
        roF('site_id', 'Site Code'), roF('bl_id', 'Building Code'), roF('fl_id', 'Floor'), roF('priority', 'Priority'),
        { field: 'work_type', label: 'Work Type', type: 'select', options: ['Hot Work', 'Cold Work', 'Work at Height', 'Confined Space', 'Electrical Isolation', 'Excavation'] },
        { field: 'zone', label: 'Zone', type: 'select', options: ['Zone A', 'Zone B', 'Zone C', 'Zone D'] }, { field: 'requestor_phone', label: 'Applicant Phone', type: 'text' }] },
      { title: 'Validity', fields: [roDT('date_start', 'Start Date'), roDT('date_upto', 'Valid Until'), roDT('date_end', 'End Date'), roDT('date_issued', 'Date Issued'),
        { field: 'daily_endorsement_needed', label: 'Needs Daily Endorsement', type: 'select', options: ['Yes', 'No'] }] },
      { title: 'Work Description', fields: [{ field: 'description', label: 'Description', type: 'textarea' }] }],
    onSave: (vals, ctx) => DB.update('ptw', ctx.record.id, vals),
    after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(1, DB.get('ptw', saved.id)); }
  };
  function ptwDetailsView() {
    return {
      type: 'custom', title: 'PTW Details', table: 'ptw',
      render: (root, ctx) => {
        const p = DB.get('ptw', ctx.record.id); const u = userOf(ctx);
        const bar = UI.h(`<div class="panel"><div class="panel-head"><span class="ttl">Permit ${esc(p.id)} &mdash; ${esc(p.status)}</span><span class="sp"></span></div></div>`);
        const head = bar.querySelector('.panel-head');
        const add = (label, fn, cls) => { const b = UI.h(`<button class="btn ${cls || ''}">${esc(label)}</button>`); b.onclick = fn; head.appendChild(b); };
        const done = (msg) => { UI.toast(msg); if (ctx.selectTab) ctx.selectTab(1, DB.get('ptw', p.id)); else ctx.refresh(); };
        // show only the steps this user may take (same rule as the server: applicant side vs controller/authority side)
        const isSup = ['Supervisor', 'Administrator'].includes(u.role);
        const isApplicant = p.applicant_username === u.username || p.created_by === u.username;
        const APPLICANT_STEPS = ['Applied', 'Completed By Applicant', 'Waiting For Re Issuing'];
        (PTW_NEXT[p.status] || []).filter((to) => isSup || (isApplicant && APPLICANT_STEPS.includes(to))).forEach((to) => {
          if (to === 'Rejected') add('Reject', () => reasonModal('Reject permit ' + p.id, 'Reason for rejection', (reason) => { if (!DB.action('ptw', p.id, 'transition', { to, reason })) return false; done('Permit ' + p.id + ' rejected'); }));
          else add(to, () => confirmAct('Change permit ' + p.id + ' to "' + to + '"?', () => { if (DB.action('ptw', p.id, 'transition', { to })) done('Permit ' + p.id + ': ' + to); }), 'primary');
        });
        if (['Issued', 'Re Issued'].includes(p.status) && (isApplicant || isSup)) add('Renew', () => formModal('Request re-issue of ' + p.id, [{ title: 'Renew', fields: [{ field: 'date_upto', label: 'Requested valid until', type: 'date', required: true, default: new Date(Math.max(Date.parse(p.date_upto) || 0, Date.now()) + 7 * DAY).toISOString() }] }],
          (v) => { if (!DB.action('ptw', p.id, 'renew', { date_upto: v.date_upto })) return false; done('Re-issue requested for permit ' + p.id); }));
        if (isSup && !p.date_end && ['Issued', 'Re Issued'].includes(p.status)) add('Stop', () => reasonModal('Stop permit ' + p.id, 'Reason for stopping', (reason) => { if (!DB.action('ptw', p.id, 'stop', { reason })) return false; done('Permit ' + p.id + ' stopped'); }));
        add('Print', () => window.print());
        root.appendChild(bar);
        UI.renderInto(root, PTW_FORM, ctx);
      }
    };
  }
  const ptwTabs = (title, extra) => ({
    type: 'tabs', title, recordLabel: (r) => r.id + ' — ' + (r.description || ''),
    tabs: [
      { label: 'Select', view: ptwSelectGrid(extra) },
      { label: 'PTW Details', needsRecord: true, view: ptwDetailsView() },
      { label: 'PTW History', needsRecord: true, view: { type: 'grid', title: 'PTW History', gridTitle: 'PTW History', rows: (ctx) => ((ctx.record && ctx.record.history) || []).map((h, i) => Object.assign({ id: i + 1 }, h)), columns: cols('date|Date|datetime', 'action|Action', 'to|Status', 'by|By'), pageSize: 20 } },
      { label: 'Original Work Requests', needsRecord: true, view: { type: 'grid', title: 'Original Work Requests', gridTitle: 'Original Work Requests', table: 'wr', rows: (ctx) => DB.all('wr').filter((w) => ctx.record && String(w.ptw_id) === String(ctx.record.id)), columns: WR_SHORT, rowActions: [{ label: 'Details', details: true }] } },
      { label: 'ISO/De-ISO', needsRecord: true, view: { type: 'grid', title: 'ISO/De-ISO', gridTitle: 'ISO / De-ISO Requests', table: 'iso', rows: (ctx) => DB.all('iso').filter((i) => ctx.record && String(i.ptw_id) === String(ctx.record.id)), columns: cols('id|ID', 'wr_id|Work Request', 'system|System', 'point|Isolation Point', 'isolation_type|Type', 'status|Status|status', 'requested_by|Requested By', 'date_requested|Requested|datetime') } },
      { label: 'Communication', needsRecord: true, view: {
        type: 'custom', title: 'Communication', render: (root, ctx) => {
          const box = UI.h('<div></div>'); root.appendChild(box);
          const draw = () => {
            const p = DB.get('ptw', ctx.record.id); const list = p.communications || [];
            box.innerHTML = '';
            box.appendChild(UI.h(`<div class="panel"><div class="panel-head"><span class="ttl">Messages for ${esc(p.id)}</span></div><div class="grid-wrap"><table class="grid"><thead><tr><th>Date</th><th>From</th><th>Message</th></tr></thead><tbody>${list.length ? list.map((m) => `<tr><td>${esc(UI.fmtDT(m.date))}</td><td>${esc(m.from)}</td><td>${esc(m.message)}</td></tr>`).join('') : '<tr><td colspan="3" class="noresults">No messages yet.</td></tr>'}</tbody></table></div></div>`));
            const f = UI.h('<div class="panel"><div class="panel-head"><span class="ttl">Add message</span><button class="btn primary" data-add>Add message</button></div><div class="form-grid"><div class="fld wide"><label>Message</label><div class="ctl"><textarea></textarea></div></div></div></div>');
            f.querySelector('[data-add]').onclick = () => {
              const t = f.querySelector('textarea').value.trim(); if (!t) return UI.toast('Please type a message.', true);
              if (!DB.update('ptw', p.id, { communications: (DB.get('ptw', p.id).communications || []).concat({ date: nowIso(), from: ctx.user.name, message: t }) })) return;
              UI.toast('Message added'); draw();
            };
            box.appendChild(f);
          };
          draw();
        } } }
    ]
  });
  V['ptw-manage'] = ptwTabs('View PTW Request');
  V['ptw-my-pool'] = ptwTabs('Manage My PTWs (My Pool)', (r) => r.applicant_username === me().username);

  // permits with no work request that were completed by the applicant: controller confirms, then the permit is closed
  V['ptw-closure'] = {
    type: 'grid', title: 'PTWs Without WR for Closure', gridTitle: 'Permits without a Work Request ready for closure', table: 'ptw', rows: ptwRows, indexField: 'id', legend: PTW_LEGEND, sort: { field: 'date_created', dir: 'desc' },
    where: (r, ctx) => !r.wr_ids && ['Completed By Applicant', 'Completed By Controller'].includes(r.status) && (!ctx || !ctx.user || ctx.user.role !== 'Contractor' || r.applicant_username === ctx.user.username),
    columns: PTW_COLS, rowClass: ptwRowClass,
    filters: [fT('id', 'Permit to Work Code'), fT('site_id', 'Site Code'), fD('date_upto', 'Valid Until')],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Confirm Completion', show: (r) => r.status === 'Completed By Applicant', onClick: (row, ctx, api) => confirmAct('Confirm completion of permit ' + row.id + '?', () => { if (DB.action('ptw', row.id, 'transition', { to: 'Completed By Controller' })) { UI.toast('Permit ' + row.id + ' completion confirmed'); refresh(api); } }) },
      { label: 'Close Permit', show: (r) => r.status === 'Completed By Controller', onClick: (row, ctx, api) => confirmAct('Close permit ' + row.id + '?', () => { if (DB.action('ptw', row.id, 'transition', { to: 'Closed' })) { UI.toast('Permit ' + row.id + ' closed'); refresh(api); } }) }]
  };

  /* ---- Create PTW ---- */
  const projLabel = (p) => p.id + ' - ' + p.name;
  const deptLabel = (d) => d.id + ' - ' + d.name;
  const codeOf = (label) => String(label || '').split(' - ')[0];
  const activeSiteIds = () => DB.all('sites').filter((s) => s.status !== 'In-Active').map((s) => s.id);
  function renderPtwRequest(root, ctx) {
    const u = userOf(ctx);
    const secs = [
      { title: 'Requestor', fields: [
        { field: 'project', label: 'Project', type: 'select', required: true, options: () => DB.all('projects').map(projLabel) }, { field: 'requestor_phone', label: 'Requestor Phone', type: 'text', default: u.phone },
        { field: 'requested_by', label: 'Requested By', type: 'readonly', default: u.username }, { field: 'name', label: 'Name', type: 'readonly', default: u.name }, { field: 'position', label: 'Position', type: 'readonly', default: u.position }] },
      { title: 'Work Location', fields: [
        { field: 'site_id', label: 'Site Code', type: 'select', required: true, options: activeSiteIds }, { field: 'bl_id', label: 'Building Code', type: 'select', required: true, options: [] },
        { field: 'fl_id', label: 'Floor Code', type: 'select', options: [] }, { field: 'apt_id', label: 'Apartment (Suite) Code', type: 'text' }, { field: 'rm_id', label: 'Room Code', type: 'text' }] },
      { title: 'Department', fields: [
        { field: 'department', label: 'Department', type: 'select', required: true, options: () => DB.all('departments').map(deptLabel) }, { field: 'division', label: 'Division', type: 'readonly' }] },
      { title: 'Description', fields: [{ field: 'request_type', label: 'Request Type', type: 'readonly', default: 'SERVICE DESK - PTW' }, { field: 'description', label: 'Description', type: 'textarea', required: true }] }];
    const bar = UI.h('<div class="panel"><div class="panel-head"><span class="ttl">PTW Request</span><button class="btn primary" data-save>&#128190; Save &amp; Continue</button></div></div>');
    const form = UI.buildForm(secs, null, ctx);
    root.appendChild(bar); root.appendChild(form);
    const q = (f) => form.querySelector('[data-f="' + f + '"]');
    const setOpts = (sel, list, val) => { sel.innerHTML = '<option value=""></option>' + list.map((o) => `<option>${esc(o)}</option>`).join(''); sel.value = val && list.includes(val) ? val : ''; };
    const fillBld = (val) => setOpts(q('bl_id'), DB.all('buildings').filter((b) => b.site_id === q('site_id').value).map((b) => b.id), val);
    const fillFl = (val) => setOpts(q('fl_id'), DB.all('floors').filter((f) => f.bl_id === q('bl_id').value).map((f) => f.fl_id), val);
    q('project').onchange = () => {
      const p = DB.all('projects').find((x) => projLabel(x) === q('project').value); if (!p) return;
      if (!activeSiteIds().includes(p.site_id)) { UI.toast('The site of this project is not active.', true); return; }
      q('site_id').value = p.site_id; fillBld(p.bl_id); fillFl();
    };
    q('site_id').onchange = () => { fillBld(); fillFl(); };
    q('bl_id').onchange = () => fillFl();
    q('department').onchange = () => { const d = DB.get('departments', codeOf(q('department').value)); const dv = d && DB.get('divisions', d.dv_id); q('division').textContent = dv ? dv.id + ' - ' + dv.name : ''; };
    fillBld(); fillFl();
    bar.querySelector('[data-save]').onclick = () => {
      const { vals, missing } = form.read();
      if (missing.length) return UI.toast('Please fill required fields: ' + missing.join(', '), true);
      const s = DB.get('sites', vals.site_id) || {}; const b = DB.get('buildings', vals.bl_id) || {}; const d = DB.get('departments', codeOf(vals.department)) || {}; const t = Date.now();
      const saved = DB.insert('ptw', {
        project_code: codeOf(vals.project), site_id: vals.site_id, site_name: s.name || '', bl_id: vals.bl_id, bl_name: b.name || '', fl_id: vals.fl_id || '', apt_id: vals.apt_id || '', rm_id: vals.rm_id || '',
        description: vals.description, dp_id: d.id || '', dv_id: d.dv_id || '', priority: 1, requestor_phone: vals.requestor_phone || '', status: 'Requested',
        date_created: new Date(t).toISOString(), date_start: new Date(t + DAY).toISOString(), date_upto: new Date(t + 3 * DAY).toISOString(), date_end: null, date_issued: null,
        work_type: 'Cold Work', zone: 'Zone A', applicant: u.name, applicant_username: u.username, created_by: u.username, contractor: u.company || '', work_team: '',
        daily_endorsement_needed: 'No', blfp_endorsement_pending: false, reject_reason: '', processing_days: null, date_closed: null,
        history: [{ date: new Date(t).toISOString(), action: 'Permit requested', to: 'Requested', by: u.name }], communications: []
      });
      if (!saved) return;
      UI.toast('Permit ' + saved.id + ' created');
      if (ctx.selectTab) ctx.selectTab(1, saved); else ctx.open('ptw-manage');
    };
  }
  V['ptw-create'] = {
    type: 'tabs', title: 'Create Permit to Work', recordLabel: (r) => r.id,
    tabs: [
      { label: 'PTW Request', view: { type: 'custom', title: 'PTW Request', table: 'ptw', render: renderPtwRequest } },
      { label: 'PTW Details', needsRecord: true, view: {
        type: 'form', title: 'PTW Details', table: 'ptw', formTitle: 'PTW Details', saveLabel: 'Save & Continue',
        sections: [
          { title: 'Permit', fields: [
            { field: 'id', label: 'Permit to Work Code', type: 'readonly' },
            { field: 'work_type', label: 'Work Type', type: 'select', required: true, options: ['Hot Work', 'Cold Work', 'Work at Height', 'Confined Space', 'Electrical Isolation', 'Excavation'] },
            { field: 'date_start', label: 'Start Date', type: 'datetime' }, { field: 'date_upto', label: 'Valid Until', type: 'datetime' }, { field: 'zone', label: 'Zone', type: 'select', options: ['Zone A', 'Zone B', 'Zone C', 'Zone D'] }] },
          { title: 'Hazards', fields: [
            { field: 'hz_electrical', label: 'Electrical', type: 'checkbox' }, { field: 'hz_height', label: 'Work at height', type: 'checkbox' }, { field: 'hz_confined', label: 'Confined space', type: 'checkbox' },
            { field: 'hz_hot', label: 'Hot work / fire', type: 'checkbox' }, { field: 'hz_chemical', label: 'Chemicals', type: 'checkbox' }] }],
        onSave: (vals, ctx) => DB.update('ptw', ctx.record.id, vals),
        after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(2, DB.get('ptw', saved.id)); }
      } },
      { label: 'PTW Request Details', needsRecord: true, view: {
        type: 'custom', title: 'PTW Request Details', table: 'ptw',
        render: (root, ctx) => {
          const p = DB.get('ptw', ctx.record.id);
          root.appendChild(kvPanel('Permit ' + p.id + ' — Summary (read only)', p, cols('id|Permit to Work Code', 'status|Status', 'project_code|Project Code', 'applicant|Requested By', 'requestor_phone|Phone', 'site_id|Site Code', 'bl_id|Building Code', 'fl_id|Floor', 'apt_id|Apartment', 'rm_id|Room', 'dp_id|Department', 'dv_id|Division', 'work_type|Work Type', 'zone|Zone', 'date_start|Start Date|datetime', 'date_upto|Valid Until|datetime', 'description|Description')));
          const b = UI.h('<div class="panel"><div class="panel-head"><span class="ttl">Next steps</span><button class="btn primary" data-go>Go to Manage PTWs</button></div></div>');
          b.querySelector('[data-go]').onclick = () => ctx.open('ptw-my-pool');
          root.appendChild(b);
        } } }
    ]
  };

  V['ptw-details-report'] = {
    type: 'grid', title: 'PTW Details', gridTitle: 'Permit to Work Details', table: 'ptw', rows: ptwRows, indexField: 'id', legend: PTW_LEGEND, columns: PTW_ALL_COLS, rowClass: ptwRowClass, sort: { field: 'date_created', dir: 'desc' },
    filters: ptwFilters([fD('date_created', 'Date Created', 'This Year')]),
    rowActions: [{ label: 'Details', details: true }]
  };

  /* ---- PTW reports ---- */
  const ptwSite = fS('site_id', 'Site Code', siteOpts);
  V['ptw-valid-expired'] = { type: 'chart', title: 'Valid vs. Expired Permits', table: 'ptw', where: (r) => ['Issued', 'Re Issued'].includes(r.status), filters: [ptwSite], chart: { kind: 'stacked', groupBy: 'site_id', stackBy: (r) => (ptwDays(r) < 0 ? 'Expired' : 'Valid'), groupLabel: 'Site' } };
  V['ptw-rejected'] = { type: 'chart', title: 'Rejected Permits', table: 'ptw', where: (r) => r.status === 'Rejected', filters: [ptwSite], chart: { kind: 'bar', groupBy: 'date_created', dateGroup: 'month', stackBy: 'reject_reason', groupLabel: 'Month' } };
  V['ptw-applicant-eval'] = { type: 'chart', title: 'Applicant Evaluation', gridTitle: 'Permits closed after expiry, by applicant', table: 'ptw', where: (r) => r.date_closed && r.date_upto && Date.parse(r.date_closed) > Date.parse(r.date_upto), filters: [ptwSite, fD('date_closed', 'Date Closed')], chart: { kind: 'hbar', groupBy: 'applicant', label: 'Closed after expiry', groupLabel: 'Applicant' } };
  V['ptw-processing-speed'] = { type: 'chart', title: 'Average Speed of Permit Processing', gridTitle: 'Average processing days by month', table: 'ptw', where: (r) => r.processing_days != null, filters: [ptwSite], chart: { kind: 'line', groupBy: 'date_created', dateGroup: 'month', value: (rs) => avg(rs, 'processing_days'), label: 'Avg processing days', groupLabel: 'Month' } };
  V['ptw-issued-monthly'] = { type: 'chart', title: 'Issued Permits', table: 'ptw', where: (r) => !!r.date_issued, filters: [ptwSite], chart: { kind: 'stacked', groupBy: 'date_issued', dateGroup: 'month', stackBy: 'work_type', groupLabel: 'Month' } };
  V['ptw-closed-monthly'] = { type: 'chart', title: 'Closed Permits', table: 'ptw', where: (r) => !!r.date_closed, filters: [ptwSite], chart: { kind: 'bar', groupBy: 'date_closed', dateGroup: 'month', label: 'Closed permits', groupLabel: 'Month' } };
  V['ptw-by-status'] = { type: 'chart', title: 'View All Permits by Status', table: 'ptw', filters: [ptwSite], chart: { kind: 'doughnut', groupBy: 'status', order: PTW_STATUS, label: 'Permits', groupLabel: 'Status' } };
  V['ptw-by-status-site'] = { type: 'chart', title: 'Permit by Status by Site', table: 'ptw', filters: [fS('site_id', 'Site Code', siteOpts), fS('zone', 'Zone Name', ['Zone A', 'Zone B', 'Zone C', 'Zone D'])], chart: { kind: 'hstacked', groupBy: 'status', order: PTW_STATUS, stackBy: 'site_id', groupLabel: 'Status' } };
  V['ptw-log'] = {
    type: 'grid', title: 'Permit to Work Log', gridTitle: 'Permit to Work Log', table: 'ptw', rows: ptwRows, indexField: 'id', legend: PTW_LEGEND, rowClass: ptwRowClass, sort: { field: 'date_created', dir: 'desc' },
    columns: cols('id|Permit to Work Code', 'date_created|Date Created|datetime', 'project_code|Project', 'site_id|Site Code', 'bl_id|Building Code', 'work_type|Work Type', 'applicant|Applicant', 'controller_username|Controller', 'authority_username|Authority',
      'date_start|Start Date|datetime', 'date_upto|Valid Until|datetime', 'date_end|End Date|datetime', 'date_issued|Date Issued|datetime', 'status|Status|status', 'date_closed|Date Closed|datetime'),
    filters: ptwFilters([fD('date_created', 'Date Created', 'This Month')]), rowActions: [{ label: 'Details', details: true }]
  };

  /* ---------------------------------------------------------- Estimate & schedule ---------------------------------------------------------- */
  // one permit for several selected work requests (server: DB.bulk('ptw','from_wrs'))
  const createPtwFromSelected = (api) => {
    const sel = api.selected(); if (!sel.length) return UI.toast('Select at least one work request.', true);
    const p = DB.bulk('ptw', 'from_wrs', { wr_ids: sel.map((w) => w.id) });
    if (!p) return;
    UI.toast('Permit ' + (p.id || '') + ' created for ' + sel.length + ' work request(s)'); api.refresh();
  };
  V['wr-estimate-schedule'] = {
    type: 'tabs', title: 'Estimate and Schedule Work Requests', recordLabel: (r) => r.id + ' — ' + r.description,
    tabs: [
      { label: 'Select', view: {
        type: 'grid', title: 'Estimate and Schedule', gridTitle: 'My pending estimation / scheduling steps', table: 'wr', selectable: true,
        columns: WR_SHORT.concat(cols('step_type|Pending Step', 'cost_est_total|Total Est. Cost|money', 'has_rfe|RFE|bool', 'ptw_status|PTW Status')),
        where: (r) => !!r.assigned_to_me && !!r.step_type, sort: { field: 'date_requested', dir: 'desc' },
        filters: [fS('prob_type', 'Problem Type', tradeOpts), fT('action_item_id', 'Service Request ID'), fS('site_id', 'Site Code', siteOpts), fS('status', 'Work Request Status', WR_STATUS), fS('ptw_status', 'Permit to Work Status', PTW_STATUS),
          fS('step_type', 'Pending Step', ['estimation', 'scheduling']), fD('date_assigned', 'Date Assigned From/To'), fT('id', 'Work Request Code'), fT('bl_id', 'Building Code'), fT('work_team', 'Work Team Code'),
          fYN('has_rfe', 'With RFE?', (r) => r.has_rfe), fS('priority', 'Work Request Priority', PRIO), fT('eq_id', 'Equipment Code'), fT('eq_std', 'Equipment Standard'), fYN('est_cost_zero', 'Is Estimated Cost Zero?', (r) => Number(r.cost_est_total) === 0)],
        toolbar: [{ label: 'Create PTW', cls: 'primary', onClick: (ctx, api) => createPtwFromSelected(api) }],
        rowActions: [{ label: 'Details', tab: 1 },
          { label: 'Estimate/Schedule', onClick: (row, ctx) => { if (ctx.selectTab) ctx.selectTab(row.step_type === 'estimation' ? 2 : 3, row); } }]
      } },
      { label: 'Details', needsRecord: true, view: { type: 'custom', title: 'Details', table: 'wr', render: (root, ctx) => root.appendChild(kvPanel('Work Request ' + ctx.record.id, WRX(ctx.record), WR_COLS)) } },
      { label: 'Estimate', needsRecord: true, view: {
        type: 'form', title: 'Estimate', table: 'wr', formTitle: 'Estimate Work Request', saveLabel: 'Save Estimate',
        sections: [{ title: 'Estimate', fields: [
          { field: 'id', label: 'Work Request Code', type: 'readonly' }, { field: 'description', label: 'Description', type: 'readonly', wide: true },
          { field: 'est_hours', label: 'Estimated Hours', type: 'number' }, { field: 'est_cost', label: 'Estimated Cost', type: 'number' },
          { field: 'est_trades', label: 'Trades Required', type: 'text' }, { field: 'est_materials', label: 'Materials / Notes', type: 'textarea' }] }],
        onSave: (vals, ctx) => DB.update('wr', ctx.record.id, Object.assign({}, vals, { step_type: null, assigned_to_me: false })),
        savedMsg: (s) => 'Estimate saved for work request ' + s.id,
        after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(0, null); }
      } },
      { label: 'Schedule', needsRecord: true, view: {
        type: 'form', title: 'Schedule', table: 'wr', formTitle: 'Schedule Work Request', saveLabel: 'Save & Assign',
        sections: [{ title: 'Schedule', fields: [
          { field: 'id', label: 'Work Request Code', type: 'readonly' }, { field: 'status', label: 'Current Status', type: 'readonly' },
          { field: 'date_to_perform', label: 'Date to Perform', type: 'date', required: true }, { field: 'date_agreed_target', label: 'Agreed Target Date', type: 'date', required: true },
          { field: 'work_team', label: 'Work Team', type: 'select', options: teamOpts }, { field: 'craftsperson', label: 'Craftsperson', type: 'select', options: uniq('craftspersons', 'name') }] }],
        onSave: (vals, ctx) => DB.update('wr', ctx.record.id, Object.assign({}, vals, { status: 'Assigned to Work Order', date_assigned: nowIso(), step_type: null, assigned_to_me: false })),
        savedMsg: (s) => 'Work request ' + s.id + ' scheduled and assigned to work order',
        after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(0, null); }
      } }
    ]
  };

  /* ---------------------------------------------------------- Issue / edit / resources / hours ---------------------------------------------------------- */
  const PTW_OK = ['Issued', 'Re Issued'];
  // Issue Assigned-to-Work-Order requests; soft gate on the permit (client warns + confirms, server accepts confirm:true)
  function issueWrs(wrs, api) {
    if (!wrs.length) return UI.toast('Select at least one work request.', true);
    const warns = [];
    if (wrs.some((w) => !w.ptw_id)) warns.push('PTW is not created for one of the requests.');
    if (wrs.some((w) => w.ptw_id && !PTW_OK.includes((DB.get('ptw', w.ptw_id) || {}).status))) warns.push('PTW is not issued for one of the work requests.');
    let confirmed = false;
    if (warns.length) { if (typeof confirm === 'function' && !confirm(warns.join('\n') + '\n\nDo you still want to continue?')) return; confirmed = true; }
    const r = DB.bulk('wr', 'issue', { wr_ids: wrs.map((w) => w.id), confirm: confirmed });
    if (!r) return;
    UI.toast(wrs.length + ' work request(s) issued'); api.refresh();
  }
  const issueView = (type, title) => ({
    type: 'grid', title, gridTitle: 'Work Requests ready to start', table: 'wr', selectable: true,
    rows: () => DB.all('wr').map((w) => Object.assign({}, w, { ptw_code: w.ptw_id || '', ptw_state: w.ptw_id ? ((DB.get('ptw', w.ptw_id) || {}).status || w.ptw_status || '') : '' })),
    columns: cols('id|Work Request Code', 'date_requested|Date Requested|date', 'site_id|Site Code', 'bl_id|Building Code', 'prob_type|Problem Type', 'description|Description', 'priority|Priority', 'status|Status|status', 'work_team|Work Team', 'date_agreed_target|Agreed Target|date', 'ptw_code|PTW Code', 'ptw_state|PTW Status|status'),
    where: (r) => r.wr_type === type && r.status === 'Assigned to Work Order', sort: { field: 'date_agreed_target', dir: 'asc' },
    filters: [fT('id', 'Work Request Code'), fS('site_id', 'Site Code', siteOpts), fT('bl_id', 'Building Code'), fS('prob_type', 'Problem Type', tradeOpts), fS('priority', 'Priority', PRIO), fT('ptw_code', 'PTW Code'), fS('ptw_state', 'PTW Status', PTW_STATUS)],
    toolbar: [{ label: 'Create PTW', onClick: (ctx, api) => createPtwFromSelected(api) }, { label: 'Issue Selected', cls: 'primary', onClick: (ctx, api) => issueWrs(api.selected(), api) }],
    rowActions: [{ label: 'Details', details: true }, { label: 'Issue', onClick: (row, ctx, api) => issueWrs([DB.get('wr', row.id) || row], api) }]
  });
  V['wr-issue'] = issueView('On Demand', 'Issue WR - Create E-PTW / Start the Work');
  V['pm-issue'] = issueView('PM', 'Issue WR - Create E-PTW / Start Work');

  const editView = (type, title) => ({
    type: 'grid', title, gridTitle: 'Work Requests in process', table: 'wr', columns: WR_SHORT.concat(cols('act_hours|Actual Hours|number', 'act_cost|Actual Cost|money', 'date_contractor_completed|Contractor Completed|date')),
    where: (r) => r.wr_type === type && ['Issued and In Process', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor', 'Stopped'].includes(r.status), sort: { field: 'date_requested', dir: 'desc' },
    filters: [fT('id', 'Work Request Code'), fS('status', 'Status', WR_STATUS), fS('site_id', 'Site Code', siteOpts), fT('bl_id', 'Building Code'), fD('date_requested', 'Date Requested')],
    rowActions: [{ label: 'Details', details: true }, { label: 'Edit', edit: WR_SECTIONS_UPDATE },
      { label: 'Mark Contractor Completed', onClick: (row, ctx, api) => confirmAct('Mark work request ' + row.id + ' as contractor completed?', () => { DB.update('wr', row.id, { status: 'Contractor Completed', date_contractor_completed: nowIso() }); UI.toast('Work request ' + row.id + ' marked completed'); refresh(api); }) }]
  });
  V['wr-edit-update'] = editView('On Demand', 'Edit / Update WRs');
  V['pm-edit-update'] = editView('PM', 'Edit / Update WRs');

  const RFE_TYPES = ['Material', 'Subcontract', 'Equipment Rental', 'Manpower', 'DEFAULT RFE'];
  // RFE row colours: not done = pending (green); done = orange; done and approved = pink
  const rfeClass = (r) => (!r.is_done ? 'row-rfe-pending' : r.date_approved ? 'row-rfe-approved' : 'row-rfe-done');
  const RFE_LEGEND = '<span class="badge ok">Pending</span> not done &nbsp; <span class="badge warn">Done</span> done, not approved &nbsp; <span class="badge bad">Done and approved</span>';
  const resSections = [{ title: 'Resource', fields: [
    { field: 'resource_type', label: 'Resource Type', type: 'select', required: true, options: RFE_TYPES },
    { field: 'description', label: 'Description', type: 'text', required: true }, { field: 'qty_estimated', label: 'Quantity', type: 'number', required: true }, { field: 'unit_cost', label: 'Unit Cost', type: 'number', required: true }] }];
  const otherResView = (type, title) => ({
    type: 'grid', title, gridTitle: 'Work Request Other Resources', table: 'other_resources', sort: { field: 'date_used', dir: 'desc' }, legend: RFE_LEGEND, rowClass: rfeClass,
    rows: () => DB.all('other_resources').filter((o) => { const w = DB.get('wr', o.wr_id); return w && w.wr_type === type; }),
    columns: cols('id|Other Res. Log ID', 'wr_id|Work Request Code', 'date_used|Date Used|date', 'resource_type|Resource Type', 'description|Description', 'qty_estimated|Quantity|number', 'unit_cost|Unit Cost|money', 'cost_estimated|Cost Estimated|money', 'is_done|Done?|bool', 'status|Status|status', 'date_approved|Date Approved|date'),
    filters: [fT('wr_id', 'Work Request Code'), fS('resource_type', 'Resource Type', RFE_TYPES), fS('status', 'Status', ['Pending', 'Approved', 'Rejected']), fD('date_used', 'Date Used')],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Edit', show: (r) => r.status === 'Pending', onClick: (row, ctx, api) => formModal('Edit resource ' + row.id, resSections, (v) => { if (!DB.update('other_resources', row.id, Object.assign({}, v, { cost_estimated: v.qty_estimated * v.unit_cost }))) return false; UI.toast('Resource updated'); refresh(api); }, row) }],
    toolbar: [{ label: 'Add Resource', cls: 'primary', onClick: (ctx, api) => {
      const wrOpts = () => DB.all('wr').filter((w) => w.wr_type === type && ['Issued and In Process', 'Assigned to Work Order', 'Approved', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor'].includes(w.status)).map((w) => String(w.id));
      formModal('Add Resource', [{ title: 'New Resource', fields: [{ field: 'wr_id', label: 'Work Request Code', type: 'select', required: true, options: wrOpts }].concat(resSections[0].fields) }], (v) => {
        const wid = Number(v.wr_id);
        // server rejects a second DEFAULT RFE for the same work request
        const rec = DB.insert('other_resources', { wr_id: wid, date_used: nowIso(), time_used: new Date().toTimeString().slice(0, 5), description: v.description, resource_type: v.resource_type, qty_estimated: v.qty_estimated, unit_cost: v.unit_cost, cost_estimated: v.qty_estimated * v.unit_cost, status: 'Pending', is_done: false, comments: [], approved_by: '', date_approved: null, variation: false });
        if (!rec) return false;
        UI.toast('Resource added to work request ' + wid); refresh(api);
      });
    } }]
  });
  V['wr-other-resources'] = otherResView('On Demand', 'Update WRs - Other Resources');
  V['pm-other-resources'] = otherResView('PM', 'Update WRs - Other Resources');

  const laborCols = cols('id|ID', 'wr_id|Work Request Code', 'cf_id|Craftsperson Code', 'cf_name|Craftsperson', 'trade|Primary Trade', 'date|Date Scheduled|date', 'hours_straight|Straight Hours|number', 'hours_overtime|Overtime Hours|number', 'site_id|Site Code', 'bl_id|Building Code');
  V['wr-daily-hours'] = {
    type: 'grid', title: 'Update daily labor hours', gridTitle: 'Daily Labor Hours', table: 'labor', columns: laborCols, sort: { field: 'date', dir: 'desc' },
    filters: [fT('cf_id', 'Craftsperson Code'), fS('site_id', 'Site Code', siteOpts), fS('trade', 'Primary Trade', tradeOpts), fD('date', 'Date Scheduled', 'This Month'), fT('bl_id', 'Building Code')],
    rowActions: [{ label: 'Edit', edit: [{ title: 'Edit hours', fields: [{ field: 'date', label: 'Date', type: 'date' }, { field: 'hours_straight', label: 'Straight Hours', type: 'number', required: true }, { field: 'hours_overtime', label: 'Overtime Hours', type: 'number' }] }] },
      { label: 'Delete', onClick: (row, ctx, api) => confirmAct('Delete these labor hours?', () => { DB.remove('labor', row.id); UI.toast('Hours deleted'); refresh(api); }) }],
    toolbar: [{ label: 'Add Hours', cls: 'primary', onClick: (ctx, api) => formModal('Add Hours', [{ title: 'Labor hours', fields: [
      { field: 'wr_id', label: 'Work Request Code', type: 'select', required: true, options: () => DB.all('wr').filter((w) => ['Issued and In Process', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor'].includes(w.status)).map((w) => String(w.id)) },
      { field: 'cf_id', label: 'Craftsperson Code', type: 'select', required: true, options: uniq('craftspersons', 'id') }, { field: 'date', label: 'Date', type: 'date', required: true, default: nowIso() },
      { field: 'hours_straight', label: 'Straight Hours', type: 'number', required: true }, { field: 'hours_overtime', label: 'Overtime Hours', type: 'number', default: 0 }] }], (v) => {
      const w = DB.get('wr', v.wr_id), cf = DB.get('craftspersons', v.cf_id);
      DB.insert('labor', { wr_id: w.id, cf_id: cf.id, cf_name: cf.name, trade: cf.trade, date: v.date, hours_straight: v.hours_straight, hours_overtime: v.hours_overtime || 0, site_id: w.site_id, bl_id: w.bl_id });
      DB.update('wr', w.id, { act_hours: (w.act_hours || 0) + v.hours_straight + (v.hours_overtime || 0) }); UI.toast('Hours added'); refresh(api);
    }) }]
  };
  V['wr-daily-hours-report'] = {
    type: 'kpi', title: 'WRs Daily Hours Report', table: 'labor',
    kpis: [{ label: 'Straight Hours', value: (rs) => sum(rs, (r) => r.hours_straight) }, { label: 'Overtime Hours', value: (rs) => sum(rs, (r) => r.hours_overtime) }, { label: 'Craftspersons', value: (rs) => new Set(rs.map((r) => r.cf_id)).size }, { label: 'Work Requests', value: (rs) => new Set(rs.map((r) => r.wr_id)).size }],
    then: [
      { type: 'chart', title: 'Hours by trade per month', gridTitle: 'Hours by trade per month', table: 'labor', filters: [fS('site_id', 'Site Code', siteOpts), fS('trade', 'Primary Trade', tradeOpts)], chart: { kind: 'stacked', groupBy: 'date', dateGroup: 'month', stackBy: 'trade', value: (rs) => sum(rs, (r) => r.hours_straight + r.hours_overtime), groupLabel: 'Month' } },
      { type: 'grid', title: 'Daily Hours Report', gridTitle: 'Daily Hours Detail', table: 'labor', columns: laborCols, sort: { field: 'date', dir: 'desc' }, filters: [fD('date', 'Date Scheduled', 'This Month'), fS('trade', 'Primary Trade', tradeOpts), fS('site_id', 'Site Code', siteOpts)] }]
  };

  /* ---------------------------------------------------------- RFE ---------------------------------------------------------- */
  const RFE_COLS = cols('id|Other Res. Log ID', 'wr_id|Work Request Code', 'date_used|Date Used|date', 'time_used|Time Used', 'qty_estimated|Quantity Estimated|number', 'resource_type|Resource Type', 'description|Description', 'cost_estimated|Cost Estimated|money', 'is_done|Done?|bool', 'status|Status|status', 'date_approved|Date Approved|date');
  V['rfe-post-box'] = {
    type: 'grid', title: 'Review Pending RFEs for Action', gridTitle: 'Work Request Other Resources Log', table: 'other_resources', indexField: 'id', columns: RFE_COLS, sort: { field: 'date_used', dir: 'desc' }, legend: RFE_LEGEND,
    filters: [withTest(fC('rfe_pending', 'RFE Pending For Action', true), (r, v) => !v || !r.is_done), fT('wr_id', 'Work Request Code'), fS('resource_type', 'Resource Type', RFE_TYPES)],
    rowClass: rfeClass,
    rowActions: [{ label: 'View', details: true },
      { label: 'Add Comment', onClick: (row, ctx, api) => formModal('Add comment to log ' + row.id, [{ title: 'Comment', fields: [{ field: 'text', label: 'Comment', type: 'textarea', required: true }] }], (v) => {
        if (!DB.update('other_resources', row.id, { comments: (DB.get('other_resources', row.id).comments || []).concat({ date: nowIso(), by: ctx.user.name, text: v.text }) })) return false; UI.toast('Comment added'); refresh(api);
      }) },
      { label: 'Done?', show: (r) => !r.is_done, onClick: (row, ctx, api) => confirmAct('Mark RFE ' + row.id + ' as done?', () => { if (DB.action('other_resources', row.id, 'done')) { UI.toast('RFE ' + row.id + ' done'); refresh(api); } }) }]
  };
  V['rfe-approved'] = { type: 'grid', title: 'Review Approved Estimations', gridTitle: 'Approved Estimations', table: 'other_resources', where: (r) => r.status === 'Approved' && !!r.date_approved, indexField: 'id', sort: { field: 'date_approved', dir: 'desc' }, legend: RFE_LEGEND, rowClass: rfeClass,
    columns: RFE_COLS.concat(cols('approved_by|Approved By')), filters: [fT('wr_id', 'Work Request Code'), fD('date_approved', 'Date Approved')], rowActions: [{ label: 'Details', details: true }] };
  V['rfe-pending-report'] = { type: 'grid', title: 'Pending RFE Status Report', gridTitle: 'Pending RFEs (not done)', table: 'other_resources', where: (r) => !r.is_done && r.status !== 'Rejected', sort: { field: 'date_used', dir: 'asc' }, legend: RFE_LEGEND, rowClass: rfeClass,
    columns: RFE_COLS.concat([{ field: 'days_pending', label: 'Days Pending', type: 'number', render: (r) => String(Math.max(0, Math.floor((Date.now() - Date.parse(r.date_used)) / DAY))) }]),
    filters: [fT('wr_id', 'Work Request Code'), fS('resource_type', 'Resource Type', RFE_TYPES), fD('date_used', 'Date Used')], rowActions: [{ label: 'Details', details: true }] };
  V['rfe-line-items'] = { type: 'grid', title: 'RFE Line Items', gridTitle: 'RFE Line Items', table: 'rfe_lines', sort: { field: 'id', dir: 'desc' },
    columns: cols('id|Line ID', 'other_res_id|Other Res. Log ID', 'wr_id|Work Request Code', 'item_code|Item Code', 'description|Description', 'uom|UOM', 'qty|Quantity|number', 'unit_rate|Unit Rate|money', 'amount|Amount|money'),
    filters: [fT('wr_id', 'Work Request Code'), fT('item_code', 'Item Code'), fT('other_res_id', 'Other Res. Log ID')], rowActions: [{ label: 'Details', details: true }] };
  V['boq-details'] = { type: 'grid', title: 'BOQ Details for BPA Release', gridTitle: 'BOQ Items (aggregated by item code)', pageSize: 20,
    rows: () => { const g = {}; DB.all('rfe_lines').forEach((l) => { const x = g[l.item_code] = g[l.item_code] || { id: l.item_code, item_code: l.item_code, description: l.description, uom: l.uom, lines: 0, qty: 0, amount: 0 }; x.lines++; x.qty += l.qty; x.amount += l.amount; }); return Object.keys(g).sort().map((k) => g[k]); },
    columns: cols('item_code|BOQ Item Code', 'description|Description', 'uom|UOM', 'lines|No. of Lines|number', 'qty|Total Quantity|number', 'amount|Total Amount|money'), filters: [fT('item_code', 'BOQ Item Code'), fT('description', 'Description')], rowActions: [{ label: 'Details', details: true }] };
  // total estimated cost of every work request that has at least one RFE awaiting approval
  const awaitingApprovalTotal = () => {
    const ids = new Set(DB.all('other_resources').filter((r) => r.status === 'Pending').map((r) => String(r.wr_id)));
    return DB.all('wr').filter((w) => ids.has(String(w.id))).reduce((s, w) => s + (Number(w.cost_est_total) || 0), 0);
  };
  V['rfe-approval'] = { type: 'grid', title: 'Estimation & Variation Approval',
    get gridTitle() { return 'Total estimated cost of all WRs awaiting approval: QAR ' + UI.fmtNum(awaitingApprovalTotal(), 2); },
    table: 'other_resources', where: (r) => r.status === 'Pending', indexField: 'id', sort: { field: 'date_used', dir: 'asc' }, legend: RFE_LEGEND, rowClass: rfeClass,
    columns: RFE_COLS.concat(cols('variation|Variation|bool')), filters: [fT('wr_id', 'Work Request Code'), fS('resource_type', 'Resource Type', RFE_TYPES), fD('date_used', 'Date Used')],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Approve', show: (r) => ['Supervisor', 'Administrator'].includes(me().role) && r.status === 'Pending', onClick: (row, ctx, api) => { if (DB.action('other_resources', row.id, 'approve')) { UI.toast('Estimation ' + row.id + ' approved'); ctx.refresh(); } } },
      { label: 'Reject', show: (r) => ['Supervisor', 'Administrator'].includes(me().role) && r.status === 'Pending', onClick: (row, ctx, api) => reasonModal('Reject estimation ' + row.id, 'Comment', (comment) => { if (!DB.action('other_resources', row.id, 'reject', { comment })) return false; UI.toast('Estimation ' + row.id + ' rejected'); ctx.refresh(); }) },
      { label: 'Variation', show: (r) => ['Supervisor', 'Administrator'].includes(me().role) && r.status === 'Pending', onClick: (row, ctx, api) => { if (DB.action('other_resources', row.id, 'approve', { variation: true })) { UI.toast('Approved as variation'); ctx.refresh(); } } }] };

  /* ---------------------------------------------------------- Status counts / performance / lists ---------------------------------------------------------- */
  function statusCount(type, title) {
    const filters = [fD('date_requested', 'Date Requested From/To'), fS('prob_type', 'Problem Type', tradeOpts), fS('site_id', 'Site Code', siteOpts), fT('bl_id', 'Building Code'), fS('status', 'Work Request Status', WR_STATUS),
      fT('eq_id', 'Equipment Code'), fT('eq_std', 'Equipment Standard'), fT('work_team', 'Work Team Code'), fS('priority', 'Priority', PRIO)];
    const base = { type: 'chart', table: 'wr', filters, where: (r) => r.wr_type === type };
    return { type: 'tabs', title, tabs: [
      { label: 'No. of Work Requests', view: Object.assign({}, base, { title: 'No. of Work Requests', chart: { kind: 'hbar', groupBy: 'status', label: 'Work Requests', groupLabel: 'Status' } }) },
      { label: 'Bar Chart - No. of Work Requests', view: Object.assign({}, base, { title: 'Bar Chart - No. of Work Requests', chart: { kind: 'bar', groupBy: 'prob_type', label: 'Work Requests', groupLabel: 'Problem Type' }, crosstab: false }) },
      { label: 'Stacked Bar Chart', view: Object.assign({}, base, { title: 'Stacked Bar Chart', chart: { kind: 'stacked', groupBy: 'prob_type', stackBy: 'status', groupLabel: 'Problem Type' } }) },
      { label: 'Status of Open Work Requests', view: Object.assign({}, base, { title: 'Status of Open Work Requests', where: (r) => r.wr_type === type && isOpen(r), chart: { kind: 'hstacked', groupBy: 'site_id', stackBy: 'status', groupLabel: 'Site' } }) }] };
  }
  V['wr-status-count'] = statusCount('On Demand', 'On Demand Work Requests Status Report');
  V['pm-status-count'] = statusCount('PM', 'PM Work Requests Status Report');

  function perfView(title, type) {
    const where = (r) => (!type || r.wr_type === type) && doneAt(r) && r.date_agreed_target;
    const filters = [fD('date_agreed_target', 'Agreed Target Date'), fS('site_id', 'Site Code', siteOpts), fS('prob_type', 'Problem Type', tradeOpts)];
    return { type: 'kpi', title, table: 'wr', where,
      kpis: [{ label: 'Completed Work Requests', value: (rs) => rs.length }, { label: 'Completed On Time', value: (rs) => rs.filter(onTime).length }, { label: 'Completed Late', value: (rs) => rs.filter((r) => !onTime(r)).length },
        { label: 'On-Time %', value: (rs) => (rs.length ? Math.round(rs.filter(onTime).length * 100 / rs.length) + '%' : '0%') }],
      then: [
        { type: 'chart', title: 'On time vs late by month', gridTitle: 'On time vs late by month (agreed target)', table: 'wr', where, filters, chart: { kind: 'stacked', groupBy: 'date_agreed_target', dateGroup: 'month', stackBy: (r) => (onTime(r) ? 'On Time' : 'Late'), groupLabel: 'Month' } },
        { type: 'chart', title: 'On time vs late by site', gridTitle: 'On time vs late by site', table: 'wr', where, filters: [], chart: { kind: 'hstacked', groupBy: 'site_id', stackBy: (r) => (onTime(r) ? 'On Time' : 'Late'), groupLabel: 'Site' } }] };
  }
  V['wr-performance'] = perfView('Work Requests Performance', null);
  V['wr-performance-od'] = perfView('Work Requests Performance - OD', 'On Demand');
  V['wr-performance-ppm'] = perfView('Work Requests Performance - PPM', 'PM');

  const listFilters = () => [fT('id', 'Work Request Code'), fS('site_id', 'Site Code', siteOpts), fT('bl_id', 'Building Code'), fS('prob_type', 'Problem Type', tradeOpts), fS('status', 'Status', WR_STATUS), fD('date_requested', 'Date Requested')];
  function wrListTabs(title, pred, extraCols) {
    const mk = (label, p) => ({ label, view: { type: 'grid', title: label, gridTitle: title, table: 'wr', where: (r) => pred(r) && (p == null || r.priority === p), columns: WR_SHORT.concat(extraCols || []), filters: listFilters(), sort: { field: 'date_requested', dir: 'asc' }, rowActions: [{ label: 'Details', details: true }] } });
    return { type: 'tabs', title, tabs: [mk('All Priorities', null), mk('Priority 1', 1), mk('Priority 2', 2), mk('Priority 3', 3), mk('Priority 4', 4), mk('Priority 5', 5)] };
  }
  const ageCol = { field: 'age', label: 'Age (days)', type: 'number', render: (r) => String(Math.floor((Date.now() - Date.parse(r.date_requested)) / DAY)) };
  V['wr-pending'] = wrListTabs('Pending Work Requests', (r) => ['Requested', 'Reviewed but On Hold', 'Approved', 'Assigned to Work Order'].includes(r.status), [ageCol]);
  V['wr-outstanding'] = wrListTabs('Outstanding Work Requests', isOpen, [ageCol, { field: 'od', label: 'Overdue', render: (r) => (isOverdue(r) ? '<span class="badge bad">Overdue</span>' : '') }]);
  V['wr-outstanding-chart'] = { type: 'chart', title: 'Outstanding Work Requests Chart', table: 'wr', where: isOpen, filters: [fS('site_id', 'Site Code', siteOpts), fS('prob_type', 'Problem Type', tradeOpts), fS('wr_type', 'Type', ['On Demand', 'PM'])], chart: { kind: 'stacked', groupBy: 'site_id', stackBy: 'status', groupLabel: 'Site' } };

  V['pm-forecast'] = {
    type: 'chart', title: 'Forecast and Execution Report', gridTitle: 'Forecast vs Executed PPM activities per month',
    rows: () => { const out = []; DB.all('pm_schedules').forEach((s) => { out.push(Object.assign({}, s, { id: 'F' + s.id, series: 'Forecast' })); if (s.status === 'Executed') out.push(Object.assign({}, s, { id: 'E' + s.id, series: 'Executed' })); }); return out; },
    filters: [fS('site_id', 'Site Code', siteOpts), fS('trade', 'Trade', tradeOpts), fS('frequency', 'Frequency', ['Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual'])],
    chart: { kind: 'bar', groupBy: 'forecast_month', stackBy: 'series', groupLabel: 'Month' }
  };
  V['equipment-list'] = { type: 'grid', title: 'Equipment List', gridTitle: 'Equipment', table: 'equipment', indexField: 'id', sort: { field: 'id', dir: 'asc' },
    columns: cols('id|Equipment Code', 'name|Equipment Name', 'eq_std|Equipment Standard', 'category|Category', 'site_id|Site Code', 'bl_id|Building Code', 'fl_id|Floor', 'criticality|Criticality', 'status|Status|status', 'install_date|Install Date|date', 'manufacturer|Manufacturer', 'model|Model'),
    filters: [fT('id', 'Equipment Code'), fT('eq_std', 'Equipment Standard'), fS('site_id', 'Site Code', siteOpts), fT('bl_id', 'Building Code'), fS('criticality', 'Criticality', ['High', 'Medium', 'Low']), fS('status', 'Status', ['In Service', 'Out of Service', 'Under Maintenance'])],
    rowActions: [{ label: 'Details', details: true }, { label: 'Edit', edit: [{ title: 'Edit equipment', fields: [{ field: 'status', label: 'Status', type: 'select', options: ['In Service', 'Out of Service', 'Under Maintenance'] }, { field: 'criticality', label: 'Criticality', type: 'select', options: ['High', 'Medium', 'Low'] }] }] }] };
  V['ppm-activities'] = { type: 'grid', title: 'Planned Preventive Maintenance Activities', gridTitle: 'PPM Activities', table: 'pm_schedules', sort: { field: 'date_next', dir: 'desc' },
    columns: cols('id|ID', 'pm_procedure|PM Procedure', 'description|Description', 'eq_id|Equipment Code', 'site_id|Site Code', 'bl_id|Building Code', 'frequency|Frequency', 'date_last|Last Done|date', 'date_next|Next Due|date', 'trade|Trade', 'est_hours|Est. Hours|number', 'status|Status|status'),
    filters: [fD('date_next', 'Next Due Date', 'This Month'), fS('site_id', 'Site Code', siteOpts), fS('trade', 'Trade', tradeOpts), fS('frequency', 'Frequency', ['Weekly', 'Monthly', 'Quarterly', 'Semi-Annual', 'Annual']), fS('status', 'Status', ['Planned', 'Generated', 'Executed', 'Missed']), fT('eq_id', 'Equipment Code')],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Generate WR', show: (r) => r.status === 'Planned', onClick: (row, ctx, api) => {
        const eq = DB.get('equipment', row.eq_id) || {}; const w = newWr({ wr_type: 'PM', status: 'Approved', request_nature: 'Preventive', requestor: ctx.user.name, requestor_username: ctx.user.username, bl_id: row.bl_id, prob_type: row.trade, description: 'PPM ' + row.frequency + ' - ' + (eq.name || row.eq_id), pm_procedure: row.pm_procedure, eq_id: row.eq_id, eq_name: eq.name || '', eq_std: eq.eq_std || '', criticality: eq.criticality || '', date_review_confirmed: nowIso(), date_agreed_target: new Date(Date.now() + 5 * DAY).toISOString() });
        DB.update('pm_schedules', row.id, { status: 'Generated' }); UI.toast('Work request ' + w.id + ' generated'); refresh(api);
      } },
      { label: 'Mark Executed', show: (r) => r.status === 'Generated', onClick: (row, ctx, api) => { DB.update('pm_schedules', row.id, { status: 'Executed' }); UI.toast('Marked as executed'); refresh(api); } }] };

  V['survey-report'] = {
    type: 'kpi', title: 'SR Satisfaction Survey Report', table: 'surveys', where: (r) => r.status === 'Answered',
    kpis: [{ label: 'Average Rating (of 5)', value: (rs) => avg(rs, 'rating') }, { label: 'Responses', value: (rs) => rs.length }, { label: '4-5 Star Ratings', value: (rs) => rs.filter((r) => r.rating >= 4).length }, { label: 'Pending Surveys', value: () => DB.all('surveys').filter((s) => s.status === 'Pending').length }],
    then: [
      { type: 'chart', title: 'Average rating by month', gridTitle: 'Average rating by month', table: 'surveys', where: (r) => r.status === 'Answered', chart: { kind: 'line', groupBy: 'date_answered', dateGroup: 'month', value: (rs) => avg(rs, 'rating'), label: 'Avg rating', groupLabel: 'Month' } },
      { type: 'chart', title: 'Average rating by building', gridTitle: 'Average rating by building', table: 'surveys', where: (r) => r.status === 'Answered', chart: { kind: 'hbar', groupBy: 'bl_id', value: (rs) => avg(rs, 'rating'), label: 'Avg rating', groupLabel: 'Building' } },
      { type: 'grid', title: 'Survey Responses', gridTitle: 'Survey Responses', table: 'surveys', where: (r) => r.status === 'Answered', sort: { field: 'date_answered', dir: 'desc' },
        columns: cols('wr_id|Work Request', 'description|Description', 'bl_id|Building', 'requestor|Requestor', 'rating|Rating|number', 'comment|Comment', 'date_answered|Answered On|date'), filters: [fD('date_answered', 'Answered On'), fT('bl_id', 'Building')] }]
  };
  V['checklist-answers'] = { type: 'grid', title: 'PPM/CM Task List Action Report', gridTitle: 'Task List Answers', table: 'checklist_answers', sort: { field: 'date', dir: 'desc' },
    columns: cols('id|ID', 'wr_id|Work Request Code', 'wr_type|WR Type', 'task_list|Task List', 'question|Question', 'answer|Answer', 'action_required|Action Required|bool', 'action_status|Action Status', 'date|Date|date'),
    filters: [fD('date', 'Date', 'This Year'), fT('wr_id', 'Work Request Code'), fS('wr_type', 'WR Type', ['PPM', 'CM']), fS('answer', 'Answer', ['Yes', 'No', 'N/A']), fC('action_required', 'Action Required Only')],
    rowActions: [{ label: 'Details', details: true }, { label: 'Close Action', show: (r) => r.action_required && r.action_status !== 'Closed', onClick: (row, ctx, api) => { DB.update('checklist_answers', row.id, { action_status: 'Closed' }); UI.toast('Action closed'); refresh(api); } }] };
  V['checklist-summary'] = { type: 'chart', title: 'PPM/CM Task List Action Report Summary', table: 'checklist_answers', filters: [fS('wr_type', 'WR Type', ['PPM', 'CM']), fD('date', 'Date')], chart: { kind: 'stacked', groupBy: 'task_list', stackBy: 'answer', groupLabel: 'Task List' } };

  /* ---------------------------------------------------------- E2E / ERP ---------------------------------------------------------- */
  const joinInv = (type) => () => DB.all('invoices').filter((i) => !type || i.wr_type === type).map((i) => { const w = DB.get('wr', i.wr_id) || {}; return Object.assign({}, i, { wr_status: w.status, description: w.description, date_requested: w.date_requested, site_id: w.site_id, bl_id: w.bl_id, date_completed: w.date_completed, inv_status: i.status }); });
  const e2eCols = cols('wr_id|Work Request Code', 'wr_type|WR Type', 'date_requested|Date Requested|date', 'site_id|Site Code', 'bl_id|Building Code', 'description|Description', 'wr_status|WR Status|status', 'date_completed|Date Completed|date', 'group_code|Group', 'bpa_number|BPA Number', 'release_order|Release Order', 'ro_date|RO Date|date', 'ro_amount|RO Amount|money', 'invoice_no|Invoice No.', 'invoice_date|Invoice Date|date', 'invoice_amount|Invoice Amount|money', 'paid|Paid|bool', 'inv_status|Invoice Status|status');
  const e2eFilters = () => [fT('wr_id', 'Work Request Code'), fS('site_id', 'Site Code', siteOpts), fS('group_code', 'Group', ['GRP-01', 'GRP-02', 'GRP-03', 'GRP-04', 'GRP-05', 'GRP-06']), fT('invoice_no', 'Invoice No.'), fD('invoice_date', 'Invoice Date'), fYN('paid', 'Paid?', (r) => r.paid)];
  V['e2e-wr-invoice'] = { type: 'grid', title: 'End to End details from WR to Invoice', gridTitle: 'On Demand WR → Release Order → Invoice', table: 'invoices', rows: joinInv('On Demand'), columns: e2eCols, filters: e2eFilters(), sort: { field: 'invoice_date', dir: 'desc' }, rowActions: [{ label: 'Details', details: true }] };
  V['e2e-ppm-invoice'] = { type: 'grid', title: 'End to End details from PPM WR to Invoice', gridTitle: 'PPM WR → Release Order → Invoice', table: 'invoices', rows: joinInv('PM'), columns: e2eCols, filters: e2eFilters(), sort: { field: 'invoice_date', dir: 'desc' }, rowActions: [{ label: 'Details', details: true }] };
  V['e2e-group-invoice'] = { type: 'grid', title: 'End to End details by Group', gridTitle: 'Totals by Group', pageSize: 20,
    rows: () => { const g = {}; DB.all('invoices').forEach((i) => { const x = g[i.group_code] = g[i.group_code] || { id: i.group_code, group_code: i.group_code, wrs: 0, ro_total: 0, inv_total: 0, paid_total: 0 }; x.wrs++; x.ro_total += i.ro_amount; x.inv_total += i.invoice_amount; if (i.paid) x.paid_total += i.invoice_amount; }); return Object.keys(g).sort().map((k) => { const x = g[k]; x.outstanding = x.inv_total - x.paid_total; return x; }); },
    columns: cols('group_code|Group', 'wrs|Work Requests|number', 'ro_total|Release Order Total|money', 'inv_total|Invoiced Total|money', 'paid_total|Paid Total|money', 'outstanding|Outstanding|money'), filters: [fT('group_code', 'Group')], rowActions: [{ label: 'Details', details: true }] };
  V['erp-invoices'] = { type: 'grid', title: 'Release Orders & Invoices', gridTitle: 'Release Orders & Invoices', table: 'invoices', sort: { field: 'invoice_date', dir: 'desc' },
    columns: cols('id|ID', 'wr_id|Work Request Code', 'wr_type|WR Type', 'group_code|Group', 'bpa_number|BPA Number', 'release_order|Release Order', 'ro_date|RO Date|date', 'ro_amount|RO Amount|money', 'invoice_no|Invoice No.', 'invoice_date|Invoice Date|date', 'invoice_amount|Invoice Amount|money', 'status|Status|status'),
    filters: [fT('wr_id', 'Work Request Code'), fT('release_order', 'Release Order'), fT('invoice_no', 'Invoice No.'), fS('status', 'Status', ['Draft', 'Submitted', 'Approved', 'Paid']), fD('invoice_date', 'Invoice Date')],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Submit', show: (r) => r.status === 'Draft', onClick: (row, ctx, api) => { DB.update('invoices', row.id, { status: 'Submitted' }); UI.toast('Invoice submitted'); refresh(api); } },
      { label: 'Approve', show: (r) => r.status === 'Submitted', onClick: (row, ctx, api) => { DB.update('invoices', row.id, { status: 'Approved' }); UI.toast('Invoice approved'); refresh(api); } },
      { label: 'Mark Paid', show: (r) => r.status === 'Approved', onClick: (row, ctx, api) => { DB.update('invoices', row.id, { status: 'Paid', paid: true }); UI.toast('Invoice marked as paid'); refresh(api); } }] };

  /* ---------------------------------------------------------- HSE docs / error docs / ISO ---------------------------------------------------------- */
  V['hse-documents'] = { type: 'grid', title: 'PTW HSE Documents', gridTitle: 'PTW HSE Documents', table: 'hse_docs', sort: { field: 'date_uploaded', dir: 'desc' },
    columns: cols('id|ID', 'ptw_id|Permit to Work Code', 'wr_id|Work Request Code', 'doc_type|Document Type', 'file_name|File Name', 'uploaded_by|Uploaded By', 'date_uploaded|Date Uploaded|datetime', 'status|Status|status'),
    filters: [fT('ptw_id', 'Permit to Work Code'), fT('wr_id', 'Work Request Code'), fS('doc_type', 'Document Type', ['Risk Assessment', 'Method Statement', 'Toolbox Talk', 'Insurance', 'Competency Certificate']), fS('status', 'Status', ['Valid', 'Expired', 'Error']), fD('date_uploaded', 'Date Uploaded')],
    rowActions: [{ label: 'Details', details: true }] };
  V['remove-error-docs'] = { type: 'grid', title: 'Remove Error Docs', gridTitle: 'Documents with upload errors', table: 'error_docs', sort: { field: 'date_uploaded', dir: 'desc' },
    columns: cols('id|ID', 'wr_id|Work Request Code', 'ptw_id|Permit to Work Code', 'file_name|File Name', 'error|Error', 'uploaded_by|Uploaded By', 'date_uploaded|Date Uploaded|datetime'),
    filters: [fT('wr_id', 'Work Request Code'), fT('ptw_id', 'Permit to Work Code')],
    rowActions: [{ label: 'Remove', onClick: (row, ctx, api) => { if (typeof confirm === 'function' && !confirm('Remove document ' + row.file_name + '?')) return; DB.remove('error_docs', row.id); UI.toast('Document removed'); refresh(api); } }] };
  const isoKind = (w) => (!w ? '' : w.prob_type === 'PTW-PREP' ? 'Isolation' : String(w.prob_type || '').indexOf('PTW-') === 0 ? 'De-Isolation' : '');
  V['iso-requests'] = { type: 'grid', title: 'Update/Complete My ISO/De-ISO Requests', gridTitle: 'ISO / De-ISO Requests', table: 'iso', sort: { field: 'date_requested', dir: 'desc' },
    rows: () => DB.all('iso').map((i) => { const w = DB.get('wr', i.wr_id); const p = DB.get('ptw', i.ptw_id); return Object.assign({}, i, { iso_kind: isoKind(w), wr_status: w ? w.status : '', ptw_status: p ? p.status : '' }); }),
    columns: cols('id|ID', 'ptw_id|Permit to Work Code', 'ptw_status|PTW Status|status', 'wr_id|Linked Work Request', 'wr_status|WR Status|status', 'iso_kind|Isolation / De-Isolation', 'system|System', 'point|Isolation Point', 'isolation_type|Type', 'status|Status|status', 'requested_by|Requested By', 'date_requested|Requested|datetime', 'date_isolated|Isolated|datetime', 'date_deisolated|De-Isolated|datetime'),
    filters: [fT('ptw_id', 'Permit to Work Code'), fT('wr_id', 'Work Request Code'), fS('iso_kind', 'Isolation / De-Isolation', ['Isolation', 'De-Isolation']), fS('status', 'Status', ['Requested', 'Isolated', 'De-Isolated', 'Completed']), fS('system', 'System', ['Electrical', 'Mechanical', 'Fire', 'Water'])],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Isolate', show: (r) => r.status === 'Requested', onClick: (row, ctx, api) => { if (DB.update('iso', row.id, { status: 'Isolated', date_isolated: nowIso() })) { UI.toast('Isolation confirmed'); refresh(api); } } },
      { label: 'De-Isolate', show: (r) => r.status === 'Isolated', onClick: (row, ctx, api) => { if (DB.update('iso', row.id, { status: 'De-Isolated', date_deisolated: nowIso() })) { UI.toast('De-isolation done'); refresh(api); } } },
      { label: 'Complete', show: (r) => ['Isolated', 'De-Isolated'].includes(r.status), onClick: (row, ctx, api) => { if (DB.action('iso', row.id, 'complete')) { UI.toast('ISO request completed'); refresh(api); } } }] };

  /* ---------------------------------------------------------- Service desk ---------------------------------------------------------- */
  V['workplace-catalog'] = { type: 'catalog', title: 'Workplace', items: [
    { icon: '🛠', title: 'Report a Problem', text: 'Raise a maintenance or repair request.', view: 'sd-new-request' },
    { icon: '🦺', title: 'Request Permit to Work', text: 'Apply for a permit to carry out hazardous work.', view: 'ptw-create' },
    { icon: '🔍', title: 'Facilities Inspection', text: 'Log a facility inspection finding.', view: 'fi-new' },
    { icon: '📋', title: 'My Requests', text: 'Track the status of your work requests.', view: 'wr-review' },
    { icon: '📅', title: 'Book a Room', text: 'Reserve a meeting or training room.', view: 'room-booking' },
    { icon: '⚠', title: 'Report an Incident', text: 'Report an accident or near miss.', view: 'incident-new' },
    { icon: '⭐', title: 'Feedback', text: 'See satisfaction survey results.', view: 'survey-report' }] };
  V['sd-new-request'] = { type: 'form', title: 'Report a Problem', table: 'wr', formTitle: 'New Service Request', saveLabel: 'Submit Request',
    sections: [{ title: 'Location', fields: [{ field: 'site_id', label: 'Site Code', type: 'select', required: true, options: siteOpts }, { field: 'bl_id', label: 'Building Code', type: 'select', required: true, options: bldOpts }, { field: 'fl_id', label: 'Floor Code', type: 'select', options: ['GF', 'L1', 'L2'] }] },
      { title: 'Problem', fields: [{ field: 'prob_type', label: 'Problem Type', type: 'select', required: true, options: tradeOpts }, { field: 'priority', label: 'Priority', type: 'select', options: PRIO, default: '3' }, { field: 'description', label: 'Description', type: 'textarea', required: true }] }],
    onSave: (v, ctx) => newWr({ site_id: v.site_id, bl_id: v.bl_id, fl_id: v.fl_id || 'GF', prob_type: v.prob_type, priority: Number(v.priority) || 3, description: v.description, requestor: ctx.user.name, requestor_username: ctx.user.username }),
    savedMsg: (s) => 'Work request ' + s.id + ' submitted' };
  V['fi-new'] = { type: 'form', title: 'Facilities Inspection', table: 'inspections', formTitle: 'New Inspection Finding', saveLabel: 'Submit Finding',
    sections: [{ title: 'Finding', fields: [{ field: 'site_id', label: 'Site Code', type: 'select', required: true, options: siteOpts }, { field: 'bl_id', label: 'Building Code', type: 'select', required: true, options: bldOpts }, { field: 'location', label: 'Location', type: 'text' },
      { field: 'category', label: 'Category', type: 'select', required: true, options: ['Housekeeping', 'Safety', 'Structural', 'Electrical', 'HVAC', 'Plumbing', 'Landscaping', 'Fire Safety'] }, { field: 'priority', label: 'Priority', type: 'select', options: ['High', 'Medium', 'Low'], default: 'Medium' }, { field: 'finding', label: 'Finding', type: 'textarea', required: true }] }],
    onSave: (v, ctx) => DB.insert('inspections', Object.assign({}, v, { date_requested: nowIso(), inspector: ctx.user.name, status: 'Requested', wr_id: null, photos: 0, action_item_id: 2000000 + Math.floor(Math.random() * 989999 + 10000) })),
    savedMsg: (s) => 'Inspection item ' + s.id + ' submitted' };
  V['room-booking'] = { type: 'form', title: 'Book a Room', table: 'bookings', formTitle: 'Room Booking', saveLabel: 'Book Room',
    sections: [{ title: 'Booking', fields: [{ field: 'bl_id', label: 'Building Code', type: 'select', required: true, options: bldOpts }, { field: 'room', label: 'Room', type: 'text', required: true }, { field: 'date', label: 'Date', type: 'date', required: true },
      { field: 'start', label: 'Start Time', type: 'text', default: '09:00' }, { field: 'end', label: 'End Time', type: 'text', default: '10:00' }, { field: 'purpose', label: 'Purpose', type: 'textarea' }] }],
    onSave: (v, ctx) => DB.insert('bookings', Object.assign({}, v, { booked_by: ctx.user.name })), savedMsg: (s) => 'Room booked (reference ' + s.id + ')' };
  /* ---- incidents (HSE): shared form, approver helpers ---- */
  const INC_AREAS = ['HS', 'ENV', 'SEC', 'F&I', 'INF'];
  const INC_TYPES = { HS: ['OBJECT FALLING FROM HEIGHT', 'SLIP TRIP FALL', 'ELECTRIC SHOCK', 'NEAR MISS', 'VEHICLE COLLISION'], ENV: ['ENVIRONMENTAL SPILL', 'WASTE DISPOSAL VIOLATION', 'EXCESSIVE NOISE'], SEC: ['UNAUTHORISED ACCESS', 'THEFT', 'VANDALISM'], 'F&I': ['FIRE', 'FLOOD'], INF: ['IMPACT ON ASSET', 'EQUIPMENT FAILURE', 'STRUCTURAL DEFECT'] };
  const INC_ALL_TYPES = [].concat.apply([], INC_AREAS.map((a) => INC_TYPES[a]));
  const INC_STATUS = ['Draft', 'Submitted', 'Approved', 'Rejected', 'Closed'];
  const INJ_CAT = ['First Aid Case', 'Medical Treatment Case', 'Restricted Work Case', 'Lost Time Injury'];
  const INJ_AREA = ['Head', 'Hand', 'Back', 'Leg', 'Eye', 'Arm', 'Foot', 'Torso'];
  const APPROVER_KEYS = [1, 2, 3, 4];
  const incApprovers = (r) => APPROVER_KEYS.map((k) => r['approver' + k]).filter(Boolean);
  const incApprovedCount = (r) => APPROVER_KEYS.filter((k) => r['approver' + k] && r['approver' + k + '_status'] === 'Approved').length;
  // the approver whose turn it is: first assigned approver (in order) still on 'Submitted'; only while the incident is Submitted
  const incCurrentApprover = (r) => { if (r.status !== 'Submitted') return null; for (const k of APPROVER_KEYS) { if (r['approver' + k] && r['approver' + k + '_status'] === 'Submitted') return r['approver' + k]; } return null; };
  const incProgress = (r) => { const n = incApprovers(r).length; if (!n) return 'Not submitted'; const rej = APPROVER_KEYS.find((k) => r['approver' + k + '_status'] === 'Rejected'); return incApprovedCount(r) + '/' + n + ' approved' + (rej ? ' (rejected by ' + r['approver' + rej] + ')' : ''); };
  const incVisible = (r) => { const u = me().username; return r.incident_area !== 'SEC' || r.recorded_by === u || incApprovers(r).includes(u); };
  const incRow = (r) => Object.assign({}, r, { approval_progress: incProgress(r), awaiting: incCurrentApprover(r) || '' });

  // returns a DOM element with .collect() -> { vals } | { error }
  function incidentForm(rec, u) {
    const secs = [
      { title: 'Incident', fields: [
        { field: 'incident_area', label: 'Incident Area', type: 'select', required: true, options: INC_AREAS },
        { field: 'incident_type', label: 'Incident Type', type: 'select', required: true, options: INC_ALL_TYPES },
        { field: 'date_incident', label: 'Date of Incident', type: 'date', required: true, default: nowIso() },
        { field: 'time_incident', label: 'Time of Incident (HH:MM)', type: 'text', required: true, default: new Date().toTimeString().slice(0, 5) },
        { field: 'severity', label: 'Severity', type: 'select', required: true, options: ['Minor', 'Moderate', 'Major', 'Critical'] },
        { field: 'affected_person', label: 'Affected Person', type: 'text' },
        { field: 'site_id', label: 'Site Code', type: 'select', required: true, options: siteOpts }, { field: 'property_code', label: 'Property Code', type: 'select', options: bldOpts },
        { field: 'description', label: 'Description', type: 'textarea', required: true }] },
      { title: 'Injury Details (required for HS incidents with an affected person)', fields: [
        { field: 'injury_category', label: 'Injury Category', type: 'select', options: INJ_CAT }, { field: 'injured_area', label: 'Injured Area', type: 'select', options: INJ_AREA }] }];
    const wrap = UI.buildForm(secs, rec, { user: u });
    const q = (f) => wrap.querySelector('[data-f="' + f + '"]');
    const injSec = wrap.querySelectorAll('.form-sec')[1];
    const setOpts = (sel, list) => { const cur = sel.value; sel.innerHTML = '<option value=""></option>' + list.map((o) => `<option>${esc(o)}</option>`).join(''); sel.value = list.includes(cur) ? cur : ''; };
    const sync = () => { const a = q('incident_area').value; setOpts(q('incident_type'), INC_TYPES[a] || INC_ALL_TYPES); injSec.hidden = a !== 'HS'; };
    q('incident_area').onchange = sync; sync();
    q('site_id').onchange = () => { const s = q('site_id').value; setOpts(q('property_code'), DB.all('buildings').filter((b) => !s || b.site_id === s).map((b) => b.id)); };
    wrap.collect = () => {
      const { vals, missing } = wrap.read();
      if (missing.length) return { error: 'Please fill required fields: ' + missing.join(', ') };
      if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(vals.time_incident)) return { error: 'Time must be in HH:MM format (24 hours).' };
      const hm = vals.time_incident.split(':').map(Number);
      if (Date.parse(vals.date_incident) + hm[0] * 3600e3 + hm[1] * 60e3 > Date.now()) return { error: 'The incident date and time cannot be in the future.' };
      if (vals.incident_area === 'HS' && vals.affected_person && (!vals.injury_category || !vals.injured_area)) return { error: 'Injury category and injured area are required when a person is affected.' };
      if (vals.incident_area !== 'HS') { vals.injury_category = ''; vals.injured_area = ''; }
      return { vals };
    };
    return wrap;
  }
  V['incident-new'] = { type: 'custom', title: 'Report Incident', table: 'incidents', render: (root, ctx) => {
    const u = userOf(ctx);
    const bar = UI.h('<div class="panel"><div class="panel-head"><span class="ttl">Report Incident</span><button class="btn primary" data-save>&#128190; Save as Draft</button></div></div>');
    const form = incidentForm(null, u);
    root.appendChild(bar); root.appendChild(form);
    bar.querySelector('[data-save]').onclick = () => {
      const r = form.collect(); if (r.error) return UI.toast(r.error, true);
      const saved = DB.insert('incidents', Object.assign({}, r.vals, {
        recorded_by: u.username, reported_by: u.name, status: 'Draft', contractor: u.role === 'Contractor', linked_sr_ids: [],
        approver1: null, approver2: null, approver3: null, approver4: null, approver1_status: null, approver2_status: null, approver3_status: null, approver4_status: null,
        approver1_comm: null, approver2_comm: null, approver3_comm: null, approver4_comm: null, approver1_date: null, approver2_date: null, approver3_date: null, approver4_date: null, date_approved: null }));
      if (!saved) return;
      UI.toast('Incident ' + saved.id + ' saved as draft - use "Send for Approval" in Track Incidents'); ctx.open('incidents');
    };
  } };

  const insCols = cols('id|ID', 'date_requested|Date|date', 'inspector|Inspector', 'site_id|Site Code', 'bl_id|Building Code', 'location|Location', 'category|Category', 'finding|Finding', 'priority|Priority', 'status|Status|status', 'wr_id|Work Request', 'photos|Photos|number');
  const insFilters = () => [fD('date_requested', 'Date Requested'), fS('site_id', 'Site Code', siteOpts), fT('bl_id', 'Building Code'), fS('category', 'Category', ['Housekeeping', 'Safety', 'Structural', 'Electrical', 'HVAC', 'Plumbing', 'Landscaping', 'Fire Safety']), fS('status', 'Status', ['Requested', 'Approved', 'Rejected', 'Converted to WR', 'Closed']), fS('priority', 'Priority', ['High', 'Medium', 'Low'])];
  const insActions = [{ label: 'Details', details: true },
    { label: 'Approve', show: (r) => r.status === 'Requested' && ['Supervisor', 'Administrator'].includes(me().role), onClick: (row, ctx, api) => { DB.update('inspections', row.id, { status: 'Approved' }); UI.toast('Item approved'); refresh(api); } },
    { label: 'Reject', show: (r) => r.status === 'Requested' && ['Supervisor', 'Administrator'].includes(me().role), onClick: (row, ctx, api) => { DB.update('inspections', row.id, { status: 'Rejected' }); UI.toast('Item rejected'); refresh(api); } },
    { label: 'Convert to WR', show: (r) => ['Requested', 'Approved'].includes(r.status), onClick: (row, ctx, api) => {
      const trade = { Electrical: 'ELEC', HVAC: 'HVACE', Plumbing: 'PLUMB', Structural: 'CIVI', 'Fire Safety': 'FIRE', Housekeeping: 'CLEAN' }[row.category] || 'GSER';
      const w = newWr({ site_id: row.site_id, bl_id: row.bl_id, prob_type: trade, priority: row.priority === 'High' ? 2 : row.priority === 'Low' ? 4 : 3, description: row.finding + (row.location ? ' (' + row.location + ')' : ''), requestor: row.inspector, request_nature: 'Inspection Finding' });
      DB.update('inspections', row.id, { status: 'Converted to WR', wr_id: w.id }); UI.toast('Work request ' + w.id + ' created'); refresh(api);
    } }];
  V['fi-review-items'] = { type: 'grid', title: 'Review Facilities Inspection Items', gridTitle: 'Facilities Inspection Items', table: 'inspections', columns: insCols, filters: insFilters(), rowActions: insActions, sort: { field: 'date_requested', dir: 'desc' } };
  V['fi-report'] = { type: 'tabs', title: 'Facility Inspection', tabs: [
    { label: 'Service Request Details', view: { type: 'grid', title: 'Service Request Details', gridTitle: 'Service Request Details', table: 'inspections', columns: insCols, filters: insFilters(), sort: { field: 'date_requested', dir: 'desc' }, rowActions: [{ label: 'Details', details: true }] } },
    { label: 'Summary', view: { type: 'chart', title: 'Inspection Summary', table: 'inspections', filters: [fS('site_id', 'Site Code', siteOpts)], chart: { kind: 'hstacked', groupBy: 'category', stackBy: 'status', groupLabel: 'Category' } } }] };
  V['fi-all-requests'] = { type: 'grid', title: 'Review All Facility Requests', gridTitle: 'All Facility Requests', table: 'inspections', columns: insCols.concat(cols('action_item_id|Action Item Id')), filters: insFilters(), sort: { field: 'date_requested', dir: 'desc' },
    rowActions: [{ label: 'Details', details: true }, { label: 'Close', show: (r) => r.status !== 'Closed', onClick: (row, ctx, api) => { DB.update('inspections', row.id, { status: 'Closed' }); UI.toast('Request closed'); refresh(api); } }] };
  V['fi-dashboard'] = { type: 'kpi', title: 'Facility Inspection Dashboard', table: 'inspections',
    kpis: [{ label: 'Total Items', value: (rs) => rs.length }, { label: 'Awaiting Review', value: (rs) => rs.filter((r) => r.status === 'Requested').length }, { label: 'Converted to WR', value: (rs) => rs.filter((r) => r.status === 'Converted to WR').length }, { label: 'High Priority', value: (rs) => rs.filter((r) => r.priority === 'High').length }],
    then: [
      { type: 'chart', title: 'Items by category', table: 'inspections', chart: { kind: 'hbar', groupBy: 'category', label: 'Items', groupLabel: 'Category' } },
      { type: 'chart', title: 'Items by status', table: 'inspections', chart: { kind: 'doughnut', groupBy: 'status', label: 'Items', groupLabel: 'Status' } },
      { type: 'chart', title: 'Items per month', table: 'inspections', chart: { kind: 'bar', groupBy: 'date_requested', dateGroup: 'month', label: 'Items', groupLabel: 'Month' } }] };
  V['wr-dashboard'] = { type: 'kpi', title: 'Work Request Dashboard', table: 'wr',
    kpis: [{ label: 'Open Work Requests', value: (rs) => rs.filter(isOpen).length }, { label: 'Overdue', value: (rs) => rs.filter(isOverdue).length },
      { label: 'Completed This Month', value: (rs) => rs.filter((r) => thisMonth(r.date_completed)).length }, { label: 'Average Rating', value: () => avg(DB.all('surveys').filter((s) => s.status === 'Answered'), 'rating') }],
    then: [
      { type: 'chart', title: 'Work requests by status', table: 'wr', chart: { kind: 'doughnut', groupBy: 'status', label: 'Work requests', groupLabel: 'Status' } },
      { type: 'chart', title: 'Work requests per month', table: 'wr', chart: { kind: 'stacked', groupBy: 'date_requested', dateGroup: 'month', stackBy: 'wr_type', groupLabel: 'Month' } },
      { type: 'chart', title: 'Open work requests by site', table: 'wr', where: isOpen, chart: { kind: 'hbar', groupBy: 'site_id', label: 'Open', groupLabel: 'Site' } }] };

  V['campus-map'] = { type: 'custom', title: 'Campus Map', render: (root) => {
    const panel = UI.h('<div class="panel"><div class="panel-head"><span class="ttl">All Buildings</span></div><div style="height:560px"></div></div>');
    root.appendChild(panel); const el = panel.lastElementChild;
    if (!window.L) { el.innerHTML = '<div class="noresults">Map library could not load (offline?).</div>'; return; }
    const L = window.L; const map = L.map(el); const blds = DB.all('buildings');
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' }).addTo(map);
    const open = {}; DB.all('wr').filter(isOpen).forEach((w) => { open[w.bl_id] = (open[w.bl_id] || 0) + 1; });
    const pal = ['#2563eb', '#f59e0b', '#0d9488', '#7c3aed', '#db2777', '#0891b2', '#65a30d', '#ea580c']; const sites = DB.all('sites').map((s) => s.id);
    blds.forEach((b) => L.circleMarker([b.lat, b.lng], { radius: 9, color: '#0b1b33', weight: 1, fillColor: pal[sites.indexOf(b.site_id) % pal.length], fillOpacity: 0.85 })
      .bindPopup(`<b>${esc(b.name)}</b><br>${esc(b.id)} &middot; Site ${esc(b.site_id)}<br>${esc(b.city)}<br>Open work requests: <b>${open[b.id] || 0}</b><br><a href="/app/wr-review?bl_id=${encodeURIComponent(b.id)}">View work requests</a>`).addTo(map));
    if (blds.length) map.fitBounds(L.latLngBounds(blds.map((b) => [b.lat, b.lng])).pad(0.2)); else map.setView([25.3, 51.4], 9);
    setTimeout(() => map.invalidateSize(), 100);
  } };

  /* ---------------------------------------------------------- Health & Safety ---------------------------------------------------------- */
  const userLabel = (u) => (u.name || u.username) + ' (' + u.username + ')';
  const userFromLabel = (s) => { const m = String(s || '').match(/\(([^)]+)\)$/); return m ? m[1] : ''; };
  function sendForApproval(row, api) {
    const users = DB.all('users').map(userLabel);
    const fields = APPROVER_KEYS.map((k) => ({ field: 'a' + k, label: 'Approver ' + k, type: 'select', required: k === 1, options: users }));
    formModal('Send incident ' + row.id + ' for approval', [{ title: 'Approvers (approver 1 is required; each person once)', fields }], (v) => {
      const list = APPROVER_KEYS.map((k) => userFromLabel(v['a' + k])).filter(Boolean);
      if (new Set(list).size !== list.length) { UI.toast('Each approver can only be selected once.', true); return false; }
      if (!DB.action('incidents', row.id, 'submit', { approvers: list })) return false;
      UI.toast('Incident ' + row.id + ' sent for approval'); refresh(api);
    });
  }
  V['incidents'] = { type: 'grid', title: 'Track Incidents', gridTitle: 'Incidents', table: 'incidents', indexField: 'id', sort: { field: 'date_incident', dir: 'desc' },
    rows: () => DB.all('incidents').filter(incVisible).map(incRow),
    columns: cols('id|Incident Code', 'incident_area|Area', 'date_incident|Date of Incident|date', 'time_incident|Time', 'incident_type|Incident Type', 'affected_person|Affected Person', 'site_id|Site Code', 'property_code|Property Code', 'severity|Severity', 'recorded_by|Recorded By', 'status|Status|status', 'approval_progress|Approval Progress', 'awaiting|Awaiting Approval From'),
    filters: [fD('date_incident', 'Date of Incident', 'This Year'), fS('incident_area', 'Incident Area', INC_AREAS), fS('incident_type', 'Incident Type', INC_ALL_TYPES), fS('severity', 'Severity', ['Minor', 'Moderate', 'Major', 'Critical']), fS('status', 'Status', INC_STATUS), fS('site_id', 'Site Code', siteOpts),
      withTest(fC('my_approvals', 'Awaiting my approval'), (r, v) => !v || r.awaiting === me().username)],
    toolbar: [{ label: 'Report Incident', cls: 'primary', onClick: (ctx) => ctx.open('incident-new') }],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Edit', show: (r) => r.status === 'Draft' && r.recorded_by === me().username, onClick: (row, ctx, api) => {
        const f = incidentForm(row, userOf(ctx));
        UI.modal('Edit incident ' + row.id, f, [{ label: 'Save', cls: 'primary', onClick: (close) => {
          const r = f.collect(); if (r.error) return UI.toast(r.error, true);
          if (!DB.update('incidents', row.id, r.vals)) return;
          UI.toast('Incident ' + row.id + ' updated'); close(); refresh(api);
        } }]);
      } },
      { label: 'Send for Approval', show: (r) => r.status === 'Draft' && r.recorded_by === me().username, onClick: (row, ctx, api) => sendForApproval(row, api) },
      { label: 'Approve', show: (r) => r.awaiting && r.awaiting === me().username, onClick: (row, ctx, api) => formModal('Approve incident ' + row.id, [{ title: 'Comment (optional)', fields: [{ field: 'comment', label: 'Comment', type: 'textarea' }] }], (v) => {
        if (!DB.action('incidents', row.id, 'approve', { comment: String(v.comment || '').trim() })) return false; UI.toast('Incident ' + row.id + ' approved'); refresh(api);
      }) },
      { label: 'Reject', show: (r) => r.awaiting && r.awaiting === me().username, onClick: (row, ctx, api) => reasonModal('Reject incident ' + row.id, 'Comment', (comment) => {
        if (!DB.action('incidents', row.id, 'reject', { comment })) return false; UI.toast('Incident ' + row.id + ' rejected'); refresh(api);
      }) }] };
  V['incident-actions'] = { type: 'grid', title: 'Action Items', gridTitle: 'Incident Action Items', table: 'incident_actions', sort: { field: 'date_due', dir: 'asc' },
    rowClass: (r) => (r.status === 'Overdue' || (r.status !== 'Completed' && Date.parse(r.date_due) < Date.now()) ? 'row-red' : ''),
    columns: cols('id|Action ID', 'incident_id|Incident Code', 'action|Action', 'responsible|Responsible', 'date_due|Due Date|date', 'date_completed|Date Completed|date', 'status|Status|status'),
    filters: [fT('incident_id', 'Incident Code'), fS('status', 'Status', ['Open', 'In Progress', 'Completed', 'Overdue']), fT('responsible', 'Responsible'), fD('date_due', 'Due Date')],
    rowActions: [{ label: 'Details', details: true }, { label: 'Update', edit: [{ title: 'Update action item', fields: [{ field: 'status', label: 'Status', type: 'select', options: ['Open', 'In Progress', 'Completed', 'Overdue'] }, { field: 'responsible', label: 'Responsible', type: 'text' }, { field: 'date_due', label: 'Due Date', type: 'date' }, { field: 'date_completed', label: 'Date Completed', type: 'date' }] }] }] };

  /* Server activity log (Supervisor / Administrator) — every API write is recorded by the backend */
  V['audit-log'] = { type: 'grid', title: 'Activity Log', gridTitle: 'Server Activity Log', pageSize: 25, indexField: null,
    rows: () => DB.audit().map((a) => Object.assign({}, a, { detail_text: a.detail ? JSON.stringify(a.detail) : '' })),
    filters: [{ field: 'username', label: 'User', type: 'text' }, { field: 'action', label: 'Action', type: 'select', options: ['login', 'login_failed', 'logout', 'insert', 'update', 'delete', 'reset'] }, { field: 'tbl', label: 'Table', type: 'text' }, { field: 'ts', label: 'Date', type: 'daterange' }],
    columns: [{ field: 'id', label: 'Log ID', type: 'number' }, { field: 'ts', label: 'Time', type: 'datetime' }, { field: 'username', label: 'User' }, { field: 'action', label: 'Action', type: 'status' }, { field: 'tbl', label: 'Table' }, { field: 'rec_id', label: 'Record' }, { field: 'detail_text', label: 'Changes' }],
    sort: { field: 'id', dir: 'desc' } };

  /* ---------------------------------------------------------- Administration (adminOnly) ---------------------------------------------------------- */
  const api = (m, u, b) => DB.request(m, u, b);
  const ROLES = ['Employee', 'Contractor', 'Finance', 'Supervisor', 'Administrator'];
  const fld = (field, label, type, extra) => Object.assign({ field, label, type: type || 'text' }, extra || {});
  const shortUA = (ua) => { ua = String(ua || ''); const m = ua.match(/(Edg|OPR|Firefox|Chrome|Safari)\/(\d+)/); const os = /Windows/.test(ua) ? 'Windows' : /Android/.test(ua) ? 'Android' : /iPhone|iPad/.test(ua) ? 'iOS' : /Mac OS/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : ''; return m ? ({ Edg: 'Edge', OPR: 'Opera' }[m[1]] || m[1]) + ' ' + m[2] + (os ? ' / ' + os : '') : ua.slice(0, 40); };
  const fmtUp = (s) => { s = Math.floor(s || 0); const d = Math.floor(s / 86400), hh = Math.floor(s % 86400 / 3600), mm = Math.floor(s % 3600 / 60); return d ? `${d}d ${hh}h` : hh ? `${hh}h ${mm}m` : `${mm}m`; };
  const fmtBytes = (b) => (b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.round((b || 0) / 1024) + ' KB');
  const admModal = (title, sections, rec, save) => {
    const f = UI.buildForm(sections, rec || null, {});
    UI.modal(title, f, [{ label: 'Save', cls: 'primary', onClick: (close) => {
      const { vals, missing } = f.read();
      if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
      if (save(vals) !== false) close();
    } }]);
  };

  V['admin-dashboard'] = { type: 'custom', title: 'Admin Dashboard', adminOnly: true, render(root, ctx) {
    const r = api('GET', '/api/admin/stats'); const s = r.body;
    if (!r.ok || !s) { root.appendChild(UI.h('<div class="noresults">Statistics are unavailable.</div>')); return; }
    const t = s.tables || {}, u = s.users || {}, sv = s.server || {};
    const kp = [[u.total, 'Total Users'], [u.active, 'Active Users'], [(s.sessions || {}).active, 'Active Sessions'], [t.wr, 'Work Requests'], [t.ptw, 'Permits'], [t.incidents, 'Incidents'], [fmtBytes((s.db || {}).bytes), 'Database Size'], [fmtUp(sv.uptime_s), 'Server Uptime']];
    root.appendChild(UI.h(`<div class="kpis">${kp.map((k) => `<div class="kpi"><b>${esc(k[0] == null ? '-' : k[0])}</b><span>${esc(k[1])}</span></div>`).join('')}</div>`));
    const links = UI.h('<div class="panel"><div class="panel-head"><span class="ttl">Quick Links</span></div><div style="padding:10px;display:flex;gap:8px;flex-wrap:wrap"></div></div>');
    [['User Accounts', 'admin-users'], ['Active Sessions', 'admin-sessions'], ['Activity Log', 'audit-log']].forEach((l) => { const b = UI.h(`<button class="btn">${esc(l[0])}</button>`); b.onclick = () => ctx.open(l[1]); links.lastElementChild.appendChild(b); });
    root.appendChild(links);
    const mk = (title) => { const p = UI.h(`<div class="panel"><div class="panel-head"><span class="ttl">${esc(title)}</span></div><div class="chart-box"><canvas></canvas></div></div>`); root.appendChild(p); return p; };
    const days = ((s.audit || {}).last7days || []), roles = u.byRole || {};
    const p1 = mk('Activity per Day (last 7 days)'), p2 = mk('Users by Role');
    if (!window.Chart) { [p1, p2].forEach((p) => { p.querySelector('.chart-box').innerHTML = '<div class="noresults">Chart library could not load (offline?).</div>'; }); return; }
    new window.Chart(p1.querySelector('canvas'), { type: 'bar', data: { labels: days.map((d) => d.day), datasets: [{ label: 'Events', data: days.map((d) => d.count), backgroundColor: '#2563eb', borderRadius: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    new window.Chart(p2.querySelector('canvas'), { type: 'doughnut', data: { labels: Object.keys(roles), datasets: [{ data: Object.values(roles), backgroundColor: ['#2563eb', '#f59e0b', '#0d9488', '#7c3aed'] }] }, options: { responsive: true, maintainAspectRatio: false } });
  } };

  const resolveOpts = (secs) => secs.map((s) => Object.assign({}, s, { fields: s.fields.map((f) => (typeof f.options === 'function' ? Object.assign({}, f, { options: f.options() }) : f)) }));
  const userFields = (isNew) => [{ title: isNew ? 'New user' : 'Edit user', fields: (isNew ? [fld('username', 'Username', 'text', { required: true }), fld('password', 'Initial Password', 'text', { required: true })] : []).concat([
    fld('name', 'Name', 'text', { required: true }), fld('role', 'Role', 'select', { options: ROLES, required: true }), fld('position', 'Position'), fld('company', 'Company'), fld('phone', 'Phone'), fld('email', 'E-mail'),
    fld('bl_id', 'Building', 'select', { options: () => DB.all('buildings').map((b) => b.id) })]) }];
  const patchUser = (row, patch, msg, refresh) => { const r = api('PATCH', '/api/admin/users/' + encodeURIComponent(row.id), patch); if (r.ok) { UI.toast(msg); refresh(); } };
  V['admin-users'] = { type: 'grid', title: 'User Accounts', gridTitle: 'User Accounts', adminOnly: true, pageSize: 20, indexField: null,
    rows: () => (api('GET', '/api/admin/users').body || []),
    filters: [fT('username', 'Username'), fS('role', 'Role', ROLES), fYN('active', 'Active', (r) => r.active)],
    columns: [{ field: 'username', label: 'Username' }, { field: 'name', label: 'Name' }, { field: 'role', label: 'Role', type: 'status' }, { field: 'position', label: 'Position' }, { field: 'company', label: 'Company' }, { field: 'email', label: 'E-mail' }, { field: 'phone', label: 'Phone' }, { field: 'bl_id', label: 'Building' }, { field: 'active', label: 'Active', type: 'bool' }, { field: 'last_login', label: 'Last Login', type: 'datetime' }, { field: 'created_at', label: 'Created', type: 'datetime' }],
    sort: { field: 'username', dir: 'asc' },
    toolbar: [{ label: 'New User', cls: 'primary', onClick: (ctx, g) => admModal('New User', resolveOpts(userFields(true)), null, (v) => { const r = api('POST', '/api/admin/users', v); if (!r.ok) return false; UI.toast('User ' + v.username + ' created'); g.refresh(); }) }],
    rowActions: [
      { label: 'Edit', onClick: (row, ctx, g) => admModal('Edit ' + row.username, resolveOpts(userFields(false)), row, (v) => { const r = api('PATCH', '/api/admin/users/' + encodeURIComponent(row.id), v); if (!r.ok) return false; UI.toast('User updated'); g.refresh(); }) },
      { label: 'Reset Password', onClick: (row, ctx, g) => admModal('Reset Password - ' + row.username, [{ title: 'New password (min 8 chars, letters and digits)', fields: [fld('password', 'New Password', 'text', { required: true })] }], null, (v) => { const r = api('POST', '/api/admin/users/' + encodeURIComponent(row.id) + '/password', { password: v.password }); if (!r.ok) return false; UI.toast('Password reset; sessions ended'); g.refresh(); }) },
      { label: 'Deactivate', show: (r) => r.active, onClick: (row, ctx, g) => { if (confirm('Deactivate user ' + row.username + '?')) patchUser(row, { active: false }, 'User deactivated', g.refresh); } },
      { label: 'Activate', show: (r) => !r.active, onClick: (row, ctx, g) => { if (confirm('Activate user ' + row.username + '?')) patchUser(row, { active: true }, 'User activated', g.refresh); } },
      { label: 'End Sessions', onClick: (row, ctx, g) => { if (!confirm('End all sessions of ' + row.username + '?')) return; const r = api('POST', '/api/admin/users/' + encodeURIComponent(row.id) + '/terminate-sessions'); if (r.ok) { UI.toast(((r.body || {}).terminated || 0) + ' session(s) ended'); g.refresh(); } } }
    ] };

  V['admin-sessions'] = { type: 'grid', title: 'Active Sessions', gridTitle: 'Active Sessions', adminOnly: true, pageSize: 20, indexField: null,
    rows: () => (api('GET', '/api/admin/sessions').body || []).map((s) => Object.assign({}, s, { browser: shortUA(s.user_agent) })),
    filters: [fT('username', 'User'), fS('role', 'Role', ROLES)],
    columns: [{ field: 'username', label: 'User' }, { field: 'name', label: 'Name' }, { field: 'role', label: 'Role', type: 'status' }, { field: 'created', label: 'Signed in', type: 'datetime' }, { field: 'last_seen', label: 'Last seen', type: 'datetime' }, { field: 'expires', label: 'Expires', type: 'datetime' }, { field: 'ip', label: 'IP' }, { field: 'browser', label: 'Browser' }, { field: 'current', label: 'Current', render: (r) => (r.current ? '<span class="badge ok">This session</span>' : '') }],
    sort: { field: 'last_seen', dir: 'desc' },
    rowActions: [{ label: 'End Session', show: (r) => !r.current, onClick: (row, ctx, g) => { if (!confirm('End the session of ' + row.username + ' (' + row.ip + ')?')) return; const r = api('DELETE', '/api/admin/sessions/' + encodeURIComponent(row.sid)); if (r.ok) { UI.toast('Session ended'); g.refresh(); } } }] };

  /* Reference-data grids */
  const cityOpts = () => [...new Set(DB.all('sites').map((s) => s.city).concat(DB.all('buildings').map((b) => b.city)).filter(Boolean))].sort();
  const countBy = (t, f, k, pred) => DB.all(t).filter((r) => r[f] === k && (!pred || pred(r))).length;
  const refView = (table, title, noun, fields, columns, filters) => {
    const secs = (withId) => [{ title: noun, fields: (withId ? [fld('id', 'Code', 'text', { required: true })] : []).concat(fields) }];
    const del = (row, ctx, g) => { if (!confirm('Delete ' + noun + ' ' + row.id + '? This cannot be undone.')) return; if (DB.remove(table, row.id) !== false) { UI.toast(noun + ' ' + row.id + ' deleted'); g.refresh(); } };
    return { type: 'grid', title, gridTitle: title, table, adminOnly: true, pageSize: 20, indexField: null, sort: { field: 'id', dir: 'asc' }, columns, filters,
      toolbar: [{ label: 'New ' + noun, cls: 'primary', onClick: (ctx, g) => admModal('New ' + noun, resolveOpts(secs(true)), null, (v) => { if (!DB.insert(table, v)) return false; UI.toast(noun + ' ' + v.id + ' created'); g.refresh(); }) }],
      rowActions: [{ label: 'Edit', onClick: (row, ctx, g) => admModal('Edit ' + noun + ' ' + row.id, resolveOpts(secs(false)), row, (v) => { if (!DB.update(table, row.id, v)) return false; UI.toast(noun + ' ' + row.id + ' updated'); g.refresh(); }) }, { label: 'Delete', onClick: del }] };
  };
  const sel = (field, label, options) => fld(field, label, 'select', { options });
  const cnt = (field, label, t, f, pred) => ({ field, label, type: 'number', render: (r) => String(countBy(t, f, r.id, pred)) });
  V['admin-sites'] = refView('sites', 'Sites', 'Site', [fld('name', 'Name', 'text', { required: true }), fld('city', 'City', 'text', { required: true }), fld('lat', 'Latitude', 'number'), fld('lng', 'Longitude', 'number')],
    cols('id|Code', 'name|Name', 'city|City', 'lat|Latitude', 'lng|Longitude').concat([cnt('nb', 'Buildings', 'buildings', 'site_id')]),
    [fT('id', 'Code'), fT('name', 'Name'), fS('city', 'City', cityOpts)]);
  V['admin-buildings'] = refView('buildings', 'Buildings', 'Building', [fld('name', 'Name', 'text', { required: true }), sel('site_id', 'Site', siteOpts), sel('city', 'City', cityOpts), fld('lat', 'Latitude', 'number'), fld('lng', 'Longitude', 'number'), fld('floors', 'Floors', 'number')],
    cols('id|Code', 'name|Name', 'site_id|Site', 'city|City', 'floors|Floors|number', 'lat|Latitude', 'lng|Longitude').concat([cnt('open_wr', 'Open WRs', 'wr', 'bl_id', isOpen)]),
    [fT('id', 'Code'), fT('name', 'Name'), fS('site_id', 'Site', siteOpts), fS('city', 'City', cityOpts)]);
  V['admin-floors'] = refView('floors', 'Floors', 'Floor', [sel('bl_id', 'Building', bldOpts), fld('fl_id', 'Floor Code', 'text', { required: true }), fld('name', 'Name', 'text', { required: true })],
    cols('id|Code', 'bl_id|Building', 'fl_id|Floor', 'name|Name'), [fT('id', 'Code'), fS('bl_id', 'Building', bldOpts), fT('name', 'Name')]);
  V['admin-trades'] = refView('trades', 'Trades / Problem Types', 'Trade', [fld('name', 'Name', 'text', { required: true })],
    cols('id|Code', 'name|Name').concat([cnt('nt', 'Work Teams', 'work_teams', 'trade'), cnt('nc', 'Craftspersons', 'craftspersons', 'trade')]),
    [fT('id', 'Code'), fT('name', 'Name')]);
  V['admin-work-teams'] = refView('work_teams', 'Work Teams', 'Work Team', [fld('name', 'Name', 'text', { required: true }), sel('trade', 'Trade', tradeOpts)],
    cols('id|Code', 'name|Name', 'trade|Trade').concat([cnt('nc', 'Craftspersons', 'craftspersons', 'work_team')]),
    [fT('id', 'Code'), fT('name', 'Name'), fS('trade', 'Trade', tradeOpts)]);
  V['admin-craftspersons'] = refView('craftspersons', 'Craftspersons', 'Craftsperson', [fld('name', 'Name', 'text', { required: true }), sel('trade', 'Trade', tradeOpts), sel('work_team', 'Work Team', teamOpts)],
    cols('id|Code', 'name|Name', 'trade|Trade', 'work_team|Work Team'), [fT('id', 'Code'), fT('name', 'Name'), fS('trade', 'Trade', tradeOpts), fS('work_team', 'Work Team', teamOpts)]);

  /* =====================================================================
   * WORKPLACE SERVICES
   * ===================================================================== */
  const SR_CATEGORIES = [
    { id: 'hvac', name: 'Temperature & HVAC', icon: '❄️', desc: 'Air conditioning, heating, thermostat calibration and airflow adjustments.', examples: 'Too cold / too hot, unit noise, no airflow', prob: 'HVAC' },
    { id: 'cleaning', name: 'Cleaning & Janitorial', icon: '🧹', desc: 'Office hygiene, trash disposal, carpet vacuuming and washroom restocking.', examples: 'Liquid spills, pantry trash, window cleaning', prob: 'JAN' },
    { id: 'access', name: 'Keys & Access Cards', icon: '🔑', desc: 'Building smart cards, key duplication, office locks and badge permissions.', examples: 'New badge, jammed door lock, replacement card', prob: 'GSER' },
    { id: 'electrical', name: 'Electrical & Lighting', icon: '💡', desc: 'Light fixtures, switches, tripping power sockets, UPS and circuit breakers.', examples: 'Flickering LED, socket tripping, dead outlet', prob: 'ELEC' },
    { id: 'plumbing', name: 'Plumbing & Water', icon: '🚰', desc: 'Water dispensers, pantry sinks, washroom fixtures, drainage and leaks.', examples: 'Slow drain, leaking faucet, low pressure', prob: 'PLUMB' },
    { id: 'furniture', name: 'Furniture & Ergonomics', icon: '🪑', desc: 'Office chairs, height-adjustable desks, whiteboard installation, cabinet locks.', examples: 'Chair replacement, whiteboard mount, table repair', prob: 'GSER' }
  ];

  function openSrModal(catName, ctx, after) {
    const f = UI.buildForm([
      { title: 'Location', fields: [
        fld('site_id', 'Site Code', 'select', { options: siteOpts, default: 'EC', required: true }),
        fld('bl_id', 'Building Code', 'select', { options: bldOpts, required: true }),
        fld('fl_id', 'Floor', 'select', { options: ['GF', 'L1', 'L2'], default: 'GF', required: true }),
        fld('location', 'Room / Specific Location', 'text', { required: true })
      ]},
      { title: 'Request Details', fields: [
        fld('category', 'Category', 'readonly', { default: catName }),
        fld('priority', 'Priority', 'select', { options: ['1 - Emergency', '2 - Urgent', '3 - Standard', '4 - Low', '5 - Scheduled'], default: '3 - Standard' }),
        fld('description', 'Detailed Description', 'textarea', { required: true }),
        fld('phone', 'Contact Extension / Mobile', 'text', { default: me().phone || '4454-0000' })
      ]}
    ], null, {});
    UI.modal('New Service Request — ' + catName, f, [{
      label: 'Submit Request', cls: 'primary', onClick: (close) => {
        const { vals, missing } = f.read();
        if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
        const prioNum = parseInt(vals.priority, 10) || 3;
        const count = DB.all('service_requests').length + 1;
        const rec = DB.insert('service_requests', {
          req_code: 'SR-2026-' + String(8000 + count),
          requestor_name: me().name || 'Aya Mansoor',
          requestor_username: me().username || 'employee',
          department: me().company || 'Academic Affairs',
          category: catName,
          description: vals.description,
          site_id: vals.site_id || 'EC',
          bl_id: vals.bl_id,
          fl_id: vals.fl_id || 'GF',
          location: vals.location || '',
          priority: prioNum,
          status: 'Requested',
          created_at: nowIso(),
          target_completion: new Date(Date.now() + (prioNum <= 2 ? 1 : 3) * DAY).toISOString().slice(0, 10)
        });
        UI.toast('Service Request ' + rec.req_code + ' submitted successfully.');
        close();
        if (after) after(); else if (ctx && ctx.open) ctx.open('my-service-requests');
      }
    }]);
  }

  V['sr-catalog'] = {
    type: 'custom', title: 'Create Service Request', render(root, ctx) {
      const p = UI.h(`<div class="panel"><div class="panel-head"><span class="ttl">Workplace Service Catalog</span><span class="sp"></span><button class="btn" data-my>My Requests</button></div>
        <div class="legend" style="padding:12px 16px;border-bottom:1px solid var(--line);color:var(--muted)">Select a service category below to submit a facilities maintenance or assistance request. Our engineering team reviews and dispatches requests within agreed SLAs.</div>
        <div class="cat-cards"></div>
      </div>`);
      p.querySelector('[data-my]').onclick = () => ctx.open('my-service-requests');
      const container = p.querySelector('.cat-cards');
      SR_CATEGORIES.forEach((cat) => {
        const c = UI.h(`<div class="cat-card">
          <div style="display:flex;align-items:center;gap:12px">
            <div class="cat-icon">${cat.icon}</div>
            <div>
              <div class="cat-title">${esc(cat.name)}</div>
              <span class="badge info">SLA: 4-24 hrs</span>
            </div>
          </div>
          <div class="cat-desc">${esc(cat.desc)}</div>
          <div class="cat-examples"><b>Examples:</b> ${esc(cat.examples)}</div>
          <button class="btn primary" style="width:100%;margin-top:auto">Raise Request &rarr;</button>
        </div>`);
        c.querySelector('button').onclick = () => openSrModal(cat.name, ctx);
        container.appendChild(c);
      });
      root.appendChild(p);
    }
  };

  V['my-service-requests'] = {
    type: 'grid', title: 'My Service Requests', gridTitle: 'My Service Requests', table: 'service_requests',
    where: (r) => { const u = me().username; return u === 'admin' || u === 'supervisor' || u === 'finance' || r.requestor_username === u; },
    filters: [
      fS('status', 'Status', ['Requested', 'In Triage', 'Dispatched', 'In Progress', 'Completed', 'Rejected', 'Cancelled']),
      fS('category', 'Category', SR_CATEGORIES.map(c => c.name)),
      fS('bl_id', 'Building', bldOpts)
    ],
    columns: [
      { field: 'req_code', label: 'Request Code' },
      { field: 'created_at', label: 'Date Requested', type: 'date' },
      { field: 'category', label: 'Category' },
      { field: 'bl_id', label: 'Building' },
      { field: 'fl_id', label: 'Floor' },
      { field: 'description', label: 'Description' },
      { field: 'priority', label: 'Priority', type: 'number' },
      { field: 'status', label: 'Status', type: 'status' },
      { field: 'target_completion', label: 'Target Date', type: 'date' },
      { field: 'assigned_team', label: 'Assigned Team' },
      { field: 'satisfaction_rating', label: 'Satisfaction', render: (r) => {
        if (r.satisfaction_rating) return '<span style="color:#f59e0b;font-size:14px">' + '★'.repeat(r.satisfaction_rating) + '</span>';
        if (r.status === 'Completed') return '<span class="badge warn">Pending Rating</span>';
        return '<span style="color:var(--muted)">-</span>';
      }}
    ],
    sort: { field: 'id', dir: 'desc' },
    toolbar: [{ label: 'New Request', cls: 'primary', onClick: (ctx) => ctx.open('sr-catalog') }],
    rowActions: [
      { label: 'Track', onClick: (r, ctx) => ctx.open('sr-tracking', { req_id: r.id }) },
      { label: 'Rate & Feedback', show: (r) => r.status === 'Completed' && !r.satisfaction_rating, onClick: (r, ctx, g) => {
        const form = UI.buildForm([{ title: 'Rate Service Quality', fields: [
          fld('satisfaction_rating', 'Rating (1 to 5 Stars)', 'select', { options: ['5 - Excellent', '4 - Very Good', '3 - Satisfactory', '2 - Poor', '1 - Unacceptable'], required: true, default: '5 - Excellent' }),
          fld('feedback_notes', 'Comments / Feedback', 'textarea', { required: true })
        ]}], null, {});
        UI.modal('Feedback for ' + r.req_code, form, [{
          label: 'Submit Feedback', cls: 'primary', onClick: (close) => {
            const { vals, missing } = form.read();
            if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
            DB.update('service_requests', r.id, { satisfaction_rating: parseInt(vals.satisfaction_rating, 10) || 5, feedback_notes: vals.feedback_notes });
            UI.toast('Thank you for your rating!');
            close();
            g.refresh();
          }
        }]);
      }},
      { label: 'Cancel', show: (r) => r.status === 'Requested', onClick: (r, ctx, g) => {
        if (confirm('Cancel request ' + r.req_code + '?')) {
          DB.update('service_requests', r.id, { status: 'Cancelled' });
          UI.toast('Request cancelled');
          g.refresh();
        }
      }},
      { label: 'Details', details: true }
    ]
  };

  V['sr-tracking'] = {
    type: 'custom', title: 'Service Request Tracking', render(root, ctx) {
      const allSrs = DB.all('service_requests');
      if (!allSrs.length) { root.appendChild(UI.h('<div class="noresults">No service requests found.</div>')); return; }
      let selId = (ctx.params && ctx.params.req_id) || allSrs[allSrs.length - 1].id;
      let cur = DB.get('service_requests', selId) || allSrs[allSrs.length - 1];

      const wrap = UI.h(`<div>
        <div class="panel">
          <div class="panel-head">
            <span class="ttl">Track Request</span>
            <select data-sr style="font-size:13px;padding:4px 8px;border-radius:6px;border:1px solid var(--line-strong)"></select>
            <span class="sp"></span>
            <button class="btn" data-new>+ New Request</button>
          </div>
          <div data-body style="padding:16px"></div>
        </div>
      </div>`);

      wrap.querySelector('[data-new]').onclick = () => ctx.open('sr-catalog');
      const sel = wrap.querySelector('[data-sr]');
      allSrs.slice(-30).reverse().forEach((s) => {
        const opt = document.createElement('option');
        opt.value = s.id;
        opt.textContent = `${s.req_code} - ${s.category} (${s.status})`;
        if (String(s.id) === String(cur.id)) opt.selected = true;
        sel.appendChild(opt);
      });

      const drawDetails = (sr) => {
        const body = wrap.querySelector('[data-body]');
        body.innerHTML = '';

        const steps = [
          { title: 'Requested', sub: 'Submitted by user' },
          { title: 'In Triage', sub: 'Facilities review' },
          { title: 'Dispatched', sub: 'Assigned to team' },
          { title: 'In Progress', sub: 'Contractor on-site' },
          { title: 'Completed', sub: 'Handover & rated' }
        ];
        let stepIdx = 0;
        if (sr.status === 'Requested') stepIdx = 0;
        else if (sr.status === 'In Triage') stepIdx = 1;
        else if (sr.status === 'Dispatched') stepIdx = 2;
        else if (sr.status === 'In Progress') stepIdx = 3;
        else if (sr.status === 'Completed' || sr.status === 'Closed') stepIdx = 4;
        else if (sr.status === 'Rejected' || sr.status === 'Cancelled') stepIdx = -1;

        const fillPct = stepIdx < 0 ? 0 : Math.round((stepIdx / (steps.length - 1)) * 100);

        const stepper = UI.h(`<div style="margin-bottom:20px;border-bottom:1px solid var(--line);padding-bottom:20px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
            <div><b style="font-size:16px;color:var(--text)">${esc(sr.req_code)}</b> &mdash; <span class="badge ${STATUS_CLASS(sr.status)}">${esc(sr.status)}</span></div>
            <div style="font-size:12.5px;color:var(--muted)">Target Date: <b>${esc(UI.fmtDate(sr.target_completion) || 'Within 24h')}</b></div>
          </div>
          ${stepIdx < 0 ? `<div class="badge bad" style="font-size:13px;padding:6px 12px">Request ${esc(sr.status)}: ${esc(sr.rejection_reason || 'Request closed before completion.')}</div>` : `
          <div class="track-step-bar">
            <div class="track-line"><div class="track-line-fill" style="width:${fillPct}%"></div></div>
            ${steps.map((st, idx) => {
              const cls = idx < stepIdx ? 'done' : (idx === stepIdx ? 'active' : '');
              const icon = idx < stepIdx ? '✓' : String(idx + 1);
              return `<div class="track-step ${cls}">
                <div class="track-circle">${icon}</div>
                <div class="track-title">${esc(st.title)}</div>
                <div class="track-sub">${esc(st.sub)}</div>
              </div>`;
            }).join('')}
          </div>`}
        </div>`);
        body.appendChild(stepper);

        const linkedWr = sr.wr_id ? DB.get('wr', sr.wr_id) : null;
        const linkedPtw = linkedWr && linkedWr.ptw_id ? DB.get('ptw', linkedWr.ptw_id) : null;

        const info = UI.h(`<div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(320px, 1fr));gap:16px">
          <div class="panel" style="margin:0">
            <div class="panel-head"><span class="ttl">Service Request Info</span></div>
            <div class="detail-grid" style="grid-template-columns:1fr">
              <div><span>Requestor:</span><b>${esc(sr.requestor_name)} (${esc(sr.requestor_username)})</b></div>
              <div><span>Department:</span><b>${esc(sr.department || 'N/A')}</b></div>
              <div><span>Category:</span><b>${esc(sr.category)}</b></div>
              <div><span>Location:</span><b>Building ${esc(sr.bl_id)}, Floor ${esc(sr.fl_id || 'GF')} ${esc(sr.location ? ' - ' + sr.location : '')}</b></div>
              <div><span>Priority:</span><b>Priority ${esc(sr.priority)}</b></div>
              <div><span>Submitted:</span><b>${esc(UI.fmtDT(sr.created_at))}</b></div>
              <div><span>Description:</span><b>${esc(sr.description)}</b></div>
            </div>
          </div>

          <div class="panel" style="margin:0">
            <div class="panel-head"><span class="ttl">Linked Maintenance Order</span></div>
            <div class="detail-grid" style="grid-template-columns:1fr">
              <div><span>Work Order Ref:</span><b>${linkedWr ? `<span class="badge info">WR #${linkedWr.id}</span>` : '<span style="color:var(--muted)">Pending Dispatch</span>'}</b></div>
              <div><span>Work Team:</span><b>${esc(sr.assigned_team || (linkedWr && linkedWr.work_team) || 'Triage Pending')}</b></div>
              <div><span>Assigned Craftsperson:</span><b>${esc((linkedWr && linkedWr.craftsperson) || 'On Dispatch')}</b></div>
              <div><span>Target SLA:</span><b>${esc(UI.fmtDate(sr.target_completion))}</b></div>
              <div><span>Permit to Work (PTW):</span><b>${linkedPtw ? `<span class="badge ok">PTW #${linkedPtw.id} (${linkedPtw.status})</span>` : '<span style="color:var(--muted)">None required / Not issued</span>'}</b></div>
              <div><span>Contractor Feedback:</span><b>${esc((linkedWr && linkedWr.completion_feedback) || 'Work in progress')}</b></div>
            </div>
          </div>
        </div>`);
        body.appendChild(info);

        if (sr.satisfaction_rating || sr.feedback_notes) {
          const fb = UI.h(`<div class="panel" style="margin-top:16px;background:var(--brand-soft);border-color:var(--brand)">
            <div class="panel-head"><span class="ttl">User Rating & Feedback</span></div>
            <div style="padding:12px 16px;display:flex;align-items:center;gap:16px">
              <div style="font-size:24px;color:#f59e0b">${'★'.repeat(sr.satisfaction_rating || 5)}</div>
              <div>
                <b>${esc(sr.requestor_name)}:</b> "${esc(sr.feedback_notes || 'Service performed satisfactorily.')}"
              </div>
            </div>
          </div>`);
          body.appendChild(fb);
        }
      };

      sel.onchange = () => {
        const found = DB.get('service_requests', sel.value);
        if (found) drawDetails(found);
      };

      drawDetails(cur);
      root.appendChild(wrap);
    }
  };

  V['reserve-room'] = {
    type: 'custom', title: 'Reserve a Meeting Room', render(root, ctx) {
      const allRooms = DB.all('rooms');
      const wrap = UI.h(`<div>
        <div class="panel">
          <div class="panel-head">
            <span class="ttl">Meeting Room Booking Console</span>
            <span class="sp"></span>
            <button class="btn" data-my>My Bookings</button>
          </div>
          <div class="form-grid" style="padding:12px 16px;background:var(--panel-head);border-bottom:1px solid var(--line);grid-template-columns:repeat(auto-fit, minmax(180px, 1fr))">
            <div class="fld"><label>Building</label><div class="ctl"><select data-bl><option value="">All Buildings</option>${bldOpts().map(b => `<option value="${b}">${b}</option>`).join('')}</select></div></div>
            <div class="fld"><label>Floor</label><div class="ctl"><select data-fl><option value="">All Floors</option><option value="GF">Ground Floor (GF)</option><option value="L1">Level 1 (L1)</option><option value="L2">Level 2 (L2)</option></select></div></div>
            <div class="fld"><label>Capacity</label><div class="ctl"><select data-cap><option value="0">Any Capacity</option><option value="6">6+ Seats</option><option value="12">12+ Seats</option><option value="20">20+ Seats</option></select></div></div>
            <div class="fld"><label>Booking Date</label><div class="ctl"><input type="date" data-dt value="${new Date().toISOString().slice(0, 10)}"></div></div>
          </div>
          <div class="cat-cards" data-grid></div>
        </div>
      </div>`);

      wrap.querySelector('[data-my]').onclick = () => ctx.open('my-reservations');
      const bSel = wrap.querySelector('[data-bl]'), flSel = wrap.querySelector('[data-fl]'), capSel = wrap.querySelector('[data-cap]'), dtIn = wrap.querySelector('[data-dt]');
      const container = wrap.querySelector('[data-grid]');

      const drawRooms = () => {
        container.innerHTML = '';
        const bVal = bSel.value, flVal = flSel.value, capVal = Number(capSel.value) || 0;
        const filtered = allRooms.filter((r) => (!bVal || r.bl_id === bVal) && (!flVal || r.fl_id === flVal) && (r.capacity >= capVal));
        if (!filtered.length) { container.innerHTML = '<div class="noresults" style="grid-column:1/-1">No meeting rooms match the selected criteria.</div>'; return; }

        filtered.forEach((rm) => {
          const card = UI.h(`<div class="cat-card">
            <div style="display:flex;align-items:flex-start;justify-content:space-between">
              <div>
                <div class="cat-title">${esc(rm.name)}</div>
                <div style="font-size:12px;color:var(--muted)">${esc(rm.bl_name || rm.bl_id)} &bull; ${esc(rm.room_code)}</div>
              </div>
              <span class="badge ${rm.status === 'Available' ? 'ok' : 'warn'}">${esc(rm.status || 'Available')}</span>
            </div>
            <div style="font-size:12.5px;color:var(--text-2);margin-top:4px">
              <b>Type:</b> ${esc(rm.rm_type)}<br>
              <b>Capacity:</b> ${esc(rm.capacity)} Persons &bull; <b>Area:</b> ${esc(rm.area_sqm)} m²
            </div>
            <div class="cat-examples" style="margin-top:4px"><b>Amenities:</b> ${esc(rm.amenities || 'AV Display, Wi-Fi')}</div>
            <button class="btn primary" style="width:100%;margin-top:auto">Book Room &rarr;</button>
          </div>`);

          card.querySelector('button').onclick = () => {
            const f = UI.buildForm([
              { title: 'Room Details', fields: [
                fld('room', 'Room', 'readonly', { default: `${rm.name} (${rm.room_code}) - ${rm.bl_id}` }),
                fld('date', 'Date', 'date', { default: dtIn.value, required: true }),
                fld('start', 'Start Time', 'select', { options: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'], default: '09:00', required: true }),
                fld('end', 'End Time', 'select', { options: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'], default: '10:00', required: true })
              ]},
              { title: 'Meeting Info', fields: [
                fld('purpose', 'Meeting Purpose / Agenda', 'textarea', { required: true }),
                fld('attendees', 'Expected Attendees', 'number', { default: rm.capacity })
              ]}
            ], null, {});

            UI.modal('Book ' + rm.name, f, [{
              label: 'Confirm Booking', cls: 'primary', onClick: (close) => {
                const { vals, missing } = f.read();
                if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
                DB.insert('bookings', {
                  bl_id: rm.bl_id,
                  room: `${rm.name} (${rm.room_code})`,
                  date: vals.date,
                  start: vals.start,
                  end: vals.end,
                  purpose: vals.purpose,
                  booked_by: me().name || 'Aya Mansoor',
                  attendees: Number(vals.attendees) || rm.capacity
                });
                UI.toast(`Meeting room ${rm.name} booked successfully!`);
                close();
                ctx.open('my-reservations');
              }
            }]);
          };
          container.appendChild(card);
        });
      };

      [bSel, flSel, capSel, dtIn].forEach((el) => { el.onchange = drawRooms; });
      drawRooms();
      root.appendChild(wrap);
    }
  };

  V['reserve-desk'] = {
    type: 'custom', title: 'Book a Desk (Hoteling)', render(root, ctx) {
      const allDesks = DB.all('desks');
      const deskBldOpts = [...new Set(allDesks.map(d => d.bl_id))];
      const wrap = UI.h(`<div>
        <div class="panel">
          <div class="panel-head">
            <span class="ttl">Hoteling & Desk Reservation</span>
            <span class="sp"></span>
            <button class="btn" data-my>My Bookings</button>
          </div>
          <div class="form-grid" style="padding:12px 16px;background:var(--panel-head);border-bottom:1px solid var(--line);grid-template-columns:repeat(auto-fit, minmax(200px, 1fr))">
            <div class="fld"><label>Building</label><div class="ctl"><select data-bl>${deskBldOpts.map(b => `<option value="${b}">${b}</option>`).join('')}</select></div></div>
            <div class="fld"><label>Floor</label><div class="ctl"><select data-fl><option value="GF">Ground Floor (GF)</option><option value="L1">Level 1 (L1)</option></select></div></div>
            <div class="fld"><label>Date</label><div class="ctl"><input type="date" data-dt value="${new Date().toISOString().slice(0, 10)}"></div></div>
          </div>
          <div class="desk-grid" data-grid></div>
        </div>
      </div>`);

      wrap.querySelector('[data-my]').onclick = () => ctx.open('my-reservations');
      const bSel = wrap.querySelector('[data-bl]'), flSel = wrap.querySelector('[data-fl]'), dtIn = wrap.querySelector('[data-dt]');
      const container = wrap.querySelector('[data-grid]');

      const drawDesks = () => {
        container.innerHTML = '';
        const bVal = bSel.value, flVal = flSel.value;
        const list = allDesks.filter(d => d.bl_id === bVal && d.fl_id === flVal);
        if (!list.length) { container.innerHTML = '<div class="noresults" style="grid-column:1/-1">No hoteling desks found for this floor.</div>'; return; }

        list.forEach((desk) => {
          const isAvail = desk.status === 'Available';
          const card = UI.h(`<div class="desk-card ${isAvail ? 'available' : (desk.status === 'Reserved' ? 'reserved' : 'occupied')}">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <b style="font-size:14px;color:var(--text)">${esc(desk.desk_code)}</b>
              <span class="badge ${isAvail ? 'ok' : 'warn'}">${esc(desk.status)}</span>
            </div>
            <div style="font-size:12px;color:var(--muted)">${esc(desk.zone)} &bull; ${esc(desk.bl_name || desk.bl_id)}</div>
            <div class="desk-tags">
              ${desk.has_dual_monitor ? '<span class="desk-tag">🖥️ Dual Monitors</span>' : ''}
              ${desk.has_docking_station ? '<span class="desk-tag">⚡ USB-C Dock</span>' : ''}
              <span class="desk-tag">📶 High-speed Wi-Fi</span>
            </div>
            <button class="btn ${isAvail ? 'primary' : ''}" style="margin-top:10px;width:100%" ${isAvail ? '' : 'disabled'}>${isAvail ? 'Book Desk &rarr;' : 'Occupied / Reserved'}</button>
          </div>`);

          if (isAvail) {
            card.querySelector('button').onclick = () => {
              const f = UI.buildForm([
                { title: 'Hoteling Slot', fields: [
                  fld('desk', 'Selected Desk', 'readonly', { default: `${desk.desk_code} (${desk.bl_id} - ${desk.fl_id})` }),
                  fld('date', 'Booking Date', 'date', { default: dtIn.value, required: true }),
                  fld('slot', 'Reservation Slot', 'select', { options: ['Full Day (08:00 - 17:00)', 'Morning (08:00 - 12:30)', 'Afternoon (12:30 - 17:00)'], default: 'Full Day (08:00 - 17:00)', required: true }),
                  fld('department', 'Department', 'text', { default: me().company || 'Academic Affairs', required: true })
                ]}
              ], null, {});

              UI.modal('Reserve ' + desk.desk_code, f, [{
                label: 'Confirm Reservation', cls: 'primary', onClick: (close) => {
                  const { vals, missing } = f.read();
                  if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
                  DB.insert('desk_bookings', {
                    desk_id: desk.id,
                    desk_code: desk.desk_code,
                    bl_id: desk.bl_id,
                    fl_id: desk.fl_id,
                    date: vals.date,
                    slot: vals.slot,
                    booked_by: me().name || 'Aya Mansoor',
                    booked_by_username: me().username || 'employee',
                    department: vals.department,
                    status: 'Active',
                    created_at: nowIso()
                  });
                  DB.update('desks', desk.id, { status: 'Reserved' });
                  UI.toast(`${desk.desk_code} reserved successfully!`);
                  close();
                  drawDesks();
                }
              }]);
            };
          }
          container.appendChild(card);
        });
      };

      [bSel, flSel, dtIn].forEach((el) => { el.onchange = drawDesks; });
      drawDesks();
      root.appendChild(wrap);
    }
  };

  V['my-reservations'] = {
    type: 'custom', title: 'My Reservations', render(root, ctx) {
      const wrap = UI.h(`<div>
        <div class="panel">
          <div class="panel-head">
            <span class="ttl">Meeting Room Reservations</span>
            <span class="sp"></span>
            <button class="btn primary" data-new-rm>+ Reserve Room</button>
          </div>
          <div class="grid-wrap" data-rm-table></div>
        </div>

        <div class="panel" style="margin-top:20px">
          <div class="panel-head">
            <span class="ttl">Hoteling & Desk Bookings</span>
            <span class="sp"></span>
            <button class="btn primary" data-new-dsk>+ Book Desk</button>
          </div>
          <div class="grid-wrap" data-dsk-table></div>
        </div>
      </div>`);

      wrap.querySelector('[data-new-rm]').onclick = () => ctx.open('reserve-room');
      wrap.querySelector('[data-new-dsk]').onclick = () => ctx.open('reserve-desk');

      const drawRms = () => {
        const box = wrap.querySelector('[data-rm-table]');
        const bookings = DB.all('bookings');
        if (!bookings.length) { box.innerHTML = '<div class="noresults">No meeting room reservations found.</div>'; return; }
        box.innerHTML = `<table class="grid"><thead><tr><th>ID</th><th>Building</th><th>Room</th><th>Date</th><th>Time</th><th>Purpose</th><th>Booked By</th><th>Action</th></tr></thead><tbody>${bookings.map(b => `<tr>
          <td>${esc(b.id)}</td>
          <td><b>${esc(b.bl_id)}</b></td>
          <td>${esc(b.room)}</td>
          <td>${esc(UI.fmtDate(b.date))}</td>
          <td>${esc(b.start)} - ${esc(b.end)}</td>
          <td>${esc(b.purpose)}</td>
          <td>${esc(b.booked_by)}</td>
          <td><button class="btn" data-del-rm="${esc(b.id)}">Cancel</button></td>
        </tr>`).join('')}</tbody></table>`;

        box.querySelectorAll('[data-del-rm]').forEach((btn) => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-del-rm');
            if (confirm('Cancel meeting room reservation ' + id + '?')) {
              DB.remove('bookings', id);
              UI.toast('Reservation cancelled');
              drawRms();
            }
          };
        });
      };

      const drawDsks = () => {
        const box = wrap.querySelector('[data-dsk-table]');
        const dskBookings = DB.all('desk_bookings');
        if (!dskBookings.length) { box.innerHTML = '<div class="noresults">No desk hoteling reservations found.</div>'; return; }
        box.innerHTML = `<table class="grid"><thead><tr><th>ID</th><th>Desk Code</th><th>Building</th><th>Floor</th><th>Date</th><th>Slot</th><th>Booked By</th><th>Status</th><th>Action</th></tr></thead><tbody>${dskBookings.map(d => `<tr>
          <td>${esc(d.id)}</td>
          <td><b>${esc(d.desk_code)}</b></td>
          <td>${esc(d.bl_id)}</td>
          <td>${esc(d.fl_id)}</td>
          <td>${esc(UI.fmtDate(d.date))}</td>
          <td>${esc(d.slot)}</td>
          <td>${esc(d.booked_by)}</td>
          <td><span class="badge ${STATUS_CLASS(d.status)}">${esc(d.status)}</span></td>
          <td>
            ${d.status === 'Active' ? `<button class="btn green" data-checkin="${esc(d.id)}">Check In</button> <button class="btn" data-del-dsk="${esc(d.id)}">Cancel</button>` : ''}
          </td>
        </tr>`).join('')}</tbody></table>`;

        box.querySelectorAll('[data-checkin]').forEach((btn) => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-checkin');
            DB.update('desk_bookings', id, { status: 'Checked In' });
            UI.toast('Checked in to desk successfully');
            drawDsks();
          };
        });

        box.querySelectorAll('[data-del-dsk]').forEach((btn) => {
          btn.onclick = () => {
            const id = btn.getAttribute('data-del-dsk');
            if (confirm('Cancel desk reservation ' + id + '?')) {
              const rec = DB.get('desk_bookings', id);
              if (rec && rec.desk_id) DB.update('desks', rec.desk_id, { status: 'Available' });
              DB.update('desk_bookings', id, { status: 'Cancelled' });
              UI.toast('Desk reservation cancelled');
              drawDsks();
            }
          };
        });
      };

      drawRms();
      drawDsks();
      root.appendChild(wrap);
    }
  };

  /* =====================================================================
   * FACILITIES ENGINEERING
   * ===================================================================== */
  V['eng-triage'] = {
    type: 'grid', title: 'Service Request Triage Console', gridTitle: 'Incoming Service Requests', table: 'service_requests',
    filters: [
      fS('status', 'Status', ['Requested', 'In Triage', 'Dispatched', 'Completed', 'Rejected']),
      fS('category', 'Category', SR_CATEGORIES.map(c => c.name)),
      fS('bl_id', 'Building Code', bldOpts),
      fS('priority', 'Priority', PRIO)
    ],
    columns: [
      { field: 'req_code', label: 'SR Code' },
      { field: 'created_at', label: 'Date Requested', type: 'date' },
      { field: 'requestor_name', label: 'Requestor' },
      { field: 'department', label: 'Department' },
      { field: 'category', label: 'Category' },
      { field: 'bl_id', label: 'Building' },
      { field: 'fl_id', label: 'Floor' },
      { field: 'description', label: 'Description' },
      { field: 'priority', label: 'Priority', type: 'number' },
      { field: 'status', label: 'Status', type: 'status' },
      { field: 'assigned_team', label: 'Assigned Team' },
      { field: 'wr_id', label: 'Linked WR' }
    ],
    sort: { field: 'id', dir: 'desc' },
    rowActions: [
      { label: 'Triage & Accept', show: (r) => r.status === 'Requested', onClick: (r, ctx, g) => {
        const f = UI.buildForm([{ title: 'Triage Request', fields: [
          fld('priority', 'Priority', 'select', { options: PRIO, default: String(r.priority || 3), required: true }),
          fld('target_completion', 'Agreed Target Completion', 'date', { default: r.target_completion || new Date(Date.now() + 2*DAY).toISOString().slice(0, 10), required: true }),
          fld('triage_notes', 'Engineering Review Notes', 'textarea')
        ]}], null, {});
        UI.modal('Triage ' + r.req_code, f, [{
          label: 'Accept into Triage', cls: 'primary', onClick: (close) => {
            const { vals, missing } = f.read();
            if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
            DB.update('service_requests', r.id, { status: 'In Triage', priority: Number(vals.priority), target_completion: vals.target_completion, triage_notes: vals.triage_notes });
            UI.toast('Request ' + r.req_code + ' accepted into triage');
            close();
            g.refresh();
          }
        }]);
      }},
      { label: 'Dispatch to WR', show: (r) => ['Requested', 'In Triage'].includes(r.status), onClick: (r, ctx, g) => {
        const catObj = SR_CATEGORIES.find(c => c.name === r.category);
        const f = UI.buildForm([{ title: 'Dispatch to Maintenance Team', fields: [
          fld('work_team', 'Work Team', 'select', { options: teamOpts, required: true }),
          fld('prob_type', 'Trade / Problem Type', 'select', { options: tradeOpts, default: catObj ? catObj.prob : 'GSER', required: true }),
          fld('target_date', 'Agreed Target Date', 'date', { default: r.target_completion || new Date(Date.now() + 2*DAY).toISOString().slice(0, 10), required: true })
        ]}], null, {});
        UI.modal('Dispatch ' + r.req_code, f, [{
          label: 'Create Work Request', cls: 'primary', onClick: (close) => {
            const { vals, missing } = f.read();
            if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
            const wr = newWr({
              site_id: r.site_id || 'EC',
              bl_id: r.bl_id,
              fl_id: r.fl_id || 'GF',
              prob_type: vals.prob_type,
              description: `[${r.req_code}] ${r.description}`,
              priority: r.priority || 3,
              status: 'Approved',
              requestor: r.requestor_name,
              requestor_username: r.requestor_username,
              work_team: vals.work_team,
              date_agreed_target: vals.target_date
            });
            DB.update('service_requests', r.id, { status: 'Dispatched', wr_id: wr.id, assigned_team: vals.work_team });
            UI.toast(`Dispatched to Work Request #${wr.id}`);
            close();
            g.refresh();
          }
        }]);
      }},
      { label: 'Reject', show: (r) => ['Requested', 'In Triage'].includes(r.status), onClick: (r, ctx, g) => {
        const reason = prompt('Rejection reason:');
        if (reason) {
          DB.update('service_requests', r.id, { status: 'Rejected', rejection_reason: reason });
          UI.toast('Request rejected');
          g.refresh();
        }
      }},
      { label: 'Details', details: true }
    ]
  };

  V['eng-assign'] = {
    type: 'grid', title: 'Assign Work Orders to Contractor', gridTitle: 'Unassigned Work Requests', table: 'wr',
    where: (r) => ['Requested', 'Approved'].includes(r.status) && r.wr_type === 'On Demand',
    filters: [
      fS('prob_type', 'Trade / Problem Type', tradeOpts),
      fS('bl_id', 'Building Code', bldOpts),
      fS('priority', 'Priority', PRIO)
    ],
    columns: [
      { field: 'id', label: 'WR Code' },
      { field: 'date_requested', label: 'Date Requested', type: 'date' },
      { field: 'site_id', label: 'Site Code' },
      { field: 'bl_id', label: 'Building Code' },
      { field: 'prob_type', label: 'Problem Type' },
      { field: 'description', label: 'Description' },
      { field: 'priority', label: 'Priority', type: 'number' },
      { field: 'status', label: 'Status', type: 'status' },
      { field: 'work_team', label: 'Work Team' },
      { field: 'date_agreed_target', label: 'Agreed Target', type: 'date' }
    ],
    sort: { field: 'date_requested', dir: 'desc' },
    rowActions: [
      { label: 'Assign & Issue', cls: 'primary', onClick: (r, ctx, g) => {
        const cOpts = () => DB.all('craftspersons').map(c => c.name);
        const f = UI.buildForm([{ title: 'Assign Contractor Work Order', fields: [
          fld('work_team', 'Work Team', 'select', { options: teamOpts, default: r.work_team || '', required: true }),
          fld('craftsperson', 'Assigned Craftsperson', 'select', { options: cOpts }),
          fld('date_agreed_target', 'Agreed Target Date', 'date', { default: r.date_agreed_target || new Date(Date.now() + 3*DAY).toISOString().slice(0, 10), required: true })
        ]}], null, {});
        UI.modal('Assign WR #' + r.id, f, [{
          label: 'Issue Work Order', cls: 'primary', onClick: (close) => {
            const { vals, missing } = f.read();
            if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
            DB.update('wr', r.id, {
              status: 'Issued and In Process',
              work_team: vals.work_team,
              craftsperson: vals.craftsperson || '',
              date_assigned: nowIso(),
              date_agreed_target: vals.date_agreed_target
            });
            UI.toast('Work Request #' + r.id + ' Issued to ' + vals.work_team);
            close();
            g.refresh();
          }
        }]);
      }},
      { label: 'Details', details: true }
    ]
  };

  V['ptw-authority'] = {
    type: 'grid', title: 'Permit to Work Authority Console', gridTitle: 'Permits Awaiting Authorization & Issuance', table: 'ptw',
    where: (r) => ['Applied', 'Authorized', 'Waiting For Re Issuing'].includes(r.status),
    rowClass: ptwRowClass,
    legend: '<div class="legend" style="padding:10px 16px;background:var(--panel-head);border-bottom:1px solid var(--line);font-size:12.5px"><b>Enterprise PTW Workflow:</b> <span class="badge warn">Applied</span> &rarr; Click <b>Authorize (AUT)</b> &rarr; <span class="badge info">Authorized</span> &rarr; Click <b>Issue (I)</b> &rarr; Active on Site.</div>',
    filters: [
      fS('status', 'Status', ['Applied', 'Authorized', 'Waiting For Re Issuing']),
      fS('permit_type', 'Permit Type', ['HOT WORK', 'CONFINED SPACE', 'WORK AT HEIGHT', 'ELECTRICAL WORK', 'EXCAVATION', 'GENERAL HAZARDOUS']),
      fS('bl_id', 'Building Code', bldOpts)
    ],
    columns: [
      { field: 'id', label: 'PTW Code' },
      { field: 'wr_id', label: 'Work Request' },
      { field: 'site_id', label: 'Site Code' },
      { field: 'bl_id', label: 'Building Code' },
      { field: 'permit_type', label: 'Permit Type' },
      { field: 'date_start', label: 'Valid From', type: 'datetime' },
      { field: 'date_upto', label: 'Valid Until', type: 'datetime' },
      { field: 'safety_measures', label: 'Safety Measures' },
      { field: 'status', label: 'Status', type: 'status' }
    ],
    sort: { field: 'id', dir: 'desc' },
    rowActions: [
      { label: 'Authorize (AUT)', show: (r) => r.status === 'Applied', cls: 'primary', onClick: (r, ctx, g) => {
        if (confirm('Authorize Permit #' + r.id + ' as Safety Authority?')) {
          DB.update('ptw', r.id, { status: 'Authorized', authorized_by: me().name || 'Safety Authority', date_authorized: nowIso() });
          UI.toast('Permit #' + r.id + ' Authorized');
          g.refresh();
        }
      }},
      { label: 'Issue Permit (I)', show: (r) => r.status === 'Authorized', cls: 'primary', onClick: (r, ctx, g) => {
        if (confirm('Issue Permit #' + r.id + ' to contractor team?')) {
          DB.update('ptw', r.id, { status: 'Issued', issued_by: me().name || 'Safety Authority', date_issued: nowIso() });
          UI.toast('Permit #' + r.id + ' Issued and active');
          g.refresh();
        }
      }},
      { label: 'Approve Re-Issue', show: (r) => r.status === 'Waiting For Re Issuing', onClick: (r, ctx, g) => {
        if (confirm('Approve Re-Issuance for Permit #' + r.id + '?')) {
          DB.update('ptw', r.id, { status: 'Re Issued', date_reissued: nowIso() });
          UI.toast('Permit #' + r.id + ' Re-Issued');
          g.refresh();
        }
      }},
      { label: 'Reject', onClick: (r, ctx, g) => {
        const reason = prompt('Rejection reason:');
        if (reason) {
          DB.update('ptw', r.id, { status: 'Rejected', rejection_reason: reason });
          UI.toast('Permit #' + r.id + ' Rejected');
          g.refresh();
        }
      }},
      { label: 'Details', details: true }
    ]
  };

  V['eng-signoff'] = {
    type: 'grid', title: 'Work Order Sign-off & Handover', gridTitle: 'Contractor Completed Work Orders', table: 'wr',
    where: (r) => r.status === 'Contractor Completed',
    filters: [
      fS('prob_type', 'Problem Type', tradeOpts),
      fS('bl_id', 'Building Code', bldOpts),
      fT('work_team', 'Work Team')
    ],
    columns: [
      { field: 'id', label: 'WR Code' },
      { field: 'bl_id', label: 'Building Code' },
      { field: 'prob_type', label: 'Trade' },
      { field: 'description', label: 'Description' },
      { field: 'work_team', label: 'Work Team' },
      { field: 'date_contractor_completed', label: 'Contractor Done Date', type: 'date' },
      { field: 'act_hours', label: 'Actual Hours', type: 'number' },
      { field: 'act_cost', label: 'Actual Cost (QAR)', type: 'money' },
      { field: 'completion_feedback', label: 'Contractor Notes' },
      { field: 'status', label: 'Status', type: 'status' }
    ],
    sort: { field: 'date_contractor_completed', dir: 'desc' },
    rowActions: [
      { label: 'Sign-off (Complete)', cls: 'primary', onClick: (r, ctx, g) => {
        if (confirm('Sign off and mark Work Request #' + r.id + ' as Completed?')) {
          DB.update('wr', r.id, { status: 'Completed', date_completed: nowIso(), engineer_signoff: me().name });
          const allSrs = DB.all('service_requests');
          const matchedSr = allSrs.find(s => String(s.wr_id) === String(r.id));
          if (matchedSr) DB.update('service_requests', matchedSr.id, { status: 'Completed' });
          UI.toast('Work Request #' + r.id + ' signed off and Completed');
          g.refresh();
        }
      }},
      { label: 'Final Close (Archibus)', onClick: (r, ctx, g) => {
        if (confirm('Permanently close WR #' + r.id + ' in Archibus database?')) {
          DB.update('wr', r.id, { status: 'Closed', date_closed: nowIso(), closed_by: me().name });
          UI.toast('Work Request #' + r.id + ' Closed');
          g.refresh();
        }
      }},
      { label: 'Return for Rework', onClick: (r, ctx, g) => {
        const notes = prompt('Punchlist / Rework instructions:');
        if (notes) {
          DB.update('wr', r.id, { status: 'Issued and In Process', rework_reason: notes });
          UI.toast('Work Request #' + r.id + ' returned to contractor');
          g.refresh();
        }
      }},
      { label: 'Details', details: true }
    ]
  };

  /* =====================================================================
   * FINANCE & CONTRACTS
   * ===================================================================== */
  V['wcc-create'] = {
    type: 'custom', title: 'Generate Work Confirmation Certificates', render(root, ctx) {
      const completedWrs = DB.all('wr').filter(w => ['Completed', 'Closed'].includes(w.status)).slice(0, 40);
      const bpas = DB.all('bpa_contracts');

      const wrap = UI.h(`<div>
        <div class="panel">
          <div class="panel-head">
            <span class="ttl">Batch Work Confirmation Certificate (WCC) Generator</span>
            <span class="sp"></span>
            <button class="btn primary" data-gen>Generate WCC for Selected WRs</button>
          </div>
          <div style="padding:12px 16px;background:var(--panel-head);border-bottom:1px solid var(--line);font-size:12.5px;color:var(--text-2)">
            Select completed contractor work orders below to compile into an official Work Confirmation Certificate (Service Entry Sheet) for Finance review and Oracle Fusion ERP billing.
          </div>
          <div class="grid-wrap" style="max-height:480px;overflow:auto">
            <table class="grid">
              <thead><tr>
                <th style="width:40px"><input type="checkbox" data-chk-all checked></th>
                <th>WR Code</th><th>Building</th><th>Trade</th><th>Date Completed</th><th>Hours</th><th>Actual Cost (QAR)</th><th>Work Team</th>
              </tr></thead>
              <tbody data-tbody></tbody>
            </table>
          </div>
        </div>
      </div>`);

      const tbody = wrap.querySelector('[data-tbody]');
      if (!completedWrs.length) {
        tbody.innerHTML = '<tr><td colspan="7" class="noresults">No completed work requests available for WCC billing.</td></tr>';
      } else {
        completedWrs.forEach((w) => {
          const cost = w.act_cost || w.est_cost || 450;
          const tr = UI.h(`<tr>
            <td><input type="checkbox" data-wr-id="${esc(w.id)}" data-cost="${cost}" checked></td>
            <td><b>${esc(w.id)}</b></td>
            <td>${esc(w.bl_id)}</td>
            <td>${esc(w.prob_type)}</td>
            <td>${esc(UI.fmtDate(w.date_completed || w.date_contractor_completed))}</td>
            <td>${esc(w.act_hours || 4)} hrs</td>
            <td><b>${esc(UI.fmtNum(cost, 2))}</b></td>
            <td>${esc(w.work_team || 'Contractor')}</td>
          </tr>`);
          tbody.appendChild(tr);
        });
      }

      const chkAll = wrap.querySelector('[data-chk-all]');
      chkAll.onchange = () => {
        tbody.querySelectorAll('input[type=checkbox]').forEach(c => { c.checked = chkAll.checked; });
      };

      wrap.querySelector('[data-gen]').onclick = () => {
        const checked = [...tbody.querySelectorAll('input[data-wr-id]:checked')];
        if (!checked.length) return UI.toast('Please select at least one Work Request.', true);

        const wrIds = checked.map(c => c.getAttribute('data-wr-id'));
        const totalSum = checked.reduce((acc, c) => acc + Number(c.getAttribute('data-cost') || 0), 0);

        const bpaOpts = bpas.map(b => `${b.bpa_number} - ${b.title}`);
        const f = UI.buildForm([
          { title: 'WCC Details', fields: [
            fld('bpa_contract', 'Blanket Purchase Agreement', 'select', { options: bpaOpts, required: true, default: bpaOpts[0] }),
            fld('title', 'Certificate Title', 'text', { default: `Monthly Maintenance Sign-off - ${new Date().toLocaleDateString('en-US', { month: 'short', year: 'numeric' })}`, required: true }),
            fld('period_start', 'Period Start Date', 'date', { default: '2026-10-01', required: true }),
            fld('period_end', 'Period End Date', 'date', { default: '2026-10-31', required: true }),
            fld('total_amount', 'Total Amount (QAR)', 'readonly', { default: UI.fmtNum(totalSum, 2) })
          ]}
        ], null, {});

        UI.modal('Create Work Confirmation Certificate', f, [{
          label: 'Submit Certificate', cls: 'primary', onClick: (close) => {
            const { vals, missing } = f.read();
            if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
            const count = DB.all('wcc').length + 1;
            const bpaNum = vals.bpa_contract.split(' - ')[0];
            const newWcc = DB.insert('wcc', {
              wcc_number: 'WCC-2026-' + String(100 + count),
              contractor: 'SONU Contracting Services',
              bpa_number: bpaNum,
              title: vals.title,
              period_start: vals.period_start,
              period_end: vals.period_end,
              wr_count: wrIds.length,
              wr_codes: wrIds.join(', '),
              total_amount: totalSum,
              status: 'Submitted',
              submitted_date: nowIso()
            });
            UI.toast(`Certificate ${newWcc.wcc_number} submitted to Facilities Engineer!`);
            close();
            ctx.open('wcc-review');
          }
        }]);
      };

      root.appendChild(wrap);
    }
  };

  V['wcc-review'] = {
    type: 'grid', title: 'Review & Approve WCCs', gridTitle: 'Work Confirmation Certificates (WCC)', table: 'wcc',
    filters: [
      fS('status', 'Status', ['Draft', 'Submitted', 'Approved by Engineer', 'Verified by Finance']),
      fS('bpa_number', 'BPA Agreement', () => DB.all('bpa_contracts').map(b => b.bpa_number))
    ],
    columns: [
      { field: 'wcc_number', label: 'Certificate No' },
      { field: 'bpa_number', label: 'BPA Agreement' },
      { field: 'title', label: 'Title / Description' },
      { field: 'contractor', label: 'Contractor' },
      { field: 'period_start', label: 'Period Start', type: 'date' },
      { field: 'period_end', label: 'Period End', type: 'date' },
      { field: 'wr_count', label: 'WR Count', type: 'number' },
      { field: 'total_amount', label: 'Total Amount (QAR)', type: 'money' },
      { field: 'status', label: 'Status', type: 'status' },
      { field: 'engineer_approved_by', label: 'Engineer Approval' },
      { field: 'finance_verified_by', label: 'Finance Verified' },
      { field: 'erp_ses_number', label: 'ERP SES Ref' }
    ],
    sort: { field: 'id', dir: 'desc' },
    rowActions: [
      { label: 'Approve (Engineer)', show: (r) => r.status === 'Submitted', cls: 'primary', onClick: (r, ctx, g) => {
        if (confirm('Approve WCC ' + r.wcc_number + ' as Facilities Engineer?')) {
          DB.update('wcc', r.id, { status: 'Approved by Engineer', engineer_approved_by: me().name || 'Facilities Engineer' });
          UI.toast('WCC ' + r.wcc_number + ' approved and forwarded to Finance');
          g.refresh();
        }
      }},
      { label: 'Verify for ERP (SES)', show: (r) => r.status === 'Approved by Engineer', cls: 'primary', onClick: (r, ctx, g) => {
        if (confirm('Verify WCC ' + r.wcc_number + ' and generate Oracle Fusion SES entry?')) {
          const sesNo = 'SES-' + (840000 + Math.floor(Math.random() * 99999));
          DB.update('wcc', r.id, { status: 'Verified by Finance', finance_verified_by: me().name || 'Finance Controller', erp_ses_number: sesNo });
          UI.toast(`WCC Verified & Service Entry Sheet ${sesNo} created in Oracle Fusion`);
          g.refresh();
        }
      }},
      { label: 'View Line WRs', onClick: (r) => {
        UI.modal('Work Requests in ' + r.wcc_number, UI.h(`<div style="padding:16px">
          <p><b>Certificate:</b> ${esc(r.wcc_number)} &bull; <b>Total:</b> QAR ${esc(UI.fmtNum(r.total_amount, 2))}</p>
          <p><b>Included WR Codes:</b></p>
          <div style="background:var(--bg);padding:12px;border-radius:6px;word-break:break-all;font-family:monospace">${esc(r.wr_codes || 'None recorded')}</div>
        </div>`));
      }},
      { label: 'Details', details: true }
    ]
  };

  V['finance-invoices'] = {
    type: 'grid', title: 'Contractor Invoices Console', gridTitle: 'Contractor Invoices & ERP Reconciliation', table: 'invoices',
    filters: [
      fS('status', 'Invoice Status', ['Draft', 'Submitted', 'Approved', 'Paid']),
      fS('bpa_number', 'BPA Agreement', () => DB.all('bpa_contracts').map(b => b.bpa_number)),
      fYN('paid', 'Paid', r => r.paid)
    ],
    columns: [
      { field: 'invoice_no', label: 'Invoice Number' },
      { field: 'invoice_date', label: 'Invoice Date', type: 'date' },
      { field: 'release_order', label: 'Release Order (RO)' },
      { field: 'ro_date', label: 'RO Date', type: 'date' },
      { field: 'bpa_number', label: 'BPA Number' },
      { field: 'group_code', label: 'Cost Group' },
      { field: 'invoice_amount', label: 'Amount (QAR)', type: 'money' },
      { field: 'status', label: 'Status', type: 'status' },
      { field: 'paid', label: 'Paid', type: 'bool' }
    ],
    sort: { field: 'id', dir: 'desc' },
    toolbar: [
      { label: 'Record New Invoice', cls: 'primary', onClick: (ctx, g) => {
        const bpaOpts = DB.all('bpa_contracts').map(b => b.bpa_number);
        const f = UI.buildForm([{ title: 'Invoice Information', fields: [
          fld('invoice_no', 'Invoice Number', 'text', { default: 'SINV-' + Math.floor(Math.random() * 89999 + 10000), required: true }),
          fld('invoice_date', 'Invoice Date', 'date', { default: new Date().toISOString().slice(0, 10), required: true }),
          fld('bpa_number', 'BPA Number', 'select', { options: bpaOpts, required: true, default: bpaOpts[0] }),
          fld('release_order', 'Release Order (RO)', 'text', { default: 'RO-' + Math.floor(Math.random() * 89999 + 200000), required: true }),
          fld('invoice_amount', 'Invoice Amount (QAR)', 'number', { required: true }),
          fld('group_code', 'Cost Group', 'text', { default: 'GRP-01' })
        ]}], null, {});
        UI.modal('Record Contractor Invoice', f, [{
          label: 'Save Invoice', cls: 'primary', onClick: (close) => {
            const { vals, missing } = f.read();
            if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
            DB.insert('invoices', {
              invoice_no: vals.invoice_no,
              invoice_date: vals.invoice_date,
              bpa_number: vals.bpa_number,
              release_order: vals.release_order,
              ro_date: vals.invoice_date,
              invoice_amount: Number(vals.invoice_amount),
              ro_amount: Number(vals.invoice_amount),
              group_code: vals.group_code || 'GRP-01',
              status: 'Submitted',
              paid: false
            });
            UI.toast('Invoice ' + vals.invoice_no + ' recorded');
            close();
            g.refresh();
          }
        }]);
      }}
    ],
    rowActions: [
      { label: 'Approve Invoice', show: (r) => ['Draft', 'Submitted'].includes(r.status), onClick: (r, ctx, g) => {
        DB.update('invoices', r.id, { status: 'Approved' });
        UI.toast('Invoice ' + r.invoice_no + ' approved');
        g.refresh();
      }},
      { label: 'Mark as Paid', show: (r) => !r.paid, cls: 'green', onClick: (r, ctx, g) => {
        DB.update('invoices', r.id, { paid: true, status: 'Paid', date_paid: nowIso() });
        UI.toast('Invoice ' + r.invoice_no + ' marked as Paid');
        g.refresh();
      }},
      { label: 'Details', details: true }
    ]
  };

  V['bpa-po-tracking'] = {
    type: 'custom', title: 'BPA & PO Budget Tracking', render(root, ctx) {
      const bpas = DB.all('bpa_contracts');
      const totalBudget = sum(bpas, r => r.total_budget);
      const totalCommitted = sum(bpas, r => r.committed_amount);
      const totalInvoiced = sum(bpas, r => r.invoiced_amount);
      const totalRemaining = sum(bpas, r => r.remaining_budget);

      const wrap = UI.h(`<div>
        <div class="kpis">
          <div class="kpi"><b>QAR ${esc(UI.fmtNum(totalBudget, 0))}</b><span>Total Blanket Budget</span></div>
          <div class="kpi"><b>QAR ${esc(UI.fmtNum(totalCommitted, 0))}</b><span>Committed POs</span></div>
          <div class="kpi"><b>QAR ${esc(UI.fmtNum(totalInvoiced, 0))}</b><span>Invoiced & Paid</span></div>
          <div class="kpi"><b style="color:var(--ok)">QAR ${esc(UI.fmtNum(totalRemaining, 0))}</b><span>Available Balance</span></div>
        </div>

        <div class="panel">
          <div class="panel-head">
            <span class="ttl">Blanket Purchase Agreements & Spend Tracking</span>
            <span class="sp"></span>
            <div style="font-size:12px;color:var(--muted);display:flex;gap:12px;align-items:center">
              <span><span class="bpa-legend-dot" style="background:var(--brand)"></span>Invoiced</span>
              <span><span class="bpa-legend-dot" style="background:var(--accent)"></span>Committed</span>
              <span><span class="bpa-legend-dot" style="background:var(--line-strong)"></span>Remaining</span>
            </div>
          </div>
          <div style="padding:16px" data-bpa-list></div>
        </div>
      </div>`);

      const listContainer = wrap.querySelector('[data-bpa-list]');
      bpas.forEach((b) => {
        const invPct = Math.round((b.invoiced_amount / b.total_budget) * 100);
        const comPct = Math.round(((b.committed_amount - b.invoiced_amount) / b.total_budget) * 100);
        const remPct = Math.max(0, 100 - invPct - comPct);

        const card = UI.h(`<div class="bpa-progress-box">
          <div style="display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:8px">
            <div>
              <b style="font-size:15px;color:var(--text)">${esc(b.bpa_number)} &mdash; ${esc(b.title)}</b>
              <div style="font-size:12px;color:var(--muted);margin-top:2px">Vendor: <b>${esc(b.vendor)}</b> &bull; Validity: ${esc(b.start_date)} to ${esc(b.end_date)}</div>
            </div>
            <span class="badge ${b.status === 'Active' ? 'ok' : 'info'}">${esc(b.status)}</span>
          </div>

          <div class="bpa-progress-track">
            <div class="bpa-bar-invoiced" style="width:${invPct}%" title="Invoiced: ${invPct}%"></div>
            <div class="bpa-bar-committed" style="width:${comPct}%" title="Committed: ${comPct}%"></div>
          </div>

          <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(140px, 1fr));gap:12px;font-size:12.5px;padding-top:6px">
            <div><span style="color:var(--muted)">Total Budget:</span><br><b>QAR ${esc(UI.fmtNum(b.total_budget, 0))}</b></div>
            <div><span style="color:var(--muted)">Committed:</span><br><b style="color:var(--accent-dark)">QAR ${esc(UI.fmtNum(b.committed_amount, 0))}</b></div>
            <div><span style="color:var(--muted)">Invoiced / Paid:</span><br><b style="color:var(--brand)">QAR ${esc(UI.fmtNum(b.invoiced_amount, 0))} (${invPct}%)</b></div>
            <div><span style="color:var(--muted)">Remaining Balance:</span><br><b style="color:var(--ok)">QAR ${esc(UI.fmtNum(b.remaining_budget, 0))}</b></div>
          </div>
        </div>`);
        listContainer.appendChild(card);
      });

      root.appendChild(wrap);
    }
  };

  /* =====================================================================
   * SPACE & CAMPUS MANAGEMENT
   * ===================================================================== */
  function bookRoomDirectModal(rm, ctx) {
    const f = UI.buildForm([
      { title: 'Room Booking', fields: [
        fld('room', 'Selected Room', 'readonly', { default: `${rm.name} (${rm.room_code})` }),
        fld('date', 'Booking Date', 'date', { default: new Date().toISOString().slice(0, 10), required: true }),
        fld('start', 'Start Time', 'select', { options: ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00'], default: '09:00', required: true }),
        fld('end', 'End Time', 'select', { options: ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00'], default: '10:00', required: true }),
        fld('purpose', 'Meeting Purpose', 'textarea', { required: true })
      ]}
    ], null, {});
    UI.modal('Book ' + rm.name, f, [{
      label: 'Confirm Booking', cls: 'primary', onClick: (close) => {
        const { vals, missing } = f.read();
        if (missing.length) return UI.toast('Please fill: ' + missing.join(', '), true);
        DB.insert('bookings', {
          bl_id: rm.bl_id,
          room: `${rm.name} (${rm.room_code})`,
          date: vals.date,
          start: vals.start,
          end: vals.end,
          purpose: vals.purpose,
          booked_by: me().name || 'Aya Mansoor'
        });
        UI.toast('Room booked successfully!');
        close();
        if (ctx && ctx.open) ctx.open('my-reservations');
      }
    }]);
  }

  V['space-floor-plans'] = {
    type: 'custom', title: 'Interactive Floor Plan Viewer', render(root, ctx) {
      const allRooms = DB.all('rooms');
      const bldList = [...new Set(allRooms.map(r => r.bl_id))];

      const wrap = UI.h(`<div>
        <div class="panel">
          <div class="panel-head">
            <span class="ttl">Campus Architectural CAD Viewer</span>
            <span class="sp"></span>
            <div style="display:flex;gap:8px;align-items:center">
              <select data-bl style="font-size:13px;padding:4px 8px;border-radius:6px;border:1px solid var(--line-strong)">${bldList.map(b => `<option value="${b}">${b} - ${b === 'LA' ? 'Liberal Arts' : (b === 'RC' ? 'Research Complex' : b)}</option>`).join('')}</select>
              <select data-fl style="font-size:13px;padding:4px 8px;border-radius:6px;border:1px solid var(--line-strong)"><option value="GF">Ground Floor (GF)</option><option value="L1">Level 1 (L1)</option><option value="L2">Level 2 (L2)</option></select>
            </div>
          </div>

          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:var(--panel-head);border-bottom:1px solid var(--line);font-size:12px;flex-wrap:wrap;gap:8px">
            <div style="display:flex;gap:14px;align-items:center">
              <span><span class="bpa-legend-dot" style="background:#2563eb"></span>Meeting / Boardroom</span>
              <span><span class="bpa-legend-dot" style="background:#0d9488"></span>Lab / Seminar</span>
              <span><span class="bpa-legend-dot" style="background:#f59e0b"></span>Quiet Focus / Office</span>
              <span><span class="bpa-legend-dot" style="background:#475569"></span>Circulation & Core</span>
            </div>
            <div style="color:var(--muted)">Click any room polygon on the blueprint to view room details or reserve.</div>
          </div>

          <div class="floorplan-wrap">
            <svg class="floorplan-svg" viewBox="0 0 940 480" width="100%" height="440" style="max-width:920px;display:block;margin:0 auto">
              <rect x="20" y="20" width="900" height="440" rx="8" fill="#1e293b" stroke="#334155" stroke-width="4"/>
              <rect x="30" y="210" width="880" height="60" fill="#0f172a" stroke="#334155" stroke-width="2"/>
              <text x="470" y="245" fill="#64748b" font-size="12" font-weight="600" text-anchor="middle" letter-spacing="4">MAIN CAMPUS CIRCULATION CORRIDOR</text>

              <g class="floorplan-room" data-code="01" data-type="Executive Boardroom" data-cap="20" data-area="52">
                <rect x="40" y="40" width="160" height="150" rx="4" fill="#1e3a8a" stroke="#3b82f6" stroke-width="1.5"/>
                <text x="120" y="100" fill="#93c5fd" font-size="13" font-weight="700" text-anchor="middle">GF-101</text>
                <text x="120" y="122" fill="#bfdbfe" font-size="10.5" text-anchor="middle">Executive Boardroom</text>
                <text x="120" y="142" fill="#60a5fa" font-size="10" text-anchor="middle">Cap: 20 &bull; 52m²</text>
              </g>

              <g class="floorplan-room" data-code="02" data-type="Meeting Room" data-cap="8" data-area="26">
                <rect x="220" y="40" width="140" height="150" rx="4" fill="#1e3a8a" stroke="#3b82f6" stroke-width="1.5"/>
                <text x="290" y="100" fill="#93c5fd" font-size="13" font-weight="700" text-anchor="middle">GF-102</text>
                <text x="290" y="122" fill="#bfdbfe" font-size="10.5" text-anchor="middle">Meeting Room A</text>
                <text x="290" y="142" fill="#60a5fa" font-size="10" text-anchor="middle">Cap: 8 &bull; 26m²</text>
              </g>

              <g class="floorplan-room" data-code="03" data-type="Computer Lab" data-cap="24" data-area="68">
                <rect x="380" y="40" width="180" height="150" rx="4" fill="#115e59" stroke="#14b8a6" stroke-width="1.5"/>
                <text x="470" y="100" fill="#5eead4" font-size="13" font-weight="700" text-anchor="middle">GF-103</text>
                <text x="470" y="122" fill="#99f6e4" font-size="10.5" text-anchor="middle">Advanced Computing Lab</text>
                <text x="470" y="142" fill="#2dd4bf" font-size="10" text-anchor="middle">Cap: 24 &bull; 68m²</text>
              </g>

              <g class="floorplan-room" data-code="04" data-type="Quiet Focus Room" data-cap="4" data-area="18">
                <rect x="580" y="40" width="140" height="150" rx="4" fill="#78350f" stroke="#f59e0b" stroke-width="1.5"/>
                <text x="650" y="100" fill="#fde68a" font-size="13" font-weight="700" text-anchor="middle">GF-104</text>
                <text x="650" y="122" fill="#fef3c7" font-size="10.5" text-anchor="middle">Quiet Focus Pod</text>
                <text x="650" y="142" fill="#fbbf24" font-size="10" text-anchor="middle">Cap: 4 &bull; 18m²</text>
              </g>

              <rect x="740" y="40" width="160" height="150" rx="4" fill="#334155" stroke="#475569" stroke-width="1.5"/>
              <text x="820" y="105" fill="#cbd5e1" font-size="12" font-weight="600" text-anchor="middle">FACILITIES CORE</text>
              <text x="820" y="125" fill="#94a3b8" font-size="10" text-anchor="middle">Restrooms & MEP</text>

              <g class="floorplan-room" data-code="05" data-type="Conference Hall" data-cap="35" data-area="94">
                <rect x="40" y="290" width="220" height="150" rx="4" fill="#1e3a8a" stroke="#3b82f6" stroke-width="1.5"/>
                <text x="150" y="350" fill="#93c5fd" font-size="13" font-weight="700" text-anchor="middle">GF-201</text>
                <text x="150" y="372" fill="#bfdbfe" font-size="10.5" text-anchor="middle">Main Seminar Hall</text>
                <text x="150" y="392" fill="#60a5fa" font-size="10" text-anchor="middle">Cap: 35 &bull; 94m²</text>
              </g>

              <g class="floorplan-room" data-code="06" data-type="Open Collab Space" data-cap="16" data-area="48">
                <rect x="280" y="290" width="180" height="150" rx="4" fill="#115e59" stroke="#14b8a6" stroke-width="1.5"/>
                <text x="370" y="350" fill="#5eead4" font-size="13" font-weight="700" text-anchor="middle">GF-202</text>
                <text x="370" y="372" fill="#99f6e4" font-size="10.5" text-anchor="middle">Collaborative Lounge</text>
                <text x="370" y="392" fill="#2dd4bf" font-size="10" text-anchor="middle">Cap: 16 &bull; 48m²</text>
              </g>

              <g class="floorplan-room" data-code="07" data-type="Meeting Room" data-cap="10" data-area="32">
                <rect x="480" y="290" width="140" height="150" rx="4" fill="#1e3a8a" stroke="#3b82f6" stroke-width="1.5"/>
                <text x="550" y="350" fill="#93c5fd" font-size="13" font-weight="700" text-anchor="middle">GF-203</text>
                <text x="550" y="372" fill="#bfdbfe" font-size="10.5" text-anchor="middle">Meeting Room B</text>
                <text x="550" y="392" fill="#60a5fa" font-size="10" text-anchor="middle">Cap: 10 &bull; 32m²</text>
              </g>

              <g class="floorplan-room" data-code="08" data-type="Quiet Focus Room" data-cap="4" data-area="18">
                <rect x="640" y="290" width="130" height="150" rx="4" fill="#78350f" stroke="#f59e0b" stroke-width="1.5"/>
                <text x="705" y="350" fill="#fde68a" font-size="13" font-weight="700" text-anchor="middle">GF-204</text>
                <text x="705" y="372" fill="#fef3c7" font-size="10.5" text-anchor="middle">Focus Booth B</text>
                <text x="705" y="392" fill="#fbbf24" font-size="10" text-anchor="middle">Cap: 4 &bull; 18m²</text>
              </g>

              <rect x="790" y="290" width="110" height="150" rx="4" fill="#334155" stroke="#475569" stroke-width="1.5"/>
              <text x="845" y="365" fill="#cbd5e1" font-size="12" font-weight="600" text-anchor="middle">ELEVATOR</text>
              <text x="845" y="385" fill="#94a3b8" font-size="10" text-anchor="middle">Core Shaft</text>
            </svg>
          </div>
        </div>
      </div>`);

      const svg = wrap.querySelector('.floorplan-svg');
      svg.querySelectorAll('.floorplan-room').forEach((roomEl) => {
        roomEl.onclick = () => {
          const type = roomEl.getAttribute('data-type');
          const cap = roomEl.getAttribute('data-cap');
          const area = roomEl.getAttribute('data-area');
          const textEl = roomEl.querySelector('text');
          const code = textEl ? textEl.textContent : 'Room';

          const modalContent = UI.h(`<div style="padding:16px">
            <div class="detail-grid" style="grid-template-columns:1fr;margin-bottom:16px">
              <div><span>Room Code:</span><b>${esc(code)}</b></div>
              <div><span>Room Type:</span><b>${esc(type)}</b></div>
              <div><span>Capacity:</span><b>${esc(cap)} Persons</b></div>
              <div><span>Floor Area:</span><b>${esc(area)} m²</b></div>
              <div><span>Standard Equipment:</span><b>Video Conference Camera, Ultra-HD Screen, Digital Whiteboard</b></div>
            </div>
            <div style="display:flex;gap:10px;justify-content:flex-end">
              <button class="btn" data-sr-btn>Request Maintenance</button>
              <button class="btn primary" data-book-btn>Reserve This Room</button>
            </div>
          </div>`);

          const closeModal = UI.modal(`Room ${code} — ${type}`, modalContent);
          modalContent.querySelector('[data-book-btn]').onclick = () => {
            closeModal();
            ctx.open('reserve-room');
          };
          modalContent.querySelector('[data-sr-btn]').onclick = () => {
            closeModal();
            ctx.open('sr-catalog');
          };
        };
      });

      root.appendChild(wrap);
    }
  };

  V['space-room-directory'] = {
    type: 'grid', title: 'Building & Room Directory', gridTitle: 'Campus Room Directory', table: 'rooms',
    filters: [
      fS('bl_id', 'Building Code', bldOpts),
      fS('fl_id', 'Floor', ['GF', 'L1', 'L2']),
      fS('rm_type', 'Room Type', ['Meeting Room', 'Executive Boardroom', 'Conference Hall', 'Quiet Focus Room', 'Computer Lab', 'Open Collab Space']),
      fT('department', 'Department')
    ],
    columns: [
      { field: 'id', label: 'Room ID' },
      { field: 'bl_name', label: 'Building Name' },
      { field: 'fl_id', label: 'Floor' },
      { field: 'room_code', label: 'Room Code' },
      { field: 'name', label: 'Room Name' },
      { field: 'rm_type', label: 'Room Type' },
      { field: 'capacity', label: 'Capacity', type: 'number' },
      { field: 'area_sqm', label: 'Area (m²)', type: 'number' },
      { field: 'department', label: 'Department' },
      { field: 'amenities', label: 'Amenities' },
      { field: 'status', label: 'Status', type: 'status' }
    ],
    sort: { field: 'id', dir: 'asc' },
    rowActions: [
      { label: 'Book Room', cls: 'primary', onClick: (r, ctx) => bookRoomDirectModal(r, ctx) },
      { label: 'Details', details: true }
    ]
  };

  V['space-department-alloc'] = {
    type: 'grid', title: 'Department Space Allocation', gridTitle: 'Department Headcount & Area Allocation', table: 'space_allocations',
    filters: [
      fT('division_name', 'Division'),
      fT('department_name', 'Department'),
      fS('bl_id', 'Building Code', bldOpts)
    ],
    columns: [
      { field: 'division_name', label: 'Division' },
      { field: 'department_name', label: 'Department' },
      { field: 'bl_name', label: 'Building Name' },
      { field: 'headcount', label: 'Headcount', type: 'number' },
      { field: 'allocated_area_sqm', label: 'Allocated Area (m²)', type: 'number' },
      { field: 'density_sqm_per_person', label: 'Density (m²/seat)', type: 'number' },
      { field: 'target_density', label: 'Target Density', type: 'number' },
      { field: 'occupancy_rate_pct', label: 'Occupancy Rate (%)', type: 'number' },
      { field: 'variance', label: 'Variance' }
    ],
    sort: { field: 'id', dir: 'asc' },
    rowActions: [{ label: 'Details', details: true }]
  };

  V['space-utilization-kpis'] = {
    type: 'custom', title: 'Space Utilization & Density KPIs', render(root, ctx) {
      const allocs = DB.all('space_allocations');
      const totalArea = sum(allocs, r => r.allocated_area_sqm);
      const totalHeadcount = sum(allocs, r => r.headcount);
      const avgDensity = totalHeadcount ? (totalArea / totalHeadcount).toFixed(1) : 0;
      const avgOccupancy = allocs.length ? +(allocs.reduce((a, r) => a + (r.occupancy_rate_pct || 80), 0) / allocs.length).toFixed(1) : 84.5;

      const wrap = UI.h(`<div>
        <div class="kpis">
          <div class="kpi"><b>${esc(UI.fmtNum(totalArea, 0))} m²</b><span>Total Allocated Area</span></div>
          <div class="kpi"><b>${esc(UI.fmtNum(totalHeadcount, 0))}</b><span>Assigned Headcount</span></div>
          <div class="kpi"><b>${esc(avgDensity)} m²</b><span>Avg Density per Seat</span></div>
          <div class="kpi"><b style="color:var(--ok)">${esc(avgOccupancy)}%</b><span>Average Occupancy Rate</span></div>
        </div>

        <div style="display:grid;grid-template-columns:repeat(auto-fit, minmax(360px, 1fr));gap:16px;margin-top:16px">
          <div class="panel" style="margin:0">
            <div class="panel-head"><span class="ttl">Area Allocation by Department</span></div>
            <div class="chart-box" style="height:280px"><canvas data-c1></canvas></div>
          </div>

          <div class="panel" style="margin:0">
            <div class="panel-head"><span class="ttl">Headcount by Campus Building</span></div>
            <div class="chart-box" style="height:280px"><canvas data-c2></canvas></div>
          </div>
        </div>
      </div>`);

      if (window.Chart) {
        const c1 = wrap.querySelector('[data-c1]');
        const c2 = wrap.querySelector('[data-c2]');

        const byDept = {};
        allocs.forEach(a => {
          byDept[a.department_name] = (byDept[a.department_name] || 0) + a.allocated_area_sqm;
        });
        const deptLabels = Object.keys(byDept);
        const deptValues = Object.values(byDept);

        const byBld = {};
        allocs.forEach(a => {
          byBld[a.bl_id] = (byBld[a.bl_id] || 0) + a.headcount;
        });
        const bldLabels = Object.keys(byBld);
        const bldValues = Object.values(byBld);

        new window.Chart(c1, {
          type: 'doughnut',
          data: {
            labels: deptLabels,
            datasets: [{ data: deptValues, backgroundColor: ['#2563eb', '#0d9488', '#f59e0b', '#7c3aed', '#db2777', '#0891b2'] }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });

        new window.Chart(c2, {
          type: 'bar',
          data: {
            labels: bldLabels,
            datasets: [{ label: 'Assigned Headcount', data: bldValues, backgroundColor: '#1d4ed8', borderRadius: 4 }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
            scales: { y: { beginAtZero: true } }
          }
        });
      }

      root.appendChild(wrap);
    }
  };

  window.SONU_VIEWS = V;
})();
