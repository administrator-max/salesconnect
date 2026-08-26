<?php
require_once __DIR__ . '/../lib/tool_guard.php';
sc_require_tool('iqdash');
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
