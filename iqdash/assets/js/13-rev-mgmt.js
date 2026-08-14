/* ═══════════════════════════════════════
   REVISION MANAGEMENT + saveEdit
   rrGetCategory, buildRevMgmtSection,
   rrSave/Approve/Cancel/Reopen, saveEdit
═══════════════════════════════════════ */

const RR_APPROVAL_STAGES = [
  'Submit',
  'Menunggu Disposisi Direktur',
  'Menunggu Disposisi Kasubdit',
  'Menunggu Disposisi Kasi',
  'Menunggu proses verifikasi oleh staff',
  'Menunggu Persetujuan Kasi',
  'Menunggu Persetujuan Kasubdit',
  'Menunggu Persetujuan Direktur',
  'Menunggu Persetujuan Dirjen',
  'Menunggu Keputusan Dirjen',
  'Pertek terbit',
  'Submit SPI',
  'Proses Pengiriman ke Inatrade',
  'Penerimaan Permohonan di Inatrade',
  'Verifikasi Permohonan',
  'Penelitian Pemprosesan Pendok',
  'Penelitian Ketua Tim',
  'Penelitian Direktur',
  'Penelitian Dirjen',
  'SPI Terbit',
];


/* Categorize a company record into one of four categories */
function rrGetCategory(co) {
  if (!co) return 'unknown';
  if (co.revType === 'active') {
    // Check for Submit #2 cycle OR salesRevReqType === 'Re-Apply'
    const hasSubmit2 = (co.cycles||[]).some(c => /^submit\s*#[2-9]/i.test(c.type));
    const salesType  = co.salesRevReqType || (() => {
      if (co.salesRevRequest && typeof co.salesRevRequest === 'object') {
        for (const v of Object.values(co.salesRevRequest)) {
          if (v && v.revisionType) return v.revisionType;
        }
      }
      return '';
    })();
    const isReapply = hasSubmit2 || salesType === 'Re-Apply';
    return isReapply ? 'submit2' : 'revision';
  }
  if (co.revType === 'complete') {
    // 'complete' BUT still has Obtained #2 without SPI → show edit form as 'complete_pending'
    const hasObt2WithoutSPI = (co.cycles||[]).some(c =>
      /^obtained\s*#[2-9]|^obtained.*revision/i.test(c.type) &&
      (!c.releaseDate || c.releaseDate === 'TBA')
    );
    return hasObt2WithoutSPI ? 'complete_pending' : 'complete';
  }
  return 'clean';
}

function rrCategoryLabel(cat) {
  switch (cat) {
    case 'submit2':          return { cls:'rr-cat-active',   ico:'🔄', txt:'Submit #2 / Additional — Awaiting Approval' };
    case 'revision':         return { cls:'rr-cat-active',   ico:'🔄', txt:'Revision Active — Awaiting Approval' };
    case 'complete':         return { cls:'rr-cat-complete',  ico:'✓',  txt:'Revision / Submit #2 — Approved & Complete' };
    case 'complete_pending': return { cls:'rr-cat-active',   ico:'⏳', txt:'Revision/Submit #2 Approved — SPI Belum Terbit' };
    default:                 return { cls:'rr-cat-clean',     ico:'✅', txt:'Completed — SPI Active' };
  }
}

/* Get the latest non-obtained cycle (active or pending) */
function rrGetActiveCycle(co) {
  const ac = (co && co.cycles) || [];
  // Prefer last Submit #N or Revision #N cycle
  const submitCycles = ac.filter(c =>
    /^(submit\s*#[2-9]|revision\s*#\d)/i.test(c.type)
  );
  return submitCycles[submitCycles.length - 1] || null;
}

/* ════════════════════════════════════════════════════════════════════════
   Siklus Obtained yang SEDANG dicatat oleh form ini.

   BUG YANG DIPERBAIKI (ditemukan 2026-08-12 dari kasus CGK): ketiga penulis di
   berkas ini — rrApplyObtained(), rrMarkApproved(), rrSaveStatus() — mencari
   siklus sasarannya dengan

       (co.cycles||[]).find(c => /^obtained\s*#2/i.test(c.type) || …)

   yaitu SELALU "Obtained #2", berapa pun nomor pengajuan yang sedang dicatat.
   Lalu `mt` dan `products`-nya ditimpa. Akibatnya, begitu sebuah company
   mengajukan re-apply KETIGA, pencatatannya MENIMPA catatan re-apply KEDUA —
   datanya hilang, bukan bertambah.

   Persis itu yang terjadi pada CGK. Master mencatat:
       Submit #2 2.200 (PERTEK Perubahan 17/04/26) → Obtained #2 220 MT GI ALLOY
                                                     (SPI Perubahan 29/04/26)
       Submit #3 3.000                            → Obtained #3 300 MT GL ALLOY
   Di dashboard, Obtained #2 milik GI ALLOY 220 MT sudah tertimpa menjadi
   "300 MT GL ALLOY" tanpa tanggal — sehingga 220 MT itu lenyap dari cycles
   (tinggal tersisa di stats, dan itulah drift 220 MT yang tercium
   __auditObtained()).

   Nomor siklusnya kini diturunkan dari pengajuan yang SEDANG berjalan:
   Submit #N → "Obtained #N", Revision #N → "Obtained (Revision #N)". Kalau
   pengajuannya tidak terbaca, dipakai nomor obtained tertinggi + 1 — menambah,
   tidak pernah menimpa.
   ═══════════════════════════════════════════════════════════════════════ */
function rrObtainedTypeFor(co) {
  const act = rrGetActiveCycle(co);
  const m = String((act && act.type) || '').match(/^(submit|revision)\s*#?\s*(\d+)/i);
  if (m) return /^revision$/i.test(m[1]) ? `Obtained (Revision #${m[2]})` : `Obtained #${m[2]}`;
  // Tidak terbaca — ambil nomor berikutnya yang belum dipakai (minimal #2).
  let maks = 1;
  (co.cycles || []).forEach(c => {
    const mm = String(c.type || '').match(/^obtained\s*(?:\(revision\s*)?#?\s*(\d+)/i);
    if (mm) maks = Math.max(maks, +mm[1]);
  });
  return `Obtained #${maks + 1}`;
}

/* Siklus Obtained sasaran form, dibuat bila belum ada. Dicocokkan TEPAT dengan
   tipenya — bukan pola longgar /^obtained #2/ yang menyeret siklus lain. */
function rrFindOrCreateObtained(co, seed) {
  const tipe = rrObtainedTypeFor(co);
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!co.cycles) co.cycles = [];
  let cy = co.cycles.find(c => norm(c.type) === norm(tipe));
  if (!cy) {
    cy = Object.assign({
      type: tipe, mt: null, products: {},
      submitType: 'Submit MOT (Submit #2) Perubahan', submitDate: 'TBA',
      releaseType: 'SPI Perubahan', releaseDate: 'TBA', status: '', _fromRevReq: true,
    }, seed || {});
    cy.type = tipe;
    co.cycles.push(cy);
  }
  return cy;
}

/* ════════════════════════════════════════════════════════════════════════
   KONFIRMASI CORPSEC PER PRODUK TUJUAN

   Diminta tim 2026-08-13. Sales merevisi SATU produk asal menjadi BEBERAPA
   produk tujuan — IKM: Sheet Pile 1.750 MT → CRC Alloy 500 + GL Alloy 1.355 +
   GL Carbon 120 + PPGL Carbon 600. Panel CorpSec hanya menampilkan SATU kolom
   konfirmasi berisi 500 MT, yaitu MT target PERTAMA, sehingga tiga target
   lainnya tidak bisa dikonfirmasi sama sekali.

   Sebabnya `salesRevRequest[produkAsal]` hanya punya satu `confirmedMT` — satu
   angka untuk berapa pun jumlah targetnya. Yang dibutuhkan: satu baris
   konfirmasi PER TARGET, dengan nama dan qty persis seperti yang diajukan
   Sales, dan bisa dikonfirmasi/dibatalkan sendiri-sendiri.

   Bentuk datanya:
     req.targetProducts   = [{product, mt}]           ← dari Sales, tidak diubah
     req.confirmedTargets = [{product, mt, status}]   ← BARU, sejajar indeksnya
     req.confirmedMT      = Σ mt target yang confirmed ← tetap ada demi pembaca
                                                        lama (tabel SPI, drawer,
                                                        form edit, shipment)
     req.status           = pending bila masih ada yang menunggu; confirmed bila
                            ada yang disetujui dan tak ada yang menunggu;
                            selain itu rejected.
   ═══════════════════════════════════════════════════════════════════════ */
function rrTargets(req, sourceProd) {
  if (req && Array.isArray(req.targetProducts) && req.targetProducts.length) return req.targetProducts;
  if (req && req.newProduct) return [{ product: req.newProduct, mt: req.requestedMT }];
  // "— Tetap sama —": produknya tidak berubah, hanya tonasenya.
  return [{ product: sourceProd, mt: req ? req.requestedMT : null }];
}

/* Keadaan tiap target: qty yang DIMINTA Sales + qty & status KONFIRMASI. */
function rrTargetState(req, sourceProd) {
  const t  = rrTargets(req, sourceProd);
  const ct = Array.isArray(req.confirmedTargets) ? req.confirmedTargets : [];
  return t.map((x, i) => {
    const simpan = ct[i] || {};
    return {
      product:   x.product || sourceProd,
      requested: x.mt,
      mt:        simpan.mt != null ? simpan.mt : x.mt,
      status:    simpan.status || 'pending',
    };
  });
}

/* Simpan kembali keadaan target + turunkan status & confirmedMT tingkat
   request. Dipanggil setiap kali satu target dikonfirmasi/dibatalkan. */
function rrSyncReqStatus(req, sourceProd, state) {
  const st = state || rrTargetState(req, sourceProd);
  req.confirmedTargets = st.map(s => ({ product: s.product, mt: s.mt, status: s.status }));
  const adaPending = st.some(s => s.status === 'pending');
  const adaConf    = st.some(s => s.status === 'confirmed');
  req.status = adaPending ? 'pending' : (adaConf ? 'confirmed' : 'rejected');
  req.confirmedMT = adaConf
    ? st.filter(s => s.status === 'confirmed').reduce((a, s) => a + (Number(s.mt) || 0), 0)
    : null;
  return st;
}

/* Bangun ulang siklus + revFrom/revTo dari target yang SUDAH dikonfirmasi.
   Dipisah dari csConfirmRev supaya konfirmasi dan pembatalan per target
   menghasilkan keadaan yang sama — dulu logika ini hanya ada di jalur
   konfirmasi, jadi membatalkan satu target tidak pernah memperbarui siklusnya. */
function rrRebuildFromConfirmed(co, prod, req) {
  if (!co.cycles) co.cycles = [];
  co.cycles = co.cycles.filter(c => !(c.type === `Revision Request — ${prod}`));
  if (!co.revFrom) co.revFrom = [];
  if (!co.revTo)   co.revTo   = [];
  const st  = rrTargetState(req, prod);
  const oke = st.filter(s => s.status === 'confirmed');

  co.revFrom = co.revFrom.filter(f => f.prod !== prod);
  co.revTo   = co.revTo.filter(f => !st.some(s => s.product === f.prod));

  if (!oke.length) {                       // semua target dibatalkan
    if (!co.revFrom.length && !co.revTo.length) { co.revType = 'none'; co.revStatus = ''; }
    return;
  }

  const total   = oke.reduce((a, s) => a + (Number(s.mt) || 0), 0);
  const prodObj = {};
  oke.forEach(s => { if (s.product) prodObj[s.product] = (prodObj[s.product] || 0) + (Number(s.mt) || 0); });
  const now = (typeof todayStd === 'function') ? todayStd()
            : new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}).replace(/ /g,'-');

  co.cycles.push({
    type:        `Revision Request — ${prod}`,
    mt:          total,
    products:    prodObj,
    submitType:  'Sales Request',
    submitDate:  req.confirmedDate || now,
    releaseType: 'CorpSec Confirmation',
    releaseDate: now,
    status:      `✅ Dikonfirmasi oleh ${req.confirmedBy || currentRole || 'CorpSec'} · ${req.confirmedDate || now}`
                 + ` · ${oke.length} dari ${st.length} produk${req.note ? ' · ' + req.note : ''}`,
    _isRevReq:   true,
  });

  const obtMap = (typeof getObtainedByProd === 'function') ? getObtainedByProd(co) : {};
  co.revFrom.push({ prod, mt: obtMap[prod] != null ? obtMap[prod] : (co.obtained || 0), label: 'Before' });
  oke.forEach(s => co.revTo.push({ prod: s.product, mt: Number(s.mt) || 0, label: 'After' }));

  co.revType   = 'active';
  co.revStatus = `Revision Request dikonfirmasi — ${prod} → `
               + oke.map(s => `${s.product} ${Number(s.mt).toLocaleString(MT_LOCALE)} MT`).join(' + ')
               + ` · ${now}`;
  if (!co.revNote) co.revNote = req.note || '';
}

/* ════════════════════════════════════════════════════════════════════════
   NEW SUBMISSION — pengajuan pertama perusahaan TANPA riwayat

   Diminta tim 2026-08-14, kasus SUJU. Panel "Revision Request ke CorpSec"
   dibangun dari produk yang SUDAH obtained, jadi perusahaan baru tidak punya
   satu baris pun untuk ditumpangi permintaannya — panelnya berhenti di "No
   products found." dan Sales tidak bisa mengajukan apa-apa.

   Alurnya, persis seperti yang diminta:
     New Company → Sales pilih Produk & MT → Konfirmasi CorpSec
       → Submit #N → Active Application (New Submission) → Total Submitted

   Bentuk datanya sengaja SEJAJAR dengan salesRevRequest supaya konfirmasi
   per produk memakai mesin yang sama (rrSyncReqStatus):
     co.newSubmission = {
       products:         [{product, mt}],           ← dari Sales, tidak diubah
       confirmedTargets: [{product, mt, status}],   ← sejajar indeksnya
       confirmedMT:      Σ mt yang confirmed
       status:           pending | confirmed | rejected
       cycleType:        "Submit #N" — siklus yang DIKELOLA blok ini
       note, requestedBy, requestedDate, confirmedBy, confirmedDate
     }

   Yang MEMBUAT angkanya jalan hanyalah siklus `Submit #N` yang ditulis
   nsRebuildFromConfirmed(): reportSubmittedTotal() menjumlahkan siklus itu
   (bertanggal Submit MOI), dan outstandingStage() melihatnya menggantung tanpa
   Obtained pasangannya. Tidak ada satu pun angka yang dihitung ulang di sini.
   ═══════════════════════════════════════════════════════════════════════ */
function nsRequest(co) {
  const r = co && co.newSubmission;
  return (r && Array.isArray(r.products) && r.products.length) ? r : null;
}

/* Keadaan tiap produk: qty yang DIAJUKAN Sales + qty & status KONFIRMASI.
   Pasangan dari rrTargetState() untuk permintaan yang tidak punya produk asal. */
function nsTargetState(req) {
  const t  = (req && Array.isArray(req.products)) ? req.products : [];
  const ct = (req && Array.isArray(req.confirmedTargets)) ? req.confirmedTargets : [];
  return t.map((x, i) => {
    const simpan = ct[i] || {};
    return {
      product:   (x && x.product) || '',
      requested: x ? x.mt : null,
      mt:        simpan.mt != null ? simpan.mt : (x ? x.mt : null),
      status:    simpan.status || 'pending',
    };
  });
}

/* Siklus yang dikelola blok ini. Nomornya dikunci di `req.cycleType` begitu
   dikonfirmasi — flag di objek siklus tidak ikut tersimpan ke server, jadi
   sesudah reload hanya field inilah yang tahu siklus mana miliknya. */
function nsCycleType(co, req) {
  if (req && req.cycleType) return req.cycleType;
  let maks = 0;
  (co.cycles || []).forEach(c => {
    const m = String((c && c.type) || '').match(/^submit\s*#?\s*(\d+)/i);
    if (m) maks = Math.max(maks, +m[1]);
  });
  return `Submit #${maks + 1}`;
}

/* Bangun ulang siklus Submit dari produk yang SUDAH dikonfirmasi. Sama seperti
   rrRebuildFromConfirmed: konfirmasi dan pembatalan lewat jalur yang sama,
   sehingga membatalkan satu produk juga memperbarui siklusnya. */
function nsRebuildFromConfirmed(co) {
  const req = nsRequest(co);
  if (!req) return;
  if (!co.cycles) co.cycles = [];
  const norm = s => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
  const tipe = nsCycleType(co, req);
  co.cycles = co.cycles.filter(c => !(c && (c._fromNewSubmission || norm(c.type) === norm(tipe))));

  const st  = nsTargetState(req);
  const oke = st.filter(s => s.status === 'confirmed' && Number(s.mt) > 0);
  if (!oke.length) {                       // semua ditolak / dibatalkan
    delete req.cycleType;
    if (co.revStatus === 'Submit') co.revStatus = '';
    return;
  }

  const kanon   = p => (typeof canonicalProduct === 'function') ? canonicalProduct(String(p||'').trim()) : String(p||'').trim();
  const total   = oke.reduce((a, s) => a + (Number(s.mt) || 0), 0);
  const prodObj = {};
  oke.forEach(s => { const p = kanon(s.product); if (p) prodObj[p] = (prodObj[p] || 0) + (Number(s.mt) || 0); });
  const now = req.confirmedDate || ((typeof todayStd === 'function') ? todayStd()
            : new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}).replace(/ /g,'-'));

  req.cycleType = tipe;
  co.cycles.push({
    type:        tipe,
    mt:          total,
    products:    prodObj,
    submitType:  'Submit MOI',
    submitDate:  now,
    /* PERTEK belum terbit — justru itu yang membuat perusahaan ini tampil di
       Active Application sebagai New Submission (outstandingStage). */
    releaseType: 'PERTEK',
    releaseDate: 'TBA',
    status:      `✅ New Submission dikonfirmasi ${req.confirmedBy || currentRole || 'CorpSec'} · ${now}`
                 + ` · ${oke.length} dari ${st.length} produk${req.note ? ' · ' + req.note : ''}`,
    _fromNewSubmission: true,
  });

  /* Produk perusahaan ikut tercatat — tanpa ini setiap kolom per-produk
     (shipment, stats, dropdown) tidak mengenali produk yang baru diajukan. */
  co.products = [...new Set([...(co.products || []).map(kanon), ...Object.keys(prodObj)])].filter(Boolean);
  co.submit1  = (typeof canonicalSubmitted === 'function') ? canonicalSubmitted(co) : total;
  co.revStatus = 'Submit';
  if (!co.revSubmitDate) co.revSubmitDate = now;
}

/* CorpSec: konfirmasi SATU produk. Tanpa `ti` seluruh produk ikut. */
function nsConfirm(code, ti) {
  const co = getSPI(code) || (typeof PENDING !== 'undefined' && PENDING.find(p => p.code === code));
  const req = co && nsRequest(co);
  if (!req) return;

  const st  = nsTargetState(req);
  const idx = (ti == null) ? null : Number(ti);
  const baca = n => {
    const el = document.getElementById('nsconf-mt-' + n);
    if (!el) return null;
    const raw = String(el.value || '').replace(/,/g, '').trim();
    if (raw === '') return null;
    const v = parseFloat(raw);
    return isNaN(v) ? null : v;
  };

  (idx == null ? st.map((_, n) => n) : [idx]).forEach(n => {
    if (!st[n]) return;
    const v = baca(n);
    st[n].mt     = v != null ? v : (st[n].mt != null ? st[n].mt : st[n].requested);
    st[n].status = 'confirmed';
  });

  req.confirmedDate = (typeof todayStd === 'function') ? todayStd()
    : new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}).replace(/ /g,'-');
  req.confirmedBy = currentRole || 'CorpSec';
  rrSyncReqStatus(req, null, st);
  nsRebuildFromConfirmed(co);
  nsAfterDecision(co);
}

