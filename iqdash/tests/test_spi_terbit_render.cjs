/* RENDER — tabel utama "PERTEK & SPI Terbit" dan kolom Validity Date di
 * Available Quota.
 *
 * Uji ini menjawab yang tidak dijawab uji logika mana pun: apakah jumlah SEL
 * tiap baris sama dengan jumlah KOLOM di headernya?
 *
 * Tabel yang selnya bergeser satu kolom tetap terlihat rapi di layar — angkanya
 * hanya berdiri di bawah judul yang salah. Itu kelas kegagalan paling berbahaya
 * di dashboard ini: bukan angka yang keliru, melainkan angka benar yang dibaca
 * sebagai hal lain. Tabel 16 kolom dengan sel yang sengaja dikosongkan pada
 * baris lanjutan (company/Status/Remarks tidak diulang) persis memicu risiko
 * itu, begitu juga baris TOTAL Available Quota yang memakai colspan.
 *
 * Run: node iqdash/tests/test_spi_terbit_render.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');
const HTML = fs.readFileSync(path.join(ROOT, 'assets', 'index.html'), 'utf8');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* ── DOM tiruan seadanya ─────────────────────────────────────────────────── */
const nodes = {};
function node(id) {
  if (!nodes[id]) nodes[id] = { id, innerHTML: '', textContent: '', value: '', style: {}, classList: { add(){}, remove(){} } };
  return nodes[id];
}
const doc = {
  getElementById: id => node(id),
  querySelectorAll: () => [],
  querySelector: () => null,
  createElement: () => ({ style: {}, classList: { add(){}, remove(){} }, innerHTML: '', appendChild(){}, setAttribute(){} }),
  addEventListener: () => {},
  body: { appendChild(){} },
};

const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean,
  MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  document: doc,
  Chart: function () { return { destroy() {} }; },
  fetch: () => Promise.reject(new Error('tidak ada jaringan di uji ini')),
});
ctx.window = ctx;
ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '03-kpis.js',
 '04-charts.js', '05-tables-spi.js', '05a-spi-terbit.js', '19-init.js'].forEach(f =>
  vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }));
const call = e => vm.runInContext(e, ctx);
const set  = (name, v) => { ctx.__tmp = v; vm.runInContext(`${name} = __tmp;`, ctx); };

/* ── Data nyata ───────────────────────────────────────────────────────────── */
const cachePath = path.join(ROOT, '..', 'cache', 'iqdash_data.json');
if (!fs.existsSync(cachePath)) {
  console.log('cache payload tidak ada — uji render dilewati');
  process.exit(0);
}
const real = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
set('PRODUCT_ALIASES', real.productAliases || {});
const meta = {};
(real.products || []).forEach(p => { if (p && p.name) meta[p.name] = p; });
set('PRODUCT_META', meta);
set('SPI_ALL', real.spi);
set('PENDING_ALL', real.pending);
set('RA_ALL', real.ra || []);
set('REALIZATIONS_ALL', []);
call(`QUOTA_YEAR = 2026; applyQuotaYearSlice();`);

function headerCount(tbodyId) {
  const i = HTML.indexOf(`id="${tbodyId}"`);
  if (i < 0) return -1;
  const head = HTML.lastIndexOf('<thead', i);
  const headEnd = HTML.indexOf('</thead>', head);
  if (head < 0 || headEnd < 0) return -1;
  return (HTML.slice(head, headEnd).match(/<th[\s>]/g) || []).length;
}
const cellCount = html => (html.match(/<td[\s>]/g) || []).length;

/* ── A. Tabel utama ───────────────────────────────────────────────────────── */
console.log('\nA · Tabel utama PERTEK & SPI Terbit');
const stCols = headerCount('spiTerbitBody');
ok(stCols === 16, `header punya 16 kolom seperti yang diminta tim (dapat ${stCols})`);

