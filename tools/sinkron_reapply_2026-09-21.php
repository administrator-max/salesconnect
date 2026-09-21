<?php
/**
 * Sinkronisasi Re-Apply 9 company — permintaan tim 21-Sep-2026.
 *
 * DUDUK PERKARANYA
 * ----------------
 * Re-Apply selama ini dikonfirmasi CorpSec sebagai siklus "Revision Request —
 * X" + placeholder "Obtained #N", TANPA siklus Submit baru. Tiga akibatnya:
 *
 *  1. Drill Overview "Total Submitted" hanya membaca siklus Submit, jadi
 *     re-apply yang sedang proses tidak tampil (KARA 6.000 ≠ 9.000, dst.).
 *  2. Form status CorpSec menganggap Submit re-apply SEBELUMNYA sebagai yang
 *     aktif lalu menimpa Obtained-nya dengan MT permintaan:
 *        LCP  Obtained #2  200 → 3.000      (ledger/stats: 475 = 275 + 200)
 *        EMS  Obtained #2  GI ALLOY 500 → GL ALLOY 3.000 (stats: GI 500)
 *        BBB  Obtained #2  300 → 3.000      (tim: total obtained 700)
 *        SJH  Obtained #2   90 → 3.000      (tools/sjh_catat_reapply1.php)
 *     dan menulis "Update dd/mm/yy - Submit" di atas status Submit #2 yang
 *     sudah selesai. SJH Submit #2 juga kehilangan PERTEK 15/05/2026.
 *  3. Placeholder Obtained menumpuk (PPGL #2, #3, #4 — tiap 3.000 MT) dan
 *     re-apply EMS/GAS menumpang di produk GI ALLOY yang tidak diminta.
 *
 * YANG DITULIS, per company
 *   · siklus "Revision Request — X" milik re-apply ini DIHAPUS, diganti
 *     siklus Submit #N baru (tanggal submit dari tim, status "Menunggu PERTEK
 *     Perubahan [#k] Terbit") — re-apply = siklus submission baru;
 *   · placeholder Obtained tanpa tanggal milik re-apply ini DIHAPUS;
 *   · Obtained yang tertimpa DIKEMBALIKAN ke angka yang benar (di atas);
 *   · status Submit lama yang tertimpa dipulihkan dari tanggalnya sendiri;
 *   · permintaan Re-Apply dipindah dari rev_note[produk] ke
 *     rev_note._reapplyRequests (model baru, lihat 13-rev-mgmt.js), tertaut
 *     ke siklus Submit #N-nya lewat `cycleType`;
 *   · kolom company: rev_type/rev_status/rev_submit_date/status_update/
 *     submit1/obtained.
 * Utilisasi (cycle_utilization, lot, stats) TIDAK disentuh.
 *
 * PAGAR
 *   - hanya 9 company ini; siklus company lain tidak berubah satu baris pun;
 *   - siklus yang dihapus harus persis yang disebut (tipe + tanggal) dan,
 *     untuk placeholder, memang belum bertanggal terbit;
 *   - tidak boleh ada tipe siklus kembar sesudahnya;
 *   - backup penuh cycles + cycle_products + companies sebelum menulis;
 *   - sesudah menulis: baca ulang dan bandingkan dengan rencana.
 *
 * Dry-run:   php tools/sinkron_reapply_2026-09-21.php
 * Terapkan:  php tools/sinkron_reapply_2026-09-21.php --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$APPLY = in_array('--apply', $argv, true);
$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

const TGL_MIGRASI = '21-Sep-26';

/* Siklus Submit re-apply baru. */
function submit_baru(int $n, float $mt, string $produk, string $tgl): array {
    $k = $n - 1;
    $tunggu = 'Menunggu PERTEK Perubahan' . ($k > 1 ? " #$k" : '') . ' Terbit';
    return [
        'type' => "Submit #$n", 'mt' => $mt, 'products' => [$produk => $mt],
        'submitType' => "Submit MOI Perubahan (Re-Apply #$k)", 'submitDate' => $tgl,
        'releaseType' => 'PERTEK Perubahan' . ($k > 1 ? " #$k" : ''), 'releaseDate' => '',
        'pertekDate' => '', 'spiDate' => '',
        'status' => "$tunggu · Re-Apply #$k",
        '_fromRevReq' => false, 'quotaYear' => 2026,
    ];
}
function status_update(int $n, string $tgl): string {
    $k = $n - 1;
    return "Submit MOI Perubahan (Re-Apply #$k) at $tgl — Menunggu PERTEK Perubahan" . ($k > 1 ? " #$k" : '') . ' Terbit';
}
/* Permintaan Re-Apply model baru, sudah dikonfirmasi & tertaut ke siklusnya. */
function req_baru(string $code, int $n, float $mt, string $produk, string $tglSubmit, ?string $konf, string $asal): array {
    return [
        'id' => "RA-$code-$n",
        'products' => [['product' => $produk, 'mt' => $mt]],
        'confirmedTargets' => [['product' => $produk, 'mt' => $mt, 'status' => 'confirmed']],
        'status' => 'confirmed', 'note' => '',
        /* Tanggal paling awal yang diketahui — Sales pasti meminta sebelum CorpSec submit. */
        'requestedBy' => 'Sales', 'requestedDate' => $tglSubmit,
        'confirmedBy' => 'CorpSec', 'confirmedDate' => $konf ?: TGL_MIGRASI,
        'submitDate' => $tglSubmit, 'cycleType' => "Submit #$n",
        '_migrasi' => 'dipindah ' . TGL_MIGRASI . " dari rev_note[\"$asal\"]",
    ];
}

