<?php
/**
 * SCOT ← Excel "Dispatch Delivery Master Data for Dashboard" di Google Drive.
 *
 * Tim Ops (Maya, Jeany) bekerja di file Excel itu. Dulu isinya harus diunduh lalu
 * diupload manual lewat tab "Update & Export" — dan karena itu jarang dilakukan,
 * dashboard tertinggal ±2 bulan (terakhir 30-Okt-2026, dilaporkan 18-Nov-2026).
 * Sekarang server mengambil file itu sendiri dan menerapkan perubahan.
 *
 * Aturan sinkron (disepakati 18-Nov-2026):
 *   - Excel = sumber utama. Sel Excel yang BERISI menimpa nilai di dashboard.
 *   - Sel Excel yang kosong atau "-" TIDAK menghapus nilai dashboard (isian dari
 *     form/OCR dashboard tidak hilang diam-diam).
 *   - Baris Excel tanpa pasangan → shipment baru. Baris dashboard tanpa pasangan
 *     di Excel TIDAK dihapus, hanya dilaporkan.
 *   - Pasangan dicari lewat NAMA PROJECT (+MT), bukan nomor urut atau consignee:
 *     nomor "No." di Excel diurut ulang, dan ejaan consignee berganti-ganti
 *     ("Angkas Artha" / "Angkasa Artha", "PT Selaras…" / "Selaras…").
 *
 * File Excel (.xlsx) tidak bisa dibaca Sheets API ("must not be an Office file"),
 * jadi diunduh lewat Drive API (drive.readonly) dan dibongkar di sini.
 */
require_once __DIR__ . '/scot_util.php';

const SCOT_EXCEL_FILE_ID_DEFAULT = '1wIYBmnmfBykxADNRZzqutnLsmVZeft4y';
const SCOT_SYNC_CEK_DETIK = 120;   // jeda minimal antar-cek metadata Drive
const SCOT_EXCEL_KOLOM = ['no','cargo_type','consignee','project_name','product','quantity_mt',
    'bl_number','shipping_line','vessel_name','voyage_number','pol','pod','shipment_route',
    'etd','eta','shipment_type','est_sailing_days','actual_sailing_days','pib_billing','bpn',
    'spjm','behandle','sppb','clearance_days','start_unloading','finish_unloading','unloading_days',
    'cargo_status','start_delivery','enter_warehouse','delivery_days','vendor_trucking',
    'warehouse_location','status','remarks'];

function scot_sync_file_id(): string {
    $cfg = sc_config();
    return (string) ($cfg['scot_excel_file_id'] ?? SCOT_EXCEL_FILE_ID_DEFAULT);
}

function scot_sync_state_path(): string {
    $cfg = sc_config();
    $dir = rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/');
    if (!is_dir($dir)) @mkdir($dir, 0700, true);
    return $dir . '/scot_sync_state.json';
}
function scot_sync_state(): array {
    $s = json_decode((string) @file_get_contents(scot_sync_state_path()), true);
    return is_array($s) ? $s : [];
}
function scot_sync_state_put(array $s): void {
    @file_put_contents(scot_sync_state_path(), json_encode($s, JSON_UNESCAPED_UNICODE | JSON_PRETTY_PRINT));
}

