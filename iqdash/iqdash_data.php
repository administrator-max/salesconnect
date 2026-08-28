<?php
/**
 * iqdash table loader + /api/data payload assembly (PRE-LEDGER).
 *
 * PHP port of IQ/server.js `_buildDataPayload()` (Sheets branch only —
 * the Postgres/`pg` branch in the JS is never used here) and the cycle
 * dedup logic in `getCyclesForSheets()`. Ports everything UP TO but
 * NOT INCLUDING the `applyLedger` quota-ledger overlay (server.js:1223+)
 * — that overlay is a later task (ledger overlay, ra synthesis from the
 * ledger, `_ledgerObtained` etc. are intentionally absent here).
 *
 * Two entry points:
 *   iq_load_tables(GoogleSheets $gs, string $sid): array
 *     Reads every tab this module needs and returns them keyed the way
 *     the rest of this file (and later tasks) expect. Does live Sheets
 *     I/O — not unit-testable offline.
 *   iq_build_payload_raw(array $t): array
 *     Pure function: takes the tables array (shape produced by
 *     iq_load_tables, or a synthetic equivalent) and returns
 *     {spi, pending, ra, products, productAliases, companyDirectory, lastUpdate}.
 */

require_once __DIR__ . '/iqdash_util.php';

/**
 * Tab yang dibaca /api/data. Didaftarkan terpisah supaya warmValues() dan
 * iq_load_tables() TIDAK BISA melenceng: tab yang ditambahkan di bawah tapi
 * lupa didaftarkan di sini hanya kehilangan percepatannya, tidak jadi salah —
 * tapi keduanya memang dimaksudkan selalu sama.
 */
const IQ_TABS = [
    'companies', 'cycles', 'cycle_products', 'cycle_utilization',
    'company_product_stats', 'revision_changes', 'company_shipments',
    'realizations', 'product_aliases', 'products', 'company_directory',
    'company_products', 'company_reapply_targets', 'ra_records',
    'pending_meta', 'pertek_perubahan_release',
];

/* ── iq_load_tables ─────────────────────────────────────────────────── */

/**
 * Read every Sheets tab the /api/data payload needs and return them as a
 * flat tables array. Each value is a list of assoc rows (header-keyed),
 * coerced the same way IQ/lib/sheetsStore.js's `coerce()` does (''/null
 * -> null, 'TRUE'/'FALSE' -> bool) so downstream logic can use the exact
 * same truthiness rules as the JS it was ported from.
 */
function iq_load_tables(GoogleSheets $gs, string $sid): array {
    /* SATU panggilan untuk keenam belas tab, bukan enam belas panggilan.
       warmValues() hanya mengisi cache dengan kunci yang sama dengan
       getValues(), jadi $get() di bawah tidak berubah sedikit pun — ia cuma
       menemukan datanya sudah ada. Kalau batchGet gagal, $get() membaca satu
       per satu persis seperti sebelumnya.

       Alasannya ada di komentar warmValues(): satu service account melayani
       semua pengguna, jadi 16 baca per muat halaman menghabiskan kuota tim
       hanya dalam beberapa kali refresh. */
    $gs->warmValues($sid, IQ_TABS);

    $get = function (string $tab) use ($gs, $sid): array {
        $rows = $gs->table($sid, $tab)['rows'];
        return array_map('iq_coerce_row', $rows);
    };

    return [
        'companies'       => $get('companies'),
        'cycles'          => $get('cycles'),
        'cycleProducts'   => $get('cycle_products'),
        /* Utilisasi PER SIKLUS PER PRODUK, tiap baris dengan tanggalnya sendiri
           (master 05/08/2026 memecah "Utilization (MT)" menjadi
           "Utilization #1/#2/#3"). Tab TERPISAH, bukan kolom di cycle_products:
           setiap PATCH cycles menulis ulang seluruh baris cycle_products milik
           company itu dengan id baru dan hanya membaca `products`, jadi
           utilisasi yang dititipkan di sana akan terhapus diam-diam. Berkunci
           (company_code, cycle_type, product) supaya selamat dari penulisan
           ulang tersebut. */
        'cycleUtil'       => $get('cycle_utilization'),
        'stats'           => $get('company_product_stats'),
        'revisions'       => $get('revision_changes'),
        'lots'            => $get('company_shipments'),
        'realizations'    => $get('realizations'),
        'aliases'         => $get('product_aliases'),
        'products'        => $get('products'),
        'directory'       => $get('company_directory'),
        'companyProducts' => $get('company_products'),
        'reapply'         => $get('company_reapply_targets'),
        'ra'              => $get('ra_records'),
        'pendingMeta'     => $get('pending_meta'),
        'pertekRelease'   => $get('pertek_perubahan_release'),
    ];
}

/** Apply iq_coerce() to every field of a GoogleSheets::table() row, leaving
 *  the internal '_row' sheet-row-number marker untouched. */
function iq_coerce_row(array $row): array {
    $out = [];
    foreach ($row as $k => $v) {
        $out[$k] = ($k === '_row') ? $v : iq_coerce($v);
    }
    return $out;
}

/* ── small helpers ──────────────────────────────────────────────────── */

/** True when $v is neither null nor '' — mirrors JS `!= null` after coerce()
 *  has already turned empty cells into null (so '' only shows up when the
 *  caller passed an uncoerced/synthetic row, which we tolerate too). */
function iq_present($v): bool {
    return $v !== null && $v !== '';
}

/**
 * Tahun kuota satu baris sheet — kolom `quota_year`.
 *
 * Kolomnya BOLEH belum ada di tab. Baris tanpa kolom itu memulangkan null,
 * dan frontend memperlakukan null sebagai tahun bawaan (QUOTA_YEAR_DEFAULT,
 * 2026) — persis keadaan seluruh data hari ini. Jadi dukungan tahun ini TIDAK
 * mengubah satu angka pun sebelum ada baris 2027 yang benar-benar ditandai.
 * Penambah kolomnya: tools/add_quota_year_columns.php.
 */
function iq_quota_year($v): ?int {
    if (!iq_present($v)) return null;
    $s = trim((string) $v);
    return preg_match('/^\d{4}$/', $s) ? (int) $s : null;
}

/** Sort a list of rows by numeric `sort_order` ascending (stable — PHP 8 usort is stable). */
function iq_sort_by_sort_order(array $rows): array {
    $copy = array_values($rows);
    usort($copy, fn($a, $b) => iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0));
    return $copy;
}

/** Mirror JS `isNaN(c.mt) ? c.mt : Number(c.mt)` exactly:
 *  - null stays null (absence preserved).
 *  - '' becomes 0 (JS `Number('') === 0`).
 *  - a plain numeric string (no thousands-commas) becomes a number.
 *  - anything else (e.g. 'TBA', '1,234', other text) passes through as the
 *    raw string — this is the JS `isNaN` branch. Do NOT strip commas:
 *    `is_numeric('1,234')` is false in PHP, matching JS `Number('1,234')` = NaN. */
function iq_cycle_mt($v) {
    if ($v === null) return null;
    $s = (string) $v;
    if ($s === '') return 0;
    return is_numeric($s) ? $s + 0 : $v;
}

/** Mirror JS `new Date(v).toISOString()` for a Sheets date/datetime string; null on failure. */
function iq_iso_datetime($v): ?string {
    if (!iq_present($v)) return null;
    $ts = strtotime((string) $v);
    if ($ts === false) return null;
    return gmdate('Y-m-d\TH:i:s.000\Z', $ts);
}

/* ── cycles (mirrors getCyclesForSheets in IQ/server.js:244) ──────────── */

