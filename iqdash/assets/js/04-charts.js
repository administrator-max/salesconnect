/* ═══════════════════════════════════════
   CHARTS — Pipeline, Donut, Quota, Gauge…
   Also: revisionStatus, statusBadge, N helper
═══════════════════════════════════════ */

const N = n => n != null ? Number(n).toLocaleString(MT_LOCALE) : '—';
const chips = prods => prods.map(p => `<span class="chip" style="background:${pc(p).light};color:${pc(p).text}">${p}</span>`).join('');

/* ── REVISION STATUS LOGIC ─────────────────────────────────────
   revType='active'   → Under Revision (no PERTEK yet)
   revType='complete' → two sub-states based on SPI issuance:
     PENDING  : PERTEK Terbit / PERTEK Perubahan Terbit issued,
                SPI / SPI Perubahan NOT yet issued
     COMPLETE : PERTEK issued AND SPI / SPI Perubahan also issued

   Detection: SPI issued when spiRef contains 'SPI TERBIT'
              OR revStatus contains 'SPI TERBIT' or 'SPI Perubahan Terbit'

   Current data (04 Mar 2026):
     BTS  → spiRef:'PERTEK TERBIT 25/02/26'         → SPI belum → PENDING
     DIOR → spiRef:'PERTEK TERBIT 3/12/25'           → SPI belum → PENDING
     GIS  → spiRef:'PERTEK TERBIT 01/03/26'          → SPI belum → PENDING
     SMS  → spiRef:'PERTEK TERBIT 26/02/26'          → SPI belum → PENDING
     MJU  → spiRef:'SPI TERBIT 05/01/26'             → SPI terbit → COMPLETE
──────────────────────────────────────────────────────────────── */
/* ── Masih ada permohonan yang menggantung? ────────────────────────────
   Sebuah permohonan (Submit #N / Revision #N) dianggap SELESAI bila sudah
   dijawab oleh cycle Obtained pasangannya yang membawa PERTEK **dan** SPI.

   Ini menjawab keluhan tim 2026-08-05: sembilan PT masih tercantum di Active
   Revisions padahal tanggalnya sudah lengkap. Sebabnya revisionStatus() di
   bawah menilai dari TEKS (`revStatus`, `spiRef`, `statusUpdate`) — dan teks
   itu tidak ikut diperbarui saat tanggal dilengkapi. PPGL contoh paling
   gamblang: cycle-nya lengkap (PERTEK 30/05, SPI 09/06/2026) sementara
   `spiRef`-nya masih berbunyi "SPI belum terbit" dan `spiNo` kosong.

   Tanggal adalah fakta; kalimat status adalah catatan yang mudah basi. Yang
   dipercaya tanggalnya.

   "Revision Request — <produk>" SENGAJA tidak dihitung: itu permintaan sales
   internal yang dikonfirmasi CorpSec, bukan permohonan izin ke pemerintah,
   jadi ia tidak menunggu PERTEK/SPI. */
