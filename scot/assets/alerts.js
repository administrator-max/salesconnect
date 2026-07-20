// ==========================================
// 7. DELAY ALERTS
// ------------------------------------------
// Reuses shipmentAlerts(d) from state.js (delay signals _d + ETA-overdue).
// ==========================================
function alertTypeBadge(t) {
  const m = { Sailing: "#f59e0b", Customs: "#ef4444", Unload: "#8b5cf6", ETA: "#dc2626" };
  return `<span style="display:inline-block;background:${m[t] || "#64748b"};color:#fff;border-radius:5px;padding:1px 7px;font-size:10px;font-weight:700;margin:1px 2px">${t}</span>`;
}

function rAlerts() {
  const host = document.getElementById("p-alerts");
  if (!host || !it) return;

  const rows = it
    .map(d => ({ d, al: shipmentAlerts(d) }))
    .filter(x => x.al.length)
    .sort((a, b) => b.al.length - a.al.length);

  const counts = { Sailing: 0, Customs: 0, Unload: 0, ETA: 0 };
  rows.forEach(x => x.al.forEach(a => { if (counts[a.t] != null) counts[a.t]++; }));

  const kpis = [
    ["⚠️ Delayed Shipments", rows.length, "#dc2626"],
    ["🚢 Sailing", counts.Sailing, "#f59e0b"],
    ["📋 Customs >3d", counts.Customs, "#ef4444"],
    ["🏗️ Unload >3d", counts.Unload, "#8b5cf6"],
    ["⏰ ETA Overdue", counts.ETA, "#dc2626"]
  ].map(([l, v, c]) =>
    `<div class="ch-sec" style="text-align:center;padding:14px 10px">
       <div style="font-size:26px;font-weight:800;color:${c}">${v}</div>
       <div style="font-size:11px;color:var(--muted);margin-top:2px">${l}</div>
     </div>`).join("");

  let body;
  if (!rows.length) {
    body = `<div class="ch-sec" style="text-align:center;padding:40px;color:var(--muted)">
      ✅ No delayed shipments. Everything is on schedule.</div>`;
  } else {
    const trs = rows.map(({ d, al }) => {
      const detail = al.map(a =>
        `${alertTypeBadge(a.t)}<span style="font-size:10px;color:var(--muted)">${a.d}</span>`).join(" ");
      return `<tr>
        <td><strong>${d.project_name || "-"}</strong></td>
        <td>${d.cargo_type || "-"}</td>
        <td>${d.product || "-"}</td>
        <td>${d.vessel_name || "-"}</td>
        <td>${fD(d.eta)}</td>
        <td>${d._p ? d._p.l : "-"}</td>
        <td>${detail}</td>
      </tr>`;
    }).join("");
    body = `<div class="ch-sec">
      <h3 style="font-size:14px;font-weight:700;margin-bottom:10px">⚠️ Delayed Shipments (${rows.length})</h3>
      <table class="upl-tb" style="width:100%">
        <tr><th>Project</th><th>Cargo</th><th>Product</th><th>Vessel</th><th>ETA</th><th>Position</th><th>Delay</th></tr>
        ${trs}
      </table>
      <p style="font-size:11px;color:var(--muted);margin-top:10px">
        Rules: sailing &gt; est + 2d · customs &gt; 3d · unloading &gt; 3d · ETA passed while still On Going.</p>
    </div>`;
  }

  host.innerHTML =
    `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px;margin-bottom:16px">${kpis}</div>${body}`;
}
