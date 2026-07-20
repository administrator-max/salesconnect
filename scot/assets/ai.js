// ==========================================
// 5. OFFLINE AI CHAT ENGINE
// ==========================================
function createOfflineAI(items, allData) {
  function avg(arr) { return arr.length ? (arr.reduce((a,b)=>a+b,0)/arr.length) : null; }
  function round(n,d=1) { return n!=null ? Number(n.toFixed(d)) : null; }
  
  function compute() {
    const a = {
      total: allData.length,
      ongoing: items.filter(d=>d.status==="On Going"),
      done: items.filter(d=>d.status!=="On Going"),
      imp: items.filter(d=>d.cargo_type==="Import"),
      dom: items.filter(d=>d.cargo_type==="Domestic"),
      totalMT: round(allData.reduce((s,d)=>s+(d.quantity_mt||0),0),1),
    };
    
    a.products = {};
    items.forEach(d => {
      const p = d.product || "Lain-lain";
      if(!a.products[p]) a.products[p] = {count:0,mt:0,sail:[],clear:[],unload:[],deliv:[],delays:0};
      const pp = a.products[p];
      pp.count++; pp.mt += d.quantity_mt||0;
      if(d.actual_sailing_days) pp.sail.push(d.actual_sailing_days);
      if(d.clearance_days && typeof d.clearance_days==="number") pp.clear.push(d.clearance_days);
      if(d.unloading_days && typeof d.unloading_days==="number") pp.unload.push(d.unloading_days);
      if(d.delivery_days && typeof d.delivery_days==="number") pp.deliv.push(d.delivery_days);
      if(d._d && d._d.length) pp.delays++;
    });
    
    a.lines = {};
    items.forEach(d => {
      const l = (d.shipping_line||"").trim();
      if(!l) return;
      if(!a.lines[l]) a.lines[l] = {count:0,mt:0,delays:0,sail:[]};
      a.lines[l].count++; a.lines[l].mt += d.quantity_mt||0;
      if(d.actual_sailing_days) a.lines[l].sail.push(d.actual_sailing_days);
      if(d._d && d._d.length) a.lines[l].delays++;
    });
    
    a.warehouses = {};
    items.forEach(d => {
      const w = (d.warehouse_location||"").trim();
      if(!w) return;
      if(!a.warehouses[w]) a.warehouses[w] = {count:0,mt:0};
      a.warehouses[w].count++; a.warehouses[w].mt += d.quantity_mt||0;
    });
    
    a.months = {};
    items.forEach(d => {
      if(!d._m) return;
      if(!a.months[d._m]) a.months[d._m] = {total:0,ok:0,delay:0};
      a.months[d._m].total++;
      if(d._d && d._d.length) a.months[d._m].delay++; else a.months[d._m].ok++;
    });
    
    a.vendors = {};
    items.forEach(d => {
      const v = (d.vendor_trucking||"").trim();
      if(!v) return;
      if(!a.vendors[v]) a.vendors[v] = {count:0,mt:0};
      a.vendors[v].count++; a.vendors[v].mt += d.quantity_mt||0;
    });

    a.ports = {};
    items.forEach(d => {
      const p = (d.pol||"").trim();
      if(!p) return;
      if(!a.ports[p]) a.ports[p] = {count:0,mt:0};
      a.ports[p].count++; a.ports[p].mt += d.quantity_mt||0;
    });
    
    const doneImp = a.done.filter(d=>d.cargo_type==="Import");
    a.avgSail = round(avg(doneImp.map(d=>d.actual_sailing_days).filter(Boolean)));
    a.avgClear = round(avg(doneImp.map(d=>d.clearance_days).filter(x=>typeof x==="number")));
    a.avgUnload = round(avg(doneImp.map(d=>d.unloading_days).filter(x=>typeof x==="number")));
    a.delayCount = items.filter(d=>d._d&&d._d.length).length;
    a.delayPct = round(a.delayCount/a.total*100);
    
    return a;
  }
  
  function table(headers, rows) {
    return `<table><tr>${headers.map(h=>`<th>${h}</th>`).join("")}</tr>${rows.map(r=>`<tr>${r.map(c=>`<td>${c}</td>`).join("")}</tr>`).join("")}</table>`;
  }
  
  const patterns = [
    { match: /(rata.?rata|average|waktu|durasi|lama).*(produk|product|barang|jenis)/i, handler: () => {
      const A = compute();
      const rows = Object.entries(A.products)
        .filter(([_,v])=>v.sail.length>0)
        .sort((a,b)=>b[1].count-a[1].count)
        .map(([k,v])=>[k, v.count, fN(v.mt)+" MT", round(avg(v.sail))+"d", round(avg(v.clear))+"d", round(avg(v.unload))+"d"]);
      return `<strong>Rata-rata waktu proses per produk (Import):</strong>
${table(["Produk","Jumlah","Tonase","Avg Layar","Avg Customs","Avg Bongkar"], rows)}
<br>Produk dengan waktu layar terlama: <strong>${rows.sort((a,b)=>parseFloat(b[3])-parseFloat(a[3]))[0]?.[0]}</strong>`;
    }},
    { match: /(rata.?rata|average|berapa).*(layar|sail|pelayaran)/i, handler: () => {
      const A = compute();
      return `Rata-rata waktu pelayaran seluruh shipment Import: <strong>${A.avgSail} hari</strong>
Per shipping line:
${table(["Shipping Line","Jumlah","Avg Layar"], Object.entries(A.lines).sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>[k, v.count, round(avg(v.sail))+"d"]))}`;
    }},
    { match: /(shipping|line|carrier).*(telat|terlambat|delay|lambat)|telat.*(shipping|line)/i, handler: () => {
      const A = compute();
      const rows = Object.entries(A.lines)
        .filter(([_,v])=>v.count>=2)
        .sort((a,b)=>(b[1].delays/b[1].count)-(a[1].delays/a[1].count))
        .map(([k,v])=>[k, v.count, v.delays, round(v.delays/v.count*100)+"%"]);
      const worst = rows[0];
      return `<strong>Tingkat keterlambatan per Shipping Line:</strong>
${table(["Shipping Line","Total","Terlambat","Persen"], rows)}
<br>Shipping line dengan tingkat keterlambatan tertinggi: <strong>${worst?.[0]}</strong> (${worst?.[3]})`;
    }},
    { match: /(warehouse|gudang|lokasi).*(banyak|terbanyak|paling|mana|distribusi)/i, handler: () => {
      const A = compute();
      const rows = Object.entries(A.warehouses).sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>[k, v.count, fN(v.mt)+" MT"]);
      return `<strong>Distribusi per Warehouse:</strong>
${table(["Warehouse","Shipment","Tonase"], rows)}
<br>Warehouse terbanyak: <strong>${rows[0]?.[0]}</strong> (${rows[0]?.[1]} shipment, ${rows[0]?.[2]})`;
    }},
    { match: /(tren|trend|bulan|bulanan|monthly).*(telat|terlambat|delay|performa|kinerja)|keterlambatan.*(bulan|trend)/i, handler: () => {
      const A = compute();
      const ms = Object.entries(A.months).sort((a,b)=>a[0].localeCompare(b[0]));
      const rows = ms.map(([k,v])=>[mN(k), v.total, v.ok, v.delay, round(v.delay/v.total*100)+"%"]);
      const worst = ms.sort((a,b)=>(b[1].delay/b[1].total)-(a[1].delay/a[1].total))[0];
      return `<strong>Tren keterlambatan per bulan:</strong>
${table(["Bulan","Total","Lancar","Terlambat","% Delay"], rows)}
<br>Bulan terburuk: <strong>${mN(worst[0])}</strong> dengan ${worst[1].delay} dari ${worst[1].total} shipment terlambat (${round(worst[1].delay/worst[1].total*100)}%)`;
    }},
    { match: /(ongoing|on going|berjalan|aktif|sedang|berlangsung|sekarang)/i, handler: () => {
      const A = compute();
      if(!A.ongoing.length) return "Saat ini tidak ada shipment yang sedang berjalan. Semua sudah selesai! ✅";
      const rows = A.ongoing.map(d=>[d.project_name, d.product, fN(d.quantity_mt)+" MT", d.vessel_name||"-", d._p.l]);
      return `<strong>${A.ongoing.length} shipment sedang berjalan:</strong>
${table(["Project","Produk","Qty","Kapal","Posisi"], rows)}
<br>Total tonase on going: <strong>${fN(A.ongoing.reduce((s,d)=>s+(d.quantity_mt||0),0))} MT</strong>`;
    }},
    { match: /(produk|product|barang).*(banyak|terbanyak|terbesar|paling|dominan|utama)|paling banyak.*(kirim|ship)/i, handler: () => {
      const A = compute();
      const rows = Object.entries(A.products).sort((a,b)=>b[1].mt-a[1].mt).map(([k,v])=>[k, v.count, fN(v.mt)+" MT", round(v.mt/A.totalMT*100)+"%"]);
      return `<strong>Produk berdasarkan tonase:</strong>
${table(["Produk","Shipment","Tonase","% Total"], rows.slice(0,10))}
<br>Produk terbesar: <strong>${rows[0]?.[0]}</strong> dengan ${rows[0]?.[2]} (${rows[0]?.[3]} dari total)`;
    }},
    { match: /(consignee|importer|pembeli|buyer|customer)/i, handler: () => {
      const cg={};items.forEach(d=>{const c=(d.consignee||"").trim();if(!c)return;if(!cg[c])cg[c]={count:0,mt:0};cg[c].count++;cg[c].mt+=d.quantity_mt||0;});
      const rows=Object.entries(cg).sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>[k,v.count,fN(v.mt)+" MT"]);
      return `<strong>Consignee Distribution:</strong>\n${table(["Consignee","Shipments","Tonnage"],rows)}`;
    }},
    { match: /(vendor|trucking|truk|angkut|transport)/i, handler: () => {
      const A = compute();
      const rows = Object.entries(A.vendors).sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>[k, v.count, fN(v.mt)+" MT"]);
      return `<strong>Trucking Vendor Distribution:</strong>
${table(["Vendor","Shipments","Tonnage"], rows)}
<br>Most used vendor: <strong>${rows[0]?.[0]}</strong> (${rows[0]?.[1]} shipments, ${rows[0]?.[2]})`;
    }},
    { match: /(port|pelabuhan|asal|pol|loading).*(mana|banyak|terbanyak|distribusi)/i, handler: () => {
      const A = compute();
      const rows = Object.entries(A.ports).sort((a,b)=>b[1].count-a[1].count).map(([k,v])=>[k, v.count, fN(v.mt)+" MT"]);
      return `<strong>Port of Loading (Pelabuhan Asal):</strong>
${table(["Pelabuhan","Shipment","Tonase"], rows)}`;
    }},
    { match: /(ringkas|rangkum|summary|overview|keseluruhan|semua data|total|statistik umum)/i, handler: () => {
      const A = compute();
      return `<strong>Ringkasan Data Cargo Tracking:</strong>
<br>• Total: <strong>${A.total}</strong> shipment (<strong>${A.imp.length}</strong> Import, <strong>${A.dom.length}</strong> Domestic)
<br>• Status: <strong>${A.ongoing.length}</strong> On Going, <strong>${A.done.length}</strong> Selesai
<br>• Total tonase: <strong>${fN(A.totalMT)} MT</strong>
<br>• Tingkat keterlambatan: <strong>${A.delayCount}</strong> dari ${A.total} (${A.delayPct}%)
<br><br><strong>Rata-rata proses Import:</strong>
<br>• Pelayaran: <strong>${A.avgSail} hari</strong>
<br>• Customs clearance: <strong>${A.avgClear} hari</strong>
<br>• Bongkar: <strong>${A.avgUnload} hari</strong>
<br><br>Warehouse terbanyak: <strong>${Object.entries(A.warehouses).sort((a,b)=>b[1].count-a[1].count)[0]?.[0]}</strong>
<br>Shipping line utama: <strong>${Object.entries(A.lines).sort((a,b)=>b[1].count-a[1].count)[0]?.[0]}</strong>`;
    }},
    { match: /(customs|clearance|bea cukai|pib|sppb)/i, handler: () => {
      const A = compute();
      const impDone = A.done.filter(d=>d.cargo_type==="Import");
      const clears = impDone.map(d=>d.clearance_days).filter(x=>typeof x==="number");
      const maxC = Math.max(...clears);
      const slow = impDone.filter(d=>d.clearance_days&&d.clearance_days>3);
      return `<strong>Analisa Customs Clearance:</strong>
<br>• Rata-rata durasi: <strong>${round(avg(clears))} hari</strong>
<br>• Tercepat: <strong>${Math.min(...clears)} hari</strong>
<br>• Terlama: <strong>${maxC} hari</strong>
<br>• Shipment clearance &gt;3 hari: <strong>${slow.length}</strong> dari ${impDone.length}
<br><br>Sebagian besar customs clearance selesai dalam <strong>1 hari</strong>, menunjukkan proses yang cukup efisien.`;
    }},
    { match: /(bongkar|unloading|unload)/i, handler: () => {
      const A = compute();
      const impDone = A.done.filter(d=>d.cargo_type==="Import");
      const unloads = impDone.map(d=>d.unloading_days).filter(x=>typeof x==="number");
      return `<strong>Analisa Proses Bongkar:</strong>
<br>• Rata-rata durasi: <strong>${round(avg(unloads))} hari</strong>
<br>• Tercepat: <strong>${Math.min(...unloads)} hari</strong>
<br>• Terlama: <strong>${Math.max(...unloads)} hari</strong>
<br>• Bongkar &gt;3 hari (terlambat): <strong>${unloads.filter(x=>x>3).length}</strong> dari ${unloads.length}`;
    }},
    { match: /(banding|compare|versus|vs).*(import|domestic)|import.*(domestic|vs)/i, handler: () => {
      const A = compute();
      const impMT = round(A.imp.reduce((s,d)=>s+(d.quantity_mt||0),0));
      const domMT = round(A.dom.reduce((s,d)=>s+(d.quantity_mt||0),0));
      return `<strong>Import vs Domestic:</strong>
${table(["","Import","Domestic"],[
  ["Jumlah", A.imp.length, A.dom.length],
  ["Tonase", fN(impMT)+" MT", fN(domMT)+" MT"],
  ["Rata-rata Qty", fN(impMT/A.imp.length)+" MT", fN(domMT/A.dom.length)+" MT"],
  ["Terlambat", A.imp.filter(d=>d._d?.length).length, A.dom.filter(d=>d._d?.length).length],
])}`;
    }},
    { match: /(telat|terlambat|delay|lambat|masalah|kendala)/i, handler: () => {
      const A = compute();
      const delayed = items.filter(d=>d._d&&d._d.length);
      const sailD = delayed.filter(d=>d._d.some(x=>x.t==="Sailing")).length;
      const custD = delayed.filter(d=>d._d.some(x=>x.t==="Customs")).length;
      const unlD = delayed.filter(d=>d._d.some(x=>x.t==="Unload")).length;
      return `<strong>Analisa Keterlambatan:</strong>
<br>• Total terlambat: <strong>${delayed.length}</strong> dari ${A.total} shipment (${A.delayPct}%)
<br><br><strong>Penyebab:</strong>
<br>• Pelayaran lebih lama: <strong>${sailD}</strong> shipment
<br>• Customs &gt;3 hari: <strong>${custD}</strong> shipment
<br>• Bongkar &gt;3 hari: <strong>${unlD}</strong> shipment
<br><br>Penyebab utama keterlambatan adalah <strong>${sailD>=custD&&sailD>=unlD?"waktu pelayaran yang melebihi estimasi":custD>=unlD?"proses customs clearance":"proses bongkar"}</strong>.
<br><br>Top 5 shipment paling terlambat:
${table(["Project","Masalah"], delayed.sort((a,b)=>b._d.length-a._d.length).slice(0,5).map(d=>[d.project_name, d._d.map(x=>x.t+": "+x.d).join(", ")]))}`;
    }},
  ];
  
  function fallback() {
    return `Saya bisa menjawab pertanyaan seputar data shipment ini. Coba tanyakan:
<br>• <strong>Rata-rata waktu per produk</strong> — durasi pelayaran, customs, bongkar
<br>• <strong>Shipping line mana yang sering telat</strong>
<br>• <strong>Warehouse paling banyak</strong>
<br>• <strong>Tren keterlambatan per bulan</strong>
<br>• <strong>Shipment yang sedang berjalan</strong>
<br>• <strong>Produk terbanyak / terbesar</strong>
<br>• <strong>Analisa customs clearance</strong>
<br>• <strong>Perbandingan import vs domestic</strong>
<br>• <strong>Ringkasan keseluruhan data</strong>
<br>• <strong>Penyebab keterlambatan</strong>
<br>• <strong>Pelabuhan asal terbanyak</strong>`;
  }
  
  return function respond(question) {
    const q = question.trim();
    for (const p of patterns) {
      if (p.match.test(q)) {
        try { return p.handler(); } catch(e) { return "Maaf, terjadi error saat menganalisa: " + e.message; }
      }
    }
    return fallback();
  };
}

