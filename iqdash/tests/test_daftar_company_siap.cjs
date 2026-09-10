/* DROPDOWN "Step 2 — Select Company" harus sudah terisi saat dibuka.
 *
 * Dilaporkan tim 10-Sep-2026: "setiap tim mau input selalu ada bug, saat pilih
 * company listnya selalu kosong dulu, tolong dong jangan buat tim saya
 * menunggu."
 *
 * Tiga sebab yang menumpuk:
 *   1. daftarnya dibangun sesudah menunggu TIGA permintaan jaringan, termasuk
 *      realisasi ~228 KB yang tidak ada hubungannya dengan daftar company;
 *   2. tidak ada yang mengisinya lagi sesudah itu, jadi company baru tidak
 *      muncul sampai halaman dimuat ulang;
 *   3. selama menunggu dropdown-nya kosong tanpa keterangan.
 *
 * YANG DIKUNCI:
 *   A. Terisi dari SPI + PENDING + company_directory, diurutkan, berlabel
 *      "KODE — Nama".
 *   B. Company directory yang belum punya submission ditandai isNew, karena
 *      saveEdit memakai tanda itu untuk POST alih-alih PATCH.
 *   C. Idempoten: dipanggil dua kali hasilnya sama, tidak menggandakan.
 *   D. Pilihan yang sedang aktif DIPERTAHANKAN saat dibangun ulang. Kalau
 *      tidak, penyegar otomatis akan mengosongkan pilihan orang di tengah
 *      pengisian formulir.
 *   E. Data kosong TIDAK mengosongkan daftar yang sudah terisi.
 *   F. Simpanan lokal dipakai untuk mengisi seketika sebelum jaringan, dan
 *      ditimpa begitu data sungguhan tiba.
 *   G. Saat benar-benar belum ada apa-apa, teksnya berbunyi "memuat", bukan
 *      dropdown kosong yang terbaca sebagai rusak.
 *
 * Run: node iqdash/tests/test_daftar_company_siap.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');
const src  = fs.readFileSync(path.join(JS, '19-init.js'), 'utf8').split('\r\n').join('\n');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* Diambil dari berkasnya, bukan disalin. */
const awal  = src.indexOf('const DAFTAR_CO_KUNCI =');
const akhir = src.indexOf('window.isiDaftarCompany = isiDaftarCompany;');
if (awal < 0 || akhir < 0) { console.error('BERHENTI: blok daftar company tidak ketemu'); process.exit(1); }
const blok = src.slice(awal, akhir);

/* DOM sekadarnya: hanya yang benar-benar disentuh fungsi itu.
 *
 * `value` sengaja meniru <select> sungguhan, bukan properti biasa: menetapkan
 * nilai yang tidak ada di antara option-nya menghasilkan '', dan mengosongkan
 * innerHTML mengembalikannya ke ''. Tiruan yang menerima nilai apa saja akan
 * meloloskan bug "pilihan orang tetap menempel padahal companynya sudah tidak
 * ada di daftar". */
function buatSelect() {
  const sel = {
    dataset: {}, _opts: [], _val: '',
    get options() { return this._opts; },
    get value() { return this._val; },
    set value(v) { this._val = this._opts.some(o => o.value === v) ? v : ''; },
    set innerHTML(v) { if (v === '') { this._opts = []; this._val = ''; } },
    appendChild(o) { this._opts.push(o); },
  };
  return sel;
}
const simpanan = {};
const ctx = vm.createContext({
  console, JSON, Object, Array, Set, String, Number,
  localStorage: {
    getItem: k => (k in simpanan ? simpanan[k] : null),
    setItem: (k, v) => { simpanan[k] = String(v); },
  },
});
ctx.window = ctx; ctx.globalThis = ctx;
ctx.SPI = []; ctx.PENDING = []; ctx.COMPANY_DIRECTORY = [];
ctx.__sel = buatSelect();
vm.runInContext(`
  var document = {
    getElementById: id => (id === 'editCo' ? __sel : null),
    createElement: () => ({ value: '', textContent: '', dataset: {} }),
  };
  var lookupCompanyNameByCode = () => '';
  ${blok}
`, ctx);

const pasang = (spi, pending, dir) => {
  ctx.SPI = spi || []; ctx.PENDING = pending || []; ctx.COMPANY_DIRECTORY = dir || [];
};
const isi     = () => vm.runInContext('isiDaftarCompany()', ctx);
const isiCepat= () => vm.runInContext('isiDaftarCompanyDariSimpanan()', ctx);
const baris   = () => ctx.__sel._opts.map(o => o.textContent);
const nilai   = () => ctx.__sel._opts.map(o => o.value);
const reset   = () => { ctx.__sel = buatSelect(); vm.runInContext('__sel = __sel', ctx); };

