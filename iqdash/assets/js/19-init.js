/* ═══════════════════════════════════════
   APP INIT — window.onload
   Available Quota page tabs
   Rev/Pending summary strips
   Last-update clock
═══════════════════════════════════════ */

document.addEventListener('DOMContentLoaded', async () => {
  // ── Disable Chart.js animations globally ──────────────────
  // Boot creates ~10 charts back-to-back; each default-animated chart
  // costs ~200-400ms of main-thread time. Killing animations cuts
  // perceived load time by 2-3s on slower devices without impacting UX.
  if (typeof Chart !== 'undefined' && Chart.defaults) {
    Chart.defaults.animation = false;
    Chart.defaults.animations = { colors: false, x: false, y: false };
    Chart.defaults.responsiveAnimationDuration = 0;
  }

  /* ── Tahun kuota dipulihkan SEBELUM data dimuat ────────────────────────
     loadData() langsung mengiris payload ke tahun yang sedang dipilih, jadi
     pilihan tersimpan harus sudah terbaca saat itu. Kalau tidak, halaman
     sempat menampilkan 2026 lalu melompat ke 2027 sesudahnya — kedipan yang
     terbaca sebagai angka berubah sendiri. */
  if (typeof loadQuotaYearPref === 'function') loadQuotaYearPref();
  if (typeof renderQuotaYearUI === 'function') renderQuotaYearUI();

  // ── Load data from PostgreSQL API ──────────────────────────
  // The server is the single source of truth for display. We never
  // merge localStorage into SPI/PENDING/RA anymore — that used to mask
  // newer DB changes from other users with stale local copies.
  // The realization summary loads in parallel — used by the drawer to
  // decide whether to render the "Detail Realization" button + badge.
  await Promise.all([
    loadData(),
    (typeof loadRealizationSummary === 'function' ? loadRealizationSummary() : Promise.resolve()),
    // PIB lines — the Total Realized KPI reads these (see 03-kpis.js KPI 3).
    (typeof loadRealizations === 'function' ? loadRealizations() : Promise.resolve()),
  ]);

  // ── Migrate any pending local edits from a previous session ────────
  // If the user had a save fail (e.g. server was down), buffered edits
  // are pushed to DB now — but only if the user's snapshot is strictly
  // newer than the DB row (server-side concurrency check). Stale local
  // entries are discarded so they can't overwrite newer DB data.
  if (typeof migrateLocalToServer === 'function') {
    try {
      const summary = await migrateLocalToServer();
      const total = (summary.pushed||0) + (summary.discardedStale||0) + (summary.conflicts||0) + (summary.failed||0);
      if (total > 0) {
        console.log('[migrateLocalToServer]', summary);
        if (typeof showToast === 'function') {
          if (summary.pushed)         showToast(`Synced ${summary.pushed} pending edit(s) from your last session`, 'success');
          if (summary.discardedStale) showToast(`${summary.discardedStale} pending edit(s) discarded — DB had newer data`, 'warn');
          if (summary.conflicts)      showToast(`${summary.conflicts} pending edit(s) skipped — modified by another user`, 'warn');
          if (summary.failed)         showToast(`${summary.failed} edit(s) couldn't sync; will retry next time`, 'error');
        }
        // After migration, refresh data so display reflects what's actually
        // in the DB (including anything we just pushed).
        await loadData();
      }
    } catch (e) {
      console.error('migrateLocalToServer failed:', e);
    }
  }

  updateStorageStatus();

  // Populate edit dropdown — single flat list, sorted alphabetically A→Z.
  // Label format: "CODE — Full Company Name" (resolved from
  // company_directory). Listing products instead of names was confusing
  // because multiple companies share the same product list.
  // Includes:
  //   1. All existing SPI/PENDING companies (for editing)
  //   2. Companies from company_directory that don't yet have any
  //      submission row — so CorpSec can add a brand-new New Submission
  //      (e.g. PT IKM filing its first MOI). dataset.isNew flags these
  //      so saveEdit POSTs /api/company instead of PATCHing.
  const sel = document.getElementById('editCo');
  const existingCodes = new Set([...SPI, ...PENDING].map(d => d.code));
  const resolveName = code => {
    if (typeof lookupCompanyNameByCode === 'function') {
      const n = lookupCompanyNameByCode(code);
      if (n) return n;
    }
    return '';
  };

  // Build a unified list of {code, name, isNew} entries
  const dropdownEntries = [];
  [...SPI, ...PENDING].forEach(d => {
    dropdownEntries.push({
      code: d.code,
      name: d.fullName || resolveName(d.code) || (d.products || []).join(', '),
      isNew: false,
    });
  });
  (COMPANY_DIRECTORY || []).forEach(d => {
    if (!d.abbreviation || existingCodes.has(d.abbreviation)) return;
    dropdownEntries.push({
      code: d.abbreviation,
      name: d.fullName || '',
      isNew: true,
    });
  });
  dropdownEntries.sort((a, b) => a.code.localeCompare(b.code));
  dropdownEntries.forEach(e => {
    const o = document.createElement('option');
    o.value = e.code;
    o.textContent = `${e.code} — ${e.name}`;
    if (e.isNew) o.dataset.isNew = '1';
    sel.appendChild(o);
  });

  // ── Two-phase render ──────────────────────────────────────
  // Phase 1 (synchronous): only what the user sees first — the Overview
  // page, the KPI strip, and the period filter. Anything tied to a
  // non-active tab (Util / Comparison / Available Quota / SPI page) is
  // pushed to Phase 2 so the initial paint isn't blocked.
  buildPipeline();
  buildProductDonut();
  buildTopCo();
  buildFlowKPIStrip();
  buildOUChartOverview();
  buildRevSummaryStrip();
  buildPendingSummaryStrip();
  updatePeriodUI();
  updateOverviewKPIs();

  // Phase 2 (deferred): off-screen tabs + heavy analytics. Scheduled
  // via requestAnimationFrame + microtask so initial Overview paint
  // commits FIRST, then the rest renders in the next frame. This keeps
  // navigation to other tabs safe (renders complete within ~16-32ms,
  // far faster than human click latency).
  requestAnimationFrame(() => {
    // Group A — table renders for other tabs (cheap, immediate)
    renderSPI();
    buildSpiTerbitTable();
    renderMain();
    buildRevList();
    buildPendingQuick();
    buildPendingTable();
    buildRevDetailTable();
    buildCmpList();
    // Group B — heavier chart renders, next frame
    requestAnimationFrame(() => {
      buildCmpChart();
      buildGauge();
      buildUtilChart();
      buildAvailableQuota();
      buildOUChart();
      renderUtilTable();
      renderRATable();
      updateOUOverviewKPIs();
      updateSalesIntelKPIs();
      buildLeadTimeAnalytics();
    });
  });
});

/* ── LAST UPDATE (data-edit time from server) ───────────────────────
   Shows when the DATA was last edited (server-provided, identical on every
   device) — NOT a per-device wall clock. Re-rendered by loadData() each fetch.
   The instant is the same for all viewers; it's formatted in local time. */
