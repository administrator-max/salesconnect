<?php
/* AUDIT ANOMALI SALESPULSE — READ ONLY, tidak menulis apa pun.

   Menyisir tab-tab SalesPulse untuk dua kelas masalah yang paling sering
   lolos: angka yang TIDAK MUNCUL di dashboard, dan angka yang SALAH DIBACA.
   Dibuat 2026-08-20 atas permintaan tim sesudah kasus "PROJECTS hantu".

   Pakai: php tools/salespulse_audit.php [tahun]
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
$PR = sp_get_table($gs, $SID, 'products');

$byPs = [];
foreach ($I as $it) $byPs[trim((string) ($it['ps_number'] ?? ''))][] = $it;
$master = [];
foreach ($PR as $p) $master[trim((string) $p['canonical_name'])] = true;
$alias = [];
foreach ($AL as $a) {
    $k = trim((string) ($a['alias'] ?? ''));
    if ($k !== '') $alias[$k] = trim((string) $a['canonical_name']);
}
$kanon = function ($v) use ($alias) { $k = sp_prod_key($v); return $alias[$k] ?? $k; };

$temuan = 0;
function judul($n, $t) { echo "\n" . str_repeat('-', 78) . "\n$n. $t\n" . str_repeat('-', 78) . "\n"; }
function bersih() { echo "  bersih\n"; }

// == 1 =======================================================================
judul(1, 'NOMOR PS GANDA di ps_headers');
$c = [];
foreach ($H as $h) $c[trim((string) $h['ps_number'])][] = $h;
$n = 0;
foreach ($c as $ps => $rows) if (count($rows) > 1) { $n++; echo "  $ps : " . count($rows) . " baris\n"; }
if (!$n) bersih(); else $temuan += $n;

// == 2 =======================================================================
judul(2, 'ps_items yatim — ps_number-nya tidak ada di ps_headers (tonase tak terpakai)');
$adaH = [];
foreach ($H as $h) $adaH[trim((string) $h['ps_number'])] = true;
$n = 0; $kgY = 0.0;
foreach ($byPs as $ps => $its) {
    if (isset($adaH[$ps])) continue;
    $kg = 0.0;
    foreach ($its as $it) $kg += sp_num($it['total_weight_kg'] ?? null);
    $n++; $kgY += $kg;
    printf("  %-34s %d item, %s kg\n", $ps, count($its), number_format($kg));
}
if (!$n) bersih(); else { $temuan += $n; echo "  TOTAL tonase yatim: " . number_format($kgY) . " kg\n"; }

// == 3 =======================================================================
judul(3, 'PRODUK di ps_headers yang tidak dikenal master/alias');
$n = 0;
foreach ($H as $h) {
    $p = trim((string) ($h['product'] ?? ''));
    if ($p === '') continue;
    $k = $kanon($p);
    if (!isset($master[$k])) { $n++; printf("  %-22s product='%s' -> '%s'\n", $h['ps_number'], $p, $k); }
}
if (!$n) bersih(); else $temuan += $n;

// == 4 =======================================================================
judul(4, 'ps_headers dengan product KOSONG (jatuh ke bucket "(Produk Belum Diisi)")');
$n = 0;
foreach ($H as $h) {
    if (trim((string) ($h['product'] ?? '')) !== '') continue;
    $n++;
    printf("  %-22s bln %2d | %s\n", $h['ps_number'], ((int) $h['dashboard_month_idx']) + 1, $h['project_name']);
}
if (!$n) bersih(); else $temuan += $n;

// == 5 =======================================================================
judul(5, 'RANTAI yang antar leg-nya menyebut PRODUK BERBEDA');
$byProj = [];
foreach ($H as $h) $byProj[(string) $h['project_name']][] = $h;
$n = 0;
foreach ($byProj as $pn => $legs) {
    $set = [];
    foreach ($legs as $l) {
        $p = trim((string) ($l['product'] ?? ''));
        if ($p !== '') $set[$kanon($p)] = true;
    }
    if (count($set) < 2) continue;
    $n++;
    printf("  %-52s : %s\n", substr($pn, 0, 52), implode(' vs ', array_keys($set)));
    foreach ($legs as $l) printf("      %-22s %s\n", $l['ps_number'], $l['product']);
}
if (!$n) bersih(); else $temuan += $n;

// == 6 =======================================================================
judul(6, 'LEG KEMBAR — subsidiary + customer + revenue identik (indikasi PS lama belum dihapus)');
$g = [];
foreach ($H as $h) {
    $k = trim((string) $h['subsidiary']) . '|' . trim((string) $h['customer_name']) . '|' . sp_num($h['sales_revenue'] ?? null);
    $g[$k][] = $h;
}
$n = 0;
foreach ($g as $rows) {
    if (count($rows) < 2) continue;
    $n++;
    echo "  revenue " . number_format(sp_num($rows[0]['sales_revenue'] ?? null)) . " | " . $rows[0]['customer_name'] . "\n";
    foreach ($rows as $r) printf("      %-22s bln %2d | margin %13s | dibuat %s\n", $r['ps_number'],
        ((int) $r['dashboard_month_idx']) + 1, number_format(sp_num($r['margin'] ?? null)), substr((string) $r['created_at'], 0, 10));
}
if (!$n) bersih(); else $temuan += $n;

// == 7 =======================================================================
judul(7, 'DAFTAR CUSTOMER — periksa salah tandai internal/eksternal');
$cust = [];
foreach ($H as $h) {
    $cn = trim((string) ($h['customer_name'] ?? ''));
    if ($cn === '') $cn = '(KOSONG)';
    $cust[$cn][] = $h;
}
ksort($cust);
foreach ($cust as $cn => $rows) {
    $rev = 0.0;
    foreach ($rows as $r) $rev += sp_num($r['sales_revenue'] ?? null);
    printf("  %-7s %-36s %2d PS | rev %18s\n", sp_is_internal_company($cn) ? '[GRUP]' : '[luar]',
        substr($cn, 0, 36), count($rows), number_format($rev));
}

// == 8 =======================================================================
judul(8, 'BULAN dashboard tidak cocok dengan bulan po_date');
$n = 0;
foreach ($H as $h) {
    $pd = trim((string) ($h['po_date'] ?? ''));
    if ($pd === '') continue;
    $m = (int) substr($pd, 5, 2) - 1;
    $y = (int) substr($pd, 0, 4);
    if ($m === (int) $h['dashboard_month_idx'] && $y === (int) $h['dashboard_year']) continue;
    $n++;
    printf("  %-22s po_date=%s -> dashboard thn %s bln %d\n", $h['ps_number'], $pd, $h['dashboard_year'], ((int) $h['dashboard_month_idx']) + 1);
}
if (!$n) bersih(); else $temuan += $n;

// == 9 =======================================================================
judul(9, 'ANGKA JANGGAL di ps_headers');
$n = 0;
foreach ($H as $h) {
    $rev = sp_num($h['sales_revenue'] ?? null);
    $mar = sp_num($h['margin'] ?? null);
    $pur = sp_num($h['purchase_cost'] ?? null);
    $pct = sp_num($h['margin_percentage'] ?? null);
    $sebab = [];
    if ($rev <= 0) $sebab[] = 'revenue 0/negatif';
    if ($mar < 0) $sebab[] = 'margin negatif';
    if ($rev > 0 && $mar > $rev) $sebab[] = 'margin > revenue';
    if ($rev > 0 && $pct > 0 && abs(($mar / $rev * 100) - $pct) > 0.5) {
        $sebab[] = sprintf('margin%% tersimpan %.2f vs hitung %.2f', $pct, $mar / $rev * 100);
    }
    if ($pur > 0 && $rev > 0 && abs(($rev - $pur) - $mar) > max(1000, $rev * 0.02)) {
        $sebab[] = sprintf('rev-purchase=%s tapi margin=%s', number_format($rev - $pur), number_format($mar));
    }
    $curr = strtoupper(trim((string) ($h['currency'] ?? 'IDR')));
    if ($curr !== 'IDR' && $curr !== '' && sp_num($h['fx_rate'] ?? null) <= 1) {
        $sebab[] = "currency $curr tapi fx_rate " . sp_num($h['fx_rate'] ?? null);
    }
    if (!$sebab) continue;
    $n++;
    printf("  %-22s bln %2d | %s\n", $h['ps_number'], ((int) $h['dashboard_month_idx']) + 1, implode(' ; ', $sebab));
}
if (!$n) bersih(); else $temuan += $n;

// == 10 ======================================================================
judul(10, 'ps_items dengan total_weight_kg kosong/0 (tonasenya hilang diam-diam)');
$n = 0;
foreach ($I as $it) {
    if (sp_num($it['total_weight_kg'] ?? null) > 0) continue;
    $n++;
    if ($n <= 15) printf("  %-22s no=%-3s %s\n", $it['ps_number'], $it['item_no'], substr((string) $it['material'], 0, 50));
}
if (!$n) bersih(); else { $temuan += $n; if ($n > 15) echo "  ... total $n baris\n"; }

// == 11 ======================================================================
judul(11, 'BERAT tidak wajar — harga jual per kg di luar Rp 1.000 s/d Rp 100.000');
$n = 0;
foreach ($H as $h) {
    $ps = trim((string) $h['ps_number']);
    $kg = 0.0;
    foreach (($byPs[$ps] ?? []) as $it) $kg += sp_num($it['total_weight_kg'] ?? null);
    if ($kg <= 0) continue;
    $rev = sp_num($h['sales_revenue'] ?? null);
    if ($rev <= 0) continue;
    $pk = $rev / $kg;
    if ($pk >= 1000 && $pk <= 100000) continue;
    $n++;
    printf("  %-22s %11s kg | rev %17s | Rp %s/kg\n", $ps, number_format($kg), number_format($rev), number_format($pk));
}
if (!$n) bersih(); else $temuan += $n;

// == 12 ======================================================================
judul(12, 'PS EKSTERNAL tanpa item — tonase & revenue-nya tidak terhitung');
$n = 0; $revH = 0.0;
foreach ($H as $h) {
    if (!empty($byPs[trim((string) $h['ps_number'])])) continue;
    if (sp_is_internal_company($h['customer_name'] ?? '')) continue;
    $n++;
    $revH += sp_num($h['sales_revenue'] ?? null);
    printf("  %-22s bln %2d | %-14s | rev %17s | %s\n", $h['ps_number'], ((int) $h['dashboard_month_idx']) + 1,
        $h['product'], number_format(sp_num($h['sales_revenue'] ?? null)), substr((string) $h['project_name'], 0, 38));
}
if (!$n) bersih(); else { $temuan += $n; echo "  TOTAL revenue tak terhitung: " . number_format($revH) . "\n"; }

// == 13 ======================================================================
judul(13, 'BUDGET untuk produk yang tidak dikenal master/alias');
$n = 0;
foreach ($B as $b) {
    $p = trim((string) ($b['product'] ?? ''));
    if ($p === '') { $n++; echo "  budget id=" . ($b['id'] ?? '?') . " product KOSONG\n"; continue; }
    if (!isset($master[$kanon($p)])) { $n++; printf("  budget id=%s product='%s'\n", $b['id'] ?? '?', $p); }
}
if (!$n) bersih(); else $temuan += $n;

// == 14 ======================================================================
$data = sp_build_data($TAHUN, $A, $P, $B, $H, $I, $AL);
$act = $data['ACTUAL_PRODUCTS'] ?? [];
$bud = $data['BUDGET']['products'] ?? [];

judul(14, "PRODUK AKTUAL $TAHUN yang tidak punya baris budget (tampil off-plan)");
$n = 0;
foreach ($act as $p => $v) {
    $am = array_sum($v['margin']);
    $bm = isset($bud[$p]) ? array_sum($bud[$p]['margin']) : 0;
    if ($am == 0 || $bm != 0) continue;
    $n++;
    printf("  %-22s margin %10.2f M | volume %8.1f MT — tanpa budget\n", $p, $am, array_sum($v['volume']));
}
if (!$n) bersih(); else $temuan += $n;

// == 15 ======================================================================
judul(15, "PRODUK BER-BUDGET $TAHUN yang aktualnya nol sepanjang tahun");
$n = 0;
foreach ($bud as $p => $v) {
    $bm = array_sum($v['margin']);
    $am = isset($act[$p]) ? array_sum($act[$p]['margin']) : 0;
    if ($bm == 0 || $am != 0) continue;
    $n++;
    printf("  %-22s budget %10.2f M — aktual 0\n", $p, $bm);
}
if (!$n) bersih(); else $temuan += $n;

// == 16 ======================================================================
judul(16, "PRODUK $TAHUN bermargin tapi TANPA volume (hilang dari grafik MT)");
$n = 0;
foreach ($act as $p => $v) {
    if (array_sum($v['margin']) == 0 || array_sum($v['volume']) != 0) continue;
    $n++;
    printf("  %-22s margin %10.2f M | revenue %10.2f M | volume 0 MT\n", $p, array_sum($v['margin']), array_sum($v['revenue']));
}
if (!$n) bersih(); else $temuan += $n;

// == 17 ======================================================================
judul(17, 'monthly_actuals dengan month_idx tidak valid');
$n = 0;
foreach ($A as $r) {
    if ((int) ($r['year'] ?? 0) !== $TAHUN) continue;
    $mi = $r['month_idx'] ?? null;
    if (is_int($mi) && $mi >= 0 && $mi <= 11) continue;
    $n++;
    printf("  month_idx tidak valid: %s\n", var_export($mi, true));
}
if (!$n) bersih(); else $temuan += $n;

// == 18 ======================================================================
judul(18, 'plan_revisions dengan produk di luar master/alias');
$n = 0;
foreach ($P as $r) {
    $q = $r['qty'] ?? [];
    if (!is_array($q)) continue;
    foreach (array_keys($q) as $k) {
        if (isset($master[$kanon($k)])) continue;
        $n++;
        printf("  plan id=%s bln=%s key='%s'\n", $r['id'] ?? '?', $r['month_idx'] ?? '?', $k);
    }
}
if (!$n) bersih(); else $temuan += $n;

// == 19 ======================================================================
judul(19, 'Sebaran dashboard_year di ps_headers');
$c = [];
foreach ($H as $h) {
    $y = (int) ($h['dashboard_year'] ?? 0);
    $c[$y] = ($c[$y] ?? 0) + 1;
}
ksort($c);
foreach ($c as $y => $j) echo "  tahun $y : $j PS\n";

echo "\n" . str_repeat('=', 78) . "\nSelesai. Total baris temuan: $temuan\n";
