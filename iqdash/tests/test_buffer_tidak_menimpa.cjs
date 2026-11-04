/* BUFFER SIMPAN-GAGAL TIDAK BOLEH MENIMPA INPUT ORANG LAIN (04-Nov-2026).
 *
 * Insiden: saveToStorage() lama memotret SELURUH company tiap kali satu company
 * disimpan; saat halaman dibuka, migrateLocalToServer() mengirim ulang semuanya
 * dengan token versi segar → lot David (BBB 100, BTS 105, KARA 80, LCP 50 MT)
 * kembali ke 0, dan kolom 2026 18 company diisi nilai irisan 2027.
 *
 * Yang dikunci:
 *   A. Simpan satu company hanya membuffer company itu.
 *   B. Saat dibuka ulang, entri yang DB-nya sudah berubah sejak diedit DIBUANG,
 *      tidak dikirim (inilah kasus David).
 *   C. Entri yang DB-nya belum berubah (simpanan aslinya memang gagal) dikirim
 *      dengan token versi LAMA, sehingga server tetap bisa menolak 409.
 *   D. Buffer format lama dibuang tanpa dikirim.
 *   E. Irisan tahun kuota tidak pernah dibuffer.
 *   F. saveToStorage() tanpa kode tidak membuffer apa pun.
 * Data sintetis. Run: node iqdash/tests/test_buffer_tidak_menimpa.cjs
 */
const fs = require('fs'), path = require('path'), vm = require('vm');
let pass = 0, fail = 0;
const ok = (c, m, x) => { if (c) { pass++; console.log('  ok   ' + m); } else { fail++; console.log('FAIL   ' + m + (x ? `\n         ${x}` : '')); } };

function dunia() {
  const store = {};
  const sent = [];
  const ctx = {
    console, Date, JSON, Object, Array, Number, String, Math, Set, Error, setTimeout, clearTimeout,
    localStorage: {
      getItem: k => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
      removeItem: k => { delete store[k]; },
    },
    document: { getElementById: () => null, createElement: () => ({ style: {} }), body: { appendChild() {} } },
    SPI: [], PENDING: [], RA: [],
  };
  ctx.getSPI = code => ctx.SPI.find(c => c.code === code);
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'assets', 'js', '16-storage.js'), 'utf8'), ctx);
  // patchToServer tiruan: meniru penjaga 409 server (iq_is_stale).
  ctx.__db = {};
  ctx.patchToServer = async co => {
    const db = ctx.__db[co.code];
    if (co._updatedAt && new Date(db.updatedAt) - new Date(co._updatedAt) > 1000) {
      const e = new Error('stale'); e.status = 409; throw e;
    }
    sent.push({ code: co.code, shipments: JSON.parse(JSON.stringify(co.shipments || {})), statusUpdate: co.statusUpdate });
  };
  return { ctx, store, sent };
}
const lot = mt => ({ 'GL ALLOY': [{ lotNo: 1, utilMT: mt }] });