function renderLastUpdate() {
  const el = document.getElementById('tbDateTime');
  if (!el) return;
  const iso = window.LAST_DATA_UPDATE;
  const d = iso ? new Date(iso) : null;
  if (!d || isNaN(d)) { el.textContent = 'Last update: —'; return; }
  const dd = String(d.getDate()).padStart(2,'0');
  const mo = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][d.getMonth()];
  const yy = d.getFullYear();
  const hh = String(d.getHours()).padStart(2,'0');
  const mm = String(d.getMinutes()).padStart(2,'0');
  el.textContent = `Last update: ${dd} ${mo} ${yy}  ${hh}:${mm}`;
}
renderLastUpdate();

/* ══════════════════════════════════════════════════
   AVAILABLE QUOTA PAGE — TAB CONTROLLER
══════════════════════════════════════════════════ */
function setAvqTab(tab, el) {
  ['chart','prod','table'].forEach(t => {
    const v = document.getElementById('avqView' + t.charAt(0).toUpperCase() + t.slice(1));
    if (v) v.style.display = (t === tab) ? (t==='chart'?'block':'') : 'none';
  });
  // Reset all tab buttons
  ['avqTabChart','avqTabProd','avqTabTable'].forEach(id => {
    const b = document.getElementById(id);
    if (b) { b.style.background = 'var(--bg)'; b.style.color = 'var(--txt3)'; }
  });
  if (el) { el.style.background = 'var(--navy)'; el.style.color = '#fff'; }
  // Set display of prod view properly
  const pv = document.getElementById('avqViewProd');
  if (pv) pv.style.display = tab==='prod' ? 'block' : 'none';
  const tv = document.getElementById('avqViewTable');
  if (tv) tv.style.display = tab==='table' ? 'block' : 'none';
  // Rebuild if needed
  if (tab === 'prod')  buildAvqProdGrid();
  if (tab === 'table') buildAvqTable();
}

/* ── KPI cards on Available Quota page ── */
function buildAvqPageKPIs() {
  // Obtained basis MUST match the AVQ breakdown chart directly below these cards
  // (buildAvailableQuota uses canonicalObtained). Using the PERTEK-gated
  // canonicalObtainedFiltered here made the cards read 0 while the breakdown
  // showed the real balance for the same companies — a page-internal
  // contradiction. canonicalObtained honours the ledger and, for an active
  // period, counts every company that companyInPeriod() surfaces (i.e. any
  // Submit/Obtained/Revision-Request activity in range), showing its balance.
  // NOTE: this intentionally diverges from Overview KPI2 (quota *issued* in the
  // period) — the AVQ page answers "balance of companies active this period".
  /* All three figures are CUMULATIVE, matching the Overview card and the PDF
     (see cumulativeAvailable()'s docblock — a balance is a stock, not activity
     inside a window). The period narrows WHICH companies appear, which is
     exactly the question this page asks: "balance of companies active this
     period". Previously it mixed all-time obtained with PERIOD utilisation, so
     obtained − utilised did not equal the available it printed, and none of
     the three agreed with the Overview card (H1 2026: page 16,540, chart
     13,630, card 11,693). */
  /* SUPERSEDES the reasoning above. The note kept obtained and utilised
     ALL-TIME here (canonicalObtained, co.utilizationMT) while the company list
     was period-filtered, on the argument that this page answers "balance of
     companies active this period". In practice that printed 30.140 / 18.447
     under the H1 2026 filter against the Overview card's 19.710 / 17.300 —
     three pages, one label, three numbers. The data owners' instruction
     (2026-08-05) is that the figures must agree on every page under every
     period, so this page now calls the same report totals as the rest.
     Available stays cumulative, as confirmed 2026-08-04. */
  const _avq  = reportAvailableTotal();
  const totalObt  = reportObtainedTotal().mt;
  const totalUtil = reportUtilizedTotal().mt;
  const totalAvq  = _avq.mt;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('avqKpi1', fmtMt(totalAvq));
  set('avqKpi2', fmtMt(totalObt));
  set('avqKpi3', fmtMt(totalUtil));
  set('avqKpi4', _avq.companies);

  const utilPct = totalObt > 0 ? (totalUtil / totalObt * 100).toFixed(1) : 0;
  const avqPct  = totalObt > 0 ? (totalAvq  / totalObt * 100).toFixed(1) : 0;

  const f1 = document.getElementById('avqKpiFill1');
  if (f1) f1.style.width = avqPct + '%';
  const f3 = document.getElementById('avqKpiFill3');
  if (f3) f3.style.width = utilPct + '%';

  const t1 = document.getElementById('avqKpiTag1');
  if (t1) t1.textContent = avqPct + '% of obtained remaining';
  const t3 = document.getElementById('avqKpiTag3');
  if (t3) t3.textContent = utilPct + '% utilization rate';

  /* Ketiga kartu ini TIDAK memakai basis yang sama, dan itu memang disengaja:
     Available adalah SALDO (kumulatif), sedangkan Obtained & Utilized adalah
     AKTIVITAS di dalam periode. Begitu periode aktif, "Available = Obtained −
     Utilized" tidak lagi berlaku di baris kartu ini — dan sebelumnya tidak ada
     satu pun tulisan yang mengatakannya, sehingga terbaca sebagai angka yang
     saling bertentangan. Permintaan tim Sales 2026-08-11 poin 1: kalau memang
     metrik berbeda, beri label yang jelas berbeda. */
  const basis = (id, teks) => { const el = document.getElementById(id); if (el) el.textContent = teks; };
  if (PERIOD.active) {
    basis('avqKpiUnit1', 'MT · saldo kumulatif (all-time)');
    basis('avqKpiUnit2', 'MT · terbit DI DALAM periode');
    basis('avqKpiUnit3', 'MT · terpakai DI DALAM periode');
    basis('avqKpiUnit4', 'companies with balance in period');
  } else {
    basis('avqKpiUnit1', 'MT · remaining from obtained');
    basis('avqKpiUnit2', 'MT · SPI / PERTEK issued');
    basis('avqKpiUnit3', 'MT · allocated to customers');
    basis('avqKpiUnit4', 'companies with available balance');
  }
  /* Catatan ini berlaku untuk KETIGA view (Chart · By Product · Table) —
     ketiganya merender dari kolam yang sama, jadi saldo yang disembunyikan
     syarat aktivitas hilang dari ketiganya sekaligus. Disebutkan di sini supaya
     tidak ada view yang diam soal itu; kartu bayangannya sendiri hanya ada di
     By Product (2026-08-18). */
  const note = document.getElementById('avqBasisNote');
  if (note) {
    if (!PERIOD.active) {
      note.textContent = 'Tanpa filter periode ketiganya satu basis: Available = Obtained − Utilized.';
    } else {
      const _h = (typeof availableHiddenByActivity === 'function')
                   ? availableHiddenByActivity() : { mt: 0, companies: [] };
      let teks = 'Available = saldo kumulatif; Obtained & Utilized = aktivitas di dalam periode. '
        + 'Ketiganya sengaja beda basis, jadi Available ≠ Obtained − Utilized selama filter periode aktif.';
      if (_h.mt > AVQ_EPS) {
        teks += ' <strong>Di luar angka ini masih ada ' + fmtMt(_h.mt) + ' MT saldo berjalan</strong> di '
          + _h.companies.length + ' perusahaan (' + _h.companies.join(', ') + ') yang kuotanya sudah terbit '
          + 'per akhir periode tapi tidak beraktivitas di dalamnya — lihat tab By Product untuk rinciannya.';
      }
      note.innerHTML = teks;
    }
  }
}

