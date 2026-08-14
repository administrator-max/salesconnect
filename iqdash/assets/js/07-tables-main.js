/* ═══════════════════════════════════════
   ALL-COMPANIES TABLE (renderMain)
═══════════════════════════════════════ */

function renderMain() {
  const q = (document.getElementById('mainQ')||{}).value||'';

  /* ══════════════════════════════════════════════════════════════════
     BUILD COMPANY-LEVEL ROWS
     Data pulled from same sources as other modules:
     · Submit/Obtained  → SPI.cycles  (same as PERTEK & SPI page)
     · Utilization      → SPI.utilizationByProd/utilizationMT (same as Available Quota page)
     · Realization      → SPI.realizationByProd + RA.berat (same as Realization Monitoring)
     · Available Quota  → availableInPeriod() / cumulativeAvailByProd()
                          (kolam + gerbang yang sama dengan kartu Available Quota)
  ══════════════════════════════════════════════════════════════════ */
  /* Dihitung SEKALI untuk seluruh tabel, bukan per baris. */
  const _avqCodes = (typeof availablePoolCodes === 'function') ? availablePoolCodes() : null;
  const _realCo   = (typeof realizedByCompany === 'function') ? realizedByCompany() : {};

  const buildCompanyRow = (d) => {
    const ra  = getRA(d.code);
    const _rs = revisionStatus(d);
    const rowType = (_rs==='clean'||_rs==='completed') ? 'SPI'
                  : _rs==='reapply'  ? 'REAPPLY'
                  : _rs==='active'   ? 'REV'
                  : _rs==='revpending' ? 'REV' : 'SPI';

    const utilMT  = scopedUtilTotal(d);   // period-aware (rule #3): util sliced by lot date
    /* Available = saldo KUMULATIF, satu sumber dengan kartu Overview dan
       halaman Available Quota.

       Dua penyimpangan yang dibereskan di sini, keduanya kelas yang sama
       dengan laporan tim Sales 2026-08-11:
         · dengan periode aktif, baris ini mengurangi `d.obtained` (ALL-TIME,
           ditimpa canonicalObtained saat loadData) dengan utilisasi PERIODE —
           dua basis dalam satu pengurangan, jadi kolom Available di tabel ini
           bisa berbeda dari kartu untuk company yang sama.
         · tanpa periode, ia membaca `d.availableQuota` mentah — kolom server
           yang tidak ikut diperbarui saat utilisasi bertambah (kasus ADP
           2026-08-10: tertulis sisa 100 MT padahal 350/350 sudah terpakai).
       Hari ini kolom itu kebetulan cocok untuk semua company, jadi ini bukan
       koreksi angka melainkan menutup celahnya.

       Gerbang periode ikut dipakai (availableInPeriod): company yang kuotanya
       BELUM terbit sampai akhir jendela menampilkan 0, sama seperti kartu.
       Tanpa itu, filter "2025 saja" membuat kolom ini menjumlah 5.633 MT
       terhadap kartu 853 — saldo 2026 dipamerkan di jendela 2025. */
    const availMT = (typeof availableInPeriod === 'function')
      ? availableInPeriod(d, _avqCodes) : cumulativeAvailable(d);
    /* raTotals(), BUKAN satu baris RA. `ra_records` menyimpan satu baris per
       GELOMBANG kedatangan, dan getRA() sengaja memulangkan gelombang terbaru
       saja — jadi memakainya sebagai "realisasi perusahaan" membuang gelombang
       lainnya. Dua company punya dua gelombang, dan baris TOTAL di bawah
       karena itu membaca 13.531,494 MT terhadap kartu Total Realized
       15.438,208 (AMP kehilangan 399,178 · SGD 1.507,536).

       Persentasenya diturunkan dari realisasi perusahaan ÷ obtained. Itu bukan
       tafsiran: diuji atas SELURUH 24 company yang punya RA, hasilnya sama
       persis dengan realPct yang tersimpan — termasuk kedua company
       dua-gelombang, yang justru menyimpan persentase se-perusahaan pada salah
       satu barisnya. */
    const _raT    = (typeof raTotals === 'function') ? raTotals(d.code) : null;
    const _obtRA  = Number(ra && ra.obtained) || 0;
    const realMT  = (_realCo[d.code] != null) ? _realCo[d.code]
                  : ((_raT && _raT.arrived) ? _raT.realMT : ((ra && ra.cargoArrived) ? ra.berat : 0));
    const realPct = (realMT > 0)
      ? (_obtRA > 0 ? realMT / _obtRA : (ra ? ra.realPct : null))
      : ((ra && ra.cargoArrived) ? 0 : null);
    const utilPct = (ra && !ra.cargoArrived) ? ra.utilPct : null;

    // Per-product data
    const ubp = scopedUtilByProd(d);   // period-aware (rule #3): util sliced by lot date
    /* Sub-baris per produk ikut gerbang yang sama dengan availMT di atas —
       kalau company-nya di luar kolam periode ini, tidak boleh ada satu pun
       produknya yang menampilkan sisa. */
    const digate = availMT <= 0 && cumulativeAvailable(d) > 0;
    const abp = digate ? {} : cumulativeAvailByProd(d);
    const rbp = d.realizationByProd  || {};
    const arb = d.arrivedByProd      || {};
    const obtByProd = getObtainedByProd(d);

    // Submit per product from cycle data
    const submitByProd = {};
    (d.cycles||[]).forEach(c => {
      if (!/^submit\s*#1/i.test(c.type)) return;
      Object.entries(c.products||{}).forEach(([p,v]) => {
        if (typeof v==='number' && v>0) submitByProd[p] = (submitByProd[p]||0) + v;
      });
    });

    // All product keys (union of obtained, util, avail)
    const allProds = [...new Set([
      ...Object.keys(obtByProd),
      ...Object.keys(ubp),
      ...Object.keys(abp),
    ])];

    const subRows = [];
    if (allProds.length > 1) {
      allProds.forEach(prod => {
        const obtP  = obtByProd[prod]  || 0;
        const subP  = submitByProd[prod] || 0;
        const utilP = ubp[prod]  || 0;
        const avqP  = digate ? 0 : cumulativeAvailForProd(d, prod);
        const realP   = rbp[prod] != null ? rbp[prod]
                      : (arb[prod] === true && ra && ra.obtained > 0)
                        ? Math.round(ra.berat * (obtP / (ra.obtained||1)) * 100) / 100
                        : 0;
        const arrivedP  = arb[prod] != null ? arb[prod] : false;
        const realPctP  = obtP > 0 && arrivedP  ? realP / obtP  : null;
        const utilPctP  = obtP > 0 && !arrivedP && utilP > 0 ? utilP / obtP : null;
        subRows.push({ prod, subP, obtP, utilP, realP, realPctP, utilPctP, avqP, arrivedP });
      });
    }

    /* Submit & Obtained WAJIB diiris ke periode yang sama dengan kolomnya.
       Sebelumnya baris ini memakai `d.submit1` / `d.obtained` — keduanya
       SEPANJANG WAKTU (ditimpa canonicalSubmitted/canonicalObtained saat
       loadData) — di atas daftar company yang sudah difilter periode. Dua basis
       dalam satu penjumlahan, persis kelas yang sudah dibereskan untuk kolom
       Available di atas. Akibatnya baris TOTAL membaca Submit 236.945 MT
       terhadap kartu 74.945 pada H1 2026 (audit 2026-08-14). */
    const submitMT = (PERIOD.active && typeof scopedSubmittedTotal === 'function')
      ? scopedSubmittedTotal(d) : (d.submit1 || 0);
    const obtainMT = (PERIOD.active && typeof canonicalObtainedFiltered === 'function')
      ? canonicalObtainedFiltered(d) : (d.obtained || 0);

    return { ...d, submit1: submitMT, obtained: obtainMT,
             utilMT, availMT, berat: realMT, realPct, utilPct, rowType, subRows };
  };

  /* Kolam tabel = kolam yang dipakai KARTU Utilized, bukan hanya company yang
     tanggal SIKLUS-nya jatuh di periode. Perusahaan yang kargonya mendarat di
     dalam jendela tapi siklusnya di luar tetap punya utilisasi nyata di periode
     itu — kartu menghitungnya (itulah gunanya utilizationPool), tabel ini tidak
     menampilkannya sama sekali, jadi baris TOTAL-nya selalu lebih kecil:
       Feb 2026  9.825 vs 12.525 (SGD 2.000 MT tidak punya baris)
       Mei 2026    700 vs  3.000 (BTS 1.000 + GKL 1.300)
     Dilebarkan di sini supaya angkanya tidak bisa berbeda lagi. Kolom Submit/
     Obtained baris tambahan itu memang 0 untuk periode ini — dan itu benar. */
  const _spiPool = (typeof utilizationPool === 'function')
    ? utilizationPool(filteredSPI()).filter(c => (typeof SPI !== 'undefined') && SPI.includes(c))
    : filteredSPI();
  const _pendPool = (typeof utilizationPool === 'function')
    ? utilizationPool(filteredPending()).filter(c => (typeof PENDING !== 'undefined') && PENDING.includes(c))
    : filteredPending();

  const all = [
    ..._spiPool.map(buildCompanyRow),
    /* Baris PENDING dulu dipaku obtained:0 / availMT:0. Itu benar untuk company
       yang memang belum dapat apa-apa, tapi PENDING juga memuat company yang
       PERTEK-nya SUDAH terbit dan tinggal menunggu langkah berikutnya — SNSD
       (Obtained #1 = 120 MT, PERTEK 04/08/2026). Kartu Available Quota dan
       halaman Available Quota menghitungnya (kpiPool = SPI + PENDING), tabel
       ini menuliskannya nol. Satu company, dua angka — kelas yang sama dengan
       laporan tim Sales 2026-08-11.

       Dipakai helper kanonik yang sama; company PENDING yang benar-benar belum
       terbit tetap keluar 0, jadi tampilan lamanya tidak berubah untuk mereka. */
    ..._pendPool.map(d => {
      /* Diiris ke periode dengan helper yang sama seperti baris SPI di atas.
         `d.mt` dan canonicalObtained() keduanya SEPANJANG WAKTU: dengan filter
         Agustus 2026 baris SNSD tetap menyumbang Submit 3.000 / Obtained 120
         ke TOTAL, padahal Submit MOI-nya 17/06/2026 — kartu menghitung 0. */
      const obt  = (PERIOD.active && typeof canonicalObtainedFiltered === 'function')
        ? canonicalObtainedFiltered(d)
        : ((typeof canonicalObtained === 'function') ? canonicalObtained(d) : 0);
      const sub  = (PERIOD.active && typeof scopedSubmittedTotal === 'function')
        ? scopedSubmittedTotal(d)
        : (((typeof scopedSubmittedTotal === 'function') ? scopedSubmittedTotal(d) : 0) || d.mt || 0);
      const util = scopedUtilTotal(d);
      const _rc  = (typeof realizedByCompany === 'function') ? (realizedByCompany()[d.code] || 0) : 0;
      return {
        code:d.code, group:d.group, products:d.products,
        submit1:sub, obtained:obt, utilMT:util, berat:_rc,
        realPct:null, utilPct:null,
        availMT:(typeof availableInPeriod === 'function')
                  ? availableInPeriod(d, _avqCodes) : cumulativeAvailable(d),
        revType:'none', revNote:'', spiRef:d.status, remarks:d.remarks,
        rowType:'PENDING', subRows:[],
      };
    })
  ];

  /* ── Filter ────────────────────────────────────────────────────── */
  let rows = all.filter(d => {
    const mq = !q
      || d.code.toLowerCase().includes(q.toLowerCase())
      || d.products.some(p => p.toLowerCase().includes(q.toLowerCase()))
      || (d.spiRef||'').toLowerCase().includes(q.toLowerCase());
    const mf = mFilter==='ALL'      ? true
             : mFilter==='SPI'      ? ['SPI','REV','REAPPLY'].includes(d.rowType)
             : mFilter==='PENDING'  ? d.rowType==='PENDING'
             : mFilter==='REV'      ? (d.rowType==='REV' || d.rowType==='REAPPLY')
             : mFilter==='ELIGIBLE' ? (d.realPct!=null && d.realPct>=0.6)
             : true;
    return mq && mf;
  });

  /* ── Sort ────────────────────────────────────────────────────── */
  rows.sort((a,b) => a.code.localeCompare(b.code));
  if (mSort.col) {
    const col = mSort.col;
    rows.sort((a,b) => {
      const av = typeof a[col]==='number' ? (a[col]||0) : String(a[col]||'');
      const bv = typeof b[col]==='number' ? (b[col]||0) : String(b[col]||'');
      return (typeof av==='number' ? av-bv : av.localeCompare(bv)) * mSort.dir;
    });
  }

  /* ── Cell builders ──────────────────────────────────────────── */
  const mkNumCell = (val, col, breakdown) => {
    const main = val > 0
      ? `<span style="color:${col};font-weight:600;font-family:'DM Mono',monospace">${_fmtMT(val)}</span>`
      : '<span style="color:var(--txt3)">—</span>';
    if (!breakdown || !breakdown.length) return main;
    const rows = breakdown.map(([prod, mt]) =>
      `<div style="display:flex;justify-content:space-between;gap:8px;font-size:9.5px;line-height:1.6">
        <span style="color:var(--txt3);white-space:nowrap">${prod}</span>
        <span style="font-family:'DM Mono',monospace;color:${col};font-weight:600">${_fmtMT(mt)}</span>
      </div>`
    ).join('');
    return `<div>${main}<div style="margin-top:3px;padding-top:3px;border-top:1px dashed var(--border)">${rows}</div></div>`;
  };

  const mkPctCell = (pct, isUtilMode) => {
    if (pct == null) return '<span style="color:var(--txt3)">—</span>';
    const lbl  = isUtilMode ? 'Util' : 'Real';
    const col  = isUtilMode ? 'var(--blue)' : realColor(pct);
    const fill = isUtilMode ? 'var(--blue)'  : realFill(pct);
    return `<div class="u-cell">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
        <span style="font-size:9px;color:var(--txt3);font-weight:600">${lbl}</span>
        <span style="font-size:11px;font-weight:700;color:${col}">${(pct*100).toFixed(0)}%</span>
      </div>
      <div class="u-trk"><div class="u-fill" style="width:${Math.min(pct*100,100)}%;background:${fill}"></div></div>
    </div>`;
  };

  const mkAvqCell = (avq, isPending) => {
    /* Baris PENDING dulu SELALU dicetak "—", berapa pun saldonya. Itu potongan
       terakhir dari ketidaksesuaian SNSD: barisnya sudah benar menampilkan
       Obtained 120 MT, tapi kolom Available-nya tetap strip — sementara kartu
       dan halaman Available Quota menghitung 120 MT itu. Strip hanya untuk yang
       memang belum punya saldo. */
    if (isPending && !(avq > 0)) return '<span style="color:var(--txt3)">—</span>';
    const col = avq > 0 ? 'var(--teal)' : avq === 0 ? 'var(--txt3)' : 'var(--red2)';
    return `<span style="color:${col};font-weight:${avq>0?'700':'400'};font-family:'DM Mono',monospace">${fmtMt(avq)} MT</span>`;
  };

  const mkPertekCell = (d) => {
    if (d.rowType === 'PENDING') return `<div style="font-size:10.5px;color:var(--txt2);line-height:1.4">${(d.spiRef||'—').slice(0,80)}</div>`;
    const spiD = getSPI(d.code);
    const pertekNo = spiD && spiD.pertekNo ? `<div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--blue);margin-top:2px">${spiD.pertekNo}</div>` : '';
    const spiNo    = spiD && spiD.spiNo    ? `<div style="font-size:10px;font-family:'DM Mono',monospace;color:var(--teal)">${spiD.spiNo}</div>` : '';
    return `<div style="line-height:1.5"><div style="font-size:10.5px;color:var(--txt2)">${(d.spiRef||'—').slice(0,60)}</div>${pertekNo}${spiNo}</div>`;
  };

  /* ── Render rows ─────────────────────────────────────────────── */
  const tbody = document.getElementById('mainBody'); tbody.innerHTML = '';

  rows.forEach(d => {
    const rc = d.rowType==='PENDING' ? 'tr-pending'
             : d.rowType==='REV'     ? 'tr-rev'
             : d.rowType==='REAPPLY' ? 'tr-reapply'
             : d.rowType==='DONE'    ? 'tr-revdone' : '';
    const raRec  = getRA(d.code);
    const isMulti = d.subRows && d.subRows.length > 1;

    /* Re-Apply badge */
    const eligHtml = (() => {
      if (!raRec || d.realPct == null) return '<span style="color:var(--txt3)">—</span>';
      if (isReapplySubmitted(raRec)) return '<span class="badge b-reapply" style="font-size:9px;padding:1px 5px">🔵 Submitted</span>';
      if (isEligible(raRec))         return '<span class="badge b-eligible" style="font-size:9px;padding:1px 5px">✓ Eligible</span>';
      return '<span class="badge b-ineligible" style="font-size:9px;padding:1px 5px">✗ &lt;60%</span>';
    })();

    const dispPct = d.realPct != null ? d.realPct : d.utilPct;

    const tr = document.createElement('tr'); tr.className = rc;
    if (isMulti) {
      tr.innerHTML = `
        <td>
          <div class="t-code" onclick="openDrawer('${d.code}')">${d.code}</div>
          <div style="font-size:9px;color:var(--txt3);margin-top:1px">▼ ${d.subRows.length} products</div>
        </td>
        <td style="font-size:11.5px;font-weight:600">${d.group}</td>
        <td style="font-size:10.5px;color:var(--txt3);font-style:italic">${d.products.length} products · total</td>
        <td class="t-r t-mono" style="font-weight:700">${fmtMt(d.submit1)}</td>
        <td class="t-r t-mono" style="color:${d.obtained>0?'var(--teal)':'var(--txt3)'};font-weight:700">${d.obtained>0?fmtMt(d.obtained):'—'}</td>
        <td class="t-r">${mkNumCell(d.utilMT,'var(--blue)')}</td>
        <td class="t-r">${mkNumCell(d.berat,'var(--green)')}</td>
        <td style="min-width:90px">${mkPctCell(dispPct, d.realPct==null && d.utilPct!=null)}</td>
        <td class="t-r">${mkAvqCell(d.availMT, false)}</td>
        <td>${eligHtml}</td>
        <td>${statusBadge(d)}</td>
        <td style="min-width:160px">${mkPertekCell(d)}</td>`;
      tbody.appendChild(tr);

      /* Sub-rows: one per product */
      d.subRows.forEach(s => {
        const trSub = document.createElement('tr');
        trSub.className = 'tr-sub' + (rc ? ' '+rc : '');
        const dispPctS = s.realPctP != null ? s.realPctP : s.utilPctP;
        trSub.innerHTML = `
          <td></td>
          <td></td>
          <td>
            <span style="display:inline-block;width:5px;height:5px;background:var(--txt3);border-radius:1px;margin-right:5px;vertical-align:middle;opacity:.4"></span>
            <span style="font-size:11px;color:var(--txt2);font-weight:500">${s.prod}</span>
          </td>
          <td class="t-r t-mono" style="color:var(--txt3)">${s.subP>0?fmtMt(s.subP):'—'}</td>
          <td class="t-r t-mono" style="color:${s.obtP>0?'var(--teal)':'var(--txt3)'}">${s.obtP>0?fmtMt(s.obtP):'—'}</td>
          <td class="t-r">${s.utilP>0?`<span style="color:var(--blue);font-family:'DM Mono',monospace">${fmtMt(s.utilP)}</span>`:'<span style="color:var(--txt3)">—</span>'}</td>
          <td class="t-r">${s.realP>0?`<span style="color:var(--green);font-family:'DM Mono',monospace">${Number(s.realP).toLocaleString(MT_LOCALE)}</span>`:'<span style="color:var(--txt3)">—</span>'}</td>
          <td style="min-width:90px">${mkPctCell(dispPctS, s.realPctP==null && s.utilPctP!=null)}</td>
          <td class="t-r">${mkAvqCell(s.avqP, false)}</td>
          <td></td><td></td><td></td>`;
        tbody.appendChild(trSub);
      });

    } else {
      tr.innerHTML = `
        <td><div class="t-code" onclick="openDrawer('${d.code}')">${d.code}</div></td>
        <td style="font-size:11.5px;font-weight:600">${d.group}</td>
        <td>${chips(d.products)}</td>
        <td class="t-r t-mono">${fmtMt(d.submit1)}</td>
        <td class="t-r t-mono" style="color:${d.obtained>0?'var(--teal)':'var(--txt3)'}">${d.obtained>0?fmtMt(d.obtained):'—'}</td>
        <td class="t-r">${mkNumCell(d.utilMT,'var(--blue)',
          d.products.length > 1
            ? Object.entries(scopedUtilByProd(d)).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1])
            : null
        )}</td>
        <td class="t-r">${mkNumCell(d.berat,'var(--green)',
          d.products.length > 1 && d.realizationByProd && Object.keys(d.realizationByProd).length
            ? Object.entries(d.realizationByProd||{}).filter(([,v])=>v>0).sort((a,b)=>b[1]-a[1])
            : null
        )}</td>
        <td style="min-width:90px">${mkPctCell(dispPct, d.realPct==null && d.utilPct!=null)}</td>
        <td class="t-r">${mkAvqCell(d.availMT, d.rowType==='PENDING')}</td>
        <td>${eligHtml}</td>
        <td>${d.rowType==='PENDING'?'<span class="badge b-pending">⏳ Pending</span>':statusBadge(d)}</td>
        <td style="min-width:160px">${mkPertekCell(d)}</td>`;
      tbody.appendChild(tr);
    }
  });

  /* ── Totals row in tfoot ────────────────────────────────────── */
  const tfoot = document.getElementById('mainFoot');
  if (tfoot) {
    const tSubmit = rows.reduce((s,d) => s + (d.submit1||0), 0);
    const tObtain = rows.reduce((s,d) => s + (d.obtained||0), 0);
    const tUtil   = rows.reduce((s,d) => s + (d.utilMT||0),   0);
    /* Realized dari sumber kanonik, bukan penjumlahan baris. reportRealizedTotal()
       membaca baris PIB di REALIZATIONS — spesifikasi laporan — sedangkan
       penjumlahan `d.berat` hanya seakurat penjodohan RA per baris. */
    const tReal   = (typeof reportRealizedTotal === 'function')
      ? reportRealizedTotal().mt : rows.reduce((s,d) => s + (d.berat||0), 0);
    const tAvail  = rows.reduce((s,d) => s + (d.availMT||0),  0);
    const arrived = rows.filter(d => d.realPct != null);
    const avgPct  = arrived.length ? arrived.reduce((s,d) => s + d.realPct, 0) / arrived.length : null;
    const pctStr  = avgPct != null
      ? `<div class="u-cell"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:2px">
           <span style="font-size:9px;color:var(--txt3)">Avg</span>
           <span style="font-size:11px;font-weight:700;color:${realColor(avgPct)}">${(avgPct*100).toFixed(0)}%</span>
         </div><div class="u-trk"><div class="u-fill" style="width:${Math.min(avgPct*100,100)}%;background:${realFill(avgPct)}"></div></div></div>`
      : '<span style="color:var(--txt3)">—</span>';
    tfoot.innerHTML = `<tr class="tr-totals">
      <td colspan="3" style="padding-left:14px">TOTAL &nbsp;·&nbsp; ${rows.length} companies</td>
      <td class="t-r t-mono">${fmtMt(tSubmit)}</td>
      <td class="t-r t-mono" style="color:var(--teal)">${fmtMt(tObtain)}</td>
      <td class="t-r t-mono" style="color:var(--blue)">${fmtMt(tUtil)}</td>
      <td class="t-r t-mono" style="color:var(--green)">${tReal.toLocaleString(MT_LOCALE)}</td>
      <td style="min-width:90px">${pctStr}</td>
      <td class="t-r t-mono" style="color:var(--teal)">${fmtMt(tAvail)} MT</td>
      <td></td><td></td><td></td>
    </tr>`;
  }

  /* ── Pill counts ──────────────────────────────────────────────── */
  const cAll    = filteredSPI().length + filteredPending().length;
  const cSPI    = filteredSPI().length;
  const cPending = filteredPending().length;
  const pillAll  = document.getElementById('pillMAll');     if(pillAll)  pillAll.textContent  = cAll;
  const pillSPI  = document.getElementById('pillMSPI');     if(pillSPI)  pillSPI.textContent  = cSPI;
  const pillPend = document.getElementById('pillMPending'); if(pillPend) pillPend.textContent = cPending;

  /* ── Footer totals bar ───────────────────────────────────────── */
  const totBar = document.getElementById('mainTotalsBar');
  if (totBar) {
    const tS = rows.reduce((s,d) => s+(d.submit1||0), 0);
    const tO = rows.reduce((s,d) => s+(d.obtained||0), 0);
    const tU = rows.reduce((s,d) => s+(d.utilMT||0), 0);
    // Sama seperti baris TOTAL di atas — satu sumber, bukan dua.
    const tR = (typeof reportRealizedTotal === 'function')
      ? reportRealizedTotal().mt : rows.reduce((s,d) => s+(d.berat||0), 0);
    const tA = rows.reduce((s,d) => s+(d.availMT||0), 0);
    totBar.innerHTML =
      `<span style="color:var(--navy)">Submit: <strong>${fmtMt(tS)}</strong></span>` +
      `<span style="opacity:.3">·</span>` +
      `<span style="color:var(--teal)">Obtained: <strong>${fmtMt(tO)}</strong></span>` +
      `<span style="opacity:.3">·</span>` +
      `<span style="color:var(--blue)">Utilized: <strong>${fmtMt(tU)}</strong></span>` +
      `<span style="opacity:.3">·</span>` +
      `<span style="color:var(--green)">Realized: <strong>${tR.toLocaleString(MT_LOCALE)}</strong></span>` +
      `<span style="opacity:.3">·</span>` +
      `<span style="color:#0891b2">Available: <strong>${fmtMt(tA)}</strong></span>`;
  }

  document.getElementById('mainCount').textContent = `${rows.length} companies`;
}