/* ── Drive API (baca saja) ─────────────────────────────────────────────── */
function scot_drive_token(): string {
    $cfg = sc_config();
    $sa = json_decode((string) file_get_contents($cfg['service_account']), true);
    $dir = rtrim($cfg['cache_dir'] ?? (__DIR__ . '/../cache'), '/');
    $tf = $dir . '/token_drive_' . substr(md5($sa['client_email']), 0, 12) . '.json';
    $t = json_decode((string) @file_get_contents($tf), true);
    if ($t && ($t['exp'] ?? 0) > time() + 60) return $t['access_token'];
    $b = fn($s) => rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    $now = time();
    $in = $b(json_encode(['alg' => 'RS256', 'typ' => 'JWT'])) . '.' . $b(json_encode([
        'iss' => $sa['client_email'], 'scope' => 'https://www.googleapis.com/auth/drive.readonly',
        'aud' => 'https://oauth2.googleapis.com/token', 'exp' => $now + 3600, 'iat' => $now]));
    if (!openssl_sign($in, $sig, $sa['private_key'], OPENSSL_ALGO_SHA256)) throw new Exception('Gagal menandatangani JWT Drive');
    $ch = curl_init('https://oauth2.googleapis.com/token');
    curl_setopt_array($ch, [CURLOPT_POST => 1, CURLOPT_RETURNTRANSFER => 1, CURLOPT_TIMEOUT => 20,
        CURLOPT_POSTFIELDS => http_build_query(['grant_type' => 'urn:ietf:params:oauth:grant-type:jwt-bearer', 'assertion' => $in . '.' . $b($sig)])]);
    $r = json_decode((string) curl_exec($ch), true);
    if (empty($r['access_token'])) throw new Exception('Token Drive gagal: ' . json_encode($r));
    @file_put_contents($tf, json_encode(['access_token' => $r['access_token'], 'exp' => $now + (int) ($r['expires_in'] ?? 3600)]));
    @chmod($tf, 0600);
    return $r['access_token'];
}
function scot_drive_get(string $url): array {
    $ch = curl_init($url);
    curl_setopt_array($ch, [CURLOPT_RETURNTRANSFER => 1, CURLOPT_FOLLOWLOCATION => 1, CURLOPT_TIMEOUT => 60,
        CURLOPT_HTTPHEADER => ['Authorization: Bearer ' . scot_drive_token()]]);
    $body = curl_exec($ch);
    return [(int) curl_getinfo($ch, CURLINFO_HTTP_CODE), (string) $body];
}
function scot_drive_meta(string $id): array {
    [$c, $b] = scot_drive_get('https://www.googleapis.com/drive/v3/files/' . rawurlencode($id)
        . '?fields=name,modifiedTime,lastModifyingUser(displayName)&supportsAllDrives=true');
    if ($c === 404) throw new Exception('File Excel SCOT tidak bisa dibuka sistem — pastikan dibagikan (Viewer) ke akun salesconnect@…iam.gserviceaccount.com');
    if ($c !== 200) throw new Exception("Drive metadata $c");
    return json_decode($b, true) ?: [];
}
function scot_drive_download(string $id): string {
    [$c, $b] = scot_drive_get('https://www.googleapis.com/drive/v3/files/' . rawurlencode($id) . '?alt=media&supportsAllDrives=true');
    if ($c !== 200) throw new Exception("Unduh Excel SCOT gagal ($c)");
    return $b;
}

/* ── Bongkar .xlsx (tanpa pustaka) ─────────────────────────────────────── */
/** @return array<string, array<int, array<int, string|null>>> nama sheet → baris (0-based) → kolom (0-based) */
function scot_xlsx_sheets(string $bytes): array {
    $tmp = tempnam(sys_get_temp_dir(), 'scotx');
    file_put_contents($tmp, $bytes);
    $z = new ZipArchive();
    if ($z->open($tmp) !== true) { @unlink($tmp); throw new Exception('File Excel rusak / bukan .xlsx'); }
    try {
        $ss = [];
        if (($x = $z->getFromName('xl/sharedStrings.xml')) !== false) {
            $sx = simplexml_load_string($x);
            foreach ($sx->si as $si) {
                if (isset($si->t)) { $ss[] = (string) $si->t; continue; }
                $s = ''; foreach ($si->r as $r) $s .= (string) $r->t; $ss[] = $s;
            }
        }
        $wb = simplexml_load_string($z->getFromName('xl/workbook.xml'));
        $rels = simplexml_load_string($z->getFromName('xl/_rels/workbook.xml.rels'));
        $target = [];
        foreach ($rels->Relationship as $r) $target[(string) $r['Id']] = (string) $r['Target'];
        $out = [];
        foreach ($wb->sheets->sheet as $sh) {
            $rid = (string) $sh->attributes('http://schemas.openxmlformats.org/officeDocument/2006/relationships')['id'];
            $path = ltrim(preg_replace('#^/?xl/#', '', $target[$rid] ?? ''), '/');
            $xml = $z->getFromName('xl/' . $path);
            if ($xml === false) continue;
            $sx = simplexml_load_string($xml);
            $rows = [];
            foreach ($sx->sheetData->row as $row) {
                $ri = (int) $row['r'] - 1;
                foreach ($row->c as $c) {
                    $ref = (string) $c['r'];
                    $letters = preg_replace('/\d+/', '', $ref);
                    $ci = 0; foreach (str_split($letters) as $ch) $ci = $ci * 26 + (ord($ch) - 64); $ci--;
                    $t = (string) $c['t'];
                    if ($t === 's') $v = $ss[(int) $c->v] ?? '';
                    elseif ($t === 'inlineStr') $v = (string) ($c->is->t ?? '');
                    else $v = isset($c->v) ? (string) $c->v : null;
                    $rows[$ri][$ci] = $v;
                }
            }
            $out[(string) $sh['name']] = $rows;
        }
        return $out;
    } finally { $z->close(); @unlink($tmp); }
}

