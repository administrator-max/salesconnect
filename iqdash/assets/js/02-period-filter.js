/* ═══════════════════════════════════════
   PERIOD FILTER — State & Engine
═══════════════════════════════════════ */

/* ══════════════════════════════════════════════════
   PERIOD FILTER — Global State & Engine
══════════════════════════════════════════════════ */
let PERIOD = { from: null, to: null, label: 'All Time', active: false };
let FILTER_MODE = 'both'; // 'submit' | 'release' | 'both'

const MODE_DESC = {
  both:    "Shows records where <strong>any cycle's</strong> submit or release date falls in range.",
  submit:  "Shows records where <strong>any cycle's submit date</strong> (MOI/MOT) falls in range.",
  release: "Shows records where <strong>any cycle's release date</strong> (PERTEK/SPI) falls in range."
};

const PRESETS = {
  all:   { label:'All Time',  from:null,                        to:null },
  oct25: { label:'Oct 2025',  from:new Date(2025,9,1),          to:new Date(2025,9,31) },
  nov25: { label:'Nov 2025',  from:new Date(2025,10,1),         to:new Date(2025,10,30) },
  dec25: { label:'Dec 2025',  from:new Date(2025,11,1),         to:new Date(2025,11,31) },
  jan26: { label:'Jan 2026',  from:new Date(2026,0,1),          to:new Date(2026,0,31) },
  feb26: { label:'Feb 2026',  from:new Date(2026,1,1),          to:new Date(2026,1,28) },
  q425:  { label:'Q4 2025',   from:new Date(2025,9,1),          to:new Date(2025,11,31) },
  q126:  { label:'Q1 2026',   from:new Date(2026,0,1),          to:new Date(2026,2,31) },
  q226:  { label:'Q2 2026',   from:new Date(2026,3,1),          to:new Date(2026,5,30,23,59,59) },
  q326:  { label:'Q3 2026',   from:new Date(2026,6,1),          to:new Date(2026,8,30,23,59,59) },
  q426:  { label:'Q4 2026',   from:new Date(2026,9,1),          to:new Date(2026,11,31,23,59,59) },
  ytd:   { label:'YTD 2026',  from:new Date(2026,0,1),          to:new Date(2026,11,31) },
};

function fmtDateShort(d) {
  if (!d) return '—';
  return d.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'});
}

/* Returns true if a date falls within active period */
function inPeriod(date) {
  if (!PERIOD.active || !date) return true;
  if (PERIOD.from && date < PERIOD.from) return false;
  if (PERIOD.to   && date > PERIOD.to)   return false;
  return true;
}

/* Parse a date string 'DD/MM/YYYY' → Date object, or null if TBA/invalid */
function parseCycleDate(str) {
  if (!str || str === 'TBA') return null;
  const m = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (!m) return null;
  return new Date(+m[3], +m[2]-1, +m[1]);
}

/* ─────────────────────────────────────────────────────────────────────────
   CORE PERIOD FILTER ENGINE
   
   Filtering rule (single consistent definition):
   A COMPANY is in-period if ANY of its cycles' Submit MOT date (Obtained
   cycles) or Submit MOI date (Submit/Process cycles) falls within the
   selected period range. This ensures that when you filter October 2025,
   you see all companies that had ANY submission activity in that month.

   For the KPI cards, each KPI uses its own per-cycle date field:
     KPI1 (Submitted) → Submit MOI date of Submit #1/#2 cycles
     KPI2 (Obtained)  → Submit MOT date of Obtained cycles
     KPI5 (Pending)   → Submit MOI date of Submit(Process) cycles
   
   Tables/charts: show WHOLE companies if any cycle matches.
   ───────────────────────────────────────────────────────────────────────── */

/** Parse date from 'DD/MM/YYYY' or 'YYYY-MM-DD' format. Returns Date or null. */
function pDate(str) {
  if (!str || str === 'TBA' || str === 'null' || str === 'undefined') return null;
  // ISO format
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return new Date(+iso[1], +iso[2]-1, +iso[3]);
  // DD/MM/YYYY or D/M/YYYY
  const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (dmy) {
    let y = +dmy[3];
    if (y < 100) y += 2000;
    return new Date(y, +dmy[2]-1, +dmy[1]);
  }
  // DD-Mon-YY / DD Month YYYY (EN + ID) — e.g. "30-Jun-26", "12 Mei 2026", "29 Apr 2026".
  // The Sheet stores many Revision-Request (and some other) dates in this text form;
  // without this branch they parse to null and silently drop out of the period filter.
  const map = (typeof _MONTH_NAME_MAP !== 'undefined') ? _MONTH_NAME_MAP : null;
  if (map) {
    const mon = str.match(/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{2,4})$/);
    if (mon && map[mon[2].toLowerCase()]) {
      let y = +mon[3];
      if (y < 100) y += 2000;
      return new Date(y, map[mon[2].toLowerCase()] - 1, +mon[1]);
    }
  }
  return null;
}

/** Best PERTEK/SPI *terbit date* for display of a cycle.
 *  release_date SOMETIMES holds a document NUMBER instead of a date (legacy
 *  data entry, e.g. "1075/ILMATE/PERTEK-SPI-U-Rev.1/VI/2026"); when so, the
 *  real terbit date lives in pertek_date (Submit/Revision) or spi_date
 *  (Obtained). Return a display-ready date string, preferring a real date,
 *  and never surfacing the raw number where a date is expected.
 *  (Display only — the Sheet is not modified; the number remains as the No.) */
function cycleTerbitDate(c) {
  if (!c) return '';
  const rd = String(c.releaseDate == null ? '' : c.releaseDate).trim();
  if (/^tba$/i.test(rd)) return 'TBA';
  if (rd && pDate(rd)) return rd;                 // release_date already a real date
  const isObt = /^obtained/i.test(c.type || '');
  const fallback = isObt ? c.spiDate : c.pertekDate;
  return (fallback && String(fallback).trim()) || rd || '';
}

/** True if date d falls within the active period (inclusive).
 *  Returns FALSE for null/undefined dates when period is active —
 *  a missing date must never pass the filter. */
function inPd(d) {
  if (!PERIOD.active) return true;
  if (!d) return false;            // null date = not in any period
  if (PERIOD.from && d < PERIOD.from) return false;
  if (PERIOD.to   && d > PERIOD.to)   return false;
  return true;
}

/* ════════════════════════════════════════════════════════════════════
   UTILIZATION DATE SLICING  (β-2 lot-driven + period filter)
   ─────────────────────────────────────────────────────────────────────
   Rule #3: Utilization (MT) is filtered by each lot's OWN utilization date.
   Since β-2 made utilization = Σ shipment lots, every utilization unit lives
   on a lot that carries a date: actual PIB date (pibDate) preferred, else the
   expected ETA (etaJKT — free-text, incl. Indonesian months and month-only
   like "April 2026"). A lot with no parseable date is EXCLUDED from any active
   period (it can't be attributed to one); when the filter is OFF (All Time)
   the full server stats are used unchanged.
   ═══════════════════════════════════════════════════════════════════ */
function _parseEtaLoose(str) {
  if (str == null) return null;
  const s = String(str).trim();
  if (!s || /^(TBA|null|undefined|-|—)$/i.test(s)) return null;
  let d = pDate(s); if (d) return d;                       // DD/MM/YYYY or ISO
  const map = (typeof _MONTH_NAME_MAP !== 'undefined') ? _MONTH_NAME_MAP : null;
  if (map) {
    let m = s.match(/^(\d{1,2})\s+([A-Za-z]+)\s+(\d{2,4})$/); // "15 Juni 26"
    if (m && map[m[2].toLowerCase()]) {
      let y = +m[3]; if (y < 100) y += 2000;
      return new Date(y, map[m[2].toLowerCase()] - 1, +m[1]);
    }
    m = s.match(/^([A-Za-z]+)\s+(\d{2,4})$/);                // "April 2026" → mid-month
    if (m && map[m[1].toLowerCase()]) {
      let y = +m[2]; if (y < 100) y += 2000;
      return new Date(y, map[m[1].toLowerCase()] - 1, 15);
    }
  }
  return (typeof parseETA === 'function') ? parseETA(s) : null;  // English "DD Mon YY"
}
/* Utilization date for one shipment lot: actual PIB date, else expected ETA. */
/* Tanggal sebuah lot dianggap "terpakai".
   `utilDate` adalah yang SEBENARNYA ditanyakan — tanggal kuota dipakai. Kolom
   itu baru ada 2026-08-07 (form Sales sebelumnya hanya punya ETA JKT), jadi
   dua sumber lama tetap dipakai sebagai cadangan untuk lot yang sudah telanjur
   tersimpan tanpanya.

   Cadangan itu memang APROKSIMASI dan diketahui meleset: ETA JKT adalah
   perkiraan barang TIBA, rutin berjarak berbulan-bulan dari saat kuota dipakai
   (HKG dipakai 8 Jul, ETA 15 Sep; IKM 24 Jul vs September). Karena itu urutan
   ini penting — begitu `utilDate` terisi, ia yang menang. */
