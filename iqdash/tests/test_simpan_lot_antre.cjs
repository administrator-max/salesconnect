/* INPUT LOT TIDAK BOLEH HILANG DIAM-DIAM (David, 09-Nov-2026).
 *
 * Keluhan: "sudah merasa input, namun hilang", "data terlempar saat utilized",
 * dan "semua shipment ditampilkan, jangan yang baru saja".
 *
 * Yang dikunci:
 *   A. Dua simpanan berdekatan dikirim satu per satu dengan token terbaru, jadi
 *      tidak saling menolak 409. Tanpa antrean, simpanan kedua ditolak.
 *   B. Kiriman yang menunggu digabung dan membawa isian terbaru.
 *   C. Tombol Save utama ikut antre bersama simpan lot.
 *   D. Konflik sungguhan dari orang lain: hasil ok:false, ada pesan, ada tanda.
 *   E. Kegagalan server dan jaringan juga dilaporkan, bukan diam.
 *   F. Autosave memegang company saat diketik, walau form sudah pindah company.
 *   G. Tanggal diisi sesudah MT: Simpan aktif lagi dan MT ikut tersimpan.
 *   H. Kolom MT yang dikosongkan tidak ikut tersimpan otomatis.
 *   I. Pemakaian master dan lot berejaan lain tampil sebagai baris.
 * Data sintetis. Run: node iqdash/tests/test_simpan_lot_antre.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };
const JS = path.join(__dirname, '..', 'assets', 'js');
const tunggu = ms => new Promise(r => setTimeout(r, ms));

function dunia() {
  const toast = [];
  const el = {};
  const ctx = {
    console: { log() {}, warn() {}, error() {} },
    Date, JSON, Object, Array, Number, String, Math, Set, Map, Error, Promise, RegExp, parseInt, parseFloat, isNaN,
    setTimeout, clearTimeout,
    MT_LOCALE: 'en-US', QUOTA_YEAR: 2026, QUOTA_YEAR_DEFAULT: 2026,
    localStorage: { getItem: () => null, setItem() {}, removeItem() {} },
    document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} }, querySelector: () => null, querySelectorAll: () => [] },
    SPI: [], PENDING: [], RA: [],
    showToast: (m, k) => toast.push(String(m)),
    gv: () => ctx.__editCo,
    g: id => el[id] || null,
    livePreview() {},
    fmtThousandInline() {},
    canonicalProduct: p => (p === 'GI BORON' ? 'GI ALLOY' : p),
    getObtainedByProd: co => co._obt || {},
    getSPI: code => ctx.SPI.find(c => c.code === code),
    allTimeUtilByProd: co => co.utilizationByProd || {},
    companyPrimaryYear: () => 2026,
  };
  vm.createContext(ctx);
  ['10-edit-form.js', '11-shipment.js', '16-storage.js'].forEach(f => {
    try { vm.runInContext(fs.readFileSync(path.join(JS, f), 'utf8'), ctx, { filename: f }); }
    catch (e) { if (f !== '10-edit-form.js') throw e; }
  });
  /* Pakai helper asli dari 10-edit-form.js; yang lain sudah distub di atas. */
  ctx.ensureShipments = co => co.shipments;
  ctx.getObtainedByProd = co => co._obt || {};
  ctx.g = id => el[id] || null;
  ctx.gv = () => ctx.__editCo;
  ctx.livePreview = () => {};

  /* Server tiruan: satu kunci global dan penjaga 409 persis seperti iq_is_stale. */
  const db = { updatedAt: 1000, kiriman: [], tolak: 0, status: null, putus: false };
  ctx.fetchWithRetry = async (url, opt) => {
    if (db.putus) throw new Error('jaringan putus');
    const body = JSON.parse(opt.body);
    await tunggu(25);
    if (db.status) return { ok: false, status: db.status, json: async () => ({}) };
    const token = body._ifUpdatedAt;
    if (token && db.updatedAt - new Date(token).getTime() > 1000) {
      db.tolak++;
      return { ok: false, status: 409, json: async () => ({ error: 'stale' }) };
    }
    db.updatedAt += 5000;
    db.kiriman.push(body);
    return { ok: true, status: 200, json: async () => ({ ok: true, updatedAt: new Date(db.updatedAt).toISOString() }) };
  };
  ctx.fetch = ctx.fetchWithRetry;
  return { ctx, db, toast, el };
}

