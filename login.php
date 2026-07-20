<?php
require_once __DIR__ . '/lib/auth.php';

// After login, return to ?next= (validated same-site relative path), else the landing.
$next = $_GET['next'] ?? '';
$dest = 'index.php';
if ($next !== '' && $next[0] === '/' && !str_starts_with($next, '//')
    && preg_match('#^/[A-Za-z0-9_./\-]*$#', $next)) {
    $dest = $next;
}

if (sc_current_user()) { header('Location: ' . $dest); exit; }

$err = '';
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (sc_login($_POST['username'] ?? '', $_POST['password'] ?? '')) {
        header('Location: ' . $dest);
        exit;
    }
    $err = 'Username atau password salah.';
}
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
         padding: 36px; width: 100%; max-width: 380px; }
  .brand { font-weight: 700; font-size: 24px; text-align: center; margin-bottom: 4px; }
  .brand span { color: #38bdf8; }
  .tag { text-align: center; color: #94a3b8; font-size: 14px; margin-bottom: 28px; }
  label { display: block; font-size: 13px; color: #cbd5e1; margin: 14px 0 6px; font-weight: 500; }
  input { width: 100%; padding: 11px 13px; border-radius: 9px; border: 1px solid #334155;
          background: #0f172a; color: #e2e8f0; font-size: 15px; }
  input:focus { outline: none; border-color: #38bdf8; }
  button { width: 100%; margin-top: 22px; padding: 12px; border: none; border-radius: 9px;
           background: #38bdf8; color: #0f172a; font-weight: 600; font-size: 15px; cursor: pointer; }
  button:hover { background: #0ea5e9; }
  .err { background: #7f1d1d; color: #fecaca; padding: 10px 12px; border-radius: 8px;
         font-size: 13px; margin-top: 18px; text-align: center; }
</style>
</head>
<body>
  <form class="box" method="POST" autocomplete="off">
    <div class="brand">Sales<span>Connect</span></div>
    <div class="tag">Masuk untuk melanjutkan</div>
    <?php if ($err): ?><div class="err"><?= htmlspecialchars($err) ?></div><?php endif; ?>
    <label for="username">Username</label>
    <input id="username" name="username" type="text" required autofocus>
    <label for="password">Password</label>
    <input id="password" name="password" type="password" required>
    <button type="submit">Masuk</button>
  </form>
</body>
</html>
