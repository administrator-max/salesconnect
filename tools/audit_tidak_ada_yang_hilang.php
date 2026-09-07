<?php
/**
 * AUDIT "TIDAK ADA YANG HILANG" — dari MASTER ke PAYLOAD.
 *
 * Diminta pemilik data 07-Sep-2026: "jangan sampai ada yang hilang atau
 * terlewat (seperti PT tidak muncul, atau apapun)".
 *
 * Alat ini sengaja memeriksa dari ARAH SEBALIKNYA dari yang biasa. Pemeriksaan
 * di peramban bertanya "apa yang tampil sudah benar?" — pertanyaan itu tidak
 * pernah bisa menemukan baris yang HILANG, karena yang hilang memang tidak ada
 * di layar untuk diperiksa. Jadi di sini pangkalnya adalah baris mentah di
 * spreadsheet: setiap company, siklus, produk siklus, utilisasi, dan realisasi
 * harus bisa ditemukan kembali di payload yang dikirim ke dashboard.
 *
 * Yang TIDAK diperiksa di sini: apakah angkanya benar. Itu tugas 34 berkas uji
 * .cjs dan pemeriksaan peramban. Di sini pertanyaannya cuma satu — adakah yang
 * jatuh di tengah jalan.
 *
 * Jalankan: php tools/audit_tidak_ada_yang_hilang.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$aliasMap = iq_alias_map($gs, $sid);
$temuan = [];
$ok     = [];
$lapor  = function (bool $lulus, string $pesan, string $rinci = '') use (&$temuan, &$ok) {
    if ($lulus) $ok[] = $pesan;
    else        $temuan[] = $pesan . ($rinci !== '' ? "\n        " . $rinci : '');
};

$t  = iq_load_tables($gs, $sid);
$pl = iq_build_payload($t);
$semua = array_merge($pl['spi'] ?? [], $pl['pending'] ?? []);

$kodePayload = [];
foreach ($semua as $c) $kodePayload[(string) ($c['code'] ?? '')] = $c;

echo "\n╔══ AUDIT: adakah yang hilang antara MASTER dan DASHBOARD ══╗\n";

/* ── 1 · Setiap company di master harus ada di payload ──────────────────── */
$rowsCo = $gs->table($sid, 'companies')['rows'];
$hilang = [];
foreach ($rowsCo as $r) {
    $k = (string) ($r['code'] ?? '');
    if ($k !== '' && !isset($kodePayload[$k])) $hilang[] = $k;
}
$lapor(!$hilang, sprintf('%d company di master, semuanya ada di payload', count($rowsCo)),
       'hilang: ' . implode(', ', $hilang));

/* ── 2 · Setiap siklus di master harus ada di payload company-nya ───────── */
$rowsCy = $gs->table($sid, 'cycles')['rows'];
$perCoCy = [];
foreach ($rowsCy as $r) {
    $k = (string) ($r['company_code'] ?? '');
    if ($k === '') continue;
    $perCoCy[$k][] = strtolower(trim((string) ($r['cycle_type'] ?? '')));
}
$kurang = [];
foreach ($perCoCy as $k => $tipe) {
    $ada = [];
    foreach (($kodePayload[$k]['cycles'] ?? []) as $cy) $ada[] = strtolower(trim((string) ($cy['type'] ?? '')));
    foreach (array_count_values($tipe) as $nama => $n) {
        $adaN = count(array_filter($ada, fn($x) => $x === $nama));
        if ($adaN < $n) $kurang[] = "$k · $nama (master $n, payload $adaN)";
    }
}
$lapor(!$kurang, sprintf('%d siklus di master, semuanya sampai ke payload', count($rowsCy)),
       implode('; ', array_slice($kurang, 0, 8)));

/* ── 3 · Setiap cycle_products harus menempel pada siklus yang ada ──────── */
$rowsCp = $gs->table($sid, 'cycle_products')['rows'];
$idCy = [];
foreach ($rowsCy as $r) $idCy[(string) ($r['id'] ?? '')] = true;
$yatim = [];
foreach ($rowsCp as $r) {
    $cid = (string) ($r['cycle_id'] ?? '');
    if ($cid !== '' && !isset($idCy[$cid])) $yatim[] = 'cycle_id=' . $cid . ' (' . ($r['product'] ?? '?') . ')';
}
$lapor(!$yatim, sprintf('%d baris cycle_products, semuanya menempel pada siklus yang ada', count($rowsCp)),
       implode('; ', array_slice($yatim, 0, 8)));

