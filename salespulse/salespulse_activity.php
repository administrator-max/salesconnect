<?php
/**
 * Riwayat Input SalesPulse — "PS ini sudah saya input belum?"
 *
 * Diminta 28-Okt-2026: David tidak ingat apakah "Arsen 66 - Del. November 2026
 * - BJM" sudah diinput (ternyata belum ada). Dua hal yang dijawab:
 *   1. setiap upload / hapus PS dan simpan plan/budget dicatat ke tab
 *      `activity_log` (siapa, kapan, apa) — mulai 28-Okt-2026;
 *   2. pencarian langsung ke ps_headers, supaya PS lama (sebelum log ada)
 *      juga bisa dicek: ada atau tidak, kapan dibuat.
 * Pencatatan dilakukan sesudah jawaban terkirim dan tidak boleh menggagalkan
 * penyimpanan — semua kesalahan ditelan.
 */

const SP_AKT_TAB = 'activity_log';
const SP_AKT_KOLOM = ['at', 'email', 'nama', 'aksi', 'ps_number', 'project', 'pt', 'keterangan'];

function sp_akt_rp($v): string {
    $n = (float) str_replace(',', '', (string) $v);
    if (abs($n) >= 1e9) return 'Rp ' . number_format($n / 1e9, 2, ',', '.') . ' M';
    if (abs($n) >= 1e6) return 'Rp ' . number_format($n / 1e6, 1, ',', '.') . ' jt';
    return 'Rp ' . number_format($n, 0, ',', '.');
}

/** "GROUP : GP : PT. INDO KENCANA MANUNGGAL" -> "PT. INDO KENCANA MANUNGGAL" */
function sp_akt_pt($s): string {
    $p = array_map('trim', explode(':', (string) $s));
    return (string) end($p);
}

function sp_akt_ps_headers(GoogleSheets $gs, string $sid): array {
    try { return sp_get_table($gs, $sid, 'ps_headers'); } catch (\Throwable $e) { return []; }
}

/** Pasang pencatat untuk satu permintaan tulis (dipanggil sebelum switch di api.php). */
function sp_akt_mulai(GoogleSheets $gs, string $sid, string $method, array $parts): void {
    try {
        if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) return;
        $res = $parts[0] ?? '';
        $p1 = isset($parts[1]) ? urldecode((string) $parts[1]) : null;
        $b = json_body();
        $c = null;   // [aksi, ps, project, pt, keterangan]

        if ($res === 'project-sheet' && $method === 'POST' && $p1 === null) {
            $h = is_array($b['header'] ?? null) ? $b['header'] : [];
            $ps = (string) ($h['psNumber'] ?? '');
            $sudahAda = false;
            foreach (sp_akt_ps_headers($gs, $sid) as $r) if (($r['ps_number'] ?? null) === $ps) { $sudahAda = true; break; }
            $margin = $h['marginIDR'] ?? $h['margin'] ?? null;
            $ket = [];
            if (!empty($h['customerName'])) $ket[] = 'Customer: ' . $h['customerName'];
            if (!empty($h['poDate'])) $ket[] = 'PO ' . $h['poDate'];
            if ($margin !== null && $margin !== '') $ket[] = 'Margin ' . sp_akt_rp($margin);
            $ket[] = count((array) ($b['items'] ?? [])) . ' item';
            $c = [$sudahAda ? 'Update PS (sudah ada sebelumnya)' : 'Upload PS baru', $ps,
                  (string) ($h['projectName'] ?? ''), sp_akt_pt($h['subsidiary'] ?? ''), implode(' · ', $ket)];
        } elseif ($res === 'project-sheet' && $method === 'DELETE' && $p1 !== null) {
            $proj = ''; $pt = '';
            foreach (sp_akt_ps_headers($gs, $sid) as $r) {
                if (($r['ps_number'] ?? null) === $p1) { $proj = (string) ($r['project_name'] ?? ''); $pt = sp_akt_pt($r['subsidiary'] ?? ''); break; }
            }
            $c = ['Hapus PS', $p1, $proj, $pt, ''];
        } elseif ($res === 'data' && $method === 'POST') {
            $c = ['Simpan plan / catatan bulanan', '', '', '', 'Tahun ' . ($b['year'] ?? '')];
        } elseif ($res === 'budget' && $p1 === 'import' && $method === 'POST') {
            $c = ['Import budget', '', '', '', 'Tahun ' . ($b['year'] ?? '') . ' · ' . count((array) ($b['lines'] ?? [])) . ' baris'];
        } elseif ($res === 'budget' && $p1 !== null && $method === 'DELETE') {
            $c = ['Hapus budget', '', '', '', 'Tahun ' . $p1];
        }
        if (!$c) return;
        $u = function_exists('sc_user') ? (sc_user() ?: []) : [];

        register_shutdown_function(function () use ($gs, $sid, $c, $u) {
            try {
                if (http_response_code() >= 400) return;   // ditolak — tidak ada yang tersimpan
                if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
                elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
                ignore_user_abort(true);
                if (!isset($gs->sheetMeta($sid)[SP_AKT_TAB])) {
                    $gs->batchUpdate($sid, [['addSheet' => ['properties' => ['title' => SP_AKT_TAB, 'gridProperties' => ['columnCount' => count(SP_AKT_KOLOM)]]]]]);
                    $gs->updateRange($sid, SP_AKT_TAB . '!A1', [SP_AKT_KOLOM]);
                }
                $gs->appendAssoc($sid, SP_AKT_TAB, [
                    'at' => gmdate('Y-m-d\TH:i:s\Z'), 'email' => (string) ($u['email'] ?? ''), 'nama' => (string) ($u['name'] ?? ''),
                    'aksi' => $c[0], 'ps_number' => $c[1], 'project' => $c[2], 'pt' => $c[3], 'keterangan' => $c[4],
                ]);
            } catch (\Throwable $e) {
                error_log('salespulse activity log: ' . $e->getMessage());
            }
        });
    } catch (\Throwable $e) {
        error_log('salespulse activity log (mulai): ' . $e->getMessage());
    }
}

