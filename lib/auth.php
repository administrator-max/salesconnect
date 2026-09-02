<?php
/**
 * SalesConnect — autentikasi berbasis email + kode sekali pakai (OTP).
 *
 * Menggantikan login username/password lama (arahan Direktur, 26 Agustus 2026:
 * SalesConnect dikunci, tidak semua orang boleh akses). Alurnya meniru
 * HR Center: masukkan email kantor -> kode 6 digit dikirim ke email -> kode
 * diverifikasi -> sesi dibuat.
 *
 * Bedanya dengan HR Center: di sana daftar user ada di MySQL. Di sini tidak ada
 * MySQL sama sekali (database-nya Google Sheets), jadi:
 *   - daftar orang + hak akses  -> lib/access.php  (berkas PHP, ikut di-deploy)
 *   - kode OTP yang masih hidup -> berkas di cache/auth/ (di luar jangkauan web
 *     lewat cache/.htaccess). Kode disimpan sebagai hash, bukan teks polos.
 * Google Sheets sengaja TIDAK dipakai untuk OTP: satu login akan memakan
 * beberapa panggilan API dan bisa menabrak batas 60 baca/menit justru saat
 * orang ramai masuk pagi hari.
 *
 * Pintu darurat: akun di config.php['users'] (username + password) masih bisa
 * dipakai lewat /login.php?pw=1. Ini ada supaya admin tetap bisa masuk kalau
 * pengiriman email sedang mati - tanpa itu, satu gangguan SMTP mengunci semua
 * orang termasuk yang seharusnya memperbaikinya. Kosongkan 'users' di
 * config.php untuk menutup pintu ini.
 */

require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/mailer.php';

const SC_OTP_TTL_MIN      = 10;   // umur kode
const SC_OTP_RESEND_SEC   = 60;   // jeda minimum antar permintaan kode
const SC_OTP_MAX_ATTEMPTS = 5;    // salah ketik sebelum kode dianggap hangus

/**
 * Batas permintaan kode.
 *
 * Dulu batasnya 20 per ALAMAT IP per jam. Itu keliru untuk pemakaian
 * sebenarnya: satu kantor keluar lewat satu IP publik bersama, jadi orang yang
 * login pagi-pagi bersamaan saling menghabiskan jatah satu sama lain — dan
 * gagalnya diam-diam, halaman tetap bilang kode sudah dikirim.
 *
 * Yang sebenarnya ingin dicegah adalah satu alamat email dibanjiri kode, dan
 * itu memang dijaga per email. Batas per IP tetap ada sebagai rem kasar untuk
 * banjir permintaan mentah, tapi dilonggarkan jauh di atas pemakaian wajar
 * satu kantor.
 */
const SC_OTP_MAX_PER_EMAIL_HOUR = 6;     // per alamat email
const SC_OTP_MAX_PER_IP_HOUR    = 120;   // rem kasar per IP

/**
 * Berapa jam satu kali login berlaku. Default 24 — "sekali sehari": masuk pagi,
 * buka lagi siang atau sore tanpa kode baru.
 *
 * Ini batas MUTLAK sejak login, bukan hitungan menganggur. Dipilih begitu
 * supaya bisa diterangkan dalam satu kalimat ("kodenya sekali sehari") dan
 * supaya masa berlaku cookie di browser sama persis dengan masa berlaku sesi di
 * server — kalau yang satu menggeser dan yang lain tidak, keduanya bisa
 * kedaluwarsa di waktu berbeda dan gejalanya sulit ditebak.
 */
function sc_session_hours(): int {
    $cfg = sc_config();
    return max(1, (int) ($cfg['auth_session_hours'] ?? 24));
}

/** Umur sesi dalam detik. */
function sc_session_ttl(): int {
    return sc_session_hours() * 3600;
}

