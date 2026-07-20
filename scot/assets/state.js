// ==========================================
// 1. STATE & UTILITIES
// ==========================================
let D = []; // Source of truth: fetched from PostgreSQL
const T = new Date().toISOString().substring(0, 10);
let LU = T;
let aiR = null; 
let it, ogI, dnI, ctI, bkI;

const VF = {
  "HPC ATLANTIC": "https://www.vesselfinder.com/vessels/details/9667899",
  "JIN HAI PING": "https://www.vesselfinder.com/vessels/details/9591040",
  "MARSA PRIDE": "https://www.vesselfinder.com/vessels/details/9301445",
  "OSCAR": "https://www.vesselfinder.com/vessels/details/9545510",
  "MSC VOYAGER III": "https://www.vesselfinder.com/vessels/details/7820916",
  "MSC VOYAGER": "https://www.vesselfinder.com/vessels/details/7820916"
};

const IS = [
  {id:-2, i:"📝", l:"Contract"}, {id:-1, i:"📌", l:"Booked"}, {id:0, i:"📦", l:"Load"}, 
  {id:1, i:"🚢", l:"Sail"}, {id:2, i:"⚓", l:"Port"}, {id:3, i:"📋", l:"Customs"}, 
  {id:4, i:"🏗️", l:"Unload"}, {id:45, i:"🚚", l:"in Transit"}, {id:5, i:"🚛", l:"Deliver"}, {id:6, i:"🏭", l:"WH"}
];

const DS = [
  {id:-2, i:"📝", l:"Contract"}, {id:-1, i:"📌", l:"Booked"}, {id:4, i:"📦", l:"Ready"}, 
  {id:45, i:"🚚", l:"in Transit"}, {id:5, i:"🚛", l:"Deliver"}, {id:6, i:"🏭", l:"WH"}
];

function vfUrl(vn) {
  const n = (vn || "").replace("MV ", "").trim().toUpperCase();
  return VF[n] || "https://www.vesselfinder.com/vessels?name=" + encodeURIComponent(n);
}

function formatDateForFrontend(dObj) {
  const dateFields = ['etd', 'eta', 'pib_billing', 'bpn', 'spjm', 'behandle', 'sppb', 'start_unloading', 'finish_unloading', 'start_delivery', 'enter_warehouse'];
  const numericFields = ['quantity_mt', 'est_sailing_days', 'actual_sailing_days', 'clearance_days', 'unloading_days', 'delivery_days', 'no', 'year'];

  const formatted = { ...dObj };
  
  // 1. Format Postgres Dates safely
  dateFields.forEach(field => {
    if (formatted[field] && typeof formatted[field] === 'string') {
      formatted[field] = formatted[field].substring(0, 10);
    }
  });

  // 2. Parse Strings into Numbers (Fixes PostgreSQL NUMERIC concatenation bugs)
  numericFields.forEach(field => {
    if (formatted[field] != null && formatted[field] !== '') {
      formatted[field] = parseFloat(formatted[field]);
    } else {
      formatted[field] = null;
    }
  });

  return formatted;
}

function gp(d) {
  if (d.status === "Contract") return {s:-2, l:"Contract", u:""};
  if (d.status === "Booked") return {s:-1, l:"Booked", u:""};
  if (d.status === "On Going" && d.remarks && d.remarks.toLowerCase().includes("awaiting")) return {s:45, l:"in Transit", u:d.remarks};
  if (d.status === "Done") {
    return {s:6, l:d.warehouse_location ? "At Warehouse" : "Completed", u:d.warehouse_location || ""};
  }
  
  if (d.cargo_type === "Domestic") {
    if (d.enter_warehouse) return {s:6, l:"At Warehouse", u:d.warehouse_location || ""};
    if (d.start_delivery && !d.enter_warehouse) return {s:45, l:"In Transit", u:""};
    return {s:4, l:"Waiting", u:""};
  }
  
  if (d.enter_warehouse) return {s:6, l:"At Warehouse", u:d.warehouse_location || ""};
  if (d.start_delivery && !d.enter_warehouse) return {s:45, l:"In Transit", u:""};
  if (d.finish_unloading) return {s:4, l:"Unloaded", u:""};
  if (d.start_unloading) return {s:4, l:"Unloading", u:""};
  if (d.sppb) return {s:3, l:"Cleared", u:""};
  if (d.pib_billing) return {s:3, l:"Customs", u:""};
  if (d.eta && T >= d.eta) return {s:2, l:"At Port", u:d.pod || ""};
  if (d.etd && T >= d.etd) return {s:1, l:"Sailing", u:""};
  return {s:0, l:"Awaiting", u:""};
}

