<?php
/**
 * Generic CRUD + request handling for data-driven config (lookup) tabs.
 * See lib/config_registry.php for the per-module lookup definitions.
 *
 * Conventions:
 *  - Reads are open (dropdown data is not sensitive; the page is already behind login).
 *  - Writes require a logged-in session (admin managing config).
 *  - Delete is SOFT (active=FALSE) so historical records that reference a value still resolve.
 *  - The identity/key column is never editable (changing it would orphan historical rows).
 */
require_once __DIR__ . '/GoogleSheets.php';
require_once __DIR__ . '/helpers.php';
require_once __DIR__ . '/auth.php';
require_once __DIR__ . '/config_registry.php';

/** A blank/unset `active` is treated as active; only an explicit falsey value hides a row. */
function cfg_is_active($v): bool {
    if ($v === '' || $v === null) return true;
    return to_bool($v);
}

/** List a lookup's rows (assoc, no _row), sorted by sort_order, active-only unless $includeInactive. */
function cfg_list(GoogleSheets $gs, string $sid, array $lk, bool $includeInactive = false): array {
    $key = $lk['key'];
    $out = [];
    foreach ($gs->table($sid, $lk['tab'])['rows'] as $r) {
        if ((string) ($r[$key] ?? '') === '') continue;
        if (!$includeInactive && array_key_exists('active', $r) && !cfg_is_active($r['active'])) continue;
        unset($r['_row']);
        $out[] = $r;
    }
    usort($out, function ($a, $b) {
        $sa = isset($a['sort_order']) ? (int) $a['sort_order'] : 0;
        $sb = isset($b['sort_order']) ? (int) $b['sort_order'] : 0;
        return $sa <=> $sb;
    });
    return $out;
}

/** All lookups for a module: { lookupName: [rows] }. */
function cfg_all(GoogleSheets $gs, string $sid, array $lookups, bool $includeInactive = false): array {
    $out = [];
    foreach ($lookups as $name => $lk) $out[$name] = cfg_list($gs, $sid, $lk, $includeInactive);
    return $out;
}

/** Find a row (incl. _row) by its key value; string-cast compare. */
function cfg_find(GoogleSheets $gs, string $sid, array $lk, $keyVal) {
    $needle = (string) $keyVal;
    if ($needle === '') return null;
    foreach ($gs->table($sid, $lk['tab'])['rows'] as $r) {
        if ((string) ($r[$lk['key']] ?? '') === $needle) return $r;
    }
    return null;
}

/** Next sort_order (max+1) for a lookup. */
function cfg_next_sort(GoogleSheets $gs, string $sid, array $lk): int {
    $max = 0;
    foreach ($gs->table($sid, $lk['tab'])['rows'] as $r) {
        $n = (int) ($r['sort_order'] ?? 0);
        if ($n > $max) $max = $n;
    }
    return $max + 1;
}

/** Build an assoc row limited to a lookup's columns, applying defaults. */
function cfg_row_from_input(array $lk, array $body, array $defaults = []): array {
    $assoc = [];
    foreach ($lk['cols'] as $col) {
        if (array_key_exists($col, $body))        $assoc[$col] = (string) $body[$col];
        elseif (array_key_exists($col, $defaults)) $assoc[$col] = (string) $defaults[$col];
        else                                       $assoc[$col] = '';
    }
    return $assoc;
}

/** Add a lookup entry. Enforces non-empty, unique key. Returns the created row. */
function cfg_add(GoogleSheets $gs, string $sid, array $lk, array $body): array {
    $key = $lk['key'];
    $keyVal = trim((string) ($body[$key] ?? ''));
    if ($keyVal === '') throw new Exception("Field '$key' wajib diisi", 400);
    if (cfg_find($gs, $sid, $lk, $keyVal)) throw new Exception("'$keyVal' sudah ada", 409);

    $defaults = [];
    if (in_array('active', $lk['cols'], true))     $defaults['active'] = 'TRUE';
    if (in_array('sort_order', $lk['cols'], true)) $defaults['sort_order'] = (string) cfg_next_sort($gs, $sid, $lk);
    $assoc = cfg_row_from_input($lk, $body, $defaults);
    $assoc[$key] = $keyVal;
    $gs->appendAssoc($sid, $lk['tab'], $assoc);
    return $assoc;
}

