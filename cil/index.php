<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Client Interaction Log</title>
  <!-- Block crawlers & indexing -->
  <meta name="robots" content="noindex, nofollow, noarchive, nosnippet">
  <meta name="googlebot" content="noindex, nofollow">
  <!-- External Libraries -->
  <script src="https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js"></script>
  <script src="https://cdnjs.cloudflare.com/ajax/libs/mammoth/1.6.0/mammoth.browser.min.js"></script>
  <!-- App Stylesheet -->
  <link rel="stylesheet" href="assets/css/styles.css">
</head>
<body>

<!-- ═══════════════════════════════════════════════
     HEADER
════════════════════════════════════════════════ -->
<div id="header">
  <div id="header-inner">
    <svg width="200" height="46" viewBox="0 0 200 46" xmlns="http://www.w3.org/2000/svg">
      <text x="0" y="11" font-family="system-ui, sans-serif" font-size="11" font-weight="600" letter-spacing="4" fill="#6b7280">CLIENT</text>
      <text x="0" y="34" font-family="system-ui, sans-serif" font-size="26" font-weight="500" fill="#111827">Interaction</text>
      <text x="0" y="45" font-family="system-ui, sans-serif" font-size="11" font-weight="600" letter-spacing="5" fill="#1DB88A">LOG</text>
    </svg>
    <div class="header-actions">
      <a href="../" class="btn-db" style="text-decoration:none;color:#1a73e8;border-color:#c7d2fe;display:inline-flex;align-items:center;gap:.25rem">🏠 SalesConnect</a>
      <button class="btn-db" id="btn-sales-open" style="color:#16a34a;border-color:#bbf7d0">Sales DB (8)</button>
      <button class="btn-db" id="btn-db-open">Client DB (11)</button>
      <button class="btn-db" id="btn-export-excel" style="color:#15803d;border-color:#bbf7d0">📊 Export Excel</button>
      <button class="btn-db" id="btn-settings-open" style="color:#475569" onclick="openSettings()" title="Manage channels, priorities & statuses">⚙ Settings</button>
      <button class="btn-add" id="btn-add-main" style="background:#16a34a">+ Log Communication</button>
      <button class="btn-add" id="btn-add-complain" style="background:#dc2626">+ Log Complain</button>
    </div>
  </div>
</div>

<!-- ═══════════════════════════════════════════════
     MAIN CONTENT
════════════════════════════════════════════════ -->
<div id="main">
  <!-- Stats Cards -->
  <div id="stats">
    <div class="stat-card" onclick="openStatDetail('companies')"><div class="stat-val" id="stat-companies" style="color:#2563eb">0</div><div class="stat-lbl">Active companies</div></div>
    <div class="stat-card" onclick="openStatDetail('comms')"><div class="stat-val" id="stat-meetings" style="color:#15803d">0</div><div class="stat-lbl">Total communications</div></div>
    <div class="stat-card" onclick="openStatDetail('followups')"><div class="stat-val" id="stat-urgent" style="color:#64748b">0</div><div class="stat-lbl">Pending follow-up</div></div>
    <div class="stat-card" onclick="openStatDetail('complaints')"><div class="stat-val" id="stat-complaints" style="color:#64748b">0</div><div class="stat-lbl">Open complaints</div></div>
  </div>

  <!-- Tab Navigation -->
  <div id="tabs-wrap">
    <button class="tab-btn active" id="tab-followup" onclick="setTab('followup')">Follow-Up</button>
    <button class="tab-btn" id="tab-recent" onclick="setTab('recent')">Recent</button>
    <button class="tab-btn" id="tab-companies" onclick="setTab('companies')">All</button>
    <button class="tab-btn" id="tab-complaints" onclick="setTab('complaints')" style="color:#dc2626">Complaints</button>
  </div>

  <!-- Search Bar -->
  <div id="search-wrap" style="display:none">
    <input type="text" id="search-input" placeholder="Search by company or contact..." oninput="render()">
  </div>

  <!-- Dynamic Tab Content -->
  <div id="tab-content"></div>
</div>

<!-- ═══════════════════════════════════════════════
     MODALS
════════════════════════════════════════════════ -->

<!-- Log Communication Form Modal -->
<div class="modal-overlay top" id="form-modal" style="display:none" onclick="modalOverlayClick(event,'form-modal')">
  <div class="modal-box" style="max-width:520px;margin-bottom:40px" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div class="modal-title" id="form-modal-title">Log Communication</div>
      <button class="modal-close" onclick="closeModal('form-modal')">✕</button>
    </div>
    <div class="modal-body" id="form-body"></div>
  </div>
</div>

