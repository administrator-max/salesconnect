<?php
require_once __DIR__ . '/../lib/tool_guard.php';
sc_require_tool('salespulse');
// SalesPulse dashboard — serve the shell with per-file cache-busting: replace any
// ?v=... (or add one) on assets/*.js|css with the file's mtime so a changed asset
// always re-fetches after a deploy (no stale scripts / manual version bumps).
$html = file_get_contents(__DIR__ . '/assets/index.html');
$html = preg_replace_callback(
    '#(assets/[A-Za-z0-9_\-/]+\.(?:js|css))(?:\?v=[^"\']*)?(["\'])#',
    function ($m) {
        $f = __DIR__ . '/' . $m[1];
        $v = @filemtime($f) ?: time();
        return $m[1] . '?v=' . $v . $m[2];
    },
    $html
);
// Sesi habis di tengah SPA -> panggilan api.php menjawab 401; penangkapnya
// ada di sc_session_watch() (lib/tool_guard.php), disisipkan ke <head>.
$html = str_replace("</head>", sc_session_watch() . "</head>", $html);
echo $html;