/* ── RENCANA ────────────────────────────────────────────────────────────────
   drop:   [tipe, submit_date] siklus yang dihapus ('' = tanggal apa pun, hanya
           untuk placeholder yang dipagari belum-terbit)
   set:    tipe => field yang diubah
   add:    siklus baru
   envDel: kunci rev_note yang dipindah ke _reapplyRequests
   envSet: kunci rev_note => field yang diubah (penanda tipe riwayat)
   req:    permintaan model baru
   co:     kolom company */
$P = [
  'AADC' => [
    'drop' => [['Revision Request — GL ALLOY', '21-Sep-26'], ['Obtained #2', '']],
    'add'  => [submit_baru(2, 2850, 'GL ALLOY', '14/09/2026')],
    'envDel' => ['GL ALLOY'],
    'req'  => [req_baru('AADC', 2, 2850, 'GL ALLOY', '14/09/2026', '21-Sep-26', 'GL ALLOY')],
    'co'   => ['submit1' => 5850, 'obtained' => 150, 'rev_submit_date' => '14/09/2026'],
    'n'    => 2, 'tgl' => '14/09/2026',
  ],
  'BBB' => [
    'drop' => [['Revision Request — GL ALLOY', '10-Sep-26'], ['Obtained #3', '']],
    'set'  => [
      'Submit #2'   => ['status' => 'SPI Perubahan Terbit 26/06/2026 · Re-Apply #1'],
      'Obtained #2' => ['mt' => 300, 'products' => ['GL ALLOY' => 300], 'releaseDate' => '26/06/2026',
                        'spiDate' => '26/06/2026', '_fromRevReq' => false],
    ],
    'add'  => [submit_baru(3, 3000, 'GL ALLOY', '09/09/2026')],
    'envDel' => ['GL ALLOY'],
    'envSet' => ['GL BORON' => ['revisionType' => 'Re-Apply']],
    'req'  => [req_baru('BBB', 3, 3000, 'GL ALLOY', '09/09/2026', '09-Sep-26', 'GL ALLOY')],
    'co'   => ['submit1' => 11300, 'obtained' => 700, 'rev_submit_date' => '09/09/2026'],
    'n'    => 3, 'tgl' => '09/09/2026',
  ],
  'EMS' => [
    'drop' => [['Revision Request — GI ALLOY', '21-Sep-26']],
    'set'  => [
      'Submit #2'   => ['status' => 'PERTEK Perubahan TERBIT 11/05/2026 · SPI Perubahan TERBIT 18/05/2026 · Re-Apply #1'],
      'Obtained #2' => ['mt' => 500, 'products' => ['GI ALLOY' => 500]],
    ],
    'add'  => [submit_baru(3, 3000, 'GL ALLOY', '24/08/2026')],
    'envDel' => ['GI ALLOY'],
    'req'  => [req_baru('EMS', 3, 3000, 'GL ALLOY', '24/08/2026', '21-Sep-26', 'GI ALLOY')],
    'co'   => ['submit1' => 14000, 'obtained' => 2100, 'rev_submit_date' => '24/08/2026'],
    'n'    => 3, 'tgl' => '24/08/2026',
  ],
  'GAS' => [
    'drop' => [['Revision Request — GI ALLOY', '15-Sep-26']],
    'set'  => [
      'Revision #1'            => ['status' => 'PERTEK Perubahan (Revision #1) TERBIT 14/04/2026'],
      /* GL ALLOY 3.000 di siklus ini tertulis 15-Sep dari permintaan re-apply
         (bertanggal SPI 18/05/2026 — mustahil). Stats & utilisasi: GI 200. */
      'Obtained (Revision #1)' => ['mt' => 200, 'products' => ['GI ALLOY' => 200]],
    ],
    'add'  => [submit_baru(3, 3000, 'GL ALLOY', '14/09/2026')],
    'envDel' => ['GI ALLOY'],
    'req'  => [req_baru('GAS', 3, 3000, 'GL ALLOY', '14/09/2026', '15-Sep-26', 'GI ALLOY')],
    'co'   => ['obtained' => 200, 'rev_submit_date' => '14/09/2026'],
    'n'    => 3, 'tgl' => '14/09/2026',
  ],
  'PPGL' => [
    'drop' => [['Revision Request — GL ALLOY', '15-Sep-26'], ['Obtained #2', ''], ['Obtained #3', ''], ['Obtained #4', '']],
    'add'  => [submit_baru(2, 3000, 'GL ALLOY', '14/09/2026')],
    'envDel' => ['GL ALLOY'],
    'req'  => [req_baru('PPGL', 2, 3000, 'GL ALLOY', '14/09/2026', '15-Sep-26', 'GL ALLOY')],
    'co'   => ['submit1' => 6000, 'obtained' => 50, 'rev_submit_date' => '14/09/2026'],
    'n'    => 2, 'tgl' => '14/09/2026',
  ],
  'KARA' => [
    'drop' => [['Revision Request — GL ALLOY', '17-Sep-26'], ['Obtained #2', '']],
    'add'  => [submit_baru(2, 3000, 'GL ALLOY', '17/09/2026')],
    'envDel' => ['GL ALLOY'],
    'req'  => [req_baru('KARA', 2, 3000, 'GL ALLOY', '17/09/2026', '17-Sep-26', 'GL ALLOY')],
    'co'   => ['submit1' => 9000, 'obtained' => 100, 'rev_submit_date' => '17/09/2026'],
    'n'    => 2, 'tgl' => '17/09/2026',
  ],
  'KJK' => [
    'drop' => [['Revision Request — GL ALLOY', '10-Sep-26']],
    'set'  => ['Submit #2' => ['status' => 'PERTEK Perubahan TERBIT 03/06/2026 · SPI Perubahan TERBIT 04/06/2026 · Re-Apply #1']],
    'add'  => [submit_baru(3, 3000, 'GL ALLOY', '31/08/2026')],
    'envDel' => ['GL ALLOY'],
    'envSet' => ['GL BORON' => ['revisionType' => 'Re-Apply']],
    'req'  => [req_baru('KJK', 3, 3000, 'GL ALLOY', '31/08/2026', '01-Sep-26', 'GL ALLOY')],
    'co'   => ['submit1' => 12000, 'obtained' => 1400, 'rev_submit_date' => '31/08/2026'],
    'n'    => 3, 'tgl' => '31/08/2026',
  ],
  'LCP' => [
    'drop' => [['Revision Request — GL ALLOY', '15-Sep-26']],
    'set'  => [
      'Submit #2'   => ['status' => 'PERTEK Perubahan TERBIT 18/06/2026 · SPI Perubahan TERBIT 16/07/2026 · Re-Apply #1'],
      'Obtained #2' => ['mt' => 200, 'products' => ['GL ALLOY' => 200]],
    ],
    'add'  => [submit_baru(3, 3000, 'GL ALLOY', '10/09/2026')],
    'envDel' => ['GL ALLOY'],
    'req'  => [req_baru('LCP', 3, 3000, 'GL ALLOY', '10/09/2026', '15-Sep-26', 'GL ALLOY')],
    'co'   => ['submit1' => 11725, 'obtained' => 475, 'rev_submit_date' => '10/09/2026'],
    'n'    => 3, 'tgl' => '10/09/2026',
  ],
  'SJH' => [
    'drop' => [['Revision Request — GL ALLOY', '21-Sep-26']],
    'set'  => [
      'Submit #2'   => ['releaseDate' => '15/05/2026', 'pertekDate' => '15/05/2026',
                        'status' => 'PERTEK Perubahan TERBIT 15/05/2026 · Re-Apply #1'],
      'Obtained #2' => ['mt' => 90, 'products' => ['GL ALLOY' => 90], '_fromRevReq' => false],
    ],
    'add'  => [submit_baru(3, 3000, 'GL ALLOY', '31/08/2026')],
    'envDel' => ['GL ALLOY'],
    /* Re-Apply #1 = 2.700 (Submit #2). Konfirmasi 21-Sep menimpanya jadi 3.000. */
    'envSet' => ['GL BORON' => ['revisionType' => 'Re-Apply', 'confirmedMT' => 2700,
                   'confirmedTargets' => [['product' => 'GL BORON', 'mt' => 2700, 'status' => 'confirmed']]]],
    'req'  => [req_baru('SJH', 3, 3000, 'GL ALLOY', '31/08/2026', '21-Sep-26', 'GL ALLOY')],
    'co'   => ['submit1' => 11700, 'obtained' => 390, 'rev_submit_date' => '31/08/2026'],
    'n'    => 3, 'tgl' => '31/08/2026',
  ],
];

