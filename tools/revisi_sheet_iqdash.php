<?php
/** Riwayat versi spreadsheet IQ Dash lewat Drive API (HANYA MEMBACA).
 *  php tools/revisi_sheet_iqdash.php list
 *  php tools/revisi_sheet_iqdash.php ambil <revisionId> <tab> [out.json]
 *  Mengekspor revisi ke xlsx (exportLinks), lalu membaca satu tab menjadi baris assoc. */
require_once __DIR__ . '/../lib/helpers.php';
$cfg = sc_config();
$sid = $cfg['spreadsheets']['iqdash'];
$sa = json_decode(file_get_contents($cfg['service_account']), true);
$b64 = fn($s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
$now = time();
$in = $b64(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])) . '.' . $b64(json_encode([
  'iss' => $sa['client_email'], 'scope' => 'https://www.googleapis.com/auth/drive.readonly',
  'aud' => 'https://oauth2.googleapis.com/token', 'exp' => $now + 3600, 'iat' => $now]));
openssl_sign($in, $sig, $sa['private_key'], OPENSSL_ALGO_SHA256);
$ch = curl_init('https://oauth2.googleapis.com/token');
curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_POST => true, CURLOPT_POSTFIELDS => http_build_query([
  'grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $in . '.' . $b64($sig)])]);
$tok = json_decode(curl_exec($ch), true)['access_token'] ?? null;
if (!$tok) { fwrite(STDERR, "token gagal\n"); exit(1); }
$get = function ($url) use ($tok) {
  $ch = curl_init($url);
  curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => true, CURLOPT_FOLLOWLOCATION => true, CURLOPT_TIMEOUT => 120,
    CURLOPT_HTTPHEADER => ["Authorization: Bearer $tok"]]);
  $o = curl_exec($ch); $c = curl_getinfo($ch, CURLINFO_HTTP_CODE); curl_close($ch);
  if ($c !== 200) { fwrite(STDERR, "HTTP $c: " . substr($o, 0, 400) . "\n"); exit(1); }
  return $o;
};
$mode = $argv[1] ?? 'list';
if ($mode === 'list') {
  $page = null; $all = [];
  do {
    $j = json_decode($get("https://www.googleapis.com/drive/v3/files/$sid/revisions?pageSize=200&fields=nextPageToken,revisions(id,modifiedTime,lastModifyingUser/displayName)" . ($page ? "&pageToken=$page" : '')), true);
    $all = array_merge($all, $j['revisions'] ?? []); $page = $j['nextPageToken'] ?? null;
  } while ($page);
  foreach ($all as $r) echo $r['id'] . "\t" . $r['modifiedTime'] . "\t" . ($r['lastModifyingUser']['displayName'] ?? '') . "\n";
  exit;
}
$rev = $argv[2]; $tab = $argv[3]; $out = $argv[4] ?? null;
$xlsx = $get("https://docs.google.com/spreadsheets/export?id=$sid&revision=$rev&exportFormat=xlsx");
$tmp = tempnam(sys_get_temp_dir(), 'rv'); file_put_contents($tmp, $xlsx);
$z = new ZipArchive(); if ($z->open($tmp) !== true) { fwrite(STDERR, "bukan xlsx: " . substr($xlsx, 0, 200) . "\n"); exit(1); }
$ss = [];
if (($x = $z->getFromName('xl/sharedStrings.xml')) !== false) {
  $sx = simplexml_load_string($x);
  foreach ($sx->si as $si) { $t = ''; if (isset($si->t)) $t = (string) $si->t; else foreach ($si->r as $r) $t .= (string) $r->t; $ss[] = $t; }
}
$wb = simplexml_load_string($z->getFromName('xl/workbook.xml'));
$rels = simplexml_load_string($z->getFromName('xl/_rels/workbook.xml.rels'));
$target = null;
foreach ($wb->sheets->sheet as $s) if ((string) $s['name'] === $tab) {
  $rid = (string) $s->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
  foreach ($rels->Relationship as $r) if ((string) $r['Id'] === $rid) $target = 'xl/' . ltrim((string) $r['Target'], '/');
}
if (!$target) { fwrite(STDERR, "tab $tab tidak ada\n"); exit(1); }
$sh = simplexml_load_string($z->getFromName(str_replace('xl//xl/', 'xl/', $target)));
$rows = [];
foreach ($sh->sheetData->row as $row) {
  $vals = [];
  foreach ($row->c as $c) {
    preg_match('/^([A-Z]+)/', (string) $c['r'], $m); $col = 0;
    foreach (str_split($m[1]) as $ch1) $col = $col * 26 + ord($ch1) - 64;
    $t = (string) $c['t']; $v = isset($c->v) ? (string) $c->v : (isset($c->is->t) ? (string) $c->is->t : '');
    if ($t === 's') $v = $ss[(int) $v] ?? '';
    $vals[$col - 1] = $v;
  }
  $rows[] = $vals;
}
$h = array_map('strval', $rows[0] ?? []); $res = [];
for ($i = 1; $i < count($rows); $i++) { $a = []; foreach ($h as $k => $nm) if ($nm !== '') $a[$nm] = $rows[$i][$k] ?? ''; $res[] = $a; }
$json = json_encode($res, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE);
if ($out) { file_put_contents($out, $json); echo count($res) . " baris -> $out\n"; } else echo $json;
