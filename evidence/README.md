# Evidence — how the reference portal works

**Reference:** `https://marafiq.qf.org.qa` — *ARCHIBUS Web Central* (Integrated Workplace Management System), project **MARAFIQ**.
**Captured:** 2026-11-12, read-only, using the user's own signed-in session in the Claude browser pane. Nothing was added, updated or deleted on the live system.

> ⚠️ `screenshots/` contains real data from the live system (names, building codes). It is git-ignored — keep it private and do not publish it.

## 1. Technology (observed)

| Item | Evidence |
|---|---|
| Product | ARCHIBUS Web Central (page title "ARCHIBUS Web Central"); URLs end in `.axvw` (ARCHIBUS view files) |
| Login | `/archibus/login.axvw` — Project dropdown (`MARAFIQ` = value `HQ-Oracle`), Username, Password (case-sensitive), Remember Me, Sign In → screenshot `01-login.jpg` |
| Shell | `/archibus/schema/ab-core/views/navigator/ab-navigator.axvw` — ExtJS + Backbone "Navigator" (`AbNavigator` global), views load in iframe `viewContent_iframe` |
| Navigation data | Loaded from DB tables `afm_activities` (modules) → `afm_processes` (processes, per role `afm_roleprocs` / user `afm_userprocs`) → `afm_ptasks` (tasks: `task_type` = `WEB URL` or `LABEL`, `task_file` = view) |
| Home page | `qf-ab-rplm-pfadmin-gpd-gis-map.axvw` — Esri GIS map of buildings |
| Database | Oracle (project value `HQ-Oracle`) |
| Analytics / monitoring | Segment analytics, Dynatrace RUM agent |
| Theme | `ab-core-slate.css` — navy sidebar, light-grey panel headers, sky-blue panel bars on home |

## 2. Shell / UI pattern
- **Left sidebar:** logo, *Search*, *Favorites*, then modules. Clicking a module opens a "Browse all" drawer with its processes (yellow square icon); clicking a process opens a third panel with its tasks (blue grid icon). `LABEL` tasks act as group headings. Collapse arrow at the bottom → `03-menu-service-desk.jpg`, `04-menu-ptw-report.jpg`
- **Top-right:** organisation logo, Help (?), user menu.
- **Home** → `02-home-dashboard.jpg`: CITY / SITE / BUILDING filters + orange *Filter*, *My Building*; shortcut buttons *QF Map*, *Workplace*, *FI Dashboard*, *WR Dashboard*; **Buildings** map panel; **"We Are Waiting to hear from you"** panel (pending satisfaction surveys).
- **Standard view layout:** title + print/e-mail icons → *Filter* panel (*Show*, *Clear*; date fields have presets Today / This Week / This Month / This Year / Last Week / Last Month / Last Year / Date Range with From–To) → grid panel (*Refresh*, *XLS*, per-column filter boxes under headers, sortable headers, row links like *Details*, quick index bar e.g. `Code: 7 27  8 935  All 962`, *Previous / Page x of y / Next*).
- **Workflow views** are tabbed: first tab *Select* (grid), later tabs need a selected record (greyed until then).

## 3. Full menu for this account (4 modules · 11 processes · ~70 tasks)

### Service Desk
- **Facilities Inspection Process:** Workplace (service catalog) · Review Facilities Inspection Items · Facilities Inspection Report · Review All Facility Requests
- **PTW Report:** PTW Details report

### Corrective Maintenance
- **Contractor (WR):** Estimate and Schedule On Demand WRs · Issue WR – Create E-PTW / Start the Work · *[Edit/Update Work Requests]* Edit / Update WRs · Update WRs – Other Resources · *[Update WRs by Craftperson]* Update WRs – Daily hours · WRs Daily Hours Report · *[Manage E-PTWs]* Manage Permit to Work · *[Manage ISO/De-ISO Requirements]* Update/Complete My ISO/De-ISO Requests · *[PTW Reports]* PTW Details · *[Checklist]* Remove Error Docs
- **RFE Process:** RFE Post Box · Review Approved Estimations · BOQ Details for BPA Release · Pending RFE Status Report · RFE Line Items · *[Approve Estimations]* Estimation & Variation Approval
- **Reports for Contractors:** PTW HSE Documents · End to End details from WR to Invoice · …from PPM WR to Invoice · …by group · Work Requests Console – On Demand + PM · Work Requests Performance · Pending Work Requests · Outstanding Work Requests · Forecast And Execution Report · Equipment List · Planned Preventive Maintenance Activities · Outstanding Work Requests Chart · On Demand WR Status Count · PM WR Status Count · SR Satisfaction Survey Report · WR Performance-OD · WR Performance-PPM · Review Work Requests · PPM/CM Task list action Report (+ summary)
- **Permit Requestor – Without WR:** PTW HSE Documents · *[Request PTW]* Request Permit to Work · *[Manage PTWs]* Manage My PTWs (My Pool) · *[Permits for Closure]* PTWs Without WR for Closure
- **PTW Reports:** *[Controlling]* Valid vs. Expired Permits · Rejected permits · *[Trends and KPIs]* Applicant evaluation · Average speed of permit processing · *[Monthly reports]* Issued permits · Closed permits · *[Totals]* View all permits by status · Permit by status by site · PTW Details · Permit to Work Log
- **Rel Order, Invoice and costing reports:** *[ERP Reports]*

### Preventive Maintenance
- **Contractor (PPM):** Issue WR – Create E-PTW/Start Work · Edit / Update WRs · Update WRs – Other Resources · Manage Permit to Work · Update/Complete My ISO/De-ISO Requests · PTW Details · Remove Error Docs

