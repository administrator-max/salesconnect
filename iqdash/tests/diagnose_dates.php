<?php
/**
 * DIAGNOSTIK TANGGAL (READ-ONLY) — menjawab "kenapa periode X tidak keluar?"
 *
 * Membaca Google Sheet yang sesungguhnya dan melaporkan record mana yang
 * TIDAK TERLIHAT oleh filter periode IQ Dash, beserta alasannya. Skrip ini
 * hanya MEMBACA (`$gs->table()`); tidak ada satu pun panggilan tulis.
 *
 * KENAPA PERLU
 * `inPd(null)` bernilai FALSE (assets/js/02-period-filter.js). Jadi record
 * yang tanggalnya tidak terbaca bukan sekadar "tidak cocok" — ia hilang dari
 * SEMUA periode, sementara tampilan All Time tetap menampilkannya. Gejalanya
 * terbaca sebagai bug filter, padahal tanggalnya memang tidak tersimpan atau
 * tersimpan di kolom yang tidak dibaca filter.
 *
 * Aturan pembacaan tanggal di bawah SENGAJA meniru pDate() / cycleDates() /
 * lotUtilDate() di browser, bukan iq_date_iso() yang lebih ketat. Kalau
 * keduanya berbeda, laporan ini akan berbohong.
 *
 * Jalankan:
 *   php iqdash/tests/diagnose_dates.php                    # bulan lalu
 *   php iqdash/tests/diagnose_dates.php 2026-06-01 2026-06-30
 *   php iqdash/tests/diagnose_dates.php 2026-04-01 2026-06-30   # Q2
 */

if (PHP_SAPI !== 'cli') {
    http_response_code(404);
    exit("not available\n");
}

$ROOT = dirname(__DIR__, 2);
require_once $ROOT . '/lib/sheet_util.php';
require_once $ROOT . '/iqdash/iqdash_util.php';
require_once $ROOT . '/iqdash/iqdash_data.php';

/* ── Periode ───────────────────────────────────────────────────────────── */
$argFrom = $argv[1] ?? null;
$argTo   = $argv[2] ?? null;
if ($argFrom === null) {                      // default: bulan kalender lalu
    $first = new DateTimeImmutable('first day of last month');
    $from  = $first->setTime(0, 0, 0);
    $to    = $first->modify('last day of this month')->setTime(23, 59, 59);
} else {
    $f = DateTimeImmutable::createFromFormat('Y-m-d', $argFrom);
    $t = $argTo !== null ? DateTimeImmutable::createFromFormat('Y-m-d', $argTo) : null;
    if (!$f || ($argTo !== null && !$t)) {
        fwrite(STDERR, "Format tanggal harus YYYY-MM-DD.\n");
        exit(2);
    }
    $from = $f->setTime(0, 0, 0);
    $to   = $t ? $t->setTime(23, 59, 59) : null;
}

/* ── Pembaca tanggal — cermin pDate() di 02-period-filter.js ───────────────
 * Mengembalikan ['dt'=>DateTimeImmutable, 'rolled'=>bool] atau null.
 * `rolled` = tanggal yang secara kalender mustahil (mis. 31/02/2026). JS
 * TIDAK menolaknya — `new Date(2026,1,31)` diam-diam menjadi 3 Maret — jadi
 * nilai seperti itu tetap "terbaca" oleh dashboard tapi ke bulan yang salah.
 * Ditandai terpisah, bukan dibuang, supaya tidak menyembunyikan masalah. */
function dg_pdate($v): ?array {
    if ($v === null) return null;
    $s = trim((string) $v);
    if ($s === '' || preg_match('/^(tba|null|undefined)$/i', $s)) return null;

    $y = $mo = $d = null;
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})$/', $s, $m)) {
        [$y, $mo, $d] = [(int) $m[1], (int) $m[2], (int) $m[3]];
    } elseif (preg_match('#^(\d{1,2})/(\d{1,2})/(\d{2,4})$#', $s, $m)) {
        [$d, $mo, $y] = [(int) $m[1], (int) $m[2], (int) $m[3]];
        if ($y < 100) $y += 2000;
    } elseif (preg_match('/^(\d{1,2})[-\s]([A-Za-z]+)[-\s](\d{2,4})$/', $s, $m)) {
        $mo = iq_month_name_map()[strtolower($m[2])] ?? null;
        if ($mo === null) return null;
        [$d, $y] = [(int) $m[1], (int) $m[3]];
        if ($y < 100) $y += 2000;
    } else {
        return null;
    }
    if ($mo < 1 || $mo > 12 || $d < 1 || $d > 31) return null;

    $rolled = !checkdate($mo, $d, $y);
    $dt = (new DateTimeImmutable())->setDate($y, $mo, $d)->setTime(0, 0, 0); // sama seperti JS: bergulir
    return ['dt' => $dt, 'rolled' => $rolled];
}

