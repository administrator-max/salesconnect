<?php
// Akses dikunci per dashboard: hanya orang yang terdaftar untuk modul ini
// di lib/access.php yang boleh membuka halaman ini.
require_once __DIR__ . '/../lib/tool_guard.php';
sc_require_tool('crmproject');
$sc_u = sc_user();
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Gunung Prisma — CRM Dashboard 2026</title>
<link rel="stylesheet" href="css/styles.css?v=<?= @filemtime(__DIR__ . '/css/styles.css') ?: '1' ?>">
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<?= sc_session_watch() ?>
<script>window.SC_USER = <?= json_encode(['name' => $sc_u['name'], 'email' => $sc_u['email']], JSON_UNESCAPED_UNICODE) ?>;</script>
</head>
<body>

<!-- HEADER -->
<header class="header">
  <div class="header-logo">
    <div class="logo-icon">
      <svg viewBox="0 0 38 38" fill="none">
        <polygon points="19,4 34,32 4,32"  fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5"/>
        <polygon points="19,10 30,32 8,32"  fill="rgba(255,255,255,0.15)"/>
        <polygon points="19,10 27,28 11,28" fill="rgba(232,160,32,0.6)"/>
        <polygon points="19,16 25,28 13,28" fill="rgba(232,160,32,0.9)"/>
      </svg>
    </div>
    <div>
      <div class="header-title">Gunung <span>Prisma</span></div>
      <div class="header-sub">CRM Intelligence Dashboard · v2</div>
    </div>
  </div>
  <div class="hbadge" style="display:flex;align-items:center;gap:12px;">
    <span class="bdate" id="headerDate">📅 Mar 2026</span>
    <div class="blive"><span class="dot"></span>Live</div>
    <a href="../" style="text-decoration:none;color:#fff;font-weight:600;font-size:12px;padding:5px 10px;border:1px solid rgba(255,255,255,0.35);border-radius:8px;background:rgba(255,255,255,0.12);">🏠 SalesConnect</a>
    <div id="userBadge" style="display:flex;align-items:center;gap:8px;background:rgba(255,255,255,0.12);border-radius:10px;padding:5px 12px;">
      <span style="font-size:13px;font-weight:600;color:#fff;" id="userBadgeName">👤 <?= htmlspecialchars($sc_u['name']) ?></span>
      <a href="../logout.php" title="Logout" style="background:rgba(255,255,255,0.2);border:none;border-radius:7px;color:#fff;cursor:pointer;font-size:11px;font-weight:600;padding:3px 8px;font-family:'DM Sans',sans-serif;text-decoration:none;">Logout</a>
    </div>
  </div>
</header>

<!-- NAV -->
<nav class="nav-tabs">
  <div class="tab active" onclick="showPage('p1')" id="tab-p1"><span>🗺️</span> Market Blueprint</div>
  <div class="tab" onclick="showPage('p2')" id="tab-p2"><span>🔩</span> Product Grade</div>
  <div class="tab" onclick="showPage('p3')" id="tab-p3"><span>📊</span> Sales Pipeline</div>
  <div class="tab" onclick="showPage('p4')" id="tab-p4"><span>🤝</span> Customer List</div>
  <div class="tab" onclick="showPage('px')" id="tab-px"><span>🏭</span> Supplier List</div>
  <div class="tab" onclick="showPage('p5')" id="tab-p5"><span>📋</span> Sales Activity</div>
  <div class="tab" onclick="showPage('cn')" id="tab-cn"><span>🇨🇳</span> Chinese Project</div>
</nav>

<div class="main">

<!-- ═══════════════════════════════════
     P1 — MARKET BLUEPRINT
