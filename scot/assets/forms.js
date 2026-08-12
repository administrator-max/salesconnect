// ==========================================
// 4. FORMS & EXCEL UPLOAD/EXPORT
// ==========================================
// (re-uploaded 2026-07-21: prior deploy left this file 0 bytes on the host)
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
// value/label dropdown (value differs from label): document upload type.
let SCOT_DOC_TYPES = [{value:"BL",label:"BL"},{value:"PIB",label:"PIB"},{value:"SuratJalan",label:"Surat Jalan"},{value:"Other",label:"Other"}];
const SCOT_CFG_MAP = { cargo_types:"cargo_type", shipment_types:"shipment_type", shipment_routes:"shipment_route", cargo_statuses:"cargo_status", statuses:"status" };
async function loadScotConfig() {
  try {
    const res = await fetch("api/config");
    if (!res.ok) return;
    const cfg = await res.json();
    for (const lk in SCOT_CFG_MAP) {
      if (Array.isArray(cfg[lk]) && cfg[lk].length) SCOT_OPTS[SCOT_CFG_MAP[lk]] = cfg[lk].map(r => r.value);
    }
    if (Array.isArray(cfg.document_types) && cfg.document_types.length)
      SCOT_DOC_TYPES = cfg.document_types.map(r => ({ value: r.value, label: r.label || r.value }));
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
      { key:"document_types",  title:"Document Types",  fields:[["label","Label","text"]] },
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

// Fill the "update" dropdown. Done shipments are hidden, except `keepId` — used
// when an OCR match points at an already-finished shipment.
function buildOgOptions(keepId) {
  const sel = document.getElementById('sel-og');
  sel.innerHTML = '<option value="">-- Select --</option>';
  it.filter(d => d.status !== 'Done' || d._id === keepId).forEach(d => {
    sel.innerHTML += `<option value="${d._id}">${d.project_name} (${d.product}) [${d.status}]</option>`;
  });
}

document.getElementById('tab-upd-og').addEventListener('click', () => {
  document.getElementById('frm-og').classList.toggle('hid');
  document.getElementById('frm-new').classList.add('hid');
  document.getElementById('sec-upl').classList.add('hid');
  document.getElementById('sec-ocr').classList.add('hid');
  buildOgOptions();
  document.getElementById('frm-og-fields').innerHTML = '';
  document.getElementById('og-docs').innerHTML = 'Select a shipment to manage documents.';
  document.getElementById('ocr-og-status').innerHTML = '';
  ogOcrKeys = new Set();
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
  // fields are re-rendered from scratch → any OCR highlight from a previous
  // shipment is gone, so drop the bookkeeping too.
  ogOcrKeys = new Set();
  document.getElementById('ocr-og-status').innerHTML = '';
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

async function saveOgUpdate() {
  const id = currentOgId();
  if (!id) { tst('Select a shipment first', 'er'); return false; }

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
      document.getElementById('ocr-og-status').innerHTML = '';
      ogOcrKeys = new Set();
      tst('Shipment updated in database', 'ok');
      patchLocal(row);
      return true;
    }
    throw new Error(await readApiError(res, 'Update failed'));
  } catch(e) { tst('Failed to update: ' + e.message, 'er'); return false; }
  finally { btn.disabled = false; }
}

document.getElementById('btn-upd-og').addEventListener('click', saveOgUpdate);

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
let ocrFilledKeys = new Set(); // keys the last OCR scan filled in the NEW-shipment form
let ogOcrKeys = new Set();     // keys the last OCR scan wrote into the UPDATE form
const OCR_MAX_FILES = 8;       // per batch — keeps one scan session inside the Gemini quota

function currentOgId() {
  const v = parseInt(document.getElementById('sel-og').value, 10);
  return Number.isInteger(v) && v > 0 ? v : null;
}

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

// ---- OCR drop zones: "new" (Scan Document tab) and "og" (inside Update form) ----
function bindOcrZone(zoneId, inputId, mode) {
  const z = document.getElementById(zoneId), fin = document.getElementById(inputId);
  if (!z || !fin) return;
  z.addEventListener("click", () => fin.click());
  z.addEventListener("dragover", e => { e.preventDefault(); z.classList.add("ov"); });
  z.addEventListener("dragleave", () => z.classList.remove("ov"));
  z.addEventListener("drop", e => {
    e.preventDefault(); z.classList.remove("ov");
    if (e.dataTransfer.files.length) runOcrFiles(e.dataTransfer.files, mode);
  });
  // value is reset so re-uploading the SAME file (a corrected re-scan) still fires.
  fin.addEventListener("change", e => {
    if (e.target.files.length) runOcrFiles(e.target.files, mode);
    e.target.value = "";
  });
}
bindOcrZone("oz", "ofi", "new");
bindOcrZone("oz-og", "ofi-og", "og");

function ocrStatusEl(mode) {
  return document.getElementById(mode === "og" ? "ocr-og-status" : "ocr-status");
}

function ocrProcessingHtml(secs, label) {
  const which = label ? ` <span style="color:var(--muted);font-weight:400">${label}</span>` : "";
  return `<div class="ch-sec" style="padding:16px"><span class="thk">📄 Memproses OCR…${which} ${secs}s &nbsp;<span style="color:var(--muted);font-weight:400">(dokumen scan bisa ~30–90 dtk, mohon tunggu — jangan tutup tab)</span></span></div>`;
}

function isOcrFile(file) {
  return /\.(pdf|png|jpe?g|webp|tiff?)$/i.test(file.name) || /pdf|image/.test(file.type || "");
}

// Scan one or more documents, merge what they say, then hand off to the right form.
async function runOcrFiles(fileList, mode) {
  const all = Array.from(fileList);
  const files = all.filter(isOcrFile).slice(0, OCR_MAX_FILES);
  if (!files.length) { tst("Pilih file PDF atau gambar", "er"); return; }
  if (all.length > files.length) tst(`${all.length - files.length} file dilewati (bukan PDF/gambar atau melebihi ${OCR_MAX_FILES})`, "er");
  if (mode === "og" && !currentOgId()) { tst("Pilih shipment dulu sebelum scan dokumen update", "er"); return; }

  const st = ocrStatusEl(mode);
  const merged = { fields: {}, confidence: {}, docs: [], failed: [] };

  for (let i = 0; i < files.length; i++) {
    const label = files.length > 1 ? `(${i + 1}/${files.length}) ${files[i].name}` : files[i].name;
    try {
      const data = await runOneOcr(files[i], st, label);
      merged.docs.push({ name: files[i].name, type: data.docType || "", n: Object.keys(data.fields || {}).length });
      mergeOcrData(merged, data);
    } catch (e) {
      merged.failed.push({ name: files[i].name, error: e.message });
      tst(`${files[i].name}: ${e.message}`, "er");
    }
  }

  if (!merged.docs.length) {
    st.innerHTML = `<div class="ch-sec" style="padding:14px;color:var(--red)">⚠️ Tidak ada dokumen yang berhasil dibaca.<br>${merged.failed.map(f => `${f.name}: ${f.error}`).join("<br>")}</div>`;
    return;
  }
  if (mode === "og") applyOcrToOgForm(merged, st);
  else applyOcrToNewForm(merged, st);
}

async function runOneOcr(file, st, label) {
  st.innerHTML = ocrProcessingHtml(0, label);
  const fd = new FormData();
  fd.append("file", file);
  const res = await fetch("api/ocr", { method: "POST", body: fd });
  if (!res.ok) throw new Error(await readApiError(res, "OCR gagal (HTTP " + res.status + ")"));
  const { jobId } = await res.json();
  if (!jobId) throw new Error("Server tidak memberi job OCR");
  return pollOcr(jobId, st, label);
}

// Poll an async OCR job until done/error (or a hard 4-minute cap). Returns the result.
async function pollOcr(jobId, st, label) {
  const started = Date.now();
  const MAX_MS = 4 * 60 * 1000;
  let netFails = 0;
  while (true) {
    await new Promise(r => setTimeout(r, 2000));
    const secs = Math.round((Date.now() - started) / 1000);
    st.innerHTML = ocrProcessingHtml(secs, label);
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
    if (data.status === "done") return data;
    if (data.status === "error") throw new Error(data.error || "OCR gagal memproses dokumen");
    // else: still processing → continue polling
  }
}

// Several documents in one batch: keep the reading with the higher confidence.
function mergeOcrData(merged, data) {
  const f = data.fields || {}, c = data.confidence || {};
  for (const k in f) {
    if (f[k] == null || f[k] === "") continue;
    const nc = Number.isFinite(Number(c[k])) ? Number(c[k]) : 0.5;
    const oc = Number.isFinite(Number(merged.confidence[k])) ? Number(merged.confidence[k]) : -1;
    if (!(k in merged.fields) || nc > oc) { merged.fields[k] = f[k]; merged.confidence[k] = nc; }
  }
}

// Coerce an OCR string into something the input actually accepts ("" = unusable).
function ocrValueFor(el, v) {
  if (el.type === "date") {
    const m = String(v).match(/\d{4}-\d{2}-\d{2}/);
    return m ? m[0] : "";
  }
  if (el.type === "number") return String(v).replace(/[^\d.\-]/g, "");
  if (el.tagName === "SELECT") {
    const want = String(v).trim().toLowerCase();
    const opt = Array.from(el.options).find(o => o.value && o.value.toLowerCase() === want);
    return opt ? opt.value : "";
  }
  return String(v);
}

function markOcrInput(el, c) {
  const low = Number.isFinite(c) && c < 0.6;
  el.style.background = low ? "#fee2e2" : "#fef9c3";
  el.style.borderColor = low ? "#ef4444" : "#eab308";
  el.title = "OCR-filled" + (Number.isFinite(c) ? " · confidence " + Math.round(c * 100) + "%" : "");
}

function ocrDocsLine(merged) {
  const docs = merged.docs.map(d => `${d.name}${d.type ? ` <span style="color:var(--muted)">(${d.type})</span>` : ""}`).join(" · ");
  const failed = merged.failed.length
    ? `<div style="font-size:11px;color:var(--red);margin-top:4px">Gagal: ${merged.failed.map(f => `${f.name} — ${f.error}`).join("; ")}</div>` : "";
  return `<div style="font-size:11px;color:var(--muted);margin-top:4px">Dokumen: ${docs}</div>${failed}`;
}

// ---- Mode "new": fill a blank Add-New form, and offer an update if it already exists ----
function applyOcrToNewForm(merged, st) {
  document.getElementById("frm-new").classList.remove("hid");
  document.getElementById("frm-new-fields").innerHTML = FLDS.map(f => mkField(f, "")).join("");
  const fields = merged.fields, conf = merged.confidence;
  ocrFilledKeys = new Set();
  document.querySelectorAll("#frm-new-fields [data-fk]").forEach(el => {
    const k = el.dataset.fk;
    if (!(k in fields)) return;
    const v = ocrValueFor(el, fields[k]);
    if (v === "") return;
    el.value = v;
    ocrFilledKeys.add(k);
    markOcrInput(el, Number(conf[k]));
  });

  const n = ocrFilledKeys.size;
  const match = findShipmentForOcr(fields);
  st.innerHTML = `<div class="ch-sec" style="padding:14px">
    <div style="font-size:13px;font-weight:700;margin-bottom:4px">✅ ${n} kolom terisi dari ${merged.docs.length} dokumen — periksa di bawah, lalu Save. (File scan tidak disimpan.)</div>
    <div style="font-size:11px;color:var(--muted)"><span style="background:#fef9c3;padding:0 4px">Kuning</span> = hasil OCR · <span style="background:#fee2e2;padding:0 4px">Merah</span> = confidence rendah (wajib dicek)</div>
    ${ocrDocsLine(merged)}
    ${match ? `<div style="margin-top:10px;padding:10px;border:1px solid #eab308;background:#fefce8;border-radius:6px;font-size:12px">
      🔄 Dokumen ini sepertinya milik shipment yang <strong>sudah ada</strong>: <strong>${match.project_name}</strong>${match.bl_number ? ` — B/L ${match.bl_number}` : ""} [${match.status}].
      <button class="abtn" id="btn-ocr-to-og" style="margin-left:8px;padding:4px 10px">Update shipment ini</button>
    </div>` : ""}
  </div>`;

  if (match) {
    document.getElementById("btn-ocr-to-og").addEventListener("click", () => {
      document.getElementById("frm-new").classList.add("hid");
      openOgForOcr(match._id, merged);
    });
  }
  document.getElementById("frm-new").scrollIntoView({ behavior: "smooth", block: "start" });
}

// Is this document about a shipment we already track? Exactly one hit = confident.
function findShipmentForOcr(fields) {
  const norm = s => String(s || "").trim().toLowerCase();
  const bl = norm(fields.bl_number);
  if (bl) {
    const m = it.filter(d => norm(d.bl_number) === bl);
    if (m.length === 1) return m[0];
  }
  const pn = norm(fields.project_name);
  if (pn) {
    const m = it.filter(d => norm(d.project_name) === pn);
    if (m.length === 1) return m[0];
  }
  const vs = norm(fields.vessel_name), vy = norm(fields.voyage_number);
  if (vs && vy) {
    const m = it.filter(d => norm(d.vessel_name) === vs && norm(d.voyage_number) === vy);
    if (m.length === 1) return m[0];
  }
  return null;
}

// Jump from the scan tab straight into the update form for `id`, diff already loaded.
function openOgForOcr(id, merged) {
  document.getElementById("frm-og").classList.remove("hid");
  document.getElementById("sec-upl").classList.add("hid");
  buildOgOptions(id);
  const sel = document.getElementById("sel-og");
  sel.value = String(id);
  sel.dispatchEvent(new Event("change")); // renders fields + loads document links
  document.getElementById("ocr-status").innerHTML = "";
  document.getElementById("frm-og").scrollIntoView({ behavior: "smooth", block: "start" });
  applyOcrToOgForm(merged, ocrStatusEl("og"));
}

// ---- Mode "og": diff the document against the shipment, then apply on approval ----
function applyOcrToOgForm(merged, st) {
  const id = currentOgId();
  if (!id) { tst("Pilih shipment dulu", "er"); return; }
  const rows = ocrDiffForOg(merged);
  st.innerHTML = `<div class="ch-sec" style="padding:14px">
    <div style="font-size:13px;font-weight:700">📄 ${merged.docs.length} dokumen dibaca · ${rows.length} kolom berbeda dari data sekarang</div>
    ${ocrDocsLine(merged)}
  </div>`;
  if (!rows.length) { tst("Dokumen tidak memuat data baru — semua kolom sudah sama", "ok"); return; }
  showOgOcrReview(rows, merged);
}

// Only fields the document actually states AND that differ from what is on screen.
function ocrDiffForOg(merged) {
  const rows = [];
  document.querySelectorAll("#frm-og-fields [data-fk]").forEach(el => {
    const k = el.dataset.fk;
    if (!(k in merged.fields)) return;
    const nv = ocrValueFor(el, merged.fields[k]);
    if (nv === "" || String(el.value || "") === nv) return;
    rows.push({
      k, el, nv,
      cur: el.value || "",
      label: (FLDS.find(f => f.k === k) || {}).l || k,
      c: Number(merged.confidence[k]),
    });
  });
  return rows;
}

function showOgOcrReview(rows, merged) {
  const trs = rows.map((r, i) => {
    const low = Number.isFinite(r.c) && r.c < 0.6;
    const pct = Number.isFinite(r.c) ? Math.round(r.c * 100) + "%" : "—";
    return `<tr${low ? ' style="background:#fef2f2"' : ""}>
      <td><input type="checkbox" data-ocr-row="${i}"${low ? "" : " checked"}></td>
      <td style="color:var(--muted);white-space:nowrap;padding-right:10px">${r.label}</td>
      <td style="color:var(--muted)">${r.cur || "<em>kosong</em>"}</td>
      <td style="padding:0 6px">→</td>
      <td><strong>${r.nv}</strong></td>
      <td style="font-size:11px;color:${low ? "var(--red)" : "var(--muted)"}">${pct}</td>
    </tr>`;
  }).join("");

  const lowCount = rows.filter(r => Number.isFinite(r.c) && r.c < 0.6).length;

  document.getElementById("mt").textContent = "Hasil scan dokumen → update shipment";
  document.getElementById("mb").innerHTML = `
    <p style="font-size:12px;margin-bottom:10px">Dari <strong>${merged.docs.length}</strong> dokumen (${merged.docs.map(d => d.type || d.name).join(", ")}).
    Centang kolom yang mau diisi otomatis.${lowCount ? ` <span style="color:var(--red)">${lowCount} kolom confidence rendah — tidak dicentang otomatis, mohon diperiksa.</span>` : ""}</p>
    <table class="upl-tb" style="width:100%">
      <tr><th><input type="checkbox" id="ocr-all"></th><th>Kolom</th><th>Sekarang</th><th></th><th>Dari dokumen</th><th>Conf</th></tr>
      ${trs}
    </table>
    <div style="display:flex;gap:8px;margin-top:16px;justify-content:flex-end;flex-wrap:wrap">
      <button class="cbtn" id="btn-ocr-cancel">Batal</button>
      <button class="cbtn" id="btn-ocr-apply">Isi ke form dulu</button>
      <button class="abtn" id="btn-ocr-apply-save">✅ Isi &amp; Simpan</button>
    </div>`;
  document.getElementById("mo").classList.remove("hid");

  const boxes = () => Array.from(document.querySelectorAll("[data-ocr-row]"));
  document.getElementById("ocr-all").addEventListener("change", function () {
    boxes().forEach(b => { b.checked = this.checked; });
  });
  document.getElementById("btn-ocr-cancel").addEventListener("click", closeReview);
  document.getElementById("btn-ocr-apply").addEventListener("click", () => {
    const n = applyOgOcrRows(rows);
    closeReview();
    tst(n ? `${n} kolom terisi — periksa lalu tekan Save Update` : "Tidak ada kolom dipilih", n ? "ok" : "er");
  });
  document.getElementById("btn-ocr-apply-save").addEventListener("click", async () => {
    const n = applyOgOcrRows(rows);
    if (!n) { tst("Tidak ada kolom dipilih", "er"); return; }
    const btn = document.getElementById("btn-ocr-apply-save");
    btn.disabled = true; btn.innerText = "Menyimpan…";
    const ok = await saveOgUpdate();
    if (ok) closeReview();
    else { btn.disabled = false; btn.innerText = "✅ Isi & Simpan"; }
  });
}

function applyOgOcrRows(rows) {
  let n = 0;
  document.querySelectorAll("[data-ocr-row]").forEach(box => {
    if (!box.checked) return;
    const r = rows[+box.dataset.ocrRow];
    if (!r) return;
    r.el.value = r.nv;
    markOcrInput(r.el, r.c);
    ogOcrKeys.add(r.k);
    n++;
  });
  return n;
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
        ${SCOT_DOC_TYPES.map(o => `<option value="${o.value}">${o.label}</option>`).join("")}
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