/**
 * @param array $codeSet        map of company_code => true (the companies in play)
 * @param array $cyclesRows     rows from the 'cycles' tab
 * @param array $cycleProductsRows rows from the 'cycle_products' tab
 * @return array company_code => list of cycle objects (camelCase, JS shape)
 */
function iq_get_cycles_for(array $codeSet, array $cyclesRows, array $cycleProductsRows): array {
    if (!count($codeSet)) return [];

    $all = array_values(array_filter($cyclesRows, fn($c) => isset($codeSet[$c['company_code'] ?? null])));
    usort($all, fn($a, $b) => iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0));

    // Dedup by company_code|cycle_type, keeping the lowest-sort_order row
    // (first one seen, since $all is already sorted ascending by sort_order).
    $seen = [];
    foreach ($all as $c) {
        $k = ($c['company_code'] ?? '') . '|' . ($c['cycle_type'] ?? '');
        if (!isset($seen[$k])) $seen[$k] = $c;
    }
    $cRows = array_values($seen);
    usort($cRows, function ($a, $b) {
        $ac = (string) ($a['company_code'] ?? '');
        $bc = (string) ($b['company_code'] ?? '');
        if ($ac !== $bc) return $ac < $bc ? -1 : 1;
        return iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0);
    });

    $idSet = [];
    foreach ($cRows as $r) { $idSet[(string) ($r['id'] ?? '')] = true; }

    $cpMap = [];
    foreach ($cycleProductsRows as $r) {
        $cid = (string) ($r['cycle_id'] ?? '');
        if (!isset($idSet[$cid])) continue;
        if (!isset($cpMap[$cid])) $cpMap[$cid] = [];
        $cpMap[$cid][$r['product'] ?? ''] = iq_cycle_mt($r['mt'] ?? null);
    }

    $byCode = [];
    foreach ($cRows as $c) {
        $code = $c['company_code'] ?? '';
        if (!isset($byCode[$code])) $byCode[$code] = [];
        $byCode[$code][] = [
            'type'        => $c['cycle_type'] ?? '',
            'mt'          => iq_cycle_mt($c['mt'] ?? null),
            'submitType'  => $c['submit_type'] ?? null,
            'submitDate'  => $c['submit_date'] ?? null,
            'releaseType' => $c['release_type'] ?? null,
            'releaseDate' => $c['release_date'] ?? null,
            'status'      => $c['status'] ?? null,
            'products'    => $cpMap[(string) ($c['id'] ?? '')] ?? [],
            'pertekDate'  => $c['pertek_date'] ?? '',
            'spiDate'     => $c['spi_date'] ?? '',
            '_fromRevReq' => $c['from_rev_req'] ?? false,
            'quotaYear'   => iq_quota_year($c['quota_year'] ?? null),
        ];
    }
    return $byCode;
}

/**
 * Selaraskan kolom utilisasi/saldo dengan `utilCycles`.
 *
 * Sejak 2026-08-05 `cycle_utilization` adalah SUMBER utilisasi, tapi
 * `company_product_stats.utilization_mt` / `available_mt` tetap dikirim apa
 * adanya — dan kolom itu TIDAK pernah diperbarui saat utilisasi bertambah.
 * Jadilah dua angka untuk satu ukuran, dan tiap pembaca yang kebetulan
 * menyentuh kolom lama menampilkan yang basi. Sudah tiga kali terjadi di
 * permukaan berbeda (total, daftar per produk, form Sales), ketiganya ketahuan
 * lewat laporan tim satu per satu — bukan sekaligus.
 *
 * Ditambal DI SUMBER, bukan di 12 titik pembaca: begitu payload keluar semua
 * pembaca ikut benar — termasuk PDF Summary dan ekspor XLSX — dan pembaca BARU
 * tidak bisa mengulang bug yang sama.
 *
 * Obtained per produk SENGAJA dipertahankan: definisinya util + avail dari
 * stats, dan getObtainedByProdAgg() di frontend bersandar padanya. Yang diubah
 * hanya PEMBAGIAN antara terpakai dan tersisa, bukan jumlahnya. Contoh GKL:
 * 3.000 terpakai / 0 sisa  ->  2.400 terpakai / 600 sisa, obtained tetap 3.000.
 *
 * Dipanggil DUA kali: sekali saat objek dibangun, dan sekali lagi sesudah
 * iq_apply_ledger() — overlay ledger menulis ulang keempat kolom ini dari
 * berkas statis quotaLedger.json, jadi tanpa panggilan kedua hasilnya tertimpa
 * kembali (itu yang terjadi pada percobaan pertama).
 */
