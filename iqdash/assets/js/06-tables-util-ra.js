/* ═══════════════════════════════════════
   UTILIZATION TABLE + RA TABLE
   + Comparison List + Pending Table
═══════════════════════════════════════ */

/* Phase filter for the unified Util & Realization table.
   ALL | WAITING | INSHIP | ARRIVED | REAPPLY (chips replace the old 4 tabs). */
var utilPhase = (typeof utilPhase !== 'undefined') ? utilPhase : 'ALL';
function setUtilTab(mode, el) {
  utilPhase = mode || 'ALL';
  document.querySelectorAll('.uph-chip').forEach(c => {
    c.style.background = 'transparent';
    c.style.color = 'var(--txt2)';
    c.style.borderColor = 'var(--border2)';
  });
  if (el) {
    const colors = { ALL:'var(--navy)', INSHIP:'var(--orange)', ARRIVED:'var(--green)', WAITING:'#64748b', REAPPLY:'#5b21b6' };
    el.style.background  = colors[utilPhase] || 'var(--navy)';
    el.style.color       = '#fff';
    el.style.borderColor = 'transparent';
  }
  // The unified table always lives in utilBodyWrap; re-apply is now a filter.
  const rw = document.getElementById('raBodyWrap'); if (rw) rw.style.display = 'none';
  const uw = document.getElementById('utilBodyWrap'); if (uw) uw.style.display = '';
  renderUtilTable();
}
function toggleUtilCo(code) {
  document.querySelectorAll('.uph-sub-' + code).forEach(el => {
    el.style.display = el.style.display === 'none' ? '' : 'none';
  });
}

/* Bagi realisasi satu company ke produk-produknya.
   Porsinya dari realizationByProd (bentuk realisasi company itu sepanjang
   waktu); kalau kosong, jatuh ke porsi obtained; kalau itu pun nol, seluruhnya
   ke produk pertama. Sisa pembagian ditaruh di produk TERAKHIR supaya Σ baris
   persis sama dengan totalnya — bukan sama "kurang-lebih".

   Di ruang lingkup berkas, bukan di dalam renderUtilTable(): tabel Re-Apply
   Monitoring (#raBody) membagi realisasi yang SAMA ke produk yang sama. Menyalin
   fungsinya ke sana akan membuat dua pembagi yang bisa menyimpang diam-diam —
   persis pola yang sedang dibereskan di berkas ini. */
function splitRealPd(total, prods, rbp, obtByProd) {
  const out = {};
  if (!prods.length) return out;
  if (!(total > 0)) { prods.forEach(p => { out[p] = 0; }); return out; }
  let basis = prods.map(p => Math.max(0, (rbp && rbp[p]) || 0));
  let sum   = basis.reduce((a, b) => a + b, 0);
  if (sum <= 0) {
    basis = prods.map(p => Math.max(0, (obtByProd && obtByProd[p]) || 0));
    sum   = basis.reduce((a, b) => a + b, 0);
  }
  if (sum <= 0) { prods.forEach((p, i) => { out[p] = i === 0 ? total : 0; }); return out; }
  let acc = 0;
  prods.forEach((p, i) => {
    if (i === prods.length - 1) { out[p] = Math.round((total - acc) * 1e6) / 1e6; return; }
    const v = Math.round(total * (basis[i] / sum) * 1e6) / 1e6;
    out[p] = v; acc += v;
  });
  return out;
}

/* Satu record per COMPANY dari beberapa gelombang kedatangan (raTotals), dengan
   realPct dihitung ulang dari berat gabungannya. Dipakai dua tabel di berkas
   ini; keduanya dulu mengulang filteredRA() apa adanya dan mencetak company
   dua-gelombang (AMP, SGD) dua kali. */
function raPerCompany(pool) {
  const rows = pool || (typeof filteredRA === 'function' ? filteredRA() : []);
  const perKode = {};
  rows.forEach(r => { if (r && r.code) (perKode[r.code] = perKode[r.code] || []).push(r); });
  return Object.keys(perKode).map(code => {
    const ws = perKode[code];
    if (ws.length === 1) return ws[0];
    const t = (typeof raTotals === 'function')
      ? raTotals(code, ws)
      : { berat: ws.reduce((s, r) => s + (Number(r.berat) || 0), 0), arrived: ws.some(r => r.cargoArrived) };
    const dasar = ws[ws.length - 1];
    const obt   = Number(dasar.obtained) || 0;
    return Object.assign({}, dasar, {
      berat:        t.berat,
      cargoArrived: t.arrived,
      realPct:      obt > 0 ? t.berat / obt : (dasar.realPct || 0),
      _gelombang:   ws.length,
    });
  });
}