/* ── By Product grid view ── */

/* Apakah kartu bayangan (saldo di luar periode) ikut ditampilkan.
   Default TERTUTUP: angka headline halaman ini punya definisi yang sudah
   dicocokkan ke master, dan yang default harus tetap definisi itu. Yang
   diperbaiki adalah saldo itu tidak lagi hilang DIAM-DIAM — ada banner yang
   menyebut jumlahnya, dan satu klik untuk melihatnya. */
let _avqShowHidden = false;

function toggleAvqHidden() {
  _avqShowHidden = !_avqShowHidden;
  buildAvqProdGrid();
}

function buildAvqProdGrid() {
  const grid = document.getElementById('avqProdGrid');
  if (!grid) return;
  /* productTotals(): obtained & utilized dari SELURUH pemegang produk, available
     dari rincian kanonik. Sebelumnya ketiganya diambil dari availableQuotaRows()
     saja — hanya company yang masih bersisa — sehingga kartu GI ALLOY menulis
     "obtained 4.270" untuk produk yang sebenarnya pernah memperoleh 9.681 MT
     (dilaporkan tim 2026-08-12). */
  const prodMap = productTotals();
  /* Produk yang saldonya sudah habis dibuang — disaring SESUDAH penjumlahan,
     karena satu produk bisa nol di satu PT tapi masih bersisa di PT lain
     (2026-08-10). */
  Object.keys(prodMap).forEach(p => { if ((prodMap[p].avail || 0) <= 0.001) delete prodMap[p]; });
  const PROD_CLR = {
    'GL BORON':'#0369a1','GI BORON':'#0f766e','SHEETPILE':'#b45309',
    'BORDES ALLOY':'#dc2626','PPGL CARBON':'#7c3aed','ERW PIPE OD≤140mm':'#9333ea',
    'ERW PIPE OD>140mm':'#0891b2','AS STEEL':'#64748b','Hollow Pipe':'#78716c',
    'SEAMLESS PIPE':'#0d6946','HRC/HRPO ALLOY':'#ca8a04',
  };
  const clr = p => { for (const k in PROD_CLR) if (p && p.toUpperCase().includes(k.toUpperCase())) return PROD_CLR[k]; return '#64748b'; };
  /* `grid._prodMap` dulu disimpan di sini "untuk popup". Popup kini membaca
     availableQuotaRows() langsung, jadi state itu tidak dibaca siapa pun —
     dan state yang hanya ditulis persis yang membuat dua permukaan bisa
     bergeser diam-diam. Dihapus. */

  /* Basis angkanya dinyatakan terang-terangan saat periode aktif.
     Ketiga angka kartu ini KUMULATIF — saldo itu stock, jadi obtained dan
     utilized pasangannya juga harus all-time, kalau tidak identitas
     obtained − utilized = available tidak berlaku (lihat availableQuotaRows()).
     Tanpa keterangan ini kata "OBTAINED" di bawah filter Februari wajar dibaca
     "diperoleh pada Februari", dan itu persis yang membuat laporan tim lain
     menulis GL ALLOY 900 sementara kartu ini 1.900 (dilaporkan 2026-08-18). */
  const basisEl = document.getElementById("avqProdBasis");
  if (basisEl) {
    if (PERIOD.active) {
      basisEl.style.display = "block";
      basisEl.innerHTML = "<strong>Basis: saldo kumulatif (seluruh waktu)</strong> untuk perusahaan yang aktif pada " +
        PERIOD.label + ". Obtained &amp; Utilized di kartu ini adalah TOTAL sepanjang waktu perusahaan tersebut — " +
        "bukan yang diperoleh atau dipakai di dalam periode — supaya Obtained − Utilized = Available tetap berlaku. " +
        "Untuk angka yang benar-benar diperoleh DI DALAM periode, pakai kartu <strong>SPI / Pertek Obtained</strong> di Overview.";
    } else { basisEl.style.display = "none"; basisEl.innerHTML = ""; }
  }
  const entries = Object.entries(prodMap).sort((a,b) => b[1].avail - a[1].avail);
  const cards = entries.map(([prod, d]) => {
    // Suppress tiny negative avail (XLSX manual re-allocation rounding artifacts)
    const dispAvail = snapZero(d.avail);
    const utilPct = d.obtained > 0 ? Math.min((d.util / d.obtained * 100), 100).toFixed(0) : 0;
    const avqPct  = d.obtained > 0 ? Math.max(0, Math.min((dispAvail / d.obtained * 100), 100)).toFixed(0) : 0;
    const c = clr(prod);
    return `<div style="border:1px solid var(--border);border-radius:var(--r2);overflow:hidden;box-shadow:var(--sh)">
      <div style="background:${c};padding:9px 14px;display:flex;justify-content:space-between;align-items:center">
        <span style="font-size:11.5px;font-weight:700;color:#fff">${prod}</span>
        <span onclick="openProdCoPopup(event,'${prod.replace(/'/g,"\\'")}',this)"
          style="font-size:10px;font-weight:700;padding:2px 9px;border-radius:3px;background:rgba(255,255,255,.22);color:#fff;
          cursor:pointer;border:1px solid rgba(255,255,255,.35);transition:background .15s;user-select:none"
          onmouseover="this.style.background='rgba(255,255,255,.38)'"
          onmouseout="this.style.background='rgba(255,255,255,.22)'"
          title="Klik untuk rincian per company">
          ${d.holders.length} co. ▾
        </span>
      </div>
      <div style="padding:10px 14px">
        <div style="display:flex;justify-content:space-between;margin-bottom:8px">
          <div style="text-align:center;flex:1"><div style="font-size:16px;font-weight:700;color:var(--teal)">${fmtMt(d.obtained)}</div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt3)">Obtained</div></div>
          <div style="text-align:center;flex:1"><div style="font-size:16px;font-weight:700;color:var(--green)">${fmtMt(d.util)}</div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt3)">Utilized</div></div>
          <div style="text-align:center;flex:1"><div style="font-size:16px;font-weight:700;color:${c}">${fmtMt(dispAvail)}</div><div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt3)">Available</div></div>
        </div>
        <div style="height:6px;background:var(--border);border-radius:3px;overflow:hidden;margin-bottom:5px">
          <div style="height:6px;background:${c};border-radius:3px;width:${avqPct}%;transition:width .8s"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:10px;color:var(--txt3)">
          <span>${avqPct}% available</span>
          <!-- Badge di atas = SELURUH pemegang produk (sepadan dengan Obtained);
               daftar di sini = yang masih PUNYA SISA, yaitu yang bisa dijual. -->
          <span style="font-size:9.5px;color:var(--txt3)" title="Company yang masih punya sisa">
            sisa di ${d.cos.slice(0,3).join(', ')}${d.cos.length>3?' +'+(d.cos.length-3):''}
          </span>
        </div>
      </div>
    </div>`;
  });

  /* ── SALDO YANG DISEMBUNYIKAN SYARAT AKTIVITAS ──────────────────────────
     Kolam halaman ini menuntut dua hal: (1) company beraktivitas di dalam
     periode, (2) kuotanya sudah terbit s/d akhir periode. Syarat #2 kausal dan
     benar — saldo tidak bisa ada sebelum kuota yang melahirkannya. Syarat #1
     adalah saringan AKTIVITAS yang dikenakan pada angka SALDO, dan itulah yang
     membuat produk berkedip hilang-muncul antar bulan tanpa saldonya berubah.

     Dilaporkan tim 2026-08-18: dengan filter Maret 2026, GL ALLOY dan HRPO
     ALLOY tidak muncul sama sekali. Keduanya nyata — GNG/CGK dan MJU memang
     masih memegang saldo itu — hanya saja tidak ada satu pun tanggal cycle
     mereka yang jatuh di Maret. Angka Maret tidak salah; yang salah adalah
     tidak ada apa pun di layar yang mengatakan ada 700 MT yang tidak
     ditampilkan. Saldo yang hilang tanpa jejak dibaca sebagai "tidak ada yang
     bisa dijual" — kelas kesalahan yang paling mahal di halaman ini.

     Angka headline SENGAJA tidak diubah (definisinya sudah dicocokkan ke
     master untuk H1 2026). Yang ditambahkan: pernyataan + kartu bayangan
     opsional yang jelas-jelas ditandai di luar periode. */
  const _hid  = (typeof availableHiddenByActivity === 'function')
                  ? availableHiddenByActivity() : { mt: 0, companies: [], byProduct: {} };
  const hidEntries = Object.entries(_hid.byProduct)
    .filter(([, d]) => d.avail > 0.001)
    .sort((a, b) => b[1].avail - a[1].avail);

  if (_avqShowHidden) {
    hidEntries.forEach(([prod, d]) => {
      const c = clr(prod);
      cards.push(`<div style="border:1px dashed ${c};border-radius:var(--r2);overflow:hidden;opacity:.72;background:repeating-linear-gradient(135deg,transparent,transparent 7px,var(--bg2) 7px,var(--bg2) 14px)">
        <div style="background:${c};padding:9px 14px;display:flex;justify-content:space-between;align-items:center;opacity:.85">
          <span style="font-size:11.5px;font-weight:700;color:#fff">${prod}</span>
          <span style="font-size:9px;font-weight:700;padding:2px 8px;border-radius:3px;background:rgba(255,255,255,.22);color:#fff;border:1px solid rgba(255,255,255,.35)">
            ${d.cos.length} co. · di luar periode
          </span>
        </div>
        <div style="padding:10px 14px">
          <div style="text-align:center;margin-bottom:7px">
            <div style="font-size:16px;font-weight:700;color:${c}">${fmtMt(d.avail)}</div>
            <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt3)">Available · saldo berjalan</div>
          </div>
          <div style="font-size:9.5px;color:var(--txt3);line-height:1.5">
            Kuota sudah terbit s/d akhir periode dan saldonya masih ada di
            <strong>${d.cos.join(', ')}</strong>, tapi tidak ada aktivitas
            (MOI/PERTEK/MOT/SPI) di ${PERIOD.label}. TIDAK dihitung di kartu KPI
            maupun tabel halaman ini.
          </div>
        </div>
      </div>`);
    });
  }

  grid.innerHTML = cards.join('');

  const hidEl = document.getElementById('avqProdHidden');
  if (hidEl) {
    if (PERIOD.active && hidEntries.length) {
      const namaProd = hidEntries.map(([prod, d]) => `${prod} ${fmtMt(d.avail)}`).join(' · ');
      hidEl.style.display = 'block';
      hidEl.innerHTML =
        `<strong>${fmtMt(_hid.mt)} MT saldo berjalan tidak ditampilkan di atas</strong> — `
        + `${_hid.companies.length} perusahaan (${_hid.companies.join(', ')}) sudah memegang kuota `
        + `per akhir ${PERIOD.label} dan saldonya masih ada, tapi tidak ada aktivitas `
        + `MOI/PERTEK/MOT/SPI di dalam periode itu, sehingga di luar kolam halaman ini.<br>`
        + `<span style="color:var(--txt3)">${namaProd}</span> `
        + `<span onclick="toggleAvqHidden()" style="display:inline-block;margin-left:6px;font-weight:700;color:#0891b2;cursor:pointer;text-decoration:underline;user-select:none">`
        + `${_avqShowHidden ? 'sembunyikan' : 'tampilkan kartunya'}</span>`;
    } else {
      hidEl.style.display = 'none';
      hidEl.innerHTML = '';
    }
  }
}