/* CorpSec: batalkan SATU produk. Produk lain tidak terpengaruh. */
function nsBatal(code, ti) {
  const co = getSPI(code) || (typeof PENDING !== 'undefined' && PENDING.find(p => p.code === code));
  const req = co && nsRequest(co);
  if (!req) return;

  const st  = nsTargetState(req);
  const idx = (ti == null) ? null : Number(ti);
  (idx == null ? st.map((_, n) => n) : [idx]).forEach(n => { if (st[n]) st[n].status = 'rejected'; });

  rrSyncReqStatus(req, null, st);
  nsRebuildFromConfirmed(co);
  nsAfterDecision(co);
}

/* Simpan + gambar ulang. Siklus WAJIB ikut dikirim (patchCyclesToServer) —
   patchToServer tidak membawa cycles, jadi tanpa ini Submit #N hilang begitu
   halaman dimuat ulang dan Total Submitted kembali ke angka lama. */
function nsAfterDecision(co) {
  if (typeof buildRevMgmtSection === 'function') buildRevMgmtSection(co);
  if (typeof applyRolePermissions === 'function') applyRolePermissions();
  if (typeof buildRevList === 'function') buildRevList();
  if (typeof updateSPICounts === 'function') updateSPICounts();
  if (typeof saveToStorage === 'function') saveToStorage();
  if (typeof patchToServer === 'function')
    patchToServer(co).catch(err => notifySaveError('nsConfirm', err));
  if (typeof patchCyclesToServer === 'function')
    patchCyclesToServer(co).catch(err => notifySaveError('nsConfirm/cycles', err));

  /* Angka headline berubah begitu siklus Submit lahir — segarkan permukaan
     yang membacanya, sama seperti penutup saveEdit(). */
  ['renderSPI', 'renderMain', 'buildRevDetailTable', 'buildFlowKPIStrip',
   'buildPipeline', 'updateOverviewStats', 'updateOverviewKPIs']
    .forEach(fn => {
      const f = (typeof globalThis !== 'undefined') ? globalThis[fn] : null;
      if (typeof f === 'function') f();
    });
}

/* "WELDED STAINLESS STEEL PIPE 325 MT + FABRICATED STEEL PAINTED FRAME 75 MT"
   — every target of a gated PERTEK Perubahan split, in one line. Falls back to
   the flat to/mt pair when the payload carries no `targets` list. */
function prTargets(pr) {
  return (pr && pr.targets && pr.targets.length) ? pr.targets : [{ to: pr.to, mt: pr.mt }];
}
function prTargetText(pr) {
  return prTargets(pr)
    .map(t => `${t.to} ${Number(t.mt).toLocaleString(MT_LOCALE)} MT`)
    .join(' + ');
}