(async () => {
  /* A + B: Putri membuka halaman 01:00 (BBB util 0). David mengisi BBB 100 pukul 01:33.
     Putri menyimpan EMS 02:50 → hanya EMS dibuffer. Saat ia membuka ulang, BBB tidak dikirim. */
  {
    const { ctx, store, sent } = dunia();
    const T0 = '2026-11-02T01:00:00.000Z', T1 = '2026-11-02T01:33:37.000Z';
    ctx.SPI = [
      { code: 'BBB', _updatedAt: T0, shipments: lot(0), statusUpdate: 'x' },
      { code: 'EMS', _updatedAt: T0, shipments: lot(0), statusUpdate: 'lama' },
    ];
    ctx.saveToStorage('EMS');
    const buf = JSON.parse(store.quotaDashboard_v1);
    ok(Object.keys(buf.entries).join() === 'EMS', 'A. simpan EMS hanya membuffer EMS', Object.keys(buf.entries).join());
    // simpanan EMS SUKSES → entri dihapus
    ctx.clearStorageForCode('EMS');
    ok(!store.quotaDashboard_v1, 'A. sesudah simpan sukses buffer kosong');

    // Buka ulang: DB BBB sudah diubah David.
    ctx.__db = { BBB: { updatedAt: T1 }, EMS: { updatedAt: '2026-11-02T02:50:00.000Z' } };
    ctx.SPI = [{ code: 'BBB', _updatedAt: T1, shipments: lot(100) }, { code: 'EMS', _updatedAt: '2026-11-02T02:50:00.000Z', shipments: lot(0) }];
    const r = await ctx.migrateLocalToServer();
    ok(sent.length === 0, 'B. tidak ada company yang dikirim ulang saat halaman dibuka', JSON.stringify(sent));
    ok(ctx.SPI[0].shipments['GL ALLOY'][0].utilMT === 100, 'B. lot BBB 100 MT tetap utuh');
    ok(r.pushed === 0, 'B. ringkasan pushed = 0');
  }

  /* B2: simpanan EMS GAGAL (jaringan) lalu David menulis EMS → entri dibuang, bukan dikirim. */
  {
    const { ctx, store, sent } = dunia();
    const T0 = '2026-11-02T01:00:00.000Z';
    ctx.SPI = [{ code: 'EMS', _updatedAt: T0, shipments: lot(0), statusUpdate: 'putri' }];
    ctx.saveToStorage('EMS');                    // simpan gagal, entri tertinggal
    ctx.__db = { EMS: { updatedAt: '2026-11-02T03:00:00.000Z' } };
    ctx.SPI = [{ code: 'EMS', _updatedAt: '2026-11-02T03:00:00.000Z', shipments: lot(70), statusUpdate: 'david' }];
    const r = await ctx.migrateLocalToServer();
    ok(sent.length === 0 && r.discardedStale === 1, 'B2. DB berubah sesudah edit → entri dibuang', JSON.stringify(r));
    ok(!store.quotaDashboard_v1, 'B2. buffer dibersihkan');
  }

  /* C: simpanan gagal dan DB belum berubah → dikirim, dengan token lama. */
  {
    const { ctx, store, sent } = dunia();
    const T0 = '2026-11-02T01:00:00.000Z';
    ctx.SPI = [{ code: 'KJK', _updatedAt: T0, shipments: lot(0), statusUpdate: 'baru diketik' }];
    ctx.saveToStorage('KJK');
    ctx.__db = { KJK: { updatedAt: T0 } };
    ctx.SPI = [{ code: 'KJK', _updatedAt: T0, shipments: lot(0), statusUpdate: 'lama' }];
    const r = await ctx.migrateLocalToServer();
    ok(r.pushed === 1 && sent[0].statusUpdate === 'baru diketik', 'C. simpanan yang benar-benar gagal tetap dikirim ulang', JSON.stringify(r));
    ok(!store.quotaDashboard_v1, 'C. entri dihapus sesudah terkirim');
  }

  /* D: buffer format lama (potret seluruh company) dibuang tanpa dikirim. */
  {
    const { ctx, store, sent } = dunia();
    store.quotaDashboard_v1 = JSON.stringify({ ts: '2026-11-02T06:52:00.000Z', ra: {}, spi: { BBB: { shipments: lot(0) }, BTS: { shipments: {} } } });
    ctx.__db = { BBB: { updatedAt: '2026-11-02T02:56:00.000Z' } };
    ctx.SPI = [{ code: 'BBB', _updatedAt: '2026-11-02T02:56:00.000Z', shipments: lot(100) }];
    const r = await ctx.migrateLocalToServer();
    ok(sent.length === 0, 'D. buffer format lama tidak dikirim (kasus BBB 04-Nov)', JSON.stringify(r));
    ok(!store.quotaDashboard_v1, 'D. buffer format lama dihapus');
    ok(ctx.SPI[0].shipments['GL ALLOY'][0].utilMT === 100, 'D. lot BBB tetap 100');
  }

  /* E + F */
  {
    const { ctx, store } = dunia();
    ctx.SPI = [{ code: 'EMS', _updatedAt: '2026-10-29T00:00:00.000Z', _quotaYearSliced: true, statusUpdate: 'status 2027', pertekNo: '' }];
    ctx.saveToStorage('EMS');
    ok(!store.quotaDashboard_v1, 'E. irisan tahun 2027 tidak dibuffer (kasus 29-Okt)');
    ctx.SPI = [{ code: 'AADC', _updatedAt: '2026-10-29T00:00:00.000Z' }];
    ctx.saveToStorage();
    ok(!store.quotaDashboard_v1, 'F. saveToStorage() tanpa kode tidak membuffer apa pun');
  }

  console.log(`\n${pass} lulus, ${fail} gagal`);
  process.exit(fail ? 1 : 0);
})();
