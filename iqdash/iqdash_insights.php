<?php
/**
 * iqdash_insights.php — PHP port of IQ/lib/insights.js (q1-q8 + realization).
 *
 * Pure functions over the raw tables array (the same `$t` shape
 * `iq_load_tables()` in iqdash_data.php returns: { companies, cycles,
 * cycleProducts, stats, revisions, lots, realizations, aliases, products }),
 * operating on the RAW snake_case rows — NOT the ledger-applied payload from
 * iq_build_payload(). Every `iq_ins_*` function below mirrors one function
 * from insights.js 1:1 (see the `// JS:` reference above each).
 *
 * Numeric coercion note: insights.js uses its own local `num()` helper —
 * `const n = Number(x); return isNaN(n) ? 0 : n;` — which, unlike JS
 * `Number()`, is NOT the same as this module's `iq_num()` in iqdash_util.php
 * (that one strips thousands-commas and treats 'TBA' as 0). Per the task-8
 * brief, insights must mirror plain JS `Number()` instead, so this file
 * defines its own `iq_ins_num()` and does NOT call `iq_num()`.
 */

/* ── numeric / truthiness helpers ───────────────────────────────────────── */

// JS: const num = x => { const n = Number(x); return isNaN(n) ? 0 : n; };
/**
 * Mirror JS `Number(x)` closely enough for real sheet data (plain numeric
 * strings, no thousands-commas): numeric -> numeric value; anything else
 * (blank, 'TBA', null, bool, arbitrary text) -> 0. Do NOT reuse iq_num()
 * (it strips commas and has different blank/'TBA' handling) — see file
 * docblock.
 */
function iq_ins_num($x) {
    if (is_numeric($x)) return $x + 0;
    return 0;
}

/**
 * Mirror JS truthiness for the value domain insights.js actually deals with
 * (strings, numbers, null, bool) — used everywhere the JS source relies on
 * `x || y` / `if (x)` short-circuiting (e.g. `m[p] || p`, `l.util_date ||
 * num(l.util_mt)`, `opts.item || 'GI ALLOY'`). Falsy: null, false, '', 0, 0.0.
 * Everything else (incl. the *string* '0', which is truthy in JS) is truthy.
 */
function iq_ins_truthy($v): bool {
    if ($v === null || $v === false) return false;
    if (is_string($v)) return $v !== '';
    if (is_int($v) || is_float($v)) return $v != 0;
    if (is_bool($v)) return $v;
    return (bool) $v;
}

/** Mirror JS `x || fallback`. */
function iq_ins_or($v, $fallback) {
    return iq_ins_truthy($v) ? $v : $fallback;
}

/* ── date helpers ────────────────────────────────────────────────────────
 * insights.js represents dates as JS `Date` objects (always UTC-midnight for
 * the DD/MM/YYYY and "D Mon YYYY" formats it parses itself, via
 * `Date.UTC(...)`). Dates here are represented as Unix timestamps (UTC
 * seconds) instead of DateTime objects so day-diff / range comparisons stay
 * plain integer arithmetic — equivalent ordering to the JS epoch-ms
 * comparisons, just a different unit. */

// JS: const parseDMY = s => { ... }
/**
 * Parse 'DD/MM/YYYY' or 'D Mon YYYY' (3-letter month, any case) into a UTC
 * midnight timestamp; falls back to a generic parse (mirrors `new Date(s)`)
 * for anything else. Returns null on blank input or unparseable text
 * (mirrors `isNaN(d) ? null : d`).
 */
function iq_ins_parse_dmy($s): ?int {
    if ($s === null) return null;
    $s = trim((string) $s);
    if ($s === '') return null;

    if (preg_match('/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/', $s, $m)) {
        return gmmktime(0, 0, 0, (int) $m[2], (int) $m[1], (int) $m[3]);
    }

    if (preg_match('/^(\d{1,2})\s+([A-Za-z]{3})\s+(\d{4})$/', $s, $m)) {
        $months = ['jan'=>1,'feb'=>2,'mar'=>3,'apr'=>4,'may'=>5,'jun'=>6,
                   'jul'=>7,'aug'=>8,'sep'=>9,'oct'=>10,'nov'=>11,'dec'=>12];
        $mo = $months[strtolower($m[2])] ?? null;
        if ($mo !== null) return gmmktime(0, 0, 0, $mo, (int) $m[1], (int) $m[3]);
    }

    $ts = strtotime($s);
    return $ts === false ? null : $ts;
}

