// public/js/app.js

const AV_COLORS = ['#D85A30','#185FA5','#1D9E75','#534AB7','#BA7517','#0F6E56','#A32D2D','#993556'];

// ── State ──────────────────────────────────────────────────────────────────
let staff      = [];
let todos      = [];
let session    = null;
let currentTab = 'sent';
let pendingId  = null;

// ── Status config ──────────────────────────────────────────────────────────
const ST = {
  pending:  { lbl: 'Pending',     pill: 'pill-pending',  bar: '#BA7517' },
  progress: { lbl: 'In Progress', pill: 'pill-progress', bar: '#185FA5' },
  done:     { lbl: 'Done',        pill: 'pill-done',     bar: '#1D9E75' },
  rejected: { lbl: 'Rejected',    pill: 'pill-rejected', bar: '#E24B4A' },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function gs(id)   { return staff.find(s => s.id === id); }
function ini(n)   { return n.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2); }
function avc(id)  { return AV_COLORS[id.split('').reduce((a, c) => a + c.charCodeAt(0), 0) % AV_COLORS.length]; }

function av(id, sz = 34, fs = 11) {
  const s = gs(id);
  if (!s) return '';
  return `<div class="av" style="width:${sz}px;height:${sz}px;background:${avc(id)};font-size:${fs}px;flex-shrink:0;">${ini(s.name)}</div>`;
}
function avSm(id) {
  const s = gs(id);
  if (!s) return '';
  return `<span class="av-sm" style="background:${avc(id)};">${ini(s.name)}</span>`;
}
function fd(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-GB', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}
function isOD(iso) { return iso && new Date(iso) < new Date(); }

// ── Init: load data from API ───────────────────────────────────────────────
async function init() {
  try {
    [staff, todos] = await Promise.all([API.getStaff(), API.getTasks()]);
    renderLoginList();
  } catch (err) {
    console.error('Init failed:', err);
    alert('Could not connect to server. Please refresh.');
  }
}

// ── Auth / session ─────────────────────────────────────────────────────────
function login(id) {
  session = id;
  closeAllModals();
  document.getElementById('no-session').style.display = 'none';
  document.getElementById('main-app').style.display   = 'block';
  const s = gs(id);
  document.getElementById('hdr-right').innerHTML =
    `<div class="hdr-name"><span>${s.position}</span><strong>${s.name}</strong></div>
     <button class="btn btn-ghost btn-sm" style="color:#ccc;border-color:#444;" onclick="openModal('login')">Switch Account</button>`;
  renderAll();
}

// ── Modals ─────────────────────────────────────────────────────────────────
function openModal(type) {
  if (type === 'login') {
    renderLoginList();
    document.getElementById('modal-login').style.display = 'flex';
  } else if (type === 'add-staff') {
    document.getElementById('staff-name').value = '';
    document.getElementById('staff-pos').value  = '';
    document.getElementById('modal-add-staff').style.display = 'flex';
    setTimeout(() => document.getElementById('staff-name').focus(), 100);
  }
}
function closeModal(id)    { document.getElementById(id).style.display = 'none'; }
function closeAllModals()  { document.querySelectorAll('.overlay').forEach(o => o.style.display = 'none'); }
function overlayClose(e, id) { if (e.target.id === id) closeModal(id); }

function renderLoginList() {
  document.getElementById('login-list').innerHTML = staff.map(s =>
    `<div class="staff-row ${s.id === session ? 'active' : ''}" onclick="login('${s.id}')">
      ${av(s.id)}
      <div class="staff-info">
        <div class="nm">${s.name}${s.id === session ? ` <span style="color:var(--accent);font-size:10px;">(You)</span>` : ''}</div>
        <div class="ps">${s.position}</div>
      </div>
    </div>`
  ).join('');
}

// ── Staff CRUD ─────────────────────────────────────────────────────────────
async function addStaff() {
  const name = document.getElementById('staff-name').value.trim();
  const pos  = document.getElementById('staff-pos').value.trim();
  if (!name || !pos) { alert('Name and position are required!'); return; }

  try {
    const newStaff = await API.addStaff(name, pos);
    staff.push(newStaff);
    closeModal('modal-add-staff');
    renderAll();
  } catch (err) {
    alert(err.message);
  }
}

// ── Task CRUD ──────────────────────────────────────────────────────────────
async function createTodo() {
  if (!session) { openModal('login'); return; }
  const title = document.getElementById('new-title').value.trim();
  const desc  = document.getElementById('new-desc').value.trim();
  const to    = document.getElementById('new-to').value;
  const pdl   = document.getElementById('new-pdl').value;

  if (!title) { alert('Task title cannot be empty!'); return; }
  if (!to)    { alert('Please select a staff member!'); return; }
  if (to === session) { alert('You cannot assign a task to yourself!'); return; }

  try {
    const task = await API.createTask({
      title, description: desc, from: session, to,
      proposedDeadline: pdl ? new Date(pdl).toISOString() : null,
    });
    todos.unshift(task);
    document.getElementById('new-title').value = '';
    document.getElementById('new-desc').value  = '';
    document.getElementById('new-to').value    = '';
    document.getElementById('new-pdl').value   = '';
    renderAll();
  } catch (err) {
    alert(err.message);
  }
}

// ── Accept ─────────────────────────────────────────────────────────────────
function openAccept(id) {
  pendingId = id;
  const t = todos.find(x => x.id === id);
  document.getElementById('accept-preview').innerHTML =
    `<strong>${t.title}</strong>${t.description ? `<br><span style="color:var(--muted)">${t.description}</span>` : ''}`;

  const propArea = document.getElementById('proposed-area');
  const dlArea   = document.getElementById('deadline-area');
  const def3     = (() => { const d = new Date(); d.setDate(d.getDate() + 3); return d.toISOString().slice(0, 16); })();

  if (t.proposedDeadline) {
    const defVal = new Date(t.proposedDeadline).toISOString().slice(0, 16);
    propArea.innerHTML = `<div class="proposed-box" id="prop-box">
      <div class="lbl">Deadline Proposed by Sender</div>
      <div class="val">${fd(t.proposedDeadline)}</div>
      <div class="btns">
        <button class="btn btn-ok btn-sm" style="flex:1;" onclick="useProp()">✓ Use This Deadline</button>
        <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="showRevise()">✏ Revise</button>
      </div></div>`;
    dlArea.innerHTML = `<div id="revise-area" style="display:none;" class="fg">
      <label>Revised Deadline</label>
      <input type="datetime-local" id="dl-input" value="${defVal}">
      <div class="revise-notice">⚠ Changes from sender's deadline will be recorded.</div>
      </div><input type="hidden" id="using-prop" value="false">`;
  } else {
    propArea.innerHTML = '';
    dlArea.innerHTML   = `<div class="fg"><label>Set Deadline</label>
      <input type="datetime-local" id="dl-input" value="${def3}"></div>`;
  }
  document.getElementById('modal-accept').style.display = 'flex';
}
function useProp() {
  const t = todos.find(x => x.id === pendingId);
  document.getElementById('prop-box').innerHTML =
    `<div style="font-size:13px;color:var(--ok);">✓ Using sender's deadline: <strong>${fd(t.proposedDeadline)}</strong></div>`;
  const ra = document.getElementById('revise-area');
  if (ra) ra.style.display = 'none';
  document.getElementById('using-prop').value = 'true';
}
function showRevise() {
  document.getElementById('prop-box').style.display = 'none';
  document.getElementById('revise-area').style.display = 'block';
  document.getElementById('using-prop').value = 'false';
  setTimeout(() => document.getElementById('dl-input').focus(), 50);
}
async function confirmAccept() {
  const t  = todos.find(x => x.id === pendingId);
  const up = document.getElementById('using-prop')?.value === 'true';
  let dl;
  if (up && t.proposedDeadline) {
    dl = t.proposedDeadline;
  } else {
    const v = document.getElementById('dl-input')?.value;
    if (!v) { alert('Please set a deadline!'); return; }
    dl = new Date(v).toISOString();
  }
  const revised = !!(t.proposedDeadline && dl !== t.proposedDeadline);

  try {
    const updated = await API.acceptTask(pendingId, dl, revised);
    updateLocalTask(updated);
    closeModal('modal-accept');
    renderMain(); updateCounts();
  } catch (err) { alert(err.message); }
}

// ── Reject ─────────────────────────────────────────────────────────────────
function openReject(id) {
  pendingId = id;
  const t = todos.find(x => x.id === id);
  document.getElementById('reject-preview').innerHTML =
    `<strong>${t.title}</strong>${t.description ? `<br><span style="color:var(--muted)">${t.description}</span>` : ''}`;
  document.getElementById('reject-reason').value = '';
  document.getElementById('modal-reject').style.display = 'flex';
  setTimeout(() => document.getElementById('reject-reason').focus(), 100);
}
async function confirmReject() {
  const reason = document.getElementById('reject-reason').value.trim();
  if (!reason) { alert('Please provide a reason for rejection!'); return; }
  try {
    const updated = await API.rejectTask(pendingId, reason);
    updateLocalTask(updated);
    closeModal('modal-reject'); renderMain(); updateCounts();
  } catch (err) { alert(err.message); }
}

// ── Done ───────────────────────────────────────────────────────────────────
function openDone(id) {
  pendingId = id;
  const t = todos.find(x => x.id === id);
  document.getElementById('done-preview').innerHTML =
    `<strong>${t.title}</strong>${t.description ? `<br><span style="color:var(--muted)">${t.description}</span>` : ''}`;
  document.getElementById('done-note').value = '';
  document.getElementById('modal-done').style.display = 'flex';
  setTimeout(() => document.getElementById('done-note').focus(), 100);
}
async function confirmDone() {
  const note = document.getElementById('done-note').value.trim();
  try {
    const updated = await API.doneTask(pendingId, note);
    updateLocalTask(updated);
    closeModal('modal-done'); renderMain(); updateCounts();
  } catch (err) { alert(err.message); }
}

// ── Delete ─────────────────────────────────────────────────────────────────
async function deleteTodo(id) {
  if (!confirm('Delete this task? This cannot be undone.')) return;
  try {
    await API.deleteTask(id);
    todos = todos.filter(x => x.id !== id);
    renderMain(); updateCounts();
  } catch (err) { alert(err.message); }
}

// ── Local state sync ───────────────────────────────────────────────────────
function updateLocalTask(updated) {
  const idx = todos.findIndex(t => t.id === updated.id);
  if (idx !== -1) todos[idx] = updated;
}

// ── Render ─────────────────────────────────────────────────────────────────
function renderAll()        { renderSidebar(); renderAssigneeOpts(); renderMain(); updateCounts(); }

function renderSidebar() {
  document.getElementById('staff-list-sidebar').innerHTML = staff.map(s =>
    `<div class="staff-row ${s.id === session ? 'active' : ''}" onclick="login('${s.id}')">
      ${av(s.id)}
      <div class="staff-info">
        <div class="nm">${s.name}${s.id === session ? ` <span style="color:var(--accent);font-size:10px;">(You)</span>` : ''}</div>
        <div class="ps">${s.position}</div>
      </div>
    </div>`
  ).join('');
}

function renderAssigneeOpts() {
  const sel = document.getElementById('new-to');
  const cur = sel.value;
  sel.innerHTML = '<option value="">— Select staff —</option>' +
    staff.filter(s => s.id !== session)
         .map(s => `<option value="${s.id}">${s.name} (${s.position})</option>`)
         .join('');
  if (cur) sel.value = cur;
}

function switchTab(t) {
  currentTab = t;
  document.querySelectorAll('.tab').forEach(el => el.classList.toggle('active', el.dataset.tab === t));
  const L = {
    dashboard: ['Active Task Board', 'All ongoing tasks grouped by sender'],
    sent:      ['Sent Tasks',        'Tasks you have assigned to other staff'],
    inbox:     ['Inbox',             'Tasks assigned to you'],
    all:       ['All Tasks',         'Every task involving you'],
  };
  document.getElementById('page-title').textContent = L[t][0];
  document.getElementById('page-sub').textContent   = L[t][1];
  document.getElementById('dashboard-view').style.display = t === 'dashboard' ? 'block' : 'none';
  document.getElementById('todo-list').style.display      = t === 'dashboard' ? 'none'  : 'flex';
  renderMain();
}

function renderMain() {
  if (currentTab === 'dashboard') { renderDashboard(); return; }
  const el = document.getElementById('todo-list');
  let list = [];
  if (currentTab === 'sent')  list = todos.filter(t => t.from === session);
  if (currentTab === 'inbox') list = todos.filter(t => t.to   === session);
  if (currentTab === 'all')   list = todos.filter(t => t.from === session || t.to === session);
  if (!list.length) {
    el.innerHTML = `<div class="empty">
      <div class="ico">${currentTab === 'inbox' ? '📭' : '📤'}</div>
      <h3>No tasks yet</h3>
      <p>${currentTab === 'inbox' ? 'No tasks have been assigned to you.' : 'You have not sent any tasks yet.'}</p>
    </div>`;
    return;
  }
  el.innerHTML = [...list]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .map(buildCard)
    .join('');
}

function buildCard(t) {
  const from    = gs(t.from), to = gs(t.to), cfg = ST[t.status];
  const isMine  = t.to   === session;
  const isSender= t.from === session;

  let dlRow = '';
  if (t.proposedDeadline && t.status === 'pending') {
    dlRow = `<div class="todo-dl dl-row-pending" style="border-color:#f0d890;">📅 Proposed deadline: <strong>${fd(t.proposedDeadline)}</strong></div>`;
  }
  if (t.deadline && (t.status === 'progress' || t.status === 'done')) {
    const ov  = isOD(t.deadline) && t.status === 'progress';
    const rev = t.deadlineRevised ? `<span class="tag-revised">Revised</span>` : '';
    dlRow = `<div class="todo-dl ${ov ? 'dl-row-warn' : 'dl-row-progress'}" style="border-color:${ov ? '#f7c1c1' : '#b0c8f0'};">🕐 ${ov ? '⚠ Overdue! ' : ''}<strong>${fd(t.deadline)}</strong>${rev}</div>`;
  }

  const reason = t.status === 'rejected' && t.rejectReason
    ? `<div class="todo-reason">❌ <strong>Reason:</strong> ${t.rejectReason}</div>` : '';
  const note   = t.status === 'done' && t.completionNote
    ? `<div class="todo-note">📝 <span><strong>Note:</strong> ${t.completionNote}</span></div>` : '';

  const canDelete = (t.status === 'done') || (t.status === 'progress' && isSender);
  const delBtn    = canDelete ? `<button class="btn btn-del btn-sm" onclick="deleteTodo('${t.id}')">🗑 Delete</button>` : '';

  let actions = '';
  if (isMine && t.status === 'pending')
    actions = `<div class="todo-actions"><button class="btn btn-ok btn-sm" onclick="openAccept('${t.id}')">✓ Accept &amp; Start</button><button class="btn btn-danger btn-sm" onclick="openReject('${t.id}')">✕ Reject</button></div>`;
  else if (isMine && t.status === 'progress')
    actions = `<div class="todo-actions"><button class="btn btn-ok btn-sm" onclick="openDone('${t.id}')">✓ Mark as Done</button>${delBtn}</div>`;
  else if (delBtn)
    actions = `<div class="todo-actions">${delBtn}</div>`;

  return `<div class="todo-card">
    <div class="todo-top">
      <div class="todo-bar" style="background:${cfg.bar};"></div>
      <div style="flex:1;min-width:0;">
        <div class="todo-title">${t.title}</div>
        ${t.description ? `<div class="todo-desc">${t.description}</div>` : ''}
      </div>
      <span class="pill ${cfg.pill}" style="flex-shrink:0;">${cfg.lbl}</span>
    </div>
    ${dlRow}${reason}${note}
    <div class="todo-meta">
      <span style="display:flex;align-items:center;gap:6px;">${avSm(t.from)} ${from?.name ?? '?'} <span>&#8594;</span> ${avSm(t.to)} <strong style="color:#111;">${to?.name ?? '?'}</strong></span>
      <span style="margin-left:auto;">${fd(t.createdAt)}</span>
    </div>
    ${actions}
  </div>`;
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function renderDashboard() {
  const el     = document.getElementById('dashboard-view');
  const active = todos.filter(t => t.status === 'pending' || t.status === 'progress');
  const stats  = [
    { n: active.length,                                          l: 'Active',      c: '#D85A30', key: 'active'   },
    { n: todos.filter(t => t.status === 'pending').length,      l: 'Pending',     c: '#BA7517', key: 'pending'  },
    { n: todos.filter(t => t.status === 'progress').length,     l: 'In Progress', c: '#185FA5', key: 'progress' },
    { n: todos.filter(t => t.status === 'done').length,         l: 'Done',        c: '#1D9E75', key: 'done'     },
  ];

  let html = `<div class="stat-grid">${stats.map(s =>
    `<div class="stat-card" onclick="openStatModal('${s.key}')"
      style="cursor:pointer;transition:transform .15s,box-shadow .15s;"
      onmouseover="this.style.transform='translateY(-2px)';this.style.boxShadow='0 6px 20px rgba(0,0,0,.1)'"
      onmouseout="this.style.transform='';this.style.boxShadow=''">
      <div class="stat-num" style="color:${s.c};">${s.n}</div>
      <div class="stat-lbl">${s.l}</div>
    </div>`).join('')}</div>`;

  if (!active.length) {
    html += `<div class="empty"><div class="ico">🎉</div><h3>No active tasks</h3><p>All tasks have been completed.</p></div>`;
    el.innerHTML = html; return;
  }

  const grp = {};
  active.forEach(t => { if (!grp[t.from]) grp[t.from] = []; grp[t.from].push(t); });

  Object.entries(grp).forEach(([sid, tasks]) => {
    const s  = gs(sid); if (!s) return;
    const pc = tasks.filter(t => t.status === 'pending').length;
    const rc = tasks.filter(t => t.status === 'progress').length;
    const cnt = [rc ? `${rc} in progress` : '', pc ? `${pc} pending` : ''].filter(Boolean).join(' · ');
    const rows = tasks.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt)).map(t => {
      const rec = gs(t.to), cfg2 = ST[t.status];
      let dl = '<span style="color:#ccc;">—</span>';
      if (t.status === 'progress' && t.deadline) {
        const ov = isOD(t.deadline);
        dl = `<span style="font-size:12px;${ov ? 'color:#a32d2d;font-weight:600;' : ''}">${ov ? '⚠ Overdue! ' : ''}${fd(t.deadline)}${t.deadlineRevised ? `<span class="tag-revised">Revised</span>` : ''}</span>`;
      } else if (t.status === 'pending' && t.proposedDeadline) {
        dl = `<span style="font-size:12px;color:#633806;">${fd(t.proposedDeadline)} <em style="font-size:10px;">(proposed)</em></span>`;
      }
      const canDel = (t.status === 'done') || (t.status === 'progress' && t.from === session);
      const delBtn = canDel
        ? `<button class="btn btn-del btn-sm" onclick="deleteTodo('${t.id}')">🗑 Delete</button>`
        : '<span style="color:#ccc;font-size:12px;">—</span>';
      return `<tr>
        <td><div class="dash-cell-title">${t.title}</div>${t.description ? `<div class="dash-cell-sub">${t.description}</div>` : ''}</td>
        <td><span class="pill ${cfg2.pill}">${cfg2.lbl}</span></td>
        <td><div style="display:flex;align-items:center;gap:7px;">${av(t.to, 26, 9)}<div><div style="font-size:12px;font-weight:600;">${rec?.name ?? '?'}</div><div style="font-size:10px;color:var(--muted);">${rec?.position ?? ''}</div></div></div></td>
        <td>${dl}</td><td>${delBtn}</td></tr>`;
    }).join('');
    html += `<div class="sender-block">
      <div class="sender-hd">${av(sid, 36, 12)}<div><div class="nm">${s.name}</div><div class="ps">${s.position}</div></div><span class="sender-cnt">${cnt}</span></div>
      <table class="dash-table"><thead><tr><th>Task</th><th>Status</th><th>Assigned To</th><th>Deadline</th><th>Action</th></tr></thead><tbody>${rows}</tbody></table>
    </div>`;
  });
  el.innerHTML = html;
}

