<?php
/**
 * Mencatat lot Sales yang BELUM dirangkum master sebagai baris
 * `cycle_utilization` tersendiri (Utilization #N).
 *
 * LATAR
 * -----
 * IKM GI ALLOY: master punya satu baris `Utilization #1, 2.300 MT, 24/07/2026`
 * yang merangkum dua lot pertama (2.000 @ 24/07 dan 300 @ 29/07). Lot ketiga
 * (300 @ 10/08/2026) belum pernah masuk ledger. Aturan baca sejak 31-Agu-2026
 * sudah menanganinya — utilisasi terbaca 2.600 — tapi ledger-nya sendiri masih
 * bilang 2.300.
 *
 * Selisih itu punya akibat yang bisa dilihat: syarat "lot lengkap" di
 * scopedUtilByProd() menuntut Sigma lot SAMA dengan total siklus master. Selama
 * 2.600 != 2.300 syarat itu gagal, master yang menang untuk penempatan periode,
 * dan seluruh 2.300 mendarat di 24/07 sementara total sepanjang waktu 2.600 —
 * H1 + H2 tidak lagi sama dengan setahun. Mencatat lot ketiga menutup selisih
 * itu sekaligus.
 *
 * APA YANG DICATAT
 * ----------------
 * HANYA lot yang berada SESUDAH awalan yang jumlahnya pas sama dengan total
 * master — yaitu lot yang terbukti belum dirangkum. MT dan tanggalnya disalin
 * apa adanya dari lot; tidak ada yang dikarang, tidak ada yang dibulatkan.
 *
 * PAGAR
 * -----
 *   1. seluruh lot produk itu bertanggal (tanpa tanggal, urutan tak pasti);
 *   2. ADA awalan lot yang jumlahnya PAS sama dengan total siklus master —
 *      ini buktinya baris master memang agregat. Tanpa itu, lot dan master
 *      adalah peristiwa terpisah (BTS, KAN) dan tidak boleh disentuh;
 *   3. total baru tidak melampaui obtained;
 *   4. belum ada baris kembar (produk, MT, tanggal) — skrip ini idempoten;
 *   5. SESUDAH baris ditambahkan, utilisasi hasil hitungan HARUS TETAP SAMA.
 *      Mencatat ke ledger adalah pembukuan, bukan perubahan angka. Kalau
 *      simulasinya menggeser satu MT pun, baris itu TIDAK ditulis.
 *
 * Dry-run:   php tools/catat_utilisasi_lot_ke_master.php --only=IKM
 * Terapkan:  php tools/catat_utilisasi_lot_ke_master.php --only=IKM --apply
 */
require_once __DIR__ . '/../lib/GoogleSheets.php';
require_once __DIR__ . '/../lib/helpers.php';
require_once __DIR__ . '/../iqdash/iqdash_util.php';
require_once __DIR__ . '/../iqdash/iqdash_data.php';
require_once __DIR__ . '/../iqdash/iqdash_write.php';

$APPLY = in_array('--apply', $argv, true);
$ONLY  = [];
foreach ($argv as $a) {
    if (strpos($a, '--only=') === 0) {
        foreach (explode(',', substr($a, 7)) as $c) { $c = trim($c); if ($c !== '') $ONLY[] = $c; }
    }
}

$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();
$gs->warmValues($sid, ['cycle_utilization', 'company_shipments', 'company_product_stats', 'product_aliases']);

$aliasMap = iq_alias_map($gs, $sid);
$kanon    = fn($p) => iq_canon_product((string) $p, $aliasMap);

$ucTbl = $gs->table($sid, 'cycle_utilization');
$uc    = $ucTbl['rows'];
$ship  = $gs->table($sid, 'company_shipments')['rows'];
$stats = $gs->table($sid, 'company_product_stats')['rows'];

$maxId = 0;
foreach ($uc as $r) { $n = (int) ($r['id'] ?? 0); if ($n > $maxId) $maxId = $n; }

/* Kelompokkan per company. */
$ucCo = []; foreach ($uc as $r)   { $ucCo[(string) ($r['company_code'] ?? '')][] = $r; }
$shCo = []; foreach ($ship as $r) { $shCo[(string) ($r['company_code'] ?? '')][] = $r; }

$usul = [];    // baris yang akan ditambahkan
$lewat = [];   // (company, produk) yang diperiksa tapi tidak memenuhi pagar