function iq_sync_util_with_cycles(array &$co, array $aliasMap = []): void {
    $uc = $co['utilCycles'] ?? [];
    if (!is_array($uc) || !count($uc)) return;

    $canon = fn(string $p): string => $aliasMap[$p] ?? $p;
    $utilByProd  = $co['utilizationByProd'] ?? [];
    $availByProd = $co['availableByProd'] ?? [];

    // Ejaan yang dipakai stats, supaya bentuk kunci keluaran tidak berubah.
    $ejaan = [];
    foreach (array_keys($utilByProd) as $p)  { $ejaan[$canon((string) $p)] = $p; }
    foreach (array_keys($availByProd) as $p) { if (!isset($ejaan[$canon((string) $p)])) $ejaan[$canon((string) $p)] = $p; }

    // Obtained per produk = pasangan stats (util + avail) — dipertahankan.
    $obtProd = [];
    foreach ($utilByProd as $p => $v)  { $c = $canon((string) $p); $obtProd[$c] = ($obtProd[$c] ?? 0) + iq_num($v); }
    foreach ($availByProd as $p => $v) { $c = $canon((string) $p); $obtProd[$c] = ($obtProd[$c] ?? 0) + iq_num($v); }

    // Utilisasi sebenarnya, dari rincian per siklus.
    $utilBaru = [];
    $sidikMaster = [];   // produk|hari|MT dari master -> untuk kenali catatan kembar
    $hariAkhir  = [];    // produk -> hari TERAKHIR yang master tahu
    foreach ($uc as $u) {
        $c = $canon((string) ($u['product'] ?? ''));
        $mt = iq_num($u['mt'] ?? 0);
        $utilBaru[$c] = ($utilBaru[$c] ?? 0) + $mt;
        $hari = iq_util_day_key($u['date'] ?? null);
        if ($hari !== null) {
            $sidikMaster[$c . '|' . $hari . '|' . (string) round($mt, 3)] = true;
            if (!isset($hariAkhir[$c]) || $hari > $hariAkhir[$c]) $hariAkhir[$c] = $hari;
        }
    }

    /* Lot Sales yang BERTANGGAL ikut dihitung — penerapan keputusan 2026-08-07
       ("input Sales jadi sumbernya").

       Dulu di sini berlaku "master sudah bicara -> lot dilewati": begitu master
       menyebut utilisasi sebuah produk, lot Sales untuk produk itu dibuang
       seluruhnya. Maksudnya mencegah hitung ganda, tapi akibatnya input Sales
       yang benar-benar BARU ikut terbuang diam-diam. KAN kena persis begitu
       (dilaporkan 2026-08-10): master mencatat GI ALLOY 80 MT @ 31/03/2026,
       lalu tim mengisi 60 MT @ 07/08/2026 atas kuota re-apply Obtained #2.
       Keduanya peristiwa berbeda dan seharusnya berjumlah 140 = obtained,
       sisa 0 — yang tampil 80 terpakai, 60 masih "tersedia". Bagi tim itu
       terlihat seperti isian yang hilang lagi.

       Tapi MENJUMLAHKAN begitu saja juga salah, dan jauh lebih berbahaya.
       Sapuan seluruh data (2026-08-10) menunjukkan lot pada UMUMNYA mencatat
       peristiwa yang SAMA dengan master, cuma lebih rinci: ADP lot 100 = master
       Utilization #2 100; HKG 250 = #2 250; JKT 100 = #2 100; IKM lot 2.000
       masih bagian dari master 2.300. Menjumlahkan semuanya akan melipatgandakan
       utilisasi mereka — IKM jadi 4.300 dari obtained 4.150.

       Yang membedakan KAN: tanggal lotnya SESUDAH seluruh baris master. Master
       terakhir tahu 31/03/2026; tim mengisi 07/08/2026. Itu pemakaian yang
       memang belum pernah dilihat master — nanti muncul sebagai Utilization #2
       saat master di-impor ulang.

       Jadi lot ditambahkan hanya bila KETIGA syarat ini terpenuhi:

         1. bukan catatan kembar — produk, hari, dan MT sama persis;
         2. tanggalnya SESUDAH hari terakhir yang master tahu untuk produk itu
            (master diam sama sekali = otomatis lolos: mengisi kekosongan bukan
            membantah master — GKL GL ALLOY, IKM SEAMLESS PIPE);
         3. hasilnya tidak melampaui obtained produk itu. Ini pagar terakhir,
            dan bukan sekadar heuristik: memakai lebih banyak dari yang didapat
            mustahil. Tanpa pagar ini, satu tanggal yang salah ketik cukup untuk
            melipatgandakan angka sebuah produk.

       WAJIB bertanggal: tanpa tanggal, MT itu tidak bisa ditempatkan di periode
       mana pun, dan menghitungnya di total saja akan membuat H1 + H2 tidak lagi
       sama dengan setahun — sifat partisi yang selama ini dijaga. */
    foreach (($co['shipments'] ?? []) as $prod => $lots) {
        $c = $canon((string) $prod);
        foreach ((array) $lots as $l) {
            $mt = iq_num($l['utilMT'] ?? 0);
            if ($mt <= 0) continue;

            $hari = iq_util_day_key($l['utilDate'] ?? null);
            if ($hari === null) continue;                                                       // 0. tanpa tanggal
            if (isset($sidikMaster[$c . '|' . $hari . '|' . (string) round($mt, 3)])) continue;  // 1. kembar
            if (isset($hariAkhir[$c]) && $hari <= $hariAkhir[$c]) continue;                      // 2. sudah terliput

            $atap = $obtProd[$c] ?? 0;                                                           // 3. pagar obtained
            if ($atap > 0 && ($utilBaru[$c] ?? 0) + $mt > $atap + 0.001) continue;

            $utilBaru[$c] = ($utilBaru[$c] ?? 0) + $mt;
        }
    }

    /* Utilisasi versi stats, per produk kanonik. Dipakai HANYA sebagai
       cadangan terakhir di bawah — lihat alasannya di sana. */
    $utilStats = [];
    foreach ($utilByProd as $p => $v) {
        $c = $canon((string) $p);
        $utilStats[$c] = ($utilStats[$c] ?? 0) + iq_num($v);
    }

    $nUtil = [];
    $nAvail = [];
    foreach (array_unique(array_merge(array_keys($obtProd), array_keys($utilBaru))) as $c) {
        $key = $ejaan[$c] ?? $c;
        /* Urutan sumber: rincian siklus / lot bertanggal ($utilBaru) lebih
           dulu, kolom stats hanya bila KEDUANYA diam soal produk itu.

           Tanpa baris terakhir ini, aturan "siklus yang berlaku" tanpa sengaja
           berlaku PER COMPANY, bukan per produk: begitu satu produk punya
           rincian siklus, produk lain milik company yang sama yang TIDAK
           disebut siklus mana pun ikut dinolkan — padahal yang menyebut
           pemakaiannya cuma stats. IKM SEAMLESS PIPE 275 MT hilang persis
           begitu (utilisasi tercatat 2.300, seharusnya 2.575), dan sisanya
           malah tampil 2.100 — 275 MT kuota terpakai ditawarkan lagi sebagai
           tersedia. Dilaporkan lewat selisih dengan SCOT 2026-08-10; SCOT
           memang punya kontrak Arsen SSP #50 sebesar 275 MT untuk IKM.

           Ini kelanjutan langsung dari aturan lot di atas ("mengisi kekosongan
           bukan membantah master"): di mana master bicara ia tetap menang, di
           mana ia diam kita tidak boleh menganggapnya nol. */
        $u   = array_key_exists($c, $utilBaru) ? $utilBaru[$c] : ($utilStats[$c] ?? 0);
        // Produk yang hanya muncul di utilCycles: obtained-nya minimal sebesar
        // yang terpakai — menganggapnya 0 akan membuat saldo negatif.
        $o   = $obtProd[$c] ?? $u;
        $nUtil[$key]  = round($u * 1000) / 1000;
        $nAvail[$key] = max(0, round(($o - $u) * 1000) / 1000);
    }

    $co['utilizationByProd'] = $nUtil;
    $co['availableByProd']   = $nAvail;
    $co['utilizationMT']     = round(array_sum($nUtil) * 1000) / 1000;
    $co['availableQuota']    = round(array_sum($nAvail) * 1000) / 1000;
}

/* ── per-company object (mirrors buildCompanyObj in IQ/server.js:337) ──── */

