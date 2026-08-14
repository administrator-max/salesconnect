/* ═══════════════════════════════════════
   OVERVIEW KPIs + DRILL-DOWN MODALS
═══════════════════════════════════════ */

function updateOverviewKPIs() {
  const kpis = document.querySelectorAll('#page-overview .kpi');

  /* ── KPI 1: Total Submitted ──────────────────────────────────────────────
     Total Submitted = Σ Submit #N cycles only. Revision Request cycles
     track product re-allocations and superseded sales requests; they are
     NOT counted as new quota MT. Companies that filed a real "Submit #2"
     for additional MT have an explicit Submit #2 cycle in DB (matching
     XLSX master). Deduped per (company, cycle_type).
  ────────────────────────────────────────────────────────────────────────── */
  /* Delegated to reportSubmittedTotal() — see its docblock in
     02-period-filter.js. These five figures also head the Utilization &
     Realization page, the Available Quota page and the PDF; when each surface
     computed its own, the period-filtered views disagreed (team report
     2026-08-05). There is now one implementation and four callers. */
  const _sub = reportSubmittedTotal();
  const totalSubmitMT = _sub.mt;
  const submitCoSet   = { size: _sub.companies };

  /* ── KPI 2: Total Obtained ──────────────────────────────────────────────
     Match the Excel "Total Obtained (MT)" footer (23,090 MT in 240426 sheet).
     Formula: Σ across all 33 companies of every Obtained #N cycle MT,
     deduped per (company, cycle_type). The Excel includes obtained rows
     regardless of whether SPI has been issued (PERTEK-only counts), as
     long as the obtained MT itself is set. Period filter (when active)
     uses the obtained cycle's PERTEK Terbit date.
  ────────────────────────────────────────────────────────────────────────── */
  /* Delegated, not re-implemented. This block used to carry its OWN copy of
     the obtained rules — dedup, _fromRevReq, terbit gate, period anchor —
     under a comment claiming it mirrored canonicalObtainedFiltered(). It
     drifted anyway: it kept the SPI-first anchor and called
     _isObtainedTerbit() without allCycles, so on 2026-08-04 the June KPI read
     890 MT against a true 10,040. A copy that must be kept in step by hand is
     the same failure mode as the ledger/cycles split this whole change set
     removed, so there is now exactly one implementation of each rule. */
  const _obt = reportObtainedTotal();
  const totalObtainedMT = _obt.mt;
  const obtCoSet = { size: _obt.companies };

  /* ── KPI 3: Total Realized ───────────────────────────────────────────
     Source is the PIB line data (`realizations` tab: volume + pib_date), per
     the data owners' report spec (2026-08-04): "untuk realized, mengambil
     dari sheet REALISASI IMPORT PERIODE SPI 2026, di kolom Volume".

     It used to read `ra_records.berat` filtered by arrival date — a
     hand-maintained one-row-per-company summary that happens to total the
     same 15.438,208 MT today, but is a different artefact that can (and did)
     drift, and whose arrival date is not the PIB date the report is defined
     on. REALIZATIONS carries all 204 deduped PIB lines; every pib_date parses
     (144 ISO + 60 D/M/YYYY, none ambiguous). Falls back to the old RA path
     only if the realizations fetch failed, so a dead endpoint degrades to the
     previous behaviour instead of showing zero. */
  const _real = reportRealizedTotal();
  const realizedCount   = _real.companies;
  const totalRealizedMT = _real.mt;
  const arrivedCodes    = (_real.codes || []).join(', ') || '—';

  /* ── KPI 4: Re-Apply Eligible / Submitted ───────────────────────────── */
  // Scope re-apply pool to companies whose SPI cycles match the active period
  // (same logic as filteredSPI) — avoids using un-parseable etaJKT text
  const _raFilterCodes = new Set(
    PERIOD.active ? SPI.filter(co => companyInPeriod(co.cycles||[])).map(co => co.code) : []
  );
  const raPool = PERIOD.active
    ? RA.filter(r => _raFilterCodes.has(r.code))
    : RA;
  const eligCount      = raPool.filter(isEligible).length;
  const submittedCount = raPool.filter(isReapplySubmitted).length;
  const reapplyTotal   = eligCount + submittedCount;

  /* ── KPI 5: Pending MT ─────────────────────────────────────────────── */
  let pendMT = 0; const pendCoSet = new Set();
  PENDING.forEach(p => {
    const inScope = !PERIOD.active || (p.cycles || []).some(c => {
      if (!/submit/i.test(c.type) || /obtained/i.test(c.type)) return false;
      return inPd(pDate(c.submitDate));
    });
    if (inScope) { pendMT += p.mt; pendCoSet.add(p.code); }
  });

  /* ── KPI 2b: Total Utilized MT — delegated. The rules (lot-date slicing and
     the widened pool that re-admits a company whose permit and cargo land in
     different quarters) live in reportUtilizedTotal(). ─────────────────── */
  const _util = reportUtilizedTotal();
  const totalUtilizedMT = _util.mt;
  const utilCoCount     = _util.companies;

  /* ── Update DOM ───────────────────────────────────────────────────── */
  /* Kartu 1 — Total Pending Shipment (menggantikan Total Submitted, permintaan
     tim 2026-08-10). Kuota yang sudah dialokasikan tapi barangnya belum tiba.
     KUMULATIF, lihat docblock reportPendingShipmentTotal(): pengurangan per
     periode rutin menghasilkan angka NEGATIF karena barang yang dipakai 2025
     baru tiba 2026.
     `totalSubmitMT` tetap dihitung — Approval Rate di kartu Obtained memakainya,
     begitu pula PDF Summary dan drill-down Submission. */
  const _pend = reportPendingShipmentTotal();
  if (kpis[0]) {
    kpis[0].querySelector('.kpi-val').textContent  = _pend.mt > 0 ? fmtMt(_pend.mt) : '—';
    kpis[0].querySelector('.kpi-unit').textContent = _pend.companies > 0
      ? `MT · ${_pend.companies} compan${_pend.companies !== 1 ? 'ies' : 'y'} in transit` : 'MT';
    const t = kpis[0].querySelector('.kpi-tag');
    if (t) {
      const n = t.querySelector('#kpiPendShipNote') || t;
      n.textContent = _pend.utilized > 0
        ? `${fmtMt(_pend.utilized)} utilized − ${fmtMt(_pend.realized)} realized`
        : 'Utilized − Realized';
    }
    // Bar: porsi yang belum tiba dari total yang sudah dialokasikan.
    const sFill = document.getElementById('kpiPendShipFill');
    if (sFill) sFill.style.width = _pend.utilized > 0
      ? Math.min(100, _pend.mt / _pend.utilized * 100).toFixed(1) + '%' : '0%';
  }

  /* ── Total Submitted ─────────────────────────────────────────────────
     Diminta tampil kembali 2026-08-12, di kartu paling kanan sesudah
     Available Quota. Angkanya dari `_sub` (= reportSubmittedTotal()) yang
     SUDAH dihitung di atas untuk Approval Rate — bukan hitungan baru, jadi
     kartu ini tidak mungkin berbeda dari Approval Rate di kartu Obtained
     maupun dari PDF Summary dan drill-down Submission.
     Dialamatkan lewat ID, bukan indeks kpis[], supaya penambahan/pengurangan
     kartu lain tidak menggeser sasarannya. */
  const subValEl = document.getElementById('kpiSubVal');
  if (subValEl) {
    subValEl.textContent = totalSubmitMT > 0 ? fmtMt(totalSubmitMT) : '—';
    const u = document.getElementById('kpiSubUnit');
    if (u) u.textContent = _sub.companies > 0
      ? `MT · ${_sub.companies} compan${_sub.companies !== 1 ? 'ies' : 'y'} submitted` : 'MT';
    const n = document.getElementById('kpiSubNote');
    if (n) n.textContent = totalSubmitMT > 0
      ? `${fmtMt(totalObtainedMT)} obtained dari ${fmtMt(totalSubmitMT)}`
      : 'Σ Submit #N';
    /* Bar = porsi yang sudah disetujui. Sengaja rasio yang SAMA dengan
       Approval Rate, supaya dua kartu bersebelahan tidak bercerita beda. */
    const f = document.getElementById('kpiSubFill');
    if (f) f.style.width = totalSubmitMT > 0
      ? Math.min(100, totalObtainedMT / totalSubmitMT * 100).toFixed(1) + '%' : '0%';
  }
  if (kpis[1]) {
    kpis[1].querySelector('.kpi-val').textContent  = totalObtainedMT > 0 ? fmtMt(totalObtainedMT) : '—';
    kpis[1].querySelector('.kpi-unit').textContent = obtCoSet.size > 0 ? `MT · ${obtCoSet.size} companies` : 'MT';
    const t = kpis[1].querySelector('.kpi-tag');
    if (t) { const rate = totalSubmitMT>0?(totalObtainedMT/totalSubmitMT*100).toFixed(1):'—'; t.textContent=`${rate}% Approval Rate`; }
    // Obtained fill: ratio against Submit (approval rate)
    const oFill = document.getElementById('kpiObtFill');
    if (oFill) oFill.style.width = totalSubmitMT > 0
      ? Math.min(100, totalObtainedMT/totalSubmitMT*100).toFixed(1) + '%'
      : '0%';
  }
  // Total Utilized KPI (addressed by ID — index-independent)
  const kpiUtilCoEl   = document.getElementById('kpiUtilCoCount');
  const kpiUtilMTEl   = document.getElementById('kpiUtilMT');
  const kpiUtilUnitEl = document.getElementById('kpiUtilUnit');
  const kpiUtilFillEl = document.getElementById('kpiUtilFill');
  const kpiUtilTagEl  = document.getElementById('kpiUtilTag');
  /* MT is the headline, company count is the subtitle — same shape as the
     Submitted and Obtained cards beside it, and as the PDF Summary. This card
     used to print the COMPANY COUNT in the big slot (24) with the tonnage
     demoted to small text, so the number that reads as "Total Utilized" at a
     glance was not a tonnage at all. (Element ids still say CoCount/MT from
     that layout; the ids are the DOM handles, not the meaning.) */
  if (kpiUtilCoEl)   kpiUtilCoEl.textContent   = totalUtilizedMT > 0 ? fmtMt(totalUtilizedMT) : '—';
  if (kpiUtilUnitEl) kpiUtilUnitEl.textContent = utilCoCount > 0
    ? `MT · ${utilCoCount} compan${utilCoCount !== 1 ? 'ies' : 'y'} with shipment` : 'MT';
  if (kpiUtilMTEl)   kpiUtilMTEl.textContent   = '';
  if (kpiUtilFillEl && totalObtainedMT > 0) kpiUtilFillEl.style.width = Math.min(100, totalUtilizedMT / totalObtainedMT * 100).toFixed(1) + '%';
  /* Rasio ini BISA melampaui 100% dan itu benar, bukan kerusakan: kuota yang
     terbit sebelum jendela ini boleh dipakai di dalamnya. Contoh nyata pada
     filter 01 Jan – 05 Agu 2026 — obtained 21.140, utilized 21.500 (101,7%):
     13.820 MT terbit sepanjang 2025 sementara hanya 1.047 MT terpakai di tahun
     itu, jadi 12.773 MT terbawa ke 2026. Pimpinan menanyakannya 2026-08-05
     karena angka "101,7%" berdiri tanpa keterangan dan terbaca seperti error.
     Angkanya tidak diubah — keterangannya yang ditambahkan. */
  if (kpiUtilTagEl) {
    if (totalObtainedMT <= 0) {
      kpiUtilTagEl.textContent = 'Of obtained quota allocated';
      kpiUtilTagEl.title = '';
    } else {
      const pct = totalUtilizedMT / totalObtainedMT * 100;
      const lebih = pct > 100.05;
      kpiUtilTagEl.textContent = lebih
        ? `${pct.toFixed(1)}% — incl. carry-over quota`
        : `${pct.toFixed(1)}% of obtained allocated`;
      kpiUtilTagEl.title = lebih
        ? 'Utilisasi melebihi kuota yang TERBIT di periode ini karena kuota '
          + 'yang terbit sebelumnya masih boleh dipakai di sini. Bukan kelebihan '
          + 'pakai: sepanjang waktu, total utilisasi tetap di bawah total obtained.'
        : '';
    }
  }

  /* ── Available Quota KPI = CUMULATIVE saldo ───────────────────────────
     Not obtained-minus-utilised within the window. Available is a balance, and
     the master reports it as "saldo kumulatif" — see cumulativeAvailable()'s
     docblock. A period filter narrows WHICH companies are counted, never how
     much of their balance "belongs to" the window. Same helper the PDF Summary
     uses, so the two surfaces cannot drift apart again. */
  /* Nilai DAN jumlah company harus datang dari panggilan yang SAMA.
     Sebelumnya baris unit memakai `obtCoSet.size` — jumlah company yang
     PERTEK-nya terbit di periode ini, milik kartu Obtained, bukan kartu ini.
     Kartu jadi berbunyi "11.058 MT · 18 companies" padahal 11.058 itu saldo
     dari 7 company; modal detail-nya (7 company) lalu terlihat sebagai subset
     yang lebih besar dari induknya. Dilaporkan tim Sales 2026-08-11 sebagai
     "angka yang mustahil" — dan memang mustahil, karena kedua angka itu tidak
     pernah berasal dari populasi yang sama. */
  const _avqTot = reportAvailableTotal();
  const totalAvailableMT = _avqTot.mt;
  const avqCoCount = _avqTot.companies;
  const avqValEl  = document.getElementById('kpiAvqVal');
  const avqUnitEl = document.getElementById('kpiAvqUnit');
  const avqTagEl  = document.getElementById('kpiAvqTag');
  const avqFillEl = document.getElementById('kpiAvqFill');
  if (avqValEl)  avqValEl.textContent  = totalObtainedMT > 0 ? fmtMt(totalAvailableMT) : '—';
  if (avqUnitEl) {
    avqUnitEl.textContent = `MT · ${avqCoCount} compan${avqCoCount !== 1 ? 'ies' : 'y'} with balance`;
    avqUnitEl.title = 'Saldo KUMULATIF (all-time). Filter periode menentukan '
      + 'company mana yang dihitung, bukan seberapa besar saldonya — sebuah '
      + 'saldo adalah stock, bukan aktivitas di dalam jendela.';
  }
  if (avqTagEl) {
    const pct = totalObtainedMT > 0 ? (totalAvailableMT / totalObtainedMT * 100).toFixed(1) + '% remaining of obtained' : 'Obtained − Utilized';
    const span = avqTagEl.querySelector('span');
    if (span) span.textContent = pct; else avqTagEl.textContent = pct;
  }
  if (avqFillEl) avqFillEl.style.width = totalObtainedMT > 0
    ? Math.max(0, Math.min(100, totalAvailableMT / totalObtainedMT * 100)).toFixed(1) + '%' : '0%';
  // Total Realized KPI (addressed by ID — index-independent).
  // NOTE: previous code used kpis[2] which is actually the Utilized
  // card in DOM order (Submit[0], Obtained[1], Utilized[2], Realized[3],
  // AvqQuota[4], ReApply[5]). The bug was hidden by the hardcoded "4"
  // in the Realized card; once that became "—" the empty state surfaced.
  // MT headline, company count as subtitle — same reason as the Utilized card.
  const kpiRealCoEl = document.getElementById('kpiRealCoCount');
  if (kpiRealCoEl) {
    kpiRealCoEl.textContent = totalRealizedMT > 0 ? totalRealizedMT.toLocaleString(MT_LOCALE) : '—';
    const realCard = kpiRealCoEl.closest('.kpi');
    if (realCard) {
      const u = realCard.querySelector('.kpi-unit');
      if (u) u.textContent = realizedCount > 0
        ? `MT · ${realizedCount} compan${realizedCount !== 1 ? 'ies' : 'y'} realized${PERIOD.active ? ' in period' : ''}`
        : 'MT';
      const tspan = realCard.querySelector('.kpi-tag span');
      if (tspan) tspan.textContent = arrivedCodes;
    }
  }
  const kpiRealMTEl = document.getElementById('kpiRealMT');
  if (kpiRealMTEl) kpiRealMTEl.textContent = '';
  const kpiRealFillEl = document.getElementById('kpiRealFill');
  if (kpiRealFillEl) {
    kpiRealFillEl.style.width = totalObtainedMT > 0
      ? Math.min(100, totalRealizedMT / totalObtainedMT * 100).toFixed(1) + '%'
      : '0%';
  }
  // Re-Apply KPI (by ID — index-independent after reorder)
  const kpiReapplyValEl = document.getElementById('kpiReapplyVal');
  if (kpiReapplyValEl) kpiReapplyValEl.textContent = reapplyTotal > 0 ? reapplyTotal : '—';
  // Also update Re-Apply tag (find by traversing from kpiReapplyVal's parent .kpi)
  const reapplyKpiEl = kpiReapplyValEl ? kpiReapplyValEl.closest('.kpi') : null;
  if (reapplyKpiEl) {
    const ru = reapplyKpiEl.querySelector('.kpi-unit'); if (ru) ru.textContent = 'Companies — Re-Apply On Process';
    const rt = reapplyKpiEl.querySelector('.kpi-tag span');
    if (rt) rt.textContent = (reapplyTotal > 0)
      ? `🔵 ${submittedCount} Submitted · ✅ ${eligCount} Eligible`
      : '—';
    // Re-Apply fill: ratio of submitted+eligible RA against total RA pool
    const raFill = document.getElementById('kpiReapplyFill');
    if (raFill) {
      const denom = (typeof RA !== 'undefined' && RA.length) ? RA.length : 1;
      raFill.style.width = reapplyTotal > 0
        ? Math.min(100, reapplyTotal / denom * 100).toFixed(1) + '%'
        : '0%';
    }
  }
  // Pending KPI (index 6 after reorder: Submit[0] Obtained[1] Utilized[via ID] Realized[2] AvailQuota[3] ReApply[4] Pending[5])
  // Use ID-based approach for safety
  const kpiPendValEl = document.getElementById('kpiPendVal');
  if (kpiPendValEl) {
    kpiPendValEl.textContent = fmtMt(pendMT);
    const pendKpiEl = kpiPendValEl.closest('.kpi');
    if (pendKpiEl) { const pu = pendKpiEl.querySelector('.kpi-unit'); if(pu) pu.textContent = `MT · ${pendCoSet.size} companies`; }
  }

  // ── Also update pipeline sidebar labels ──────────────────────────────
  const pPendStat = document.getElementById('pipelinePendStat');
  if (pPendStat) pPendStat.textContent = `${fmtMt(pendMT)} MT · ${pendCoSet.size} co.`;
  const pTotalMT = document.getElementById('pendTotalMT');
  if (pTotalMT) pTotalMT.textContent = `${fmtMt(pendMT)} MT`;

  // SPI sidebar stat — recompute from live SPI data
  const spiTotal   = filteredSPI().reduce((s,d)=>s+d.obtained,0);
  const spiCount   = filteredSPI().length;
  const pSpiStat   = document.getElementById('pipelineSpiStat');
  if (pSpiStat) pSpiStat.textContent = `${fmtMt(spiTotal)} MT · ${spiCount} co.`;

  // Re-Apply sidebar = realization-based (cargoArrived AND realPct ≥ 60%)
  const raEligPool = filteredRA().filter(r => r.cargoArrived === true && r.realPct >= 0.6);
  const raEligMT   = raEligPool.reduce((s,r) => s + (r.obtained||0), 0);
  const pRaStat = document.getElementById('pipelineReapplyStat');
  if (pRaStat) pRaStat.textContent = `${raEligPool.length} co.`;

  // Pending card header labels
  const pSubt = document.getElementById('pendingCardSubtitle');
  if (pSubt) pSubt.textContent = `${pendCoSet.size} companies — awaiting PERTEK / SPI`;

  const pBadge = document.getElementById('pendingCardBadge');
  if (pBadge) pBadge.textContent = `${pendCoSet.size} Pending`;

  const pTblSubt = document.getElementById('pendingTableSubtitle');
  if (pTblSubt) pTblSubt.textContent = `${pendCoSet.size} companies · awaiting PERTEK / SPI`;

  // All Companies page filter pills — update by stable IDs.
  // Use PERIOD-FILTERED counts so the badges match the rows actually shown
  // when a period filter is active (consistent with renderMain()).
  const s = (id,v) => { const el=document.getElementById(id); if(el) el.textContent=v; };
  s('pillMAll',     filteredSPI().length + filteredPending().length);
  s('pillMSPI',     filteredSPI().length);
  s('pillMPending', filteredPending().length);

  /* ── Active Application (dulu "Active Revisions") ──────────────────────
     Satu sumber dengan strip Overview dan modalnya: activeApplications().
     Dulu blok ini menyusun kolamnya sendiri dari filteredSPI() + tiga status,
     jadi kartu insight, strip, dan modal bisa menyebut angka berbeda — dan
     New Submission (yang hidup di PENDING) tak pernah terhitung sama sekali. */
  const _AA = (typeof activeApplications === 'function')
    ? activeApplications()
    : { new: [], active: [], reapply: [], revpending: [], total: 0 };
  const revRevision = _AA.active;
  const revReapply  = _AA.reapply;
  const revPending  = _AA.revpending;
  const revActive   = [..._AA.new, ..._AA.active, ..._AA.reapply];
  const insValEl = document.getElementById('insRevVal');
  const insSubEl = document.getElementById('insRevSub');
  if (insValEl) insValEl.textContent =
    `${_AA.new.length} Baru · ${revRevision.length} Revisi · ${revReapply.length} Re-Apply · ${revPending.length} PERTEK`;
  if (insSubEl) {
    const parts = [];
    if (_AA.new.length)     parts.push(_AA.new.map(d=>d.code).join(', ')     + ' (New Submission)');
    if (revRevision.length) parts.push(revRevision.map(d=>d.code).join(', ') + ' (Revision)');
    if (revReapply.length)  parts.push(revReapply.map(d=>d.code).join(', ')  + ' (Re-Apply)');
    if (revPending.length)  parts.push(revPending.map(d=>d.code).join(', ')  + ' (PERTEK Pending)');
    insSubEl.textContent = parts.length ? parts.join(' · ') : 'Tidak ada permohonan berjalan';
  }
  const revBadge = document.getElementById('revCardBadge');
  if (revBadge) revBadge.textContent = `${_AA.total} Active`;

  // ── All Companies page: Revision + Eligible pill counts ────────────────
  // Revision = active + reapply + revpending (matches setMF('REV') filter)
  s('pillMRev', revActive.length + revPending.length);
  // Eligible: RA records with realPct >= 0.6 AND cargoArrived
  const eligCountAll = (typeof filteredRA === 'function')
    ? filteredRA().filter(r => r.cargoArrived === true && r.realPct >= 0.6).length
    : 0;
  s('pillMEligible', eligCountAll);

  // ── Nav tab counts (PERTEK & SPI / All Companies) ─────────────────────
  // Period-filtered so the nav badges reflect the active period.
  s('navCountSPI', filteredSPI().length);
  s('navCountAll', filteredSPI().length + filteredPending().length);

  // ── Top Obtained Quota insight (dynamic — replaces hardcoded BTS) ─────
  // Pick the company with the highest canonicalObtained value across SPI.
  // Stores the picked code on window so the insight click handler routes
  // to the correct drawer. Updates every time KPIs refresh so it stays
  // accurate when data changes (multi-user safety).
  (function updateTopQuotaInsight() {
    const valEl = document.getElementById('topQuotaVal');
    const subEl = document.getElementById('topQuotaSub');
    if (!valEl || !subEl) return;
    const _co = (typeof canonicalObtained === 'function') ? canonicalObtained : (c => c.obtained || 0);
    const sorted = [...SPI].filter(c => _co(c) > 0).sort((a,b) => _co(b) - _co(a));
    if (!sorted.length) {
      valEl.textContent = '—';
      subEl.textContent = 'No obtained data';
      window._topQuotaCode = null;
      return;
    }
    const top = sorted[0];
    const topMT = _co(top);
    window._topQuotaCode = top.code;
    valEl.textContent = `${top.code} — ${fmtMt(topMT)} MT`;
    // Pull PERTEK Terbit date from the first Submit cycle for context
    const subCy = (top.cycles || []).find(c => /^submit\s*#?1/i.test(c.type));
    const pertekTxt = subCy && subCy.releaseDate && subCy.releaseDate !== 'TBA'
      ? ` · PERTEK ${subCy.releaseDate}`
      : '';
    const nProd = (top.products || []).length;
    subEl.textContent = `${nProd} product${nProd!==1?'s':''}${pertekTxt}`;
  })();

  // ── ntcPendingCodes: list of company codes that have PERTEK Terbit
  //    but SPI not yet issued (matches the revpending state). ────────────
  (function updatePendingCodes() {
    const el = document.getElementById('ntcPendingCodes');
    if (!el) return;
    const codes = revPending.map(d => d.code);
    el.textContent = codes.length ? '(' + codes.join(' · ') + ')' : '(none)';
  })();
}


/* ─────────────────────────────────────────────────────────────────────────
   SPI / PERTEK OBTAINED DRILL-DOWN MODAL
   Shows one row per obtained cycle, filtered by Submit MOT date in period.
   ───────────────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────
   PERTEK PENDING DRILL-DOWN MODAL
   Shows Company → Submission → Product expandable breakdown
   ───────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────
   TOTAL SUBMITTED DRILL-DOWN MODAL
   One row per Submit cycle — sorted by Submit MOI date asc
   ───────────────────────────────────────────────────────────────── */
/* ─────────────────────────────────────────────────────────────────
   TOTAL REALIZED DRILL-DOWN MODAL
   ───────────────────────────────────────────────────────────────── */
function openRealizedDrill()  { const m=document.getElementById('realizedDrillModal'); if(!m) return; refreshRealizedDrill(); m.style.display='block'; }
function closeRealizedDrill() { const m=document.getElementById('realizedDrillModal'); if(m) m.style.display='none'; }

function refreshRealizedDrill() {
  const fmtDate = d => d ? d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
  const realColor = r => r>=0.8?'var(--green)':r>=0.6?'var(--teal)':'var(--red2)';

  /* ══════════════════════════════════════════════════════════════════════
     Drill ini dibuka DARI kartu Total Realized dan ada untuk menjelaskan angka
     itu — jadi ia wajib menghitung dari kolam dan gerbang yang SAMA.

     Dulu tidak: kartu (reportRealizedTotal) menjumlah baris PIB di
     REALIZATIONS dan menyaringnya dengan `pib_date`, sementara drill ini
     menjumlah `ra_records.berat` dan menyaringnya dengan `arrivalDate`. Dua
     sumber, dua tanggal. Tanpa filter keduanya kebetulan sama, jadi ini tidak
     terlihat sampai ada yang memilih periode: Juni 2026 → drill 2.069,08 MT /
     5 company terhadap kartu 2.275,372 / 9 (audit 2026-08-14).

     Sekarang barisnya diringkas PER PERUSAHAAN dari baris PIB yang sama, jadi
     Σ baris drill = angka kartu, selalu. `ra_records` tetap dipakai untuk
     obtained — lewat raTotals(), karena ia satu baris per gelombang. */
  const periodLabel = PERIOD.active ? PERIOD.label : 'All Time';
  const _hs2prod = (() => {
    const m = {};
    if (typeof PROD_HS_CODES !== 'undefined')
      Object.entries(PROD_HS_CODES).forEach(([p, h]) => { if (h && !m[h]) m[h] = p; });
    return m;
  })();

  let rows;
  if (Array.isArray(window.REALIZATIONS) && REALIZATIONS.length) {
    const per = {};
    REALIZATIONS.forEach(r => {
      if (PERIOD.active && !inPd(pDate(r.pib_date))) return;
      const code = String(r.company_code || '').toUpperCase();
      if (!code) return;
      const vol = parseFloat(String(r.volume ?? '').replace(/,/g, '')) || 0;
      const e = per[code] || (per[code] = { code, berat: 0, lines: 0, prods: new Set(), last: null, pibs: new Set() });
      e.berat += vol;
      e.lines += 1;
      const nm = _hs2prod[String(r.hs_code || '').trim()] || String(r.product || '').trim();
      if (nm) e.prods.add(canonicalProduct(nm));
      if (r.pib_no) e.pibs.add(String(r.pib_no));
      const d = pDate(r.pib_date);
      if (d && (!e.last || d > e.last)) e.last = d;
    });
    rows = Object.values(per).map(e => {
      const t = (typeof raTotals === 'function') ? raTotals(e.code) : null;
      const ra = (typeof getRA === 'function') ? getRA(e.code) : null;
      const obtained = Number(ra && ra.obtained) || 0;
      return {
        code: e.code,
        product: [...e.prods].map(p => (typeof prodLabel === 'function' ? prodLabel(p) : p)).join(' + ') || '—',
        arrivalDate: e.last, berat: e.berat, obtained,
        realPct: obtained > 0 ? e.berat / obtained : 0,
        catatan: `${e.lines} PIB line${e.lines !== 1 ? 's' : ''}${e.pibs.size ? ' · ' + e.pibs.size + ' PIB' : ''}`,
        _waves: t ? t.count : 1,
      };
    }).sort((a, b) => (a.arrivalDate && b.arrivalDate) ? a.arrivalDate - b.arrivalDate : a.code.localeCompare(b.code));
  } else {
    /* Cadangan — sama seperti cabang cadangan reportRealizedTotal(): agregat
       per perusahaan lewat raTotals(), BUKAN satu baris per gelombang. */
    const kode = [...new Set(RA.filter(r => r.cargoArrived && (!PERIOD.active
      || inPd(r.arrivalDate ? raDate(r.arrivalDate) : null))).map(r => r.code))];
    rows = kode.map(c => {
      const t = raTotals(c), ra = getRA(c);
      const obtained = Number(ra && ra.obtained) || 0;
      return { code: c, product: ra ? ra.product : '—',
               arrivalDate: ra && ra.arrivalDate ? raDate(ra.arrivalDate) : null,
               berat: t.berat, obtained, realPct: obtained > 0 ? t.berat / obtained : 0,
               catatan: t.multi ? `${t.count} arrival waves` : '', _waves: t.count };
    }).sort((a, b) => a.code.localeCompare(b.code));
  }

  /* Tile ringkasan memanggil sumber kanonik, bukan menjumlah ulang barisnya. */
  const _kanon       = reportRealizedTotal();
  const totalRealized = _kanon.mt;
  const nCompanies    = _kanon.companies;
  const totalObtained = rows.reduce((s,r) => s + (r.obtained||0), 0);
  const avgReal       = totalObtained > 0 ? (totalRealized / totalObtained * 100).toFixed(1) : '—';

  document.getElementById('realDrillSubtitle').textContent =
    `Period: ${periodLabel} · ${nCompanies} compan${nCompanies!==1?'ies':'y'} · realisasi PIB`;

  document.getElementById('realDrillSummary').innerHTML = [
    ['Realized (MT)',  totalRealized.toLocaleString(MT_LOCALE)+' MT', 'var(--green)',   'var(--green-bg)',  'var(--green-bd)'],
    ['Obtained (MT)',  totalObtained.toLocaleString(MT_LOCALE)+' MT', 'var(--teal)',    'var(--teal-bg)',   'var(--teal-bd)'],
    ['Companies',      nCompanies,                           'var(--blue)',    'var(--blue-bg)',   'var(--blue-bd)'],
    ['Avg Real. %',    avgReal+'%',                          'var(--green)',   'var(--green-bg)',  'var(--green-bd)'],
  ].map(([lbl,val,col,bg,bd]) => `
    <div style="text-align:center;padding:6px 14px;background:${bg};border-radius:6px;border:1px solid ${bd}">
      <div style="font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:.8px">${lbl}</div>
      <div style="font-size:18px;font-weight:700;color:${col};line-height:1.3">${val}</div>
    </div>`).join('');

  const body = document.getElementById('realDrillBody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="7" style="padding:24px;text-align:center;color:var(--txt3)">No arrivals in ${periodLabel}</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    /* arrivalDate sudah berupa Date di kedua cabang di atas. */
    const arrDate  = (r.arrivalDate instanceof Date) ? r.arrivalDate
                   : (r.arrivalDate ? raDate(r.arrivalDate) : null);
    const pct      = (r.realPct*100).toFixed(1)+'%';
    const pctColor = realColor(r.realPct);
    const eligible = r.realPct >= 0.6 ? '✅ Eligible' : '✗ Below 60%';
    const eligColor= r.realPct >= 0.6 ? 'var(--green)' : 'var(--red2)';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="closeRealizedDrill();setTimeout(()=>openDrawer('${r.code}'),100)">
      <td style="padding:8px 14px;font-weight:700;color:var(--navy)">${r.code}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--txt)">${r.product||'—'}</td>
      <td style="padding:8px 10px;text-align:center;font-weight:600;color:var(--green);font-family:'DM Mono',monospace;font-size:11px">${fmtDate(arrDate)}</td>
      <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;color:var(--txt3)">${(r.obtained||0).toLocaleString(MT_LOCALE)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-family:'DM Mono',monospace;color:var(--green)">${(r.berat||0).toLocaleString(MT_LOCALE)}</td>
      <td style="padding:8px 10px;text-align:center;font-weight:700;color:${pctColor}">${pct}</td>
      <td style="padding:8px 14px;font-size:11px;color:${eligColor}">${r.catatan||eligible}</td>
    </tr>`;
  }).join('');

  document.getElementById('realDrillFooter').textContent =
    `${rows.length} compan${rows.length!==1?'ies':'y'} · Click row to open detail`;
}

/* ─────────────────────────────────────────────────────────────────
   AVAILABLE QUOTA DRILL-DOWN MODAL
   ───────────────────────────────────────────────────────────────── */
/* ── HS Code filter state for Available Quota Drill ── */
let _avqHsFilter  = '';   // '' = All
let _avqHsSearch  = '';   // free-text search across product/HS

function avqSetHsFilter(hs, el) {
  _avqHsFilter = hs;
  _avqHsSearch = '';
  // Sync the select dropdown value
  const sel = document.getElementById('avqHsSearch'); if (sel) sel.value = hs;
  document.querySelectorAll('.avq-hs-chip').forEach(c => c.classList.remove('avq-chip-on'));
  if (el) el.classList.add('avq-chip-on');
  refreshAvqDrill();
}
function avqApplyHsSearch(val) {
  // Now triggered by dropdown select — val is the exact HS code or ''
  _avqHsFilter = val.trim();
  _avqHsSearch = '';
  document.querySelectorAll('.avq-hs-chip').forEach(c => c.classList.remove('avq-chip-on'));
  const matchChip = document.querySelector(`.avq-hs-chip[data-hs="${val}"]`);
  if (matchChip) matchChip.classList.add('avq-chip-on');
  refreshAvqDrill();
}
/* Populate the HS dropdown with unique HS codes from current data */
function _populateAvqHsDropdown(allRows) {
  const sel = document.getElementById('avqHsSearch');
  if (!sel) return;
  const hsSet = new Set(allRows.map(r => r.hs).filter(h => h && h !== '—'));
  const current = sel.value;
  // Keep "All" option + unique HS codes sorted
  sel.innerHTML = '<option value="">— Semua HS Code —</option>' +
    Array.from(hsSet).sort().map(hs =>
      `<option value="${hs}" ${current===hs?'selected':''}>${hs} · ${
        allRows.filter(r=>r.hs===hs).map(r=>r.product).filter((v,i,a)=>a.indexOf(v)===i).join(', ')
      }</option>`
    ).join('');
}

function openAvqDrill()  { _avqHsFilter=''; _avqHsSearch=''; const m=document.getElementById('avqDrillModal'); if(!m) return; refreshAvqDrill(); m.style.display='block'; }
function closeAvqDrill() { const m=document.getElementById('avqDrillModal'); if(m) m.style.display='none'; }

function refreshAvqDrill() {
  /* Modal ini membuka DARI kartu Available Quota dan ada untuk menjelaskan
     angka kartu itu — jadi ia wajib merender rincian yang sama, bukan menyusun
     kolam dan rumusnya sendiri. Versi sebelumnya melakukan keduanya: kolamnya
     `kpiPool()` + `canonicalObtained > 0` (tanpa gerbang "terbit s/d akhir
     periode" milik kartu), dan saldonya dari `scopedAvailByProd()` — obtained
     PERIODE dikurangi utilisasi PERIODE, sementara kartu memakai saldo
     KUMULATIF. Dua penyimpangan itu yang membuat modal membaca 12.780 MT / 7
     company terhadap kartu 11.058 MT (tim Sales, 2026-08-11). */
  const allRows = availableQuotaRows();

  // Populate the HS Code dropdown with unique codes from current data
  _populateAvqHsDropdown(allRows);

  // ── Build HS filter chip bar from all unique HS codes in data ──────────
  const hsSet = new Set(allRows.map(r => r.hs).filter(h => h && h !== '—'));
  const hsSorted = ['', ...Array.from(hsSet).sort()];
  const chipsEl = document.getElementById('avqHsChips');
  if (chipsEl) {
    chipsEl.innerHTML = hsSorted.map(hs => {
      const label     = hs === '' ? 'All' : hs;
      const prodMatch = hs === '' ? '' : ` · ${allRows.filter(r=>r.hs===hs).map(r=>r.product).filter((v,i,a)=>a.indexOf(v)===i).join(', ')}`;
      const isOn      = (_avqHsFilter === hs && !_avqHsSearch) || (hs==='' && !_avqHsFilter && !_avqHsSearch);
      return `<button class="avq-hs-chip${isOn?' avq-chip-on':''}" data-hs="${hs}"
        onclick="avqSetHsFilter('${hs}',this)"
        title="${hs ? hs + prodMatch : 'Show all HS codes'}"
        style="font-size:10px;font-weight:700;padding:3px 9px;border-radius:20px;cursor:pointer;
          border:1px solid ${isOn?'var(--navy)':'var(--border2)'};
          background:${isOn?'var(--navy)':'var(--bg)'};
          color:${isOn?'#fff':'var(--txt3)'};
          transition:all .15s;white-space:nowrap">
        ${label}
      </button>`;
    }).join('');
  }

  // ── Apply filter ─────────────────────────────────────────────────────
  let rows = allRows;
  if (_avqHsFilter)  rows = rows.filter(r => r.hs === _avqHsFilter);
  if (_avqHsSearch)  rows = rows.filter(r =>
    r.product.toLowerCase().includes(_avqHsSearch) ||
    r.hs.toLowerCase().includes(_avqHsSearch) ||
    r.code.toLowerCase().includes(_avqHsSearch)
  );

  // ── Summary stats (on filtered rows) ─────────────────────────────────
  const totalAvq  = rows.reduce((s,r) => s+r.avq,    0);
  const totalUtil = rows.reduce((s,r) => s+r.utilMT,  0);
  const totalObt  = rows.reduce((s,r) => s+r.obtained,0);
  const uniqueCos = new Set(rows.map(r=>r.code)).size;
  const utilRate  = totalObt > 0 ? (totalUtil/totalObt*100).toFixed(1) : '—';
  const avqRate   = totalObt > 0 ? (totalAvq /totalObt*100).toFixed(1) : '—';

  const activeHsLabel = _avqHsFilter ? ` · HS ${_avqHsFilter}` : (_avqHsSearch ? ` · "${_avqHsSearch}"` : '');
  /* Basis dicantumkan terang-terangan. Header lama hanya menulis "Obtained −
     Utilized" tanpa menyebut atas dasar apa, sehingga tim membandingkannya
     dengan Obtained/Utilized periode di kartu sebelah dan wajar menyimpulkan
     angkanya bertentangan. */
  const sub = document.getElementById('avqDrillSubtitle');
  if (sub) {
    sub.textContent =
      `${uniqueCos} companies · ${rows.length} product-rows · Obtained − Utilized (all-time)${activeHsLabel}`;
    sub.title = 'Saldo kumulatif: obtained dan utilized di sini SEPANJANG WAKTU, '
      + 'bukan aktivitas di dalam periode. Filter periode memilih company mana '
      + 'yang muncul, bukan memotong saldonya.';
  }

  document.getElementById('avqDrillSummary').innerHTML = [
    ['Available (MT)',  fmtMt(totalAvq)+' MT',  '#0891b2',       '#ecfeff',           '#a5f3fc'],
    ['Obtained (MT)',   fmtMt(totalObt)+' MT',  'var(--teal)',   'var(--teal-bg)',    'var(--teal-bd)'],
    ['Utilized (MT)',   fmtMt(totalUtil)+' MT', 'var(--blue)',   'var(--blue-bg)',    'var(--blue-bd)'],
    ['Util. Rate',      utilRate+'%',                      'var(--blue)',   'var(--blue-bg)',    'var(--blue-bd)'],
    ['Avail. Rate',     avqRate+'%',                       '#0891b2',       '#ecfeff',           '#a5f3fc'],
  ].map(([lbl,val,col,bg,bd]) => `
    <div style="text-align:center;padding:6px 14px;background:${bg};border-radius:6px;border:1px solid ${bd}">
      <div style="font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:.8px">${lbl}</div>
      <div style="font-size:18px;font-weight:700;color:${col};line-height:1.3">${val}</div>
    </div>`).join('');

  const body = document.getElementById('avqDrillBody');
  if (!rows.length) {
    const msg = _avqHsFilter ? `HS ${_avqHsFilter}` : _avqHsSearch ? `"${_avqHsSearch}"` : 'the current filter';
    body.innerHTML = `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--txt3)">No data for ${msg}</td></tr>`;
    return;
  }

  const maxAvq = Math.max(...rows.map(r=>r.avq), 1);
  let lastCode = null;
  body.innerHTML = rows.map(r => {
    const isFirst = r.code !== lastCode; lastCode = r.code;
    const utilPct  = r.obtained > 0 ? r.utilMT / r.obtained : 0;
    const barW     = (r.avq / maxAvq * 100).toFixed(1);
    const avqCol   = r.avq > 0 ? '#0891b2' : r.avq === 0 ? 'var(--txt3)' : 'var(--red2)';
    const coSpi    = getSPI(r.code);
    const badge    = coSpi ? statusBadge(coSpi) : '';
    const rowBg    = isFirst ? '' : 'background:#f9fafb';
    const lBorder  = isFirst ? 'border-left:3px solid #0891b2' : 'border-left:3px solid #a5f3fc';
    // Highlight matching HS code
    const hsHl     = (_avqHsFilter && r.hs === _avqHsFilter)
      ? `font-weight:700;color:var(--navy);background:var(--blue-bg);padding:2px 6px;border-radius:4px;border:1px solid var(--blue-bd)`
      : `color:var(--txt3)`;
    return `<tr style="border-bottom:1px solid var(--border);${rowBg};cursor:pointer" onclick="closeAvqDrill();setTimeout(()=>openDrawer('${r.code}'),100)">
      <td style="padding:8px 14px;font-weight:700;color:var(--navy);${lBorder};padding-left:11px">${isFirst ? r.code : ''}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--txt2)">${prodLabel(r.product)}</td>
      <td style="padding:8px 10px;font-size:10.5px;font-family:'DM Mono',monospace;${hsHl}">${r.hs}</td>
      <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;color:var(--txt3)">${fmtMt(r.obtained)}</td>
      <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;color:var(--blue)">${r.utilMT > 0 ? fmtMt(r.utilMT) : '—'}</td>
      <td style="padding:8px 10px;text-align:center;color:var(--blue);font-weight:600">${r.obtained>0?(utilPct*100).toFixed(0)+'%':'—'}</td>
      <td style="padding:8px 10px;text-align:right">
        <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
          <div style="width:60px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;flex-shrink:0">
            <div style="height:4px;background:${avqCol};border-radius:2px;width:${barW}%"></div>
          </div>
          <span style="font-weight:${r.avq>0?'700':'400'};font-family:'DM Mono',monospace;color:${avqCol}">${fmtMt(r.avq)}</span>
        </div>
      </td>
      <td style="padding:8px 14px">${badge}</td>
    </tr>`;
  }).join('');

  document.getElementById('avqDrillFooter').textContent =
    `${uniqueCos} companies · ${rows.length} product-rows · Click row to open company detail`;
}