/* ── BACA ──────────────────────────────────────────────────────────────── */
$cyTbl = $gs->table($sid, 'cycles');
$cpTbl = $gs->table($sid, 'cycle_products');
$coTbl = $gs->table($sid, 'companies');

$prodOf = [];
foreach ($cpTbl['rows'] as $r) $prodOf[(string) $r['cycle_id']][] = $r;

/* Baris mentah → objek camelCase yang dimengerti iq_build_cycles_replacement(). */
$keCamel = function (array $r) use ($prodOf): array {
    $p = [];
    foreach ($prodOf[(string) $r['id']] ?? [] as $x) {
        $v = $x['mt'];
        $p[$x['product']] = ($v === '' || $v === null) ? null : (is_numeric($v) ? $v + 0 : $v);
    }
    $mt = $r['mt'];
    return [
        'type' => $r['cycle_type'], 'mt' => ($mt === '' || $mt === null) ? null : (is_numeric($mt) ? $mt + 0 : $mt),
        'submitType' => $r['submit_type'], 'submitDate' => $r['submit_date'],
        'releaseType' => $r['release_type'], 'releaseDate' => $r['release_date'],
        'status' => $r['status'], 'products' => $p,
        'pertekDate' => $r['pertek_date'], 'spiDate' => $r['spi_date'],
        '_fromRevReq' => in_array(strtoupper((string) $r['from_rev_req']), ['TRUE', '1'], true),
        'quotaYear' => ($r['quota_year'] ?? '') === '' ? null : (int) $r['quota_year'],
    ];
};
$bertanggal = fn($v) => ($s = trim((string) $v)) !== '' && !preg_match('/^tba$/i', $s);