const urutan = ['No.', 'Company', 'Group', 'Cycle', 'Products', 'Submit (MT)', 'Obtained (MT)',
                'Util (MT)', 'Status', 'Remarks', 'PERTEK No.', 'PERTEK Date', 'SPI No.',
                'SPI Date', 'Validity Date', 'SPI Status'];
{
  const i = HTML.indexOf('id="spiTerbitBody"');
  const head = HTML.slice(HTML.lastIndexOf('<thead', i), HTML.indexOf('</thead>', HTML.lastIndexOf('<thead', i)));
  const judul = (head.match(/<th[^>]*>([\s\S]*?)<\/th>/g) || [])
    .map(t => t.replace(/<span class="tip">[\s\S]*?<\/span>/g, '').replace(/<[^>]+>/g, '').trim());
  ok(JSON.stringify(judul) === JSON.stringify(urutan),
    'urutan kolomnya persis seperti yang ditulis tim', JSON.stringify(judul));
}

call(`buildSpiTerbitTable();`);
const stHtml = nodes['spiTerbitBody'].innerHTML;
const stRows = stHtml.split('</tr>').filter(r => r.includes('<td'));
ok(stRows.length > 0, `${stRows.length} baris dirender`);
const salah = stRows.map((r, i) => [i, cellCount(r)]).filter(([, n]) => n !== stCols);
ok(salah.length === 0, `setiap baris punya tepat ${stCols} sel — termasuk baris lanjutan yang selnya sengaja dikosongkan`,
  salah.slice(0, 3).map(([i, n]) => `baris ${i} punya ${n}`).join(', '));

ok(/🟢 Active/.test(stHtml),   'lencana 🟢 Active muncul');
ok(/⚪ Inactive/.test(stHtml), 'lencana ⚪ Inactive muncul — SPI yang digantikan tetap tampil sebagai data historis');

/* ── B. Kasus yang dilaporkan tim ─────────────────────────────────────────── */
console.log('\nB · Kasus yang dilaporkan tim (MJU · BDG · GAS)');
const rows = JSON.parse(call(`JSON.stringify(spiTerbitRows())`));
const cari = (code, prod) => rows.find(r => r.code === code && r.product === prod);

const mju = cari('MJU', 'HRPO ALLOY');
ok(!!mju && mju.status === 'active', 'MJU HRPO ALLOY → 🟢 Active', mju && mju.status);
ok(!!mju && mju.obtainedMT === 200,  'MJU HRPO ALLOY 200 MT', mju && String(mju.obtainedMT));
ok(!!mju && mju.pertekDate === '30/06/2026', 'MJU PERTEK Perubahan 30/06/2026', mju && mju.pertekDate);
ok(!!mju && mju.spiDate === '16/07/2026',    'MJU SPI Perubahan 16/07/2026',    mju && mju.spiDate);

const bdgGl = cari('BDG', 'GL ALLOY'), bdgGi = cari('BDG', 'GI ALLOY');
ok(!!bdgGl && bdgGl.status === 'active' && bdgGl.obtainedMT === 650,
  'BDG GL ALLOY 650 MT → 🟢 Active', bdgGl && `${bdgGl.status}/${bdgGl.obtainedMT}`);
ok(!!bdgGi && bdgGi.status === 'active' && bdgGi.obtainedMT === 350,
  'BDG GI ALLOY 350 MT → 🟢 Active', bdgGi && `${bdgGi.status}/${bdgGi.obtainedMT}`);
ok(!!bdgGl && bdgGl.pertekDate === '22/06/2026' && bdgGl.spiDate === '21/07/2026',
  'BDG memakai PERTEK 22/06/2026 + SPI 21/07/2026', bdgGl && `${bdgGl.pertekDate}/${bdgGl.spiDate}`);

/* Produk yang dipindahkan revisi tetap tampil, tapi sebagai arsip. */
const gasLama = cari('GAS', 'BORDES ALLOY'), gasBaru = cari('GAS', 'GI ALLOY');
ok(!!gasLama && gasLama.status === 'inactive', 'GAS BORDES ALLOY → ⚪ Inactive (dipindahkan)', gasLama && gasLama.status);
ok(!!gasBaru && gasBaru.status === 'active',   'GAS GI ALLOY → 🟢 Active', gasBaru && gasBaru.status);
ok(!!cari('BDG', 'BORDES ALLOY') && cari('BDG', 'BORDES ALLOY').status === 'inactive',
  'BDG BORDES ALLOY → ⚪ Inactive');
