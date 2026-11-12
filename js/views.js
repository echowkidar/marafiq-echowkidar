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
  const PTW_STATUS = ['Requested', 'Authorized', 'Issued', 'Re Issued', 'Waiting For Re Issuing', 'Completed By Applicant', 'Completed By Controller', 'Closed', 'Rejected', 'Stopped by Authority'];
  const PTW_ACTIVE = ['Authorized', 'Issued', 'Re Issued', 'Waiting For Re Issuing'];
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
  function createPtwFor(w, u) {
    const s = DB.get('sites', w.site_id) || {}; const t = Date.now();
    const p = DB.insert('ptw', {
      wr_id: w.id, site_id: w.site_id, site_name: s.name || '', bl_id: w.bl_id, bl_name: w.bl_name, date_created: new Date(t).toISOString(), date_issued: null, date_start: new Date(t + DAY).toISOString(), date_end: new Date(t + 3 * DAY).toISOString(),
      status: 'Requested', work_type: 'Cold Work', zone: 'Zone A', applicant: u.name, applicant_username: u.username, controller_username: 'supervisor', authority_username: 'admin', requestor_phone: u.phone || '',
      project_code: 'PRJ-100', work_team: w.work_team || '', description: w.description, needs_daily_endorsement: false, ready_for_closure: false, stopped: false, reject_reason: '', processing_days: null, date_closed: null,
      history: [{ date: new Date(t).toISOString(), action: 'Permit requested', by: u.name }], communications: []
    });
    DB.update('wr', w.id, { ptw_id: p.id, ptw_status: p.status });
    return p;
  }

  /* ---------------------------------------------------------- shared columns ---------------------------------------------------------- */
  const WR_COLS = cols('action_item_id|Action Item Id', 'date_requested|Date Requested|date', 'requestor|Requestor', 'site_id|Site Code', 'bl_id|Building Code', 'bl_name|Building Name', 'prob_type|Problem Type', 'pm_procedure|PM Procedure', 'description|Description', 'priority|Priority', 'status|Status', 'wr_code|Work Request Code', 'wr_priority|Work Request Priority', 'wr_status|Work Request Status|status', 'date_review_confirmed|Date Review Confirmed|date', 'date_to_perform|Date to Perform|date', 'date_agreed_target|Agreed Target Date|date', 'date_contractor_completed|Contractor Date Completed|date', 'date_completed|Date Work Completed|date', 'work_team|Work Team Code', 'reason_non_completion|Reason for Non-Completion', 'cause_type|Cause Type', 'repair_type|Repair Type', 'account_code|Account Code', 'eq_id|Equipment Code', 'eq_name|Equipment Name', 'eq_std|Equipment Standard', 'criticality|Criticality', 'request_nature|Request Nature', 'ptw_id|PTW Ref No', 'ptw_status|PTW Status', 'completion_feedback|Completion Feedback');
  const WR_SHORT = cols('id|Work Request Code', 'date_requested|Date Requested|date', 'site_id|Site Code', 'bl_id|Building Code', 'prob_type|Problem Type', 'description|Description', 'priority|Priority', 'status|Status|status', 'work_team|Work Team', 'date_agreed_target|Agreed Target|date', 'ptw_id|PTW Ref No');
  const PTW_COLS = cols('id|Permit to Work Code', 'wr_id|Work Request Code', 'site_id|Site Code', 'bl_id|Building Code', 'work_type|Work Type', 'zone|Zone', 'applicant|Applicant', 'date_created|Date Created|date', 'date_start|Start Date|datetime', 'date_end|Valid Until|datetime', 'status|Status|status', 'description|Description');
  const PTW_ALL_COLS = cols('id|Permit to Work Code', 'wr_id|Work Request Code', 'site_id|Site Code', 'site_name|Site Name', 'bl_id|Building Code', 'bl_name|Building Name', 'zone|Zone Name', 'work_type|Work Type', 'status|Status|status', 'applicant|Applicant', 'requestor_phone|Phone', 'project_code|Project Code', 'work_team|Work Team Code', 'date_created|Date Created|datetime', 'date_issued|Date Issued|datetime', 'date_start|Start Date|datetime', 'date_end|End Date|datetime', 'date_closed|Date Closed|datetime', 'processing_days|Processing Days|number', 'needs_daily_endorsement|Daily Endorsement|bool', 'ready_for_closure|Ready for Closure|bool', 'stopped|Stopped|bool', 'reject_reason|Reject Reason', 'description|Description');

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
  const ptwRowClass = (r) => {
    if (r.stopped || r.status === 'Stopped by Authority') return 'row-blue';
    if (!PTW_ACTIVE.includes(r.status)) return '';
    const e = Date.parse(r.date_end), n = Date.now();
    if (e < n) return 'row-red';
    if (e - n < 2 * DAY) return 'row-orange';
    return '';
  };
  const swatch = (c, t) => `<div><span style="display:inline-block;width:12px;height:12px;background:${c};border-radius:2px;margin-right:6px;vertical-align:middle"></span>${t}</div>`;
  const PTW_LEGEND = swatch('#ef4444', 'Red colour indicates that Permit are expired.') + swatch('#f59e0b', 'Orange colour indicates that permit is about to expire in less than 2 days.') + swatch('#3b82f6', 'Blue colour indicates that Permit are stopped by authority.');

  function ptwSelectGrid(extra) {
    return {
      type: 'grid', title: 'View PTW Request', gridTitle: 'Click Permit to Work Code and navigate to PTW details for CLOSE, RENEW and PRINT functions', table: 'ptw',
      where: (r, ctx) => !extra || extra(r, ctx), indexField: 'id', legend: PTW_LEGEND, rowClass: ptwRowClass, columns: PTW_COLS, sort: { field: 'date_created', dir: 'desc' },
      filters: [
        { field: 'who', label: 'Who Are You?', type: 'select', options: ['All', 'Applicant', 'Controller', 'Authority'], test: (r, v) => { const u = me().username; if (v === 'Applicant') return r.applicant_username === u; if (v === 'Controller') return r.controller_username === u; if (v === 'Authority') return r.authority_username === u; return true; } },
        fC('ready_for_closure', 'Show only Permits that are ready for Applicant Closure'), fC('needs_daily_endorsement', 'Show Permits that need Daily Endorsement'),
        fT('id', 'Permit to Work Code'), fS('status', 'Permit to Work Status', PTW_STATUS), fT('bl_id', 'Building Code'),
        fD('date_start', 'PTW Start Date From/To'), fD('date_end', 'PTW Date Upto'), fT('site_id', 'Site Code'), fT('wr_id', 'Work Request Code'), fT('work_team', 'Work Team Code')],
      rowActions: [{ label: 'Open', tab: 1 }, { label: 'History', tab: 2 }, { label: 'WR', tab: 3, show: (r) => !!r.wr_id }, { label: 'ISO', tab: 4 }, { label: 'Messages', tab: 5 }]
    };
  }
  const PTW_FORM = {
    type: 'form', title: 'PTW Details', table: 'ptw', formTitle: 'Permit to Work Details', saveLabel: 'Save Changes',
    sections: [
      { title: 'Permit', fields: [
        { field: 'id', label: 'Permit to Work Code', type: 'readonly' }, { field: 'wr_id', label: 'Work Request Code', type: 'readonly' },
        { field: 'status', label: 'Status', type: 'select', options: PTW_STATUS }, { field: 'work_type', label: 'Work Type', type: 'select', options: ['Hot Work', 'Cold Work', 'Work at Height', 'Confined Space', 'Electrical Isolation', 'Excavation'] },
        { field: 'site_id', label: 'Site Code', type: 'readonly' }, { field: 'bl_id', label: 'Building Code', type: 'readonly' }, { field: 'zone', label: 'Zone', type: 'select', options: ['Zone A', 'Zone B', 'Zone C', 'Zone D'] },
        { field: 'project_code', label: 'Project Code', type: 'text' }, { field: 'applicant', label: 'Applicant', type: 'readonly' }, { field: 'requestor_phone', label: 'Applicant Phone', type: 'text' }] },
      { title: 'Validity', fields: [{ field: 'date_start', label: 'Start Date', type: 'datetime' }, { field: 'date_end', label: 'Valid Until', type: 'datetime' }, { field: 'needs_daily_endorsement', label: 'Needs Daily Endorsement', type: 'checkbox' }] },
      { title: 'Work Description', fields: [{ field: 'description', label: 'Description', type: 'textarea' }] }],
    onSave: (vals, ctx) => {
      const cur = DB.get('ptw', ctx.record.id);
      return DB.update('ptw', cur.id, Object.assign({}, vals, { history: (cur.history || []).concat({ date: nowIso(), action: 'Permit details updated', by: ctx.user.name }) }));
    },
    after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(1, DB.get('ptw', saved.id)); }
  };
  function ptwDetailsView() {
    return {
      type: 'custom', title: 'PTW Details', table: 'ptw',
      render: (root, ctx) => {
        const p = DB.get('ptw', ctx.record.id);
        const bar = UI.h(`<div class="panel"><div class="panel-head"><span class="ttl">Permit ${esc(p.id)} &mdash; ${esc(p.status)}</span><span class="sp"></span>
          <button class="btn" data-a="close">Close Permit</button><button class="btn" data-a="renew">Renew (+7 days)</button><button class="btn" data-a="print">Print</button></div></div>`);
        const act = (label, patch) => {
          const cur = DB.get('ptw', p.id);
          DB.update('ptw', p.id, Object.assign({ history: (cur.history || []).concat({ date: nowIso(), action: label, by: ctx.user.name }) }, patch));
          UI.toast('Permit ' + p.id + ': ' + label);
          if (ctx.selectTab) ctx.selectTab(1, DB.get('ptw', p.id)); else ctx.refresh();
        };
        bar.querySelector('[data-a=close]').onclick = () => {
          if (p.status === 'Closed') return UI.toast('Permit is already closed.', true);
          confirmAct('Close permit ' + p.id + '?', () => act('Permit closed', { status: 'Closed', date_closed: nowIso(), ready_for_closure: false }));
        };
        bar.querySelector('[data-a=renew]').onclick = () => {
          if (['Closed', 'Rejected'].includes(p.status)) return UI.toast('A ' + p.status.toLowerCase() + ' permit cannot be renewed.', true);
          const base = Math.max(Date.parse(p.date_end) || 0, Date.now());
          act('Permit renewed for 7 days', { status: 'Re Issued', stopped: false, date_end: new Date(base + 7 * DAY).toISOString() });
        };
        bar.querySelector('[data-a=print]').onclick = () => window.print();
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
      { label: 'PTW History', needsRecord: true, view: { type: 'grid', title: 'PTW History', gridTitle: 'PTW History', rows: (ctx) => ((ctx.record && ctx.record.history) || []).map((h, i) => Object.assign({ id: i + 1 }, h)), columns: cols('date|Date|datetime', 'action|Action', 'by|By'), pageSize: 20 } },
      { label: 'Original Work Requests', needsRecord: true, view: { type: 'grid', title: 'Original Work Requests', gridTitle: 'Original Work Requests', table: 'wr', rows: (ctx) => DB.all('wr').filter((w) => ctx.record && String(w.id) === String(ctx.record.wr_id)), columns: WR_SHORT, rowActions: [{ label: 'Details', details: true }] } },
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
              DB.update('ptw', p.id, { communications: (DB.get('ptw', p.id).communications || []).concat({ date: nowIso(), from: ctx.user.name, message: t }) });
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

  V['ptw-closure'] = {
    type: 'grid', title: 'PTWs Without WR for Closure', gridTitle: 'Permits without a Work Request ready for closure', table: 'ptw', indexField: 'id',
    where: (r, ctx) => !r.wr_id && r.status !== 'Closed' && (r.status === 'Completed By Applicant' || r.ready_for_closure) && (!ctx || !ctx.user || ctx.user.role !== 'Contractor' || r.applicant_username === ctx.user.username),
    columns: PTW_COLS, rowClass: ptwRowClass,
    filters: [fT('id', 'Permit to Work Code'), fT('site_id', 'Site Code'), fD('date_end', 'Valid Until')],
    rowActions: [{ label: 'Details', details: true }, { label: 'Close Permit', onClick: (row, ctx, api) => confirmAct('Close permit ' + row.id + '?', () => {
      DB.update('ptw', row.id, { status: 'Closed', ready_for_closure: false, date_closed: nowIso(), history: (row.history || []).concat({ date: nowIso(), action: 'Permit closed', by: ctx.user.name }) });
      UI.toast('Permit ' + row.id + ' closed'); refresh(api);
    }) }]
  };

  V['ptw-create'] = {
    type: 'tabs', title: 'Create Permit to Work', recordLabel: (r) => r.id,
    tabs: [
      { label: 'PTW Request', view: {
        type: 'form', title: 'PTW Request', table: 'ptw', formTitle: 'PTW Request', saveLabel: 'Save & Continue',
        sections: [
          { title: 'Requestor', fields: [
            { field: 'project_code', label: 'Project Code', type: 'text', required: true }, { field: 'requestor_phone', label: 'Requestor Phone', type: 'text', default: (c) => c.user.phone },
            { field: 'requested_by', label: 'Requested By', type: 'readonly', default: (c) => c.user.username }, { field: 'name', label: 'Name', type: 'readonly', default: (c) => c.user.name },
            { field: 'position', label: 'Position', type: 'readonly', default: (c) => c.user.position }] },
          { title: 'Work Location', fields: [
            { field: 'site_id', label: 'Site Code', type: 'select', options: siteOpts, required: true }, { field: 'bl_id', label: 'Building Code', type: 'select', options: bldOpts },
            { field: 'fl_id', label: 'Floor Code', type: 'text' }, { field: 'apt_id', label: 'Apartment (Suite) Code', type: 'text' }, { field: 'rm_id', label: 'Room Code', type: 'text' }] },
          { title: 'Description', fields: [
            { field: 'request_type', label: 'Request Type', type: 'readonly', default: 'SERVICE DESK - PTW' }, { field: 'description', label: 'Description', type: 'textarea', required: true }] }],
        onSave: (vals, ctx) => {
          const s = DB.get('sites', vals.site_id) || {}; const b = DB.get('buildings', vals.bl_id) || {}; const t = Date.now();
          return DB.insert('ptw', Object.assign({}, vals, {
            wr_id: null, site_name: s.name || '', bl_name: b.name || '', date_created: new Date(t).toISOString(), date_issued: null, date_start: new Date(t + DAY).toISOString(), date_end: new Date(t + 3 * DAY).toISOString(),
            status: 'Requested', work_type: 'Cold Work', zone: 'Zone A', applicant: ctx.user.name, applicant_username: ctx.user.username, controller_username: 'supervisor', authority_username: 'admin',
            work_team: '', needs_daily_endorsement: false, ready_for_closure: false, stopped: false, reject_reason: '', processing_days: null, date_closed: null,
            history: [{ date: new Date(t).toISOString(), action: 'Permit requested', by: ctx.user.name }], communications: []
          }));
        },
        savedMsg: (s) => 'Permit ' + s.id + ' created',
        after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(1, saved); else ctx.open('ptw-manage'); }
      } },
      { label: 'PTW Details', needsRecord: true, view: {
        type: 'form', title: 'PTW Details', table: 'ptw', formTitle: 'PTW Details', saveLabel: 'Save & Continue',
        sections: [
          { title: 'Permit', fields: [
            { field: 'id', label: 'Permit to Work Code', type: 'readonly' },
            { field: 'work_type', label: 'Work Type', type: 'select', required: true, options: ['Hot Work', 'Cold Work', 'Work at Height', 'Confined Space', 'Electrical Isolation', 'Excavation'] },
            { field: 'date_start', label: 'Start Date', type: 'datetime' }, { field: 'date_end', label: 'End Date', type: 'datetime' }, { field: 'zone', label: 'Zone', type: 'select', options: ['Zone A', 'Zone B', 'Zone C', 'Zone D'] }] },
          { title: 'Hazards', fields: [
            { field: 'hz_electrical', label: 'Electrical', type: 'checkbox' }, { field: 'hz_height', label: 'Work at height', type: 'checkbox' }, { field: 'hz_confined', label: 'Confined space', type: 'checkbox' },
            { field: 'hz_hot', label: 'Hot work / fire', type: 'checkbox' }, { field: 'hz_chemical', label: 'Chemicals', type: 'checkbox' }] }],
        onSave: (vals, ctx) => { const cur = DB.get('ptw', ctx.record.id); return DB.update('ptw', cur.id, Object.assign({}, vals, { history: (cur.history || []).concat({ date: nowIso(), action: 'Permit details completed', by: ctx.user.name }) })); },
        after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(2, DB.get('ptw', saved.id)); }
      } },
      { label: 'PTW Request Details', needsRecord: true, view: {
        type: 'custom', title: 'PTW Request Details', table: 'ptw',
        render: (root, ctx) => {
          const p = DB.get('ptw', ctx.record.id);
          root.appendChild(kvPanel('Permit ' + p.id + ' — Summary (read only)', p, cols('id|Permit to Work Code', 'status|Status', 'project_code|Project Code', 'applicant|Requested By', 'requestor_phone|Phone', 'site_id|Site Code', 'bl_id|Building Code', 'fl_id|Floor', 'apt_id|Apartment', 'rm_id|Room', 'work_type|Work Type', 'zone|Zone', 'date_start|Start Date|datetime', 'date_end|End Date|datetime', 'description|Description')));
          const b = UI.h('<div class="panel"><div class="panel-head"><span class="ttl">Next steps</span><button class="btn primary" data-go>Go to Manage PTWs</button></div></div>');
          b.querySelector('[data-go]').onclick = () => ctx.open('ptw-my-pool');
          root.appendChild(b);
        } } }
    ]
  };

  V['ptw-details-report'] = {
    type: 'grid', title: 'PTW Details', gridTitle: 'Permit to Work Details', table: 'ptw', indexField: 'id', columns: PTW_ALL_COLS, rowClass: ptwRowClass, sort: { field: 'date_created', dir: 'desc' },
    filters: [fT('id', 'Permit to Work Code'), fS('status', 'Status', PTW_STATUS), fT('site_id', 'Site Code'), fT('bl_id', 'Building Code'), fT('wr_id', 'Work Request Code'), fD('date_created', 'Date Created', 'This Year')],
    rowActions: [{ label: 'Details', details: true }]
  };

  /* ---- PTW reports ---- */
  const isExpired = (r) => Date.parse(r.date_end) < Date.now();
  const ptwSite = fS('site_id', 'Site Code', siteOpts);
  V['ptw-valid-expired'] = { type: 'chart', title: 'Valid vs. Expired Permits', table: 'ptw', where: (r) => PTW_ACTIVE.includes(r.status), filters: [ptwSite], chart: { kind: 'stacked', groupBy: 'site_id', stackBy: (r) => (isExpired(r) ? 'Expired' : 'Valid'), groupLabel: 'Site' } };
  V['ptw-rejected'] = { type: 'chart', title: 'Rejected Permits', table: 'ptw', where: (r) => r.status === 'Rejected', filters: [ptwSite], chart: { kind: 'bar', groupBy: 'date_created', dateGroup: 'month', stackBy: 'reject_reason', groupLabel: 'Month' } };
  V['ptw-applicant-eval'] = { type: 'chart', title: 'Applicant Evaluation', gridTitle: 'Permits closed after expiry, by applicant', table: 'ptw', where: (r) => r.date_closed && r.date_end && Date.parse(r.date_closed) > Date.parse(r.date_end), filters: [ptwSite, fD('date_closed', 'Date Closed')], chart: { kind: 'hbar', groupBy: 'applicant', label: 'Closed after expiry', groupLabel: 'Applicant' } };
  V['ptw-processing-speed'] = { type: 'chart', title: 'Average Speed of Permit Processing', gridTitle: 'Average processing days by month', table: 'ptw', where: (r) => r.processing_days != null, filters: [ptwSite], chart: { kind: 'line', groupBy: 'date_created', dateGroup: 'month', value: (rs) => avg(rs, 'processing_days'), label: 'Avg processing days', groupLabel: 'Month' } };
  V['ptw-issued-monthly'] = { type: 'chart', title: 'Issued Permits', table: 'ptw', where: (r) => !!r.date_issued, filters: [ptwSite], chart: { kind: 'stacked', groupBy: 'date_issued', dateGroup: 'month', stackBy: 'work_type', groupLabel: 'Month' } };
  V['ptw-closed-monthly'] = { type: 'chart', title: 'Closed Permits', table: 'ptw', where: (r) => !!r.date_closed, filters: [ptwSite], chart: { kind: 'bar', groupBy: 'date_closed', dateGroup: 'month', label: 'Closed permits', groupLabel: 'Month' } };
  V['ptw-by-status'] = { type: 'chart', title: 'View All Permits by Status', table: 'ptw', filters: [ptwSite], chart: { kind: 'doughnut', groupBy: 'status', label: 'Permits', groupLabel: 'Status' } };
  V['ptw-by-status-site'] = { type: 'chart', title: 'Permit by Status by Site', table: 'ptw', filters: [fS('site_id', 'Site Code', siteOpts), fS('zone', 'Zone Name', ['Zone A', 'Zone B', 'Zone C', 'Zone D'])], chart: { kind: 'hstacked', groupBy: 'status', stackBy: 'site_id', groupLabel: 'Status' } };
  V['ptw-log'] = {
    type: 'grid', title: 'Permit to Work Log', gridTitle: 'Permit to Work Log', table: 'ptw', indexField: 'id', sort: { field: 'date_created', dir: 'desc' },
    columns: cols('id|Permit to Work Code', 'date_created|Date Created|datetime', 'site_id|Site Code', 'bl_id|Building Code', 'work_type|Work Type', 'applicant|Applicant', 'status|Status|status', 'date_closed|Date Closed|datetime'),
    filters: [fD('date_created', 'Date Created', 'This Month'), fS('status', 'Status', PTW_STATUS), ptwSite], rowActions: [{ label: 'Details', details: true }]
  };

  /* ---------------------------------------------------------- Estimate & schedule ---------------------------------------------------------- */
  V['wr-estimate-schedule'] = {
    type: 'tabs', title: 'Estimate and Schedule Work Requests', recordLabel: (r) => r.id + ' — ' + r.description,
    tabs: [
      { label: 'Select', view: {
        type: 'grid', title: 'Estimate and Schedule', gridTitle: 'Work Requests', table: 'wr', selectable: true, columns: WR_SHORT.concat(cols('est_cost|Est. Cost|money', 'has_rfe|RFE|bool')),
        where: (r) => r.wr_type === 'On Demand' && ['Requested', 'Reviewed but On Hold', 'Approved', 'Assigned to Work Order'].includes(r.status), sort: { field: 'date_requested', dir: 'desc' },
        legend: swatch('#16a34a', 'Work Requests assigned to you as substitute'), rowClass: (r) => (r.substitute ? 'row-green' : ''),
        filters: [fS('prob_type', 'Problem Type', tradeOpts), fT('action_item_id', 'Service Request ID'), fS('site_id', 'Site Code', siteOpts), fS('status', 'Work Request Status', WR_STATUS), fS('ptw_status', 'Permit to Work Status', PTW_STATUS),
          fD('date_assigned', 'Date Assigned From/To'), fT('id', 'Work Request Code'), fT('bl_id', 'Building Code'), fT('work_team', 'Work Team Code'), fYN('has_rfe', 'With RFE?', (r) => r.has_rfe), fS('priority', 'Work Request Priority', PRIO),
          fT('eq_id', 'Equipment Code'), fT('eq_std', 'Equipment Standard'), fYN('est_cost_zero', 'Is Estimated Cost Zero?', (r) => !r.est_cost)],
        toolbar: [{ label: 'Create PTW', cls: 'primary', onClick: (ctx, api) => {
          const sel = api.selected(); if (!sel.length) return UI.toast('Select at least one work request.', true);
          let n = 0; sel.forEach((w) => { if (!w.ptw_id) { createPtwFor(w, ctx.user); n++; } });
          UI.toast(n + ' permit(s) created' + (sel.length - n ? ', ' + (sel.length - n) + ' already had a permit' : '')); api.refresh();
        } }],
        rowActions: [{ label: 'Details', tab: 1 }, { label: 'Estimate', tab: 2 }, { label: 'Schedule', tab: 3 }]
      } },
      { label: 'Details', needsRecord: true, view: { type: 'custom', title: 'Details', table: 'wr', render: (root, ctx) => root.appendChild(kvPanel('Work Request ' + ctx.record.id, WRX(ctx.record), WR_COLS)) } },
      { label: 'Estimate', needsRecord: true, view: {
        type: 'form', title: 'Estimate', table: 'wr', formTitle: 'Estimate Work Request', saveLabel: 'Save Estimate',
        sections: [{ title: 'Estimate', fields: [
          { field: 'id', label: 'Work Request Code', type: 'readonly' }, { field: 'description', label: 'Description', type: 'readonly', wide: true },
          { field: 'est_hours', label: 'Estimated Hours', type: 'number' }, { field: 'est_cost', label: 'Estimated Cost', type: 'number' },
          { field: 'est_trades', label: 'Trades Required', type: 'text' }, { field: 'est_materials', label: 'Materials / Notes', type: 'textarea' }] }],
        after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(3, DB.get('wr', saved.id)); }
      } },
      { label: 'Schedule', needsRecord: true, view: {
        type: 'form', title: 'Schedule', table: 'wr', formTitle: 'Schedule Work Request', saveLabel: 'Save & Assign',
        sections: [{ title: 'Schedule', fields: [
          { field: 'id', label: 'Work Request Code', type: 'readonly' }, { field: 'status', label: 'Current Status', type: 'readonly' },
          { field: 'date_to_perform', label: 'Date to Perform', type: 'date', required: true }, { field: 'date_agreed_target', label: 'Agreed Target Date', type: 'date', required: true },
          { field: 'work_team', label: 'Work Team', type: 'select', options: teamOpts }, { field: 'craftsperson', label: 'Craftsperson', type: 'select', options: uniq('craftspersons', 'name') }] }],
        onSave: (vals, ctx) => DB.update('wr', ctx.record.id, Object.assign({}, vals, { status: 'Assigned to Work Order', date_assigned: nowIso() })),
        savedMsg: (s) => 'Work request ' + s.id + ' scheduled and assigned to work order',
        after: (saved, ctx) => { if (ctx.selectTab) ctx.selectTab(0, null); }
      } }
    ]
  };

  /* ---------------------------------------------------------- Issue / edit / resources / hours ---------------------------------------------------------- */
  const issueView = (type, title) => ({
    type: 'grid', title, gridTitle: 'Work Requests ready to start', table: 'wr', columns: WR_SHORT.concat(cols('ptw_status|PTW Status')),
    where: (r) => r.wr_type === type && ['Approved', 'Assigned to Work Order'].includes(r.status), sort: { field: 'date_agreed_target', dir: 'asc' },
    filters: [fT('id', 'Work Request Code'), fS('site_id', 'Site Code', siteOpts), fT('bl_id', 'Building Code'), fS('prob_type', 'Problem Type', tradeOpts), fS('priority', 'Priority', PRIO)],
    rowActions: [
      { label: 'Details', details: true },
      { label: 'Create E-PTW', show: (r) => !r.ptw_id, onClick: (row, ctx, api) => { const p = createPtwFor(row, ctx.user); UI.toast('E-PTW ' + p.id + ' created'); refresh(api); } },
      { label: 'Issue', onClick: (row, ctx, api) => confirmAct('Issue work request ' + row.id + ' and start the work?', () => { DB.update('wr', row.id, { status: 'Issued and In Process', date_issued: nowIso() }); UI.toast('Work request ' + row.id + ' issued'); refresh(api); }) }]
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

  const resSections = [{ title: 'Resource', fields: [
    { field: 'resource_type', label: 'Resource Type', type: 'select', required: true, options: ['Material', 'Subcontract', 'Equipment Rental', 'Manpower'] },
    { field: 'description', label: 'Description', type: 'text', required: true }, { field: 'qty_estimated', label: 'Quantity', type: 'number', required: true }, { field: 'unit_cost', label: 'Unit Cost', type: 'number', required: true }] }];
  const otherResView = (type, title) => ({
    type: 'grid', title, gridTitle: 'Work Request Other Resources', table: 'other_resources', sort: { field: 'date_used', dir: 'desc' },
    rows: () => DB.all('other_resources').filter((o) => { const w = DB.get('wr', o.wr_id); return w && w.wr_type === type; }),
    columns: cols('id|Other Res. Log ID', 'wr_id|Work Request Code', 'date_used|Date Used|date', 'resource_type|Resource Type', 'description|Description', 'qty_estimated|Quantity|number', 'unit_cost|Unit Cost|money', 'cost_estimated|Cost Estimated|money', 'status|Status|status'),
    filters: [fT('wr_id', 'Work Request Code'), fS('resource_type', 'Resource Type', ['Material', 'Subcontract', 'Equipment Rental', 'Manpower']), fS('status', 'Status', ['Pending', 'Approved', 'Rejected', 'Done']), fD('date_used', 'Date Used')],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Edit', show: (r) => r.status === 'Pending', onClick: (row, ctx, api) => formModal('Edit resource ' + row.id, resSections, (v) => { DB.update('other_resources', row.id, Object.assign({}, v, { cost_estimated: v.qty_estimated * v.unit_cost })); UI.toast('Resource updated'); refresh(api); }, row) }],
    toolbar: [{ label: 'Add Resource', cls: 'primary', onClick: (ctx, api) => {
      const wrOpts = () => DB.all('wr').filter((w) => w.wr_type === type && ['Issued and In Process', 'Assigned to Work Order', 'Approved', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor'].includes(w.status)).map((w) => String(w.id));
      formModal('Add Resource', [{ title: 'New Resource', fields: [{ field: 'wr_id', label: 'Work Request Code', type: 'select', required: true, options: wrOpts }].concat(resSections[0].fields) }], (v) => {
        const wid = Number(v.wr_id);
        DB.insert('other_resources', { wr_id: wid, date_used: nowIso(), time_used: new Date().toTimeString().slice(0, 5), description: v.description, resource_type: v.resource_type, qty_estimated: v.qty_estimated, unit_cost: v.unit_cost, cost_estimated: v.qty_estimated * v.unit_cost, status: 'Pending', rfe_pending: true, comments: [], approved_by: '', date_approved: null, variation: false });
        DB.update('wr', wid, { has_rfe: true }); UI.toast('Resource added to work request ' + wid); refresh(api);
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
  const RFE_COLS = cols('id|Other Res. Log ID', 'wr_id|Work Request Code', 'date_used|Date Used|date', 'time_used|Time Used', 'qty_estimated|Quantity Estimated|number', 'resource_type|Resource Type', 'description|Description', 'cost_estimated|Cost Estimated|money', 'status|Status|status');
  V['rfe-post-box'] = {
    type: 'grid', title: 'Review Pending RFEs for Action', gridTitle: 'Work Request Other Resources Log', table: 'other_resources', indexField: 'id', columns: RFE_COLS, sort: { field: 'date_used', dir: 'desc' },
    filters: [fC('rfe_pending', 'RFE Pending For Action', true), fT('wr_id', 'Work Request Code'), fS('resource_type', 'Resource Type', ['Material', 'Subcontract', 'Equipment Rental', 'Manpower'])],
    rowClass: (r) => (r.rfe_pending ? 'row-green' : ''),
    rowActions: [{ label: 'View', details: true },
      { label: 'Add Comment', onClick: (row, ctx, api) => formModal('Add comment to log ' + row.id, [{ title: 'Comment', fields: [{ field: 'text', label: 'Comment', type: 'textarea', required: true }] }], (v) => {
        DB.update('other_resources', row.id, { comments: (DB.get('other_resources', row.id).comments || []).concat({ date: nowIso(), by: ctx.user.name, text: v.text }) }); UI.toast('Comment added'); refresh(api);
      }) },
      { label: 'Done?', show: (r) => r.rfe_pending, onClick: (row, ctx, api) => confirmAct('Mark RFE ' + row.id + ' as done?', () => { DB.update('other_resources', row.id, { rfe_pending: false, status: 'Done' }); UI.toast('RFE ' + row.id + ' done'); refresh(api); }) }]
  };
  V['rfe-approved'] = { type: 'grid', title: 'Review Approved Estimations', gridTitle: 'Approved Estimations', table: 'other_resources', where: (r) => r.status === 'Approved', indexField: 'id', sort: { field: 'date_approved', dir: 'desc' },
    columns: RFE_COLS.concat(cols('approved_by|Approved By', 'date_approved|Date Approved|date')), filters: [fT('wr_id', 'Work Request Code'), fD('date_approved', 'Date Approved')], rowActions: [{ label: 'Details', details: true }] };
  V['rfe-pending-report'] = { type: 'grid', title: 'Pending RFE Status Report', gridTitle: 'Pending RFEs', table: 'other_resources', where: (r) => r.status === 'Pending', sort: { field: 'date_used', dir: 'asc' },
    columns: RFE_COLS.concat([{ field: 'days_pending', label: 'Days Pending', type: 'number', render: (r) => String(Math.max(0, Math.floor((Date.now() - Date.parse(r.date_used)) / DAY))) }]),
    filters: [fT('wr_id', 'Work Request Code'), fS('resource_type', 'Resource Type', ['Material', 'Subcontract', 'Equipment Rental', 'Manpower']), fD('date_used', 'Date Used')], rowActions: [{ label: 'Details', details: true }] };
  V['rfe-line-items'] = { type: 'grid', title: 'RFE Line Items', gridTitle: 'RFE Line Items', table: 'rfe_lines', sort: { field: 'id', dir: 'desc' },
    columns: cols('id|Line ID', 'other_res_id|Other Res. Log ID', 'wr_id|Work Request Code', 'item_code|Item Code', 'description|Description', 'uom|UOM', 'qty|Quantity|number', 'unit_rate|Unit Rate|money', 'amount|Amount|money'),
    filters: [fT('wr_id', 'Work Request Code'), fT('item_code', 'Item Code'), fT('other_res_id', 'Other Res. Log ID')], rowActions: [{ label: 'Details', details: true }] };
  V['boq-details'] = { type: 'grid', title: 'BOQ Details for BPA Release', gridTitle: 'BOQ Items (aggregated by item code)', pageSize: 20,
    rows: () => { const g = {}; DB.all('rfe_lines').forEach((l) => { const x = g[l.item_code] = g[l.item_code] || { id: l.item_code, item_code: l.item_code, description: l.description, uom: l.uom, lines: 0, qty: 0, amount: 0 }; x.lines++; x.qty += l.qty; x.amount += l.amount; }); return Object.keys(g).sort().map((k) => g[k]); },
    columns: cols('item_code|BOQ Item Code', 'description|Description', 'uom|UOM', 'lines|No. of Lines|number', 'qty|Total Quantity|number', 'amount|Total Amount|money'), filters: [fT('item_code', 'BOQ Item Code'), fT('description', 'Description')], rowActions: [{ label: 'Details', details: true }] };
  V['rfe-approval'] = { type: 'grid', title: 'Estimation & Variation Approval', gridTitle: 'Estimations awaiting approval', table: 'other_resources', where: (r) => r.status === 'Pending', indexField: 'id', sort: { field: 'date_used', dir: 'asc' },
    columns: RFE_COLS.concat(cols('variation|Variation|bool')), filters: [fT('wr_id', 'Work Request Code'), fS('resource_type', 'Resource Type', ['Material', 'Subcontract', 'Equipment Rental', 'Manpower']), fD('date_used', 'Date Used')],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Approve', onClick: (row, ctx, api) => { DB.update('other_resources', row.id, { status: 'Approved', rfe_pending: false, approved_by: ctx.user.name, date_approved: nowIso() }); UI.toast('Estimation ' + row.id + ' approved'); refresh(api); } },
      { label: 'Reject', onClick: (row, ctx, api) => confirmAct('Reject estimation ' + row.id + '?', () => { DB.update('other_resources', row.id, { status: 'Rejected', rfe_pending: false, approved_by: ctx.user.name, date_approved: nowIso() }); UI.toast('Estimation ' + row.id + ' rejected'); refresh(api); }) },
      { label: 'Variation', onClick: (row, ctx, api) => { DB.update('other_resources', row.id, { variation: true, status: 'Approved', rfe_pending: false, approved_by: ctx.user.name, date_approved: nowIso() }); UI.toast('Approved as variation'); refresh(api); } }] };

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
  V['iso-requests'] = { type: 'grid', title: 'Update/Complete My ISO/De-ISO Requests', gridTitle: 'ISO / De-ISO Requests', table: 'iso', sort: { field: 'date_requested', dir: 'desc' },
    columns: cols('id|ID', 'ptw_id|Permit to Work Code', 'wr_id|Work Request Code', 'system|System', 'point|Isolation Point', 'isolation_type|Type', 'status|Status|status', 'requested_by|Requested By', 'date_requested|Requested|datetime', 'date_isolated|Isolated|datetime', 'date_deisolated|De-Isolated|datetime'),
    filters: [fT('ptw_id', 'Permit to Work Code'), fT('wr_id', 'Work Request Code'), fS('status', 'Status', ['Requested', 'Isolated', 'De-Isolated', 'Completed']), fS('system', 'System', ['Electrical', 'Mechanical', 'Fire', 'Water'])],
    rowActions: [{ label: 'Details', details: true },
      { label: 'Isolate', show: (r) => r.status === 'Requested', onClick: (row, ctx, api) => { DB.update('iso', row.id, { status: 'Isolated', date_isolated: nowIso() }); UI.toast('Isolation confirmed'); refresh(api); } },
      { label: 'De-Isolate', show: (r) => r.status === 'Isolated', onClick: (row, ctx, api) => { DB.update('iso', row.id, { status: 'De-Isolated', date_deisolated: nowIso() }); UI.toast('De-isolation done'); refresh(api); } },
      { label: 'Complete', show: (r) => r.status === 'De-Isolated', onClick: (row, ctx, api) => { DB.update('iso', row.id, { status: 'Completed' }); UI.toast('ISO request completed'); refresh(api); } }] };

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
  V['incident-new'] = { type: 'form', title: 'Report Incident', table: 'incidents', formTitle: 'Report Incident', saveLabel: 'Submit Report',
    sections: [{ title: 'Incident', fields: [{ field: 'incident_type', label: 'Incident Type', type: 'select', required: true, options: ['OBJECT FALLING FROM HEIGHT', 'IMPACT ON ASSET', 'SLIP TRIP FALL', 'FIRE', 'ELECTRIC SHOCK', 'VEHICLE COLLISION', 'NEAR MISS', 'ENVIRONMENTAL SPILL'] },
      { field: 'date_incident', label: 'Date of Incident', type: 'date', required: true, default: nowIso() }, { field: 'severity', label: 'Severity', type: 'select', required: true, options: ['Minor', 'Moderate', 'Major', 'Critical'] }, { field: 'affected_person', label: 'Affected Person', type: 'text' },
      { field: 'site_id', label: 'Site Code', type: 'select', required: true, options: siteOpts }, { field: 'property_code', label: 'Property Code', type: 'select', options: bldOpts }, { field: 'description', label: 'Description', type: 'textarea', required: true }] }],
    onSave: (v, ctx) => DB.insert('incidents', Object.assign({}, v, { status: 'Reported', reported_by: ctx.user.name, contractor: ctx.user.role === 'Contractor' })),
    savedMsg: (s) => 'Incident ' + s.id + ' reported', after: (s, ctx) => ctx.open('incidents') };

  const insCols = cols('id|ID', 'date_requested|Date|date', 'inspector|Inspector', 'site_id|Site Code', 'bl_id|Building Code', 'location|Location', 'category|Category', 'finding|Finding', 'priority|Priority', 'status|Status|status', 'wr_id|Work Request', 'photos|Photos|number');
  const insFilters = () => [fD('date_requested', 'Date Requested'), fS('site_id', 'Site Code', siteOpts), fT('bl_id', 'Building Code'), fS('category', 'Category', ['Housekeeping', 'Safety', 'Structural', 'Electrical', 'HVAC', 'Plumbing', 'Landscaping', 'Fire Safety']), fS('status', 'Status', ['Requested', 'Approved', 'Rejected', 'Converted to WR', 'Closed']), fS('priority', 'Priority', ['High', 'Medium', 'Low'])];
  const insActions = [{ label: 'Details', details: true },
    { label: 'Approve', show: (r) => r.status === 'Requested', onClick: (row, ctx, api) => { DB.update('inspections', row.id, { status: 'Approved' }); UI.toast('Item approved'); refresh(api); } },
    { label: 'Reject', show: (r) => r.status === 'Requested', onClick: (row, ctx, api) => { DB.update('inspections', row.id, { status: 'Rejected' }); UI.toast('Item rejected'); refresh(api); } },
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
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    const open = {}; DB.all('wr').filter(isOpen).forEach((w) => { open[w.bl_id] = (open[w.bl_id] || 0) + 1; });
    const pal = ['#0f766e', '#f59e0b', '#2563eb', '#dc2626', '#7c3aed', '#16a34a', '#db2777', '#0891b2']; const sites = DB.all('sites').map((s) => s.id);
    blds.forEach((b) => L.circleMarker([b.lat, b.lng], { radius: 9, color: '#062b28', weight: 1, fillColor: pal[sites.indexOf(b.site_id) % pal.length], fillOpacity: 0.85 })
      .bindPopup(`<b>${esc(b.name)}</b><br>${esc(b.id)} &middot; Site ${esc(b.site_id)}<br>${esc(b.city)}<br>Open work requests: <b>${open[b.id] || 0}</b><br><a href="#/v/wr-review?bl_id=${encodeURIComponent(b.id)}">View work requests</a>`).addTo(map));
    if (blds.length) map.fitBounds(L.latLngBounds(blds.map((b) => [b.lat, b.lng])).pad(0.2)); else map.setView([25.3, 51.4], 9);
    setTimeout(() => map.invalidateSize(), 100);
  } };

  /* ---------------------------------------------------------- Health & Safety ---------------------------------------------------------- */
  V['incidents'] = { type: 'grid', title: 'Track Incidents', gridTitle: 'Incidents', table: 'incidents', indexField: 'id', sort: { field: 'date_incident', dir: 'desc' },
    columns: cols('id|Incident Code', 'date_incident|Date of Incident|date', 'incident_type|Incident Type', 'affected_person|Affected Person', 'site_id|Site Code', 'property_code|Property Code', 'severity|Severity', 'status|Status|status'),
    filters: [fD('date_incident', 'Date of Incident', 'This Year'), fS('incident_type', 'Incident Type', ['OBJECT FALLING FROM HEIGHT', 'IMPACT ON ASSET', 'SLIP TRIP FALL', 'FIRE', 'ELECTRIC SHOCK', 'VEHICLE COLLISION', 'NEAR MISS', 'ENVIRONMENTAL SPILL']), fS('severity', 'Severity', ['Minor', 'Moderate', 'Major', 'Critical']), fS('status', 'Status', ['Reported', 'Under Investigation', 'Action Required', 'Closed']), fS('site_id', 'Site Code', siteOpts)],
    toolbar: [{ label: 'Report Incident', cls: 'primary', onClick: (ctx) => ctx.open('incident-new') }],
    rowActions: [{ label: 'Details', details: true }, { label: 'Update Status', edit: [{ title: 'Update incident', fields: [{ field: 'status', label: 'Status', type: 'select', options: ['Reported', 'Under Investigation', 'Action Required', 'Closed'] }, { field: 'severity', label: 'Severity', type: 'select', options: ['Minor', 'Moderate', 'Major', 'Critical'] }] }] }] };
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
  const ROLES = ['Contractor', 'Supervisor', 'Administrator'];
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
    new window.Chart(p1.querySelector('canvas'), { type: 'bar', data: { labels: days.map((d) => d.day), datasets: [{ label: 'Events', data: days.map((d) => d.count), backgroundColor: '#0f766e' }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true, ticks: { precision: 0 } } } } });
    new window.Chart(p2.querySelector('canvas'), { type: 'doughnut', data: { labels: Object.keys(roles), datasets: [{ data: Object.values(roles), backgroundColor: ['#0f766e', '#f59e0b', '#2563eb', '#dc2626'] }] }, options: { responsive: true, maintainAspectRatio: false } });
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

  window.SONU_VIEWS = V;
})();
