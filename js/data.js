/* SONU fake database. window.DB — seeded demo data (all FICTIONAL), persisted in localStorage.
   API: DB.all(table) DB.get(table,id) DB.insert(table,obj) DB.update(table,id,patch) DB.remove(table,id) DB.reset() DB.nextId(table) */
(function () {
  'use strict';
  const KEY = 'sonu_db_v1';
  const DAY = 864e5;
  const PREFIX = { ptw: 'C-' };
  const BASE = { wr: 3374175, other_resources: 400000, incidents: 10001, invoices: 1, ptw: 831572, wcc: 7001, service_requests: 8001, desk_bookings: 101 };

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
    const eod = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() + 17 * 3600e3; };
    const D = {};

    /* ---- people ---- */
    const FIRST = ['Omar', 'Layla', 'Yusuf', 'Mariam', 'Khalid', 'Noor', 'Hassan', 'Salma', 'Tariq', 'Amira', 'Faisal', 'Huda', 'Rashid', 'Dana', 'Ibrahim', 'Reem', 'Karim', 'Lina', 'Sami', 'Aya', 'Arjun', 'Priya', 'Daniel', 'Maria', 'Joseph', 'Anita', 'Vikram', 'Grace'];
    const LAST = ['Haddad', 'Nasser', 'Farouk', 'Mansoor', 'Sabri', 'Khoury', 'Qasim', 'Rahman', 'Varghese', 'Nair', 'Santos', 'Reyes', 'Fernandes', 'Iyer', 'Pillai', 'Dawood', 'Barakat', 'Zaman'];
    const nm = () => pick(FIRST) + ' ' + pick(LAST);
    const staff = [{ name: 'Ravi Menon', username: 'contractor' }, { name: 'Nadia Farouk', username: 'supervisor' }, { name: 'Omar Haddad', username: 'admin' }];
    for (let i = 0; i < 13; i++) { let n; do { n = nm(); } while (staff.some((s) => s.name === n)); staff.push({ name: n, username: n.toLowerCase().replace(/[^a-z]/g, '.').replace(/\.+/g, '.') }); }
    const person = () => pick(staff);
    const others = staff.slice(3);
    const nameOf = (u) => { const s = staff.find((x) => x.username === u); return s ? s.name : u; };
    const anyUser = () => (chance(0.6) ? pick(['supervisor', 'admin', 'contractor']) : pick(others).username);
    D.users = [
      { id: 1, username: 'contractor', password: 'Sonu@123', name: 'Ravi Menon', position: 'Civil Technician', company: 'SONU Contracting Services', phone: '+974 5550 1101', email: 'ravi.menon@example.com', role: 'Contractor', bl_id: 'SNHQB02' },
      { id: 2, username: 'supervisor', password: 'Sonu@123', name: 'Nadia Farouk', position: 'Facilities Supervisor', company: 'SONU Facilities Management', phone: '+974 5550 1102', email: 'nadia.farouk@example.com', role: 'Supervisor', bl_id: 'SNHQB01' },
      { id: 3, username: 'admin', password: 'Sonu@123', name: 'Omar Haddad', position: 'Portal Administrator', company: 'SONU Facilities Management', phone: '+974 5550 1103', email: 'omar.haddad@example.com', role: 'Administrator', bl_id: 'SNHQB01' },
      { id: 6, username: 'employee', password: 'Sonu@123', name: 'Aya Mansoor', position: 'Academic Coordinator', company: 'Qatar Foundation / SONU Academic City', phone: '+974 5550 1104', email: 'aya.mansoor@example.com', role: 'Employee', bl_id: 'SNACB01' },
      { id: 7, username: 'finance', password: 'Sonu@123', name: 'Tariq Haddad', position: 'Contracts & Invoicing Specialist', company: 'SONU Finance Operations', phone: '+974 5550 1105', email: 'tariq.haddad@example.com', role: 'Finance', bl_id: 'SNHQB01' }
    ];

    /* ---- sites & buildings ---- */
    const SITES = [['SNHQ', 'SONU Headquarters Campus', 'Doha', 25.2854, 51.5310], ['SNAC', 'SONU Academic City', 'Al Rayyan', 25.3300, 51.4300], ['SNMD', 'SONU Medical District', 'Doha', 25.3000, 51.4900], ['SNSP', 'SONU Sports Complex', 'Lusail', 25.4200, 51.4900], ['SNRS', 'SONU Research Park', 'Al Rayyan', 25.3100, 51.3800], ['SNLB', 'SONU Lusail Business Park', 'Lusail', 25.4500, 51.5000], ['SNWK', 'SONU Al Wakrah Campus', 'Al Wakrah', 25.1750, 51.5990], ['SNKH', 'SONU Al Khor Campus', 'Al Khor', 25.6800, 51.5000]];
    D.sites = SITES.map((s) => ({ id: s[0], name: s[1], city: s[2], lat: s[3], lng: s[4], status: s[0] === 'SNKH' ? 'In-Active' : 'Active' }));
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

    /* ---- divisions, departments, projects ---- */
    D.divisions = [['DV-001', 'Facilities Operations'], ['DV-002', 'Health, Safety and Environment'], ['DV-003', 'Engineering Services'], ['DV-004', 'Campus Services'], ['DV-005', 'Administration and Finance']].map((d) => ({ id: d[0], name: d[1] }));
    D.departments = [['Mechanical Maintenance', 'DV-001'], ['Electrical Maintenance', 'DV-001'], ['HVAC Operations', 'DV-001'], ['Fire and Life Safety', 'DV-002'], ['Environmental Compliance', 'DV-002'], ['Projects and Capital Works', 'DV-003'], ['Civil and Structural', 'DV-003'], ['Grounds and Cleaning', 'DV-004'], ['Transport and Logistics', 'DV-004'], ['Procurement and Contracts', 'DV-005']].map((d, i) => ({ id: 'DP-' + pad(i + 1, 3), name: d[0], dv_id: d[1] }));
    const activeSites = D.sites.filter((s) => s.status === 'Active');
    const PNAMES = ['Chiller Plant Upgrade', 'Roof Waterproofing Programme', 'Fire Alarm Replacement', 'Lift Modernisation', 'Facade Cleaning Contract', 'Generator Overhaul', 'Car Park Resurfacing', 'LED Lighting Retrofit', 'Water Network Refurbishment', 'BMS Integration', 'Landscape Renewal', 'Data Hall Cooling Works'];
    D.projects = PNAMES.map((n, i) => {
      const s = activeSites[i % activeSites.length]; const bl = D.buildings.filter((b) => b.site_id === s.id);
      return { id: 'PRJ-' + (1001 + i), name: n, engineer: (i === 4 || i === 9) ? null : person().name, site_id: s.id, bl_id: bl[i % bl.length].id, status: 'Active' };
    });

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
    // o: { age, b (building), status, prob ('PTW-PREP' | 'PTW-DEISO'), ptw (permit row) }
    const mkWr = (o) => {
      o = o || {};
      const age = o.age != null ? o.age : rdays(); const dr = ago(age); const b = o.b || bOf[pick(bldIds)]; const type = o.prob ? 'On Demand' : (chance(0.3) ? 'PM' : 'On Demand'); const st = o.status || wrStatus(age);
      const eqs = eqByBl[b.id] || []; let eq = (type === 'PM' || chance(0.7)) && eqs.length ? pick(eqs) : null;
      if (type === 'PM' && !eq) eq = pick(D.equipment);
      if (o.prob) eq = null;
      const bb = eq && type === 'PM' ? bOf[eq.bl_id] : b;
      const trade = o.prob ? 'ELEC' : eq ? eq.trade : pick(tradeIds); const fr = pick(FREQ);
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
      const estc = chance(0.1) ? 0 : ri(15, 600) * 10; const team = pick(D.work_teams.filter((w) => w.trade === trade).concat(D.work_teams));
      const desc = o.prob === 'PTW-PREP' ? 'Isolation of ' + pick(['electrical supply', 'chilled water line', 'fire suppression zone', 'water riser']) + ' before permit works'
        : o.prob === 'PTW-DEISO' ? 'De-isolation and restoration after permit works'
          : type === 'PM' ? 'PPM ' + fr[0] + ' maintenance - ' + eq.name : pick(PROBS[trade]) + (eq ? ' - ' + eq.name : '');
      const w = {
        id, action_item_id: 2000000 + ri(10000, 989999), date_requested: I(dr), requestor: person0.name, requestor_username: person0.username,
        site_id: bb.site_id, bl_id: bb.id, bl_name: bb.name, fl_id: pick(['GF', 'L1', 'L2']), prob_type: o.prob || trade,
        description: desc,
        priority: prio, status: st, wr_type: type, pm_procedure: type === 'PM' ? trade + '-PM-' + fr[0].charAt(0) + pad(ri(1, 12), 2) : '',
        date_review_confirmed: I(rev), date_assigned: ['Assigned to Work Order', 'Issued and In Process'].includes(st) || done || WR_ACTIVE.includes(st) ? I(Math.min(NOW - 3600e3, (rev || dr) + DAY)) : null,
        date_to_perform: I(perform), date_agreed_target: I(target), date_contractor_completed: I(ccd), date_completed: I(fin),
        work_team: team.id, cause_type: done ? pick(CAUSE) : '', repair_type: done ? pick(REPAIR) : '', account_code: 'AC-' + ri(1000, 1999),
        eq_id: eq ? eq.id : '', eq_name: eq ? eq.name : '', eq_std: eq ? eq.eq_std : '', criticality: eq ? eq.criticality : '',
        request_nature: o.prob ? 'Isolation' : type === 'PM' ? 'Preventive' : pick(['Breakdown', 'Defect', 'Service Request', 'Inspection Finding', 'Emergency']),
        ptw_id: o.ptw ? o.ptw.id : '', ptw_status: o.ptw ? o.ptw.status : '', prep_wr_id: null, est_cost: estc, cost_est_total: estc, act_cost: done ? Math.round(estc * (0.8 + rnd() * 0.4)) : 0, est_hours: ri(1, 40), act_hours: done ? ri(1, 44) : (WR_ACTIVE.includes(st) ? ri(0, 12) : 0),
        has_rfe: false, completion_feedback: fin ? pick(FEEDBACK) : '', reason_non_completion: NONCOMP[st] || '', step_type: null, assigned_to_me: false, substitute: chance(0.05),
        craftsperson: past ? pick(D.craftspersons.filter((c) => c.trade === trade).concat(D.craftspersons)).name : ''
      };
      D.wr.push(w); return w;
    };
    for (let i = 0; i < 350; i++) mkWr({});

    /* ---- permits to work ---- */
    const ZONES = ['Zone A', 'Zone B', 'Zone C', 'Zone D'];
    const WORKTYPES = ['Hot Work', 'Cold Work', 'Work at Height', 'Confined Space', 'Electrical Isolation', 'Excavation'];
    const REJ = ['Risk assessment incomplete', 'Isolation not confirmed', 'Contractor documents expired', 'Work area conflict', 'Incorrect work type selected'];
    const COMPANIES = ['Gulf Facility Services', 'Al Noor Technical Works', 'Pearl Engineering Co.', 'Desert Rose Contracting'];
    const ptwStatus = (age) => {
      if (age <= 1) return wp([['Requested', 4], ['Applied', 3], ['Authorized', 2], ['Issued', 1]]);
      if (age <= 10) return wp([['Requested', 1], ['Applied', 1], ['Authorized', 2], ['Issued', 5], ['Re Issued', 2], ['Waiting For Re Issuing', 1], ['Completed By Applicant', 1], ['Rejected', 1]]);
      return wp([['Closed', 10], ['Completed By Controller', 3], ['Completed By Applicant', 2], ['Rejected', 2], ['Issued', 1.2], ['Re Issued', 0.8], ['Waiting For Re Issuing', 0.3]]);
    };
    const PATH = {
      Requested: ['Requested'], Applied: ['Requested', 'Applied'], Authorized: ['Requested', 'Applied', 'Authorized'], Rejected: ['Requested', 'Rejected'],
      Issued: ['Requested', 'Applied', 'Authorized', 'Issued'], 'Waiting For Re Issuing': ['Requested', 'Applied', 'Authorized', 'Issued', 'Waiting For Re Issuing'],
      'Re Issued': ['Requested', 'Applied', 'Authorized', 'Issued', 'Waiting For Re Issuing', 'Re Issued'], 'Completed By Applicant': ['Requested', 'Applied', 'Authorized', 'Issued', 'Completed By Applicant'],
      'Completed By Controller': ['Requested', 'Applied', 'Authorized', 'Issued', 'Completed By Applicant', 'Completed By Controller'], Closed: ['Requested', 'Applied', 'Authorized', 'Issued', 'Completed By Applicant', 'Completed By Controller', 'Closed']
    };
    const ACT = { Requested: 'Permit requested', Applied: 'Permit applied', Authorized: 'Permit authorized', Issued: 'Permit issued', Rejected: 'Permit rejected', 'Waiting For Re Issuing': 'Re-issue requested', 'Re Issued': 'Permit re-issued', 'Completed By Applicant': 'Work completed by applicant', 'Completed By Controller': 'Completion confirmed by controller', Closed: 'Permit closed' };
    D.ptw = []; const usedP = new Set();
    // force: { status, ap, start, created, upto, ended }
    function makePtw(wrs, force) {
      force = force || {};
      const b = wrs.length ? bOf[wrs[0].bl_id] : bOf[pick(bldIds)];
      const created = force.created != null ? force.created : wrs.length ? Math.min(NOW - 3600e3, Math.min.apply(null, wrs.map((w) => Date.parse(w.date_requested))) + ri(1, 3) * DAY) : ago(rdays());
      const age = Math.floor((NOW - created) / DAY); const st = force.status || ptwStatus(age);
      const ap = force.ap || (chance(0.35) ? staff[0] : person());
      let pid; do { pid = 'C-' + ri(700000, 831500); } while (usedP.has(pid)); usedP.add(pid);
      const proc = ri(1, 5);
      const unissued = ['Requested', 'Applied', 'Authorized', 'Rejected'].includes(st);
      const issued = unissued ? null : force.start != null ? Math.min(NOW - 1800e3, force.start) : Math.min(NOW - 1800e3, created + proc * DAY);
      const start = force.start != null ? force.start : (issued || created + DAY);
      let upto = eod(start + ri(1, 10) * DAY);
      if (['Issued', 'Re Issued', 'Waiting For Re Issuing'].includes(st) && chance(0.35)) upto = SOD + ri(3, 25) * DAY + 17 * 3600e3;
      if (force.upto != null) upto = force.upto;
      const pastDay = new Date(upto).setHours(0, 0, 0, 0) < SOD;
      let end = null; let closed = null;
      if (['Closed', 'Completed By Controller'].includes(st)) { closed = Math.min(NOW - 600e3, Math.max(start + 3600e3, upto + (chance(0.4) ? ri(1, 3) * DAY : -ri(0, 2) * DAY))); end = closed; }
      else if (st === 'Completed By Applicant') end = Math.min(NOW - 600e3, Math.max(start + 3600e3, upto - ri(0, 2) * DAY));
      else if (['Issued', 'Re Issued'].includes(st) && pastDay && (force.ended != null ? force.ended : chance(0.08))) end = Math.max(start, Math.min(NOW - 600e3, upto - ri(0, 2) * DAY));
      const proj = pick(D.projects.filter((p) => p.site_id === b.site_id).concat(D.projects));
      const dp = pick(D.departments);
      const ctrl = chance(0.5) ? 'supervisor' : chance(0.5) ? 'contractor' : pick(others).username;
      const live = ['Authorized', 'Issued', 'Re Issued', 'Waiting For Re Issuing'].includes(st);
      const path = PATH[st]; const hist = []; let t = created;
      path.forEach((s, i) => {
        if (i) t = s === 'Issued' && issued ? issued : Math.min(NOW - 1800e3, t + ri(1, 20) * 3600e3);
        hist.push({ date: I(t), action: ACT[s], to: s, by: s === 'Requested' || s === 'Waiting For Re Issuing' || s === 'Completed By Applicant' ? ap.name : s === 'Completed By Controller' || s === 'Closed' ? nameOf(ctrl) : 'Nadia Farouk' });
      });
      const comm = []; for (let c = ri(0, 3); c > 0; c--) comm.push({ date: I(created + c * 4 * 3600e3), from: c % 2 ? ap.name : 'Nadia Farouk', message: pick(['Please confirm isolation before starting.', 'Risk assessment attached.', 'Area has been barricaded.', 'Need extension for tomorrow.', 'Work started as planned.']) });
      const p = {
        id: pid, ptw_code: pid, status: st, project_code: proj.id, site_id: b.site_id, site_name: siteOf[b.site_id].name, bl_id: b.id, bl_name: b.name, fl_id: pick(['GF', 'L1', 'L2']),
        description: wrs.length ? wrs[0].description : pick(['Roof access for antenna inspection', 'Cable trench excavation', 'Tank cleaning and inspection', 'Welding of support bracket', 'Facade cleaning at height', 'Panel isolation for upgrade works', 'Chiller room maintenance']),
        dp_id: dp.id, dv_id: dp.dv_id, priority: wp([[1, 45], [2, 10], [3, 30], [4, 15]]),
        date_created: I(created), date_start: I(start), date_upto: I(upto), date_end: I(end), date_issued: I(issued),
        work_type: pick(WORKTYPES), zone: pick(ZONES), applicant: ap.name, applicant_username: ap.username, controller_username: ctrl, authority_username: chance(0.7) ? 'admin' : 'supervisor',
        blfp_username: pick(['supervisor', 'admin', 'supervisor'].concat(others.map((o) => o.username))), tram_username: chance(0.5) ? 'admin' : pick(['supervisor'].concat(others.map((o) => o.username))), created_by: chance(0.8) ? ap.username : anyUser(),
        daily_endorsement_needed: live && chance(0.25) ? 'Yes' : 'No', blfp_endorsement_pending: live && chance(0.2),
        contractor: ap.username === 'contractor' ? 'SONU Contracting Services' : pick(COMPANIES), work_team: wrs.length ? wrs[0].work_team : pick(D.work_teams).id,
        requestor_phone: '+974 5550 ' + ri(1000, 9999), history: hist, communications: comm,
        reject_reason: st === 'Rejected' ? pick(REJ) : '', processing_days: unissued ? null : proc, date_closed: I(closed),
        hazards: { electrical: chance(0.3), height: chance(0.3), confined: chance(0.1), hot: chance(0.2), chemical: chance(0.1) }
      };
      D.ptw.push(p);
      wrs.forEach((w) => { w.ptw_id = p.id; w.ptw_status = p.status; });
      return p;
    }
    const PTW_WR_ST = ['Issued and In Process', 'Completed', 'Closed', 'Contractor Completed', 'On Hold for Parts', 'On Hold for Access', 'Stopped', 'Assigned to Work Order', 'On Hold for Labor'];
    const eligible = D.wr.filter((w) => PTW_WR_ST.includes(w.status)); const byBl = {}; const usedW = new Set();
    eligible.forEach((w) => (byBl[w.bl_id] = byBl[w.bl_id] || []).push(w));
    eligible.forEach((w) => {
      if (usedW.has(w.id) || D.ptw.length >= 190 || !chance(0.62)) return;
      const group = [w]; usedW.add(w.id);
      if (chance(0.3)) { const pool = (byBl[w.bl_id] || []).filter((x) => !usedW.has(x.id)); for (let k = ri(1, 2); k > 0 && pool.length; k--) { const x = pool.shift(); group.push(x); usedW.add(x.id); } }
      makePtw(group);
    });
    while (D.ptw.length < 225) makePtw([]);
    // guaranteed colour cases: expiring today / +1 / +2 days (orange), expired without end date (red), expired with end date (blue)
    for (let k = 0; k < 9; k++) { const up = SOD + (k % 3) * DAY + 17 * 3600e3; makePtw([], { status: k % 2 ? 'Re Issued' : 'Issued', upto: up, start: SOD - ri(2, 6) * DAY + 8 * 3600e3, created: SOD - 8 * DAY, ap: k < 5 ? staff[0] : undefined }); }
    for (let k = 0; k < 10; k++) { const up = SOD - ri(1, 20) * DAY + 17 * 3600e3; makePtw([], { status: k % 2 ? 'Re Issued' : 'Issued', upto: up, start: up - ri(2, 8) * DAY - 9 * 3600e3, created: up - 12 * DAY, ended: false, ap: k < 5 ? staff[0] : undefined }); }
    for (let k = 0; k < 6; k++) { const up = SOD - ri(1, 15) * DAY + 17 * 3600e3; makePtw([], { status: k % 2 ? 'Re Issued' : 'Issued', upto: up, start: up - ri(2, 8) * DAY - 9 * 3600e3, created: up - 12 * DAY, ended: true, ap: k < 3 ? staff[0] : undefined }); }
    for (let k = 0; k < 5; k++) makePtw([], { status: 'Completed By Applicant', ap: staff[0], created: SOD - ri(12, 30) * DAY });
    D.ptw.sort((x, y) => Date.parse(x.date_created) - Date.parse(y.date_created));

    /* ---- PTW-PREP / PTW-DEISO work requests + ISO / De-ISO requests ---- */
    D.iso = []; let isoSeq = 0;
    const isoPermits = D.ptw.filter((p) => ['Issued', 'Re Issued', 'Completed By Applicant', 'Completed By Controller', 'Closed'].includes(p.status));
    for (let i = 0; i < 11; i++) {
      const p = isoPermits[(i * 7 + 3) % isoPermits.length]; const b = bOf[p.bl_id];
      const age = Math.max(0, Math.floor((NOW - Date.parse(p.date_created)) / DAY));
      const closedP = ['Closed', 'Completed By Controller', 'Completed By Applicant'].includes(p.status);
      const prep = mkWr({ age, b, prob: 'PTW-PREP', ptw: p, status: 'Completed' });
      const deiso = mkWr({ age, b, prob: 'PTW-DEISO', ptw: p, status: closedP ? 'Completed' : pick(['Issued and In Process', 'Assigned to Work Order', 'Completed']) });
      deiso.prep_wr_id = prep.id;
      [prep, deiso].forEach((w, wi) => {
        for (let k = ri(1, 2); k > 0; k--) {
          const finished = ['Completed', 'Closed'].includes(w.status);
          const st = finished ? 'Completed' : wp(wi === 0 ? [['Requested', 2], ['Isolated', 3]] : [['Requested', 2], ['De-Isolated', 2]]);
          const req = Math.min(Date.parse(w.date_requested), NOW - 3600e3);
          D.iso.push({ id: 5000 + isoSeq++, wr_id: w.id, ptw_id: p.id, system: pick(['Electrical', 'Mechanical', 'Fire', 'Water']), point: pick(['DB-GF-01', 'Valve V-12', 'Isolator ISO-3', 'Pump P-2 breaker', 'Riser R4 valve']), isolation_type: pick(['Lock Out Tag Out', 'Valve Closure', 'Breaker Off']), status: st, requested_by: p.applicant, date_requested: I(req), date_isolated: st === 'Requested' ? null : I(Math.min(req + 3600e3, NOW - 1800e3)), date_deisolated: ['De-Isolated', 'Completed'].includes(st) ? I(Math.min(req + 2 * DAY, NOW - 600e3)) : null });
        }
      });
    }
    const wrOfPtw = {}; D.wr.forEach((w) => { if (w.ptw_id && !wrOfPtw[w.ptw_id]) wrOfPtw[w.ptw_id] = w; });

    /* ---- other resources (RFE) & lines ---- */
    const RES = { Material: ['Copper pipe 22mm', 'Replacement contactor', 'Ceiling tiles (box)', 'Fan motor', 'Sealant and gaskets', 'LED panel lights'], Subcontract: ['Specialist crane lift', 'Facade access cradle team', 'Pump overhaul by OEM', 'Waterproofing subcontractor'], 'Equipment Rental': ['Scissor lift hire', 'Dewatering pump hire', 'Scaffold hire'], Manpower: ['Additional electricians (2)', 'Night-shift labour', 'Weekend crew'] };
    const UOM = ['EA', 'M', 'KG', 'HR', 'DAY', 'LS'];
    D.other_resources = []; D.rfe_lines = [];
    const rfeWr = D.wr.filter((w) => !['Requested', 'Rejected', 'Cancelled'].includes(w.status) && !String(w.prob_type).startsWith('PTW-') && w.est_cost > 0);
    for (let i = 0; i < 300; i++) {
      const w = pick(rfeWr); w.has_rfe = true; const rt = pick(Object.keys(RES)); const q = ri(1, 20); const uc = ri(2, 120) * 5;
      const dt = Math.max(Date.parse(w.date_requested), Math.min(NOW - 3600e3, Date.parse(w.date_requested) + ri(0, 10) * DAY));
      const young = NOW - dt < 20 * DAY; const st = young ? wp([['Pending', 6], ['Approved', 3]]) : wp([['Approved', 7], ['Rejected', 1], ['Pending', 2]]);
      const approved = st === 'Approved';
      const id = 400000 + i * 3 + ri(0, 2);
      D.other_resources.push({ id, wr_id: w.id, date_used: I(dt), time_used: pad(ri(7, 18), 2) + ':' + pad(ri(0, 59), 2), description: pick(RES[rt]), resource_type: rt, qty_estimated: q, unit_cost: uc, cost_estimated: q * uc, status: st, is_done: st === 'Rejected' ? false : chance(approved ? 0.65 : 0.3), comments: chance(0.3) || st === 'Rejected' ? [{ date: I(dt + 3600e3), by: 'Nadia Farouk', text: st === 'Rejected' ? 'Rejected - quotation too high.' : 'Please provide a quotation.' }] : [], approved_by: approved ? 'Nadia Farouk' : '', date_approved: approved ? I(Math.min(NOW - 3600e3, dt + DAY)) : null, variation: chance(0.1) });
      if (chance(0.55)) for (let l = ri(1, 3); l > 0; l--) { const lq = ri(1, 10); const ur = ri(3, 90) * 5; D.rfe_lines.push({ id: D.rfe_lines.length + 1, other_res_id: id, wr_id: w.id, item_code: 'BOQ-' + ri(100, 160), description: pick(RES[rt]), uom: pick(UOM), qty: lq, unit_rate: ur, amount: lq * ur }); }
    }
    // at most ONE 'DEFAULT RFE' per work request (~40% of the work requests that have resources)
    const resByWr = {}; D.other_resources.forEach((r) => (resByWr[r.wr_id] = resByWr[r.wr_id] || []).push(r));
    const wrById = {}; D.wr.forEach((w) => (wrById[w.id] = w));
    Object.keys(resByWr).sort().forEach((k) => { if (chance(0.4)) { const r0 = resByWr[k][0]; r0.resource_type = 'DEFAULT RFE'; r0.description = 'Default RFE - ' + String(wrById[k].description).slice(0, 60); } });
    Object.keys(resByWr).forEach((k) => { wrById[k].cost_est_total = wrById[k].est_cost + resByWr[k].filter((r) => r.status !== 'Rejected').reduce((s, r) => s + r.cost_estimated, 0); });
    // pending estimate / schedule steps for the demo contractor (On Demand WRs that are Approved / Assigned)
    D.wr.forEach((w) => {
      if (w.wr_type !== 'On Demand' || String(w.prob_type).startsWith('PTW-') || !['Approved', 'Assigned to Work Order'].includes(w.status)) return;
      w.step_type = w.status === 'Approved' ? (chance(0.8) ? 'estimation' : 'scheduling') : (chance(0.8) ? 'scheduling' : 'estimation');
      w.assigned_to_me = chance(0.55);
    });

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
      D.hse_docs.push({ id: i + 1, ptw_id: p.id, wr_id: wrOfPtw[p.id] ? wrOfPtw[p.id].id : null, doc_type: t, file_name: (p.id + '_' + t).replace(/\s+/g, '_') + '.pdf', uploaded_by: p.applicant, date_uploaded: I(Math.min(NOW - 3600e3, Date.parse(p.date_created) + 3600e3 * ri(1, 30))), status: wp([['Valid', 75], ['Expired', 15], ['Error', 10]]) });
    }
    D.error_docs = D.hse_docs.filter((d) => d.status === 'Error').slice(0, 8).map((d, i) => ({ id: i + 1, wr_id: d.wr_id, ptw_id: d.ptw_id, file_name: d.file_name, error: pick(['File is corrupted', 'Unsupported file format', 'Virus scan failed', 'File exceeds size limit']), uploaded_by: d.uploaded_by, date_uploaded: d.date_uploaded }));

    /* ---- invoices ---- */
    D.invoices = [];
    D.wr.filter((w) => ['Completed', 'Closed'].includes(w.status) && w.date_completed).slice(0, 130).forEach((w, i) => {
      const fin = Date.parse(w.date_completed); const roAmt = w.act_cost || w.est_cost || 100; const roD = Math.min(NOW - 3600e3, fin + ri(1, 5) * DAY); const invD = Math.min(NOW - 1800e3, roD + ri(2, 15) * DAY);
      const paid = invD < NOW - 30 * DAY && chance(0.7);
      D.invoices.push({ id: i + 1, wr_id: w.id, wr_type: w.wr_type, group_code: 'GRP-0' + ri(1, 6), bpa_number: 'BPA-26-0' + ri(1, 4), release_order: 'RO-' + ri(200000, 299999), ro_date: I(roD), ro_amount: roAmt, invoice_no: 'SINV-' + ri(10000, 99999), invoice_date: I(invD), invoice_amount: Math.round(roAmt * (0.95 + rnd() * 0.05)), paid, status: paid ? 'Paid' : wp([['Draft', 1], ['Submitted', 3], ['Approved', 3]]) });
    });

    /* ---- incidents ---- */
    const ITYPES = { HS: ['OBJECT FALLING FROM HEIGHT', 'SLIP TRIP FALL', 'ELECTRIC SHOCK', 'NEAR MISS', 'VEHICLE COLLISION'], ENV: ['ENVIRONMENTAL SPILL', 'WASTE DISPOSAL VIOLATION', 'EXCESSIVE NOISE'], SEC: ['UNAUTHORISED ACCESS', 'THEFT', 'VANDALISM'], 'F&I': ['FIRE', 'FLOOD'], INF: ['IMPACT ON ASSET', 'EQUIPMENT FAILURE', 'STRUCTURAL DEFECT'] };
    const IDESC = { 'OBJECT FALLING FROM HEIGHT': 'Tool fell from scaffold platform', 'IMPACT ON ASSET': 'Equipment struck glass panel during move', 'SLIP TRIP FALL': 'Worker slipped on wet floor', FIRE: 'Small fire in waste bin', 'ELECTRIC SHOCK': 'Minor shock from damaged cable', 'VEHICLE COLLISION': 'Utility vehicle reversed into bollard', 'NEAR MISS': 'Unsecured ladder noticed before use', 'ENVIRONMENTAL SPILL': 'Oil leak from generator drip tray', 'WASTE DISPOSAL VIOLATION': 'Chemical containers left in general waste area', 'EXCESSIVE NOISE': 'Generator noise above permitted level at night', 'UNAUTHORISED ACCESS': 'Unbadged person found in plant room', THEFT: 'Tools reported missing from contractor store', VANDALISM: 'Graffiti on service yard wall', FLOOD: 'Burst pipe flooded basement corridor', 'EQUIPMENT FAILURE': 'Pump seized during operation', 'STRUCTURAL DEFECT': 'Crack noticed in external staircase' };
    const INJ_CAT = ['First Aid Case', 'Medical Treatment Case', 'Restricted Work Case', 'Lost Time Injury'];
    const INJ_AREA = ['Head', 'Hand', 'Back', 'Leg', 'Eye', 'Arm', 'Foot', 'Torso'];
    D.incidents = [];
    for (let i = 0; i < 200; i++) {
      const b = bOf[pick(bldIds)]; const age = rdays();
      let area = wp([['HS', 50], ['ENV', 16], ['SEC', 8], ['F&I', 13], ['INF', 13]]);
      let rec = chance(0.3) ? 'contractor' : pick(['supervisor', 'admin'].concat(others.map((o) => o.username)));
      let status = age > 60 ? wp([['Closed', 5], ['Approved', 4], ['Rejected', 1], ['Submitted', 1]]) : wp([['Draft', 2], ['Submitted', 5], ['Approved', 3], ['Rejected', 1], ['Closed', 1]]);
      let forceA = null;
      if (i < 2) { area = 'SEC'; rec = 'contractor'; status = i ? 'Submitted' : 'Approved'; }
      else if (i < 5) { area = 'HS'; rec = 'contractor'; status = 'Draft'; }
      else if (i < 8) { rec = i === 5 ? 'supervisor' : 'admin'; status = 'Draft'; }
      else if (i < 12) { status = 'Submitted'; forceA = ['supervisor', 'admin', 'contractor', pick(others).username]; }
      else if (i < 15) { status = 'Submitted'; forceA = ['admin', 'supervisor']; }
      const t = pick(ITYPES[area]); const dtm = ago(age); const dd = new Date(dtm);
      const person0 = area === 'HS' ? (chance(0.15) ? 'Visitor' : person().name) : (chance(0.25) ? person().name : '');
      const rp = person();
      // approver chain (1..4 distinct usernames)
      let chain = [];
      if (status !== 'Draft') {
        if (forceA) chain = forceA.slice(0, i < 12 ? 4 : 2);
        else { chain = [chance(0.7) ? pick(['supervisor', 'admin']) : pick(others).username]; const pool = ['supervisor', 'admin'].concat(others.slice(0, 4).map((o) => o.username)); for (let n = ri(0, 3); n > 0; n--) { const c = pick(pool); if (!chain.includes(c)) chain.push(c); } }
      }
      const n = chain.length; const stt = [null, null, null, null]; const comm = [null, null, null, null]; const adt = [null, null, null, null];
      let tcur = Math.min(NOW - 1800e3, dtm + ri(0, 2) * DAY + 3600e3);
      const submitted = status === 'Draft' ? null : tcur;
      const decide = (k, s, text) => { tcur = Math.min(NOW - 600e3, Math.max(tcur, dtm) + ri(1, 3) * DAY); stt[k] = s; comm[k] = text; adt[k] = I(tcur); };
      if (status !== 'Draft') {
        for (let k = 0; k < n; k++) stt[k] = 'Submitted';
        let j = 0;
        if (status === 'Approved' || status === 'Closed') j = n;
        else if (status === 'Submitted') j = forceA ? (i < 12 ? (i % 2 ? 0 : 1) : 0) : ri(0, n - 1);
        else if (status === 'Rejected') j = ri(0, n - 1);
        if (i < 2 && n < 2) j = n;
        for (let k = 0; k < j; k++) decide(k, 'Approved', pick(['Reviewed and approved.', 'Actions are adequate.', 'OK to proceed.']));
        if (status === 'Rejected') decide(j, 'Rejected', pick(['Please add the missing witness statement.', 'Location details are incomplete.', 'Description lacks root cause.']));
      }
      const allApproved = n > 0 && stt.slice(0, n).every((s) => s === 'Approved');
      if (status === 'Submitted' && allApproved) { stt[n - 1] = 'Submitted'; comm[n - 1] = null; adt[n - 1] = null; }
      const row = {
        id: 10001 + i, incident_area: area, incident_type: t, date_incident: I(dtm), time_incident: pad(dd.getHours(), 2) + ':' + pad(dd.getMinutes(), 2), recorded_by: rec, reported_by: rp.name,
        affected_person: person0, injury_category: area === 'HS' && person0 ? pick(INJ_CAT) : '', injured_area: area === 'HS' && person0 ? pick(INJ_AREA) : '',
        severity: wp([['Minor', 8], ['Moderate', 4], ['Major', 1.5], ['Critical', 0.5]]), description: IDESC[t], site_id: b.site_id, property_code: b.id, status, date_submitted: I(submitted),
        date_approved: ['Approved', 'Closed'].includes(status) ? adt[n - 1] : null, linked_sr_ids: status !== 'Draft' && chance(0.2) ? [pick(D.wr).id] : [], contractor: rec === 'contractor'
      };
      for (let k = 0; k < 4; k++) { row['approver' + (k + 1)] = chain[k] || null; row['approver' + (k + 1) + '_status'] = stt[k]; row['approver' + (k + 1) + '_comm'] = comm[k]; row['approver' + (k + 1) + '_date'] = adt[k]; }
      D.incidents.push(row);
    }
    D.incident_actions = [];
    D.incidents.filter((x) => x.status !== 'Draft' && (x.severity !== 'Minor' || chance(0.3))).slice(0, 120).forEach((x, i) => {
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

    /* ---- Workplace Services: service_requests ---- */
    D.service_requests = [];
    const SRCAT = [
      ['Temperature & HVAC', ['AC temperature too cold', 'AC unit making rattling noise', 'No airflow from diffuser', 'Thermostat screen unreadable']],
      ['Cleaning & Janitorial', ['Spill in corridor requiring mop', 'Trash bin overflow in pantry', 'Window exterior cleaning requested', 'Restroom supplies replenishment']],
      ['Keys & Access Cards', ['New staff access badge request', 'Office door lock cylinder jammed', 'Lost proximity card replacement', 'Visitor pass approval']],
      ['Electrical & Lighting', ['Ceiling LED panel flickering', 'Pantry floor socket tripping', 'Desk lamp power outlet dead', 'Motion sensor switch not activating']],
      ['Plumbing & Water', ['Pantry sink draining slowly', 'Water dispenser leaking cold water', 'Washroom faucet dripping', 'Low water pressure in Level 2 pantry']],
      ['Furniture & Ergonomics', ['Ergonomic desk chair replacement', 'Additional white board installation', 'Filing cabinet lock repair', 'Meeting room table leg unstable']]
    ];
    for (let i = 0; i < 35; i++) {
      const catPair = pick(SRCAT);
      const cat = catPair[0];
      const desc = pick(catPair[1]);
      const b = bOf[pick(bldIds)];
      const reqAge = ri(0, 45);
      const reqDate = ago(reqAge);
      let status = reqAge > 20 ? wp([['Completed', 7], ['Rejected', 1], ['In Progress', 2]]) : wp([['Requested', 4], ['In Triage', 3], ['Dispatched', 2], ['Completed', 1]]);
      const prio = wp([['1', 1], ['2', 3], ['3', 5], ['4', 1]]);
      const hasRating = status === 'Completed' && chance(0.7);
      D.service_requests.push({
        id: 8000 + i + 1,
        req_code: 'SR-2026-' + pad(i + 101, 4),
        requestor_name: i < 5 ? 'Aya Mansoor' : nm(),
        requestor_username: i < 5 ? 'employee' : 'staff.' + (i + 1),
        department: pick(['Academic Affairs', 'Student Services', 'Administration & Finance', 'Research Labs', 'Facilities Operations']),
        category: cat,
        description: desc,
        site_id: b.site_id,
        bl_id: b.id,
        fl_id: pick(['GF', 'L1', 'L2']),
        rm_id: 'Room ' + ri(101, 220),
        priority: prio,
        status: status,
        date_requested: I(reqDate),
        target_completion: I(reqDate + ri(1, 4) * DAY),
        date_completed: status === 'Completed' ? I(reqDate + ri(1, 3) * DAY) : null,
        rating: hasRating ? ri(3, 5) : null,
        feedback: hasRating ? pick(['Fixed very quickly, thank you!', 'Great communication from technician.', 'Professional work done.', 'Satisfactory service.']) : '',
        dispatched_to: status !== 'Requested' && status !== 'Rejected' ? 'SONU Contracting Services' : '',
        linked_wr_id: status === 'Dispatched' || status === 'Completed' ? pick(D.wr).id : null
      });
    }

    /* ---- Space & Campus: rooms & desks ---- */
    D.rooms = [];
    const RTYPES = [['Meeting Room', 8], ['Executive Boardroom', 20], ['Conference Hall', 35], ['Quiet Focus Room', 3], ['Computer Lab', 24], ['Open Collab Space', 12]];
    let rmSeq = 1;
    D.buildings.slice(0, 12).forEach((b) => {
      ['GF', 'L1', 'L2'].forEach((fl) => {
        for (let r = 1; r <= 3; r++) {
          const rt = pick(RTYPES);
          const rmid = b.id + '-' + fl + '-R' + pad(r, 2);
          D.rooms.push({
            id: rmid,
            bl_id: b.id,
            bl_name: b.name,
            fl_id: fl,
            room_code: fl + '-' + pad(r * 10 + 2, 3),
            name: rt[0] + ' ' + fl + '.' + r,
            rm_type: rt[0],
            capacity: rt[1],
            area_sqm: Math.round(rt[1] * (2.8 + rnd() * 1.4)),
            department: pick(D.departments).name,
            amenities: pick(['4K Display, VC, Whiteboard', 'Dual Screen, Polycom, Projector', 'Whiteboard, Screen Sharing', 'Standard Audio/Visual']),
            status: chance(0.7) ? 'Available' : 'Occupied'
          });
        }
      });
    });

    D.desks = [];
    let deskSeq = 1;
    D.buildings.slice(0, 6).forEach((b) => {
      ['GF', 'L1'].forEach((fl) => {
        for (let d = 1; d <= 4; d++) {
          const did = 'DSK-' + b.id + '-' + fl + '-' + pad(d, 2);
          D.desks.push({
            id: did,
            desk_code: 'Desk ' + fl + '.' + pad(d, 2),
            bl_id: b.id,
            bl_name: b.name,
            fl_id: fl,
            zone: 'Open Flex Zone ' + fl,
            has_dual_monitor: chance(0.7),
            has_docking_station: true,
            status: chance(0.65) ? 'Available' : pick(['Reserved', 'Occupied'])
          });
        }
      });
    });

    D.desk_bookings = [];
    for (let i = 0; i < 12; i++) {
      const d = pick(D.desks);
      const bDate = NOW + ri(-3, 10) * DAY;
      D.desk_bookings.push({
        id: i + 1,
        desk_id: d.id,
        desk_code: d.desk_code,
        bl_id: d.bl_id,
        fl_id: d.fl_id,
        date: I(bDate),
        slot: pick(['Full Day (08:00 - 17:00)', 'Morning (08:00 - 12:30)', 'Afternoon (12:30 - 17:00)']),
        booked_by: i < 3 ? 'Aya Mansoor' : nm(),
        booked_by_username: i < 3 ? 'employee' : 'staff.' + (i + 1),
        department: 'Academic Affairs',
        status: bDate < NOW ? 'Completed' : chance(0.85) ? 'Confirmed' : 'Cancelled'
      });
    }

    /* ---- Space: department allocations ---- */
    D.space_allocations = [];
    D.divisions.forEach((dv, dvi) => {
      D.departments.filter((_, di) => di % 2 === dvi % 2).slice(0, 2).forEach((dp, dpi) => {
        const b = pick(D.buildings);
        const hc = ri(15, 65);
        const area = Math.round(hc * ri(9, 14));
        D.space_allocations.push({
          id: D.space_allocations.length + 1,
          division_id: dv.id,
          division_name: dv.name,
          department_id: dp.id,
          department_name: dp.name,
          site_id: b.site_id,
          bl_id: b.id,
          bl_name: b.name,
          headcount: hc,
          allocated_area_sqm: area,
          density_sqm_per_person: +(area / hc).toFixed(1),
          utilization_pct: ri(70, 96),
          target_density: 12.0
        });
      });
    });

    /* ---- Finance & Procurement: BPA contracts & WCC certificates ---- */
    D.bpa_contracts = [
      { id: 1, bpa_number: 'BPA-26-001', title: 'Comprehensive Facilities Maintenance Agreement', vendor: 'SONU Contracting Services', total_budget: 2500000, committed_amount: 1450000, invoiced_amount: 1120000, remaining_budget: 1050000, start_date: '2026-01-01', end_date: '2026-12-31', status: 'Active' },
      { id: 2, bpa_number: 'BPA-26-002', title: 'Chiller & HVAC Overhauls Blanket Order', vendor: 'SONU Contracting Services', total_budget: 1200000, committed_amount: 780000, invoiced_amount: 540000, remaining_budget: 420000, start_date: '2026-01-01', end_date: '2026-12-31', status: 'Active' },
      { id: 3, bpa_number: 'BPA-26-003', title: 'Electrical Infrastructure & Fire Systems Support', vendor: 'SONU Contracting Services', total_budget: 950000, committed_amount: 420000, invoiced_amount: 310000, remaining_budget: 530000, start_date: '2026-03-01', end_date: '2027-02-28', status: 'Active' },
      { id: 4, bpa_number: 'BPA-26-004', title: 'Civil Repairs, Roofing & Structural Works', vendor: 'SONU Contracting Services', total_budget: 800000, committed_amount: 310000, invoiced_amount: 195000, remaining_budget: 490000, start_date: '2026-04-01', end_date: '2027-03-31', status: 'Active' }
    ];

    D.wcc = [];
    const doneWorkOrders = D.wr.filter((w) => ['Completed', 'Closed', 'Contractor Completed'].includes(w.status)).slice(0, 25);
    for (let i = 0; i < 8; i++) {
      const slice = doneWorkOrders.slice(i * 3, i * 3 + 3);
      const totalAmt = slice.reduce((acc, w) => acc + (w.act_cost || w.est_cost || 450), 0) || 12500;
      const bpa = pick(D.bpa_contracts);
      const st = wp([['Approved by Engineer', 4], ['Verified by Finance', 2], ['Submitted', 2], ['Draft', 1]]);
      D.wcc.push({
        id: 7000 + i + 1,
        wcc_number: 'WCC-2026-' + pad(i + 1, 3),
        contractor: 'SONU Contracting Services',
        bpa_number: bpa.bpa_number,
        title: 'Monthly Service Entry Sheet - ' + bpa.title.split(' ')[0] + ' ' + (i + 1),
        period_start: '2026-10-01',
        period_end: '2026-10-31',
        wr_count: slice.length || 3,
        wr_codes: slice.map((w) => String(w.id)).join(', ') || '3374175, 3374180',
        total_amount: totalAmt,
        currency: 'QAR',
        status: st,
        submitted_by: 'Ravi Menon',
        date_submitted: I(NOW - (25 - i * 2) * DAY),
        approved_by: st !== 'Draft' && st !== 'Submitted' ? 'Nadia Farouk' : null,
        date_approved: st !== 'Draft' && st !== 'Submitted' ? I(NOW - (20 - i * 2) * DAY) : null,
        verified_by: st === 'Verified by Finance' ? 'Tariq Haddad' : null,
        date_verified: st === 'Verified by Finance' ? I(NOW - (10 - i * 2) * DAY) : null,
        erp_ses_number: st === 'Verified by Finance' ? 'SES-100' + pad(i + 88, 3) : ''
      });
    }
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
    if (x.status === 401 && !/\/api\/auth\/login$/.test(url) && location.pathname !== '/' && location.pathname !== '/login') { location.replace('/'); }
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
    /* Workflow action on one record: POST /api/act/:table/:id/:action -> { row, related: { table: [rows] }, warnings: [] }.
       Updates the cache with the returned row and any related rows the server changed. Returns the row, or null on error. */
    action(t, id, name, body) {
      const r = call('POST', '/api/act/' + t + '/' + encodeURIComponent(id) + '/' + name, body || {});
      if (!r.ok) { report(r); return null; }
      const res = r.body || {};
      Object.entries(res.related || {}).forEach(([rt, rows]) => rows.forEach((row) => upsertCache(rt, row)));
      if (!res.row) return true;
      const row = DB.get(t, id);
      if (row) { Object.keys(row).forEach((k) => { if (!(k in res.row)) delete row[k]; }); return Object.assign(row, res.row); }
      return upsertCache(t, res.row);
    },
    /* Bulk action (e.g. create one PTW for several WRs): POST /api/act/:table/_bulk/:action */
    bulk(t, name, body) { return DB.action(t, '_bulk', name, body); },
    login(username, password, project) { return call('POST', '/api/auth/login', { username, password, project }); },
    logout() { return call('POST', '/api/auth/logout'); }
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = { buildSeed };
  if (typeof window !== 'undefined') { window.DB = DB; }
})();