/* Build the full Revision & Re-Apply panel */
function buildRevMgmtSection(co) {
  const el = g('revMgmtBody');
  if (!el) return;
  if (!co) { el.innerHTML = '<div class="rr-no-active">Select a company above.</div>'; return; }

  const code = co.code;
  const cat  = rrGetCategory(co);
  const catL = rrCategoryLabel(cat);
  const ra   = getRA(code);
  const ac   = co.cycles || [];
  const activeCycle = rrGetActiveCycle(co);

  // ── 1. Category badge ──────────────────────────────────────────────────
  let html = `<div class="rr-cat-badge ${catL.cls}">${catL.ico} ${catL.txt}</div>`;

  // ── 2. Summary stats row ───────────────────────────────────────────────
  const cycleCount = ac.length;
  const latestObt  = ac.filter(c => /^obtained/i.test(c.type)).pop();
  const obtMT      = latestObt ? (typeof latestObt.mt === 'number' ? latestObt.mt.toLocaleString(MT_LOCALE) + ' MT' : 'TBA') : '—';
  const realPct    = ra ? (ra.realPct * 100).toFixed(1) + '%' : '—';
  html += `<div class="rr-status-grid">
    <div class="rr-stat-box"><div class="rr-stat-val" style="color:var(--teal)">${obtMT}</div><div class="rr-stat-lbl">Obtained #1</div></div>
    <div class="rr-stat-box"><div class="rr-stat-val" style="color:${ra ? (ra.realPct>=.6?'var(--green)':'var(--red2)') : 'var(--txt3)'}">${realPct}</div><div class="rr-stat-lbl">Realization</div></div>
    <div class="rr-stat-box"><div class="rr-stat-val" style="color:var(--blue)">${cycleCount}</div><div class="rr-stat-lbl">Total Cycles</div></div>
  </div>`;

  // ── 2a. New Submission panel (perusahaan tanpa riwayat) ────────────────
  const nsReq = nsRequest(co);
  if (nsReq) {
    const canConfirmNS = currentRole && (ROLE_PERMISSIONS[currentRole]||[]).includes('corpsecRevConfirm');
    const nsSt   = nsTargetState(nsReq);
    const nsTot  = nsSt.reduce((a, s) => a + (Number(s.requested) || 0), 0);
    const nsConf = nsSt.filter(s => s.status === 'confirmed').reduce((a, s) => a + (Number(s.mt) || 0), 0);
    const lencana = st => st === 'confirmed'
      ? `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)">✅ Dikonfirmasi</span>`
      : st === 'rejected'
      ? `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--red-bg);color:var(--red2);border:1px solid var(--red-bd)">✕ Dibatalkan</span>`
      : `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-bd)">⏳ Menunggu</span>`;

    const nsRows = nsSt.map((s, ti) => {
      const nilai = s.mt != null ? Number(s.mt).toLocaleString(MT_LOCALE) : '';
      const minta = s.requested != null ? Number(s.requested).toLocaleString(MT_LOCALE) + ' MT' : '—';
      const aksi = canConfirmNS
        ? `<div style="display:flex;align-items:center;gap:5px;flex-wrap:nowrap">
             <input type="text" inputmode="numeric" class="pmt-mt-inp newsub-confirm-inp"
               data-target="${ti}" id="nsconf-mt-${ti}" value="${nilai}" placeholder="Qty (MT)"
               oninput="fmtThousandInline(this)"
               style="width:90px;font-size:11.5px;padding:3px 7px;border:1px solid var(--border2);border-radius:5px;text-align:right">
             <button onclick="nsConfirm('${code}',${ti})"
               style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;
                 background:${s.status==='confirmed'?'#16a34a':'var(--green)'};color:#fff">✓</button>
             <button onclick="nsBatal('${code}',${ti})"
               style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:1px solid var(--red-bd);
                 cursor:pointer;background:${s.status==='rejected'?'#fecaca':'var(--red-bg)'};color:var(--red2)">✕</button>
           </div>`
        : lencana(s.status);
      return `<tr style="border-bottom:1px solid var(--border)">
        <td style="padding:8px 10px">
          <div class="pmt-prod-chip">
            <div class="pmt-prod-dot" style="background:${prodDot(s.product)}"></div>
            <span style="font-weight:700">${prodLabel(s.product)}</span>
          </div>
        </td>
        <td style="padding:8px 10px;text-align:right">
          <span style="font-weight:700;color:var(--amber);font-family:'DM Mono',monospace">${minta}</span>
        </td>
        <td style="padding:8px 10px">${lencana(s.status)}</td>
        <td style="padding:8px 10px">${aksi}</td>
      </tr>`;
    }).join('');

    html += `<div id="newSubConfirmWrap" style="margin-bottom:12px;padding:12px;background:var(--blue-bg);border:1px solid var(--blue-bd);border-radius:8px">
      <div style="font-size:11px;font-weight:700;color:var(--navy);margin-bottom:4px;display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        🆕 New Submission — pengajuan pertama
        <span style="font-size:9.5px;font-weight:600;padding:1px 6px;background:var(--blue);color:#fff;border-radius:3px">${nsSt.length} produk</span>
        <span style="font-size:9.5px;font-weight:600;padding:1px 6px;background:var(--amber);color:#fff;border-radius:3px">${nsTot.toLocaleString(MT_LOCALE)} MT diminta</span>
        ${nsConf > 0 ? `<span style="font-size:9.5px;font-weight:600;padding:1px 6px;background:var(--green);color:#fff;border-radius:3px">${nsConf.toLocaleString(MT_LOCALE)} MT dikonfirmasi</span>` : ''}
        ${!canConfirmNS ? '<span style="font-size:9.5px;color:var(--txt3)">🔒 CorpSec / Super Admin only</span>' : ''}
      </div>
      <div style="font-size:10px;color:var(--txt3);margin-bottom:8px">
        Diajukan ${nsReq.requestedBy || 'Sales'}${nsReq.requestedDate ? ' · ' + nsReq.requestedDate : ''}
        ${nsReq.note ? ` · 💬 <em>${nsReq.note}</em>` : ''}
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden;border:1px solid var(--border)">
        <thead>
          <tr style="background:var(--bg2)">
            <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3)">Produk</th>
            <th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3);width:110px">Qty Diminta</th>
            <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3);width:110px">Status</th>
            <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3)">Aksi CorpSec</th>
          </tr>
        </thead>
        <tbody>${nsRows}</tbody>
      </table>
      <div style="margin-top:8px;font-size:10px;color:var(--txt3)">
        Konfirmasi membuat siklus <strong>${nsCycleType(co, nsReq)}</strong> — MT-nya langsung masuk Total Submitted
        dan perusahaan ini muncul di Active Application sebagai <strong>New Submission</strong> sampai PERTEK terbit.
      </div>
    </div>`;
  }

  // ── 2b. Sales Revision Request panel (CorpSec read + confirm) ───────────
  const salesRevReq = co.salesRevRequest || {};
  const reqProds = Object.entries(salesRevReq).filter(([,v]) => v && v.requested);

  if (reqProds.length > 0) {
    const canConfirm = currentRole && (ROLE_PERMISSIONS[currentRole]||[]).includes('corpsecRevConfirm');

    let reqRows = reqProds.map(([prod, req], _ri) => {
      const dot      = prodDot(prod);
      const pid      = prod.replace(/[^a-zA-Z0-9]/g,'_') + '_cs' + _ri;
      const reqMT    = req.requestedMT != null ? req.requestedMT.toLocaleString(MT_LOCALE) + ' MT' : '—';
      // Support split: show all target products
      const targets  = req.targetProducts && req.targetProducts.length
                     ? req.targetProducts
                     : (req.newProduct ? [{ product: req.newProduct, mt: req.requestedMT }] : []);
      const newP     = targets.length > 0 && targets.some(t => t.product)
        ? targets.map(t => t.product ? ` → <strong style="color:var(--blue)">${prodLabel(t.product)}</strong>${t.mt ? ` <span style="font-size:9.5px;color:var(--txt3)">(${Number(t.mt).toLocaleString(MT_LOCALE)} MT)</span>` : ''}` : '').filter(Boolean).join(', ')
        : '';
      const note     = req.note || '';
      const isConf   = req.status === 'confirmed';
      const isBatal  = req.status === 'rejected';
      const tState   = rrTargetState(req, prod);   // satu entri per produk tujuan

      // Status badge
      const statusBadge = isConf
        ? `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--green-bg);color:var(--green);border:1px solid var(--green-bd)">✅ Dikonfirmasi</span>`
        : isBatal
        ? `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--red-bg);color:var(--red2);border:1px solid var(--red-bd)">✕ Dibatalkan</span>`
        : `<span style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:3px;background:var(--amber-bg);color:var(--amber);border:1px solid var(--amber-bd)">⏳ Menunggu</span>`;

      /* SATU baris konfirmasi per produk tujuan — bukan satu untuk semuanya.
         Sebelumnya seluruh target diringkas jadi satu input berisi MT target
         pertama saja (IKM: 500 MT dari empat target). */
      const actionArea = canConfirm
        ? tState.map((s, ti) => {
            const sudah = s.status === 'confirmed', batal = s.status === 'rejected';
            const nilai = s.mt != null ? Number(s.mt).toLocaleString(MT_LOCALE) : '';
            const tanda = sudah
              ? `<span style="font-size:9px;font-weight:700;color:var(--green)">✅</span>`
              : batal
              ? `<span style="font-size:9px;font-weight:700;color:var(--red2)">✕</span>`
              : `<span style="font-size:9px;font-weight:700;color:var(--amber)">⏳</span>`;
            return `<div style="display:flex;align-items:center;gap:5px;flex-wrap:nowrap;margin-bottom:4px">
              ${tanda}
              <span style="font-size:10px;font-weight:700;min-width:104px;color:var(--txt2)"
                    title="${s.product}">${prodLabel(s.product)}</span>
              <input type="text" inputmode="numeric"
                class="pmt-mt-inp corpsec-revconfirm-inp"
                data-prod="${prod}" data-target="${ti}" id="csconf-mt-${pid}-${ti}"
                value="${nilai}" placeholder="Qty (MT)"
                oninput="fmtThousandInline(this)"
                style="width:84px;font-size:11.5px;padding:3px 7px;border:1px solid var(--border2);border-radius:5px;text-align:right">
              <button onclick="csConfirmRev('${prod}','${pid}','${code}',${ti})"
                style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:none;cursor:pointer;
                  background:${sudah?'#16a34a':'var(--green)'};color:#fff">✓</button>
              <button onclick="csBatalRev('${prod}','${pid}','${code}',${ti})"
                style="font-size:10px;font-weight:700;padding:3px 8px;border-radius:5px;border:1px solid var(--red-bd);
                  cursor:pointer;background:${batal?'#fecaca':'var(--red-bg)'};color:var(--red2)">✕</button>
            </div>`;
          }).join('')
        : `<div>${statusBadge}</div>`;

      return `<tr style="border-bottom:1px solid var(--border);padding:6px 0">
        <td style="padding:8px 10px">
          <div class="pmt-prod-chip">
            <div class="pmt-prod-dot" style="background:${dot}"></div>
            <span style="font-weight:700">${prodLabel(prod)}</span>
          </div>
          ${newP ? `<div style="font-size:10px;color:var(--txt3);margin-top:2px">${newP}</div>` : ''}
          ${note ? `<div style="font-size:9.5px;color:var(--txt3);margin-top:2px;font-style:italic">💬 ${note}</div>` : ''}
        </td>
        <td style="padding:8px 10px;text-align:right;vertical-align:top">
          ${targets.length > 1
            ? targets.map(t => `<div style="font-size:10px;color:var(--amber);font-family:'DM Mono',monospace;white-space:nowrap">
                ${t.product?prodLabel(t.product):'(sama)'}: <strong>${t.mt!=null?Number(t.mt).toLocaleString(MT_LOCALE):'—'} MT</strong>
              </div>`).join('')
            : `<span style="font-weight:700;color:var(--amber);font-family:'DM Mono',monospace">${reqMT}</span>`
          }
        </td>
        <td style="padding:8px 10px">${statusBadge}</td>
        <td style="padding:8px 10px">${actionArea}</td>
      </tr>`;
    }).join('');

    html += `<div id="corpsecRevConfirmWrap" style="margin-bottom:12px;padding:12px;background:var(--amber-bg);border:1px solid var(--amber-bd);border-radius:8px">
      <div style="font-size:11px;font-weight:700;color:var(--amber);margin-bottom:10px;display:flex;align-items:center;gap:6px">
        📋 Sales Revision Request
        <span style="font-size:9.5px;font-weight:600;padding:1px 6px;background:var(--amber);color:#fff;border-radius:3px">${reqProds.length} produk</span>
        ${!canConfirm
          ? '<span style="font-size:9.5px;color:var(--amber);opacity:.7">🔒 CorpSec / Super Admin only</span>'
          : '<span style="font-size:9.5px;color:var(--green)">✏️ Konfirmasi per produk</span>'}
      </div>
      <table style="width:100%;border-collapse:collapse;background:#fff;border-radius:6px;overflow:hidden;border:1px solid var(--border)">
        <thead>
          <tr style="background:var(--bg2)">
            <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3)">Produk</th>
            <th style="padding:7px 10px;text-align:right;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3);width:110px">Qty Diminta</th>
            <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3);width:110px">Status</th>
            <th style="padding:7px 10px;text-align:left;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--txt3)">Aksi CorpSec</th>
          </tr>
        </thead>
        <tbody>${reqRows}</tbody>
      </table>
      <div style="margin-top:8px;font-size:10px;color:var(--txt3)">
        <span class="tti" data-tip="Input qty konfirmasi (pre-filled dari request Sales), lalu klik Konfirmasi atau Batal per produk. Hasil tersimpan saat klik Save &amp; Refresh.">i</span>
      </div>
    </div>`;
  } else if (!nsReq) {
    html += `<div style="margin-bottom:10px;padding:8px 12px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;font-size:10.5px;color:var(--txt3)">
      📋 <em>Belum ada Revision Request dari Sales.</em> CorpSec tidak dapat input revision sampai Sales mengajukan request.
    </div>`;
  }

  // ── 3. Cycle timeline ──────────────────────────────────────────────────
  html += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:var(--txt3);margin-bottom:6px">Cycle History</div>`;
  html += `<div class="rr-cycle-timeline">`;
  ac.forEach(c => {
    const isActive   = (c === activeCycle);
    const isObtained = /^obtained/i.test(c.type);
    const isTBA      = c.releaseDate === 'TBA' || !c.releaseDate;
    let rowCls = '';
    if (isActive) rowCls = 'active-cycle';
    else if (isObtained && !isTBA) rowCls = 'complete-cycle';
    else if (isObtained && isTBA)  rowCls = 'pending-cycle';

    const dotColor = rowCls === 'active-cycle'   ? 'var(--amber-lt)'
                   : rowCls === 'complete-cycle' ? 'var(--green-lt)'
                   : rowCls === 'pending-cycle'  ? '#93c5fd'
                   : 'var(--border2)';

    const prodStr = c.products
      ? Object.entries(c.products).map(([p,m]) => `${p}: ${typeof m==='number'?m.toLocaleString(MT_LOCALE):m} MT`).join(' · ')
      : '—';

    // Detect if this Obtained #2 is TBA/empty — offer quick-fill button
    const isObt2TBA = /^obtained #2/i.test(c.type) && (c.mt == null || c.mt === 0 || c.mt === 'TBA');
    const mtDisp = (c.mt != null && c.mt !== 'TBA' && c.mt > 0)
      ? `<strong style="color:var(--teal)">${Number(c.mt).toLocaleString(MT_LOCALE)} MT</strong>`
      : `<span style="color:var(--txt3);font-style:italic">TBA MT</span>`;

    // Build per-product MT display
    const prodLines = c.products && Object.keys(c.products).length
      ? Object.entries(c.products).map(([p,m]) => {
          const dotC = (typeof prodDot==='function') ? prodDot(p) : '#94a3b8';
          const safeM = (!isNaN(Number(m)) && Number(m) > 0) ? Number(m).toLocaleString(MT_LOCALE) + ' MT' : 'TBA';
          return `<span style="display:inline-flex;align-items:center;gap:3px;margin-right:8px">
            <span style="width:6px;height:6px;border-radius:2px;background:${dotC};display:inline-block"></span>
            <span style="font-size:10px">${p}: <strong>${safeM}</strong></span></span>`;
        }).join('')
      : mtDisp;

    // PERTEK/SPI date display
    const pertekDateDisp = c.pertekDate ? ` · PERTEK: <strong>${fmtDateStd(c.pertekDate)}</strong>` : '';
    const spiDateDisp    = c.spiDate    ? ` · SPI: <strong>${fmtDateStd(c.spiDate)}</strong>`       : '';

    html += `<div class="rr-cycle-row ${rowCls}" style="position:relative">
      <div class="rr-cycle-dot" style="background:${dotColor}"></div>
      <div class="rr-cycle-body">
        <div style="display:flex;align-items:center;justify-content:space-between;gap:8px">
          <div class="rr-cycle-type">${canonProdInText(c.type)}${isActive ? ' <span style="font-size:9px;font-weight:700;padding:1px 5px;background:var(--amber-lt);color:#fff;border-radius:3px;margin-left:4px">ACTIVE</span>' : ''}</div>
          ${isObt2TBA ? `<button onclick="document.getElementById('rrObtTotal')?.scrollIntoView({behavior:'smooth',block:'center'}); document.querySelector('.rr-obt-prod-inp')?.focus()"
            style="font-size:9.5px;font-weight:700;padding:2px 8px;border-radius:4px;border:1px solid var(--teal-bd);background:var(--teal-bg);color:var(--teal);cursor:pointer;white-space:nowrap;flex-shrink:0">
            ✏️ Isi Obtained MT
          </button>` : ''}
        </div>
        <div class="rr-cycle-meta" style="margin-top:3px;flex-wrap:wrap">${prodLines}</div>
        <div class="rr-cycle-meta" style="margin-top:2px">
          ${c.submitType||'Submit'}: <strong>${c.submitDate==='TBA'?'TBA':(fmtDateStd(c.submitDate)||'TBA')}</strong> &nbsp;·&nbsp;
          ${c.releaseType||'Release'}: <strong>${c.releaseDate==='TBA'?'TBA':(fmtDateStd(c.releaseDate)||'TBA')}</strong>${pertekDateDisp}${spiDateDisp}
        </div>
        ${c.status ? `<div class="rr-cycle-status">${c.status}</div>` : ''}
      </div>
    </div>`;
  });
  html += `</div>`;

  // ── 4. Editable fields for active revision / Submit #2 ─────────────────
  if (cat === 'revision' || cat === 'submit2' || cat === 'complete_pending') {
    const stageVal  = co.revStatus || '';
    const dateVal   = co.revSubmitDate || '';
    const noteVal   = co.revNote || '';

    // Product change summary from revFrom/revTo
    let changeHtml = '';
    if (co.revFrom && co.revFrom.length) {
      changeHtml = `<div style="margin-bottom:10px">
        <div class="fl" style="margin-bottom:5px">Product Change (From → To)</div>
        <div style="display:flex;flex-direction:column;gap:4px">`;
      co.revFrom.forEach((f, i) => {
        const t = (co.revTo || [])[i] || {};
        changeHtml += `<div style="display:flex;align-items:center;gap:6px;font-size:11.5px">
          <span style="padding:2px 8px;background:var(--bg);border:1px solid var(--border);border-radius:3px;font-weight:600">${prodLabel(f.prod)} — ${(f.mt||'').toLocaleString ? (typeof f.mt==='number'?f.mt.toLocaleString(MT_LOCALE):f.mt) : f.mt} MT</span>
          <span style="color:var(--txt3)">→</span>
          <span style="padding:2px 8px;background:var(--green-bg);border:1px solid var(--green-bd);border-radius:3px;font-weight:700;color:var(--green)">${t.prod?prodLabel(t.prod):'?'} — ${(typeof t.mt==='number'?t.mt.toLocaleString(MT_LOCALE):t.mt)||'TBA'} MT</span>
        </div>`;
      });
      changeHtml += `</div></div>`;
    }

    const stageOpts = RR_APPROVAL_STAGES.map(s =>
      `<option value="${s}" ${s===stageVal?'selected':''}>${s}</option>`
    ).join('');

    // Build per-product obtained input rows from ALL confirmed salesRevRequest targets
    // This accumulates across multiple confirmed products (e.g. 2 ERW products)
    let prodList = [];
    const salesRevReq2 = co.salesRevRequest || {};
    Object.entries(salesRevReq2).filter(([,v]) => v && v.requested).forEach(([p, req]) => {
      const targets = req.targetProducts && req.targetProducts.length
        ? req.targetProducts
        : [{ product: req.newProduct || p, mt: req.confirmedMT || req.requestedMT || null }];
      targets.forEach(t => {
        const nm = t.product || p;
        if (nm && !prodList.find(x => x.prod === nm)) {
          prodList.push({ prod: nm, mt: t.mt || req.confirmedMT || req.requestedMT || null });
        }
      });
    });
    // Fallback to revTo if salesRevRequest empty
    if (!prodList.length && co.revTo && co.revTo.length) {
      prodList = co.revTo;
    }

    // Load existing obtained #2 cycle values for pre-fill
    /* Baca siklus yang SAMA dengan yang akan ditulis form ini, kalau tidak
       form menampilkan angka siklus lain daripada yang akan ditimpanya. */
    const _tipeObt = (typeof rrObtainedTypeFor === 'function') ? rrObtainedTypeFor(co) : 'Obtained #2';
    const _nrm = v => String(v || '').toLowerCase().replace(/\s+/g, ' ').trim();
    const obt2Cy = (co.cycles || []).find(c => _nrm(c.type) === _nrm(_tipeObt));
    const obt2Prods = obt2Cy ? (obt2Cy.products || {}) : {};
    const obt2MT    = obt2Cy ? obt2Cy.mt : null;
    // Document NUMBERS come from co.spiNo / co.pertekNo — the company-level
    // fields that have always been their real home. They used to be read back
    // out of cycle.releaseDate, which is why the save path wrote them there
    // and clobbered the terbit date. Dates come from the dedicated
    // spi_date / pertek_date columns, with releaseDate as fallback for rows
    // written before this split (only when it actually parses as a date —
    // legacy rows may still hold a number there).
    const _dateOr = (dedicated, release) => {
      const d = String(dedicated || '').trim();
      if (d && d !== 'TBA') return d;
      const r = String(release || '').trim();
      return (r && r !== 'TBA' && typeof pDate === 'function' && pDate(r)) ? r : '';
    };
    const obt2SPI   = co.spiNo || '';
    const obt2SpiDate = obt2Cy ? _dateOr(obt2Cy.spiDate, obt2Cy.releaseDate) : '';
    const obt2PERTEK= (co.cycles||[]).find(c => /^(submit\s*#2|revision\s*#)/i.test(c.type));
    const pertekVal = co.pertekNo || '';
    const pertekDateVal = obt2PERTEK
      ? _dateOr(obt2PERTEK.pertekDate, obt2PERTEK.releaseDate)
      : (co.pertekDate || '');

    // Per-product obtained MT inputs
    let obtainedHtml = '';
    if (prodList.length > 0) {
      const prodRows = prodList.map((t, i) => {
        const prodName = t.prod || t.product || '';
        // Pre-fill: existing Obtained #2 value if valid → revTo.mt → empty
        const existRaw = obt2Prods[prodName];
        const existParsed = parseFloat(String(existRaw).replace(/,/g,''));
        const revToMT = (t.mt != null && !isNaN(Number(t.mt)) && Number(t.mt) > 0) ? Number(t.mt) : null;
        const existNum = (!isNaN(existParsed) && existParsed > 0)
          ? existParsed
          : revToMT;
        const existVal = existNum != null ? existNum.toLocaleString(MT_LOCALE) : '';
        const dotColor = (typeof prodDot === 'function') ? prodDot(prodName) : '#94a3b8';
        const dot = `<span style="display:inline-block;width:7px;height:7px;border-radius:2px;background:${dotColor};margin-right:5px;vertical-align:middle;flex-shrink:0"></span>`;
        return `<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">
          <div style="flex:1;font-size:11px;font-weight:600;color:var(--txt);display:flex;align-items:center">${dot}${prodName}</div>
          <input type="text" inputmode="decimal" class="fi rr-obt-prod-inp" data-prod="${prodName}"
            value="${existVal}" placeholder="e.g. 2,200"
            oninput="fmtThousandInline(this);rrUpdateObtTotal()"
            style="width:120px;text-align:right;font-family:'DM Mono',monospace;font-size:12px;font-weight:700">
        </div>`;
      }).join('');
      // Compute initial total for display
      const initTotal = prodList.reduce((s, t) => {
        const prodName = t.prod || t.product || '';
        const raw = obt2Prods[prodName];
        const parsed = parseFloat(String(raw).replace(/,/g,''));
        const revToMT2 = (t.mt != null && !isNaN(Number(t.mt)) && Number(t.mt) > 0) ? Number(t.mt) : 0;
        const v = (!isNaN(parsed) && parsed > 0) ? parsed : revToMT2;
        return s + v;
      }, 0);
      const initTotalDisp = initTotal > 0 ? initTotal.toLocaleString(MT_LOCALE) + ' MT' : '—';

      obtainedHtml = `<div style="margin-bottom:12px;padding:10px;background:var(--teal-bg);border:1px solid var(--teal-bd);border-radius:7px">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
          <div class="fl" style="color:var(--teal);margin-bottom:0">Obtained MT — Per Produk
            <span class="tti" data-tip="Isi Obtained MT yang resmi diterbitkan dalam PERTEK/SPI revision ini. Pre-filled dari revisi request — edit sesuai dokumen resmi.">i</span>
          </div>
          <div style="display:flex;gap:6px;flex-shrink:0">
            <button onclick="rrApplyObtained('${code}')"
              title="Simpan nilai Obtained #2 ke cycle (belum dihitung sebagai kuota baru)"
              style="font-size:10.5px;font-weight:700;padding:4px 12px;border-radius:5px;border:none;
                background:var(--teal);color:#fff;cursor:pointer;transition:background .13s;white-space:nowrap"
              onmouseover="this.style.background='#0a6670'" onmouseout="this.style.background='var(--teal)'">
              ✓ Terapkan
            </button>
            <button onclick="rrRecordObtainedTerbit('${code}')"
              title="Catat sebagai Obtained TERBIT (kuota baru) → otomatis masuk Total Obtained (overview) + Available"
              style="font-size:10.5px;font-weight:700;padding:4px 12px;border-radius:5px;border:1px solid var(--teal-bd);
                background:#fff;color:var(--teal);cursor:pointer;white-space:nowrap">
              📌 Catat Terbit
            </button>
          </div>
        </div>
        ${prodRows}
        <div style="display:flex;justify-content:flex-end;margin-top:6px;font-size:10px;color:var(--txt3);gap:4px;align-items:center">
          Total: <strong id="rrObtTotal" style="color:var(--teal);font-family:'DM Mono',monospace">${initTotalDisp}</strong>
        </div>
      </div>`;
    } else {
      // No product breakdown — single MT field
      const singleVal = (obt2MT != null && !isNaN(Number(obt2MT))) ? Number(obt2MT).toLocaleString(MT_LOCALE) : '';
      obtainedHtml = `<div style="margin-bottom:12px;padding:10px;background:var(--teal-bg);border:1px solid var(--teal-bd);border-radius:7px">
        <div class="fl" style="color:var(--teal);margin-bottom:8px">Obtained MT (Total)</div>
        <input type="text" inputmode="decimal" class="fi rr-obt-prod-inp" data-prod="_total"
          value="${singleVal}" placeholder="MT"
          oninput="fmtThousandInline(this)"
          style="width:130px;text-align:right;font-family:'DM Mono',monospace;font-size:12px">
      </div>`;
    }

    html += `<div class="rr-edit-area">
      <div class="rr-edit-hd">✏️ Update Revision / Submit #2 Status</div>
      ${changeHtml}
      ${obtainedHtml}
      <div class="rr-form-row">
        <div>
          <div class="fl">Approval Stage</div>
          <select class="fi" id="rrApprovalStage" onchange="rrUpdateObtTotal()">${stageOpts}</select>
        </div>
        <div>
          <div class="fl">Rev. Submit Date</div>
          <input class="fi" id="rrRevDate" type="text" placeholder="DD/MM/YYYY" value="${dateVal}">
        </div>
      </div>
      <div class="rr-form-row">
        <div>
          <div class="fl">PERTEK No. (Revision)</div>
          <input class="fi" id="rrRevPertekNo" type="text" placeholder="e.g. 601/ILMATE/PERTEK-SPI-P/II/2026" value="${pertekVal && pertekVal !== 'TBA' ? pertekVal : ''}">
        </div>
        <div>
          <div class="fl">PERTEK Terbit Date</div>
          <input class="fi" id="rrRevPertekDate" type="text" placeholder="DD/MM/YYYY" value="${pertekDateVal && pertekDateVal !== 'TBA' ? pertekDateVal : ''}">
        </div>
      </div>
      <div class="rr-form-row">
        <div>
          <div class="fl">SPI No. (Revision)</div>
          <input class="fi" id="rrRevSpiNo" type="text" placeholder="e.g. 04.SPI-05.26.1624" value="${obt2SPI && obt2SPI !== 'TBA' ? obt2SPI : ''}">
        </div>
        <div>
          <div class="fl">SPI Terbit Date</div>
          <input class="fi" id="rrRevSpiDate" type="text" placeholder="DD/MM/YYYY" value="${obt2SpiDate && obt2SpiDate !== 'TBA' ? obt2SpiDate : ''}">
        </div>
      </div>
      <div class="rr-form-row full">
        <div>
          <div class="fl">Status Note <span class="tti" data-tip="Internal — ditampilkan di Revision table">i</span></div>
          <input class="fi" id="rrStatusNote" type="text" placeholder="e.g. Update 06/03/26 — Awaiting ministry sign-off" value="${noteVal.replace(/"/g,'&quot;')}">
        </div>
      </div>
      <div class="rr-action-row">
        <button class="btn-rev-approve" onclick="rrMarkApproved('${code}')">✓ Mark Approved (Complete)</button>
        <button class="btn-rev-cancel" onclick="rrCancelRevision('${code}')">✕ Cancel Revision</button>
        <button class="btn btn-s" onclick="rrSaveStatus('${code}')" style="margin-left:auto">💾 Save Status Update</button>
      </div>
    </div>`;
  } else if (cat === 'complete') {
    html += `<div class="notice n-green" style="margin-bottom:10px;font-size:11.5px">
      <strong>✓ Revision/Submit #2 approved.</strong> Status: ${co.revStatus||'Complete'}.<br>
      Products and MT have been updated per the approved revision.
    </div>
    <div style="display:flex;gap:7px">
      <button class="btn btn-s btn-p" onclick="rrReopenRevision('${code}')" style="font-size:11px">🔄 Re-open Revision</button>
    </div>`;
  } else {
    html += `<div class="rr-no-active" style="padding:10px 0">✅ No active revision for this company. Use <strong>+ Add New Submission</strong> above to start a new cycle.</div>`;
  }

  // -- PERTEK Perubahan gate — original PERTEK shown until terbit date entered --
  // A split can have several targets (GIS: SHEET PILE 400 -> WELDED 325 +
  // FABRICATED 75), so read `targets`; `to`/`mt` are the first target, kept
  // for older payloads that predate the list.
  if (co._pendingRevision) {
    const pr = co._pendingRevision;
    html += `<div class="notice" style="margin-top:10px;padding:10px;border:1px solid #d9a441;background:#fff8e6;border-radius:6px">
      <div style="font-weight:700;color:#8a5a00;font-size:11.5px">⏳ PERTEK Perubahan belum terbit</div>
      <div style="font-size:11px;color:var(--txt3);margin:4px 0">
        Menampilkan PERTEK asal: <strong>${pr.from} ${Number(pr.origMT).toLocaleString(MT_LOCALE)} MT</strong>.
        Split ke <strong>${prTargetText(pr)}</strong> akan tampil setelah tanggal terbit diisi.
      </div>
      <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">
        <input class="fi" id="ppReleaseDate_${code}" type="text" placeholder="DD/MM/YYYY" style="max-width:130px">
        <button class="btn btn-s btn-p" onclick="rrSavePertekPerubahan('${code}')">💾 Simpan Tanggal Terbit PERTEK Perubahan</button>
      </div>
    </div>`;
  }



  el.innerHTML = html;
}

/* ── CorpSec: confirm / reject individual revision request items ── */
/* Konfirmasi SATU produk tujuan. `ti` = indeks target dalam
   req.targetProducts. Tanpa `ti` (pemanggil lama) seluruh target ikut
   dikonfirmasi, supaya perilaku lama tidak mendadak berubah. */
function csConfirmRev(prod, pid, code, ti) {
  const co = getSPI(code); if (!co) return;
  const req = co.salesRevRequest && co.salesRevRequest[prod];
  if (!req) return;

  const st = rrTargetState(req, prod);
  const idx = (ti == null) ? null : Number(ti);

  const bacaInput = n => {
    const el = document.getElementById('csconf-mt-' + pid + '-' + n);
    if (!el) return null;
    const raw = String(el.value || '').replace(/,/g, '').trim();
    if (raw === '') return null;
    const v = parseFloat(raw);
    return isNaN(v) ? null : v;
  };

  const kena = idx == null ? st.map((_, n) => n) : [idx];
  kena.forEach(n => {
    if (!st[n]) return;
    const v = bacaInput(n);
    st[n].mt     = v != null ? v : (st[n].mt != null ? st[n].mt : st[n].requested);
    st[n].status = 'confirmed';
  });

  req.confirmedDate = (typeof todayStd === 'function') ? todayStd()
    : new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}).replace(/ /g,'-');
  req.confirmedBy = currentRole || 'CorpSec';
  rrSyncReqStatus(req, prod, st);
  rrRebuildFromConfirmed(co, prod, req);

  buildRevMgmtSection(co);
  applyRolePermissions();
  buildRevList && buildRevList();
  updateSPICounts && updateSPICounts();
  saveToStorage();
  patchToServer(co).catch(err => notifySaveError('csConfirmRev', err));
}