═══════════════════════════════════ -->
<div class="page active" id="page-p1">
  <div class="ph">
    <div>
      <div class="pt">Market Blueprint</div>
      <div class="ps">Wear resistance steel supply chain — Indonesia market intelligence 2024</div>
    </div>
  </div>

  <!-- 6 KPI cards -->
  <div class="mgrid" style="grid-template-columns:repeat(6,1fr);">
    <div class="mc"><div class="micon">🌐</div><div class="mlbl">Global Mfr.</div><div class="mval" id="mc-global-mfr">—</div><div class="msub">Brands tracked</div></div>
    <div class="mc"><div class="micon">🇨🇳</div><div class="mlbl">China Mfr.</div><div class="mval" id="mc-china-mfr">—</div><div class="msub">Mills in China</div></div>
    <div class="mc accent"><div class="micon">🚢</div><div class="mlbl">Trading Offices</div><div class="mval" id="mc-trading-offices">—</div><div class="msub" id="mc-trading-vol">— MT total vol.</div></div>
    <div class="mc teal"><div class="micon">🏗️</div><div class="mlbl">OEM / Fab / Distr.</div><div class="mval sm" id="mc-stockist-counts">—/—/—</div><div class="msub" id="mc-stockist-sub">Loading…</div></div>
    <div class="mc success"><div class="micon">🚜</div><div class="mlbl">HE Suppliers</div><div class="mval" id="mc-he-count">—</div><div class="msub" id="mc-he-ow">OW — MT</div></div>
    <div class="mc danger"><div class="micon">⛏️</div><div class="mlbl">Project Owners</div><div class="mval" id="mc-project-owners">—</div><div class="msub">Mining end-users</div></div>
  </div>

  <!-- Cluster 1: Supply Side -->
  <div class="cluster-header">
    <div class="cluster-pill" style="background:var(--primary);">⚙️ Cluster 1 — Supply Side</div>
    <div class="cluster-line" style="background:linear-gradient(90deg,var(--primary),transparent);"></div>
    <div class="cluster-desc">Global Manufacturer + Chinese Manufacturer → Trading Office</div>
  </div>
  <div class="g2" style="margin-bottom:20px;">
    <div class="card">
      <div class="ch"><div class="ct"><div class="ci">🌐</div>Global Manufacturers — 19 Brands</div><span style="font-size:11px;color:var(--text-muted);">Europe · Asia · Australia</span></div>
      <div class="cb"><div class="mfg" id="mfrGrid"><div class="loader-wrap"><div class="loader"></div></div></div></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct"><div class="ci">🇨🇳</div>Chinese Manufacturers — 8 Mills</div><span style="font-size:11px;color:var(--text-muted);">NM Brand Source</span></div>
      <div class="cb np"><table class="dt"><thead><tr><th>#</th><th>Brand</th><th>Mill Name</th><th>City / Province</th></tr></thead><tbody id="chinaMfrBody"></tbody></table></div>
    </div>
  </div>

  <!-- Trading Offices -->
  <div class="card" style="margin-bottom:28px;">
    <div class="ch"><div class="ct"><div class="ci">📦</div>Trading Office — Market Share by Volume (MT) · 2024</div><span style="font-size:11px;color:var(--text-muted);">19 offices · Indonesia</span></div>
    <div class="cb" id="tradingBars"><div class="loader-wrap"><div class="loader"></div></div></div>
  </div>

  <!-- Cluster 2: Stockist -->
  <div class="cluster-header">
    <div class="cluster-pill" style="background:var(--teal);">🏗️ Cluster 2 — Stockist Fabrication</div>
    <div class="cluster-line" style="background:linear-gradient(90deg,var(--teal),transparent);"></div>
    <div class="cluster-desc">OEM + Fabricator + Distributor</div>
  </div>
  <div class="g3" style="margin-bottom:28px;">
    <div class="card">
      <div class="ch"><div class="ct"><div class="ci">🏭</div>OEM Stockist</div><span style="font-size:11px;font-weight:700;color:var(--teal);" id="mc-oem-total">— MT</span></div>
      <div class="cb np"><table class="dt"><thead><tr><th>#</th><th>Company</th><th>Location</th><th class="num">Vol (MT)</th><th>Size</th><th>Remarks</th><th>API</th></tr></thead><tbody id="stockOEMBody"></tbody></table></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct"><div class="ci">🔧</div>Fabricators</div><span style="font-size:11px;font-weight:700;color:var(--teal);" id="mc-fab-total">— MT</span></div>
      <div class="cb np"><table class="dt"><thead><tr><th>#</th><th>Company</th><th>Location</th><th class="num">Vol (MT)</th><th>Size</th><th>Remarks</th><th>API</th></tr></thead><tbody id="stockFabBody"></tbody></table></div>
    </div>
    <div class="card">
      <div class="ch"><div class="ct"><div class="ci">🏪</div>Distributors</div><span style="font-size:11px;font-weight:700;color:var(--teal);" id="mc-dist-total">— MT</span></div>
      <div class="cb np"><table class="dt"><thead><tr><th>#</th><th>Company</th><th>Location</th><th class="num">Vol (MT)</th><th>Size</th><th>Remarks</th><th>API</th></tr></thead><tbody id="stockDistBody"></tbody></table></div>
    </div>
  </div>

  <!-- Cluster 3: Demand -->
  <div class="cluster-header">
    <div class="cluster-pill" style="background:var(--accent);">🚜 Cluster 3 — Demand Side</div>
    <div class="cluster-line" style="background:linear-gradient(90deg,var(--accent),transparent);"></div>
    <div class="cluster-desc">Heavy Equipment Supplier → Project Owner (End User)</div>
  </div>
  <div class="card" style="margin-bottom:20px;">
    <div class="ch"><div class="ct"><div class="ci">🚜</div>Heavy Equipment Suppliers — OW &amp; WRP Demand Estimate</div><span style="font-size:11px;font-weight:700;color:var(--success);">Est. WRP 36,904 MT/yr</span></div>
    <div class="cb np"><table class="dt">
      <thead><tr><th>#</th><th>Company</th><th>Brand</th><th>Common Size</th><th>Vehicle Type</th><th class="num">Est. Units (2024)</th><th class="num">OW/Unit (MT)</th><th class="num">Total OW (MT)</th><th class="num">WRP Est. 8%</th></tr></thead>
      <tbody id="heDemandBody"></tbody>
    </table></div>
  </div>
  <div class="card">
    <div class="ch"><div class="ct"><div class="ci">⛏️</div>Project Owners — Mining End-Users</div></div>
    <div class="cb np"><table class="dt">
      <thead><tr><th>ID</th><th>Company</th><th>Site / Mine</th><th>Common Size</th><th>WRP Application Breakdown</th></tr></thead>
      <tbody id="projectOwnersBody"></tbody>
    </table></div>
  </div>
</div><!-- end page-p1 -->

<!-- ═══════════════════════════════════
     P2 — PRODUCT GRADE
═══════════════════════════════════ -->
<div class="page" id="page-p2">
  <div class="ph"><div><div class="pt">Product Grade Portfolio</div><div class="ps">Wear resistance steel — 14 product grades across 3 technology categories</div></div></div>
  <div class="mgrid" style="grid-template-columns:repeat(3,1fr);">
    <div class="mc"><div class="micon">🛡️</div><div class="mlbl">Wear Resistance (WR)</div><div class="mval" id="mc-wr-count">—</div><div class="msub">HB 400·450·500·550 + CRB 4800·8000</div></div>
    <div class="mc teal"><div class="micon">⚙️</div><div class="mlbl">High Strength (HiS)</div><div class="mval" id="mc-his-count">—</div><div class="msub">S690Q + S890Q — TMCP HSLA</div></div>
    <div class="mc accent"><div class="micon">🔩</div><div class="mlbl">Chromium Carbide (CCO)</div><div class="mval" id="mc-cco-count">—</div><div class="msub">3on3 · 4on6 · 5on8 · 6on8 · 8on10 · 12on12</div></div>
  </div>
  <div class="g2">
    <div class="card">
      <div class="ch"><div class="ct"><div class="ci">🛡️</div>Wear Resistance — WR Series</div></div>
      <div class="cb"><div class="pgrid" id="wrList"><div class="loader-wrap"><div class="loader"></div></div></div></div>
    </div>
    <div style="display:flex;flex-direction:column;gap:20px;">
      <div class="card">
        <div class="ch"><div class="ct"><div class="ci">⚙️</div>High Strength — HiS Series</div></div>
        <div class="cb"><div class="pgrid" id="hisList"><div class="loader-wrap"><div class="loader"></div></div></div></div>
      </div>
      <div class="card">
        <div class="ch"><div class="ct"><div class="ci">🔩</div>Chromium Carbide Overlay — CCO Series</div></div>
        <div class="cb"><div class="pgrid" id="ccoList"><div class="loader-wrap"><div class="loader"></div></div></div></div>
      </div>
    </div>
  </div>