function lotUtilDate(lot) {
  if (!lot) return null;
  return pDate(lot.utilDate) || _parseEtaLoose(lot.utilDate)
      || pDate(lot.pibDate)  || _parseEtaLoose(lot.etaJKT);
}
/* Per-product utilization for a company, sliced to the active period from its
   shipment lots. All Time → the server stats (co.utilizationByProd) verbatim.
   Keys match co.utilizationByProd (shipment product == stats product post β-2). */
function scopedUtilByProd(co) {
  if (!co) return {};
  /* All Time juga harus lewat utilCycles bila ada. Sebelumnya baris ini
     langsung mengembalikan `co.utilizationByProd` — angka lama dari
     company_product_stats — sementara scopedUtilTotal() sudah memakai
     allTimeUtil() yang menjumlah utilCycles. Akibatnya tampilan PER PRODUK dan
     TOTAL saling bertentangan: ADP tertulis "Used 250, tersisa 100 MT" di
     daftar per produk padahal totalnya sudah 350 dan saldonya nol.
     Dilaporkan Sales 2026-08-10 — mereka mengira input utilisasinya tidak
     masuk, padahal yang salah tampilannya. */
  // All Time: langsung dari server, yang sudah menyelaraskan kolom ini dengan
  // utilCycles + lot bertanggal (iq_sync_util_with_cycles). Menjumlah ulang di
  // sini hanya menciptakan sumber kedua.
  if (!PERIOD.active) return co.utilizationByProd || {};

  /* Two date sources, in priority order:

       1. `etaByProd` — company_product_stats.eta_jkt, the per-product mirror
          of the master's "Utilization (date)" row. THE definition of when
          quota was used, per the data owners' report spec, so it wins.
       2. shipment LOTS — per-lot PIB/ETA date, used only for products the
          master gives no utilization date for. Finer grain, and the only way
          one product can span several periods.

     Lots must NOT outrank etaByProd: a lot's ETA JKT is when cargo is
     expected to ARRIVE, which is a different event from the utilization date
     and routinely lands months later (HKG utilised 8 Jul, ETA 15 Sep; IKM
     24 Jul vs September; BDG 30 Jun vs 31 Aug). Reading the lot first put
     those tonnages in the wrong month.

     Before 2026-08-04 ONLY lots were read, so every product whose utilization
     came from the master — nearly all of them — contributed 0 to any period
     and the filtered view silently under-reported. Iterating
     `utilizationByProd` (not `shipments`) also keeps the output keyed the way
     scopedAvailByProd() reads it. Matching is canonical throughout:
     utilizationByProd carries ledger names (`GI ALLOY`) while
     shipments/etaByProd keep the stats spelling (`GI BORON`). */
  const out = {};

  /* SUMBER UTAMA sejak master 05/08/2026: utilisasi per SIKLUS per produk,
     tiap potongan dengan tanggalnya sendiri (`utilCycles`).

     Dua sumber di bawah hanya berlaku untuk company yang belum punya rincian
     ini. Keduanya memberi SATU tanggal untuk angka KUMULATIF, sehingga produk
     yang dipakai lintas tahun mendarat seluruhnya pada tanggal terakhir — itu
     yang membuat filter 01 Jan–05 Agu 2026 melaporkan Utilized 21.500 melebihi
     Obtained 21.140 (pimpinan, 2026-08-05). Dengan rincian siklus, angka yang
     sama menjadi 15.375 dan 6.872 MT kembali ke 2025, tempatnya semula. */
  const uc = co.utilCycles;
  if (Array.isArray(uc) && uc.length) {
    /* Keputusan pemilik data 2026-08-07: input Sales jadi sumbernya.
       Diterapkan PER PRODUK, dan hanya bila lot produk itu sudah LENGKAP —
       yaitu setiap lot ber-MT punya tanggal utilisasi, dan jumlahnya sama
       dengan total per siklus dari master.

       Kenapa tidak langsung lot semuanya: saat aturan ini dibuat, 32 produk
       sama sekali belum punya lot, dan 4 lot yang ada masih separuh jalan
       (HKG 250 dari 1.000; JKT 100 dari 400; IKM 2.000 dari 2.300; SPA 400
       dari 401). Menukar sumber secara borongan akan MENGHILANGKAN 1.351 MT
       seketika dan menolkan 32 produk. Dengan syarat "lengkap", peralihannya
       terjadi sendiri per produk begitu Sales selesai mengisi — tanpa ada
       tonase yang hilang di tengah jalan. */
    const totalSiklus = {};                       // produk kanonik -> MT master
    uc.forEach(u => { const m = Number(u.mt) || 0; if (m > 0) {
      const c = _canonProd(u.product || ''); totalSiklus[c] = (totalSiklus[c] || 0) + m; } });

    const lotPer = {};                            // produk kanonik -> {mt, lengkap, lots[]}
    Object.entries(co.shipments || {}).forEach(([p, ls]) => {
      const c = _canonProd(p);
      (ls || []).forEach(l => {
        const mt = Number(l.utilMT) || 0;
        if (mt <= 0) return;
        const e = lotPer[c] || (lotPer[c] = { mt: 0, lengkap: true, lots: [] });
        e.mt += mt;
        /* WAJIB `utilDate` — bukan lotUtilDate(). Cadangan pibDate/etaJKT
           JANGAN dipakai untuk memutuskan peralihan sumber: keduanya tanggal
           KEDATANGAN, dan memakainya sebagai tanggal pemakaian persis
           kekeliruan yang kolom ini dibuat untuk memperbaiki.
           Percobaan pertama memakai lotUtilDate() dan langsung menggeser
           650 MT keluar dari H1 (12.525 -> 11.875) untuk empat produk yang
           lotnya hanya berbekal PIB/ETA. Sumber baru hanya boleh menang kalau
           Sales benar-benar sudah mengisi tanggal pemakaiannya. */
        const ud = String(l.utilDate || '').trim();
        if (!ud || !(pDate(ud) || _parseEtaLoose(ud))) e.lengkap = false;
        e.lots.push(l);
      });
    });
    const pakaiLot = c => {
      const e = lotPer[c];
      if (!e || !e.lengkap) return false;
      /* Produk yang master SAMA SEKALI tidak sebut utilisasinya: lot yang
         bertanggal langsung berlaku. Versi pertama membandingkan jumlah lot
         dengan total master, sehingga produk bertotal 0 di master tidak akan
         PERNAH bisa cocok — berapa pun isi lotnya. GKL GL ALLOY 600 MT
         terjebak persis di situ: sudah di-re-apply dan dipakai, tapi saldonya
         tetap tampil 600 karena master diam soal produk itu. Mengisi kekosongan
         bukan membantah master. */
      if (!(totalSiklus[c] > 0)) return true;
      return Math.abs(e.mt - totalSiklus[c]) < 0.01;
    };

    // Produk yang lot-nya sudah lengkap: iris dari LOT (tanggalnya lebih rinci).
    Object.keys(lotPer).forEach(c => {
      if (!pakaiLot(c)) return;
      const nama = (uc.find(u => _canonProd(u.product || '') === c) || {}).product || c;
      lotPer[c].lots.forEach(l => {
        if (PERIOD.active) { const d = lotUtilDate(l); if (!d || !inPd(d)) return; }
        out[nama] = (out[nama] || 0) + (Number(l.utilMT) || 0);
      });
    });

    // Sisanya tetap dari rincian per siklus milik master.
    uc.forEach(u => {
      const mt = Number(u.mt) || 0;
      if (mt <= 0) return;
      if (pakaiLot(_canonProd(u.product || ''))) return;
      if (PERIOD.active) {
        const d = pDate(u.date) || _parseEtaLoose(u.date);
        if (!d || !inPd(d)) return;
      }
      const p = u.product || '';
      out[p] = (out[p] || 0) + mt;
    });

    /* Lot yang mencatat pemakaian BARU — belum pernah dilihat master.
       Cerminan iq_sync_util_with_cycles() di server (2026-08-10); aturannya
       harus sama persis, kalau tidak filter periode akan berselisih dengan
       Overview lagi.

       Dilaporkan lewat KAN: master mencatat GI ALLOY 80 MT @ 31/03/2026, tim
       mengisi 60 MT @ 07/08/2026 atas kuota re-apply Obtained #2. Karena
       jumlahnya tidak sama dengan master, pakaiLot() menolaknya dan 60 MT itu
       lenyap — sisa tampil 60 padahal sudah nol.

       Ditambahkan hanya bila: bukan catatan kembar (produk+hari+MT sama),
       tanggalnya SESUDAH hari terakhir yang master tahu, dan hasilnya tidak
       melampaui obtained produk itu. Alasan tiap syarat ada di sisi server. */
    /* Kunci hari 'YYYY-MM-DD' dari komponen LOKAL — jangan toISOString(), yang
       menggeser tanggal ke UTC dan bisa memundurkannya sehari. Cerminan
       iq_util_day_key() di PHP. */
    const _hari = v => {
      const d = pDate(v) || _parseEtaLoose(v);
      if (!d) return null;
      return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0')
             + '-' + String(d.getDate()).padStart(2, '0');
    };

    const sidikMaster = new Set(), hariAkhir = {};
    uc.forEach(u => {
      const mt = Number(u.mt) || 0, c = _canonProd(u.product || ''), h = _hari(u.date);
      if (h === null) return;
      sidikMaster.add(c + '|' + h + '|' + mt.toFixed(3));
      if (!hariAkhir[c] || h > hariAkhir[c]) hariAkhir[c] = h;
    });

    // Atap obtained per produk = pasangan stats (terpakai + tersedia).
    const atap = {};
    [co.utilizationByProd, co.availableByProd].forEach(src =>
      Object.entries(src || {}).forEach(([p, v]) => {
        const c = _canonProd(p); atap[c] = (atap[c] || 0) + (Number(v) || 0);
      }));

    const sudah = {};                       // yang SUDAH dihitung per produk kanonik
    uc.forEach(u => { const c = _canonProd(u.product || '');
      sudah[c] = (sudah[c] || 0) + (Number(u.mt) || 0); });

    Object.entries(lotPer).forEach(([c, e]) => {
      if (pakaiLot(c)) return;              // produk ini sudah diiris dari lot
      const nama = (uc.find(u => _canonProd(u.product || '') === c) || {}).product || c;
      e.lots.forEach(l => {
        const mt = Number(l.utilMT) || 0;
        if (mt <= 0) return;
        const h = _hari(l.utilDate);
        if (h === null) return;                                          // tanpa tanggal
        if (sidikMaster.has(c + '|' + h + '|' + mt.toFixed(3))) return;  // kembar
        if (hariAkhir[c] && h <= hariAkhir[c]) return;                   // sudah terliput
        if (atap[c] > 0 && (sudah[c] || 0) + mt > atap[c] + 0.001) return;
        sudah[c] = (sudah[c] || 0) + mt;
        if (PERIOD.active) { const d = pDate(l.utilDate) || _parseEtaLoose(l.utilDate);
          if (!d || !inPd(d)) return; }
        out[nama] = (out[nama] || 0) + mt;
      });
    });

    /* Produk yang rincian siklus maupun lot tidak sebut SAMA SEKALI: kolom
       stats satu-satunya yang bicara soal pemakaiannya, jadi ia dipakai —
       aturan yang sama dengan iq_sync_util_with_cycles() di server sejak
       2026-08-10. Tanpa ini, "siklus yang berlaku" tanpa sengaja berlaku per
       COMPANY: satu produk punya siklus, produk lain milik company itu ikut
       dinolkan (IKM SEAMLESS PIPE 275 MT).

       Tanggalnya dari etaByProd; tanpa tanggal ia tidak bisa ditempatkan di
       periode mana pun sehingga hanya muncul saat filter mati — sisi periode
       memang tidak bisa menebak, dan menebak-nya akan merusak sifat partisi
       yang dijaga di seluruh berkas ini. */
    const disebut = new Set(uc.map(u => _canonProd(u.product || '')));
    Object.keys(lotPer).forEach(c => { if (pakaiLot(c)) disebut.add(c); });
    Object.entries(co.utilizationByProd || {}).forEach(([p, v]) => {
      const mt = Number(v) || 0;
      if (mt <= 0 || disebut.has(_canonProd(p))) return;
      if (PERIOD.active) {
        const raw = (co.etaByProd || {})[p];
        const d = pDate(raw) || _parseEtaLoose(raw);
        if (!d || !inPd(d)) return;
      }
      out[p] = (out[p] || 0) + mt;
    });
    return out;
  }

  const utilAll = co.utilizationByProd || {};
  const lotsByCanon = {}, etaByCanon = {};
  Object.keys(co.shipments || {}).forEach(p => {
    const c = _canonProd(p);
    (lotsByCanon[c] = lotsByCanon[c] || []).push(...(co.shipments[p] || []));
  });
  Object.keys(co.etaByProd || {}).forEach(p => {
    const c = _canonProd(p), v = String(co.etaByProd[p] || '').trim();
    if (v && !etaByCanon[c]) etaByCanon[c] = v;
  });

  /* Walk the UNION of stats products and lot products, keyed canonically but
     reported under the stats spelling where one exists (that is the key
     scopedAvailByProd() looks up). A product can legitimately appear only as
     lots — a lot saved before its stats row exists — and iterating
     utilizationByProd alone would drop it. */
  const keyFor = new Map();
  Object.keys(utilAll).forEach(p => { const c = _canonProd(p); if (!keyFor.has(c)) keyFor.set(c, p); });
  Object.keys(lotsByCanon).forEach(c => { if (!keyFor.has(c)) keyFor.set(c, c); });

  keyFor.forEach((prod, c) => {
    const lots = lotsByCanon[c] || [];
    const lotTotal = lots.reduce((s, l) => s + Math.max(0, Number(l.utilMT) || 0), 0);
    const total = Number(utilAll[prod]) || lotTotal;
    if (total <= 0) return;
    const own = pDate(etaByCanon[c]) || _parseEtaLoose(etaByCanon[c]);
    if (own) { if (inPd(own)) out[prod] = total; return; }
    const dated = lots.filter(l => (Number(l.utilMT) || 0) > 0 && lotUtilDate(l));
    if (!dated.length) return;
    let sum = 0;
    dated.forEach(l => { if (inPd(lotUtilDate(l))) sum += Number(l.utilMT) || 0; });
    if (sum > 0) out[prod] = sum;
  });
  return out;
}
/* ── Arrival dates (ra_records) ────────────────────────────────────────
   `arrival_date` arrives in two shapes: a full ISO timestamp
   (2026-02-22T17:00:00.000Z) and a bare slash date (12/06/2026). Feeding the
   latter to `new Date()` makes JS read it as US M/D — BTS's "12/06/2026" was
   parsed as 6 December instead of 12 June, moving 219.43 MT out of Q2 and into
   Q4. Everywhere else this app reads slash dates as DD/MM via pDate().
   Keep native parsing for unambiguous ISO timestamps; route everything else
   through pDate(), which refuses what it cannot read rather than guessing. */
