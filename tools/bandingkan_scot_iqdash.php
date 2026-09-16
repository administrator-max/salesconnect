<?php
/**
 * Bandingkan SCOT dengan IQ Dash per (company, produk).
 * HANYA MEMBACA.
 *
 * SCOT: shipments, kolom consignee / product / quantity_mt / cargo_type.
 * IQ Dash: company_directory (nama lengkap -> kode), product_aliases,
 *          company_shipments (lot utilisasi Sales), realizations (PIB),
 *          dan payload hasil iq_build_payload() untuk utilisasi final.
 *
 * Jalankan: php tools/bandingkan_scot_iqdash.php [Domestic|Import|semua]
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';

$jenisDiminta = $argv[1] ?? 'Domestic';

$cfg = sc_config();
$gs  = new GoogleSheets();
$scot = $gs->table($cfg['spreadsheets']['scot'], 'shipments', false)['rows'] ?? [];
$t    = iq_load_tables($gs, $cfg['spreadsheets']['iqdash']);
$pay  = iq_build_payload($t);

/* ── Peta nama -> kode company IQ Dash ─────────────────────────────────── */
$norm = fn($s) => trim(preg_replace('/\s+/', ' ', preg_replace('/^(pt\.?|cv\.?)\s+/i', '',
                   strtoupper(trim((string) $s)))));
$namaKeKode = [];
foreach ($t['directory'] ?? [] as $d) {
    $kode = trim((string) ($d['abbreviation'] ?? $d['code'] ?? ''));
    $nama = $d['full_name'] ?? $d['fullName'] ?? $d['name'] ?? '';
    if ($kode !== '' && $nama !== '') $namaKeKode[$norm($nama)] = $kode;
}
$semuaCo = array_merge($pay['spi'] ?? [], $pay['pending'] ?? []);
foreach ($semuaCo as $co) {
    if (!empty($co['fullName'])) $namaKeKode[$norm($co['fullName'])] = $co['code'];
}
/* Cocokkan nama SCOT: persis dulu, lalu awalan (SCOT kadang terpotong,
   mis. "PT Selaras Prima Angkas"). */
$cariKode = function (string $consignee) use ($namaKeKode, $norm) {
    $n = $norm($consignee);
    if ($n === '') return null;
    if (isset($namaKeKode[$n])) return $namaKeKode[$n];
    foreach ($namaKeKode as $nama => $kode) {
        if (strlen($n) >= 8 && (strpos($nama, $n) === 0 || strpos($n, $nama) === 0)) return $kode;
    }
    return null;
};

/* ── Produk kanonik ────────────────────────────────────────────────────── */
$alias = [];
foreach ($t['aliases'] ?? [] as $a) {
    $v = trim((string) ($a['variant'] ?? $a['alias'] ?? ''));
    $c = trim((string) ($a['canonical'] ?? $a['product'] ?? ''));
    if ($v !== '' && $c !== '') $alias[strtoupper($v)] = strtoupper($c);
}
$kanon = function (string $p) use ($alias) {
    $u = strtoupper(trim(preg_replace('/\s+/', ' ', $p)));
    return $alias[$u] ?? $u;
};
$produkIQ = [];
foreach ($semuaCo as $co) {
    foreach (array_keys(($co['utilizationByProd'] ?? []) + ($co['availableByProd'] ?? [])) as $p) {
        $produkIQ[$kanon((string) $p)] = true;
    }
}