/* ─────────────────────────────────────────────────────────────────
   TOTAL UTILIZED DRILL-DOWN MODAL
   ───────────────────────────────────────────────────────────────── */
function openUtilDrill()  { const m=document.getElementById('utilDrillModal'); if(!m) return; refreshUtilDrill(); m.style.display='block'; }
function closeUtilDrill() { const m=document.getElementById('utilDrillModal'); if(m) m.style.display='none'; }

function refreshUtilDrill() {
  const utilColor  = u => u >= 0.8 ? 'var(--green)' : u >= 0.5 ? 'var(--blue)' : 'var(--amber)';
  const periodLabel = PERIOD.active ? PERIOD.label : 'All Time';

  /* Kolam WAJIB sama dengan reportUtilizedTotal(): utilizationPool() melebarkan
     kpiPool dengan company yang PERTEK-nya di luar jendela tapi KARGONYA masuk.
     Tanpa itu drill ini membaca 9.605 MT terhadap kartu 12.525 — company yang
     memakai kuota di dalam periode hilang dari rinciannya (audit 2026-08-12). */
  const rows = [];
  (PERIOD.active ? utilizationPool(kpiPool()) : allCompaniesPool()).forEach(co => {
    const obtained = typeof co.obtained === 'number' ? co.obtained : 0;
    if (obtained <= 0) return;
    const ubp = scopedUtilByProd(co);    // period-aware (rule #3)
    const abp = scopedAvailByProd(co);
    const totalUtil = scopedUtilTotal(co);
    if (totalUtil <= 0 && Object.keys(ubp).length === 0) return; // skip zero-util companies

    if (Object.keys(ubp).length > 0) {
      Object.entries(ubp).forEach(([prod, util]) => {
        if ((util || 0) <= 0) return;
        const avq = abp[prod] != null ? abp[prod] : Math.max(0, obtained - util);
        const obtProd = (() => {
          const cycleProds = {};
          (co.cycles||[]).forEach(c => {
            if (!/^obtained/i.test(c.type)) return;
            Object.entries(c.products||{}).forEach(([p,v]) => { if(typeof v==='number'&&v>0) cycleProds[p]=(cycleProds[p]||0)+v; });
          });
          return cycleProds[prod] || (util + (abp[prod]||0));
        })();
        rows.push({ code: co.code, group: co.group, product: prod, obtained: obtProd, utilMT: util, availMT: avq });
      });
    } else if (totalUtil > 0) {
      const prod = (co.products||[])[0] || '—';
      rows.push({ code: co.code, group: co.group, product: prod, obtained, utilMT: totalUtil, availMT: Math.max(0, obtained - totalUtil) });
    }
  });

  rows.sort((a,b) => a.code.localeCompare(b.code) || a.product.localeCompare(b.product));

  const totalUtil  = rows.reduce((s,r) => s+r.utilMT, 0);
  /* Available dari sumber kanonik, BUKAN penjumlahan baris di atas. `rows` hanya
     memuat produk yang PUNYA utilisasi (baris ber-util 0 dilewati), jadi kuota
     yang belum tersentuh sama sekali tidak punya baris dan sisanya ikut hilang:
     tile ini membaca 7.708 MT terhadap kartu Available 11.478 (audit
     2026-08-14). Tile Utilized dan Obtained di drill yang sama sudah kanonik —
     yang ini tertinggal. */
  const totalAvail = reportAvailableTotal().mt;
  const totalObt   = reportObtainedTotal().mt;   // kanonik, bukan obtained all-time
  const avgUtil    = totalObt > 0 ? (totalUtil/totalObt*100).toFixed(1) : '—';

  document.getElementById('utilDrillSubtitle').textContent =
    `Period: ${periodLabel} · ${rows.length} product-rows · ${new Set(rows.map(r=>r.code)).size} companies`;

  document.getElementById('utilDrillSummary').innerHTML = [
    ['Utilized (MT)',   fmtMt(totalUtil)+' MT',  'var(--blue)',  'var(--blue-bg)',  'var(--blue-bd)'],
    ['Available (MT)',  fmtMt(totalAvail)+' MT', 'var(--teal)',  'var(--teal-bg)',  'var(--teal-bd)'],
    ['Obtained (MT)',   fmtMt(totalObt)+' MT',   'var(--navy)',  '#eef2ff',         '#c7d2fe'],
    ['Util. Rate',      avgUtil+'%',                        'var(--blue)',  'var(--blue-bg)',  'var(--blue-bd)'],
  ].map(([lbl,val,col,bg,bd]) => `
    <div style="text-align:center;padding:6px 14px;background:${bg};border-radius:6px;border:1px solid ${bd}">
      <div style="font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:.8px">${lbl}</div>
      <div style="font-size:18px;font-weight:700;color:${col};line-height:1.3">${val}</div>
    </div>`).join('');

  const body = document.getElementById('utilDrillBody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--txt3)">No utilization data recorded in ${periodLabel}</td></tr>`;
    return;
  }

  const maxUtil = Math.max(...rows.map(r=>r.utilMT), 1);
  body.innerHTML = rows.map(r => {
    const pct     = r.obtained > 0 ? r.utilMT/r.obtained : 0;
    const barW    = (r.utilMT/maxUtil*100).toFixed(1);
    const col     = utilColor(pct);
    const avqCol  = r.availMT > 0 ? 'var(--teal)' : r.availMT === 0 ? 'var(--txt3)' : 'var(--red2)';
    const coSpi   = getSPI(r.code);
    const badge   = coSpi ? statusBadge(coSpi) : '';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onclick="closeUtilDrill();setTimeout(()=>openDrawer('${r.code}'),100)">
      <td style="padding:8px 14px;font-weight:700;color:var(--navy)">${r.code}</td>
      <td style="padding:8px 10px;font-size:11px;font-weight:600;color:var(--txt2)">${r.group}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--txt)">${prodLabel(r.product)}</td>
      <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;color:var(--txt3)">${fmtMt(r.obtained)}</td>
      <td style="padding:8px 10px;text-align:right">
        <div style="display:flex;align-items:center;gap:6px;justify-content:flex-end">
          <div style="width:60px;height:4px;background:var(--border);border-radius:2px;overflow:hidden;flex-shrink:0">
            <div style="height:4px;background:${col};border-radius:2px;width:${barW}%"></div>
          </div>
          <span style="font-weight:700;font-family:'DM Mono',monospace;color:${col}">${fmtMt(r.utilMT)}</span>
        </div>
      </td>
      <td style="padding:8px 10px;text-align:center;font-weight:700;color:${col}">${(pct*100).toFixed(0)}%</td>
      <td style="padding:8px 10px;text-align:right;font-weight:${r.availMT>0?'700':'400'};font-family:'DM Mono',monospace;color:${avqCol}">${fmtMt(r.availMT)}</td>
      <td style="padding:8px 14px">${badge}</td>
    </tr>`;
  }).join('');

  document.getElementById('utilDrillFooter').textContent =
    `${new Set(rows.map(r=>r.code)).size} companies · ${rows.length} product-rows · Click row to open detail`;
}

/* ─────────────────────────────────────────────────────────────────
   TARGET RE-APPLY DRILL-DOWN MODAL
   ───────────────────────────────────────────────────────────────── */
function openReapplyDrill()  { const m=document.getElementById('reapplyDrillModal'); if(!m) return; refreshReapplyDrill(); m.style.display='block'; }
function closeReapplyDrill() { const m=document.getElementById('reapplyDrillModal'); if(m) m.style.display='none'; }

function refreshReapplyDrill() {
  const fmtDate = d => d ? d.toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}) : '—';
  const realColor = r => r>=0.8?'var(--green)':r>=0.6?'var(--teal)':'var(--red2)';

  // Pool: eligible + submitted, respecting period filter
  const _codes = new Set(PERIOD.active ? SPI.filter(co=>companyInPeriod(co.cycles||[])).map(co=>co.code) : []);
  const pool = PERIOD.active ? RA.filter(r=>_codes.has(r.code)) : RA;
  const rows = pool
    .filter(r => isEligible(r) || isReapplySubmitted(r))
    .sort((a,b) => {
      // submitted first, then eligible; within each group sort by realPct desc
      const gs = r => isReapplySubmitted(r) ? 0 : 1;
      const gd = gs(a) - gs(b);
      return gd !== 0 ? gd : b.realPct - a.realPct;
    });

  const subCount  = rows.filter(isReapplySubmitted).length;
  const eligCount = rows.filter(isEligible).length;
  const totalNew  = rows.filter(isReapplySubmitted).reduce((s,r)=>s+(r.reapplyNewTotal||0),0);
  const periodLabel = PERIOD.active ? PERIOD.label : 'All Time';

  document.getElementById('raDrillSubtitle').textContent =
    `${rows.length} compan${rows.length!==1?'ies':'y'} · ${subCount} submitted · ${eligCount} eligible`;

  document.getElementById('raDrillSummary').innerHTML = [
    ['🔵 Submitted',   subCount,                               '#5b21b6', '#f5f3ff', '#c4b5fd'],
    ['✅ Eligible',    eligCount,                              'var(--green)', 'var(--green-bg)', 'var(--green-bd)'],
    ['New Quota Req.', totalNew ? totalNew.toLocaleString(MT_LOCALE)+' MT' : '—', '#5b21b6', '#f5f3ff', '#c4b5fd'],
    ['Total in Pool',  rows.length,                            'var(--blue)', 'var(--blue-bg)', 'var(--blue-bd)'],
  ].map(([lbl,val,col,bg,bd]) => `
    <div style="text-align:center;padding:6px 14px;background:${bg};border-radius:6px;border:1px solid ${bd}">
      <div style="font-size:10px;font-weight:700;color:${col};text-transform:uppercase;letter-spacing:.8px">${lbl}</div>
      <div style="font-size:18px;font-weight:700;color:${col};line-height:1.3">${val}</div>
    </div>`).join('');

  const body = document.getElementById('raDrillBody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="8" style="padding:24px;text-align:center;color:var(--txt3)">No eligible or submitted companies in ${periodLabel}</td></tr>`;
    return;
  }

  body.innerHTML = rows.map(r => {
    const sub     = isReapplySubmitted(r);
    const elig    = isEligible(r);
    const pct     = (r.realPct*100).toFixed(1)+'%';
    const pctCol  = realColor(r.realPct);
    const statusBadge = sub
      ? `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;background:#f5f3ff;color:#5b21b6;border:1px solid #c4b5fd">🔵 Submitted</span>`
      : `<span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)">✅ Eligible</span>`;
    const submitDate = sub && r.reapplySubmitDate ? fmtDate(pDate(r.reapplySubmitDate)) : '—';
    const newQuota   = sub && r.reapplyNewTotal   ? r.reapplyNewTotal.toLocaleString(MT_LOCALE)  : '—';
    const rowBg      = sub ? 'background:#faf5ff' : '';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer;${rowBg}" onclick="closeReapplyDrill();setTimeout(()=>openDrawer('${r.code}'),100)">
      <td style="padding:8px 14px;font-weight:700;color:var(--navy)">${r.code}</td>
      <td style="padding:8px 10px;font-size:11px;color:var(--txt)">${r.product||'—'}</td>
      <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;color:var(--txt3)">${(r.obtained||0).toLocaleString(MT_LOCALE)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:700;font-family:'DM Mono',monospace;color:var(--green)">${(r.berat||0).toLocaleString(MT_LOCALE)}</td>
      <td style="padding:8px 10px;text-align:center;font-weight:700;color:${pctCol}">${pct}</td>
      <td style="padding:8px 10px;text-align:center">${statusBadge}</td>
      <td style="padding:8px 10px;text-align:center;font-family:'DM Mono',monospace;font-size:11px;color:var(--txt3)">${submitDate}</td>
      <td style="padding:8px 14px;text-align:right;font-weight:700;font-family:'DM Mono',monospace;color:#5b21b6">${newQuota}</td>
    </tr>`;
  }).join('');

  document.getElementById('raDrillFooter').textContent =
    `${subCount} submitted · ${eligCount} eligible · Click row to open company detail`;
}

/* ══════════════════════════════════════════════════
   PENDING SHIPMENT DRILL — rincian per company

   Modalnya dibangun di JS, bukan ditulis di index.html: kartu ini menggantikan
   Total Submitted yang modalnya masih dipakai (PDF & drill Submission), jadi
   menambah satu blok HTML lagi hanya menambah yang harus dijaga sinkron.

   Angka KUMULATIF, sama seperti kartunya — lihat reportPendingShipmentTotal().
════════════════════════════════════════════════════ */
function openPendingShipDrill() {
  const p = reportPendingShipmentTotal();
  const pool = PERIOD.active
    ? (typeof kpiPool === 'function' ? kpiPool() : [...SPI, ...PENDING])
    : [...SPI, ...PENDING];

  const realPerCo = {};
  (window.REALIZATIONS || []).forEach(r => {
    const c = String(r.company_code || '').toUpperCase();
    if (!c) return;
    realPerCo[c] = (realPerCo[c] || 0) + (parseFloat(String(r.volume ?? '').replace(/,/g, '')) || 0);
  });

  const rows = pool.map(co => {
    const u = (typeof allTimeUtil === 'function') ? allTimeUtil(co) : (Number(co.utilizationMT) || 0);
    const r = realPerCo[co.code] || 0;
    return { code: co.code, group: co.group || '—', util: u, real: r, pend: u - r };
  }).filter(x => x.pend > 0.01).sort((a, b) => b.pend - a.pend);

  const el = document.getElementById('pendShipDrillModal') || (() => {
    const d = document.createElement('div');
    d.id = 'pendShipDrillModal';
    d.style.cssText = 'display:none;position:fixed;inset:0;z-index:700;background:rgba(15,23,42,.55);backdrop-filter:blur(3px)';
    d.onclick = e => { if (e.target === d) d.style.display = 'none'; };
    document.body.appendChild(d);
    return d;
  })();

  const pct = x => x.util > 0 ? (x.pend / x.util * 100).toFixed(0) + '%' : '—';
  el.innerHTML = `
    <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);width:min(94vw,860px);max-height:86vh;background:var(--bg);border-radius:12px;box-shadow:0 24px 60px rgba(0,0,0,.28);display:flex;flex-direction:column;overflow:hidden">
      <div style="padding:16px 20px 14px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between">
        <div>
          <div style="font-size:15px;font-weight:700;color:var(--txt)">Total Pending Shipment — Rincian</div>
          <div style="font-size:11px;color:var(--txt3);margin-top:2px">
            Kuota sudah dialokasikan, barang belum tiba · Utilized − Realized ·
            ${rows.length} company · saldo kumulatif${PERIOD.active ? ` · company aktif di ${PERIOD.label}` : ''}
          </div>
        </div>
        <button onclick="document.getElementById('pendShipDrillModal').style.display='none'"
          style="background:var(--border);border:none;border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:14px;color:var(--txt3)">✕</button>
      </div>
      <div style="padding:12px 20px;border-bottom:1px solid var(--border);display:flex;gap:16px;flex-wrap:wrap;background:var(--bg2)">
        ${[['Pending Shipment', fmtMt(p.mt), 'var(--navy)', '#eef2ff', '#c7d2fe'],
           ['Utilized', fmtMt(p.utilized), 'var(--blue)', 'var(--blue-bg)', 'var(--blue-bd)'],
           ['Realized', p.realized.toLocaleString(MT_LOCALE), 'var(--green)', 'var(--green-bg)', 'var(--green-bd)']]
          .map(([l, v, c, bg, bd]) => `
            <div style="text-align:center;padding:6px 14px;background:${bg};border-radius:6px;border:1px solid ${bd}">
              <div style="font-size:10px;font-weight:700;color:${c};text-transform:uppercase;letter-spacing:.8px">${l}</div>
              <div style="font-size:20px;font-weight:700;color:${c};line-height:1.2">${v} <span style="font-size:12px">MT</span></div>
            </div>`).join('')}
      </div>
      <div style="overflow-y:auto;flex:1">
        <table style="width:100%;border-collapse:collapse;font-size:12px">
          <thead><tr style="position:sticky;top:0;background:var(--bg2);z-index:20">
            ${['Company', 'Grp', 'Utilized (MT)', 'Realized (MT)', 'Pending (MT)', '% Belum Tiba']
              .map((h, i) => `<th style="padding:9px 12px;text-align:${i < 2 ? 'left' : 'right'};font-weight:700;color:var(--txt3);font-size:10.5px;border-bottom:2px solid var(--border)">${h}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${rows.length ? rows.map(x => `
              <tr style="border-bottom:1px solid var(--border);cursor:pointer"
                  onclick="document.getElementById('pendShipDrillModal').style.display='none';setTimeout(()=>openDrawer('${x.code}'),100)">
                <td style="padding:8px 12px;font-weight:700;color:var(--navy)">${x.code}</td>
                <td style="padding:8px 12px;font-size:11px;color:var(--txt3)">${x.group}</td>
                <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;color:var(--txt3)">${fmtMt(x.util)}</td>
                <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;color:var(--green)">${x.real.toLocaleString(MT_LOCALE)}</td>
                <td style="padding:8px 12px;text-align:right;font-family:'DM Mono',monospace;font-weight:700;color:var(--navy)">${fmtMt(x.pend)}</td>
                <td style="padding:8px 12px;text-align:right;font-size:11px;color:var(--txt3)">${pct(x)}</td>
              </tr>`).join('')
              : `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--txt3)">Tidak ada yang menunggu kedatangan</td></tr>`}
          </tbody>
        </table>
      </div>
    </div>`;
  el.style.display = 'block';
}

function openSubmitDrill() {
  const modal = document.getElementById('submitDrillModal');
  if (!modal) return;
  refreshSubmitDrill();
  modal.style.display = 'block';
}
function closeSubmitDrill() {
  const modal = document.getElementById('submitDrillModal');
  if (modal) modal.style.display = 'none';
}
function refreshSubmitDrill() {
  const fmtDate = d => d
    ? d.toLocaleDateString('en-GB', {day:'2-digit', month:'short', year:'2-digit'})
    : '—';

  /* ────────────────────────────────────────────────────────────────────────
     Determine display category for each cycle
     Categories:
       'submit1'   — Submit #1 · Initial Application
       'revision'  — Revision #N · Product Modification
       'submit2'   — Submit #2+ · Re-Apply (Additional MT / Products)
       'pending'   — New Submission · Awaiting PERTEK/SPI (first submission, no PERTEK issued yet)
  ──────────────────────────────────────────────────────────────────────── */
  function getCycleCategory(cycleType, co) {
    if (/^submit #1$/i.test(cycleType))                   return 'submit1';
    if (/^revision #/i.test(cycleType))                   return 'revision';
    if (/^submit #[2-9]/i.test(cycleType))                return 'submit2';
    if (/^submit \(process\)$/i.test(cycleType))          return 'pending';
    return 'submit1'; // fallback
  }

  /* Dynamic status — derived from cycle's own releaseDate + paired SPI cycle */
  function getCycleStatus(cy, co) {
    const cat = getCycleCategory(cy.type, co);
    const hasPERTEK = cy.releaseDate && cy.releaseDate !== 'TBA';
    const allCycles = co.cycles || [];

    if (cat === 'pending') {
      return { text: '📬 New Submission — Awaiting PERTEK', color: 'var(--red2)' };
    }
    if (cat === 'submit1') {
      // Find corresponding Obtained #1 to check SPI release
      const obt1 = allCycles.find(c => /^obtained #1$/i.test(c.type));
      const hasSPI = obt1 && obt1.releaseDate && obt1.releaseDate !== 'TBA';
      if (hasSPI)    return { text: '✅ SPI Issued', color: 'var(--green)' };
      if (hasPERTEK) return { text: '⏳ PERTEK Terbit — SPI Belum', color: 'var(--amber2)' };
      return { text: '🔄 In Process', color: 'var(--txt3)' };
    }
    if (cat === 'revision') {
      // Find Obtained (Revision #N) cycle
      const revN = (cy.type.match(/(\d+)/) || ['','1'])[1];
      const obtRev = allCycles.find(c => new RegExp(`obtained.*revision.*#${revN}`, 'i').test(c.type));
      const hasSPIRev = obtRev && obtRev.releaseDate && obtRev.releaseDate !== 'TBA';
      if (hasSPIRev) return { text: '✅ PERTEK Perubahan Terbit — SPI Issued', color: 'var(--green)' };
      if (hasPERTEK) return { text: '✅ PERTEK Perubahan Terbit', color: 'var(--violet)' };
      return { text: '🔄 Awaiting PERTEK Perubahan', color: 'var(--amber2)' };
    }
    if (cat === 'submit2') {
      // Find corresponding Obtained #2 cycle
      const n = (cy.type.match(/(\d+)/) || ['','2'])[1];
      const obt2 = allCycles.find(c => new RegExp(`^obtained #${n}$`, 'i').test(c.type));
      const hasSPI2 = obt2 && obt2.releaseDate && obt2.releaseDate !== 'TBA';
      if (hasSPI2)    return { text: '✅ SPI Perubahan Issued', color: 'var(--green)' };
      if (hasPERTEK)  return { text: '⏳ PERTEK Terbit — SPI TBA', color: 'var(--amber2)' };
      return { text: '⏳ PERTEK TBA — Under Review', color: 'var(--red2)' };
    }
    return { text: '—', color: 'var(--txt3)' };
  }

  /* ── Collect rows: SPI (Submit cycles only) + PENDING ── */
  const rows = [];
  [...SPI].forEach(co => {
    (co.cycles || []).forEach(cy => {
      // Submit cycles only — Revision cycles excluded (product modification, not new MT)
      const isSubmit = /^submit/i.test(cy.type) && !/obtained/i.test(cy.type);
      if (!isSubmit) return;
      const mt = typeof cy.mt === 'number' ? cy.mt : 0;
      if (mt <= 0) return;
      const submitDate = pDate(cy.submitDate);
      if (PERIOD.active && !inPd(submitDate)) return;
      const cat    = getCycleCategory(cy.type, co);
      const status = getCycleStatus(cy, co);
      rows.push({
        code: co.code, group: co.group || '—',
        cycle: cy.type, cat, submitDate, mt,
        status: status.text, statusColor: status.color,
        isPending: false,
      });
    });
  });

  // Add PENDING companies as 'pending' category
  [...PENDING].forEach(co => {
    (co.cycles || []).forEach(cy => {
      if (!/^submit/i.test(cy.type) || /obtained/i.test(cy.type)) return;
      const mt = typeof cy.mt === 'number' ? cy.mt : 0;
      if (mt <= 0) return;
      const submitDate = pDate(cy.submitDate);
      if (PERIOD.active && !inPd(submitDate)) return;
      rows.push({
        code: co.code, group: co.group || '—',
        cycle: cy.type, cat: 'pending', submitDate, mt,
        status: '📬 New Submission — Awaiting PERTEK', statusColor: 'var(--red2)',
        isPending: true,
      });
    });
  });

  // Dedup: keep only first occurrence per company+cycleType
  const _subSeen = new Set();
  const _subUniq = [];
  rows.forEach(r => {
    const key = `${r.code}|${r.cycle}`;
    if (!_subSeen.has(key)) { _subSeen.add(key); _subUniq.push(r); }
  });
  rows.length = 0; _subUniq.forEach(r => rows.push(r));

  const periodLabel = PERIOD.active ? PERIOD.label : 'All Time';

  /* ── Group rows by category for display ── */
  const CAT_ORDER = ['submit1', 'submit2', 'pending'];
  const CAT_META  = {
    submit1:  { label: '📋 Submit #1',                                     bg: '#eef2ff', bd: '#c7d2fe', tc: 'var(--navy)' },
    submit2:  { label: '📨 Submit #2 (Re-Apply — Additional MT/Products)',  bg: 'var(--blue-bg)',  bd: 'var(--blue-bd)',  tc: 'var(--blue)' },
    pending:  { label: '📬 New Submission — Awaiting PERTEK/SPI',                  bg: 'var(--red-bg)',   bd: 'var(--red-bd)',   tc: 'var(--red)' },
  };

  // Totals per category
  const catTotals = {};
  CAT_ORDER.forEach(c => catTotals[c] = { mt: 0, count: 0, cos: new Set() });
  rows.forEach(r => {
    if (catTotals[r.cat]) {
      catTotals[r.cat].mt    += r.mt;
      catTotals[r.cat].count += 1;
      catTotals[r.cat].cos.add(r.code);
    }
  });

  const spiOnlyMT = rows.filter(r => !r.isPending).reduce((s, r) => s + r.mt, 0);
  const pendingMT = rows.filter(r =>  r.isPending).reduce((s, r) => s + r.mt, 0);
  const totalMT   = spiOnlyMT + pendingMT;
  const coCount      = new Set(rows.map(r => r.code)).size;
  const cycleCount   = rows.length;

  // Subtitle
  document.getElementById('submitDrillSubtitle').textContent =
    `Period: ${periodLabel} · ${cycleCount} submission${cycleCount!==1?'s':''} · ${coCount} compan${coCount!==1?'ies':'y'}`;

  // Summary strip — 4 category boxes + total
  document.getElementById('submitDrillSummary').innerHTML = `
    <div style="text-align:center;padding:6px 14px;background:#f8fafc;border-radius:6px;border:1px solid var(--border2)">
      <div style="font-size:9.5px;font-weight:700;color:var(--navy);text-transform:uppercase;letter-spacing:.8px">Grand Total</div>
      <div style="font-size:20px;font-weight:700;color:var(--navy);line-height:1.2">${fmtMt(totalMT)} <span style="font-size:11px">MT</span></div>
      <div style="font-size:10px;color:var(--txt3);margin-top:1px">${coCount} companies</div>
    </div>
    ${CAT_ORDER.map(cat => {
      const m = CAT_META[cat], t = catTotals[cat];
      if (t.count === 0) return '';
      return `<div style="text-align:center;padding:6px 12px;background:${m.bg};border-radius:6px;border:1px solid ${m.bd};min-width:110px">
        <div style="font-size:9px;font-weight:700;color:${m.tc};text-transform:uppercase;letter-spacing:.7px;line-height:1.3">${m.label.replace(/^[^ ]+ /,'')}</div>
        <div style="font-size:18px;font-weight:700;color:${m.tc};line-height:1.3">${fmtMt(t.mt)} <span style="font-size:10px">MT</span></div>
        <div style="font-size:10px;color:var(--txt3);margin-top:1px">${t.cos.size} co. · ${t.count} cycle${t.count!==1?'s':''}</div>
      </div>`;
    }).join('')}
    ${PERIOD.active ? `<div style="text-align:center;padding:6px 12px;background:var(--amber-bg);border-radius:6px;border:1px solid var(--amber-bd)">
      <div style="font-size:9px;font-weight:700;color:var(--amber);text-transform:uppercase;letter-spacing:.7px">Filter</div>
      <div style="font-size:13px;font-weight:700;color:var(--amber);line-height:1.4">📅 ${periodLabel}</div>
    </div>` : ''}`;

  // Table rows — grouped by category with section headers
  const body = document.getElementById('submitDrillBody');
  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="5" style="padding:24px;text-align:center;color:var(--txt3)">No submissions found for ${periodLabel}</td></tr>`;
    document.getElementById('submitDrillFooter').textContent = 'No data for selected period';
    return;
  }

  let html = '';
  CAT_ORDER.forEach(cat => {
    const catRows = rows.filter(r => r.cat === cat)
      .sort((a, b) => {
        if (a.submitDate && b.submitDate) return a.submitDate - b.submitDate;
        if (a.submitDate) return -1;
        if (b.submitDate) return 1;
        return a.code.localeCompare(b.code);
      });
    if (!catRows.length) return;
    const m = CAT_META[cat];
    const catMT = catRows.reduce((s, r) => s + r.mt, 0);
    const catCos = new Set(catRows.map(r => r.code)).size;

    // Section header row
    html += `<tr>
      <td colspan="5" style="padding:7px 14px;background:${m.bg};border-top:2px solid ${m.bd};border-bottom:1px solid ${m.bd}">
        <div style="display:flex;justify-content:space-between;align-items:center">
          <span style="font-size:11px;font-weight:700;color:${m.tc}">${m.label}</span>
          <span style="font-size:10.5px;font-family:'DM Mono',monospace;font-weight:700;color:${m.tc}">${fmtMt(catMT)} MT · ${catCos} co.</span>
        </div>
      </td>
    </tr>`;

    catRows.forEach(r => {
      const groupBadge = `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${r.group==='CD'?'#e0f2fe':'#f0fdf4'};color:${r.group==='CD'?'#0369a1':'#166534'};margin-left:4px">Grp ${r.group}</span>`;
      // Clean cycle label (without category prefix since it's already in the section header)
      const cycleLabel = r.cycle
        .replace(/^Submit #1$/i,             'Submit #1')
        .replace(/^Submit #([2-9]\d*)$/i,    'Submit #$1')
        .replace(/^Submit \(Process\)$/i,    'In Process');
      const openFn = r.isPending
        ? `closeSubmitDrill();setTimeout(()=>openDrawerPending('${r.code}'),100)`
        : `closeSubmitDrill();setTimeout(()=>openDrawer('${r.code}'),100)`;
      html += `<tr style="border-bottom:1px solid var(--border);cursor:pointer" onmouseover="this.style.background='#f8fafc'" onmouseout="this.style.background=''" onclick="${openFn}">
        <td style="padding:8px 14px 8px 22px;font-weight:700;color:var(--navy);white-space:nowrap">${r.code}${groupBadge}</td>
        <td style="padding:8px 10px;font-size:11px;color:var(--txt2)">${cycleLabel}</td>
        <td style="padding:8px 10px;text-align:center;font-weight:600;color:var(--txt2);font-family:'DM Mono',monospace;font-size:11px">${fmtDate(r.submitDate)}</td>
        <td style="padding:8px 10px;text-align:right;font-weight:700;color:var(--navy);font-family:'DM Mono',monospace">${fmtMt(r.mt)}</td>
        <td style="padding:8px 14px;font-size:11px;color:${r.statusColor}">${r.status}</td>
      </tr>`;
    });
  });

  body.innerHTML = html;
  document.getElementById('submitDrillFooter').textContent =
    `${cycleCount} submissions · Grand total ${fmtMt(totalMT)} MT (SPI: ${fmtMt(spiOnlyMT)} MT · Pending: ${fmtMt(pendingMT)} MT) · Click row to open company detail`;
}

