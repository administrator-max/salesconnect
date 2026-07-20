<?php
/** Session-based authentication for SalesConnect. */
require_once __DIR__ . '/helpers.php';

function sc_session_start() {
    if (session_status() === PHP_SESSION_ACTIVE) return;
    $cfg = sc_config();
    session_name($cfg['session_name']);
    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'httponly' => true,
        'samesite' => 'Lax',
        'secure'   => (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off'),
    ]);
    session_start();
}

function sc_login($user, $pass) {
    $cfg = sc_config();
    $user = trim((string) $user);
    if (!isset($cfg['users'][$user])) return false;
    if (!password_verify((string) $pass, $cfg['users'][$user])) return false;
    sc_session_start();
    session_regenerate_id(true);
    $_SESSION['user'] = $user;
    $_SESSION['login_at'] = time();
    return true;
}

function sc_logout() {
    sc_session_start();
    $_SESSION = [];
    if (ini_get('session.use_cookies')) {
        $p = session_get_cookie_params();
        setcookie(session_name(), '', time() - 42000,
            $p['path'], $p['domain'], $p['secure'], $p['httponly']);
    }
    session_destroy();
}

function sc_current_user() {
    sc_session_start();
    return $_SESSION['user'] ?? null;
}
