<?php
// TEMPORARY diagnostic — remove after use. Surfaces load/parse errors that
// the production 500 (display_errors off) hides. Loads each iqdash PHP file
// in api.php order and reports where it breaks.
ini_set('display_errors', '1');
error_reporting(E_ALL);
header('Content-Type: text/plain; charset=utf-8');

echo 'PHP ' . PHP_VERSION . "\n";
$root = dirname(__DIR__);
$steps = [
    'lib/sheet_util.php'        => $root . '/lib/sheet_util.php',
    'iqdash_util.php'           => __DIR__ . '/iqdash_util.php',
    'iqdash_data.php'           => __DIR__ . '/iqdash_data.php',
    'iqdash_insights.php'       => __DIR__ . '/iqdash_insights.php',
    'iqdash_write.php'          => __DIR__ . '/iqdash_write.php',
];
foreach ($steps as $label => $path) {
    echo "loading $label ... ";
    if (!is_file($path)) { echo "MISSING FILE\n"; continue; }
    echo '(' . filesize($path) . " bytes) ";
    require_once $path;
    echo "OK\n";
}
echo "ALL LOADED\n";
