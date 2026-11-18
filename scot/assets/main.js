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

// Closing the modal goes through the editor first: while a shipment is open for
// editing it asks before throwing away unsaved fields (scotEditorBlocksClose in
// forms.js returns true to keep the modal up). Every other modal closes as before.
function closeModal() {
  if (typeof scotEditorBlocksClose === "function" && scotEditorBlocksClose()) return;
  document.getElementById("mo").classList.add("hid");
}
document.getElementById("mc").addEventListener("click", closeModal);
document.getElementById("mo").addEventListener("click", e => { if (e.target === e.currentTarget) closeModal(); });
document.addEventListener("keydown", e => {
  if (e.key === "Escape" && !document.getElementById("mo").classList.contains("hid")) closeModal();
});

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
// Rebuild the year filter (#y-dn) from the distinct years present in the data.
function populateYearFilter() {
  const sel = document.getElementById("y-dn");
  if (!sel) return;
  const years = [...new Set((D || []).map(d => String(d.year || "").trim()).filter(Boolean))]
    .sort((a, b) => b.localeCompare(a, undefined, { numeric: true }));
  const cur = sel.value || "all";
  const allOpt = document.createElement("option");
  allOpt.value = "all"; allOpt.textContent = "All Years";
  const opts = [allOpt].concat(years.map(y => {
    const o = document.createElement("option"); o.value = y; o.textContent = y; return o;
  }));
  sel.replaceChildren(...opts);
  sel.value = (cur === "all" || years.includes(cur)) ? cur : "all";
  if (typeof dY !== "undefined") dY = sel.value;
}

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
    populateYearFilter();

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

// ==========================================
// SINKRON DARI EXCEL DRIVE (scot_sync.php)
// ==========================================
// Tim Ops update di file Excel "Dispatch Delivery Master Data for Dashboard".
// Halaman ini meminta server mengecek file itu saat dibuka dan tiap 3 menit;
// server sendiri membatasi cek ke Drive (≥2 menit) dan hanya menulis bila file
// berubah. Tombol di header = cek sekarang tanpa menunggu.
function fmtSyncWaktu(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d)) return '—';
  return d.toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) + ' ' +
         d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}
function renderSync(st) {
  const b = document.getElementById('sync-x');
  if (!b) return;
  if (st && st.status === 'galat') {
    b.innerHTML = '⚠ Sinkron Excel gagal';
    b.title = st.error || '';
    b.style.color = '#b91c1c';
    return;
  }
  b.style.color = '#047857';
  b.innerHTML = '🔄 Excel · ' + fmtSyncWaktu(st && st.sinkron_at);
  const h = (st && st.hasil) || {};
  b.title = 'Data diambil dari Excel "' + ((st && st.file) || 'Dispatch Delivery Master Data') + '".\n'
    + 'Excel terakhir diubah: ' + fmtSyncWaktu(st && st.excel_diubah) + (st && st.excel_diubah_oleh ? ' oleh ' + st.excel_diubah_oleh : '') + '\n'
    + 'Sinkron terakhir: ' + fmtSyncWaktu(st && st.sinkron_at) + ' — ' + (h.diperbarui || 0) + ' diperbarui, ' + (h.baru || 0) + ' baru\n'
    + 'Update data di Excel; isian di dashboard tertimpa bila Excel berisi nilai lain.\nKlik untuk cek sekarang.';
}
async function syncExcel(paksa) {
  const b = document.getElementById('sync-x');
  if (paksa && b) { b.disabled = true; b.innerHTML = '⏳ Mengecek Excel…'; }
  try {
    const res = await fetch('api/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ paksa: !!paksa }) });
    const st = await res.json().catch(() => ({}));
    renderSync(res.ok ? st : Object.assign({ status: 'galat' }, st));
    if (st.status === 'sinkron') {
      const h = st.hasil || {};
      if ((h.diperbarui || 0) + (h.baru || 0) > 0) {
        tst(`Excel tersinkron: ${h.diperbarui || 0} diperbarui, ${h.baru || 0} baru`, 'ok');
        fetchShipments();
      } else if (paksa) tst('Excel tersinkron — tidak ada perubahan', 'ok');
    } else if (paksa && st.status === 'tetap') tst('Excel belum berubah sejak sinkron terakhir', 'ok');
    else if (!res.ok) tst('Sinkron Excel gagal: ' + (st.error || res.status), 'er');
  } catch (e) {
    renderSync({ status: 'galat', error: e.message });
  } finally { if (b) b.disabled = false; }
}
fetch('api/sync').then(r => r.json()).then(renderSync).catch(() => {});
syncExcel(false);
setInterval(() => syncExcel(false), 180000);
