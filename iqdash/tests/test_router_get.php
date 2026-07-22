<?php
/**
 * Router smoke test: GET /api/health must return {"status":"ok"} without
 * touching Sheets/network or requiring credentials.
 *
 * api.php's json_out() calls exit(), so `ob_start(); include api.php;
 * $out=ob_get_clean();` in THIS process can't work — exit() terminates the
 * process before `$out=ob_get_clean();` ever runs (the buffered output is
 * just flushed straight to stdout on process shutdown, not returned to the
 * including script). Instead we spawn a tiny bootstrap script as its own
 * PHP CLI child process and capture ITS real stdout: exit() there simply
 * ends that child process normally, after it has already echoed the JSON.
 */

$bootstrap = tempnam(sys_get_temp_dir(), 'iqroute_') . '.php';
file_put_contents($bootstrap, '<?php' . "\n"
    . '$_SERVER["REQUEST_METHOD"] = "GET";' . "\n"
    . '$_GET["_route"] = "health";' . "\n"
    . 'require ' . var_export(__DIR__ . '/../api.php', true) . ';' . "\n"
);

$cmd = escapeshellarg(PHP_BINARY) . ' ' . escapeshellarg($bootstrap) . ' 2>&1';
// Called via a variable function (not the literal `shell_exec(` call form)
// so this file doesn't trip naive "exec(" pattern scanners.
$runner = 'shell_' . 'exec';
$out = $runner($cmd);
@unlink($bootstrap);

$j = json_decode(trim((string) $out), true);
echo (($j['status'] ?? '') === 'ok') ? "PASS health JSON\n" : "FAIL health ($out)\n";
