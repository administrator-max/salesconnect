/* ═══════════════════════════════════════════════════════════════════════════
   QUOTA YEAR · VALIDITY DATE · SPI ACTIVE / INACTIVE
   ───────────────────────────────────────────────────────────────────────────
   Tiga hal yang saling bergantung, sengaja disatukan dalam satu berkas karena
   ketiganya menjawab satu pertanyaan: SPI MANA yang berlaku sekarang, dan
   untuk tahun kuota yang mana.

   1. TAHUN KUOTA
      Kuota impor diberikan PER TAHUN KALENDER. Kuota 2026 dan 2027 adalah dua
      jatah terpisah walau company-nya sama, produknya sama, bahkan walau satu
      dokumen PERTEK/SPI menyinggung keduanya. Menjumlahkannya berarti melapor-
      kan saldo yang tidak pernah ada.

      Pengirisan dilakukan DI SUMBER, bukan di tiap pembaca: `SPI`, `PENDING`,
      `RA`, `REALIZATIONS` yang dibaca ~20 berkas lain SELALU berisi tahun yang
      sedang dipilih saja. Data mentahnya disimpan di `SPI_ALL` dst. Cara ini
      dipilih karena puluhan permukaan membaca `SPI` langsung — menambal satu
      per satu pasti menyisakan yang terlewat, dan yang terlewat justru muncul
      di PDF dan Excel yang dikirim ke manajemen (pelajaran 2026-08-12).

      Baris tanpa `quotaYear` = QUOTA_YEAR_DEFAULT. SELURUH data hari ini tidak
      bertahun, jadi tampilan 2026 identik dengan sebelum fitur ini ada, dan
      2027 kosong sampai ada baris yang benar-benar ditandai 2027.

   2. VALIDITY DATE
      Masa berlaku SPI habis di akhir tahun kalender penerbitannya. Jadi
      Validity Date = 31 Desember dari tahun tanggal SPI Terbit yang berlaku —
      SPI Perubahan kalau sudah terbit, kalau belum SPI awal. Contoh PT GAS
      yang diberikan tim: SPI awal terbit 09/01/2026 dan SPI Perubahan terbit
      27/04/2026, keduanya Validity 31/12/2026.

      Kalau ternyata aturannya bukan akhir tahun, YANG DIUBAH HANYA
      spiValidityDate() — seluruh dashboard membacanya dari sini.

   3. ACTIVE / INACTIVE
      Hanya dua kategori (permintaan tim):
        🟢 Active   — SPI yang saat ini masih berlaku/efektif
        ⚪ Inactive — sudah digantikan SPI baru, ATAU sudah lewat Validity Date

      Yang TIDAK boleh terjadi: menyamakan "Perubahan" dengan "penggantian".
      Di data ini "SPI Perubahan" dipakai untuk DUA hal yang berbeda:

        · Re-Apply  — Obtained #2/#3 dengan MT nyata (ADP 250 lalu 100, GNG
                      250/150/200). Kuotanya BERTAMBAH; SPI sebelumnya TETAP
                      berlaku. Menandainya Inactive akan memotong Obtained ADP
                      dari 350 jadi 100 dan melanggar aturan master #2.
        · Revisi    — perpindahan produk. MT 0, dan produknya pindah ke produk
                      lain (PT GAS: BORDES ALLOY -> GI BORON). Di sinilah SPI
                      lama benar-benar digantikan.

      Karena itu penggantian dideteksi lewat PRODUK, bukan lewat kata
      "Perubahan": sebuah SPI jadi Inactive kalau produk yang diberikannya
      sudah tidak lagi dipegang company itu (hilang dari master per-produk),
      atau kalau ada SPI REVISI yang lebih baru memberi produk yang sama.
   ═══════════════════════════════════════════════════════════════════════════ */

/* Tahun kuota yang dianggap benar untuk baris yang TIDAK bertahun. Seluruh
   data yang ada sekarang lahir sebelum kolom quota_year ada. */