function iq_build_company_obj(
    array $co,
    array $products,
    array $stats,
    array $revs,
    array $cycles,
    ?array $pendMeta,
    array $shipments,
    array $reapplyTargets,
    array $cycleUtil = [],
    array $aliasMap = []
): array {
    $utilizationByProd = [];
    $availableByProd   = [];
    $realizationByProd = [];
    $etaByProd         = [];
    $arrivedByProd     = [];
    $statsYearByProd   = [];
    foreach ($stats as $s) {
        $prod = $s['product'] ?? '';
        if (iq_present($s['utilization_mt'] ?? null)) $utilizationByProd[$prod] = iq_num($s['utilization_mt']);
        if (iq_present($s['available_mt'] ?? null))   $availableByProd[$prod]   = iq_num($s['available_mt']);
        if (iq_present($s['realization_mt'] ?? null)) $realizationByProd[$prod] = iq_num($s['realization_mt']);
        if (($s['eta_jkt'] ?? null) !== null)          $etaByProd[$prod]         = $s['eta_jkt'];
        $arrivedByProd[$prod] = $s['arrived'] ?? false;
        /* Tahun kuota dititipkan pada KUNCI (produk), bukan sebagai peta
           nilai per tahun: iq_sync_util_with_cycles() di bawah menulis ulang
           NILAI utilizationByProd/availableByProd dari utilCycles, jadi peta
           nilai bertahun akan jadi basi diam-diam. Kunci produk tidak pernah
           ditulis ulang, dan frontend mengiris petanya lewat peta ini. */
        $sy = iq_quota_year($s['quota_year'] ?? null);
        if ($sy !== null) $statsYearByProd[$prod] = $sy;
    }

    /* Utilisasi per siklus per produk — sumber pengirisan periode sejak
       2026-08-05. `utilizationByProd` di atas tetap dipakai untuk TOTAL
       sepanjang waktu; yang di bawah ini membawa TANGGAL per potongan,
       sehingga satu produk yang dipakai lintas tahun tidak lagi mendarat
       seluruhnya pada tanggal terakhir. */
    $utilCycles = [];
    foreach ($cycleUtil as $u) {
        $mt = iq_num($u['util_mt'] ?? 0);
        if ($mt <= 0) continue;
        $utilCycles[] = [
            'cycle'     => (string) ($u['cycle_type'] ?? ''),
            'product'   => (string) ($u['product'] ?? ''),
            'mt'        => $mt,
            'date'      => (string) ($u['util_date'] ?? ''),
            'quotaYear' => iq_quota_year($u['quota_year'] ?? null),
        ];
    }


    $mapRev = fn($r) => [
        'prod'  => $r['product'] ?? null,
        'mt'    => iq_present($r['mt'] ?? null) ? iq_num($r['mt']) : null,
        'label' => $r['label'] ?? null,
    ];
    $fromRows = array_values(array_filter($revs, fn($r) => ($r['direction'] ?? '') === 'from'));
    usort($fromRows, fn($a, $b) => iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0));
    $revFromArr = array_map($mapRev, $fromRows);

    $toRows = array_values(array_filter($revs, fn($r) => ($r['direction'] ?? '') === 'to'));
    usort($toRows, fn($a, $b) => iq_num($a['sort_order'] ?? 0) <=> iq_num($b['sort_order'] ?? 0));
    $revToArr = array_map($mapRev, $toRows);

    // rev_note holds either free text OR a JSON-encoded salesRevRequest object.
    $rn = $co['rev_note'] ?? '';
    $revNote = $rn;
    $salesRevRequest = [];
    if (is_string($rn) && trim($rn) !== '') {
        $parsed = json_decode($rn);
        if ($parsed !== null && is_object($parsed)) {
            $revNote = '';
            $salesRevRequest = json_decode(json_encode($parsed), true) ?: [];
        }
    }

    $obj = [
        'code'            => $co['code'] ?? null,
        'fullName'        => $co['full_name'] ?? '',
        'group'           => $co['grp'] ?? null,
        'section'         => $co['section'] ?? null,
        'products'        => array_values(array_map(fn($p) => $p['product'] ?? null, iq_sort_by_sort_order($products))),
        'submit1'         => iq_present($co['submit1'] ?? null) ? iq_num($co['submit1']) : null,
        'obtained'        => iq_present($co['obtained'] ?? null) ? iq_num($co['obtained']) : 0,
        /* Diisi apa adanya di sini; iq_sync_util_with_cycles() di bawah yang
           menyelaraskannya dengan utilCycles bila company punya rinciannya. */
        'utilizationMT'   => iq_num($co['utilization_mt'] ?? 0),
        'availableQuota'  => iq_present($co['available_quota'] ?? null) ? iq_num($co['available_quota']) : null,
        'revType'         => $co['rev_type'] ?? 'none',
        'revNote'         => $revNote,
        'salesRevRequest' => $salesRevRequest,
        'revSubmitDate'   => $co['rev_submit_date'] ?? '',
        'revStatus'       => $co['rev_status'] ?? '',
        'revMT'           => iq_num($co['rev_mt'] ?? 0),
        'revFrom'         => $revFromArr,
        'revTo'           => $revToArr,
        'remarks'         => $co['remarks'] ?? '',
        'spiRef'          => $co['spi_ref'] ?? '',
        'statusUpdate'    => $co['status_update'] ?? '',
        'pertekNo'        => $co['pertek_no'] ?? '',
        'spiNo'           => $co['spi_no'] ?? '',
        'updatedBy'       => $co['updated_by'] ?? '',
        'updatedDate'     => $co['updated_date'] ?? '',
        // ── Concurrency token — ISO timestamp of last server-side write.
        'updatedAt'       => iq_iso_datetime($co['updated_at'] ?? null),
        'utilizationByProd' => $utilizationByProd,
        'availableByProd'   => $availableByProd,
        'cycles'          => $cycles,
        'shipments'       => $shipments,
        'reapplyTargets'  => array_values($reapplyTargets),
    ];
    if (count($utilCycles))        $obj['utilCycles']        = $utilCycles;
    if (count($statsYearByProd))   $obj['statsYearByProd']   = $statsYearByProd;
    if (count($realizationByProd)) $obj['realizationByProd'] = $realizationByProd;
    if (count($etaByProd))         $obj['etaByProd']         = $etaByProd;
    if (count($arrivedByProd))     $obj['arrivedByProd']     = $arrivedByProd;
    if (($co['section'] ?? '') === 'PENDING' && $pendMeta) {
        $obj['mt']     = iq_num($pendMeta['mt'] ?? 0);
        $obj['status'] = $pendMeta['status'] ?? '';
        $obj['date']   = $pendMeta['date'] ?? '';
    }
    iq_sync_util_with_cycles($obj, $aliasMap);
    return $obj;
}

/* ── payload assembly (mirrors _buildDataPayload in IQ/server.js:998) ──── */

/**
 * Assemble the /api/data payload WITHOUT the quota-ledger overlay.
 * Return shape matches IQ/server.js:1351 minus `_ledger*` fields.
 */
