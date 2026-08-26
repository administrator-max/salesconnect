<?php
/**
 * SalesConnect — diagnostik login (khusus admin).
 *
 * Ada karena satu pertanyaan yang tidak bisa dijawab dari kode: apakah host ini
 * benar-benar bisa membaca berkas rahasia SMTP dan mengirim email? Kalau tidak,
 * tidak ada yang bisa masuk lewat OTP — dan halaman ini (dijangkau lewat pintu
 * darurat /login.php?pw=1) yang memberi tahu kenapa.
 *
 * Tidak pernah menampilkan password. Email uji hanya boleh dikirim ke alamat
 * yang sudah terdaftar di lib/access.php, jadi halaman ini tidak bisa dipakai
 * mengirim email ke sembarang orang.
 */
require_once __DIR__ . '/lib/tool_guard.php';
sc_require_login_page();

$user = sc_user();
if (empty($user['admin'])) {
    http_response_code(403);
    sc_render_denied('diag');
    exit;
}

$mc     = sc_mail_config();
$result = '';
$ok     = false;

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    sc_csrf_check();
    $to = strtolower(trim((string) ($_POST['to'] ?? '')));
    if (!sc_person_by_email($to)) {
        $result = 'Alamat tujuan harus email yang terdaftar di lib/access.php.';
    } else {
        $err = null;
        $ok  = sc_mail($to, 'SalesConnect — email uji',
                       "Ini email uji dari halaman diagnostik SalesConnect.\r\n"
                     . 'Dikirim ' . date('Y-m-d H:i:s') . " WIB.\r\n", $err);
        $result = $ok ? "Terkirim ke $to (server mail menerimanya — cek inbox/spam)."
                      : "GAGAL: $err";
    }
}

/** Sensor bagian tengah sebuah nilai supaya tetap bisa dikenali tanpa dibocorkan. */
function sc_mask(string $v): string {
    if ($v === '') return '—';
    $n = strlen($v);
    if ($n <= 6) return str_repeat('•', $n);
    return substr($v, 0, 3) . str_repeat('•', max(3, $n - 6)) . substr($v, -3);
}

