<?php
/**
 * SalesConnect — penjaga akses per dashboard.
 *
 * Dua lapis, dan KEDUANYA wajib dipasang untuk setiap modul:
 *   sc_require_tool('iqdash')      di halaman (index.php / dashboard.php)
 *   sc_require_tool_api('iqdash')  di api.php
 *
 * Menjaga halaman saja tidak cukup: api.php punya URL sendiri
 * (/iqdash/api/data) yang bisa dibuka langsung dan mengembalikan seluruh isi
 * spreadsheet dalam bentuk JSON, tanpa pernah menyentuh index.php.
 *
 * Daftar siapa boleh apa ada di lib/access.php.
 */

require_once __DIR__ . '/auth.php';

/**
 * URL sebuah berkas di root aplikasi, relatif terhadap docroot.
 * Menghasilkan "/login.php" saat app berada di root domain (kasus produksi).
 */
function sc_url(string $path): string {
    $root = str_replace('\\', '/', dirname(__DIR__));
    $doc  = str_replace('\\', '/', rtrim((string) ($_SERVER['DOCUMENT_ROOT'] ?? ''), '/'));
    if ($doc !== '' && strpos($root, $doc) === 0) {
        return rtrim(substr($root, strlen($doc)), '/') . '/' . ltrim($path, '/');
    }
    return '../' . ltrim($path, '/');   // semua modul berada satu tingkat di bawah root
}

/** Belum login -> ke halaman masuk, sambil mengingat tujuan semula. */
function sc_require_login_page() {
    if (sc_user()) return;
    $next = rawurlencode($_SERVER['REQUEST_URI'] ?? '');
    header('Location: ' . sc_url('login.php') . '?next=' . $next);
    exit;
}

/** Penjaga halaman HTML sebuah modul. */
function sc_require_tool(string $tool) {
    sc_require_login_page();
    if (sc_user_can($tool)) return;
    $u = sc_user();
    sc_auth_log('denied', $u['email'], 'tool=' . $tool);
    http_response_code(403);
    sc_render_denied($tool);
    exit;
}

/** Penjaga endpoint JSON sebuah modul. 401 = belum masuk, 403 = tidak berhak. */
function sc_require_tool_api(string $tool) {
    $u = sc_user();
    if (!$u) {
        http_response_code(401);
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['error' => 'Unauthorized', 'login' => sc_url('login.php')]);
        exit;
    }
    if (in_array($tool, $u['tools'] ?? [], true)) return;
    sc_auth_log('denied_api', $u['email'], 'tool=' . $tool);
    http_response_code(403);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['error' => 'Forbidden']);
    exit;
}

/**
 * Penangkap 401 sisi-klien, disisipkan ke <head> tiap modul.
 *
 * Penjaga PHP hanya bekerja saat halaman dimuat. Kalau sesi berakhir saat SPA
 * sudah terbuka, panggilan api.php berikutnya menjawab 401 dan aplikasi lama
 * memperlakukannya seperti gangguan biasa — muncul error atau tabel kosong,
 * padahal yang terjadi cuma "sesi Anda habis".
 *
 * Ditambal di lapisan window.fetch supaya berlaku untuk SELURUH pemanggilan
 * modul tanpa menyentuh satu pun berkas JS aplikasi (CIL saja ~2300 baris).
 * Kelima modul memakai fetch, tidak ada XMLHttpRequest — sudah diperiksa.
 *
 * Memuat ulang URL yang sama (bukan lompat ke login.php) supaya penjaga PHP
 * yang menentukan tujuannya; ?next= jadi terisi halaman persis yang sedang
 * dibuka, sehingga sesudah masuk pengguna kembali ke tempatnya semula.
 * Bendera `gone` memastikan sepuluh permintaan yang gagal berbarengan hanya
 * memicu satu kali pindah halaman.
 */
function sc_session_watch(): string {
    return "<script>/* SalesConnect: sesi habis -> kembali ke halaman masuk */"
         . "(function(){var f=window.fetch&&window.fetch.bind(window);if(!f)return;var gone=false;"
         . "window.fetch=function(u,o){return f(u,o).then(function(r){"
         . "if(r&&r.status===401&&!gone){gone=true;location.replace(location.href);}"
         . "return r;});};})();</script>";
}

/** Halaman "tidak punya akses" — menawarkan jalan keluar, bukan jalan buntu. */
function sc_render_denied(string $tool) {
    $u     = sc_user();
    $meta  = sc_tool_meta($tool);
    $mine  = '';
    foreach (($u['tools'] ?? []) as $t) {
        $m = sc_tool_meta($t);
        $mine .= '<li><a href="' . htmlspecialchars(sc_url($m['href']), ENT_QUOTES) . '">'
               . $m['icon'] . ' ' . htmlspecialchars($m['title']) . '</a></li>';
    }
    if ($mine === '') $mine = '<li class="none">Belum ada dashboard yang bisa dibuka dengan akun ini.</li>';

    header('Content-Type: text/html; charset=utf-8');
    echo '<!DOCTYPE html><html lang="id"><head><meta charset="UTF-8">'
       . '<meta name="viewport" content="width=device-width, initial-scale=1.0">'
       . '<meta name="robots" content="noindex, nofollow"><title>Tidak punya akses — SalesConnect</title><style>'
       . '*{box-sizing:border-box;margin:0;padding:0}'
       . 'body{font-family:Inter,system-ui,sans-serif;background:#0f172a;color:#e2e8f0;min-height:100vh;'
       . 'display:flex;align-items:center;justify-content:center;padding:20px}'
       . '.box{background:#1e293b;border:1px solid #334155;border-radius:16px;padding:32px;max-width:460px;width:100%}'
       . 'h1{font-size:19px;margin-bottom:10px}p{color:#94a3b8;font-size:14px;line-height:1.6;margin-bottom:16px}'
       . 'b{color:#e2e8f0}ul{list-style:none;margin:0 0 18px}li{margin:6px 0}'
       . 'li a{color:#38bdf8;text-decoration:none;font-size:14px}li a:hover{text-decoration:underline}'
       . 'li.none{color:#64748b;font-size:14px}'
       . '.foot{display:flex;gap:14px;font-size:13px}.foot a{color:#94a3b8;text-decoration:none}'
       . '.foot a:hover{color:#e2e8f0}</style></head><body><div class="box">'
       . '<h1>🔒 Tidak punya akses</h1>'
       . '<p>Akun <b>' . htmlspecialchars($u['email']) . '</b> tidak diberi akses ke '
       . '<b>' . htmlspecialchars($meta['title']) . '</b>. Kalau menurut Anda ini keliru, '
       . 'hubungi admin SalesConnect.</p>'
       . '<p>Yang bisa Anda buka:</p><ul>' . $mine . '</ul>'
       . '<div class="foot"><a href="' . htmlspecialchars(sc_url('index.php'), ENT_QUOTES) . '">&larr; Halaman depan</a>'
       . '<a href="' . htmlspecialchars(sc_url('logout.php'), ENT_QUOTES) . '">Keluar</a></div>'
       . '</div></body></html>';
}