/* Realization Monitoring — flat per-product rows, one row per product per company */
function renderUtilTable() {
  buildFlowKPIStrip();

  const raMap = {};
  filteredRA().forEach(r => { raMap[r.code] = r; });

  /* ── Realisasi per company, DIIRIS PERIODE ─────────────────────────────────
     Sumber kanonik: realizedByCompany() di 02-period-filter.js — kolam dan
     gerbang tanggal yang SAMA persis dengan kartu Realized, sehingga Σ-nya
     selalu = kartu.

     Sebelumnya tabel ini menjawab "berapa realisasi company ini" sendiri, dari
     `realizationByProd` dan `ra.berat` — dua kolom SEPANJANG WAKTU yang tidak
     pernah mengenal periode. Di periode 07/09/2026 kartu menunjuk angka satu
     hari sementara kolom REALIZED menjumlah seumur hidup company (BBB 975,132
     + BTS 1.698,988); di 04/09/2026 tabel malah menampilkan company yang TIDAK
     punya realisasi hari itu sambil menyembunyikan yang punya — karena
     pemilihan barisnya ikut memakai gerbang yang berbeda dari kartu.

     BERLAKU JUGA UNTUK ALL TIME sejak 07-Sep-2026. Semula sengaja dibatasi ke
     periode aktif supaya angka All Time yang sudah dipakai tim tidak bergeser —
     tapi ternyata yang bergeser justru cuma DUA company, dan keduanya bergeser
     ke angka yang BENAR:

         AMP  399,942 -> 799,120   (+399,178)
         SGD  488,562 -> 1.996,098 (+1.507,536)

     Sebabnya jalur lama membaca `d.berat` dari SATU baris ra_records, padahal
     tabel itu satu baris per GELOMBANG kedatangan. AMP dan SGD masing-masing
     punya dua gelombang, jadi yang tampil hanya gelombang yang kebetulan
     terakhir diproses. Diukur ke 27 company: hanya dua itu yang berubah, dan
     sesudahnya Σ kolom REALIZED = kartu Realized persis (19.591,834). */
  const realPd = (typeof realizedByCompany === 'function') ? realizedByCompany() : null;
  const realPdOf = code => (realPd ? (realPd[String(code).toUpperCase()] || 0) : null);
  /* Tiga perilaku di bawah HANYA berlaku saat periode aktif, dan dulu ikut
     menumpang bendera realPd. Sejak realPd menyala juga di All Time, keduanya
     harus dipisah — kalau tidak, cadangan utilMT dan aturan 'arrived' ikut
     berubah di All Time, jauh melampaui yang diukur. */
  const periodeAktif = (typeof PERIOD !== 'undefined' && PERIOD.active);

  // ── Build flat per-product rows from RA + SPI data ────────────────────────────
  function buildFlatRows(d) {
    const co  = getSPI(d.code);
    const ubp = co ? scopedUtilByProd(co) : {};   // period-aware (rule #3): util sliced by lot date
    const rbp = co ? (co.realizationByProd  || {}) : {};
    const ebp = co ? (co.etaByProd          || {}) : {};
    const abp = co ? (co.arrivedByProd      || {}) : {};
    const obtByProd = co ? getObtainedByProd(co) : {};
    const prods = Object.keys(obtByProd).filter(p => (obtByProd[p]||0) > 0);

    /* Periode aktif → realisasi datang dari realizedByCompany(), dibagi ke
       produk; periode mati → jalur lama (realizationByProd / ra.berat). */
    const pdReal   = realPdOf(d.code);
    const pdSplit  = realPd
      ? splitRealPd(pdReal, prods.length ? prods : [prods[0] || d.product], rbp, obtByProd)
      : null;

    // Single-product: one row
    if (!prods.length || prods.length === 1) {
      const prod = prods[0] || d.product;
      return [{
        code: d.code, product: prod,
        obtained:     obtByProd[prod] || d.obtained || 0,
        /* `|| d.berat` itu cadangan untuk company yang statistik per-produknya
           kosong sama sekali. Saat periode aktif ia justru menyala persis
           ketika utilisasi periode = 0, sehingga kolom UTILIZED menampilkan
           berat REALISASI yang tidak berhubungan (BBB 975,132 saat difilter,
           700 saat All Time). Nol di dalam periode memang berarti nol. */
        utilMT:       ubp[prod] || (periodeAktif ? 0 : (d.berat || 0)),
        realMT:       pdSplit ? (pdSplit[prod] || 0)
                              : (rbp[prod] != null ? rbp[prod] : (d.cargoArrived ? d.berat : 0)),
        realPct:      d.realPct || 0,
        etaJKT:       ebp[prod] || d.etaJKT || '',
        cargoArrived: abp[prod] != null ? (abp[prod] === true) : d.cargoArrived,
        _isFirst: true, _isSub: false, _subCount: 1,
        _origRA: d,
      }];
    }

    // Multi-product: one full row per product
    const hasRBP = Object.keys(rbp).length > 0;
    return prods.map((prod, idx) => {
      const prodObt     = obtByProd[prod] || 0;
      const prodUtil    = ubp[prod] || 0;
      const prodArrived = Object.keys(abp).length > 0 ? (abp[prod] === true) : d.cargoArrived;
      const prodReal    = pdSplit
        ? (pdSplit[prod] || 0)
        : (hasRBP
            ? (rbp[prod] || 0)
            : (prodArrived && d.obtained > 0
                ? Math.round(d.berat * (prodObt / d.obtained) * 100) / 100
                : 0));
      const prodRealPct = prodObt > 0 ? prodReal / prodObt : 0;
      return {
        code: d.code, product: prod,
        obtained:     prodObt,
        utilMT:       prodUtil,
        realMT:       prodReal,
        realPct:      prodRealPct,
        etaJKT:       ebp[prod] || d.etaJKT || '',
        cargoArrived: prodArrived,
        _isFirst:  idx === 0,
        _isSub:    idx > 0,
        _subCount: prods.length,
        _origRA:   d,
      };
    });
  }

  // ── Build pool ──────────────────────────────────────────────────────────────
  /* SATU BARIS PER COMPANY, bukan per gelombang kedatangan.
   *
   * `ra_records` menyimpan satu baris per GELOMBANG. AMP dan SGD masing-masing
   * punya dua, dan dulu keduanya diperluas jadi baris produk sendiri-sendiri —
   * sehingga tiap produk tercetak DUA KALI dan angkanya ikut berlipat:
   *
   *     AMP  "GL ALLOY, GL ALLOY, PPGL CARBON, PPGL CARBON"
   *          Obtained 2.000 (seharusnya 1.000) · Utilized 1.600 (seharusnya 800)
   *     SGD  "GI ALLOY, GI ALLOY, SHEET PILE, SHEET PILE"
   *          Obtained 5.000 (seharusnya 2.500) · Utilized 5.000 (seharusnya 2.500)
   *
   * Obtained dan Utilized per produk sebenarnya sudah dihitung per COMPANY
   * (getObtainedByProd / scopedUtilByProd), jadi memperluas gelombang kedua
   * murni menggandakan angka yang sama — bukan menambah informasi.
   *
   * raTotals() sudah ada untuk ini dan dipakai ekspor Excel maupun CSV:
   * ia menjumlah berat seluruh gelombang dan menyatakan `arrived` bila ADA
   * gelombang yang tiba. Diperiksa terhadap data PIB: SGD 1.507,536 + 488,562
   * = 1.996,098, sama persis dengan realisasi PIB-nya — jadi menjumlahkannya
   * memang benar, dua gelombang itu nyata.
   *
   * Kolamnya dioper apa adanya supaya penyaringan periode tetap berlaku. */
  const baseRA = raPerCompany(filteredRA());
  /* ── Company ber-UTILISASI, dari kolam dan ukuran yang sama dengan kartunya ─
     Kolamnya utilizationPool(kpiPool()) dan ukurannya scopedUtilTotal() —
     dua fungsi yang persis dipakai reportUtilizedTotal(). Sebelumnya baris ini
     menjawabnya sendiri, dan meleset di dua arah sekaligus:

       1. KOLAMNYA `filteredSPI()` — gerbang SIKLUS. Kartu melebarkannya lewat
          utilizationPool() supaya company yang MEMAKAI kuota di dalam jendela
          tetap terhitung walau permitnya terbit di luar. Di Q1 2026 pelebaran
          itu berisi AMP 400, LSJ 500, SPP 250, BHG 200, NCT 150 — 1.500 MT
          yang tidak punya barisnya sama sekali di tabel.
       2. UKURANNYA jumlah lot `shipments`, padahal sejak 2026-08-04 tanggal
          utilisasi pindah ke `etaByProd` dan banyak company tidak punya lot
          berisi sama sekali. AADC 150, KARA 100, PPGL 50 karena itu lenyap
          dari tabel — bukan tampil nol, tapi TIDAK ADA barisnya: kolam ini
          menolaknya karena lotnya kosong, dan kolam Waiting di bawah juga
          menolaknya karena utilizationMT-nya > 0.

     Cacat kedua itu persis yang pernah menimpa kartunya sendiri — komentar di
     companiesWithLotsInPeriod() menyebut "BDG 350 MT dan KARA 100 MT menghilang
     dari Juni" karena alasan yang sama. Kartunya sudah diperbaiki; tabel ini
     yang tertinggal, dengan KARA yang sama. */
  const kolamUtil = (typeof utilizationPool === 'function' && typeof kpiPool === 'function')
    ? (periodeAktif ? utilizationPool(kpiPool()) : (typeof allCompaniesPool === 'function' ? allCompaniesPool() : filteredSPI()))
    : filteredSPI();
  const sudahDiKolamUtil = new Set(baseRA.map(r => r.code));
  kolamUtil.forEach(co => {
    if (!co || sudahDiKolamUtil.has(co.code)) return;
    sudahDiKolamUtil.add(co.code);
    const totalUtil = (typeof scopedUtilTotal === 'function') ? scopedUtilTotal(co) : 0;
    if (totalUtil <= 0) return;
    const allLots = co.shipments ? Object.values(co.shipments).flat() : [];
    const obt = (typeof canonicalObtained === 'function' ? canonicalObtained(co) : null) || co.obtained || 0;
    baseRA.push({
      code: co.code, product: (co.products||[]).join(' + '),
      // Use canonical obtained — consistent with KPI2 and OU chart
      berat: totalUtil,
      obtained: obt,
      cargoArrived: false, realPct: 0,
      utilPct: Math.min(1, totalUtil/(obt||1)),
      etaJKT: allLots.filter(l=>l.etaJKT).map(l=>l.etaJKT)[0] || '',
      reapplyStage: null,
    });
  });

  /* ── Company yang PUNYA realisasi di periode ini tapi belum masuk kolam ────
     Kolam di atas dipilih lewat filteredRA() + filteredSPI(), yaitu gerbang
     SIKLUS. Kartu Realized memilih lewat gerbang BARIS REALISASI (pib_date,
     atau created_at di mode "Tanggal Input"). Keduanya rutin berbeda: pada
     04/09/2026 kartu berisi BBB/BTS/KJK/LCP/SJH sementara tabel hanya
     menampilkan AMP. Selama pemilihan barisnya berbeda, Σ kolom REALIZED tidak
     akan pernah bisa sama dengan kartu — berapa pun benarnya angka per baris.

     Ditambahkan setelah kolam utama supaya company yang sudah ada tidak
     terduplikasi, dan hanya saat periode aktif. */
  if (periodeAktif && realPd) {
    const adaDiKolam = new Set(baseRA.map(r => r.code));
    Object.keys(realPd).forEach(code => {
      if (!(realPd[code] > 0) || adaDiKolam.has(code)) return;
      const co = (typeof getSPI === 'function' ? getSPI(code) : null)
              || (typeof PENDING !== 'undefined' ? PENDING.find(c => c.code === code) : null);
      if (!co) return;
      baseRA.push({
        code, product: (co.products || []).join(' + '),
        berat: 0,
        obtained: (typeof canonicalObtained === 'function' ? canonicalObtained(co) : null) || co.obtained || 0,
        cargoArrived: true, realPct: 0, utilPct: 0,
        etaJKT: '', reapplyStage: null,
      });
    });
  }

  // ── Waiting pool ────────────────────────────────────────────────────────────
  const waitingFlat = [];
  /* Gerbangnya kode yang SUDAH ada di kolom, bukan raMap (yang hanya tahu
     filteredRA). Kolam sekarang punya sumber ketiga — company ber-realisasi
     periode — dan tanpa ini company tanpa utilisasi bisa muncul dua kali:
     sekali sebagai baris realisasi, sekali lagi sebagai "Awaiting Utilization".
     Dua-duanya masuk byCo, dan realisasinya terhitung dobel. */
  const kodeDiKolam = new Set(baseRA.map(r => r.code));
  /* Kolamnya SPI + PENDING, bukan SPI saja.
   *
   * Ditemukan saat audit menyeluruh 07-Sep-2026: SNSD memegang 120 MT GI ALLOY
   * dengan nol pengiriman, dan tidak muncul di tab ini sama sekali — padahal
   * "⏳ Waiting — No shipment scheduled yet" persis menggambarkan keadaannya.
   * Sebabnya ia bersection PENDING di sheet, dan kolam ini hanya menyusuri
   * filteredSPI().
   *
   * Kolom `section` itu keterangan ASAL-USUL baris, bukan keadaan terkini —
   * alasan yang sama yang membuat processStatus() berhenti memakainya. SNSD
   * SPI-nya sudah terbit 07/08/2026 dan terbaca Completed di tab PERTEK & SPI;
   * menyembunyikannya di sini hanya karena kolom asal-usulnya membuat 120 MT
   * kuota tidak terlihat di satu-satunya layar yang menjawab "apa yang belum
   * jalan".
   *
   * Diukur: dari 41 company, hanya SATU yang bersection PENDING sekaligus
   * punya kuota — SNSD. Jadi tepat satu baris bertambah, dan gerbang di
   * bawahnya (sudah ada di kolam, utilisasi > 0, kuota <= 0) tetap menyaring
   * seperti semula. */
  [...filteredSPI(), ...(typeof filteredPending === 'function' ? filteredPending() : [])].forEach(co => {
    if (kodeDiKolam.has(co.code)) return;
    /* Sengaja gerbang SEPANJANG WAKTU, bukan utilisasi periode. Badge-nya
       berbunyi "⏳ Awaiting Utilization" — pernyataan tentang KEADAAN company,
       bukan tentang jendelanya. Company yang kuotanya sudah terpakai tahun lalu
       tidak sedang menunggu apa pun; menyebutnya begitu hanya karena jendela
       yang dipilih sempit akan salah baca. Diukur: menggantinya dengan ukuran
       periode menambah 14 baris "Awaiting" palsu pada periode 04/09/2026. */
    if ((co.utilizationMT || 0) > 0) return;
    const coObtWait = (typeof canonicalObtained === 'function' ? canonicalObtained(co) : null) || co.obtained || 0;
    if (coObtWait <= 0) return;
    /* Sekarang berlebihan pada data yang ada — diukur: menghapusnya tidak
       mengubah satu angka pun di 15 skenario. Dipertahankan untuk kasus yang
       belum muncul: statistik server bilang nol sementara Sales sudah memasukkan
       lot berisi. Di situ scopedUtilTotal() ikut nol, kolam utilisasi tidak
       menangkapnya, dan tanpa baris ini ia akan berdiri sebagai "Awaiting"
       padahal lotnya sudah ada. */
    if (co.shipments) {
      const lots = Object.values(co.shipments).flat();
      if (lots.some(l => (l.utilMT||0) > 0)) return;
    }
    const obtByProd = getObtainedByProd(co);
    const prods     = Object.keys(obtByProd).filter(p => (obtByProd[p]||0) > 0);
    if (!prods.length) return;
    prods.forEach((prod, idx) => {
      waitingFlat.push({
        code: co.code, product: prod,
        obtained: obtByProd[prod] || 0,
        utilMT: 0, realMT: 0, realPct: 0,
        etaJKT: '', cargoArrived: false,
        _isWaiting: true,
        _isFirst: idx === 0, _isSub: idx > 0, _subCount: prods.length,
      });
    });
  });

  // Expand all RA to flat rows
  const allFlat = [];
  baseRA.forEach(d => buildFlatRows(d).forEach(r => allFlat.push(r)));

  const inShipRows  = allFlat.filter(r => !r.cargoArrived);
  const arrivedRows = allFlat.filter(r =>  r.cargoArrived);

  const sortFn = (a,b) => {
    const cc = a.code.localeCompare(b.code);
    return cc !== 0 ? cc : (a.product||'').localeCompare(b.product||'');
  };
  inShipRows.sort(sortFn);
  arrivedRows.sort(sortFn);
  waitingFlat.sort(sortFn);

  // Recompute _isFirst/_isSub after sort — flags baked in pre-sort may be wrong
  // if products sort into a different order than they appeared in obtByProd.
  [inShipRows, arrivedRows, waitingFlat].forEach(arr => {
    let lastCode = null;
    const codeCounts = {};
    arr.forEach(r => { codeCounts[r.code] = (codeCounts[r.code] || 0) + 1; });
    arr.forEach(r => {
      r._isFirst  = r.code !== lastCode;
      r._isSub    = r.code === lastCode;
      r._subCount = codeCounts[r.code] || 1;
      lastCode    = r.code;
    });
  });

  const waitingCos = [...new Set(waitingFlat.map(r => r.code))].length;
  const gw = document.getElementById('gaugeWaiting');
  if (gw) gw.textContent = waitingCos;

  const tbody = document.getElementById('utilBody');
  tbody.innerHTML = '';

  // ── UNIFIED per-PT table (one summary row per company, expandable) ───────────
  // Groups the per-product rows (waitingFlat/inShipRows/arrivedRows);
  // groups by company, picks the furthest-along phase, and dims metrics that don't
  // apply to that phase. Phase filter chips replace the old 4 tabs.
  // Arrived = realization recorded (realMT>0 or cargo arrived) — same source as
  // the Total Realized KPI, so a realized PT can't show as merely in-shipment.
  const phaseOf = r => r._isWaiting ? 'WAITING' : ((Number(r.realMT) > 0 || r.cargoArrived) ? 'ARRIVED' : 'INSHIP');
  const phaseRank = { WAITING:1, INSHIP:2, ARRIVED:3 };
  const reapplyCodes = new Set((filteredRA() || []).filter(r =>
    (typeof isEligible === 'function' && isEligible(r)) ||
    (typeof isReapplySubmitted === 'function' && isReapplySubmitted(r))
  ).map(r => r.code));

  const byCo = {};
  [...waitingFlat, ...inShipRows, ...arrivedRows].forEach(r => { (byCo[r.code] = byCo[r.code] || []).push(r); });
  let coRecs = Object.keys(byCo).map(code => {
    const rs = byCo[code];
    const ra = raMap[code];
    const sumUtil = rs.reduce((s, r) => s + (Number(r.utilMT) || 0), 0);
    const sumReal = rs.reduce((s, r) => s + (Number(r.realMT) || 0), 0);
    /* Baris induk company inilah yang benar-benar tampil di #utilBody.
       Sebelumnya ia menghitung realisasinya SENDIRI dari `ra.berat` — kolom
       sepanjang waktu — sehingga menambal buildFlatRows() saja tidak berefek
       apa pun pada yang terlihat di layar.

       Sampai 2026-09-07 masih ada renderRow() di atas sini: perender baris
       per-produk sepanjang 98 baris yang sudah tidak dipanggil siapa pun sejak
       tabel beralih ke bentuk satu-baris-per-PT. Ia terlihat persis seperti
       perender tabel ini, dan percobaan memperbaiki kolom REALIZED sempat
       menambalnya — tanpa satu pun perubahan yang terlihat. Sudah dihapus.

       Saat periode aktif, angkanya = realizedByCompany() — sama dengan Σ baris
       produk di bawahnya, dan Σ seluruh baris = kartu. */
    const pdReal  = realPdOf(code);
    const arrived = periodeAktif ? (pdReal > 0) : ((ra && ra.cargoArrived) || sumReal > 0);
    const real = realPd
      ? pdReal
      : (arrived ? ((ra && Number(ra.berat) > 0) ? Number(ra.berat) : sumReal) : 0);
    const phase = arrived ? 'ARRIVED' : (sumUtil > 0 ? 'INSHIP' : 'WAITING');
    return {
      code, rows: rs,
      obtained: rs.reduce((s, r) => s + (r.obtained || 0), 0),
      util: sumUtil, real, phase, isReapply: reapplyCodes.has(code),
    };
  });
  coRecs.sort((a, b) => (phaseRank[b.phase] - phaseRank[a.phase]) || a.code.localeCompare(b.code));

  let shown = coRecs;
  if (utilPhase === 'REAPPLY')      shown = coRecs.filter(c => c.isReapply);
  else if (utilPhase && utilPhase !== 'ALL') shown = coRecs.filter(c => c.phase === utilPhase);

  const phaseBadge = ph => {
    const m = { WAITING:['Waiting','#64748b','#f1f5f9','#e2e8f0'], INSHIP:['In-shipment','var(--orange)','var(--orange-bg)','var(--orange-bd)'], ARRIVED:['Arrived','var(--green)','var(--green-bg)','var(--green-bd)'] };
    const x = m[ph] || m.WAITING;
    return `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:10px;background:${x[2]};color:${x[1]};border:1px solid ${x[3]}">${x[0]}</span>`;
  };
  const grey = `<span style="color:var(--txt3)">—</span>`;

  tbody.innerHTML = '';
  if (!shown.length) {
    tbody.innerHTML = `<tr><td colspan='7' style='padding:24px;text-align:center;color:var(--txt3);font-size:12px'>Tidak ada PT untuk fase ini.</td></tr>`;
  } else {
    shown.forEach(c => {
      const multi = c.rows.length > 1;
      const utilDisp = (c.phase !== 'WAITING' && c.util > 0)
        ? `<span class="t-mono" style="font-weight:700;color:var(--blue)">${c.util.toLocaleString(MT_LOCALE)}</span>` : grey;
      const realDisp = c.phase === 'ARRIVED'
        ? `<span class="t-mono" style="font-weight:700;color:var(--green)">${c.real.toLocaleString(MT_LOCALE)}</span>`
        : (c.phase === 'INSHIP' ? `<span style="font-size:10px;color:var(--txt3);font-style:italic">pending</span>` : grey);
      const reBadge = c.isReapply ? ` <span style="font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;background:#f5f3ff;color:#5b21b6;border:1px solid #c4b5fd">Re-apply</span>` : '';
      tbody.innerHTML += `<tr style="cursor:pointer;border-top:1px solid var(--border)" onclick="toggleUtilCo('${c.code}')">
        <td style="padding:8px 10px"><span style="display:inline-flex;align-items:center;gap:5px"><span class="t-code">${coLabel(c.code)}</span>${multi ? `<span style="font-size:9px;color:var(--txt3)">${c.rows.length}p ▸</span>` : ''}</span></td>
        <td style="padding:8px 10px;font-size:11.5px;color:var(--txt2)">${c.rows.map(r => r.product).join(', ')}</td>
        <td style="padding:8px 10px">${phaseBadge(c.phase)}${reBadge}</td>
        <td class="t-r" style="padding:8px 10px"><span class="t-mono" style="font-weight:700">${c.obtained.toLocaleString(MT_LOCALE)}</span></td>
        <td class="t-r" style="padding:8px 10px">${utilDisp}</td>
        <td class="t-r" style="padding:8px 10px">${realDisp}</td>
        <td class="t-c" style="padding:8px 10px"><span onclick="openDrawer('${c.code}');event.stopPropagation()" style="font-size:10px;font-weight:600;color:var(--blue);cursor:pointer">detail ↗</span></td>
      </tr>`;
      /* Gerbangnya realMT, bukan `cargoArrived && realMT`. `arrivedByProd`
         kosong atau false untuk hampir semua produk, sehingga rincian yang
         bisa dibuka SELALU menampilkan "—" sementara baris induknya menunjuk
         angka penuh — semua 9 company ber-produk banyak begitu, juga di All
         Time. Yang ditanya kolom ini adalah "berapa realisasinya", bukan
         "apakah kargonya tercatat tiba". */
      if (multi) c.rows.forEach(r => {
        const sp = phaseOf(r);
        tbody.innerHTML += `<tr class="uph-sub-${c.code}" style="display:none;background:var(--bg2)">
          <td style="padding:5px 10px"></td>
          <td style="padding:5px 10px 5px 20px;font-size:11px;color:var(--txt2)">↳ ${prodLabel(r.product)}</td>
          <td style="padding:5px 10px">${phaseBadge(sp)}</td>
          <td class="t-r" style="padding:5px 10px;font-size:11px">${(r.obtained || 0).toLocaleString(MT_LOCALE)}</td>
          <td class="t-r" style="padding:5px 10px;font-size:11px">${r.utilMT > 0 ? r.utilMT.toLocaleString(MT_LOCALE) : '—'}</td>
          <td class="t-r" style="padding:5px 10px;font-size:11px">${r.realMT > 0 ? r.realMT.toLocaleString(MT_LOCALE) : '—'}</td>
          <td></td>
        </tr>`;
      });
    });
  }

  const countEl = document.getElementById('utilBodyCount');
  if (countEl) countEl.textContent = `${shown.length} PT`;

  updateGaugeCounts();
}



