<?php
// SCOT — Shipment Control Tower (open access, no login guard).
// Serve the SPA shell with cache-busting on JS/CSS: append ?v=<mtime> so browsers
// always fetch the current asset after a deploy (avoids stale cached scripts).
$html = file_get_contents(__DIR__ . '/assets/index.html');
$v = @filemtime(__DIR__ . '/assets/main.js') ?: time();
$html = preg_replace('#((?:\.\./)?assets/[A-Za-z0-9_\-/]+\.(?:js|css))(["\'])#', '$1?v=' . $v . '$2', $html);
echo $html;