function iq_build_payload_raw(array $t): array {
    $productMeta = iq_sort_by_sort_order($t['products'] ?? []);
    $dirRows     = iq_sort_by_sort_order($t['directory'] ?? []);

    $companies = array_values($t['companies'] ?? []);
    usort($companies, function ($a, $b) {
        $as = (string) ($a['section'] ?? '');
        $bs = (string) ($b['section'] ?? '');
        if ($as !== $bs) return $as < $bs ? -1 : 1;
        $ac = (string) ($a['code'] ?? '');
        $bc = (string) ($b['code'] ?? '');
        if ($ac === $bc) return 0;
        return $ac < $bc ? -1 : 1;
    });

    $productsList = array_map(fn($p) => [
        'name'       => $p['name'] ?? '',
        'hsCode'     => $p['hs_code'] ?? '',
        'colorSolid' => $p['color_solid'] ?? '#64748b',
        'colorLight' => $p['color_light'] ?? '#f1f5f9',
        'colorText'  => $p['color_text'] ?? '#475569',
        'sortOrder'  => (int) iq_num($p['sort_order'] ?? 0),
    ], $productMeta);

    $aliasMap = [];
    foreach (($t['aliases'] ?? []) as $a) {
        $aliasMap[$a['alias']] = $a['canonical'];
    }

    $companyDirectory = array_map(fn($r) => [
        'fullName'     => $r['full_name'] ?? '',
        'abbreviation' => $r['abbreviation'] ?? '',
        'sortOrder'    => (int) iq_num($r['sort_order'] ?? 0),
    ], $dirRows);

    $codes = array_values(array_filter(array_map(fn($c) => $c['code'] ?? '', $companies), fn($c) => $c !== ''));
    if (!count($codes)) {
        return [
            'spi'              => [],
            'pending'          => [],
            'ra'               => [],
            'products'         => $productsList,
            'productAliases'   => $aliasMap,
            'companyDirectory' => $companyDirectory,
            'lastUpdate'       => null,
        ];
    }
    $codeSet = array_fill_keys($codes, true);

    $filterByCode = fn(array $rows) => array_values(array_filter($rows, fn($r) => isset($codeSet[$r['company_code'] ?? null])));

    $products = $filterByCode($t['companyProducts'] ?? []);
    usort($products, function ($x, $y) {
        $xc = (string) ($x['company_code'] ?? '');
        $yc = (string) ($y['company_code'] ?? '');
        if ($xc !== $yc) return $xc < $yc ? -1 : 1;
        return iq_num($x['sort_order'] ?? 0) <=> iq_num($y['sort_order'] ?? 0);
    });

    $stats      = $filterByCode($t['stats'] ?? []);
    $revChanges = $filterByCode($t['revisions'] ?? []);
    $pendMetas  = $filterByCode($t['pendingMeta'] ?? []);
    $raRows     = $filterByCode($t['ra'] ?? []);

    $shipRows = $filterByCode($t['lots'] ?? []);
    usort($shipRows, function ($x, $y) {
        $xc = (string) ($x['company_code'] ?? '');
        $yc = (string) ($y['company_code'] ?? '');
        if ($xc !== $yc) return $xc < $yc ? -1 : 1;
        $xp = (string) ($x['product'] ?? '');
        $yp = (string) ($y['product'] ?? '');
        if ($xp !== $yp) return $xp < $yp ? -1 : 1;
        return iq_num($x['lot_no'] ?? 0) <=> iq_num($y['lot_no'] ?? 0);
    });

    $reapplyRows = $filterByCode($t['reapply'] ?? []);
    $realzRows   = $filterByCode($t['realizations'] ?? []);

    $cyclesMap = iq_get_cycles_for($codeSet, $t['cycles'] ?? [], $t['cycleProducts'] ?? []);

    $byCode = function (array $rows): array {
        $m = [];
        foreach ($rows as $r) {
            $k = $r['company_code'] ?? '';
            $m[$k][] = $r;
        }
        return $m;
    };
    $prodMap  = $byCode($products);
    $statsMap = $byCode($stats);
    $revMap   = $byCode($revChanges);
    $cycleUtilMap = $byCode($filterByCode($t['cycleUtil'] ?? []));

    $pendMap = [];
    foreach ($pendMetas as $p) { $pendMap[$p['company_code'] ?? ''] = $p; }

    $shipMap = [];
    foreach ($shipRows as $s) {
        $code = $s['company_code'] ?? '';
        $prod = $s['product'] ?? '';
        if (!isset($shipMap[$code])) $shipMap[$code] = [];
        if (!isset($shipMap[$code][$prod])) $shipMap[$code][$prod] = [];
        $shipMap[$code][$prod][] = [
            'lotNo'        => $s['lot_no'] ?? null,
            'utilMT'       => iq_num($s['util_mt'] ?? 0),
            /* Tanggal kuota DIPAKAI — beda peristiwa dari etaJKT (perkiraan
               barang TIBA) yang rutin berjarak berbulan-bulan. Sebelum kolom
               ini ada (2026-08-07), lotUtilDate() terpaksa menebak dari
               pib_date/eta_jkt. */
            'utilDate'     => $s['util_date'] ?? '',
            'etaJKT'       => $s['eta_jkt'] ?? '',
            'note'         => $s['note'] ?? '',
            'realMT'       => iq_num($s['real_mt'] ?? 0),
            'pibDate'      => $s['pib_date'] ?? '',
            'cargoArrived' => $s['cargo_arrived'] ?? false,
            'quotaYear'    => iq_quota_year($s['quota_year'] ?? null),
        ];
    }

    $spi = [];
    $pending = [];
    foreach ($companies as $co) {
        $code = $co['code'] ?? '';
        $companyReapply = array_values(array_filter($reapplyRows, fn($r) => ($r['company_code'] ?? '') === $code));
        $obj = iq_build_company_obj(
            $co,
            $prodMap[$code] ?? [],
            $statsMap[$code] ?? [],
            $revMap[$code] ?? [],
            $cyclesMap[$code] ?? [],
            $pendMap[$code] ?? null,
            $shipMap[$code] ?? [],
            $companyReapply,
            $cycleUtilMap[$code] ?? [],
            $aliasMap
        );
        if (($co['section'] ?? '') === 'SPI') $spi[] = $obj;
        else                                  $pending[] = $obj;
    }

    $ra = [];
    foreach ($raRows as $r) {
        $ra[] = [
            'code'                 => $r['company_code'] ?? null,
            'product'              => $r['product'] ?? null,
            'berat'                => iq_num($r['berat'] ?? 0),
            'obtained'             => iq_num($r['obtained'] ?? 0),
            'cargoArrived'         => $r['cargo_arrived'] ?? false,
            'realPct'              => iq_num($r['real_pct'] ?? 0),
            'utilPct'              => iq_present($r['util_pct'] ?? null) ? iq_num($r['util_pct']) : null,
            'arrivalDate'          => $r['arrival_date'] ?? null,
            'etaJKT'               => $r['eta_jkt'] ?? null,
            'reapplyEst'           => $r['reapply_est'] ?? '',
            'reapplyStage'         => (int) (iq_num($r['reapply_stage'] ?? 0) ?: 1),
            'reapplyProduct'       => $r['reapply_product'] ?? null,
            'reapplyNewTotal'      => iq_present($r['reapply_new_total'] ?? null) ? iq_num($r['reapply_new_total']) : null,
            'reapplyPrevObtained'  => iq_present($r['reapply_prev_obtained'] ?? null) ? iq_num($r['reapply_prev_obtained']) : null,
            'reapplyAdditional'    => iq_present($r['reapply_additional'] ?? null) ? iq_num($r['reapply_additional']) : null,
            'reapplySubmitDate'    => $r['reapply_submit_date'] ?? null,
            'reapplyStatus'        => $r['reapply_status'] ?? null,
            'target'               => iq_present($r['target'] ?? null) ? iq_num($r['target']) : null,
            'pertek'               => $r['pertek'] ?? null,
            'spi'                  => $r['spi'] ?? null,
            'catatan'              => $r['catatan'] ?? null,
            'quotaYear'            => iq_quota_year($r['quota_year'] ?? null),
        ];
    }

    // ── Realized = single source of truth: PIB realizations (deduped) ────
    // Override each RA record's realized (berat/cargoArrived/realPct) with
    // the company's total realized volume from `realizations`, deduped by
    // (pib_no, line_no). Synthesize an RA entry for companies that have PIB
    // realizations but no ra_records row. (Mirrors server.js:1154-1194.)
    $pibRealized = [];
    $seen = [];
    foreach ($realzRows as $r) {
        $code = $r['company_code'] ?? null;
        if (!$code) continue;
        $key = $code . '|' . ($r['pib_no'] ?? '') . '|' . ($r['line_no'] ?? '');
        if (isset($seen[$key])) continue;
        $seen[$key] = true;
        $pibRealized[$code] = ($pibRealized[$code] ?? 0) + iq_num($r['volume'] ?? 0);
    }
    $spiObtained = [];
    foreach ($spi as $c) { $spiObtained[$c['code']] = iq_num($c['obtained'] ?? 0); }
    // Index RA rows per company. A company that cleared customs in several
    // waves now owns SEVERAL ra_records rows (one per arrival), so count them:
    // the PIB-realized override below replaces one row's berat with the
    // company TOTAL, which would double-count against its siblings' own
    // per-wave weights. Only override when the company has exactly one row;
    // with multiple rows the sheet already carries the correct split, taken
    // from the source REALISASI workbooks.
    $raIdx = [];
    $raCount = [];
    foreach ($ra as $i => $r) {
        $raIdx[$r['code']] = $i;
        $raCount[$r['code']] = ($raCount[$r['code']] ?? 0) + 1;
    }
    foreach ($pibRealized as $code => $mtRaw) {
        $mt = round($mtRaw * 1000) / 1000;
        if (!($mt > 0)) continue;
        if (isset($raIdx[$code]) && ($raCount[$code] ?? 0) > 1) {
            // multi-wave: trust the per-row weights, only assert arrival
            foreach ($ra as $j => $rr) {
                if ($rr['code'] === $code) $ra[$j]['cargoArrived'] = true;
            }
            continue;
        }
        if (isset($raIdx[$code])) {
            $i = $raIdx[$code];
            $ra[$i]['berat']        = $mt;
            $ra[$i]['cargoArrived'] = true;
            $obt = $ra[$i]['obtained'] ?: ($spiObtained[$code] ?? 0);
            $ra[$i]['realPct']      = $obt > 0 ? $mt / $obt : 0;
        } else {
            $obt = $spiObtained[$code] ?? 0;
            $ra[] = [
                'code' => $code, 'product' => '', 'berat' => $mt, 'obtained' => $obt, 'cargoArrived' => true,
                'realPct' => $obt > 0 ? $mt / $obt : 0, 'utilPct' => null, 'arrivalDate' => null, 'etaJKT' => null,
                'reapplyEst' => '', 'reapplyStage' => 1, 'reapplyProduct' => null, 'reapplyNewTotal' => null,
                'reapplyPrevObtained' => null, 'reapplyAdditional' => null, 'reapplySubmitDate' => null,
                'reapplyStatus' => null, 'target' => null, 'pertek' => null, 'spi' => null, 'catatan' => null,
                'quotaYear' => null,
            ];
        }
    }

    // ── lastUpdate: max updated_at across companies/shipments(lots)/ra ────
    $maxTs = function (array $arr): int {
        $m = 0;
        foreach ($arr as $r) {
            $v = $r['updated_at'] ?? null;
            if (!iq_present($v)) continue;
            $ts = strtotime((string) $v);
            if ($ts !== false && $ts * 1000 > $m) $m = $ts * 1000;
        }
        return $m;
    };
    $lastMs = max($maxTs($companies), $maxTs($shipRows), $maxTs($raRows));
    $lastUpdate = $lastMs > 0 ? gmdate('Y-m-d\TH:i:s.000\Z', intdiv($lastMs, 1000)) : null;

    return [
        'spi'              => $spi,
        'pending'          => $pending,
        'ra'               => $ra,
        'products'         => $productsList,
        'productAliases'   => $aliasMap,
        'companyDirectory' => $companyDirectory,
        'lastUpdate'       => $lastUpdate,
    ];
}