// ─────────────────────────────────────────────────────────────────────────────
// Sesi
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mulai sesi. Tiga hal di sini yang membuat login bertahan seharian; ketiganya
 * harus benar, karena satu saja meleset tetap memaksa orang minta kode baru:
 *
 * 1. **Cookie punya masa berlaku.** Dulu `lifetime => 0` — cookie sesi, mati
 *    begitu browser ditutup. Siapa pun yang menutup browser saat istirahat
 *    harus minta kode lagi sesudahnya.
 * 2. **Berkas sesi disimpan di direktori sendiri.** Di shared hosting,
 *    save_path bawaan dipakai bersama akun lain dan disapu pembersih milik
 *    host. Berkas sesi bisa lenyap jauh sebelum waktunya, dan gejalanya persis
 *    seperti "tiba-tiba diminta login lagi" tanpa pola yang jelas.
 * 3. **gc_maxlifetime disamakan dengan umur sesi kita.** Bawaan PHP 1440 detik
 *    (24 menit). Tanpa ini, pembersih PHP boleh membuang berkas sesi yang
 *    menganggur lewat 24 menit — inilah penyebab paling mungkin dari keluhan
 *    "buka lagi siang, disuruh masuk lagi", karena tidak ada hubungannya dengan
 *    menutup browser.
 */
function sc_session_start() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $cfg    = sc_config();
    $ttl    = sc_session_ttl();
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    // Berkas sesi milik kita sendiri, di direktori yang sudah diblokir dari web.
    $dir = sc_session_dir();
    if ($dir !== '') {
        @ini_set('session.save_path', $dir);
        @ini_set('session.gc_probability', '1');
        @ini_set('session.gc_divisor', '100');
    }
    @ini_set('session.gc_maxlifetime', (string) $ttl);

    session_name($cfg['session_name'] ?? 'salesconnect_sess');
    session_set_cookie_params([
        'lifetime' => $ttl,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => $secure,
    ]);
    session_start();
}

/** Direktori berkas sesi; '' kalau tidak bisa dibuat (pakai bawaan host). */
function sc_session_dir(): string {
    static $dir = null;
    if ($dir !== null) return $dir;
    $d = sc_auth_dir() . '/sessions';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    $dir = (is_dir($d) && is_writable($d)) ? $d : '';
    return $dir;
}

/**
 * Data lengkap user yang sedang masuk, atau null.
 * ['key','name','email','admin','tools','via'] — 'via' = 'otp' | 'password'.
 *
 * Hak akses SELALU dibaca ulang dari lib/access.php di sini, tidak pernah
 * dipercaya dari salinan di sesi. Kalau tidak, mencabut akses seseorang jadi
 * tidak berarti apa-apa sampai sesinya habis (bisa sehari penuh): ia tetap bisa
 * membuka modul yang sudah dihapus dari haknya, dengan salinan lama yang
 * menempel di sesinya. Untuk pengaturan yang gunanya justru mengunci akses,
 * jeda seperti itu adalah lubang, bukan sekadar ketidaknyamanan.
 *
 * Efeknya dua arah dan langsung: hak yang dicabut hilang pada permintaan
 * berikutnya, hak yang ditambahkan muncul tanpa perlu keluar-masuk lagi.
 */
function sc_user() {
    sc_session_start();
    $u = $_SESSION['sc_user'] ?? null;
    if (!$u) return null;

    // Satu kali login berlaku sekian jam sejak MASUK, bukan sejak aktivitas
    // terakhir. Tidak menggeser sendiri: kalau digeser tiap permintaan, orang
    // yang membuka dashboard tiap hari tidak akan pernah diminta kode lagi, dan
    // "sekali sehari" berubah diam-diam jadi "sekali selamanya".
    $since = (int) ($_SESSION['sc_login_at'] ?? $_SESSION['sc_last'] ?? 0);
    if ($since > 0 && (time() - $since) > sc_session_ttl()) {
        sc_auth_log('session_expired', (string) ($u['email'] ?? ''));
        sc_logout();
        return null;
    }

    $u = sc_refresh_access($u);
    if (!$u) return null;

    $_SESSION['sc_last'] = time();   // hanya untuk catatan, tidak memperpanjang
    return $u;
}

