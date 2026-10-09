/* ═══════════════════════════════════════
   LOCAL STORAGE — Pending-sync buffer ONLY
   ─────────────────────────────────────────────────────
   Per request 30-Apr-2026: this is a multi-user dashboard. The database
   is the single source of truth. localStorage is no longer merged into
   the display (the old `loadFromStorage` overlay is gone). Its sole
   role now is to buffer changes that have not yet been synced to the
   server — e.g. when a save fails because the DB was offline. On the
   next page load, `migrateLocalToServer()` pushes any buffered entries
   to the server (with optimistic-concurrency validation), then clears
   them. After every successful patch, the matching entry is removed
   via `clearStorageForCode()` so we never overwrite newer DB data.
═══════════════════════════════════════ */

const LS_KEY        = 'quotaDashboard_v1';
const LS_DRAFT_KEY  = 'quotaDashboard_v1_drafts';

/* ══════════════════════════════════════════════════════════════════
   FORM DRAFTS — survive accidental modal close
   ──────────────────────────────────────────────────────────────────
   The Input Data modal can be closed by ✕, backdrop click, Esc key,
   or company-switch — none of which trigger Save. Without drafts the
   user loses everything they typed. We snapshot the form on every
   input (debounced 500ms) and on closeImport(); restore on next open.
   Storage shape (in localStorage[LS_DRAFT_KEY]):
     { "<role>::<code>": { code, role, ts, data: { fields, submitMT,
       obtainedMT, reapplyMT } } }
   Drafts older than 7 days auto-prune on read so localStorage doesn't
   bloat indefinitely.
══════════════════════════════════════════════════════════════════ */
const _DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
function _draftKey(code, role) { return `${role||'_'}::${code||'_'}`; }
function _readAllDrafts() {
  try {
    const drafts = JSON.parse(localStorage.getItem(LS_DRAFT_KEY)) || {};
    // Auto-prune stale drafts so the store stays small
    const cutoff = Date.now() - _DRAFT_TTL_MS;
    let pruned = false;
    Object.keys(drafts).forEach(k => {
      const ts = drafts[k] && drafts[k].ts ? new Date(drafts[k].ts).getTime() : 0;
      if (!ts || ts < cutoff) { delete drafts[k]; pruned = true; }
    });
    if (pruned) {
      try { localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(drafts)); }
      catch(e) {}
    }
    return drafts;
  } catch(e) {
    return {};
  }
}
function _writeAllDrafts(drafts) {
  try { localStorage.setItem(LS_DRAFT_KEY, JSON.stringify(drafts)); }
  catch(e) { console.warn('draft write failed:', e); }
}

/** Save (or update) the modal form draft for a given (code, role). */
function saveFormDraft(code, role, data) {
  if (!code || !role) return;
  // Skip if data is effectively empty — don't bloat with no-op drafts
  if (!data || !_isDraftNonEmpty(data)) {
    clearFormDraft(code, role);
    return;
  }
  const drafts = _readAllDrafts();
  drafts[_draftKey(code, role)] = {
    code, role, data,
    ts: new Date().toISOString(),
  };
  _writeAllDrafts(drafts);
}

function _isDraftNonEmpty(data) {
  if (!data) return false;
  const hasFields = data.fields && Object.values(data.fields).some(v => v != null && v !== '');
  const hasSubmit = data.submitMT && Object.keys(data.submitMT).length;
  const hasObtained = data.obtainedMT && Object.keys(data.obtainedMT).length;
  const hasReapply = data.reapplyMT && Object.keys(data.reapplyMT).length;
  return !!(hasFields || hasSubmit || hasObtained || hasReapply);
}

/** Read a single draft, or null if none / stale. */
function loadFormDraft(code, role) {
  if (!code || !role) return null;
  const drafts = _readAllDrafts();
  return drafts[_draftKey(code, role)] || null;
}

/** Delete a draft after a successful save (or user discards). */
function clearFormDraft(code, role) {
  if (!code || !role) return;
  const drafts = _readAllDrafts();
  const key = _draftKey(code, role);
  if (drafts[key]) {
    delete drafts[key];
    _writeAllDrafts(drafts);
  }
}

/** Returns a Set of company codes that have at least one draft, for
    dropdown badging ("📝 draft pending"). Role-agnostic. */
function listDraftCompanyCodes() {
  const drafts = _readAllDrafts();
  const codes = new Set();
  Object.values(drafts).forEach(d => { if (d && d.code) codes.add(d.code); });
  return codes;
}


/** Fields that can change at runtime and should be persisted */
const RA_MUTABLE  = ['berat','realPct','utilPct','cargoArrived','arrivalDate',
                     'etaJKT','pibReleaseDate','reapplyEst','reapplySubmitted','target'];