/**
 * Resolve the `$today` parameter every q1/realization-style function takes:
 * null -> "now" (mirrors JS default `today = new Date()`); a date string
 * (ISO 'YYYY-MM-DD', 'DD/MM/YYYY', or 'D Mon YYYY') -> that date's UTC
 * midnight (mirrors `new Date(str)` for a date-only ISO string, which the
 * task-8 brief calls out explicitly: "When today is passed as a string,
 * parse it the same way").
 */
function iq_ins_resolve_today($today): int {
    if ($today === null) return time();
    if (is_int($today)) return $today;
    $s = trim((string) $today);
    if ($s === '') return time();
    if (preg_match('/^(\d{4})-(\d{2})-(\d{2})/', $s, $m)) {
        return gmmktime(0, 0, 0, (int) $m[2], (int) $m[3], (int) $m[1]);
    }
    $ts = iq_ins_parse_dmy($s);
    if ($ts !== null) return $ts;
    $ts = strtotime($s);
    return $ts === false ? time() : $ts;
}

/* ── canonMap / canon ────────────────────────────────────────────────────
 * JS:
 *   function canonMap(aliases) { const m = {}; (aliases||[]).forEach(a => { m[a.alias] = a.canonical; }); return m; }
 *   const canon = (m, p) => p ? (m[p] || p) : p;
 */

/** Build alias -> canonical product-name lookup from the `aliases` table. */
function iq_ins_canon_map(?array $aliases): array {
    $m = [];
    foreach (($aliases ?: []) as $a) {
        $m[$a['alias'] ?? null] = $a['canonical'] ?? null;
    }
    return $m;
}

/** Canonicalize a product name via the alias map; passthrough on no match / falsy input. */
function iq_ins_canon(array $m, $p) {
    if (!iq_ins_truthy($p)) return $p;
    $v = array_key_exists($p, $m) ? $m[$p] : null;
    return iq_ins_truthy($v) ? $v : $p;
}

/* ── Q1: quota obtained this week / month / year ────────────────────────── */
// JS: function obtainedByPeriod(t, today = new Date()) { ... }
function iq_ins_obtainedByPeriod(array $t, $today = null): array {
    $todayTs = iq_ins_resolve_today($today);
    $Y = (int) gmdate('Y', $todayTs);
    $M = (int) gmdate('n', $todayTs) - 1; // 0-indexed, mirrors getUTCMonth()
    $weekStart = $todayTs - 6 * 86400;

    $year = 0; $month = 0; $week = 0;
    $dated = 0; $pending = 0; $pendingMT = 0;
    $byMonth = [];

    foreach (($t['cycles'] ?? []) as $c) {
        $type = $c['cycle_type'] ?? '';
        if (!preg_match('/^obtained/i', (string) $type)) continue;

        $v = iq_ins_num($c['mt'] ?? null);
        $d = iq_ins_parse_dmy($c['release_date'] ?? null);
        // TBA / blank release date = not yet released -> PENDING, not in a period.
        if ($d === null) { $pending += 1; $pendingMT += $v; continue; }

        $dated += 1;
        $dy = (int) gmdate('Y', $d);
        $dm = (int) gmdate('n', $d) - 1;
        $key = sprintf('%d-%02d', $dy, $dm + 1);
        $byMonth[$key] = ($byMonth[$key] ?? 0) + $v;
        if ($dy === $Y) $year += $v;
        if ($dy === $Y && $dm === $M) $month += $v;
        if ($d >= $weekStart && $d <= $todayTs) $week += $v;
    }

    return [
        'asOf'                  => gmdate('Y-m-d', $todayTs),
        'week'                  => $week,
        'month'                 => $month,
        'year'                  => $year,
        'byMonth'               => $byMonth,
        'datedObtainedCycles'   => $dated,
        'pendingObtainedCycles' => $pending,
        'pendingObtainedMT'     => $pendingMT,
    ];
}

