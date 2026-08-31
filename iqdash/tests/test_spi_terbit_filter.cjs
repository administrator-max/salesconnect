/* PENYARING TAB PERTEK & SPI — Products, Validity Date, rentang SPI Date.
 *
 * Diminta tim 31-Agu-2026.
 *
 * Yang dikunci, berurut dari yang paling mahal kalau rusak:
 *
 *   A. Angka di PIL = isi tabel. Pil dihitung atas baris yang sudah lolos
 *      penyaring lain; kalau dihitung atas seluruh 56 baris, pil bertuliskan
 *      "52 Completed" sementara tabel berisi 3 — angka yang berbohong tentang
 *      apa yang sedang dilihat.
 *
 *   B. Tanggal bertahun DUA DIGIT ikut tersaring. Sumbernya tidak seragam:
 *      sebagian "16/07/2026", lima baris "17/07/26". Membandingkan teks mentah
 *      akan membuang baris itu diam-diam — persis kelas kesalahan yang paling
 *      sulit terlihat, karena hasilnya tetap tampak masuk akal.
 *
 *   C. Baris tanpa tanggal SPI tidak diam-diam lolos rentang, DAN jumlahnya
 *      dinyatakan di kaki tabel.
 *
 *   D. Penyaring saling bertumpuk (AND), dan Reset benar-benar mengembalikan
 *      semuanya.
 *
 *   E. Label siklus revisi diberi arah ("Revision: SHEET PILE → GI ALLOY") —
 *      TAPI hanya bila produknya memang berpindah. Sebagian besar label revisi
 *      di data hanyalah alias ejaan (GL BORON = GL ALLOY); memberi panah di
 *      situ akan menyatakan perpindahan yang tidak pernah terjadi.
 *
 * Run: node iqdash/tests/test_spi_terbit_filter.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const nodes = {};
const buatEl = () => ({
  innerHTML: '', textContent: '', value: '', className: '', style: {},
  classList: { add(){}, remove(){} }, dataset: {},
  appendChild(){}, querySelectorAll: () => [], querySelector: () => null,
  setAttribute(){}, addEventListener(){}, closest: () => null,
});
const node = id => (nodes[id] = nodes[id] || Object.assign(buatEl(), { id }));
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: {
    getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: buatEl, addEventListener: () => {}, body: { appendChild(){} },
  },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '03-kpis.js',
 '04-charts.js', '05-tables-spi.js', '05a-spi-terbit.js', '19-init.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);
const set  = (name, v) => { ctx.__tmp = v; vm.runInContext(`${name} = __tmp;`, ctx); };

const cachePath = path.join(ROOT, '..', 'cache', 'iqdash_data.json');
if (!fs.existsSync(cachePath)) { console.log('cache payload tidak ada — dilewati'); process.exit(0); }
const real = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
set('PRODUCT_ALIASES', real.productAliases || {});
const meta = {}; (real.products || []).forEach(p => { if (p && p.name) meta[p.name] = p; });
set('PRODUCT_META', meta);
set('SPI_ALL', real.spi); set('PENDING_ALL', real.pending);
set('RA_ALL', real.ra || []); set('REALIZATIONS_ALL', real.realizations || []);
call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);

const semua = JSON.parse(call(`JSON.stringify(spiTerbitRows())`));
const nBaris = () => nodes['spiTerbitBody'].innerHTML.split('</tr>').filter(r => r.includes('<td')).length;
const pil = id => Number(nodes[id].textContent) || 0;
const kaki = () => nodes['spiTerbitFoot'].innerHTML.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
const reset = () => call('resetStFilters();');

console.log('\nA · Angka pil = isi tabel, pada setiap kombinasi');
{
  reset();
  call('buildSpiTerbitTable();');
  ok(nBaris() === semua.length && pil('stPillAll') === semua.length,
    `tanpa penyaring: ${nBaris()} baris = pil All ${pil('stPillAll')} = ${semua.length} sumber`);

  call(`setStFilterProduk('GI ALLOY');`);
  const nGi = semua.filter(r => r.product === 'GI ALLOY').length;
  ok(nBaris() === nGi && pil('stPillAll') === nGi,
    `produk GI ALLOY: ${nBaris()} baris = pil All ${pil('stPillAll')} = ${nGi} sumber`);

  /* Pil golongan harus ikut menyempit, bukan tetap menghitung 56 baris. */
  const gi = semua.filter(r => r.product === 'GI ALLOY');
  const cocok = ['completed', 'under', 'pending', 'newsub'].every((k, i) =>
    pil(['stPillCompleted','stPillUnder','stPillPending','stPillNewsub'][i]) === gi.filter(r => r.processKey === k).length);
  ok(cocok, 'pil golongan ikut menyempit mengikuti produk yang dipilih',
    `Completed ${pil('stPillCompleted')} vs ${gi.filter(r=>r.processKey==='completed').length}`);

  const jml = pil('stPillCompleted') + pil('stPillUnder') + pil('stPillPending') + pil('stPillNewsub');
  ok(jml === pil('stPillAll'), 'jumlah keempat pil = pil All — tidak ada baris di luar golongan',
    `${jml} vs ${pil('stPillAll')}`);
  reset();
}

