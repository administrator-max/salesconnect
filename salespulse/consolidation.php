<?php
/**
 * Sales Pulse — consolidation engine helpers.
 * Ported from ../sales_pulse/server.js (lines 112-218): normCompany, the
 * internal-companies loader, isInternalCompany, pickEndCustomer, normNoSpace,
 * endCustomerFromName, projectFamilyKey, parseProjectSheetDate, groupReduce.
 * Behavior is locked by tests/consolidation_test.php.
 */

/** server.js:112-113 — month keys + chart color palette, copied verbatim. */
const SP_MONTH_KEYS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const SP_COLORS = ['#f59e0b', '#a78bfa', '#22d3ee', '#4ade80', '#fb923c', '#818cf8', '#38bdf8'];

/** Port of server.js normCompany (:123-124). */
function sp_norm_company($s) {
    $s = strtolower((string) ($s ?? ''));
    $s = preg_replace('/\bpt\.?\b/', '', $s);
    $s = preg_replace('/[^a-z0-9]+/', ' ', $s);
    return trim($s);
}

/**
 * Port of server.js INTERNAL_COMPANIES loader (:126-136). Loads
 * company-rank-exclusions.json, normalizes each companyName, caches in a
 * static so the file is only read/decoded once per request.
 */
function sp_internal_companies(): array {
    static $names = null;
    if ($names !== null) return $names;
    $names = [];
    $path = __DIR__ . '/company-rank-exclusions.json';
    $raw = @file_get_contents($path);
    if ($raw === false) return $names;
    $cfg = json_decode($raw, true);
    if (!is_array($cfg)) return $names;
    foreach (($cfg['companies'] ?? []) as $c) {
        $n = sp_norm_company($c['companyName'] ?? '');
        if ($n !== '') $names[] = $n;
    }
    return $names;
}

/** Port of server.js isInternalCompany (:138-141). */
function sp_is_internal_company($name): bool {
    $n = sp_norm_company($name);
    if ($n === '') return false;
    foreach (sp_internal_companies() as $inm) {
        if ($n === $inm || strpos($n, $inm) !== false) return true;
    }
    return false;
}

/**
 * Port of server.js pickEndCustomer (:145-153). Consolidated end-customer for
 * one project group: the most-frequent EXTERNAL customer among its headers;
 * falls back to the most-frequent overall if all are internal, then to the
 * first header's customer_name, then ''.
 */
function sp_pick_end_customer(array $headers): string {
    $tally = function (array $rows) {
        $m = [];
        foreach ($rows as $h) {
            $cn = $h['customer_name'] ?? '';
            if ($cn !== '' && $cn !== null) $m[$cn] = ($m[$cn] ?? 0) + 1;
        }
        if (!$m) return null;
        arsort($m);
        return array_key_first($m);
    };
    $external = array_values(array_filter($headers, function ($h) {
        return !sp_is_internal_company($h['customer_name'] ?? '');
    }));
    $picked = $tally($external ? $external : $headers);
    if ($picked !== null) return $picked;
    return ($headers[0]['customer_name'] ?? '') ?: '';
}

/** Port of server.js normNoSpace (:156). */
function sp_norm_no_space($s) {
    return str_replace(' ', '', sp_norm_company($s));
}

/** Port of server.js endCustomerFromName (:159-164). */
function sp_end_customer_from_name($projectName) {
    $parts = explode(' - ', (string) ($projectName ?? ''));
    if (count($parts) < 2) return '';
    $tail = trim($parts[count($parts) - 1]);
    return preg_match('/[a-z]/i', $tail) ? $tail : '';
}

/** Port of server.js projectFamilyKey (:168-170). */
function sp_project_family_key($projectName) {
    $parts = preg_split('/\s-\s*del\b/i', (string) ($projectName ?? ''));
    $s = strtolower(trim($parts[0]));
    return preg_replace('/\s+/', ' ', $s);
}

/**
 * Port of server.js parseProjectSheetDate (:172-206). Uses UTC (gmdate) to
 * match JS's getUTCMonth/toISOString semantics.
 */
function sp_parse_project_sheet_date($value): array {
    if ($value === null || $value === '') return ['date' => null, 'monthIdx' => null];

    $raw = trim((string) $value);

    if (preg_match('/^\d+(\.\d+)?$/', $raw)) {
        $serial = (float) $raw;
        if ($serial > 20000 && $serial < 80000) {
            $seconds = (int) round(($serial - 25569) * 86400);
            return [
                'date' => gmdate('Y-m-d', $seconds),
                'monthIdx' => (int) gmdate('n', $seconds) - 1,
            ];
        }
    }

    if (preg_match('/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{2,4})$/', $raw, $dmy)) {
        $yyyy = strlen($dmy[3]) === 2 ? '20' . $dmy[3] : $dmy[3];
        $mm = str_pad($dmy[2], 2, '0', STR_PAD_LEFT);
        $dd = str_pad($dmy[1], 2, '0', STR_PAD_LEFT);
        return ['date' => "$yyyy-$mm-$dd", 'monthIdx' => ((int) $mm) - 1];
    }

    $ts = strtotime($raw);
    if ($ts !== false) {
        return ['date' => gmdate('Y-m-d', $ts), 'monthIdx' => (int) gmdate('n', $ts) - 1];
    }

    return ['date' => null, 'monthIdx' => null];
}

/**
 * Port of server.js groupReduce (:210-218). Group rows by keyFn, running
 * reducer(&$acc, $row) for each; acc is seeded per-group via seed().
 */
function sp_group_reduce(array $rows, callable $keyFn, callable $seed, callable $reducer): array {
    $map = [];
    $order = [];
    foreach ($rows as $r) {
        $k = $keyFn($r);
        if (!array_key_exists($k, $map)) {
            $map[$k] = ['key' => $k, 'acc' => $seed()];
            $order[] = $k;
        }
        $reducer($map[$k]['acc'], $r);
    }
    $out = [];
    foreach ($order as $k) $out[] = $map[$k];
    return $out;
}