/* ── Q2: latest document progress of a company ──────────────────────────── */
// JS: function latestProgress(t, code) { ... }
function iq_ins_latestProgress(array $t, $code): array {
    $rows = array_values(array_filter(
        $t['cycles'] ?? [],
        fn($c) => ($c['company_code'] ?? null) === $code
    ));
    usort($rows, fn($a, $b) => iq_ins_num($a['sort_order'] ?? null) <=> iq_ins_num($b['sort_order'] ?? null));

    if (!count($rows)) return ['company' => $code, 'found' => false];

    $last = $rows[count($rows) - 1];
    return [
        'company'   => $code,
        'found'     => true,
        'lastStage' => $last['cycle_type'] ?? null,
        'mt'        => iq_ins_num($last['mt'] ?? null),
        'submit'    => ['type' => $last['submit_type'] ?? null, 'date' => $last['submit_date'] ?? null],
        'release'   => ['type' => $last['release_type'] ?? null, 'date' => $last['release_date'] ?? null],
        'status'    => iq_ins_or($last['status'] ?? null, ''),
        'timeline'  => array_map(fn($r) => [
            'stage'       => $r['cycle_type'] ?? null,
            'submitDate'  => $r['submit_date'] ?? null,
            'releaseDate' => $r['release_date'] ?? null,
            'status'      => $r['status'] ?? null,
        ], $rows),
    ];
}

/* ── Q3: item with the most quota (obtained) ────────────────────────────── */
// JS: function topQuotaItems(t, limit = 10) { ... }
function iq_ins_topQuotaItems(array $t, int $limit = 10): array {
    $cm = iq_ins_canon_map($t['aliases'] ?? []);
    $cyById = [];
    foreach (($t['cycles'] ?? []) as $c) { $cyById[(string) ($c['id'] ?? '')] = $c; }

    $by = [];
    foreach (($t['cycleProducts'] ?? []) as $cp) {
        $cid = (string) ($cp['cycle_id'] ?? '');
        if (!isset($cyById[$cid])) continue;
        $cy = $cyById[$cid];
        if (!preg_match('/^obtained/i', (string) ($cy['cycle_type'] ?? ''))) continue;
        $p = iq_ins_canon($cm, $cp['product'] ?? null);
        $by[$p] = ($by[$p] ?? 0) + iq_ins_num($cp['mt'] ?? null);
    }

    $out = [];
    foreach ($by as $product => $mt) { $out[] = ['product' => $product, 'mt' => $mt]; }
    usort($out, fn($a, $b) => $b['mt'] <=> $a['mt']);
    return array_slice($out, 0, $limit);
}

/* ── Q4: end-to-end days Submit -> Obtained ─────────────────────────────── */
// JS: function leadTime(t) { ... }

/** Mirror `(String(cycleType).match(/#(\d)/) || [])[1]`: the single digit
 *  after '#', or null when there is no such match. */
function iq_ins_hashDigit($cycleType) {
    if (preg_match('/#(\d)/', (string) $cycleType, $m)) return $m[1];
    return null;
}

function iq_ins_leadTime(array $t): array {
    $byCo = [];
    foreach (($t['cycles'] ?? []) as $c) {
        $co = $c['company_code'] ?? null;
        $byCo[$co][] = $c;
    }

    $spans = [];
    foreach ($byCo as $co => $rows) {
        $subs = array_values(array_filter($rows, fn($r) => preg_match('/^submit/i', (string) ($r['cycle_type'] ?? ''))));
        $obts = array_values(array_filter($rows, fn($r) => preg_match('/^obtained/i', (string) ($r['cycle_type'] ?? ''))));

        foreach ($subs as $s) {
            $n = iq_ins_hashDigit($s['cycle_type'] ?? '');
            $o = null;
            foreach ($obts as $x) {
                if (iq_ins_hashDigit($x['cycle_type'] ?? '') === $n) { $o = $x; break; }
            }
            if ($o === null) continue;

            $sd = iq_ins_parse_dmy($s['submit_date'] ?? null);
            $od = iq_ins_parse_dmy($o['release_date'] ?? null);
            if ($sd !== null && $od !== null) {
                $d = (int) round(($od - $sd) / 86400);
                if ($d >= 0) {
                    $spans[] = [
                        'company'      => $co,
                        'cycle'        => $n,
                        'days'         => $d,
                        'submitDate'   => $s['submit_date'] ?? null,
                        'obtainedDate' => $o['release_date'] ?? null,
                    ];
                }
            }
        }
    }

    usort($spans, fn($a, $b) => $a['days'] <=> $b['days']);
    $avg = count($spans) ? array_sum(array_column($spans, 'days')) / count($spans) : null;

    return [
        'pairs'   => count($spans),
        'avgDays' => $avg === null ? null : round($avg * 10) / 10,
        'fastest' => $spans[0] ?? null,
        'slowest' => $spans[count($spans) - 1] ?? null,
        'detail'  => $spans,
    ];
}

