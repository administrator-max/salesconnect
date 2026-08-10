/**
 * test_lot_utilisasi_baru.cjs
 *
 * 10 Agustus 2026, KAN: master mencatat GI ALLOY 80 MT @ 31/03/2026; tim
 * mengisi 60 MT @ 07/08/2026 atas kuota re-apply (Obtained #2 = 60 MT, SPI
 * 30/07/2026). Obtained 140, jadi seharusnya terpakai 140 dan sisa 0. Yang
 * tampil: terpakai 80, sisa 60. Bagi tim itu terlihat seperti isian yang
 * hilang lagi — padahal tanggalnya tersimpan; yang membuangnya aturan hitung.
 *
 * Aturan lama: "master sudah bicara -> lot produk itu dilewati". Mencegah
 * hitung ganda, tapi ikut membuang input Sales yang benar-benar baru.
 *
 * Menjumlahkan begitu saja JAUH lebih berbahaya. Sapuan data menunjukkan lot
 * pada umumnya mencatat peristiwa yang SAMA dengan master, cuma lebih rinci:
 *
 *   ADP  lot 100  = master Utilization #2 100
 *   HKG  lot 250  = master Utilization #2 250
 *   IKM  lot 2000 masih bagian dari master 2300  (obtained 4150)
 *
 * Jadi lot ditambahkan hanya bila lolos KETIGA syarat:
 *   1. bukan kembar   — produk, hari, MT sama persis
 *   2. sesudah master — tanggalnya > hari terakhir yang master tahu
 *   3. di bawah atap  — hasilnya tidak melampaui obtained produk itu
 *
 * Uji ini memakai implementasi PHP-nya lewat harness terpisah bila ada; di
 * sini yang dikunci adalah ATURANNYA, sebagai model acuan yang harus sama
 * antara PHP (iq_sync_util_with_cycles) dan JS (scopedUtilByProd).
 *
 * Run: node iqdash/tests/test_lot_utilisasi_baru.cjs
 */
'use strict';

let fail = 0;
const ok = (cond, label) => {
  console.log((cond ? 'ok   ' : 'FAIL ') + label);
  if (!cond) fail++;
};
const eq = (got, want, label) =>
  ok(Math.abs(got - want) < 0.001, `${label} — dapat ${got}, mau ${want}`);

/* ── Model acuan: cerminan langsung aturan di kedua sisi ──────────────────── */

function hitungUtil({ master = [], lots = [], obtained = 0 }) {
  let total = 0;
  const sidik = new Set();
  let hariAkhir = null;

  master.forEach(m => {
    total += m.mt;
    if (!m.date) return;
    sidik.add(m.date + '|' + m.mt.toFixed(3));
    if (!hariAkhir || m.date > hariAkhir) hariAkhir = m.date;
  });

  lots.forEach(l => {
    if (!(l.mt > 0)) return;
    if (!l.date) return;                                    // 0. tanpa tanggal
    if (sidik.has(l.date + '|' + l.mt.toFixed(3))) return;  // 1. kembar
    if (hariAkhir && l.date <= hariAkhir) return;           // 2. sudah terliput
    if (obtained > 0 && total + l.mt > obtained + 0.001) return;  // 3. atap
    total += l.mt;
  });

  return total;
}

/* ── KAN: kasus yang dilaporkan ───────────────────────────────────────────── */

console.log('-- KAN GI ALLOY: lot sesudah master, di bawah atap --');
const KAN = hitungUtil({
  master:   [{ mt: 80, date: '2026-03-31' }],
  lots:     [{ mt: 60, date: '2026-08-07' }],
  obtained: 140,
});
eq(KAN, 140, 'KAN terpakai');
eq(140 - KAN, 0, 'KAN sisa');

/* ── Yang TIDAK boleh ikut bertambah ──────────────────────────────────────── */

console.log('\n-- lot yang mencatat peristiwa yang sama --');

eq(hitungUtil({
  master:   [{ mt: 250, date: '2025-12-01' }, { mt: 100, date: '2026-07-28' }],
  lots:     [{ mt: 100, date: '2026-07-28' }],
  obtained: 350,
}), 350, 'ADP: lot kembar persis -> tidak ditambah');