/**
 * Samakan hak akses di sesi dengan sumbernya yang sekarang.
 * Mengembalikan data user yang sudah segar, atau null bila akunnya sudah tidak
 * berhak sama sekali (sesinya sekalian ditutup).
 */
function sc_refresh_access(array $u) {
    if (($u['via'] ?? '') === 'password') {
        // Pintu darurat: sumbernya config.php['users'], bukan access.php.
        // Menghapus akunnya dari sana menutup pintu ini seketika juga.
        $cfg = sc_config();
        if (!isset($cfg['users'][$u['key']])) {
            sc_auth_log('session_revoked', (string) $u['key'], 'akun darurat dihapus dari config');
            sc_logout();
            return null;
        }
        $fresh = ['tools' => array_keys(sc_access()['access']), 'admin' => true];
    } else {
        $p = sc_person_by_email((string) $u['email']);
        if (!$p) {
            sc_auth_log('session_revoked', (string) $u['email'], 'dihapus dari access.php');
            sc_logout();
            return null;
        }
        $fresh = ['key' => $p['key'], 'name' => $p['name'], 'tools' => $p['tools'], 'admin' => $p['admin']];
    }

    foreach ($fresh as $k => $v) {
        if (($u[$k] ?? null) !== $v) {
            $u[$k] = $v;
            $_SESSION['sc_user'][$k] = $v;
        }
    }
    return $u;
}

/**
 * Identitas ringkas user yang sedang masuk (email, atau username untuk pintu
 * darurat), atau null. Bentuk lama ini dipertahankan karena lib/config_util.php
 * dan setup.php sudah memakainya sebagai penanda "sudah login".
 */
function sc_current_user() {
    $u = sc_user();
    return $u ? $u['email'] : null;
}

function sc_logout() {
    sc_session_start();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $p['path'], $p['domain'] ?? '', $p['secure'], $p['httponly']);
    }
    session_destroy();
}

/** Buat sesi untuk satu orang dari lib/access.php. */
function sc_start_session_for(array $person, string $via = 'otp') {
    sc_session_start();
    session_regenerate_id(true);
    $_SESSION['sc_user'] = [
        'key'   => $person['key'],
        'name'  => $person['name'],
        'email' => $person['email'],
        'admin' => !empty($person['admin']),
        'tools' => $person['tools'],
        'via'   => $via,
    ];
    $_SESSION['sc_login_at'] = time();      // dasar masa berlaku sesi
    $_SESSION['sc_last']     = time();
    unset($_SESSION['otp_email']);
    sc_remember_email((string) $person['email']);
    sc_auth_log('login_ok', $person['email'], 'via=' . $via);
}

/**
 * Ingat email terakhir yang berhasil dipakai masuk, supaya form login sudah
 * terisi saat kodenya perlu diminta lagi keesokan harinya. Hanya alamat email,
 * bukan penanda apa pun yang bisa dipakai masuk — cookie ini tidak memberi
 * akses, hanya menghemat satu kali ketik.
 */
function sc_remember_email(string $email) {
    if (!filter_var($email, FILTER_VALIDATE_EMAIL)) return;   // pintu darurat pakai username
    $secure = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');
    @setcookie('sc_email', $email, [
        'expires'  => time() + 60 * 86400,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => $secure,
    ]);
}

/** Email yang diingat dari login terakhir, atau ''. */
function sc_remembered_email(): string {
    $e = (string) ($_COOKIE['sc_email'] ?? '');
    return filter_var($e, FILTER_VALIDATE_EMAIL) ? strtolower($e) : '';
}

// ─────────────────────────────────────────────────────────────────────────────
// Daftar orang & hak akses (lib/access.php)
// ─────────────────────────────────────────────────────────────────────────────