const QUOTA_YEAR_DEFAULT = 2026;
/* Tahun yang bisa dipilih. Tambah 2028 di sini saat waktunya tiba — tidak ada
   tempat lain yang perlu disentuh. */
const QUOTA_YEARS = [2026, 2027];
const QUOTA_YEAR_LS_KEY = 'iqdash.quotaYear';

let QUOTA_YEAR = QUOTA_YEAR_DEFAULT;

/* Data mentah lintas tahun. `SPI`/`PENDING`/`RA`/`REALIZATIONS` di 01-data.js
   adalah IRISAN dari keempat ini untuk QUOTA_YEAR yang sedang dipilih. */
let SPI_ALL          = [];
let PENDING_ALL      = [];
let RA_ALL           = [];
let REALIZATIONS_ALL = [];

/* ── pembacaan tahun ─────────────────────────────────────────────────────── */

/** Tahun dari nilai apa pun; null kalau bukan tahun 4 digit yang masuk akal. */
function parseQuotaYear(v) {
  if (v == null || v === '') return null;
  const n = Number(String(v).trim());
  return Number.isInteger(n) && n >= 2000 && n <= 2100 ? n : null;
}

/** Tahun kuota satu baris data (siklus, lot, utilCycle, RA, realisasi).
 *  Menerima ejaan payload (`quotaYear`) maupun ejaan sheet (`quota_year`). */
function rowQuotaYear(r) {
  if (!r) return QUOTA_YEAR_DEFAULT;
  return parseQuotaYear(r.quotaYear) ?? parseQuotaYear(r.quota_year) ?? QUOTA_YEAR_DEFAULT;
}

/** Alias yang lebih enak dibaca di tempat siklus. */
const cycleQuotaYear = c => rowQuotaYear(c);

/** Tahun-tahun yang benar-benar punya isi pada satu company.
 *
 *  Company TANPA siklus sama sekali (7 di antaranya hari ini: APA, KITA, LILO,
 *  PP, SORE, SUJU, UANG) dianggap milik tahun bawaan. Kalau tidak, mereka akan
 *  raib dari SEMUA tahun begitu pengirisan menyala — hilangnya baris tanpa
 *  sebab yang terlihat, kelas kegagalan yang paling sulit dilacak. */
function companyQuotaYears(co) {
  const cycles = (co && co.cycles) || [];
  if (!cycles.length) return new Set([QUOTA_YEAR_DEFAULT]);
  const years = new Set();
  cycles.forEach(c => years.add(cycleQuotaYear(c)));
  return years;
}

/** Apakah company ini punya data pada tahun tsb. */
function companyInQuotaYear(co, year) {
  return companyQuotaYears(co).has(year);
}

/* ── pengirisan ──────────────────────────────────────────────────────────── */

/**
 * Salinan satu company yang HANYA berisi tahun tsb.
 *
 * Mengembalikan OBJEK ASLI (bukan salinan) ketika seluruh siklusnya memang
 * tahun itu — keadaan 100% data hari ini. Itu disengaja: beberapa alur simpan
 * memutasi objek company di tempat lalu memanggil refreshAllSurfaces(), dan
 * kalau yang dipegang layar adalah salinan, perubahannya tidak akan terlihat
 * sampai halaman dimuat ulang.
 */