$rencana = [];
$gagal = [];
foreach ($P as $code => $p) {
    $rows = array_values(array_filter($cyTbl['rows'], fn($r) => $r['company_code'] === $code));
    usort($rows, fn($a, $b) => (int) $a['sort_order'] <=> (int) $b['sort_order']);
    $cycles = array_map($keCamel, $rows);

    // drop
    foreach ($p['drop'] as [$tipe, $tgl]) {
        $cocok = array_keys(array_filter($cycles, fn($c) =>
            $c['type'] === $tipe && ($tgl === '' || trim((string) $c['submitDate']) === $tgl)));
        if (count($cocok) !== 1) { $gagal[] = "$code: '$tipe' ($tgl) cocok " . count($cocok) . ' baris, harus 1'; continue; }
        $c = $cycles[$cocok[0]];
        if ($tgl === '' && ($bertanggal($c['releaseDate']) || $bertanggal($c['spiDate']) || $bertanggal($c['pertekDate']) || !$c['_fromRevReq'])) {
            $gagal[] = "$code: '$tipe' bukan placeholder belum-terbit — tidak dihapus"; continue;
        }
        unset($cycles[$cocok[0]]);
        $cycles = array_values($cycles);
    }
    // set
    foreach ($p['set'] ?? [] as $tipe => $f) {
        $i = array_keys(array_filter($cycles, fn($c) => $c['type'] === $tipe));
        if (count($i) !== 1) { $gagal[] = "$code: set '$tipe' cocok " . count($i) . ' baris'; continue; }
        $cycles[$i[0]] = array_merge($cycles[$i[0]], $f);
    }
    // add
    foreach ($p['add'] as $c) {
        if (array_filter($cycles, fn($x) => strcasecmp($x['type'], $c['type']) === 0)) {
            $gagal[] = "$code: {$c['type']} sudah ada — tidak ditambah dua kali"; continue;
        }
        $cycles[] = $c;
    }
    // tidak boleh kembar
    $tipe = array_map(fn($c) => strtolower(trim($c['type'])), $cycles);
    if (count($tipe) !== count(array_unique($tipe))) $gagal[] = "$code: ada tipe siklus kembar";

    // company + amplop rev_note
    $coRow = null;
    foreach ($coTbl['rows'] as $r) if ($r['code'] === $code) { $coRow = $r; break; }
    if (!$coRow) { $gagal[] = "$code: baris company tidak ada"; continue; }
    $env = json_decode((string) $coRow['rev_note'], true);
    if (!is_array($env)) { $gagal[] = "$code: rev_note bukan JSON"; continue; }
    foreach ($p['envDel'] as $k) {
        if (!array_key_exists($k, $env)) { $gagal[] = "$code: rev_note[$k] tidak ada"; continue; }
        unset($env[$k]);
    }
    foreach ($p['envSet'] ?? [] as $k => $f) {
        if (!isset($env[$k]) || !is_array($env[$k])) { $gagal[] = "$code: rev_note[$k] tidak ada"; continue; }
        $env[$k] = array_merge($env[$k], $f);
    }
    $ada = (isset($env['_reapplyRequests']) && is_array($env['_reapplyRequests'])) ? $env['_reapplyRequests'] : [];
    foreach ($p['req'] as $rq) {
        if (array_filter($ada, fn($x) => ($x['id'] ?? '') === $rq['id'])) continue;   // idempoten
        $ada[] = $rq;
    }
    $env['_reapplyRequests'] = $ada;
    $env['_revisionType'] = 'Re-Apply';

    $body = array_merge([
        'revType' => 'active', 'revStatus' => 'Submit',
        'statusUpdate' => status_update($p['n'], $p['tgl']),
        'revNote' => json_encode($env, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES),
        'updatedBy' => 'CorpSec (sinkron 21-Sep-26)', 'updatedDate' => TGL_MIGRASI,
    ], array_combine(
        array_map(fn($k) => preg_replace_callback('/_([a-z])/', fn($m) => strtoupper($m[1]), $k), array_keys($p['co'])),
        array_values($p['co'])
    ));
    $rencana[$code] = ['cycles' => $cycles, 'body' => $body, 'before' => $rows, 'coBefore' => $coRow];
}