/* ── Q5: remaining quota of an item ─────────────────────────────────────── */
// JS: function remainingForItem(t, item) { ... }
function iq_ins_remainingForItem(array $t, $item): array {
    $cm = iq_ins_canon_map($t['aliases'] ?? []);
    $want = iq_ins_canon($cm, $item);

    $available = 0; $utilization = 0; $byCompany = [];
    foreach (($t['stats'] ?? []) as $s) {
        if (iq_ins_canon($cm, $s['product'] ?? null) !== $want) continue;
        $av = iq_ins_num($s['available_mt'] ?? null);
        $ut = iq_ins_num($s['utilization_mt'] ?? null);
        $available += $av; $utilization += $ut;
        $byCompany[] = ['company' => $s['company_code'] ?? null, 'available' => $av, 'utilization' => $ut];
    }

    return [
        'item'        => $want,
        'remainingMT' => $available,
        'utilizedMT'  => $utilization,
        'companies'   => count($byCompany),
        'byCompany'   => $byCompany,
    ];
}

/* ── Q6: which companies hold quota for an item ─────────────────────────── */
// JS: function companiesWithItem(t, item) { ... }
function iq_ins_companiesWithItem(array $t, $item): array {
    $cm = iq_ins_canon_map($t['aliases'] ?? []);
    $want = iq_ins_canon($cm, $item);

    $set = [];
    foreach (($t['stats'] ?? []) as $s) {
        if (iq_ins_canon($cm, $s['product'] ?? null) !== $want) continue;
        $sum = iq_ins_num($s['available_mt'] ?? null) + iq_ins_num($s['utilization_mt'] ?? null);
        if ($sum > 0) {
            $code = $s['company_code'] ?? null;
            $set[$code] = ($set[$code] ?? 0) + $sum;
        }
    }

    $companies = [];
    foreach ($set as $company => $quotaMT) { $companies[] = ['company' => $company, 'quotaMT' => $quotaMT]; }
    usort($companies, fn($a, $b) => $b['quotaMT'] <=> $a['quotaMT']);

    return ['item' => $want, 'companies' => $companies];
}

/* ── Q7: when did a company utilize ─────────────────────────────────────── */
// JS: function utilizationTiming(t, code) { ... }
function iq_ins_utilizationTiming(array $t, $code): array {
    $cm = iq_ins_canon_map($t['aliases'] ?? []);

    $rows = [];
    foreach (($t['lots'] ?? []) as $l) {
        if (($l['company_code'] ?? null) !== $code) continue;
        $utilMT = iq_ins_num($l['util_mt'] ?? null);
        if (!iq_ins_truthy($l['util_date'] ?? null) && !iq_ins_truthy($utilMT)) continue;
        $rows[] = [
            'product' => iq_ins_canon($cm, $l['product'] ?? null),
            'utilMT'  => $utilMT,
            'date'    => iq_ins_or($l['util_date'] ?? null, ''),
        ];
    }

    usort($rows, function ($a, $b) {
        $da = iq_ins_parse_dmy($a['date']) ?? 0;
        $db = iq_ins_parse_dmy($b['date']) ?? 0;
        return $da <=> $db;
    });

    $total = 0;
    foreach ($rows as $r) { $total += $r['utilMT']; }

    return ['company' => $code, 'events' => $rows, 'totalUtilizedMT' => $total];
}

/* ── Q8: what an item was last reallocated into ─────────────────────────── */
// JS: function reallocations(t, item) { ... }
function iq_ins_reallocations(array $t, $item): array {
    $cm = iq_ins_canon_map($t['aliases'] ?? []);
    $want = iq_ins_truthy($item) ? iq_ins_canon($cm, $item) : null;

    $byCo = [];
    foreach (($t['revisions'] ?? []) as $r) {
        $p = iq_ins_canon($cm, $r['product'] ?? null);
        $code = $r['company_code'] ?? null;
        if (!isset($byCo[$code])) $byCo[$code] = ['from' => [], 'to' => []];
        $dir = (($r['direction'] ?? '') === 'to') ? 'to' : 'from';
        $byCo[$code][$dir][] = ['product' => $p, 'mt' => iq_ins_num($r['mt'] ?? null), 'label' => iq_ins_or($r['label'] ?? null, '')];
    }

    $out = [];
    foreach ($byCo as $company => $o) {
        $out[] = ['company' => $company, 'from' => $o['from'], 'to' => $o['to']];
    }

    if ($want !== null) {
        $out = array_values(array_filter($out, function ($r) use ($want) {
            foreach ($r['from'] as $x) if (($x['product'] ?? null) === $want) return true;
            foreach ($r['to'] as $x) if (($x['product'] ?? null) === $want) return true;
            return false;
        }));
    }

    return ['item' => $want, 'reallocations' => $out];
}