console.log('\nB · Tanggal bertahun DUA DIGIT ikut tersaring');
{
  const duaDigit = semua.filter(r => /^\d{1,2}\/\d{1,2}\/\d{2}$/.test(String(r.spiDate || '')));
  ok(duaDigit.length > 0, `data memang memuat ${duaDigit.length} baris bertahun dua digit — jebakannya nyata`,
    'tidak ada; uji ini kehilangan maknanya');

  /* Rentang yang MENCAKUP tanggal dua digit itu wajib memuatnya. */
  reset();
  call(`document.getElementById('stFSpiDari').value = '2026-07-01';`);
  call(`document.getElementById('stFSpiSampai').value = '2026-07-31';`);
  call('setStFilterTgl();');
  const jul = semua.filter(r => {
    const m = String(r.spiDate || '').match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!m) return false;
    let y = +m[3]; if (y < 100) y += 2000;
    return y === 2026 && +m[2] === 7;
  });
  ok(nBaris() === jul.length,
    `rentang 1–31 Juli 2026: ${nBaris()} baris = ${jul.length} yang benar-benar berTanggal Juli`,
    `selisih ${jul.length - nBaris()} — kemungkinan tahun dua digit terbuang`);
  ok(jul.some(r => /^\d{1,2}\/\d{1,2}\/\d{2}$/.test(String(r.spiDate))),
    'dan di antaranya memang ada yang bertahun dua digit');
  reset();
}

console.log('\nC · Baris tanpa tanggal SPI tidak diam-diam lolos');
{
  const tanpa = semua.filter(r => !r.spiDate);
  reset();
  call(`document.getElementById('stFSpiDari').value = '2000-01-01';`);
  call(`document.getElementById('stFSpiSampai').value = '2030-12-31';`);
  call('setStFilterTgl();');
  ok(nBaris() === semua.length - tanpa.length,
    `rentang selebar apa pun tetap menyingkirkan ${tanpa.length} baris tanpa tanggal — bukan menganggapnya lolos`,
    `${nBaris()} vs ${semua.length - tanpa.length}`);
  ok(/tanpa tanggal SPI tidak masuk rentang/.test(kaki()),
    'dan jumlahnya DINYATAKAN di kaki tabel, bukan hilang tanpa jejak', kaki().slice(0, 170));
  reset();
}