/* ── Product → Company popup ─────────────────────────────────────────── */
function openProdCoPopup(event, prodName, anchorEl) {
  event.stopPropagation();
  const popup  = document.getElementById('prodCoPopup');
  const box    = document.getElementById('prodCoPopupBox');
  if (!popup || !box) return;

  const PROD_CLR = {
    'GL BORON':'#0369a1','GI BORON':'#0f766e','SHEETPILE':'#b45309',
    'BORDES ALLOY':'#dc2626','PPGL CARBON':'#7c3aed','ERW PIPE OD≤140mm':'#9333ea',
    'ERW PIPE OD>140mm':'#0891b2','AS STEEL':'#64748b','HOLLOW PIPE':'#78716c',
    'SEAMLESS PIPE':'#0d6946','HRC/HRPO ALLOY':'#ca8a04',
  };
  const clr = p => { for (const k in PROD_CLR) if (p && p.toUpperCase().includes(k.toUpperCase())) return PROD_CLR[k]; return '#64748b'; };
  const col = clr(prodName);

  // Position popup near the clicked badge
  const rect = anchorEl.getBoundingClientRect();
  popup.style.display = 'block';
  // position after display so we can measure box
  requestAnimationFrame(() => {
    const bw = box.offsetWidth  || 520;
    const bh = box.offsetHeight || 400;
    let left = rect.left;
    let top  = rect.bottom + 8;
    if (left + bw > window.innerWidth  - 12) left = window.innerWidth  - bw - 12;
    if (top  + bh > window.innerHeight - 12) top  = rect.top - bh - 8;
    if (left < 8) left = 8;
    if (top  < 8) top  = 8;
    box.style.left = left + 'px';
    box.style.top  = top  + 'px';
  });

  // Header
  document.getElementById('prodCoPopupHdr').style.background = col;
  document.getElementById('prodCoPopupTitle').textContent = prodName;

  /* Populasi popup HARUS sama dengan badge "N co." yang membukanya — yaitu
     SELURUH pemegang produk, bukan hanya yang masih bersisa. Kalau tidak,
     kartunya menulis "15 co." lalu popup-nya mendaftar 2; kelas bug "kartu
     bilang N, drill-nya bilang lain" yang sudah berkali-kali diperbaiki.

     Yang bersaldo nol tetap ditampilkan karena merekalah penjelasan ke mana
     Utilized-nya pergi — tapi diletakkan di bawah dan diberi tanda, supaya
     tidak terbaca sebagai peluang jual (aturan 2026-08-10). */
  const _pool = availableScopePool();
  const coRows = [];
  _pool.forEach(co => {
    const obt = (typeof getObtainedByProdAgg === 'function') ? getObtainedByProdAgg(co) : {};
    const o = Number(obt[prodName]) || 0;
    if (o <= 0) return;
    const util = (typeof allTimeUtilByProd === 'function') ? allTimeUtilByProd(co) : (co.utilizationByProd || {});
    const spi = getSPI(co.code);
    coRows.push({
      code: co.code, group: co.group || (spi && spi.group) || '',
      obt: o, util: Number(util[prodName]) || 0,
      avq: (typeof availableInPeriod === 'function' && availableInPeriod(co) <= 0)
             ? 0 : cumulativeAvailForProd(co, prodName),
    });
  });
  // Yang masih bersisa di atas (urut terbesar), yang sudah habis di bawah.
  coRows.sort((a, b) => (b.avq > 0.001) - (a.avq > 0.001) || b.avq - a.avq || b.obt - a.obt);

  const totalObt  = coRows.reduce((s, r) => s + r.obt,  0);
  const totalUtil = coRows.reduce((s, r) => s + r.util, 0);
  const totalAvq  = coRows.reduce((s, r) => s + r.avq,  0);

  const _bersisa = coRows.filter(r => r.avq > 0.001).length;
  document.getElementById('prodCoPopupSub').textContent =
    `${coRows.length} compan${coRows.length !== 1 ? 'ies' : 'y'} pemegang · `
    + `${_bersisa} masih bersisa · ${fmtMt(totalAvq)} MT available`;

  // Summary strip
  document.getElementById('prodCoPopupStrip').innerHTML = [
    ['Obtained', totalObt,  'var(--teal)'],
    ['Utilized', totalUtil, 'var(--green)'],
    ['Available',totalAvq,  col],
  ].map(([lbl, val, c2]) => `
    <div style="flex:1;text-align:center;padding:8px 6px;border-right:1px solid var(--border)">
      <div style="font-size:15px;font-weight:800;color:${c2};font-family:'DM Mono',monospace">${fmtMt(val)}</div>
      <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--txt3);margin-top:1px">${lbl}</div>
    </div>`).join('');

  // Company list
  const maxObt = Math.max(...coRows.map(r => r.obt), 1);
  document.getElementById('prodCoPopupList').innerHTML = coRows.map(r => {
    const utilPct = r.obt > 0 ? (r.util / r.obt * 100).toFixed(0) : 0;
    const avqPct  = r.obt > 0 ? Math.max(0, r.avq  / r.obt * 100).toFixed(0) : 0;
    const barUtil = (r.util / maxObt * 100).toFixed(1);
    const barAvq  = (Math.max(0, r.avq) / maxObt * 100).toFixed(1);
    const avqCol  = r.avq > 0 ? col : 'var(--red2)';
    const co = getSPI(r.code);
    const grpBadge = `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;
      background:${r.group==='CD'?'#e0f2fe':'#f0fdf4'};
      color:${r.group==='CD'?'#0369a1':'#166534'}">${r.group}</span>`;
    return `<div style="padding:10px 18px;border-bottom:1px solid var(--border);cursor:pointer;transition:background .12s"
      onmouseover="this.style.background='var(--bg2)'" onmouseout="this.style.background=''"
      onclick="closeProdCoPopup();setTimeout(()=>openDrawer('${r.code}'),80)">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:6px">
          <span style="font-size:13px;font-weight:800;color:var(--navy)">${r.code}</span>
          ${grpBadge}
        </div>
        <div style="display:flex;align-items:center;gap:10px">
          <span style="font-size:11px;color:var(--txt3)">Obt <strong style="color:var(--teal)">${fmtMt(r.obt)}</strong></span>
          <span style="font-size:11px;color:var(--txt3)">Used <strong style="color:var(--green)">${r.util > 0 ? fmtMt(r.util) : '—'}</strong></span>
          <span style="font-size:13px;font-weight:800;color:${avqCol};font-family:'DM Mono',monospace">${fmtMt(r.avq)} MT</span>
        </div>
      </div>
      <div style="position:relative;height:7px;background:var(--border);border-radius:4px;overflow:hidden">
        <div style="position:absolute;inset:0;background:${col}22;border-radius:4px"></div>
        <div style="position:absolute;top:0;left:0;height:100%;width:${barUtil}%;background:${col};opacity:.45;border-radius:4px"></div>
        <div style="position:absolute;top:0;left:${barUtil}%;height:100%;width:${barAvq}%;background:${avqCol};border-radius:0 4px 4px 0"></div>
      </div>
      <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--txt3);margin-top:3px">
        <span>${utilPct}% utilized</span>
        <span style="color:${avqCol};font-weight:600">${avqPct}% available · click to open →</span>
      </div>
    </div>`;
  }).join('');
}