eq(hitungUtil({
  master:   [{ mt: 750, date: '2025-11-20' }, { mt: 250, date: '2026-07-08' }],
  lots:     [{ mt: 250, date: '2026-05-01' }],
  obtained: 1000,
}), 1000, 'HKG: lot bertanggal LEBIH TUA dari master -> sudah terliput');

/* IKM adalah kasus yang paling berbahaya, dan yang menyelamatkannya BUKAN
   syarat "sesudah master" melainkan ATAP. Lot 2.000 itu bagian dari master
   2.300; kalau tim memberinya tanggal sesudah 24/07/2026, syarat 1 dan 2
   sama-sama lolos dan hasilnya 4.300 — melebihi obtained 4.150, jadi atap
   menolaknya. Dicatat apa adanya: atap di sini bukan pelengkap, ia satu-satunya
   yang berdiri. Kalau obtained IKM suatu saat naik di atas 4.300, perlindungan
   ini hilang dan 2.000 MT akan terhitung dua kali. */
eq(hitungUtil({
  master:   [{ mt: 2300, date: '2026-07-24' }],
  lots:     [{ mt: 2000, date: '2026-08-01' }],
  obtained: 4150,
}), 2300, 'IKM: atap menahan hitung ganda 2.000 MT');

eq(hitungUtil({
  master:   [{ mt: 2300, date: '2026-07-24' }],
  lots:     [{ mt: 2000, date: '2026-08-01' }],
  obtained: 9999,
}), 4300, 'IKM dengan atap longgar: TIDAK tertahan — risiko sisa yang diketahui');

console.log('\n-- atap obtained --');
eq(hitungUtil({
  master:   [{ mt: 300, date: '2026-01-10' }],
  lots:     [{ mt: 100, date: '2026-09-09' }],
  obtained: 350,
}), 300, 'lot yang melewati atap ditolak seluruhnya (300+100 > 350)');

eq(hitungUtil({
  master:   [{ mt: 300, date: '2026-01-10' }],
  lots:     [{ mt: 50, date: '2026-09-09' }],
  obtained: 350,
}), 350, 'lot yang pas di atap diterima');

/* ── Master diam: aturan GKL tetap berlaku ────────────────────────────────── */

console.log('\n-- master diam soal produk itu --');
eq(hitungUtil({ master: [], lots: [{ mt: 600, date: '2026-08-05' }], obtained: 3000 }),
   600, 'GKL GL ALLOY: mengisi kekosongan');
eq(hitungUtil({ master: [], lots: [{ mt: 275, date: '2026-07-01' }], obtained: 0 }),
   275, 'IKM SEAMLESS PIPE: tanpa obtained per produk, atap tidak menghalangi');

/* ── Tanpa tanggal tetap tidak dihitung ───────────────────────────────────── */

console.log('\n-- lot tanpa tanggal --');
eq(hitungUtil({ master: [{ mt: 80, date: '2026-03-31' }], lots: [{ mt: 60, date: null }], obtained: 140 }),
   80, 'tanpa tanggal -> tidak bisa ditempatkan di periode mana pun, tidak dihitung');

/* ── Sifat partisi: menambah lot tidak boleh merusak per-periode ──────────── */

console.log('\n-- partisi --');
{
  const master = [{ mt: 80, date: '2026-03-31' }];
  const lots   = [{ mt: 60, date: '2026-08-07' }];
  const setahun = hitungUtil({ master, lots, obtained: 140 });
  const h1 = hitungUtil({
    master: master.filter(m => m.date <= '2026-06-30'),
    lots:   lots.filter(l => l.date <= '2026-06-30'), obtained: 140 });
  const h2raw = hitungUtil({
    master: master.filter(m => m.date > '2026-06-30'),
    lots:   lots.filter(l => l.date > '2026-06-30'), obtained: 140 });
  eq(h1 + h2raw, setahun, 'H1 + H2 = setahun');
}

console.log(fail === 0 ? '\nSemua lolos.' : `\n${fail} GAGAL.`);