/** Cermin _parseEtaLoose(): pDate(), lalu "April 2026" -> pertengahan bulan. */
function dg_eta($v): ?array {
    $hit = dg_pdate($v);
    if ($hit) return $hit;
    $s = trim((string) ($v ?? ''));
    if ($s === '') return null;
    if (preg_match('/^([A-Za-z]+)\s+(\d{2,4})$/', $s, $m)) {
        $mo = iq_month_name_map()[strtolower($m[1])] ?? null;
        if ($mo === null) return null;
        $y = (int) $m[2];
        if ($y < 100) $y += 2000;
        return ['dt' => (new DateTimeImmutable())->setDate($y, $mo, 15)->setTime(0, 0, 0), 'rolled' => false];
    }
    return null;
}

/** Cermin inPd(): tanggal null TIDAK PERNAH lolos saat periode aktif. */
function dg_in(?array $hit) {
    global $from, $to;
    if (!$hit) return false;
    $d = $hit['dt'];
    if ($from && $d < $from) return false;
    if ($to   && $d > $to)   return false;
    return true;
}

function dg_show($v): string {
    if ($v === null) return '(kosong)';
    $s = trim((string) $v);
    return $s === '' ? '(kosong)' : $s;
}
function dg_cut(string $s, int $n): string {
    return mb_strlen($s) <= $n ? $s : mb_substr($s, 0, $n - 1) . '…';
}

/* ── Baca sheet ────────────────────────────────────────────────────────── */
$cfg = sc_config();
$SID = $cfg['spreadsheets']['iqdash'];
$gs  = new GoogleSheets();

$label = $from->format('d M Y') . ' – ' . ($to ? $to->format('d M Y') : '∞');
echo "\n";
echo "═══ DIAGNOSTIK TANGGAL IQ DASH (read-only) ═══\n";
echo "Periode diperiksa : $label\n";
echo "Spreadsheet       : $SID\n";
echo "Membaca…\n";

$t      = iq_load_tables($gs, $SID);
$cycles = $t['cycles'];
$lots   = $t['lots'];
$comp   = $t['companies'];

$nameOf = [];
foreach ($comp as $c) $nameOf[(string) ($c['code'] ?? '')] = (string) ($c['full_name'] ?? '');

echo "Selesai — " . count($comp) . " company, " . count($cycles) . " cycle, " . count($lots) . " lot shipment.\n";

/* ── Analisis cycle ────────────────────────────────────────────────────── */
$visible = [];        // code => true   (terlihat filter, sesuai companyInPeriod)
$hiddenReal = [];     // cycle yang tanggal aslinya di periode tapi tak terbaca filter
$noDate = [];         // cycle ber-MT tanpa tanggal sama sekali
$rolled = [];         // tanggal mustahil