function company(ctx, db, code = 'BBB') {
  const co = {
    code, _updatedAt: new Date(db.updatedAt).toISOString(), _obt: { 'GL ALLOY': 1000 },
    shipments: { 'GL ALLOY': [{ lotNo: 1, utilMT: 0, utilDate: '', etaJKT: '', note: '' }] },
  };
  ctx.SPI.push(co);
  ctx.__editCo = code;
  return co;
}

(async () => {
  {
    const { ctx, db } = dunia();
    const co = company(ctx, db);
    co.shipments['GL ALLOY'][0].utilDate = '30 Oct 26';
    const a = ctx.patchShipmentsToServer(co);
    co.shipments['GL ALLOY'][0].utilMT = 100;
    await tunggu(5);                          // kiriman pertama sedang berjalan
    const b = ctx.patchShipmentsToServer(co);
    const [ha, hb] = await Promise.all([a, b]);
    ok(ha.ok && hb.ok, 'A. dua simpanan berdekatan sama-sama berhasil', JSON.stringify([ha, hb]));
    ok(db.tolak === 0, 'A. tidak ada penolakan 409', String(db.tolak));
    const akhir = db.kiriman[db.kiriman.length - 1].shipments['GL ALLOY'][0];
    ok(akhir.utilMT === 100 && akhir.utilDate === '30 Oct 26', 'A. kiriman terakhir membawa MT dan tanggal', JSON.stringify(akhir));
  }
  {
    const { ctx, db } = dunia();
    const co = company(ctx, db);
    const a = ctx.patchShipmentsToServer(co);
    await tunggu(5);
    ctx.patchShipmentsToServer(co);
    co.shipments['GL ALLOY'][0].utilMT = 50;
    ctx.patchShipmentsToServer(co);
    co.shipments['GL ALLOY'][0].utilMT = 75;
    const c = ctx.patchShipmentsToServer(co);
    await Promise.all([a, c]);
    ok(db.kiriman.length === 2, 'B. kiriman yang menunggu digabung menjadi satu', String(db.kiriman.length));
    ok(db.kiriman[1].shipments['GL ALLOY'][0].utilMT === 75, 'B. kiriman gabungan membawa isian terbaru');
  }
  {
    const { ctx, db } = dunia();
    const co = company(ctx, db);
    const a = ctx.patchShipmentsToServer(co);
    await tunggu(5);
    let hasil = 'belum';
    try { await ctx.patchToServer(co); hasil = 'ok'; } catch (e) { hasil = 'gagal ' + e.status; }
    await a;
    ok(hasil === 'ok', 'C. Save utama menunggu giliran dan tidak kena 409', hasil);
    ok(db.tolak === 0, 'C. tidak ada penolakan 409');
    ok(ctx.adaSimpanBerjalan() === false, 'C. antrean kosong sesudah selesai');
  }
  {
    const { ctx, db, toast } = dunia();
    const co = company(ctx, db);
    db.updatedAt += 60000;                    // orang lain menulis lebih dulu
    const h = await ctx.patchShipmentsToServer(co);
    ok(h.ok === false && h.status === 409, 'D. konflik sungguhan dilaporkan gagal', JSON.stringify(h));
    ok(toast.some(t => /BELUM tersimpan/.test(t)), 'D. pengguna diberi tahu', toast.join());
    ok(co._lotGagalSimpan === true, 'D. company ditandai belum tersimpan');
  }
  {
    const { ctx, db, toast } = dunia();
    const co = company(ctx, db);
    db.status = 500;
    const h1 = await ctx.patchShipmentsToServer(co);
    ok(h1.ok === false && toast.length === 1, 'E. kegagalan server dilaporkan', JSON.stringify(h1));
    db.status = null; db.putus = true;
    const h2 = await ctx.patchShipmentsToServer(co);
    ok(h2.ok === false && toast.length === 2, 'E. jaringan putus dilaporkan', JSON.stringify(h2));
    db.putus = false;
    const h3 = await ctx.patchShipmentsToServer(co);
    ok(h3.ok && co._lotGagalSimpan === false, 'E. berhasil lagi menghapus tanda gagal');
  }
  {
    const { ctx, db } = dunia();
    const a = company(ctx, db, 'AAA');
    a.shipments['GL ALLOY'][0].utilDate = '01 Nov 26';
    ctx.scheduleShipmentsPersist();
    ctx.__editCo = '';                        // form ditutup dalam 600 ms
    await tunggu(750);
    ok(db.kiriman.length === 1 && db.kiriman[0].shipments['GL ALLOY'][0].utilDate === '01 Nov 26',
       'F. autosave tetap terkirim walau form sudah ditutup', String(db.kiriman.length));
  }
  {
    const { ctx, db, el } = dunia();
    const co = company(ctx, db);
    const pid = 'GL_ALLOY';
    const tombol = { disabled: true, classList: { add() {}, remove() {} }, style: {} };
    const salah = { textContent: '', classList: { add() {}, remove() {} }, style: {} };
    el[`util-save-${pid}-0`] = tombol; el[`util-err-${pid}-0`] = salah;
    const mt = { value: '100', dataset: { prod: 'GL ALLOY', idx: '0' }, classList: { add() {}, remove() {} }, style: {} };
    const tgl = { value: '', dataset: { prod: 'GL ALLOY', idx: '0' }, style: {}, title: '' };
    ctx.lotUtilDate = l => /\d{1,2} \w+ \d{2,4}/.test(l.utilDate || '') ? new Date() : null;
    ctx.document.querySelector = s => /util-direct-inp/.test(s) ? mt : /utildate-inp/.test(s) ? tgl : null;
    ctx.onSalesDirectChange(mt);
    ok(tombol.disabled === true && !co.shipments['GL ALLOY'][0].utilMT, 'G. MT tanpa tanggal: Simpan mati, MT belum ikut');
    tgl.value = '03 November 2026';
    ctx.onSalesUtilDateChange(tgl);
    ok(tombol.disabled === false, 'G. sesudah tanggal diisi, Simpan aktif lagi');
    ok(co.shipments['GL ALLOY'][0].utilMT === 100, 'G. MT ikut tersimpan otomatis', String(co.shipments['GL ALLOY'][0].utilMT));
    await tunggu(750);
    const terkirim = db.kiriman[db.kiriman.length - 1].shipments['GL ALLOY'][0];
    ok(terkirim.utilMT === 100 && terkirim.utilDate === '03 November 2026', 'G. MT dan tanggal sampai di server', JSON.stringify(terkirim));

    /* H */
    const jumlah = db.kiriman.length;
    mt.value = '';
    ctx.onSalesDirectChange(mt);
    await tunggu(750);
    ok(co.shipments['GL ALLOY'][0].utilMT === 100 && db.kiriman.length === jumlah, 'H. mengosongkan kolom tidak langsung menghapus MT');
  }
  {
    const { ctx } = dunia();
    const co = {
      code: 'KAN', _obt: { 'GI ALLOY': 140 },
      utilizationByProd: { 'GI ALLOY': 140 },
      etaByProd: { 'GI BORON': '31/03/2026' },
      utilCycles: [{ cycle: 'Utilization #1', product: 'GI ALLOY', mt: 80, date: '31/03/2026' }],
      shipments: {
        'GI ALLOY': [{ utilMT: 60, utilDate: '07 August 2026' }],
        'GI BORON': [{ utilMT: 0, realMT: 77.23, pibDate: '19/06/2026' }],
      },
    };
    const b = ctx._barisTerkunci(co, 'GI ALLOY');
    ok(b.length === 2, 'I. pemakaian master dan lot ejaan lain sama-sama tampil', JSON.stringify(b));
    ok(b[0].jenis === 'M' && b[0].mt === 80 && b[0].tgl === '31/03/2026' && b[0].eta === '31/03/2026', 'I. baris master lengkap', JSON.stringify(b[0]));
    ok(b[1].jenis === 'L' && /77\.23/.test(b[1].note) && /19\/06\/2026/.test(b[1].note), 'I. baris lot ejaan lain membawa realisasi dan PIB', JSON.stringify(b[1]));
    const html = ctx._htmlTerkunciSales(co, 'GI ALLOY');
    ok(/lot-terkunci/.test(html) && !/<input/.test(html), 'I. baris tersebut hanya-baca');

    const sisa = { code: 'EMS', _obt: { 'GL ALLOY': 500 }, utilizationByProd: { 'GL ALLOY': 500 }, utilCycles: [], shipments: { 'GL ALLOY': [{}] } };
    const c = ctx._barisTerkunci(sisa, 'GL ALLOY');
    ok(c.length === 1 && c[0].mt === 500 && c[0].tgl === '', 'I. pemakaian tanpa rincian tetap tampil', JSON.stringify(c));
  }
  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