/** Nilai sel → tanggal Y-m-d (serial Excel atau teks), null bila kosong/"-". */
function scot_xl_tanggal($v): ?string {
    if ($v === null) return null;
    $s = trim((string) $v);
    if ($s === '' || $s === '-') return null;
    if (is_numeric($s) && (float) $s > 20000 && (float) $s < 80000) {
        return gmdate('Y-m-d', (int) round(((float) $s - 25569) * 86400));
    }
    if (preg_match('#^(\d{4})-(\d{2})-(\d{2})#', $s, $m)) return "$m[1]-$m[2]-$m[3]";
    if (preg_match('#^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$#', $s, $m)) return sprintf('%04d-%02d-%02d', $m[3], $m[2], $m[1]);
    $ts = strtotime($s);
    return $ts ? gmdate('Y-m-d', $ts) : null;
}

/** Baris Excel → rekaman SCOT. Hanya sheet bernama "...Analyze<tahun>". */
function scot_excel_records(array $sheets): array {
    $out = [];
    foreach ($sheets as $nama => $rows) {
        if (!preg_match('/analy[sz]e\s*(\d{2,4})/i', $nama, $m)) continue;
        $tahun = (int) $m[1]; if ($tahun < 100) $tahun += 2000;
        $mulai = null;
        foreach ($rows as $ri => $r) {
            if ($ri > 10) break;
            if (preg_match('/^no\b/i', trim((string) ($r[0] ?? '')))) { $mulai = $ri + 1; break; }
        }
        if ($mulai === null) continue;
        foreach ($rows as $ri => $r) {
            if ($ri < $mulai) continue;
            $rec = ['year' => $tahun, '_sheet' => $nama, '_baris' => $ri + 1];
            foreach (SCOT_EXCEL_KOLOM as $ci => $k) {
                $v = $r[$ci] ?? null;
                $s = $v === null ? '' : trim(str_replace(["\r\n", "\r"], "\n", (string) $v));
                if ($s === '' || $s === '-') { $rec[$k] = null; continue; }
                if (in_array($k, SCOT_DATE, true)) $rec[$k] = scot_xl_tanggal($s);
                elseif (in_array($k, SCOT_NUMERIC, true)) {
                    $rec[$k] = is_numeric($s) ? round((float) $s, 3) + 0 : null;
                    // Rumus "ETA − ETD" di Excel dengan ETD kosong menghasilkan serial tanggal
                    // (mis. 46329). Jumlah hari di atas 1000 pasti bukan durasi → anggap kosong.
                    if (substr($k, -5) === '_days' && $rec[$k] !== null && abs($rec[$k]) > 1000) $rec[$k] = null;
                }
                else $rec[$k] = $s;
            }
            if (empty($rec['project_name'])) continue;
            $out[] = $rec;
        }
    }
    return $out;
}

function scot_sync_norm($s): string {
    return preg_replace('/[^a-z0-9]/', '', strtolower((string) $s));
}

/** Dua nilai dianggap sama? Angka dibanding numerik, tanggal 10 karakter, teks persis (trim). */
function scot_sync_sama(string $k, $a, $b): bool {
    if (in_array($k, SCOT_NUMERIC, true)) {
        if (!is_numeric($a) || !is_numeric($b)) return (string) $a === (string) $b;
        return abs((float) $a - (float) $b) < 0.0005;
    }
    if (in_array($k, SCOT_DATE, true)) return substr((string) $a, 0, 10) === substr((string) $b, 0, 10);
    return trim((string) $a) === trim((string) $b);
}

/**
 * Rencana sinkron: pasangkan rekaman Excel ke baris dashboard.
 * @return array{updates: array, inserts: array, unchanged: int, db_only: array}
 */