function _cycleTerbitLengkap(c) {
  const p = String((c && (c.pertekDate || c.releaseDate)) || '').trim();
  const s = String((c && c.spiDate) || '').trim();
  const sah = v => v && !/^tba$/i.test(v);
  return sah(p) && sah(s);
}
function hasOutstandingCycle(d) {
  const cy = (d && d.cycles) || [];
  const obtained = cy.filter(c => /^obtained/i.test(c.type || ''));

  // Obtained yang belum bertanggal lengkap = masih menggantung.
  if (obtained.some(c => !_cycleTerbitLengkap(c))) return true;

  // Tiap permohonan harus punya Obtained pasangannya yang sudah lengkap.
  for (const c of cy) {
    const t = String(c.type || '');
    if (/^revision request/i.test(t)) continue;
    let m = t.match(/^submit\s*#(\d+)/i);
    if (m) {
      const p = obtained.find(o => new RegExp(`^obtained\\s*#${m[1]}\\b`, 'i').test(o.type || ''));
      if (!p || !_cycleTerbitLengkap(p)) return true;
      continue;
    }
    m = t.match(/^revision\s*#(\d+)/i);
    if (m) {
      const p = obtained.find(o => new RegExp(`^obtained\\s*\\(revision\\s*#${m[1]}\\)`, 'i').test(o.type || ''));
      if (!p || !_cycleTerbitLengkap(p)) return true;
    }
  }
  return false;
}

/* Permohonan mana yang sedang menggantung, dan sudah sampai tahap apa.
   Mengembalikan null bila semuanya sudah tuntas.

   Dipakai untuk menentukan GOLONGAN, bukan sekadar selesai/belum. Tanpa ini,
   tahapnya masih ditentukan teks lama (`revType`, `spiRef`, `revStatus`) yang
   sama mudah basinya — MJU tergolong "PERTEK Pending" padahal Revision #3-nya
   baru diajukan 27 Jul 2026 dengan PERTEK masih TBA, yang berarti
   "Under Revision". Dilaporkan tim 2026-08-07. */
function outstandingStage(d) {
  const cy = (d && d.cycles) || [];
  const obtained = cy.filter(c => /^obtained/i.test(c.type || ''));
  const kandidat = [];
  for (const c of cy) {
    const t = String(c.type || '');
    if (/^revision request/i.test(t)) continue;
    let m = t.match(/^submit\s*#(\d+)/i);
    if (m) {
      const p = obtained.find(o => new RegExp(`^obtained\\s*#${m[1]}\\b`, 'i').test(o.type || ''));
      if (!p || !_cycleTerbitLengkap(p)) kandidat.push({ c, jenis: 'submit', n: +m[1] });
      continue;
    }
    m = t.match(/^revision\s*#(\d+)/i);
    if (m) {
      const p = obtained.find(o => new RegExp(`^obtained\\s*\\(revision\\s*#${m[1]}\\)`, 'i').test(o.type || ''));
      if (!p || !_cycleTerbitLengkap(p)) kandidat.push({ c, jenis: 'revision', n: +m[1] });
    }
  }
  if (!kandidat.length) return null;
  /* Yang TERBARU yang menentukan tahap: itulah yang sedang berjalan. */
  kandidat.sort((a, b) => a.n - b.n);
  const akhir = kandidat[kandidat.length - 1];
  if (akhir.jenis === 'submit') return akhir.n >= 2 ? 'reapply' : 'active';
  const pertek = String(akhir.c.pertekDate || akhir.c.releaseDate || '').trim();
  const sudahPertek = pertek && !/^tba$/i.test(pertek);
  // PERTEK belum terbit -> masih Under Revision. Sudah terbit, SPI belum -> PERTEK Pending.
  return sudahPertek ? 'revpending' : 'active';
}

/* ════════════════════════════════════════════════════════════════════════
   ACTIVE APPLICATION — permohonan yang MASIH BERJALAN

   Diminta tim 2026-08-13, menggantikan "Active Revisions" yang hanya memuat
   tiga golongan dan melewatkan perusahaan yang jelas-jelas sedang berproses.

   Empat golongan:
     new         New Submission — pengajuan pertama, belum punya obtained
     active      Revision       — perubahan produk/qty dari PERTEK sebelumnya
     reapply     Re-Apply       — pengajuan tambahan produk/MT
     revpending  PERTEK Pending — PERTEK sudah terbit, SPI belum

   Aturan utamanya (kata tim): selama ada New Submission / Revision / Re-Apply
   yang masih berproses dan PERTEK-nya belum terbit, perusahaan itu HARUS
   muncul.

   Kenapa tidak cukup outstandingStage() saja: ia hanya menyusuri pasangan
   Submit #N / Revision #N. IKM punya `Obtained #2` TANPA tanggal dan TANPA
   Submit #2 pasangannya (revisi diajukan lewat form Sales, bukan siklus baru),
   plus dua Sales Revision Request yang belum diputus CorpSec. Akibatnya
   hasOutstandingCycle() berkata "masih menggantung" sementara
   outstandingStage() mengembalikan null — dua fungsi bertentangan, dan IKM
   hilang dari daftar meski status SPI/PERTEK-nya jelas "Submit".

   Dua celah itu ditutup di sini, di ATAS logika lama, supaya golongan yang
   sudah benar (DIOR/GIS revisi, GKL re-apply) tidak bergeser. */
function activeApplicationStage(co) {
  if (!co) return null;

  let tahap = (typeof outstandingStage === 'function') ? outstandingStage(co) : null;

  if (!tahap) {
    // Permintaan revisi Sales yang belum diputus CorpSec = revisi sedang berjalan.
    const adaReq = Object.values(co.salesRevRequest || {})
      .some(v => v && v.requested && (!v.status || v.status === 'pending'));
    // Obtained yatim yang belum bertanggal — ditangkap hasOutstandingCycle().
    if (adaReq || (typeof hasOutstandingCycle === 'function' && hasOutstandingCycle(co))) {
      tahap = 'active';
    }
  }
  if (!tahap) return null;

  // Belum pernah memperoleh kuota sama sekali -> ini pengajuan PERTAMA.
  const obt = (typeof canonicalObtained === 'function') ? canonicalObtained(co) : 0;
  if (!(obt > 0)) return 'new';

  return tahap;   // 'active' | 'reapply' | 'revpending'
}

/* Seluruh perusahaan yang sedang punya permohonan berjalan, sudah digolongkan.
   Kolamnya SPI + PENDING — bukan filteredSPI() saja, karena "New Submission"
   justru hidup di PENDING. */
function activeApplications() {
  const pool = (typeof kpiPool === 'function') ? kpiPool() : [];
  const out = { new: [], active: [], reapply: [], revpending: [] };
  pool.forEach(co => {
    const t = activeApplicationStage(co);
    if (t && out[t]) out[t].push(co);
  });
  Object.keys(out).forEach(k => out[k].sort((a, b) => a.code.localeCompare(b.code)));
  out.total = out.new.length + out.active.length + out.reapply.length + out.revpending.length;
  return out;
}

function revisionStatus(d) {
  if (d.revType === 'none')   return 'clean';
  /* Tidak ada yang menggantung -> selesai, apa pun bunyi teks statusnya. */
  const tahap = outstandingStage(d);
  if (!tahap) return 'completed';
  return tahap;
  if (d.revType === 'active') {
    // Distinguish Re-Apply (Submit #2 — additional quota) from Revision (product/tonnage change)
    const hasSubmit2 = (d.cycles||[]).some(c => /^submit\s*#[2-9]/i.test(c.type));
    const baseStatus = hasSubmit2 ? 'reapply' : 'active';
    // If approval stage indicates PERTEK already issued → move to 'revpending' (Pending tab)
    const pendingStages = /pertek terbit|submit spi|proses pengiriman|penerimaan permohonan|verifikasi permohonan|penelitian|spi terbit/i;
    const stageIsPending =
      (d.revStatus && pendingStages.test(d.revStatus)) ||
      (d.revNote   && pendingStages.test(d.revNote));
    if (stageIsPending) return 'revpending';
    return baseStatus;
  }
  // revType='complete': PERTEK already issued — check if SPI also issued

  // Explicit override: if revStatus/spiRef says 'SPI Perubahan belum terbit' → PENDING
  const explicitPending =
    (d.revStatus && d.revStatus.includes('SPI Perubahan belum')) ||
    (d.spiRef    && d.spiRef.includes('SPI Perubahan belum'));
  if (explicitPending) return 'revpending';

  // ── NEW: SPI NO. field is populated + statusUpdate says SPI Terbit → Completed
  // This covers BTS/GIS/SMS type: PERTEK complete, SPI issued, statusUpdate='SPI Terbit'
  const spiNoFilled    = d.spiNo && d.spiNo.trim() !== '';
  const statusIsSPI    = d.statusUpdate && /spi\s*terbit/i.test(d.statusUpdate);
  if (spiNoFilled && statusIsSPI) return 'completed';

  // ── Also completed if spiNo filled regardless (SPI issued = done)
  // Only if revStatus does not explicitly say pending
  if (spiNoFilled && !explicitPending) return 'completed';

  // SPI Perubahan issued via spiRef or revStatus text
  const spiPerubahanIssued =
    (d.spiRef    && d.spiRef.includes('SPI Perubahan Terbit')) ||
    (d.revStatus && d.revStatus.includes('SPI Perubahan Terbit')) ||
    (d.revStatus && d.revStatus.startsWith('✅ Done'));

  // Special case: companies that went via Pertek route (no separate SPI Perubahan)
  const hasPertekOnly =
    d.spiRef && d.spiRef.includes('PERTEK TERBIT') &&
    !d.spiRef.includes('SPI TERBIT') && !d.spiRef.includes('SPI Perubahan');
  if (hasPertekOnly) return 'revpending';

  return spiPerubahanIssued ? 'completed' : 'revpending';
}

/* isUnconfigured — a company that exists in the master list but has never been
   touched: no cycles, no PERTEK/SPI reference, nothing submitted or obtained.
   Nothing has been applied for on its behalf at all.

   These used to fall through to statusBadge()'s "✅ SPI Issued" default, which
   claims the strongest possible state — an SPI has been issued — for companies
   with no submission whatsoever. The default was written when every row in the
   table had data, so "none of the revision branches matched" could only mean a
   plain issued SPI. Empty rows break that assumption.
   Reported by the team 2026-08-04: APA, KITA, LILO, PP, SORE, SUJU, UANG. */
function isUnconfigured(d) {
  if (!d) return false;
  if ((d.cycles || []).length) return false;
  if (d.spiRef || d.revStatus || d.pertekNo || d.spiNo) return false;
  if (Number(d.obtained) > 0 || Number(d.submit1) > 0) return false;
  return true;
}

function statusBadge(d) {
  if (isUnconfigured(d)) return '<span class="badge b-none">Belum Dikonfigurasi</span>';
  const rs = revisionStatus(d);
  if (rs === 'reapply')    return '<span class="badge b-reapply">📨 Re-Apply Submit #2</span>';
  if (rs === 'active')     return '<span class="badge b-rev">🔄 Under Revision</span>';
  if (rs === 'revpending') return '<span class="badge b-revpending">⏳ PENDING — PERTEK Terbit, SPI Belum</span>';
  if (rs === 'completed')  return '<span class="badge b-revdone">✅ COMPLETE — SPI Terbit</span>';
  if (d.spiRef && d.spiRef.includes('PERTEK TERBIT')) return '<span class="badge b-pertek">✓ Pertek</span>';
  return '<span class="badge b-spi">✅ SPI Issued</span>';
}

/* ══════════════════════════════════════════════════
   CHARTS
══════════════════════════════════════════════════ */
const CH = {};
function mkChart(id, cfg) {
  if (CH[id]) { CH[id].destroy(); CH[id] = null; }
  const el = document.getElementById(id);
  if (!el) return null;
  CH[id] = new Chart(el, cfg);
  return CH[id];
}

/* PIPELINE — hover shows company list */
function buildPipeline() {
  const spiPool = filteredSPI();
  const raMap   = {}; RA.forEach(r => { raMap[r.code] = r; });

  // Re-Apply Eligible = companies with cargoArrived AND realPct ≥ 60%
  // (includes both "eligible" and "already submitted" — what matters is realization)
  const reapplyPool = filteredRA().filter(r => r.cargoArrived === true && r.realPct >= 0.6);
  const reapplyMT   = reapplyPool.reduce((s,r) => s + (r.obtained||0), 0);
  const reapplyN    = reapplyPool.length;

  // Update pipeline sidebar stats dynamically — use canonicalObtained for accuracy
  const _pipeObt = co => (typeof canonicalObtained==='function') ? canonicalObtained(co) : (co.obtained||0);
  const ps = document.getElementById('pipelineSpiStat');
  if (ps) ps.textContent = `${fmtMt(spiPool.reduce((s,d)=>s+_pipeObt(d),0))} MT · ${spiPool.length} co.`;
  const pr = document.getElementById('pipelineReapplyStat');
  if (pr) pr.textContent = `${reapplyN} co.`;

  mkChart('pipelineChart', {
    type: 'doughnut',
    data: {
      labels: [
        `SPI / PERTEK Obtained (${spiPool.length})`,
        `Re-Apply Eligible (${reapplyN})`,
        `Pertek Pending (${filteredPending().length})`
      ],
      datasets: [{ data: [
        spiPool.reduce((s,d)=>s+_pipeObt(d),0),
        reapplyMT,
        filteredPending().reduce((s,d)=>s+d.mt,0)
      ], backgroundColor: ['#0c7c84','#8b5cf6','#dc2626'], borderColor:'#fff', borderWidth:3, hoverOffset:6 }]
    },
    options: {
      cutout: '64%',
      plugins: {
        legend: { display: false },
        tooltip: { enabled: false }
      },
      onHover: (e, els) => {
        const h = document.getElementById('pipelineHover');
        if (!els.length) { h.classList.remove('show'); return; }
        buildPipelineHover(els[0].index);
        h.classList.add('show');
      },
      onClick: (e, els) => {
        if (!els.length) return;
        const idx = els[0].index;
        if (idx===0) navFilter('SPI');
        else if (idx===1) goPage('utilization',document.querySelectorAll('.nav-tab')[2]);
        else navFilter('PENDING');
      }
    }
  });
}

function buildPipelineHover(idx) {
  const h = document.getElementById('pipelineHover');
  if (idx === 0) {
    const sorted = [...filteredSPI()].sort((a,b) => b.obtained - a.obtained);
    h.innerHTML = `<div class="ph-title">✅ SPI / PERTEK Obtained — ${sorted.length} companies</div>` +
      sorted.map(d => `<div class="ph-row"><span class="ph-code">${d.code}</span><span class="ph-mt">${fmtMt(d.obtained)} MT</span></div>`).join('');
  } else if (idx === 1) {
    // Re-Apply Eligible = companies with cargoArrived AND realPct ≥ 60%
    const eligible = filteredRA().filter(r => r.cargoArrived === true && r.realPct >= 0.6)
                       .sort((a,b) => b.realPct - a.realPct);
    h.innerHTML = `<div class="ph-title">🔵 Re-Apply Eligible — ${eligible.length} companies<br><span style="font-weight:400;font-size:10px;color:var(--txt3)">Realization ≥ 60% &amp; cargo arrived</span></div>` +
      eligible.map(r => {
        const stage = isReapplySubmitted(r) ? ' 🔵' : ' ✅';
        return `<div class="ph-row"><span class="ph-code">${r.code}${stage}</span><span class="ph-mt">${(r.realPct*100).toFixed(0)}% · ${r.obtained.toLocaleString(MT_LOCALE)} MT</span></div>`;
      }).join('');
  } else {
    h.innerHTML = `<div class="ph-title">⏳ Pertek Pending — ${filteredPending().length} companies</div>` +
      filteredPending().map(d => `<div class="ph-row"><span class="ph-code">${d.code}</span><span class="ph-mt">${fmtMt(d.mt)} MT</span></div>`).join('');
  }
}

/* PRODUCT DONUT — solid colors, legend with product + company list */
function buildProductDonut() {
  // Skip when the Product Mix card has been removed from the Overview DOM.
  if (!document.getElementById('productDonut')) return;
  // Aggregate MT per product across all SPI companies
  const map = {};
  const coMap = {}; // product → [companies]
  filteredSPI().forEach(co => {
    // β-1 / rule #4: use the post-revision NET per-product obtained (util+avail
    // from company_product_stats), NOT an even-split of co.obtained across the
    // stale co.products list. The old even-split mis-assigned a company's total
    // to products it no longer holds after a product-change revision (e.g.
    // GAS/MJU still under Bordes after revising to GI/Hollow) and double-shaped
    // the mix. getObtainedByProdAgg already encodes Revision=replace.
    const obtByProd = (typeof getObtainedByProdAgg === 'function') ? getObtainedByProdAgg(co) : {};
    Object.entries(obtByProd).forEach(([p, mt]) => {
      if (!(Number(mt) > 0)) return;
      if (!map[p]) { map[p] = 0; coMap[p] = []; }
      map[p] += Number(mt);
      coMap[p].push(co.code);
    });
  });
  const entries = Object.entries(map).sort((a,b) => b[1]-a[1]);
  const total = entries.reduce((s,[,v]) => s+v, 0);

  mkChart('productDonut', {
    type: 'doughnut',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{ data: entries.map(([,v]) => Math.round(v)),
        backgroundColor: entries.map(([k]) => pc(k).solid),
        borderColor: '#fff', borderWidth: 2, hoverOffset: 4 }]
    },
    options: {
      cutout: '52%',
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: {
          label: ctx => ` ${ctx.label}: ${fmtMt(ctx.parsed)} MT (${(ctx.parsed/total*100).toFixed(1)}%)`
        }}
      }
    }
  });

  // Build custom legend
  const leg = document.getElementById('prodLegend');
  leg.innerHTML = entries.map(([k, v]) => {
    const pct = (v / total * 100).toFixed(1);
    return `
    <div class="pl-row" title="${coMap[k].join(', ')}">
      <div class="pl-dot" style="background:${pc(k).solid}"></div>
      <span class="pl-name">${k}</span>
      <span class="pl-mt">${fmtMt(v)} MT</span>
      <span class="pl-pct" style="background:${pc(k).light};color:${pc(k).text}">${pct}%</span>
    </div>
    <div style="padding:0 6px 3px 23px;font-size:9.5px;color:var(--txt3);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${coMap[k].slice(0,6).join(', ')}${coMap[k].length>6?'…':''}</div>`;
  }).join('');
}

/* TOP COMPANIES — stripe pattern for AB vs CD group distinction */
function makeStripePattern(baseColor, stripeColor) {
  const c = document.createElement('canvas'); c.width=10; c.height=10;
  const ctx = c.getContext('2d');
  ctx.fillStyle = baseColor; ctx.fillRect(0,0,10,10);
  ctx.strokeStyle = stripeColor; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(0,10); ctx.lineTo(10,0); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-2,2); ctx.lineTo(2,-2); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(8,12); ctx.lineTo(12,8); ctx.stroke();
  return ctx.createPattern(c, 'repeat');
}

