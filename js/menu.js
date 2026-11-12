/* SONU navigation tree: Module > Process > Task.
   Mirrors the structure observed in the reference facilities-management portal
   (4 modules, 11 processes). A task with no `view` is a group label. */
window.SONU_MENU = [
  {
    id: 'service-desk', title: 'Service Desk', icon: 'headset',
    summary: 'Self-service requests, facility inspections and permit reports.',
    processes: [
      { id: 'fi-process', title: 'Facilities Inspection Process', tasks: [
        { title: 'Workplace', view: 'workplace-catalog' },
        { title: 'Review Facilities Inspection Items', view: 'fi-review-items' },
        { title: 'Facilities Inspection Report', view: 'fi-report' },
        { title: 'Review All Facility Requests', view: 'fi-all-requests' }
      ]},
      { id: 'ptw-report-sd', title: 'PTW Report', tasks: [
        { title: 'PTW Details report', view: 'ptw-details-report' }
      ]}
    ]
  },
  {
    id: 'corrective', title: 'Corrective Maintenance', icon: 'wrench',
    summary: 'On-demand work requests, estimations, permits to work and contractor reports.',
    processes: [
      { id: 'contractor-wr', title: 'Contractor (WR)', tasks: [
        { title: 'Estimate and Schedule On Demand WRs', view: 'wr-estimate-schedule' },
        { title: 'Issue WR - Create E-PTW / Start the Work', view: 'wr-issue' },
        { title: 'Edit / Update Work Requests' },
        { title: 'Edit / Update WRs', view: 'wr-edit-update' },
        { title: 'Update WRs - Other Resources', view: 'wr-other-resources' },
        { title: 'Update WRs by Craftsperson' },
        { title: 'Update WRs - Daily Hours', view: 'wr-daily-hours' },
        { title: 'WRs Daily Hours Report', view: 'wr-daily-hours-report' },
        { title: 'Manage E-PTWs' },
        { title: 'Manage Permit to Work', view: 'ptw-manage' },
        { title: 'Manage ISO/De-ISO Requirements' },
        { title: 'Update/Complete My ISO/De-ISO Requests', view: 'iso-requests' },
        { title: 'PTW Reports' },
        { title: 'PTW Details', view: 'ptw-details-report' },
        { title: 'Checklist' },
        { title: 'Remove Error Docs', view: 'remove-error-docs' }
      ]},
      { id: 'rfe', title: 'RFE Process', tasks: [
        { title: 'RFE Post Box', view: 'rfe-post-box' },
        { title: 'Review Approved Estimations', view: 'rfe-approved' },
        { title: 'BOQ Details for BPA Release', view: 'boq-details' },
        { title: 'Pending RFE Status Report', view: 'rfe-pending-report' },
        { title: 'RFE Line Items', view: 'rfe-line-items' },
        { title: 'Approve Estimations' },
        { title: 'Estimation & Variation Approval', view: 'rfe-approval' }
      ]},
      { id: 'contractor-reports', title: 'Reports for Contractors', tasks: [
        { title: 'PTW HSE Documents', view: 'hse-documents' },
        { title: 'End to End details from WR to Invoice', view: 'e2e-wr-invoice' },
        { title: 'End to End details from PPM WR to Invoice', view: 'e2e-ppm-invoice' },
        { title: 'End to End details by Group', view: 'e2e-group-invoice' },
        { title: 'Contractor Reports' },
        { title: 'Work Requests Console - On Demand + PM', view: 'wr-console' },
        { title: 'Work Requests Performance', view: 'wr-performance' },
        { title: 'Pending Work Requests', view: 'wr-pending' },
        { title: 'Outstanding Work Requests', view: 'wr-outstanding' },
        { title: 'Forecast and Execution Report', view: 'pm-forecast' },
        { title: 'Equipment List', view: 'equipment-list' },
        { title: 'Planned Preventive Maintenance Activities', view: 'ppm-activities' },
        { title: 'Outstanding Work Requests Chart', view: 'wr-outstanding-chart' },
        { title: 'On Demand Work Requests Status Count', view: 'wr-status-count' },
        { title: 'PM Work Requests Status Count', view: 'pm-status-count' },
        { title: 'SR Satisfaction Survey Report', view: 'survey-report' },
        { title: 'Work Requests Performance - OD', view: 'wr-performance-od' },
        { title: 'Work Requests Performance - PPM', view: 'wr-performance-ppm' },
        { title: 'Review Work Requests', view: 'wr-review' },
        { title: 'PPM/CM Task List Action Report', view: 'checklist-answers' },
        { title: 'PPM/CM Task List Action Report Summary', view: 'checklist-summary' }
      ]},
      { id: 'permit-requestor', title: 'Permit Requestor - Without WR', tasks: [
        { title: 'PTW HSE Documents', view: 'hse-documents' },
        { title: 'Request PTW' },
        { title: 'Request Permit to Work', view: 'ptw-create' },
        { title: 'Manage PTWs' },
        { title: 'Manage My PTWs (My Pool)', view: 'ptw-my-pool' },
        { title: 'Permits for Closure' },
        { title: 'PTWs Without WR for Closure', view: 'ptw-closure' }
      ]},
      { id: 'ptw-reports', title: 'PTW Reports', tasks: [
        { title: 'Controlling' },
        { title: 'Valid vs. Expired Permits', view: 'ptw-valid-expired' },
        { title: 'Rejected Permits', view: 'ptw-rejected' },
        { title: 'Trends and KPIs' },
        { title: 'Applicant Evaluation', view: 'ptw-applicant-eval' },
        { title: 'Average Speed of Permit Processing', view: 'ptw-processing-speed' },
        { title: 'Monthly Reports' },
        { title: 'Issued Permits', view: 'ptw-issued-monthly' },
        { title: 'Closed Permits', view: 'ptw-closed-monthly' },
        { title: 'Totals' },
        { title: 'View All Permits by Status', view: 'ptw-by-status' },
        { title: 'Permit by Status by Site', view: 'ptw-by-status-site' },
        { title: 'PTW Details', view: 'ptw-details-report' },
        { title: 'Permit to Work Log', view: 'ptw-log' }
      ]},
      { id: 'erp-reports', title: 'Release Order, Invoice and Costing Reports', tasks: [
        { title: 'ERP Reports' },
        { title: 'Release Orders & Invoices', view: 'erp-invoices' }
      ]}
    ]
  },
  {
    id: 'preventive', title: 'Preventive Maintenance', icon: 'gears',
    summary: 'Planned preventive maintenance work requests and permits.',
    processes: [
      { id: 'contractor-ppm', title: 'Contractor (PPM)', tasks: [
        { title: 'Issue WR - Create E-PTW / Start Work', view: 'pm-issue' },
        { title: 'Edit / Update Work Requests' },
        { title: 'Edit / Update WRs', view: 'pm-edit-update' },
        { title: 'Update WRs - Other Resources', view: 'pm-other-resources' },
        { title: 'Manage E-PTWs' },
        { title: 'Manage Permit to Work', view: 'ptw-manage' },
        { title: 'Manage ISO/De-ISO Requirements' },
        { title: 'Update/Complete My ISO/De-ISO Requests', view: 'iso-requests' },
        { title: 'PTW Reports' },
        { title: 'PTW Details', view: 'ptw-details-report' },
        { title: 'Checklist' },
        { title: 'Remove Error Docs', view: 'remove-error-docs' }
      ]}
    ]
  },
  {
    id: 'hse', title: 'Health & Safety', icon: 'plus',
    summary: 'Incident reporting and corrective action items.',
    processes: [
      { id: 'incident-contractor', title: 'Incident Reporting - Contractor', tasks: [
        { title: 'View All Incident Reports - Contractor', view: 'incidents' }
      ]},
      { id: 'incident-actions', title: 'Incident Report Action Items', tasks: [
        { title: 'Action Items', view: 'incident-actions' }
      ]}
    ]
  },
  {
    id: 'admin', title: 'Administration', icon: 'shield', adminOnly: true,
    summary: 'Users, security, sessions and reference data.',
    processes: [
      { id: 'admin-security', title: 'Users & Security', tasks: [
        { title: 'Admin Dashboard', view: 'admin-dashboard' }, { title: 'User Accounts', view: 'admin-users' },
        { title: 'Active Sessions', view: 'admin-sessions' }, { title: 'Activity Log', view: 'audit-log' } ] },
      { id: 'admin-reference', title: 'Reference Data', tasks: [
        { title: 'Sites', view: 'admin-sites' }, { title: 'Buildings', view: 'admin-buildings' }, { title: 'Floors', view: 'admin-floors' },
        { title: 'Trades / Problem Types', view: 'admin-trades' }, { title: 'Work Teams', view: 'admin-work-teams' }, { title: 'Craftspersons', view: 'admin-craftspersons' } ] }
    ]
  }
];