function sc_access(): array {
    static $a = null;
    if ($a !== null) return $a;

    $raw    = require __DIR__ . '/access.php';
    $people = [];
    foreach (($raw['people'] ?? []) as $key => $p) {
        $email = strtolower(trim((string) ($p['email'] ?? '')));
        if ($email === '') continue;
        $tools = [];
        foreach (($raw['access'] ?? []) as $tool => $keys) {
            if (in_array($key, $keys, true)) $tools[] = $tool;
        }
        $people[$email] = [
            'key'   => $key,
            'name'  => (string) ($p['name'] ?? $key),
            'email' => $email,
            'admin' => !empty($p['admin']),
            'tools' => $tools,
        ];
    }
    $a = ['people' => $people, 'access' => $raw['access'] ?? [], 'tools' => $raw['tools'] ?? []];
    return $a;
}

/** Cari orang berdasarkan email (case-insensitive). null kalau tidak terdaftar. */
function sc_person_by_email(string $email) {
    $email = strtolower(trim($email));
    return sc_access()['people'][$email] ?? null;
}

/** Metadata kartu tool (icon/title/href/desc). */
function sc_tool_meta(string $tool): array {
    return sc_access()['tools'][$tool]
        ?? ['icon' => '📦', 'title' => $tool, 'href' => $tool . '/', 'desc' => ''];
}

/** Boleh-tidaknya user yang sedang masuk membuka satu tool. */
function sc_user_can(string $tool): bool {
    $u = sc_user();
    if (!$u) return false;
    return in_array($tool, $u['tools'] ?? [], true);
}

// ─────────────────────────────────────────────────────────────────────────────
// Penyimpanan OTP (berkas) + catatan audit
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Direktori kerja auth. cache/ dipilih karena sudah pasti bisa ditulis di host
 * (app menulis cache Sheets ke sana terus-menerus) dan sudah diblokir dari web
 * oleh cache/.htaccess. GoogleSheets hanya menghapus berkas `rd_*.json` saat
 * membersihkan cache, jadi isi cache/auth/ tidak ikut terhapus.
 */
function sc_auth_dir(): string {
    static $dir = null;
    if ($dir !== null) return $dir;
    $cfg  = sc_config();
    $base = $cfg['cache_dir'] ?? (dirname(__DIR__) . '/cache');
    $d    = $base . '/auth';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    if (!is_dir($d) || !is_writable($d)) $d = sys_get_temp_dir() . '/sc_auth';
    if (!is_dir($d)) @mkdir($d, 0700, true);
    $dir = $d;
    return $dir;
}

/** Catat peristiwa auth (untuk audit; berkas .log diblokir .htaccess). */
function sc_auth_log(string $event, string $who = '', string $note = '') {
    $line = sprintf("%s\t%s\t%s\t%s\t%s\n",
        date('Y-m-d H:i:s'), $event, $who,
        $_SERVER['REMOTE_ADDR'] ?? '-', str_replace(["\n", "\t"], ' ', $note));
    @file_put_contents(sc_auth_dir() . '/auth.log', $line, FILE_APPEND | LOCK_EX);
}

function sc_otp_file(string $email): string {
    return sc_auth_dir() . '/otp_' . sha1(strtolower($email)) . '.json';
}

function sc_otp_read(string $email) {
    $f = sc_otp_file($email);
    if (!is_file($f)) return null;
    $d = json_decode((string) @file_get_contents($f), true);
    return is_array($d) ? $d : null;
}

function sc_otp_write(string $email, array $rec) {
    @file_put_contents(sc_otp_file($email), json_encode($rec), LOCK_EX);
}

function sc_otp_clear(string $email) {
    @unlink(sc_otp_file($email));
}

/**
 * Buang berkas OTP dan penghitung pembatas yang sudah kedaluwarsa
 * (dipanggil sesekali). Penghitung ikut disapu supaya `cache/auth/` tidak
 * menumpuk berkas `rl_*` seumur hidup aplikasi.
 */
function sc_otp_gc() {
    $now = time();
    foreach ((array) glob(sc_auth_dir() . '/otp_*.json') as $f) {
        $d = json_decode((string) @file_get_contents($f), true);
        if (!is_array($d) || (int) ($d['exp'] ?? 0) < $now - 3600) @unlink($f);
    }
    foreach ((array) glob(sc_auth_dir() . '/rl_*.json') as $f) {
        $d = json_decode((string) @file_get_contents($f), true);
        if (!is_array($d) || (int) ($d['start'] ?? 0) < $now - 3600) @unlink($f);
    }
}

