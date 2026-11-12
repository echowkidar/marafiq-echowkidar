/* SONU fake database. window.DB — seeded demo data (all FICTIONAL), persisted in localStorage.
   API: DB.all(table) DB.get(table,id) DB.insert(table,obj) DB.update(table,id,patch) DB.remove(table,id) DB.reset() DB.nextId(table) */
(function () {
  'use strict';
  const KEY = 'sonu_db_v1';
  const DAY = 864e5;
  const PREFIX = { ptw: 'C-' };
  const BASE = { wr: 3374175, other_resources: 400000, incidents: 10001, invoices: 1, ptw: 831572 };

  /* ===================================================== seed ===================================================== */
  function buildSeed() {
    let a = 0x5eed1234;
    const rnd = () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
    const ri = (x, y) => x + Math.floor(rnd() * (y - x + 1));
    const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
    const chance = (p) => rnd() < p;
    const wp = (pairs) => { const t = pairs.reduce((s, p) => s + p[1], 0); let r = rnd() * t; for (const p of pairs) { if ((r -= p[1]) < 0) return p[0]; } return pairs[0][0]; };
    const pad = (n, l) => String(n).padStart(l, '0');
    const NOW = Date.now(); const N = new Date();
    const SOD = new Date(N.getFullYear(), N.getMonth(), N.getDate()).getTime();
    const I = (ms) => (ms == null ? null : new Date(ms).toISOString());
    const cap = (ms) => Math.min(ms, NOW - 3600e3);
    const ago = (days) => cap(SOD - days * DAY + ri(8, 17) * 3600e3 + ri(0, 59) * 60e3);
    const rdays = () => { const r = rnd(); return r < 0.14 ? ri(0, N.getDay()) : r < 0.42 ? ri(0, N.getDate() - 1) : ri(0, 420); };
    const ym = (ms) => { const d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1, 2); };
    const D = {};

    /* ---- people ---- */
    const FIRST = ['Omar', 'Layla', 'Yusuf', 'Mariam', 'Khalid', 'Noor', 'Hassan', 'Salma', 'Tariq', 'Amira', 'Faisal', 'Huda', 'Rashid', 'Dana', 'Ibrahim', 'Reem', 'Karim', 'Lina', 'Sami', 'Aya', 'Arjun', 'Priya', 'Daniel', 'Maria', 'Joseph', 'Anita', 'Vikram', 'Grace'];
    const LAST = ['Haddad', 'Nasser', 'Farouk', 'Mansoor', 'Sabri', 'Khoury', 'Qasim', 'Rahman', 'Varghese', 'Nair', 'Santos', 'Reyes', 'Fernandes', 'Iyer', 'Pillai', 'Dawood', 'Barakat', 'Zaman'];
    const nm = () => pick(FIRST) + ' ' + pick(LAST);
    const staff = [{ name: 'Ravi Menon', username: 'contractor' }, { name: 'Nadia Farouk', username: 'supervisor' }, { name: 'Omar Haddad', username: 'admin' }];
    for (let i = 0; i < 13; i++) { let n; do { n = nm(); } while (staff.some((s) => s.name === n)); staff.push({ name: n, username: n.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.') }); }
    const person = () => pick(staff);
    D.users = [
      { id: 1, username: 'contractor', password: 'Sonu@123', name: 'Ravi Menon', position: 'Civil Technician', company: 'SONU Contracting Services', phone: '+974 5550 1101', email: 'ravi.menon@example.com', role: 'Contractor', bl_id: 'SNHQB02' },
      { id: 2, username: 'supervisor', password: 'Sonu@123', name: 'Nadia Farouk', position: 'Facilities Supervisor', company: 'SONU Facilities Management', phone: '+974 5550 1102', email: 'nadia.farouk@example.com', role: 'Supervisor', bl_id: 'SNHQB01' },
      { id: 3, username: 'admin', password: 'Sonu@123', name: 'Omar Haddad', position: 'Portal Administrator', company: 'SONU Facilities Management', phone: '+974 5550 1103', email: 'omar.haddad@example.com', role: 'Administrator', bl_id: 'SNHQB01' }
    ];

    /* ---- sites & buildings ---- */
    const SITES = [['SNHQ', 'SONU Headquarters Campus', 'Doha', 25.2854, 51.5310], ['SNAC', 'SONU Academic City', 'Al Rayyan', 25.3300, 51.4300], ['SNMD', 'SONU Medical District', 'Doha', 25.3000, 51.4900], ['SNSP', 'SONU Sports Complex', 'Lusail', 25.4200, 51.4900], ['SNRS', 'SONU Research Park', 'Al Rayyan', 25.3100, 51.3800], ['SNLB', 'SONU Lusail Business Park', 'Lusail', 25.4500, 51.5000], ['SNWK', 'SONU Al Wakrah Campus', 'Al Wakrah', 25.1750, 51.5990], ['SNKH', 'SONU Al Khor Campus', 'Al Khor', 25.6800, 51.5000]];
    D.sites = SITES.map((s) => ({ id: s[0], name: s[1], city: s[2], lat: s[3], lng: s[4] }));
    const BL = { SNHQ: ['Administration Tower', 'Engineering Block A', 'Engineering Block B', 'Central Library', 'Student Services Centre'], SNAC: ['Science Block A', 'Science Block B', 'Arts Building', 'Lecture Hall Complex'], SNMD: ['Health Sciences Building', 'Clinical Skills Centre', 'Pharmacy Block', 'Wellness Clinic'], SNSP: ['Sports Hall', 'Aquatic Centre', 'Fitness Pavilion', 'Stadium Pavilion'], SNRS: ['Innovation Lab', 'Materials Research Lab', 'Data Centre', 'Pilot Plant'], SNLB: ['Business Tower One', 'Conference Centre', 'Executive Suites'], SNWK: ['Residence Hall A', 'Residence Hall B', 'Community Centre', 'Dining Hall'], SNKH: ['Marine Studies Block', 'Visitor Centre', 'Maintenance Depot'] };
    D.buildings = []; D.floors = [];
    D.sites.forEach((s) => BL[s.id].forEach((n, i) => {
      const id = s.id + 'B' + pad(i + 1, 2);
      D.buildings.push({ id, name: n, site_id: s.id, city: s.city, lat: +(s.lat + (rnd() - 0.5) * 0.016).toFixed(5), lng: +(s.lng + (rnd() - 0.5) * 0.016).toFixed(5), floors: ri(2, 5) });
      ['GF', 'L1', 'L2'].forEach((f) => D.floors.push({ id: id + '-' + f, bl_id: id, fl_id: f, name: f === 'GF' ? 'Ground Floor' : 'Level ' + f[1] }));
    }));
    const siteOf = {}; D.sites.forEach((s) => (siteOf[s.id] = s));
    const bOf = {}; D.buildings.forEach((b) => (bOf[b.id] = b));
    const bldIds = D.buildings.map((b) => b.id);

    /* ---- trades, teams, craftspersons ---- */
    D.trades = [['MECHE', 'Mechanical'], ['CIVI', 'Civil'], ['HVACE', 'HVAC'], ['ELEC', 'Electrical'], ['PLUMB', 'Plumbing'], ['GSER', 'General Services'], ['FIRE', 'Fire Systems'], ['CLEAN', 'Cleaning']].map((t) => ({ id: t[0], name: t[1] }));
    const tradeIds = D.trades.map((t) => t.id);
    D.work_teams = []; for (let i = 0; i < 10; i++) D.work_teams.push({ id: 'WT-' + (i < 8 ? 'A' + (i + 1) : 'B' + (i - 7)), name: 'Work Team ' + (i + 1), trade: tradeIds[i % 8] });
    D.craftspersons = []; for (let i = 0; i < 24; i++) { const t = tradeIds[i % 8]; D.craftspersons.push({ id: 'CF-' + (101 + i), name: i === 0 ? 'Ravi Menon' : nm(), trade: t, work_team: D.work_teams.filter((w) => w.trade === t)[0].id }); }

    /* ---- equipment ---- */
    const STD = [['AHU', 'Air Handling Unit', 'HVAC', 'HVACE'], ['FCU', 'Fan Coil Unit', 'HVAC', 'HVACE'], ['CHL', 'Chiller', 'HVAC', 'HVACE'], ['PMP', 'Water Pump', 'Plumbing', 'PLUMB'], ['GEN', 'Standby Generator', 'Electrical', 'ELEC'], ['LFT', 'Passenger Lift', 'Mechanical', 'MECHE'], ['FAP', 'Fire Alarm Panel', 'Fire Systems', 'FIRE'], ['DBD', 'Distribution Board', 'Electrical', 'ELEC'], ['UPS', 'UPS Unit', 'Electrical', 'ELEC'], ['SAC', 'Split AC Unit', 'HVAC', 'HVACE'], ['WHT', 'Water Heater', 'Plumbing', 'PLUMB'], ['SPR', 'Sprinkler Pump Set', 'Fire Systems', 'FIRE']];
    const MAKERS = ['Norvik', 'Calder Systems', 'Helion', 'Vantor', 'Brightline', 'Orsted Tech'];
    D.equipment = []; const eqByBl = {};
    for (let i = 0; i < 120; i++) {
      const s = pick(STD); const b = bOf[pick(bldIds)];
      const e = { id: s[0] + '-' + pad(1001 + i, 4), name: s[1] + ' ' + pad(ri(1, 12), 2), eq_std: s[0], category: s[2], trade: s[3], site_id: b.site_id, bl_id: b.id, fl_id: pick(['GF', 'L1', 'L2']), criticality: wp([['High', 2], ['Medium', 4], ['Low', 3]]), status: wp([['In Service', 14], ['Under Maintenance', 2], ['Out of Service', 1]]), install_date: I(NOW - ri(200, 3000) * DAY), manufacturer: pick(MAKERS), model: 'M' + ri(100, 999) };
      D.equipment.push(e); (eqByBl[b.id] = eqByBl[b.id] || []).push(e);
    }

    /* ---- work requests ---- */
    const PROBS = {
      HVACE: ['AC not cooling in office', 'Abnormal noise from unit', 'Thermostat not responding', 'Water leakage from indoor unit', 'Chiller tripped on alarm'],
      ELEC: ['Lights not working in corridor', 'Power socket sparking', 'Breaker tripping repeatedly', 'Emergency light battery failed', 'UPS alarm active'],
      PLUMB: ['Water leak from ceiling', 'Toilet flush not working', 'Low water pressure', 'Blocked floor drain', 'Water heater not heating'],
      CIVI: ['Cracked wall plaster', 'Broken floor tile', 'Door lock replacement', 'Ceiling tile damaged', 'Paint peeling in hall'],
      MECHE: ['Lift stuck between floors', 'Pump vibration high', 'Roller shutter jammed', 'Gate motor failure', 'Belt drive slipping'],
      GSER: ['Furniture relocation required', 'Signage replacement', 'Pest control request', 'Key duplication request', 'Event setup support'],
      FIRE: ['Fire extinguisher expired', 'Smoke detector fault', 'Sprinkler head leaking', 'Fire door not closing', 'Panel trouble signal'],
      CLEAN: ['Deep cleaning required', 'Glass facade cleaning', 'Spill in lobby', 'Waste not collected', 'Carpet shampoo request']
    };
    const FREQ = [['Weekly', 7], ['Monthly', 30], ['Quarterly', 91], ['Semi-Annual', 182], ['Annual', 365]];
    const WR_ACTIVE = ['Issued and In Process', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor', 'Stopped'];
    const wrStatus = (age) => {
      if (age <= 1) return pick(['Requested', 'Requested', 'Approved', 'Reviewed but On Hold']);
      if (age <= 7) return wp([['Requested', 2], ['Approved', 3], ['Assigned to Work Order', 3], ['Issued and In Process', 4], ['On Hold for Parts', 1], ['On Hold for Access', 1], ['Reviewed but On Hold', 1], ['Completed', 1]]);
      if (age <= 45) return wp([['Approved', 1], ['Assigned to Work Order', 1], ['Issued and In Process', 2], ['On Hold for Parts', 1], ['On Hold for Access', 1], ['On Hold for Labor', 1], ['Stopped', 0.5], ['Contractor Completed', 2], ['Completed', 4], ['Closed', 4], ['Cancelled', 0.5], ['Rejected', 0.5]]);
      return wp([['Closed', 10], ['Completed', 4], ['Contractor Completed', 1], ['Cancelled', 1], ['Rejected', 1], ['Issued and In Process', 0.5], ['On Hold for Parts', 0.4], ['On Hold for Access', 0.3]]);
    };
    const CAUSE = ['Normal Wear', 'Age', 'Misuse', 'Vandalism', 'Design Defect', 'Poor Maintenance', 'Weather'];
    const REPAIR = ['Repair', 'Replace', 'Adjust', 'Clean', 'Inspect', 'Reset'];
    const FEEDBACK = ['Work completed as per scope', 'Replaced faulty component and tested', 'Area cleaned and handed over', 'Issue resolved; monitoring for 48 hours', 'Adjusted and tested, operating normally'];
    const NONCOMP = { 'On Hold for Parts': 'Awaiting spare parts delivery', 'On Hold for Access': 'Area access not available from occupant', 'On Hold for Labor': 'Specialist technician not available', Stopped: 'Stopped due to safety concern', 'Reviewed but On Hold': 'Awaiting budget confirmation' };
    D.wr = []; const usedWr = new Set();
    for (let i = 0; i < 350; i++) {
      const age = rdays(); const dr = ago(age); const b = bOf[pick(bldIds)]; const type = chance(0.3) ? 'PM' : 'On Demand'; const st = wrStatus(age);
      const eqs = eqByBl[b.id] || []; let eq = (type === 'PM' || chance(0.7)) && eqs.length ? pick(eqs) : null;
      if (type === 'PM' && !eq) eq = pick(D.equipment);
      const bb = eq && type === 'PM' ? bOf[eq.bl_id] : b;
      const trade = eq ? eq.trade : pick(tradeIds); const fr = pick(FREQ);
      let id; do { id = 3374175 + ri(-2000, 6000); } while (usedWr.has(id)); usedWr.add(id);
      const person0 = chance(0.3) ? staff[0] : person();
      const past = !['Requested', 'Reviewed but On Hold', 'Rejected', 'Cancelled'].includes(st);
      const done = ['Contractor Completed', 'Completed', 'Closed'].includes(st);
      const rev = st === 'Requested' ? null : Math.min(NOW - 3600e3, dr + ri(2, 30) * 3600e3);
      const prio = wp([[1, 1], [2, 2], [3, 4], [4, 2], [5, 1]]);
      const target = past ? dr + ri(3, 14) * DAY : null;
      const perform = past ? dr + ri(1, 5) * DAY : null;
      const ccd = done ? Math.min(NOW - 3600e3, Math.max(dr + DAY, target + ri(-4, 4) * DAY)) : null;
      const fin = ['Completed', 'Closed'].includes(st) ? Math.min(NOW - 1800e3, ccd + ri(0, 2) * DAY) : null;
      const estc = ri(15, 600) * 10; const team = pick(D.work_teams.filter((w) => w.trade === trade).concat(D.work_teams));
      D.wr.push({
        id, action_item_id: 2000000 + ri(10000, 989999), date_requested: I(dr), requestor: person0.name, requestor_username: person0.username,
        site_id: bb.site_id, bl_id: bb.id, bl_name: bb.name, fl_id: pick(['GF', 'L1', 'L2']), prob_type: trade,
        description: type === 'PM' ? 'PPM ' + fr[0] + ' maintenance - ' + eq.name : pick(PROBS[trade]) + (eq ? ' - ' + eq.name : ''),
        priority: prio, status: st, wr_type: type, pm_procedure: type === 'PM' ? trade + '-PM-' + fr[0].charAt(0) + pad(ri(1, 12), 2) : '',
        date_review_confirmed: I(rev), date_assigned: ['Assigned to Work Order', 'Issued and In Process'].includes(st) || done || WR_ACTIVE.includes(st) ? I(Math.min(NOW - 3600e3, (rev || dr) + DAY)) : null,
        date_to_perform: I(perform), date_agreed_target: I(target), date_contractor_completed: I(ccd), date_completed: I(fin),
        work_team: team.id, cause_type: done ? pick(CAUSE) : '', repair_type: done ? pick(REPAIR) : '', account_code: 'AC-' + ri(1000, 1999),
        eq_id: eq ? eq.id : '', eq_name: eq ? eq.name : '', eq_std: eq ? eq.eq_std : '', criticality: eq ? eq.criticality : '',
        request_nature: type === 'PM' ? 'Preventive' : pick(['Breakdown', 'Defect', 'Service Request', 'Inspection Finding', 'Emergency']),
        ptw_id: '', ptw_status: '', est_cost: estc, act_cost: done ? Math.round(estc * (0.8 + rnd() * 0.4)) : 0, est_hours: ri(1, 40), act_hours: done ? ri(1, 44) : (WR_ACTIVE.includes(st) ? ri(0, 12) : 0),
        has_rfe: false, completion_feedback: fin ? pick(FEEDBACK) : '', reason_non_completion: NONCOMP[st] || '', assigned_to_me: chance(0.14), substitute: chance(0.05),
        craftsperson: past ? pick(D.craftspersons.filter((c) => c.trade === trade).concat(D.craftspersons)).name : ''
      });
    }
    const wrById = {}; D.wr.forEach((w) => (wrById[w.id] = w));

    /* ---- permits to work ---- */
    const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];
    const WORKTYPES = ['Hot Work', 'Cold Work', 'Work at Height', 'Confined Space', 'Electrical Isolation', 'Excavation'];
    const REJ = ['Risk assessment incomplete', 'Isolation not confirmed', 'Contractor documents expired', 'Work area conflict', 'Incorrect work type selected'];
    const ptwStatus = (age) => {
      if (age <= 1) return wp([['Requested', 4], ['Authorized', 3], ['Issued', 2]]);
      if (age <= 10) return wp([['Requested', 1], ['Authorized', 2], ['Issued', 5], ['Re Issued', 2], ['Waiting For Re Issuing', 1], ['Completed By Applicant', 1], ['Rejected', 1], ['Stopped by Authority', 1]]);
      return wp([['Closed', 10], ['Completed By Controller', 3], ['Completed By Applicant', 2], ['Rejected', 2], ['Stopped by Authority', 1], ['Issued', 1], ['Re Issued', 0.7], ['Waiting For Re Issuing', 0.3]]);
    };
    D.ptw = []; const usedP = new Set(); let pSeq = 0;
    const PTW_ACTIVE = ['Authorized', 'Issued', 'Re Issued', 'Waiting For Re Issuing'];
    function makePtw(wr) {
      const created = wr ? Math.min(NOW - 3600e3, Date.parse(wr.date_requested) + ri(1, 3) * DAY) : ago(rdays());
      const age = Math.floor((NOW - created) / DAY); const st = ptwStatus(age);
      const b = wr ? bOf[wr.bl_id] : bOf[pick(bldIds)];
      const ap = chance(0.35) ? staff[0] : person();
      let pid; do { pid = pick(['C-', 'C-', 'C-', 'C-', 'C-', 'C-', 'W-', 'E-']) + ri(100000, 999999); } while (usedP.has(pid)); usedP.add(pid);
      const proc = ri(1, 5);
      const issued = ['Requested', 'Authorized', 'Rejected'].includes(st) ? null : Math.min(NOW - 1800e3, created + proc * DAY);
      const start = issued || created + DAY; let end = start + ri(1, 10) * DAY;
      if (PTW_ACTIVE.includes(st)) { const r = rnd(); if (r < 0.12) end = NOW + ri(2, 40) * 3600e3; else if (r < 0.28) end = NOW + ri(3, 20) * DAY; }
      const closedSt = ['Closed', 'Completed By Controller', 'Completed By Applicant'].includes(st);
      const closed = ['Closed', 'Completed By Controller'].includes(st) ? Math.min(NOW - 1800e3, Math.max(start + 3600e3, end + (chance(0.4) ? ri(1, 3) * DAY : -ri(0, 2) * DAY))) : null;
      const hist = [{ date: I(created), action: 'Permit requested', by: ap.name }];
      if (st !== 'Requested') hist.push({ date: I(created + 3600e3 * ri(2, 20)), action: st === 'Rejected' ? 'Permit rejected' : 'Permit authorized', by: 'Nadia Farouk' });
      if (issued) hist.push({ date: I(issued), action: 'Permit issued', by: 'Nadia Farouk' });
      if (['Re Issued', 'Waiting For Re Issuing'].includes(st)) hist.push({ date: I(Math.min(NOW - 1800e3, start + DAY)), action: 'Permit re-issued', by: 'Nadia Farouk' });
      if (closedSt) hist.push({ date: I(closed || Math.min(NOW - 1800e3, end)), action: st === 'Completed By Applicant' ? 'Work completed by applicant' : 'Permit closed', by: ap.name });
      if (st === 'Stopped by Authority') hist.push({ date: I(Math.min(NOW - 1800e3, start + DAY)), action: 'Stopped by authority', by: 'Omar Haddad' });
      const comm = []; for (let c = ri(0, 3); c > 0; c--) comm.push({ date: I(created + c * 4 * 3600e3), from: c % 2 ? ap.name : 'Nadia Farouk', message: pick(['Please confirm isolation before starting.', 'Risk assessment attached.', 'Area has been barricaded.', 'Need extension for tomorrow.', 'Work started as planned.']) });
      const p = {
        id: pid, wr_id: wr ? wr.id : null, site_id: b.site_id, site_name: siteOf[b.site_id].name, bl_id: b.id, bl_name: b.name, date_created: I(created), date_issued: I(issued), date_start: I(start), date_end: I(end),
        status: st, work_type: pick(WORKTYPES), zone: pick(ZONES), applicant: ap.name, applicant_username: ap.username, controller_username: chance(0.5) ? 'supervisor' : 'contractor', authority_username: 'admin',
        requestor_phone: '+974 5550 ' + ri(1000, 9999), project_code: 'PRJ-' + ri(100, 160), work_team: wr ? wr.work_team : pick(D.work_teams).id,
        description: wr ? wr.description : pick(['Roof access for antenna inspection', 'Cable trench excavation', 'Tank cleaning and inspection', 'Welding of support bracket', 'Facade cleaning at height', 'Panel isolation for upgrade works', 'Chiller room maintenance']),
        needs_daily_endorsement: PTW_ACTIVE.includes(st) && chance(0.25), ready_for_closure: st === 'Completed By Applicant', stopped: st === 'Stopped by Authority',
        reject_reason: st === 'Rejected' ? pick(REJ) : '', processing_days: ['Requested', 'Rejected'].includes(st) ? null : proc, date_closed: I(closed), history: hist, communications: comm,
        hazards: { electrical: chance(0.3), height: chance(0.3), confined: chance(0.1), hot: chance(0.2), chemical: chance(0.1) }
      };
      D.ptw.push(p);
      if (wr) { wr.ptw_id = p.id; wr.ptw_status = p.status; }
      return p;
    }
    D.wr.filter((w) => ['Issued and In Process', 'Completed', 'Closed', 'Contractor Completed', 'On Hold for Parts', 'On Hold for Access', 'Stopped', 'Assigned to Work Order', 'On Hold for Labor'].includes(w.status)).forEach((w) => { if (D.ptw.length < 190 && chance(0.62)) makePtw(w); });
    while (D.ptw.length < 250) makePtw(null);
    D.ptw.sort((x, y) => Date.parse(x.date_created) - Date.parse(y.date_created));
    // guarantee a healthy pool of the demo user's own permits and closure candidates
    D.ptw.filter((p) => !p.wr_id).slice(0, 18).forEach((p, i) => { if (i < 12) { p.applicant = 'Ravi Menon'; p.applicant_username = 'contractor'; } });
    const noWr = D.ptw.filter((p) => !p.wr_id && p.applicant_username === 'contractor').slice(0, 5);
    noWr.forEach((p) => { p.status = 'Completed By Applicant'; p.ready_for_closure = true; p.stopped = false; p.reject_reason = ''; });

    /* ---- ISO / De-ISO ---- */
    D.iso = [];
    D.ptw.filter((p) => p.wr_id && !['Requested', 'Rejected'].includes(p.status)).slice(0, 80).forEach((p, i) => {
      const st = wp([['Requested', 2], ['Isolated', 3], ['De-Isolated', 2], ['Completed', 4]]); const req = Date.parse(p.date_start);
      D.iso.push({ id: 5000 + i, wr_id: p.wr_id, ptw_id: p.id, system: pick(['Electrical', 'Mechanical', 'Fire', 'Water']), point: pick(['DB-GF-01', 'Valve V-12', 'Isolator ISO-3', 'Pump P-2 breaker', 'Riser R4 valve']), isolation_type: pick(['Lock Out Tag Out', 'Valve Closure', 'Breaker Off']), status: st, requested_by: p.applicant, date_requested: I(Math.min(req, NOW - 3600e3)), date_isolated: st === 'Requested' ? null : I(Math.min(req + 3600e3, NOW - 1800e3)), date_deisolated: ['De-Isolated', 'Completed'].includes(st) ? I(Math.min(req + 2 * DAY, NOW - 600e3)) : null });
    });

    /* ---- other resources (RFE) & lines ---- */
    const RES = { Material: ['Copper pipe 22mm', 'Replacement contactor', 'Ceiling tiles (box)', 'Fan motor', 'Sealant and gaskets', 'LED panel lights'], Subcontract: ['Specialist crane lift', 'Facade access cradle team', 'Pump overhaul by OEM', 'Waterproofing subcontractor'], 'Equipment Rental': ['Scissor lift hire', 'Dewatering pump hire', 'Scaffold hire'], Manpower: ['Additional electricians (2)', 'Night-shift labour', 'Weekend crew'] };
    const UOM = ['EA', 'M', 'KG', 'HR', 'DAY', 'LS'];
    D.other_resources = []; D.rfe_lines = [];
    const rfeWr = D.wr.filter((w) => !['Requested', 'Rejected', 'Cancelled'].includes(w.status));
    for (let i = 0; i < 300; i++) {
      const w = pick(rfeWr); w.has_rfe = true; const rt = pick(Object.keys(RES)); const q = ri(1, 20); const uc = ri(2, 120) * 5;
      const dt = Math.max(Date.parse(w.date_requested), Math.min(NOW - 3600e3, Date.parse(w.date_requested) + ri(0, 10) * DAY));
      const young = NOW - dt < 20 * DAY; const st = young ? wp([['Pending', 6], ['Approved', 3], ['Done', 1]]) : wp([['Done', 6], ['Approved', 4], ['Rejected', 1], ['Pending', 1.5]]);
      const id = 400000 + i * 3 + ri(0, 2);
      D.other_resources.push({ id, wr_id: w.id, date_used: I(dt), time_used: pad(ri(7, 18), 2) + ':' + pad(ri(0, 59), 2), description: pick(RES[rt]), resource_type: rt, qty_estimated: q, unit_cost: uc, cost_estimated: q * uc, status: st, rfe_pending: st === 'Pending', comments: chance(0.3) ? [{ date: I(dt + 3600e3), by: 'Nadia Farouk', text: 'Please provide a quotation.' }] : [], approved_by: ['Approved', 'Done'].includes(st) ? 'Nadia Farouk' : '', date_approved: ['Approved', 'Done'].includes(st) ? I(Math.min(NOW - 3600e3, dt + DAY)) : null, variation: chance(0.1) });
      if (chance(0.55)) for (let l = ri(1, 3); l > 0; l--) { const lq = ri(1, 10); const ur = ri(3, 90) * 5; D.rfe_lines.push({ id: D.rfe_lines.length + 1, other_res_id: id, wr_id: w.id, item_code: 'BOQ-' + ri(100, 160), description: pick(RES[rt]), uom: pick(UOM), qty: lq, unit_rate: ur, amount: lq * ur }); }
    }

    /* ---- labor ---- */
    D.labor = [];
    const labWr = D.wr.filter((w) => ['Issued and In Process', 'Completed', 'Closed', 'Contractor Completed', 'On Hold for Parts', 'On Hold for Access', 'On Hold for Labor'].includes(w.status));
    for (let i = 0; i < 600; i++) {
      const w = pick(labWr); const cf = pick(D.craftspersons.filter((c) => c.trade === w.prob_type).concat(D.craftspersons));
      D.labor.push({ id: i + 1, wr_id: w.id, cf_id: cf.id, cf_name: cf.name, trade: cf.trade, date: I(Math.max(Date.parse(w.date_requested) + DAY, Math.min(NOW - 3600e3, Date.parse(w.date_requested) + ri(1, 10) * DAY))), hours_straight: ri(2, 8), hours_overtime: chance(0.25) ? ri(1, 3) : 0, site_id: w.site_id, bl_id: w.bl_id });
    }

    /* ---- PM schedules ---- */
    D.pm_schedules = [];
    for (let i = 0; i < 150; i++) {
      const eq = pick(D.equipment); const fr = pick(FREQ); const dn = NOW + ri(-240, 200) * DAY; const diff = (dn - NOW) / DAY;
      D.pm_schedules.push({ id: i + 1, pm_procedure: eq.trade + '-PM-' + fr[0].charAt(0) + pad(ri(1, 12), 2), description: fr[0] + ' PPM - ' + eq.name, eq_id: eq.id, eq_name: eq.name, site_id: eq.site_id, bl_id: eq.bl_id, frequency: fr[0], date_next: I(dn), date_last: I(dn - fr[1] * DAY), trade: eq.trade, est_hours: ri(1, 8), status: diff < -3 ? (chance(0.8) ? 'Executed' : 'Missed') : diff <= 3 ? 'Generated' : 'Planned', forecast_month: ym(dn) });
    }

    /* ---- checklist ---- */
    const TL = { 'AHU Monthly Inspection': ['Filters clean?', 'Belt tension OK?', 'Supply air temperature (C)', 'Drain pan clear?'], 'Fire Panel Test': ['All zones healthy?', 'Battery backup tested?', 'Sounders audible?'], 'Generator Weekly Run': ['Fuel level adequate?', 'Oil pressure (psi)', 'Auto start successful?'], 'General Safety Walkdown': ['Exits unobstructed?', 'Extinguishers in place?', 'Housekeeping acceptable?'] };
    D.checklist_answers = [];
    for (let i = 0; i < 200; i++) {
      const w = pick(D.wr); const tl = pick(Object.keys(TL)); const q = pick(TL[tl]); const val = /\(/.test(q); const ans = val ? String(ri(20, 60)) : wp([['Yes', 60], ['No', 14], ['N/A', 8]]);
      D.checklist_answers.push({ id: i + 1, wr_id: w.id, wr_type: w.wr_type === 'PM' ? 'PPM' : 'CM', task_list: tl, question: q, answer: ans, action_required: ans === 'No', action_status: ans === 'No' ? pick(['Open', 'In Progress', 'Closed']) : '', date: I(Math.max(Date.parse(w.date_requested), ago(rdays()))) });
    }

    /* ---- HSE docs & error docs ---- */
    D.hse_docs = [];
    const DT = ['Risk Assessment', 'Method Statement', 'Toolbox Talk', 'Insurance', 'Competency Certificate'];
    for (let i = 0; i < 150; i++) {
      const p = pick(D.ptw); const t = pick(DT);
      D.hse_docs.push({ id: i + 1, ptw_id: p.id, wr_id: p.wr_id, doc_type: t, file_name: (p.id + '_' + t).replace(/\s+/g, '_') + '.pdf', uploaded_by: p.applicant, date_uploaded: I(Math.min(NOW - 3600e3, Date.parse(p.date_created) + 3600e3 * ri(1, 30))), status: wp([['Valid', 75], ['Expired', 15], ['Error', 10]]) });
    }
    D.error_docs = D.hse_docs.filter((d) => d.status === 'Error').slice(0, 8).map((d, i) => ({ id: i + 1, wr_id: d.wr_id, ptw_id: d.ptw_id, file_name: d.file_name, error: pick(['File is corrupted', 'Unsupported file format', 'Virus scan failed', 'File exceeds size limit']), uploaded_by: d.uploaded_by, date_uploaded: d.date_uploaded }));

    /* ---- invoices ---- */
    D.invoices = [];
    D.wr.filter((w) => ['Completed', 'Closed'].includes(w.status)).slice(0, 130).forEach((w, i) => {
      const fin = Date.parse(w.date_completed); const roAmt = w.act_cost || w.est_cost; const roD = Math.min(NOW - 3600e3, fin + ri(1, 5) * DAY); const invD = Math.min(NOW - 1800e3, roD + ri(2, 15) * DAY);
      const paid = invD < NOW - 30 * DAY && chance(0.7);
      D.invoices.push({ id: i + 1, wr_id: w.id, wr_type: w.wr_type, group_code: 'GRP-0' + ri(1, 6), bpa_number: 'BPA-26-0' + ri(1, 4), release_order: 'RO-' + ri(200000, 299999), ro_date: I(roD), ro_amount: roAmt, invoice_no: 'SINV-' + ri(10000, 99999), invoice_date: I(invD), invoice_amount: Math.round(roAmt * (0.95 + rnd() * 0.05)), paid, status: paid ? 'Paid' : wp([['Draft', 1], ['Submitted', 3], ['Approved', 3]]) });
    });

    /* ---- incidents ---- */
    const ITYPES = ['OBJECT FALLING FROM HEIGHT', 'IMPACT ON ASSET', 'SLIP TRIP FALL', 'FIRE', 'ELECTRIC SHOCK', 'VEHICLE COLLISION', 'NEAR MISS', 'ENVIRONMENTAL SPILL'];
    const IDESC = { 'OBJECT FALLING FROM HEIGHT': 'Tool fell from scaffold platform', 'IMPACT ON ASSET': 'Equipment struck glass panel during move', 'SLIP TRIP FALL': 'Worker slipped on wet floor', FIRE: 'Small fire in waste bin', 'ELECTRIC SHOCK': 'Minor shock from damaged cable', 'VEHICLE COLLISION': 'Utility vehicle reversed into bollard', 'NEAR MISS': 'Unsecured ladder noticed before use', 'ENVIRONMENTAL SPILL': 'Oil leak from generator drip tray' };
    D.incidents = [];
    for (let i = 0; i < 200; i++) {
      const b = bOf[pick(bldIds)]; const t = pick(ITYPES); const age = rdays(); const rp = person();
      D.incidents.push({ id: 10001 + i, date_incident: I(ago(age)), incident_type: t, affected_person: chance(0.15) ? 'Visitor' : person().name, site_id: b.site_id, property_code: b.id, description: IDESC[t], severity: wp([['Minor', 8], ['Moderate', 4], ['Major', 1.5], ['Critical', 0.5]]), status: age > 60 ? wp([['Closed', 8], ['Action Required', 1]]) : wp([['Reported', 3], ['Under Investigation', 3], ['Action Required', 2], ['Closed', 2]]), reported_by: rp.name, contractor: chance(0.5) });
    }
    D.incident_actions = [];
    D.incidents.filter((x) => x.severity !== 'Minor' || chance(0.3)).slice(0, 120).forEach((x, i) => {
      const due = Date.parse(x.date_incident) + ri(7, 30) * DAY; let st = x.status === 'Closed' ? 'Completed' : wp([['Open', 3], ['In Progress', 3], ['Completed', 2]]);
      if (st !== 'Completed' && due < NOW) st = 'Overdue';
      D.incident_actions.push({ id: i + 1, incident_id: x.id, action: pick(['Install additional signage', 'Retrain staff on procedure', 'Repair damaged item', 'Review risk assessment', 'Add edge protection', 'Update permit conditions']), responsible: person().name, date_due: I(due), date_completed: st === 'Completed' ? I(Math.min(NOW - 3600e3, due - ri(0, 5) * DAY)) : null, status: st });
    });

    /* ---- inspections ---- */
    D.inspections = [];
    const FIND = ['Damaged ceiling tile in corridor', 'Fire exit sign not illuminated', 'Water stain on wall', 'Loose handrail on staircase', 'Overgrown landscaping near entrance', 'Cracked paving outside entrance', 'Dust build-up on AC grilles', 'Missing safety signage'];
    for (let i = 0; i < 150; i++) {
      const b = bOf[pick(bldIds)]; const age = rdays(); const st = age < 5 ? wp([['Requested', 5], ['Approved', 2]]) : wp([['Requested', 2], ['Approved', 3], ['Rejected', 1], ['Converted to WR', 4], ['Closed', 3]]);
      D.inspections.push({ id: i + 1, date_requested: I(ago(age)), inspector: person().name, site_id: b.site_id, bl_id: b.id, location: pick(['Lobby', 'Corridor L1', 'Roof', 'Car park', 'Plant room', 'Level 2 Office']), category: pick(['Housekeeping', 'Safety', 'Structural', 'Electrical', 'HVAC', 'Plumbing', 'Landscaping', 'Fire Safety']), finding: pick(FIND), priority: wp([['High', 2], ['Medium', 4], ['Low', 3]]), status: st, wr_id: st === 'Converted to WR' ? pick(D.wr).id : null, photos: ri(0, 4), action_item_id: 2000000 + ri(10000, 989999) });
    }

    /* ---- surveys ---- */
    D.surveys = [];
    const doneWr = D.wr.filter((w) => w.date_completed);
    for (let i = 0; i < 36; i++) {
      const w = doneWr[i % doneWr.length]; const pend = i < 10; const who = i < 6 ? staff[0] : person();
      const s = { id: i + 1, wr_id: w.id, description: w.description, bl_id: w.bl_id, date_completed: w.date_completed, status: pend ? 'Pending' : 'Answered', requestor: who.username, rating: null, comment: '', date_answered: null };
      if (!pend) { s.rating = wp([[5, 5], [4, 4], [3, 2], [2, 1], [1, 1]]); s.comment = pick(['Quick and professional.', 'Good service.', 'Took longer than expected.', 'Issue fixed first time.', '']); s.date_answered = I(Math.min(NOW - 3600e3, Date.parse(w.date_completed) + ri(1, 5) * DAY)); }
      D.surveys.push(s);
    }
    D.bookings = [
      { id: 1, room: 'Conference Room 2', bl_id: 'SNLB02', date: I(NOW + DAY), start: '09:00', end: '10:30', purpose: 'Contractor coordination meeting', booked_by: 'Ravi Menon' },
      { id: 2, room: 'Meeting Room A', bl_id: 'SNHQB01', date: I(NOW + 2 * DAY), start: '14:00', end: '15:00', purpose: 'Safety briefing', booked_by: 'Nadia Farouk' },
      { id: 3, room: 'Training Room', bl_id: 'SNHQB05', date: I(NOW - 3 * DAY), start: '10:00', end: '12:00', purpose: 'Toolbox talk', booked_by: 'Omar Haddad' }
    ];
    return D;
  }

  /* ===================================================== API-backed store =====================================================
     The server (server/server.js) owns the data. DB.init() loads every table once (GET /api/bootstrap) into a cache;
     reads are served from the cache; writes go to the REST API (synchronously, so the existing view code can use the
     returned record immediately) and the cache is updated with the server's response, including server-side rules.
     On a validation/permission error the server message is shown as a toast and the call returns false / null. */
  let data = {}; let me = null;
  const same = (x, y) => String(x) === String(y);
  function call(method, url, body) {
    const x = new XMLHttpRequest();
    x.open(method, url, false);
    x.setRequestHeader('Content-Type', 'application/json');
    try { x.send(body === undefined ? null : JSON.stringify(body)); } catch (e) { return { ok: false, status: 0, body: { error: 'Server is not reachable. Is it running?' } }; }
    let parsed = null; try { parsed = x.responseText ? JSON.parse(x.responseText) : null; } catch (e) { parsed = { error: x.responseText }; }
    if (x.status === 401 && !/\/api\/auth\/login$/.test(url) && location.pathname.indexOf('index.html') < 0) { location.replace('index.html'); }
    return { ok: x.status >= 200 && x.status < 300, status: x.status, body: parsed };
  }
  const report = (r) => { const msg = (r.body && r.body.error) || ('Request failed (' + r.status + ')'); if (window.SONU_UI) window.SONU_UI.toast(msg, true); else alert(msg); };
  const upsertCache = (t, row) => { data[t] = data[t] || []; const i = data[t].findIndex((x) => same(x.id, row.id)); if (i >= 0) data[t][i] = row; else data[t].push(row); return row; };

  const DB = {
    init() {
      const r = call('GET', '/api/bootstrap');
      if (!r.ok) { if (r.status !== 401) report(r); return false; }
      data = r.body.tables; me = r.body.user; return true;
    },
    me() { return me; },
    all(t) { return (data[t] || []).slice(); },
    get(t, id) { return (data[t] || []).find((r) => same(r.id, id)) || null; },
    nextId() { return null; /* ids are assigned by the server */ },
    insert(t, obj) {
      const r = call('POST', '/api/t/' + t, obj);
      if (!r.ok) { report(r); return false; }
      return upsertCache(t, r.body);
    },
    update(t, id, patch) {
      const r = call('PATCH', '/api/t/' + t + '/' + encodeURIComponent(id), patch);
      if (!r.ok) { report(r); return null; }
      const row = DB.get(t, id); // keep object identity for callers holding a reference
      if (row) { Object.keys(row).forEach((k) => { if (!(k in r.body)) delete row[k]; }); return Object.assign(row, r.body); }
      return upsertCache(t, r.body);
    },
    remove(t, id) {
      const r = call('DELETE', '/api/t/' + t + '/' + encodeURIComponent(id));
      if (!r.ok) { report(r); return false; }
      data[t] = (data[t] || []).filter((x) => !same(x.id, id)); return true;
    },
    reset() {
      const r = call('POST', '/api/reset');
      if (!r.ok) { report(r); return false; }
      return DB.init();
    },
    audit() { const r = call('GET', '/api/audit'); if (!r.ok) { report(r); return []; } return r.body; },
    /* generic API call for admin/auth endpoints: returns { ok, status, body }; shows a toast on failure */
    request(method, url, body) { const r = call(method, url, body); if (!r.ok) report(r); return r; },
    login(username, password, project) { return call('POST', '/api/auth/login', { username, password, project }); },
    logout() { return call('POST', '/api/auth/logout'); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildSeed };
  if (typeof window !== 'undefined') { window.DB = DB; }
})();
