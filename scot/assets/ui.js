// ==========================================
// 3. UI RENDERING
// ==========================================
let cT = "exec", qO = "", qD = "", dS = "all", dY = "all", oO = null, oD = null;

function rPrg(d) {
  const st = d.cargo_type === "Import" ? IS : DS;
  const p = d._p;
  const ac = "#2563eb", dn = "#059669", td = "#e5e7eb";
  
  return `<div class="prg">
    ${st.map((s, i) => {
      const a = p.s >= s.id, c = p.s === s.id;
      const bg = c ? ac : a ? dn : td;
      const fc = a ? "white" : "#9ca3af";
      const shadow = c ? 'box-shadow:0 0 0 3px rgba(37,99,235,.2)' : '';
      const ln = i < st.length - 1 ? `<div class="prg-l" style="background:${a && p.s > s.id ? dn : td}"></div>` : "";
      return `
        <div class="prg-s">
          <div class="prg-w">
            <div class="prg-d" style="background:${bg};color:${fc};${shadow}">${s.i}</div>
            <div class="prg-t" ${a ? 'style="color:var(--text);font-weight:600"' : ""}>${s.l}</div>
          </div>
          ${ln}
        </div>`;
    }).join("")}
  </div>`;
}

function rDet(d) {
  const im = d.cargo_type === "Import";
  
  function g(t, r) {
    return `<div class="dg">
      <h5>${t}</h5>
      ${r.map(x => `<div class="dr"><span class="dk">${x[0]}</span><span class="dv ${x[2] ? x[2] : ""}">${x[1] || "-"}</span></div>`).join("")}
    </div>`;
  }
  
  if (im) {
    const sc2 = d.actual_sailing_days && d.est_sailing_days && d.actual_sailing_days > d.est_sailing_days + 2 ? "bad" : "good";
    const cc = d.clearance_days && d.clearance_days > 3 ? "bad" : "good";
    const uc = d.unloading_days && d.unloading_days > 3 ? "bad" : "good";
    
    const shipArr = [
      ["Consignee", d.consignee || "-"],
      ["BL", d.bl_number],
      ["Line", d.shipping_line],
      ["Vessel", d.vessel_name],
      ["Voyage", d.voyage_number],
      ["Type", d.shipment_type],
      ["Route", d.shipment_route]
    ];
    
    if (d.remarks) shipArr.push(["Remarks", d.remarks]);
    if (d.status === "On Going" && d.vessel_name) {
      shipArr.push(["Track", `<a href="${vfUrl(d.vessel_name)}" target="_blank" style="color:var(--pri);text-decoration:underline">VesselFinder ↗</a>`]);
    }
    
    return `<div class="det">
      ${g("Shipment", shipArr)}
      ${g("Schedule", [["Origin", d.pol], ["Dest", d.pod], ["ETD", fD(d.etd)], ["ETA", fD(d.eta)], ["Est Sail", (d.est_sailing_days || "-") + "d"], ["Act Sail", (d.actual_sailing_days || "-") + "d", sc2]])}
      ${g("Customs", [["PIB", fD(d.pib_billing)], ["BPN", fD(d.bpn)], ["SPJM", fD(d.spjm)], ["Behandle", fD(d.behandle)], ["SPPB", fD(d.sppb)], ["Duration", (d.clearance_days || "-") + "d", cc]])}
      ${g("Unload & Delivery", [["Start", fD(d.start_unloading)], ["End", fD(d.finish_unloading)], ["Duration", (d.unloading_days || "-") + "d", uc], ["Ship", fD(d.start_delivery)], ["WH In", fD(d.enter_warehouse)], ["Trucking", d.vendor_trucking || "-"], ["Location", d.warehouse_location || "-"]])}
    </div>`;
  }
  
  const delivArr = [
    ["Consignee", d.consignee || "-"],
    ["Product", d.product],
    ["Qty", fN(d.quantity_mt) + " MT"],
    ["Shipped", fD(d.start_delivery)],
    ["WH In", fD(d.enter_warehouse)],
    ["Duration", (d.delivery_days || "-") + "d"],
    ["Trucking", d.vendor_trucking || "-"],
    ["Location", d.warehouse_location || "-"]
  ];
  if (d.remarks) delivArr.push(["Remarks", d.remarks]);
  
  return `<div class="det">${g("Delivery", delivArr)}</div>`;
}

function rCd(d, op) {
  const im = d.cargo_type === "Import";
  const og = d.status === "On Going";
  const hd = d._d && d._d.length > 0;
  const pf = og ? "" : hd ? ` &middot; <span style="color:var(--red)">⚠ Delayed</span>` : ` &middot; <span style="color:var(--grn)">✓ On Time</span>`;
  
  let trackStr = "";
  if (og && d.vessel_name) {
    trackStr = ` &middot; <a href="${vfUrl(d.vessel_name)}" target="_blank" style="color:var(--pri);text-decoration:none;font-weight:600" onclick="event.stopPropagation()">📡 Track Vessel</a>`;
  }
  
  let remStr = "";
  if (d.remarks) {
    remStr = ` &middot; <span style="color:#7c3aed;font-style:italic">${d.remarks}</span>`;
  }
  
  return `<div>
    <div class="cd ${op ? "op" : ""} ${d._mod ? "mod" : ""}" data-cid="${d._id}">
      <div class="cd-r">
        <div class="cd-t ${im ? "imp" : "dom"}">${im ? "Import" : "Domestic"}</div>
        <div class="cd-i">
          <div class="cd-n">${d.project_name}${d._mod ? ' <span class="mod-badge">✏️ Modified</span>' : ''}</div>
          <div class="cd-d">
            ${d.consignee ? d.consignee + " &middot; " : ""} 
            ${d.product || "-"} &middot; ${fN(d.quantity_mt)} MT 
            ${d.vessel_name ? " &middot; " + d.vessel_name : ""}
            ${pf}${remStr}${trackStr}
          </div>
        </div>
        <div class="cd-s ${sc(d)}">${d._p.l}</div>
        <div class="cd-a">${op ? "▲" : "▼"}</div>
      </div>
      ${rPrg(d)}
    </div>
    ${op ? rDet(d) : ""}
  </div>`;
}

function bindCards(sel, stateKey) {
  document.querySelectorAll(sel + " .cd").forEach(c => {
    c.addEventListener("click", () => {
      const id = +c.dataset.cid;
      if (stateKey === "og") { oO = oO === id ? null : id; rOg(); } 
      else { oD = oD === id ? null : id; rDn(); }
    });
  });
}

