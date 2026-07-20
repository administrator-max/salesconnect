<?php
/**
 * Generate a bcrypt hash for a login password.
 * Usage (on the host, via SSH or cron):
 *     php tools/hash.php 'YourNewPassword'
 * Copy the printed hash into config.php under 'users'.
 */
if (php_sapi_name() !== 'cli') {
    http_response_code(403);
    exit('CLI only.');
}
$pw = $argv[1] ?? null;
if ($pw === null || $pw === '') {
    fwrite(STDERR, "Usage: php tools/hash.php 'password'\n");
    exit(1);
}
echo password_hash($pw, PASSWORD_DEFAULT), "\n";