/* ════════════════════════════════════════════════════════
   AVAILABLE QUOTA BAR CHART
   Source: Excel "Utilization (MT)" and "Available (MT)" dedicated rows per company.
   Rule:   Available = PERTEK Terbit MT (obtained) − Utilization MT
   Case 1 — No revision:   obtained − utilization
   Case 2 — Revision TBA:  original obtained #1 − utilization
                            (revised MT excluded until PERTEK Perubahan issued)
   Case 3 — Submit #2 TBA: obtained #1 − utilization (same rule)
   All 29 companies with PERTEK Terbit shown, including util=0.
═══════════════════════════════════════════════════════ */
function buildAvailableQuota() {
  // Local palette — intentionally different from the canonical pc() in
  // 01-data.js. The AVQ bar chart uses a brighter teal/blue/orange
  // scheme so adjacent product bars are visually distinct from the
  // donut/badges elsewhere on the page. Do not "consolidate" with
  // PRODUCT_META without a UX review.
  const pc = p => {
    const MAP = {
      'GL BORON':'#0c7c84','GI BORON':'#1e56c6','BORDES ALLOY':'#d97706',
      'AS STEEL':'#7c3aed','SHEETPILE':'#059669','SEAMLESS PIPE':'#0d6946',
      'HRC/HRPO ALLOY':'#ca8a04','HOLLOW PIPE':'#78716c',
      'PPGL CARBON':'#7c3aed','ERW PIPE OD≤140mm':'#9333ea','ERW PIPE OD>140mm':'#0891b2',
    };
    for (const k in MAP) if (p && p.toUpperCase().includes(k.toUpperCase())) return MAP[k];
    return '#64748b';
  };

  /* Satu baris per (company, produk), dari rincian KANONIK di
     02-period-filter.js. Chart ini dulu menyusun barisnya sendiri — matematika
     saldonya sudah benar (kumulatif + dinormalkan ke total company), tapi
     KOLAM-nya `kpiPool()` + `canonicalObtained > 0`, tanpa gerbang "kuota sudah
     terbit s/d akhir periode" yang dipakai kartu. Jadi totalnya masih bisa
     berbeda dari kartu di atasnya untuk periode tertentu. availableQuotaRows()
     memakai kolam yang sama dengan kartu, jadi selisih itu tidak mungkin lagi. */
  const rows = availableQuotaRows();

  /* The Available Quota KPI CARD is no longer written here — updateOverviewKPIs()
     owns it, as `Obtained − Utilized` off the very totals its own two cards
     show (report spec, 2026-08-04). This function used to sum the per-company
     rows below, each already clamped at 0, which is a DIFFERENT number once a
     period is active: a company that used quota this month which was granted
     last month contributes a negative that the clamp swallows (June read 8,850
     against an aggregate 5,874). The rows below still drive the CHART, where
     per-company clamping is right — a single company can never show negative
     availability. */

  /* Badge diperbarui SEBELUM jalur kosong keluar lebih awal.

     Dulu di bawah, sesudah `if (rows.length === 0) … return`. Akibatnya untuk
     periode yang tidak punya saldo sama sekali (mis. Q4 2026) chart menulis
     "No company still holds an available balance" sementara badge di sebelahnya
     MASIH memampang angka periode sebelumnya — 11.178 MT. Dua pernyataan yang
     bertentangan, berdampingan, di satu kartu yang sama.

     Ini kelas bug yang berbeda dari yang lain: bukan salah hitung melainkan
     RENDER TERTINGGAL. Setiap permukaan yang bisa keluar lebih awal harus
     menulis keadaan kosongnya dulu, bukan membiarkan sisa render sebelumnya. */
  const badge = document.getElementById('avqTotalBadge');
  const setBadge = mt => { if (badge) badge.textContent = `Available: ${fmtMt(mt)} MT`; };

  // Render bar chart
  const el = document.getElementById('avqChart');
  if (!el) { setBadge(rows.reduce((s, r) => s + r.avq, 0)); return; }

  if (rows.length === 0) {
    setBadge(0);
    el.innerHTML = `<div style="padding:30px;text-align:center;color:var(--txt3);font-size:12px">
      No company still holds an available balance in the selected period.
    </div>`;
    return;
  }

  // Product filter pills — built from unique products across all rows
  const products = [...new Set(rows.map(r => r.product))].sort();
  const fwEl = document.getElementById('avqFilterWrap');
  if (fwEl && !fwEl._built) {
    fwEl._built = true;
    fwEl._active = 'ALL';
    const makePill = (label, val) => {
      const p = document.createElement('span');
      p.className = 'avq-pill';
      p.style.cssText = `background:${val==='ALL'?'var(--blue)':pc(val)};color:#fff;border:none;opacity:${fwEl._active===val?1:.55}`;
      p.textContent = val === 'ALL' ? 'All Products' : label;
      p.onclick = () => {
        fwEl._active = val;
        fwEl.querySelectorAll('.avq-pill').forEach(pp => pp.style.opacity = '.55');
        p.style.opacity = '1';
        buildAvailableQuota();
      };
      return p;
    };
    fwEl.appendChild(makePill('All', 'ALL'));
    products.forEach(prod => fwEl.appendChild(makePill(prod, prod)));
  }

  const activeFilter = fwEl ? fwEl._active : 'ALL';
  // Filter rows by active product; for ALL show every row
  const filtered = activeFilter === 'ALL' ? rows : rows.filter(r => r.product === activeFilter);

  const maxObt = Math.max(...filtered.map(r => r.obtained), 1);

  // Update total badge (pill produk aktif ikut menyaringnya)
  setBadge(filtered.reduce((s, r) => s + r.avq, 0));

  // Build HTML rows
  const hdr = `<div class="avq-hdr">
    <div>Company</div><div>Obtained vs Available</div>
    <div style="text-align:right">Available MT</div>
    <div>Product</div>
  </div>`;

  const barRows = filtered.map(r => {
    // Suppress tiny negative avail (XLSX manual re-allocation rounding artifacts)
    const dispAvq = (typeof snapZero === 'function') ? snapZero(r.avq) : r.avq;
    const obtW  = (r.obtained / maxObt * 100).toFixed(1);
    const utilW = (r.utilMT   / maxObt * 100).toFixed(1);
    const avqW  = Math.max(0, dispAvq / maxObt * 100).toFixed(1);
    const col   = pc(r.product);
    const avqColor = dispAvq > 0 ? col : 'var(--red2)';
    const tag = r.updatedBy
      ? `<span class="upd-tag upd-${r.updatedBy.toLowerCase()}" style="font-size:8.5px;padding:1px 5px">${r.updatedBy}</span>`
      : '';
    return `<div class="avq-row" style="margin-bottom:8px" onclick="openDrawer('${r.code}')" title="Click to open ${r.code} detail">
      <div>
        <div class="avq-co">${r.code}</div>
        <div>${tag}</div>
      </div>
      <div>
        <div class="avq-bar-bg" style="position:relative;cursor:pointer" title="${r.code}: Obtained ${fmtMt(r.obtained)} MT · Used ${fmtMt(r.utilMT)} MT · Available ${fmtMt(r.avq)} MT">
          <!-- Obtained (faint background) -->
          <div style="position:absolute;inset:0;background:${col}22;border-radius:5px"></div>
          <!-- Utilized (solid) -->
          <div style="position:absolute;top:0;left:0;height:100%;width:${utilW}%;background:${col};border-radius:5px;opacity:.5"></div>
          <!-- Available (bright right segment) -->
          <div style="position:absolute;top:0;left:${utilW}%;height:100%;width:${avqW}%;background:${avqColor};border-radius:0 5px 5px 0;opacity:${r.avq>0?1:.9}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--txt3);margin-top:2px">
          <span>Used: ${fmtMt(r.utilMT)} MT</span>
          <span>Available: ${fmtMt(dispAvq)} MT</span>
        </div>
      </div>
      <div class="avq-mt" style="color:${avqColor}">${dispAvq >= 0 ? fmtMt(dispAvq) : '('+fmtMt(Math.abs(dispAvq))+')'}  MT</div>
      <div class="avq-prod">${prodLabel(r.product)}</div>
    </div>`;
  }).join('');

  // ── Total summary row ───────────────────────────────────────────────
  const filtTotalObt  = filtered.reduce((s, r) => s + r.obtained, 0);
  const filtTotalUtil = filtered.reduce((s, r) => s + r.utilMT,   0);
  const filtTotalAvq  = filtered.reduce((s, r) => s + r.avq,      0);
  const totUtilW = filtTotalObt > 0 ? (filtTotalUtil / filtTotalObt * 100).toFixed(1) : 0;
  const totAvqW  = filtTotalObt > 0 ? Math.max(0, filtTotalAvq / filtTotalObt * 100).toFixed(1) : 0;
  const avqTotColor = filtTotalAvq > 0 ? 'var(--blue)' : 'var(--red2)';

  // Per-product breakdown for total row
  const prodTotals = {};
  filtered.forEach(r => { prodTotals[r.product] = (prodTotals[r.product] || 0) + r.avq; });
  const prodSummaryHtml = Object.entries(prodTotals)
    .filter(([, v]) => v > 0)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([prod, mt]) => {
      const col = pc(prod);
      const shortProd = prod.length > 14 ? prod.slice(0, 13) + '\u2026' : prod;
      return `<span style="display:inline-flex;align-items:center;gap:3px;font-size:9px;font-weight:700;` +
        `padding:1px 6px;border-radius:3px;background:${col}18;color:${col};border:1px solid ${col}44;white-space:nowrap">` +
        `<span style="width:5px;height:5px;border-radius:50%;background:${col};display:inline-block;flex-shrink:0"></span>` +
        `${shortProd}: ${fmtMt(mt)} MT` +
        `</span>`;
    }).join('');

  const totalRow = `
    <div style="margin-top:10px;padding-top:10px;border-top:2px solid var(--border2)">
      <div class="avq-row" style="background:var(--bg2);border-radius:8px;padding:8px 6px;border:1px solid var(--border2)">
        <div>
          <div class="avq-co" style="color:var(--navy);font-size:13px;font-weight:800">TOTAL</div>
          <div style="font-size:9px;color:var(--txt3);margin-top:2px">${new Set(filtered.map(r=>r.code)).size} companies</div>
        </div>
        <div>
          <div class="avq-bar-bg" style="position:relative">
            <div style="position:absolute;inset:0;background:var(--navy)22;border-radius:5px"></div>
            <div style="position:absolute;top:0;left:0;height:100%;width:${totUtilW}%;background:var(--navy);border-radius:5px;opacity:.4"></div>
            <div style="position:absolute;top:0;left:${totUtilW}%;height:100%;width:${totAvqW}%;background:${avqTotColor};border-radius:0 5px 5px 0"></div>
          </div>
          <div style="display:flex;justify-content:space-between;font-size:9px;color:var(--txt3);margin-top:3px">
            <span>Used: <strong style="color:var(--navy)">${fmtMt(filtTotalUtil)} MT</strong></span>
            <span>Available: <strong style="color:${avqTotColor}">${fmtMt(filtTotalAvq)} MT</strong></span>
          </div>
          <div style="margin-top:5px;display:flex;flex-wrap:wrap;gap:4px">${prodSummaryHtml}</div>
        </div>
        <div class="avq-mt" style="color:${avqTotColor};font-size:16px;font-weight:800">${fmtMt(filtTotalAvq)} MT</div>
        <div class="avq-prod" style="font-size:9.5px;color:var(--txt3);line-height:1.6">
          Obtained<br><strong style="color:var(--navy);font-size:11px">${fmtMt(filtTotalObt)}</strong>
        </div>
      </div>
    </div>`;

  el.innerHTML = hdr + '<div class="avq-wrap">' + barRows + totalRow + '</div>';
}