function sMdl(title, list) {
  document.getElementById("mt").textContent = `${title} (${list.length})`;
  document.getElementById("mb").innerHTML = list.map(d => {
    const hd = d._d.length > 0;
    const info = hd ? d._d.map(x => `${x.t}: ${x.d}`).join(" &middot; ") : "All on time";
    return `
      <div class="mdl-i">
        <div style="font-size:16px">${d.cargo_type === "Import" ? "🌏" : "🏠"}</div>
        <div class="mdl-in">
          <div class="mdl-nm">${d.project_name}</div>
          <div class="mdl-sb">${d.product} &middot; ${fN(d.quantity_mt)} MT ${d.vessel_name ? "&middot; " + d.vessel_name : ""}</div>
          <div class="mdl-sb" style="color:${hd ? "var(--red)" : "var(--grn)"}">${info}</div>
        </div>
        <div class="mdl-bd" style="background:${hd ? "var(--red-bg)" : "var(--grn-bg)"};color:${hd ? "var(--red)" : "var(--grn)"}">
          ${hd ? "Delayed" : "On Time"}
        </div>
      </div>
    `;
  }).join("");
  document.getElementById("mo").classList.remove("hid");
}

function showKpiDetail(label) {
  const fi3 = getFilteredFp('fp-exec');
  let list = [];
  
  if (label === 'Total Shipments') list = fi3;
  else if (label === 'Contract') list = fi3.filter(d => d.status === 'Contract');
  else if (label === 'Booked') list = fi3.filter(d => d.status === 'Booked');
  else if (label === 'in Transit') list = fi3.filter(d => d.status === 'On Going' && d._p && d._p.s === 45);
  else if (label === 'On Going') list = fi3.filter(d => d.status === 'On Going' && (!d._p || d._p.s !== 45));
  else if (label === 'Completed') list = fi3.filter(d => d.status === 'Done');
  else if (label === 'Delayed') list = fi3.filter(d => d.status === 'Done' && d._d && d._d.length);
  
  if (!list.length) { tst('No data','er'); return; }
  sMdl(label, list);
}

function showOgDetail(f) {
  let list;
  if (f === 'ct') list = ctI;
  else if (f === 'bk') list = bkI;
  else if (f === 'transit') list = ogI.filter(d => d._p && d._p.s === 45);
  else if (f === 'og') list = ogI.filter(d => !d._p || d._p.s !== 45);
  else list = it.filter(d => d.status !== 'Done');
  
  if (!list.length) { tst('No data','er'); return; }
  sMdl(f === 'ct' ? 'Contract' : f === 'bk' ? 'Booked' : f === 'og' ? 'in Transit' : 'All Active', list);
}

function showDnDetail(f) {
  const fd = dnI.filter(d => {
    if (dS !== 'all' && d.cargo_type.toLowerCase() !== dS) return false;
    if (dY !== 'all' && d.year !== +dY) return false;
    if (qD) {
      const q = qD.toLowerCase();
      return [d.project_name, d.product, d.bl_number, d.vessel_name].some(v => v && String(v).toLowerCase().includes(q));
    }
    return true;
  });
  
  let list;
  if (f === 'ok') list = fd.filter(d => !d._d || !d._d.length);
  else if (f === 'dl') list = fd.filter(d => d._d && d._d.length);
  else list = fd;
  
  if (!list.length) { tst('No data','er'); return; }
  sMdl(f === 'ok' ? 'On Time' : f === 'dl' ? 'Delayed' : 'Completed', list);
}