/* Batalkan SATU produk tujuan. Target lain tidak ikut terpengaruh — dulu
   pembatalan menghapus seluruh siklus request, sehingga target yang sudah
   dikonfirmasi ikut hilang. */
function csBatalRev(prod, pid, code, ti) {
  const co = getSPI(code); if (!co) return;
  const req = co.salesRevRequest && co.salesRevRequest[prod];
  if (!req) return;

  const st = rrTargetState(req, prod);
  const idx = (ti == null) ? null : Number(ti);
  (idx == null ? st.map((_, n) => n) : [idx]).forEach(n => {
    if (st[n]) st[n].status = 'rejected';
  });

  rrSyncReqStatus(req, prod, st);
  rrRebuildFromConfirmed(co, prod, req);

  buildRevMgmtSection(co);
  applyRolePermissions();
  buildRevList && buildRevList();
  updateSPICounts && updateSPICounts();
  saveToStorage();
  patchToServer(co).catch(err => notifySaveError('csBatalRev', err));
}


/* ── Action handlers ─────────────────────────────────────────────────────── */

/* Save approval stage + date + note to the live record */

/* ── Read obtained MT from revision edit form ── */
function rrReadObtainedFromForm(co) {
  const inputs = document.querySelectorAll('.rr-obt-prod-inp');
  if (!inputs.length) return { total: null, byProd: {} };
  const byProd = {};
  let total = 0;
  inputs.forEach(inp => {
    const prod = inp.dataset.prod;
    const raw  = (inp.value || '').replace(/,/g,'').trim();
    const val  = parseFloat(raw);
    const safeVal = (!isNaN(val) && val > 0) ? val : 0;
    if (prod === '_total') {
      total = safeVal;
    } else if (prod && safeVal > 0) {
      byProd[prod] = safeVal;
      total += safeVal;
    }
  });
  return { total, byProd };
}