/* ── TAMPILKAN ─────────────────────────────────────────────────────────── */
foreach ($rencana as $code => $r) {
    echo "\n===== $code\n";
    foreach ($r['cycles'] as $c) {
        $pr = [];
        foreach ($c['products'] as $k => $v) $pr[] = "$k=$v";
        printf("  %-28s mt=%-6s sub=%-11s rel=%-11s pk=%-11s spi=%-11s frr=%s | %s | %s\n",
            $c['type'], (string) $c['mt'], $c['submitDate'], $c['releaseDate'], $c['pertekDate'], $c['spiDate'],
            $c['_fromRevReq'] ? 'T' : 'F', implode(';', $pr), $c['status']);
    }
    foreach ($r['body'] as $k => $v) if ($k !== 'revNote') echo "  · $k = $v\n";
    echo "  · revNote = " . $r['body']['revNote'] . "\n";
}
if ($gagal) { echo "\nPAGAR GAGAL — tidak ada yang ditulis:\n  - " . implode("\n  - ", $gagal) . "\n"; exit(1); }
/* Rencana untuk disimulasikan di mesin hitung dashboard (Node vm) sebelum ditulis. */
if (getenv('RENCANA_JSON')) {
    file_put_contents(getenv('RENCANA_JSON'), json_encode(array_map(fn($r) => ['cycles' => $r['cycles'], 'body' => $r['body']], $rencana), JSON_UNESCAPED_UNICODE));
}
if (!$APPLY) { echo "\n(dry-run) — jalankan dengan --apply untuk menulis.\n"; exit(0); }