console.log('\nD · Validity, penumpukan, dan Reset');
{
  reset();
  call(`setStFilterValid('31/12/2026');`);
  const nVal = semua.filter(r => r.validityDate === '31/12/2026').length;
  ok(nBaris() === nVal, `validity 31/12/2026: ${nBaris()} = ${nVal}`);

  call(`setStFilterValid('__KOSONG__');`);
  const nKosong = semua.filter(r => !r.validityDate).length;
  ok(nBaris() === nKosong, `validity "(belum ada)": ${nBaris()} = ${nKosong}`);

  /* Penyaring bertumpuk AND, bukan saling menimpa. */
  reset();
  call(`setStFilterProduk('GL ALLOY'); setStFilterValid('31/12/2026');`);
  const dua = semua.filter(r => r.product === 'GL ALLOY' && r.validityDate === '31/12/2026').length;
  ok(nBaris() === dua, `produk + validity bertumpuk (AND): ${nBaris()} = ${dua}`);

  ok(/disaring:/.test(kaki()) && /GL ALLOY/.test(kaki()),
    'kaki tabel menyebut penyaring yang sedang aktif', kaki().slice(0, 170));

  reset();
  ok(nBaris() === semua.length, `Reset mengembalikan seluruh ${semua.length} baris`, String(nBaris()));
  ok(!/disaring:/.test(kaki()), 'dan keterangan "disaring" ikut hilang', kaki().slice(0, 120));
}

console.log('\nE · Nilai dropdown dibangun dari data, bukan daftar tetap');
{
  reset();
  call('buildSpiTerbitTable();');
  const opsiProduk = nodes['stFProduk'].innerHTML;
  const produk = [...new Set(semua.map(r => r.product))];
  /* Nama produk di-escape saat dicetak (ERW PIPE (OD > 140mm) menjadi
     ERW PIPE (OD &gt; 140mm)) — itu memang benar, karena tanpa itu nama produk
     bisa merusak markup. Jadi pembandingnya ikut di-escape, bukan mentah. */
  const esc = t => String(t).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\"/g,'&quot;');
  const hilang = produk.filter(p => !opsiProduk.includes('>' + esc(p) + '<'));
  ok(hilang.length === 0, `${produk.length} produk semuanya jadi pilihan`, hilang.slice(0, 4).join(', '));

  const opsiVal = nodes['stFValidity'].innerHTML;
  ok(/__KOSONG__/.test(opsiVal), 'pilihan "(belum ada Validity)" muncul karena datanya memang ada');

  /* Produk yang tidak ada di data TIDAK boleh menyisakan tabel kosong tanpa
     petunjuk — pilihannya dikembalikan ke "semua". */
  call(`setStFilterProduk('PRODUK TIDAK ADA'); buildSpiTerbitTable();`);
  ok(nBaris() === semua.length, 'pilihan produk yang sudah tidak ada dikembalikan ke Semua, bukan tabel kosong',
    String(nBaris()));
  reset();
}