foreach ($cycles as $c) {
    $code = (string) ($c['company_code'] ?? '');
    $type = (string) ($c['cycle_type'] ?? '');
    $isSub = (bool) preg_match('/^submit #|^revision #/i', $type);
    $isObt = (bool) preg_match('/^obtained/i', $type);
    $isReq = (bool) preg_match('/^revision request/i', $type);

    $sd = dg_pdate($c['submit_date']  ?? null);
    $rd = dg_pdate($c['release_date'] ?? null);
    $pd = dg_pdate($c['pertek_date']  ?? null);
    $pid= dg_pdate($c['spi_date']     ?? null);

    // cycleDates() persis seperti di browser
    $submitMOI   = $isSub ? $sd : null;
    $pertekTerbit= $isSub ? $rd : null;          // TIDAK diperlebar ke pertek_date
    $submitMOT   = $isObt ? $sd : null;
    $spiTerbit   = $isObt ? ($rd ?: $pid) : null;

    $seen = dg_in($submitMOI) || dg_in($pertekTerbit) || dg_in($submitMOT) || dg_in($spiTerbit);
    if (!$seen && $isReq) $seen = dg_in($sd) || dg_in($rd);
    if ($seen) $visible[$code] = true;

    foreach ([['submit_date', $sd], ['release_date', $rd], ['pertek_date', $pd], ['spi_date', $pid]] as [$col, $hit]) {
        if ($hit && $hit['rolled']) {
            $rolled[] = [$code, $type, $col, dg_show($c[$col] ?? null)];
        }
    }

    // Bukti aktivitas di periode yang TIDAK dilihat filter.
    if (!$seen) {
        $ev = [];
        if ($isSub && !$rd && dg_in($pd)) {
            $ev[] = ['pertek_date', dg_show($c['pertek_date'] ?? null)];
        }
        if ($isObt && !$rd && !$pid && dg_in($pd)) {
            $ev[] = ['pertek_date', dg_show($c['pertek_date'] ?? null)];
        }
        if ($ev) {
            foreach ($ev as [$col, $val]) {
                $hiddenReal[] = [$code, $type, dg_show($c['release_date'] ?? null), $col, $val];
            }
        }
    }

    // Cycle ber-MT tapi tak punya satu pun tanggal terbaca.
    $mt = iq_num($c['mt'] ?? 0);
    if ($mt > 0 && !$sd && !$rd && !$pd && !$pid && ($isSub || $isObt)) {
        $noDate[] = [$code, $type, $mt];
    }
}

/* ── Analisis lot utilisasi ────────────────────────────────────────────── */
$lotNoDate = [];  $lotNoDateMT = 0.0;
$lotInPeriod = [];
foreach ($lots as $l) {
    $mt = iq_num($l['util_mt'] ?? 0);
    if ($mt <= 0) continue;
    $hit = dg_pdate($l['pib_date'] ?? null) ?: dg_eta($l['eta_jkt'] ?? null);
    if (!$hit) {
        $lotNoDate[] = [
            (string) ($l['company_code'] ?? ''), (string) ($l['product'] ?? ''),
            dg_show($l['lot_no'] ?? null), $mt,
            dg_show($l['eta_jkt'] ?? null), dg_show($l['pib_date'] ?? null),
        ];
        $lotNoDateMT += $mt;
    } elseif (dg_in($hit)) {
        $lotInPeriod[(string) ($l['company_code'] ?? '')] = true;
    }
}

/* ── Laporan ───────────────────────────────────────────────────────────── */
$hr = str_repeat('─', 78);

echo "\n$hr\n";
echo "A. RINGKASAN — $label\n$hr\n";
printf("  Company terlihat filter (cycle)      : %d\n", count($visible));
printf("  Company punya lot bertanggal periode : %d\n", count($lotInPeriod));
$union = $visible + $lotInPeriod;
printf("  Gabungan (yang MESTINYA tampil)      : %d\n", count($union));
if (count($visible)) {
    $codes = array_keys($visible); sort($codes);
    echo "  -> " . dg_cut(implode(', ', $codes), 300) . "\n";
}