ok(!!cari('MJU', 'HOLLOW PIPE') && cari('MJU', 'HOLLOW PIPE').status === 'inactive',
  'MJU HOLLOW PIPE → ⚪ Inactive (sempat dipegang, lalu pindah lagi)');

/* Re-Apply tidak boleh melahirkan dua baris untuk satu produk. */
const adp = rows.filter(r => r.code === 'ADP');
ok(adp.length === 1 && adp[0].obtainedMT === 350,
  'ADP: SATU baris GL ALLOY 350 MT — Re-Apply menambah kuota, bukan menggandakan baris',
  adp.map(r => `${r.product}=${r.obtainedMT}`).join(', '));

/* GERBANG TERBIT — regresi yang sudah pernah terjadi sekali.
   Sebuah siklus yang PERTEK dan SPI-nya sama-sama masih kosong pernah muncul
   sebagai baris ber-MT di tabel ini, padahal kartu Obtained (canonicalObtained)
   dengan benar tidak menghitungnya — dua angka untuk satu hal. Sekarang
   keduanya memakai gerbang yang SAMA, _isObtainedTerbit().

   Versi pertama uji ini menuliskan CGK GL ALLOY sebagai contoh tetap. Itu
   keliru: contoh tetap ikut berubah ketika datanya berubah, dan pada 28-Agu-2026
   uji ini gagal justru karena datanya sudah benar (master mencatat CGK GL ALLOY
   300 MT, dan kartu Obtained ikut menghitungnya). Uji yang menuntut keadaan
   lama bukan menjaga apa pun — ia hanya menyandera perbaikan.

   Yang dijaga sekarang adalah HUBUNGANNYA, bukan angkanya: tabel dan kartu
   harus memakai gerbang yang sama, PER PRODUK. Kalau salah satu sisi
   meloloskan siklus yang belum terbit sementara sisi lain tidak, selisihnya
   muncul di sini — company mana pun, tahun berapa pun. */
{
  const perProd = {};
  rows.filter(r => r.status !== 'inactive')
      .forEach(r => { perProd[r.code + '|' + r.product] = (perProd[r.code + '|' + r.product] || 0) + r.obtainedMT; });
  const master = JSON.parse(call(`JSON.stringify([...SPI,...PENDING].flatMap(co =>
    Object.entries(getObtainedByProdAgg(co) || {}).map(([p, v]) => [co.code + "|" + p, Math.round(Number(v) || 0)])))`));
  const petaMaster = Object.fromEntries(master);
  const bedaProd = [
    ...master.filter(([k, v]) => Math.abs((perProd[k] || 0) - v) > 0.5)
             .map(([k, v]) => `${k}: tabel ${perProd[k] || 0} vs master ${v}`),
    ...Object.keys(perProd).filter(k => !(k in petaMaster) && perProd[k] > 0.5)
             .map(k => `${k}: tabel ${perProd[k]} tapi master tidak memberikannya`),
  ];
  ok(bedaProd.length === 0,
    'tiap (company, produk): Obtained di tabel = Obtained bergerbang milik kartu — tidak ada siklus belum-terbit yang lolos di satu sisi saja',
    bedaProd.slice(0, 4).join(' · '));

  /* Lebih luas: Σ Obtained baris yang bukan Inactive tidak boleh melebihi
     Σ obtained per company dari master. Selisih yang tersisa hanya boleh dari
     company yang memang sudah ditandai drift guard bawaan repo. */
  const perCo = {};
  rows.filter(r => r.status !== 'inactive').forEach(r => { perCo[r.code] = (perCo[r.code] || 0) + r.obtainedMT; });
  const stats = JSON.parse(call(`JSON.stringify([...SPI,...PENDING].map(co=>{const a=getObtainedByProdAgg(co)||{};let s=0;Object.values(a).forEach(v=>s+=Number(v)||0);return [co.code, Math.round(s)];}))`));
  const beda = stats.filter(([code, st]) => Math.abs((perCo[code] || 0) - st) > 0.5);
  ok(beda.length === 0,
    'Σ Obtained baris non-Inactive tiap company = Σ master per-produk company itu',
    beda.slice(0, 3).map(([c, st]) => `${c}: tabel ${perCo[c] || 0} vs master ${st}`).join(', '));
}

