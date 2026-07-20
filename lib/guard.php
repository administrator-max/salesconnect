<?php
/** Page guard: include at the very top of a tool page (cil/, taskflow/). */
require_once __DIR__ . '/auth.php';
if (!sc_current_user()) {
    // Remember where we were headed so login can send us back (used by Cost Core).
    $next = rawurlencode($_SERVER['REQUEST_URI'] ?? '');
    header('Location: ../login.php?next=' . $next);
    exit;
}
