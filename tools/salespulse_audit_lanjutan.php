<?php
/* AUDIT ANOMALI SALESPULSE — LAPISAN STRUKTURAL. READ ONLY.

   Pelengkap tools/salespulse_audit.php. Yang di sini memeriksa hal yang tidak
   kelihatan dari satu baris saja: konsistensi antar-leg dalam satu rantai,
   antara tabel agregat dan hitungan ulang, dan antara KPI total dengan rincian
   per produk. Dibuat 2026-08-20.

   Pakai: php tools/salespulse_audit_lanjutan.php [tahun]
*/
$root = __DIR__ . '/..';
require_once $root . '/lib/sheet_util.php';
require_once $root . '/salespulse/salespulse_util.php';
require_once $root . '/salespulse/consolidation.php';

$TAHUN = isset($argv[1]) ? (int) $argv[1] : 2026;
$cfg = sc_config();
$SID = $cfg['spreadsheets']['salespulse'];
$gs  = new GoogleSheets();

$H  = sp_get_table($gs, $SID, 'ps_headers');
$I  = sp_get_table($gs, $SID, 'ps_items');
$B  = sp_get_table($gs, $SID, 'budget_lines');
$A  = sp_get_table($gs, $SID, 'monthly_actuals');
$P  = sp_get_table($gs, $SID, 'plan_revisions');
$AL = sp_get_table($gs, $SID, 'product_aliases');

$byPs = [];
foreach ($I as $it) $byPs[trim((string) ($it['ps_number'] ?? ''))][] = $it;
$byProj = [];
foreach ($H as $h) $byProj[(string) $h['project_name']][] = $h;

$temuan = 0;
function judul($n, $t) { echo "\n" . str_repeat('-', 78) . "\n$n. $t\n" . str_repeat('-', 78) . "\n"; }
function bersih() { echo "  bersih\n"; }
function kg_ps(array $byPs, $ps): float {
    $k = 0.0;
    foreach (($byPs[trim((string) $ps)] ?? []) as $it) $k += sp_num($it['total_weight_kg'] ?? null);
    return $k;
}

// == 20 ======================================================================
judul(20, 'RANTAI yang SEMUA leg-nya customer GRUP — revenue & volume tidak pernah dihitung');
$n = 0; $revH = 0.0;
foreach ($byProj as $pn => $legs) {
    $adaLuar = false;
    foreach ($legs as $l) if (!sp_is_internal_company($l['customer_name'] ?? '')) { $adaLuar = true; break; }
    if ($adaLuar) continue;
    $n++;
    $r = 0.0; $m = 0.0;
    foreach ($legs as $l) { $r += sp_num($l['sales_revenue'] ?? null); $m += sp_num($l['margin'] ?? null); }
    $revH += $r;
    printf("  %-50s %d leg | rev %16s | margin %13s\n", substr($pn, 0, 50), count($legs), number_format($r), number_format($m));
    foreach ($legs as $l) printf("      %-22s -> %s\n", $l['ps_number'], $l['customer_name']);
}
if (!$n) bersih(); else { $temuan += $n; echo "  Margin rantai ini TETAP terhitung; yang hilang revenue & tonasenya.\n"; }

// == 21 ======================================================================
judul(21, 'RANTAI dengan LEBIH DARI SATU leg eksternal ber-item (revenue berpotensi dobel)');
$n = 0;
foreach ($byProj as $pn => $legs) {
    $luar = [];
    foreach ($legs as $l) {
        if (sp_is_internal_company($l['customer_name'] ?? '')) continue;
        if (kg_ps($byPs, $l['ps_number']) <= 0) continue;
        $luar[] = $l;
    }
    if (count($luar) < 2) continue;
    $n++;
    printf("  %-50s : %d leg eksternal ber-item\n", substr($pn, 0, 50), count($luar));
    foreach ($luar as $l) printf("      %-22s -> %-30s rev %16s | %9s kg\n", $l['ps_number'],
        substr((string) $l['customer_name'], 0, 30), number_format(sp_num($l['sales_revenue'] ?? null)),
        number_format(kg_ps($byPs, $l['ps_number'])));
}
if (!$n) bersih(); else $temuan += $n;

// == 22 ======================================================================
judul(22, 'RANTAI dengan margin total NEGATIF atau nol');
$n = 0;
foreach ($byProj as $pn => $legs) {
    $m = 0.0;
    foreach ($legs as $l) $m += sp_num($l['margin'] ?? null);
    if ($m > 0) continue;
    $n++;
    printf("  %-50s margin %s\n", substr($pn, 0, 50), number_format($m));
}
if (!$n) bersih(); else $temuan += $n;

// == 23 ======================================================================
judul(23, 'PS dengan mata uang selain IDR (nilai dashboard bergantung fx_rate)');
$n = 0;
foreach ($H as $h) {
    $c = strtoupper(trim((string) ($h['currency'] ?? '')));
    if ($c === '' || $c === 'IDR') continue;
    $n++;
    printf("  %-22s bln %2d | %s | fx=%s | rev %s\n", $h['ps_number'], ((int) $h['dashboard_month_idx']) + 1,
        $c, sp_num($h['fx_rate'] ?? null), number_format(sp_num($h['sales_revenue'] ?? null)));
}
if (!$n) bersih(); else $temuan += $n;

