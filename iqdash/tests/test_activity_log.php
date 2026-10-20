<?php
/**
 * Log aktivitas (iqdash_activity.php): setiap simpan harus melaporkan apakah
 * inputnya TERHITUNG di dashboard. Kasus yang memicu fitur ini (20-Okt-2026):
 * lot KJK 300 MT tersimpan tapi Used tidak bergerak — tim baru tahu setelah
 * bertanya. Status `warning` di sini adalah yang seharusnya muncul saat itu.
 */
require __DIR__ . '/../iqdash_util.php';
require __DIR__ . '/../iqdash_data.php';
require __DIR__ . '/../iqdash_activity.php';
function ok($c,$m){ echo ($c?"PASS":"FAIL")." $m\n"; if(!$c) $GLOBALS['fail']=1; }

$potret = fn(array $lot, float $used, float $sisa, array $extra = []) => $extra + [
    'ada' => true, 'lot' => $lot, 'uc' => [], 'stats' => [], 'siklus' => [], 'status' => [],
    'realBaris' => 0, 'realMentah' => 0.0, 'realTerhitung' => 0.0,
    'dash' => ['obtained' => 1700, 'used' => $used, 'sisa' => $sisa,
               'usedProd' => ['GL ALLOY' => $used], 'sisaProd' => ['GL ALLOY' => $sisa]],
    'masterAkhir' => ['GL ALLOY' => '2026-06-25'],
];
$lot = fn($mt, $tgl) => ['GL ALLOY #1' => ['produk' => 'GL ALLOY', 'util' => $mt, 'tgl' => $tgl, 'eta' => '', 'real' => 0, 'tiba' => false, 'primer' => true]];

// A. Pola KJK sebelum perbaikan: lot 0 -> 300, Used diam di 1.400.
[$st, $r, $d, $w] = iq_akt_banding($potret($lot(0, ''), 1400, 300), $potret($lot(300, '29 September 2026'), 1400, 300));
ok($st === 'warning', 'A: lot naik 300 tapi Used diam -> warning');
ok(str_contains($w[0] ?? '', 'bertambah 300 MT') && str_contains($w[0], 'hanya naik 0 MT'), 'A: pesan menyebut input vs yang terhitung');
ok(str_contains($r[0] ?? '', 'util 0 → 300 MT'), 'A: ringkasan menyebut perubahan lot');

// B. Sesudah perbaikan: Used ikut naik -> ok + efeknya tertulis.
[$st, , $d] = iq_akt_banding($potret($lot(0, ''), 1400, 300), $potret($lot(300, '29 September 2026'), 1700, 0));
ok($st === 'ok', 'B: Used ikut naik -> ok');
ok(in_array('Used 1.400 → 1.700 MT', $d, true), 'B: dampak "Used 1.400 → 1.700 MT"');

// C. Lot bertanggal sebelum utilisasi master terakhir -> sebabnya disebut.
[$st, , , $w] = iq_akt_banding($potret($lot(0, ''), 1400, 300), $potret($lot(100, '01/06/2026'), 1400, 300));
ok($st === 'warning' && str_contains($w[0], 'tidak lebih baru dari utilisasi master terakhir'), 'C: sebab "dianggap rincian master"');

// D. Lot tanpa tanggal -> sebabnya disebut.
[, , , $w] = iq_akt_banding($potret($lot(0, ''), 1400, 300), $potret($lot(100, ''), 1400, 300));
ok(str_contains($w[0] ?? '', 'belum diberi tanggal'), 'D: sebab "belum diberi tanggal"');

// E. Realisasi dobel: baris bertambah, yang terhitung tidak.
$a = $potret([], 0, 0, ['realBaris' => 10, 'realMentah' => 500.0, 'realTerhitung' => 500.0]);
$b = $potret([], 0, 0, ['realBaris' => 12, 'realMentah' => 620.0, 'realTerhitung' => 500.0]);
[$st, , , $w] = iq_akt_banding($a, $b);
ok($st === 'warning' && str_contains($w[0], 'dobel'), 'E: realisasi dobel -> warning');

// F. Simpan tanpa perubahan apa pun.
[$st] = iq_akt_banding($potret($lot(300, 'x'), 1700, 0), $potret($lot(300, 'x'), 1700, 0));
ok($st === 'nochange', 'F: tanpa perubahan -> nochange');

// G. Pemetaan rute.
ok(iq_akt_rute('PATCH', ['company', 'EMS'], []) === ['Simpan data company', 'EMS'], 'G: PATCH company/EMS');
ok(iq_akt_rute('PUT', ['company', 'KJK', 'cycle-utilization'], [])[0] === 'Simpan utilisasi per siklus', 'G: PUT cycle-utilization');
ok(iq_akt_rute('POST', ['realizations'], ['companyCode' => 'LCP']) === ['Import realisasi', 'LCP'], 'G: POST realizations');
ok(iq_akt_rute('DELETE', ['realizations', '12'], [], fn($id) => $id === 12 ? 'BTS' : '') === ['Hapus baris realisasi', 'BTS'], 'G: DELETE realizations/:id -> kode dari baris');
ok(iq_akt_rute('GET', ['data'], []) === null, 'G: GET tidak dicatat');

echo empty($GLOBALS['fail']) ? "ALL PASS\n" : "FAILURES\n";
exit(empty($GLOBALS['fail']) ? 0 : 1);