console.log('\nF · Label siklus revisi diberi arah — tapi hanya bila memang berpindah');
{
  reset();
  call('buildSpiTerbitTable();');
  const html = nodes['spiTerbitBody'].innerHTML;
  const sel = tr => [...tr.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, '').trim());
  const baris = html.split('</tr>').filter(r => r.includes('<td')).map(sel);
  const kanon = p => JSON.parse(call(`JSON.stringify(canonicalProduct(${JSON.stringify(String(p).trim())}))`));

  /* SMS: SHEETPILE -> GI ALLOY adalah perpindahan SUNGGUHAN, jadi berpanah. */
  const sms = semua.find(r => r.code === 'SMS' && /Revision Request/.test(r.cycle || ''));
  ok(!!sms, 'baris revisi SMS ada di data');
  if (sms) {
    const lbl = JSON.parse(call(`JSON.stringify(_stLabelCycle(${JSON.stringify(sms.cycle)}, ${JSON.stringify(sms.product)}))`));
    ok(/^Revision: /.test(lbl) && /→/.test(lbl) && lbl.includes('GI ALLOY'),
      `SMS berpanah: "${lbl.replace(/<[^>]+>/g, '')}"`, lbl);
  }

  /* Alias ejaan BUKAN perpindahan — tidak boleh berpanah.
     GL BORON dan GL ALLOY adalah produk yang sama. */
  const alias = semua.filter(r => {
    const m = String(r.cycle || '').match(/^Revision Request\s*[—–-]\s*(.+)$/);
    return m && kanon(m[1]) === kanon(r.product);
  });
  ok(alias.length > 0, `${alias.length} baris revisi yang asal & tujuannya produk SAMA — jebakannya nyata`,
    'tidak ada; uji ini kehilangan maknanya');
  const salahPanah = alias.filter(r =>
    /→/.test(JSON.parse(call(`JSON.stringify(_stLabelCycle(${JSON.stringify(r.cycle)}, ${JSON.stringify(r.product)}))`))));
  ok(salahPanah.length === 0,
    'tidak satu pun diberi panah — panah palsu menyatakan perpindahan yang tak pernah terjadi',
    salahPanah.slice(0, 3).map(r => `${r.code} ${r.cycle} -> ${r.product}`).join(' · '));

  /* Bentuk PECAH SEBAGIAN diuji LANGSUNG, bukan lewat data.
     MIN dan SPA memang punya revisi semacam itu di ledger, tapi tabel ini
     menampilkan siklus Obtained mereka — bukan Revision Request — jadi
     menyaring data untuk mereka menghasilkan nol baris dan nol pemeriksaan.
     Uji yang diam bukan uji. */
  const lbl = (cycle, produk) =>
    JSON.parse(call(`JSON.stringify(_stLabelCycle(${JSON.stringify(cycle)}, ${JSON.stringify(produk)}))`))
      .replace(/<[^>]+>/g, '');

  ok(lbl('Revision Request — BORDES ALLOY', 'GI ALLOY') === 'Revision: BORDES ALLOY → GI ALLOY',
    'pecah sebagian, baris yang BERPINDAH: berpanah',
    lbl('Revision Request — BORDES ALLOY', 'GI ALLOY'));
  ok(lbl('Revision Request — BORDES ALLOY', 'BORDES ALLOY') === 'Revision',
    'pecah sebagian, baris yang produknya TETAP: tanpa panah',
    lbl('Revision Request — BORDES ALLOY', 'BORDES ALLOY'));
  ok(lbl('Revision Request — GL BORON', 'GL ALLOY') === 'Revision',
    'alias ejaan GL BORON = GL ALLOY: tanpa panah',
    lbl('Revision Request — GL BORON', 'GL ALLOY'));
  ok(lbl('Revision Request — SHEETPILE', 'GI ALLOY') === 'Revision: SHEET PILE → GI ALLOY',
    'produk asal ditulis dalam ejaan kanonik (SHEETPILE -> SHEET PILE), sama dengan kolom Products',
    lbl('Revision Request — SHEETPILE', 'GI ALLOY'));

  /* Tanda pisah di sumber tidak seragam — em dash, en dash, dan hyphen. */
  ok(['—', '–', '-'].every(d => /→/.test(lbl('Revision Request ' + d + ' SHEETPILE', 'GI ALLOY'))),
    'ketiga bentuk tanda pisah (— – -) dikenali',
    ['—','–','-'].map(d => d + ': ' + lbl('Revision Request ' + d + ' SHEETPILE', 'GI ALLOY')).join(' | '));

  /* Produk baris kosong -> jangan mengarang panah menuju entah apa. */
  ok(lbl('Revision Request — SHEETPILE', '') === 'Revision',
    'produk baris kosong: tanpa panah, bukan panah menuju kekosongan',
    lbl('Revision Request — SHEETPILE', ''));

  /* Label non-revisi tidak disentuh. */
  const biasa = semua.find(r => !/Revision Request/.test(r.cycle || '') && r.cycle);
  if (biasa) {
    const lbl = JSON.parse(call(`JSON.stringify(_stLabelCycle(${JSON.stringify(biasa.cycle)}, ${JSON.stringify(biasa.product)}))`));
    ok(lbl === biasa.cycle, `label non-revisi dibiarkan apa adanya ("${biasa.cycle}")`, lbl);
  }

  /* Yang tercetak di tabel memang memakai label baru. */
  ok(!/Revision Request/.test(html),
    'tidak ada lagi "Revision Request — …" mentah yang tercetak di tabel',
    (html.match(/Revision Request[^<]*/) || [''])[0]);
  reset();
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
