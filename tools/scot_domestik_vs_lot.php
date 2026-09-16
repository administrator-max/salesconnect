<?php
/**
 * SCOT Domestic vs IQ Dash — dua pertanyaan yang benar-benar bisa dijawab:
 *
 *  1. Nama dagang yang MUNGKIN produk kuota dengan nama lain (Wear Plate,
 *     Galvalume, Pipe, Hollow). Dicetak apa adanya beserta produk kuota yang
 *     dipegang company itu di IQ Dash, supaya pemilik data yang memutuskan —
 *     tidak ditebak di sini.
 *  2. Adakah pengiriman DOMESTIK yang ikut tercatat sebagai lot utilisasi
 *     kuota impor di IQ Dash? Dicocokkan per company dengan MT yang sama.
 *
 * HANYA MEMBACA.  Jalankan: php tools/scot_domestik_vs_lot.php
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$cfg = sc_config();
$gs  = new GoogleSheets();
$scot = $gs->table($cfg['spreadsheets']['scot'], 'shipments', false)['rows'] ?? [];
$t    = iq_load_tables($gs, $cfg['spreadsheets']['iqdash']);
$pay  = iq_build_payload($t);
$semua = array_merge($pay['spi'] ?? [], $pay['pending'] ?? []);

$norm = fn($s) => trim(preg_replace('/\s+/', ' ', preg_replace('/^(pt\.?|cv\.?)\s+/i', '', strtoupper(trim((string) $s)))));
$namaKeKode = [];
foreach ($semua as $co) if (!empty($co['fullName'])) $namaKeKode[$norm($co['fullName'])] = $co['code'];
foreach ($t['directory'] ?? [] as $d) {
    $k = trim((string) ($d['abbreviation'] ?? '')); $n = $d['full_name'] ?? $d['fullName'] ?? '';
    if ($k !== '' && $n !== '') $namaKeKode[$norm($n)] = $k;
}
$cariKode = function ($c) use ($namaKeKode, $norm) {
    $n = $norm($c); if ($n === '') return null;
    if (isset($namaKeKode[$n])) return $namaKeKode[$n];
    foreach ($namaKeKode as $nama => $kode)
        if (strlen($n) >= 8 && (strpos($nama, $n) === 0 || strpos($n, $nama) === 0)) return $kode;
    return null;
};
$produkCo = [];
foreach ($semua as $co) {
    $ps = array_keys(($co['utilizationByProd'] ?? []) + ($co['availableByProd'] ?? []));
    $produkCo[$co['code']] = array_values(array_unique(array_map('strtoupper', $ps)));
}

/* ── 1. Nama dagang yang ambigu ────────────────────────────────────────── */
echo "\n== 1. NAMA DAGANG YANG MUNGKIN PRODUK KUOTA ==\n";
$ambigu = '/WEAR|GALVAL|PIPE|HOLLOW|BORDES|SHEET ?PILE|HRPO|PPGL|ALLOY/i';
$adaAmbigu = false;
foreach ($scot as $r) {
    if (($r['cargo_type'] ?? '') !== 'Domestic') continue;
    $p = (string) ($r['product'] ?? '');
    if (!preg_match($ambigu, $p)) continue;
    $adaAmbigu = true;
    $kode = $cariKode($r['consignee'] ?? '');
    printf("  %-5s %-12s %9s MT  %-10s %-8s proyek: %s\n      produk kuota %s di IQ Dash: %s\n",
        $kode ?: '?', mb_substr($p, 0, 12), $r['quantity_mt'] ?: '—', $r['start_delivery'] ?: '—',
        $r['status'] ?: '—', mb_substr((string) ($r['project_name'] ?? ''), 0, 44),
        $kode ?: '?', $kode ? implode(', ', $produkCo[$kode] ?? ['(tak ada)']) : '—');
}
if (!$adaAmbigu) echo "  (tidak ada)\n";

/* ── 2. Pengiriman domestik yang tercatat sebagai lot utilisasi ─────────── */
echo "\n== 2. LOT UTILISASI IQ DASH YANG MT-NYA SAMA DENGAN PENGIRIMAN DOMESTIK ==\n";
$lot = [];
foreach ($t['lots'] ?? [] as $l) {
    $mt = (float) str_replace(',', '', (string) ($l['util_mt'] ?? 0));
    if ($mt > 0) $lot[] = ['co' => $l['company_code'] ?? '', 'mt' => $mt, 'p' => $l['product'] ?? '',
                           'tgl' => $l['util_date'] ?? '', 'lot' => $l['lot_no'] ?? ''];
}
foreach ($t['cycleUtil'] ?? [] as $u) {
    $mt = (float) str_replace(',', '', (string) ($u['util_mt'] ?? 0));
    if ($mt > 0) $lot[] = ['co' => $u['company_code'] ?? '', 'mt' => $mt, 'p' => $u['product'] ?? '',
                           'tgl' => $u['util_date'] ?? '', 'lot' => $u['cycle_type'] ?? ''];
}
$cocok = 0;
foreach ($scot as $r) {
    if (($r['cargo_type'] ?? '') !== 'Domestic') continue;
    $kode = $cariKode($r['consignee'] ?? '');
    $mt   = (float) str_replace(',', '', (string) ($r['quantity_mt'] ?? 0));
    if (!$kode || $mt <= 0) continue;
    foreach ($lot as $l) {
        if ($l['co'] !== $kode || abs($l['mt'] - $mt) > 0.01) continue;
        $cocok++;
        printf("  %-5s SCOT %-10s %9.3f MT %s  <->  IQ %-12s %9.3f MT %s (%s)\n",
            $kode, mb_substr((string) $r['product'], 0, 10), $mt, $r['start_delivery'] ?? '',
            mb_substr($l['p'], 0, 12), $l['mt'], $l['tgl'], $l['lot']);
    }
}
echo $cocok ? "  -> $cocok pasangan, periksa satu per satu\n" : "  (tidak ada — tidak satu pun pengiriman domestik ikut terhitung sebagai kuota)\n";

/* ── 3. Ringkasan per company ─────────────────────────────────────────── */
echo "\n== 3. DOMESTIK PER COMPANY (semua produk) ==\n";
$per = [];
foreach ($scot as $r) {
    if (($r['cargo_type'] ?? '') !== 'Domestic') continue;
    $kode = $cariKode($r['consignee'] ?? '') ?: '?';
    $mt = (float) str_replace(',', '', (string) ($r['quantity_mt'] ?? 0));
    $per[$kode]['mt'] = ($per[$kode]['mt'] ?? 0) + $mt;
    $per[$kode]['n']  = ($per[$kode]['n'] ?? 0) + 1;
    $per[$kode]['kosong'] = ($per[$kode]['kosong'] ?? 0) + ($mt > 0 ? 0 : 1);
    $per[$kode]['thn'][(string) ($r['year'] ?? '?')] = true;
}
ksort($per);
$tot = 0;
foreach ($per as $k => $v) {
    $tot += $v['mt'];
    printf("  %-5s %4d baris  %11.3f MT  tahun %-10s %s\n", $k, $v['n'], $v['mt'],
        implode('/', array_keys($v['thn'])), $v['kosong'] ? "({$v['kosong']} baris tanpa MT)" : '');
}
printf("  TOTAL %11.3f MT\n", $tot);