/** Berkas penghitung untuk satu kunci pembatas (IP atau email). */
function sc_rate_file(string $key): string {
    return sc_auth_dir() . '/rl_' . sha1($key) . '.json';
}

/**
 * Hitung satu permintaan untuk `$key`; true kalau sudah lewat `$max` dalam
 * satu jam terakhir. Jendelanya bergulir per jam, bukan geser terus-menerus —
 * cukup untuk tujuannya dan tidak perlu menyimpan riwayat tiap permintaan.
 */
function sc_rate_hit(string $key, int $max): bool {
    $f   = sc_rate_file($key);
    $d   = json_decode((string) @file_get_contents($f), true);
    $now = time();
    if (!is_array($d) || (int) ($d['start'] ?? 0) < $now - 3600) $d = ['start' => $now, 'n' => 0];
    $d['n']++;
    @file_put_contents($f, json_encode($d), LOCK_EX);
    return $d['n'] > $max;
}

/** Rem kasar per IP: menghitung SEMUA permintaan, termasuk email asing. */
function sc_ip_throttled(): bool {
    return sc_rate_hit('ip:' . ($_SERVER['REMOTE_ADDR'] ?? '-'), SC_OTP_MAX_PER_IP_HOUR);
}

/**
 * Batas per alamat email. Hanya dipanggil untuk email yang TERDAFTAR, supaya
 * permintaan dengan alamat asal-asalan tidak meninggalkan berkas penghitung
 * satu per satu di disk.
 */
function sc_email_throttled(string $email): bool {
    return sc_rate_hit('email:' . strtolower($email), SC_OTP_MAX_PER_EMAIL_HOUR);
}

// ─────────────────────────────────────────────────────────────────────────────
// Alur OTP
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Minta kode untuk sebuah email.
 *
 * Selalu tampak sama dari luar, apa pun statusnya: terdaftar, tidak terdaftar,
 * atau sedang dalam jeda kirim ulang. Membedakannya akan membocorkan email
 * siapa saja yang punya akses. Hanya jalur internalnya (mengirim atau tidak)
 * yang berbeda.
 *
 * Mengembalikan ['sent' => bool, 'error' => string|null]. 'error' hanya diisi
 * untuk kegagalan teknis pada email yang memang terdaftar (mis. SMTP mati),
 * karena diam saja di situ hanya membuat orang menunggu kode yang tak pernah
 * datang.
 */
function sc_otp_request(string $email): array {
    $email  = strtolower(trim($email));
    $person = sc_person_by_email($email);

    if (mt_rand(1, 20) === 1) sc_otp_gc();

    // Urutannya penting. Rem IP lebih dulu supaya permintaan dengan alamat
    // asal-asalan ikut terhitung; baru sesudah itu email dicocokkan, dan batas
    // per email hanya dikenakan pada alamat yang memang terdaftar.
    if (sc_ip_throttled()) {
        sc_auth_log('otp_throttled_ip', $email);
        return ['sent' => false, 'error' => null];
    }

    if (!$person) {
        sc_auth_log('otp_unknown', $email);
        return ['sent' => false, 'error' => null];
    }

    if (sc_email_throttled($email)) {
        sc_auth_log('otp_throttled_email', $email);
        return ['sent' => false, 'error' => null];
    }

    $rec = sc_otp_read($email);
    if ($rec && (time() - (int) ($rec['created'] ?? 0)) < SC_OTP_RESEND_SEC) {
        sc_auth_log('otp_cooldown', $email);
        return ['sent' => false, 'error' => null];      // kode sebelumnya masih hidup
    }

    $code = (string) random_int(100000, 999999);
    sc_otp_write($email, [
        'hash'     => password_hash($code, PASSWORD_DEFAULT),
        'exp'      => time() + SC_OTP_TTL_MIN * 60,
        'attempts' => 0,
        'created'  => time(),
    ]);

    $err = null;
    $ok  = sc_send_otp_email($email, $code, SC_OTP_TTL_MIN, $err);
    sc_auth_log($ok ? 'otp_sent' : 'otp_send_fail', $email, (string) $err);
    if (!$ok) {
        sc_otp_clear($email);   // jangan tinggalkan kode yang tak pernah sampai
        return ['sent' => false,
                'error' => 'Kode gagal dikirim (masalah server email, bukan salah Anda). Hubungi admin.'];
    }
    return ['sent' => true, 'error' => null];
}

