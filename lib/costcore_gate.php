<?php
/**
 * Cost Core PIN gate — independent of the SalesConnect username/password login.
 * A single shared PIN (bcrypt hash in config: 'costcore_pin') unlocks the module.
 * Uses the same session store as the rest of the app, under its own flag.
 */
require_once __DIR__ . '/auth.php';   // sc_session_start(), sc_config(), helpers (json_out…)

/** True if this session has already entered the correct Cost Core PIN. */
function costcore_pin_ok() {
    sc_session_start();
    return !empty($_SESSION['costcore_ok']);
}

/** Verify a submitted PIN against config; on success mark the session unlocked. */
function costcore_verify_pin($pin) {
    $cfg  = sc_config();
    $hash = $cfg['costcore_pin'] ?? '';
    if ($hash === '' || !password_verify((string) $pin, $hash)) {
        return false;
    }
    sc_session_start();
    $_SESSION['costcore_ok'] = true;
    return true;
}

/** Lock Cost Core again (leaves any other app session state untouched). */
function costcore_lock() {
    sc_session_start();
    unset($_SESSION['costcore_ok']);
}
