<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>TaskFlow</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/style.css">
</head>
<body>

<header>
  <div class="logo"><span class="logo-dot"></span> TaskFlow</div>
  <a href="../" style="text-decoration:none;color:#1a73e8;font-weight:600;font-size:.85rem;padding:.35rem .7rem;border:1px solid #c7d2fe;border-radius:8px;background:#eef2ff">🏠 SalesConnect</a>
  <div id="hdr-right"></div>
</header>

<div id="no-session">
  <div style="font-size:3rem;margin-bottom:16px;">📋</div>
  <h2>Welcome to TaskFlow</h2>
  <p>Staff task assignment platform. Select your account to get started.</p>
  <button class="btn btn-primary btn-full" onclick="openModal('login')">Select Account</button>
</div>

<div id="main-app" style="display:none;">
  <div class="wrap">
    <div class="grid">
      <div class="sidebar">

        <div class="card">
          <div class="card-hd">
            <h3>📬 Inbox</h3>
            <span class="badge badge-red" id="inbox-badge">0</span>
          </div>
          <div class="card-bd">
            <p style="font-size:12px;color:var(--muted);margin-bottom:10px;">Tasks assigned to you</p>
            <button class="btn btn-primary btn-full btn-sm" onclick="switchTab('inbox')">View Incoming Tasks</button>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>✏️ New Task</h3></div>
          <div class="card-bd">
            <div class="fg"><label>Title</label><input id="new-title" type="text" placeholder="Task name..."></div>
            <div class="fg"><label>Description</label><textarea id="new-desc" placeholder="Task details..."></textarea></div>
            <div class="fg"><label>Assign To</label><select id="new-to"><option value="">— Select staff —</option></select></div>
            <div class="fg">
              <label>Proposed Deadline <span style="font-size:10px;text-transform:none;font-weight:400;">(optional)</span></label>
              <input id="new-pdl" type="datetime-local">
              <div class="hint">Recipient can accept or revise this deadline.</div>
            </div>
            <button class="btn btn-ink btn-full" onclick="createTodo()">➤ Send Task</button>
          </div>
        </div>

        <div class="card">
          <div class="card-hd">
            <h3>👥 Staff</h3>
            <button class="btn btn-primary btn-sm" onclick="openModal('add-staff')">+ Add</button>
          </div>
          <div class="card-bd" id="staff-list-sidebar" style="padding-top:8px;"></div>
        </div>

      </div>

      <div>
        <div style="margin-bottom:20px;">
          <h2 id="page-title" style="font-size:1.25rem;font-weight:700;letter-spacing:-.3px;"></h2>
          <p id="page-sub" style="font-size:13px;color:var(--muted);margin-top:3px;"></p>
        </div>

        <div class="tabs">
          <button class="tab" data-tab="dashboard" onclick="switchTab('dashboard')">📊 Task Board <span class="tab-cnt" id="cnt-dash">0</span></button>
          <button class="tab active" data-tab="sent" onclick="switchTab('sent')">📤 Sent <span class="tab-cnt" id="cnt-sent">0</span></button>
          <button class="tab" data-tab="inbox" onclick="switchTab('inbox')">📥 Inbox <span class="tab-cnt" id="cnt-inbox">0</span></button>
          <button class="tab" data-tab="all" onclick="switchTab('all')">☰ All <span class="tab-cnt" id="cnt-all">0</span></button>
        </div>

        <div id="dashboard-view" style="display:none;"></div>
        <div id="todo-list" class="todo-list"></div>
      </div>
    </div>
  </div>
</div>

<!-- ── MODALS ── -->

<div id="modal-login" class="overlay" style="display:none;" onclick="overlayClose(event,'modal-login')">
  <div class="modal">
    <div class="modal-hd"><h3>🔑 Select Account</h3><button class="close-btn" onclick="closeModal('modal-login')">✕</button></div>
    <div class="modal-bd">
      <p style="font-size:13px;color:var(--muted);margin-bottom:14px;">Click your name to sign in.</p>
      <div id="login-list" style="display:flex;flex-direction:column;gap:6px;max-height:300px;overflow-y:auto;"></div>
      <div class="divider"></div>
      <button class="btn btn-ghost btn-full btn-sm" onclick="closeModal('modal-login');openModal('add-staff')">+ Add New Staff</button>
    </div>
  </div>
</div>

