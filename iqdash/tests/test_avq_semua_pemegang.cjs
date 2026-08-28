/* AVAILABLE QUOTA — SELURUH PEMEGANG PRODUK TAMPIL, BUKAN HANYA YANG BERSISA.
 *
 * Diminta tim 28-Agu-2026. Kolamnya dulu availablePool(), yang membuang company
 * yang saldo TOTAL-nya nol. Akibatnya GI ALLOY hanya menampilkan CGK, IKM, dan
 * SNSD dari 15 company yang memegangnya — 12 hilang justru KARENA kuotanya
 * sudah habis dipakai.
 *
 * Yang dikunci di sini, berurut dari yang paling mahal kalau rusak:
 *
 *   A. Σ Available TIDAK bergeser. Ini syarat yang membuat perubahan ini aman:
 *      company yang baru masuk saldonya nol, jadi kartu Overview, kaki tabel,
 *      dan kartu By Product harus tetap membaca angka yang sama persis.
 *
 *   B. Tidak ada baris yang HILANG dibanding sebelumnya. Menambah baris sambil
 *      diam-diam membuang baris lain adalah cara perbaikan ini bisa gagal
 *      tanpa terlihat.
 *
 *   C. Ketiga tampilan (Chart, By Product, Table) memakai kumpulan yang SAMA.
 *      Itu inti permintaannya: "tidak ada company/product yang hilang" harus
 *      berlaku di ketiganya, bukan di satu tampilan saja.
 *
 *   D. Company yang tampil = company yang punya produk itu di PERTEK & SPI.
 *      Sumber datanya harus tab itu, bukan daftar terpisah yang bisa bergeser.
 *
 * Run: node iqdash/tests/test_avq_semua_pemegang.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

/* Stub DOM yang cukup untuk chart: buildAvailableQuota() membangun pil produk
   lewat createElement + appendChild, bukan innerHTML. Stub yang hanya punya
   innerHTML membuat fungsi itu melempar, dan uji yang melewatkan chart tidak
   membuktikan chart ikut lengkap. */