/** Huruf kecil + spasi/tanda baca dirapatkan: "Arsen66" dan "arsen - 66" sama-sama ketemu. */
function sp_akt_norm($s): string {
    return preg_replace('/[^a-z0-9]+/', '', strtolower((string) $s));
}

/** GET /api/activity?q=arsen 66 -> { log: [...], ps: [...] } */
function sp_akt_cari(GoogleSheets $gs, string $sid, string $q, int $limit = 200): array {
    $kata = array_values(array_filter(array_map('sp_akt_norm', preg_split('/\s+/', trim($q)))));
    $cocok = function (string $teks) use ($kata) {
        $t = sp_akt_norm($teks);
        foreach ($kata as $k) if (strpos($t, $k) === false) return false;
        return true;
    };

    $log = [];
    if (isset($gs->sheetMeta($sid)[SP_AKT_TAB])) {
        $rows = $gs->table($sid, SP_AKT_TAB, false)['rows'];
        for ($i = count($rows) - 1; $i >= 0 && count($log) < $limit; $i--) {
            $r = $rows[$i];
            if ($kata && !$cocok(implode(' ', [$r['ps_number'] ?? '', $r['project'] ?? '', $r['pt'] ?? '', $r['nama'] ?? '', $r['email'] ?? '', $r['aksi'] ?? '', $r['keterangan'] ?? '']))) continue;
            $log[] = array_intersect_key($r, array_flip(SP_AKT_KOLOM));
        }
    }

    $ps = [];
    if ($kata) {
        foreach (sp_akt_ps_headers($gs, $sid) as $r) {
            if (!$cocok(implode(' ', [$r['ps_number'] ?? '', $r['project_name'] ?? '', $r['subsidiary'] ?? '', $r['customer_name'] ?? '']))) continue;
            $ps[] = [
                'ps_number' => (string) ($r['ps_number'] ?? ''), 'project' => (string) ($r['project_name'] ?? ''),
                'pt' => sp_akt_pt($r['subsidiary'] ?? ''), 'customer' => (string) ($r['customer_name'] ?? ''),
                'po_date' => (string) ($r['po_date'] ?? ''), 'created_at' => (string) ($r['created_at'] ?? ''),
                'margin' => sp_akt_rp($r['margin'] ?? 0),
            ];
        }
        usort($ps, fn($a, $b) => strcmp($b['created_at'], $a['created_at']));
        $ps = array_slice($ps, 0, 100);
    }
    return ['log' => $log, 'ps' => $ps];
}