function scot_sync_plan(array $excel, array $db): array {
    $pakai = [];
    $idxProj = [];
    foreach ($db as $i => $s) $idxProj[scot_sync_norm($s['project_name'] ?? '')][] = $i;
    $cari = function (array $r, int $tahap) use ($db, &$pakai, $idxProj) {
        $p = scot_sync_norm($r['project_name']);
        $kand = [];
        if ($tahap === 4) {
            /* Nama project ditulis beda tipis ("Transcoal Minergy - WR Plate" vs
               "Transcoal Minergy #01 - WR Plate"): MT persis sama, tahun & jenis
               kargo sama, dan 8 huruf awal nama project sama — hanya bila TUNGGAL. */
            $awal = substr($p, 0, 8);
            foreach ($db as $i => $s) {
                if (isset($pakai[$i]) || $awal === '') continue;
                if ((string) ($s['year'] ?? '') !== (string) $r['year']) continue;
                if (scot_sync_norm($s['cargo_type'] ?? '') !== scot_sync_norm($r['cargo_type'] ?? '')) continue;
                if (substr(scot_sync_norm($s['project_name'] ?? ''), 0, 8) !== $awal) continue;
                if (!is_numeric($s['quantity_mt'] ?? null) || $r['quantity_mt'] === null || abs((float) $s['quantity_mt'] - (float) $r['quantity_mt']) >= 0.01) continue;
                $kand[] = $i;
            }
            return count($kand) === 1 ? $kand[0] : null;
        }
        if ($tahap < 3) {
            foreach ($idxProj[$p] ?? [] as $i) {
                if (isset($pakai[$i])) continue;
                $s = $db[$i];
                if (scot_sync_norm($s['cargo_type'] ?? '') !== scot_sync_norm($r['cargo_type'] ?? '') && ($r['cargo_type'] ?? null) !== null) continue;
                if ($tahap === 1 && !(is_numeric($s['quantity_mt'] ?? null) && $r['quantity_mt'] !== null && abs((float) $s['quantity_mt'] - (float) $r['quantity_mt']) < 1)) continue;
                $kand[] = $i;
            }
        } else {
            $bl = scot_sync_norm($r['bl_number'] ?? '');
            if ($bl === '') return null;
            foreach ($db as $i => $s) {
                if (isset($pakai[$i])) continue;
                if (scot_sync_norm($s['bl_number'] ?? '') === $bl && abs((float) ($s['quantity_mt'] ?? 0) - (float) ($r['quantity_mt'] ?? 0)) < 1) $kand[] = $i;
            }
        }
        if (!$kand) return null;
        // Utamakan tahun yang sama, lalu MT terdekat.
        usort($kand, function ($a, $b) use ($db, $r) {
            $ya = (int) ((string) ($db[$a]['year'] ?? '') === (string) $r['year']);
            $yb = (int) ((string) ($db[$b]['year'] ?? '') === (string) $r['year']);
            if ($ya !== $yb) return $yb - $ya;
            return abs((float) ($db[$a]['quantity_mt'] ?? 0) - (float) ($r['quantity_mt'] ?? 0))
                <=> abs((float) ($db[$b]['quantity_mt'] ?? 0) - (float) ($r['quantity_mt'] ?? 0));
        });
        if ($tahap === 2 && count($kand) > 1) return null; // ragu: lebih baik jadi baris baru yang terlihat
        return $kand[0];
    };
    $pas = array_fill(0, count($excel), null);
    foreach ([1, 2, 3, 4] as $tahap) {
        foreach ($excel as $ei => $r) {
            if ($pas[$ei] !== null) continue;
            $i = $cari($r, $tahap);
            if ($i !== null) { $pas[$ei] = $i; $pakai[$i] = true; }
        }
    }
    $updates = []; $inserts = []; $unchanged = 0;
    foreach ($excel as $ei => $r) {
        $i = $pas[$ei];
        $data = [];
        foreach (array_merge(SCOT_EXCEL_KOLOM, ['year']) as $k) {
            $v = $r[$k] ?? null;
            if ($v === null || $v === '') continue;      // kosong di Excel tidak menghapus
            if ($i !== null && scot_sync_sama($k, $v, $db[$i][$k] ?? null)) continue;
            $data[$k] = $v;
        }
        if ($i === null) { $inserts[] = $data + ['_sumber' => $r['_sheet'] . ' baris ' . $r['_baris']]; continue; }
        if ($data) $updates[] = ['i' => $i, 'id' => $db[$i]['id'] ?? null, 'data' => $data, '_sumber' => $r['_sheet'] . ' baris ' . $r['_baris']];
        else $unchanged++;
    }
    $dbOnly = [];
    foreach ($db as $i => $s) if (!isset($pakai[$i])) $dbOnly[] = ['id' => $s['id'] ?? null, 'year' => $s['year'] ?? null, 'consignee' => $s['consignee'] ?? '', 'project_name' => $s['project_name'] ?? '', 'quantity_mt' => $s['quantity_mt'] ?? null];
    return ['updates' => $updates, 'inserts' => $inserts, 'unchanged' => $unchanged, 'db_only' => $dbOnly];
}