</div><!-- end page-p2 -->

<!-- ═══════════════════════════════════
     P3 — SALES PIPELINE
═══════════════════════════════════ -->
<div class="page" id="page-p3">
  <div class="ph">
    <div><div class="pt">Sales Pipeline</div><div class="ps">Active opportunities &amp; revenue forecast — 2025–2026</div></div>
    <button class="btn btn-primary" onclick="openAddPipeline()">+ Add Opportunity</button>
  </div>

  <div class="mgrid" style="grid-template-columns:repeat(5,1fr);">
    <div class="mc teal"><div class="micon">📋</div><div class="mlbl">Total Inquiry</div><div class="mval" id="mc-total-deals">—</div><div class="msub" id="mc-deals-sub">— Active · — Lost</div></div>
    <div class="mc success"><div class="micon">💰</div><div class="mlbl">Active Inquiry</div><div class="mval xs" id="mc-pipeline-rev">—</div><div class="msub">Quotation stage</div></div>
    <div class="mc accent"><div class="micon">📈</div><div class="mlbl">Active Margin</div><div class="mval xs" id="mc-pipeline-margin">—</div><div class="msub" id="mc-avg-margin-sub">Avg margin —%</div></div>
    <div class="mc"><div class="micon">🎯</div><div class="mlbl">Weighted Inquiry</div><div class="mval xs" id="mc-weighted-pipeline">—</div><div class="msub">Prob-adjusted forecast</div></div>
    <div class="mc danger"><div class="micon">❌</div><div class="mlbl">Lost Inquiry</div><div class="mval xs" id="mc-lost-revenue">—</div><div class="msub" id="mc-lost-sub">— deals</div></div>
  </div>

  <!-- ROW 1: Funnel + Owner Performance side by side -->
  <div class="g2" style="margin-bottom:20px;">

    <!-- Pipeline Funnel -->
    <div class="card">
      <div class="ch"><div class="ct"><div class="ci">🔀</div>Pipeline Funnel</div></div>
      <div class="cb">
        <div id="funnelActive"><div class="loader-wrap"><div class="loader"></div></div></div>
        <div style="margin-top:14px;padding:12px;background:var(--surface2);border-radius:8px;">
          <div style="font-size:11px;font-weight:600;color:var(--text-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px;">Stage Win Probability Reference</div>
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;font-size:12px;">
            <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--surface);border-radius:5px;border:1px solid var(--border);">
              <span>Inquiries</span><span style="font-weight:700;color:var(--text-muted);">10%</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--surface);border-radius:5px;border:1px solid var(--border);">
              <span>Qualified Leads</span><span style="font-weight:700;color:var(--text-muted);">25%</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--surface);border-radius:5px;border:1px solid var(--border);">
              <span>Technical Discussion</span><span style="font-weight:700;color:var(--text-muted);">50%</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--surface);border-radius:5px;border:1px solid var(--border);">
              <span>Quotation</span><span style="font-weight:700;color:var(--text-secondary);">60%</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 8px;background:var(--surface);border-radius:5px;border:1px solid var(--border);">
              <span>Negotiation</span><span style="font-weight:700;color:var(--primary);">85%</span>
            </div>
            <div style="display:flex;justify-content:space-between;padding:4px 8px;background:#E8F5E9;border-radius:5px;border:1px solid #A5D6A7;">
              <span>Won</span><span style="font-weight:700;color:var(--success);">100%</span>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sales Person Performance -->
    <div class="card">
      <div class="ch"><div class="ct"><div class="ci">👤</div>Sales Person Performance — Active Pipeline</div></div>
      <div class="cb" id="ownerPerf"><div class="loader-wrap"><div class="loader"></div></div></div>
    </div>

  </div>

  <!-- ROW 2: 3 charts in equal columns -->
  <div class="g3" style="margin-bottom:20px;">

    <!-- Inquiry by Customer (horizontal bar) -->
    <div class="card">
      <div class="ch">
        <div class="ct"><div class="ci">📊</div>Inquiry by Customer</div>
        <span style="font-size:11px;color:var(--text-muted);">Active pipeline only</span>
      </div>
      <div class="cb">
        <div style="position:relative;height:260px;"><canvas id="customerRevChart"></canvas></div>
        <div id="customerRevDetail" style="margin-top:12px;"></div>
      </div>
    </div>

    <!-- Inquiry by Payment Term (doughnut) -->
    <div class="card">
      <div class="ch">
        <div class="ct"><div class="ci">💳</div>Inquiry by Payment Term</div>
        <span style="font-size:11px;color:var(--text-muted);">Active pipeline only</span>
      </div>
      <div class="cb">
        <div style="position:relative;height:200px;"><canvas id="paymentChart"></canvas></div>
        <div id="paymentDetail" style="margin-top:12px;"></div>
      </div>
    </div>

    <!-- Inquiry Split by Person (doughnut) -->
    <div class="card">
      <div class="ch">
        <div class="ct"><div class="ci">🥧</div>Inquiry Split by Person</div>
        <span style="font-size:11px;color:var(--text-muted);">Active pipeline only</span>
      </div>
      <div class="cb">
        <div style="position:relative;height:200px;"><canvas id="ownerChart"></canvas></div>
        <div id="ownerDetail" style="margin-top:12px;"></div>
      </div>
    </div>

  </div>

  <div class="card">
    <div class="ch">
      <div class="ct"><div class="ci">📋</div>All Opportunities</div>
      <span id="tableCount" style="font-size:12px;color:var(--text-muted);"></span>
    </div>
    <div class="cb">
      <div class="tc">
        <div class="sw"><span class="si">🔍</span><input type="text" class="sbox" id="pipelineSearch" placeholder="Search customer, product, location…" oninput="filterPipeline()"></div>
        <select class="fsel" id="stageFilter" onchange="filterPipeline()">
          <option value="">All Stages</option>
          <option value="Quotation">Quotation</option>
          <option value="Lost">Lost</option>
        </select>
        <select class="fsel" id="ownerFilter" onchange="filterPipeline()">
          <option value="">All Persons</option>
        </select>
      </div>
      <div class="tscroll">
        <table class="dt">
          <thead><tr>
            <th>Date</th><th>Customer</th><th>Location</th><th>Product</th>
            <th class="num">Vol (Kg)</th><th class="num">Revenue</th><th class="num">Margin</th><th class="num">M%</th>
            <th>Source</th><th>Pay</th><th>Stage</th><th>Prob</th><th>Person</th><th>Close</th><th>Notes</th><th>Attach</th><th>Action</th><th></th>
          </tr></thead>
          <tbody id="pipelineTbody"></tbody>
        </table>
      </div>
    </div>
  </div>
