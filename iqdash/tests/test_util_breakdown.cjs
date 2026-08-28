/* UTILIZATION BREAKDOWN — rincian per lot dari Input Manual (Sales).
 *
 * Dua hal yang dijaga, dan yang kedua jauh lebih penting daripada tampilannya:
 *
 *   A. Rincian mengambil dari lot Sales apa adanya — MT, tanggal pemakaian,
 *      dan ETA JKT — tanpa mengarang atau membulatkan.
 *
 *   B. Σ rincian SELALU sama dengan angka Utilized pada baris yang diklik.
 *      Ini syarat yang membuat modal ini layak dipercaya. Tidak semua utilisasi
 *      punya lot: sebagian datang dari rincian siklus master yang belum pernah
 *      dirinci Sales (BTS SHEET PILE 1.939 terpakai, lot hanya 1.514). Kalau
 *      modal hanya menampilkan lot, jumlahnya lebih kecil dari yang tertulis
 *      di tabel dan pembacanya wajar menyimpulkan ada data hilang. Selisih itu
 *      wajib tercetak sebagai barisnya sendiri, bukan disembunyikan.
 *
 * Run: node iqdash/tests/test_util_breakdown.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');

const ROOT = path.join(__dirname, '..');
const JS   = path.join(ROOT, 'assets', 'js');

let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

const nodes = {};
const node = id => (nodes[id] = nodes[id] || { id, innerHTML: '', textContent: '', value: '', style: {}, classList: { add(){}, remove(){} } });
const ctx = vm.createContext({
  console, Date, Math, JSON, Number, String, Object, Array, Set, Map,
  isNaN, parseFloat, parseInt, RegExp, Boolean, MT_LOCALE: 'en-US',
  localStorage: { getItem: () => null, setItem: () => {} },
  Chart: function () { return { destroy() {} }; },
  document: {
    getElementById: node, querySelectorAll: () => [], querySelector: () => null,
    createElement: () => ({ style: {}, classList: { add(){}, remove(){} }, innerHTML: '', appendChild(){}, setAttribute(){} }),
    addEventListener: () => {}, body: { appendChild(){} },
  },
});
ctx.window = ctx; ctx.globalThis = ctx;
['00-num.js', '01-data.js', '01a-quota-year.js', '02-period-filter.js', '03-kpis.js',
 '04-charts.js', '05-tables-spi.js', '05a-spi-terbit.js', '19-init.js',
 '19b-util-breakdown.js'].forEach(f =>
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

const avq = JSON.parse(call(`JSON.stringify(availableQuotaRows())`));
const pecah = (code, prod) => JSON.parse(call(`JSON.stringify(utilBreakdownRows(${JSON.stringify(code)}, ${JSON.stringify(prod)}))`));

console.log('\nA · Σ rincian = Utilized pada baris yang diklik — untuk SETIAP baris');
{
  const meleset = [];
  avq.forEach(r => {
    const b = pecah(r.code, r.product);
    const sigma = b.rows.reduce((s, x) => s + x.utilMT, 0);
    if (Math.abs(sigma - r.utilMT) > 0.5) {
      meleset.push(`${r.code}/${r.product}: Σ rincian ${sigma} vs Utilized ${r.utilMT}`);
    }
  });
  ok(meleset.length === 0,
    `${avq.length} baris Available Quota: Σ rincian cocok dengan Utilized-nya`,
    meleset.slice(0, 5).join(' · '));
}

console.log('\nB · Lot Sales dibaca apa adanya');
{
  const ikm = pecah('IKM', 'GI ALLOY');
  const lot = ikm.rows.filter(r => r.sumber === 'sales');
  ok(lot.length === 3, `IKM GI ALLOY: 3 lot dari Input Manual`, `dapat ${lot.length}`);
  ok(Math.abs(lot.reduce((s, r) => s + r.utilMT, 0) - 2600) < 0.001,
    'Σ lot IKM = 2.600 MT — 2.000 + 300 + 300 seperti yang diinput Sales',
    String(lot.reduce((s, r) => s + r.utilMT, 0)));
  ok(lot.every(r => r.utilDate) && lot.every(r => r.etaJKT),
    'tiap lot membawa Utilization Date dan ETA JKT-nya sendiri',
    lot.map(r => `${r.utilMT}@${r.utilDate || '-'}/${r.etaJKT || '-'}`).join(', '));
  ok(lot[0].obtained === 4150, 'kolom Obtained = obtained produk itu (4.150)', String(lot[0].obtained));

  /* Urut menurut tanggal pemakaian — bukan urutan penyimpanan. */
  const tgl = lot.map(r => r.utilDate);
  ok(/24/.test(tgl[0]) && /29/.test(tgl[1]) && /10/.test(tgl[2]),
    'lot terurut menurut tanggal pemakaian', tgl.join(' | '));
}