const nodes = {};
const buatEl = () => {
  const el = {
    innerHTML: '', textContent: '', value: '', className: '', style: { cssText: '' },
    classList: { add(){}, remove(){} }, dataset: {}, children: [],
    appendChild(c) { this.children.push(c); this.innerHTML += (c && c.outerHTML) || `<span>${(c && c.textContent) || ''}</span>`; return c; },
    querySelectorAll: () => [], querySelector: () => null,
    setAttribute(){}, addEventListener(){}, getContext: () => ({}),
  };
  return el;
};
const node = id => (nodes[id] = nodes[id] || Object.assign(buatEl(), { id }));
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: {
    getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: buatEl,
    addEventListener: () => {}, body: { appendChild(){} },
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

const rows  = JSON.parse(call(`JSON.stringify(availableQuotaRows())`));
const kunci = r => r.code + '|' + r.product;
const EPS   = 0.001;

console.log('\nA · Σ Available tidak bergeser — syarat yang membuat ini aman');
{
  const tRows = rows.reduce((s, r) => s + r.avq, 0);
  const kartu = call('reportAvailableTotal().mt');
  ok(Math.abs(tRows - kartu) < 0.5,
    `Σ baris ${Math.round(tRows)} = kartu Available ${kartu}`, String(tRows));

  /* Kolam kartu SENGAJA masih availablePool() — kartu menghitung company
     bersaldo, dan itu memang yang ditulisnya ("N companies with balance"). */
  const coBersaldo = new Set(rows.filter(r => r.avq > EPS).map(r => r.code)).size;
  ok(coBersaldo === call('reportAvailableTotal().companies'),
    `company bersaldo di baris (${coBersaldo}) = hitungan kartu`,
    String(call('reportAvailableTotal().companies')));

  const prod = JSON.parse(call('JSON.stringify(productTotals())'));
  const tProd = Object.values(prod).reduce((s, d) => s + (d.avail || 0), 0);
  ok(Math.abs(tProd - tRows) < 0.5,
    'Σ kartu By Product = Σ baris tabel — tiga permukaan, satu angka', String(tProd));
}

console.log('\nB · Pemegang yang kuotanya HABIS ikut tampil');
{
  const habis = rows.filter(r => !(r.avq > EPS));
  ok(habis.length > 0, `${habis.length} baris bersaldo nol ikut dicetak, bukan dibuang`);

  const adaObt = habis.every(r => r.obtained > EPS || r.utilMT > EPS);
  ok(adaObt, 'setiap baris bersaldo nol tetap punya obtained atau utilisasi — bukan baris hampa',
    habis.filter(r => !(r.obtained > EPS || r.utilMT > EPS)).slice(0, 3).map(kunci).join(', '));

  const semuaNol = rows.filter(r => !(r.obtained > EPS) && !(r.utilMT > EPS) && !(r.avq > EPS));
  ok(semuaNol.length === 0,
    'baris yang KETIGA angkanya nol tidak pernah dibentuk',
    semuaNol.slice(0, 4).map(kunci).join(', '));

  /* Contoh yang disebut tim: GI ALLOY. */
  const gi = rows.filter(r => /GI ALLOY/i.test(r.product));
  const giHabis = gi.filter(r => !(r.avq > EPS)).length;
  ok(gi.length >= 10 && giHabis > 0,
    `GI ALLOY tampil di ${gi.length} company (${giHabis} di antaranya sudah habis) — bukan lagi hanya yang bersisa`,
    gi.map(r => r.code).join(', '));
}

console.log('\nC · Ketiga tampilan memakai kumpulan yang sama');
{
  /* Table */
  call('buildAvqTable();');
  const tbl = nodes['avqTableBody'].innerHTML.split('</tr>').filter(r => r.includes('<td'));
  const kunciTbl = tbl.map(r => {
    const m = [...r.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map(x => x[1].replace(/<[^>]+>/g, '').trim());
    return (m[0] || '') + '|' + (m[2] || '');
  });
  ok(tbl.length === rows.length,
    `Table mencetak ${tbl.length} baris = ${rows.length} baris sumber — tidak ada yang disaring di sisi tampilan`);

  /* Chart — dirender dari sumber yang sama; dicek lewat HTML yang dihasilkan. */
  call('buildAvailableQuota();');
  const chart = nodes['avqChart'].innerHTML;
  const hilangDiChart = rows.filter(r => !chart.includes(`>${r.code}<`));
  ok(hilangDiChart.length === 0,
    'setiap company di baris sumber muncul juga di Chart',
    [...new Set(hilangDiChart.map(r => r.code))].slice(0, 5).join(', '));

  /* By Product — produk yang saldonya habis di SEMUA pemegang tetap berkartu. */
  call('buildAvqProdGrid();');
  const grid = nodes['avqProdGrid'].innerHTML;
  const produk = [...new Set(rows.map(r => r.product))];
  const hilangDiGrid = produk.filter(p => !grid.includes('>' + p + '<'));
  ok(hilangDiGrid.length === 0,
    `${produk.length} produk semuanya berkartu di By Product, termasuk yang saldonya habis`,
    hilangDiGrid.slice(0, 5).join(', '));
}

console.log('\nD · Sumbernya PERTEK & SPI, bukan daftar terpisah');
{
  /* Tiap (company, produk) yang Obtained-nya aktif di tabel PERTEK & SPI wajib
     punya baris Available Quota. Ini yang mengikat kedua tab itu. */
  const st = JSON.parse(call(`JSON.stringify(spiTerbitRows())`));
  const adaAvq = new Set(rows.map(kunci));
  const bolong = st.filter(r => r.status !== 'inactive' && (Number(r.obtainedMT) || 0) > EPS)
                   .filter(r => !adaAvq.has(r.code + '|' + r.product));
  ok(bolong.length === 0,
    `${st.filter(r => r.status !== 'inactive').length} baris Active di PERTEK & SPI semuanya punya pasangan di Available Quota`,
    bolong.slice(0, 5).map(r => r.code + '/' + r.product + ' obt ' + r.obtainedMT).join(' · '));

  /* Dan sebaliknya: Available Quota tidak boleh mengarang pemegang yang tidak
     ada di PERTEK & SPI. */
  const adaSt = new Set(st.map(r => r.code + '|' + r.product));
  const karangan = rows.filter(r => r.obtained > EPS && !adaSt.has(kunci(r)));
  ok(karangan.length === 0,
    'tidak ada baris ber-obtained yang tidak dikenal tab PERTEK & SPI',
    karangan.slice(0, 5).map(kunci).join(' · '));
}

console.log('\nE · Kolom Status — kata demi kata dari PERTEK & SPI');
{
  call('buildAvqTable();');
  const html = nodes['avqTableBody'].innerHTML;

  /* Inti kolom ini: TIDAK boleh ada (company, produk) yang statusnya berbeda
     antara halaman Available Quota dan tab PERTEK & SPI Terbit. Diperiksa
     terhadap spiTerbitRows() langsung, bukan terhadap angka tetap — kalau
     salah satu tab berubah aturan, di sinilah selisihnya muncul. */
  const st = JSON.parse(call(`JSON.stringify(spiTerbitRows())`));
  const kanon = p => JSON.parse(call(`JSON.stringify(canonicalProduct(${JSON.stringify(String(p).trim())}))`));
  const petaSt = {}; st.forEach(r => { petaSt[r.code + '|' + kanon(r.product)] = r.status; });
  const beda = rows.filter(r => {
    const harap = petaSt[r.code + '|' + kanon(r.product)];
    return harap !== undefined && harap !== r.spiStatus;
  });
  ok(beda.length === 0,
    'status tiap baris = status (company, produk) itu di tab PERTEK & SPI',
    beda.slice(0, 4).map(r => `${kunci(r)}: AVQ "${r.spiStatus}" vs PERTEK & SPI "${petaSt[r.code + '|' + kanon(r.product)]}"`).join(' · '));

  /* Status yang tidak punya pasangan TIDAK boleh ditebak jadi Active —
     menebak di sini justru menyembunyikan ketidakcocokan antar tab. */
  const yatim = rows.filter(r => petaSt[r.code + '|' + kanon(r.product)] === undefined);
  ok(yatim.every(r => !r.spiStatus),
    `${yatim.length} baris tanpa pasangan di PERTEK & SPI dibiarkan kosong, bukan ditebak Active`,
    yatim.filter(r => r.spiStatus).slice(0, 4).map(kunci).join(', '));

  /* Lencana yang tercetak = kosakata tab PERTEK & SPI. */
  const nAktif = rows.filter(r => r.spiStatus === 'active').length;
  const nMati  = rows.filter(r => r.spiStatus === 'inactive').length;
  const nBelum = rows.filter(r => r.spiStatus === 'none').length;
  ok((html.match(/🟢 Active/g) || []).length === nAktif
     && (html.match(/⚪ Inactive/g) || []).length === nMati
     && (html.match(/⏳ Belum terbit/g) || []).length === nBelum,
    `lencana tercetak: ${nAktif} Active · ${nMati} Inactive · ${nBelum} belum terbit`,
    `dapat ${(html.match(/🟢 Active/g)||[]).length} / ${(html.match(/⚪ Inactive/g)||[]).length} / ${(html.match(/⏳ Belum terbit/g)||[]).length}`);

  /* Kolom ini TIDAK boleh diam-diam berubah jadi status saldo. Kalau semua
     baris bersaldo nol ditandai Inactive, kolomnya sudah salah arti. */
  const habisTapiAktif = rows.filter(r => !(r.avq > EPS) && r.spiStatus === 'active').length;
  ok(habisTapiAktif > 0,
    `${habisTapiAktif} baris bersaldo nol tetap 🟢 Active — status SPI, bukan status saldo`);

  const baris = html.split('</tr>').filter(r => r.includes('<td'));
  ok(baris.every(r => (r.match(/<td[\s>]/g) || []).length === 11),
    'tiap baris 11 sel sesudah Status disisipkan',
    [...new Set(baris.map(r => (r.match(/<td[\s>]/g) || []).length))].join(', '));

  const foot = nodes['avqTableFoot'].innerHTML;
  const colspan = Number((foot.match(/colspan="(\d+)"/) || [])[1] || 0);
  const sel = (foot.match(/<td[\s>]/g) || []).length;
  ok(colspan + sel - 1 === 11,
    `kaki tabel menutup 11 kolom (colspan ${colspan} + ${sel - 1} sel)`);
  ok(/Active|Inactive|belum terbit|—/.test(foot),
    'kaki tabel meringkas status SPI kolom itu',
    foot.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 170));
  ok(/bersaldo/.test(foot) && /habis/.test(foot),
    'kaki tabel tetap menyebut berapa baris yang bersaldo dan berapa yang habis',
    foot.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').slice(0, 170));
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