/* ── Apply obtained MT values directly to Obtained #2 cycle ── */
function rrApplyObtained(code) {
  const co = getSPI(code); if (!co) return;
  const { total: obtTotal, byProd: obtByProd } = rrReadObtainedFromForm(co);

  if (obtTotal <= 0 && !Object.keys(obtByProd).length) {
    alert('Isi Obtained MT terlebih dahulu sebelum menerapkan.'); return;
  }

  /* Siklus sasaran diturunkan dari pengajuan yang SEDANG berjalan — lihat
     rrObtainedTypeFor(). Dulu selalu "Obtained #2", sehingga pencatatan
     re-apply KETIGA menimpa catatan re-apply KEDUA (kasus CGK). */
  const obt2Cy = rrFindOrCreateObtained(co);

  obt2Cy.mt       = obtTotal;
  obt2Cy.products = obtByProd;
  const spiNoVal   = (g('rrRevSpiNo')    || {}).value || '';
  const spiDateVal = (g('rrRevSpiDate')  || {}).value || '';
  const pkNoVal    = (g('rrRevPertekNo') || {}).value || '';
  const pkDateVal  = (g('rrRevPertekDate')|| {}).value || '';
  // The document NUMBER goes to co.spiNo / co.pertekNo; the cycle's
  // releaseDate gets the DATE. Writing the number into releaseDate (what
  // this used to do) is what put strings like
  // "04.PI-05.26.0450.1" into cycles.release_date — the filter reads that
  // column with pDate(), so those cycles fell out of every period. See
  // cycleTerbitDate() in 02-period-filter.js for the read-side workaround
  // this removes the need for.
  if (spiNoVal)   { co.spiNo = spiNoVal; }
  if (spiDateVal) { obt2Cy.spiDate = spiDateVal; obt2Cy.releaseDate = spiDateVal; co.spiDate = spiDateVal; }
  if (pkNoVal)    { co.pertekNo = pkNoVal; }
  if (pkDateVal)  { co.pertekDate = pkDateVal; }
  obt2Cy.status = `${obt2Cy.type} — ${obtTotal.toLocaleString(MT_LOCALE)} MT${spiNoVal ? ' · SPI: ' + spiNoVal : ''}${spiDateVal ? ' · ' + spiDateVal : ''}`;
  co.revMT = obtTotal;

  // Visual feedback on button
  const btn = document.querySelector(`button[onclick="rrApplyObtained('${code}')"]`);
  if (btn) {
    const orig = btn.textContent;
    btn.textContent = '✓ Diterapkan!';
    btn.style.background = 'var(--green)';
    setTimeout(() => { if(btn){ btn.textContent = orig; btn.style.background = 'var(--teal)'; } }, 1800);
  }

  // Refresh cycle history panel
  buildRevMgmtSection(co);

  // Persist to localStorage + server
  saveToStorage();
  patchToServer(co).catch(err => notifySaveError('rrApplyObtained', err));

  nsShowToast(`✓ Obtained #2 updated — ${obtTotal.toLocaleString(MT_LOCALE)} MT`);
}

/* ── Record obtained as TERBIT new quota ──────────────────────────────
   Unlike rrApplyObtained (which only writes the cycle, flagged as a
   revision artifact), this calls POST /record-obtained so the obtained
   counts in the overview KPI AND lands in Available — no manual fix-up.
   Idempotent server-side; safe to re-run. */
async function rrRecordObtainedTerbit(code) {
  const co = getSPI(code); if (!co) return;
  const { byProd } = rrReadObtainedFromForm(co);
  const prods = Object.entries(byProd).filter(([, mt]) => Number(mt) > 0);
  if (!prods.length) { alert('Isi Obtained MT per produk dulu sebelum mencatat terbit.'); return; }
  let terbit = ((g('rrRevSpiDate') || {}).value || '').trim();
  if (!terbit) terbit = (prompt('Tanggal SPI terbit untuk Obtained ini (DD/MM/YYYY):') || '').trim();
  if (!terbit) return;
  if (!confirm(`Catat sebagai Obtained TERBIT (kuota baru) — ${code}\n` +
      prods.map(([p, m]) => `• ${p}: ${Number(m).toLocaleString(MT_LOCALE)} MT`).join('\n') +
      `\nTerbit: ${terbit}\n\nAkan masuk ke Total Obtained (overview) + Available.`)) return;
  try {
    for (const [product, mt] of prods) {
      const res = await fetch(`api/company/${encodeURIComponent(code)}/record-obtained`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cycleType: 'Obtained #2', product, mt: Number(mt), terbitDate: terbit, updatedBy: co.updatedBy || '' }),
      });
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + res.status)); }
    }
    if (typeof nsShowToast === 'function') nsShowToast(`✓ ${code} — Obtained terbit dicatat · Total Obtained & Available diperbarui`);
    if (typeof loadData === 'function') await loadData();
    const co2 = getSPI(code) || co;
    if (typeof buildRevMgmtSection === 'function') buildRevMgmtSection(co2);
  } catch (err) {
    alert('Gagal mencatat Obtained terbit: ' + (err && err.message ? err.message : err));
  }
}