/* ── quota ledger overlay (mirrors IQ/server.js:1196-1342 + lib/pendingRevisionGate.js) ──
 *
 * Single source for Obtained / Utilized / Available: derives these per
 * company from the HS-keyed ledger seeded from the authoritative master
 * (iqdash/data/quotaLedger.json), overriding the divergent cycles/stats-based
 * numbers `iq_build_payload_raw()` computed. `iq_build_payload()` is the
 * public entry point later tasks (the /api/data route) call.
 */

/** Mirror isReleased() from IQ/lib/pendingRevisionGate.js: '' or "TBA"
 *  (any case) means the PERTEK Perubahan release date has NOT been entered. */
function iq_is_released($releaseDate): bool {
    $d = trim((string) ($releaseDate ?? ''));
    return $d !== '' && !preg_match('/^tba$/i', $d);
}

/**
 * Normalize one `pendingRevisions.json` value into a LIST of `{from,to,mt}`
 * defs. A company whose PERTEK splits into a single product stores one def
 * (`{"from":...,"to":...,"mt":...}`); one that splits into several stores a
 * list of them, each naming the same `from`:
 *
 *   "GIS": [ {"from":"SHEET PILE","to":"WELDED STAINLESS STEEL PIPE","mt":325},
 *            {"from":"SHEET PILE","to":"FABRICATED STEEL PAINTED FRAME","mt":75} ]
 *
 * Both shapes are read the same way here so iq_apply_pending_revision() keeps
 * handling exactly one def. Defs missing `from`/`to` are dropped — a malformed
 * entry must not silently un-gate (or half-gate) a split.
 */
function iq_pending_revision_defs($revDef): array {
    if (!is_array($revDef) || !count($revDef)) return [];
    // A single def is an assoc array with a 'from' key; a list has integer keys.
    $list = array_key_exists('from', $revDef) ? [$revDef] : array_values($revDef);
    return array_values(array_filter(
        $list,
        fn($d) => is_array($d) && ($d['from'] ?? '') !== '' && ($d['to'] ?? '') !== ''
    ));
}

/**
 * Port of `applyPendingRevision` (IQ/lib/pendingRevisionGate.js). A company's
 * PERTEK can be revised into a product split (e.g. Wear Plate 600 ->
 * Wear Plate 247 + GI Alloy 353); the split only becomes official once its
 * PERTEK Perubahan release (terbit) date is entered. Until then this reverses
 * the not-yet-released split in the per-product maps — moving `mt` from
 * `to` back into `from` — so the ORIGINAL PERTEK is shown. Pure + in-place
 * (mutates $maps by reference); no I/O.
 *
 * @param array  $maps   ['obtByProd'=>..., 'utilByProd'=>..., 'availByProd'=>...], mutated in place
 * @param array  $revDef ['from'=>string, 'to'=>string, 'mt'=>number] — empty/[] when the company has no gated split
 * @param string $releaseDate the company's recorded release_date, or '' when none
 * @return array ['reversed'=>bool, 'reason'?=>string]
 */
function iq_apply_pending_revision(array &$maps, array $revDef, string $releaseDate): array {
    if (empty($revDef)) return ['reversed' => false, 'reason' => 'no-def'];
    if (iq_is_released($releaseDate)) return ['reversed' => false, 'reason' => 'released'];

    $from = $revDef['from'] ?? null;
    $to   = $revDef['to'] ?? null;

    // The "to" product must exist and be untouched (fully available) while pending.
    if (!array_key_exists($to, $maps['obtByProd'])) return ['reversed' => false, 'reason' => 'to-missing'];
    if ((iq_num($maps['utilByProd'][$to] ?? 0)) > 0) return ['reversed' => false, 'reason' => 'to-utilized'];

    $toObt = iq_num($maps['obtByProd'][$to] ?? 0);
    $mt = min(iq_num($revDef['mt'] ?? 0), $toObt); // clamp: can't move more than exists
    if ($mt <= 0) return ['reversed' => false, 'reason' => 'zero-mt'];

    // Move `mt` from `to` back into `from` (obtained + available; util on `to` is 0).
    $maps['obtByProd'][$from]   = (iq_num($maps['obtByProd'][$from] ?? 0)) + $mt;
    $maps['availByProd'][$from] = (iq_num($maps['availByProd'][$from] ?? 0)) + $mt;
    if (!array_key_exists($from, $maps['utilByProd'])) $maps['utilByProd'][$from] = 0;

    $maps['obtByProd'][$to]   = $toObt - $mt;
    $maps['availByProd'][$to] = (iq_num($maps['availByProd'][$to] ?? 0)) - $mt;
    if ($maps['obtByProd'][$to] <= 0) {
        unset($maps['obtByProd'][$to], $maps['utilByProd'][$to], $maps['availByProd'][$to]);
    }

    return ['reversed' => true];
}

/**
 * Port of the `applyLedger` closure (IQ/server.js:1223-1266). Computes
 * per-product obtained/util/available from the ledger entity `$ent`
 * (`{HS: {obtained, util}}`), reconciling the master-snapshot util with LIVE
 * utilization the user records via shipment lots on `$co['shipments']`
 * (Task 4 shape: product name => list of lots, each carrying `utilMT`):
 *
 *   effective util = min(obtained, max(ledgerUtil, Sum(lot.utilMT)))
 *
 * capped at obtained (you can't utilize more than you were granted). The two
 * inputs are RECONCILED, not summed: both state the same product total, so a
 * lot that merely re-itemizes the master snapshot must not be added on top of
 * it — see the inline note at the max() for why the old `+` under-reported
 * available quota on partially-utilized products. Then applies the
 * pending-revision gate (if `$revDef` is
 * given), sums to get the company total, rounds to 3 decimals, and MUTATES
 * `$co` in place: obtained, utilizationMT, availableQuota, utilizationByProd,
 * availableByProd, _ledgerObtained, _ledgerObtainedByProd, products.
 *
 * Signature note (see task-5-report.md "signatures" section for the full
 * rationale): the JS closure captures `hsName`/`releasedMap`/`PENDING_REVISIONS`
 * from its enclosing scope; PHP has no equivalent closure context here, so
 * they're explicit parameters instead — `$hsName`/`$releasedDate`/`$revDef`
 * default to "no overlay effect" values so a bare 2-arg call (as in the
 * task-5 brief's starter test) still behaves sanely (HS codes pass through
 * as their own name, no release date, no pending-revision def).
 *
 * @param array  $co           company object (Task 4 shape), mutated in place
 * @param array  $ent          ledger entity for this company: HS => {obtained, util}
 * @param array  $hsName       HS code => product name (ledger's own `products` map)
 * @param string $releaseDate  this company's `pertek_perubahan_release` date, or ''
 * @param array|null $revDef   this company's PENDING_REVISIONS entry, or null
 */