function openPendingDrill() {
  const modal = document.getElementById('pendingDrillModal');
  if (!modal) return;
  refreshPendingDrill();
  modal.style.display = 'block';
}
function closePendingDrill() {
  const modal = document.getElementById('pendingDrillModal');
  if (modal) modal.style.display = 'none';
}

function refreshPendingDrill() {
  const pending = filteredPending();
  const today   = new Date(); today.setHours(0,0,0,0);

  /* ── helpers (same as buildPendingQuick) ── */
  const daysSince = str => {
    const d = pDate(str);
    return d ? Math.floor((today - d) / 86400000) : null;
  };
  const daysChip = days => {
    if (days === null) return '';
    const cls = days >= 90 ? 'urgent' : days >= 45 ? 'warn' : 'ok';
    const lbl = days === 0 ? 'Today' : days === 1 ? '1 day' : `${days} days`;
    return `<span class="pq-days-chip ${cls}" style="font-size:10px">⏱ ${lbl}</span>`;
  };
  const fmtDate = str => {
    const d = pDate(str);
    return d ? d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : (str||'—');
  };

  /* ── summary strip ── */
  const totalMT  = pending.reduce((s,p) => s + (p.mt||0), 0);
  const allDays  = pending.map(p => {
    const sc = (p.cycles||[]).find(cy => /submit/i.test(cy.type) && !/obtained/i.test(cy.type));
    return sc ? daysSince(sc.submitDate) : null;
  }).filter(d => d !== null);
  const maxDays  = allDays.length ? Math.max(...allDays) : 0;
  const avgDays  = allDays.length ? Math.round(allDays.reduce((s,d)=>s+d,0)/allDays.length) : 0;

  const sub = document.getElementById('pendDrillSubtitle');
  if (sub) sub.textContent = `${pending.length} compan${pending.length===1?'y':'ies'} · ${fmtMt(totalMT)} MT total · longest wait ${maxDays} days`;

  const sumEl = document.getElementById('pendDrillSummary');
  if (sumEl) sumEl.innerHTML = [
    ['Total Volume',   `${fmtMt(totalMT)} MT`,      'var(--red2)'],
    ['Companies',      `${pending.length}`,                   'var(--txt)'],
    ['Longest Wait',   `${maxDays} days`,                     maxDays>=90?'var(--red2)':maxDays>=45?'var(--orange)':'var(--green)'],
    ['Avg Wait',       `${avgDays} days`,                     'var(--txt)'],
  ].map(([lbl,val,col]) => `
    <div style="display:flex;flex-direction:column;gap:2px">
      <div style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--txt3)">${lbl}</div>
      <div style="font-size:18px;font-weight:800;font-family:'DM Mono',monospace;color:${col};line-height:1">${val}</div>
    </div>`).join('');

  /* ══ Build accordion in modal body ══ */
  const body = document.getElementById('pendDrillBody');
  if (!body) return;
  body.innerHTML = '';

  pending.forEach(p => {
    const submitCycles = (p.cycles||[]).filter(cy =>
      /submit/i.test(cy.type) && !/obtained/i.test(cy.type)
    );
    const firstSub = submitCycles[0];
    const codays   = firstSub ? daysSince(firstSub.submitDate) : null;

    /* ── Company section ── */
    const section = document.createElement('div');
    section.style.cssText = 'border-bottom:1px solid var(--border)';

    // Product pills
    const prodPills = p.products.map(pr => {
      const dot = prodDot(pr);
      return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9.5px;
        font-weight:700;padding:1px 7px;border-radius:10px;
        background:${dot}18;color:${dot};border:1px solid ${dot}44">
        <span style="width:5px;height:5px;border-radius:50%;background:${dot};display:inline-block;flex-shrink:0"></span>
        ${pr}
      </span>`;
    }).join('');

    // Company header row
    const coRow = document.createElement('div');
    coRow.style.cssText = `display:flex;align-items:center;gap:12px;padding:12px 20px;
      cursor:pointer;transition:background .12s;border-left:3px solid transparent;
      user-select:none`;
    coRow.onmouseover = () => { if(!coRow.classList.contains('open')) coRow.style.background='var(--red-bg)'; };
    coRow.onmouseout  = () => { if(!coRow.classList.contains('open')) coRow.style.background=''; };
    coRow.innerHTML = `
      <div style="flex-shrink:0;min-width:50px">
        <div style="font-size:14px;font-weight:800;color:var(--red2);letter-spacing:.3px">${p.code}</div>
        <div style="font-size:9.5px;color:var(--txt3);margin-top:1px;font-weight:600">Grp ${p.group}</div>
      </div>
      <div style="flex:1;min-width:0">
        <div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap;margin-bottom:3px">${prodPills}</div>
        <div style="display:flex;align-items:center;gap:7px;flex-wrap:wrap">
          <span style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace">${fmtMt(p.mt||0)} MT</span>
          <span class="badge b-pending" style="font-size:9.5px;padding:1px 6px">⏳ Pending</span>
          ${codays !== null ? daysChip(codays) : ''}
        </div>
      </div>
      <span class="drill-co-arrow">▶</span>`;

    // Submissions panel
    const subsPanel = document.createElement('div');
    subsPanel.style.cssText = 'display:none;border-top:1px solid var(--border);background:#fdfcfc';

    submitCycles.forEach(cy => {
      const ds      = daysSince(cy.submitDate);
      const cyMT    = typeof cy.mt === 'number' ? cy.mt : (p.mt||0);
      const prods   = cy.products && Object.keys(cy.products).length
                      ? cy.products
                      : p.products.reduce((o,pr)=>{ o[pr]=cyMT; return o; }, {});
      const totPMT  = Object.values(prods).reduce((s,v)=>s+(typeof v==='number'?v:0),0) || cyMT;
      const rawStat = cy.status || p.status || '';
      const cleanSt = rawStat.replace(/^Update\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*[-–]\s*/i,'');

      // Submission row
      const subRow = document.createElement('div');
      subRow.style.cssText = `display:flex;align-items:flex-start;gap:10px;
        padding:10px 20px 10px 36px;border-bottom:1px solid var(--border);
        cursor:pointer;transition:background .12s;position:relative;user-select:none`;
      subRow.onmouseover = () => { if(!subRow.classList.contains('open')) subRow.style.background='var(--amber-bg)'; };
      subRow.onmouseout  = () => { if(!subRow.classList.contains('open')) subRow.style.background=''; };
      subRow.innerHTML = `
        <div style="position:absolute;left:27px;top:0;bottom:0;width:1px;background:var(--red-bd)"></div>
        <div style="width:8px;height:8px;border-radius:50%;background:var(--red);flex-shrink:0;margin-top:5px;z-index:1;position:relative"></div>
        <div style="flex:1;min-width:0">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
            <span style="font-size:12px;font-weight:700;color:var(--txt)">${canonProdInText(cy.type)}</span>
            <span style="font-size:11px;font-weight:700;font-family:'DM Mono',monospace;color:var(--txt3)">${fmtMt(totPMT)} MT</span>
            ${ds !== null ? daysChip(ds) : ''}
          </div>
          <div style="display:flex;align-items:center;gap:8px;font-size:10.5px;color:var(--txt3);margin-top:3px;flex-wrap:wrap">
            <span>📅 Submit: <strong style="color:var(--txt)">${fmtDate(cy.submitDate)}</strong></span>
            <span style="color:var(--border2)">|</span>
            <span>PERTEK Release: <strong style="color:${cy.releaseDate&&cy.releaseDate!=='TBA'?'var(--teal)':'var(--txt3)'}">
              ${(()=>{const t=cycleTerbitDate(cy);return t && t!=='TBA' ? fmtDate(t) : '⏳ TBA';})()}
            </strong></span>
          </div>
          ${cleanSt ? `<div style="font-size:10px;color:var(--red2);margin-top:4px;font-style:italic;line-height:1.4;
            padding:4px 8px;background:var(--red-bg);border-radius:4px;border-left:2px solid var(--red-lt)">
            ⚠ ${cleanSt}</div>` : ''}
        </div>
        <span style="font-size:10px;color:var(--txt3);transition:transform .18s;flex-shrink:0;margin-top:4px" class="drill-sub-arrow">▶</span>`;

      // Product rows panel
      const prodsPanel = document.createElement('div');
      prodsPanel.style.cssText = 'display:none;background:var(--bg);border-top:1px solid var(--border)';

      // Table header
      prodsPanel.innerHTML = `
        <div style="display:grid;grid-template-columns:1fr auto auto;gap:0;
          padding:5px 20px 5px 56px;border-bottom:1px solid var(--border);
          background:var(--bg2)">
          <span style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3)">Product</span>
          <span style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3);text-align:right;min-width:90px">Volume (MT)</span>
          <span style="font-size:9.5px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3);text-align:right;min-width:55px;padding-left:12px">Share</span>
        </div>`;

      Object.entries(prods).filter(([,v])=>typeof v==='number'&&v>0).forEach(([prodName, prodMT]) => {
        const dot = prodDot(prodName);
        const pct = totPMT > 0 ? (prodMT/totPMT*100).toFixed(0) : '—';
        const bar = totPMT > 0 ? Math.min(100,(prodMT/totPMT*100)) : 0;
        const row = document.createElement('div');
        row.style.cssText = `display:grid;grid-template-columns:1fr auto auto;gap:0;
          align-items:center;padding:8px 20px 8px 56px;
          border-bottom:1px dashed var(--border)`;
        row.innerHTML = `
          <div style="display:flex;align-items:center;gap:8px;min-width:0">
            <div style="width:9px;height:9px;border-radius:2px;background:${dot};flex-shrink:0"></div>
            <div>
              <div style="font-size:11.5px;font-weight:600;color:var(--txt)">${prodName}</div>
              <div style="height:3px;width:min(${bar.toFixed(0)}%,120px);background:${dot};
                border-radius:2px;margin-top:3px;opacity:.6"></div>
            </div>
          </div>
          <div style="font-size:12px;font-weight:700;font-family:'DM Mono',monospace;
            color:var(--blue);text-align:right;min-width:90px">${fmtMt(prodMT)} MT</div>
          <div style="font-size:11px;font-weight:700;padding:1px 7px;border-radius:3px;
            background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-bd);
            text-align:right;min-width:55px;margin-left:12px">${pct}%</div>`;
        prodsPanel.appendChild(row);
      });

      // Toggle: submission click → products
      subRow.addEventListener('click', e => {
        e.stopPropagation();
        const isOpen = subRow.classList.contains('open');
        subsPanel.querySelectorAll('[class*="drill-sub"]').forEach(el => {
          const parent = el.closest('div[style*="cursor:pointer"]');
          if (parent) parent.classList.remove('open');
        });
        subsPanel.querySelectorAll('[style*="border-top:1px solid var(--border)"][style*="display"]').forEach(el => {
          if (el !== subsPanel && el !== subRow) el.style.display='none';
        });
        const arrow = subRow.querySelector('.drill-sub-arrow');
        if (isOpen) {
          subRow.classList.remove('open');
          subRow.style.background = '';
          prodsPanel.style.display = 'none';
          if (arrow) arrow.style.transform = '';
        } else {
          // collapse all other sub rows first
          subsPanel.querySelectorAll('div[style*="cursor:pointer"]').forEach(r => {
            r.classList.remove('open');
            r.style.background = '';
            const a = r.querySelector('.drill-sub-arrow');
            if (a) a.style.transform = '';
          });
          subsPanel.querySelectorAll('div[style*="border-top"][style*="display:"]').forEach(p => {
            p.style.display = 'none';
          });
          subRow.classList.add('open');
          subRow.style.background = '#fef9ec';
          prodsPanel.style.display = 'block';
          if (arrow) arrow.style.transform = 'rotate(90deg)';
        }
      });

      subsPanel.appendChild(subRow);
      subsPanel.appendChild(prodsPanel);
    });

    // "Open full detail" link at bottom of submissions
    const detailRow = document.createElement('div');
    detailRow.style.cssText = `padding:8px 20px 8px 36px;font-size:10.5px;color:var(--blue);
      font-weight:600;cursor:pointer;display:flex;align-items:center;gap:5px;
      background:var(--blue-bg);border-top:1px solid var(--blue-bd);transition:background .12s`;
    detailRow.innerHTML = '↗ Open full company detail';
    detailRow.onmouseover = () => detailRow.style.background='#dbeafe';
    detailRow.onmouseout  = () => detailRow.style.background='var(--blue-bg)';
    detailRow.onclick = e => { e.stopPropagation(); closePendingDrill(); openDrawerPending(p.code); };
    subsPanel.appendChild(detailRow);

    // Toggle: company click → submissions
    coRow.addEventListener('click', () => {
      const isOpen = coRow.classList.contains('open');
      // collapse all company rows first
      body.querySelectorAll('[data-pend-co]').forEach(r => {
        r.classList.remove('open');
        r.style.cssText = r.style.cssText.replace('background:var(--red-bg);','');
        r.style.borderLeft = '3px solid transparent';
        const a = r.querySelector('.drill-co-arrow');
        if (a) a.style.transform = '';
      });
      body.querySelectorAll('[data-pend-subs]').forEach(p => { p.style.display='none'; });
      const arrow = coRow.querySelector('.drill-co-arrow');
      if (isOpen) {
        coRow.classList.remove('open');
        coRow.style.background = '';
        coRow.style.borderLeft = '3px solid transparent';
        if (arrow) arrow.style.transform = '';
      } else {
        coRow.classList.add('open');
        coRow.style.background = 'var(--red-bg)';
        coRow.style.borderLeft = '3px solid var(--red)';
        subsPanel.style.display = 'block';
        if (arrow) arrow.style.transform = 'rotate(90deg)';
      }
    });

    coRow.setAttribute('data-pend-co', p.code);
    subsPanel.setAttribute('data-pend-subs', p.code);

    section.appendChild(coRow);
    section.appendChild(subsPanel);
    body.appendChild(section);
  });

  // Empty state
  if (!pending.length) {
    body.innerHTML = `<div style="padding:32px;text-align:center;color:var(--txt3);font-size:13px">
      ✅ No pending companies in current filter period.
    </div>`;
  }
}

