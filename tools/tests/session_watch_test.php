<?php
/**
 * Uji lokal: penangkap 401 (sc_session_watch) benar-benar sampai ke HTML setiap
 * modul. Merender tiap halaman dengan sesi palsu dan memeriksa hasilnya.
 *
 * Kenapa perlu diuji, bukan sekadar dilihat: tiga modul menyisipkannya lewat
 * str_replace('</head>', ...) pada berkas HTML terpisah. Kalau berkas itu suatu
 * saat kehilangan </head>-nya, penyisipan gagal DIAM-DIAM — halamannya tetap
 * tampil normal, hanya penangkapnya yang hilang tanpa ada yang sadar.
 */
$ROOT = dirname(__DIR__, 2);
$_SERVER['REMOTE_ADDR']     = '127.0.0.1';
$_SERVER['REQUEST_METHOD']  = 'GET';
$_SERVER['REQUEST_URI']     = '/';
$_SERVER['DOCUMENT_ROOT']   = $ROOT;
require_once $ROOT . '/lib/tool_guard.php';

// Sesi palsu: Ridwan punya akses ke keenam modul, jadi tidak ada yang dialihkan.
sc_start_session_for(sc_person_by_email('ridwan.abdillah@gunungcapital.com'), 'otp');

$pages = [
    'cil/index.php',
    'taskflow/index.php',
    'costcore/index.php',
    'scot/index.php',
    'salespulse/index.php',
    'salespulse/dashboard.php',
    'iqdash/index.php',
];

$pass = 0; $fail = 0;
function t(string $name, $got, $want) {
    global $pass, $fail;
    if ($got === $want) { $pass++; return; }
    $fail++;
    printf("FAIL %-46s got=%s want=%s\n", $name, var_export($got, true), var_export($want, true));
}

foreach ($pages as $p) {
    ob_start();
    include $ROOT . '/' . $p;
    $out = ob_get_clean();

    $head  = strpos($out, '</head>');
    $watch = strpos($out, 'window.fetch=');

    t("$p — ada </head>",              $head !== false, true);
    t("$p — penangkap tersisip",       $watch !== false, true);
    t("$p — hanya satu penangkap",     substr_count($out, 'window.fetch='), 1);
    t("$p — memeriksa status 401",     strpos($out, 'r.status===401') !== false, true);
    t("$p — memuat ulang URL sendiri", strpos($out, 'location.replace(location.href)') !== false, true);
    // Harus di dalam <head>: kalau ditaruh sesudahnya, permintaan fetch pertama
    // bisa keburu jalan sebelum tambalannya terpasang.
    t("$p — penangkap sebelum </head>", ($watch !== false && $head !== false && $watch < $head), true);
}

echo ($fail === 0 ? "OK" : "ADA GAGAL") . " — $pass lulus, $fail gagal ("
   . count($pages) . " halaman)\n";
exit($fail ? 1 : 0);
