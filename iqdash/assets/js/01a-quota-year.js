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
   SPI ACTIVE / INACTIVE — MODEL PER PRODUK
   ───────────────────────────────────────────────────────────────────────────
   Pertanyaan yang dijawab bagian ini: untuk setiap PRODUK yang dipegang sebuah
   company, DOKUMEN MANA yang saat ini memberinya kuota, dan apakah dokumen itu
   masih berlaku.

   Percobaan pertama (2026-08-26) menjawabnya per DOKUMEN: telusuri tiap siklus
   SPI, baca rincian produknya, tentukan statusnya. Itu gagal untuk MJU dan BDG,
   dan kegagalannya mengajarkan bentuk data yang sebenarnya:

     · Rincian produk sebuah revisi disimpan di siklus PERTEK Perubahan
       (Revision #N) sebagai SELISIH — MJU Revision #2 berbunyi
       {HRPO ALLOY: +200, HOLLOW PIPE: -200}.
     · Siklus SPI Perubahan pasangannya (Obtained (Revision #N)) MT-nya 0 dan
       rincian produknya KOSONG. Ia dokumen, bukan pembawa kuota.

   Jadi mencari produk di siklus SPI berarti mencari di tempat yang memang tidak
   pernah diisi. MJU HRPO ALLOY 200 MT lalu tidak punya SPI aktif sama sekali,
   dan BDG GL ALLOY 650 + GI ALLOY 350 ikut hilang.

   Model sekarang membalik arahnya:

     1. Produk yang DIPEGANG company hari ini datang dari master per-produk
        (company_product_stats, lewat getObtainedByProdAgg). Master sudah
        menyimpan NET sesudah semua revisi — itu kebenaran yang tidak perlu
        direkonstruksi ulang dari siklus.
     2. Dokumen yang BERLAKU adalah pasangan PERTEK + SPI yang TERAKHIR terbit
        untuk company itu. PERTEK Perubahan mengalahkan PERTEK awal; SPI
        Perubahan mengalahkan SPI awal.
     3. Setiap produk yang masih dipegang → 🟢 Active di bawah dokumen itu.
        Yang pernah diberikan dokumen lama tapi sudah tidak dipegang lagi →
        ⚪ Inactive, lengkap dengan dokumen historisnya.

   Diuji terhadap angka yang diberikan tim:
     MJU  HRPO ALLOY 200 → PERTEK Perubahan 30/06/2026 · SPI Perubahan 16/07/2026
     BDG  GL ALLOY 650 + GI ALLOY 350 → PERTEK 22/06/2026 · SPI 21/07/2026
   Keduanya keluar persis, tanpa satu pun kasus dikhususkan.

   Konsekuensi yang disengaja: Re-Apply tidak lagi melahirkan dua baris Active
   untuk satu produk. ADP memegang GL ALLOY 350 (250 dari Obtained #1 + 100 dari
   Obtained #2) — satu baris, 350 MT, di bawah SPI terakhir. Kuotanya tetap
   bertambah (aturan master #2); yang tidak digandakan hanya barisnya.
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

/** Nama produk kanonik — satu produk, satu ejaan. */
function kanonProduk(p) {
  const s = String(p == null ? '' : p).trim();
  if (!s) return s;
  return (typeof canonicalProduct === 'function') ? canonicalProduct(s) : s;
}

/** Produk yang MASIH dipegang company (master per-produk), sudah kanonik. */
function currentProductSet(co) {
  const set = new Set();
  ['utilizationByProd', 'availableByProd'].forEach(k => {
    Object.entries(co && co[k] || {}).forEach(([p, v]) => {
      if (Number(v) || v === 0) set.add(kanonProduk(p));
    });
  });
  (co && co.products || []).forEach(p => set.add(kanonProduk(p)));
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
      ? new RegExp('^Revision\\s*#?' + num + '\\b', 'i').test(c.type || '')
      : new RegExp('^Submit\\s*#?' + num + '\\b', 'i').test(c.type || '');
  }) || null;
}

/** Nomor dokumen yang tertanam di string status siklus, mis.
 *  "SPI Perubahan TERBIT — No. 04.PI-05.26.0328.1 · 27/04/2026". */
function docNoFromStatus(status) {
  const m = String(status || '').match(/No\.?\s*([A-Za-z0-9][A-Za-z0-9./\-]{5,})/);
  return m ? m[1].replace(/[.·]+$/, '') : '';
}

/** Tanggal PERTEK Terbit satu siklus, atau '' kalau belum terbit. */
function cyclePertekTerbitDate(c) {
  if (!c) return '';
  if (isRealDate(c.pertekDate)) return String(c.pertekDate).trim();
  const rt = String(c.releaseType || '');
  if (/PERTEK/i.test(rt) && isRealDate(c.releaseDate)) return String(c.releaseDate).trim();
  return '';
}

/** Semua SPI yang pernah terbit untuk satu company, TERBARU DI BELAKANG. */
function issuedSpiCycles(co) {
  return ((co && co.cycles) || [])
    .filter(spiIsIssued)
    .map(c => ({ c, date: cycleSpiTerbitDate(c), ts: (typeof pDate === 'function' ? pDate(cycleSpiTerbitDate(c)) : null) }))
    .sort((a, b) => (a.ts && b.ts ? a.ts - b.ts : 0));
}

/** Semua PERTEK yang pernah terbit untuk satu company, TERBARU DI BELAKANG. */
function issuedPertekCycles(co) {
  return ((co && co.cycles) || [])
    .filter(c => !!cyclePertekTerbitDate(c))
    .map(c => ({ c, date: cyclePertekTerbitDate(c), ts: (typeof pDate === 'function' ? pDate(cyclePertekTerbitDate(c)) : null) }))
    .sort((a, b) => (a.ts && b.ts ? a.ts - b.ts : 0));
}

/**
 * Pasangan dokumen yang BERLAKU untuk satu company: PERTEK terakhir terbit +
 * SPI terakhir terbit.
 *
 * Nomornya diambil dari kolom tingkat company (co.pertekNo / co.spiNo) — kolom
 * itu memang selalu ditimpa dengan nomor Perubahan terbaru oleh rrMarkApproved,
 * jadi ia SUDAH berarti "nomor yang berlaku sekarang". Nomor yang tertanam di
 * string status siklus dipakai lebih dulu bila ada, karena itu lebih spesifik.
 */
function activeDocuments(co) {
  const spiList    = issuedSpiCycles(co);
  const pertekList = issuedPertekCycles(co);
  const spi    = spiList.length    ? spiList[spiList.length - 1]       : null;
  const pertek = pertekList.length ? pertekList[pertekList.length - 1] : null;
  return {
    spiCycle:    spi ? spi.c : null,
    spiDate:     spi ? spi.date : '',
    spiNo:       (spi && docNoFromStatus(spi.c.status)) || (co && co.spiNo) || '',
    pertekCycle: pertek ? pertek.c : null,
    pertekDate:  pertek ? pertek.date : '',
    pertekNo:    (pertek && docNoFromStatus(pertek.c.status)) || (co && co.pertekNo) || '',
    quotaYear:   spi ? cycleQuotaYear(spi.c) : (pertek ? cycleQuotaYear(pertek.c) : QUOTA_YEAR),
  };
}

/**
 * Validity Date yang BERLAKU untuk satu company: ikut SPI yang Active.
 * SPI Perubahan kalau sudah terbit, kalau belum SPI awal. '' kalau belum ada
 * SPI sama sekali — masa berlaku dokumen yang belum terbit tidak dikarang.
 */
function activeValidityDate(co) {
  const d = activeDocuments(co);
  return d.spiDate ? spiValidityDate(d.spiDate, d.quotaYear) : '';
}

/**
 * Riwayat pemberian kuota per produk: produk mana pernah diberikan dokumen
 * mana. Dipakai untuk membangun baris ⚪ Inactive — produk yang pernah dipegang
 * lalu dipindahkan revisi.
 *
 * Sumbernya DUA tempat, karena kuota memang tercatat di dua tempat:
 *   · siklus Obtained #N        — rincian produk pemberian awal / re-apply
 *   · siklus Revision #N        — SELISIH produk sebuah revisi; yang POSITIF
 *                                 berarti produk itu diberikan oleh revisi itu
 * Nilai negatif dilewati: itu penarikan, bukan pemberian.
 *
 * Siklus yang BELUM TERBIT dilewati seluruhnya, lewat gerbang yang sama persis
 * dengan canonicalObtained() — _isObtainedTerbit(). Tanpa gerbang itu, CGK
 * Obtained #2 (300 MT GL ALLOY, PERTEK dan SPI sama-sama masih kosong) muncul
 * sebagai baris ber-300 MT, sementara kartu Obtained dengan benar tidak
 * menghitungnya. Dua angka untuk satu hal — kelas kegagalan yang paling sering
 * berulang di dashboard ini, dan satu-satunya obatnya adalah memakai gerbang
 * yang sama, bukan gerbang yang mirip.
 */
function productGrantHistory(co) {
  const all = (co && co.cycles) || [];
  const out = {};   // produk kanonik -> { mt, spiCycle, spiDate, pertekCycle, pertekDate, ts }
  const catat = (prod, mt, spiC, pertekC) => {
    const k = kanonProduk(prod);
    if (!k || !(mt > 0)) return;
    const spiDate    = spiC ? cycleSpiTerbitDate(spiC) : '';
    const pertekDate = pertekC ? cyclePertekTerbitDate(pertekC) : '';
    const ts = (typeof pDate === 'function' && spiDate) ? pDate(spiDate) : null;
    const cur = out[k];
    /* Pemberian TERBARU yang menang — kalau satu produk pernah diberikan
       beberapa kali, dokumen yang relevan adalah yang terakhir. */
    if (cur && cur.ts && ts && ts < cur.ts) return;
    out[k] = { mt, spiCycle: spiC, spiDate, pertekCycle: pertekC, pertekDate, ts };
  };

  all.forEach(c => {
    const tipe = String(c.type || '');
    if (/^obtained/i.test(tipe)) {
      /* Gerbang TERBIT — sama dengan canonicalObtained(). Siklus yang kuotanya
         belum terbit belum memberi apa-apa. */
      if (typeof _isObtainedTerbit === 'function' && !_isObtainedTerbit(c, all)) return;
      const pasangan = pairedSubmitCycle(c, all);
      cycleProductList(c).forEach(p => catat(p.product, p.mt, c, pasangan));
      /* Siklus SPI Perubahan sering kosong rinciannya sementara PASANGANNYA
         (PERTEK Perubahan) yang membawa selisih produknya. Itu bentuk data MJU
         dan BDG, dan mengabaikannya adalah bug yang diperbaiki di sini. */
      if (!cycleProductList(c).length && pasangan) {
        cycleProductList(pasangan).forEach(p => catat(p.product, p.mt, c, pasangan));
      }
    }
  });
  return out;
}

/**
 * Golongan proses satu company — dipakai untuk kolom Status DAN untuk pil
 * penyaring di atas tabel. Satu fungsi supaya angka di pil tidak bisa berbeda
 * dari label di barisnya.
 *
 * All | Completed | Under Submission | Pending | New Submission
 */
function processStatus(co) {
  if (!co) return { key: 'pending', label: '⏳ Pending' };
  const seksi = String(co.section || '').toUpperCase();
  if (seksi === 'PENDING') {
    const adaPertek = (typeof _pendingHasPertek === 'function') ? _pendingHasPertek(co) : false;
    return adaPertek
      ? { key: 'pending', label: '⏳ Pending' }
      : { key: 'newsub',  label: '📬 New Submission' };
  }
  const rs = (typeof revisionStatus === 'function') ? revisionStatus(co) : 'clean';
  if (rs === 'active' || rs === 'reapply') return { key: 'under',     label: '🔄 Under Submission' };
  if (rs === 'revpending')                 return { key: 'pending',   label: '⏳ Pending' };
  return { key: 'completed', label: '✅ Completed' };
}

/**
 * Baris tabel utama "PERTEK & SPI Terbit" — SATU BARIS PER (COMPANY, PRODUK).
 *
 * Susunan yang diminta tim:
 *   No. | Company | Group | Cycle | Products | Submit (MT) | Obtained (MT) |
 *   Util (MT) | Status | Remarks | PERTEK No. | PERTEK Date | SPI No. |
 *   SPI Date | Validity Date | SPI Status
 *
 * Company/produk tidak diulang: tiap produk muncul satu kali, membawa Submit,
 * Obtained, dan Util-nya sendiri.
 */
function spiTerbitRows() {
  const rows = [];
  const pool = typeof filteredSPI === 'function'
    ? [...filteredSPI(), ...(typeof filteredPending === 'function' ? filteredPending() : [])]
    : [...SPI, ...PENDING];

  pool.forEach(co => {
    const dok    = activeDocuments(co);
    const proses = processStatus(co);
    const validity = dok.spiDate ? spiValidityDate(dok.spiDate, dok.quotaYear) : '';
    const kedaluwarsa = validityExpired(validity);

    const obt  = (typeof getObtainedByProdAgg === 'function') ? (getObtainedByProdAgg(co) || {}) : {};
    const util = (typeof allTimeUtilByProd    === 'function') ? (allTimeUtilByProd(co)    || {}) : (co.utilizationByProd || {});
    const sub  = (typeof scopedSubmittedByProd === 'function') ? (scopedSubmittedByProd(co) || {}) : {};
    const riwayat = productGrantHistory(co);

    const ambil = (peta, prod) => {
      if (!peta) return 0;
      if (peta[prod] != null) return Number(peta[prod]) || 0;
      const hit = Object.keys(peta).find(k => kanonProduk(k) === prod);
      return hit ? (Number(peta[hit]) || 0) : 0;
    };

    /* ── Produk yang MASIH dipegang → di bawah dokumen yang berlaku ──
       Diambil dari NILAI-nya, bukan dari kunci petanya. Master TIDAK menghapus
       produk yang sudah dipindahkan revisi — ia menyisakannya sebagai entri
       bernilai NOL. GAS masih punya "BORDES ALLOY": util 0 / avail 0, begitu
       juga MJU. Membaca kunci saja membuat produk yang sudah lama pindah tetap
       terhitung dipegang, lalu tampil 🟢 Active dengan kolom Obtained kosong —
       persis kebalikan dari yang diminta tim.

       Ketahuan hanya saat halaman ini benar-benar dirender atas data hidup;
       cache uji (10 Agu) belum memuat entri nol itu. Karena itu bentuknya
       sekarang dikunci uji tersendiri, bukan disandarkan pada cache. */
    const aktif = new Set();
    [obt, util].forEach(peta => Object.entries(peta || {}).forEach(([p, v]) => {
      if ((Number(v) || 0) > 0) { const k = kanonProduk(p); if (k) aktif.add(k); }
    }));
    /* Company yang belum punya baris stats sama sekali (New Submission, atau
       PERTEK baru terbit sebelum master disegarkan) tetap harus muncul —
       produknya diambil dari pengajuan. Tidak ada yang ditebak: keduanya nama
       produk yang memang tercatat pada company itu. */
    if (!aktif.size) {
      Object.keys(sub).map(kanonProduk).filter(Boolean).forEach(p => aktif.add(p));
      (co.products || []).map(kanonProduk).filter(Boolean).forEach(p => aktif.add(p));
    }

    const buatBaris = (prod, opsi) => {
      const h = opsi.historis ? (riwayat[prod] || null) : null;
      const spiDate    = h ? h.spiDate    : dok.spiDate;
      const pertekDate = h ? h.pertekDate : dok.pertekDate;
      const vDate = spiDate
        ? spiValidityDate(spiDate, h ? cycleQuotaYear(h.spiCycle) : dok.quotaYear)
        : '';
      const siklus = h && h.spiCycle ? (h.spiCycle.type || '')
                   : (dok.spiCycle ? (dok.spiCycle.type || '')
                   : (dok.pertekCycle ? (dok.pertekCycle.type || '') : ''));
      /* Nomor dokumen pada baris HISTORIS hanya dicetak kalau memang tersimpan
         pada siklusnya. Meminjam nomor terbaru berarti mencetak nomor yang
         salah di baris yang justru dibaca sebagai arsip. */
      const spiNo    = h ? docNoFromStatus(h.spiCycle && h.spiCycle.status)       : dok.spiNo;
      const pertekNo = h ? docNoFromStatus(h.pertekCycle && h.pertekCycle.status) : dok.pertekNo;

      let status, reason;
      if (!spiDate) {
        status = 'none';
        reason = pertekDate
          ? 'PERTEK sudah terbit, SPI belum — belum ada masa berlaku'
          : 'Belum ada PERTEK/SPI yang terbit';
      } else if (opsi.historis) {
        status = 'inactive';
        reason = 'Produk ini sudah dipindahkan oleh PERTEK & SPI Perubahan yang lebih baru';
      } else if (validityExpired(vDate)) {
        status = 'inactive';
        reason = 'Masa berlaku SPI sudah lewat (' + vDate + ')';
      } else {
        status = 'active';
        reason = 'Diberikan oleh SPI yang berlaku' + (dok.spiDate ? ' — terbit ' + dok.spiDate : '');
      }

      rows.push({
        code: co.code, group: co.group || '', section: co.section || '',
        cycle: siklus,
        product: prod,
        submitMT:   opsi.historis ? (h ? h.mt : null) : (ambil(sub, prod)  || 0),
        obtainedMT: opsi.historis ? (h ? h.mt : 0)    : (ambil(obt, prod)  || 0),
        utilMT:     opsi.historis ? 0                 : (ambil(util, prod) || 0),
        processKey: proses.key, processLabel: proses.label,
        remarks: co.statusUpdate || '',
        pertekNo, pertekDate, spiNo, spiDate,
        validityDate: vDate,
        status, reason,
        historis: !!opsi.historis,
      });
    };

    [...aktif].sort().forEach(p => buatBaris(p, { historis: false }));

    /* ── Produk yang PERNAH dipegang tapi sudah tidak lagi → ⚪ Inactive ──
       Tetap ditampilkan sebagai data historis (permintaan tim), tapi tidak ikut
       perhitungan kuota aktif mana pun. */
    Object.keys(riwayat).filter(p => !aktif.has(p)).sort().forEach(p => buatBaris(p, { historis: true }));
  });

  rows.sort((a, b) =>
    a.code.localeCompare(b.code) ||
    (a.historis === b.historis ? 0 : (a.historis ? 1 : -1)) ||
    a.product.localeCompare(b.product));
  return rows;
}

/**
 * Validity Date per (company, produk) untuk tabel Available Quota.
 *
 * SATU sumber dengan tabel PERTEK & SPI Terbit — halaman Available Quota
 * memanggil fungsi ini, bukan menurunkan aturannya sendiri, supaya keduanya
 * tidak bisa memberi dua jawaban untuk pertanyaan yang sama.
 */
function activeValidityByProduct() {
  const map = {};
  spiTerbitRows().forEach(r => {
    if (r.status !== 'active') return;
    map[r.code + '|' + kanonProduk(r.product)] = {
      validityDate: r.validityDate, spiDate: r.spiDate, spiNo: r.spiNo,
      pertekDate: r.pertekDate, pertekNo: r.pertekNo,
    };
  });
  return map;
}

/* Node (tes) saja — di browser berkas ini skrip klasik dan semuanya sudah global. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    QUOTA_YEAR_DEFAULT, QUOTA_YEARS,
    parseQuotaYear, rowQuotaYear, cycleQuotaYear, companyQuotaYears, companyInQuotaYear,
    sliceCompanyToYear, allCyclesForSave,
    isRealDate, cycleSpiTerbitDate, cyclePertekTerbitDate, spiIsIssued, spiValidityDate, validityExpired,
    isRevisionCycle, cycleProductList, kanonProduk, currentProductSet, pairedSubmitCycle, docNoFromStatus,
    issuedSpiCycles, issuedPertekCycles, activeDocuments, activeValidityDate,
    productGrantHistory, processStatus, spiTerbitRows, activeValidityByProduct,
  };
}