/**
 * Jalankan sinkron. $paksa = abaikan jeda & cek modifiedTime. $coba = hanya rencana, tidak menulis.
 * Hasil disimpan di state agar UI bisa menampilkan "terakhir sinkron".
 */
function scot_sync_run(GoogleSheets $gs, string $sid, bool $paksa = false, bool $coba = false): array {
    $st = scot_sync_state();
    $now = time();
    if (!$paksa && !$coba && ($now - (int) ($st['cek_at'] ?? 0)) < SCOT_SYNC_CEK_DETIK) {
        return ['status' => 'skip', 'alasan' => 'baru dicek'] + $st;
    }
    $id = scot_sync_file_id();
    $meta = scot_drive_meta($id);
    $mod = (string) ($meta['modifiedTime'] ?? '');
    $st['cek_at'] = $now;
    unset($st['galat'], $st['galat_at']);   // Drive terjangkau lagi
    $st['file'] = $meta['name'] ?? '';
    $st['excel_diubah'] = $mod;
    $st['excel_diubah_oleh'] = $meta['lastModifyingUser']['displayName'] ?? '';
    if (!$paksa && !$coba && $mod !== '' && $mod === ($st['excel_disinkron'] ?? '')) {
        scot_sync_state_put($st);
        return ['status' => 'tetap'] + $st;
    }
    $records = scot_excel_records(scot_xlsx_sheets(scot_drive_download($id)));
    if (count($records) < 10) throw new Exception('Excel SCOT terbaca hanya ' . count($records) . ' baris — sinkron dibatalkan supaya data tidak rusak');

    $hasil = scot_with_lock(function () use ($gs, $sid, $records, $coba) {
        $t = $gs->table($sid, 'shipments', false);
        $db = $t['rows'];
        $plan = scot_sync_plan($records, $db);
        if ($coba || (!$plan['updates'] && !$plan['inserts'])) return $plan;
        $now = date('c');
        /* Cadangan isi tab SEBELUM ditulis — 10 terakhir disimpan di cache/. */
        $cfgB = sc_config();
        $dirB = rtrim($cfgB['cache_dir'] ?? (__DIR__ . '/../cache'), '/') . '/scot_cadangan';
        if (!is_dir($dirB)) @mkdir($dirB, 0700, true);
        @file_put_contents($dirB . '/shipments_' . date('Ymd_His') . '.json', json_encode($t, JSON_UNESCAPED_UNICODE));
        $lama = glob($dirB . '/shipments_*.json') ?: [];
        sort($lama);
        foreach (array_slice($lama, 0, max(0, count($lama) - 10)) as $f) @unlink($f);
        foreach ($plan['updates'] as $u) {
            $db[$u['i']] = array_merge($db[$u['i']], $u['data'], ['updated_at' => $now, 'updated_by' => 'Sinkron Excel']);
        }
        $nextId = 0; foreach ($db as $r) $nextId = max($nextId, (int) ($r['id'] ?? 0));
        foreach ($plan['inserts'] as $ins) {
            unset($ins['_sumber']);
            $db[] = array_merge($ins, ['id' => ++$nextId, 'created_at' => $now, 'updated_at' => $now, 'updated_by' => 'Sinkron Excel']);
        }
        $hdr = $t['headers'];
        $matrix = array_map(function ($r) use ($hdr) {
            return array_map(function ($h) use ($r) {
                if ($h === '' || !array_key_exists($h, $r) || $r[$h] === null) return '';
                $v = $r[$h];
                // Kolom angka ditulis sebagai ANGKA (RAW + string "5005" = teks di sheet).
                if (in_array($h, SCOT_NUMERIC, true) && is_numeric($v)) return $v + 0;
                return $v;
            }, $hdr);
        }, $db);
        $gs->batchRewrite($sid, [['tab' => 'shipments', 'rows' => $matrix]]);
        return $plan;
    });

    $ringkas = ['diperbarui' => count($hasil['updates']), 'baru' => count($hasil['inserts']),
        'tetap' => $hasil['unchanged'], 'hanya_di_dashboard' => count($hasil['db_only'])];
    if (!$coba) {
        $st['excel_disinkron'] = $mod;
        $st['sinkron_at'] = date('c');
        $st['hasil'] = $ringkas;
        $st['hanya_di_dashboard'] = $hasil['db_only'];
        scot_sync_state_put($st);
    }
    return ['status' => $coba ? 'coba' : 'sinkron', 'hasil' => $ringkas, 'rencana' => $coba ? $hasil : null] + $st;
}