/* ── Realization metrics ────────────────────────────────────────────────── */
// JS: function realizationMetrics(t, today = new Date()) { ... }
function iq_ins_realizationMetrics(array $t, $today = null): array {
    $todayTs = iq_ins_resolve_today($today);
    $cm = iq_ins_canon_map($t['aliases'] ?? []);
    $Y = (int) gmdate('Y', $todayTs);
    $M = (int) gmdate('n', $todayTs) - 1;
    $weekStart = $todayTs - 6 * 86400;

    $totVol = 0; $year = 0; $month = 0; $week = 0;
    $byCompany = []; $byProduct = [];

    foreach (($t['realizations'] ?? []) as $r) {
        $v = iq_ins_num($r['volume'] ?? null);
        $totVol += $v;
        $code = $r['company_code'] ?? null;
        $byCompany[$code] = ($byCompany[$code] ?? 0) + $v;
        $prod = iq_ins_canon($cm, $r['product'] ?? null);
        $byProduct[$prod] = ($byProduct[$prod] ?? 0) + $v;

        $d = iq_ins_parse_dmy($r['pib_date'] ?? null);
        if ($d !== null) {
            $dy = (int) gmdate('Y', $d);
            $dm = (int) gmdate('n', $d) - 1;
            if ($dy === $Y) $year += $v;
            if ($dy === $Y && $dm === $M) $month += $v;
            if ($d >= $weekStart && $d <= $todayTs) $week += $v;
        }
    }

    $vsObtained = [];
    foreach (($t['companies'] ?? []) as $c) {
        $obtained = iq_ins_num($c['obtained'] ?? null);
        $code = $c['code'] ?? null;
        $realized = $byCompany[$code] ?? 0;
        $realizedMT = round($realized * 1000) / 1000;
        $row = [
            'company'       => $code,
            'obtainedMT'    => $obtained,
            'realizedMT'    => $realizedMT,
            'outstandingMT' => round(($obtained - $realized) * 1000) / 1000,
            'realizedPct'   => $obtained ? round(($realized / $obtained) * 1000) / 10 : null,
        ];
        if (iq_ins_truthy($row['obtainedMT']) || iq_ins_truthy($row['realizedMT'])) $vsObtained[] = $row;
    }

    $byProductList = [];
    foreach ($byProduct as $product => $mt) { $byProductList[] = ['product' => $product, 'mt' => round($mt * 1000) / 1000]; }
    usort($byProductList, fn($a, $b) => $b['mt'] <=> $a['mt']);

    return [
        'asOf'                => gmdate('Y-m-d', $todayTs),
        'totalRealizedMT'     => round($totVol * 1000) / 1000,
        'realizedThisWeekMT'  => round($week * 1000) / 1000,
        'realizedThisMonthMT' => round($month * 1000) / 1000,
        'realizedThisYearMT'  => round($year * 1000) / 1000,
        'byProduct'           => $byProductList,
        'vsObtained'          => $vsObtained,
    ];
}

/* ── all() ───────────────────────────────────────────────────────────────
 * JS: function all(t, opts = {}) { ... } (insights.js:167)
 * Returns exactly these 9 keys (order mirrors the JS object literal). */
function iq_ins_all(array $t, array $opts = []): array {
    $today   = iq_ins_or($opts['today'] ?? null, null);
    $item    = iq_ins_or($opts['item'] ?? null, 'GI ALLOY');
    $company = iq_ins_or($opts['company'] ?? null, ($t['companies'][0]['code'] ?? null));

    $lt = iq_ins_leadTime($t);

    return [
        'q1_obtainedByPeriod'  => iq_ins_obtainedByPeriod($t, $today),
        'q2_latestProgress'    => iq_ins_latestProgress($t, $company),
        'q3_topQuotaItems'     => iq_ins_topQuotaItems($t),
        'q4_leadTime'          => [
            'pairs'   => $lt['pairs'],
            'avgDays' => $lt['avgDays'],
            'fastest' => $lt['fastest'],
            'slowest' => $lt['slowest'],
        ],
        'q5_remainingForItem'  => iq_ins_remainingForItem($t, $item),
        'q6_companiesWithItem' => iq_ins_companiesWithItem($t, $item),
        'q7_utilizationTiming' => iq_ins_utilizationTiming($t, $company),
        'q8_reallocations'     => iq_ins_reallocations($t, $item),
        'realization'          => iq_ins_realizationMetrics($t, $today),
    ];
}

