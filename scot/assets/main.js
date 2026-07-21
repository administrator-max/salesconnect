// ==========================================
// 6. APP CONTROLLER & INITIALIZATION
// ==========================================
const tm = {
  exec: "p-exec",
  ongoing: "p-ongoing",
  done: "p-done",
  alerts: "p-alerts",
  analytics: "p-analytics",
  consignee: "p-consignee",
  stats: "p-stats",
  upload: "p-upload"
};

document.querySelectorAll(".nb").forEach(t => {
  t.addEventListener("click", () => {
    cT = t.dataset.tab;
    document.querySelectorAll(".nb").forEach(x => x.classList.remove("act"));
    t.classList.add("act");
    
    Object.values(tm).forEach(p => document.getElementById(p).classList.add("hid"));
    document.getElementById(tm[cT]).classList.remove("hid");
    
    if (cT === "exec") rExec();
    if (cT === "analytics") rAnalytics();
    if (cT === "consignee") rConsignee();
    if (cT === "stats") { rCh(); rMo(); }
    if (cT === "done") rDn();
    if (cT === "ongoing") rOg();
    if (cT === "alerts") rAlerts();
  });
});

document.getElementById("mc").addEventListener("click", () => document.getElementById("mo").classList.add("hid"));
document.getElementById("mo").addEventListener("click", e => { if (e.target === e.currentTarget) e.currentTarget.classList.add("hid"); });

document.getElementById("q-og").addEventListener("input", e => { qO = e.target.value; rOg(); });
document.getElementById("q-dn").addEventListener("input", e => { qD = e.target.value; rDn(); });

document.querySelectorAll("[data-ds]").forEach(b => {
  b.addEventListener("click", () => {
    dS = b.dataset.ds;
    document.querySelectorAll("[data-ds]").forEach(x => x.classList.remove("act"));
    b.classList.add("act");
    rDn();
  });
});
document.getElementById("y-dn").addEventListener("change", e => { dY = e.target.value; rDn(); });

// Consignee dropdown initialization
document.getElementById('cns-data').addEventListener('change', function() { rConsSummary(); });
document.getElementById('cns-period').addEventListener('change', function() { rConsSummary(); });
document.getElementById('cns-month').addEventListener('change', function() { rConsSummary(); });
document.getElementById('cn-sel').addEventListener('change', function() { rConsignee(); });

(function() {
  const btn = document.getElementById('cns-pt-btn');
  const dd = document.getElementById('cns-pt-dd');
  const listEl = document.getElementById('cns-pt-list');
  const allCb = document.getElementById('cns-pt-all');
  
  if (!btn || !dd) return;

  btn.addEventListener('click', e => { e.stopPropagation(); dd.style.display = dd.style.display === 'none' ? 'block' : 'none'; });
  document.addEventListener('click', () => { dd.style.display = 'none'; });
  dd.addEventListener('click', e => { e.stopPropagation(); });
  
  const cnsPollId = setInterval(() => {
    if (!it) return;
    if (listEl.innerHTML !== "") { clearInterval(cnsPollId); return; }
    const cs = {};
    it.forEach(d => { if(d.consignee) cs[d.consignee.trim()] = 1; });
    const names = Object.keys(cs).sort();
    if (!names.length) return;
    listEl.innerHTML = names.map(c => `<label style="display:block;padding:4px 12px;font-size:11px;cursor:pointer"><input type="checkbox" class="cns-pt-cb" value="${c}" checked style="margin-right:6px">${c}</label>`).join('');
    clearInterval(cnsPollId);
  }, 1000);
  
  allCb.addEventListener('change', () => {
    listEl.querySelectorAll('.cns-pt-cb').forEach(cb => { cb.checked = allCb.checked; });
    updateLabel(); rConsSummary();
  });
  
  listEl.addEventListener('change', () => {
    let allChecked = true;
    listEl.querySelectorAll('.cns-pt-cb').forEach(cb => { if(!cb.checked) allChecked = false; });
    allCb.checked = allChecked;
    updateLabel(); rConsSummary();
  });
  
  function updateLabel() {
    const cbs = listEl.querySelectorAll('.cns-pt-cb');
    const selected = [];
    cbs.forEach(cb => { if(cb.checked) selected.push(cb.value); });
    if(selected.length === cbs.length || selected.length === 0) btn.textContent = 'All Consignees ▾';
    else if(selected.length === 1) btn.textContent = selected[0] + ' ▾';
    else btn.textContent = selected.length + ' Consignees ▾';
  }
})();

// Data Fetching Initialization
async function fetchShipments() {
  const tdElement = document.getElementById("td");
  if (tdElement) {
    tdElement.innerHTML = 'Fetching latest database...';
  }
  
  try {
    const res = await fetch('api/shipments');
    if (!res.ok) throw new Error(`Failed to fetch: ${res.status} ${res.statusText}`);
    
    const rawData = await res.json();
    if (!Array.isArray(rawData)) {
        throw new Error("Invalid data format received from server.");
    }
    D = rawData.map(formatDateForFrontend);
    
    updLU();
    ref();
    
    // Render current active tab BEFORE initializing AI
    if (cT === 'exec') rExec();
    else if (cT === 'ongoing') rOg();
    else if (cT === 'done') rDn();
    else if (cT === 'analytics') rAnalytics();
    else if (cT === 'consignee') rConsignee();
    else if (cT === 'stats') { rCh(); rMo(); }
    else if (cT === 'alerts') rAlerts();
    else rExec(); // Fallback to exec

    // Re-initialize AI Chat with fresh data safely
    try {
        if(typeof createOfflineAI === 'function') {
            aiR = createOfflineAI(it, D);
        }
    } catch(aiErr) {
        console.warn("AI Initialization failed, continuing without AI:", aiErr);
    }

  } catch (e) {
    console.error("Critical Fetch Error:", e);
    tst('Failed to fetch data from server: ' + e.message, 'er');
    if (tdElement) {
      tdElement.innerHTML = '<span style="color:var(--red)">Database Connection Failed</span>';
    }
  }
}

// Global Initialization
initFp('fp-exec');
initFp('fp-ana');
initFp('fp-cns');
initFp('fp-cndetail');

// Load admin-managed dropdown options first, then shipments.
loadScotConfig().then(fetchShipments);

// ==========================================
// LIVE UPDATES (polling every 15s)
// ==========================================
// The PHP host can't hold SSE connections, so poll instead. Never refetch
// mid-edit: if the modal (#mo) is open, skip this tick and catch up next time.
(function subscribeToPolling() {
  function modalIsOpen() {
    const mo = document.getElementById('mo');
    return mo && !mo.classList.contains('hid');
  }
  setInterval(() => { if (!modalIsOpen()) fetchShipments(); }, 15000);
})();
