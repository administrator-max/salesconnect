// ==========================================
// 4. FORMS & EXCEL UPLOAD/EXPORT
// ==========================================
const FLDS = [
  {k:"cargo_type",l:"Cargo Type",t:"sel",o:["Import","Domestic"]},{k:"consignee",l:"Consignee",t:"txt"},
  {k:"project_name",l:"Project Name",t:"txt"},{k:"product",l:"Product",t:"txt"},
  {k:"quantity_mt",l:"Quantity (MT)",t:"num"},{k:"bl_number",l:"BL Number",t:"txt"},
  {k:"shipping_line",l:"Shipping Line",t:"txt"},{k:"vessel_name",l:"Vessel Name",t:"txt"},
  {k:"voyage_number",l:"Voyage Number",t:"txt"},{k:"pol",l:"Port of Loading",t:"txt"},
  {k:"pod",l:"Port of Discharge",t:"txt"},{k:"shipment_route",l:"Shipment Route",t:"sel",o:["Direct","Transit"]},
  {k:"etd",l:"ETD",t:"date"},{k:"eta",l:"ETA",t:"date"},
  {k:"shipment_type",l:"Shipment Type",t:"sel",o:["Breakbulk","Container"]},
  {k:"est_sailing_days",l:"Est Sailing (days)",t:"num"},{k:"actual_sailing_days",l:"Act Sailing (days)",t:"num"},
  {k:"pib_billing",l:"PIB Billing",t:"date"},{k:"bpn",l:"BPN",t:"date"},
  {k:"spjm",l:"SPJM",t:"date"},{k:"behandle",l:"Behandle",t:"date"},
  {k:"sppb",l:"SPPB",t:"date"},{k:"clearance_days",l:"Clearance (days)",t:"num"},
  {k:"start_unloading",l:"Start Unloading",t:"date"},{k:"finish_unloading",l:"Finish Unloading",t:"date"},
  {k:"unloading_days",l:"Unloading (days)",t:"num"},{k:"cargo_status",l:"Cargo Status",t:"sel",o:["Direct","Via Warehouse","Storage"]},
  {k:"start_delivery",l:"Start Delivery",t:"date"},{k:"enter_warehouse",l:"Enter Warehouse",t:"date"},
  {k:"delivery_days",l:"Delivery (days)",t:"num"},{k:"vendor_trucking",l:"Vendor Trucking",t:"txt"},
  {k:"warehouse_location",l:"Warehouse Location",t:"txt"},{k:"status",l:"Status",t:"sel",o:["Contract","Booked","On Going","Done"]},
  {k:"remarks",l:"Remarks",t:"txt"}
];

// ── Data-driven dropdown options (admin-managed via api/config) ───────────────
// Falls back to the FLDS defaults if the config API is unavailable.
let SCOT_OPTS = {};
const SCOT_CFG_MAP = { cargo_types:"cargo_type", shipment_types:"shipment_type", shipment_routes:"shipment_route", cargo_statuses:"cargo_status", statuses:"status" };
async function loadScotConfig() {
  try {
    const res = await fetch("api/config");
    if (!res.ok) return;
    const cfg = await res.json();
    for (const lk in SCOT_CFG_MAP) {
      if (Array.isArray(cfg[lk]) && cfg[lk].length) SCOT_OPTS[SCOT_CFG_MAP[lk]] = cfg[lk].map(r => r.value);
    }
  } catch (e) { console.warn("scot config load failed, using defaults:", e.message); }
}
function openScotSettings() {
  ConfigAdmin.open({
    basePath: "api", title: "SCOT Settings",
    lookups: [
      { key:"cargo_types",     title:"Cargo Types",     fields:[] },
      { key:"shipment_types",  title:"Shipment Types",  fields:[] },
      { key:"shipment_routes", title:"Shipment Routes", fields:[] },
      { key:"cargo_statuses",  title:"Cargo Status",    fields:[] },
      { key:"statuses",        title:"Status",          fields:[] },
    ],
    onChange: async () => { await loadScotConfig(); },
  });
}