$authDir = sc_auth_dir();
$access  = sc_access();
$logFile = $authDir . '/auth.log';
$tail    = '';
if (is_file($logFile)) {
    $lines = @file($logFile, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: [];
    $tail  = implode("\n", array_slice($lines, -25));
}
?>
<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="robots" content="noindex, nofollow">
<title>Diagnostik login — SalesConnect</title>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&display=swap" rel="stylesheet">
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Inter', system-ui, sans-serif; background: #0f172a; color: #e2e8f0;
         padding: 32px 20px; }
  .wrap { max-width: 860px; margin: 0 auto; }
  h1 { font-size: 22px; margin-bottom: 4px; }
  .sub { color: #94a3b8; font-size: 14px; margin-bottom: 26px; }
  .sub a { color: #38bdf8; text-decoration: none; }
  section { background: #1e293b; border: 1px solid #334155; border-radius: 14px;
            padding: 22px; margin-bottom: 18px; }
  h2 { font-size: 15px; margin-bottom: 14px; color: #cbd5e1; }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  td { padding: 6px 8px; border-bottom: 1px solid #273449; vertical-align: top; }
  td:first-child { color: #94a3b8; width: 210px; }
  code, pre { font-family: ui-monospace, Consolas, monospace; font-size: 12.5px; }
  pre { background: #0f172a; border: 1px solid #273449; border-radius: 9px; padding: 12px;
        overflow-x: auto; color: #cbd5e1; line-height: 1.5; }
  .ok { color: #4ade80; } .bad { color: #f87171; } .warn { color: #fbbf24; }
  form { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
  input { flex: 1; min-width: 240px; padding: 10px 12px; border-radius: 9px;
          border: 1px solid #334155; background: #0f172a; color: #e2e8f0; font-size: 14px; }
  button { padding: 10px 18px; border: none; border-radius: 9px; background: #38bdf8;
           color: #0f172a; font-weight: 600; font-size: 14px; cursor: pointer; }
  .res { margin-top: 12px; font-size: 13.5px; }
  ul { list-style: none; font-size: 13.5px; } li { padding: 4px 0; }
</style>
</head>
<body>
<div class="wrap">
  <h1>Diagnostik login</h1>
  <div class="sub"><a href="index.php">&larr; Halaman depan</a> · masuk sebagai
    <?= htmlspecialchars($user['email']) ?> (via <?= htmlspecialchars($user['via']) ?>)</div>

  <section>
    <h2>Pengiriman email</h2>
    <table>
      <tr><td>Sumber konfigurasi</td><td><code><?= htmlspecialchars($mc['source']) ?></code></td></tr>
      <tr><td>Metode</td><td>
        <?= $mc['method'] === 'smtp'
            ? '<span class="ok">SMTP</span>'
            : '<span class="warn">mail() bawaan PHP — kemungkinan besar masuk spam atau gagal</span>' ?>
      </td></tr>
      <tr><td>Host : port</td><td><code><?= htmlspecialchars($mc['host'] ?: '—') ?> : <?= (int) $mc['port'] ?></code>
        (<?= htmlspecialchars($mc['secure']) ?>)</td></tr>
      <tr><td>User SMTP</td><td><code><?= htmlspecialchars(sc_mask((string) $mc['user'])) ?></code></td></tr>
      <tr><td>Password SMTP</td><td><?= $mc['pass'] !== '' ? '<span class="ok">ada</span>' : '<span class="bad">kosong</span>' ?></td></tr>
      <tr><td>Pengirim (From)</td><td><code><?= htmlspecialchars($mc['from'] ?: '—') ?></code></td></tr>
    </table>
  </section>

  <section>
    <h2>Berkas rahasia yang dicari</h2>
    <ul>
      <?php foreach (sc_secret_files() as $f): ?>
        <li><code><?= htmlspecialchars($f) ?></code> —
          <?php if (!file_exists($f)): ?><span class="bad">tidak ada</span>
          <?php elseif (!is_readable($f)): ?><span class="bad">ada tapi tidak bisa dibaca</span>
          <?php else: ?><span class="ok">ada &amp; terbaca</span><?php endif; ?>
        </li>
      <?php endforeach; ?>
    </ul>
  </section>

  <section>
    <h2>Penyimpanan OTP</h2>
    <table>
      <tr><td>Direktori</td><td><code><?= htmlspecialchars($authDir) ?></code></td></tr>
      <tr><td>Bisa ditulis</td><td><?= is_writable($authDir)
          ? '<span class="ok">ya</span>' : '<span class="bad">TIDAK — login OTP akan gagal</span>' ?></td></tr>
      <tr><td>Kode aktif saat ini</td><td><?= count((array) glob($authDir . '/otp_*.json')) ?></td></tr>
      <tr><td>Sesi menganggur maks.</td><td><?= sc_idle_minutes() ?> menit</td></tr>
      <tr><td>Umur kode</td><td><?= SC_OTP_TTL_MIN ?> menit · maks <?= SC_OTP_MAX_ATTEMPTS ?> percobaan
        · jeda kirim ulang <?= SC_OTP_RESEND_SEC ?> detik</td></tr>
    </table>
  </section>

  <section>
    <h2>Kirim email uji</h2>
    <form method="POST">
      <?= sc_csrf_field() ?>
      <input type="email" name="to" required placeholder="email terdaftar"
             value="<?= htmlspecialchars($user['email'], ENT_QUOTES) ?>">
      <button type="submit">Kirim</button>
    </form>
    <?php if ($result): ?>
      <div class="res <?= $ok ? 'ok' : 'bad' ?>"><?= htmlspecialchars($result) ?></div>
    <?php endif; ?>
  </section>

  <section>
    <h2>Hak akses terpasang</h2>
    <table>
      <?php foreach ($access['access'] as $tool => $keys): $m = sc_tool_meta($tool); ?>
        <tr><td><?= $m['icon'] ?> <?= htmlspecialchars($m['title']) ?></td>
            <td><?= count($keys) ?> orang — <?= htmlspecialchars(implode(', ', $keys)) ?></td></tr>
      <?php endforeach; ?>
      <tr><td>Total orang terdaftar</td><td><?= count($access['people']) ?></td></tr>
    </table>
  </section>

  <section>
    <h2>25 peristiwa auth terakhir</h2>
    <pre><?= $tail !== '' ? htmlspecialchars($tail) : 'belum ada catatan' ?></pre>
  </section>
</div>
</body>
</html>