/* -- Record PERTEK Perubahan terbit date -> un-gate the split -- */
async function rrSavePertekPerubahan(code) {
  const co = getSPI(code); if (!co) return;
  const pr = co._pendingRevision; if (!pr) return;
  const input = g('ppReleaseDate_' + code);
  const releaseDate = ((input || {}).value || '').trim();
  if (!releaseDate) { alert('Isi Tanggal Terbit PERTEK Perubahan dulu (DD/MM/YYYY).'); return; }
  const targetText = prTargetText(pr);
  const targetNames = prTargets(pr).map(t => t.to).join(' + ');
  if (!confirm(`Catat PERTEK Perubahan TERBIT — ${code}\n` +
      `${pr.from} → ${targetText}\n` +
      `Terbit: ${releaseDate}\n\nSetelah ini split ${targetNames} akan tampil di dashboard.`)) return;
  try {
    const res = await fetch(`api/company/${encodeURIComponent(code)}/pertek-perubahan-release`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ releaseDate, updatedBy: co.updatedBy || '' }),
    });
    if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || ('HTTP ' + res.status)); }
    if (typeof nsShowToast === 'function') nsShowToast(`✓ ${code} — PERTEK Perubahan terbit ${releaseDate} · split ${targetNames} kini tampil`);
    if (typeof loadData === 'function') await loadData();
    const co2 = getSPI(code) || co;
    if (typeof buildRevMgmtSection === 'function') buildRevMgmtSection(co2);
  } catch (err) {
    alert('Gagal menyimpan tanggal terbit PERTEK Perubahan: ' + (err && err.message ? err.message : err));
  }
}

/* ── Update obtained total display ── */
function rrUpdateObtTotal() {
  const el = document.getElementById('rrObtTotal');
  if (!el) return;
  let t = 0;
  document.querySelectorAll('.rr-obt-prod-inp').forEach(inp => {
    t += parseFloat(inp.value.replace(/,/g,'')) || 0;
  });
  el.textContent = t > 0 ? t.toLocaleString(MT_LOCALE) + ' MT' : '—';
}

function rrSaveStatus(code) {
  const co     = getSPI(code); if (!co) return;
  const stage  = (g('rrApprovalStage') || {}).value || '';
  const date   = (g('rrRevDate')       || {}).value || '';
  const note   = (g('rrStatusNote')    || {}).value || '';
  const pertekNo   = (g('rrRevPertekNo')   || {}).value || '';
  const pertekDate = (g('rrRevPertekDate') || {}).value || '';
  const spiNo      = (g('rrRevSpiNo')      || {}).value || '';
  const spiDate    = (g('rrRevSpiDate')    || {}).value || '';
  const { total: obtTotal, byProd: obtByProd } = rrReadObtainedFromForm(co);

  co.revStatus = stage;
  if (date)      co.revSubmitDate = date;
  if (note) {
    co.revNote     = note;
    // Sync to statusUpdate so it shows in PERTEK & SPI main table "STATUS UPDATE" column
    co.statusUpdate = note;
  }
  if (pertekNo)  co.pertekNo  = pertekNo;
  if (pertekDate)co.pertekDate = pertekDate;
  if (spiNo)     co.spiNo     = spiNo;

  // Update / create the Obtained #2 cycle with new MT values
  const dateStr = new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'2-digit'});
  // Sasaran mengikuti pengajuan yang berjalan — lihat rrObtainedTypeFor().
  const obt2Cy = rrFindOrCreateObtained(co);
  if (obtTotal > 0) { obt2Cy.mt = obtTotal; co.revMT = obtTotal; }
  if (Object.keys(obtByProd).length) obt2Cy.products = obtByProd;
  // Number → co.spiNo (set above); DATE → the cycle's date columns. See
  // rrApplyObtained() for why releaseDate must never hold the document No.
  if (spiDate)  { obt2Cy.spiDate = spiDate; obt2Cy.releaseDate = spiDate; }

  // Update active Submit #2 / Revision cycle with PERTEK no + date
  const activeCy = rrGetActiveCycle(co);
  if (activeCy) {
    activeCy.status = `Update ${dateStr} - ${stage}`;
    if (pertekDate) { activeCy.pertekDate = pertekDate; activeCy.releaseDate = pertekDate; }
  }

  _refreshAfterRREdit();
  buildRevMgmtSection(co);
  saveToStorage();
  patchToServer(co).catch(err => notifySaveError('rrSaveStatus', err));
  nsShowToast(`✓ ${code} revision status updated`);
}

/* Mark revision as fully approved — sets revType to 'complete' */
function rrMarkApproved(code) {
  const co     = getSPI(code); if (!co) return;
  const stage  = (g('rrApprovalStage') || {}).value || '';
  const date   = (g('rrRevDate')       || {}).value || '';
  const pertekNo   = (g('rrRevPertekNo')   || {}).value || '';
  const pertekDate = (g('rrRevPertekDate') || {}).value || '';
  const spiNo      = (g('rrRevSpiNo')      || {}).value || '';
  const spiDate    = (g('rrRevSpiDate')    || {}).value || '';
  const { total: obtTotal, byProd: obtByProd } = rrReadObtainedFromForm(co);

  co.revType   = 'complete';
  co.revStatus = spiNo
    ? `SPI Perubahan Terbit — No. ${spiNo}`
    : (pertekNo ? `PERTEK Perubahan Terbit — No. ${pertekNo}` : `APPROVED — ${stage}`);

  // Update active Submit #2 / Revision cycle.
  // The PERTEK No. lives on co.pertekNo (set below) — releaseDate carries the
  // DATE, so this cycle stays visible to the period filter. See
  // rrApplyObtained() for the full rationale.
  const activeCy = rrGetActiveCycle(co);
  if (activeCy) {
    activeCy.status = `APPROVED — ${stage}`;
  }

  // Sasaran mengikuti pengajuan yang berjalan — lihat rrObtainedTypeFor().
  const obt2Cy = rrFindOrCreateObtained(co,
    { submitDate: date || 'TBA', releaseDate: spiDate || 'TBA', spiDate: spiDate || '' });
  if (obtTotal > 0) {
    obt2Cy.mt   = obtTotal;
    co.revMT    = obtTotal;
    // Update co.obtained to reflect new total (revision approved)
    co.obtained = (co.obtained || 0) - (co.revMT || 0) + obtTotal;
  }
  if (Object.keys(obtByProd).length) obt2Cy.products = obtByProd;
  if (spiNo) {
    co.spiNo = spiNo;
    obt2Cy.status = `SPI Perubahan TERBIT — No. ${spiNo}${spiDate ? ' · ' + spiDate : ''}`;
  } else if (pertekNo) {
    obt2Cy.status = `PERTEK Perubahan TERBIT — No. ${pertekNo}${pertekDate ? ' · ' + pertekDate : ''} · SPI TBA`;
  }
  if (pertekNo)   { co.pertekNo = pertekNo; }
  if (pertekDate) {
    co.pertekDate = pertekDate;
    if (activeCy) { activeCy.pertekDate = pertekDate; activeCy.releaseDate = pertekDate; }
  }
  if (spiDate)    { co.spiDate = spiDate; obt2Cy.spiDate = spiDate; obt2Cy.releaseDate = spiDate; }

  _refreshAfterRREdit();
  buildRevMgmtSection(co);
  saveToStorage();
  patchToServer(co).catch(err => notifySaveError('rrMarkApproved', err));
  nsShowToast(`✓ ${code} revision marked as approved/complete`);
}

