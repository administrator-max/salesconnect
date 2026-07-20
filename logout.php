<?php
require_once __DIR__ . '/lib/auth.php';
sc_logout();
header('Location: index.php');
exit;
