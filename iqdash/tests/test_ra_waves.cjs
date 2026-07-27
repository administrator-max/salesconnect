/* Regression tests for the multi-wave ra_records hazard (audit 2026-07-27).
 *
 * A company that clears customs in several waves owns one ra_records row PER
 * ARRIVAL (decision 2026-07-27). Two bug classes followed from code that still
 * assumed one row per company:
 *
 *   READ  — `RA.find(r => r.code === c)` returns whichever row comes first in
 *           sheet order, so per-company exports reported only wave 1. AMP read
 *           as 399.178 MT instead of 799.120.
 *
 *   WRITE — saveEdit() derived company-wide totals from co.shipments and wrote
 *           them into a single row. For AMP that stores 799.120 against wave 1
 *           while wave 2 keeps its own 399.942, i.e. 1,199.062 MT persisted to
 *           the sheet. iqdash_data.php:460 guards the read side against this,
 *           but a wrong number written to the sheet is past that guard.
 *
 * raTotals() is the single place both concerns are answered: `berat` sums the
 * waves, `multi` says per-wave weights are authoritative and a company-wide
 * figure must not be written back to one row.
 *
 * Fixtures use the real AMP/SGD splits from ra-multi-arrival_2026-07-27.
 *
 * Run: node iqdash/tests/test_ra_waves.cjs
 */
const path = require('path');
const M = require(path.join(__dirname, '..', 'assets', 'js', '01-data.js'));
const { raTotals, getRAWaves } = M;

let pass = 0, fail = 0;
const ok = (c, m) => { c ? pass++ : (fail++, console.log(`  ✖ ${m}`)); };
const eq = (a, b, m) => {
  const good = Object.is(a, b);
  if (!good) console.log(`  ✖ ${m}\n      harap: ${JSON.stringify(b)}  dapat: ${JSON.stringify(a)}`);
  good ? pass++ : fail++;
};

/* AMP and SGD each cleared in two waves; BBB in one; NEW has no rows. */
const POOL = [
  { code: 'AMP', product: 'GI ALLOY', berat: 399.178, cargoArrived: true, arrivalDate: '2026-04-09' },
  { code: 'BBB', product: 'GL ALLOY', berat: 250.000, cargoArrived: true, arrivalDate: '2026-04-09' },
  { code: 'AMP', product: 'GI ALLOY', berat: 399.942, cargoArrived: true, arrivalDate: '2026-04-27' },
  { code: 'SGD', product: 'GI ALLOY', berat: 1507.536, cargoArrived: true, arrivalDate: '2026-03-30' },
  { code: 'SGD', product: 'GI ALLOY', berat: 488.562, cargoArrived: true, arrivalDate: '2026-04-24' },
  { code: 'ZZZ', product: 'SEAMLESS', berat: 120.5, cargoArrived: false, arrivalDate: '' },
];

console.log('— waves —');
eq(getRAWaves('AMP', POOL).length, 2, 'AMP has 2 waves');
eq(getRAWaves('BBB', POOL).length, 1, 'BBB has 1 wave');
eq(getRAWaves('NEW', POOL).length, 0, 'unknown company has no waves');

console.log('— totals sum across waves —');
// 399.178 + 399.942 = 799.120 — the figure verified against the source workbook
eq(Math.round(raTotals('AMP', POOL).berat * 1000) / 1000, 799.12, 'AMP berat totals both waves');
eq(Math.round(raTotals('SGD', POOL).berat * 1000) / 1000, 1996.098, 'SGD berat totals both waves');
eq(raTotals('BBB', POOL).berat, 250, 'single-wave company unchanged');
eq(raTotals('NEW', POOL).berat, 0, 'no rows -> 0, not NaN');

console.log('— the old first-row read under-reported —');
const firstOnly = POOL.find(r => r.code === 'AMP').berat;
ok(firstOnly !== raTotals('AMP', POOL).berat,
   'RA.find would have returned wave 1 only (399.178 vs 799.120)');
eq(firstOnly, 399.178, 'wave 1 is what the old code saw');

console.log('— multi flag gates the write path —');
ok(raTotals('AMP', POOL).multi, 'AMP flagged multi — company total must not be written to one row');
ok(raTotals('SGD', POOL).multi, 'SGD flagged multi');
ok(!raTotals('BBB', POOL).multi, 'BBB not multi — aggregate write stays allowed');
ok(!raTotals('NEW', POOL).multi, 'no rows is not multi');

console.log('— arrival state and util/real split —');
ok(raTotals('AMP', POOL).arrived, 'AMP arrived (any wave counts)');
eq(raTotals('AMP', POOL).realMT, raTotals('AMP', POOL).berat, 'arrived -> realMT carries the weight');
eq(raTotals('AMP', POOL).utilMT, 0, 'arrived -> utilMT 0');
eq(raTotals('ZZZ', POOL).utilMT, 120.5, 'not arrived -> utilMT carries the weight');
eq(raTotals('ZZZ', POOL).realMT, 0, 'not arrived -> realMT 0');

/* A half-arrived company still counts as arrived: the read side asserts
   arrival across every wave (iqdash_data.php:462-464). */
const PARTIAL = [
  { code: 'PRT', berat: 100, cargoArrived: true },
  { code: 'PRT', berat: 50,  cargoArrived: false },
];
console.log('— partially arrived —');
ok(raTotals('PRT', PARTIAL).arrived, 'any arrived wave marks the company arrived');
eq(raTotals('PRT', PARTIAL).berat, 150, 'berat still totals every wave');

console.log('— non-numeric berat —');
const JUNK = [
  { code: 'JNK', berat: '399.178', cargoArrived: true },
  { code: 'JNK', berat: null,      cargoArrived: true },
  { code: 'JNK', berat: 'TBA',     cargoArrived: true },
];
eq(raTotals('JNK', JUNK).berat, 399.178, 'numeric strings count, null/garbage contribute 0 not NaN');

console.log(fail ? `\n✖ GAGAL — lulus ${pass}, gagal ${fail}` : `\n✔ SEMUA LULUS  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail ? 1 : 0);
