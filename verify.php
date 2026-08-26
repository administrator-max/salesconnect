<?php
/**
 * SalesConnect — langkah 2: masukkan kode sekali pakai yang dikirim ke email.
 * Langkah 1 ada di login.php.
 */
require_once __DIR__ . '/lib/auth.php';

sc_session_start();

$dest = 'index.php';
$next = (string) ($_SESSION['sc_next'] ?? '');
if ($next !== '' && $next[0] === '/' && !str_starts_with($next, '//')
    && preg_match('#^/[A-Za-z0-9_./\-]*$#', $next)) {
    $dest = $next;
}

if (sc_user()) { unset($_SESSION['sc_next']); header('Location: ' . $dest); exit; }

$email = (string) ($_SESSION['otp_email'] ?? '');
if ($email === '') { header('Location: login.php'); exit; }

$error = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    sc_csrf_check();
    $r = sc_otp_verify($email, (string) ($_POST['code'] ?? ''));
    if ($r['ok']) {
        unset($_SESSION['sc_next']);
        header('Location: ' . $dest);
        exit;
    }
    $error = $r['error'];
}

$flash    = (string) ($_SESSION['flash'] ?? '');
$flashBad = !empty($_SESSION['flash_bad']);
unset($_SESSION['flash'], $_SESSION['flash_bad']);
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Verifikasi — SalesConnect</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
         min-height: 100vh; display: flex; align-items: center; justify-content: center; padding: 20px; }
  .box { background: #1e293b; border: 1px solid #334155; border-radius: 16px;
         padding: 36px; width: 100%; max-width: 400px; }
  .brand { font-weight: 700; font-size: 24px; text-align: center; margin-bottom: 4px; }
  .brand span { color: #38bdf8; }
  .tag { text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 20px; line-height: 1.6; }
  .tag b { color: #e2e8f0; }
  label { display: block; font-size: 13px; color: #cbd5e1; margin: 14px 0 6px; font-weight: 500; }
  input { width: 100%; padding: 12px 13px; border-radius: 9px; border: 1px solid #334155;
          background: #0f172a; color: #e2e8f0; font-size: 22px; text-align: center;
          letter-spacing: 8px; font-weight: 600; }
  input:focus { outline: none; border-color: #38bdf8; }
  button { width: 100%; margin-top: 20px; padding: 12px; border: none; border-radius: 9px;
           background: #38bdf8; color: #0f172a; font-weight: 600; font-size: 15px; cursor: pointer; }
  button:hover { background: #0ea5e9; }
  .err  { background: #7f1d1d; color: #fecaca; padding: 10px 12px; border-radius: 8px;
          font-size: 13px; margin-bottom: 6px; text-align: center; }
  .ok   { background: #14532d; color: #bbf7d0; padding: 10px 12px; border-radius: 8px;
          font-size: 13px; margin-bottom: 6px; text-align: center; }
  .row { display: flex; justify-content: space-between; align-items: center; margin-top: 18px; }
  .row form { margin: 0; }
  .link { background: none; border: none; padding: 0; margin: 0; width: auto;
          color: #38bdf8; font-size: 13px; cursor: pointer; font-weight: 500; }
  .link:hover { background: none; text-decoration: underline; }
  .row a { color: #64748b; font-size: 13px; text-decoration: none; }
  .row a:hover { color: #94a3b8; }
</style>
</head>
<body>
  <div class="box">
    <div class="brand">Sales<span>Connect</span></div>
    <div class="tag">Kode dikirim ke <b><?= htmlspecialchars($email) ?></b>.<br>
      Berlaku <?= SC_OTP_TTL_MIN ?> menit. Cek juga folder spam.</div>

    <?php if ($flash): ?>
      <div class="<?= $flashBad ? 'err' : 'ok' ?>"><?= htmlspecialchars($flash) ?></div>
    <?php endif; ?>
    <?php if ($error): ?><div class="err"><?= htmlspecialchars($error) ?></div><?php endif; ?>

    <form method="POST" autocomplete="off">
      <?= sc_csrf_field() ?>
      <label for="code">Kode 6 digit</label>
      <input id="code" name="code" type="text" inputmode="numeric" maxlength="6"
             pattern="[0-9]{6}" required autofocus placeholder="······">
      <button type="submit">🔓 Verifikasi &amp; masuk</button>
    </form>

    <div class="row">
      <form method="POST" action="login.php">
        <?= sc_csrf_field() ?>
        <input type="hidden" name="email" value="<?= htmlspecialchars($email, ENT_QUOTES) ?>">
        <button type="submit" class="link">↻ Kirim ulang kode</button>
      </form>
      <a href="login.php">Ganti email</a>
    </div>
  </div>
</body>
</html>