function iq_apply_ledger(array &$co, array $ent, array $hsName = [], string $releaseDate = '', ?array $revDef = null, array $aliasMap = []): void {
    $utilByProd = [];
    $availByProd = [];
    $obtByProd = [];
    $ships = $co['shipments'] ?? [];

    /* Utilisasi versi `company_product_stats`, sebagaimana dibaca
       iq_build_company_obj() SEBELUM overlay ini menimpanya. Dikanonikkan
       supaya baris lama yang masih dieja `GI BORON` ketemu dengan nama produk
       ledger `GI ALLOY`. */
    $statsU = [];
    foreach (($co['utilizationByProd'] ?? []) as $p => $v) {
        $c = $aliasMap[trim((string) $p)] ?? trim((string) $p);
        $statsU[$c] = ($statsU[$c] ?? 0) + iq_num($v);
    }

    foreach ($ent as $hs => $v) {
        $name = ($hsName[$hs] ?? '') !== '' ? $hsName[$hs] : $hs;
        $o = iq_num($v['obtained'] ?? 0);
        $ledgerU = iq_num($v['util'] ?? 0);
        $lotU = 0.0;
        foreach (($ships[$name] ?? []) as $l) {
            $lotU += iq_num($l['utilMT'] ?? 0);
        }
        /* Kolom stats ikut direkonsiliasi, dengan alasan yang sama persis
           seperti lot di bawah: quotaLedger.json adalah SNAPSHOT BEKU dari
           master (regen terakhir 03/08/2026), sementara `company_product_stats`
           ditulis aplikasi setiap kali tim menyimpan pemakaian. Pemakaian yang
           dicatat SESUDAH regen karena itu hanya hidup di stats — dan sebelum
           ini dibuang diam-diam oleh overlay.
           IKM SEAMLESS PIPE 275 MT (kontrak Arsen SSP #50 di SCOT) hilang
           begitu: ledger 0, lot 0, stats 275 -> tampil 0 terpakai / 2.100
           tersisa, padahal master sendiri bilang 275 terpakai / 1.825 sisa.
           Ketahuan 2026-08-10 dari selisih dengan SCOT.
           Tetap max(), bukan jumlah: ketiganya mengaku sebagai TOTAL produk
           yang sama, bukan tiga potongan yang bisa ditambahkan. */
        $statU = $statsU[$aliasMap[$name] ?? $name] ?? 0.0;
        // Both numbers claim to be the SAME total, not two halves of one, so
        // they reconcile with max() — never by adding. The ledger's util is
        // the master's `Utilization (MT)` row at regen time; a lot re-states
        // part of that same figure with per-lot detail. Adding them
        // double-counts, and the min() cap only hides it while ledgerUtil ==
        // obtained. IKM was the first company to utilize PARTIALLY (obtained
        // 4,150 / util 2,300 / lot 2,000): 2,300 + 2,000 capped to 4,150, so
        // the dashboard read 100% utilized and 0 available against a master
        // saying 1,850 available. max() keeps the intent the '+' was reaching
        // for — a lot recorded in-app AFTER a regen still raises utilization
        // above the frozen ledger baseline — without counting the overlap
        // twice. Verified over every company in the ledger: only IKM moves,
        // and the new total lands exactly on the master's 22,547 MT.
        $u = min($o, max($ledgerU, $lotU, $statU));
        $obtByProd[$name] = $o;
        $utilByProd[$name] = $u;
        $availByProd[$name] = max(0, $o - $u);
    }

    // PERTEK Perubahan gate: reverse a not-yet-released product split so the
    // dashboard shows the ORIGINAL PERTEK until the release date is entered.
    if ($revDef) {
        $maps = ['obtByProd' => $obtByProd, 'utilByProd' => $utilByProd, 'availByProd' => $availByProd];
        // A company's PERTEK can be revised into a split with MORE THAN ONE
        // target (GIS: SHEET PILE 400 -> WELDED 325 + FABRICATED 75), so a
        // pendingRevisions.json value may be a LIST of defs as well as a
        // single one. Reverse each in turn; iq_apply_pending_revision() still
        // handles exactly one def and is unchanged.
        $defs = iq_pending_revision_defs($revDef);
        $targets = [];
        $from = null;
        foreach ($defs as $def) {
            if (iq_apply_pending_revision($maps, $def, $releaseDate)['reversed']) {
                $targets[] = ['to' => $def['to'] ?? null, 'mt' => $def['mt'] ?? null];
                $from ??= $def['from'] ?? null;
            }
        }
        $obtByProd = $maps['obtByProd'];
        $utilByProd = $maps['utilByProd'];
        $availByProd = $maps['availByProd'];
        if (count($targets)) {
            // origMT is only whole once EVERY target has been reversed back
            // into `from` — hence reading it here rather than inside the loop.
            $co['_pendingRevision'] = [
                'from'    => $from,
                'to'      => $targets[0]['to'],
                'mt'      => $targets[0]['mt'],
                'targets' => $targets,
                'origMT'  => $obtByProd[$from ?? ''] ?? 0,
            ];
        } else {
            unset($co['_pendingRevision']);
        }
    }

    $obt = 0.0;
    $util = 0.0;
    foreach (array_keys($obtByProd) as $name) {
        $obt += iq_num($obtByProd[$name] ?? 0);
        $util += iq_num($utilByProd[$name] ?? 0);
    }
    $obt = round($obt * 1000) / 1000;
    $util = round($util * 1000) / 1000;

    $co['obtained'] = $obt;
    $co['utilizationMT'] = $util;
    $co['availableQuota'] = max(0, round(($obt - $util) * 1000) / 1000);
    $co['utilizationByProd'] = $utilByProd;
    $co['availableByProd'] = $availByProd;
    $co['_ledgerObtained'] = $obt;
    $co['_ledgerObtainedByProd'] = $obtByProd;
    $co['products'] = array_keys($obtByProd);
}

/**
 * Public entry point: `iq_build_payload_raw($t)` then overlay the quota
 * ledger + pending-revision gate on every SPI company AND every
 * pending/ledger-only company (mirrors IQ/server.js:1196-1342). This is
 * what /api/data (a later task) calls.
 */