function closeProdCoPopup() {
  const p = document.getElementById('prodCoPopup');
  if (p) p.style.display = 'none';
}

/* ── Table view ── */
/* ── HS filter state for the full-detail avqTable ── */
let _avqTableHsFilter = '';
let _avqTableHsSearch = '';

function avqTableSetHsFilter(hs, el) {
  _avqTableHsFilter = hs;
  _avqTableHsSearch = '';
  const si = document.getElementById('avqTableHsSearch'); if (si) si.value = '';
  document.querySelectorAll('.avq-tbl-hs-chip').forEach(c => c.classList.remove('avq-chip-on'));
  if (el) el.classList.add('avq-chip-on');
  buildAvqTable();
}
function avqTableApplyHsSearch(val) {
  _avqTableHsSearch = val.trim().toLowerCase();
  _avqTableHsFilter = '';
  document.querySelectorAll('.avq-tbl-hs-chip').forEach(c => c.classList.remove('avq-chip-on'));
  const allChip = document.querySelector('.avq-tbl-hs-chip[data-hs=""]');
  if (!_avqTableHsSearch && allChip) allChip.classList.add('avq-chip-on');
  buildAvqTable();
}

function buildAvqTable() {
  const tbody = document.getElementById('avqTableBody');
  if (!tbody) return;

  /* Rincian KANONIK — tabel ini tidak lagi menurunkan saldonya sendiri.
     Versi sebelumnya MENCAMPUR dua basis dalam satu baris: obtained diambil
     dari getObtainedByProdAgg() yang SEPANJANG WAKTU, sementara `ap`
     (scopedAvailByProd) dan `up` (scopedUtilByProd) sudah diiris ke periode —
     dan untuk produk yang tidak ada di `ap`, saldonya jatuh ke `obt - util`,
     yaitu obtained all-time dikurangi utilisasi periode. Itulah yang membuat
     kolom Available di tabel menjumlah ±13.000 MT terhadap kartu 11.058 MT
     (tim Sales, 2026-08-11) — bukan sekadar "kurang beberapa perusahaan". */
  const allRows = availableQuotaRows().map(r => ({
    code: r.code, grp: r.group, prod: r.product, hs: r.hs,
    obt: r.obtained, util: r.utilMT, avq: r.avq,
    validity: r.validityDate, hasActiveSpi: r.hasActiveSpi, activeSpiNo: r.activeSpiNo,
    updBy: r.updatedBy, updDate: r.updatedDate,
  }));
  allRows.sort((a,b) => b.avq - a.avq);

  // ── Build HS filter chip bar ──────────────────────────────────────
  const hsSet    = new Set(allRows.map(r => r.hs).filter(h => h && h !== '—'));
  const hsSorted = ['', ...Array.from(hsSet).sort()];
  const chipsEl  = document.getElementById('avqTableHsChips');
  if (chipsEl) {
    chipsEl.innerHTML = hsSorted.map(hs => {
      const label  = hs === '' ? 'All' : hs;
      const isOn   = (_avqTableHsFilter === hs && !_avqTableHsSearch) || (hs==='' && !_avqTableHsFilter && !_avqTableHsSearch);
      return `<button class="avq-tbl-hs-chip${isOn?' avq-chip-on':''}" data-hs="${hs}"
        onclick="avqTableSetHsFilter('${hs}',this)"
        style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;cursor:pointer;
          border:1px solid ${isOn?'var(--navy)':'var(--border2)'};
          background:${isOn?'var(--navy)':'var(--bg)'};
          color:${isOn?'#fff':'var(--txt3)'};
          transition:all .15s;white-space:nowrap">
        ${label}
      </button>`;
    }).join('');
  }

  // ── Apply filter ──────────────────────────────────────────────────
  let rows = allRows;
  if (_avqTableHsFilter) rows = rows.filter(r => r.hs === _avqTableHsFilter);
  if (_avqTableHsSearch) rows = rows.filter(r =>
    r.prod.toLowerCase().includes(_avqTableHsSearch) ||
    r.hs.toLowerCase().includes(_avqTableHsSearch) ||
    r.code.toLowerCase().includes(_avqTableHsSearch)
  );

  tbody.innerHTML = rows.map(r => {
    const utilPct = r.obt > 0 ? (r.util / r.obt * 100) : 0;
    const fill = utilPct >= 80 ? 'var(--red2)' : utilPct >= 50 ? 'var(--amber-lt)' : 'var(--green-lt)';
    const hsHl = (_avqTableHsFilter && r.hs === _avqTableHsFilter)
      ? 'font-weight:700;color:var(--navy)'
      : 'color:var(--txt3)';
    return `<tr>
      <td><div class="t-code" onclick="openDrawer('${r.code}')">${r.code}</div></td>
      <td style="font-size:11.5px;font-weight:600">${r.grp}</td>
      <td><span class="chip" style="background:#f0f9ff;color:#0369a1;font-size:10px;padding:2px 7px">${r.prod}</span></td>
      <td style="font-size:10.5px;font-family:'DM Mono',monospace;${hsHl}">${r.hs}</td>
      <td class="t-r t-mono">${fmtMt(r.obt)}</td>
      <td class="t-r t-mono" style="color:var(--green)">${r.util > 0 ? fmtMt(r.util) : '<span style="color:var(--txt3)">—</span>'}</td>
      <td class="t-r t-mono" style="color:#0891b2;font-weight:700">${fmtMt(r.avq)}</td>
      ${(() => {
        /* Tanpa SPI aktif, tanggalnya TIDAK dikarang. Baris ini bisa muncul
           karena saldonya berasal dari PERTEK yang SPI-nya belum terbit, atau
           dari SPI yang sudah digantikan — dua hal yang perlu ditanyakan,
           bukan ditutup dengan tanggal tebakan. */
        if (!r.hasActiveSpi) {
          return `<td style="font-size:10px;color:var(--amber)" title="Belum ada SPI berstatus Active untuk produk ini — cek tab PERTEK & SPI Terbit">⚠ tanpa SPI aktif</td>`;
        }
        const kedaluwarsa = (typeof validityExpired === 'function') && validityExpired(r.validity);
        const warna = kedaluwarsa ? 'var(--red2)' : 'var(--navy)';
        const teks  = (typeof fmtDateStd === 'function' ? fmtDateStd(r.validity) : r.validity) || '—';
        return `<td style="font-size:10.5px;font-weight:700;color:${warna};white-space:nowrap" title="${r.activeSpiNo ? 'SPI ' + r.activeSpiNo : ''}">${teks}${kedaluwarsa ? ' ⚠' : ''}</td>`;
      })()}
      <td>
        <div style="display:flex;align-items:center;gap:6px">
          <div style="flex:1;height:5px;background:var(--border);border-radius:3px;overflow:hidden">
            <div style="height:5px;background:${fill};border-radius:3px;width:${Math.min(utilPct,100).toFixed(0)}%"></div>
          </div>
          <span style="font-size:10.5px;font-weight:600;color:${fill};width:36px;text-align:right">${utilPct.toFixed(0)}%</span>
        </div>
      </td>
      <td style="font-size:10px;color:var(--txt3)">${r.updDate || '—'}</td>
    </tr>`;
  }).join('');

  /* Baris TOTAL — dicetak, bukan dijumlah manual oleh pembacanya.
     Saat tidak ada filter HS aktif, Available di sini SAMA PERSIS dengan kartu
     Total Available di atas dan dengan kartu Overview, karena keduanya berasal
     dari availableQuotaRows() / reportAvailableTotal() yang satu kolam. */
  const foot = document.getElementById('avqTableFoot');
  if (foot) {
    const tObt  = rows.reduce((s,r) => s + r.obt,  0);
    const tUtil = rows.reduce((s,r) => s + r.util, 0);
    const tAvq  = rows.reduce((s,r) => s + r.avq,  0);
    const tCo   = new Set(rows.map(r => r.code)).size;
    const tTanpaSpi = rows.filter(r => !r.hasActiveSpi).length;
    const tPct  = tObt > 0 ? (tUtil / tObt * 100) : 0;
    const disaring = !!(_avqTableHsFilter || _avqTableHsSearch);
    foot.innerHTML = `<tr style="background:var(--bg2);border-top:2px solid var(--navy);font-weight:700">
      <td colspan="4" style="font-size:11px;color:var(--navy)">
        TOTAL · ${tCo} compan${tCo !== 1 ? 'ies' : 'y'} · ${rows.length} product-rows${disaring ? ' <span style="font-weight:600;color:var(--txt3)">(HS filter aktif — bukan total halaman)</span>' : ''}
      </td>
      <td class="t-r t-mono">${fmtMt(tObt)}</td>
      <td class="t-r t-mono" style="color:var(--green)">${fmtMt(tUtil)}</td>
      <td class="t-r t-mono" style="color:#0891b2">${fmtMt(tAvq)}</td>
      <td style="font-size:9.5px;color:var(--txt3);font-weight:600">${tTanpaSpi ? `${tTanpaSpi} tanpa SPI aktif` : 'ikut SPI aktif'}</td>
      <td style="font-size:10.5px;color:var(--txt3)">${tPct.toFixed(0)}%</td>
      <td style="font-size:9.5px;color:var(--txt3);font-weight:600">saldo kumulatif</td>
    </tr>`;
  }
}