function buildTopCo() {
  const canvas = document.getElementById('topCoChart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');

  /* ── AB/CD colour palette ─────────────────────────────────────────────
     Group AB → solid teal (#0c7c84)
     Group CD → diagonal-stripe pattern (teal base, dark-teal stripes)
     Status tints: normal / revision active (amber) / revision complete (purple)
  ──────────────────────────────────────────────────────────────────────── */
  const PALETTE = {
    AB: { base:'#0c7c84', border:'#0f766e',
          rev_active:   { base:'#d97706', border:'#b45309' },
          rev_complete: { base:'#7c3aed', border:'#6d28d9' },
          reapply:      { base:'#8b5cf6', border:'#7c3aed' } },
    CD: { base:'#0e9c9c', stripe:'#065b5b', border:'#0d9488',
          rev_active:   { base:'#fbbf24', stripe:'#92400e', border:'#f59e0b' },
          rev_complete: { base:'#a78bfa', stripe:'#4c1d95', border:'#8b5cf6' },
          reapply:      { base:'#c4b5fd', stripe:'#4c1d95', border:'#8b5cf6' } },
  };

  /* ── Resolve bar color for a company ────────────────────────────────── */
  const getBarColor = co => {
    const grp = co.group === 'CD' ? 'CD' : 'AB';
    let variant;
    if (co.revType === 'active')    variant = 'rev_active';
    else if (co.revType === 'complete') variant = 'rev_complete';
    const ra = getRA(co.code);
    if (!variant && ra && isReapplySubmitted(ra)) variant = 'reapply';

    if (grp === 'CD') {
      const p = variant ? PALETTE.CD[variant] : PALETTE.CD;
      return { bg: makeStripePattern(p.base, p.stripe || PALETTE.CD.stripe), border: p.border };
    } else {
      const p = variant ? PALETTE.AB[variant] : PALETTE.AB;
      return { bg: p.base, border: p.border };
    }
  };

  /* ── Per-company obtained MT filtered by PERTEK Terbit date ─────────── */
  const getObtainedForPeriod = co => {
    // Only count Obtained #N (non-revision) cycles — consistent with KPI2.
    const allCycles = co.cycles || [];
    let total = 0;
    allCycles.forEach(c => {
      if (!/^obtained #/i.test(c.type)) return;
      const mt = typeof c.mt === 'number' ? c.mt : 0;
      if (mt <= 0) return;
      const pertekTerbit = getPertekTerbitForObtained(c, allCycles);
      if (!PERIOD.active || inPd(pertekTerbit)) total += mt;
    });
    return total;
  };

  /* ── Build sorted dataset ─────────────────────────────────────────────
     Only companies visible in filteredSPI() (which does broad company-level
     period match), then further filter to those with >0 obtained in period.
  ──────────────────────────────────────────────────────────────────────── */
  const dataset = filteredSPI()
    .map(co => ({
      ...co,
      periodObtained: getObtainedForPeriod(co),
    }))
    .filter(co => co.periodObtained > 0)
    .sort((a, b) => a.code.localeCompare(b.code))
    .slice(0, 15);

  if (!dataset.length) return;

  const colors  = dataset.map(co => getBarColor(co));
  const bgArr   = colors.map(c => c.bg);
  const bdrArr  = colors.map(c => c.border);

  mkChart('topCoChart', {
    type: 'bar',
    data: {
      labels: dataset.map(d => d.code),
      datasets: [{
        label: 'Obtained (MT)',
        data: dataset.map(d => d.periodObtained),
        backgroundColor: bgArr,
        borderColor: bdrArr,
        borderWidth: 1.5,
        borderRadius: 4,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 4, right: 10 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx2 => {
              const co = dataset[ctx2[0].dataIndex];
              const grpLabel = `Group ${co.group}`;
              return `${co.code}  [${grpLabel}]  —  ${fmtMt(co.periodObtained)} MT`;
            },
            label: ctx2 => {
              const co = dataset[ctx2.dataIndex];
              const ra = getRA(co.code);
              const lines = [`  Group: ${co.group} (${co.group==='CD'?'Striped':'Solid'})`];
              co.products.forEach(p => lines.push(`  • ${p}`));
              if (co.revType === 'active')    lines.push(`  ⚠ Revision Active`);
              if (co.revType === 'complete')  lines.push(`  ✓ Revision Complete`);
              if (ra && isReapplySubmitted(ra)) lines.push(`  🔵 Re-Apply Submitted`);
              if (ra && ra.cargoArrived) lines.push(`  Realization: ${(ra.realPct*100).toFixed(0)}%`);
              else if (ra && ra.utilPct) lines.push(`  Utilization: ${(ra.utilPct*100).toFixed(0)}%`);
              if (PERIOD.active && co.obtained !== co.periodObtained)
                lines.push(`  (All-time total: ${fmtMt(co.obtained)} MT)`);
              return lines;
            }
          }
        }
      },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:10.5,family:'DM Sans'},color:'#64748b'} },
        y: {
          type: 'logarithmic',
          min: 100,
          grid:{color:'#f1f5f9'},
          ticks:{
            font:{size:10},color:'#64748b',
            callback:v => {
              const n = Number(v);
              if (![100,1000,10000,100000,1000000].includes(n)) return '';
              return n.toLocaleString(MT_LOCALE);
            }
          }
        }
      },
      onClick: (e, els) => { if (els.length) openDrawer(dataset[els[0].index].code); }
    }
  });

  // HTML legend below the chart — guaranteed to never overlap bars.
  const legendEl = document.getElementById('topCoLegend');
  if (legendEl) {
    const usedGroups = new Set(dataset.map(co => co.group));
    const hasRevAct  = dataset.some(co => co.revType === 'active');
    const hasRevCmp  = dataset.some(co => co.revType === 'complete');
    const items = [];
    if (usedGroups.has('AB')) items.push({ text:'Group AB — Solid',   bg:'#0c7c84', stripe:null,      border:'#0f766e' });
    if (usedGroups.has('CD')) items.push({ text:'Group CD — Striped', bg:'#0e9c9c', stripe:'#065b5b', border:'#0d9488' });
    if (hasRevAct) items.push({ text:'Revision Active',   bg:'#d97706', stripe:null, border:'#b45309' });
    if (hasRevCmp) items.push({ text:'Revision Complete', bg:'#7c3aed', stripe:null, border:'#6d28d9' });

    // Render a tiny canvas swatch per item so we can show the stripe pattern.
    const swatchHTML = it => {
      const c = document.createElement('canvas');
      c.width = 12; c.height = 12;
      const cx = c.getContext('2d');
      cx.fillStyle = it.stripe ? makeStripePattern(it.bg, it.stripe) : it.bg;
      cx.fillRect(0, 0, 12, 12);
      cx.strokeStyle = it.border; cx.lineWidth = 1;
      cx.strokeRect(0.5, 0.5, 11, 11);
      return c;
    };
    legendEl.innerHTML = '';
    items.forEach(it => {
      const row = document.createElement('span');
      row.style.cssText = 'display:inline-flex;align-items:center;gap:5px;white-space:nowrap';
      row.appendChild(swatchHTML(it));
      const lbl = document.createElement('span');
      lbl.textContent = it.text;
      row.appendChild(lbl);
      legendEl.appendChild(row);
    });
  }
}