/**
 * Verifikasi kode. Mengembalikan ['ok' => bool, 'error' => string|null].
 * Kode yang benar langsung dihanguskan (sekali pakai) dan sesi dibuat.
 */
function sc_otp_verify(string $email, string $code): array {
    $email = strtolower(trim($email));
    $rec   = sc_otp_read($email);

    if (!$rec) {
        return ['ok' => false, 'error' => 'Tidak ada kode aktif. Minta kode baru.'];
    }
    if ((int) $rec['exp'] < time()) {
        sc_otp_clear($email);
        return ['ok' => false, 'error' => 'Kode sudah kadaluarsa. Minta kode baru.'];
    }
    if ((int) $rec['attempts'] >= SC_OTP_MAX_ATTEMPTS) {
        sc_otp_clear($email);
        sc_auth_log('otp_locked', $email);
        return ['ok' => false, 'error' => 'Terlalu banyak percobaan salah. Minta kode baru.'];
    }
    if (!password_verify(trim($code), (string) $rec['hash'])) {
        $rec['attempts'] = (int) $rec['attempts'] + 1;
        sc_otp_write($email, $rec);
        sc_auth_log('otp_wrong', $email, 'attempt=' . $rec['attempts']);
        return ['ok' => false, 'error' => 'Kode salah. Coba lagi.'];
    }

    sc_otp_clear($email);
    $person = sc_person_by_email($email);
    if (!$person) {
        // Akses dicabut di antara kode dikirim dan kode dimasukkan.
        sc_auth_log('otp_revoked', $email);
        return ['ok' => false, 'error' => 'Akun tidak lagi punya akses. Hubungi admin.'];
    }
    sc_start_session_for($person, 'otp');
    return ['ok' => true, 'error' => null];
}

// ─────────────────────────────────────────────────────────────────────────────
// Pintu darurat: username + password dari config.php
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Login admin darurat. Akun ini mendapat akses SEMUA tool — dipakai hanya kalau
 * pengiriman email mati. Kosongkan config.php['users'] untuk menonaktifkannya.
 */
function sc_login($user, $pass): bool {
    $cfg  = sc_config();
    $user = trim((string) $user);
    if (!isset($cfg['users'][$user])) { sc_auth_log('pw_unknown', $user); return false; }
    if (!password_verify((string) $pass, $cfg['users'][$user])) {
        sc_auth_log('pw_wrong', $user);
        return false;
    }
    sc_start_session_for([
        'key'   => $user,
        'name'  => $user,
        'email' => $user,
        'admin' => true,
        'tools' => array_keys(sc_access()['access']),
    ], 'password');
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSRF
// ─────────────────────────────────────────────────────────────────────────────

function sc_csrf_token(): string {
    sc_session_start();
    if (empty($_SESSION['csrf'])) $_SESSION['csrf'] = bin2hex(random_bytes(32));
    return $_SESSION['csrf'];
}

function sc_csrf_field(): string {
    return '<input type="hidden" name="csrf" value="' . htmlspecialchars(sc_csrf_token(), ENT_QUOTES) . '">';
}

function sc_csrf_check() {
    sc_session_start();
    if (!hash_equals($_SESSION['csrf'] ?? '', (string) ($_POST['csrf'] ?? ''))) {
        http_response_code(419);
        exit('Sesi tidak valid atau kadaluarsa. <a href="login.php">Muat ulang halaman masuk</a>.');
    }
}
