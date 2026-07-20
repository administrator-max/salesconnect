<?php
/** Shared helpers for SalesConnect. */

function sc_config() {
    static $cfg = null;
    if ($cfg === null) $cfg = require __DIR__ . '/../config.php';
    return $cfg;
}

/** Opaque, sortable-ish unique id (string). */
function sc_uid() {
    return dechex(time()) . bin2hex(random_bytes(4));
}

function sc_now() {
    return date('Y-m-d H:i:s');
}

/** Send JSON response and stop. */
function json_out($data, $code = 200) {
    http_response_code($code);
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

/** Parse JSON request body into an array. */
function json_body() {
    $raw = file_get_contents('php://input');
    if ($raw === '' || $raw === false) return [];
    $d = json_decode($raw, true);
    return is_array($d) ? $d : [];
}

/** Interpret a sheet cell as boolean. */
function to_bool($v) {
    return $v === true || $v === 1 || $v === '1'
        || $v === 'TRUE' || $v === 'true' || $v === 'True';
}

/**
 * Derive the API sub-route (portion after ".../api/").
 * Prefers the ?_route= param set by .htaccess, falls back to REQUEST_URI.
 */
function sc_route() {
    if (isset($_GET['_route']) && $_GET['_route'] !== '') return (string) $_GET['_route'];
    $uri = parse_url($_SERVER['REQUEST_URI'] ?? '', PHP_URL_PATH);
    if ($uri === null || $uri === false) return '';
    $pos = strpos($uri, '/api/');
    if ($pos !== false) return substr($uri, $pos + 5);
    return '';
}
