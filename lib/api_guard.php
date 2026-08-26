<?php
/**
 * Penjaga API umum (tanpa cek tool tertentu).
 * Untuk api.php sebuah modul pakai sc_require_tool_api('<modul>') dari
 * lib/tool_guard.php supaya hak akses per dashboard ikut diperiksa.
 */
require_once __DIR__ . '/tool_guard.php';
if (!sc_user()) {
    json_out(['error' => 'Unauthorized'], 401);
}