/* ── 4 · Setiap utilisasi harus menempel pada company yang ada ──────────── */
$rowsUt = $gs->table($sid, 'cycle_utilization')['rows'];
$yatimU = []; $totUtilMaster = 0;
foreach ($rowsUt as $r) {
    $k = (string) ($r['company_code'] ?? '');
    $totUtilMaster += iq_num($r['util_mt'] ?? 0);
    if ($k !== '' && !isset($kodePayload[$k])) $yatimU[] = $k;
}
$lapor(!$yatimU, sprintf('%d baris utilisasi (%s MT), company-nya semua dikenal',
       count($rowsUt), number_format($totUtilMaster, 0)), implode(', ', array_unique($yatimU)));

/* ── 5 · Setiap realisasi harus menempel pada company yang ada ──────────── */
$rowsRe = $gs->table($sid, 'realizations')['rows'];
$yatimR = []; $totVol = 0; $tanpaKode = 0;
foreach ($rowsRe as $r) {
    $k = strtoupper(trim((string) ($r['company_code'] ?? '')));
    $totVol += (float) str_replace(',', '', (string) ($r['volume'] ?? 0));
    if ($k === '') { $tanpaKode++; continue; }
    if (!isset($kodePayload[$k])) $yatimR[] = $k;
}
$lapor(!$yatimR && !$tanpaKode,
       sprintf('%d baris realisasi (%s MT), company-nya semua dikenal', count($rowsRe), number_format($totVol, 3)),
       ($tanpaKode ? "$tanpaKode baris tanpa company_code; " : '') . 'tak dikenal: ' . implode(', ', array_unique($yatimR)));

/* ── 6 · Setiap company_product_stats harus punya company ───────────────── */
$rowsSt = $gs->table($sid, 'company_product_stats')['rows'];
$yatimS = [];
foreach ($rowsSt as $r) {
    $k = (string) ($r['company_code'] ?? '');
    if ($k !== '' && !isset($kodePayload[$k])) $yatimS[] = $k;
}
$lapor(!$yatimS, sprintf('%d baris company_product_stats, company-nya semua dikenal', count($rowsSt)),
       implode(', ', array_unique($yatimS)));

/* ── 7 · Setiap produk yang dipakai harus dikenal tabel products ────────── */
$namaProduk = [];
foreach ($gs->table($sid, 'products')['rows'] as $r) {
    foreach (['product', 'name', 'label'] as $k) if (!empty($r[$k])) $namaProduk[iq_canon_product((string) $r[$k], $aliasMap)] = true;
}
$tdkDikenal = [];
foreach ($rowsCp as $r) {
    $p = iq_canon_product((string) ($r['product'] ?? ''), $aliasMap);
    if ($p !== '' && !isset($namaProduk[$p])) $tdkDikenal[$p] = true;
}
$lapor(!$tdkDikenal, sprintf('%d produk terdaftar; semua produk di siklus dikenal', count($namaProduk)),
       implode(', ', array_keys($tdkDikenal)));

/* ── 8 · Company yang punya kuota harus punya rincian per produk ────────── */
$tanpaRincian = [];
foreach ($semua as $c) {
    $obt = iq_num($c['obtained'] ?? 0);
    if ($obt <= 0) continue;
    $u = $c['utilizationByProd'] ?? [];
    $a = $c['availableByProd'] ?? [];
    if (!count((array) $u) && !count((array) $a)) $tanpaRincian[] = $c['code'] . ' (' . $obt . ' MT)';
}
$lapor(!$tanpaRincian, 'setiap company ber-kuota punya rincian per produk',
       implode(', ', $tanpaRincian));

/* ── 9 · Tidak ada company kembar ───────────────────────────────────────── */
$hitung = [];
foreach ($semua as $c) $hitung[(string) ($c['code'] ?? '')] = (($hitung[(string) ($c['code'] ?? '')] ?? 0) + 1);
$kembar = array_keys(array_filter($hitung, fn($n) => $n > 1));
$lapor(!$kembar, sprintf('%d company di payload, tidak ada yang kembar', count($semua)),
       implode(', ', $kembar));

/* ── 10 · Tidak ada siklus kembar dalam satu company ────────────────────── */
$siklusKembar = [];
foreach ($semua as $c) {
    $t2 = [];
    foreach (($c['cycles'] ?? []) as $cy) $t2[] = strtolower(trim((string) ($cy['type'] ?? '')));
    foreach (array_count_values($t2) as $nama => $n)
        if ($n > 1) $siklusKembar[] = $c['code'] . ' · ' . $nama . ' ×' . $n;
}
$lapor(!$siklusKembar, 'tidak ada siklus kembar di dalam satu company',
       implode('; ', array_slice($siklusKembar, 0, 8)));

/* ── Hasil ──────────────────────────────────────────────────────────────── */
echo "\n";
foreach ($ok as $m) echo "  ok    $m\n";
if ($temuan) { echo "\n"; foreach ($temuan as $m) echo "  TEMUAN  $m\n"; }
printf("\n%d lolos · %d temuan\n\n", count($ok), count($temuan));
exit($temuan ? 1 : 0);