</div><!-- end page-p3 -->

<!-- ═══════════════════════════════════
     P4 — CUSTOMER RELATIONSHIP
═══════════════════════════════════ -->
<div class="page" id="page-p4">
  <div class="ph"><div><div class="pt">Customer List</div><div class="ps" id="p4-subtitle">25 active CRM accounts — ongoing inquiries, contacts &amp; next steps</div></div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-ghost" onclick="exportCustomers()" title="Export ke CSV">⬇️ Export CSV</button>
      <button class="btn btn-primary" onclick="openAddInquiry()">+ Add Inquiry</button>
    </div>
  </div>
  <div class="mgrid" style="grid-template-columns:repeat(4,1fr);">
    <div class="mc"><div class="micon">🤝</div><div class="mlbl">Total Accounts</div><div class="mval" id="mc-crm-accounts">—</div><div class="msub">Active CRM contacts</div></div>
    <div class="mc teal"><div class="micon">🔍</div><div class="mlbl">On-going Inquiry</div><div class="mval" id="mc-crm-inquiries">—</div><div class="msub">Active relationship mgmt</div></div>
    <div class="mc accent"><div class="micon">📋</div><div class="mlbl">Manage Eproc</div><div class="mval" id="mc-crm-eproc">—</div><div class="msub" id="mc-crm-eproc-names">Eproc tracked</div></div>
    <div class="mc success"><div class="micon">🔗</div><div class="mlbl">Pipeline Linked</div><div class="mval" id="mc-crm-linked">—</div><div class="msub">Accounts with active deals</div></div>
  </div>
  <div id="crmCards"><div class="loader-wrap"><div class="loader"></div></div></div>
  <div class="card" style="margin-top:20px;">
    <div class="ch"><div class="ct"><div class="ci">🔗</div>Pipeline Connection</div></div>
    <div class="cb np"><table class="dt">
      <thead><tr><th>Account</th><th>Pipeline Deals</th><th class="num">Active Revenue</th><th class="num">Active Margin</th><th>Stage</th><th>Action</th></tr></thead>
      <tbody id="crmPipelineTable"></tbody>
    </table></div>
  </div>
</div><!-- end page-p4 -->

<!-- ═══════════════════════════════════
     P5 — SALES ACTIVITY
═══════════════════════════════════ -->
<div class="page" id="page-p5">
  <div class="ph">
    <div><div class="pt">Sales Activity Log</div><div class="ps">Activity log per company — all interactions tracked by PT</div></div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-ghost" onclick="exportActivities()" title="Export ke CSV">⬇️ Export CSV</button>
      <button class="btn btn-primary" onclick="openAddCompany()">+ Add Company</button>
    </div>
  </div>

  <div class="mgrid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
    <div class="mc"><div class="micon">🏢</div><div class="mlbl">Companies</div><div class="mval" id="mc-act-companies">—</div><div class="msub">With activity records</div></div>
    <div class="mc teal"><div class="micon">📋</div><div class="mlbl">Total Activities</div><div class="mval" id="mc-act-total">—</div><div class="msub">All records</div></div>
    <div class="mc success"><div class="micon">✅</div><div class="mlbl">Actual</div><div class="mval" id="mc-act-actual">—</div><div class="msub">Completed</div></div>
    <div class="mc accent"><div class="micon">📅</div><div class="mlbl">Planning</div><div class="mval" id="mc-act-planning">—</div><div class="msub">Upcoming</div></div>
  </div>

  <div style="display:flex;gap:10px;margin-bottom:16px;align-items:center;">
    <div class="sw" style="flex:1;"><span class="si">🔍</span><input type="text" class="sbox" id="activitySearch" placeholder="Search company or notes…" oninput="filterActivities()"></div>
    <select class="fsel" id="actPersonFilter" onchange="filterActivities()">
      <option value="">All Persons</option>
    </select>
    <select class="fsel" id="actExecFilter" onchange="filterActivities()">
      <option value="">All Execution</option>
      <option value="Planning">Planning</option>
      <option value="Actual">Actual</option>
    </select>
    <button class="btn btn-ghost btn-sm" onclick="expandAllActivity(true)">Expand All</button>
    <button class="btn btn-ghost btn-sm" onclick="expandAllActivity(false)">Collapse All</button>
  </div>

  <div id="activitiesContent"><div class="loader-wrap"><div class="loader"></div></div></div>
</div><!-- end page-p5 -->