<!-- Client Database Modal -->
<div class="modal-overlay" id="db-modal" style="display:none" onclick="modalOverlayClick(event,'db-modal')">
  <div class="modal-box" style="max-width:460px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden" onclick="event.stopPropagation()">
    <div class="modal-header" style="flex-shrink:0">
      <div>
        <div class="modal-title">Client Database</div>
        <div class="modal-sub" id="db-count"></div>
      </div>
      <button class="modal-close" onclick="closeModal('db-modal')">✕</button>
    </div>
    <div class="db-add-row" style="flex-shrink:0">
      <input type="text" id="db-new-input" placeholder="New company name..." onkeydown="if(event.key==='Enter')dbAddNew()">
      <button class="btn-db-add" onclick="dbAddNew()">Add</button>
    </div>
    <div class="db-list" id="db-list"></div>
  </div>
</div>

<!-- Sales Team Database Modal -->
<div class="modal-overlay" id="sales-modal" style="display:none" onclick="modalOverlayClick(event,'sales-modal')">
  <div class="modal-box" style="max-width:400px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden" onclick="event.stopPropagation()">
    <div class="modal-header" style="flex-shrink:0">
      <div>
        <div class="modal-title">Sales Team</div>
        <div class="modal-sub" id="sales-count"></div>
      </div>
      <button class="modal-close" onclick="closeModal('sales-modal')">✕</button>
    </div>
    <div class="db-add-row" style="flex-shrink:0">
      <input type="text" id="sales-new-input" placeholder="New sales name..." onkeydown="if(event.key==='Enter')salesAddNew()">
      <button class="btn-db-add" onclick="salesAddNew()">Add</button>
    </div>
    <div class="db-list" id="sales-list"></div>
  </div>
</div>

<!-- Settings Modal (data-driven config: channels / priorities / complaint statuses) -->
<div class="modal-overlay" id="settings-modal" style="display:none" onclick="modalOverlayClick(event,'settings-modal')">
  <div class="modal-box" style="max-width:560px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden" onclick="event.stopPropagation()">
    <div class="modal-header" style="flex-shrink:0">
      <div>
        <div class="modal-title">⚙ Settings</div>
        <div class="modal-sub">Kelola pilihan dropdown — perubahan langsung dipakai aplikasi</div>
      </div>
      <button class="modal-close" onclick="closeModal('settings-modal')">✕</button>
    </div>
    <div id="settings-tabs" style="display:flex;gap:6px;padding:12px 16px 0;flex-shrink:0;flex-wrap:wrap"></div>
    <div class="modal-body" id="settings-body" style="overflow:auto"></div>
  </div>
</div>

<!-- AI / Company Analysis Modal -->
<div class="modal-overlay" id="ai-modal" style="display:none" onclick="modalOverlayClick(event,'ai-modal')">
  <div class="modal-box" style="max-width:440px;overflow:hidden" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div>
        <div class="modal-title">📊 Company Analysis</div>
        <div class="modal-sub" id="ai-modal-sub"></div>
      </div>
      <button class="modal-close" onclick="closeModal('ai-modal')">✕</button>
    </div>
    <div class="modal-body" id="ai-modal-body"></div>
  </div>
</div>

<!-- Smart Paste & Format Modal -->
<div class="paste-overlay" id="paste-modal" style="display:none">
  <div class="paste-box">
    <div class="paste-header">
      <div>
        <div class="paste-title">✨ Smart Paste & Restructure</div>
        <div class="paste-sub">Paste catatan mentah — otomatis perbaiki singkatan, susun ulang & format</div>
      </div>
      <button type="button" class="modal-close" onclick="document.getElementById('paste-modal').style.display='none'">✕</button>
    </div>
    <div class="paste-mode-bar">
      <button class="paste-mode-btn active" id="paste-mode-ai" onclick="setPasteMode('smart')">✨ Smart Restructure</button>
      <button class="paste-mode-btn" id="paste-mode-simple" onclick="setPasteMode('simple')">⚡ Quick Format</button>
    </div>
    <div class="paste-ai-hint" id="paste-ai-hint">
      <span style="font-size:13px">🧠</span>
      <span>Otomatis: memperbaiki 55+ singkatan → mengelompokkan topik → menyusun ulang → capitalize</span>
    </div>
    <textarea class="paste-textarea" id="paste-input" placeholder="Paste catatan mentah di sini (singkatan & bahasa tidak baku OK)...

Contoh:
Gentengisasi Pemerintah
bjp tdk akan terpengaruh karna pengganti bahannya bitumen yg lbh mahal
masih wacana blm tentu jdi