// == 24 ======================================================================
judul(24, 'PURCHASE COST tampak tidak terbaca (gross margin > 50% revenue)');
echo "  catatan: purchase_cost TIDAK dipakai dashboard mana pun — ini murni kebersihan data.\n";
$n = 0;
foreach ($H as $h) {
    $rev = sp_num($h['sales_revenue'] ?? null);
    $pur = sp_num($h['purchase_cost'] ?? null);
    if ($rev <= 0) continue;
    if ($pur > 0 && $pur >= $rev * 0.5) continue;
    $n++;
    printf("  %-22s bln %2d | rev %16s | purchase %16s\n", $h['ps_number'], ((int) $h['dashboard_month_idx']) + 1,
        number_format($rev), number_format($pur));
}
if (!$n) bersih(); else { $temuan += $n; echo "  total $n PS\n"; }

// == 25 ======================================================================
$data = sp_build_data($TAHUN, $A, $P, $B, $H, $I, $AL);
$ACT = $data['ACTUAL'] ?? [];
$BUD = $data['BUDGET'] ?? [];
$actP = $data['ACTUAL_PRODUCTS'] ?? [];
$budP = $BUD['products'] ?? [];

judul(25, 'KPI TOTAL vs jumlah rincian per produk (per bulan)');
$n = 0;
for ($m = 0; $m < 12; $m++) {
    $mTot = $ACT['margin'][$m] ?? 0;
    $rTot = $ACT['revenue'][$m] ?? 0;
    $mSum = 0.0; $rSum = 0.0;
    foreach ($actP as $v) { $mSum += $v['margin'][$m] ?? 0; $rSum += $v['revenue'][$m] ?? 0; }
    $bTot = $BUD['margin'][$m] ?? 0;
    $bSum = 0.0;
    foreach ($budP as $v) $bSum += $v['margin'][$m] ?? 0;
    $beda = [];
    if (abs($mTot - $mSum) > 0.01) $beda[] = sprintf('margin KPI %.2f vs produk %.2f', $mTot, $mSum);
    if (abs($rTot - $rSum) > 0.01) $beda[] = sprintf('revenue KPI %.2f vs produk %.2f', $rTot, $rSum);
    if (abs($bTot - $bSum) > 0.01) $beda[] = sprintf('budget margin KPI %.2f vs produk %.2f', $bTot, $bSum);
    if (!$beda) continue;
    $n++;
    printf("  bln %2d : %s\n", $m + 1, implode(' ; ', $beda));
}
if (!$n) bersih(); else $temuan += $n;

// == 26 ======================================================================
judul(26, 'VOLUME per produk vs tonase mentah ps_items (leg eksternal saja)');
$kasar = [];
foreach ($H as $h) {
    if ((int) ($h['dashboard_year'] ?? 0) !== $TAHUN) continue;
    $m = $h['dashboard_month_idx'] ?? null;
    if (!is_int($m) || $m < 0 || $m > 11) continue;
    if (sp_is_internal_company($h['customer_name'] ?? '')) continue;
    $kasar[$m] = ($kasar[$m] ?? 0) + kg_ps($byPs, $h['ps_number']) / 1000.0;
}
$n = 0;
for ($m = 0; $m < 12; $m++) {
    $dash = 0.0;
    foreach ($actP as $v) $dash += $v['volume'][$m] ?? 0;
    $raw = $kasar[$m] ?? 0.0;
    if (abs($dash - $raw) <= 0.01) continue;
    $n++;
    printf("  bln %2d : dashboard %.1f MT vs hitung mentah %.1f MT (selisih %.1f)\n", $m + 1, $dash, $raw, $dash - $raw);
}
if (!$n) bersih(); else $temuan += $n;

// == 27 ======================================================================
judul(27, 'BULAN yang punya PS tapi KPI-nya nol, atau sebaliknya');
$psPerBulan = [];
foreach ($H as $h) {
    if ((int) ($h['dashboard_year'] ?? 0) !== $TAHUN) continue;
    $m = (int) $h['dashboard_month_idx'];
    $psPerBulan[$m] = ($psPerBulan[$m] ?? 0) + 1;
}
$n = 0;
for ($m = 0; $m < 12; $m++) {
    $ps = $psPerBulan[$m] ?? 0;
    $mar = $ACT['margin'][$m] ?? 0;
    if (($ps > 0) === ($mar != 0)) continue;
    $n++;
    printf("  bln %2d : %d PS tapi margin KPI %.2f M\n", $m + 1, $ps, $mar);
}
if (!$n) bersih(); else $temuan += $n;

// == 28 ======================================================================
judul(28, 'RINGKASAN per bulan (untuk mata manusia)');
printf("  %-5s %5s %12s %12s %10s %10s %10s\n", 'bln', 'PS', 'margin M', 'revenue M', 'vol MT', 'bud mar M', 'bud MT');
for ($m = 0; $m < 12; $m++) {
    $vol = 0.0; $bv = 0.0;
    foreach ($actP as $v) $vol += $v['volume'][$m] ?? 0;
    foreach ($budP as $v) $bv += $v['volume'][$m] ?? 0;
    printf("  %-5d %5d %12.2f %12.2f %10.1f %10.2f %10.1f\n", $m + 1, $psPerBulan[$m] ?? 0,
        $ACT['margin'][$m] ?? 0, $ACT['revenue'][$m] ?? 0, $vol, $BUD['margin'][$m] ?? 0, $bv);
}

echo "\n" . str_repeat('=', 78) . "\nSelesai. Total baris temuan: $temuan\n";