/** Update a lookup entry (label/sort/active/style). The key column is never changed. */
function cfg_update(GoogleSheets $gs, string $sid, array $lk, $keyVal, array $body): array {
    $row = cfg_find($gs, $sid, $lk, $keyVal);
    if (!$row) throw new Exception('Not found', 404);
    $sheetRow = $row['_row'];
    unset($row['_row']);
    foreach ($lk['cols'] as $col) {
        if ($col === $lk['key']) continue;                 // key is immutable
        if (array_key_exists($col, $body)) $row[$col] = (string) $body[$col];
    }
    $gs->updateAssoc($sid, $lk['tab'], $sheetRow, $row);
    return $row;
}

/** Soft-delete (active=FALSE) if the tab has an `active` column, else physically remove. */
function cfg_delete(GoogleSheets $gs, string $sid, array $lk, $keyVal): void {
    $row = cfg_find($gs, $sid, $lk, $keyVal);
    if (!$row) throw new Exception('Not found', 404);
    if (in_array('active', $lk['cols'], true)) {
        $sheetRow = $row['_row'];
        unset($row['_row']);
        $row['active'] = 'FALSE';
        $gs->updateAssoc($sid, $lk['tab'], $sheetRow, $row);
    } else {
        $gs->deleteRows($sid, $lk['tab'], [$row['_row']]);
    }
}

/**
 * Create a lookup tab (with header + seed) if it does not already exist.
 * Idempotent and non-destructive: an existing tab with data is left untouched.
 * Returns 'created' | 'seeded' | 'exists'.
 */
function cfg_ensure(GoogleSheets $gs, string $sid, array $lk): string {
    $meta = $gs->sheetMeta($sid);
    $exists = array_key_exists($lk['tab'], $meta);
    if (!$exists) {
        $gs->batchUpdate($sid, [['addSheet' => ['properties' => ['title' => $lk['tab']]]]]);
    } else {
        $vals = $gs->getValues($sid, $lk['tab'], false);
        if (!empty($vals) && !empty($vals[0])) return 'exists';   // already has a header row
    }
    $matrix = [$lk['cols']];
    foreach (($lk['seed'] ?? []) as $r) $matrix[] = $r;
    $gs->updateRange($sid, $lk['tab'] . '!A1', $matrix);
    return $exists ? 'seeded' : 'created';
}

/**
 * Handle a `config` route for a module. $parts is the sc_route() split; $parts[0] === 'config'.
 *   GET    config            → all lookups (active only; ?all=1 + login → include inactive)
 *   GET    config/<lookup>   → one lookup's rows
 *   POST   config/<lookup>   → add            (login required)
 *   PUT    config/<lookup>/<value>  → update  (login required)
 *   DELETE config/<lookup>/<value>  → soft-delete (login required)
 */
function cfg_handle(GoogleSheets $gs, string $sid, array $lookups, array $parts, string $method): void {
    $name   = $parts[1] ?? null;
    $keyVal = isset($parts[2]) ? rawurldecode($parts[2]) : null;

    $requireLogin = function () {
        if (!sc_current_user()) json_out(['error' => 'Unauthorized'], 401);
    };
    $lk = function () use ($lookups, $name) {
        if ($name === null || !isset($lookups[$name])) json_out(['error' => 'Unknown config lookup'], 404);
        return $lookups[$name];
    };

    try {
        if ($method === 'GET' && $name === null) {
            $all = isset($_GET['all']) && $_GET['all'] !== '' && sc_current_user();
            json_out(cfg_all($gs, $sid, $lookups, (bool) $all));
        }
        if ($method === 'GET') {
            json_out(cfg_list($gs, $sid, $lk(), isset($_GET['all']) && sc_current_user()));
        }
        if ($method === 'POST') {
            $requireLogin();
            json_out(cfg_add($gs, $sid, $lk(), json_body()), 201);
        }
        if ($method === 'PUT') {
            $requireLogin();
            if ($keyVal === null) json_out(['error' => 'Missing key'], 400);
            json_out(cfg_update($gs, $sid, $lk(), $keyVal, json_body()));
        }
        if ($method === 'DELETE') {
            $requireLogin();
            if ($keyVal === null) json_out(['error' => 'Missing key'], 400);
            cfg_delete($gs, $sid, $lk(), $keyVal);
            json_out(['success' => true]);
        }
        json_out(['error' => 'Method not allowed'], 405);
    } catch (Exception $e) {
        $code = $e->getCode();
        json_out(['error' => $e->getMessage()], ($code >= 400 && $code < 600) ? $code : 500);
    }
}