function openObtainedDrill() {
  const modal = document.getElementById('obtainedDrillModal');
  if (!modal) return;
  refreshObtainedDrill();
  modal.style.display = 'block';
}

function closeObtainedDrill() {
  const modal = document.getElementById('obtainedDrillModal');
  if (modal) modal.style.display = 'none';
}

function refreshObtainedDrill() {
  /* ── New columns (per request 30-Apr-2026) ──────────────────────────
     NO | COMPANY | HS CODE | PRODUCT | QTY SUBMIT | QTY OBTAINED |
     QTY UTILIZED | QTY AVAILABLE | ETA JKT (filled by Sales)
     One row per (company, product). Submit & Obtained MT are aggregates
     across all cycles (Submit #1 + Submit #2 + …, Obtained #1 + Obtained #2 + …)
     with hover tooltip showing the cycle breakdown.
  ──────────────────────────────────────────────────────────────────── */

  // SPI + PENDING, period-filtered — the same set the card itself counts.
  // Read SPI alone and this modal silently omits whatever sits in PENDING.
  const pool = kpiPool();

  // ── Build per-(company, product) rows ───────────────────────────────
  const rows = [];
  pool.forEach(co => {
    /* Keempatnya WAJIB satu basis dengan kartu yang membuka drill ini. Dulu
       Submit & Obtained diambil SEPANJANG WAKTU di atas kolam yang sudah
       difilter periode, sehingga tile-nya membaca Submit 220.020 / Obtained
       29.120 terhadap kartu 66.745 / 19.640 (audit 2026-08-12). */
    const subByProd = (typeof scopedSubmittedByProd === 'function') ? scopedSubmittedByProd(co) : {};
    /* scopedObtainedDetailByProd, BUKAN scopedObtainedByProd: yang kedua jatuh
       ke stats (util+avail) saat All Time, dan stats bisa melenceng dari cycles
       — drill sempat membaca Obtained 34.840 terhadap kartu 34.740. Yang ini
       selalu dari CYCLES, aturan yang sama dengan canonicalObtained. */
    const _obtDetail = (typeof scopedObtainedDetailByProd === 'function') ? scopedObtainedDetailByProd(co) : {};
    const obtByProd = {};
    Object.keys(_obtDetail).forEach(p => { obtByProd[p] = _obtDetail[p].mt; });
    const utilBy    = scopedUtilByProd(co);   // period-aware (rule #3)

    // Union of products across submit + obtained (some products only in re-apply cycle)
    const allProds = [...new Set([...Object.keys(subByProd), ...Object.keys(obtByProd)])];
    if (!allProds.length) return;

    allProds.forEach(prod => {
      const subMT = subByProd[prod] || 0;
      const obtMT = obtByProd[prod] || 0;
      const utilMT = utilBy[prod] || 0;
      const avqMT = (typeof cumulativeAvailForProd === 'function') ? cumulativeAvailForProd(co, prod) : Math.max(0, obtMT - utilMT);
      // ETA JKT — the expected JKT arrival(s) Sales filled on this product's
      // shipment lots. Show the latest ETA (raw string as entered); tooltip
      // lists every distinct ETA when a product has multiple lots.
      const lots = (co.shipments && co.shipments[prod]) || [];
      const etaList = lots.map(l => String(l.etaJKT || '').trim()).filter(Boolean);
      let eta = '';
      if (etaList.length) {
        const parseE = s => (typeof parseETA === 'function' ? parseETA(s) : null) || pDate(s);
        let best = etaList[0], bestD = parseE(best);
        etaList.forEach(s => { const d = parseE(s); if (d && (!bestD || d > bestD)) { best = s; bestD = d; } });
        eta = best;
      }
      const etaAll = [...new Set(etaList)];

      rows.push({
        code: co.code, group: co.group,
        product: prod, hs: (typeof prodHS === 'function' ? prodHS(prod) : '—'),
        subMT, obtMT, utilMT, avqMT,
        eta, etaAll,
        subBreakdown: (typeof getCycleBreakdown === 'function') ? getCycleBreakdown(co, 'submit', prod) : [],
        obtBreakdown: (typeof getCycleBreakdown === 'function') ? getCycleBreakdown(co, 'obtained', prod) : [],
      });
    });
  });

  // Sort: company code asc, then product
  rows.sort((a, b) => {
    const c = a.code.localeCompare(b.code);
    return c !== 0 ? c : a.product.localeCompare(b.product);
  });

  // ── Summary totals ──────────────────────────────────────────────────
  const totalSub  = rows.reduce((s, r) => s + r.subMT,  0);
  const totalObt  = rows.reduce((s, r) => s + r.obtMT,  0);
  const totalUtil = rows.reduce((s, r) => s + r.utilMT, 0);
  const totalAvq  = rows.reduce((s, r) => s + r.avqMT,  0);
  const coCount   = new Set(rows.map(r => r.code)).size;
  const periodLabel = PERIOD.active ? PERIOD.label : 'All Time';

  document.getElementById('drillSubtitle').textContent =
    `Period: ${periodLabel} · ${rows.length} product row${rows.length!==1?'s':''} · ${coCount} compan${coCount!==1?'ies':'y'} · hover Submit/Obtained for cycle breakdown`;

  /* ── Ringkasan drill ini HANYA menampilkan Obtained ────────────────────
     Dulu ada lima tile: Submit · Obtained · Utilized · Available · Companies,
     semuanya dijumlah dari baris tabel silang di bawah. Itu tidak mungkin
     benar: keempat metrik itu punya KOLAM KANONIK YANG BERBEDA —

       Submitted  -> allCompaniesPool + gerbang tanggal Submit MOI per siklus
       Obtained   -> allCompaniesPool + gerbang PERTEK terbit per siklus
       Utilized   -> utilizationPool (dilebarkan: kargo masuk periode)
       Available  -> availablePool (saldo kumulatif, gerbang terbit s/d akhir)

     Satu tabel yang menyusuri SATU kolam tidak akan pernah mereproduksi
     keempatnya sekaligus. Audit 2026-08-12 mengukurnya: untuk H1 tile-nya
     membaca Submit 220.020 / Utilized 5.940 / Available 10.405 terhadap kartu
     66.745 / 12.525 / 11.058.

     Drill ini dibuka dari kartu OBTAINED, jadi tugasnya menjelaskan Obtained —
     dan hanya itu yang ditampilkan, langsung dari reportObtainedTotal() supaya
     tidak mungkin berbeda dari kartunya. Kolom Submit/Utilized/Available di
     tabel tetap ada sebagai konteks PER BARIS; ketiganya punya kartu dan drill
     sendiri untuk totalnya. */
  const _obtKanonik = reportObtainedTotal();
  document.getElementById('drillSummary').innerHTML = `
    <div style="text-align:center;padding:6px 14px;background:var(--teal-bg);border-radius:6px;border:1px solid var(--teal-bd)">
      <div style="font-size:10px;font-weight:700;color:var(--teal);text-transform:uppercase;letter-spacing:.8px">Total Obtained</div>
      <div style="font-size:20px;font-weight:700;color:var(--teal);line-height:1.2">${fmtMt(_obtKanonik.mt)} <span style="font-size:12px">MT</span></div>
    </div>
    <div style="text-align:center;padding:6px 14px;background:var(--green-bg);border-radius:6px;border:1px solid var(--green-bd)">
      <div style="font-size:10px;font-weight:700;color:var(--green);text-transform:uppercase;letter-spacing:.8px">Companies</div>
      <div style="font-size:20px;font-weight:700;color:var(--green);line-height:1.2">${_obtKanonik.companies}</div>
    </div>
    <div style="flex:1;min-width:180px;display:flex;align-items:center;padding:6px 12px;font-size:10.5px;color:var(--txt3);line-height:1.45">
      Kolom Submit · Utilized · Available di tabel adalah konteks per baris.
      Totalnya ada di kartunya masing-masing — cakupan periodenya berbeda-beda,
      jadi kolomnya sengaja tidak dijumlahkan di sini.
    </div>`;

  const body = document.getElementById('drillBody');

  if (!rows.length) {
    body.innerHTML = `<tr><td colspan="9" style="padding:24px;text-align:center;color:var(--txt3)">No obtained data in ${periodLabel}</td></tr>`;
    return;
  }

  // Build a hover tooltip span: shows total MT, on hover reveals breakdown
  const _esc = s => String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  const buildMtCell = (mt, breakdown, color) => {
    if (!mt) return `<span style="color:var(--txt3)">—</span>`;
    if (!breakdown || breakdown.length <= 1) {
      return `<span style="color:${color};font-weight:700;font-family:'DM Mono',monospace">${fmtMt(mt)}</span>`;
    }
    const lines = breakdown
      .map(b => {
        const dateStr = b.date ? ` — ${b.date}` : '';
        return `• ${b.label}: ${fmtMt(b.mt)} MT${dateStr}`;
      })
      .join('\n');
    const tip = `Total: ${fmtMt(mt)} MT\nBreakdown:\n${lines}`;
    return `<span class="cyc-bd" data-bd="${_esc(tip)}" style="color:${color};font-weight:700;font-family:'DM Mono',monospace;cursor:help;border-bottom:1px dashed ${color}">${fmtMt(mt)} <span style="font-size:9px;opacity:.7">▾</span></span>`;
  };

  let lastCode = '';
  body.innerHTML = rows.map((r, idx) => {
    const stripe = r.code !== lastCode && lastCode !== '' ? ';background:var(--bg2)' : '';
    const isFirst = r.code !== lastCode;
    lastCode = r.code;
    const groupBadge = `<span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:${r.group==='CD'?'#e0f2fe':'#f0fdf4'};color:${r.group==='CD'?'#0369a1':'#166534'};margin-left:4px">Grp ${r.group}</span>`;
    const dot = (typeof pc === 'function') ? pc(r.product).solid : '#94a3b8';
    return `<tr style="border-bottom:1px solid var(--border);cursor:pointer${stripe}" onclick="closeObtainedDrill();setTimeout(()=>openDrawer('${r.code}'),100)">
      <td style="padding:8px 8px;text-align:center;color:var(--txt3);font-family:'DM Mono',monospace;font-size:10.5px">${idx + 1}</td>
      <td style="padding:8px 12px;font-weight:700;color:var(--navy);white-space:nowrap">${isFirst ? r.code + groupBadge : '<span style=\"color:var(--txt3)\">' + r.code + '</span>'}</td>
      <td style="padding:8px 10px;font-family:'DM Mono',monospace;font-size:10.5px;color:var(--txt2)">${r.hs}</td>
      <td style="padding:8px 10px;font-size:11px"><span style="display:inline-flex;align-items:center;gap:6px"><span style="width:8px;height:8px;border-radius:2px;background:${dot};display:inline-block"></span>${prodLabel(r.product)}</span></td>
      <td style="padding:8px 10px;text-align:right">${buildMtCell(r.subMT, r.subBreakdown, 'var(--navy)')}</td>
      <td style="padding:8px 10px;text-align:right">${buildMtCell(r.obtMT, r.obtBreakdown, 'var(--teal)')}</td>
      <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;color:${r.utilMT > 0 ? 'var(--blue)' : 'var(--txt3)'};font-weight:${r.utilMT > 0 ? '700' : '400'}">${r.utilMT > 0 ? fmtMt(r.utilMT) : '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-family:'DM Mono',monospace;color:${r.avqMT > 0 ? '#0891b2' : 'var(--txt3)'};font-weight:${r.avqMT > 0 ? '700' : '400'}">${r.avqMT > 0 ? fmtMt(r.avqMT) : '—'}</td>
      <td style="padding:8px 12px;text-align:center;font-family:'DM Mono',monospace;font-size:10.5px;color:${r.eta ? 'var(--green)' : 'var(--txt3)'}"${r.etaAll && r.etaAll.length > 1 ? ` title="ETA JKT (semua lot): ${_esc(r.etaAll.join(', '))}"` : ''}>${r.eta ? _esc(r.eta) : '—'}</td>
    </tr>`;
  }).join('');

  document.getElementById('drillFooterNote').textContent =
    PERIOD.active
      ? `Period: ${periodLabel} · Hover Submit/Obtained for cycle breakdown · Click row to open company drawer`
      : `Showing all products with submit/obtained · Hover Submit/Obtained for cycle breakdown · Click row to open company drawer`;
}


document.addEventListener('click', e => {
  if (!e.target.closest('#pfWrap') && !e.target.closest('#pfPanel')) closePeriod();
});
const realColor  = r => r >= 0.8 ? 'var(--green)' : r >= 0.6 ? 'var(--teal)' : 'var(--red2)';
const realFill   = r => r >= 0.8 ? '#21c55d' : r >= 0.6 ? '#0c7c84' : '#ef4444';