function rExec() {
  const fi = getFilteredFp('fp-exec');
  if (!fi || !fi.length) return;
  
  const fiOg = fi.filter(d => d.status === 'On Going');
  const fiDn = fi.filter(d => d.status === 'Done');
  const fiCt = fi.filter(d => d.status === 'Contract');
  const fiBk = fi.filter(d => d.status === 'Booked');
  
  let totalMT = 0, ctMT = 0, bkMT = 0, ogMT2 = 0, dnMT = 0, dlCount = 0;
  
  fi.forEach(d => {
    const mt = d.quantity_mt || 0; 
    totalMT += mt;
    if (d.status === 'Contract') ctMT += mt;
    else if (d.status === 'Booked') bkMT += mt;
    else if (d.status === 'On Going') ogMT2 += mt;
    else if (d.status === 'Done') { dnMT += mt; if (d._d && d._d.length) dlCount++; }
  });
  
  const kpis = [
    {l:'Total Shipments', v:fi.length, c:'var(--text)', sub:`${fN(totalMT)} MT`},
    {l:'Contract', v:fiCt.length, c:'#7c3aed', sub:`${fN(ctMT)} MT`},
    {l:'Booked', v:fiBk.length, c:'#d97706', sub:`${fN(bkMT)} MT`},
    {l:'in Transit', v:fi.filter(d => d.status === 'On Going' && d._p && d._p.s === 45).length, c:'#0284c7', sub:`${fN(fi.filter(d => d.status === 'On Going' && d._p && d._p.s === 45).reduce((s,d) => s+(d.quantity_mt||0), 0))} MT`},
    {l:'On Going', v:fi.filter(d => d.status === 'On Going' && (!d._p || d._p.s !== 45)).length, c:'var(--org)', sub:`${fN(fi.filter(d => d.status === 'On Going' && (!d._p || d._p.s !== 45)).reduce((s,d) => s+(d.quantity_mt||0), 0))} MT`},
    {l:'Completed', v:fiDn.length, c:'var(--grn)', sub:`${fN(dnMT)} MT`},
    {l:'Delayed', v:dlCount, c:'var(--red)', sub:`${fiDn.length ? Math.round(dlCount / fiDn.length * 100) : 0}% of completed`}
  ];
  
  document.getElementById('exec-kpi').innerHTML = kpis.map(k => `
    <div class="sc" style="cursor:pointer" data-kpi="${k.l}" onclick="showKpiDetail(this.dataset.kpi)">
      <div class="sc-l">${k.l}</div>
      <div class="sc-v" style="color:${k.c}">${k.v}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:2px">${k.sub}</div>
    </div>
  `).join('');

  const statData = [
    {l:'Contract', v:ctMT, c:'#7c3aed'},
    {l:'Booked', v:bkMT, c:'#d97706'},
    {l:'in Transit', v:fi.filter(d => d.status === 'On Going' && d._p && d._p.s === 45).reduce((s,d) => s+(d.quantity_mt||0),0), c:'#0284c7'},
    {l:'On Going', v:fi.filter(d => d.status === 'On Going' && (!d._p || d._p.s !== 45)).reduce((s,d) => s+(d.quantity_mt||0),0), c:'var(--org)'},
    {l:'Completed', v:dnMT, c:'var(--grn)'}
  ];
  const mxT = Math.max(...statData.map(s => s.v));
  
  document.getElementById('ex-ton').innerHTML = `<div class="bar-c">
    ${statData.map(s => `
      <div class="bar-r">
        <div class="bar-lb">${s.l}</div>
        <div class="bar-tk"><div class="bar-f" style="width:${mxT ? s.v / mxT * 100 : 0}%;background:${s.c}">${fN(s.v)}</div></div>
        <div class="bar-v">MT</div>
      </div>
    `).join('')}
  </div>`;

  const stData = [
    {l:'Contract', v:fiCt.length, c:'#7c3aed'},
    {l:'Booked', v:fiBk.length, c:'#d97706'},
    {l:'in Transit', v:fi.filter(d => d.status === 'On Going' && d._p && d._p.s === 45).length, c:'#0284c7'},
    {l:'On Going', v:fi.filter(d => d.status === 'On Going' && (!d._p || d._p.s !== 45)).length, c:'#f59e0b'},
    {l:'Completed', v:fiDn.length, c:'#059669'},
    {l:'Delayed', v:dlCount, c:'#dc2626'}
  ];
  
  document.getElementById('ex-st').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center">
    ${stData.map(s => `
      <div style="text-align:center;min-width:70px">
        <div style="font-size:24px;font-weight:700;color:${s.c}">${s.v}</div>
        <div style="font-size:9px;color:var(--muted)">${s.l}</div>
        <div style="font-size:9px;color:var(--muted)">${Math.round(s.v / fi.length * 100)}%</div>
      </div>
    `).join('')}
  </div>`;

  const impDone = fiDn.filter(d => d.cargo_type === 'Import');
  const sails = impDone.map(d => d.actual_sailing_days).filter(Boolean);
  const avgS = sails.length ? (sails.reduce((a,b) => a+b, 0) / sails.length).toFixed(1) : '-';
  const minS = sails.length ? Math.min(...sails) : '-';
  const maxS = sails.length ? Math.max(...sails) : '-';
  
  document.getElementById('ex-sail').innerHTML = `
    <div style="display:flex;gap:20px;justify-content:center;margin:10px 0">
      <div style="text-align:center"><div style="font-size:10px;color:var(--muted)">Average</div><div style="font-size:22px;font-weight:700;color:var(--pri)">${avgS}d</div></div>
      <div style="text-align:center"><div style="font-size:10px;color:var(--muted)">Min</div><div style="font-size:22px;font-weight:700;color:var(--grn)">${minS}d</div></div>
      <div style="text-align:center"><div style="font-size:10px;color:var(--muted)">Max</div><div style="font-size:22px;font-weight:700;color:var(--red)">${maxS}d</div></div>
    </div>
    <div style="font-size:10px;color:var(--muted);text-align:center">Based on ${sails.length} completed import shipments</div>
  `;

  const delayed = fiDn.filter(d => d._d && d._d.length);
  const sailDl = delayed.filter(d => d._d.some(x => x.t === 'Sailing')).length;
  const custDl = delayed.filter(d => d._d.some(x => x.t === 'Customs')).length;
  const unlDl = delayed.filter(d => d._d.some(x => x.t === 'Unload')).length;
  
  document.getElementById('ex-delay').innerHTML = `
    <div style="text-align:center;margin:8px 0">
      <div style="font-size:22px;font-weight:700;color:var(--red)">${delayed.length}</div>
      <div style="font-size:10px;color:var(--muted)">Delayed of ${fiDn.length} completed (${fiDn.length ? Math.round(delayed.length / fiDn.length * 100) : 0}%)</div>
    </div>
    <div class="bar-c" style="margin-top:8px">
      <div class="bar-r"><div class="bar-lb">Sailing</div><div class="bar-tk"><div class="bar-f" style="width:${delayed.length ? sailDl / delayed.length * 100 : 0}%;background:var(--pri)">${sailDl}</div></div></div>
      <div class="bar-r"><div class="bar-lb">Customs</div><div class="bar-tk"><div class="bar-f" style="width:${delayed.length ? custDl / delayed.length * 100 : 0}%;background:var(--org)">${custDl}</div></div></div>
      <div class="bar-r"><div class="bar-lb">Unloading</div><div class="bar-tk"><div class="bar-f" style="width:${delayed.length ? unlDl / delayed.length * 100 : 0}%;background:var(--red)">${unlDl}</div></div></div>
    </div>
  `;

  const cont = impDone.filter(d => d.shipment_type === 'Container');
  const bb = impDone.filter(d => d.shipment_type === 'Breakbulk');
  
  function avgArr(arr, k) { 
    const vals = arr.map(d => d[k]).filter(v => typeof v === 'number'); 
    return vals.length ? (vals.reduce((a,b) => a+b, 0) / vals.length).toFixed(1) : '-'; 
  }
  
  const metrics = [['Sailing', 'actual_sailing_days'], ['Customs', 'clearance_days'], ['Unloading', 'unloading_days'], ['Delivery', 'delivery_days']];
  
  document.getElementById('ex-lead').innerHTML = `<table class="stbl">
    <tr><th>Metric</th><th style="text-align:right">Container</th><th style="text-align:right">Breakbulk</th></tr>
    ${metrics.map(m => `<tr><td>${m[0]} (days)</td><td class="n">${avgArr(cont, m[1])}</td><td class="n">${avgArr(bb, m[1])}</td></tr>`).join('')}
    <tr><td><strong>Count</strong></td><td class="n">${cont.length}</td><td class="n">${bb.length}</td></tr>
  </table>`;

  const cons = {};
  fi.forEach(d => { 
    const c = (d.consignee || '').trim(); 
    if (!c) return; 
    if (!cons[c]) cons[c] = {spjm:0, sppb:0, total:0}; 
    cons[c].total++; 
    if (d.spjm) cons[c].spjm++; 
    if (d.sppb) cons[c].sppb++; 
  });
  
  const ca = Object.entries(cons).sort((a,b) => b[1].total - a[1].total).slice(0,8);
  document.getElementById('ex-cons').innerHTML = `<table class="stbl">
    <tr><th>Consignee</th><th style="text-align:right">Shipments</th><th style="text-align:right">SPJM</th><th style="text-align:right">SPPB</th></tr>
    ${ca.map(e => `<tr><td>${e[0]}</td><td class="n">${e[1].total}</td><td class="n">${e[1].spjm}</td><td class="n">${e[1].sppb}</td></tr>`).join('')}
  </table>`;
}

function rOg() {
  if (!it) return;
  const allActive = it.filter(d => d.status !== "Done");
  const f = allActive.filter(d => {
    if (!qO) return true;
    const q = qO.toLowerCase();
    return [d.project_name, d.product, d.bl_number, d.vessel_name, d.shipping_line].some(v => v && String(v).toLowerCase().includes(q));
  });
  
  let mt = 0; 
  allActive.forEach(d => mt += d.quantity_mt || 0);
  
  document.getElementById("s-og").innerHTML = [
    {l:"Contract", v:ctI.length, c:"#7c3aed", f:"ct"},
    {l:"Booked", v:bkI.length, c:"#d97706", f:"bk"},
    {l:"in Transit", v:ogI.filter(d => d._p && d._p.s === 45).length, c:"#0284c7", f:"transit"},
    {l:"On Going", v:ogI.filter(d => !d._p || d._p.s !== 45).length, c:"var(--org)", f:"og"},
    {l:"Total Tonnage", v:`${fN(mt)} MT`, c:"var(--text)", f:"all"}
  ].map(s => `
    <div class="sc" style="cursor:pointer" onclick="showOgDetail('${s.f}')">
      <div class="sc-l">${s.l}</div>
      <div class="sc-v" style="color:${s.c}">${s.v}</div>
    </div>
  `).join("");
  
  document.getElementById("og-c").textContent = allActive.length;
  document.getElementById("c-og").innerHTML = `${f.length} active shipments — <span style="font-size:10px;color:var(--pri)">📡 Click vessel cards for live tracking via <a href="https://www.vesselfinder.com/" target="_blank" style="color:var(--pri)">VesselFinder.com</a></span>`;
  
  let bpHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:8px;margin-bottom:12px">';
  ogI.forEach(d => {
    const vfLink = vfUrl(d.vessel_name);
    const daysLeft = d.eta ? Math.max(0, Math.ceil((new Date(d.eta) - new Date(T)) / 864e5)) : null;
    const etaStr = d.eta ? fD(d.eta) : "-";
    const statusTxt = daysLeft === 0 ? "Arrived / At Port" : daysLeft !== null ? `ETA in ${daysLeft} days` : "ETA unknown";
    const statusColor = daysLeft === 0 ? "var(--grn)" : daysLeft !== null && daysLeft <= 2 ? "var(--org)" : "var(--pri)";
    bpHtml += `
      <div style="background:var(--white);border:1px solid var(--border);border-radius:8px;padding:12px;box-shadow:var(--sh)">
        <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:6px">
          <div style="font-size:12px;font-weight:700">${d.vessel_name || "-"}</div>
          <a href="${vfLink}" target="_blank" style="font-size:9px;color:var(--pri);text-decoration:none;font-weight:600;white-space:nowrap">📡 Track ↗</a>
        </div>
        <div style="font-size:10px;color:var(--muted)">${d.project_name} &middot; ${d.product || "-"}</div>
        <div style="font-size:10px;color:var(--muted);margin-top:2px">${d.pol || "-"} &rarr; ${d.pod || "-"}</div>
        <div style="display:flex;justify-content:space-between;margin-top:6px">
          <div style="font-size:11px;font-weight:600;color:${statusColor}">${statusTxt}</div>
          <div style="font-size:10px;color:var(--muted)">ETA: ${etaStr}</div>
        </div>
      </div>
    `;
  });
  bpHtml += "</div>";
  document.getElementById("bp-og").innerHTML = bpHtml;
  
  const iF = f.filter(d => d.cargo_type === "Import");
  const dF = f.filter(d => d.cargo_type === "Domestic");
  document.getElementById("l-og-i").innerHTML = iF.length ? iF.map(d => rCd(d, oO === d._id)).join("") : '<div class="emp">No active import shipments</div>';
  document.getElementById("l-og-d").innerHTML = dF.length ? dF.map(d => rCd(d, oO === d._id)).join("") : '<div class="emp">No active domestic shipments</div>';
  
  bindCards("#l-og-i", "og");
  bindCards("#l-og-d", "og");
}

function rDn() {
  if (!it) return;
  const f = dnI.filter(d => {
    if (dS !== "all" && d.cargo_type.toLowerCase() !== dS) return false;
    if (dY !== "all" && d.year !== +dY) return false;
    if (qD) {
      const q = qD.toLowerCase();
      return [d.project_name, d.product, d.bl_number, d.vessel_name, d.warehouse_location, d.shipping_line].some(v => v && String(v).toLowerCase().includes(q));
    }
    return true;
  });
  
  f.sort((a, b) => b.year - a.year || b.no - a.no);
  
  let mt = 0, dlc = 0;
  f.forEach(d => {
    mt += d.quantity_mt || 0;
    if (d._d.length) dlc++;
  });
  
  document.getElementById("s-dn").innerHTML = [
    {l:"Completed", v:f.length, c:"var(--grn)", f:"all"},
    {l:"On Time", v:f.length - dlc, c:"var(--grn)", f:"ok"},
    {l:"Delayed", v:dlc, c:"var(--red)", f:"dl"},
    {l:"Tonnage", v:`${fN(mt)} MT`, c:"var(--text)", f:"all2"}
  ].map(s => `
    <div class="sc" style="cursor:pointer" onclick="showDnDetail('${s.f}')">
      <div class="sc-l">${s.l}</div>
      <div class="sc-v" style="color:${s.c}">${s.v}</div>
    </div>
  `).join("");
  
  document.getElementById("c-dn").textContent = `${f.length} of ${dnI.length} shipments`;
  
  const iF = f.filter(d => d.cargo_type === "Import");
  const dF = f.filter(d => d.cargo_type === "Domestic");
  
  document.getElementById("l-dn-i").innerHTML = iF.length ? iF.map(d => rCd(d, oD === d._id)).join("") : '<div class="emp">No import shipments found</div>';
  document.getElementById("l-dn-d").innerHTML = dF.length ? dF.map(d => rCd(d, oD === d._id)).join("") : '<div class="emp">No domestic shipments found</div>';
  
  bindCards("#l-dn-i", "dn");
  bindCards("#l-dn-d", "dn");
}

function rCh() {
  if (!it) return;
  const pr = {};
  it.forEach(d => {
    const p = d.product || "Other";
    if (!pr[p]) pr[p] = {c:0, mt:0};
    pr[p].c++; pr[p].mt += d.quantity_mt || 0;
  });
  const pa = Object.entries(pr).sort((a,b) => b[1].c - a[1].c).slice(0, 10);
  const mx1 = Math.max(...pa.map(x => x[1].c));
  
  document.getElementById("cp").innerHTML = `<div class="bar-c">
    ${pa.map(([k, v]) => `
      <div class="bar-r">
        <div class="bar-lb" title="${k}">${k}</div>
        <div class="bar-tk"><div class="bar-f" style="width:${v.c / mx1 * 100}%;background:var(--pri)">${v.c}</div></div>
        <div class="bar-v">${fN(v.mt)} MT</div>
      </div>
    `).join("")}
  </div>`;
  
  const li = {};
  it.forEach(d => {
    const l = (d.shipping_line || "").trim();
    if (!l) return;
    if (!li[l]) li[l] = {c:0, dl:0};
    li[l].c++;
    if (d._d && d._d.length) li[l].dl++;
  });
  const la = Object.entries(li).sort((a,b) => b[1].c - a[1].c);
  const mx2 = Math.max(...la.map(x => x[1].c));
  
  document.getElementById("cl").innerHTML = `<div class="bar-c">
    ${la.map(([k, v]) => `
      <div class="bar-r">
        <div class="bar-lb" title="${k}">${k}</div>
        <div class="bar-tk">
          <div class="bar-f" style="width:${(v.c - v.dl) / mx2 * 100}%;background:var(--grn)">${v.c - v.dl}</div>
          <div class="bar-f" style="width:${v.dl / mx2 * 100}%;background:var(--red);border-radius:0 4px 4px 0">${v.dl || ""}</div>
        </div>
        <div class="bar-v">${v.c} total</div>
      </div>
    `).join("")}
  </div><div style="display:flex;gap:12px;margin-top:8px;font-size:9px;color:var(--muted)"><span>🟢 On Time</span><span>🔴 Delayed</span></div>`;
  
  const wh = {};
  it.forEach(d => {
    const w = (d.warehouse_location || "").trim();
    if (!w) return;
    if (!wh[w]) wh[w] = {c:0, mt:0};
    wh[w].c++; wh[w].mt += d.quantity_mt || 0;
  });
  const wa = Object.entries(wh).sort((a,b) => b[1].c - a[1].c);
  const mx3 = Math.max(...wa.map(x => x[1].c));
  
  document.getElementById("cw").innerHTML = `<div class="bar-c">
    ${wa.map(([k, v]) => `
      <div class="bar-r">
        <div class="bar-lb" title="${k}">${k}</div>
        <div class="bar-tk"><div class="bar-f" style="width:${v.c / mx3 * 100}%;background:var(--org)">${v.c}</div></div>
        <div class="bar-v">${fN(v.mt)} MT</div>
      </div>
    `).join("")}
  </div>`;
  
  const id2 = dnI.filter(d => d.cargo_type === "Import");
  function av(a) { return a.length ? (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1) : "-"; }
  function mn2(a) { return a.length ? Math.min(...a) : "-"; }
  function mx4(a) { return a.length ? Math.max(...a) : "-"; }
  
  const sA = id2.map(d => d.actual_sailing_days).filter(Boolean);
  const cA = id2.map(d => d.clearance_days).filter(x => typeof x === "number");
  const uA = id2.map(d => d.unloading_days).filter(x => typeof x === "number");
  const dA = id2.map(d => d.delivery_days).filter(x => typeof x === "number");
  
  document.getElementById("cs").innerHTML = `<table class="stbl">
    <tr><th>Metric</th><th style="text-align:right">Avg</th><th style="text-align:right">Min</th><th style="text-align:right">Max</th></tr>
    <tr><td>Sailing (days)</td><td class="n">${av(sA)}</td><td class="n">${mn2(sA)}</td><td class="n">${mx4(sA)}</td></tr>
    <tr><td>Customs (days)</td><td class="n">${av(cA)}</td><td class="n">${mn2(cA)}</td><td class="n">${mx4(cA)}</td></tr>
    <tr><td>Unloading (days)</td><td class="n">${av(uA)}</td><td class="n">${mn2(uA)}</td><td class="n">${mx4(uA)}</td></tr>
    <tr><td>Delivery (days)</td><td class="n">${av(dA)}</td><td class="n">${mn2(dA)}</td><td class="n">${mx4(dA)}</td></tr>
    <tr><td><strong>Total</strong></td><td class="n" colspan="3"><strong>${it.length}</strong> shipments (${fN(it.reduce((s,d) => s+(d.quantity_mt||0), 0))} MT)</td></tr>
    <tr><td><strong>Delay Rate</strong></td><td class="n" colspan="3"><strong>${(it.filter(d => d._d && d._d.length).length / it.length * 100).toFixed(1)}%</strong></td></tr>
  </table>`;
  
  const vn = {};
  it.forEach(d => {
    const v = (d.vendor_trucking || "").trim();
    if (!v) return;
    if (!vn[v]) vn[v] = {c:0, mt:0};
    vn[v].c++; vn[v].mt += d.quantity_mt || 0;
  });
  const va = Object.entries(vn).sort((a,b) => b[1].c - a[1].c);
  const mx5 = Math.max(...va.map(x => x[1].c));
  
  document.getElementById("cv").innerHTML = `<div class="bar-c">
    ${va.map(([k, v]) => `
      <div class="bar-r">
        <div class="bar-lb" title="${k}">${k}</div>
        <div class="bar-tk"><div class="bar-f" style="width:${v.c / mx5 * 100}%;background:#8b5cf6">${v.c}</div></div>
        <div class="bar-v">${fN(v.mt)} MT</div>
      </div>
    `).join("")}
  </div>`;
  
  const pl = {};
  it.forEach(d => {
    const p = (d.pol || "").trim();
    if (!p) return;
    if (!pl[p]) pl[p] = {c:0, mt:0};
    pl[p].c++; pl[p].mt += d.quantity_mt || 0;
  });
  const pla = Object.entries(pl).sort((a,b) => b[1].c - a[1].c);
  const mx6 = Math.max(...pla.map(x => x[1].c));
  
  document.getElementById("cpl").innerHTML = `<div class="bar-c">
    ${pla.map(([k, v]) => `
      <div class="bar-r">
        <div class="bar-lb" title="${k}">${k}</div>
        <div class="bar-tk"><div class="bar-f" style="width:${v.c / mx6 * 100}%;background:#06b6d4">${v.c}</div></div>
        <div class="bar-v">${fN(v.mt)} MT</div>
      </div>
    `).join("")}
  </div>`;
}

function rMo() {
  if (!it) return;
  const mm = {};
  it.forEach(d => {
    if (!d._m) return;
    if (!mm[d._m]) mm[d._m] = {ok:[], dl:[]};
    d._d.length ? mm[d._m].dl.push(d) : mm[d._m].ok.push(d);
  });
  const ms = Object.keys(mm).sort();
  
  document.getElementById("mg").innerHTML = ms.map(m => {
    const ok = mm[m].ok.length, dl = mm[m].dl.length, t = ok + dl;
    const pct = t ? Math.round(ok / t * 100) : 0;
    return `
      <div class="mc">
        <div class="mc-h"><div class="mc-n">${mN(m)}</div><div class="mc-c">${t} shipments</div></div>
        <div class="mc-b">
          <div class="mc-bg" style="width:${pct}%"></div>
          <div class="mc-br" style="width:${100 - pct}%"></div>
        </div>
        <div class="mc-r">
          <div class="mc-bt ok" data-m="${m}" data-t="ok">
            <div class="mc-bn" style="color:var(--grn)">${ok}</div><div class="mc-bl">On Time</div>
          </div>
          <div class="mc-bt bad" data-m="${m}" data-t="dl">
            <div class="mc-bn" style="color:var(--red)">${dl}</div><div class="mc-bl">Delayed</div>
          </div>
        </div>
      </div>
    `;
  }).join("");
  
  document.getElementById("mg").querySelectorAll(".mc-bt").forEach(el => {
    el.addEventListener("click", () => {
      sMdl(mN(el.dataset.m) + " — " + (el.dataset.t === "ok" ? "On Time" : "Delayed"), mm[el.dataset.m][el.dataset.t]);
    });
  });
}

function rAnalytics() {
  const fi2 = getFilteredFp('fp-ana');
  if (!fi2 || !fi2.length) return;
  const fiDn2 = fi2.filter(d => d.status === 'Done');
  const impDone = fiDn2.filter(d => d.cargo_type === 'Import');

  const cont = impDone.filter(d => d.shipment_type === 'Container');
  const bb = impDone.filter(d => d.shipment_type === 'Breakbulk');
  
  function avgA(arr, k) { 
    const v = arr.map(d => d[k]).filter(x => typeof x === 'number'); 
    return v.length ? (v.reduce((a,b) => a+b, 0) / v.length) : 0; 
  }
  
  const metrics = [['Sailing', 'actual_sailing_days'], ['Customs Clearance', 'clearance_days'], ['Unloading', 'unloading_days'], ['Delivery', 'delivery_days']];
  const totalC = metrics.reduce((s, m) => s + avgA(cont, m[1]), 0);
  const totalB = metrics.reduce((s, m) => s + avgA(bb, m[1]), 0);
  
  document.getElementById('an-lead').innerHTML = `
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">
      <div>
        <h4 style="font-size:12px;margin-bottom:8px">Container (${cont.length} shipments, avg total: ${totalC.toFixed(1)}d)</h4>
        <div class="bar-c">
          ${metrics.map(m => {
            const v = avgA(cont, m[1]);
            const pct = totalC ? v / totalC * 100 : 0;
            return `<div class="bar-r"><div class="bar-lb">${m[0]}</div><div class="bar-tk"><div class="bar-f" style="width:${pct}%;background:var(--pri)">${pct.toFixed(0)}%</div></div><div class="bar-v">${v.toFixed(1)}d</div></div>`;
          }).join('')}
        </div>
      </div>
      <div>
        <h4 style="font-size:12px;margin-bottom:8px">Breakbulk (${bb.length} shipments, avg total: ${totalB.toFixed(1)}d)</h4>
        <div class="bar-c">
          ${metrics.map(m => {
            const v = avgA(bb, m[1]);
            const pct = totalB ? v / totalB * 100 : 0;
            return `<div class="bar-r"><div class="bar-lb">${m[0]}</div><div class="bar-tk"><div class="bar-f" style="width:${pct}%;background:var(--org)">${pct.toFixed(0)}%</div></div><div class="bar-v">${v.toFixed(1)}d</div></div>`;
          }).join('')}
        </div>
      </div>
    </div>`;

  const byLine = {};
  impDone.forEach(d => { 
    const l = (d.shipping_line || '').trim(); 
    if (!l || !d.actual_sailing_days) return; 
    if (!byLine[l]) byLine[l] = {sail:[], count:0}; 
    byLine[l].sail.push(d.actual_sailing_days); 
    byLine[l].count++; 
  });
  
  const lineArr = Object.entries(byLine).sort((a,b) => b[1].count - a[1].count);
  const allSails = impDone.map(d => d.actual_sailing_days).filter(Boolean);
  const globalAvg = allSails.length ? (allSails.reduce((a,b) => a+b, 0) / allSails.length).toFixed(1) : '-';
  
  document.getElementById('an-sail').innerHTML = `
    <div style="margin-bottom:12px;text-align:center"><span style="font-size:10px;color:var(--muted)">Overall Average: </span><span style="font-size:18px;font-weight:700;color:var(--pri)">${globalAvg} days</span></div>
    <table class="stbl">
      <tr><th>Shipping Line</th><th style="text-align:right">Shipments</th><th style="text-align:right">Avg</th><th style="text-align:right">Min</th><th style="text-align:right">Max</th></tr>
      ${lineArr.map(e => {
        const s = e[1].sail;
        const a = (s.reduce((x,y) => x+y, 0) / s.length).toFixed(1);
        return `<tr><td>${e[0]}</td><td class="n">${e[1].count}</td><td class="n">${a}d</td><td class="n">${Math.min(...s)}d</td><td class="n">${Math.max(...s)}d</td></tr>`;
      }).join('')}
    </table>
  `;

  const delayed = fiDn2.filter(d => d._d && d._d.length);
  document.getElementById('an-delay').innerHTML = `
    <div style="margin-bottom:12px">
      <span style="font-size:10px;color:var(--muted)">Total Delayed: </span><span style="font-size:18px;font-weight:700;color:var(--red)">${delayed.length}</span><span style="font-size:10px;color:var(--muted)"> of ${fiDn2.length} completed (${fiDn2.length ? Math.round(delayed.length / fiDn2.length * 100) : 0}%)</span>
    </div>
    <table class="stbl">
      <tr><th>Project</th><th>Product</th><th>Consignee</th><th>Delay Reason</th></tr>
      ${delayed.sort((a,b) => b._d.length - a._d.length).slice(0,20).map(d => `<tr><td>${d.project_name}</td><td>${d.product}</td><td>${d.consignee || '-'}</td><td style="color:var(--red)">${d._d.map(x => x.t + ':' + x.d).join(', ')}</td></tr>`).join('')}
    </table>
  `;

  const cons = {};
  fi2.forEach(d => {
    const c = (d.consignee || '').trim(); 
    if (!c) return;
    if (!cons[c]) cons[c] = {spjm_y:{}, sppb_y:{}, spjm_m:{}, sppb_m:{}, total:0};
    cons[c].total++;
    const yr = d.year || 2026;
    if (d.spjm) { cons[c].spjm_y[yr] = (cons[c].spjm_y[yr] || 0) + 1; const sm = d.spjm.substring(0,7); cons[c].spjm_m[sm] = (cons[c].spjm_m[sm] || 0) + 1; }
    if (d.sppb) { cons[c].sppb_y[yr] = (cons[c].sppb_y[yr] || 0) + 1; const sm2 = d.sppb.substring(0,7); cons[c].sppb_m[sm2] = (cons[c].sppb_m[sm2] || 0) + 1; }
  });
  
  const ca = Object.entries(cons).sort((a,b) => b[1].total - a[1].total);
  
  const yrHtml = `<h4 style="font-size:12px;margin:12px 0 8px">Yearly Summary</h4><table class="stbl">
    <tr><th>Consignee</th><th style="text-align:right">SPJM 2025</th><th style="text-align:right">SPPB 2025</th><th style="text-align:right">SPJM 2026</th><th style="text-align:right">SPPB 2026</th></tr>
    ${ca.map(e => `<tr><td>${e[0]}</td><td class="n">${e[1].spjm_y[2025] || 0}</td><td class="n">${e[1].sppb_y[2025] || 0}</td><td class="n">${e[1].spjm_y[2026] || 0}</td><td class="n">${e[1].sppb_y[2026] || 0}</td></tr>`).join('')}
  </table>`;

  const months = ['2026-01', '2026-02', '2026-03'];
  const mHtml = `<h4 style="font-size:12px;margin:12px 0 8px">Monthly Summary (2026)</h4><table class="stbl">
    <tr><th>Consignee</th>${months.map(m => `<th style="text-align:right">SPJM ${m.split('-')[1]}</th><th style="text-align:right">SPPB ${m.split('-')[1]}</th>`).join('')}</tr>
    ${ca.filter(e => Object.keys(e[1].spjm_m).some(k => k.startsWith('2026'))).map(e => `<tr><td>${e[0]}</td>${months.map(m => `<td class="n">${e[1].spjm_m[m] || 0}</td><td class="n">${e[1].sppb_m[m] || 0}</td>`).join('')}</tr>`).join('')}
  </table>`;

  document.getElementById('an-cons').innerHTML = yrHtml + mHtml;
}

function rConsSummary() {
  const yr = document.getElementById('cns-period').value;
  const mo = document.getElementById('cns-month').value;
  const dm = document.getElementById('cns-data') ? document.getElementById('cns-data').value : 'status';
  const selPTs = getSelectedPTs();
  const allSel = selPTs.length === 0 || document.getElementById('cns-pt-all').checked;
  
  const fd = it.filter(d => {
    if (!allSel && selPTs.indexOf((d.consignee || '').trim()) < 0) return false;
    if (yr !== 'all' && d.year !== +yr) return false;
    if (mo !== 'all') {
      const ref = d.eta || d.etd || d.start_delivery;
      if (!ref || ref.substring(5, 7) !== mo) return false;
    }
    return true;
  });
  
  const cs = {};
  fd.forEach(d => {
    const c = (d.consignee || 'Unknown').trim();
    if (!cs[c]) cs[c] = {count:0, mt:0, imp:0, dom:0, done:0, ongoing:0, contract:0, delayed:0, spjm:0, sppb:0};
    const o = cs[c];
    o.count++; o.mt += d.quantity_mt || 0;
    if (d.cargo_type === 'Import') o.imp++; else o.dom++;
    if (d.status === 'Done') { o.done++; if (d._d && d._d.length) o.delayed++; }
    else if (d.status === 'On Going') o.ongoing++;
    else if (d.status === 'Contract') o.contract++;
    if (d.spjm) o.spjm++; if (d.sppb) o.sppb++;
  });
  
  const rows = Object.entries(cs).sort((a,b) => b[1].mt - a[1].mt);
  const tot = {count:0, mt:0, imp:0, dom:0, done:0, ongoing:0, contract:0, delayed:0, spjm:0, sppb:0};
  rows.forEach(r => { for (let k in tot) tot[k] += r[1][k]; });
  
  let pieData = [];
  if (dm === 'status') pieData = [{l:'Done',v:tot.done,c:'#059669'}, {l:'Active',v:tot.ongoing,c:'#f59e0b'}, {l:'Contract',v:tot.contract,c:'#7c3aed'}, {l:'Delayed',v:tot.delayed,c:'#dc2626'}];
  else if (dm === 'cargo') pieData = [{l:'Import',v:tot.imp,c:'#2563eb'}, {l:'Domestic',v:tot.dom,c:'#f59e0b'}];
  else if (dm === 'clearance') pieData = [{l:'SPJM',v:tot.spjm,c:'#2563eb'}, {l:'SPPB',v:tot.sppb,c:'#059669'}];
  else { 
    pieData = rows.slice(0,8).map((e,i) => { 
      const cl = ['#2563eb','#059669','#f59e0b','#7c3aed','#dc2626','#06b6d4','#d97706','#ec4899']; 
      return {l:e[0].substring(0,12), v:Math.round(e[1].mt), c:cl[i%8]}; 
    }); 
  }
  
  const pieT = pieData.reduce((s,p) => s+p.v, 0);
  
  if (document.getElementById('cns-pie')) {
    document.getElementById('cns-pie').innerHTML = `<div style="display:flex;flex-wrap:wrap;gap:8px;justify-content:center;margin:8px 0">
      ${pieData.filter(p => p.v > 0).map(p => {
        const pct = pieT ? (p.v / pieT * 100).toFixed(1) : 0;
        return `<div style="text-align:center;min-width:60px;padding:8px 12px;background:var(--bg);border:2px solid ${p.c};border-radius:8px"><div style="font-size:20px;font-weight:700;color:${p.c}">${p.v}</div><div style="font-size:9px;color:var(--muted)">${p.l}</div><div style="font-size:9px;color:${p.c}">${pct}%</div></div>`;
      }).join('')}
    </div>`;
  }

  document.getElementById('cns-table').innerHTML = `<div style="max-height:400px;overflow-y:auto">
    <table class="stbl">
      <tr><th>Consignee</th><th style="text-align:right">Ship.</th><th style="text-align:right">Tonnage</th><th style="text-align:right">Imp</th><th style="text-align:right">Dom</th><th style="text-align:right">Done</th><th style="text-align:right">Active</th><th style="text-align:right">Contract</th><th style="text-align:right">Delay</th><th style="text-align:right">SPJM</th><th style="text-align:right">SPPB</th></tr>
      <tr style="background:var(--pri-l);font-weight:700"><td>TOTAL</td><td class="n">${tot.count}</td><td class="n">${fN(tot.mt)} MT</td><td class="n">${tot.imp}</td><td class="n">${tot.dom}</td><td class="n">${tot.done}</td><td class="n">${tot.ongoing}</td><td class="n">${tot.contract}</td><td class="n" style="color:var(--red)">${tot.delayed}</td><td class="n">${tot.spjm}</td><td class="n">${tot.sppb}</td></tr>
      ${rows.map(e => {
        const r = e[1];
        return `<tr style="cursor:pointer" onclick="document.getElementById('cn-sel').value='${e[0]}';rConsignee();"><td>${e[0]}</td><td class="n">${r.count}</td><td class="n">${fN(r.mt)} MT</td><td class="n">${r.imp}</td><td class="n">${r.dom}</td><td class="n">${r.done}</td><td class="n">${r.ongoing}</td><td class="n">${r.contract}</td><td class="n" style="color:${r.delayed ? 'var(--red)' : ''}">${r.delayed}</td><td class="n">${r.spjm}</td><td class="n">${r.sppb}</td></tr>`;
      }).join('')}
    </table>
  </div>`;
}

function rConsignee() {
  rConsSummary();
  const sel = document.getElementById('cn-sel');
  const curVal = sel.value;
  const cSet = {}; 
  
  it.forEach(d => { if (d.consignee) cSet[d.consignee.trim()] = 1; });
  const cList = Object.keys(cSet).sort();
  
  if (sel.options.length <= 1) {
    cList.forEach(c => {
      const o = document.createElement('option');
      o.value = c; o.textContent = c; sel.appendChild(o);
    });
    if (curVal !== 'all') sel.value = curVal;
  }

  const cVal = sel.value;
  const fnFp2 = getFp('fp-cndetail');
  const fd = it.filter(d => {
    if (cVal !== 'all' && (d.consignee || '').trim() !== cVal) return false;
    return fnFp2(d);
  });

  let totalMT = 0, impC = 0, domC = 0, dlC = 0;
  fd.forEach(d => {
    totalMT += d.quantity_mt || 0;
    if (d.cargo_type === 'Import') impC++; else domC++;
    if (d._d && d._d.length) dlC++;
  });
  
  document.getElementById('cn-kpi').innerHTML = [
    {l:'Shipments', v:fd.length, c:'var(--text)'},
    {l:'Import', v:impC, c:'var(--pri)'},
    {l:'Domestic', v:domC, c:'var(--org)'},
    {l:'Tonnage', v:fN(totalMT)+' MT', c:'var(--text)'},
    {l:'Delayed', v:dlC, c:'var(--red)'}
  ].map(k => `<div class="sc"><div class="sc-l">${k.l}</div><div class="sc-v" style="color:${k.c}">${k.v}</div></div>`).join('');

  const pr = {};
  fd.forEach(d => { 
    const p = d.product || 'Other'; 
    if(!pr[p]) pr[p] = {c:0, mt:0}; 
    pr[p].c++; pr[p].mt += d.quantity_mt || 0; 
  });
  
  const pa = Object.entries(pr).sort((a,b) => b[1].mt - a[1].mt);
  const mxP = Math.max(...pa.map(x => x[1].mt));
  
  document.getElementById('cn-prod').innerHTML = `<div class="bar-c">
    ${pa.map(e => `<div class="bar-r"><div class="bar-lb">${e[0]}</div><div class="bar-tk"><div class="bar-f" style="width:${mxP ? e[1].mt / mxP * 100 : 0}%;background:var(--pri)">${e[1].c}</div></div><div class="bar-v">${fN(e[1].mt)} MT</div></div>`).join('')}
  </div>`;

  const clr = {};
  fd.forEach(d => {
    if (d.cargo_type !== 'Import') return;
    const ym = (d.eta || d.etd || '').substring(0,7);
    if (!ym) return;
    if (!clr[ym]) clr[ym] = {spjm:0, sppb:0};
    if (d.spjm) clr[ym].spjm++;
    if (d.sppb) clr[ym].sppb++;
  });
  const ca = Object.entries(clr).sort((a,b) => a[0].localeCompare(b[0]));
  
  document.getElementById('cn-clear').innerHTML = ca.length ? `<table class="stbl">
    <tr><th>Period</th><th style="text-align:right">SPJM</th><th style="text-align:right">SPPB</th></tr>
    ${ca.map(e => `<tr><td>${mN(e[0])}</td><td class="n">${e[1].spjm}</td><td class="n">${e[1].sppb}</td></tr>`).join('')}
  </table>` : '<div class="emp">No clearance data</div>';

  document.getElementById('cn-detail').innerHTML = `<div style="max-height:400px;overflow-y:auto"><table class="stbl">
    <tr><th>Project</th><th>Product</th><th>Qty</th><th>Type</th><th>Status</th><th>Vessel</th><th>ETA</th><th>Warehouse</th></tr>
    ${fd.map(d => `<tr><td>${d.project_name}</td><td>${d.product || '-'}</td><td>${fN(d.quantity_mt)} MT</td><td>${d.shipment_type || '-'}</td><td>${d.status || '-'}</td><td>${d.vessel_name || '-'}</td><td>${fD(d.eta)}</td><td>${d.warehouse_location || '-'}</td></tr>`).join('')}
  </table></div>`;
}

function getSelectedPTs() {
  const cbs = document.querySelectorAll('.cns-pt-cb');
  const sel = [];
  cbs.forEach(cb => { if(cb.checked) sel.push(cb.value); });
  return sel;
}