/* "📌 Catat Terbit" harus menulis ke siklus Obtained pengajuan YANG BERJALAN.
 *
 * Tombol ini satu-satunya jalan yang memanggil POST /record-obtained, yaitu
 * satu-satunya tulisan yang benar-benar menaikkan Total Obtained dan Available.
 * Sampai 24-Sep-2026 ia mematok `cycleType: 'Obtained #2'` apa pun keadaannya.
 *
 * Itu bug CGK yang sama yang sudah diperbaiki di rrApplyObtained() pada
 * 12-Agu-2026 lewat rrObtainedTypeFor(), tapi terlewat di sini — justru di
 * penulis yang paling berbahaya, karena record-obtained MENETRALKAN dulu
 * kontribusi siklus sasaran sebelum menambahkan yang baru.
 *
 * Kasus KJK (data asli 24-Sep-2026):
 *     Submit #1  6.000  → Obtained #1  950  (SPI 31/12/2025)
 *     Submit #2  3.000  → Obtained #2  450  (SPI 04/06/2026)   Re-Apply #1
 *     Submit #3  3.000  → Obtained #3  —                        Re-Apply #2
 *     Total Obtained = 1.400
 * PERTEK Perubahan #2 terbit menaikkan kuota jadi 1.700, tambahan 300 MT.
 * Dengan patokan lama, 300 MT itu masuk ke Obtained #2: kontribusi 450
 * dinetralkan lebih dulu, jadi 1.400 BUKAN naik ke 1.700 melainkan TURUN ke
 * 1.250 — dan catatan 450 MT milik Re-Apply #1 lenyap.
 *
 * Run: node iqdash/tests/test_catat_terbit_siklus_sasaran.cjs
 */
const fs   = require('fs');
const vm   = require('vm');
const path = require('path');

const SRC = path.join(__dirname, '..', 'assets', 'js', '13-rev-mgmt.js');
const src = fs.readFileSync(SRC, 'utf8');

const ambil = (ctx, nama) => {
  let i = src.indexOf('function ' + nama + '(');
  if (i < 0) throw new Error('tidak ketemu di sumber: ' + nama);
  // `async function` — mundurkan awalannya, kalau tidak `await` di dalamnya
  // jadi galat sintaks saat dijalankan lewat vm.
  if (src.slice(Math.max(0, i - 6), i) === 'async ') i -= 6;
  let d = 0, j = src.indexOf('{', i);
  for (; j < src.length; j++) { if (src[j] === '{') d++; else if (src[j] === '}') { d--; if (!d) break; } }
  vm.runInContext(src.slice(i, j + 1), ctx);
};

/* Jalankan rrRecordObtainedTerbit() yang ASLI dengan seluruh tetangganya
   dipalsukan, lalu tangkap body yang dikirim ke /record-obtained. */
function catatTerbit(co) {
  const terkirim = [];
  const ctx = {
    console, MT_LOCALE: 'id-ID', QUOTA_YEAR: 2026,
    getSPI: () => co,
    rrReadObtainedFromForm: () => ({ total: 300, byProd: { 'GL ALLOY': 300 } }),
    g: id => (id === 'rrRevSpiDate' ? { value: '15/10/2026' } : { value: '' }),
    alert: m => { throw new Error('alert tak terduga: ' + m); },
    prompt: () => '',
    confirm: () => true,
    loadData: undefined,
    buildRevMgmtSection: undefined,
    nsShowToast: () => {},
    fetch: (url, opt) => {
      terkirim.push({ url, body: JSON.parse(opt.body) });
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ ok: true }) });
    },
    encodeURIComponent,
  };
  vm.createContext(ctx);
  ambil(ctx, 'rrGetActiveCycle');
  ambil(ctx, 'rrObtainedTypeFor');
  ambil(ctx, 'rrRecordObtainedTerbit');
  return ctx.rrRecordObtainedTerbit('KJK').then(() => terkirim);
}

let pass = 0, fail = 0;
const eq = (dapat, harus, nama) => {
  if (dapat === harus) { pass++; console.log(`  ok   ${nama}`); }
  else { fail++; console.log(`FAIL   ${nama} — dapat ${JSON.stringify(dapat)}, harusnya ${JSON.stringify(harus)}`); }
};