function buildCmpChart() {
  const data = [...filteredSPI()].sort((a,b) => a.code.localeCompare(b.code)).slice(0, 15);
  mkChart('cmpChart', {
    type: 'bar',
    data: {
      labels: data.map(d => d.code),
      datasets: [
        { label:'Submitted', data:data.map(d=>d.submit1), backgroundColor:'rgba(24,38,68,.18)', borderColor:'rgba(24,38,68,.45)', borderWidth:1, borderRadius:2 },
        { label:'Obtained',  data:data.map(d=>d.obtained), backgroundColor:'rgba(12,124,132,.8)', borderColor:'#0c7c84', borderWidth:0, borderRadius:2 },
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 8, right: 12, bottom: 4, left: 4 } },
      plugins: {
        legend: {
          position: 'bottom',
          align: 'start',
          labels: { font: { size: 10.5, family: 'DM Sans' }, color: '#4a5568', boxWidth: 10, padding: 16, usePointStyle: true }
        },
        tooltip: { mode:'index', intersect:false }
      },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:10,family:'DM Sans'},color:'#1a1f2e'} },
        y: { grid:{color:'#f1f5f9'}, ticks:{font:{size:10},color:'#64748b',callback:v=>v.toLocaleString(MT_LOCALE)+' MT'} }
      },
      onClick: (e, els) => { if (els.length) openDrawer(data[els[0].index].code); }
    }
  });
}