/* ── By-Product bar chart (bottom of page) ── */
function buildAvqProdChart() {
  const el = document.getElementById('avqProdChart');
  if (!el) return;
  /* Sumber yang sama dengan kartu By Product di atasnya — productTotals().
     Chart dan kartu duduk di halaman yang sama, jadi tidak boleh beda basis. */
  const prodMap = productTotals();
  // Produk bersaldo nol tidak ditampilkan (2026-08-10) — sama seperti grid.
  Object.keys(prodMap).forEach(p => { if ((prodMap[p].avail || 0) <= 0.001) delete prodMap[p]; });
  const sorted = Object.entries(prodMap).sort((a,b) => b[1].obtained - a[1].obtained);
  if (CH['avqProdChart']) CH['avqProdChart'].destroy();
  CH['avqProdChart'] = new Chart(el, {
    type: 'bar',
    data: {
      labels: sorted.map(([k]) => k),
      datasets: [
        { label:'Obtained', data: sorted.map(([,v]) => Math.round(v.obtained)), backgroundColor:'rgba(12,124,132,.22)', borderColor:'#0c7c84', borderWidth:1, borderRadius:3 },
        { label:'Utilized', data: sorted.map(([,v]) => Math.round(v.util)),     backgroundColor:'rgba(33,197,93,.65)',  borderColor:'#21c55d', borderWidth:0, borderRadius:3 },
        { label:'Available',data: sorted.map(([,v]) => Math.round(v.avail)),    backgroundColor:'rgba(8,145,178,.65)',  borderColor:'#0891b2', borderWidth:0, borderRadius:3 },
      ]
    },
    options: {
      responsive:true,
      plugins:{
        legend:{ labels:{ font:{size:11,family:'DM Sans'}, color:'#4a5568', boxWidth:10, padding:12 } },
        tooltip:{ mode:'index', intersect:false }
      },
      scales:{
        x:{ grid:{display:false}, ticks:{font:{size:10.5,family:'DM Sans'},color:'#1a1f2e'} },
        y:{ grid:{color:'#f1f5f9'}, ticks:{font:{size:10},color:'#64748b',callback:v=>v.toLocaleString(MT_LOCALE)+' MT'} }
      }
    }
  });
}

