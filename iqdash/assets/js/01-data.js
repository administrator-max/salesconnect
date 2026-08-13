/* ═══════════════════════════════════════
   DATA & SHARED STATE
   Global arrays SPI/PENDING/RA + base helpers
═══════════════════════════════════════ */


/* ══════════════════════════════════════════════════
   DATA — MASTER RECORDS
══════════════════════════════════════════════════ */

/* SPI Companies */
// ── CYCLE HELPERS ──────────────────────────────────────────
// Each SPI company now carries a `cycles` array that mirrors the Excel
// structure exactly:  Submit #1 → Obtained #1 → [Submit #2 → Obtained #2]
//                     [Revision #1 → Obtained (Revision #1)]
// Every cycle entry has: type, mt, products (object), submitDate, submitType,
//                        releaseDate, releaseType, status
// Date strings are 'DD/MM/YYYY' or 'TBA' or null.
// ───────────────────────────────────────────────────────────


/* ══════════════════════════════════════════════════
   DATA — Loaded from PostgreSQL via API
   (replaces hardcoded SPI / PENDING / RA arrays)
══════════════════════════════════════════════════ */
let SPI     = [];
let PENDING = [];
let RA      = [];
let _dataLoaded = false;

/* PRODUCT_META — populated by loadData() from /api/data .products
   Shape: { 'GL BORON': { hsCode, colorSolid, colorLight, colorText, sortOrder }, ... }
   Read by pc() and prodHS() helpers below. Falls back to PROD_COLORS
   constant if the API didn't return product metadata (e.g. older server). */
let PRODUCT_META = {};
/* PRODUCT_ALIASES — variant → canonical name. Sourced from DB
   `product_aliases` table; lets us render 'GI Boron' or 'GL' from RA records
   as the canonical 'GI BORON'/'GL BORON' for color lookup, etc. */
let PRODUCT_ALIASES = {};
const canonicalProduct = p => (p && PRODUCT_ALIASES[p]) || p;

/* Nama produk untuk DITAMPILKAN. Selalu bentuk kanonik.

   Alasannya diminta langsung oleh pemilik data 2026-08-12: "GI Alloy dan GI
   Boron itu SAMA artinya, tolong penamaan diseragamkan ke GI ALLOY."

   Kenapa perlu helper terpisah padahal sudah ada canonicalProduct(): dua ejaan
   itu hidup berdampingan di sumber yang berbeda — `cycles[].products` dan
   `salesRevRequest` menyimpan ejaan ledger (GI BORON / SHEETPILE), sedangkan
   company_product_stats sudah kanonik (GI ALLOY / SHEET PILE). Selama ini yang
   dikanonikkan hanya jalur agregasi angka; jalur TAMPILAN dibiarkan mentah,
   sehingga satu produk yang sama muncul dengan dua nama di layar — persis kelas
   masalah "satu hal, dua tampilan" yang sedang dibereskan di seluruh dashboard.

   Sengaja TIDAK menulis ulang data tersimpan: ejaan di DB adalah urusan
   migrasi tersendiri, dan menormalkannya diam-diam lewat jalur simpan akan
   mengubah data tanpa diminta. Ini murni lapisan tampilan. */
const prodLabel = p => {
  const s = (p == null ? '' : String(p)).trim();
  if (!s) return s;
  const c = canonicalProduct(s);
  if (c && c !== s) return c;
  // Ejaan yang tidak ada di peta alias tapi beda kapitalisasi/spasi saja.
  const hit = Object.keys(PRODUCT_ALIASES || {}).find(k => k.toLowerCase() === s.toLowerCase());
  return hit ? PRODUCT_ALIASES[hit] : s;
};

/* Daftar produk untuk DIPILIH di form (dropdown produk tujuan revisi, dll).

   Sumbernya MASTER PRODUK (`PRODUCT_META`, dari tabel products di DB) — bukan
   `PROD_COLORS`, yang cuma peta warna tampilan.

   Dilaporkan tim 2026-08-13: CorpSec mau input revisi ke CRC ALLOY /
   FABRICATED STEEL PAINTED FRAME tapi keduanya tidak ada di dropdown. Padahal
   keduanya SUDAH terdaftar di master produk lengkap dengan HS code-nya. Yang
   kurang cuma satu: warnanya belum pernah didaftarkan di PROD_COLORS — dan
   dropdown-nya dibangun dari peta warna itu. Jadi sebuah produk bisa sah ada di
   master tapi mustahil dipilih, hanya karena belum diberi warna.

   Ejaan lama (GI BORON, SHEETPILE, ERW PIPE OD≤140mm, HRC/HRPO ALLOY) sengaja
   TIDAK ikut: master produk sudah kanonik, dan menampilkan dua ejaan untuk satu
   produk persis keluhan yang dibereskan 2026-08-12 (GI ALLOY vs GI BORON
   muncul sebagai dua kartu).

   `extra` untuk produk yang sedang DIPEGANG company tapi belum ada di master —
   supaya tidak ada nilai tersimpan yang mendadak tak bisa dipilih. */
const selectableProducts = (extra) => {
  const out = new Map();                       // kanonik -> nama tampil
  const tambah = p => {
    const s = String(p == null ? '' : p).trim();
    if (!s) return;
    const k = canonicalProduct(s);
    if (!out.has(k)) out.set(k, k);
  };
  Object.keys(PRODUCT_META || {}).forEach(tambah);
  (extra || []).forEach(tambah);
  return [...out.values()].sort((a, b) => a.localeCompare(b));
};

/* Kanonikkan nama produk yang TERTANAM di dalam label yang dibangun sistem —
   mis. cycle type "Revision Request — GI BORON". Di situ nama produk bukan
   field tersendiri melainkan bagian dari string, jadi prodLabel() tidak bisa
   dipakai langsung.

   HANYA untuk teks yang dibuat sistem. Catatan bebas yang DIKETIK orang
   (remarks, status update, note) sengaja TIDAK disentuh: itu rekaman apa yang
   ditulis seseorang pada satu waktu, dan menulis ulangnya berarti mengubah
   arsip — bukan menyeragamkan tampilan. */