<!-- Add Company Modal -->
<div class="modal-overlay" id="addCompanyModal">
  <div class="modal" style="max-width:460px;">
    <div class="modal-title"><span>Add Company</span><button class="modal-close" onclick="closeAddCompany()">✕</button></div>

    <!-- Tab: existing vs new -->
    <div style="display:flex;gap:0;margin-bottom:16px;border:1px solid var(--border);border-radius:8px;overflow:hidden;">
      <button id="acTab-existing" onclick="switchAcTab('existing')"
        style="flex:1;padding:9px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:var(--primary);color:white;font-family:DM Sans,sans-serif;">
        Select Existing
      </button>
      <button id="acTab-new" onclick="switchAcTab('new')"
        style="flex:1;padding:9px;font-size:12px;font-weight:600;border:none;cursor:pointer;background:var(--surface2);color:var(--text-muted);font-family:DM Sans,sans-serif;">
        Add New Company
      </button>
    </div>

    <!-- Pane: select existing -->
    <div id="acPane-existing">
      <label class="form-label">Choose from Customer List or Supplier List</label>
      <select class="form-select" id="addCompanySelect" style="margin-bottom:0;">
        <option value="">— Loading… —</option>
      </select>
    </div>

    <!-- Pane: add new -->
    <div id="acPane-new" style="display:none;">
      <div class="form-grid">
        <div class="form-group full">
          <label class="form-label">Company Name *</label>
          <input type="text" class="form-input" id="addCompanyManual" placeholder="e.g. PT. Sigma Rekayasa Engineering">
        </div>
        <div class="form-group full">
          <label class="form-label">Save As</label>
          <div style="display:flex;gap:8px;">
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:8px 14px;border:1px solid var(--border);border-radius:8px;flex:1;transition:border-color 0.15s;" id="acSaveTo-crm">
              <input type="radio" name="acSaveTo" value="crm" checked onchange="updateAcSaveTo()"> 🤝 New Customer
            </label>
            <label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:13px;padding:8px 14px;border:1px solid var(--border);border-radius:8px;flex:1;transition:border-color 0.15s;" id="acSaveTo-supplier">
              <input type="radio" name="acSaveTo" value="supplier" onchange="updateAcSaveTo()"> 🏭 New Supplier
            </label>
          </div>
          <div style="margin-top:8px;font-size:11px;color:var(--text-muted);" id="acSaveToHint">
            Will be added to Customer List — complete details there later.
          </div>
        </div>
        <!-- CRM: owner field -->
        <div class="form-group full" id="acCrmFields">
          <label class="form-label">Owner</label>
          <select class="form-select" id="acOwner"></select>
        </div>
        <!-- Supplier: type field -->
        <div class="form-group full" id="acSupplierFields" style="display:none;">
          <label class="form-label">Supplier Type</label>
          <select class="form-select" id="acSupplierType">
            <option value="global">🌐 Mill — Global</option>
            <option value="china">🇨🇳 Mill — China</option>
            <option value="trading">🚢 Trading Office</option>
            <option value="Distributor">🏪 Distributor</option>
            <option value="Fabricator">🔧 Fabricator</option>
          </select>
        </div>
      </div>
    </div>

    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeAddCompany()">Cancel</button>
      <button class="btn btn-primary" onclick="confirmAddCompany()">Add Company</button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════
     PX — EQUIPMENT MRO
═══════════════════════════════════ -->
<div class="page" id="page-px">
  <div class="ph">
    <div><div class="pt">Supplier List</div><div class="ps">Mill, Trading Office &amp; Distributor / Fabricator network</div></div>
    <div style="display:flex;gap:8px;">
      <button class="btn btn-primary" onclick="openAddSupplier(currentSlTab||'global')">+ Add Supplier</button>
    </div>
  </div>

  <div class="mgrid" style="grid-template-columns:repeat(4,1fr);margin-bottom:20px;">
    <div class="mc"><div class="micon">🏭</div><div class="mlbl">Total Mills</div><div class="mval" id="mc-sl-mills">—</div><div class="msub">Global + China</div></div>
    <div class="mc accent"><div class="micon">🚢</div><div class="mlbl">Trading Offices</div><div class="mval" id="mc-sl-trading">—</div><div class="msub" id="mc-sl-trading-vol">— MT</div></div>
    <div class="mc teal"><div class="micon">🔧</div><div class="mlbl">Fabricators</div><div class="mval" id="mc-sl-fab">—</div><div class="msub" id="mc-sl-fab-vol">— MT</div></div>
    <div class="mc success"><div class="micon">🏪</div><div class="mlbl">Distributors</div><div class="mval" id="mc-sl-dist">—</div><div class="msub" id="mc-sl-dist-vol">— MT</div></div>
  </div>

  <div style="display:flex;gap:4px;margin-bottom:16px;border-bottom:2px solid var(--border);padding-bottom:0;">
    <button id="sl-tab-mill"    onclick="showSlTab('mill')"    class="sl-tab sl-tab-active">🏭 Mill</button>
    <button id="sl-tab-trading" onclick="showSlTab('trading')" class="sl-tab">🚢 Trading Office</button>
    <button id="sl-tab-dist"    onclick="showSlTab('dist')"    class="sl-tab">🏪 Distributor</button>
    <button id="sl-tab-fab"     onclick="showSlTab('fab')"     class="sl-tab">🔧 Fabricator</button>
  </div>

  <div id="sl-pane-mill">
    <div id="slMillBody" class="crm-grid"><div class="loader-wrap"><div class="loader"></div></div></div>
  </div>

  <div id="sl-pane-trading" style="display:none;">
    <div id="slTradingBody" class="crm-grid"><div class="loader-wrap"><div class="loader"></div></div></div>
  </div>

  <div id="sl-pane-dist" style="display:none;">
    <div id="slDistBody" class="crm-grid"><div class="loader-wrap"><div class="loader"></div></div></div>
  </div>

  <div id="sl-pane-fab" style="display:none;">
    <div id="slFabBody" class="crm-grid"><div class="loader-wrap"><div class="loader"></div></div></div>
  </div>

</div><!-- end page-px -->

<div class="page" id="page-cn">
  <div class="ph">
    <div><div class="pt">Chinese Project</div><div class="ps">China market projects &amp; supplier intelligence</div></div>
  </div>

  <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:80px 20px;">
    <div style="font-size:64px;line-height:1;margin-bottom:20px;">🇨🇳</div>
    <div style="font-size:24px;font-weight:700;color:var(--text-primary);margin-bottom:8px;">Coming Soon</div>
    <div style="font-size:14px;color:var(--text-muted);max-width:420px;">
      Modul <strong>Chinese Project</strong> sedang dalam pengembangan dan akan segera tersedia.
    </div>
  </div>
</div><!-- end page-cn -->

</div><!-- end .main -->

<!-- ═══════════════════════════════════
     MODALS
═══════════════════════════════════ -->

<!-- (Modal Kelola User dihapus — role admin/user/observer disederhanakan;
     akses modul kini seluruhnya dikelola lewat lib/access.php SalesConnect.) -->