/* ══════════════════════════════════════════════════
   COMPACT STATUS STRIPS (Overview)
══════════════════════════════════════════════════ */

/* Definisi keempat golongan Active Application, dipakai BERSAMA oleh strip
   Overview dan modalnya — supaya urutan, label, dan warnanya tidak mungkin
   berbeda antara ringkasan dan rinciannya. */
const AA_GROUPS = [
  { key:'new',        label:'🆕 New Submission', color:'var(--blue)',  bg:'var(--blue-bg)',  bd:'var(--blue-bd)' },
  { key:'active',     label:'🔄 Revision',       color:'var(--amber)', bg:'var(--amber-bg)', bd:'var(--amber-bd)' },
  { key:'reapply',    label:'📨 Re-Apply',       color:'#7c3aed',      bg:'#f5f3ff',         bd:'#c4b5fd' },
  { key:'revpending', label:'⏳ PERTEK Pending', color:'var(--red2)',  bg:'var(--red-bg)',   bd:'var(--red-bd)' },
];

function buildRevSummaryStrip() {
  const el = document.getElementById('revSummaryStrip');
  if (!el) return;
  const badge = document.getElementById('revCardBadge');
  /* Empat golongan Active Application — satu sumber, activeApplications().
     Dulu tiga golongan atas filteredSPI() saja, sehingga New Submission (yang
     hidup di PENDING) tidak pernah muncul dan perusahaan yang sedang berproses
     lewat form Sales ikut hilang (kasus IKM). */
  const AA = activeApplications();
  if (badge) badge.textContent = AA.total + ' Active';

  const groups = AA_GROUPS.map(g => ({ ...g, items: AA[g.key] })).filter(g => g.items.length > 0);

  el.innerHTML = groups.map(g => `
    <div style="padding:5px 8px;background:${g.bg};border:1px solid ${g.bd};border-radius:var(--r);display:flex;align-items:center;justify-content:space-between">
      <span style="font-size:10.5px;font-weight:700;color:${g.color}">${g.label}</span>
      <div style="display:flex;flex-wrap:wrap;gap:3px;justify-content:flex-end;max-width:65%">
        ${g.items.map(d => `<span style="font-size:10px;font-weight:700;padding:1px 6px;border-radius:3px;background:rgba(0,0,0,.06);color:${g.color}">${d.code}</span>`).join('')}
      </div>
    </div>`).join('');
}

function buildPendingSummaryStrip() {
  const el    = document.getElementById('pendingSummaryStrip');
  const mtEl  = document.getElementById('pendTotalMT');
  const bdgEl = document.getElementById('pendingCardBadge');
  if (!el) return;
  const pending = filteredPending();
  const totalMT = pending.reduce((s,d) => s + (d.mt||0), 0);
  if (mtEl)  mtEl.textContent  = fmtMt(totalMT) + ' MT';
  if (bdgEl) bdgEl.textContent = pending.length + ' Pending';
  el.innerHTML = pending.map(d => {
    const daysEl = d.date ? (() => {
      const parsed = pDate(d.date);
      if (!parsed) return '';
      const days = Math.round((Date.now() - parsed) / 86400000);
      const col = days > 90 ? 'var(--red2)' : days > 30 ? 'var(--amber)' : 'var(--txt3)';
      return `<span style="font-size:9.5px;font-weight:600;color:${col}">⏱ ${days}d</span>`;
    })() : '';
    return `<div style="display:flex;align-items:center;gap:5px;padding:4px 9px;background:var(--red-bg);border:1px solid var(--red-bd);border-radius:var(--r)">
      <span style="font-size:11px;font-weight:700;color:var(--red2)">${d.code}</span>
      <span style="font-size:9.5px;color:var(--txt3)">${fmtMt(d.mt||0)} MT</span>
      ${daysEl}
    </div>`;
  }).join('');
}

/* ── Active Revisions popup (Overview insight → modal, no page navigation) ──
   Replaces the old behaviour where the insight card jumped to the PERTEK &
   SPI page. Shows the same Revision / Re-Apply / PERTEK-Pending breakdown in
   a self-contained modal; clicking a company chip opens its drawer. */