function raDate(v) {
  if (v == null) return null;
  const s = String(v).trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}T/.test(s)) {          // ISO timestamp — unambiguous
    const d = new Date(s);
    return isNaN(d.getTime()) ? null : d;
  }
  return pDate(s);
}

/* canonicalProduct() lives in 01-data.js. In the browser both files are plain
   scripts sharing one global scope, but this module is also require()d on its
   own by the Node tests — so reach for it defensively rather than assuming it
   is loaded, the same way this file already guards getPertekTerbitForObtained.
   Identity fallback = "no alias table", which is exactly right for a caller
   that has none. */
const _canonProd = p => (typeof canonicalProduct === 'function') ? canonicalProduct(p) : p;

/* ── Utilization pooling ───────────────────────────────────────────────
   Utilization lives on shipment LOTS and is sliced by lot date, but the KPI
   used to pool companies with filteredSPI(), which gates on CYCLE dates. A
   company whose permit is issued in one quarter and whose cargo lands in the
   next then falls out of BOTH: in the first its lot is out of range, in the
   second the company is. IKM's 2,000 MT disappeared from every quarter that
   way — permit Q2 (Submit 30/04, PERTEK 30/06), cargo mid-September (Q3).
   Pool by utilization date as well as cycle date.

   The test IS scopedUtilByProd() — "does this company have any utilization in
   the window" — not a second, narrower re-implementation of it. This used to
   scan shipment lots only, which was right while lots were the sole date
   source; once utilization dates moved to `etaByProd`
   (company_product_stats.eta_jkt) on 2026-08-04 it missed every company whose
   date lives there and silently dropped them from the Utilized KPI (BDG
   350 MT and KARA 100 MT vanished from June exactly that way). Asking the same
   function the KPI sums keeps pool and total in agreement by construction. */