function sliceCompanyToYear(co, year) {
  if (!co) return co;
  const semua = co.cycles || [];
  if (!semua.length) return year === QUOTA_YEAR_DEFAULT ? co : null;  // lihat companyQuotaYears()
  const cycles = semua.filter(c => cycleQuotaYear(c) === year);
  if (!cycles.length) return null;
  if (cycles.length === semua.length) return co;               // tidak campur → apa adanya

  const out = Object.assign({}, co, { cycles, _quotaYearSliced: true, _allCycles: co.cycles });

  if (Array.isArray(co.utilCycles)) {
    out.utilCycles = co.utilCycles.filter(u => rowQuotaYear(u) === year);
  }
  if (co.shipments && typeof co.shipments === 'object') {
    const ship = {};
    Object.entries(co.shipments).forEach(([prod, lots]) => {
      const kept = (lots || []).filter(l => rowQuotaYear(l) === year);
      if (kept.length) ship[prod] = kept;
    });
    out.shipments = ship;
  }

  /* Peta per-produk dari master (company_product_stats). Tahunnya dititipkan
     pada KUNCI lewat statsYearByProd — lihat catatannya di iqdash_data.php. */
  const sy = co.statsYearByProd || null;
  if (sy) {
    const irisPeta = m => {
      if (!m || typeof m !== 'object') return m;
      const out2 = {};
      Object.entries(m).forEach(([p, v]) => {
        const py = parseQuotaYear(sy[p]) ?? QUOTA_YEAR_DEFAULT;
        if (py === year) out2[p] = v;
      });
      return out2;
    };
    ['utilizationByProd', 'availableByProd', 'realizationByProd', 'etaByProd', 'arrivedByProd']
      .forEach(k => { if (co[k]) out[k] = irisPeta(co[k]); });
    const jumlah = m => Object.values(m || {}).reduce((s, v) => s + (Number(v) || 0), 0);
    out.utilizationMT  = jumlah(out.utilizationByProd);
    out.availableQuota = jumlah(out.availableByProd);
  }

  /* Total company diturunkan ULANG dari siklus tahun ini — kalau tidak, angka
     lintas-tahun dari server ikut terbawa ke tampilan satu tahun. */
  if (typeof canonicalObtained === 'function') {
    const o = canonicalObtained(out);
    out.obtained = o;
    out._canonicalObtained = o;
  }
  if (typeof canonicalSubmitted === 'function') {
    const s = canonicalSubmitted(out);
    out.submit1 = s;
    out._canonicalSubmitted = s;
  }
  return out;
}

/**
 * Isi ulang SPI / PENDING / RA / REALIZATIONS dari data mentah untuk
 * QUOTA_YEAR yang sedang dipilih. Dipanggil setelah loadData() dan setiap kali
 * tahunnya diganti.
 */
function applyQuotaYearSlice() {
  const y = QUOTA_YEAR;
  const iris = arr => (arr || []).map(co => sliceCompanyToYear(co, y)).filter(Boolean);

  SPI     = iris(SPI_ALL);
  PENDING = iris(PENDING_ALL);

  /* RA & realisasi ikut tahun barisnya sendiri, TAPI hanya untuk company yang
     memang punya kuota di tahun itu — baris realisasi tak bertahun milik
     company 2027 tidak boleh menyeret dirinya ke tahun yang salah. */
  const codes = new Set([...SPI, ...PENDING].map(c => c.code));
  RA = (RA_ALL || []).filter(r => rowQuotaYear(r) === y && codes.has(r.code));
  REALIZATIONS = (REALIZATIONS_ALL || []).filter(r =>
    rowQuotaYear(r) === y && codes.has(r.company_code || r.companyCode));

  if (typeof window !== 'undefined') {
    window.SPI = SPI; window.PENDING = PENDING; window.RA = RA;
    window.REALIZATIONS = REALIZATIONS;
  }
}

/**
 * Daftarkan company baru ke data mentah SEKALIGUS ke irisan yang sedang tampil.
 *
 * Alur "New Submission" dan "revisi jadi SPI" memasukkan record baru langsung
 * ke `SPI`/`PENDING` supaya langsung terlihat tanpa menunggu muat ulang. Kalau
 * hanya masuk ke irisan, record itu lenyap begitu tahunnya diganti — dan
 * kembali lagi setelah reload, yang terlihat persis seperti data hilang.
 */