// NOTE: utilizationMT & availableQuota intentionally EXCLUDED — they are
// server-reconciled (see KPI_RECONCILE in server.js). Allowing them to
// roundtrip via localStorage caused stale browser snapshots to silently
// overwrite reconciled DB values on dashboard load (migrateLocalToServer).
const SPI_MUTABLE = ['spiRef','remarks','revType','revStatus','revNote','statusUpdate',
                     'salesRevRequest','spiNo','pertekNo','spiDate','pertekDate','updatedBy','updatedDate',
                     'shipments','reapplyTargets'];

/** Serialize current state → localStorage (offline-resilient buffer between
    user input and server sync — NOT a display source). */
function saveToStorage() {
  const snap = {
    ts: new Date().toISOString(),
    ra: {},
    spi: {}
  };
  RA.forEach(r => {
    const obj = {};
    RA_MUTABLE.forEach(k => { if (r[k] !== undefined) obj[k] = r[k]; });
    snap.ra[r.code] = obj;
  });
  SPI.forEach(s => {
    const obj = {};
    SPI_MUTABLE.forEach(k => { if (s[k] !== undefined) obj[k] = s[k]; });
    snap.spi[s.code] = obj;
  });
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(snap));
    return snap.ts;
  } catch(e) {
    console.warn('localStorage save failed:', e);
    return null;
  }
}

/** Read raw snapshot WITHOUT merging into globals. Returns null if empty. */
function readStorageSnapshot() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch(e) {
    console.warn('localStorage read failed:', e);
    return null;
  }
}

/** Backward-compat alias: legacy callers may still invoke loadFromStorage().
    It is now a NO-OP that does NOT touch SPI/RA. The display always comes
    from /api/data; pending local edits are only pushed via
    migrateLocalToServer() on boot, never merged into globals. */
function loadFromStorage() {
  const snap = readStorageSnapshot();
  return snap && snap.ts ? snap.ts : null;
}

/** Clear all saved data */
function clearStorage() {
  try { localStorage.removeItem(LS_KEY); } catch(e) {}
}

/** Remove a single company's buffered entry (called after a successful
    patch so we don't accidentally re-push stale data on next boot). */
function clearStorageForCode(code) {
  if (!code) return;
  try {
    const snap = readStorageSnapshot();
    if (!snap) return;
    let touched = false;
    if (snap.ra && snap.ra[code]) { delete snap.ra[code]; touched = true; }
    if (snap.spi && snap.spi[code]) { delete snap.spi[code]; touched = true; }
    if (!touched) return;
    const empty = (!snap.ra || !Object.keys(snap.ra).length) &&
                  (!snap.spi || !Object.keys(snap.spi).length);
    if (empty) {
      localStorage.removeItem(LS_KEY);
    } else {
      snap.ts = new Date().toISOString();
      localStorage.setItem(LS_KEY, JSON.stringify(snap));
    }
  } catch(e) {
    console.warn('clearStorageForCode failed:', e);
  }
}

/** migrateLocalToServer — boot-time push of buffered local changes to DB.
    Logic:
      1. Read localStorage snapshot
      2. For each company entry, COMPARE local snap.ts vs the company's
         _updatedAt token from the freshly-fetched server data
         - If DB ≥ local → discard local (DB wins; data is stale)
         - If local > DB → apply onto in-memory co + push via patchToServer
      3. Clear pushed/stale entries; keep only entries that hit a network
         error so they retry on the next boot.
    Returns { pushed, discardedStale, conflicts, failed }. */
async function migrateLocalToServer() {
  const snap = readStorageSnapshot();
  if (!snap || (!snap.ra && !snap.spi)) {
    return { pushed: 0, discardedStale: 0, conflicts: 0, failed: 0 };
  }

  const codes = new Set([
    ...Object.keys(snap.spi || {}),
    ...Object.keys(snap.ra  || {}),
  ]);
  const localTs = snap.ts ? new Date(snap.ts).getTime() : 0;
  let pushed = 0, discardedStale = 0, conflicts = 0, failed = 0;
  const failedCodes = new Set();

  for (const code of codes) {
    const co = (typeof getSPI === 'function' ? getSPI(code) : null) ||
               (typeof PENDING !== 'undefined' ? PENDING.find(p => p.code === code) : null);
    if (!co) { discardedStale++; continue; }

    // Only push if user's local snapshot is strictly newer than DB.
    // 1-second tolerance for clock drift.
    const dbTs = co._updatedAt ? new Date(co._updatedAt).getTime() : 0;
    if (localTs - dbTs <= 1000) {
      discardedStale++;
      continue;
    }

    // Apply localStorage fields onto the in-memory company so
    // patchToServer sends the user's pending edits.
    const savedSpi = snap.spi && snap.spi[code];
    if (savedSpi) {
      SPI_MUTABLE.forEach(k => {
        if (savedSpi[k] !== undefined) co[k] = savedSpi[k];
      });
    }
    const savedRa = snap.ra && snap.ra[code];
    if (savedRa && typeof RA !== 'undefined') {
      // snap.ra is keyed by company code, so it cannot represent a company
      // that owns one ra_records row per arrival — replaying it would push a
      // company-wide berat/realPct onto a single wave. Skip those; their
      // per-wave weights come from the source documents anyway.
      const mine = RA.filter(x => x.code === code);
      const r = mine.length > 1 ? null : mine[0];
      if (r) RA_MUTABLE.forEach(k => {
        if (savedRa[k] !== undefined) r[k] = savedRa[k];
      });
    }

    try {
      await patchToServer(co);
      pushed++;
    } catch (e) {
      const msg = (e && e.message) || String(e);
      if (/HTTP\s*409|conflict|diubah pengguna lain/i.test(msg)) {
        conflicts++;
      } else {
        failed++;
        failedCodes.add(code);
      }
    }
  }

  // Clear localStorage for pushed + discarded + conflict entries.
  // Keep only entries with a real network failure so they retry.
  if (failedCodes.size === 0) {
    clearStorage();
  } else {
    const filtered = { ts: new Date().toISOString(), ra: {}, spi: {} };
    failedCodes.forEach(c => {
      if (snap.ra && snap.ra[c])  filtered.ra[c]  = snap.ra[c];
      if (snap.spi && snap.spi[c]) filtered.spi[c] = snap.spi[c];
    });
    try { localStorage.setItem(LS_KEY, JSON.stringify(filtered)); } catch (_) {}
  }

  return { pushed, discardedStale, conflicts, failed };
}