/* ── BACKUP ────────────────────────────────────────────────────────────── */
$bk = __DIR__ . '/../backups/iqdash_sebelum_sinkron_reapply_' . gmdate('Y-m-d_His') . '.json';
file_put_contents($bk, json_encode([
    'cycles' => $cyTbl, 'cycle_products' => $cpTbl, 'companies' => $coTbl,
], JSON_UNESCAPED_UNICODE));
echo "\nbackup: " . realpath($bk) . ' (' . filesize($bk) . " byte)\n";

/* ── TULIS ─────────────────────────────────────────────────────────────── */
foreach ($rencana as $code => $r) {
    $a = iq_replace_cycles($gs, $sid, $code, $r['cycles']);
    $b = iq_patch_company($gs, $sid, $code, $r['body']);
    if (!empty($b['error'])) { echo "$code: patch company GAGAL — " . json_encode($b) . "\n"; exit(2); }
    echo "$code: " . json_encode($a) . " · company ok\n";
}

/* ── BACA ULANG & BANDINGKAN ───────────────────────────────────────────── */
$gs2 = new GoogleSheets();
$cy2 = $gs2->table($sid, 'cycles')['rows'];
$co2 = $gs2->table($sid, 'companies')['rows'];
$salah = [];
foreach ($rencana as $code => $r) {
    $tipe = array_map(fn($x) => $x['cycle_type'], array_values(array_filter($cy2, fn($x) => $x['company_code'] === $code)));
    $harap = array_map(fn($c) => $c['type'], $r['cycles']);
    if ($tipe !== $harap) $salah[] = "$code: siklus " . implode(',', $tipe) . ' ≠ ' . implode(',', $harap);
    foreach ($co2 as $x) if ($x['code'] === $code) {
        if ($x['rev_note'] !== $r['body']['revNote']) $salah[] = "$code: rev_note berbeda";
        if ((string) $x['status_update'] !== $r['body']['statusUpdate']) $salah[] = "$code: status_update berbeda";
        if (($x['full_name'] ?? '') === '' || ($x['section'] ?? '') === '') $salah[] = "$code: kolom lain kosong!";
    }
}
$lain = count(array_filter($cyTbl['rows'], fn($x) => !isset($P[$x['company_code']])));
$lain2 = count(array_filter($cy2, fn($x) => !isset($P[$x['company_code']])));
if ($lain !== $lain2) $salah[] = "siklus company lain berubah: $lain → $lain2";
echo $salah ? "\nVERIFIKASI GAGAL:\n  - " . implode("\n  - ", $salah) . "\n" : "\nverifikasi baca-ulang: cocok ($lain2 siklus company lain utuh)\n";