(async () => {
  /* ── KJK apa adanya: Re-Apply KETIGA berjalan (Submit #3) ───────────── */
  {
    const kjk = { code: 'KJK', cycles: [
      { type: 'Submit #1',   mt: 6000, releaseDate: '11/11/2025', pertekDate: '11/11/2025' },
      { type: 'Obtained #1', mt: 950,  releaseDate: '31/12/2025' },
      { type: 'Submit #2',   mt: 3000, releaseDate: '03/06/2026', pertekDate: '03/06/2026' },
      { type: 'Obtained #2', mt: 450,  releaseDate: '04/06/2026' },
      { type: 'Submit #3',   mt: 3000, releaseDate: '', pertekDate: '15/10/2026' },
      { type: 'Obtained #3', mt: null, releaseDate: '' },
    ] };
    const t = await catatTerbit(kjk);
    eq(t.length, 1, 'KJK: satu panggilan record-obtained');
    eq(t[0].body.cycleType, 'Obtained #3',
       'KJK: menulis ke Obtained #3 (milik Submit #3), bukan menimpa Obtained #2');
    eq(t[0].body.mt, 300, 'KJK: MT yang dikirim adalah tambahan siklus ini');
    eq(t[0].body.product, 'GL ALLOY', 'KJK: produknya ikut terkirim');
    eq(t[0].body.terbitDate, '15/10/2026', 'KJK: tanggal terbit dari form');
    eq(t[0].url, 'api/company/KJK/record-obtained', 'KJK: rute benar');
  }

  /* ── Re-Apply PERTAMA: sasarannya memang Obtained #2 ────────────────── */
  {
    const co = { code: 'XYZ', cycles: [
      { type: 'Submit #1',   mt: 6000, releaseDate: '11/11/2025', pertekDate: '11/11/2025' },
      { type: 'Obtained #1', mt: 500,  releaseDate: '31/12/2025' },
      { type: 'Submit #2',   mt: 3000, releaseDate: '', pertekDate: '15/10/2026' },
    ] };
    const t = await catatTerbit(co);
    eq(t[0].body.cycleType, 'Obtained #2', 'Re-Apply pertama tetap menulis ke Obtained #2');
  }

  /* ── Revision, bukan Submit: siklusnya Obtained (Revision #N) ───────── */
  {
    const co = { code: 'REV', cycles: [
      { type: 'Submit #1',   mt: 6000, releaseDate: '11/11/2025', pertekDate: '11/11/2025' },
      { type: 'Obtained #1', mt: 500,  releaseDate: '31/12/2025' },
      { type: 'Revision #1', mt: 0,    releaseDate: '', pertekDate: '14/04/2026' },
    ] };
    const t = await catatTerbit(co);
    eq(t[0].body.cycleType, 'Obtained (Revision #1)',
       'Revision menulis ke Obtained (Revision #1), bukan Obtained #2');
  }

  /* ── Yang dijaga inti: TIDAK PERNAH memilih siklus Obtained yang SUDAH
        terbit, karena record-obtained menetralkan kontribusinya dulu. ──── */
  {
    const co = { code: 'CGK', cycles: [
      { type: 'Submit #1',   mt: 6000, releaseDate: '11/11/2025', pertekDate: '11/11/2025' },
      { type: 'Obtained #1', mt: 500,  releaseDate: '31/12/2025' },
      { type: 'Submit #2',   mt: 2200, releaseDate: '17/04/2026', pertekDate: '17/04/2026' },
      { type: 'Obtained #2', mt: 220,  releaseDate: '29/04/2026' },
      { type: 'Submit #4',   mt: 3000, releaseDate: '', pertekDate: '15/10/2026' },
    ] };
    const t = await catatTerbit(co);
    const sasaran = (co.cycles || []).find(c => c.type === t[0].body.cycleType);
    eq(t[0].body.cycleType, 'Obtained #4', 'CGK: nomornya ikut Submit #4');
    eq(sasaran === undefined || !String(sasaran.releaseDate || '').trim(), true,
       'CGK: sasarannya bukan siklus Obtained yang sudah punya tanggal terbit');
  }

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})();