/* Re-Apply Monitoring & Submission Plan — ALL RA companies, 9 columns */
function renderRATable() {
  // Sort: 0=Submitted → 1=Eligible → 2=InShipment → 3=Arrived<60%
  const group = d => {
    if (isReapplySubmitted(d)) return 0;
    if (isEligible(d))         return 1;
    if (!d.cargoArrived)       return 2;
    return 3;
  };
  /* ── Realisasi per company: sumber yang sama dengan kartunya ───────────────
     Dulu tabel ini menghitung realisasinya SENDIRI — Σ realizationByProd untuk
     baris induk, rbp[prod] untuk baris anak, utilizationByProd untuk kolom
     utilisasi. Tiga-tiganya kolom SEPANJANG WAKTU, sehingga begitu periode
     dipilih tabel ini menjawab pertanyaan yang berbeda dari kartu Realized dan
     dari tabel Realization Monitoring di layar yang sama. Terukur pada Q3 2026:
     kartu 2.176,008 sementara tabel ini menjumlah 12.822,326.

     Sekarang lewat realizedByCompany() — kolam dan gerbang tanggal yang sama
     dengan kartu — lalu dibagi ke produk oleh splitRealPd(). */
  const periodeAktifRA = (typeof PERIOD !== 'undefined' && PERIOD.active);
  const realPd  = (typeof realizedByCompany === 'function') ? realizedByCompany() : null;
  const realPdOf = code => (realPd ? (realPd[String(code).toUpperCase()] || 0) : 0);

  /* Realisasi SEPANJANG WAKTU, dipakai HANYA untuk kelayakan re-apply.
     "Eligible" (realisasi ≥ 60%) adalah pernyataan tentang KEADAAN company —
     kesiapannya mengajukan ulang — bukan tentang jendela yang sedang dilihat.
     Kalau ia ikut diiris periode, company yang sudah 80% terealisasi akan
     berpindah ke "< 60%" hanya karena penggunanya menyempitkan filter ke satu
     hari, dan daftar "siap re-apply" jadi tidak bisa dipakai. Sama alasannya
     dengan gerbang "Awaiting Utilization" di tabel atas. */
  const realSeumur = (typeof _asOfPeriod === 'function' && typeof realizedByCompany === 'function')
    ? _asOfPeriod(null, null, () => realizedByCompany())
    : (realPd || {});
  const realSeumurOf = code => (realSeumur[String(code).toUpperCase()] || 0);

  /* realPct diseragamkan ke definisi realisasi yang sama — isEligible() membaca
     properti ini, jadi kalau ia tetap dari `ra.berat` sementara kolomnya dari
     realizedByCompany(), badge dan angka di baris yang sama bisa bercerita
     berbeda. Satu definisi untuk keduanya. */
  const sorted = raPerCompany(filteredRA()).map(d => {
    const obt = Number(d.obtained) || 0;
    const rs  = realSeumurOf(d.code);
    return (obt > 0) ? Object.assign({}, d, { realPct: rs / obt }) : d;
  }).sort((a,b) => {
    const gd = group(a) - group(b);
    if (gd !== 0) return gd;
    // Within same group: sort A→Z by company code
    return a.code.localeCompare(b.code);
  });

  const tbody = document.getElementById('raBody');
  tbody.innerHTML = '';

  const submitted = sorted.filter(d => isReapplySubmitted(d)).length;
  const eligible  = sorted.filter(d => isEligible(d)).length;
  const inShip    = sorted.filter(d => !d.cargoArrived && !isReapplySubmitted(d)).length;
  const below     = sorted.filter(d => d.cargoArrived && !isEligible(d) && !isReapplySubmitted(d)).length;

  const badges = document.getElementById('raMonitorBadges');
  if (badges) badges.innerHTML = `
    <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:3px;background:#f5f3ff;color:#5b21b6;border:1px solid #c4b5fd">🔵 ${submitted} Submitted</span>
    <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:3px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)">✅ ${eligible} Eligible</span>
    <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:3px;background:var(--orange-bg);color:var(--orange);border:1px solid var(--orange-bd)">🚢 ${inShip} In Shipment</span>
    <span style="font-size:10px;font-weight:700;padding:3px 10px;border-radius:3px;background:var(--red-bg);color:var(--red2);border:1px solid var(--red-bd)">❌ ${below} &lt;60%</span>`;
  const counter = document.getElementById('raMonitorCount');
  if (counter) counter.textContent = `${sorted.length} compan${sorted.length===1?'y':'ies'}`;

  if (!sorted.length) {
    tbody.innerHTML = `<tr><td colspan='9' style='padding:18px;text-align:center;color:var(--txt3);font-size:12px'>No records found.</td></tr>`;
    return;
  }

  const groupLabels = [
    {txt:'🔵 Re-Apply Submitted — New PERTEK On Process (Stage 2)',        col:'#5b21b6',       bg:'#f5f3ff',           bd:'#c4b5fd'},
    {txt:'✅ Eligible — Realization ≥ 60% · Ready to Submit Re-Apply',     col:'var(--green)',   bg:'var(--green-bg)',   bd:'var(--green-bd)'},
    {txt:'🚢 In Shipment — Cargo NOT Yet at JKT · See Realization Monitoring above', col:'var(--orange)',  bg:'var(--orange-bg)',  bd:'var(--orange-bd)'},
    {txt:'❌ Arrived — Realization < 60% · Not Yet Eligible for Re-Apply', col:'var(--red2)',    bg:'var(--red-bg)',     bd:'var(--red-bd)'},
  ];

  let lastGroup = -1;
  sorted.forEach(d => {
    const g   = group(d);
    const sub = isReapplySubmitted(d);
    const elig= isEligible(d);

    // ── Group header row ──────────────────────────────────────────────
    if (g !== lastGroup) {
      lastGroup = g;
      const lbl = groupLabels[g];
      tbody.innerHTML += `<tr><td colspan='9' style='padding:6px 14px;background:${lbl.bg};border-top:2px solid ${lbl.bd};border-bottom:1px solid ${lbl.bd};font-size:10px;font-weight:700;color:${lbl.col};letter-spacing:.3px'>${lbl.txt}</td></tr>`;
    }

    // ── Per-product breakdown (multi-product detection) ──────────────
    const coSPI      = getSPI(d.code);
    const obtByProd  = coSPI ? getObtainedByProd(coSPI) : {};
    const prodKeys   = Object.keys(obtByProd);
    const isMulti    = prodKeys.length > 1;

    // Row styling by group
    const rowBg = g===0?'background:#faf5ff':g===1?'':g===2?'background:#fff8f3':'background:#fff5f5';
    const lBd   = g===0?'border-left:3px solid #8b5cf6':g===1?'border-left:3px solid var(--green-lt)':g===2?'border-left:3px solid var(--orange)':'border-left:3px solid var(--red-lt)';
    const lBdSub= g===0?'border-left:3px solid #c4b5fd':g===1?'border-left:3px solid #bbf7d0':g===2?'border-left:3px solid #fed7aa':'border-left:3px solid #fecaca';

    // Shipment Status
    const shipStatus = d.cargoArrived
      ? `<div><span style='font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)'>✓ Arrived JKT</span>
         <div style='font-size:9px;color:var(--txt3);margin-top:2px'>${d.etaJKT||''}</div></div>`
      : `<div><span style='font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--orange-bg);color:var(--orange);border:1px solid var(--orange-bd)'>🚢 In Shipment</span>
         <div style='font-size:9px;color:var(--txt3);margin-top:2px'>ETA: ${d.etaJKT||'—'}</div></div>`;

    // Company-level Realization MT — realizedByCompany(), sama dengan kartunya
    const rbpParent   = coSPI ? (coSPI.realizationByProd || {}) : {};
    const abpParent   = coSPI ? (coSPI.arrivedByProd     || {}) : {};
    /* SEPANJANG WAKTU, bukan diiris periode — dan itu bukan kelalaian.
       Tooltip kolomnya sendiri yang menetapkannya: "Realization MT ÷ Obtained ×
       100%. Eligibility threshold: ≥ 60%" dan "Obtained − Realization MT. Quota
       not yet realized." Dua-duanya pernyataan tentang KEDUDUKAN company, bukan
       tentang jendela — sama seperti kartu Available dan Pending Shipment, yang
       juga kumulatif. Kalau angkanya diiris, rumus di tooltip itu patah: badge
       ✅ Eligible akan berdiri di sebelah "12,5%".

       Jadi di tabel ini periode menyaring BARIS MANA yang tampil, bukan
       mengiris angkanya. Bandingkan dengan Realization Monitoring di atas, yang
       memang mengukur ALIRAN di dalam jendela dan karena itu Σ-nya = kartu. */
    const realMT      = realSeumurOf(d.code);
    const adaReal     = realMT > 0;
    const realPctCalc = d.obtained > 0 ? realMT / d.obtained : 0;
    const realMTCell = adaReal
      ? `<div>
           <span style='font-size:12px;font-weight:700;color:${realColor(realPctCalc)}'>${realMT.toLocaleString(MT_LOCALE)}</span>
           ${Object.keys(rbpParent).some(p => rbpParent[p] > 0 && !(abpParent[p]))
             ? `<div style='font-size:9px;color:var(--txt3);font-style:italic;margin-top:1px'>Partial · some products pending</div>`
             : ''}
         </div>`
      : `<span style='font-size:10px;color:var(--txt3);font-style:italic'>Pending arrival</span>`;

    // Company-level Realization %
    const realPctCell = adaReal
      ? `<div><div style='font-size:12px;font-weight:700;color:${realColor(realPctCalc)};margin-bottom:2px'>${(realPctCalc*100).toFixed(1)}%</div>
           <div class='u-trk' style='width:65px'><div class='u-fill' style='width:${Math.min(realPctCalc*100,100)}%;background:${realFill(realPctCalc)}'></div></div></div>`
      : `<div><div style='font-size:12px;font-weight:700;color:var(--blue);margin-bottom:2px'>${d.utilPct!=null?(d.utilPct*100).toFixed(1)+'%':'—'}</div>
           <div style='font-size:9px;color:var(--txt3);font-style:italic'>Util% · pending arrival</div></div>`;

    /* Remaining Balance = obtained − realisasi SEPANJANG WAKTU. Saldo itu STOCK,
       bukan aliran: periode menyaring company mana yang tampil, tidak mengiris
       sisa kuotanya — aturan yang sama dipakai kartu Available dan Pending
       Shipment. Memakai realisasi periode di sini akan mencetak "sisa 2.000 MT"
       untuk company yang kuotanya sudah habis, hanya karena jendelanya sempit. */
    const remaining = Math.max(0, d.obtained - realMT);
    const remCell   = remaining > 0
      ? `<span style='font-size:12px;font-weight:700;color:var(--teal)'>${remaining.toLocaleString(MT_LOCALE)}</span>`
      : `<span style='font-size:10px;font-weight:700;color:var(--green)'>✓ Fully Realized</span>`;

    // Re-Apply Status badge
    const raStatus = sub
      ? `<span class='badge b-reapply' style='font-size:10px'>🔵 Submitted</span>`
      : elig
        ? `<span class='badge b-eligible' style='font-size:10px'>✅ Eligible</span>`
        : g===2
          ? `<span style='font-size:9.5px;font-weight:700;padding:2px 7px;border-radius:3px;background:var(--orange-bg);color:var(--orange);border:1px solid var(--orange-bd)'>🚢 In Shipment</span>`
          : `<span class='badge b-ineligible' style='font-size:10px'>✗ &lt;60%</span>`;

    // Re-Apply Submission Date
    const subDate = d.reapplyEst
      ? `<span style='font-size:11px;font-weight:700;color:var(--violet)'>${d.reapplyEst}</span>`
      : d.cargoArrived
        ? `<span style='font-size:10px;color:var(--txt3)'>—</span>`
        : `<span style='font-size:9.5px;color:var(--txt3);font-style:italic'>After arrival</span>`;

    // Product cell: list all products for multi-product companies
    const prodCell = isMulti
      ? `<div style='display:flex;flex-direction:column;gap:2px'>
           ${prodKeys.map(p => `<span style='display:inline-flex;align-items:center;gap:4px;font-size:10.5px'>
             <span style='width:6px;height:6px;border-radius:2px;background:${pc(p).solid};flex-shrink:0'></span>
             <span style='font-weight:600'>${prodLabel(p)}</span>
           </span>`).join('')}
           <span style='font-size:9px;color:var(--txt3);margin-top:1px'>${prodKeys.length} products</span>
         </div>`
      : `<span style='font-size:11.5px'>${prodLabel(d.product)}</span>`;

    // ── Parent row (company-level totals) ────────────────────────────
    tbody.innerHTML += `<tr style='cursor:pointer;${rowBg};border-top:2px solid var(--border2)' onclick="openDrawer('${d.code}')">
      <td style='${lBd}'>
        <div class='t-code'>${coLabel(d.code)}</div>
        <div style='font-size:9px;color:var(--txt3);margin-top:1px'>${prodKeys.length} product${prodKeys.length>1?'s':''}</div>
      </td>
      <td>${prodCell}</td>
      <td>${shipStatus}</td>
      <td class='t-r'>${realMTCell}</td>
      <td>${realPctCell}</td>
      <td class='t-r'>${remCell}</td>
      <td>${raStatus}</td>
      <td>${subDate}</td>
      <td class='t-r t-mono' style='color:var(--amber2);font-weight:700'>${d.target?d.target.toLocaleString(MT_LOCALE)+' MT':'<span style="color:var(--txt3);font-weight:400">TBA</span>'}</td>
    </tr>`;

    // ── ↳ Sub-rows: one per product for ALL companies ──────────────────
    const pecahReal = splitRealPd(realMT, prodKeys, rbpParent, obtByProd);
    prodKeys.forEach(prod => {
      const prodObt    = obtByProd[prod] || 0;
      /* scopedUtilByProd(), bukan `utilizationByProd` mentah — kolom ini dulu
         satu-satunya di tabel yang tetap sepanjang waktu walau periodenya
         diganti, jadi baris anak bisa menyebut angka utilisasi yang tidak ada
         hubungannya dengan jendela yang sedang dilihat. */
      const ubp        = (coSPI && typeof scopedUtilByProd === 'function')
                           ? scopedUtilByProd(coSPI)
                           : (coSPI ? (coSPI.utilizationByProd || {}) : {});
      const abp        = coSPI ? (coSPI.arrivedByProd      || {}) : {};
      const prodUtilMT = ubp[prod] || 0;

      // Per-product arrival: use arrivedByProd if present, else company-level cargoArrived
      const prodArrived = Object.keys(abp).length > 0 ? (abp[prod] === true) : d.cargoArrived;

      /* Realisasi per produk = bagian company ini dari realizedByCompany(),
         dibagi porsi realizationByProd — pembagi yang SAMA dengan tabel
         Realization Monitoring, supaya dua tabel di layar yang sama tidak
         membagi realisasi satu company dengan dua cara. */
      const prodRealMT  = pecahReal[prod] || 0;
      const prodRealPct = prodObt > 0 ? prodRealMT / prodObt : 0;
      /* Sisa itu stock — lihat catatan di Remaining Balance baris induk. */
      const prodRem     = Math.max(0, prodObt - prodRealMT);

      // Utilization cell — show for in-shipment products; "—" for fully arrived
      const subUtilMTCell = prodArrived
        ? `<span style='font-size:10px;color:var(--txt3)'>—</span>`
        : (prodUtilMT > 0
            ? `<div>
                 <span style='font-size:11.5px;font-weight:600;color:var(--blue)'>${prodUtilMT.toLocaleString(MT_LOCALE)}</span>
                 <div style='font-size:9px;color:var(--txt3);margin-top:1px'>${prodObt>0?(prodUtilMT/prodObt*100).toFixed(1)+'%':''}</div>
               </div>`
            : `<span style='font-size:10px;color:var(--txt3)'>—</span>`);

      /* Gerbangnya realisasi produk itu sendiri, bukan `arrivedByProd`.
         Kolom ini KOLOM REALISASI, tapi saat arrivedByProd kosong atau false ia
         mencetak angka UTILISASI dengan label kecil "Util · Real pending" — dan
         karena arrivedByProd hampir selalu false, itulah yang biasanya terlihat.
         Akibatnya Σ baris anak tidak pernah sama dengan baris induknya: CGK
         menjumlah 1.270 (utilisasinya) di bawah induk yang menunjuk 983,188.
         Cadangan utilisasi tetap ada, tapi hanya ketika realisasinya memang
         belum ada. */
      const subRealMTCell = prodRealMT > 0
        ? `<div>
             <span style='font-size:11.5px;font-weight:600;color:${realColor(prodRealPct)}'>${prodRealMT.toLocaleString(MT_LOCALE)}</span>
             ${prodArrived ? `<span style='font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:#dcfce7;color:var(--green);border:1px solid #bbf7d0;margin-left:4px'>✓ Arrived</span>` : ''}
           </div>`
        : (prodUtilMT > 0
            ? `<div>
                 <span style='font-size:11.5px;font-weight:600;color:var(--blue)'>${prodUtilMT.toLocaleString(MT_LOCALE)}</span>
                 <div style='font-size:9px;color:var(--txt3);font-style:italic;margin-top:1px'>Util · Real pending</div>
               </div>`
            : `<span style='font-size:10px;color:var(--txt3);font-style:italic'>Pending arrival</span>`);

      const subRealPctCell = prodRealMT > 0
        ? `<div style='display:flex;flex-direction:column;gap:2px'>
             <span style='font-size:11.5px;font-weight:700;color:${realColor(prodRealPct)}'>${(prodRealPct*100).toFixed(1)}%</span>
             <div class='u-trk' style='width:55px'><div class='u-fill' style='width:${Math.min(prodRealPct*100,100)}%;background:${realFill(prodRealPct)}'></div></div>
           </div>`
        : (prodUtilMT > 0
            ? `<div style='display:flex;flex-direction:column;gap:2px'>
                 <span style='font-size:11.5px;font-weight:700;color:var(--blue)'>${prodObt>0?(prodUtilMT/prodObt*100).toFixed(1)+'%':'—'}</span>
                 <div style='font-size:9px;color:var(--txt3);font-style:italic'>Util% · pending</div>
               </div>`
            : `<span style='font-size:10px;color:var(--txt3);font-style:italic'>Pending arrival</span>`);

      // Remaining = obtained − realization; "—" if product not yet arrived
      const subRemCell = prodRealMT > 0
        ? (prodRem > 0
            ? `<span style='font-size:11.5px;font-weight:600;color:var(--teal)'>${prodRem.toLocaleString(MT_LOCALE)}</span>`
            : `<span style='font-size:10px;font-weight:700;color:var(--green)'>✓ Full</span>`)
        : `<span style='font-size:10px;color:var(--txt3)'>—</span>`;

      tbody.innerHTML += `<tr style='cursor:pointer;${rowBg}' onclick="openDrawer('${d.code}')">
        <td style='${lBdSub};padding:3px 8px'>
          <span style='font-size:10.5px;color:var(--txt3);padding-left:10px'>↳</span>
        </td>
        <td style='padding:4px 8px 4px 20px'>
          <span style='display:inline-flex;align-items:center;gap:5px'>
            <span style='width:7px;height:7px;border-radius:50%;background:${pc(prod).solid};flex-shrink:0'></span>
            <span style='font-size:11.5px;color:var(--txt2);font-weight:500'>${prodLabel(prod)}</span>
          </span>
          <div style='font-size:9.5px;color:var(--txt3);margin-top:1px;padding-left:12px'>
            Obtained: <strong style='color:var(--txt2)'>${prodObt.toLocaleString(MT_LOCALE)}</strong> MT
          </div>
        </td>
        <td style='padding:3px 8px'><span style='font-size:10px;color:var(--txt3)'>↑ same</span></td>
        <td class='t-r' style='padding:3px 8px'>${subRealMTCell}</td>
        <td style='padding:3px 8px'>${subRealPctCell}</td>
        <td class='t-r' style='padding:3px 8px'>${subRemCell}</td>
        <td style='padding:3px 8px'></td>
        <td style='padding:3px 8px'></td>
        <td style='padding:3px 8px'></td>
      </tr>`;
    });
  });
}