function mkInput(f, val) {
  const v = val || "";
  if (f.t === "sel") {
    const opts = (SCOT_OPTS[f.k] || f.o).map(o => `<option value="${o}" ${v === o ? 'selected' : ''}>${o}</option>`).join("");
    return `<select class="sbox" data-fk="${f.k}" style="width:100%;padding:7px 10px"><option value="">-</option>${opts}</select>`;
  }
  if (f.t === "date") return `<input type="date" class="sbox" data-fk="${f.k}" value="${v}" style="width:100%;padding:7px 10px">`;
  if (f.t === "num") return `<input type="number" step="any" class="sbox" data-fk="${f.k}" value="${v}" style="width:100%;padding:7px 10px">`;
  return `<input type="text" class="sbox" data-fk="${f.k}" value="${v}" style="width:100%;padding:7px 10px">`;
}

function mkField(f, val) {
  return `<div style="margin-bottom:6px">
    <label style="font-size:10px;font-weight:600;color:var(--muted);display:block;margin-bottom:2px">${f.l}</label>
    ${mkInput(f, val)}
  </div>`;
}

async function readApiError(res, fallback) {
  try {
    const body = await res.json();
    return body.error || fallback;
  } catch (_) {
    return fallback;
  }
}

document.getElementById('tab-upd-og').addEventListener('click', () => {
  document.getElementById('frm-og').classList.toggle('hid');
  document.getElementById('frm-new').classList.add('hid');
  document.getElementById('sec-upl').classList.add('hid');
  document.getElementById('sec-ocr').classList.add('hid');
  const sel = document.getElementById('sel-og');
  sel.innerHTML = '<option value="">-- Select --</option>';
  it.filter(d => d.status !== 'Done').forEach(d => {
    sel.innerHTML += `<option value="${d._id}">${d.project_name} (${d.product}) [${d.status}]</option>`;
  });
  document.getElementById('frm-og-fields').innerHTML = '';
  document.getElementById('og-docs').innerHTML = 'Select a shipment to manage documents.';
});

document.getElementById('tab-upd-new').addEventListener('click', () => {
  document.getElementById('frm-new').classList.toggle('hid');
  document.getElementById('frm-og').classList.add('hid');
  document.getElementById('sec-upl').classList.add('hid');
  document.getElementById('sec-ocr').classList.add('hid');
  document.getElementById('frm-new-fields').innerHTML = FLDS.map(f => mkField(f, '')).join('');
  ocrFilledKeys = new Set(); // manual entry — no OCR-sourced fields
});

document.getElementById('tab-upl').addEventListener('click', () => {
  document.getElementById('sec-upl').classList.toggle('hid');
  document.getElementById('frm-og').classList.add('hid');
  document.getElementById('frm-new').classList.add('hid');
  document.getElementById('sec-ocr').classList.add('hid');
});

document.getElementById('tab-ocr').addEventListener('click', () => {
  document.getElementById('sec-ocr').classList.toggle('hid');
  document.getElementById('sec-upl').classList.add('hid');
  document.getElementById('frm-og').classList.add('hid');
});

document.getElementById('sel-og').addEventListener('change', function() {
  const id = +this.value;
  const d = it.find(x => x._id === id);
  if (!d) { document.getElementById('frm-og-fields').innerHTML = ''; return; }
  
  const html = FLDS.map(f => {
    let val = d[f.k];
    if (val == null) val = '';
    if (f.t === 'num' && val) val = String(val);
    return mkField(f, String(val));
  }).join('');
  
  document.getElementById('frm-og-fields').innerHTML = `<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">${html}</div>`;
});