/** Show a brief save confirmation toast */
function showSaveToast(ts) {
  let toast = document.getElementById('saveToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'saveToast';
    toast.style.cssText = 'position:fixed;bottom:80px;right:22px;background:var(--green);color:#fff;' +
      'font-size:12px;font-weight:600;padding:8px 16px;border-radius:var(--r);box-shadow:var(--sh2);' +
      'z-index:1100;opacity:0;transition:opacity .25s;pointer-events:none';
    document.body.appendChild(toast);
  }
  const d = ts ? new Date(ts) : new Date();
  toast.textContent = '✅ Saved — ' + d.toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'});
  toast.style.opacity = '1';
  setTimeout(() => { toast.style.opacity = '0'; }, 2500);
}

/** Manual Save button handler — saves and updates status display */
function manualSave() {
  const ts = saveToStorage();
  showSaveToast(ts);
  updateStorageStatus();
}

/** Reset All button handler — clears storage and reloads */
function confirmReset() {
  if (confirm('Reset all saved edits and reload from original data?\n\nThis cannot be undone.')) {
    clearStorage();
    location.reload();
  }
}

/** Update the storage status panel inside the Manage tab */
function updateStorageStatus() {
  const el = document.getElementById('storageStatus');
  if (!el) return;
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) {
      el.innerHTML = '<span style="color:var(--txt3)">⚪ No saved data yet — changes will be lost on refresh until you save.</span>';
      return;
    }
    const snap = JSON.parse(raw);
    const ts = snap.ts ? new Date(snap.ts).toLocaleString('en-GB',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : 'unknown';
    const raCodes = Object.keys(snap.ra || {}).join(', ') || '—';
    el.innerHTML = `<span style="color:var(--green);font-weight:700">💾 Data saved</span> · Last saved: <strong>${ts}</strong><br>
      <span style="color:var(--txt3);font-size:10.5px">Companies with saved state: ${raCodes}</span>`;
  } catch(e) {
    el.innerHTML = '<span style="color:var(--red)">⚠ Could not read storage status.</span>';
  }
}

/* ══════════════════════════════════════════════════
   OBTAIN (MT) vs UTILIZATION (MT) — CHART ENGINE
   Lead Time Standard: 14 days
   Lead Time = PERTEK Obtained Date → First Utilization Entry Date
   Status: Normal (≤14d) | Overdue/Revision (>14d or no util within 14d)
══════════════════════════════════════════════════ */

/* ── Centralized OU product color palette (management-friendly) ── */
/* ══════════════════════════════════════════════════
   SERVER PERSISTENCE — PATCH /api/company/:code
   Called after every saveEdit() to persist data
   permanently in PostgreSQL (survives refresh).
══════════════════════════════════════════════════ */

/* fetchWithRetry — retries 502/503/504 (transient Neon/PgBouncer hiccups)
   with exponential backoff up to ~18s total. Useful for Neon cold-starts
   where the first request can take several seconds before the DB instance
   wakes up. 408 (timeout) and network failures also retried.
   4xx other than these are NOT retried. */