/* Comparison list */
function buildCmpList() {
  // Use filteredSPI so the bar scale matches the rendered list when a period is active.
  // Coerce to Number and guard against null/missing submit1 — Math.max(...[NaN]) → NaN.
  const filtered = filteredSPI();
  const maxS = Math.max(1, ...filtered.map(d => Number(d.submit1) || 0));
  const el = document.getElementById('cmpList'); if (!el) return; el.innerHTML = '';
  [...filtered].sort((a,b) => a.code.localeCompare(b.code)).forEach(co => {
    const ra = getRA(co.code);
    const div = document.createElement('div');
    div.style.cssText = 'padding:6px 2px;border-bottom:1px solid var(--border);cursor:pointer;border-radius:3px;transition:background .1s';
    const submit1 = Number(co.submit1) || 0;
    const obtained = Number(co.obtained) || 0;
    div.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">
        <span style="font-size:12px;font-weight:700">${coLabel(co.code)} <span style="font-size:9px;color:var(--txt3);font-weight:400">${co.group}</span></span>
        <div style="display:flex;gap:6px;font-size:10.5px;font-family:'DM Mono',monospace">
          <span style="color:var(--navy2)">S:${submit1.toLocaleString(MT_LOCALE)}</span>
          <span style="color:var(--teal);font-weight:700">O:${obtained.toLocaleString(MT_LOCALE)}</span>
          ${ra ? `<span style="color:var(--green);font-weight:700">${(ra.realPct*100).toFixed(0)}%</span>` : ''}
        </div>
      </div>
      <div style="display:flex;flex-direction:column;gap:2px">
        <div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:9px;color:var(--txt3);font-weight:700;width:12px">S</span>
          <div style="flex:1;height:5px;background:var(--bg);border-radius:2px;overflow:hidden"><div style="height:5px;border-radius:2px;background:rgba(24,38,68,.35);width:${submit1/maxS*100}%"></div></div>
        </div>
        <div style="display:flex;align-items:center;gap:5px">
          <span style="font-size:9px;color:var(--txt3);font-weight:700;width:12px">O</span>
          <div style="flex:1;height:5px;background:var(--bg);border-radius:2px;overflow:hidden"><div style="height:5px;border-radius:2px;background:#0c7c84;width:${obtained/maxS*100}%"></div></div>
        </div>
      </div>`;
    div.onmouseover = () => div.style.background = 'var(--blue-bg)';
    div.onmouseout  = () => div.style.background = '';
    div.onclick = () => openDrawer(co.code);
    el.appendChild(div);
  });
}

/* Pending table */
function buildPendingTable() {
  const tbody = document.getElementById('pendingBody'); if (!tbody) return; tbody.innerHTML = '';
  [...filteredPending()].sort((a,b) => a.code.localeCompare(b.code)).forEach(d => {
    tbody.innerHTML += `<tr class="tr-pending" style="cursor:pointer" onclick="openDrawerPending('${d.code}')">
      <td><div class="t-code">${coLabel(d.code)}</div></td>
      <td style="font-size:11.5px;font-weight:600">${d.group}</td>
      <td>${chips(d.products)}</td>
      <td class="t-r t-mono">${d.mt.toLocaleString(MT_LOCALE)}</td>
      <td><span class="badge b-pending">${d.status}</span></td>
      <td style="font-size:11px;color:var(--txt3)">${d.date}</td>
    </tr>`;
  });
}

/* All companies table */
let mFilter = 'ALL', mSort = {col:null,dir:1};
function setMF(f, el) { mFilter=f; document.querySelectorAll('#page-all .fpill').forEach(p=>p.classList.remove('on')); el.classList.add('on'); renderMain(); }
function sortM(col) { if(mSort.col===col)mSort.dir*=-1; else{mSort.col=col;mSort.dir=1;} renderMain(); }