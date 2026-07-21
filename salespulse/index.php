<?php
// SalesPulse executive — serve the shell with per-file cache-busting on any
// assets/*.js|css references (executive.html is inline-only today; this future-proofs it).
$html = file_get_contents(__DIR__ . '/assets/executive.html');
$html = preg_replace_callback(
    '#(assets/[A-Za-z0-9_\-/]+\.(?:js|css))(?:\?v=[^"\']*)?(["\'])#',
    function ($m) {
        $f = __DIR__ . '/' . $m[1];
        $v = @filemtime($f) ?: time();
        return $m[1] . '?v=' . $v . $m[2];
    },
    $html
);
echo $html;