function iq_build_payload(array $t): array {
    $raw = iq_build_payload_raw($t);

    // Mirror JS server.js:1043 `if (!codes.length) return {...}` — when the
    // source `companies` tab has ZERO rows, iq_build_payload_raw() already
    // returned the early-return empty payload; short-circuit here too so we
    // never run the ledger overlay / ledger-only synthesis on top of it (that
    // would fabricate a full `spi[]` out of the ledger even though the real
    // app never does). Gate on the real `companies` input being empty, NOT on
    // the ledger being empty.
    if (empty($t['companies'])) {
        return $raw;
    }

    $ledger = iq_ledger();
    $ledgerCompanies = $ledger['companies'] ?? [];
    // Mirrors JS `if (QUOTA_LEDGER && QUOTA_LEDGER.companies) { ... }` — when
    // there is no ledger at all, none of this overlay runs (not even the
    // `_ledgerObtained = 0` fallback), so the raw payload stands unmodified.
    if (!is_array($ledgerCompanies) || !count($ledgerCompanies)) {
        return $raw;
    }
    $hsName = is_array($ledger['products'] ?? null) ? $ledger['products'] : [];

    $spi = $raw['spi'];
    $pending = $raw['pending'];
    /* Peta alias dibangun di iq_build_payload_raw(); di sini hanya tersedia
       lewat payload-nya. Dibutuhkan oleh iq_sync_util_with_cycles() yang
       dipanggil ulang sesudah overlay ledger. */
    $aliasMap = $raw['productAliases'] ?? [];

    // dirName: abbreviation -> fullName (used only when synthesizing a
    // brand-new ledger-only company that has no `companies` row at all).
    $dirName = [];
    foreach (($raw['companyDirectory'] ?? []) as $d) {
        $dirName[$d['abbreviation'] ?? ''] = $d['fullName'] ?? '';
    }

    // releasedMap: code -> release_date, from the `pertek_perubahan_release`
    // tab. Sheets-only store; an absent/empty tab just yields no releases
    // (mirrors the JS try/catch around a possibly-missing tab).
    $releasedMap = [];
    foreach (($t['pertekRelease'] ?? []) as $r) {
        $d = trim((string) ($r['release_date'] ?? ''));
        $code = trim((string) ($r['code'] ?? ''));
        if ($code !== '' && $d !== '') $releasedMap[$code] = $d;
    }

    $pendingRevisions = iq_pending_revisions();
    $ledgerCompanyDates = iq_ledger_company_dates();

    // shipRows: lots filtered to companies actually present in the
    // `companies` tab (mirrors server.js's `shipRows`, which is filtered by
    // the codeSet built from `companies` — so a company with NO `companies`
    // row never has any lots attached here, matching upstream behavior).
    $companyCodes = [];
    foreach (($t['companies'] ?? []) as $c) {
        $cc = $c['code'] ?? '';
        if ($cc !== '') $companyCodes[$cc] = true;
    }
    $shipRows = array_values(array_filter($t['lots'] ?? [], fn($s) => isset($companyCodes[$s['company_code'] ?? null])));

    // 1) Overlay every SPI company already present.
    $spiByCode = [];
    foreach ($spi as $i => $co) { $spiByCode[$co['code'] ?? null] = $i; }
    foreach ($spi as &$co) {
        $code = $co['code'] ?? null;
        $ent = $ledgerCompanies[$code] ?? null;
        if ($ent) {
            $revDef = $pendingRevisions[$code] ?? null;
            $release = $releasedMap[$code] ?? '';
            iq_apply_ledger($co, $ent, $hsName, $release, $revDef, $aliasMap);
            // Ledger menulis ulang keempat kolom itu dari berkas statis quotaLedger.json —
            // selaraskan lagi, kalau tidak hasilnya tertimpa kembali.
            iq_sync_util_with_cycles($co, $aliasMap);
        } else {
            $co['_ledgerObtained'] = 0; // not in current master -> contributes 0
        }
    }
    unset($co);

    // 2) Synthesize ledger companies absent from SPI (e.g. IKM sitting in pending).
    foreach ($ledgerCompanies as $code => $ent) {
        if (isset($spiByCode[$code])) continue;

        // If we know this ledger-only company's obtained/terbit date, prepare
        // a synthetic "Obtained #1" cycle so the client PERIOD filter can
        // place it in the right month. Used ONLY when the company has no
        // real cycles of its own.
        $obtDate = $ledgerCompanyDates[$code] ?? null;
        $synthCycles = [];
        if ($obtDate) {
            $prodMap = [];
            $totMt = 0.0;
            foreach ($ent as $hs => $v) {
                $nm = ($hsName[$hs] ?? '') !== '' ? $hsName[$hs] : $hs;
                $o = iq_num($v['obtained'] ?? 0);
                if ($o > 0) { $prodMap[$nm] = $o; $totMt += $o; }
            }
            $synthCycles = [[
                'type'        => 'Obtained #1',
                'mt'          => $totMt,
                'products'    => $prodMap,
                'submitType'  => '',
                'submitDate'  => '',
                'releaseType' => 'SPI Terbit',
                'releaseDate' => $obtDate,
                'status'      => "Obtained (ledger) — terbit {$obtDate}",
                'pertekDate'  => $obtDate,
                'spiDate'     => $obtDate,
                '_fromRevReq' => false,
            ]];
        }

        // Reuse the company's REAL, fully-built object if it already exists
        // (IKM lives in `pending`, built by iq_build_company_obj) — this
        // preserves its persisted scalars (pertekNo/spiNo/status/cycles).
        // Only companies truly absent from the DB fall back to a fresh object.
        $pi = null;
        foreach ($pending as $idx => $p) {
            if (($p['code'] ?? null) === $code) { $pi = $idx; break; }
        }

        if ($pi !== null) {
            $co = $pending[$pi];
            array_splice($pending, $pi, 1);
            $co['section'] = 'SPI';
            if (empty($co['cycles']) && count($synthCycles)) $co['cycles'] = $synthCycles;
        } else {
            $shipMapFor = [];
            foreach ($shipRows as $s) {
                if (($s['company_code'] ?? null) !== $code) continue;
                $prod = $s['product'] ?? '';
                if (!isset($shipMapFor[$prod])) $shipMapFor[$prod] = [];
                $shipMapFor[$prod][] = [
                    'lotNo'        => $s['lot_no'] ?? null,
                    'utilMT'       => iq_num($s['util_mt'] ?? 0),
                    // Sejajarkan dengan pembangun lot utama (~baris 500). Lot
                    // yang sampai ke frontend tanpa `utilDate` akan dikirim
                    // balik kosong saat Save -> tanggalnya terhapus.
                    'utilDate'     => $s['util_date'] ?? '',
                    'etaJKT'       => $s['eta_jkt'] ?? '',
                    'note'         => $s['note'] ?? '',
                    'realMT'       => iq_num($s['real_mt'] ?? 0),
                    'pibDate'      => $s['pib_date'] ?? '',
                    'cargoArrived' => $s['cargo_arrived'] ?? false,
                ];
            }
            $co = [
                'code' => $code, 'fullName' => $dirName[$code] ?? $code, 'group' => '', 'section' => 'SPI',
                'products' => [], 'submit1' => 0, 'obtained' => 0, 'utilizationMT' => 0, 'availableQuota' => 0,
                'cycles' => $synthCycles, 'shipments' => $shipMapFor,
                'utilizationByProd' => [], 'availableByProd' => [], 'arrivedByProd' => [],
                'revType' => 'none', 'revNote' => '', 'revSubmitDate' => '', 'revStatus' => '', 'revMT' => 0,
                'revFrom' => [], 'revTo' => [], 'salesRevRequest' => [], 'reapplyTargets' => [],
                'remarks' => '', 'spiRef' => '', 'statusUpdate' => '', 'pertekNo' => '', 'spiNo' => '',
                'updatedBy' => '', 'updatedDate' => '', 'updatedAt' => null, 'cycleProducts' => [],
            ];
        }

        $revDef = $pendingRevisions[$code] ?? null;
        $release = $releasedMap[$code] ?? '';
        iq_apply_ledger($co, $ent, $hsName, $release, $revDef, $aliasMap);
        // Ledger menulis ulang keempat kolom itu dari berkas statis quotaLedger.json —
        // selaraskan lagi, kalau tidak hasilnya tertimpa kembali.
        iq_sync_util_with_cycles($co, $aliasMap);
        $spi[] = $co;
    }

    $raw['spi'] = $spi;
    $raw['pending'] = $pending;
    return $raw;
}