console.log('\nA · Terisi dari SPI + PENDING + directory, terurut');
{
  reset();
  pasang(
    [{ code: 'SJH', fullName: 'Sinar Jaya Harapan' }, { code: 'BBB', fullName: 'Beton Baja Bersama' }],
    [{ code: 'LCP', fullName: 'Logam Cipta Prima' }],
    [{ abbreviation: 'IKM', fullName: 'Inti Karya Mandiri' }, { abbreviation: 'BBB', fullName: 'duplikat' }],
  );
  const n = isi();
  ok(n === 4, 'empat company masuk daftar', 'dapat ' + n);
  ok(JSON.stringify(nilai()) === JSON.stringify(['', 'BBB', 'IKM', 'LCP', 'SJH']),
    'terurut A-Z dan BBB tidak dobel walau ada di directory', JSON.stringify(nilai()));
  ok(baris()[1] === 'BBB — Beton Baja Bersama', 'berlabel "KODE — Nama"', baris()[1]);
}

console.log('\nB · Company baru dari directory ditandai isNew');
{
  const opt = ctx.__sel._opts.find(o => o.value === 'IKM');
  ok(opt && opt.dataset.isNew === '1', 'IKM ditandai isNew — saveEdit akan POST, bukan PATCH',
    JSON.stringify(opt && opt.dataset));
  const bbb = ctx.__sel._opts.find(o => o.value === 'BBB');
  ok(bbb && !bbb.dataset.isNew, 'BBB yang sudah punya submission tidak ditandai',
    JSON.stringify(bbb && bbb.dataset));
}

console.log('\nC · Idempoten — dipanggil dua kali tidak menggandakan');
{
  const sebelum = nilai().length;
  isi(); isi();
  ok(nilai().length === sebelum, 'jumlah baris tetap', `${sebelum} -> ${nilai().length}`);
}

console.log('\nD · Pilihan yang sedang aktif dipertahankan');
{
  /* Kalau ini meleset, penyegar otomatis akan mengosongkan pilihan orang di
     tengah pengisian formulir — keluhan yang sama, bentuk lain. */
  ctx.__sel.value = 'LCP';
  isi();
  ok(ctx.__sel.value === 'LCP', 'pilihan LCP tidak hilang saat daftar dibangun ulang',
    ctx.__sel.value);
}
{
  pasang([{ code: 'SJH', fullName: 'Sinar Jaya Harapan' }], [], []);
  ctx.__sel.value = 'LCP';
  isi();
  ok(ctx.__sel.value === '', 'pilihan yang produknya sudah tidak ada dilepas, bukan dipaksakan',
    ctx.__sel.value);
}

console.log('\nE · Data kosong tidak mengosongkan daftar yang sudah terisi');
{
  reset();
  pasang([{ code: 'BBB', fullName: 'Beton Baja Bersama' }], [], []);
  isi();
  const sebelum = nilai().length;
  pasang([], [], []);
  isi();
  ok(nilai().length === sebelum,
    'muat ulang yang gagal tidak membuat dropdown jadi kosong', `${sebelum} -> ${nilai().length}`);
}

console.log('\nF · Simpanan lokal mengisi seketika, lalu ditimpa data sungguhan');
{
  reset();
  const n = isiCepat();
  ok(n === 1 && nilai().includes('BBB'),
    'terisi dari simpanan kunjungan sebelumnya tanpa menyentuh jaringan', JSON.stringify(nilai()));
  ok(ctx.__sel.dataset.sementara === '1', 'ditandai sementara', ctx.__sel.dataset.sementara);
  pasang([{ code: 'SJH', fullName: 'Sinar Jaya Harapan' },
          { code: 'BBB', fullName: 'Beton Baja Bersama' }], [], []);
  isi();
  ok(nilai().length === 3 && !ctx.__sel.dataset.sementara,
    'data sungguhan menimpanya dan tandanya dilepas',
    JSON.stringify([nilai(), ctx.__sel.dataset.sementara]));
}

console.log('\nG · Benar-benar kosong -> tertulis "memuat", bukan senyap');
{
  reset();
  delete simpanan['iq_daftar_company_v1'];
  const n = isiCepat();
  ok(n === 0, 'tidak ada isinya', String(n));
  ok(/memuat/i.test(baris()[0]), 'baris pertama memberi tahu bahwa daftarnya sedang dimuat',
    baris()[0]);
}

console.log('\nH · Dropdown tidak menunggu payload realisasi');
{
  /* Pagar terhadap sebab aslinya. Pengisian daftar harus terjadi sesudah
     /api/data, bukan sesudah realisasi ikut selesai. */
  const iData = src.indexOf('await _pData;');
  const iIsi  = src.indexOf('isiDaftarCompany();', iData);
  const iSisa = src.indexOf('await _pSisa;');
  ok(iData > 0 && iIsi > iData && iSisa > iIsi,
    'urutannya: tunggu /api/data -> isi daftar -> baru tunggu realisasi',
    JSON.stringify([iData, iIsi, iSisa]));
  ok(!/await Promise\.all\(\[\s*\n\s*loadData\(\)/.test(src),
    'loadData tidak lagi ditunggu bersama realisasi dalam satu Promise.all');
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
