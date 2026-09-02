<?php
/**
 * SalesConnect — halaman masuk (email + kode sekali pakai).
 *
 * Langkah 1 dari 2. Langkah 2 ada di verify.php.
 * ?pw=1 membuka pintu darurat username+password (lihat lib/auth.php).
 */
require_once __DIR__ . '/lib/auth.php';

/** Tujuan setelah masuk: ?next= (harus path relatif satu situs) atau halaman depan. */
function sc_dest_from(string $next): string {
    if ($next !== '' && $next[0] === '/' && !str_starts_with($next, '//')
        && preg_match('#^/[A-Za-z0-9_./\-]*$#', $next)) {
        return $next;
    }
    return 'index.php';
}

sc_session_start();

$next = (string) ($_GET['next'] ?? '');
if ($next !== '') $_SESSION['sc_next'] = $next;         // dibawa sampai verify.php
$dest = sc_dest_from((string) ($_SESSION['sc_next'] ?? ''));

if (sc_user()) { unset($_SESSION['sc_next']); header('Location: ' . $dest); exit; }

$cfg      = sc_config();
$pwMode   = isset($_GET['pw']) && !empty($cfg['users']);
$notice   = isset($_GET['timeout']) ? 'Sesi berakhir karena tidak ada aktivitas. Silakan masuk lagi.' : '';
$error    = '';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    sc_csrf_check();

    if (isset($_POST['username'])) {
        // ── Pintu darurat: username + password ──────────────────────────
        $pwMode = true;
        if (sc_login($_POST['username'] ?? '', $_POST['password'] ?? '')) {
            unset($_SESSION['sc_next']);
            header('Location: ' . $dest);
            exit;
        }
        $error = 'Username atau password salah.';
    } else {
        // ── Alur normal: kirim kode ke email ────────────────────────────
        $email = strtolower(trim((string) ($_POST['email'] ?? '')));
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $error = 'Format email tidak valid.';
        } else {
            $r = sc_otp_request($email);
            $_SESSION['otp_email'] = $email;
            // Pesannya sengaja sama untuk email terdaftar maupun tidak — kalau
            // berbeda, siapa pun bisa menebak-nebak siapa saja yang punya akses.
            //
            // Kalimat kedua ada karena permintaan yang kena batas TIDAK bisa
            // dibedakan dari yang berhasil tanpa membocorkan hal yang sama.
            // Menyebut adanya batas di semua kasus membuat orang tahu apa yang
            // mungkin terjadi, tanpa mengonfirmasi email siapa yang terdaftar —
            // lebih baik daripada membiarkannya menunggu kode yang ditahan.
            $_SESSION['flash'] = $r['error']
                ?: 'Jika email terdaftar, kode sudah dikirim. Kode hanya bisa diminta '
                 . 'beberapa kali per jam — kalau belum sampai, tunggu sebentar '
                 . 'sebelum meminta lagi.';
            $_SESSION['flash_bad'] = (bool) $r['error'];
            header('Location: verify.php');
            exit;
        }
    }
}

// Sudah terisi dari login terakhir di browser ini — satu kali ketik lebih sedikit
// saat kodenya perlu diminta lagi keesokan harinya.
$prefill = (string) ($_SESSION['otp_email'] ?? '') ?: sc_remembered_email();
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Masuk — SalesConnect</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .box { background: #1e293b; border: 1px solid #334155; border-radius: 16px;
         padding: 36px; width: 100%; max-width: 400px; }
  .brand { font-weight: 700; font-size: 24px; text-align: center; margin-bottom: 4px; }
  .brand span { color: #38bdf8; }
  .tag { text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 24px; }
  label { display: block; font-size: 13px; color: #cbd5e1; margin: 14px 0 6px; font-weight: 500; }
  input { width: 100%; padding: 11px 13px; border-radius: 9px; border: 1px solid #334155;
          background: #0f172a; color: #e2e8f0; font-size: 15px; }
  input:focus { outline: none; border-color: #38bdf8; }
  button { width: 100%; margin-top: 22px; padding: 12px; border: none; border-radius: 9px;
           background: #38bdf8; color: #0f172a; font-weight: 600; font-size: 15px; cursor: pointer; }
  button:hover { background: #0ea5e9; }
  .err { background: #7f1d1d; color: #fecaca; padding: 10px 12px; border-radius: 8px;
         font-size: 13px; margin-bottom: 6px; text-align: center; }
  .warn { background: #78350f; color: #fed7aa; padding: 10px 12px; border-radius: 8px;
          font-size: 13px; margin-bottom: 6px; text-align: center; }
  .hint { color: #64748b; font-size: 12.5px; line-height: 1.55; margin-top: 18px; text-align: center; }
  .hint a { color: #64748b; }
</style>
</head>
<body>
  <form class="box" method="POST" autocomplete="off">
    <?= sc_csrf_field() ?>
    <div class="brand">Sales<span>Connect</span></div>

    <?php if ($pwMode): ?>
      <div class="tag">Masuk admin (pintu darurat)</div>
      <?php if ($notice): ?><div class="warn"><?= htmlspecialchars($notice) ?></div><?php endif; ?>
      <?php if ($error): ?><div class="err"><?= htmlspecialchars($error) ?></div><?php endif; ?>
      <label for="username">Username</label>
      <input id="username" name="username" type="text" required autofocus>
      <label for="password">Password</label>
      <input id="password" name="password" type="password" required>
      <button type="submit">Masuk</button>
      <div class="hint"><a href="login.php">&larr; Masuk dengan email &amp; kode</a></div>
    <?php else: ?>
      <div class="tag">Masukkan email kantor Anda. Kode sekali pakai akan dikirim ke email tersebut.</div>
      <?php if ($notice): ?><div class="warn"><?= htmlspecialchars($notice) ?></div><?php endif; ?>
      <?php if ($error): ?><div class="err"><?= htmlspecialchars($error) ?></div><?php endif; ?>
      <label for="email">Email</label>
      <input id="email" name="email" type="email" required autofocus
             placeholder="nama@gunungprisma.com" value="<?= htmlspecialchars($prefill, ENT_QUOTES) ?>">
      <button type="submit">✉ Kirim kode</button>
      <div class="hint">Hanya email yang terdaftar yang bisa masuk.<br>
        Butuh akses? Hubungi admin SalesConnect.</div>
    <?php endif; ?>
  </form>
</body>
</html>