<div id="modal-add-staff" class="overlay" style="display:none;" onclick="overlayClose(event,'modal-add-staff')">
  <div class="modal">
    <div class="modal-hd"><h3>👤 Add New Staff</h3><button class="close-btn" onclick="closeModal('modal-add-staff')">✕</button></div>
    <div class="modal-bd">
      <div class="fg"><label>Full Name</label><input id="staff-name" type="text" placeholder="e.g. John Smith"></div>
      <div class="fg"><label>Position / Title</label><input id="staff-pos" type="text" placeholder="e.g. Marketing Manager"></div>
    </div>
    <div class="modal-ft">
      <button class="btn btn-ghost" onclick="closeModal('modal-add-staff')">Cancel</button>
      <button class="btn btn-primary" onclick="addStaff()">Save Staff</button>
    </div>
  </div>
</div>

<div id="modal-accept" class="overlay" style="display:none;" onclick="overlayClose(event,'modal-accept')">
  <div class="modal">
    <div class="modal-hd"><h3>✅ Accept &amp; Start Task</h3><button class="close-btn" onclick="closeModal('modal-accept')">✕</button></div>
    <div class="modal-bd">
      <div id="accept-preview" style="background:#f8f5f1;border-radius:10px;padding:11px 14px;font-size:13px;color:var(--muted);margin-bottom:16px;"></div>
      <div id="proposed-area"></div>
      <div id="deadline-area"></div>
    </div>
    <div class="modal-ft">
      <button class="btn btn-ghost" onclick="closeModal('modal-accept')">Cancel</button>
      <button class="btn btn-ok" onclick="confirmAccept()">✓ Accept Task</button>
    </div>
  </div>
</div>

<div id="modal-reject" class="overlay" style="display:none;" onclick="overlayClose(event,'modal-reject')">
  <div class="modal">
    <div class="modal-hd"><h3>❌ Reject Task</h3><button class="close-btn" onclick="closeModal('modal-reject')">✕</button></div>
    <div class="modal-bd">
      <div id="reject-preview" style="background:#fff5f5;border-radius:10px;padding:11px 14px;font-size:13px;color:var(--muted);margin-bottom:16px;"></div>
      <div class="fg"><label>Reason for Rejection</label><textarea id="reject-reason" placeholder="Explain why you are rejecting this task..." style="min-height:90px;"></textarea></div>
    </div>
    <div class="modal-ft">
      <button class="btn btn-ghost" onclick="closeModal('modal-reject')">Cancel</button>
      <button class="btn btn-danger" onclick="confirmReject()">✕ Reject Task</button>
    </div>
  </div>
</div>

<div id="modal-done" class="overlay" style="display:none;" onclick="overlayClose(event,'modal-done')">
  <div class="modal">
    <div class="modal-hd"><h3>✅ Mark as Done</h3><button class="close-btn" onclick="closeModal('modal-done')">✕</button></div>
    <div class="modal-bd">
      <div id="done-preview" style="background:#f0faf5;border-radius:10px;padding:11px 14px;font-size:13px;color:var(--muted);margin-bottom:16px;"></div>
      <div class="fg">
        <label>Completion Note <span style="font-size:10px;text-transform:none;font-weight:400;">(optional)</span></label>
        <textarea id="done-note" placeholder="Add a note about how the task was completed..." style="min-height:90px;"></textarea>
      </div>
    </div>
    <div class="modal-ft">
      <button class="btn btn-ghost" onclick="closeModal('modal-done')">Cancel</button>
      <button class="btn btn-ok" onclick="confirmDone()">✓ Mark as Done</button>
    </div>
  </div>
</div>

<div id="modal-stat" class="overlay" style="display:none;" onclick="overlayClose(event,'modal-stat')">
  <div class="modal" style="max-width:620px;">
    <div class="modal-hd">
      <h3 id="stat-modal-title">Tasks</h3>
      <button class="close-btn" onclick="closeModal('modal-stat')">✕</button>
    </div>
    <div class="modal-bd" style="padding:0;max-height:70vh;overflow-y:auto;">
      <div id="stat-modal-body" style="padding:16px 24px;display:flex;flex-direction:column;gap:10px;"></div>
    </div>
  </div>
</div>

<!-- Load JS — api.js first, then app.js -->
<script src="js/api.js"></script>
<script src="js/app.js"></script>
</body>
</html>
