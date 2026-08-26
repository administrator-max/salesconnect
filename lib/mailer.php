<?php
/**
 * SalesConnect — pengiriman email (kode OTP login).
 *
 * Klien SMTP-nya disalin apa adanya dari HR Center (core/mail.php), yang sudah
 * terbukti jalan di host yang sama. Tidak ada library eksternal — sama seperti
 * lib/GoogleSheets.php, supaya tidak menambah ratusan file vendor/ di shared
 * hosting.
 *
 * KREDENSIAL TIDAK PERNAH ADA DI FILE INI. sc_mail_config() mencarinya
 * berurutan; yang pertama lengkap dipakai:
 *
 *   1. $cfg['smtp'] di config.php               <- paling eksplisit, milik app ini
 *   2. berkas rahasia di luar docroot           <- dipakai bersama HR Center
 *      - getenv('SC_PRIVATE') . '/secrets.php'
 *      - /home/u5959765/salesconnect_private/secrets.php
 *      - /home/u5959765/hrcenter_private/secrets.php
 *      - <root>/secure/secrets.php              (fallback dev lokal)
 *   3. fungsi mail() bawaan PHP                 <- terakhir; sering masuk spam
 *
 * Poin 2 sengaja menumpang berkas HR Center: keduanya satu akun cPanel, jadi
 * tidak ada salinan password SMTP baru yang dibuat, dan rotasi kredensial di
 * HR Center otomatis ikut berlaku di sini. Kalau suatu saat dipisah, cukup
 * buat salesconnect_private/secrets.php - ia menang duluan.
 *
 * Diagnosa: buka /diag.php sebagai admin untuk melihat sumber mana yang
 * terpakai dan mengirim email uji.
 */

require_once __DIR__ . '/helpers.php';

/** Kandidat berkas rahasia, urut prioritas. */
function sc_secret_files(): array {
    $c = [];
    if ($env = getenv('SC_PRIVATE')) $c[] = rtrim($env, '/\\') . '/secrets.php';
    $c[] = '/home/u5959765/salesconnect_private/secrets.php';
    $c[] = '/home/u5959765/hrcenter_private/secrets.php';
    $c[] = dirname(__DIR__) . '/secure/secrets.php';
    return $c;
}

/**
 * Konfigurasi mail yang aktif.
 * Mengembalikan: method|from|host|port|secure|user|pass|helo|source
 * `source` menjelaskan dari mana nilainya datang (untuk diag.php).
 */
function sc_mail_config(): array {
    static $mc = null;
    if ($mc !== null) return $mc;

    $base = [
        'method' => 'mail', 'from' => '', 'host' => '', 'port' => 587,
        'secure' => 'tls', 'user' => '', 'pass' => '', 'helo' => 'tapworkspace.com',
        'source' => 'belum ada konfigurasi',
    ];

    // 1) config.php
    $cfg  = sc_config();
    $smtp = $cfg['smtp'] ?? null;
    if (is_array($smtp) && !empty($smtp['host']) && !empty($smtp['user']) && !empty($smtp['pass'])) {
        $mc = array_merge($base, $smtp, ['method' => 'smtp', 'source' => 'config.php[smtp]']);
        if (empty($mc['from'])) $mc['from'] = $mc['user'];
        return $mc;
    }

    // 2) berkas rahasia bersama
    foreach (sc_secret_files() as $f) {
        if (!is_file($f) || !is_readable($f)) continue;
        $s = @require $f;
        if (!is_array($s)) continue;
        $host = $s['SMTP_HOST'] ?? '';
        $user = $s['SMTP_USER'] ?? '';
        $pass = $s['SMTP_PASS'] ?? '';
        if ($host === '' || $user === '' || $pass === '') continue;
        $mc = [
            'method' => strtolower((string) ($s['MAIL_METHOD'] ?? 'smtp')) === 'mail' ? 'mail' : 'smtp',
            'from'   => (string) ($s['MAIL_FROM'] ?? $user),
            'host'   => (string) $host,
            'port'   => (int) ($s['SMTP_PORT'] ?? 587),
            'secure' => (string) ($s['SMTP_SECURE'] ?? 'tls'),
            'user'   => (string) $user,
            'pass'   => (string) $pass,
            'helo'   => (string) ($s['SMTP_HELO'] ?? 'tapworkspace.com'),
            'source' => $f,
        ];
        return $mc;
    }

    // 3) mail() bawaan
    $host = $_SERVER['HTTP_HOST'] ?? 'salesconnect.tapworkspace.com';
    $mc = array_merge($base, [
        'from'   => 'noreply@' . preg_replace('/^www\./', '', $host),
        'source' => 'fallback mail() PHP',
    ]);
    return $mc;
}

