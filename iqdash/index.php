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
// Nama orang yang login — untuk jejak "Requested by / Confirmed by" pada
// request Revision / Re-Apply. Hanya nama tampilan; email dan hak akses tidak
// ikut dikirim ke halaman.
$__u = sc_user();
$__nama = json_encode((string) ($__u['name'] ?? ''), JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
$html = str_replace("</head>", "<script>window.SC_USER_NAME = {$__nama};</script></head>", $html);
echo $html;