echo "\n$hr\n";
echo "B. TERSEMBUNYI — tanggal asli ADA di periode tapi filter tidak melihatnya\n";
echo "   Sebab: release_date bukan tanggal (biasanya berisi NOMOR dokumen),\n";
echo "   sedangkan filter sisi Submit/Revision hanya membaca release_date.\n$hr\n";
if (!$hiddenReal) {
    echo "  (tidak ada)\n";
} else {
    printf("  %-6s %-22s %-26s %-26s %s\n", 'CODE', 'CYCLE', 'release_date (terbaca?)', 'tanggal asli', 'DAMPAK');
    $lostCodes = [];
    foreach ($hiddenReal as [$code, $type, $rdRaw, $col, $val]) {
        // Sebuah company bisa tetap tampil lewat cycle LAIN yang tanggalnya
        // terbaca. Yang benar-benar merugikan adalah company yang tidak punya
        // jalan masuk lain sama sekali — itulah yang "hilang" dari periode.
        $lost = !isset($visible[$code]) && !isset($lotInPeriod[$code]);
        if ($lost) $lostCodes[$code] = true;
        printf("  %-6s %-22s %-26s %-26s %s\n",
            $code, dg_cut($type, 22), dg_cut($rdRaw, 26), "$col = $val",
            $lost ? 'HILANG total' : 'tampil via cycle lain');
    }
    printf("\n  >> %d cycle bermasalah.\n", count($hiddenReal));
    if ($lostCodes) {
        $lc = array_keys($lostCodes); sort($lc);
        printf("  >> %d company HILANG SAMA SEKALI dari periode ini: %s\n",
            count($lc), implode(', ', $lc));
        echo "     Inilah yang membuat sebuah bulan terlihat 'kosong'.\n";
    }
}

echo "\n$hr\n";
echo "C. CYCLE ber-MT TANPA tanggal sama sekali (hilang dari SEMUA periode)\n$hr\n";
if (!$noDate) {
    echo "  (tidak ada)\n";
} else {
    printf("  %-6s %-30s %12s\n", 'CODE', 'CYCLE', 'MT');
    foreach ($noDate as [$code, $type, $mt]) {
        printf("  %-6s %-30s %12s\n", $code, dg_cut($type, 30), number_format($mt));
    }
    printf("\n  >> %d cycle.\n", count($noDate));
}

echo "\n$hr\n";
echo "D. LOT UTILISASI ber-MT TANPA tanggal (eta_jkt & pib_date tak terbaca)\n$hr\n";
if (!$lotNoDate) {
    echo "  (tidak ada)\n";
} else {
    printf("  %-6s %-18s %-5s %10s  %-14s %s\n", 'CODE', 'PRODUK', 'LOT', 'MT', 'eta_jkt', 'pib_date');
    foreach ($lotNoDate as [$code, $prod, $lot, $mt, $eta, $pib]) {
        printf("  %-6s %-18s %-5s %10s  %-14s %s\n",
            $code, dg_cut($prod, 18), $lot, number_format($mt), dg_cut($eta, 14), $pib);
    }
    printf("\n  >> %d lot, total %s MT tidak masuk periode manapun.\n",
        count($lotNoDate), number_format($lotNoDateMT));
}

echo "\n$hr\n";
echo "E. TANGGAL MUSTAHIL — di browser bergulir diam-diam ke bulan lain\n$hr\n";
if (!$rolled) {
    echo "  (tidak ada)\n";
} else {
    foreach ($rolled as [$code, $type, $col, $raw]) {
        printf("  %-6s %-22s %-14s %s\n", $code, dg_cut($type, 22), $col, $raw);
    }
}

echo "\n$hr\n";
echo "KESIMPULAN\n$hr\n";
if (!$hiddenReal && !$noDate && !$lotNoDate) {
    echo "  Tidak ada record yang hilang karena tanggal pada periode ini.\n";
    echo "  Kalau dashboard tetap terlihat kosong, penyebabnya BUKAN tanggal —\n";
    echo "  periksa mode filter (Submit / Release / keduanya) di panel periode.\n";
} else {
    if ($hiddenReal) {
        echo "  - " . count($hiddenReal) . " cycle punya tanggal asli di periode ini tapi tidak\n";
        echo "    terlihat filter (bagian B). Perbaikannya: buka company tersebut di\n";
        echo "    Revision Management lalu simpan ulang — sejak perbaikan 2026-07-30,\n";
        echo "    penyimpanan menulis TANGGAL ke release_date dan mengisi kolom khusus.\n";
    }
    if ($noDate)   echo "  - " . count($noDate) . " cycle ber-MT sama sekali tanpa tanggal (bagian C).\n";
    if ($lotNoDate) {
        echo "  - " . count($lotNoDate) . " lot utilisasi (" . number_format($lotNoDateMT) . " MT) tanpa tanggal (bagian D);\n";
        echo "    isi ETA JKT atau PIB Date pada lot tersebut.\n";
    }
}
echo "\n(read-only — tidak ada perubahan apa pun pada spreadsheet)\n\n";