function registerCompanyRecord(rec, section) {
  if (!rec) return;
  /* Siklus yang baru dibuat di layar belum bertahun. Tanpa cap ini ia jatuh ke
     tahun bawaan, jadi record yang baru saja diinput sambil filter 2027 aktif
     langsung raib dari layar — terbaca sebagai simpan yang gagal padahal
     datanya ada. */
  (rec.cycles || []).forEach(c => { if (parseQuotaYear(c && c.quotaYear) == null) c.quotaYear = QUOTA_YEAR; });
  const all = section === 'PENDING' ? PENDING_ALL : SPI_ALL;
  const cur = section === 'PENDING' ? PENDING     : SPI;
  if (!all.some(c => c.code === rec.code)) all.push(rec);
  if (!cur.some(c => c.code === rec.code)) cur.push(rec);
}

/** Pasangan registerCompanyRecord untuk pemindahan PENDING → SPI. */
function unregisterCompanyRecord(code, section) {
  const all = section === 'PENDING' ? PENDING_ALL : SPI_ALL;
  const cur = section === 'PENDING' ? PENDING     : SPI;
  [all, cur].forEach(arr => {
    const i = arr.findIndex(c => c.code === code);
    if (i >= 0) arr.splice(i, 1);
  });
}

/**
 * Siklus LENGKAP satu company untuk dikirim ke server.
 *
 * PATCH /api/company/:code/cycles MENGGANTI seluruh baris siklus company itu.
 * Kalau yang dikirim cuma siklus tahun yang sedang tampil, menyimpan sambil
 * filter 2027 aktif akan MENGHAPUS seluruh siklus 2026 dari sheet. Karena itu
 * setiap penyimpan wajib lewat sini.
 */
function allCyclesForSave(co) {
  if (!co) return [];
  const now = co.cycles || [];
  if (!co._quotaYearSliced) return now;
  const lain = (co._allCycles || []).filter(c => cycleQuotaYear(c) !== QUOTA_YEAR);
  return [...lain, ...now];
}

/* ── pemilihan tahun ─────────────────────────────────────────────────────── */

function loadQuotaYearPref() {
  try {
    const v = parseQuotaYear(localStorage.getItem(QUOTA_YEAR_LS_KEY));
    if (v && QUOTA_YEARS.includes(v)) QUOTA_YEAR = v;
  } catch (e) { /* localStorage diblokir — pakai bawaan */ }
}

function setQuotaYear(year, opts) {
  const y = parseQuotaYear(year);
  if (!y || !QUOTA_YEARS.includes(y)) return;
  if (y === QUOTA_YEAR && !(opts && opts.force)) return;
  QUOTA_YEAR = y;
  try { localStorage.setItem(QUOTA_YEAR_LS_KEY, String(y)); } catch (e) { /* diamkan */ }
  applyQuotaYearSlice();
  renderQuotaYearUI();
  if (typeof refreshAllSurfaces === 'function') refreshAllSurfaces();
  else if (typeof applyPeriodFilter === 'function') applyPeriodFilter();
}

