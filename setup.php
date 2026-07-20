<?php
/**
 * SalesConnect one-time initializer.
 * Creates the required tabs + header rows in both spreadsheets and seeds
 * default master data. Safe to run more than once (idempotent).
 *
 * Run on the host:
 *     php setup.php                 (via SSH — recommended)
 * or open in a browser while logged in:
 *     https://your-domain/setup.php
 *
 * DELETE this file after a successful run.
 */
require_once __DIR__ . '/lib/GoogleSheets.php';

$cli = (php_sapi_name() === 'cli');
if (!$cli) {
    require_once __DIR__ . '/lib/auth.php';
    if (!sc_current_user()) { header('Location: login.php'); exit; }
    header('Content-Type: text/plain; charset=utf-8');
}

function out($s) { echo $s . "\n"; if (!(php_sapi_name() === 'cli')) { @ob_flush(); @flush(); } }

$cfg = sc_config();
$gs  = new GoogleSheets();

// ── Table schemas (header rows) ──────────────────────────────────────────
$schemas = [
    'cil' => [
        'companies'           => ['id', 'name'],
        'salespeople'         => ['id', 'name'],
        'records'             => ['id', 'company', 'sales_rep', 'contact_person', 'channel',
                                  'date', 'time', 'location', 'urgent_follow_up',
                                  'follow_up_note', 'follow_up_deadline', 'participants',
                                  'created_at', 'deleted'],
        'discussions'         => ['record_id', 'disc_order', 'topic', 'point_order', 'point'],
        'complaints'          => ['id', 'company', 'assigned_to', 'contact_person', 'priority',
                                  'status', 'detail', 'date_in', 'time_in', 'next_follow_up',
                                  'created_at', 'deleted'],
        'complaint_responses' => ['id', 'complaint_id', 'by', 'date', 'time', 'note', 'created_at'],
    ],
    'taskflow' => [
        'staff' => ['id', 'name', 'position', 'created_at'],
        'tasks' => ['id', 'title', 'description', 'from', 'to', 'status',
                    'proposed_deadline', 'deadline', 'deadline_revised',
                    'reject_reason', 'completion_note', 'created_at', 'updated_at'],
    ],
];

// ── Create tabs + headers ────────────────────────────────────────────────
foreach ($schemas as $tool => $tabs) {
    $sid = $cfg['spreadsheets'][$tool];
    out("=== $tool  ($sid) ===");
    $meta = $gs->sheetMeta($sid);
    foreach ($tabs as $tab => $headers) {
        if (!isset($meta[$tab])) {
            $gs->batchUpdate($sid, [['addSheet' => ['properties' => ['title' => $tab]]]]);
            out("  + created tab: $tab");
        }
        $existing = $gs->getValues($sid, $tab . '!1:1', false);
        if (empty($existing) || empty($existing[0]) || trim((string)($existing[0][0] ?? '')) === '') {
            $gs->updateRange($sid, $tab . '!A1', [$headers]);
            out("  · headers written: $tab");
        } else {
            out("  · headers present: $tab");
        }
    }
    $gs->cacheClear();
    out('');
}

// ── Seed master data ─────────────────────────────────────────────────────
function seed_names(GoogleSheets $gs, $sid, $tab, array $names) {
    if (count($gs->table($sid, $tab, false)['rows']) > 0) {
        out("  · $tab already has data — skip seed");
        return;
    }
    $assoc = array_map(fn($n) => ['id' => sc_uid(), 'name' => $n], $names);
    $gs->appendAssocBulk($sid, $tab, $assoc);
    out("  + seeded " . count($names) . " rows into $tab");
}

out('=== Seeding CIL master data ===');
$sidCil = $cfg['spreadsheets']['cil'];
seed_names($gs, $sidCil, 'companies', [
    'Berkat Jaya Mandiri', 'Bilah Baja Makmur Abadi', 'Bukit Jaya Perkasa',
    'Hanwa Indonesia', 'Kapuk Molek', 'Karyawaja Eka Mulia',
    'Lautan Metal Indonesia', 'Mlion Indonesia', 'Nusa Indah Metalindo',
    'Samudra Baja Dunia', 'Sapta Sumber Lancar',
]);
seed_names($gs, $sidCil, 'salespeople', [
    'Angely S', 'Anne', 'David A.N', 'Hendra S', 'Irma', 'Jeri K', 'Jordan', 'Luzya',
]);
out('');

out('=== Seeding TaskFlow staff ===');
$sidTf = $cfg['spreadsheets']['taskflow'];
if (count($gs->table($sidTf, 'staff', false)['rows']) === 0) {
    $now = sc_now();
    $staff = [
        ['id' => 's1', 'name' => 'Jeri Kwa', 'position' => 'Sales', 'created_at' => $now],
        ['id' => 's2', 'name' => 'David',    'position' => 'Sales', 'created_at' => $now],
        ['id' => 's3', 'name' => 'Anne',     'position' => 'Sales', 'created_at' => $now],
        ['id' => 's4', 'name' => 'Luzy',     'position' => 'Sales', 'created_at' => $now],
        ['id' => 's5', 'name' => 'Jeanny',   'position' => 'Ops',   'created_at' => $now],
        ['id' => 's6', 'name' => 'Maya',     'position' => 'Ops',   'created_at' => $now],
        ['id' => 's7', 'name' => 'Agus',     'position' => 'Ops',   'created_at' => $now],
    ];
    $gs->appendAssocBulk($sidTf, 'staff', $staff);
    out('  + seeded 7 staff');
} else {
    out('  · staff already has data — skip seed');
}

out('');
out('✅ Setup complete. You can now delete setup.php.');