/* ══════════════════════════════════════════════════
   FLOW KPI STRIP — 6-step analytical summary
   ① Obtained → ② Utilized → ③ Realized → ④ Real% → ⑤ Remaining → ⑥ Re-Apply Target
══════════════════════════════════════════════════ */
function buildFlowKPIStrip() {
  const el = document.getElementById('utilFlowStrip');
  if (!el) return;

  const fRa = filteredRA();
  const arrived   = fRa.filter(r => r.cargoArrived);
  const inShip    = fRa.filter(r => !r.cargoArrived);

  /* ①②③⑤ come from the shared report totals — see their docblock in
     02-period-filter.js. This strip used to derive its own, and under a period
     filter it disagreed with the Overview card bearing the same label:
     utilized 13.600 vs 17.300 (it pooled filteredSPI() alone, dropping every
     company whose cargo landed in-window but whose PERTEK did not), and
     realized 11.395,405 vs 15.438,208 (it summed ra_records.berat instead of
     the PIB lines the report spec names). Team report 2026-08-05. */
  const _obtained      = reportObtainedTotal();
  const totalObtained  = _obtained.mt;
  const obtainedCoN    = _obtained.companies;
  const totalUtilized  = reportUtilizedTotal().mt;
  const _realized      = reportRealizedTotal();
  const totalRealized  = _realized.mt;
  const realizedCoN    = _realized.companies;
  // ④ Realization % (of obtained)
  const realPct = totalObtained > 0 ? (totalRealized / totalObtained * 100) : 0;
  /* ⑤ Remaining — the cumulative saldo, the same figure the Overview and
     Available Quota cards print. Its "Obtained − Utilized" subtitle stays
     literally true: that is how cumulativeAvailable() is defined. Deriving it
     here as (period obtained − period utilized) instead produced a third
     number for a concept the other two pages already agreed on. */
  const totalRemaining = reportAvailableTotal().mt;
  // ⑥ Target Re-Apply
  const totalTarget = fRa.reduce((s, r) => s + (r.target || 0), 0);
  // Eligible count
  const eligCount = arrived.filter(r => r.realPct >= 0.6).length;

  const steps = [
    /* Jumlah company harus datang dari angka yang SAMA dengan MT-nya. Dulu
       memakai fRa.length (baris RA), jadi 19.710 MT yang sama tertulis
       "18 companies" di Overview tapi "20 companies" di sini. */
    { num:'①', label:'Obtained Quota', val: fmtMt(totalObtained), unit:'MT', note:`${obtainedCoN} companies`, color:'var(--navy)', bg:'#eef2ff', border:'#c7d2fe' },
    { num:'②', label:'Utilized (In Shipment)', val: totalUtilized > 0 ? fmtMt(totalUtilized) : '—', unit: totalUtilized > 0 ? 'MT allocated' : 'pending', note: `${inShip.length} in transit`, color:'var(--blue)', bg:'var(--blue-bg)', border:'var(--blue-bd)' },
    { num:'③', label:'Realized', val: totalRealized > 0 ? totalRealized.toLocaleString(MT_LOCALE) : '—', unit: totalRealized > 0 ? 'MT arrived JKT' : 'none yet', note: `${realizedCoN} co. arrived`, color:'var(--green)', bg:'var(--green-bg)', border:'var(--green-bd)' },
    { num:'④', label:'Realization %', val: realPct.toFixed(1) + '%', unit: realPct >= 60 ? '≥ 60% threshold' : '< 60% threshold', note: `${eligCount} eligible co.`, color: realPct >= 60 ? 'var(--green)' : realPct >= 40 ? 'var(--amber)' : 'var(--red2)', bg: realPct >= 60 ? 'var(--green-bg)' : realPct >= 40 ? 'var(--amber-bg)' : 'var(--red-bg)', border: realPct >= 60 ? 'var(--green-bd)' : realPct >= 40 ? 'var(--amber-bd)' : 'var(--red-bd)' },
    /* Subjudulnya BUKAN "Obtained − Utilized" lagi. Itu benar secara definisi
       (cumulativeAvailable memang obtained − utilized sepanjang waktu), tapi
       pembaca yang mengurangkan kedua kartu di sebelahnya akan dapat
       19.710 − 17.300 = 2.410, bukan 11.693 — label yang mengundang salah
       hitung. Ini saldo kumulatif, sama dengan kartu Available di dua halaman
       lain. */
    { num:'⑤', label:'Remaining Quota', val: fmtMt(totalRemaining), unit:'MT unallocated', note:'Saldo kumulatif', color:'var(--teal)', bg:'var(--teal-bg)', border:'var(--teal-bd)' },
    { num:'⑥', label:'Target Re-Apply', val: totalTarget > 0 ? fmtMt(totalTarget) : '—', unit: totalTarget > 0 ? 'MT next cycle' : 'TBA', note:`${eligCount} eligible to apply`, color:'var(--amber)', bg:'var(--amber-bg)', border:'var(--amber-bd)' },
  ];

  const arrows = steps.map((s, i) => {
    const isLast = i === steps.length - 1;
    return `
    <div style="display:flex;align-items:stretch;flex:1;min-width:0">
      <div style="flex:1;padding:13px 14px 11px;border-right:${isLast?'none':'1px solid var(--border)'};position:relative">
        <div style="display:flex;align-items:center;gap:6px;margin-bottom:5px">
          <span style="font-size:13px;font-weight:900;color:${s.color};font-family:'DM Mono',monospace;line-height:1">${s.num}</span>
          <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--txt3)">${s.label}</span>
        </div>
        <div style="font-size:22px;font-weight:700;color:${s.color};line-height:1;margin-bottom:3px;font-variant-numeric:tabular-nums">${s.val}</div>
        <div style="font-size:9.5px;color:var(--txt3);margin-bottom:2px">${s.unit}</div>
        <div style="font-size:9px;font-weight:600;padding:1px 6px;border-radius:3px;background:${s.bg};color:${s.color};border:1px solid ${s.border};display:inline-block">${s.note}</div>
        ${!isLast ? `<div style="position:absolute;right:-10px;top:50%;transform:translateY(-50%);font-size:16px;color:var(--border2);z-index:1;font-weight:900">›</div>` : ''}
      </div>
    </div>`;
  }).join('');

  el.innerHTML = `
    <div style="display:flex;align-items:stretch;background:var(--surf);border:1px solid var(--border);border-radius:var(--r2);overflow:hidden;box-shadow:var(--sh)">
      ${arrows}
    </div>`;
}