async function fetchWithRetry(url, opts, attempts) {
  const RETRYABLE = new Set([408, 429, 502, 503, 504]);
  const BACKOFF = [500, 1500, 3000, 5000, 8000]; // total ≈ 18s across 5 attempts
  const max = attempts != null ? attempts : BACKOFF.length;
  let lastErr;
  for (let i = 0; i < max; i++) {
    try {
      const res = await fetch(url, opts);
      if (res.ok) return res;
      if (i < max - 1 && RETRYABLE.has(res.status)) {
        await new Promise(r => setTimeout(r, BACKOFF[i] || BACKOFF[BACKOFF.length-1]));
        continue;
      }
      return res; // non-retryable — let caller handle .ok=false
    } catch (e) {
      lastErr = e;
      if (i < max - 1) {
        await new Promise(r => setTimeout(r, BACKOFF[i] || BACKOFF[BACKOFF.length-1]));
        continue;
      }
    }
  }
  throw lastErr || new Error('fetchWithRetry: exhausted retries');
}

/* ── Create a new PENDING company on the server ──────────────────────
   Used by saveEdit when CorpSec adds a brand-new company (one that
   exists in company_directory but hasn't been entered into PENDING/SPI
   yet — e.g. PT IKM submitting its first MOI). Server creates the
   companies/company_products/pending_meta/cycles rows in one txn. */
