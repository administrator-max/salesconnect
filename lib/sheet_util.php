<?php
/** Generic row lookups shared by the tool APIs. */
require_once __DIR__ . '/GoogleSheets.php';

function find_by_id(GoogleSheets $gs, $sid, $tab, $id) {
    if ($id === null || $id === '') return null;
    $needle = (string) $id;
    foreach ($gs->table($sid, $tab)['rows'] as $r) {
        if ((string) ($r['id'] ?? '') === $needle) return $r;
    }
    return null;
}

function find_by_name(GoogleSheets $gs, $sid, $tab, $name) {
    $needle = mb_strtolower(trim((string) $name));
    if ($needle === '') return null;
    foreach ($gs->table($sid, $tab)['rows'] as $r) {
        if (mb_strtolower(trim((string) ($r['name'] ?? ''))) === $needle) return $r;
    }
    return null;
}