/* Tidak ada company/produk yang muncul dua kali. */
{
  const kunci = rows.map(r => r.code + '|' + r.product);
  ok(new Set(kunci).size === kunci.length,
    'tidak ada pasangan (company, produk) yang dicetak lebih dari sekali');
}

/* ── C. Golongan proses ───────────────────────────────────────────────────── */
console.log('\nC · Golongan proses & pil penyaring');
const golongan = new Set(rows.map(r => r.processKey));
ok([...golongan].every(k => ['completed', 'under', 'pending', 'newsub'].includes(k)),
  'setiap baris masuk salah satu dari 4 golongan yang diminta', [...golongan].join(', '));
ok(Number(nodes['stPillAll'].textContent) === rows.length,
  'pil All menghitung baris yang sama dengan isi tabel');
{
  const jml = ['stPillCompleted', 'stPillUnder', 'stPillPending', 'stPillNewsub']
    .reduce((s, id) => s + Number(nodes[id].textContent || 0), 0);
  ok(jml === rows.length, 'jumlah keempat pil sama dengan pil All — tidak ada baris yang jatuh di luar golongan',
    `${jml} vs ${rows.length}`);
}

/* Remarks membaca Status Note CorpSec, bukan field lain. */
{
  const co = JSON.parse(call(`JSON.stringify(SPI.filter(c=>c.statusUpdate).slice(0,1))`))[0];
  if (co) {
    const r = rows.find(x => x.code === co.code);
    ok(!!r && r.remarks === co.statusUpdate,
      `Remarks mengambil Status Note dari Input Data (${co.code})`, r && r.remarks);
  } else {
    ok(true, 'tidak ada company dengan Status Note terisi di data ini — dilewati');
  }
}

/* ── D. Available Quota ───────────────────────────────────────────────────── */
console.log('\nD · Available Quota — sinkron dengan tabel utama');
const avqCols = headerCount('avqTableBody');
ok(avqCols === 12, `header Available Quota 12 kolom — Quota Status + SPI Status sesudah Available (dapat ${avqCols})`);
call(`buildAvqTable();`);
const avqHtml = nodes['avqTableBody'].innerHTML;
const avqRows = avqHtml.split('</tr>').filter(r => r.includes('<td'));
const avqSalah = avqRows.map((r, i) => [i, cellCount(r)]).filter(([, n]) => n !== avqCols);
ok(avqSalah.length === 0, `setiap baris Available Quota punya tepat ${avqCols} sel`,
  avqSalah.slice(0, 3).map(([i, n]) => `baris ${i} punya ${n}`).join(', '));
{
  const footHtml = nodes['avqTableFoot'].innerHTML;
  const colspan = Number((footHtml.match(/colspan="(\d+)"/) || [])[1] || 0);
  ok(colspan + (cellCount(footHtml) - 1) === avqCols,
    `baris TOTAL menutupi tepat ${avqCols} kolom`, `dapat ${colspan + (cellCount(footHtml) - 1)}`);
}

/* Inilah inti permintaan tim: SATU aturan Active, dua halaman. */
const avq = JSON.parse(call(`JSON.stringify(availableQuotaRows())`));
const mjuAvq = avq.find(r => r.code === 'MJU');
ok(!!mjuAvq && mjuAvq.hasActiveSpi && mjuAvq.validityDate === '31/12/2026',
  'MJU di Available Quota kini punya SPI aktif dengan Validity 31/12/2026',
  mjuAvq && `${mjuAvq.product} hasActiveSpi=${mjuAvq.hasActiveSpi}`);
/* BDG sengaja TIDAK diharapkan muncul di Available Quota: 650 + 350 MT-nya
   sudah terpakai habis, dan tabel itu hanya memuat produk yang masih bersisa.
   Yang diuji karena itu bukan kehadirannya, melainkan bahwa kalaupun muncul ia
   ber-SPI-aktif — asersi "harus ada" akan menuntut angka yang memang bukan
   keadaan sebenarnya. */