document.getElementById('btn-upd-og').addEventListener('click', async function() {
  const id = parseInt(document.getElementById('sel-og').value, 10);
  if (!Number.isInteger(id) || id <= 0) { tst('Select a shipment first', 'er'); return; }
  
  const updates = {};
  document.querySelectorAll('#frm-og-fields [data-fk]').forEach(el => {
    const k = el.dataset.fk, v = el.value;
    if (!v || v === '-') updates[k] = null;
    else if (el.type === 'number') updates[k] = parseFloat(v) || null;
    else updates[k] = v;
  });

  const btn = document.getElementById('btn-upd-og');
  btn.disabled = true;
  
  try {
    const res = await fetch(`api/shipments/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (res.ok) {
      const row = await res.json();
      document.getElementById('frm-og').classList.add('hid');
      tst('Shipment updated in database', 'ok');
      patchLocal(row);
    } else throw new Error(await readApiError(res, 'Update failed'));
  } catch(e) { tst('Failed to update: ' + e.message, 'er'); }
  finally { btn.disabled = false; }
});

document.getElementById('btn-can-og').addEventListener('click', () => document.getElementById('frm-og').classList.add('hid'));

// Step 1: gather + validate, then open the review popup (does NOT save yet).
document.getElementById('btn-add-new').addEventListener('click', function() {
  const rec = {};
  let hasName = false;

  document.querySelectorAll('#frm-new-fields [data-fk]').forEach(el => {
    const k = el.dataset.fk, v = el.value;
    if (k === 'project_name' && v) hasName = true;
    if (!v || v === '-') return;
    if (el.type === 'number') rec[k] = parseFloat(v) || null;
    else rec[k] = v;
  });

  if (!hasName) { tst('Project Name is required', 'er'); return; }

  rec.no = D.length ? Math.max(...D.map(d => d.no || 0)) + 1 : 1;
  const rf = rec.eta || rec.etd || rec.start_delivery;
  rec.year = rf ? parseInt(rf.substring(0,4)) : new Date().getFullYear();
  if (!rec.status) rec.status = 'On Going';

  showSaveReview(rec);
});

function closeReview() { document.getElementById('mo').classList.add('hid'); }

// Verification popup: shows exactly what will be saved, OCR-sourced fields flagged.
function showSaveReview(rec) {
  const rows = FLDS
    .filter(f => rec[f.k] != null && rec[f.k] !== '')
    .map(f => {
      const ocr = ocrFilledKeys.has(f.k)
        ? ' <span class="mod-badge" style="background:#fef9c3;color:#92400e;border-color:#eab308">OCR</span>' : '';
      return `<tr><td style="color:var(--muted);white-space:nowrap;padding-right:12px">${f.l}</td><td><strong>${rec[f.k]}</strong>${ocr}</td></tr>`;
    }).join('');

  const note = ocrFilledKeys.size
    ? `<p style="font-size:11px;color:var(--muted);margin:10px 0 0">Tanda <span class="mod-badge" style="background:#fef9c3;color:#92400e;border-color:#eab308">OCR</span> = hasil baca dokumen — mohon diperiksa kebenarannya.</p>`
    : '';

  document.getElementById('mt').textContent = 'Review sebelum simpan';
  document.getElementById('mb').innerHTML = `
    <p style="font-size:12px;margin-bottom:10px">Periksa data berikut. Jika sudah benar, tekan <strong>Setujui &amp; Simpan</strong>.</p>
    <table class="upl-tb" style="width:100%">${rows}</table>
    ${note}
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end">
      <button class="cbtn" id="btn-review-cancel">Batal</button>
      <button class="abtn" id="btn-review-save">✅ Setujui &amp; Simpan</button>
    </div>`;
  document.getElementById('mo').classList.remove('hid');
  document.getElementById('btn-review-cancel').addEventListener('click', closeReview);
  document.getElementById('btn-review-save').addEventListener('click', () => commitNewShipment(rec));
}

// Step 2: user approved in the popup — actually persist.
async function commitNewShipment(rec) {
  const btn = document.getElementById('btn-review-save');
  if (btn) { btn.disabled = true; btn.innerText = 'Menyimpan…'; }
  try {
    const res = await fetch('api/shipments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(rec)
    });
    if (res.ok) {
      const row = await res.json();
      closeReview();
      document.getElementById('frm-new').classList.add('hid');
      tst('New shipment saved to database', 'ok');
      patchLocal(row, true); // marks it as Modified in the dashboard
      document.getElementById('sec-ocr').classList.add('hid');
      document.getElementById('ocr-status').innerHTML = '';
      ocrFilledKeys = new Set();
    } else throw new Error(await readApiError(res, 'Save failed'));
  } catch(e) {
    tst('Failed to save new shipment: ' + e.message, 'er');
    if (btn) { btn.disabled = false; btn.innerText = '✅ Setujui & Simpan'; }
  }
}

document.getElementById('btn-can-new').addEventListener('click', () => document.getElementById('frm-new').classList.add('hid'));

document.getElementById('tab-exp').addEventListener('click', () => {
  const hdrs = ['No','Cargo Type','Consignee','Project Name','Product','Quantity (MT)','BL Number','Shipping Line','Vessel Name','Voyage Number','POL','POD','Shipment Route','ETD','ETA','Shipment Type','Est Sailing (Day)','Act Sailing (Day)','PIB Billing','BPN','SPJM','Behandle','SPPB','Clearance (Day)','Start Unloading','Finish Unloading','Unloading (Day)','Cargo Status','Start Delivery','Enter Warehouse','Delivery (Day)','Vendor Trucking','Warehouse Location','Status','Remarks'];
  const keys = ['no','cargo_type','consignee','project_name','product','quantity_mt','bl_number','shipping_line','vessel_name','voyage_number','pol','pod','shipment_route','etd','eta','shipment_type','est_sailing_days','actual_sailing_days','pib_billing','bpn','spjm','behandle','sppb','clearance_days','start_unloading','finish_unloading','unloading_days','cargo_status','start_delivery','enter_warehouse','delivery_days','vendor_trucking','warehouse_location','status','remarks'];
  
  const wb = XLSX.utils.book_new();
  const wsData = [hdrs];
  
  D.forEach((d, i) => {
    wsData.push(keys.map(k => {
      if (k === 'no') return i + 1;
      return d[k] != null ? d[k] : '';
    }));
  });
  
  const ws = XLSX.utils.aoa_to_sheet(wsData);
  ws['!cols'] = hdrs.map((h, i) => {
    if (i === 2 || i === 3) return {wch:25};
    if (i === 5 || i === 7) return {wch:20};
    if (i === 9 || i === 10 || i === 31) return {wch:20};
    if (i === 0 || i >= 15 && i <= 25) return {wch:12};
    return {wch:16};
  });
  
  XLSX.utils.book_append_sheet(wb, ws, 'Shipment Database');
  XLSX.writeFile(wb, `SCOT_Database_${LU}.xlsx`);
  tst(`Excel exported: SCOT_Database_${LU}.xlsx`, 'ok');
});

// Bulk Upload Logic
const uz = document.getElementById("uz"), fi = document.getElementById("fi");
uz.addEventListener("click", () => fi.click());
uz.addEventListener("dragover", e => { e.preventDefault(); uz.classList.add("ov"); });
uz.addEventListener("dragleave", () => uz.classList.remove("ov"));
uz.addEventListener("drop", e => { e.preventDefault(); uz.classList.remove("ov"); if(e.dataTransfer.files.length) pF(e.dataTransfer.files[0]); });
fi.addEventListener("change", e => { if(e.target.files.length) pF(e.target.files[0]); });

function eD2(v) { 
  if (!v) return null; 
  if (typeof v === "string") { 
    if (v === "-") return null; 
    if (v.match(/^\d{4}-\d{2}-\d{2}/)) return v.substring(0,10); 
    return v; 
  } 
  if (typeof v === "number" && v > 40000) return new Date((v - 25569) * 864e5).toISOString().substring(0,10); 
  return v; 
}

function pR(row) { 
  const r = {}; 
  const fields = ['no','cargo_type','consignee','project_name','product','quantity_mt','bl_number','shipping_line','vessel_name','voyage_number','pol','pod','shipment_route','etd','eta','shipment_type','est_sailing_days','actual_sailing_days','pib_billing','bpn','spjm','behandle','sppb','clearance_days','start_unloading','finish_unloading','unloading_days','cargo_status','start_delivery','enter_warehouse','delivery_days','vendor_trucking','warehouse_location','status','remarks'];
  fields.forEach((k, i) => { 
    let v = row[i]; 
    if (v == null || v === "-" || v === "") { r[k] = null; return; } 
    if (['etd','eta','pib_billing','bpn','spjm','behandle','sppb','start_unloading','finish_unloading','start_delivery','enter_warehouse'].includes(k)) r[k] = eD2(v); 
    else if (['no','quantity_mt','est_sailing_days','actual_sailing_days','clearance_days','unloading_days','delivery_days'].includes(k)) r[k] = typeof v === "number" ? v : parseFloat(v) || null; 
    else r[k] = String(v).trim(); 
  }); 
  return r; 
}

function fM(r) { 
  return D.findIndex(d => d.project_name && r.project_name && d.project_name.trim().toLowerCase() === r.project_name.trim().toLowerCase() && d.cargo_type === r.cargo_type && (d.bl_number||"") === (r.bl_number||"")); 
}

let pnd = null;
function pF(file) {
  if (!file.name.match(/\.xlsx?$/i)) { tst("Format must be .xlsx", "er"); return; }
  const rd = new FileReader();
  rd.onload = function(e) {
    try {
      const wb = XLSX.read(e.target.result, {type:"array", cellDates:true});
      const nw = [], up = [], sk = [];
      wb.SheetNames.forEach(sn => {
        if (!sn.toLowerCase().includes("analyze")) return;
        const ws = wb.Sheets[sn];
        const j = XLSX.utils.sheet_to_json(ws, {header:1, raw:false, dateNF:"yyyy-mm-dd"});
        let sr = 0;
        for (let i=0; i < Math.min(5, j.length); i++) { if (String(j[i]?.[0]||"").toLowerCase().startsWith("no")) { sr = i + 1; break; } }
        
        for (let i = sr; i < j.length; i++) {
          const row = j[i];
          if (!row || !row[0] || String(row[0]).toLowerCase() === "no.") continue;
          const rec = pR(row);
          if (!rec.project_name) continue;
          
          const rf = rec.eta || rec.etd || rec.start_delivery;
          rec.year = rf ? parseInt(rf.substring(0,4)) : new Date().getFullYear();
          const mi = fM(rec);
          
          if (mi >= 0) {
            let ch = false;
            const fields = ['no','cargo_type','consignee','project_name','product','quantity_mt','bl_number','shipping_line','vessel_name','voyage_number','pol','pod','shipment_route','etd','eta','shipment_type','est_sailing_days','actual_sailing_days','pib_billing','bpn','spjm','behandle','sppb','clearance_days','start_unloading','finish_unloading','unloading_days','cargo_status','start_delivery','enter_warehouse','delivery_days','vendor_trucking','warehouse_location','status','remarks'];
            fields.forEach(k => {
              if (k === "no") return;
              if ((rec[k] || "") !== (D[mi][k] || "") && !(rec[k] == null && D[mi][k] == null)) ch = true;
            });
            if (ch) up.push({rec, mi}); else sk.push(rec);
          } else nw.push(rec);
        }
      });
      pnd = {nw, up, sk};
      sPv(nw, up, sk);
    } catch(err) { tst("Failed: " + err.message, "er"); }
  };
  rd.readAsArrayBuffer(file);
}

function sPv(nw, up, sk) {
  const el = document.getElementById("ur");
  el.innerHTML = `<div class="upl-r">
    <h4 style="font-size:14px;font-weight:700;margin-bottom:10px">Parse Results</h4>
    <div class="upl-s">
      <div class="upl-ch nw">🆕 ${nw.length} New</div>
      <div class="upl-ch up">🔄 ${up.length} Updates</div>
      <div class="upl-ch sk">⏭️ ${sk.length} Unchanged</div>
    </div>
    ${(nw.length || up.length) ? `
      <table class="upl-tb">
        <tr><th></th><th>Project</th><th>Product</th><th>Qty</th><th>Status</th><th>Action</th></tr>
        ${nw.map(r => `<tr><td>🆕</td><td>${r.project_name}</td><td>${r.product||"-"}</td><td>${fN(r.quantity_mt)}</td><td>${r.status||"-"}</td><td style="color:var(--grn);font-weight:700">Add</td></tr>`).join("")}
        ${up.map(u => `<tr><td>🔄</td><td>${u.rec.project_name}</td><td>${u.rec.product||"-"}</td><td>${fN(u.rec.quantity_mt)}</td><td>${u.rec.status||"-"}</td><td style="color:var(--pri);font-weight:700">Update</td></tr>`).join("")}
      </table>
      <div style="display:flex;gap:8px;margin-top:12px">
        <button class="abtn" id="ba">Apply ${nw.length + up.length} Changes</button>
        <button class="cbtn" id="bc">Cancel</button>
      </div>` 
    : `<p style="color:var(--muted);font-size:12px">No changes detected.</p><button class="cbtn" id="bc" style="margin-top:10px">OK</button>`}
  </div>`;
  
  document.getElementById("bc")?.addEventListener("click", () => { el.innerHTML=""; pnd=null; fi.value=""; });
  document.getElementById("ba")?.addEventListener("click", aC);
}

async function aC() {
  if (!pnd) return;
  const btn = document.getElementById("ba");
  btn.innerText = "Applying...";
  btn.disabled = true;

  const payload = {
    updates: pnd.up.map(x => ({ id: D[x.mi].id || D[x.mi]._id, data: x.rec })),
    inserts: pnd.nw
  };

  try {
    const res = await fetch('api/shipments/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      tst(`✅ ${pnd.nw.length} added, ${pnd.up.length} updated`, "ok");
      document.getElementById("ur").innerHTML = "";
      pnd = null;
      fi.value = "";
      await fetchShipments(); // Fetches fresh data
    } else throw new Error(await readApiError(res, "Server Error"));
  } catch (error) {
    tst("Failed to save changes: " + error.message, "er");
    btn.innerText = "Apply Changes";
    btn.disabled = false;
  }
}

// ==========================================
// OCR SCAN → AUTO-FILL + DOCUMENT LINKS
// ==========================================
let ocrFilledKeys = new Set(); // keys filled from the last OCR scan (for the review badge)

// Attach a document LINK (e.g. Google Drive URL) to a shipment. No file is
// stored — only the URL is saved, so there is no storage burden.
async function addDocumentLink(shipmentId, payload) {
  const res = await fetch(`api/shipments/${shipmentId}/documents`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await readApiError(res, "Save failed"));
  return res.json();
}

// ---- OCR drop zone ----
const oz = document.getElementById("oz"), ofi = document.getElementById("ofi");
oz.addEventListener("click", () => ofi.click());
oz.addEventListener("dragover", e => { e.preventDefault(); oz.classList.add("ov"); });
oz.addEventListener("dragleave", () => oz.classList.remove("ov"));
oz.addEventListener("drop", e => { e.preventDefault(); oz.classList.remove("ov"); if (e.dataTransfer.files.length) runOcr(e.dataTransfer.files[0]); });
ofi.addEventListener("change", e => { if (e.target.files.length) runOcr(e.target.files[0]); });

function ocrProcessingHtml(secs) {
  return `<div class="ch-sec" style="padding:16px"><span class="thk">📄 Memproses OCR… ${secs}s &nbsp;<span style="color:var(--muted);font-weight:400">(dokumen scan bisa ~30–90 dtk, mohon tunggu — jangan tutup tab)</span></span></div>`;
}

async function runOcr(file) {
  if (!/\.(pdf|png|jpe?g|webp|tiff?)$/i.test(file.name) && !(file.type || "").match(/pdf|image/)) {
    tst("Please choose a PDF or image", "er"); return;
  }
  const st = document.getElementById("ocr-status");
  st.innerHTML = ocrProcessingHtml(0);
  const fd = new FormData();
  fd.append("file", file);
  try {
    const res = await fetch("api/ocr", { method: "POST", body: fd });
    if (!res.ok) throw new Error(await readApiError(res, "OCR gagal (HTTP " + res.status + ")"));
    const { jobId } = await res.json();
    if (!jobId) throw new Error("Server tidak memberi job OCR");
    await pollOcr(jobId, st);
  } catch (e) {
    st.innerHTML = `<div class="ch-sec" style="padding:14px;color:var(--red)">⚠️ ${e.message}</div>`;
    tst(e.message, "er");
  }
}

// Poll an async OCR job until done/error (or a hard 4-minute cap).
async function pollOcr(jobId, st) {
  const started = Date.now();
  const MAX_MS = 4 * 60 * 1000;
  let netFails = 0;
  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const secs = Math.round((Date.now() - started) / 1000);
    st.innerHTML = ocrProcessingHtml(secs);
    if (Date.now() - started > MAX_MS) {
      throw new Error("OCR terlalu lama (>4 menit). Coba file lebih kecil / halaman lebih sedikit, atau isi form manual.");
    }
    let data;
    try {
      const r = await fetch(`api/ocr/${jobId}`);
      if (r.status === 404) throw new Error("Job OCR kedaluwarsa (server mungkin restart). Coba upload ulang.");
      if (!r.ok) { if (++netFails > 5) throw new Error("Gagal cek status OCR berulang kali."); continue; }
      data = await r.json();
      netFails = 0;
    } catch (e) {
      if (++netFails > 5) throw e;
      continue;
    }
    if (data.status === "done") {
      fillNewFormFromOcr(data);
      const n = Object.keys(data.fields || {}).length;
      st.innerHTML = `<div class="ch-sec" style="padding:14px">
        <div style="font-size:13px;font-weight:700;margin-bottom:4px">✅ Extracted ${n} field${n === 1 ? "" : "s"} dalam ${secs}s — review below, then Save. (The scanned file is not stored.)</div>
        <div style="font-size:11px;color:var(--muted)">Method: ${data.method} · Parser: ${data.source} · <span style="background:#fef9c3;padding:0 4px">Yellow</span> = OCR-filled · <span style="background:#fee2e2;padding:0 4px">Red</span> = low confidence (verify)</div>
      </div>`;
      return;
    }
    if (data.status === "error") throw new Error(data.error || "OCR gagal memproses dokumen");
    // else: still processing → continue polling
  }
}

function fillNewFormFromOcr(data) {
  document.getElementById("frm-new").classList.remove("hid");
  document.getElementById("frm-new-fields").innerHTML = FLDS.map(f => mkField(f, "")).join("");
  const fields = data.fields || {};
  const conf = data.confidence || {};
  ocrFilledKeys = new Set();
  document.querySelectorAll("#frm-new-fields [data-fk]").forEach(el => {
    const k = el.dataset.fk;
    if (!(k in fields) || fields[k] == null || fields[k] === "") return;
    ocrFilledKeys.add(k);
    let v = fields[k];
    if (el.type === "date") {
      const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
      v = m ? m[0] : "";
    } else if (el.type === "number") {
      v = String(v).replace(/[^\d.\-]/g, "");
    }
    el.value = v;
    const c = Number(conf[k]);
    const lowConf = Number.isFinite(c) && c < 0.6;
    el.style.background = lowConf ? "#fee2e2" : "#fef9c3";
    el.style.borderColor = lowConf ? "#ef4444" : "#eab308";
    el.title = "OCR-filled" + (Number.isFinite(c) ? " · confidence " + Math.round(c * 100) + "%" : "");
  });
  document.getElementById("frm-new").scrollIntoView({ behavior: "smooth", block: "start" });
}

// ---- Documents manager (inside the Update Shipment form) ----
document.getElementById("sel-og").addEventListener("change", function () {
  const id = parseInt(this.value, 10);
  if (Number.isInteger(id) && id > 0) loadOgDocs(id);
  else document.getElementById("og-docs").innerHTML = "Select a shipment to manage documents.";
});

async function loadOgDocs(shipmentId) {
  const host = document.getElementById("og-docs");
  host.innerHTML = '<span style="color:var(--muted)">Loading documents…</span>';
  try {
    const res = await fetch(`api/shipments/${shipmentId}/documents`);
    if (!res.ok) throw new Error(await readApiError(res, "Failed to load"));
    renderOgDocs(shipmentId, await res.json());
  } catch (e) {
    host.innerHTML = `<span style="color:var(--red)">${e.message}</span>`;
  }
}

function renderOgDocs(shipmentId, docs) {
  const host = document.getElementById("og-docs");
  const list = docs.length ? `<table class="upl-tb" style="width:100%;margin-bottom:10px">
    <tr><th>Type</th><th>Label</th><th>Link</th><th>Added</th><th></th></tr>
    ${docs.map(d => `<tr>
      <td>${d.doc_type || "-"}</td>
      <td>${d.file_name || "-"}</td>
      <td><a href="${d.storage_url}" target="_blank" rel="noopener">Open ↗</a></td>
      <td>${fD(d.uploaded_at)}</td>
      <td><a href="#" data-del="${d.id}" style="color:var(--red)">Remove</a></td>
    </tr>`).join("")}
  </table>` : '<p style="color:var(--muted);margin-bottom:10px">No document links yet.</p>';

  host.innerHTML = `${list}
    <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
      <select class="sbox" id="og-doc-type" style="width:auto;padding:6px 8px">
        <option value="BL">BL</option><option value="PIB">PIB</option><option value="SuratJalan">Surat Jalan</option><option value="Other">Other</option>
      </select>
      <input type="text" class="sbox" id="og-doc-label" placeholder="Label (optional)" style="width:140px;padding:6px 8px">
      <input type="url" class="sbox" id="og-doc-url" placeholder="Paste Google Drive link…" style="flex:1;min-width:200px;padding:6px 8px">
      <button class="abtn" id="og-doc-add" style="padding:6px 12px">🔗 Add Link</button>
    </div>`;

  document.getElementById("og-doc-add").addEventListener("click", async () => {
    const url = document.getElementById("og-doc-url").value.trim();
    if (!/^https?:\/\//i.test(url)) { tst("Paste a valid http(s) link", "er"); return; }
    const btn = document.getElementById("og-doc-add");
    btn.disabled = true;
    try {
      await addDocumentLink(shipmentId, {
        storage_url: url,
        doc_type: document.getElementById("og-doc-type").value,
        file_name: document.getElementById("og-doc-label").value.trim() || null
      });
      tst("Link added", "ok");
      loadOgDocs(shipmentId);
    } catch (e) { tst("Failed to add link: " + e.message, "er"); btn.disabled = false; }
  });

  host.querySelectorAll("[data-del]").forEach(a => {
    a.addEventListener("click", async (e) => {
      e.preventDefault();
      if (!confirm("Remove this document link?")) return;
      try {
        const r = await fetch(`api/documents/${a.dataset.del}`, { method: "DELETE" });
        if (!r.ok) throw new Error(await readApiError(r, "Delete failed"));
        tst("Link removed", "ok");
        loadOgDocs(shipmentId);
      } catch (err) { tst(err.message, "er"); }
    });
  });
}
