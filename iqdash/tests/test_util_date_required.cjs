/* Regression test: a utilization lot that carries MT must carry a DATE.
 *
 * WHY THIS EXISTS
 * Utilization is sliced into periods by each lot's own date —
 * lotUtilDate() = pDate(pibDate) || _parseEtaLoose(etaJKT). inPd(null) is
 * FALSE, so a lot with MT but no parseable date is not merely "not matching"
 * the selected quarter: it is invisible in EVERY quarter, and its MT silently
 * disappears from the KPIs, the AVQ cards and the O/U chart the moment anyone
 * picks a period. All Time still shows it, so the loss looks like a filter
 * bug rather than missing data.
 *
 * The per-lot 💾 Simpan button (saveSalesUtil) always refused a dateless lot.
 * The main Save button did not — it reads the raw inputs through
 * collectShipmentData() and wrote them straight to company_shipments. Both
 * paths now share one rule: lotHasUtilDate().
 *
 * lotHasUtilDate() must accept exactly what the FILTER accepts — no more
 * (or the guard passes a lot the filter later drops, which is the bug) and
 * no less (or it blocks a lot that is already perfectly dated, e.g. one
 * where Ops entered the PIB date but Sales left ETA blank).
 *
 * Run: node iqdash/tests/test_util_date_required.cjs
 */
const path = require('path');

// _MONTH_NAME_MAP lives in 01-data.js, which 02-period-filter.js reads at
// call time. Mirror it VERBATIM (01-data.js:197) so the loose ETA parser
// behaves exactly as it does in the app — an incomplete mirror here makes
// this test fail on month names the real dashboard accepts perfectly well.
globalThis._MONTH_NAME_MAP = {
  jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3,
  apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7,
  aug: 8, august: 8, sep: 9, sept: 9, september: 9,
  oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12,
  mei: 5, agu: 8, agust: 8, agustus: 8, okt: 10, oktober: 10,
  des: 12, desember: 12,
  januari: 1, februari: 2, maret: 3, juni: 6, juli: 7,
};

const PF = require(path.join(__dirname, '..', 'assets', 'js', '02-period-filter.js'));
// In the browser these are globals shared across the classic scripts;
// 11-shipment.js's lotHasUtilDate() calls lotUtilDate() the same way.
globalThis.lotUtilDate = PF.lotUtilDate;
globalThis.pDate       = PF.pDate;

const { lotHasUtilDate } = require(path.join(__dirname, '..', 'assets', 'js', '11-shipment.js'));

let pass = 0, fail = 0;
const eq = (a, b, m) => {
  const good = Object.is(a, b);
  if (!good) console.log(`  ✖ ${m}\n      harap: ${JSON.stringify(b)}  dapat: ${JSON.stringify(a)}`);
  good ? pass++ : fail++;
};

/* ── Dated lots: the guard must let these through ────────────────────── */
console.log('-- lot BERTANGGAL: harus lolos --');
eq(lotHasUtilDate({ etaJKT: '07 Mar 26',    pibDate: '' }), true,  "ETA gaya 'DD Mon YY'");
eq(lotHasUtilDate({ etaJKT: '15 Juni 26',   pibDate: '' }), true,  'ETA nama bulan Indonesia');
eq(lotHasUtilDate({ etaJKT: 'April 2026',   pibDate: '' }), true,  'ETA bulan saja (dianggap pertengahan bulan)');
eq(lotHasUtilDate({ etaJKT: '12/06/2026',   pibDate: '' }), true,  'ETA DD/MM/YYYY');
eq(lotHasUtilDate({ etaJKT: '2026-06-12',   pibDate: '' }), true,  'ETA ISO');
// Inti perbaikan: PIB dari Operations sudah cukup — dulu guard hanya melihat
// ETA, jadi lot yang SUDAH bertanggal PIB tetap ditolak.
eq(lotHasUtilDate({ etaJKT: '',             pibDate: '14/03/2026' }), true, 'PIB saja (ETA kosong) sudah cukup');
eq(lotHasUtilDate({ etaJKT: 'TBA',          pibDate: '14/03/2026' }), true, "ETA 'TBA' tapi PIB terisi");

/* ── Dateless lots: the guard must catch these ───────────────────────── */
console.log('-- lot TANPA tanggal: harus ditolak --');
eq(lotHasUtilDate({ etaJKT: '',    pibDate: '' }),    false, 'dua-duanya kosong');
eq(lotHasUtilDate({ etaJKT: 'TBA', pibDate: '' }),    false, "'TBA' bukan tanggal");
eq(lotHasUtilDate({ etaJKT: '-',   pibDate: '' }),    false, "placeholder '-' bukan tanggal");
eq(lotHasUtilDate({ etaJKT: '   ', pibDate: '   ' }), false, 'spasi saja');
eq(lotHasUtilDate({}),                                false, 'lot tanpa field tanggal sama sekali');
eq(lotHasUtilDate(null),                              false, 'lot null');

/* ── The guard and the filter must agree, cell for cell ──────────────── */
// Kalau guard bilang "bertanggal" tapi lotUtilDate() mengembalikan null, lot
// itu tetap hilang dari periode — persis bug yang mau dicegah.
console.log('-- guard == filter (tidak boleh beda) --');
const SAMPLES = [
  { etaJKT: '07 Mar 26',  pibDate: '' },
  { etaJKT: 'April 2026', pibDate: '' },
  { etaJKT: '',           pibDate: '14/03/2026' },
  { etaJKT: 'TBA',        pibDate: '' },
  { etaJKT: '',           pibDate: '' },
  { etaJKT: 'kapal belum jelas', pibDate: '' },
];
SAMPLES.forEach(lot => {
  eq(lotHasUtilDate(lot), !!PF.lotUtilDate(lot),
     `guard sama dengan lotUtilDate() untuk ${JSON.stringify(lot)}`);
});

console.log(`\n${fail === 0 ? '✔ SEMUA LULUS' : '✖ GAGAL'}  —  lulus ${pass}, gagal ${fail}`);
process.exit(fail === 0 ? 0 : 1);