<!-- Pipeline Modal -->
<div class="modal-overlay" id="pipelineModal">
  <div class="modal">
    <div class="modal-title">
      <span id="pipelineModalTitle">Add Opportunity</span>
      <button class="modal-close" onclick="closePipelineModal()">✕</button>
    </div>
    <form id="pipelineForm">
      <input type="hidden" id="pipelineFormId">
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Date *</label><input type="date" class="form-input" id="pf_date" required></div>
        <div class="form-group"><label class="form-label">Sales Person *</label>
          <select class="form-select" id="pf_sales_owner" required><option value="">Select…</option></select>
        </div>
        <div class="form-group full"><label class="form-label">Customer *</label><input type="text" class="form-input" id="pf_customer" required></div>
        <div class="form-group"><label class="form-label">Location</label><input type="text" class="form-input" id="pf_location"></div>
        <div class="form-group"><label class="form-label">Source</label><input type="text" class="form-input" id="pf_source"></div>
        <div class="form-group full"><label class="form-label">Product *</label><input type="text" class="form-input" id="pf_product" required></div>
        <div class="form-group"><label class="form-label">Volume (kg) *</label><input type="number" class="form-input" id="pf_volume_kg" required min="0" oninput="updateMarginPreview()"></div>
        <div class="form-group"><label class="form-label">Payment Term</label>
          <select class="form-select" id="pf_payment_term"><option value="CASH">CASH</option><option value="30 D">30 D</option><option value="90 D">90 D</option><option value="SKBDN">SKBDN</option></select>
        </div>
        <div class="form-group"><label class="form-label">Buying Price (Rp/kg) *</label><input type="number" class="form-input" id="pf_buying_price" required min="0" oninput="updateMarginPreview()"></div>
        <div class="form-group"><label class="form-label">Selling Price (Rp/kg) *</label><input type="number" class="form-input" id="pf_selling_price" required min="0" oninput="updateMarginPreview()"></div>
        <div class="form-group"><label class="form-label">Transport (Rp)</label><input type="number" class="form-input" id="pf_transport" value="0" min="0" oninput="updateMarginPreview()"></div>
        <div class="form-group"><label class="form-label">Financing (Rp)</label><input type="number" class="form-input" id="pf_financing" value="0" min="0" oninput="updateMarginPreview()"></div>
        <div class="form-group"><label class="form-label">Stage</label>
          <select class="form-select" id="pf_stage">
            <option value="Inquiries">Inquiries (10%)</option><option value="Qualified Leads">Qualified Leads (25%)</option>
            <option value="Technical Discussion">Technical Discussion (50%)</option><option value="Quotation" selected>Quotation (60%)</option>
            <option value="Negotiation">Negotiation (85%)</option><option value="Won">Won (100%)</option><option value="Lost">Lost</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Attachment</label>
          <select class="form-select" id="pf_attachment">
            <option value="">— None —</option>
            <option value="Quotation">Quotation</option>
            <option value="PO">PO</option>
            <option value="Payment">Payment</option>
            <option value="Delivery Order">Delivery Order</option>
            <option value="Invoice">Invoice</option>
          </select>
        </div>
        <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-textarea" id="pf_notes" rows="2"></textarea></div>
      </div>
      <div id="pf_margin_preview" style="font-size:12px;color:var(--primary);font-weight:600;margin-top:8px;padding:8px 12px;background:var(--surface2);border-radius:6px;">Enter volume and prices to preview margin</div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closePipelineModal()">Cancel</button>
        <button type="button" class="btn btn-primary" onclick="savePipeline()">Save Opportunity</button>
      </div>
    </form>
  </div>
</div>


<!-- Copy to Supplier Modal -->
<div class="modal-overlay" id="ctsModal">
  <div class="modal" style="max-width:460px;">
    <div class="modal-title">
      <span>🏭 Copy ke Supplier List</span>
      <button class="modal-close" onclick="closeCtsModal()">✕</button>
    </div>
    <input type="hidden" id="cts_account_id">
    <div style="background:var(--surface2);padding:10px 14px;border-radius:8px;margin-bottom:16px;font-size:12px;color:var(--text-muted);">
      Data kontak akan disalin dari Customer List. Kamu bisa melengkapi detail lainnya di Supplier List setelah disimpan.
    </div>
    <div class="form-grid">
      <div class="form-group full">
        <label class="form-label">Nama Perusahaan *</label>
        <input type="text" class="form-input" id="cts_company" placeholder="PT. Nama Perusahaan">
      </div>
      <div class="form-group full">
        <label class="form-label">Supplier Type *</label>
        <select class="form-select" id="cts_type">
          <option value="Distributor">🏪 Distributor</option>
          <option value="Fabricator">🔧 Fabricator</option>
          <option value="OEM">🏗️ OEM</option>
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Contact Name</label>
        <input type="text" class="form-input" id="cts_contact_name" placeholder="Nama kontak">
      </div>
      <div class="form-group">
        <label class="form-label">Contact Phone</label>
        <input type="text" class="form-input" id="cts_contact_phone" placeholder="+62...">
      </div>
      <div class="form-group full">
        <label class="form-label">Notes</label>
        <textarea class="form-textarea" id="cts_notes" rows="2" placeholder="Catatan tambahan…"></textarea>
      </div>
    </div>
    <div class="form-actions">
      <button class="btn btn-ghost" onclick="closeCtsModal()">Batal</button>
      <button class="btn btn-primary" onclick="saveCopyToSupplier()">💾 Salin ke Supplier</button>
    </div>
  </div>
</div>