### Health & Safety
- **Incident Reporting-Contractor:** View all Incident Reports-Contractor
- **Incident Report Action Items:** Action Items

*(Italic bracketed items are `LABEL` group headings. User-specific duplicate tasks were omitted.)*

## 4. Pages inspected (screenshots)

| # | Page | What it shows |
|---|---|---|
| 05 | Review Work Requests | Filter with 5 date-range filters + WR Status / Work Team; 30+ column grid (Action Item Id, Requestor, Site/Building, Problem Type, Priority, Status, WR Code, target/complete dates, Work Team, Equipment, PTW Ref/Status, Completion Feedback) |
| 06 | View PTW Request (Manage PTW) | Tabs Select · PTW Details · PTW History · Original Work Requests · ISO/De-ISO · Communication; red/orange/blue legend (expired / expiring < 2 days / stopped by authority); "Who Are You?" filter; ~10 filters; index bar; paging |
| 07 | Create Permit to Work (PD) | Tabs PTW Request · PTW Details · PTW Request Details; sections Requestor (Project Code*, phone, requested by, position) · Work Location (Site*, Building, Floor, Suite, Room) · Description (Request Type "SERVICE DESK - PTW", Description*) |
| 08 | Estimate and Schedule Work Requests | Tabs Select · Details · Estimate · Schedule; 15 filters incl. "With RFE?"; selectable grid; *Create PTW* toolbar; green "assigned to you as substitute" legend; row links Details / Estimate/Schedule |
| 09 | Review Pending RFEs for Action | "RFE Pending For Action" checkbox; Other Resources Log grid (green rows) with View / Add Comment / Done? |
| 10 | Permit by status by site | Site Code + Zone Name filters; horizontal stacked bar (status × site) |
| 11 | Track Incidents | Incidents grid with index bar, Details link |
| 12 | On Demand WR Status Report | Filter + tabs: No. of WRs · Bar Chart · Stacked Bar Chart · Status of Open WRs |
| 13 | Update daily labor hours | Craftsperson / Site / Primary Trade / Date Scheduled / Building filter |
| 14 | Facility Inspection | "Service Request Details" with Group-by |

## 5. Business workflow (derived)
Service request / inspection finding → **Work Request (WR)** (On-Demand or PPM) → contractor **Estimate & Schedule** → extra cost via **RFE / Other Resources** → client **Estimation & Variation Approval** → **Issue WR + E-PTW** (Permit to Work, with HSE documents and **ISO/De-ISO** isolations) → **daily labour hours** → **Contractor Completed** → verification / close → **satisfaction survey** → **BPA release order → invoice** (ERP). In parallel: **PTW reports/KPIs** and **Health & Safety incidents + action items**.

## 6. REA analysis (rea-agents 6.9.0)
REA attached read-only over CDP to a separate Chrome profile in which the user signed in. Raw outputs are in `rea/`, which is git-ignored.

| REA command | Result |
|---|---|
| `list-browser-targets` | 1 page target: `ab-navigator.axvw` (Chrome 157) |
| `inspect-web-page` (sources, JSON shapes, storage key names) | 45 scripts, 86 resources. Storage keys only (values redacted): Segment `ajs_*` in localStorage and Dynatrace `rx*`/`dt*` in sessionStorage. No idle network traffic |
| `analyze-web-bundle` | No REST routes. The data access candidates are ARCHIBUS DataSources (`tasksItemsDataSource`, `processesItemsDataSource`, `searchItemsDataSource`, `shortcutsItemsDataSource`, …). `ab-core.js` (1.7 MB) hit REA's 30 s per-script limit |
| `observe-web-session` (3 min, then 5 min) | Both timelines were empty. This tool records only top-level navigation metadata, with no headers or bodies. ARCHIBUS opens every task inside the `viewContent_iframe` frame while the top-level URL stays on `ab-navigator.axvw`, so page changes inside the portal are invisible to it |

**Backend surface (from the DWR interface scripts REA captured).** The portal has no REST API. The browser calls Java services through **DWR (Direct Web Remoting)** at `/archibus/dwr/…`:
- **SecurityService:** `login`, `loginDo`, `logout`, `getProjects`, `changePassword`, `resetPassword`, `requestPasswordReset`, `requestNewPassword`, `isPasswordResetPermitted`, `isGuestAccountPermitted`, `startSsoUserSession`, `getLocales`, `setLocale`
- **workflow:** `runWorkflowRule(ruleId, params)` and `runWorkflowRuleInContext`. Every DataSource read or save and every business action is a server-side "workflow rule"
- **AdminService:** `getUser`, `getAllUserSessions`, `terminateUserSessions`, `isUserMemberOfGroup`, `flushCachedUserRoles`, `loadLocalizedStrings`, `getProgramLicense`
- **DocumentService:** `checkinNewFile`, `checkinNewVersion`, `checkOut`, `show`, `getImage`, `markDeleted`, `changeLockStatus`, `copyDocument` (document management with versions and locks)
- **DrawingBimService:** BIM/Revit file upload and highlight colours (not used by contractor pages)

**How SONU's backend mirrors this.** DWR RPC is replaced with a small REST API. Each server-side workflow rule becomes a per-table business rule in `server/server.js` (validation, status transitions with history, role checks, derived fields). Session login follows SecurityService. The audit log stands in for ARCHIBUS's server-side tracking.

## 7. How SONU maps to it
SONU (`index.html`, `app.html`) reproduces the shell, the full menu tree, the filter/grid/tab/chart/form patterns and the workflow above with its **own branding, colours, logo and fictional data**. No logos, photos, text content or records from the reference system were copied.