const canonProdInText = s => {
  let out = (s == null ? '' : String(s));
  if (!out) return out;
  Object.keys(PRODUCT_ALIASES || {})
    .sort((a, b) => b.length - a.length)          // cocokkan yang terpanjang dulu
    .forEach(k => {
      const target = PRODUCT_ALIASES[k];
      if (!target || target === k) return;
      out = out.replace(new RegExp('\\b' + k.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b', 'gi'), target);
    });
  return out;
};

/* COMPANY_DIRECTORY — master list of companies from company.xlsx (DB-backed).
   Two derived maps for O(1) lookup:
     COMPANY_NAME_TO_CODE: lowercased fullName → 3-letter code
     COMPANY_CODE_TO_NAME: code → fullName
   Used by realization import (filename → code) and by manual entry forms. */
let COMPANY_DIRECTORY    = [];
let COMPANY_NAME_TO_CODE = {};
let COMPANY_CODE_TO_NAME = {};
const lookupCompanyCodeByName = nm => nm ? COMPANY_NAME_TO_CODE[String(nm).trim().toLowerCase()] || null : null;
const lookupCompanyNameByCode = code => code ? COMPANY_CODE_TO_NAME[String(code).toUpperCase()] || '' : '';

/* REALIZATION_SUMMARY — { CODE: { pibs, lines } } map indicating which
   companies have realization data in DB. Used by the drawer to decide
   whether to show the "Detail Realization" button (and what badge to
   render). Loaded once at boot via /api/realizations/summary; cached
   30s on the server side. */
let REALIZATION_SUMMARY = {};
async function loadRealizationSummary() {
  try {
    const res = await fetch('api/realizations/summary');
    if (!res.ok) return;
    const data = await res.json();
    REALIZATION_SUMMARY = (data && data.counts) || {};
  } catch (err) {
    console.warn('loadRealizationSummary failed:', err);
  }
}
const hasRealizationData = code => !!(REALIZATION_SUMMARY && REALIZATION_SUMMARY[code]);

/* REALIZATIONS — every deduped PIB line (volume + pib_date + company_code).
   The Total Realized KPI is defined on this, not on ra_records: the report
   spec reads realized volume from the PIB data. Left EMPTY on failure so
   03-kpis.js can fall back to the old ra_records path rather than show zero.
   ~160 KB, fetched once at boot in parallel with /api/data. */
let REALIZATIONS = [];
async function loadRealizations() {
  try {
    const res = await fetch('api/realizations');
    if (!res.ok) return;
    const data = await res.json();
    REALIZATIONS = Array.isArray(data && data.realizations) ? data.realizations : [];
    window.REALIZATIONS = REALIZATIONS;
  } catch (err) {
    console.warn('loadRealizations failed:', err);
  }
}

async function loadData() {
  try {
    const res  = await fetch('api/data');
    const data = await res.json();
    const _dedup = (arr) => {
      const seen = new Set();
      return arr.filter(c => { if (seen.has(c.code)) return false; seen.add(c.code); return true; });
    };
    SPI     = _dedup(data.spi     || []);
    PENDING = _dedup(data.pending || []);
    RA      = data.ra      || [];
    // Server-provided data-edit time (same for every device). Rendered as the
    // "Last update" label — replaces the old per-device wall clock.
    window.LAST_DATA_UPDATE = data.lastUpdate || null;
    if (typeof renderLastUpdate === 'function') renderLastUpdate();
    // Capture concurrency token (server's updated_at). Used by patchToServer
    // as `_ifUpdatedAt` so server can reject stale writes (HTTP 409) when
    // another user has modified the row since this fetch.
    [SPI, PENDING].forEach(arr => arr.forEach(co => {
      if (co && co.updatedAt) co._updatedAt = co.updatedAt;
    }));
    // Product master metadata — index by name for O(1) lookup
    PRODUCT_META = {};
    (data.products || []).forEach(p => { if (p && p.name) PRODUCT_META[p.name] = p; });
    // Variant → canonical map (e.g. 'GI Boron' → 'GI BORON')
    PRODUCT_ALIASES = data.productAliases || {};

    /* ── Kanonikkan nama produk di SIKLUS, sekali di sini ────────────────
       `company_product_stats` sudah kanonik ("GI ALLOY"), tapi
       `cycles[].products` menyimpan ejaan ledger ("GI BORON", "SHEETPILE",
       "GL BORON"). Setiap permukaan yang menampilkan produk siklus lalu
       memunculkan ejaan lama: breakdown Obtained, tooltip siklus, kolom
       Products di PDF, sheet "Submission Cycles" di Excel, tabel Realization.

       Diperbaiki di SATU tempat, bukan di belasan titik render. Empat putaran
       tambal per-titik sebelumnya membuktikan pendekatan itu selalu menyisakan
       satu yang terlewat — dan yang terlewat terakhir justru muncul di PDF dan
       Excel yang dikirim ke manajemen.

       Ini normalisasi DI MEMORI. Baris DB baru ikut kanonik kalau company itu
       memang di-save; tidak ada penulisan massal. Idempoten — memanggilnya
       ulang atas data yang sudah kanonik tidak mengubah apa pun. */
    [SPI, PENDING].forEach(arr => arr.forEach(co => {
      (co.cycles || []).forEach(c => {
        if (!c || !c.products) return;
        const rapi = {};
        Object.entries(c.products).forEach(([p, v]) => {
          const k = canonicalProduct(String(p).trim());
          rapi[k] = (typeof rapi[k] === 'number' && typeof v === 'number') ? rapi[k] + v : v;
        });
        c.products = rapi;
      });
      if (Array.isArray(co.products)) {
        co.products = [...new Set(co.products.map(p => canonicalProduct(String(p).trim())))];
      }
    }));

    // Company directory from DB (fed by company.xlsx)
    COMPANY_DIRECTORY    = data.companyDirectory || [];
    COMPANY_NAME_TO_CODE = {};
    COMPANY_CODE_TO_NAME = {};
    COMPANY_DIRECTORY.forEach(d => {
      if (d.fullName)     COMPANY_NAME_TO_CODE[d.fullName.toLowerCase()] = d.abbreviation;
      if (d.abbreviation) COMPANY_CODE_TO_NAME[d.abbreviation.toUpperCase()] = d.fullName;
    });
    // β-1: utilizationByProd AND availableByProd come straight from the server
    // payload (company_product_stats), refreshed from the master file via
    // importMasterStats.js. The master already encodes post-revision NET per
    // product in its Utilization + Available rows, so the client does NOT
    // recompute or re-derive them. Per-product net obtained = util + avail
    // (see getObtainedByProdAgg). company-level utilizationMT / availableQuota
    // stay SERVER-RECONCILED via KPI_RECONCILE. revision_changes is UI-only now
    // (drawer + revision management) — the aggregator no longer reads it.
    //
    // Previous bug: this block iterated getObtainedByProd(co) keys and looked
    // up co.shipments[prod] — but cycle product names and shipment lot product
    // names can diverge (legacy alias vs canonical). Mismatched lots returned
    // undefined → 0 MT, silently dropping 2,037.5 MT system-wide. The local
    // recompute then OVERWROTE the correct API values with the undercount.
    // Trust the server payload — it already reflects XLSX truth.
    // Also override raw co.obtained / co.submit1 with the aggregated canonical
    // totals (Obtained #1 + Obtained #2 + …, Submit #1 + Submit #2 + Revision #N).
    // Per request 30-Apr-2026: every dashboard section should reflect the
    // aggregate, not just the legacy single-cycle DB column.
    [SPI, PENDING].forEach(arr => arr.forEach(co => {
      const canonObt = canonicalObtained(co);
      if (canonObt > 0) {
        co._canonicalObtained = canonObt;
        co.obtained = canonObt;
      }
      const canonSub = canonicalSubmitted(co);
      if (canonSub > 0) {
        co._canonicalSubmitted = canonSub;
        co.submit1 = canonSub;
      }
    }));

    // ── Read-only drift guard (observes only — no data change, no rewiring) ──
    // "Obtained" is computed two ways: cycles (canonicalObtained → KPI totals)
    // vs stats (getObtainedByProdAgg = util+avail → per-product breakdowns).
    // They must agree; they silently diverged before (SJH/LCP/BBB) when an
    // obtained cycle was added without syncing company_product_stats. This only
    // detects + warns so drift is caught early. Run __auditObtained() in the
    // console anytime for the list. Re-sync via "📌 Catat Terbit" (record-obtained).
    try {
      const _drift = [];
      [SPI, PENDING].forEach(arr => arr.forEach(co => {
        const cyc = Number(canonicalObtained(co)) || 0;
        const agg = getObtainedByProdAgg(co) || {};
        let st = 0; Object.values(agg).forEach(v => st += Number(v) || 0);
        if (Math.abs(cyc - st) > 0.5) _drift.push({ code: co.code, cycles: Math.round(cyc), stats: Math.round(st), diff: Math.round(cyc - st) });
      }));
      window.__obtainedDrift = _drift;
      if (_drift.length) {
        console.warn(`[obtained-drift] ${_drift.length} company(ies): cycles-obtained ≠ stats-obtained — KPI total won't match the per-product breakdown. Re-sync via "Catat Terbit":`, _drift);
      }
    } catch (e) { /* a guard must never break data loading */ }
    window.__auditObtained = () => (typeof window.__obtainedDrift !== 'undefined' ? window.__obtainedDrift : []);

    _dataLoaded = true;
  } catch(err) {
    console.error('Failed to load data from API:', err);
    showDataError();
  }
}

function showDataError() {
  document.body.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;background:#f0f2f5">
    <div style="text-align:center;padding:40px;background:#fff;border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,.1)">
      <div style="font-size:40px;margin-bottom:12px">⚠️</div>
      <h2 style="color:#182644;margin:0 0 8px">Unable to connect to server</h2>
      <p style="color:#64748b;margin:0 0 20px">Could not load quota data. Please check your connection.</p>
      <button onclick="location.reload()" style="background:#182644;color:#fff;border:none;padding:10px 24px;border-radius:6px;cursor:pointer;font-size:14px">Retry</button>
    </div>
  </div>`;
}

/* ════════════════════════════════════════════════════════════════════
   fmtDateStd — Normalize ANY date string to a single display format.
   ─────────────────────────────────────────────────────────────────────
   Output: 'DD-MMM-YY' (e.g. '29-Apr-26'). Always 2-digit day, English
   3-letter month with capital initial, 2-digit year. Easy to scan,
   sort-friendly when paired with year context, and unambiguous (vs.
   '02/03/26' which can read as March 2 or Feb 3).
   ─────────────────────────────────────────────────────────────────────
   Accepts every quirky format already in the DB:
     • ISO  'YYYY-MM-DD'             → 2026-05-13
     • Slash 'DD/MM/YYYY' / 'D/M/YY' → 12/05/2026, 7/5/26
     • Dash  'DD-MM-YYYY'            → 12-05-2026
     • English long  'DD Mmm YYYY'   → 29 Apr 2026, 29 April 2026
     • Indonesian long 'DD Mmm YYYY' → 07 Mei 2026, 07 Agustus 2026
     • Already normalized            → 29-Apr-26 (pass-through)
     • Mixed case / extra whitespace → handled
   Returns the original string unchanged if it can't parse, or '' for
   empty input / TBA. NEVER throws. Safe to call on null/undefined.
   ═══════════════════════════════════════════════════════════════════ */
const _MONTHS_EN_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const _MONTH_NAME_MAP = {
  // English short + long
  jan:1, january:1, feb:2, february:2, mar:3, march:3,
  apr:4, april:4, may:5, jun:6, june:6, jul:7, july:7,
  aug:8, august:8, sep:9, sept:9, september:9,
  oct:10, october:10, nov:11, november:11, dec:12, december:12,
  // Indonesian short + long
  mei:5, agu:8, agust:8, agustus:8, okt:10, oktober:10,
  des:12, desember:12,
  // Indonesian variants of others
  januari:1, februari:2, maret:3, juni:6, juli:7, november_id:11
};

function fmtDateStd(input) {
  if (input == null) return '';
  let s = String(input).trim();
  if (!s || /^(TBA|null|undefined|—|-)$/i.test(s)) return s === 'TBA' ? 'TBA' : '';

  let d = null, m = null, y = null;

  // Pass 1: ISO  YYYY-MM-DD
  let mm = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (mm) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }

  // Pass 2: slash/dash  DD[/-]MM[/-]YYYY  or  DD[/-]MM[/-]YY
  if (d == null) {
    mm = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (mm) {
      d = +mm[1]; m = +mm[2]; y = +mm[3];
      if (y < 100) y += 2000;
    }
  }

  // Pass 3: word month  DD Mmm YYYY  or  DD-Mmm-YY (also already normalized)
  if (d == null) {
    mm = s.match(/^(\d{1,2})[\s\-\/]+([A-Za-z]+)[\s\-\/]+(\d{2,4})$/);
    if (mm) {
      d = +mm[1];
      const monKey = mm[2].toLowerCase();
      m = _MONTH_NAME_MAP[monKey] || null;
      y = +mm[3];
      if (y < 100) y += 2000;
    }
  }

  // Validate
  if (d == null || m == null || y == null || isNaN(d) || isNaN(m) || isNaN(y) ||
      d < 1 || d > 31 || m < 1 || m > 12 || y < 1900 || y > 2999) {
    return s; // give up — return original so user still sees something
  }

  const dd  = String(d).padStart(2, '0');
  const mon = _MONTHS_EN_SHORT[m - 1];
  const yy  = String(y).slice(-2);
  return `${dd}-${mon}-${yy}`;
}

/* todayStd — current date in the canonical 'DD-MMM-YY' format. Use this
   whenever new dates are stamped onto records (revision confirmations,
   updates) so the data uniformly matches the display format. */
function todayStd() {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mon = _MONTHS_EN_SHORT[d.getMonth()];
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}-${mon}-${yy}`;
}

/* ── _fmtMT: format float MT values with up to 2 decimal places, no trailing zeros ── */
function _fmtMT(val) {
  if (val == null || isNaN(val)) return '0';
  const n = Number(val);
  const dec = n % 1 === 0 ? '' : ('.' + n.toFixed(2).split('.')[1].replace(/0+$/, ''));
  return Math.floor(n).toLocaleString(MT_LOCALE) + dec;
}

/* ── PRODUCT COLORS — final source of truth for chart/badge colors.
   Includes both the older names (GL BORON, SHEETPILE, …) and the new
   Excel-canonical names (GL ALLOY, SHEET PILE, …) so the dashboard
   renders correctly whichever name a row uses. PRODUCT_META from the
   DB is consulted first, but only when its colorSolid is NOT the
   gray placeholder default — products inserted via import-libraries
   without explicit colors take this column default and we want the
   palette below to win in that case. ── */
const PROD_COLORS = {
  // Legacy names (kept for existing cycle_products / ra_records data)
  'GL BORON':           {solid:'#0369a1', light:'#e0f2fe', text:'#0369a1'},
  'GI BORON':           {solid:'#0f766e', light:'#ccfbf1', text:'#0f766e'},
  'SHEETPILE':          {solid:'#b45309', light:'#fef9c3', text:'#92400e'},
  'ERW PIPE OD≤140mm':  {solid:'#9333ea', light:'#f3e8ff', text:'#6b21a8'},
  'ERW PIPE OD>140mm':  {solid:'#0891b2', light:'#e0f7fa', text:'#155e75'},
  'HRC/HRPO ALLOY':     {solid:'#ca8a04', light:'#fef3c7', text:'#92400e'},
  // Excel canonical names (matches product.xlsx — preferred going forward)
  'GL ALLOY':           {solid:'#0369a1', light:'#e0f2fe', text:'#0369a1'},
  'GI ALLOY':           {solid:'#0f766e', light:'#ccfbf1', text:'#0f766e'},
  'SHEET PILE':         {solid:'#b45309', light:'#fef9c3', text:'#92400e'},
  'SHEET PILE (INTERLOCKS)': {solid:'#c2410c', light:'#fff7ed', text:'#9a3412'},
  'ERW PIPE (OD ≤ 140 mm)':  {solid:'#9333ea', light:'#f3e8ff', text:'#6b21a8'},
  'ERW PIPE (OD > 140mm)':   {solid:'#0891b2', light:'#e0f7fa', text:'#155e75'},
  'HRPO ALLOY':         {solid:'#ca8a04', light:'#fef3c7', text:'#92400e'},
  'HRC ≥3 mm to <4.75 mm':  {solid:'#0369a1', light:'#e0f2fe', text:'#0369a1'},
  'HRC <3 mm':          {solid:'#0284c7', light:'#e0f2fe', text:'#0369a1'},
  'ZAM ALLOY':          {solid:'#a16207', light:'#fef9c3', text:'#854d0e'},
  'ZAM >1.2 mm to ≤1.5 mm': {solid:'#fbbf24', light:'#fef9c3', text:'#854d0e'},
  'ZAM >1.5 mm':        {solid:'#f59e0b', light:'#fef3c7', text:'#92400e'},
  'GI CARBON':          {solid:'#0d9488', light:'#ccfbf1', text:'#0f766e'},
  'GL CARBON':          {solid:'#0284c7', light:'#e0f2fe', text:'#0369a1'},
  'GL SLIT':            {solid:'#1e56c6', light:'#eff4ff', text:'#1e3a8a'},
  'BEAM ALLOY':         {solid:'#475569', light:'#f1f5f9', text:'#334155'},
  'CHANNEL':            {solid:'#9333ea', light:'#f3e8ff', text:'#6b21a8'},
  'BEAM':               {solid:'#a855f7', light:'#f3e8ff', text:'#6b21a8'},
  'ANGLE':              {solid:'#d946ef', light:'#fae8ff', text:'#86198f'},
  'STRUCTURAL STEEL':   {solid:'#525252', light:'#f5f5f5', text:'#404040'},
  // Names shared between legacy and Excel
  'BORDES ALLOY':       {solid:'#dc2626', light:'#fee2e2', text:'#991b1b'},
  'AS STEEL':           {solid:'#64748b', light:'#f1f5f9', text:'#475569'},
  'PPGL CARBON':        {solid:'#7c3aed', light:'#ede9fe', text:'#5b21b6'},
  'HOLLOW PIPE':        {solid:'#78716c', light:'#f5f5f4', text:'#57534e'},
  'SEAMLESS PIPE':      {solid:'#0d6946', light:'#d1fae5', text:'#065f46'},
  /* Tiga produk ini sudah lama ada di master produk (lengkap dengan HS code)
     tapi belum pernah didaftarkan di sini. Peta ini hanya WARNA — tapi dulu
     dropdown "Produk Tujuan" dibangun darinya, sehingga ketiganya mustahil
     dipilih meski sah. Dropdown-nya kini bersumber dari master produk
     (selectableProducts()); warnanya ditambahkan supaya tampilannya seragam,
     bukan lagi sebagai syarat agar produknya bisa dipakai. */
  'CRC ALLOY':                     {solid:'#0e7490', light:'#cffafe', text:'#155e75'},
  'WELDED STAINLESS STEEL PIPE':   {solid:'#4338ca', light:'#e0e7ff', text:'#3730a3'},
  'FABRICATED STEEL PAINTED FRAME':{solid:'#b45309', light:'#fef3c7', text:'#92400e'},
};
const _PC_DEFAULT_GRAY = '#64748b';
/* Single source of truth for product colors. Resolves aliases first
   ('GI Boron' → 'GI ALLOY'), then prefers a non-default DB color, then
   falls back to PROD_COLORS by canonical or original name. */
const pc = p => {
  const cp = canonicalProduct(p);
  const m  = PRODUCT_META[cp];
  // Trust DB color only when it's been customized — products inserted
  // via import-libraries without explicit colors take the gray default.
  if (m && m.colorSolid && m.colorSolid !== _PC_DEFAULT_GRAY) {
    return { solid: m.colorSolid, light: m.colorLight, text: m.colorText };
  }
  return PROD_COLORS[cp] || PROD_COLORS[p] || { solid: _PC_DEFAULT_GRAY, light:'#f1f5f9', text:'#475569' };
};
/* HS code lookup — prefers DB, resolves aliases, falls back to hardcoded. */
const prodHS = p => {
  const cp = canonicalProduct(p);
  const m = PRODUCT_META[cp];
  if (m && m.hsCode) return m.hsCode;
  if (typeof PROD_HS_CODES !== 'undefined') return PROD_HS_CODES[cp] || PROD_HS_CODES[p] || '—';
  return '—';
};

/* ── HELPERS ── */
/* A company can clear customs in several waves, so ra_records may hold MORE
   THAN ONE row per company — one per arrival. RA.find() would silently return
   whichever came first in sheet order and hide the rest. Return the LATEST
   arrival instead: that is the row callers mean by "this company's
   realization" (most recent state), and it is deterministic. Callers needing
   every wave should filter RA by code themselves. */
const getRA  = c => {
  const rows = RA.filter(r => r.code === c);
  if (rows.length < 2) return rows[0];
  const key = r => {
    const d = (typeof raDate === 'function') ? raDate(r.arrivalDate) : null;
    return d ? d.getTime() : -Infinity;
  };
  return rows.reduce((best, r) => (key(r) >= key(best) ? r : best), rows[0]);
};
/* Every arrival wave for a company, in sheet order. */
const getRAWaves = (c, pool) => (pool || RA).filter(r => r.code === c);

/* Company-level totals across arrival waves. Anything that reports ONE number
   per company (exports, monitoring rows) must use this rather than a single
   row: `berat` is per-wave, so taking one row under-reports a multi-wave
   company and writing a company total into one row double-counts against its
   siblings — the hazard guarded on the read side at iqdash_data.php:460.
   `multi` is the signal that per-wave weights are authoritative and a
   company-wide figure must not be written back to a single row. */
function raTotals(c, pool) {
  const rows = getRAWaves(c, pool);
  const arrived = rows.some(r => r.cargoArrived);
  const berat = rows.reduce((s, r) => s + (Number(r.berat) || 0), 0);
  return {
    rows,
    count:   rows.length,
    multi:   rows.length > 1,
    arrived,
    berat,
    utilMT:  arrived ? 0 : berat,
    realMT:  arrived ? berat : 0,
  };
}

const getSPI = c => SPI.find(s => s.code === c);
/* Stage 2: Re-Apply already submitted — PERTEK Pending / On Process */
const isReapplySubmitted = r => r && r.reapplyStage === 2;
/* Eligibility: Realization ≥ 60% AND cargo arrived AND NOT yet submitted re-apply */
const isEligible = r => r && r.realPct >= 0.6 && r.cargoArrived === true && !isReapplySubmitted(r);

/* ════════════════════════════════════════════════════════════════════
   _isObtainedTerbit — predicate: cycle is countable as "obtained".
   Rules align with XLSX master semantics (12-May-2026 sheet):
     • Obtained #1: ALWAYS counted when mt > 0 (PERTEK approval ≈ implicit;
       absence of date in DB usually = data-entry catch-up, not "not yet
       obtained"). XLSX includes AADC/KARA Obt1 even with release=TBA.
     • Obtained #2+: counted only if release_date is NOT explicitly "TBA".
       Excludes BHG/HKG/MIN/SGD/SJH (PERTEK Perubahan still pending).
       Accepts release_date holding an SPI number (e.g. "04.PI-…") when
       paired with spi_date — that's the user convention for "terbit".
   This eliminates the GKL/BHG/etc. double-counting bug (was inflating
   canonical obtained by ~12,350 MT vs XLSX truth).
   ═══════════════════════════════════════════════════════════════════ */
/* ════════════════════════════════════════════════════════════════════
   _RATIONALE_FROM_REV_REQ — kenapa `_fromRevReq` tidak lagi menggugurkan
   siklus OBTAINED (tetap berlaku untuk SUBMIT).

   Dilaporkan pemilik data 2026-08-12: "obtained quota re-apply yg seharusnya
   otomatis masuk juga kedalam available quota". Dugaan itu BENAR, dan
   penelusuran pertama saya keliru menyimpulkan tidak ada masalah — saya
   memeriksa company yang siklusnya datang dari import master (di sana re-apply
   memang terhitung), dan melewatkan siklus yang dibuat lewat UI Revision
   Management.

   Mekanismenya: rrApplyObtained() / rrMarkApproved() / rrSaveStatus() di
   13-rev-mgmt.js MEMBUAT placeholder

       { type:'Obtained #2', mt:null, releaseDate:'TBA', _fromRevReq:true }

   lalu alur yang sama mengisi `mt`, `products`, dan tanggal SPI/PERTEK-nya
   ketika kuotanya benar-benar terbit — tetapi TIDAK PERNAH membersihkan
   penandanya. Karena `canonicalObtained` menggugurkan `_fromRevReq` tanpa
   syarat, kuota re-apply yang dicatat lewat form itu jadi PERMANEN tidak
   terlihat: tidak masuk Obtained, karena itu tidak pernah muncul di Available.

   Penandanya menandai PLACEHOLDER, bukan "bukan obtained". Begitu siklusnya
   punya MT nyata dan tanggal terbit nyata, ia obtained yang sah. Uji itu sudah
   ada dan tidak perlu penanda: gerbang `mt <= 0` dan `_isObtainedTerbit()`.
   Placeholder murni (mt null, tanggal TBA) tetap gugur di sana.

   Tidak ada risiko hitung ganda: canonicalObtained hanya menjumlah tipe
   /^obtained #/, sedangkan siklus "Revision Request — <produk>" bukan tipe itu.

   Diperbaiki di sisi BACA, bukan sisi tulis — supaya seluruh data yang sudah
   telanjur bertanda ikut pulih tanpa migrasi.
   ═══════════════════════════════════════════════════════════════════ */
function _isObtainedTerbit(c, allCycles) {
  if (!c) return false;
  // Obtained #1 → trust mt > 0 (no extra date gate). Matches XLSX.
  if (/^obtained\s*#?1\b/i.test(c.type || '')) return true;
  // Obtained #2+ → skip when release_date is explicitly TBA / empty AND
  // no fallback spi_date / pertek_date is populated.
  const rd = String(c.releaseDate || '').trim();
  const isTBA = !rd || /^(TBA|null|undefined|—)$/i.test(rd);
  if (!isTBA) return true; // any non-TBA release_date counts as terbit
  // release_date is TBA — accept if spi_date or pertek_date is filled
  const sd = String(c.spiDate || '').trim();
  const pd = String(c.pertekDate || '').trim();
  if ((sd && !/^TBA$/i.test(sd)) || (pd && !/^TBA$/i.test(pd))) return true;
  /* Still nothing on the row itself — fall back to the PERTEK Terbit date of
     the paired Submit cycle. The master grants quota on PERTEK, so a cycle
     whose PERTEK Perubahan has been issued IS obtained even while its SPI is
     still TBA (GKL Obtained #2 = 600 MT: PERTEK Perubahan 31-Jul-26, SPI TBA;
     the master counts it, and before this the dashboard did not). */
  if (Array.isArray(allCycles) && typeof getPertekTerbitForObtained === 'function') {
    return !!getPertekTerbitForObtained(c, allCycles);
  }
  return false;
}

/* snapZero — display helper to suppress tiny negative MT values caused by
   rounding in XLSX manual re-allocation (e.g. GKL ERW PIPE −0.49 / −0.08).
   Only clamps the (-1, 0) range; real negatives (≤ -1) still surface as bugs. */
function snapZero(v) {
  if (typeof v !== 'number' || isNaN(v)) return v;
  return (v > -1 && v < 0) ? 0 : v;
}

/* ceilMt — display helper: round UP any MT value to integer (per business
   rule 21-May-2026). Apply to obtained/util/avail/submit displays — NOT to
   realization (realMT, totalRealizedMT, realPct etc), per user preference.
   Negative values handled gracefully: snapZero first, then ceil. */
function ceilMt(v) {
  if (typeof v !== 'number' || isNaN(v)) return v;
  const snapped = snapZero(v);
  return Math.ceil(snapped);
}
/* fmtMt — shorthand: ceilMt → toLocaleString. Use everywhere MT is shown
   (cards, tables, totals, charts) for util/avail/obtained/submit. */
function fmtMt(v) {
  const c = ceilMt(v);
  return typeof c === 'number' ? c.toLocaleString(MT_LOCALE) : c;
}

/* ════════════════════════════════════════════════════════════════════
   CANONICAL OBTAINED — Single source of truth for company total obtained.
   Rules (aligned with XLSX master 12-May-2026):
     Total Obtained = Σ Obtained #N where PERTEK/SPI Perubahan terbit
     1. Sum every Obtained #N cycle MT
     2. Dedup by cycleType — first occurrence per company wins
     3. Skip mt ≤ 0  (empty/zero cycles)
     4. Skip cycles where release_date is TBA / unparseable
        (PERTEK Perubahan not yet issued — pending revision)
   ═══════════════════════════════════════════════════════════════════ */
function canonicalObtained(co) {
  if (!co) return 0;
  /* ONE SOURCE (2026-08-04). This used to short-circuit to the server's
     ledger figure:

         if (co._ledgerObtained != null) return Number(co._ledgerObtained);

     …while canonicalObtainedFiltered() below always computed from cycles.
     Two sources, maintained separately: the All-Time view read the ledger (a
     frozen snapshot of the master, with no dates) and the moment a period
     filter was switched on the number silently changed data source. That is
     why the team's input never showed up, and why a filtered total never
     reconciled with the same period computed by hand from the master.

     Cycles are now the single source — they carry the dates a period filter
     needs, and they are what the team actually edits, so an edit moves the
     KPI immediately with no ledger regeneration. Safe to switch only because
     the two agree exactly: after the cycle repairs of 2026-08-03/04 and the
     PERTEK fallback in _isObtainedTerbit(), cycles-derived obtained equals
     the ledger for all 41 companies (34,840 MT = master). test_ledger.php
     pins that equality so the two can never drift apart again unnoticed.
     `_ledgerObtained` still ships in the payload as a cross-check. */
  const allCycles = co.cycles || [];
  const seen      = new Set();
  let   total     = 0;
  allCycles.forEach(c => {
    if (!/^obtained #/i.test(c.type)) return;          // only "Obtained #N" cycles
    const mt = typeof c.mt === 'number' ? c.mt : 0;
    if (mt <= 0) return;                              // skip empty/zero cycles
    const key = c.type.toLowerCase().trim();
    if (seen.has(key)) return;                         // dedup cycleType
    seen.add(key);
    /* `_fromRevReq` TIDAK lagi menggugurkan siklus obtained. Lihat
       _RATIONALE_FROM_REV_REQ di bawah. Placeholder yang belum jadi apa-apa
       tetap gugur — lewat gerbang mt<=0 dan gerbang TERBIT di baris berikut. */
    if (!_isObtainedTerbit(c, allCycles)) return;                // SKIP TBA / not-yet-terbit
    total += mt;
  });
  return total;
}

/* ════════════════════════════════════════════════════════════════════
   CUMULATIVE AVAILABLE — the quota a company still holds, a STOCK.

   Deliberately NOT period-sliced, unlike Submitted / Obtained / Utilized.
   The master's own H1 report says it outright: "Submitted / Obtained /
   Utilized = aktivitas periode … Available = saldo kumulatif". Asking "how
   much was available during June" is a category error — a balance exists at a
   point in time, it is not an activity that happens inside a window.

   Slicing it produced numbers nobody could reconcile: obtained-in-period minus
   utilised-in-period read 2,560 MT for H1 2026 against the master's 11,693,
   because a company that used quota in the window which was granted before it
   showed as a negative balance clamped to zero.

   One definition, used by BOTH the Overview KPI card (03-kpis.js) and the
   PDF Summary (14-export.js) — the two had drifted apart, which is what
   surfaced this in the first place.
   ═══════════════════════════════════════════════════════════════════ */
/* allTimeUtil — utilisasi SEPANJANG WAKTU, satu sumber.
   Sejak master 05/08/2026 memecah utilisasi per siklus, `utilCycles` adalah
   yang otoritatif: menjumlah SELURUH potongannya menjamin irisan periode mana
   pun berjumlah tepat sama dengan angka sepanjang waktu (sifat partisi).
   Menghitungnya dari `co.utilizationMT` yang tersimpan terpisah membuka celah
   keduanya bergeser — persis kelas bug yang sudah dua kali kita bereskan.
   Fallback ke utilizationMT untuk company yang belum punya rincian siklus. */
function allTimeUtil(co) {
  if (!co) return 0;
  /* Cukup baca `utilizationMT`. Sejak iq_sync_util_with_cycles() ada di server
     (2026-08-10), kolom itu SUDAH diisi dari utilCycles + lot bertanggal untuk
     produk yang master tidak sebut — jadi server-lah satu-satunya sumber.

     Versi sebelumnya menjumlah `utilCycles` sendiri di sini. Itu benar selama
     utilCycles satu-satunya sumber, tapi begitu server ikut melipat lot Sales,
     perannya terbalik: server benar (GKL 3.000) sementara helper ini tertinggal
     (2.400). Menjumlah ulang di frontend hanya menciptakan sumber kedua —
     persis yang seluruh rangkaian perbaikan ini hapus. */
  return Number(co.utilizationMT) || 0;
}

/* allTimeUtilByProd — utilisasi SEPANJANG WAKTU per produk, satu sumber.
   Pasangan per-produk dari allTimeUtil(): `utilCycles` bila ada, kalau tidak
   barulah kolom `utilizationByProd` dari company_product_stats.

   Kolom stats itu TIDAK ikut diperbarui ketika utilisasi bertambah, dan itulah
   yang membuat form Sales ADP menulis "250 / 350 MT used · Available 100 MT"
   padahal kuotanya sudah habis (350 dari 350). Dilaporkan Sales 2026-08-10.

   Kunci keluarannya memakai ejaan yang sama dengan `utilizationByProd` bila
   produknya ada di sana, supaya pemanggil lama tidak perlu ikut berubah. */
function allTimeUtilByProd(co) {
  if (!co) return {};
  // Pasangan per-produk dari allTimeUtil() — server sudah menyelaraskannya.
  return co.utilizationByProd || {};
}

function cumulativeAvailable(co) {
  if (!co) return 0;
  const obtained = canonicalObtained(co);            // all-time, single source
  const utilised = allTimeUtil(co);                  // all-time, single source
  return Math.max(0, obtained - utilised);
}

/** Cumulative available summed over a list of companies. */
function cumulativeAvailableTotal(companies) {
  return (companies || []).reduce((s, co) => s + cumulativeAvailable(co), 0);
}

/* ── canonicalObtainedFiltered: period-aware version of canonicalObtained ── */
function canonicalObtainedFiltered(co) {
  if (!co) return 0;
  const allCycles = co.cycles || [];
  const seen      = new Set();
  let   total     = 0;
  allCycles.forEach(c => {
    if (!/^obtained #/i.test(c.type)) return;
    const mt = typeof c.mt === 'number' ? c.mt : 0;
    if (mt <= 0) return;
    const key = c.type.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    // `_fromRevReq` tidak menggugurkan — lihat _RATIONALE_FROM_REV_REQ.
    if (!_isObtainedTerbit(c, allCycles)) return; // also gate by terbit status
    if (PERIOD.active) {
      // "Obtained" = quota granted = SPI Terbit. Anchor the period test on the
      // Obtained cycle's OWN release_date (its SPI Terbit date), which is the
      // correct and reliably-populated field. Fall back to PERTEK Terbit (the
      // paired Submit's release_date) only when the SPI date is missing.
      // (Old code anchored SOLELY on PERTEK Terbit — but that field is often a
      // mis-entered PERTEK *number* string, so it parsed to null and silently
      // dropped real in-period obtaineds, e.g. June read 0 instead of 250.)
      // SPI Terbit date: prefer the Obtained cycle's own release_date, else the
      // dedicated spi_date field. (release_date is frequently a mis-entered SPI
      // *number* like "04.PI-05.26.0450.1", but the real date is in spi_date —
      // e.g. BBB 26/06, KJK, SJH. Reading spi_date recovers those in-period.)
      /* PERIOD ANCHOR = PERTEK Terbit, per the data owners' report spec
         (2026-08-04): "untuk obtain, mengambil dari kolom Release, di PERTEK
         atau PERTEK Perubahan". In the master that date sits on the SUBMIT
         row (its Release column reads PERTEK / PERTEK Perubahan); the
         Obtained row's own Release column is the SPI. So the paired Submit's
         PERTEK date comes FIRST, with SPI kept only as a fallback for rows
         that have no readable PERTEK.

         This restores the original 2026-07-08 rule. It was inverted to
         SPI-first because "PERTEK Terbit is often a mis-entered PERTEK NUMBER
         string, so it parsed to null and silently dropped real in-period
         obtaineds" — those 20 cycles were repaired on 2026-08-03, so the
         reason for the inversion is gone. */
      let anchor = (typeof getPertekTerbitForObtained === 'function')
        ? getPertekTerbitForObtained(c, allCycles) : null;
      if (!anchor && c.pertekDate) anchor = pDate(c.pertekDate);
      if (!anchor) anchor = pDate(c.releaseDate) || pDate(c.spiDate);
      if (!inPd(anchor)) return;
    }
    total += mt;
  });
  return total;
}

/* ════════════════════════════════════════════════════════════════════
   CANONICAL SUBMITTED — Single source of truth for total submitted.
   Per user spec 30-Apr-2026: Total Submitted = Submit #1 + Submit #2 + …
   ─────────────────────────────────────────────────────
   Revision cycles are EXCLUDED — a Revision is a CHANGE to an existing
   submission, not a new one. Including it would double-count quota.
   Only Submit #N cycles count. Same dedup + _fromRevReq skip as canonicalObtained.
   ═══════════════════════════════════════════════════════════════════ */
function canonicalSubmitted(co) {
  if (!co) return 0;
  const allCycles = co.cycles || [];
  const seen      = new Set();
  let   total     = 0;
  allCycles.forEach(c => {
    if (!/^submit\s*#\d/i.test(c.type)) return;     // Submit #N only — NOT Revision
    const mt = typeof c.mt === 'number' ? c.mt : 0;
    if (mt <= 0) return;
    const key = c.type.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    if (c._fromRevReq) return;
    total += mt;
  });
  return total;
}

/* ── canonicalSubmittedFiltered: period-aware version of canonicalSubmitted ──
   Rule #1: each Submit #N cycle gated by its OWN submission date (Submit MOI).
   Rule #4/#6: Revision cycles excluded (replace, not add); _fromRevReq skipped.
   All Time → identical to canonicalSubmitted. Mirrors canonicalObtainedFiltered. */
function canonicalSubmittedFiltered(co) {
  if (!co) return 0;
  if (!PERIOD.active) return canonicalSubmitted(co);
  const allCycles = co.cycles || [];
  const seen      = new Set();
  let   total     = 0;
  allCycles.forEach(c => {
    if (!/^submit\s*#\d/i.test(c.type)) return;     // Submit #N only — NOT Revision
    const mt = typeof c.mt === 'number' ? c.mt : 0;
    if (mt <= 0) return;
    const key = c.type.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    if (c._fromRevReq) return;
    if (!inPd(pDate(c.submitDate))) return;          // gate by Submit MOI date
    total += mt;
  });
  return total;
}

/* ════════════════════════════════════════════════════════════════════
   getSubmittedByProd / getObtainedByProdAgg — per-product aggregation.
   Sums each product's MT across all Submit / Obtained cycles (deduped
   by cycleType so legacy duplicate rows don't double-count). Revision
   cycles are EXCLUDED (a revision changes an existing submission, not
   a new one). Used by the obtained drill-down and any view that wants
   per-product totals reflecting Submit #1 + Submit #2, Obtained #1 +
   Obtained #2, etc.
   ═══════════════════════════════════════════════════════════════════ */
function getSubmittedByProd(co) {
  const result = {};
  if (!co) return result;
  const seen = new Set();
  (co.cycles || []).forEach(c => {
    if (!/^submit\s*#\d/i.test(c.type)) return;     // Submit #N only — NOT Revision
    const key = c.type.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    if (c._fromRevReq) return;
    // Require cycle.mt > 0 — same gate as canonicalSubmitted. Without this,
    // a Submit #N draft (cycle.mt empty but cycle_products populated)
    // would inflate the per-product total even though the submission
    // hasn't actually been submitted yet.
    const cycMt = typeof c.mt === 'number' ? c.mt : 0;
    if (cycMt <= 0) return;
    Object.entries(c.products || {}).forEach(([p, v]) => {
      if (typeof v === 'number' && v > 0) result[p] = (result[p] || 0) + v;
    });
  });
  return result;
}

// β-1: per-product NET obtained = utilization + available, read straight from
// company_product_stats (co.utilizationByProd / co.availableByProd in the
// payload), which importMasterStats.js refreshes from the master file. The
// master's Utilization + Available rows already encode post-revision net per
// product (BDG/GAS/MIN/MJU reallocations applied per SPI-Perubahan lifecycle),
// so the aggregator no longer reads cycles or revision_changes and never has to
// guess whether a revision is live. revision_changes stays a UI dependency only
// — 08-drawer.js and 13-rev-mgmt.js still render revFrom/revTo for the
// product-change history; the aggregator simply ignores it.
function getObtainedByProdAgg(co) {
  const result = {};
  if (!co) return result;
  const util  = co.utilizationByProd || {};
  const avail = co.availableByProd   || {};
  new Set([...Object.keys(util), ...Object.keys(avail)]).forEach(p => {
    const v = (Number(util[p]) || 0) + (Number(avail[p]) || 0);
    if (v > 0) result[p] = v;
  });

  /* Fallback — freshly granted quota that has no company_product_stats row yet.
     Those stats are fed from the master's Utilization + Available rows, so a
     company whose PERTEK was just issued and whose quota is untouched has
     NEITHER: util is empty because nothing is used, available is empty because
     the master hasn't been refreshed. The loop above then yields {} while
     canonicalObtained() — which reads the CYCLES — correctly reports the grant.

     Every per-product surface is built on this function, so that company's
     quota vanishes from all of them while the KPI cards (cycle-based) still
     count it. SNSD, 120 MT, PERTEK 04-Aug-2026: the Obtained drill listed the
     company with an empty Obtained column and a total 120 MT below its own card.

     Only fires when the stats produced NOTHING. A company with stats keeps them
     authoritative — the master encodes post-revision NET per product there, and
     cycles do not. getCycleBreakdown() applies the same gates as
     canonicalObtained() (dedupe per cycle type, mt > 0, PERTEK/SPI terbit), so
     the fallback cannot admit quota the headline figure excludes. */
  /* Kunci hasil cadangan ini DIKANONIKKAN. Stats (jalur utama di atas) sudah
     memakai ejaan kanonik, tapi `cycles[].products` menyimpan ejaan ledger —
     sehingga company yang jatuh ke cadangan ini muncul dengan nama produk yang
     berbeda dari yang lain di layar yang sama. SNSD: "GI BORON" di seluruh
     permukaan per-produk, sementara 40 company lain menulis "GI ALLOY" untuk
     produk yang sama persis. Diminta pemilik data 2026-08-12 supaya seragam
     ke GI ALLOY. */
  if (!Object.keys(result).length && typeof getCycleBreakdown === 'function') {
    getCycleBreakdown(co, 'obtained').forEach(cy => {
      Object.entries(cy.products || {}).forEach(([p, mt]) => {
        const v = Number(mt) || 0;
        if (v > 0) { const k = canonicalProduct(p); result[k] = (result[k] || 0) + v; }
      });
    });
  }
  return result;
}

/* ════════════════════════════════════════════════════════════════════
   getCycleBreakdown — returns per-cycle breakdown for hover tooltip.
   mode: 'submit' | 'obtained'
   prod (optional): if provided, only returns cycles touching that product
   Returns: [{ type, label, mt, date, products }]
   ═══════════════════════════════════════════════════════════════════ */
function getCycleBreakdown(co, mode, prod) {
  if (!co) return [];
  // Submit-mode breakdown excludes Revision cycles (revisions change an
  // existing submission, not add new ones — including them would double-count).
  const re = mode === 'submit'
    ? /^submit\s*#\d/i
    : /^obtained\s*#\d/i;
  const seen = new Set();
  const out  = [];
  (co.cycles || []).forEach(c => {
    if (!re.test(c.type)) return;
    const key = c.type.toLowerCase().trim();
    if (seen.has(key)) return;
    seen.add(key);
    /* Mode SUBMIT tetap menggugurkan artefak revision-request; mode OBTAINED
       tidak — lihat _RATIONALE_FROM_REV_REQ. */
    if (mode === 'submit' && c._fromRevReq) return;
    // Same gates as canonicalObtained/Submitted: skip empty (mt=0) and
    // — for obtained mode — skip not-yet-terbit (release TBA / invalid).
    const cycMt = typeof c.mt === 'number' ? c.mt : 0;
    if (cycMt <= 0) return;
    if (mode === 'obtained' && typeof _isObtainedTerbit === 'function' && !_isObtainedTerbit(c)) return;
    let mt;
    if (prod) {
      const v = (c.products || {})[prod];
      if (typeof v !== 'number' || v <= 0) return;
      mt = v;
    } else {
      mt = cycMt;
    }
    // Friendly label: "Submit #1" | "Submit #2 (Re-Apply)" | "Obtained #2 (Re-Apply)" | "Revision #1"
    let label = c.type;
    if (/^submit\s*#[2-9]/i.test(c.type))   label = c.type + ' (Re-Apply)';
    if (/^obtained\s*#[2-9]/i.test(c.type)) label = c.type + ' (Re-Apply)';
    const date = mode === 'submit'
      ? (c.submitDate || c.pertekDate || '')
      : (c.releaseDate || c.spiDate || c.pertekDate || c.submitDate || '');
    out.push({ type: c.type, label, mt, date, products: c.products || {} });
  });
  return out;
}

/* Node (tests) only — harmless in the browser, where this file is a classic
   script and the declarations above are already globals. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getRA, getRAWaves, raTotals, getSPI, isEligible, isReapplySubmitted };
}