function buildGauge() {
  const fRa = filteredRA(); // respects period filter
  /* Realized and Obtained come from the shared report totals, like every other
     surface. This gauge used to sum ra_records (berat / obtained) over arrived
     rows only, so under a period filter it printed a third "Realized MT" —
     the same divergence the team reported for the U&R strip on 2026-08-05. */
  const realized  = reportRealizedTotal().mt;
  const obtained  = reportObtainedTotal().mt;
  const remaining = obtained - realized;
  // Weighted avg realization (realized / obtained), not simple mean of realPct
  const avgReal   = obtained > 0 ? realized / obtained : 0;
  /* fmtMt, not a bare toLocaleString(undefined, …): passing undefined follows
     the BROWSER locale, so an id-ID machine rendered 15438.208 as "15.438" —
     precisely the bug 00-num.js's MT_LOCALE exists to prevent. */
  const rmt = document.getElementById('gaugeRealMT');
  if (rmt) rmt.textContent = fmtMt(realized);
  const remEl = document.getElementById('gaugeRemainMT');
  if (remEl) remEl.textContent = fmtMt(Math.max(0, remaining));
  const gPct = document.querySelector('.gauge-pct');
  if (gPct) gPct.textContent = (avgReal*100).toFixed(1) + '%';
  // Update stat boxes
  const sub  = fRa.filter(isReapplySubmitted).length;
  const elig = fRa.filter(isEligible).length;
  const inShip = fRa.filter(r => !r.cargoArrived).length;
  const below  = fRa.filter(r => r.cargoArrived && r.realPct < 0.6 && !isReapplySubmitted(r)).length;
  const gs = document.getElementById('gaugeSubmitted'); if (gs) gs.textContent = sub;
  const ge = document.getElementById('gaugeElig');      if (ge) ge.textContent = elig;
  const gt = document.getElementById('gaugeTransit');   if (gt) gt.textContent = inShip;
  const gb = document.getElementById('gaugeBelowThresh');if(gb) gb.textContent = below;
  mkChart('gaugeChart', {
    type: 'doughnut',
    data: { datasets: [{ data:[realized, Math.max(0,remaining)], backgroundColor:['#21c55d','#e2e8f0'], borderWidth:0, circumference:180, rotation:270 }] },
    options: { cutout:'72%', responsive:false, plugins:{legend:{display:false},tooltip:{enabled:false}} }
  });
}