/* Cancel revision — revert to clean SPI, keep only Submit #1 + Obtained #1 */
function rrCancelRevision(code) {
  const co = getSPI(code); if (!co) return;
  if (!confirm(`Cancel the active revision for ${code}? The original obtained products will be preserved and the revision cycle removed.`)) return;

  // Keep only Submit #1 and Obtained #1 cycles (remove any Revision/Submit #2 cycles)
  co.cycles = (co.cycles || []).filter(c =>
    /^(submit\s*#1|obtained\s*#1)$/i.test(c.type.trim())
  );
  // Update Obtained #1 status to note the cancellation
  const obt1 = co.cycles.find(c => /^obtained\s*#1$/i.test(c.type.trim()));
  if (obt1) obt1.status = 'Revision cancelled — original product unchanged';

  co.revType       = 'none';
  co.revNote       = '';
  co.revSubmitDate = '';
  co.revStatus     = '';
  co.revFrom       = [];
  co.revTo         = [];
  co.revMT         = 0;
  co.remarks       = (co.remarks||'').replace(/Revision Cancelled.*$/, '') + ' — Revision Cancelled ' + new Date().toLocaleDateString('id-ID',{day:'2-digit',month:'2-digit',year:'numeric'});
  co.spiRef        = (co.spiRef||'') + ' · Original product unchanged';

  _refreshAfterRREdit();
  buildRevMgmtSection(co);
  saveToStorage();
  patchToServer(co).catch(err => notifySaveError('rrCancelRevision', err));
  nsShowToast(`✓ ${code} revision cancelled — original products restored`);
}

/* Re-open a completed revision back to active */
function rrReopenRevision(code) {
  const co = getSPI(code); if (!co) return;
  co.revType = 'active';
  _refreshAfterRREdit();
  buildRevMgmtSection(co);
  nsShowToast(`${code} revision re-opened as active`);
}

/* Save Re-Apply tracking data */
function rrSaveReapply(code) {
  let ra = getRA(code);
  const status = (g('rrReapplyStatus') || {}).value || '';
  const date   = (g('rrReapplyDate')   || {}).value || '';
  const mt     = parseFloat((g('rrReapplyMT')  || {}).value || '');
  const spiNo  = (g('rrReaplySpiNo')   || {}).value || '';

  if (!ra) {
    // Create a placeholder RA record for this company if it doesn't exist
    const co = getSPI(code);
    if (!co) return;
    const obtMT = co.obtained || 0;
    ra = { code, product: co.products.join(' + '), berat: 0, obtained: obtMT, realPct: 0, target: mt || null, period: '—', pertek: '', spi: '', catatan: '', eta: '—' };
    RA.push(ra);
  }

  if (status) ra.reapplyStatus     = status;
  if (date)   ra.reapplySubmitDate = date;
  if (!isNaN(mt) && mt > 0) ra.target = mt;
  if (spiNo)  ra.reaplySpiNo       = spiNo;

  _refreshAfterRREdit();
  const co = getSPI(code);
  if (co) buildRevMgmtSection(co);
  nsShowToast(`✓ ${code} re-apply data updated`);
}

/* Shared refresh after any RR edit */
function _refreshAfterRREdit() {
  buildRevList();
  buildRevDetailTable();
  renderSPI();
  renderMain();
  updateOverviewKPIs();
  if (typeof autoSave === 'function') autoSave();
}

/* ── Save all fields — mutate live data — refresh every section ── */
function saveEdit() {
  const c = gv('editCo');
  if (!c) return;

  // ── Role guard: must have a role selected ──
  if (!currentRole) {
    alert('Please select your role before saving.');
    return;
  }

  // ── Ambiguous MT guard: refuse the whole save rather than store a guess ──
  // Nothing here may be interpreted for the user — a field reading "2.000"
  // could mean 2000 or 2.0, and guessing wrong silently corrupts quota data
  // (that is exactly how IKM lost 1998 MT). Send them back to fix it.
  const badMt = (typeof mtInputsAmbiguous === 'function') ? mtInputsAmbiguous() : [];
  if (badMt.length) {
    badMt[0].focus();
    alert('Ada ' + badMt.length + ' isian MT dengan format tidak jelas (mis. "2.000").\n\n'
      + 'Pakai koma untuk pemisah ribuan — tulis 2,000 atau 2000.\n'
      + 'Isian yang bermasalah ditandai merah.');
    return;
  }

  const allowed = ROLE_PERMISSIONS[currentRole] || [];
  const can = id => allowed.includes(id);

  // ── Utilization date guard: refuse rather than store a dateless lot ──
  // lotUtilDate() is what slices utilization into periods; inPd(null) is
  // FALSE, so a lot with MT and no ETA/PIB is not "unfiltered", it is gone
  // from every period view. The per-lot 💾 Simpan button has always blocked
  // this; the main Save button reads the raw inputs via collectShipmentData()
  // and used to write them through dateless. Same rule, both paths.
  if (can('salesShipTable') || can('opsShipTable')) {
    const missingDates = (typeof lotsMissingUtilDate === 'function') ? lotsMissingUtilDate() : [];
    if (missingDates.length) {
      if (typeof flagMissingUtilDates === 'function') flagMissingUtilDates(missingDates);
      alert('Ada ' + missingDates.length + ' lot utilisasi dengan MT tapi tanpa tanggal '
        + '(' + missingDates.map(m => `${prodLabel(m.prod)} Lot ${m.idx + 1}`).join(', ') + ').\n\n'
        + 'Isi ETA JKT (atau PIB Date) dulu — tanpa tanggal, MT tersebut tidak akan '
        + 'muncul di filter periode manapun.');
      return;
    }
  }

  // ── Collect shipment data from Sales & Ops forms ─────────────────
  const co_live = getSPI(c) || PENDING.find(p => p.code === c);
  if (co_live && (can('salesShipTable') || can('opsShipTable'))) {
    collectShipmentData(co_live);
  }

  // ── Collect Sales Revision Request ────────────────────────────────
  if (co_live && can('salesRevReq')) {
    collectRevisionRequestData(co_live);
    /* Perusahaan tanpa riwayat memakai formulir New Submission di slot yang
       sama — hanya satu dari keduanya yang pernah ada di DOM, dan masing-masing
       collector langsung keluar kalau formulirnya tidak tampil. */
    collectNewSubmissionData(co_live);
  }

  // ── Collect CorpSec Revision Confirmation ─────────────────────────
  // Status (confirmed/rejected) is set directly by csConfirmRev/csBatalRev buttons
  // confirmedMT is read from the input at the time of button click (already stored in co.salesRevRequest)

  // ── Per-product MT tables (CorpSec / SuperAdmin) ──────────────────
  const canSubmit   = can('submitProdTable');
  const canObtained = can('obtainedProdTable');

  // Collect per-product submit MTs → {byProd:{PROD:mt,...}, total:n}
  const submitMTData   = canSubmit   ? collectProductMTs('pmt-submit-inp')   : { byProd:{}, total:null };
  const obtainedMTData = canObtained ? collectProductMTs('pmt-obtained-inp') : { byProd:{}, total:null };

  const newSubmitMT   = submitMTData.total;     // total across all products, or null if no access
  const newObtainedMT = obtainedMTData.total;   // total across all products, or null if no access
  const newSubmitProds   = submitMTData.byProd;   // { 'GL BORON': 4000, 'PPGL CARBON': 2000, … }
  const newObtainedProds = obtainedMTData.byProd; // { 'GL BORON': 400,  'PPGL CARBON': 400,  … }

  // ── Other single-field reads ──────────────────────────────────────
  const newSubmitDate = can('eSubmitDate')  ? gv('eSubmitDate')          : null;
  const newPertekNo   = can('ePertekNo')   ? gv('ePertekNo')             : null;
  const newPertekDate = can('ePertekDate') ? gv('ePertekDate')           : null;
  const newSpiNo      = can('eSpiNo')      ? gv('eSpiNo')                : null;
  const newSpiDate    = can('eSpiDate')    ? gv('eSpiDate')              : null;
  const newStatus     = can('eStatus')     ? gv('eStatus')               : null;
  // statusUpdate is SUBMISSION-LEVEL — one note for entire submission
  const newStatusUpdate = can('eStatusUpdate') ? g('eStatusUpdate').value.trim() : null;
  const newBerat      = can('eBerat')      ? parseFloat(g('eBerat').value): NaN;
  const newETA        = can('eETA')        ? gv('eETA')                  : null;
  const newPIBRelease = can('ePIBRelease') ? gv('ePIBRelease')           : null;
  const newTarget     = can('eTarget')     ? parseFloat(g('eTarget').value): NaN;
  const newRem        = can('eRem')        ? gv('eRem')                  : null;

  const hasPERTEK = newPertekDate !== '' && newPertekDate != null;
  const hasSPI    = newSpiDate    !== '' && newSpiDate    != null;

  // ── Submit date guard: a Submit cycle carrying MT must carry its date ──
  // KPI1 and the whole "which companies were active this quarter" filter run
  // off cycleDates().submitMOI = pDate(cycle.submitDate). Persisting a
  // Submit #1 with MT but submit_date='' hides that submission from every
  // period, and cycles has no created_at column to fall back on — the date
  // has to come from the form. Only enforced when this save actually writes
  // Submit MT (CorpSec/SuperAdmin); other roles never touch the cycle.
  if (canSubmit && newSubmitMT != null && newSubmitMT > 0) {
    const _existingSubmitDate = (() => {
      const _co = getSPI(c) || PENDING.find(p => p.code === c);
      const _cy = ((_co && _co.cycles) || []).find(cy => /^submit #1/i.test(cy.type));
      const _d  = _cy ? String(_cy.submitDate || '').trim() : '';
      return (_d && _d !== 'TBA') ? _d : '';
    })();
    if (!newSubmitDate && !_existingSubmitDate) {
      const el = g('eSubmitDate');
      if (el) { el.style.borderColor = 'var(--red2)'; el.focus(); }
      alert('Submit Date wajib diisi saat mencatat Submit MT.\n\n'
        + 'Tanpa tanggal submit, submission ini tidak akan muncul di filter periode manapun.');
      return;
    }
    const el = g('eSubmitDate');
    if (el) el.style.borderColor = '';
  }

  // ── Auto-extract PERTEK date from status text if not formally filled ──────
  // CorpSec sometimes types "PERTEK TERBIT 14/04/2026" in the Status Update field
  // instead of using the formal PERTEK Date input → extract it automatically
  let _autoPertekDate = newPertekDate;
  if (!hasPERTEK && newStatusUpdate) {
    const m = newStatusUpdate.match(/pertek\s*terbit[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
    if (m) _autoPertekDate = m[1].replace(/-/g, '/');
  }
  const _hasPERTEK = _autoPertekDate !== '' && _autoPertekDate != null;

  /* ── 1. Locate or promote company ── */
  let co = getSPI(c);
  let promotedFromPending = false;

  if (!co) {
    // In PENDING — if PERTEK date now filled, promote to SPI array
    const pi = PENDING.findIndex(p => p.code === c);
    if (pi >= 0) {
      if (_hasPERTEK && _autoPertekDate) {
        const pr = PENDING.splice(pi, 1)[0];
        const prods = pr.products || [];
        const submitMT  = newSubmitMT   != null ? newSubmitMT   : (pr.mt || 0);
        const obtMT     = newObtainedMT != null ? newObtainedMT : 0;
        const subProdObj = Object.keys(newSubmitProds).length > 0
          ? newSubmitProds
          : (pr.cycles && pr.cycles[0] ? pr.cycles[0].products
            : prods.reduce((o, p) => { o[p] = Math.round(submitMT / Math.max(prods.length,1)); return o; }, {}));
        const obtProdObj = Object.keys(newObtainedProds).length > 0
          ? newObtainedProds
          : prods.reduce((o, p) => { o[p] = Math.round(obtMT / Math.max(prods.length,1)); return o; }, {});
        const _pertekDateFinal = _autoPertekDate; // might be auto-extracted from status text
        const newRec = {
          code: pr.code, group: pr.group || 'CD',
          submit1: submitMT, obtained: obtMT, products: prods,
          revType: 'complete', revSubmitDate: _pertekDateFinal,
          revStatus: hasSPI
            ? `SPI TERBIT ${newSpiDate}`
            : `PERTEK TERBIT ${_pertekDateFinal} — SPI belum terbit`,
          revNote: hasSPI
            ? `SPI TERBIT ${newSpiDate}`
            : `PERTEK TERBIT ${_pertekDateFinal} — SPI belum terbit`,
          revFrom: [], revTo: [], revMT: 0,
          remarks: newRem || pr.remarks || '',
          spiRef: hasSPI ? `SPI TERBIT ${newSpiDate}` : `PERTEK TERBIT ${_pertekDateFinal}`,
          pertekNo: newPertekNo, spiNo: newSpiNo,
          statusUpdate: newStatusUpdate || '',
          cycles: [
            { type: 'Submit #1', mt: submitMT, products: subProdObj,
              submitType: 'Submit MOI', submitDate: newSubmitDate || (pr.cycles&&pr.cycles[0]?pr.cycles[0].submitDate:''),
              releaseType: 'PERTEK', releaseDate: _pertekDateFinal,
              pertekDate: _pertekDateFinal,
              status: newStatusUpdate ? `PERTEK TERBIT ${_pertekDateFinal} · ${newStatusUpdate}` : `PERTEK TERBIT ${_pertekDateFinal}` },
            { type: 'Obtained #1', mt: obtMT, products: obtProdObj,
              submitType: 'Submit MOT', submitDate: 'TBA',
              releaseType: 'SPI', releaseDate: hasSPI ? newSpiDate : 'TBA',
              // Dedicated date column — kept in step with the Submit #1 row
              // above (which already carries pertekDate). Without it an
              // Obtained cycle promoted from PENDING held its SPI date only
              // in the overloadable release_date.
              spiDate: hasSPI ? newSpiDate : '',
              status: hasSPI ? `SPI TERBIT ${newSpiDate}` : `PERTEK Terbit: ${_pertekDateFinal} · SPI: belum terbit` },
          ],
        };
        SPI.push(newRec);
        co = newRec;
        promotedFromPending = true;
      } else {
        // Stay in PENDING — update what we can
        const p = PENDING[pi];
        // Update total MT from per-product sum
        if (newSubmitMT != null) p.mt = newSubmitMT;
        if (newRem) p.remarks = newRem;
        if (newStatus) p.status = newStatus;
        // Store submission-level status update
        if (newStatusUpdate !== null) p.statusUpdate = newStatusUpdate;
        const subCy = (p.cycles||[]).find(cy => /^submit/i.test(cy.type));
        if (subCy && newSubmitDate) subCy.submitDate = newSubmitDate;
        if (subCy && newSubmitMT != null) subCy.mt = newSubmitMT;
        // Write per-product submit MT into pending cycle.products
        if (subCy && canSubmit && Object.keys(newSubmitProds).length > 0) {
          subCy.products = { ...subCy.products, ...newSubmitProds };
          // Keep p.products list in sync for newly-added products
          if (!Array.isArray(p.products)) p.products = [];
          Object.keys(newSubmitProds).forEach(prod => {
            if (!p.products.includes(prod)) p.products.push(prod);
          });
        }
        // Sync cycle status with submission-level statusUpdate so the
        // "Current Status Only" cell on the New Submission table reflects
        // the user's latest manual update (the cell prefers cy.status).
        if (subCy && newStatusUpdate) subCy.status = newStatusUpdate;
      }
    }
  }

  if (co) {
    /* ── 2. Mutate SPI record ── */
    const ac     = co.cycles || [];
    const subCy  = ac.find(cy => /^submit #1/i.test(cy.type));
    const obtCy  = ac.find(cy => /^obtained #1/i.test(cy.type));

    // ── Submit MT (per product) → KPI1 ─────────────────────────────
    if (canSubmit && Object.keys(newSubmitProds).length > 0) {
      // Update co.submit1 = total of all per-product submit MTs
      co.submit1 = newSubmitMT || co.submit1;
      if (subCy) {
        subCy.mt = newSubmitMT || subCy.mt;
        // Write per-product breakdown into cycle.products
        subCy.products = { ...subCy.products, ...newSubmitProds };
      }
      // Keep co.products list in sync (add any products user just added
      // via the "+ Add Product" button on the Submit MT table).
      if (!Array.isArray(co.products)) co.products = [];
      Object.keys(newSubmitProds).forEach(p => {
        if (!co.products.includes(p)) co.products.push(p);
      });
    }
    if (newSubmitDate && subCy) subCy.submitDate = newSubmitDate;

    // ── PERTEK No. — ONE per submission ──────────────────────────────
    if (newPertekNo) co.pertekNo = newPertekNo;

    // ── PERTEK date → Submit #1 releaseDate (KPI2 filter date) ───────
    // Uses _autoPertekDate / _hasPERTEK, not the raw field: when CorpSec
    // types "PERTEK TERBIT 14/04/2026" into Status Update instead of the
    // formal date input, the extracted date must land in the cycle here too.
    // The PENDING-promotion branch above already did this; this branch (an
    // existing SPI company) silently dropped it and left the cycle undated.
    if (_hasPERTEK && subCy) {
      subCy.releaseDate = _autoPertekDate;
      // Mirror into the DEDICATED date column. release_date is overloaded —
      // the Revision Management screen can overwrite it with a document
      // number — so pertek_date is what guarantees the date survives.
      subCy.pertekDate  = _autoPertekDate;
      subCy.status = newStatusUpdate
        ? `PERTEK TERBIT ${_autoPertekDate} · ${newStatusUpdate}`
        : `PERTEK TERBIT ${_autoPertekDate}`;
    }

    // ── Obtained MT (per product) → KPI2 ────────────────────────────
    if (canObtained && Object.keys(newObtainedProds).length > 0) {
      co.obtained = newObtainedMT || co.obtained;
      if (obtCy) {
        obtCy.mt = newObtainedMT || obtCy.mt;
        // Write per-product breakdown — replaces old products map completely
        // Merge: keep existing products not in the form, update those that are
        obtCy.products = { ...obtCy.products, ...newObtainedProds };
      }
      // Keep co.products list in sync (add any new product names)
      Object.keys(newObtainedProds).forEach(p => {
        if (!co.products.includes(p)) co.products.push(p);
      });
    }

    // ── SPI No. — ONE per submission ──────────────────────────────────
    if (newSpiNo) co.spiNo = newSpiNo;

    // ── SPI date → Obtained #1 releaseDate (SPI Terbit) ──────────────
    if (hasSPI && obtCy) {
      obtCy.releaseDate = newSpiDate;
      obtCy.spiDate     = newSpiDate;   // dedicated column — see PERTEK above
      obtCy.status = `SPI TERBIT ${newSpiDate}`;
    }

    // spiRef — explicit status wins; else derive from document dates
    if (newStatus) {
      co.spiRef = newStatus;
    } else if (hasSPI) {
      co.spiRef = newSpiNo
        ? `SPI TERBIT ${newSpiDate} · No. ${newSpiNo}`
        : `SPI TERBIT ${newSpiDate}`;
    } else if (hasPERTEK) {
      co.spiRef = newPertekNo
        ? `PERTEK TERBIT ${newPertekDate} · No. ${newPertekNo}`
        : `PERTEK TERBIT ${newPertekDate}`;
    }

    // Auto-update revType/revStatus for non-promoted companies
    if (!promotedFromPending && co.revType === 'complete') {
      if (hasSPI)    co.revStatus = `SPI TERBIT ${newSpiDate}`;
      else if (hasPERTEK) co.revStatus = `PERTEK TERBIT ${newPertekDate} — SPI belum terbit`;
    }

    if (newRem) co.remarks = newRem;
    if (newStatusUpdate !== null) co.statusUpdate = newStatusUpdate;

    // Utilization MT + Available Quota — always derive from shipments if they exist
    if (co.shipments && Object.keys(co.shipments).length > 0) {
      // Already computed by collectShipmentData() above — just ensure availableQuota is updated
      co.availableQuota = Math.max(0, (co.obtained || 0) - (co.utilizationMT || 0));
    } else {
      // Utilization is lot/stats-derived (server-reconciled via company_shipments
      // → company_product_stats). Do NOT overwrite it from the legacy manual
      // eUtilMT input — that could clobber the canonical value (corruption path).
      // Just keep availableQuota consistent with the existing figures.
      if (co.obtained != null && co.utilizationMT != null) {
        co.availableQuota = Math.max(0, co.obtained - co.utilizationMT);
      }
    }

    // Updated By
    const newUpdatedBy = currentRole;
    if (newUpdatedBy) {
      co.updatedBy   = newUpdatedBy;
      co.updatedDate = (typeof todayStd === 'function') ? todayStd() : new Date().toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'2-digit'}).replace(/ /g,'-');
    }
  }

  /* ── 3. Mutate RA record + sync from shipment data ── */
  // A company that cleared customs in several waves owns one ra_records row
  // PER ARRIVAL (decision 2026-07-27). The writes below derive company-wide
  // totals from co.shipments, so aiming them at a single row would store the
  // company total against one wave while its siblings keep their own weights
  // — the double-count iqdash_data.php:460 guards against on the read side,
  // except persisted to the sheet. Until the edit form is wave-aware, the
  // per-wave weights (taken from the source REALISASI workbooks) stay
  // authoritative and only arrival state is asserted.
  const raTot   = raTotals(c);
  const raRows  = raTot.rows;
  const raMulti = raTot.multi;
  // getRA() returns the LATEST wave; RA.find would return the first.
  const ra = getRA(c);

  // ── 3a. Sync from co.shipments (Sales/Ops role saves) ────────────────
  if (co && co.shipments && (can('salesShipTable') || can('opsShipTable'))) {
    // Aggregate across all lots and products for the RA record
    const allLots = Object.values(co.shipments).flat();
    const totalUtil  = allLots.reduce((s, l) => s + (l.utilMT  || 0), 0);
    const totalReal  = allLots.filter(l => l.arrived).reduce((s, l) => s + (l.realMT || 0), 0);
    const totalBerat = allLots.reduce((s, l) => s + (l.realMT != null ? l.realMT : (l.utilMT || 0)), 0);
    const anyArrived = allLots.some(l => l.arrived && l.realMT > 0);
    const latestETA  = allLots.filter(l => l.etaJKT).map(l => l.etaJKT).join(' · ') || '';
    const latestPIB  = allLots.filter(l => l.pibDate).map(l => l.pibDate).join(', ') || '';
    const obtMT      = co.obtained || 1;

    if (ra && raMulti) {
      // Multi-wave: the company total cannot be attributed to one row, so
      // leave every wave's weight alone and only assert arrival.
      if (anyArrived) raRows.forEach(r => { r.cargoArrived = true; });
      if (latestETA)  ra.etaJKT         = latestETA;
      if (latestPIB)  ra.pibReleaseDate = latestPIB;
      if (typeof showToast === 'function') {
        showToast(`ℹ ${c} punya ${raRows.length} kedatangan — berat per gelombang tidak diubah dari sini, edit di sheet.`, 'info');
      }
    } else if (ra) {
      // Merge shipment data into RA record
      if (totalUtil > 0 || totalReal > 0) {
        ra.berat        = anyArrived ? totalReal : totalUtil;
        ra.cargoArrived = anyArrived;
        ra.realPct      = anyArrived  ? Math.min(1, totalReal  / obtMT) : 0;
        ra.utilPct      = !anyArrived ? Math.min(1, totalUtil  / obtMT) : null;
      }
      if (latestETA)  ra.etaJKT        = latestETA;
      if (latestPIB)  ra.pibReleaseDate = latestPIB;
    } else if (totalUtil > 0 || totalReal > 0) {
      // No RA record yet — create one from shipment data
      RA.push({
        code: c, product: (co.products || []).join(' + '),
        berat: anyArrived ? totalReal : totalUtil,
        obtained: co.obtained || 0,
        cargoArrived: anyArrived,
        realPct:  anyArrived  ? Math.min(1, totalReal / obtMT) : 0,
        utilPct:  !anyArrived ? Math.min(1, totalUtil / obtMT) : null,
        arrivalDate: null,
        etaJKT: latestETA,
        pibReleaseDate: latestPIB,
        reapplyEst: '', target: null,
        pertek: co.pertekNo || '', spi: co.spiNo || '',
        catatan: '',
      });
    }
  }

  // ── 3b. Legacy single-field updates (CorpSec / Ops direct entry) ─────
  if (ra) {
    if (!isNaN(newBerat) && newBerat >= 0 && can('eBerat')) {
      if (raMulti) {
        // Same hazard as 3a: a single berat field cannot say which wave it
        // belongs to, and silently assigning it to one would corrupt the total.
        if (typeof showToast === 'function') {
          showToast(`⚠ Berat ${c} tidak disimpan — ada ${raRows.length} kedatangan, edit per gelombang di sheet.`, 'error');
        }
      } else {
        ra.berat = newBerat;
        const obtMT = (co && co.obtained > 0) ? co.obtained : (ra.obtained || 1);
        if (ra.cargoArrived) ra.realPct = newBerat / obtMT;
        else                 ra.utilPct = newBerat / obtMT;
      }
    }
    if (newETA        && can('eETA'))        ra.etaJKT         = newETA;
    if (newPIBRelease && can('ePIBRelease')) ra.pibReleaseDate = newPIBRelease;
    if (!isNaN(newTarget))                   ra.target         = newTarget;
    // Always sync PERTEK / SPI numbers from CorpSec edits
    if (newPertekNo) { ra.pertek = newPertekNo; ra.pertekNo = newPertekNo; }
    if (newSpiNo)    { ra.spi    = newSpiNo;    ra.spiNo    = newSpiNo; }
    // Keep ra.obtained in sync if CorpSec changed the obtained MT. This one is
    // a company-level figure duplicated onto every row, so multi-wave
    // companies get it on all of theirs — unlike berat, it is not per-wave.
    if (co && co.obtained) raRows.forEach(r => { r.obtained = co.obtained; });
  }

  /* ── 3c. Apply product renames → inject Revision cycles into SPI ── */
  if (co && (can('submitProdTable') || currentRole === 'SuperAdmin')) {
    applyProductRenames(co);
  }

  /* ── 4. Persist to server + localStorage, then refresh ── */
  saveToStorage(); // localStorage backup
  updateStorageStatus();

  // Sync per-product Obtained into company_product_stats so the cycles-based KPI
  // and the stats-based breakdown can't drift (the SJH/LCP/BBB class). Only for
  // NON-revision direct edits — revisions/Obtained #2 route through the
  // record-obtained endpoint ("Catat Terbit"), which the obtained table locks to.
  if (co) {
    const _revActive = co.revType && !['none', 'clean', ''].includes(String(co.revType));
    if (canObtained && !_revActive && newObtainedProds && Object.keys(newObtainedProds).length) {
      co._obtainedStats = Object.entries(newObtainedProds)
        .filter(([, mt]) => Number(mt) > 0)
        .map(([product, mt]) => ({ product, obtained: Number(mt) }));
    } else {
      delete co._obtainedStats;
    }
  }

  // PATCH to server so data survives page refresh.
  // - Data is buffered in localStorage first so transient errors don't lose input.
  // - fetchWithRetry retries 5× (~18s) on 5xx/network errors.
  // - On HTTP 409 (concurrency conflict): another user changed this row
  //   since we fetched. Prompt user to refresh — DO NOT auto-overwrite.
  if (co) {
    patchToServer(co).then(() => {
      // Persist the RA record (realization / re-apply tracking) to ra_records.
      // patchToServer() does NOT carry the `ra` payload, so without this the
      // berat / cargoArrived / realPct / target / etaJKT edits applied in
      // steps 3a-3b above would live only in localStorage and silently revert
      // on refresh from another device. Chained after patchToServer so the two
      // PATCHes on the same company row don't race. Note: the server's body.ra
      // handler is an UPDATE keyed on company_code — it persists edits to an
      // EXISTING ra_records row; a brand-new in-memory RA (created from
      // shipment data for a company with no prior RA row) won't insert yet.
      if (ra && typeof patchRAToServer === 'function') return patchRAToServer(co, ra);
    }).then(() => {
      showSaveToast(new Date().toISOString());
    }).catch(err => {
      if (err && err.status === 409) {
        console.warn('[saveEdit] 409 conflict — DB modified by another user', err);
        if (typeof showToast === 'function') {
          showToast('⚠ Data sudah diubah pengguna lain. Refresh halaman dan input ulang agar tidak menimpa data terbaru.', 'error');
        }
        // Do not auto-clear localStorage — user can choose to refresh & re-edit
        return;
      }
      console.error('Server PATCH failed (data is safe in localStorage):', err);
      if (typeof notifySaveError === 'function') {
        notifySaveError('save', err);
      } else if (typeof showToast === 'function') {
        showToast(`Data tersimpan di browser. Sync server gagal (${err.message}) — akan dicoba ulang.`, 'warn');
      }
      showSaveToast(new Date().toISOString());
    });
  } else {
    // Also save PENDING company changes to server
    const pi2 = PENDING.findIndex(p => p.code === c);
    if (pi2 >= 0) {
      const pRec = PENDING[pi2];
      if (pRec._isNew) {
        // Brand-new company (from "(New)" optgroup) — POST to /api/company
        // so the companies/company_products/pending_meta rows get created
        // before any PATCH (which would 404 on a missing row).
        createPendingOnServer({
          code:         pRec.code,
          fullName:     pRec.fullName || '',
          grp:          pRec.group || 'CD',
          products:     pRec.products || [],
          mt:           pRec.mt || 0,
          status:       pRec.status || '',
          date:         pRec.date || '',
          remarks:      pRec.remarks || '',
          statusUpdate: pRec.statusUpdate || '',
          submitDate:   (pRec.cycles && pRec.cycles[0] && pRec.cycles[0].submitDate) || '',
          updatedBy:    pRec.updatedBy || currentRole || '',
        }).then(() => {
          delete pRec._isNew; // first save complete — subsequent edits use PATCH
          return patchToServer(pRec); // sync cycles + remaining fields
        }).catch(err => {
          if (err && err.status === 409) {
            if (typeof showToast === 'function') {
              showToast(`⚠ Company ${pRec.code} sudah ada di database — refresh halaman.`, 'error');
            }
            return;
          }
          notifySaveError('PENDING create', err);
        });
      } else {
        patchToServer(pRec).catch(err =>
          notifySaveError('PENDING update', err)
        );
      }
    }
    showSaveToast(new Date().toISOString());
  }

  // Save succeeded (optimistically) — discard the form draft so it
  // doesn't reappear next time. If the server PATCH later fails, the
  // saveToStorage() snapshot above plus the migrateLocalToServer()
  // retry on next boot still protect against data loss.
  if (c && currentRole && typeof clearFormDraft === 'function') {
    clearFormDraft(c, currentRole);
    if (typeof refreshDropdownDraftBadges === 'function') refreshDropdownDraftBadges();
  }

  cancelEdit();
  closeImport();
  buildRoleHistory && buildRoleHistory();

  // Charts
  buildPipeline(); buildProductDonut(); buildTopCo();
  buildUtilChart(); buildCmpChart(); buildGauge(); buildFlowKPIStrip();
  // Tables & lists
  renderSPI(); renderUtilTable(); renderRATable(); renderMain();
  buildRevList(); buildPendingQuick(); buildRevDetailTable();
  buildCmpList(); buildPendingTable();
  // Analytics & KPIs
  buildLeadTimeAnalytics();
  buildAvailableQuota();
  updateOverviewStats();
  updateOverviewKPIs();
}
/* ══════════════════════════════════════════════════════════════════════
   EXPORT EXECUTIVE PDF — Management Summary (A4 Portrait)
   Board-level, concise, visual. 2 pages max.
   Filter-aware: uses same KPI logic as dashboard.
   ══════════════════════════════════════════════════════════════════════ */