/** Kirim kode OTP. true = server mail menerima (bukan jaminan sampai inbox). */
function sc_send_otp_email(string $to, string $code, ?int $ttlMin = null, &$err = null): bool {
    $ttlMin = $ttlMin ?? SC_OTP_TTL_MIN;
    $subject = 'SalesConnect Login Code';
    $body = "Halo,\r\n\r\n"
          . "Kode masuk SalesConnect Anda:\r\n\r\n"
          . "    $code\r\n\r\n"
          . "Kode berlaku $ttlMin menit dan hanya bisa dipakai sekali.\r\n"
          . "Jangan bagikan kode ini kepada siapa pun.\r\n\r\n"
          . "Jika Anda tidak meminta kode ini, abaikan email ini.\r\n";
    return sc_mail($to, $subject, $body, $err);
}

/** Kirim satu email teks biasa. */
function sc_mail(string $to, string $subject, string $body, &$err = null): bool {
    $mc = sc_mail_config();

    if ($mc['method'] === 'smtp') {
        $ok = sc_smtp_send($mc, $to, $subject, $body, $err);
        if (!$ok) {
            error_log('SalesConnect SMTP gagal: ' . $err);
            if (function_exists('sc_auth_log')) sc_auth_log('mail_fail', $to, $err);
        }
        return $ok;
    }

    $headers = 'From: ' . $mc['from'] . "\r\n"
             . 'Reply-To: ' . $mc['from'] . "\r\n"
             . "Content-Type: text/plain; charset=utf-8\r\n";
    $ok = @mail($to, $subject, $body, $headers);
    if (!$ok) {
        $err = 'fungsi mail() PHP mengembalikan false (SMTP belum dikonfigurasi)';
        error_log('SalesConnect mail() gagal untuk ' . $to);
        if (function_exists('sc_auth_log')) sc_auth_log('mail_fail', $to, $err);
    }
    return $ok;
}

/** Klien SMTP ringan tanpa library (asal: HR Center core/mail.php <- RecTrack). */
function sc_smtp_send(array $mc, string $to, string $subject, string $body, &$err = null): bool {
    $remote = ($mc['secure'] === 'ssl') ? 'ssl://' . $mc['host'] : $mc['host'];
    $fp = @fsockopen($remote, (int) $mc['port'], $errno, $errstr, 15);
    if (!$fp) { $err = "Koneksi ke server mail gagal: $errstr ($errno)"; return false; }
    stream_set_timeout($fp, 15);

    $read = function () use ($fp) {
        $data = '';
        while ($line = fgets($fp, 515)) {
            $data .= $line;
            if (isset($line[3]) && $line[3] === ' ') break;
        }
        return $data;
    };
    $cmd = function ($c) use ($fp, $read) { fwrite($fp, $c . "\r\n"); return $read(); };

    $read();
    $cmd('EHLO ' . $mc['helo']);

    if ($mc['secure'] === 'tls') {
        $cmd('STARTTLS');
        if (!stream_socket_enable_crypto($fp, true, STREAM_CRYPTO_METHOD_TLS_CLIENT)) {
            $err = 'Gagal mengaktifkan TLS.'; fclose($fp); return false;
        }
        $cmd('EHLO ' . $mc['helo']);
    }

    $r = $cmd('AUTH LOGIN');
    if (strncmp($r, '334', 3) !== 0) { $err = "Server menolak AUTH: $r"; fclose($fp); return false; }
    $cmd(base64_encode($mc['user']));
    $r = $cmd(base64_encode($mc['pass']));
    if (strncmp($r, '235', 3) !== 0) { $err = "Login SMTP gagal - cek user/password. ($r)"; fclose($fp); return false; }

    $cmd('MAIL FROM:<' . $mc['from'] . '>');
    $r = $cmd('RCPT TO:<' . $to . '>');
    if ($r === '' || $r[0] !== '2') { $err = "Penerima ditolak: $r"; fclose($fp); return false; }

    $cmd('DATA');
    $headers  = 'From: SalesConnect <' . $mc['from'] . ">\r\n";
    $headers .= 'To: <' . $to . ">\r\n";
    $headers .= 'Subject: ' . $subject . "\r\n";
    $headers .= "MIME-Version: 1.0\r\n";
    $headers .= "Content-Type: text/plain; charset=utf-8\r\n";
    $body = preg_replace('/^\./m', '..', $body);
    $r = $cmd($headers . "\r\n" . $body . "\r\n.");
    $cmd('QUIT');
    fclose($fp);

    if ($r === '' || $r[0] !== '2') { $err = "Email ditolak server: $r"; return false; }
    return true;
}
