<?php
/** API guard: include at the top of an api.php front controller. */
require_once __DIR__ . '/auth.php';
if (!sc_current_user()) {
    json_out(['error' => 'Unauthorized'], 401);
}