async function createPendingOnServer(payload) {
  if (!payload || !payload.code) throw new Error('createPendingOnServer: code required');
  const res = await fetchWithRetry('api/company', {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error || `HTTP ${res.status}`);
    e.status = res.status;
    throw e;
  }
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════════════════
   MENYIMPAN IRISAN TAHUN — company yang memegang kuota lebih dari satu tahun.

   Irisan (sliceCompanyToYear) hanya memuat siklus, lot, dan total SATU tahun.
   Server justru menulis per COMPANY: PATCH /cycles mengganti seluruh siklus,
   shipments mengganti seluruh lot setiap produk yang dikirim, dan
   submit1/obtained/products adalah satu kolom per company. Jadi sebelum
   dikirim, irisan digabung kembali dengan tahun-tahun lain dari objek asal:

     · siklus  — allCyclesForSave(); siklus tahun lain yang belum bertahun
                 DIPATOK ke tahun efektifnya dulu, supaya tidak ikut dicap tahun
                 yang sedang dilihat (SNSD: dua siklus tanpa quota_year);
     · lot     — lot tahun lain + lot irisan, masing-masing membawa quotaYear;
                 nomor lot irisan yang bentrok dengan tahun lain (server
                 mencocokkan company+produk+nomor) diberi nomor baru;
     · total   — submit1/obtained dihitung ulang dari siklus gabungan;
     · produk  — gabungan.
   Field lain (permintaan Sales, status, catatan) memang tingkat company dan
   diambil dari irisan yang baru disunting.
   ═══════════════════════════════════════════════════════════════════════════ */
function _gabungIrisanTahun(co) {
  const asal = [...(typeof SPI_ALL !== 'undefined' ? SPI_ALL : []), ...(typeof PENDING_ALL !== 'undefined' ? PENDING_ALL : [])]
    .find(c => c && c.code === co.code && !c._quotaYearSliced);
  if (!asal) throw new Error(`Simpan ${co.code} dibatalkan — data asal lintas tahun tidak ditemukan.`);
  const y = QUOTA_YEAR;

  const tampil = new Set(co.cycles || []);
  let cycles = allCyclesForSave(co);
  cycles.forEach(c => {
    if (c && parseQuotaYear(c.quotaYear) == null) c.quotaYear = tampil.has(c) ? y : cycleQuotaYear(c);
  });
  /* Irisan bernomor per tahun (EMS 2027 "Submit #1") → kembalikan ke nama unik
     company ("Submit #4") sebelum dikirim; siklus baru diberi nama unik. */
  if (co._namaPerTahun && typeof namaUnikSiklus === 'function') {
    const lain = cycles.filter(c => !tampil.has(c));
    cycles = [...lain, ...namaUnikSiklus(co.cycles || [], lain)];
  }

  const shipments = {};
  const produkLot = new Set([...Object.keys(asal.shipments || {}), ...Object.keys(co.shipments || {})]);
  produkLot.forEach(prod => {
    const lain = ((asal.shipments || {})[prod] || [])
      .filter(l => rowQuotaYear(l) !== y)
      .map(l => Object.assign({}, l, { quotaYear: rowQuotaYear(l) }));
    const dipakai = new Set(lain.map(l => String(l.lotNo)));
    let maks = lain.reduce((m, l) => Math.max(m, Number(l.lotNo) || 0), 0);
    const ini = ((co.shipments || {})[prod] || []).map((l, i) => {
      if (l.lotNo == null || l.lotNo === '') l.lotNo = i + 1;
      if (dipakai.has(String(l.lotNo))) l.lotNo = ++maks;
      if (parseQuotaYear(l.quotaYear) == null) l.quotaYear = y;
      maks = Math.max(maks, Number(l.lotNo) || 0);
      dipakai.add(String(l.lotNo));
      return l;
    });
    if (lain.length || ini.length) shipments[prod] = [...lain, ...ini];
  });

  const kanon = p => (typeof canonicalProduct === 'function') ? canonicalProduct(String(p || '').trim()) : String(p || '').trim();
  const products = [...new Set([...(asal.products || []), ...(co.products || [])].map(kanon))].filter(Boolean);

  const merged = Object.assign({}, co, {
    cycles, shipments, products,
    _quotaYearSliced: false, _allCycles: undefined,
  });

  /* Kolom tingkat company milik TAHUN PERTAMA. Kalau yang disimpan irisan
     tahun lain, nilainya masuk perYear[tahun] dan kolomnya tetap milik tahun
     pertama — dulu tertimpa (EMS 09-Okt-2026: Approval Stage, Rev. Submit
     Date, Status Update 2026 berganti nilai 2027). */
  const primer = (typeof companyPrimaryYear === 'function') ? companyPrimaryYear({ cycles }) : y;
  merged.perYear = Object.assign({}, asal.perYear || {});
  if (y !== primer && typeof BIDANG_PER_TAHUN !== 'undefined') {
    merged.perYear[y] = ambilBidangTahun(co);
    Object.keys(BIDANG_PER_TAHUN).forEach(k => { merged[k] = asal[k]; });
  }
  merged.obtained = canonicalObtained(merged);
  merged.submit1  = canonicalSubmitted(merged);
  return { merged, asal };
}

async function _patchIrisanTahun(co) {
  const { merged, asal } = _gabungIrisanTahun(co);
  const hasil = await patchToServer(merged);

  /* Sinkronkan objek asal (sumber semua irisan) dengan yang baru tersimpan. */
  const khususIrisan = new Set(['cycles', 'shipments', 'utilCycles', '_quotaYearSliced', '_allCycles',
    'utilizationByProd', 'availableByProd', 'realizationByProd', 'etaByProd', 'arrivedByProd',
    'utilizationMT', 'availableQuota', 'obtained', 'submit1', '_canonicalObtained', '_canonicalSubmitted']);
  const tahunLain = (typeof companyPrimaryYear === 'function') && QUOTA_YEAR !== companyPrimaryYear({ cycles: merged.cycles });
  Object.keys(co).forEach(k => {
    if (khususIrisan.has(k)) return;
    if (tahunLain && typeof BIDANG_PER_TAHUN !== 'undefined' && k in BIDANG_PER_TAHUN) return;  // milik perYear
    asal[k] = co[k];
  });
  asal.perYear = merged.perYear;
  asal.cycles    = merged.cycles;
  asal.shipments = merged.shipments;
  asal.products  = merged.products;
  asal.obtained  = merged.obtained;
  asal.submit1   = merged.submit1;
  if (merged._updatedAt) { asal._updatedAt = merged._updatedAt; co._updatedAt = merged._updatedAt; }
  if (typeof applyQuotaYearSlice === 'function') applyQuotaYearSlice();
  return hasil;
}

async function patchToServer(co) {
  if (!co || !co.code) return;

  /* ── Pagar tahun kuota ───────────────────────────────────────────────────
     Payload di bawah menulis KOLOM TINGKAT COMPANY: obtained, utilizationMT,
     availableQuota, shipments, products. Kolom-kolom itu satu per company —
     lintas tahun — sementara `co` di sini bisa berupa IRISAN satu tahun.
     Menyimpannya apa adanya akan menimpa total lintas-tahun dengan angka satu
     tahun saja, dan yang hilang adalah tahun yang sedang tidak dilihat siapa
     pun. Karena itu penyimpanan dihentikan, bukan diteruskan dengan angka yang
     mungkin salah.

     Hari ini kondisi ini TIDAK PERNAH tercapai: seluruh siklus setiap company
     ada di satu tahun, jadi irisannya adalah objek aslinya sendiri. Pagar ini
     untuk saat company pertama benar-benar memegang kuota 2026 dan 2027
     sekaligus — dan ia harus sudah berdiri sebelum hari itu, bukan sesudah. */
  /* 08-Okt-2026 hari itu tiba (HDP mengajukan 2027). Irisan kini DISIMPAN,
     tapi lewat objek GABUNGAN semua tahun — lihat _gabungIrisanTahun(). Yang
     tetap dihentikan hanya penulisan stats per produk (_obtainedStats /
     _etaWrite): tabel company_product_stats belum mengenal tahun, jadi angka
     satu tahun akan menimpa produk yang sama milik tahun lain. */
  if (co._quotaYearSliced) {
    /* Stats per produk (company_product_stats) milik TAHUN PERTAMA company.
       Untuk tahun lain, Obtained/ETA per produk hidup di siklus & lot tahun itu
       (01a-quota-year.js menghitungnya dari sana) — jadi penulisan stats-nya
       tidak dikirim, bukan ditolak. Di tahun pertama tetap dikirim seperti
       biasa. (09-Okt-2026: dulu seluruh simpan ditolak.) */
    const primer = (typeof companyPrimaryYear === 'function') ? companyPrimaryYear({ cycles: allCyclesForSave(co) }) : QUOTA_YEAR;
    if (QUOTA_YEAR !== primer) { delete co._obtainedStats; delete co._etaWrite; }
    return _patchIrisanTahun(co);
  }

  // Build reapplyTargets array from co.reapplyByProd (or existing reapplyTargets)
  const reapplyTargets = co.reapplyByProd
    ? Object.entries(co.reapplyByProd).map(([product, targetMT]) => ({
        product, targetMT: targetMT || 0, submitted: false, submitDate: '', notes: ''
      }))
    : (co.reapplyTargets || []);

  // Build shipments payload (only lots with actual data)
  const shipPayload = {};
  if (co.shipments) {
    Object.entries(co.shipments).forEach(([prod, lots]) => {
      if (!lots || !lots.length) return;
      shipPayload[prod] = lots.map((l, i) => ({
        lotNo:        l.lotNo  || (i + 1),
        utilMT:       l.utilMT || 0,
        // WAJIB ikut. Server menulis SELURUH kolom baris lot: field yang tidak
        // dikirim ditulis '' — jadi payload tanpa utilDate MENGHAPUS tanggal
        // utilisasi setiap lot company ini, diam-diam. Itu yang membuat seisi
        // tab kehilangan tanggalnya (2026-08-10).
        utilDate:     l.utilDate || '',
        etaJKT:       l.etaJKT || '',
        note:         l.note   || '',
        realMT:       l.realMT || 0,
        pibDate:      l.pibDate || '',
        cargoArrived: l.cargoArrived || false,
        /* Tahun kuota lot — server memakai aturan ABSEN != KOSONG, jadi hanya
           dikirim bila memang diketahui (lot gabungan dua tahun). */
        ...(l.quotaYear != null ? { quotaYear: l.quotaYear } : {}),
      }));
    });
  }

  // Encode salesRevRequest + salesRevReqType into revNote for persistence
  /* `newSubmission` (pengajuan pertama perusahaan tanpa riwayat) ikut di amplop
     yang sama — itu satu-satunya kanal bebas-bentuk yang sudah ada, dan
     01-data.js membongkarnya kembali saat load. Amplopnya kini dibuat juga
     ketika HANYA newSubmission yang terisi; tanpa itu pengajuan perusahaan
     baru hilang begitu halaman dimuat ulang, karena salesRevRequest-nya kosong. */
  let salesRevJson = null;
  const adaRevReq = co.salesRevRequest && Object.keys(co.salesRevRequest).length;
  const adaReapplyReq = Array.isArray(co.reapplyRequests) && co.reapplyRequests.length;
  /* Pengajuan per tahun kuota (11a-pengajuan-tahun.js) ikut amplop yang sama. */
  const adaPerTahun = co.newSubmissionByYear && Object.keys(co.newSubmissionByYear).length;
  /* Kolom tingkat company untuk tahun selain tahun pertama (01a-quota-year.js). */
  const adaKolomTahun = co.perYear && Object.keys(co.perYear).length;
  if (adaRevReq || co.newSubmission || adaReapplyReq || adaPerTahun || adaKolomTahun) {
    const envelope = Object.assign({}, co.salesRevRequest || {});
    if (co.salesRevReqType) envelope._revisionType  = co.salesRevReqType;
    if (co.newSubmission)   envelope._newSubmission = co.newSubmission;
    if (adaReapplyReq)      envelope._reapplyRequests = co.reapplyRequests;
    if (adaPerTahun)        envelope._newSubmissionByYear = co.newSubmissionByYear;
    if (adaKolomTahun)      envelope._perYear = co.perYear;
    /* rev_note adalah SATU kolom: teks bebas ATAU amplop JSON. Begitu amplop
       ditulis, teks lama (HDP: "SPI Perubahan 2 Terbit 16/07/2026") hilang —
       server mengosongkan revNote untuk rev_note berbentuk JSON. Ikut dibawa
       di dalam amplop, dan dikembalikan oleh 01-data.js saat load. */
    const teksLama = String(co.revNote || '').trim();
    if (teksLama && !/^\s*\{/.test(teksLama)) envelope._revNoteTeks = teksLama;
    if (Object.keys(envelope).length) salesRevJson = JSON.stringify(envelope);
  }

  // ── SAFEGUARD: don't downgrade rev_type/rev_note/rev_status/etc when
  // the cycle data clearly shows an active or completed revision.
  // Without this, ANY save on a company-with-revision can silently wipe
  // rev_type='active' → 'none' if co.revType happens to be empty for
  // any reason (e.g. partial state, stale form draft, race condition).
  // The cycles are the ground truth — Revision Request — XXX + Obtained
  // #2 cycles always exist for revised companies, so we can detect this
  // and refuse to send the destructive 'none' value.
  let safeRevType   = co.revType   || 'none';
  let safeRevStatus = co.revStatus || '';
  let safeRevNote   = salesRevJson || co.revNote || '';
  const hasRevCycle = Array.isArray(co.cycles) && co.cycles.some(c =>
    (c && c.type && /^Revision Request — /i.test(c.type)) ||
    (c && c.type && /^obtained\s*#[2-9]/i.test(c.type)) ||
    (c && c.type && /^obtained.*revision/i.test(c.type))
  );
  if (hasRevCycle && safeRevType === 'none') {
    // Detect complete vs active by checking if any Obtained #N (N>=2)
    // has a non-TBA release date (SPI Perubahan terbit).
    const obt2Complete = co.cycles.some(c => c && c.type &&
      /^obtained\s*#[2-9]/i.test(c.type) &&
      c.releaseDate && c.releaseDate !== 'TBA');
    safeRevType = obt2Complete ? 'complete' : 'active';
    if (!safeRevStatus) {
      safeRevStatus = obt2Complete ? 'SPI Perubahan Terbit' : 'Revision Request dikonfirmasi';
    }
    console.warn(`[patchToServer ${co.code}] guard: revType was 'none' but cycles indicate revision — sending '${safeRevType}' instead`);
  }

  const body = {
    submit1:       co.submit1       != null ? co.submit1      : null,
    obtained:      co.obtained      != null ? co.obtained     : null,
    revType:       safeRevType,
    revNote:       safeRevNote,
    revSubmitDate: co.revSubmitDate || '',
    revStatus:     safeRevStatus,
    revMt:         co.revMT         || 0,
    remarks:       co.remarks       || '',
    spiRef:        co.spiRef        || '',
    statusUpdate:  co.statusUpdate  || '',
    pertekNo:      co.pertekNo      || '',
    spiNo:         co.spiNo         || '',
    // utilizationMt & availableQuota intentionally NOT sent — server-reconciled
    // via KPI_RECONCILE in server.js. Stale client snapshots used to overwrite
    // them, causing the dashboard to fight DB fixes on every page load.
    updatedBy:     co.updatedBy     || '',
    updatedDate:   co.updatedDate   || '',
    shipments:     shipPayload,
    reapplyTargets,
    // Per-product Obtained → reconcile company_product_stats server-side so the
    // KPI (cycles) and the per-product breakdown (stats) stay equal. Set only by
    // saveEdit for non-revision Obtained edits; absent otherwise.
    obtainedStats: Array.isArray(co._obtainedStats) && co._obtainedStats.length ? co._obtainedStats : undefined,
    /* ETA JKT per produk → company_product_stats.eta_jkt. Endpoint-nya sudah
       ada di server dan sengaja DATE-ONLY: menaruh ETA di lot shipment akan
       melewati recompute `baseline + lotSum`, yang MELIPATGANDAKAN utilisasi
       produk yang angkanya berasal dari master, bukan dari lot (SMS 150 -> 300).
       Sisi klien tidak pernah mengirimnya, jadi kolom itu hanya bisa diisi
       importer. Dikirim HANYA bila sengaja disiapkan — sama seperti
       _obtainedStats — supaya penyimpanan biasa tidak menyentuhnya. */
    etaByProd:     (co._etaWrite && Object.keys(co._etaWrite).length) ? co._etaWrite : undefined,
    // Sync the canonical company_products list. Without this, adding a
    // new product via "+Add Product" only writes to cycle_products via
    // patchCyclesToServer — the master products table stays stale and
    // some server queries see the OLD product list on reload.
    products:      Array.isArray(co.products) ? co.products.filter(Boolean) : null,
    // PENDING-specific fields land in the pending_meta table on the server.
    // Without these the NewSubmission row reverts to stale mt/status/date
    // after a refresh even though the user edited them.
    pendingMt:     co.mt != null ? co.mt : null,
    pendingStatus: co.status != null ? co.status : null,
    pendingDate:   co.date != null ? co.date : null,
    // Optimistic concurrency token — server rejects 409 if the row was
    // modified server-side after this timestamp (multi-user safety).
    _ifUpdatedAt:  co._updatedAt    || null,
  };

  const res = await fetchWithRetry(`api/company/${encodeURIComponent(co.code)}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });

  if (res.status === 409) {
    // Stale data — DB has been updated since this user last fetched.
    const err = await res.json().catch(() => ({}));
    const e = new Error(err.error || 'Data telah diubah pengguna lain — silakan refresh.');
    e.status = 409;
    e.currentUpdatedAt = err.currentUpdatedAt;
    throw e;
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const result = await res.json().catch(() => ({}));
  // Refresh local concurrency token from server response so subsequent
  // saves don't trip the 409 check.
  if (result && result.updatedAt) co._updatedAt = result.updatedAt;
  // One-shot payload — clear so it isn't re-sent on unrelated later saves.
  if (co._obtainedStats) delete co._obtainedStats;
  if (co._etaWrite)      delete co._etaWrite;
  // Also persist cycles array (Submit #1, Obtained #1, Obtained #2, etc.)
  if (co.cycles && co.cycles.length) {
    await patchCyclesToServer(co);
  }
  // Successful sync — drop this company's pending-buffer entry so it's
  // not re-pushed (potentially overwriting newer DB data) on next boot.
  if (typeof clearStorageForCode === 'function') clearStorageForCode(co.code);
  return result;
}

/* ── Patch cycles array to server (cycles table) ── */
async function patchCyclesToServer(co) {
  if (!co || !co.code || !Array.isArray(co.cycles)) return;
  /* ── SELURUH tahun, bukan cuma yang sedang tampil ────────────────────────
     PATCH /cycles MENGGANTI semua baris siklus company ini. Mengirim hasil
     irisan tahun akan MENGHAPUS siklus tahun lain dari sheet — kehilangan data
     diam-diam yang baru ketahuan saat tahunnya diganti kembali.
     allCyclesForSave() memulangkan siklus tahun yang tampil + tahun lainnya. */
  const sumber = (typeof allCyclesForSave === 'function') ? allCyclesForSave(co) : co.cycles;

  /* Siklus yang baru dibuat di layar belum bertahun. Dicap di sini — satu
     gerbang yang dilewati SEMUA jalur simpan — supaya tidak ada alur pembuat
     siklus yang bisa lupa. Dicap pada objeknya, bukan cuma pada salinan
     payload, supaya tampilan sesudah simpan langsung ikut tahun yang benar. */
  if (typeof parseQuotaYear === 'function') {
    /* Pada irisan, hanya siklus yang TAMPIL yang boleh mendapat tahun irisan;
       siklus tahun lain yang belum bertahun dipatok ke tahun efektifnya.
       (Irisan normalnya sudah lewat _gabungIrisanTahun, ini jaring kedua.) */
    const tampil = co._quotaYearSliced ? new Set(co.cycles || []) : null;
    sumber.forEach(c => {
      if (c && parseQuotaYear(c.quotaYear) == null) {
        c.quotaYear = (!tampil || tampil.has(c)) ? QUOTA_YEAR : cycleQuotaYear(c);
      }
    });
  }

  // Only send cycles that have meaningful data (not empty shells)
  const payload = sumber.map(c => ({
    type:        c.type        || '',
    mt:          c.mt          != null ? c.mt : null,
    submitType:  c.submitType  || '',
    submitDate:  c.submitDate  || '',
    releaseType: c.releaseType || '',
    releaseDate: c.releaseDate || '',
    status:      c.status      || '',
    products:    c.products    || {},
    // Include extra date fields that our cycle inline editor writes
    pertekDate:  c.pertekDate  || '',
    spiDate:     c.spiDate     || '',
    _fromRevReq: c._fromRevReq || false,
    quotaYear:   c.quotaYear   || null,
  }));
  const res = await fetchWithRetry(`api/company/${encodeURIComponent(co.code)}/cycles`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify({ cycles: payload }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

/* ── Also patch RA record if Operations updated realization ── */
async function patchRAToServer(co, ra) {
  if (!co || !co.code || !ra) return;
  const body = {
    ra: {
      berat:         ra.berat        || 0,
      obtained:      ra.obtained     || co.obtained || 0,
      cargoArrived:  ra.cargoArrived || false,
      realPct:       ra.realPct      || 0,
      utilPct:       ra.utilPct      != null ? ra.utilPct : null,
      arrivalDate:   ra.arrivalDate  || null,
      etaJKT:        ra.etaJKT       || null,
      reapplyEst:    ra.reapplyEst   || null,
      reapplyStage:  ra.reapplyStage || 1,
      reapplySubmitDate: ra.reapplySubmitDate || null,
      reapplyStatus: ra.reapplyStatus || null,
      target:        ra.target       != null ? ra.target : null,
      pertek:        ra.pertek       || null,
      spi:           ra.spi          || null,
      catatan:       ra.catatan      || null,
    }
  };
  const res = await fetchWithRetry(`api/company/${encodeURIComponent(co.code)}`, {
    method:  'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  const result = await res.json().catch(() => ({}));
  // Keep the concurrency token fresh: the server also bumps
  // companies.updated_at on this RA write, so without refreshing co._updatedAt
  // the NEXT patchToServer would send a stale _ifUpdatedAt and could trip a
  // false 409 ("modified by another user") even for the same user.
  if (result && result.updatedAt) co._updatedAt = result.updatedAt;
  return result;
}
/* ── nsShowToast: alias for showSaveToast used in 13-rev-mgmt.js ────────────
   nsShowToast is a notification-only toast (no timestamp) — shows a brief
   success/info message from revision management operations.                 */
function nsShowToast(msg) {
  const toast = document.getElementById('saveToast');
  if (!toast) return;
  const prev = toast.innerHTML;
  toast.innerHTML = `<span style="font-size:12px">${msg}</span>`;
  toast.classList.add('show');
  clearTimeout(toast._nsTimer);
  toast._nsTimer = setTimeout(() => {
    toast.classList.remove('show');
    toast.innerHTML = prev;
  }, 2200);
}