const bdgAvq = avq.filter(r => r.code === 'BDG');
ok(bdgAvq.every(r => r.hasActiveSpi),
  `BDG di Available Quota: ${bdgAvq.length} baris bersisa, semuanya ber-SPI-aktif`,
  bdgAvq.map(r => `${r.product}=${r.hasActiveSpi}`).join(', '));
{
  /* Yang berlaku untuk BDG diuji di tempat yang memang memuatnya: peta Validity
     per (company, produk) yang dibaca halaman Available Quota. */
  const peta = JSON.parse(call(`JSON.stringify(activeValidityByProduct())`));
  ok(!!peta['BDG|GL ALLOY'] && !!peta['BDG|GI ALLOY'],
    'kedua produk BDG terdaftar sebagai ber-SPI-aktif di peta yang dipakai Available Quota',
    Object.keys(peta).filter(k => k.startsWith('BDG|')).join(', '));
  ok(peta['BDG|GL ALLOY'] && peta['BDG|GL ALLOY'].spiDate === '21/07/2026',
    'dan SPI yang dipakainya SPI Perubahan 21/07/2026');
}

/* Setiap baris Available Quota harus cocok dengan baris Active di tabel utama —
   itu yang membuat kedua halaman tidak bisa lagi bercerita berbeda. */
{
  const aktif = new Set(rows.filter(r => r.status === 'active').map(r => r.code + '|' + r.product));
  const nyasar = avq.filter(r => r.hasActiveSpi && !aktif.has(r.code + '|' + r.product));
  ok(nyasar.length === 0, 'tidak ada baris Available Quota ber-SPI-aktif yang tidak punya pasangan Active di tabel utama',
    nyasar.slice(0, 3).map(r => r.code + '/' + r.product).join(', '));
  const tanpa = avq.filter(r => !r.hasActiveSpi);
  console.log(`       catatan: ${tanpa.length} baris tanpa SPI aktif — ${tanpa.map(r => r.code + '/' + r.product).join(', ') || 'tidak ada'}`);
}

/* ── E. Tahun kosong ──────────────────────────────────────────────────────── */
console.log('\nE · Tahun 2027 (belum ada datanya)');
call(`QUOTA_YEAR = 2027; applyQuotaYearSlice(); buildSpiTerbitTable(); buildAvqTable();`);
ok(/Tidak ada data untuk tahun kuota 2027/.test(nodes['spiTerbitBody'].innerHTML),
  'tabel 2027 menjelaskan kenapa kosong, bukan tabel hampa tanpa kata');
ok(!/🟢 Active/.test(nodes['spiTerbitBody'].innerHTML), 'tidak ada baris 2026 yang bocor ke tampilan 2027');
ok(nodes['avqTableBody'].innerHTML.trim() === '', 'Available Quota 2027 kosong');
call(`renderQuotaYearUI();`);
ok(/Belum ada data kuota <strong>2027<\/strong>/.test(nodes['qyEmptyTxt'].innerHTML),
  'spanduk menyatakan nol-nya karena data belum ada, bukan karena kuota habis');

call(`QUOTA_YEAR = 2026; applyQuotaYearSlice(); renderQuotaYearUI();`);
ok(nodes['qyEmptyBanner'].style.display === 'none', '…dan disembunyikan lagi begitu kembali ke tahun yang berisi');

/* ── F. Panel yang dilipat ────────────────────────────────────────────────── */
console.log('\nF · Ringkasan revisi yang bisa dilipat');
ok(/<details class="card mb14" id="revSummaryCard">/.test(HTML),
  'Submission & Revision Summary jadi panel <details> yang bisa dilipat');
ok(!/ id="revSummaryCard"[^>]* open/.test(HTML), 'terlipat secara bawaan — tidak memenuhi layar pertama');
ok(/id="revDetailBody"/.test(HTML), '…isinya tetap ada, hanya disembunyikan sampai diklik');
ok(!/id="spiBody"/.test(HTML), 'tabel per-company yang lama sudah tidak ada lagi (digantikan tabel gabungan)');
call(`buildSpiTerbitTable();`);
ok(Number(nodes['revSummaryCount'].textContent) >= 0,
  'kepala panel mencetak jumlah company yang punya revisi, supaya isinya terlihat tanpa dibuka');

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