foreach ($shCo as $code => $lots) {
    if ($code === '') continue;
    if (count($ONLY) && !in_array($code, $ONLY, true)) continue;

    /* Lot per produk kanonik. */
    $perProd = [];
    foreach ($lots as $l) {
        $p = (string) ($l['product'] ?? '');
        if ($p === '') continue;
        $perProd[$kanon($p)][] = $l;
    }

    foreach ($perProd as $prod => $lotProd) {
        /* Master untuk produk ini. */
        $masterRows = array_values(array_filter($ucCo[$code] ?? [],
            fn($u) => $kanon($u['product'] ?? '') === $prod && iq_num($u['util_mt'] ?? 0) > 0));
        $masterTotal = 0.0;
        foreach ($masterRows as $u) $masterTotal += iq_num($u['util_mt'] ?? 0);
        if ($masterTotal <= 0) { continue; }   // master diam: bukan urusan skrip ini

        /* Pagar 1 — seluruh lot ber-MT wajib bertanggal. */
        $berMT = [];
        $adaTanpaTanggal = false;
        foreach ($lotProd as $l) {
            $mt = iq_num($l['util_mt'] ?? 0);
            if ($mt <= 0) continue;
            $h = iq_util_day_key($l['util_date'] ?? null);
            if ($h === null) { $adaTanpaTanggal = true; break; }
            /* Tanggal ditulis dalam format tab ini (dd/mm/yyyy), bukan ejaan
               bebas milik lot ("10 August 2026"). Hari yang SAMA PERSIS —
               hanya bentuknya diseragamkan dengan 54 baris tetangganya, supaya
               ledger tetap satu bentuk saat dibaca manusia maupun mesin. */
            $tglLedger = substr($h, 8, 2) . '/' . substr($h, 5, 2) . '/' . substr($h, 0, 4);
            $berMT[] = ['h' => $h, 'mt' => $mt, 'tgl' => $tglLedger,
                        'tglLot' => (string) ($l['util_date'] ?? ''),
                        'prodLot' => (string) ($l['product'] ?? '')];
        }
        if ($adaTanpaTanggal || !count($berMT)) continue;

        $sigmaLot = 0.0;
        foreach ($berMT as $x) $sigmaLot += $x['mt'];
        if (abs($sigmaLot - $masterTotal) <= 0.001) continue;   // sudah selaras

        /* Pagar 2 — harus ada awalan yang PAS sama dengan total master. */
        usort($berMT, fn($a, $b) => $a['h'] <=> $b['h']);
        $akum = 0.0; $k = -1;
        foreach ($berMT as $i => $x) {
            $akum += $x['mt'];
            if (abs($akum - $masterTotal) <= 0.001) { $k = $i; break; }
        }
        if ($k < 0) {
            $lewat[] = [$code, $prod, sprintf('master %s, Sigma lot %s — tidak ada awalan lot yang jumlahnya pas, jadi keduanya peristiwa terpisah',
                rtrim(rtrim(number_format($masterTotal, 3, '.', ''), '0'), '.'),
                rtrim(rtrim(number_format($sigmaLot, 3, '.', ''), '0'), '.'))];
            continue;
        }

        $belum = array_slice($berMT, $k + 1);
        if (!count($belum)) continue;

        /* Pagar 3 — tidak melampaui obtained. */
        $exIdx = iq_find_product_row_idx($stats, $code, $prod, $aliasMap);
        $obtained = $exIdx !== null
            ? iq_num($stats[$exIdx]['utilization_mt'] ?? 0) + iq_num($stats[$exIdx]['available_mt'] ?? 0)
            : 0.0;
        if ($obtained > 0 && $sigmaLot > $obtained + 0.001) {
            $lewat[] = [$code, $prod, 'Sigma lot melampaui obtained — tidak dicatat'];
            continue;
        }

        /* Nomor Utilization berikutnya untuk produk ini. */
        $nomor = 0;
        foreach ($masterRows as $u) {
            if (preg_match('/#(\d+)/', (string) ($u['cycle_type'] ?? ''), $m)) {
                $nomor = max($nomor, (int) $m[1]);
            }
        }

        foreach ($belum as $x) {
            $nomor++;
            /* Pagar 4 — jangan menulis kembaran. */
            $kembar = false;
            foreach ($masterRows as $u) {
                if (abs(iq_num($u['util_mt'] ?? 0) - $x['mt']) <= 0.001
                    && iq_util_day_key($u['util_date'] ?? null) === $x['h']) { $kembar = true; break; }
            }
            if ($kembar) { $lewat[] = [$code, $prod, 'baris kembar sudah ada — dilewati']; continue; }

            $usul[] = [
                'code'    => $code,
                'prod'    => $prod,
                'prodLot' => $x['prodLot'],
                'cycle'   => 'Utilization #' . $nomor,
                'mt'      => $x['mt'],
                'tgl'     => $x['tgl'],
                'tglLot'  => $x['tglLot'],
                'hari'    => $x['h'],
                'masterSebelum' => $masterTotal,
                'sigmaLot'      => $sigmaLot,
            ];
        }
    }
}

