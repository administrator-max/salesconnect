/* Regression tests for two period-filter defects found 2026-07-27.
 *
 * (2) ARRIVAL DATES WERE PARSED AS US M/D.
 *     03-kpis.js and 14-export.js fed ra_records' arrival_date straight to
 *     `new Date(...)`. That is fine for the ISO timestamps most rows carry
 *     (2026-02-22T17:00:00.000Z) but wrong for the bare slash dates others
 *     use: JS reads "12/06/2026" as 12 June -> no, as DECEMBER 6 (M/D), so
 *     BTS's 219.43 MT jumped from Q2 into Q4. Everything else in this app
 *     reads slash dates as DD/MM via pDate(). raDate() closes the gap:
 *     ISO timestamps keep native parsing, slash dates go through pDate(),
 *     anything else is refused rather than guessed.
 *
 * (3) UTILIZATION VANISHED WHEN CYCLE AND LOT FELL IN DIFFERENT QUARTERS.
 *     The Utilized KPI pooled companies with `filteredSPI()`, which gates on
 *     CYCLE dates, then summed utilization sliced by LOT date. A company whose
 *     permit was issued in Q2 but whose cargo lands in Q3 is therefore dropped
 *     from BOTH quarters: in Q2 its lot is out of range, in Q3 the company is.
 *     IKM's 2,000 MT disappeared from every quarter exactly that way.
 *     utilizationPool() unions the cycle-scoped list with companies holding a
 *     lot dated in the period.
 *
 * Run: node iqdash/tests/test_period_dates.cjs
 */
const path = require('path');
// _MONTH_NAME_MAP lives in 01-data.js, which this module reads at call time.
// Mirror it here so the loose ETA parser behaves exactly as it does in the app.
globalThis._MONTH_NAME_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  mei: 5, agu: 8, agust: 8, agustus: 8, okt: 10, oktober: 10,
  des: 12, desember: 12,
};
const M = require(path.join(__dirname, '..', 'assets', 'js', '02-period-filter.js'));
const { PERIOD, pDate, raDate, inPd, utilizationPool, companiesWithLotsInPeriod } = M;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log(`  ✖ ${m}`)); };
const eq = (a, b, m) => {
  const good = Object.is(a, b);
  if (!good) console.log(`  ✖ ${m}\n      harap: ${JSON.stringify(b)}  dapat: ${JSON.stringify(a)}`);
  good ? pass++ : fail++;
};
const ymd = d => d ? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` : null;

/* ── (2) raDate ─────────────────────────────────────────────────────── */
console.log('-- raDate: tanggal kedatangan --');
eq(ymd(raDate('12/06/2026')), '2026-06-12', "'12/06/2026' = 12 Juni (DD/MM), BUKAN Desember");
eq(ymd(raDate('19/06/2026')), '2026-06-19', "'19/06/2026' = 19 Juni");
eq(ymd(raDate('1/2/2026')),   '2026-02-01', "'1/2/2026' = 1 Februari (DD/MM)");
eq(ymd(raDate('2026-06-19')), '2026-06-19', 'ISO polos apa adanya');
ok(raDate('2026-02-22T17:00:00.000Z') instanceof Date,
   'timestamp ISO tetap dipakai apa adanya (perilaku lama dipertahankan)');
eq(raDate(''), null, 'string kosong -> null');
eq(raDate(null), null, 'null -> null');
eq(raDate('   '), null, 'spasi saja -> null');
eq(raDate('TBA'), null, "'TBA' -> null");
eq(raDate('bukan tanggal'), null, 'teks sembarang -> null, bukan tebakan');

/* ── (3) utilizationPool ────────────────────────────────────────────── */
console.log('-- utilizationPool: lot di dalam periode, siklus di luar --');
// IKM: cycles in Q2, lot lands mid-September (Q3)
const IKM = { code: 'IKM', cycles: [{ type: 'Submit #1', submitDate: '30/04/2026', releaseDate: '30/06/2026' }],
              shipments: { 'GI ALLOY': [{ utilMT: 2000, etaJKT: 'September 2026', pibDate: '' }] } };
// BHG: cycle and lot both in Q3
const BHG = { code: 'BHG', cycles: [{ type: 'Submit #1', submitDate: '05/08/2026', releaseDate: '20/08/2026' }],
              shipments: { 'GI ALLOY': [{ utilMT: 150, etaJKT: '30 Sept 26', pibDate: '' }] } };
// ZZZ: no lots at all
const ZZZ = { code: 'ZZZ', cycles: [{ type: 'Submit #1', submitDate: '05/08/2026', releaseDate: '20/08/2026' }],
              shipments: {} };
globalThis.SPI = [IKM, BHG, ZZZ];
globalThis.PENDING = [];

PERIOD.from = new Date(2026, 6, 1);                 // 1 Jul
PERIOD.to   = new Date(2026, 8, 30, 23, 59, 59);    // 30 Sep — Q3
PERIOD.active = true;

const lotCos = companiesWithLotsInPeriod().map(c => c.code).sort();
eq(JSON.stringify(lotCos), JSON.stringify(['BHG', 'IKM']),
   'IKM + BHG punya lot bertanggal di Q3; ZZZ tidak');

// cycle-scoped list for Q3 would contain BHG only — IKM's cycles are Q2
const cycleScoped = [BHG];
const pool = utilizationPool(cycleScoped).map(c => c.code).sort();
eq(JSON.stringify(pool), JSON.stringify(['BHG', 'IKM']),
   'IKM ditarik masuk lewat tanggal lot-nya (inti bug)');
eq(utilizationPool([BHG, IKM]).length, 2, 'tidak ada duplikat bila sudah ada di daftar');

PERIOD.active = false;
eq(utilizationPool(cycleScoped).length, 1, 'periode non-aktif -> pool tidak diubah');
eq(companiesWithLotsInPeriod().length, 0, 'periode non-aktif -> daftar lot kosong');

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