// ── Stat modal ─────────────────────────────────────────────────────────────
function openStatModal(key) {
  const cfg = {
    active:   { title: 'Active Tasks',      filter: t => t.status === 'pending' || t.status === 'progress', color: '#D85A30' },
    pending:  { title: 'Pending Tasks',     filter: t => t.status === 'pending',                             color: '#BA7517' },
    progress: { title: 'In Progress Tasks', filter: t => t.status === 'progress',                            color: '#185FA5' },
    done:     { title: 'Completed Tasks',   filter: t => t.status === 'done',                                color: '#1D9E75' },
  }[key];

  const list = todos.filter(cfg.filter).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
  document.getElementById('stat-modal-title').innerHTML =
    `<span style="color:${cfg.color};">●</span> ${cfg.title} <span style="font-size:12px;font-weight:400;color:var(--muted);margin-left:4px;">(${list.length})</span>`;

  const body = document.getElementById('stat-modal-body');
  if (!list.length) {
    body.innerHTML = `<div style="text-align:center;padding:32px;color:var(--muted);font-size:13px;">No tasks in this category.</div>`;
  } else {
    body.innerHTML = list.map(t => {
      const from = gs(t.from), to = gs(t.to), cfg2 = ST[t.status];
      const dl = t.deadline
        ? `<div style="font-size:11px;color:${isOD(t.deadline) && t.status === 'progress' ? '#a32d2d' : '#185FA5'};margin-top:4px;">🕐 ${isOD(t.deadline) && t.status === 'progress' ? 'Overdue! ' : 'Deadline: '}${fd(t.deadline)}${t.deadlineRevised ? ' <span class="tag-revised">Revised</span>' : ''}</div>`
        : (t.proposedDeadline && t.status === 'pending'
          ? `<div style="font-size:11px;color:#BA7517;margin-top:4px;">📅 Proposed: ${fd(t.proposedDeadline)}</div>` : '');
      const note   = t.completionNote ? `<div style="font-size:11px;color:#0f6e56;margin-top:4px;">📝 ${t.completionNote}</div>` : '';
      const reason = t.rejectReason   ? `<div style="font-size:11px;color:#a32d2d;margin-top:4px;">❌ ${t.rejectReason}</div>`   : '';
      return `<div style="border:1px solid var(--border);border-radius:11px;padding:12px 14px;background:#fff;">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:8px;">
          <div style="font-size:14px;font-weight:600;">${t.title}</div>
          <span class="pill ${cfg2.pill}" style="flex-shrink:0;">${cfg2.lbl}</span>
        </div>
        ${t.description ? `<div style="font-size:12px;color:var(--muted);margin-bottom:6px;">${t.description}</div>` : ''}
        ${dl}${note}${reason}
        <div style="display:flex;align-items:center;gap:8px;margin-top:10px;padding-top:8px;border-top:1px solid #f0ece6;font-size:12px;color:var(--muted);">
          ${avSm(t.from)} <span>${from?.name ?? '?'}</span>
          <span style="margin:0 2px;">→</span>
          ${avSm(t.to)} <strong style="color:#111;">${to?.name ?? '?'}</strong>
          <span style="margin-left:auto;">${fd(t.createdAt)}</span>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('modal-stat').style.display = 'flex';
}

// ── Counts ─────────────────────────────────────────────────────────────────
function updateCounts() {
  document.getElementById('cnt-dash').textContent  = todos.filter(t => t.status === 'pending' || t.status === 'progress').length;
  document.getElementById('cnt-sent').textContent  = todos.filter(t => t.from === session).length;
  document.getElementById('cnt-inbox').textContent = todos.filter(t => t.to === session).length;
  document.getElementById('cnt-all').textContent   = todos.filter(t => t.from === session || t.to === session).length;
  document.getElementById('inbox-badge').textContent = todos.filter(t => t.to === session && t.status === 'pending').length;
}

// ── Boot ───────────────────────────────────────────────────────────────────
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeAllModals(); });
init();