<!-- Activity Modal -->
<div class="modal-overlay" id="activityModal">
  <div class="modal" style="max-width:560px;">
    <div class="modal-title"><span id="activityModalTitle">Add Activity</span><button class="modal-close" onclick="closeActivityModal()">✕</button></div>
    <form id="activityForm" onsubmit="event.preventDefault(); saveActivity();">
      <input type="hidden" id="af_activity_id">
      <input type="hidden" id="af_company">
      <div style="background:var(--surface2);padding:8px 12px;border-radius:8px;margin-bottom:14px;font-size:13px;font-weight:600;" id="af_company_label">—</div>
      <div class="form-grid">
        <div class="form-group"><label class="form-label">Date *</label><input type="date" class="form-input" id="af_date" required></div>
        <div class="form-group"><label class="form-label">Sales Person</label>
          <select class="form-select" id="af_person" required>
            <option value="">Select…</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Execution</label>
          <select class="form-select" id="af_execution">
            <option value="Planning">📋 Planning</option>
            <option value="Actual">✅ Actual</option>
          </select>
        </div>
        <div class="form-group"><label class="form-label">Calls Made</label><input type="number" class="form-input" id="af_calls" value="0" min="0"></div>
        <div class="form-group"><label class="form-label">Meetings</label><input type="number" class="form-input" id="af_meetings" value="0" min="0"></div>
        <div class="form-group"><label class="form-label">Quotations Sent</label><input type="number" class="form-input" id="af_quotations" value="0" min="0"></div>
        <div class="form-group"><label class="form-label">New Opportunities</label><input type="number" class="form-input" id="af_opps" value="0" min="0"></div>
        <div class="form-group"><label class="form-label">Deals Closed</label><input type="number" class="form-input" id="af_deals" value="0" min="0"></div>
        <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-textarea" id="af_notes" rows="3"></textarea></div>
      </div>
      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeActivityModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Activity</button>
      </div>
    </form>
  </div>
</div>

<!-- Toast container -->
<div class="toast-container" id="toastContainer"></div>


<!-- Add Inquiry Modal -->
<div class="modal-overlay" id="inquiryModal">
  <div class="modal" style="max-width:680px;">
    <div class="modal-title">
      <span id="inquiryModalTitle">Add New Inquiry</span>
      <button class="modal-close" onclick="closeInquiryModal()">✕</button>
    </div>
    <form id="inquiryForm" onsubmit="event.preventDefault(); saveInquiry();">
      <input type="hidden" id="iq_id">

      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid var(--border);">Account Info</div>
      <div class="form-grid">
        <div class="form-group full">
          <label class="form-label">Company Name *</label>
          <input type="text" class="form-input" id="iq_company" required placeholder="e.g. PT. Sanggar Sarana Baja">
        </div>
        <div class="form-group">
          <label class="form-label">Owner *</label>
          <select class="form-select" id="iq_owner" required></select>
        </div>
        <div class="form-group">
          <label class="form-label">Status</label>
          <select class="form-select" id="iq_status">
            <option value="On-going 1 Inquiry">On-going 1 Inquiry</option>
            <option value="On-going 2 Inquiry">On-going 2 Inquiry</option>
            <option value="On-going 3 Inquiry">On-going 3 Inquiry</option>
            <option value="Manage Eproc">Manage Eproc</option>
            <option value="Prospect">Prospect</option>
          </select>
        </div>
        <div class="form-group full">
          <label class="form-label">Product / Idea</label>
          <input type="text" class="form-input" id="iq_idea" placeholder="e.g. NM 450 · CCO Plate · Q690">
        </div>
        <div class="form-group full">
          <label class="form-label">Sub-Sector / Industry</label>
          <input type="text" class="form-input" id="iq_subsector" placeholder="e.g. Steel Fabricator · Mining Company">
        </div>
        <div class="form-group full">
          <label class="form-label">Synthesis / Background</label>
          <input type="text" class="form-input" id="iq_synthesis" placeholder="e.g. Import from China Mill · Also sourcing local">
        </div>
        <div class="form-group full">
          <label class="form-label">Next Step</label>
          <input type="text" class="form-input" id="iq_nextstep" placeholder="e.g. Send Quotation – NM 450">
        </div>
      </div>

      <!-- Contacts section -->
      <div style="font-size:11px;font-weight:700;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.6px;margin:18px 0 10px;padding-bottom:6px;border-bottom:1px solid var(--border);">
        Contacts
        <button type="button" onclick="addContactRow()" style="margin-left:10px;background:var(--surface2);border:1px solid var(--border);border-radius:4px;padding:2px 8px;font-size:11px;cursor:pointer;font-family:'DM Sans',sans-serif;color:var(--primary);font-weight:600;">+ Add Contact</button>
      </div>
      <div id="contactRows">
        <!-- Rows injected by JS -->
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeInquiryModal()">Cancel</button>
        <button type="submit" class="btn btn-primary" id="inquirySaveBtn">Save Inquiry</button>
      </div>
    </form>
  </div>
</div>