Kuota Ppgl sulit
kuota import sulit didapat, kebutuhan lokal meningkat
ada proyek merah putih, ppgl diakali dgn seng yg dicat merah"></textarea>
    <div class="paste-status" id="paste-status"></div>
    <div class="paste-preview" id="paste-preview" style="display:none">
      <div class="paste-preview-header">
        <span style="font-size:11px;font-weight:600;color:#1d4ed8">📋 Preview Hasil Restructure</span>
        <button onclick="document.getElementById('paste-preview').style.display='none';document.getElementById('paste-input').style.display='block'" style="font-size:11px;color:#94a3b8;background:none;border:none;cursor:pointer">← Edit ulang</button>
      </div>
      <div class="paste-preview-content" id="paste-preview-content"></div>
    </div>
    <div class="paste-actions">
      <button type="button" class="btn-cancel-paste" onclick="document.getElementById('paste-modal').style.display='none'">Cancel</button>
      <button type="button" class="btn-format" id="btn-do-format" onclick="runSmartRestructure()">✨ Smart Restructure</button>
    </div>
  </div>
</div>

<!-- Log Complaint Form Modal -->
<div class="modal-overlay top" id="cpl-form-modal" style="display:none" onclick="modalOverlayClick(event,'cpl-form-modal')">
  <div class="modal-box" style="max-width:520px;margin-bottom:40px" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div>
        <div class="modal-title" id="cpl-form-modal-title" style="color:#dc2626">⚠ Log Complain</div>
        <div class="modal-sub">Catat keluhan pelanggan dan jadwal follow-up</div>
      </div>
      <button class="modal-close" onclick="closeModal('cpl-form-modal')">✕</button>
    </div>
    <div class="modal-body" id="cpl-form-body"></div>
  </div>
</div>

<!-- Complaint Response Modal -->
<div class="modal-overlay" id="cpl-resp-modal" style="display:none" onclick="modalOverlayClick(event,'cpl-resp-modal')">
  <div class="modal-box" style="max-width:440px" onclick="event.stopPropagation()">
    <div class="modal-header">
      <div>
        <div class="modal-title">Tambah Respon Internal</div>
        <div class="modal-sub" id="cpl-resp-sub"></div>
      </div>
      <button class="modal-close" onclick="closeModal('cpl-resp-modal')">✕</button>
    </div>
    <div class="modal-body" id="cpl-resp-body"></div>
  </div>
</div>

<!-- Stat Detail Modal -->
<div class="modal-overlay" id="stat-modal" style="display:none" onclick="modalOverlayClick(event,'stat-modal')">
  <div class="modal-box" style="max-width:500px;max-height:80vh;display:flex;flex-direction:column;overflow:hidden" onclick="event.stopPropagation()">
    <div class="modal-header" style="flex-shrink:0">
      <div>
        <div class="modal-title" id="stat-modal-title"></div>
        <div class="modal-sub" id="stat-modal-sub"></div>
      </div>
      <button class="modal-close" onclick="closeModal('stat-modal')">✕</button>
    </div>
    <div style="overflow-y:auto;flex:1" id="stat-modal-body"></div>
  </div>
</div>

<!-- Export Excel Modal -->
<div class="modal-overlay" id="export-modal" style="display:none" onclick="modalOverlayClick(event,'export-modal')">
  <div class="modal-box" style="max-width:480px;max-height:85vh;display:flex;flex-direction:column;overflow:hidden" onclick="event.stopPropagation()">
    <div class="modal-header" style="flex-shrink:0">
      <div>
        <div class="modal-title">📊 Export Excel</div>
        <div class="modal-sub">Pilih perusahaan yang ingin dicetak</div>
      </div>
      <button class="modal-close" onclick="closeModal('export-modal')">✕</button>
    </div>
    <div class="exp-toolbar" style="flex-shrink:0">
      <div class="exp-select-btns">
        <button class="exp-select-btn" onclick="expSelectAll()">Pilih Semua</button>
        <span style="color:#e2e8f0">|</span>
        <button class="exp-select-btn" onclick="expDeselectAll()">Hapus Semua</button>
      </div>
      <span class="exp-count" id="exp-count">0 dipilih</span>
    </div>
    <div class="exp-company-list" id="exp-company-list" style="flex:1;padding:8px 12px"></div>
    <div class="exp-mode" id="exp-mode-wrap">
      <button class="exp-mode-btn active" id="exp-mode-one" onclick="setExpMode('one')">📁 Satu File (semua company)</button>
      <button class="exp-mode-btn" id="exp-mode-sep" onclick="setExpMode('separate')">📂 File Terpisah</button>
    </div>
    <div class="exp-footer" style="flex-shrink:0">
      <button class="btn-cancel-paste" onclick="closeModal('export-modal')">Cancel</button>
      <button class="btn-export-go" id="btn-export-go" onclick="runExport()" disabled>📊 Export</button>
    </div>
  </div>
</div>

<!-- App JavaScript -->
<script src="assets/js/app.js"></script>
</body>
</html>