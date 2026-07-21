<?php
// SCOT — Shipment Control Tower (open access, no login guard).
// Serve the SPA shell with per-file cache-busting on JS/CSS: append ?v=<mtime>
// (each asset versioned by its OWN modified time) so a changed file always
// re-fetches after a deploy, avoiding stale cached scripts.
$html = file_get_contents(__DIR__ . '/assets/index.html');
$html = preg_replace_callback(
    '#((?:\.\./)?assets/[A-Za-z0-9_\-/]+\.(?:js|css))(["\'])#',
    function ($m) {
        $f = __DIR__ . '/' . $m[1];               // resolves both assets/ and ../assets/
        $v = @filemtime($f) ?: time();
        return $m[1] . '?v=' . $v . $m[2];
    },
    $html
);
echo $html;