/* ── Pagar 5 — simulasi: utilisasi TIDAK boleh bergeser ─────────────────── */
$tolak = [];
if (count($usul)) {
    $t0 = iq_load_tables($gs, $sid);
    $sebelum = [];
    foreach (array_merge(iq_build_payload($t0)['spi'] ?? [], iq_build_payload($t0)['pending'] ?? []) as $co) {
        foreach (($co['utilizationByProd'] ?? []) as $p => $v) $sebelum[$co['code'] . '|' . $kanon($p)] = iq_num($v);
    }

    $ucSim = $uc;
    $idSim = $maxId;
    foreach ($usul as $u) {
        $idSim++;
        $ucSim[] = ['id' => (string) $idSim, 'company_code' => $u['code'], 'cycle_type' => $u['cycle'],
                    'product' => $u['prodLot'] !== '' ? $u['prodLot'] : $u['prod'],
                    'util_mt' => (string) $u['mt'], 'util_date' => $u['tgl'],
                    'source_program' => 'B', 'quota_year' => ''];
    }
    $t1 = $t0;
    $t1['cycleUtil'] = array_map(fn($r) => $r, $ucSim);
    $p1 = iq_build_payload($t1);
    $sesudah = [];
    foreach (array_merge($p1['spi'] ?? [], $p1['pending'] ?? []) as $co) {
        foreach (($co['utilizationByProd'] ?? []) as $p => $v) $sesudah[$co['code'] . '|' . $kanon($p)] = iq_num($v);
    }
    foreach (array_unique(array_merge(array_keys($sebelum), array_keys($sesudah))) as $k) {
        $a = $sebelum[$k] ?? 0; $b = $sesudah[$k] ?? 0;
        if (abs($a - $b) > 0.001) $tolak[] = sprintf('%s: %s -> %s', $k,
            rtrim(rtrim(number_format($a, 3, '.', ''), '0'), '.'),
            rtrim(rtrim(number_format($b, 3, '.', ''), '0'), '.'));
    }
}

/* ── Laporan ────────────────────────────────────────────────────────────── */
$n = fn($v) => rtrim(rtrim(number_format((float) $v, 3, '.', ''), '0'), '.');
echo "\n" . ($APPLY ? '=== MENERAPKAN ===' : '=== DRY-RUN (belum menulis apa pun) ===') . "\n\n";

if (count($lewat)) {
    echo "Dilewati:\n";
    foreach ($lewat as $l) printf("  %-6s %-22s %s\n", $l[0], $l[1], $l[2]);
    echo "\n";
}

if (!count($usul)) { echo "Tidak ada lot yang perlu dicatat.\n"; exit(0); }

printf("%-6s %-20s %-16s %8s %-14s %s\n", 'CO', 'PRODUK', 'CYCLE', 'MT', 'TANGGAL', 'MASTER');
foreach ($usul as $u) {
    printf("%-6s %-20s %-16s %8s %-12s %s -> %-6s  (dari lot: %s)\n", $u['code'], $u['prod'], $u['cycle'],
        $n($u['mt']), $u['tgl'], $n($u['masterSebelum']), $n($u['sigmaLot']), $u['tglLot']);
}

echo "\nPagar 5 — utilisasi sesudah pencatatan:\n";
if (count($tolak)) {
    echo "  MENGGESER ANGKA, jadi TIDAK ditulis:\n";
    foreach ($tolak as $t) echo "    $t\n";
    echo "\n  Pencatatan ke ledger adalah pembukuan, bukan perubahan angka.\n";
    exit(1);
}
echo "  Tidak ada satu MT pun yang bergerak. Aman.\n";

if (!$APPLY) { echo "\nJalankan lagi dengan --apply untuk menulis.\n"; exit(0); }

$dir = __DIR__ . '/../backups';
if (!is_dir($dir)) @mkdir($dir, 0700, true);
$cad = $dir . '/cycle_utilization_sebelum_catat_' . date('Y-m-d_His') . '.json';
file_put_contents($cad, json_encode($uc));
echo "\nCadangan: $cad\n";

foreach ($usul as $u) {
    $maxId++;
    $uc[] = ['id' => (string) $maxId, 'company_code' => $u['code'], 'cycle_type' => $u['cycle'],
             'product' => $u['prodLot'] !== '' ? $u['prodLot'] : $u['prod'],
             'util_mt' => (string) $u['mt'], 'util_date' => $u['tgl'],
             'source_program' => 'B', 'quota_year' => ''];
}
iq_batch_write_full_tables($gs, $sid, [
    ['tab' => 'cycle_utilization', 'rows' => $uc, 'headers' => $ucTbl['headers']],
]);
echo "Selesai. " . count($usul) . " baris ditambahkan ke cycle_utilization.\n";