function gd(d) {
  const dl = [];
  if (d.est_sailing_days != null && d.actual_sailing_days != null && d.actual_sailing_days > d.est_sailing_days + 2) {
    dl.push({t:"Sailing", d: "+" + Math.round(d.actual_sailing_days - d.est_sailing_days) + "d"});
  }
  if (d.clearance_days != null && d.clearance_days > 3) {
    dl.push({t:"Customs", d: d.clearance_days + "d"});
  }
  if (d.unloading_days != null && d.unloading_days > 3) {
    dl.push({t:"Unload", d: d.unloading_days + "d"});
  }
  return dl;
}

function gm(d) {
  const r = d.cargo_type === "Import" ? (d.eta || d.etd) : d.start_delivery;
  return r ? r.substring(0, 7) : null;
}

// Alerts for a shipment = the existing delay signals (_d: Sailing/Customs/Unload)
// plus an "ETA passed while still On Going" overdue check. Kept separate from _d
// so existing delay analytics keep their original semantics.
function shipmentAlerts(d) {
  const a = (d._d || []).slice();
  if (d.status === "On Going" && d.eta && T >= d.eta) {
    a.push({ t: "ETA", d: "overdue" });
  }
  return a;
}

// IDs the user added/updated during this browser session — highlighted as modified.
let sessionTouched = new Set();

// "Recently modified" from timestamps: edited (updated_at meaningfully after
// created_at) within the last 48h. Freshly-seeded rows have updated_at == created_at
// so they are NOT flagged — only genuine edits light up.
function isRecentlyUpdated(d) {
  if (!d.updated_at) return false;
  const u = new Date(d.updated_at).getTime();
  if (isNaN(u)) return false;
  const c = d.created_at ? new Date(d.created_at).getTime() : u;
  return (u - c) > 60000 && (Date.now() - u) < 48 * 3600 * 1000;
}

function fD(d) {
  if (!d || d === "-") return "-";
  return new Date(d).toLocaleDateString("en-GB", {day:"numeric", month:"short", year:"numeric"});
}

function fN(n) {
  if (n == null || isNaN(n)) return "-";
  return Number(n).toLocaleString("en-US", {maximumFractionDigits:1});
}

function mN(ym) {
  if (!ym) return "-";
  const [y, m] = ym.split("-");
  return ["", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][+m] + " " + y;
}

function sc(d) {
  if (d.status === "Contract") return "ct";
  if (d.status === "Booked") return "bk";
  if (d.status === "On Going" && d._p.s === 45) return "it";
  if (d.status === "On Going") return "og";
  if (d._p.s === 6) return "wh";
  if (d._p.s >= 3) return "cust";
  return "sail";
}

function ref() {
  it = D.map(d => {
    const o = {...d, _id: d.id, _p: gp(d), _d: gd(d), _m: gm(d)};
    o._mod = sessionTouched.has(d.id) || isRecentlyUpdated(d);
    return o;
  });
  ogI = it.filter(d => d.status === "On Going");
  dnI = it.filter(d => d.status === "Done");
  ctI = it.filter(d => d.status === "Contract");
  bkI = it.filter(d => d.status === "Booked");
  document.getElementById("og-c").textContent = ogI.length;
  document.getElementById("dn-c").textContent = dnI.length;
  const alEl = document.getElementById("al-c");
  if (alEl) {
    const n = it.filter(d => shipmentAlerts(d).length).length;
    alEl.textContent = n;
    alEl.style.display = n ? "" : "none";
  }
}

function updLU() {
  const now = new Date();
  LU = now.toISOString().substring(0, 10);
  const h2 = String(now.getHours()).padStart(2, '0');
  const m2 = String(now.getMinutes()).padStart(2, '0');
  const luStr = `${fD(LU)} ${h2}:${m2}`;
  
  const tdEl = document.getElementById('td');
  if (tdEl) {
    tdEl.innerHTML = `Today: ${fD(T)} &nbsp;&middot;&nbsp; <span style="font-weight:600">Last Update: <span id="lu-date">${luStr}</span></span>`;
  }
}

function tst(msg, type) {
  const t = document.createElement("div");
  t.className = `tst ${type}`;
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// Apply a single row from POST/PUT into local state and re-render the active tab,
// avoiding a full api/shipments round-trip after each save.
function patchLocal(row, isNew) {
  if (!row || row.id == null) return;
  const formatted = formatDateForFrontend(row);
  sessionTouched.add(formatted.id);
  if (isNew) {
    D.unshift(formatted);
  } else {
    const idx = D.findIndex(d => d.id === formatted.id);
    if (idx >= 0) D[idx] = formatted; else D.unshift(formatted);
  }
  updLU();
  ref();
  if (typeof cT !== 'undefined') {
    if (cT === 'exec') rExec();
    else if (cT === 'ongoing') rOg();
    else if (cT === 'done') rDn();
    else if (cT === 'alerts') rAlerts();
    else if (cT === 'analytics') rAnalytics();
    else if (cT === 'consignee') rConsignee();
    else if (cT === 'stats') { rCh(); rMo(); }
  }
  try {
    if (typeof createOfflineAI === 'function') aiR = createOfflineAI(it, D);
  } catch (e) { /* ignore AI re-init errors */ }
}