document.getElementById("cf").addEventListener("click", () => {
  document.getElementById("cb").classList.remove("hid");
  document.getElementById("cf").classList.add("hid");
});

document.getElementById("cx").addEventListener("click", () => {
  document.getElementById("cb").classList.add("hid");
  document.getElementById("cf").classList.remove("hid");
});

const cM = document.getElementById("cm");
const cI = document.getElementById("ci");
const cG = document.getElementById("cg");

document.querySelectorAll(".ch-ht").forEach(b => {
  b.addEventListener("click", () => { cI.value = b.textContent; sC(); });
});

cI.addEventListener("keydown", e => { if(e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sC(); }});
cG.addEventListener("click", sC);

function sC() {
  const m = cI.value.trim();
  if (!m) return;
  cI.value = "";
  document.getElementById("chs").classList.add("hid");
  
  const u = document.createElement("div");
  u.className = "bbl u"; u.textContent = m; cM.appendChild(u);
  
  const a = document.createElement("div");
  a.className = "bbl a"; a.innerHTML = '<span class="thk">Analyzing...</span>'; cM.appendChild(a);
  cM.scrollTop = cM.scrollHeight;
  
  setTimeout(() => {
    a.innerHTML = aiR ? aiR(m) : "Data is still loading. Please try again in a moment.";
    cM.scrollTop = cM.scrollHeight;
  }, 300 + Math.random() * 400);
}