<!-- Supplier Modal -->
<div class="modal-overlay" id="supplierModal">
  <div class="modal" style="max-width:580px;">
    <div class="modal-title">
      <span id="supplierModalTitle">Add Supplier</span>
      <button class="modal-close" onclick="closeSupplierModal()">✕</button>
    </div>
    <form id="supplierForm" onsubmit="event.preventDefault(); saveSupplier();">
      <input type="hidden" id="sl_id">
      <input type="hidden" id="sl_type">
      <input type="hidden" id="sl_category">

      <div class="form-group" style="margin-bottom:14px;">
        <label class="form-label">Supplier Type</label>
        <select class="form-select" id="sl_type_select" onchange="$('sl_type').value=this.value; showSupplierFields(this.value);">
          <option value="global">🌐 Mill — Global</option>
          <option value="china">🇨🇳 Mill — China</option>
          <option value="trading">🚢 Trading Office</option>
          <option value="distributor">🏪 Distributor</option>
          <option value="fabricator">🔧 Fabricator</option>
        </select>
      </div>

      <!-- Mill fields (Global & China) -->
      <div id="sl-fields-mill">
        <div class="form-grid">
          <div class="form-group"><label class="form-label">Brand *</label><input type="text" class="form-input" id="sl_brand" placeholder="e.g. NM, HARDOX"></div>
          <div class="form-group"><label class="form-label">Country</label><input type="text" class="form-input" id="sl_country" placeholder="e.g. Sweden"></div>
          <div class="form-group full"><label class="form-label">Mill Name *</label><input type="text" class="form-input" id="sl_mill_name" placeholder="e.g. SSAB AB"></div>
          <div class="form-group full"><label class="form-label">City / Province (China)</label><input type="text" class="form-input" id="sl_city_province" placeholder="e.g. Wuhan, Hubei"></div>
          <div class="form-group"><label class="form-label">Contact Name</label><input type="text" class="form-input" id="sl_contact_name" placeholder="e.g. John Smith"></div>
          <div class="form-group"><label class="form-label">Contact Phone</label><input type="text" class="form-input" id="sl_contact_phone" placeholder="e.g. +62-21-xxx"></div>
          <div class="form-group full"><label class="form-label">Website</label><input type="text" class="form-input" id="sl_website" placeholder="e.g. https://ssab.com"></div>
          <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-textarea" id="sl_notes" rows="2" placeholder="Additional notes…"></textarea></div>
        </div>
      </div>

      <!-- Trading Office fields -->
      <div id="sl-fields-trading" style="display:none;">
        <div class="form-grid">
          <div class="form-group full"><label class="form-label">Company Name *</label><input type="text" class="form-input" id="sl_company_name"></div>
          <div class="form-group"><label class="form-label">Brand</label><input type="text" class="form-input" id="sl_brand_t"></div>
          <div class="form-group"><label class="form-label">Location</label><input type="text" class="form-input" id="sl_location_t" placeholder="e.g. Jakarta"></div>
          <div class="form-group"><label class="form-label">Annual Volume (MT)</label><input type="number" class="form-input" id="sl_volume" value="0" min="0" step="0.001"></div>
          <div class="form-group"><label class="form-label">Market Share (%)</label><input type="number" class="form-input" id="sl_market_share" value="0" min="0" max="100" step="0.01"></div>
          <div class="form-group"><label class="form-label">Color</label><input type="color" class="form-input" id="sl_color" value="#0B3D6B" style="height:38px;padding:4px;"></div>
          <div class="form-group"><label class="form-label">Contact Name</label><input type="text" class="form-input" id="sl_contact_name_t" placeholder="e.g. John Smith"></div>
          <div class="form-group"><label class="form-label">Contact Phone</label><input type="text" class="form-input" id="sl_contact_phone_t"></div>
          <div class="form-group full"><label class="form-label">Notes</label><textarea class="form-textarea" id="sl_notes_t" rows="2"></textarea></div>
        </div>
      </div>

      <!-- Stockist (Distributor/Fabricator) fields -->
      <div id="sl-fields-stockist" style="display:none;">
        <div class="form-grid">
          <div class="form-group full"><label class="form-label">Company Name *</label><input type="text" class="form-input" id="sl_company_s"></div>
          <div class="form-group"><label class="form-label">Location</label><input type="text" class="form-input" id="sl_location" placeholder="e.g. Jakarta"></div>
          <div class="form-group"><label class="form-label">Annual Volume (MT)</label><input type="number" class="form-input" id="sl_volume_s" value="0" min="0"></div>
          <div class="form-group"><label class="form-label">Size Range</label><input type="text" class="form-input" id="sl_size_range" placeholder="e.g. 6mm - 40mm"></div>
          <div class="form-group"><label class="form-label">API Status</label>
            <select class="form-select" id="sl_api_status">
              <option value="">— None —</option>
              <option value="API-P">API-P</option>
              <option value="API-U">API-U</option>
            </select>
          </div>
          <div class="form-group"><label class="form-label">Contact Name</label><input type="text" class="form-input" id="sl_contact_name_s" placeholder="e.g. Pak Budi"></div>
          <div class="form-group"><label class="form-label">Contact Phone</label><input type="text" class="form-input" id="sl_contact_phone_s"></div>
          <div class="form-group full"><label class="form-label">Remarks / Notes</label><input type="text" class="form-input" id="sl_remarks"></div>
          <div class="form-group full"><label class="form-label">Website</label><input type="text" class="form-input" id="sl_website_s" placeholder="https://..."></div>
        </div>
      </div>

      <div class="form-actions">
        <button type="button" class="btn btn-ghost" onclick="closeSupplierModal()">Cancel</button>
        <button type="submit" class="btn btn-primary">Save Supplier</button>
      </div>
    </form>
  </div>
</div>

<!-- Activity History Modal -->
<div class="modal-overlay" id="historyModal">
  <div class="modal" style="max-width:680px;">
    <div class="modal-title">
      <span id="historyHeader">Edit History</span>
      <button class="modal-close" onclick="closeHistoryModal()">✕</button>
    </div>
    <div id="historyBody" style="max-height:65vh;overflow-y:auto;padding-right:4px;">
      <div class="loader-wrap"><div class="loader"></div></div>
    </div>
    <div style="margin-top:16px;text-align:right;">
      <button class="btn btn-ghost" onclick="closeHistoryModal()">Close</button>
    </div>
  </div>
</div>

<script src="js/app.js?v=<?= @filemtime(__DIR__ . '/js/app.js') ?: '1' ?>"></script>

<script>
// (Guard token/localStorage lama, mode observer, dan doLogout() dihapus —
// digantikan sc_require_tool('crmproject') + sc_session_watch() di PHP, dan
// tautan Logout di header sekarang langsung ke ../logout.php. window.SC_USER
// diisi dari sesi PHP di <head>, dipakai app.js untuk prefill sales person.)

// ─── EXPORT HELPERS ──────────────────────────────────────────
function exportActivities() {
  var from   = document.getElementById('actFromFilter')  ? document.getElementById('actFromFilter').value  : '';
  var to     = document.getElementById('actToFilter')    ? document.getElementById('actToFilter').value    : '';
  var person = document.getElementById('actPersonFilter') ? document.getElementById('actPersonFilter').value : '';
  var params = new URLSearchParams();
  if (from)   params.append('from', from);
  if (to)     params.append('to', to);
  if (person) params.append('person', person);
  var url = 'api/export/activities' + (params.toString() ? '?' + params.toString() : '');
  authFetch(url).then(function(r) {
    if (!r.ok) { alert('Export gagal. Pastikan Anda sudah login.'); return; }
    return r.blob();
  }).then(function(blob) {
    if (!blob) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'sales_activities_' + new Date().toISOString().slice(0,10) + '.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  }).catch(function() { alert('Terjadi kesalahan saat export.'); });
}

function exportCustomers() {
  authFetch('api/export/customers').then(function(r) {
    if (!r.ok) { alert('Export gagal. Pastikan Anda sudah login.'); return; }
    return r.blob();
  }).then(function(blob) {
    if (!blob) return;
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'customer_list_' + new Date().toISOString().slice(0,10) + '.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  }).catch(function() { alert('Terjadi kesalahan saat export.'); });
}
</script>

</body>
</html>