function companiesWithLotsInPeriod() {
  if (!PERIOD.active) return [];
  const all = []
    .concat(typeof SPI     !== 'undefined' && SPI     ? SPI     : [])
    .concat(typeof PENDING !== 'undefined' && PENDING ? PENDING : []);
  return all.filter(co => Object.values(scopedUtilByProd(co)).some(v => (Number(v) || 0) > 0));
}

/* cycle-scoped companies ∪ companies holding a lot dated in the period. */
function utilizationPool(cycleScoped) {
  const base = cycleScoped || [];
  if (!PERIOD.active) return base;
  const seen = new Set(base.map(c => c && c.code));
  const extra = companiesWithLotsInPeriod().filter(c => !seen.has(c.code));
  return extra.length ? base.concat(extra) : base;
}

/* Company-level utilization total, period-sliced. */
function scopedUtilTotal(co) {
  if (!co) return 0;
  /* All Time lewat allTimeUtil(), bukan co.utilizationMT langsung: bila company
     punya rincian per siklus, jumlah potongannya yang berlaku. Kalau tidak,
     irisan periode (yang membaca utilCycles) tidak akan pernah berjumlah sama
     dengan angka sepanjang waktu. */
  if (!PERIOD.active) return (typeof allTimeUtil === 'function') ? allTimeUtil(co) : (Number(co.utilizationMT) || 0);
  return Object.values(scopedUtilByProd(co)).reduce((s, v) => s + v, 0);
}
/* Per-product available, kept consistent with the period view:
   available = OBTAINED (all-time per-product = stats util+avail) − period util.
   So the AVQ card identity obtained = utilized + available still holds when a
   period is active. All Time → the server stats (co.availableByProd) verbatim. */
/* Per-product OBTAINED sliced to the active period, keyed canonically.
   Same cycle rules as canonicalObtainedFiltered() (dedup by type, skip
   mt<=0 / _fromRevReq / not-yet-terbit, anchor on PERTEK Terbit), but summing
   each cycle's per-product map instead of its total. All Time → stats
   util+avail, which is the master's own per-product obtained. */
function scopedObtainedByProd(co) {
  const out = {};
  if (!co) return out;
  if (!PERIOD.active) {
    const u = co.utilizationByProd || {}, a = co.availableByProd || {};
    new Set([...Object.keys(u), ...Object.keys(a)]).forEach(p => {
      const c = _canonProd(p);
      out[c] = (out[c] || 0) + (Number(u[p]) || 0) + (Number(a[p]) || 0);
    });
    return out;
  }
  const detail = scopedObtainedDetailByProd(co);
  Object.keys(detail).forEach(p => { out[p] = detail[p].mt; });
  return out;
}

/* Same slice as scopedObtainedByProd(), but keeping the PERTEK date that
   GRANTED each product — `{ product: { mt, pertek } }`.

   The Lead Time Alert needs that pairing. It used to take ONE date per company
   from getFirstPertekDateForCo(), which only reads Submit #1 / Revision #1 — so a
   company whose in-period quota came from Submit #2 or #3 was stamped with its
   2025 first PERTEK and dropped from the period entirely (11 of 18 companies
   vanished from H1 2026 that way: EMS, KJK, BBB, HKG, CGK, LCP, GNG, BHG, HDP,
   JKT, SJH). A company can hold several PERTEKs; the alert is per PRODUCT, so
   the date has to come from the cycle that granted that product.

   Where two in-period cycles grant the same product, the LATER PERTEK wins —
   the alert measures elapsed time since quota was granted, so the most recent
   grant is the one whose clock is still meaningful. */