function buildUtilChart() {
  // Skip when the Realization % chart canvas has been removed from the DOM.
  if (!document.getElementById('utilChart')) return;
  const sorted = [...filteredRA()].sort((a,b) => b.realPct - a.realPct);

  /* ── inject panel container once ── */
  const chartWrap = document.getElementById('utilChart').parentElement;
  let panel = document.getElementById('utilChartPanel');
  if (!panel) {
    panel = document.createElement('div');
    panel.id = 'utilChartPanel';
    panel.style.cssText = 'display:none;margin-top:8px;padding:10px 14px;background:var(--surf);border:1px solid var(--border2);border-radius:var(--r2);box-shadow:var(--sh);animation:fadeUp .15s ease';
    chartWrap.appendChild(panel);
  }

  function showUtilPanel(d) {
    const co   = getSPI(d.code);
    const rbp  = co ? (co.realizationByProd || {}) : {};
    const ubp  = co ? (co.utilizationByProd || {}) : {};
    const abp  = co ? (co.arrivedByProd     || {}) : {};
    const obtByProd = co ? getObtainedByProd(co) : {};
    const prods = co ? (co.products || []) : [d.product];

    /* status colour */
    const statusColor = isReapplySubmitted(d) ? '#7c3aed' : isEligible(d) ? 'var(--green)' : !d.cargoArrived ? 'var(--orange)' : 'var(--red2)';
    const statusLabel = isReapplySubmitted(d) ? '🔵 Re-Apply Submitted' : isEligible(d) ? '✅ Eligible' : !d.cargoArrived ? '🚢 In Shipment' : '❌ Below 60%';

    /* overall realization bar */
    const overallPct = (d.realPct * 100);
    const barFill    = isReapplySubmitted(d) ? '#8b5cf6' : isEligible(d) ? '#21c55d' : !d.cargoArrived ? '#f97316' : '#ef4444';

    /* per-product rows */
    const prodRows = prods.map(p => {
      const obt     = obtByProd[p] || 0;
      const util    = ubp[p]  != null ? ubp[p]  : 0;
      const arrived = abp[p]  != null ? abp[p]  : d.cargoArrived;
      let   real    = rbp[p]  != null ? rbp[p]  : (arrived ? (obt > 0 ? Math.round(d.berat*(obt/(d.obtained||1))*100)/100 : 0) : 0);
      const realPct = obt > 0 ? (real / obt * 100) : (arrived ? (d.realPct*100) : 0);
      const utilPct = obt > 0 ? (util / obt * 100) : 0;
      const pColor  = pc(p).solid;
      const pBg     = pc(p).light;

      /* bar color per product */
      const pBarCol = arrived
        ? (realPct >= 60 ? '#21c55d' : '#ef4444')
        : '#f97316';

      const statusTxt = arrived
        ? `${realPct.toFixed(1)}% Realization`
        : `${utilPct.toFixed(1)}% Utilization (In Shipment)`;

      return `
        <div style="display:flex;align-items:center;gap:10px;padding:6px 8px;border-radius:var(--r);background:${pBg}22;border:1px solid ${pColor}22;margin-bottom:4px">
          <div style="width:8px;height:8px;border-radius:2px;background:${pColor};flex-shrink:0"></div>
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:700;color:var(--txt);margin-bottom:3px">${p}</div>
            <div style="display:flex;align-items:center;gap:6px">
              <div style="flex:1;height:6px;background:var(--border);border-radius:3px;overflow:hidden">
                <div style="height:6px;background:${pBarCol};border-radius:3px;width:${Math.min(realPct||utilPct,100).toFixed(1)}%;transition:width .3s"></div>
              </div>
              <span style="font-size:10.5px;font-weight:700;color:${pBarCol};white-space:nowrap">${statusTxt}</span>
            </div>
            ${obt > 0 ? `<div style="font-size:9.5px;color:var(--txt3);margin-top:2px">${arrived ? `${real.toLocaleString(MT_LOCALE)} MT arrived` : `${util.toLocaleString(MT_LOCALE)} MT allocated`} · ${obt.toLocaleString(MT_LOCALE)} MT obtained</div>` : ''}
          </div>
        </div>`;
    }).join('');

    panel.style.display = 'block';
    panel.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
        <div style="display:flex;align-items:center;gap:8px">
          <span style="font-size:14px;font-weight:800;color:var(--navy)">${d.code}</span>
          <span style="font-size:10px;font-weight:700;padding:2px 8px;border-radius:3px;background:${barFill}20;color:${statusColor};border:1px solid ${barFill}40">${statusLabel}</span>
          <span style="font-size:11px;font-weight:700;color:${barFill};font-family:'DM Mono',monospace">${overallPct.toFixed(1)}% overall</span>
        </div>
        <button onclick="document.getElementById('utilChartPanel').style.display='none'" style="background:var(--border);border:none;border-radius:4px;width:22px;height:22px;cursor:pointer;font-size:12px;color:var(--txt3);display:flex;align-items:center;justify-content:center;flex-shrink:0">✕</button>
      </div>
      <div style="margin-bottom:6px">
        <div style="display:flex;align-items:center;gap:8px;margin-bottom:4px">
          <span style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--txt3)">Overall Realization</span>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div style="flex:1;height:8px;background:var(--border);border-radius:4px;overflow:hidden">
            <div style="height:8px;background:${barFill};border-radius:4px;width:${Math.min(overallPct,100).toFixed(1)}%;transition:width .4s"></div>
          </div>
          <span style="font-size:11px;font-weight:700;color:${barFill};font-family:'DM Mono',monospace;min-width:44px;text-align:right">${overallPct.toFixed(1)}%</span>
        </div>
        <div style="font-size:9.5px;color:var(--txt3);margin-top:3px">${d.berat.toLocaleString(MT_LOCALE)} MT ${d.cargoArrived ? 'arrived' : 'allocated'} · ${(d.obtained||0).toLocaleString(MT_LOCALE)} MT obtained · ETA: ${d.etaJKT||'—'}</div>
      </div>
      <div style="border-top:1px solid var(--border);padding-top:8px">
        <div style="font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.9px;color:var(--txt3);margin-bottom:6px">Products Breakdown</div>
        ${prodRows}
      </div>
      <div style="margin-top:8px;border-top:1px solid var(--border);padding-top:6px;display:flex;justify-content:flex-end">
        <button onclick="openDrawer('${d.code}')" style="font-size:10.5px;font-weight:600;padding:4px 12px;border-radius:var(--r);border:1px solid var(--blue-bd);background:var(--blue-bg);color:var(--blue);cursor:pointer">View Full Detail ↗</button>
      </div>`;
  }

  mkChart('utilChart', {
    type: 'bar',
    data: {
      labels: sorted.map(d => d.code),
      datasets: [
        { label:'Realization %', data:sorted.map(d => +(d.realPct*100).toFixed(1)),
          backgroundColor: sorted.map(d => isReapplySubmitted(d) ? '#8b5cf6' : isEligible(d) ? '#21c55d' : !d.cargoArrived ? '#f97316' : '#ef4444'), borderRadius:3, borderWidth:0 },
        { label:'60% Threshold', data:sorted.map(()=>60), type:'line',
          borderColor:'rgba(220,38,38,.6)', borderWidth:1.5, borderDash:[5,4],
          pointRadius:0, fill:false }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { top: 6, right: 12, bottom: 4, left: 4 } },
      plugins: {
        legend: {
          position: 'bottom',
          align: 'start',
          labels: { font: { size: 10.5, family: 'DM Sans' }, color: '#4a5568', boxWidth: 10, padding: 14, usePointStyle: true }
        },
        tooltip: {
          callbacks:{
            title: ctx => {
              if (ctx[0]?.dataset?.label === '60% Threshold') return null;
              const d = sorted[ctx[0].dataIndex];
              return `${d.code} · ${d.product}`;
            },
            label: ctx => {
              if (ctx.dataset.label === '60% Threshold') return null;
              const d = sorted[ctx.dataIndex];
              const co  = getSPI(d.code);
              const rbp = co ? (co.realizationByProd || {}) : {};
              const ubp = co ? (co.utilizationByProd || {}) : {};
              const abp = co ? (co.arrivedByProd     || {}) : {};
              const obtByProd = co ? getObtainedByProd(co) : {};
              const prods = co ? (co.products || [d.product]) : [d.product];
              const lines = [` Overall: ${ctx.parsed.y.toFixed(1)}% realization`];
              prods.forEach(p => {
                const obt  = obtByProd[p] || 0;
                const arrived = abp[p] != null ? abp[p] : d.cargoArrived;
                const real = rbp[p] != null ? rbp[p] : (arrived && obt > 0 ? Math.round(d.berat*(obt/(d.obtained||1))*100)/100 : 0);
                const util = ubp[p] != null ? ubp[p] : 0;
                const pct  = obt > 0 ? (arrived ? (real/obt*100) : (util/obt*100)) : (d.realPct*100);
                lines.push(` ${p}: ${pct.toFixed(1)}% ${arrived ? 'realized' : 'utilized'} (${arrived ? real.toLocaleString(MT_LOCALE) : util.toLocaleString(MT_LOCALE)} MT)`);
              });
              return lines;
            },
            afterBody: ctx => {
              if (ctx[0]?.dataset?.label === '60% Threshold') return null;
              return ['', ' ↗ Click bar to see full breakdown'];
            }
          }
        }
      },
      scales: {
        x: { grid:{display:false}, ticks:{font:{size:10,family:'DM Sans'},color:'#1a1f2e'} },
        y: { min:0, max:108, grid:{color:'#f1f5f9'}, ticks:{font:{size:10},color:'#64748b',callback:v=>v+'%'} }
      },
      onClick: (e, els) => {
        if (!els.length) return;
        const d = sorted[els[0].index];
        if (els[0].datasetIndex === 1) { openDrawer(d.code); return; }
        showUtilPanel(d);
      }
    }
  });
}