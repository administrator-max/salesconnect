<?php
/**
 * SalesConnect — halaman depan.
 * Wajib login. Kartu yang tampil hanya dashboard yang boleh dibuka user ini
 * (lihat lib/access.php); dashboard lain tidak ditampilkan sama sekali.
 */
require_once __DIR__ . '/lib/tool_guard.php';
sc_require_login_page();

$user  = sc_user();
$tools = $user['tools'];
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>SalesConnect — Tools Centre</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
         min-height: 100vh; display: flex; flex-direction: column; }
  header { display: flex; justify-content: space-between; align-items: center;
           padding: 20px 32px; border-bottom: 1px solid #1e293b; }
  .brand { font-weight: 700; font-size: 20px; letter-spacing: -0.02em; }
  .brand span { color: #38bdf8; }
  .user { font-size: 14px; color: #94a3b8; }
  .user b { color: #e2e8f0; font-weight: 600; }
  .user a { color: #f87171; text-decoration: none; margin-left: 14px; font-weight: 500; }
  .user a.mild { color: #64748b; }
  .user a:hover { text-decoration: underline; }
  main { flex: 1; display: flex; flex-direction: column; align-items: center;
         justify-content: center; padding: 40px 20px; }
  h1 { font-size: 28px; font-weight: 700; margin-bottom: 8px; text-align: center; }
  .sub { color: #94a3b8; margin-bottom: 40px; text-align: center; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
          gap: 24px; width: 100%; max-width: 720px; }
  .card { background: #1e293b; border: 1px solid #334155; border-radius: 16px;
          padding: 28px; text-decoration: none; color: inherit; transition: all .15s;
          display: block; }
  .card:hover { border-color: #38bdf8; transform: translateY(-3px); }
  .card .icon { font-size: 32px; margin-bottom: 16px; }
  .card h2 { font-size: 18px; font-weight: 600; margin-bottom: 6px; }
  .card p { font-size: 14px; color: #94a3b8; line-height: 1.5; }
  .empty { background: #1e293b; border: 1px solid #334155; border-radius: 16px;
           padding: 28px; max-width: 460px; color: #94a3b8; font-size: 14px; line-height: 1.6; }
  footer { text-align: center; padding: 20px; font-size: 12px; color: #475569; }
</style>
</head>
<body>
  <header>
    <div class="brand">Sales<span>Connect</span></div>
    <div class="user">
      <b><?= htmlspecialchars($user['name']) ?></b>
      <?php if (!empty($user['admin'])): ?>
        <a class="mild" href="diag.php">Diagnostik</a>
      <?php endif; ?>
      <a href="logout.php">Keluar</a>
    </div>
  </header>
  <main>
    <h1>Tools Centre</h1>
    <p class="sub">Pilih aplikasi yang ingin kamu buka.</p>
    <?php if ($tools): ?>
      <div class="grid">
        <?php foreach ($tools as $t): $m = sc_tool_meta($t); ?>
          <a class="card" href="<?= htmlspecialchars($m['href'], ENT_QUOTES) ?>">
            <div class="icon"><?= $m['icon'] ?></div>
            <h2><?= htmlspecialchars($m['title']) ?></h2>
            <p><?= $m['desc'] ?></p>
          </a>
        <?php endforeach; ?>
      </div>
    <?php else: ?>
      <div class="empty">Akun <b><?= htmlspecialchars($user['email']) ?></b> belum diberi akses
        ke dashboard mana pun. Hubungi admin SalesConnect.</div>
    <?php endif; ?>
  </main>
  <footer>SalesConnect · data tersimpan di Google Sheets</footer>
</body>
</html>
