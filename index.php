<?php
require_once __DIR__ . '/lib/auth.php';
// Landing is OPEN. The login now gates ONLY Cost Core (see costcore/).
$user = sc_current_user();   // null when not signed in
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
  .user a { color: #f87171; text-decoration: none; margin-left: 14px; font-weight: 500; }
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
  footer { text-align: center; padding: 20px; font-size: 12px; color: #475569; }
</style>
</head>
<body>
  <header>
    <div class="brand">Sales<span>Connect</span></div>
    <div class="user">
      <?php if ($user): ?>
        <?= htmlspecialchars($user) ?>
        <a href="logout.php">Keluar</a>
      <?php endif; ?>
    </div>
  </header>
  <main>
    <h1>Tools Centre</h1>
    <p class="sub">Pilih aplikasi yang ingin kamu buka.</p>
    <div class="grid">
      <a class="card" href="cil/">
        <div class="icon">📇</div>
        <h2>Client Interaction Log</h2>
        <p>Catat komunikasi &amp; complaint pelanggan untuk tim sales.</p>
      </a>
      <a class="card" href="taskflow/">
        <div class="icon">✅</div>
        <h2>TaskFlow</h2>
        <p>Penugasan task antar staff dengan status &amp; deadline.</p>
      </a>
      <a class="card" href="costcore/">
        <div class="icon">🧮</div>
        <h2>Cost Core</h2>
        <p>Hitung costing produk baja (import &amp; domestic), simpan ke Sheet.</p>
      </a>
      <a class="card" href="scot/">
        <div class="icon">🚢</div>
        <h2>Shipment Control Tower</h2>
        <p>Pantau shipment: BL, vessel, clearance, delivery &amp; alerts.</p>
      </a>
    </div>
  </main>
  <footer>SalesConnect · data tersimpan di Google Sheets</footer>
</body>
</html>