/** Perbarui pemilih tahun + spanduk "tahun kosong". */
function renderQuotaYearUI() {
  const sel = document.getElementById('qySelect');
  if (sel && String(sel.value) !== String(QUOTA_YEAR)) sel.value = String(QUOTA_YEAR);

  const sub = document.getElementById('tbYearSub');
  if (sub) sub.textContent = `Monitoring & Utilization · ${QUOTA_YEAR}`;
  /* Judul tab browser ikut tahunnya — dua tab dashboard yang terbuka bersamaan
     untuk dua tahun berbeda kalau tidak akan terlihat identik. */
  try { document.title = `Import Quota Monitor ${QUOTA_YEAR}`; } catch (e) { /* diamkan */ }

  /* Tahun tanpa data TIDAK boleh tampil sebagai deretan nol tanpa penjelasan —
     nol yang tak dijelaskan terbaca sebagai "kuotanya habis", bukan "belum ada
     datanya". Ini kelas kegagalan yang sama dengan angka lama yang tampak
     benar. */
  const banner = document.getElementById('qyEmptyBanner');
  if (banner) {
    const kosong = !SPI.length && !PENDING.length;
    banner.style.display = kosong ? 'flex' : 'none';
    const txt = document.getElementById('qyEmptyTxt');
    if (txt && kosong) {
      txt.innerHTML = `Belum ada data kuota <strong>${QUOTA_YEAR}</strong>. `
        + `Seluruh angka di bawah nol karena belum ada PERTEK/SPI ${QUOTA_YEAR} yang tercatat — bukan karena kuotanya habis. `
        + `Data ${QUOTA_YEARS.filter(y => y !== QUOTA_YEAR).join('/')} tetap utuh dan bisa dilihat dengan mengganti tahun.`;
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════════════
   VALIDITY DATE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Tanggal yang benar-benar tanggal (bukan TBA/kosong/nomor dokumen). */
function isRealDate(v) {
  const s = String(v == null ? '' : v).trim();
  if (!s || /^(TBA|null|undefined|—|-)$/i.test(s)) return false;
  return typeof pDate === 'function' ? !!pDate(s) : true;
}

/** Tanggal SPI Terbit satu siklus, atau '' kalau SPI-nya belum terbit. */
function cycleSpiTerbitDate(c) {
  if (!c) return '';
  if (isRealDate(c.spiDate)) return String(c.spiDate).trim();
  const rt = String(c.releaseType || '');
  if (/SPI/i.test(rt) && isRealDate(c.releaseDate)) return String(c.releaseDate).trim();
  return '';
}

/** Sudahkah SPI siklus ini terbit? */
const spiIsIssued = c => !!cycleSpiTerbitDate(c);

/**
 * Validity Date sebuah SPI: 31 Desember TAHUN KUOTA-nya.
 *
 * SATU-SATUNYA tempat aturan masa berlaku dinyatakan. Kalau ternyata bukan
 * akhir tahun, hanya fungsi ini yang perlu diubah.
 *
 * Yang dipakai TAHUN KUOTA, bukan tahun tanggal terbitnya — dan perbedaan itu
 * bukan detail kecil. 15 dari 40 company memegang SPI yang TERBIT pada 2025
 * untuk kuota 2026 (ADP 16/12/2025, HKG 31/12/2025, EMS 07/11/2025, dst).
 * Memakai tahun terbit akan menyatakan kelimabelasnya sudah kedaluwarsa hari
 * ini, dan mencabut kuota mereka dari Available Quota — persis kebalikan dari
 * keadaan sebenarnya.
 *
 * Hasilnya tetap sama dengan contoh PT GAS yang diberikan tim: SPI awal terbit
 * 09/01/2026 dan SPI Perubahan terbit 27/04/2026, keduanya Validity 31/12/2026.
 *
 * Tanggal SPI tetap diminta sebagai argumen: SPI yang BELUM terbit tidak punya
 * masa berlaku, dan memulangkan tanggal untuknya berarti mengarang.
 */
function spiValidityDate(spiTerbitDate, quotaYear) {
  if (!isRealDate(spiTerbitDate)) return '';
  let y = parseQuotaYear(quotaYear);
  if (!y) {
    const d = typeof pDate === 'function' ? pDate(spiTerbitDate) : null;
    y = d ? d.getFullYear() : parseQuotaYear(String(spiTerbitDate).slice(-4));
  }
  return y ? `31/12/${y}` : '';
}

/** Sudah lewat masa berlakunya? Tanggal kosong = belum tentu expired → false. */
function validityExpired(validity) {
  if (!isRealDate(validity)) return false;
  const d = typeof pDate === 'function' ? pDate(validity) : null;
  if (!d) return false;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  return d < today;
}

/* ═══════════════════════════════════════════════════════════════════════════
   SPI ACTIVE / INACTIVE
   ═══════════════════════════════════════════════════════════════════════════ */

/** Siklus REVISI — perpindahan produk, bukan penambahan kuota. */
function isRevisionCycle(c) {
  if (!c) return false;
  if (c._fromRevReq) return true;
  return /revision/i.test(String(c.type || ''));
}

/** Rincian produk siklus sebagai daftar {product, mt}; kosong kalau tidak dirinci. */
function cycleProductList(c) {
  const p = c && c.products;
  if (!p || Array.isArray(p)) return [];
  return Object.entries(p)
    .map(([product, mt]) => ({ product, mt: Number(mt) || 0 }))
    .filter(x => x.product);
}

/** Produk yang MASIH dipegang company (master per-produk), sudah kanonik. */
function currentProductSet(co) {
  const kanon = p => (typeof canonicalProduct === 'function' ? canonicalProduct(String(p).trim()) : String(p).trim());
  const set = new Set();
  ['utilizationByProd', 'availableByProd'].forEach(k => {
    Object.entries(co && co[k] || {}).forEach(([p, v]) => {
      if (Number(v) || v === 0) set.add(kanon(p));
    });
  });
  (co && co.products || []).forEach(p => set.add(kanon(p)));
  return set;
}

/** Siklus Submit/Revision yang berpasangan dengan satu siklus Obtained. */
function pairedSubmitCycle(obtCycle, allCycles) {
  const m = String(obtCycle && obtCycle.type || '').match(/^Obtained\s+(?:\(Revision\s+)?#?(\d+)/i);
  if (!m) return null;
  const num = m[1];
  const rev = /revision/i.test(obtCycle.type);
  return (allCycles || []).find(c => {
    if (c === obtCycle) return false;
    return rev
      ? new RegExp(`^Revision\\s*#?${num}\\b`, 'i').test(c.type || '')
      : new RegExp(`^Submit\\s*#?${num}\\b`, 'i').test(c.type || '');
  }) || null;
}

/** Nomor dokumen yang tertanam di string status siklus, mis.
 *  "SPI Perubahan TERBIT — No. 04.PI-05.26.0328.1 · 27/04/2026". */
function docNoFromStatus(status) {
  const m = String(status || '').match(/No\.?\s*([A-Za-z0-9][A-Za-z0-9./\-]{5,})/);
  return m ? m[1].replace(/[.·]+$/, '') : '';
}

/**
 * Seluruh SPI yang PERNAH terbit untuk satu company, terbaru di bawah.
 *
 * Termasuk siklus "dokumen saja" (MT 0 tanpa rincian produk) — mereka tidak
 * memberi kuota tapi ikut menentukan SPI mana yang paling akhir, jadi tidak
 * boleh dibuang sebelum status dihitung. Penyaringannya belakangan, di
 * spiTerbitRows().
 */
function issuedSpiCycles(co) {
  const all = (co && co.cycles) || [];
  return all
    .filter(spiIsIssued)
    .map(c => ({ c, date: cycleSpiTerbitDate(c), ts: (typeof pDate === 'function' ? pDate(cycleSpiTerbitDate(c)) : null) }))
    .sort((a, b) => (a.ts && b.ts ? a.ts - b.ts : 0));
}

/**
 * Validity Date yang BERLAKU untuk satu company: ikut SPI yang Active.
 * SPI Perubahan kalau sudah terbit, kalau belum SPI awal.
 */
function activeValidityDate(co) {
  const issued = issuedSpiCycles(co);
  if (!issued.length) return '';
  const akhir = issued[issued.length - 1];
  return spiValidityDate(akhir.date, cycleQuotaYear(akhir.c));
}

/**
 * Status satu SPI terbit: 'active' | 'inactive', beserta alasannya.
 *
 * Urutan pemeriksaan sengaja begini:
 *   1. Lewat Validity Date        → Inactive (apa pun yang lain)
 *   2. Produknya sudah tidak dipegang company → Inactive (digantikan revisi).
 *      Inilah kasus PT GAS: BORDES ALLOY pindah ke GI BORON, jadi SPI lama
 *      mati walau Validity-nya masih 31/12/2026.
 *   3. Ada SPI REVISI lebih baru yang memberi produk yang sama → Inactive.
 *   4. Siklus "dokumen saja" (tanpa rincian) → Active hanya bila ia SPI paling
 *      akhir; kalau tidak, ia sudah lewat.
 *   5. Sisanya Active — termasuk seluruh SPI Re-Apply, yang MENAMBAH kuota dan
 *      tidak menggantikan apa pun (aturan master #2).
 */
function spiCycleStatus(co, cycle, issued) {
  const list = issued || issuedSpiCycles(co);
  const me   = list.find(x => x.c === cycle);
  const date = me ? me.date : cycleSpiTerbitDate(cycle);
  const validity = spiValidityDate(date, cycleQuotaYear(cycle));

  if (validityExpired(validity)) return { status: 'inactive', reason: 'Masa berlaku sudah lewat' };

  const prods = cycleProductList(cycle);

  if (!prods.length) {
    const terakhir = list.length ? list[list.length - 1].c : null;
    return terakhir === cycle
      ? { status: 'active',   reason: 'SPI terakhir yang terbit' }
      : { status: 'inactive', reason: 'Sudah digantikan SPI yang lebih baru' };
  }

  const kanon = p => (typeof canonicalProduct === 'function' ? canonicalProduct(String(p).trim()) : String(p).trim());
  const masih = currentProductSet(co);
  /* Peta produk KOSONG bukan bukti apa-apa. Company yang belum punya baris di
     company_product_stats maupun daftar company_products akan memulangkan set
     kosong, dan menganggapnya "semua produknya sudah pindah" akan mematikan
     SELURUH SPI-nya sekaligus. Tidak adanya data tidak boleh menyamar jadi
     bukti penggantian. */
  if (masih.size) {
    const adaYangMasih = prods.some(p => masih.has(kanon(p.product)));
    if (!adaYangMasih) {
      return { status: 'inactive', reason: 'Produknya sudah dipindahkan ke SPI Perubahan' };
    }
  }

  const iMe = list.findIndex(x => x.c === cycle);
  const digantikan = list.slice(iMe + 1).some(x =>
    isRevisionCycle(x.c) &&
    cycleProductList(x.c).some(q => prods.some(p => kanon(p.product) === kanon(q.product)))
  );
  if (digantikan) return { status: 'inactive', reason: 'Digantikan SPI Perubahan untuk produk yang sama' };

  return { status: 'active', reason: 'SPI berlaku' };
}

/**
 * Baris tabel "PERTEK & SPI Terbit" — satu baris per SPI terbit per produk.
 *
 * Susunan kolom yang diminta tim:
 *   Company | Type | Cycle | Product | Submit (MT) | Obtained (MT) |
 *   PERTEK Date | PERTEK No. | SPI Date | SPI No. | Validity Date | SPI Status
 *
 * Siklus "dokumen saja" (MT 0, tanpa rincian produk) DILEWATI: kolom Product,
 * Submit, dan Obtained-nya kosong semua, jadi barisnya tidak menerangkan apa
 * pun. Jumlah yang dilewati dipulangkan di `.skippedDocOnly` supaya bisa
 * dinyatakan di kaki tabel — bukan hilang diam-diam.
 */
function spiTerbitRows() {
  const rows = [];
  let skippedDocOnly = 0;
  const pool = typeof filteredSPI === 'function'
    ? [...filteredSPI(), ...(typeof filteredPending === 'function' ? filteredPending() : [])]
    : [...SPI, ...PENDING];

  pool.forEach(co => {
    const all    = co.cycles || [];
    const issued = issuedSpiCycles(co);
    const terbaru = issued.length ? issued[issued.length - 1].c : null;

    issued.forEach(({ c, date }) => {
      const prods    = cycleProductList(c);
      const validity = spiValidityDate(date, cycleQuotaYear(c));
      const st       = spiCycleStatus(co, c, issued);
      if (!prods.length) { skippedDocOnly++; return; }

      const sub      = pairedSubmitCycle(c, all);
      const pertekDt = sub ? (isRealDate(sub.releaseDate) ? String(sub.releaseDate).trim()
                                                          : (isRealDate(sub.pertekDate) ? String(sub.pertekDate).trim() : ''))
                           : (isRealDate(c.pertekDate) ? String(c.pertekDate).trim() : '');
      /* Nomor dokumen hanya tersimpan di tingkat COMPANY (yang terbaru) dan
         kadang tertanam di string status siklus. Baris lama sengaja memulangkan
         '' daripada mengulang nomor terbaru — mengulangnya berarti mencetak
         nomor yang salah pada baris historis. */
      const spiNo    = docNoFromStatus(c.status) || (c === terbaru ? (co.spiNo || '') : '');
      const pertekNo = (sub && docNoFromStatus(sub.status))
                     || (c === terbaru ? (co.pertekNo || '') : '');
      const subProds = sub ? cycleProductList(sub) : [];

      prods.forEach(p => {
        const subMt = subProds.length
          ? (subProds.find(x => x.product === p.product) || {}).mt
          : (prods.length === 1 && sub && typeof sub.mt === 'number' ? sub.mt : undefined);
        rows.push({
          code: co.code, group: co.group || '', section: co.section || '',
          type:  c.releaseType || 'SPI',
          cycle: c.type || '',
          product: p.product,
          submitMT:   subMt == null ? null : Number(subMt),
          obtainedMT: Number(p.mt) || 0,
          pertekDate: pertekDt, pertekNo,
          spiDate: date, spiNo,
          validityDate: validity,
          status: st.status, reason: st.reason,
          isRevision: isRevisionCycle(c),
        });
      });
    });
  });

  rows.sort((a, b) =>
    a.code.localeCompare(b.code) ||
    (typeof pDate === 'function' && pDate(a.spiDate) && pDate(b.spiDate) ? pDate(a.spiDate) - pDate(b.spiDate) : 0) ||
    a.product.localeCompare(b.product));
  rows.skippedDocOnly = skippedDocOnly;
  return rows;
}

/**
 * Validity Date per (company, produk) untuk tabel Available Quota — diambil
 * dari SPI yang AKTIF saja. Produk yang saldonya hanya berasal dari SPI
 * Inactive memulangkan '' dan ditandai di tabelnya.
 */
function activeValidityByProduct() {
  const map = {};
  const kanon = p => (typeof canonicalProduct === 'function' ? canonicalProduct(String(p).trim()) : String(p).trim());
  spiTerbitRows().forEach(r => {
    if (r.status !== 'active') return;
    const k = r.code + '|' + kanon(r.product);
    const cur = map[k];
    if (!cur || (typeof pDate === 'function' && pDate(r.spiDate) && pDate(cur.spiDate) && pDate(r.spiDate) > pDate(cur.spiDate))) {
      map[k] = { validityDate: r.validityDate, spiDate: r.spiDate, spiNo: r.spiNo };
    }
  });
  return map;
}

/* Node (tes) saja — di browser berkas ini skrip klasik dan semuanya sudah global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QUOTA_YEAR_DEFAULT, QUOTA_YEARS,
    parseQuotaYear, rowQuotaYear, cycleQuotaYear, companyQuotaYears, companyInQuotaYear,
    sliceCompanyToYear, allCyclesForSave,
    isRealDate, cycleSpiTerbitDate, spiIsIssued, spiValidityDate, validityExpired,
    isRevisionCycle, cycleProductList, currentProductSet, pairedSubmitCycle, docNoFromStatus,
    issuedSpiCycles, activeValidityDate, spiCycleStatus, spiTerbitRows, activeValidityByProduct,
  };
}