function openActiveRevPopup() {
  const modal = document.getElementById('activeRevModal');
  const body  = document.getElementById('activeRevBody');
  if (!modal || !body) return;
  /* Sumber yang SAMA dengan strip di Overview — activeApplications() dan
     AA_GROUPS — supaya ringkasan dan rinciannya tidak mungkin berbeda. */
  const AA = activeApplications();
  const total = AA.total;
  const sub = document.getElementById('activeRevSubtitle');
  if (sub) sub.textContent = AA_GROUPS
    .map(g => `${AA[g.key].length} ${g.label.replace(/^\S+\s/, '')}`).join(' · ');
  const groups = AA_GROUPS.map(g => ({ ...g, items: AA[g.key] })).filter(g => g.items.length > 0);
  body.innerHTML = total === 0
    ? `<div style="text-align:center;color:var(--txt3);padding:24px 0;font-size:12px">Tidak ada permohonan yang sedang berjalan.</div>`
    : groups.map(g => `
      <div style="border:1px solid ${g.bd};border-radius:var(--r);overflow:hidden">
        <div style="padding:7px 12px;background:${g.bg};font-size:11px;font-weight:700;color:${g.color};display:flex;justify-content:space-between;align-items:center">
          <span>${g.label}</span><span>${g.items.length}</span>
        </div>
        <div style="padding:9px 12px;display:flex;flex-wrap:wrap;gap:6px">
          ${g.items.map(d => {
            /* ATURAN 5: yang tampil di sini adalah siklus yang SEDANG berjalan,
               bukan angka kumulatif. Submit #1 800 + Submit #2 Re-Apply 2.200
               muncul sebagai "Submit #2 · 2,200 MT" di sini, sementara Total
               Submission di Overview tetap membaca 3.000. */
            const ac = (typeof activeApplicationCycle === 'function') ? activeApplicationCycle(d) : null;
            const info = ac
              ? `<span style="font-size:9px;font-weight:600;opacity:.8">${canonProdInText(ac.type)}${ac.mt > 0 ? ' · ' + fmtMt(ac.mt) + ' MT' : ''}</span>`
              : '';
            return `<span onclick="closeActiveRevPopup();openDrawer('${d.code}')" title="Buka detail ${d.code}"
              style="cursor:pointer;font-size:11px;font-weight:700;padding:3px 9px;border-radius:4px;background:rgba(0,0,0,.05);color:${g.color};display:inline-flex;flex-direction:column;line-height:1.3">${d.code}${info}</span>`;
          }).join('')}
        </div>
      </div>`).join('');
  const nota = document.getElementById('activeRevNote');
  if (nota) nota.textContent = 'Angka per perusahaan adalah siklus permohonan yang sedang berjalan, '
    + 'bukan kumulatif — Total Submission di Overview tetap menjumlahkan seluruh siklus.';
  modal.style.display = 'block';
}
function closeActiveRevPopup() {
  const modal = document.getElementById('activeRevModal');
  if (modal) modal.style.display = 'none';
}

/* Trigger rebuild when navigating to availquota page */
const _origGoPage = typeof goPage === 'function' ? goPage : null;

/* ══════════════════════════════════════════════════
   TOAST — non-blocking error / success notifications
   Used to surface PATCH failures so users know a save
   didn't persist (instead of silently swallowing in console).
══════════════════════════════════════════════════ */
function showToast(msg, kind) {
  kind = kind || 'error';
  let host = document.getElementById('_toastHost');
  if (!host) {
    host = document.createElement('div');
    host.id = '_toastHost';
    host.style.cssText = 'position:fixed;bottom:22px;left:50%;transform:translateX(-50%);z-index:1100;display:flex;flex-direction:column;gap:8px;pointer-events:none;max-width:90vw';
    document.body.appendChild(host);
  }
  const colors = {
    error:   { bg:'#fee2e2', bd:'#fecaca', fg:'#991b1b', ico:'⚠' },
    success: { bg:'#dcfce7', bd:'#a7f3c4', fg:'#15803d', ico:'✓' },
    info:    { bg:'#e0f2fe', bd:'#c3d3f9', fg:'#1e3a8a', ico:'ℹ' },
  };
  const c = colors[kind] || colors.error;
  const t = document.createElement('div');
  t.style.cssText = `pointer-events:auto;background:${c.bg};border:1px solid ${c.bd};color:${c.fg};padding:9px 14px;border-radius:8px;font:600 12px 'DM Sans',sans-serif;box-shadow:0 4px 16px rgba(0,0,0,.12);display:flex;align-items:center;gap:8px;animation:fadeUp .2s ease`;
  t.innerHTML = `<span style="font-size:14px">${c.ico}</span><span>${msg}</span>`;
  host.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .25s'; }, 4000);
  setTimeout(() => t.remove(), 4400);
}

/* notifySaveError — used by patchToServer .catch handlers to surface errors */
function notifySaveError(context, err) {
  const msg = err && err.message ? err.message : String(err);
  console.warn(`[${context}] save failed:`, err);
  showToast(`Save failed (${context}): ${msg}`, 'error');
}

/* ══════════════════════════════════════════════════
   GLOBAL ESC KEY — close topmost visible overlay
   Order matters: close highest z-index first.
══════════════════════════════════════════════════ */
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;

  // 1. Inline tooltip popups (z-index 800)
  const popup = document.getElementById('prodCoPopup');
  if (popup && popup.style.display !== 'none') { closeProdCoPopup(); return; }

  // 2. Drill-down modals (z-index 700) — close whichever is visible
  const drillIds = [
    'obtainedDrillModal','submitDrillModal','realizedDrillModal','avqDrillModal',
    'utilDrillModal','reapplyDrillModal','pendingDrillModal','leadTimeDrillModal','salesPriorityModal',
  ];
  const drillCloseFns = {
    obtainedDrillModal:'closeObtainedDrill', submitDrillModal:'closeSubmitDrill',
    realizedDrillModal:'closeRealizedDrill', avqDrillModal:'closeAvqDrill',
    utilDrillModal:'closeUtilDrill', reapplyDrillModal:'closeReapplyDrill',
    pendingDrillModal:'closePendingDrill', leadTimeDrillModal:'closeLeadTimeDrill',
    salesPriorityModal:'closeSalesPriority',
  };
  for (const id of drillIds) {
    const m = document.getElementById(id);
    if (m && m.style.display !== 'none' && m.style.display !== '') {
      const fn = window[drillCloseFns[id]];
      if (typeof fn === 'function') { fn(); return; }
      m.style.display = 'none'; return;
    }
  }

  // 3. Import modal (z-index 600)
  const im = document.getElementById('importModal');
  if (im && im.classList.contains('open') && typeof closeImport === 'function') { closeImport(); return; }

  // 4. Drawer overlay (z-index 500)
  const ov = document.getElementById('overlay');
  if (ov && ov.classList.contains('open') && typeof closeDrawer === 'function') { closeDrawer(); return; }

  // 5. Period filter panel (z-index 400)
  const pf = document.getElementById('pfPanel');
  if (pf && pf.classList.contains('open') && typeof closePeriod === 'function') { closePeriod(); return; }

  // 6. Search dropdown (z-index 400)
  const sd = document.querySelector('.s-drop.open');
  if (sd) { sd.classList.remove('open'); return; }
});