/* ── Kumpulkan SCOT ────────────────────────────────────────────────────── */
$scotAgg = [];   // kode|produk -> [mt, n, contoh]
$tanpaKode = []; $bukanProdukKuota = [];
$jumlahJenis = 0;
foreach ($scot as $r) {
    $jenis = trim((string) ($r['cargo_type'] ?? ''));
    if ($jenisDiminta !== 'semua' && strcasecmp($jenis, $jenisDiminta) !== 0) continue;
    $jumlahJenis++;
    $kode = $cariKode((string) ($r['consignee'] ?? ''));
    $prod = $kanon((string) ($r['product'] ?? ''));
    $mt   = (float) str_replace(',', '', (string) ($r['quantity_mt'] ?? 0));
    if (!$kode) { $tanpaKode[(string) ($r['consignee'] ?? '(kosong)')] = ($tanpaKode[(string) ($r['consignee'] ?? '(kosong)')] ?? 0) + $mt; continue; }
    if (!isset($produkIQ[$prod])) { $bukanProdukKuota[$prod] = ($bukanProdukKuota[$prod] ?? 0) + $mt; }
    $k = $kode . '|' . $prod;
    $scotAgg[$k] = $scotAgg[$k] ?? ['mt' => 0.0, 'n' => 0, 'thn' => [], 'status' => []];
    $scotAgg[$k]['mt'] += $mt;
    $scotAgg[$k]['n']++;
    $scotAgg[$k]['thn'][(string) ($r['year'] ?? '?')] = true;
    $scotAgg[$k]['status'][(string) ($r['status'] ?? '?')] = true;
}

/* ── IQ Dash per (company, produk) ─────────────────────────────────────── */
$iq = [];
foreach ($semuaCo as $co) {
    foreach (($co['utilizationByProd'] ?? []) as $p => $u) {
        $k = $co['code'] . '|' . $kanon((string) $p);
        $iq[$k]['util'] = ($iq[$k]['util'] ?? 0) + (float) $u;
    }
    foreach (($co['availableByProd'] ?? []) as $p => $a) {
        $k = $co['code'] . '|' . $kanon((string) $p);
        $iq[$k]['avail'] = ($iq[$k]['avail'] ?? 0) + (float) $a;
    }
}

/* ── Laporan ───────────────────────────────────────────────────────────── */
printf("\nSCOT %s: %d baris\n", $jenisDiminta, $jumlahJenis);
printf("  terpetakan ke company IQ Dash: %d pasangan (company, produk)\n", count($scotAgg));

echo "\n== CONSIGNEE YANG TIDAK DIKENALI IQ DASH ==\n";
if (!$tanpaKode) echo "  (tidak ada)\n";
arsort($tanpaKode);
foreach ($tanpaKode as $n => $mt) printf("  %-45s %10.3f MT\n", mb_substr($n, 0, 45), $mt);

echo "\n== PRODUK SCOT YANG BUKAN PRODUK KUOTA IQ DASH ==\n";
if (!$bukanProdukKuota) echo "  (tidak ada)\n";
arsort($bukanProdukKuota);
foreach ($bukanProdukKuota as $p => $mt) printf("  %-30s %10.3f MT\n", $p ?: '(kosong)', $mt);

echo "\n== PER (COMPANY, PRODUK) — hanya produk kuota ==\n";
printf("  %-6s %-28s %12s %12s %12s %s\n", 'CO', 'PRODUK', 'SCOT MT', 'IQ Util', 'SELISIH', 'catatan');
ksort($scotAgg);
foreach ($scotAgg as $k => $s) {
    [$co, $p] = explode('|', $k, 2);
    if (!isset($produkIQ[$p])) continue;
    $u = $iq[$k]['util'] ?? null;
    $cat = [];
    $cat[] = count($s['n'] ? [1] : []) ? $s['n'] . ' baris' : '';
    $cat[] = 'tahun ' . implode('/', array_keys($s['thn']));
    $cat[] = 'status ' . implode('/', array_keys($s['status']));
    printf("  %-6s %-28s %12.3f %12s %12s %s\n", $co, mb_substr($p, 0, 28), $s['mt'],
        $u === null ? '—' : number_format($u, 3, '.', ''),
        $u === null ? '(tak ada)' : number_format($s['mt'] - $u, 3, '.', ''),
        implode(' · ', array_filter($cat)));
}
