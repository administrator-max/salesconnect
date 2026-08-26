<?php
require_once __DIR__ . '/lib/auth.php';
$timeout = isset($_GET['timeout']);
$u = sc_user();
if ($u) sc_auth_log('logout', $u['email']);
sc_logout();
header('Location: login.php' . ($timeout ? '?timeout=1' : ''));
exit;