console.log('\nC · Utilisasi tanpa lot tetap tercetak, dengan sumbernya disebut');
{
  const bts = pecah('BTS', 'SHEET PILE');
  const master = bts.rows.filter(r => r.sumber === 'master');
  const sales  = bts.rows.filter(r => r.sumber === 'sales');
  ok(master.length === 1,
    'BTS SHEET PILE: bagian yang belum dirinci Sales muncul sebagai barisnya sendiri',
    `sales ${sales.length}, master ${master.length}`);
  ok(master.length === 1 && Math.abs(master[0].utilMT - (bts.util - bts.sigmaLot)) < 0.001,
    `baris master = Utilized − Σ lot (${Math.round(bts.util - bts.sigmaLot)} MT)`);
  ok(Math.abs(bts.rows.reduce((s, r) => s + r.utilMT, 0) - bts.util) < 0.001,
    'sehingga Σ rincian BTS tetap = Utilized-nya');

  /* Kalau lot sudah memuat seluruhnya, TIDAK boleh ada baris master tambahan —
     itu akan jadi hitung ganda yang justru sedang dibereskan. */
  const ikm = pecah('IKM', 'GI ALLOY');
  ok(ikm.rows.filter(r => r.sumber === 'master').length === 0,
    'IKM GI ALLOY: lot sudah memuat seluruh utilisasi, jadi tidak ada baris master tambahan');
}

console.log('\nD · Produk tanpa utilisasi dan company yang tidak dikenal');
{
  const kosong = pecah('IKM', 'SHEET PILE');
  ok(kosong.rows.length === 0, 'IKM SHEET PILE (belum terpakai) menghasilkan rincian kosong, bukan baris palsu',
    JSON.stringify(kosong.rows).slice(0, 120));
  const asing = pecah('TIDAK_ADA', 'GI ALLOY');
  ok(asing.rows.length === 0 && asing.util === 0, 'company tak dikenal tidak melempar, hanya kosong');
}

console.log('\nE · Modal mencetak keenam kolom yang diminta');
{
  call(`openUtilBreakdown('IKM', 'GI ALLOY');`);
  const html = nodes['utilBreakdownBody'].innerHTML;
  const baris = html.split('</tr>').filter(r => r.includes('<td'));
  ok(baris.length === 3, `3 baris tercetak untuk IKM GI ALLOY`, String(baris.length));
  ok(baris.every(r => (r.match(/<td[\s>]/g) || []).length === 7),
    'tiap baris 7 sel — Company, Product, Obtained, Utilization, Util Date, ETA, Sumber',
    [...new Set(baris.map(r => (r.match(/<td[\s>]/g) || []).length))].join(', '));
  ok(/2,000/.test(html) && /300/.test(html), 'MT tercetak', html.replace(/<[^>]+>/g, ' ').slice(0, 120));
  ok(/IKM/.test(html) && /GI ALLOY/.test(html), 'company dan produk tercetak di tiap baris');

  const kaki = nodes['utilBreakdownFoot'].innerHTML;
  ok(/cocok/.test(kaki) && !/selisih/.test(kaki),
    'kaki modal menyatakan Σ rincian cocok dengan Utilized',
    kaki.replace(/<[^>]+>/g, ' ').trim());

  /* Modal harus BENAR-BENAR terbuka, bukan hanya terisi. */
  ok(nodes['utilBreakdownModal'].style.display === 'block', 'modal ditampilkan');
  call(`closeUtilBreakdown();`);
  ok(nodes['utilBreakdownModal'].style.display === 'none', 'dan tertutup lagi');
}

console.log(`\n${pass} pass · ${fail} fail`);
process.exit(fail ? 1 : 0);