function scopedObtainedDetailByProd(co) {
  const out = {};
  if (!co) return out;
  const allCycles = co.cycles || [];
  const seen = new Set();
  allCycles.forEach(c => {
    if (!/^obtained #/i.test(c.type)) return;
    if ((Number(c.mt) || 0) <= 0) return;
    const k = String(c.type).toLowerCase().trim();
    if (seen.has(k)) return;
    seen.add(k);
    if (c._fromRevReq) return;
    if (typeof _isObtainedTerbit === 'function' && !_isObtainedTerbit(c, allCycles)) return;
    let anchor = (typeof getPertekTerbitForObtained === 'function') ? getPertekTerbitForObtained(c, allCycles) : null;
    if (!anchor && c.pertekDate) anchor = pDate(c.pertekDate);
    if (!anchor) anchor = pDate(c.releaseDate) || pDate(c.spiDate);
    if (PERIOD.active && !inPd(anchor)) return;
    Object.entries(c.products || {}).forEach(([p, v]) => {
      const mt = Number(v) || 0;
      if (mt <= 0) return;
      const key = _canonProd(p);
      const e = out[key] || (out[key] = { mt: 0, pertek: null });
      e.mt += mt;
      if (anchor && (!e.pertek || anchor > e.pertek)) e.pertek = anchor;
    });
  });
  return out;
}

function scopedAvailByProd(co) {
  if (!co) return {};
  /* All Time: turunkan dari obtained − utilized yang SUDAH dikoreksi, bukan
     dari `co.availableByProd` mentah. Kolom stats itu belum ikut diperbarui
     ketika utilisasi bertambah, jadi ADP tetap menampilkan sisa 100 MT padahal
     kuotanya sudah habis (350 dari 350). Sama seperti scopedUtilByProd di
     atas — dilaporkan Sales 2026-08-10. */
  if (!PERIOD.active) {
    const uc0 = co.utilCycles;
    if (Array.isArray(uc0) && uc0.length) {
      const su0 = scopedUtilByProd(co);
      const so0 = (typeof getObtainedByProdAgg === 'function') ? getObtainedByProdAgg(co) : {};
      const out0 = {};
      new Set([...Object.keys(so0), ...Object.keys(su0), ...Object.keys(co.availableByProd || {})]).forEach(p => {
        const obt = Number(so0[p]) || Number(so0[_canonProd(p)]) || 0;
        out0[p] = Math.max(0, obt - (Number(su0[p]) || 0));
      });
      return out0;
    }
    return co.availableByProd || {};
  }
  /* available = OBTAINED − UTILIZED, both sliced to the SAME period — the
     report definition. This used to subtract period utilization from ALL-TIME
     obtained, a hybrid that overstated available whenever a period was
     active (quota granted outside the window still counted as available
     inside it). */
  const util_all = co.utilizationByProd || {}, avail_all = co.availableByProd || {};
  const su = scopedUtilByProd(co);
  const so = scopedObtainedByProd(co);
  const out = {};
  new Set([...Object.keys(util_all), ...Object.keys(avail_all)]).forEach(p => {
    const obtained = Number(so[_canonProd(p)]) || 0;
    out[p] = Math.max(0, obtained - (Number(su[p]) || 0));
  });
  return out;
}

/**
 * Extract all key dates from a single cycle object.
 *
 * DATA MODEL (verified against Excel):
 *   Submit #N / Revision #N cycles:
 *     submitDate  → Submit MOI date
 *     releaseDate → PERTEK Terbit date   ← authoritative release date
 *
 *   Obtained #N / Obtained (Revision #N) cycles:
 *     submitDate  → Submit MOT date
 *     releaseDate → SPI Terbit date
 *
 * Returns { submitMOI, pertekTerbit, submitMOT, spiTerbit }
 */
function cycleDates(c) {
  const isSubmitRow   = /^submit #|^revision #/i.test(c.type);
  const isObtainedRow = /^obtained/i.test(c.type);
  return {
    submitMOI:   isSubmitRow   ? pDate(c.submitDate)  : null,
    pertekTerbit: isSubmitRow   ? pDate(c.releaseDate) : null,  // PERTEK Terbit
    submitMOT:   isObtainedRow ? pDate(c.submitDate)  : null,
    // SPI Terbit: own release_date, else the dedicated spi_date field. release_date
    // frequently holds a mis-entered SPI *number* (e.g. "04.PI-05.26.0450.1") while
    // the real date sits in spi_date — reading it lets companies whose SPI was
    // actually issued in-period (BBB/KJK/SJH) surface in the period view, matching
    // the Obtained KPI. (PERTEK Terbit deliberately NOT widened to pertek_date here,
    // to avoid pulling in Submit-#2-only companies — see 2026-07-08 decision.)
    spiTerbit:   isObtainedRow ? (pDate(c.releaseDate) || pDate(c.spiDate)) : null,
  };
}

/**
 * Given an Obtained cycle, find its paired Submit cycle from the same company's
 * cycles array and return the PERTEK Terbit date from that Submit cycle.
 * Pairing: Obtained #1 ← Submit #1, Obtained #2 ← Submit #2, etc.
 * Obtained (Revision #N) ← Revision #N
 */
function getPertekTerbitForObtained(obtCycle, allCycles) {
  // Extract cycle number / revision number from obtained type
  const m = obtCycle.type.match(/^Obtained\s+(?:\(Revision\s+)?#?(\d+)/i);
  if (!m) return null;
  const num = m[1];
  // Find matching Submit or Revision cycle
  const paired = allCycles.find(c => {
    if (c === obtCycle) return false;
    const isRevision = /revision/i.test(obtCycle.type);
    if (isRevision) return new RegExp(`^Revision\\s*#?${num}\\b`, 'i').test(c.type);
    return new RegExp(`^Submit\\s*#?${num}\\b`, 'i').test(c.type);
  });
  return paired ? pDate(paired.releaseDate) : null;
}

/**
 * Does this company (with its cycles array) match the active period?
 * Company is included in tables/charts if ANY cycle has ANY key date in period.
 * This is the broad "show the company row" filter — KPI calculations use
 * narrower per-field filters below.
 */
function companyInPeriod(cycles) {
  if (!PERIOD.active) return true;
  if (!cycles || !cycles.length) return false;  // no cycles → not in any period
  // A company matches only if at least one real (non-null) cycle date falls in period
  return cycles.some(c => {
    const { submitMOI, pertekTerbit, submitMOT, spiTerbit } = cycleDates(c);
    if (inPd(submitMOI) || inPd(pertekTerbit) || inPd(submitMOT) || inPd(spiTerbit)) return true;
    // Revision-Request cycles carry the company's June/period activity (product
    // re-allocation to CorpSec) but are NOT Submit/Obtained rows, so cycleDates()
    // returns nulls for them. Include their own date here so a company that was
    // active only via a revision request still shows in the period view. This is
    // row-inclusion ONLY — quota math (canonicalObtained etc.) still skips these
    // via the _fromRevReq / "Revision Request" rules, so no MT is double-counted.
    if (/^revision request/i.test(c.type || '')) {
      return inPd(pDate(c.submitDate)) || inPd(pDate(c.releaseDate));
    }
    return false;
  });
}

/* Filter SPI array — company is included if any cycle date falls in period */
function filteredSPI() {
  if (!PERIOD.active) return SPI;
  return SPI.filter(d => companyInPeriod(d.cycles || []));
}

/* Filter RA array — match based on SPI company cycle dates (consistent with filteredSPI) */
function filteredRA() {
  if (!PERIOD.active) return RA;
  const validCodes = new Set(SPI.filter(co => companyInPeriod(co.cycles||[])).map(co => co.code));
  return RA.filter(r => validCodes.has(r.code));
}

/* Filter PENDING by cycle dates */
function filteredPending() {
  if (!PERIOD.active) return PENDING;
  return PENDING.filter(d => companyInPeriod(d.cycles || []));
}

/* kpiPool — the companies a KPI card counts: SPI + PENDING, period-filtered
   when a period is active. Identical to the `allCompanies` set 03-kpis.js
   builds for every headline figure.

   EVERY DRILL-DOWN MUST ITERATE THIS, never SPI alone. A drill opens FROM a
   card and exists to explain that card's number; if it iterates a smaller set
   it silently contradicts the figure the user just clicked.

   That is exactly what happened: SNSD lives in PENDING (Obtained #1 = 120 MT,
   PERTEK 04-Aug-2026). The Obtained and Available cards counted it — 34,840 →
   34,960 and 12,293 → 12,413 — but Obtained/Utilized/Available drills all read
   `SPI`, so the company was absent and their totals sat exactly 120 MT below
   the card that opened them. Submit drill was already correct because it
   iterates SPI and PENDING explicitly. */
function kpiPool() {
  return PERIOD.active
    ? [...filteredSPI(), ...filteredPending()]
    : [...SPI, ...PENDING];
}

/* Every company, unfiltered. Submitted/Obtained need this: they do their own
   per-CYCLE date test inside, so pre-filtering by company would apply the
   window twice. */
function allCompaniesPool() {
  return [...SPI, ...PENDING];
}

/* ══════════════════════════════════════════════════════════════════════════
   REPORT TOTALS — the five headline figures, ONE implementation each.

   These numbers appear on THREE pages (Overview · Utilization & Realization ·
   Available Quota) and in the PDF Summary. Each surface used to compute them
   itself, and under a period filter the copies disagreed. Reported by the team
   2026-08-05 for 01 Jan – 30 Jun 2026:

     Utilized   Overview 17.300 · U&R 13.600 · AVQ 18.447
     Obtained   Overview 19.710 · U&R 19.710 · AVQ 30.140
     Realized   Overview 15.438,208 · U&R 11.395,405

   UNFILTERED they all agreed — which is exactly why this survived so long.
   Every copy collapses to the same value when there is no window to slice, so
   the divergence is invisible until someone picks a period. Any check that
   only ever looks at the all-time view cannot catch this class of bug.

   Each gap had its own cause, and none of them was the rule being wrong:
     · U&R utilized — pooled filteredSPI() alone, dropping whole any company
       whose PERTEK sits outside the window but whose CARGO lands inside it.
       Re-admitting those is the entire purpose of utilizationPool(): 3.700 MT.
     · U&R realized — read ra_records.berat (a hand-kept one-row-per-company
       summary) instead of the REALIZATIONS PIB lines the report spec names.
     · AVQ obtained/utilized — all-time figures (canonicalObtained,
       co.utilizationMT) printed beside a period-filtered company list, so the
       cards described a different population than the rows beneath them.

   The Overview implementations were the verified-correct ones (matched against
   the master for H1 2026), so they are what moved here verbatim. Every surface
   now CALLS these. Nothing re-derives them — that is the only thing that keeps
   an arbitrary period, not just Jan–Jun, consistent.

   Each returns { mt, companies }.
   ══════════════════════════════════════════════════════════════════════════ */

/* Σ Submit #N cycles only — Revision Requests track re-allocation, not new
   quota. Deduped per (company, cycle type); anchored on submitDate. */
function reportSubmittedTotal() {
  let mt = 0;
  const cos = new Set();
  allCompaniesPool().forEach(co => {
    const seen = new Set();
    let coTotal = 0, any = false;
    (co.cycles || []).forEach(c => {
      if (!/^submit\s*#\d/i.test(c.type)) return;
      const key = c.type.toLowerCase().trim();
      if (seen.has(key)) return;
      seen.add(key);
      if (c._fromRevReq) return;
      const v = typeof c.mt === 'number' ? c.mt : Number(c.mt) || 0;
      if (v <= 0) return;
      if (PERIOD.active && !inPd(pDate(c.submitDate))) return;
      coTotal += v;
      any = true;
    });
    if (any) { mt += coTotal; cos.add(co.code); }
  });
  return { mt, companies: cos.size };
}

/* Σ Obtained #N where PERTEK/SPI terbit, anchored on the PERTEK of the paired
   Submit row. Delegated to canonicalObtained[Filtered] — never re-implemented;
   a hand-kept copy of these rules is what read 890 MT against a true 10.040. */
function reportObtainedTotal() {
  let mt = 0;
  const cos = new Set();
  allCompaniesPool().forEach(co => {
    const v = PERIOD.active ? canonicalObtainedFiltered(co) : canonicalObtained(co);
    if (v > 0) { mt += v; cos.add(co.code); }
  });
  return { mt, companies: cos.size };
}

/* Σ utilisation sliced by LOT date (rule #3). The pool is widened by
   utilizationPool() so a company that used quota inside the window still
   counts when the permit granting it fell outside. */
function reportUtilizedTotal() {
  const pool = PERIOD.active ? utilizationPool(kpiPool()) : allCompaniesPool();
  let mt = 0, n = 0;
  pool.forEach(co => {
    const v = scopedUtilTotal(co);
    mt += v;
    if (v > 0) n++;
  });
  return { mt, companies: n };
}

/* Σ PIB volume from the realizations tab, anchored on pib_date — the source
   the report spec names ("REALISASI ... kolom Volume"). Falls back to the old
   ra_records path only when the fetch failed, so a dead endpoint degrades to
   previous behaviour instead of showing zero. */
function reportRealizedTotal() {
  if (Array.isArray(window.REALIZATIONS) && REALIZATIONS.length) {
    const rows = REALIZATIONS.filter(r => !PERIOD.active || inPd(pDate(r.pib_date)));
    const cos = new Set(rows.map(r => String(r.company_code || '').toUpperCase()).filter(Boolean));
    const mt = rows.reduce((s, r) => s + (parseFloat(String(r.volume ?? '').replace(/,/g, '')) || 0), 0);
    return { mt, companies: cos.size, codes: [...cos] };
  }
  const arrived = (typeof filteredRA === 'function' ? filteredRA() : RA).filter(r => r.cargoArrived);
  return {
    mt: arrived.reduce((s, r) => s + (Number(r.berat) || 0), 0),
    companies: arrived.length,
    codes: arrived.map(r => r.code),
  };
}

/* reportPendingShipmentTotal — kuota yang sudah dialokasikan tapi barangnya
   BELUM tiba: utilisasi dikurangi realisasi. Diminta tim 2026-08-10,
   menggantikan kartu Total Submitted.

   KUMULATIF, seperti Available — dan itu bukan pilihan gaya. Diuji dulu dengan
   pengurangan per periode, hasilnya rutin NEGATIF: H1 2026 −2.913, Q1 −670,
   Q2 −2.243. Sebabnya 6.872 MT dipakai sepanjang 2025 dengan NOL realisasi;
   barangnya baru tiba di 2026, sehingga di jendela 2026 realisasi melampaui
   pemakaian. "Belum terkirim" itu STOCK (berapa yang sedang di jalan saat ini),
   bukan FLOW (berapa yang bergerak dalam jendela) — sama persis dengan
   Available, dan periode menyaring COMPANY-nya, bukan mengiris saldonya.

   Kolamnya sengaja dibuat sama dengan reportAvailableTotal() supaya dua kartu
   yang sama-sama stock tidak pernah menghitung populasi berbeda. */
function reportPendingShipmentTotal() {
  const pool = PERIOD.active
    ? (() => {
        const aktif = kpiPool();
        const EPOCH = new Date(1900, 0, 1);
        return _asOfPeriod(EPOCH, PERIOD.to, () => aktif.filter(co => canonicalObtainedFiltered(co) > 0));
      })()
    : allCompaniesPool();

  /* Realisasi kumulatif per company — dari baris PIB, sumber yang sama dengan
     kartu Realized, tanpa saringan tanggal (ini stock). Peta dibangun SEKALI:
     versi pertama menyapu seluruh 200+ baris PIB untuk setiap company demi
     menghitung jumlah company, dan itu murni pemborosan. */
  const realPerCo = {};
  if (Array.isArray(window.REALIZATIONS)) {
    REALIZATIONS.forEach(r => {
      const c = String(r.company_code || '').toUpperCase();
      if (!c) return;
      realPerCo[c] = (realPerCo[c] || 0) + (parseFloat(String(r.volume ?? '').replace(/,/g, '')) || 0);
    });
  }

  let util = 0, real = 0, n = 0;
  pool.forEach(co => {
    const u = allTimeUtil(co);
    const r = realPerCo[co && co.code] || 0;
    util += u;
    real += r;
    if (u - r > 0.01) n++;
  });

  return { mt: Math.max(0, util - real), companies: n, utilized: util, realized: real };
}

/* Jalankan fn() seolah jendela aktifnya [from, to], lalu kembalikan seperti
   semula. HANYA untuk pemanggilan sinkron — jangan ada await di dalam fn,
   karena render lain bisa membaca jendela yang sedang ditukar.
   Gunanya: bertanya "apa yang benar per tanggal X" sambil TETAP memakai aturan
   kanonik, bukan menulis ulang salinannya. */
function _asOfPeriod(from, to, fn) {
  const prev = { from: PERIOD.from, to: PERIOD.to, label: PERIOD.label, active: PERIOD.active };
  PERIOD.from = from; PERIOD.to = to; PERIOD.active = !!(from || to);
  try { return fn(); }
  finally { PERIOD.from = prev.from; PERIOD.to = prev.to; PERIOD.label = prev.label; PERIOD.active = prev.active; }
}

/* CUMULATIVE saldo — a balance is a stock, not activity inside a window. The
   period narrows WHICH companies are counted, never how much of their balance
   "belongs to" the window. Confirmed by the data owners 2026-08-04.

   Two conditions, both required (confirmed 2026-08-05):

     1. company aktif di periode — ada cycle-nya di jendela ini (kpiPool)
     2. kuotanya SUDAH TERBIT paling lambat di akhir periode

   Syarat kedua ditambahkan setelah koreksi tanggal MOI SNSD. SNSD mengajukan
   17 Juni (masuk H1) tapi PERTEK-nya baru terbit 4 Agustus, sehingga syarat
   pertama saja membuat saldo 120 MT-nya ikut terhitung di H1 — 11.813, padahal
   master 11.693. Saldo tidak bisa ada sebelum kuota yang melahirkannya:
   sepanjang H1, kuota itu belum pernah tersedia.

   Perhatikan syarat kedua memakai "s/d akhir periode", BUKAN "di dalam
   periode". Sempat diuji dan keduanya keliru:
     · "obtained DI DALAM periode"  -> 10.780; menggugurkan ADP, DIOR, KAN, MIN,
       MJU, MSN yang saldonya sah, cuma kuotanya terbit sebelum jendela ini.
     · "obtained s/d akhir" TANPA syarat aktif -> 12.293; menarik masuk company
       yang tidak beraktivitas sama sekali di periode ini.
   Hanya gabungan keduanya yang menghasilkan 11.693 (H1) sekaligus menjaga
   12.413 (All Time) dan tidak menggeser Q1/Q3. */
function reportAvailableTotal() {
  const pool = availablePool();
  return { mt: cumulativeAvailableTotal(pool), companies: pool.length };
}

/* Ambang "masih bersisa". 0,001 dan bukan 0 supaya sisa pembulatan pecahan
   tidak lolos sebagai saldo (keputusan 2026-08-10). */
const AVQ_EPS = 0.001;

/* ══════════════════════════════════════════════════════════════════════════
   AVAILABLE QUOTA — SATU KOLAM, SATU RINCIAN, SATU ANGKA
   ─────────────────────────────────────────────────────────────────────────
   Dilaporkan tim Sales 2026-08-11: dengan filter periode yang SAMA PERSIS
   (01 Jan – 30 Jun 2026) halaman Overview memberi tiga angka "Available":

     · kartu AVAILABLE QUOTA (Overview)   11.058 MT · tertulis "18 companies"
     · modal "↗ detail" dari kartu itu    12.780 MT · 7 companies
     · tab Available Quota -> Table       ±13.000 MT (dijumlah manual)

   Subset 7 company lebih BESAR daripada set yang mengaku 18 company — mustahil
   secara matematis, dan itulah yang membuat tim tidak bisa mengutip satu angka
   pun ke BOD. Tiga sebab yang berbeda, semuanya nyata di kode:

     1. Kartu memasangkan angka yang benar dengan JUMLAH COMPANY milik metrik
        lain (`obtCoSet.size` — company yang PERTEK-nya terbit di periode ini).
        Tidak pernah ada 18 company di balik 11.058 MT. Inilah "superset" palsu
        yang bikin perbandingannya terlihat mustahil.
     2. Modal & tabel memakai KOLAM yang berbeda dari kartu: `canonicalObtained`
        sepanjang waktu, tanpa gerbang "kuota sudah terbit s/d akhir periode"
        yang dipakai reportAvailableTotal(). Company yang PERTEK-nya baru terbit
        SESUDAH jendela ikut terhitung (kelas bug SNSD, 2026-08-05).
     3. Modal & tabel menurunkan saldo per produk sendiri dari
        `scopedAvailByProd()` (obtained periode − utilisasi periode), sementara
        kartu memakai saldo KUMULATIF. Dua definisi berbeda di bawah satu label.
        Tabel malah mencampur keduanya: obtained ALL-TIME dikurangi utilisasi
        PERIODE — itu sumber angka ±13.000 yang paling menggelembung.

   Perbaikannya bukan menambal ketiganya, melainkan menghapus dua salinan:
   pool + rincian per produk kini punya SATU implementasi di sini, dan kelima
   permukaan (kartu, modal, chart, grid per produk, tabel, popup) merender dari
   `availableQuotaRows()`. Σ baris === reportAvailableTotal().mt, dan jumlah
   company unik === reportAvailableTotal().companies — dijaga
   test_avq_single_source.cjs.
   ══════════════════════════════════════════════════════════════════════════ */

/* Kolam Available Quota — company yang masih PUNYA saldo, dengan syarat
   periode yang sama persis seperti dijelaskan di docblock reportAvailableTotal
   di atas (aktif di periode DAN kuotanya sudah terbit s/d akhir periode). */
function availablePool() {
  const bersisa = co => cumulativeAvailable(co) > AVQ_EPS;
  if (!PERIOD.active) return allCompaniesPool().filter(bersisa);
  const aktif = kpiPool();
  const EPOCH = new Date(1900, 0, 1);
  return _asOfPeriod(EPOCH, PERIOD.to, () =>
    aktif.filter(co => canonicalObtainedFiltered(co) > 0)).filter(bersisa);
}

/* Saldo KUMULATIF per produk, dinormalkan supaya jumlahnya PERSIS
   cumulativeAvailable(co).

   Kenapa dinormalkan dan bukan dipakai apa adanya: obtained per produk berasal
   dari company_product_stats sementara total company berasal dari cycles, dan
   keduanya boleh berbeda tipis (revisi produk, pembulatan manual di XLSX).
   Tanpa normalisasi, Σ rincian ≠ angka kartu — persis keluhan yang sedang
   diperbaiki. Sisa pembagian dibebankan ke produk terakhir supaya tepat, bukan
   di-Math.round() per baris (yang meninggalkan selisih beberapa MT).

   Basis pembagian = sisa per produk. Kalau seluruh sisa per produk nol padahal
   company-nya masih bersaldo (stats belum diperbarui untuk kuota yang baru
   terbit — kasus SNSD), basisnya jatuh ke obtained per produk. */
function cumulativeAvailByProd(co) {
  if (!co) return {};
  const total = cumulativeAvailable(co);
  const obt  = (typeof getObtainedByProdAgg === 'function') ? getObtainedByProdAgg(co) : {};
  const util = (typeof allTimeUtilByProd    === 'function') ? allTimeUtilByProd(co)    : (co.utilizationByProd || {});
  const keys = [...new Set([...Object.keys(obt), ...Object.keys(util)])];
  if (!keys.length) return { [(co.products || [])[0] || '—']: total };

  const out = {};
  let basis = {}, basisSum = 0;
  keys.forEach(p => {
    const v = Math.max(0, (Number(obt[p]) || 0) - (Number(util[p]) || 0));
    basis[p] = v; basisSum += v;
  });
  if (basisSum <= AVQ_EPS && total > AVQ_EPS) {
    basis = {}; basisSum = 0;
    keys.forEach(p => { const v = Math.max(0, Number(obt[p]) || 0); basis[p] = v; basisSum += v; });
  }
  if (basisSum <= 0) { keys.forEach(p => { out[p] = 0; }); return out; }

  const last = keys[keys.length - 1];
  let sisa = total;
  keys.forEach(p => {
    if (p === last) { out[p] = sisa; return; }
    const v = total * basis[p] / basisSum;
    out[p] = v; sisa -= v;
  });
  return out;
}

/* SATU rincian Available Quota — dipakai oleh SEMUA permukaan AVQ.
   Satu baris per (company, produk). Semua angkanya KUMULATIF: saldo adalah
   stock, jadi obtained & utilized di baris ini juga harus all-time, kalau tidak
   "Obtained − Utilized" pada baris/ringkasannya tidak akan pernah sama dengan
   Available yang dicetak di sebelahnya.

   Baris ber-saldo NOL sengaja IKUT selama company-nya masih bersaldo: itu yang
   membuat total Obtained − Utilized = Available bisa diperiksa langsung oleh
   tim. Penyaringan "hanya yang bersisa" berlaku di level COMPANY (availablePool)
   dan — untuk agregasi per produk — SESUDAH dijumlahkan (2026-08-10). */
function availableQuotaRows() {
  const hsOf = p => (typeof prodHS === 'function' ? prodHS(p) : '—');
  const rows = [];
  availablePool().forEach(co => {
    const obt  = (typeof getObtainedByProdAgg === 'function') ? getObtainedByProdAgg(co) : {};
    const util = (typeof allTimeUtilByProd    === 'function') ? allTimeUtilByProd(co)    : (co.utilizationByProd || {});
    const avq  = cumulativeAvailByProd(co);
    const spi  = (typeof getSPI === 'function') ? getSPI(co.code) : null;
    Object.keys(avq).forEach(p => {
      rows.push({
        code:        co.code,
        group:       co.group || (spi && spi.group) || '',
        product:     p,
        hs:          hsOf(p),
        obtained:    Number(obt[p])  || 0,
        utilMT:      Number(util[p]) || 0,
        avq:         Number(avq[p])  || 0,
        updatedBy:   co.updatedBy   || '',
        updatedDate: co.updatedDate || '',
      });
    });
  });
  rows.sort((a, b) => a.code.localeCompare(b.code) || a.product.localeCompare(b.product));
  return rows;
}

/**
 * Get cycles from a company that individually match the active period.
 * Used for per-cycle KPI calculations.
 * @param {Array} cycles    — cycle array from company data
 * @param {string} role     — 'submitRow'|'obtainedRow'|'any'
 * @param {string} dateField — 'submitMOI'|'pertekTerbit'|'submitMOT'|'spiTerbit'|'any'
 * @param {Array}  allCycles — full cycle array (needed for pertekTerbit lookup on obtained rows)
 */
function matchingCycles(cycles, role, dateField, allCycles) {
  if (!cycles) return [];
  const ac = allCycles || cycles;
  return cycles.filter(c => {
    const isObt = /^obtained/i.test(c.type);
    const isSub = /^submit #|^revision #/i.test(c.type);
    if (role === 'submitRow'   && !isSub)  return false;
    if (role === 'obtainedRow' && !isObt)  return false;
    if (!PERIOD.active) return true;
    if (dateField === 'any') {
      const cd = cycleDates(c);
      return inPd(cd.submitMOI)||inPd(cd.pertekTerbit)||inPd(cd.submitMOT)||inPd(cd.spiTerbit);
    }
    if (dateField === 'pertekTerbit' && isObt) {
      // For obtained rows, look up PERTEK Terbit from the paired Submit cycle
      return inPd(getPertekTerbitForObtained(c, ac));
    }
    const cd = cycleDates(c);
    return inPd(cd[dateField]);
  });
}

/** Compatibility shim — old code calls cycleMatchesPeriod */
function cycleMatchesPeriod(cycles) {
  return companyInPeriod(cycles);
}

/* Set filter mode */
function setFilterMode(mode, el) {
  FILTER_MODE = mode;
  document.querySelectorAll('#pf-mode-both,#pf-mode-submit,#pf-mode-release').forEach(x => x.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('pfModeDesc').innerHTML = MODE_DESC[mode];
  if (PERIOD.active) applyPeriodFilter();
}

/* ── UI CONTROLS ── */
function togglePeriod(e) {
  e.stopPropagation();
  const panel = document.getElementById('pfPanel');
  const wrap  = document.getElementById('pfWrap');
  const isOpen = panel.classList.contains('open');
  if (!isOpen) {
    // Position panel under the trigger
    const rect = wrap.getBoundingClientRect();
    panel.style.left = rect.left + 'px';
    panel.classList.add('open');
    wrap.classList.add('open');
    document.getElementById('pfIco').textContent = '▴';
  } else {
    closePeriod();
  }
}

function closePeriod() {
  document.getElementById('pfPanel').classList.remove('open');
  document.getElementById('pfWrap').classList.remove('open');
  document.getElementById('pfIco').textContent = '▾';
}

/* ── Date-input ↔ Date object, always in LOCAL time ───────────────────────
   An <input type="date"> hands back "YYYY-MM-DD". Passing that bare string to
   `new Date()` parses it as UTC midnight — that is the ECMAScript rule for
   the date-ONLY form — whereas "YYYY-MM-DDTHH:MM:SS" with no zone parses as
   LOCAL. onCustomDate() used to mix the two: `new Date(f)` for the start and
   `new Date(t+'T23:59:59')` for the end, so in WIB (UTC+7) the range started
   at 07:00 on the from-day while every record date comes from pDate()'s
   `new Date(y, m-1, d)` — local midnight. A record dated exactly ON the
   from-day therefore sat 7 hours BEFORE the range start and was dropped:
   filtering 01–30 Jun silently lost everything dated 1 June, and the same for
   the 1st of every other month. Both helpers below stay in local time so the
   boundaries line up with the dates being compared. */
function pfParseInputDate(dateStr, endOfDay) {
  if (!dateStr) return null;
  const d = new Date(dateStr + (endOfDay ? 'T23:59:59' : 'T00:00:00'));
  return isNaN(d.getTime()) ? null : d;
}

/* Date -> "YYYY-MM-DD" for an <input type="date">, read in LOCAL time.
   `toISOString().slice(0,10)` converts to UTC first, so a local-midnight date
   in WIB comes back as the PREVIOUS day (1 Apr -> "2026-03-31") — that made
   applyPreset() write a start date one day early into the input. */
function pfFormatInputDate(d) {
  if (!d) return '';
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/* The chips are gone from the UI, but this stays: reports and automation call
   applyPreset('q226') to reproduce a named window. `el` is now optional — it
   used to throw on a missing element, which is exactly what broke headless use. */
function applyPreset(key, el) {
  const p = PRESETS[key];
  if (!p) { console.warn('applyPreset: unknown preset', key); return; }
  document.querySelectorAll('.pf-preset').forEach(x => x.classList.remove('active'));
  if (el && el.classList) el.classList.add('active');
  PERIOD.from   = p.from;
  PERIOD.to     = p.to;
  PERIOD.label  = p.label;
  PERIOD.active = key !== 'all';
  // Sync date inputs (local-time formatting — see pfFormatInputDate)
  document.getElementById('pfFrom').value = pfFormatInputDate(p.from);
  document.getElementById('pfTo').value   = pfFormatInputDate(p.to);
  updatePeriodUI();
  applyPeriodFilter();
}

function onCustomDate() {
  const f = document.getElementById('pfFrom').value;
  const t = document.getElementById('pfTo').value;
  if (!f && !t) { applyPreset('all'); return; }
  // Deactivate presets
  document.querySelectorAll('.pf-preset').forEach(x => x.classList.remove('active'));
  PERIOD.from   = pfParseInputDate(f, false);   // local 00:00:00 on the from-day
  PERIOD.to     = pfParseInputDate(t, true);    // local 23:59:59 on the to-day
  PERIOD.active = !!(f || t);
  // Label off the SAME Date objects the filter uses, so what the banner says
  // and what the filter does can never drift apart.
  const fStr = PERIOD.from ? PERIOD.from.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}) : '—';
  const tStr = PERIOD.to   ? PERIOD.to.toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'})   : '—';
  PERIOD.label = f && t ? fStr + ' – ' + tStr : f ? '≥ ' + fStr : '≤ ' + tStr;
  updatePeriodUI();
  applyPeriodFilter();
}

function clearPeriod() {
  PERIOD = { from:null, to:null, label:'All Time', active:false };
  FILTER_MODE = 'both';
  document.querySelectorAll('.pf-preset').forEach(x => x.classList.remove('active'));
  // #pre-all no longer exists (preset chips removed) — the date inputs below
  // are cleared instead, which is what "All Time" now means.
  document.getElementById('pf-mode-both').classList.add('active');
  document.getElementById('pf-mode-submit').classList.remove('active');
  document.getElementById('pf-mode-release').classList.remove('active');
  document.getElementById('pfModeDesc').innerHTML = MODE_DESC['both'];
  document.getElementById('pfFrom').value = '';
  document.getElementById('pfTo').value   = '';
  updatePeriodUI();
  applyPeriodFilter();
  closePeriod();
}

function updatePeriodUI() {
  const valEl = document.getElementById('pfVal');
  const wrap  = document.getElementById('pfWrap');
  const banner= document.getElementById('pfBanner');
  const bTxt  = document.getElementById('pfBannerTxt');
  const bSub  = document.getElementById('pfBannerSub');
  valEl.textContent = PERIOD.label;
  if (PERIOD.active) {
    // Show active dot in trigger
    if (!document.getElementById('pfDot')) {
      const dot = document.createElement('span');
      dot.id = 'pfDot'; dot.className = 'pf-active-dot';
      wrap.insertBefore(dot, wrap.firstChild);
    }
    banner.classList.add('show');
    const modeLabel = FILTER_MODE==='submit'?'Submit Date':FILTER_MODE==='release'?'Release Date':'Submit + Release Date';
    bTxt.textContent = 'Periode aktif: ' + PERIOD.label + ' · Filter: ' + modeLabel;
    const fSpi = filteredSPI().length, fPend = filteredPending().length, fRa = filteredRA().length;
    bSub.textContent = `${fSpi} SPI · ${fPend} Pending · ${fRa} Realization records ditampilkan`;
  } else {
    const dot = document.getElementById('pfDot');
    if (dot) dot.remove();
    banner.classList.remove('show');
  }
}

function applyPeriodFilter() {
  // Re-render all views that use filtered data
  renderSPI();
  renderUtilTable();
  renderRATable();
  renderMain();
  buildPipeline();
  buildProductDonut();
  buildTopCo();
  buildCmpChart();
  buildCmpList();
  buildRevList();
  buildPendingQuick();
  buildRevSummaryStrip();
  buildPendingSummaryStrip();
  buildPendingTable();
  buildLeadTimeAnalytics();
  buildOUChart();
  buildOUChartOverview();
  updateOUOverviewKPIs();
  updateSalesIntelKPIs();
  buildGauge();          // ← fix: gauge must rebuild on filter change
  updateOverviewStats(); // ← fix: insight strip + gauge labels
  updateOverviewKPIs();  // ← fix: KPI cards (calls filteredSPI/RA/Pending)
  buildAvailableQuota(); // ← fix: AVQ chart re-filters per period
  buildFlowKPIStrip();   // ← fix: flow KPI strip re-calculates obtained/utilized
  buildAvqPageKPIs();    // ← fix: Available Quota page KPI cards re-calculate
  // ── fix: AVQ "By Product" sub-views + Realization% chart were period-AWARE
  //   (they call filteredSPI()/filteredRA()) but were never re-invoked on a
  //   filter change, so the per-product cards/table/chart kept showing the
  //   unfiltered company set. Rebuild them here. They early-return when their
  //   container is absent, so calling the hidden tabs is cheap and safe. ──
  if (typeof buildAvqProdGrid  === 'function') buildAvqProdGrid();
  if (typeof buildAvqTable      === 'function') buildAvqTable();
  if (typeof buildAvqProdChart  === 'function') buildAvqProdChart();
  if (typeof buildUtilChart     === 'function') buildUtilChart();
  // Refresh drill-down modal if currently open
  const drillModal = document.getElementById('obtainedDrillModal');
  if (drillModal && drillModal.style.display !== 'none') refreshObtainedDrill();
  const pendModal = document.getElementById('pendingDrillModal');
  if (pendModal && pendModal.style.display !== 'none') refreshPendingDrill();
  const subModal = document.getElementById('submitDrillModal');
  if (subModal && subModal.style.display !== 'none') refreshSubmitDrill();
  const realModal = document.getElementById('realizedDrillModal');
  if (realModal && realModal.style.display !== 'none') refreshRealizedDrill();
  const raModal = document.getElementById('reapplyDrillModal');
  if (raModal && raModal.style.display !== 'none') refreshReapplyDrill();
}

/* ─────────────────────────────────────────────────────────────────────────
   PERIOD-AWARE KPI ENGINE  — cycle-level, no double counting
   
   KPI 1 Total Submitted  : Submit MOI date of Submit #1 / Submit #2 cycles
   KPI 2 SPI Obtained     : Submit MOT date of Obtained cycles (from SPI only)
   KPI 3 Total Realized   : count of RA companies arrived + ETA JKT in period
   KPI 4 Re-Apply         : eligible/submitted RA companies in period
   KPI 5 Pending          : Submit MOI date of any submit cycle in PENDING
   ───────────────────────────────────────────────────────────────────────── */
/* Node (tests) only — harmless in the browser, where this file is a classic
   script and the declarations above are already globals. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    PERIOD, PRESETS, pDate, raDate, inPd, lotUtilDate,
    pfParseInputDate, pfFormatInputDate,
    companiesWithLotsInPeriod, utilizationPool,
    scopedUtilByProd, scopedUtilTotal, scopedAvailByProd, scopedObtainedByProd,
    scopedObtainedDetailByProd,
    availablePool, cumulativeAvailByProd, availableQuotaRows,
    reportAvailableTotal, kpiPool, allCompaniesPool,
  };
}
