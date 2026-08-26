<?php
/**
 * Penjaga login umum (tanpa cek tool tertentu).
 * Untuk halaman modul pakai sc_require_tool('<modul>') dari lib/tool_guard.php
 * supaya hak akses per dashboard ikut diperiksa.
 */
require_once __DIR__ . '/tool_guard.php';
sc_require_login_page();
