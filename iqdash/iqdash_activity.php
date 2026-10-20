<?php
/**
 * Log aktivitas IQ Dash — "apakah input saya sudah masuk DAN sudah terhitung?"
 *
 * Diminta 20-Okt-2026 setelah kasus EMS 500 / KJK 300: David sudah menginput,
 * datanya tersimpan rapi di spreadsheet, tapi dashboard tidak menghitungnya —
 * dan tidak ada yang tahu sampai ia bertanya. Tim tidak boleh lagi harus
 * bertanya untuk tahu apakah sebuah logika berjalan.
 *
 * Cara kerja: setiap penulisan ke /api/company/* dan /api/realizations/*
 * dipotret SEBELUM dan SESUDAH-nya (baris mentah milik company itu + angka yang
 * benar-benar dikirim ke dashboard). Selisihnya dicatat ke tab `activity_log`
 * di spreadsheet IQ Dash:
 *   - apa yang berubah di input (lot, utilisasi, siklus, realisasi, status);
 *   - apa efeknya pada angka dashboard (Used / Sisa / Obtained / Realisasi);
 *   - status: `ok` (tersimpan & terhitung), `warning` (tersimpan TAPI angka
 *     dashboard tidak bergerak sebesar inputnya — persis pola EMS/KJK), atau
 *     `nochange` (disimpan tanpa perubahan data).
 *
 * Potret SESUDAH dibuat setelah jawaban dikirim ke browser (finish_request),
 * jadi tim tidak menunggu lebih lama. Seluruh modul ini TIDAK BOLEH
 * menggagalkan penyimpanan: setiap kesalahan ditelan.
 */

const IQ_AKT_TAB = 'activity_log';
const IQ_AKT_KOLOM = ['at', 'email', 'nama', 'peran', 'aksi', 'company_code', 'status', 'ringkasan', 'dampak', 'detail'];

/** Rute penulisan yang dicatat -> [aksi, kode company atau null]. */
function iq_akt_rute(string $method, array $parts, array $body, ?callable $kodeDariIdRealisasi = null): ?array {
    if (!in_array($method, ['POST', 'PUT', 'PATCH', 'DELETE'], true)) return null;
    $res = $parts[0] ?? '';
    $p1 = isset($parts[1]) ? urldecode((string) $parts[1]) : null;
    $p2 = $parts[2] ?? null;
    if ($res === 'company') {
        if ($method === 'POST' && $p1 === null) return ['Company baru', (string) ($body['code'] ?? '')];
        if ($p1 === null || $p1 === '') return null;
        $aksi = [
            'record-obtained'          => 'Catat Obtained terbit',
            'pertek-perubahan-release' => 'Tanggal PERTEK Perubahan',
            'cycles'                   => 'Simpan siklus',
            'cycle-utilization'        => 'Simpan utilisasi per siklus',
        ][$p2 ?? ''] ?? ($p2 === null ? 'Simpan data company' : null);
        return $aksi ? [$aksi, $p1] : null;
    }
    if ($res === 'realizations') {
        if ($method === 'POST' && $p1 === null) return ['Import realisasi', (string) ($body['companyCode'] ?? '')];
        if ($method === 'POST' && $p1 === 'single') return ['Input realisasi manual', (string) ($body['companyCode'] ?? '')];
        if ($p1 !== null && ($method === 'PUT' || $method === 'PATCH' || $method === 'DELETE')) {
            $kode = $kodeDariIdRealisasi ? (string) $kodeDariIdRealisasi((int) $p1) : '';
            return [$method === 'DELETE' ? 'Hapus baris realisasi' : 'Edit baris realisasi', $kode];
        }
    }
    return null;
}

/** Ambil tabel mentah + payload yang dikirim ke dashboard. */
function iq_akt_muat(GoogleSheets $gs, string $sid): array {
    $t = iq_load_tables($gs, $sid);
    return [$t, iq_build_payload($t)];
}

/** Potret satu company: baris mentah inputnya + angka yang terlihat di dashboard. */
function iq_akt_potret(array $t, array $payload, string $code): array {
    $milik = fn(array $rows) => array_values(array_filter($rows, fn($r) => (string) ($r['company_code'] ?? '') === $code));
    $s = fn($v) => trim((string) ($v ?? ''));
    $alias = $payload['productAliases'] ?? [];
    $kanon = fn($p) => $alias[$s($p)] ?? $s($p);

    $co = null;
    foreach (array_merge($payload['spi'] ?? [], $payload['pending'] ?? []) as $c) {
        if (($c['code'] ?? null) === $code) { $co = $c; break; }
    }
    $primer = $co ? iq_tahun_primer($co) : IQ_TAHUN_BAWAAN;

    $lot = [];
    foreach ($milik($t['lots'] ?? []) as $r) {
        $k = $s($r['product']) . ' #' . $s($r['lot_no']) . ($s($r['quota_year']) !== '' && (int) $r['quota_year'] !== IQ_TAHUN_BAWAAN ? ' (' . $s($r['quota_year']) . ')' : '');
        $lot[$k] = [
            'produk' => $kanon($r['product']), 'util' => iq_num($r['util_mt'] ?? 0), 'tgl' => $s($r['util_date']),
            'eta' => $s($r['eta_jkt']), 'real' => iq_num($r['real_mt'] ?? 0), 'tiba' => to_bool($r['cargo_arrived'] ?? false),
            'primer' => iq_tahun_baris($r) === $primer,
        ];
    }
    $uc = [];
    foreach ($milik($t['cycleUtil'] ?? []) as $r) {
        $k = $s($r['cycle_type']) . ' ' . $s($r['product']) . ' @' . $s($r['util_date']);
        $uc[$k] = ['produk' => $kanon($r['product']), 'mt' => ($uc[$k]['mt'] ?? 0) + iq_num($r['util_mt'] ?? 0), 'primer' => iq_tahun_baris($r) === $primer];
    }
    $stats = [];
    foreach ($milik($t['stats'] ?? []) as $r) {
        $stats[$kanon($r['product'])] = ($stats[$kanon($r['product'])] ?? 0) + iq_num($r['utilization_mt'] ?? 0);
    }
    $siklus = [];
    foreach ($milik($t['cycles'] ?? []) as $r) {
        $tahun = iq_tahun_baris($r) !== IQ_TAHUN_BAWAAN ? ' (' . iq_tahun_baris($r) . ')' : '';
        $siklus[$s($r['cycle_type']) . $tahun] = [
            'mt' => $s($r['mt']), 'pertek' => $s($r['pertek_date']), 'spi' => $s($r['spi_date']),
            'rilis' => $s($r['release_date']), 'status' => $s($r['status']),
        ];
    }
    $baris = null;
    foreach ($t['companies'] ?? [] as $r) if (($r['code'] ?? null) === $code) { $baris = $r; break; }
    $real = $milik($t['realizations'] ?? []);
    $realMentah = 0.0;
    foreach ($real as $r) $realMentah += iq_num($r['volume'] ?? 0);
    $realTerhitung = 0.0;
    foreach (iq_realizations_list($t['realizations'] ?? [], $code) as $r) $realTerhitung += iq_num($r['volume'] ?? 0);

    return [
        'ada' => $co !== null || $baris !== null,
        'lot' => $lot, 'uc' => $uc, 'stats' => $stats, 'siklus' => $siklus,
        'status' => $baris ? [
            'Status update' => $s($baris['status_update'] ?? ''), 'Rev status' => $s($baris['rev_status'] ?? ''),
            'No. PERTEK' => $s($baris['pertek_no'] ?? ''), 'No. SPI' => $s($baris['spi_no'] ?? ''),
            'Remarks' => $s($baris['remarks'] ?? ''),
        ] : [],
        'realBaris' => count($real), 'realMentah' => $realMentah, 'realTerhitung' => $realTerhitung,
        'dash' => $co ? [
            'obtained' => iq_num($co['obtained'] ?? 0), 'used' => iq_num($co['utilizationMT'] ?? 0),
            'sisa' => iq_num($co['availableQuota'] ?? 0),
            'usedProd' => iq_akt_per_kanon((array) ($co['utilizationByProd'] ?? []), $kanon),
            'sisaProd' => iq_akt_per_kanon((array) ($co['availableByProd'] ?? []), $kanon),
        ] : null,
        // Bahan penjelasan "kenapa tidak terhitung".
        'masterAkhir' => (function () use ($co, $kanon) {
            $m = [];
            foreach (($co['utilCycles'] ?? []) as $u) {
                $h = iq_util_day_key($u['date'] ?? null);
                $p = $kanon($u['product'] ?? '');
                if ($h !== null && (!isset($m[$p]) || $h > $m[$p])) $m[$p] = $h;
            }
            return $m;
        })(),
    ];
}

function iq_akt_per_kanon(array $m, callable $kanon): array {
    $o = [];
    foreach ($m as $p => $v) { $k = $kanon($p); $o[$k] = ($o[$k] ?? 0) + iq_num($v); }
    return $o;
}

function iq_akt_mt($v): string {
    $v = round((float) $v, 3);
    return number_format($v, ($v == floor($v)) ? 0 : 2, ',', '.');
}

/** Bandingkan dua potret -> [status, ringkasan[], dampak[], peringatan[]]. */
function iq_akt_banding(array $a, array $b): array {
    $baris = [];
    $mt = 'iq_akt_mt';

    foreach (array_unique(array_merge(array_keys($a['lot']), array_keys($b['lot']))) as $k) {
        $x = $a['lot'][$k] ?? null; $y = $b['lot'][$k] ?? null;
        if (!$x) { $baris[] = "Lot $k baru: util {$mt($y['util'])} MT" . ($y['tgl'] ? " ({$y['tgl']})" : ' (tanpa tanggal)'); continue; }
        if (!$y) { $baris[] = "Lot $k dihapus (util {$mt($x['util'])} MT)"; continue; }
        $u = [];
        if (abs($x['util'] - $y['util']) > 0.0005) $u[] = "util {$mt($x['util'])} → {$mt($y['util'])} MT";
        if ($x['tgl'] !== $y['tgl']) $u[] = "tgl util " . ($x['tgl'] ?: '—') . ' → ' . ($y['tgl'] ?: '—');
        if ($x['eta'] !== $y['eta']) $u[] = "ETA " . ($x['eta'] ?: '—') . ' → ' . ($y['eta'] ?: '—');
        if (abs($x['real'] - $y['real']) > 0.0005) $u[] = "real {$mt($x['real'])} → {$mt($y['real'])} MT";
        if ($x['tiba'] !== $y['tiba']) $u[] = $y['tiba'] ? 'ditandai TIBA' : 'tanda tiba dicabut';
        if ($u) $baris[] = "Lot $k: " . implode(', ', $u);
    }
    foreach (array_unique(array_merge(array_keys($a['uc']), array_keys($b['uc']))) as $k) {
        $x = $a['uc'][$k]['mt'] ?? null; $y = $b['uc'][$k]['mt'] ?? null;
        if ($x === null) $baris[] = "$k: {$mt($y)} MT ditambahkan";
        elseif ($y === null) $baris[] = "$k: {$mt($x)} MT dihapus";
        elseif (abs($x - $y) > 0.0005) $baris[] = "$k: {$mt($x)} → {$mt($y)} MT";
    }
    foreach (array_unique(array_merge(array_keys($a['stats']), array_keys($b['stats']))) as $p) {
        $x = $a['stats'][$p] ?? 0; $y = $b['stats'][$p] ?? 0;
        if (abs($x - $y) > 0.0005) $baris[] = "Utilisasi $p (stats) {$mt($x)} → {$mt($y)} MT";
    }
    foreach (array_unique(array_merge(array_keys($a['siklus']), array_keys($b['siklus']))) as $k) {
        $x = $a['siklus'][$k] ?? null; $y = $b['siklus'][$k] ?? null;
        if (!$x) { $baris[] = "Siklus $k dibuat" . ($y['mt'] !== '' ? " ({$y['mt']} MT)" : ''); continue; }
        if (!$y) { $baris[] = "Siklus $k dihapus"; continue; }
        $u = [];
        foreach (['mt' => 'MT', 'pertek' => 'PERTEK', 'spi' => 'SPI', 'rilis' => 'tgl terbit'] as $f => $label) {
            if ($x[$f] !== $y[$f]) $u[] = "$label " . ($x[$f] ?: '—') . ' → ' . ($y[$f] ?: '—');
        }
        if ($u) $baris[] = "Siklus $k: " . implode(', ', $u);
        elseif ($x['status'] !== $y['status']) $baris[] = "Siklus $k: status → " . mb_strimwidth($y['status'], 0, 90, '…');
    }
    foreach ($b['status'] as $f => $v) {
        $lama = $a['status'][$f] ?? '';
        if ($lama !== $v) $baris[] = "$f: " . mb_strimwidth($v !== '' ? $v : '(dikosongkan)', 0, 90, '…');
    }
    $dReal = $b['realBaris'] - $a['realBaris'];
    $dRealMt = $b['realMentah'] - $a['realMentah'];
    if ($dReal !== 0 || abs($dRealMt) > 0.0005) {
        $baris[] = ($dReal >= 0 ? "Realisasi +$dReal baris" : 'Realisasi ' . $dReal . ' baris') . " ({$mt($dRealMt)} MT)";
    }

    // ── Dampak pada angka dashboard ────────────────────────────────────────
    $dampak = [];
    $x = $a['dash']; $y = $b['dash'];
    if ($x && $y) {
        foreach (['obtained' => 'Obtained', 'used' => 'Used', 'sisa' => 'Sisa'] as $f => $label) {
            if (abs($x[$f] - $y[$f]) > 0.0005) $dampak[] = "$label {$mt($x[$f])} → {$mt($y[$f])} MT";
        }
        foreach (array_unique(array_merge(array_keys($x['usedProd']), array_keys($y['usedProd']))) as $p) {
            $u0 = $x['usedProd'][$p] ?? 0; $u1 = $y['usedProd'][$p] ?? 0;
            if (abs($u0 - $u1) > 0.0005) $dampak[] = "Used $p {$mt($u0)} → {$mt($u1)} MT (sisa {$mt($y['sisaProd'][$p] ?? 0)})";
        }
    }
    if (abs($b['realTerhitung'] - $a['realTerhitung']) > 0.0005) {
        $dampak[] = "Realisasi terhitung {$mt($a['realTerhitung'])} → {$mt($b['realTerhitung'])} MT";
    }

    // ── Pemeriksaan: input bertambah, angka dashboard tidak ikut ──────────
    $warn = [];
    if ($x && $y) {
        $jumlah = function (array $p, string $bagian, string $f) {
            $o = [];
            foreach ($p[$bagian] as $r) if ($r['primer']) $o[$r['produk']] = ($o[$r['produk']] ?? 0) + $r[$f];
            return $o;
        };
        $lot0 = $jumlah($a, 'lot', 'util'); $lot1 = $jumlah($b, 'lot', 'util');
        $uc0 = $jumlah($a, 'uc', 'mt');     $uc1 = $jumlah($b, 'uc', 'mt');
        $u0 = $x['usedProd']; $u1 = $y['usedProd'];
        $produk = array_unique(array_merge(array_keys($lot1), array_keys($uc1), array_keys($b['stats'])));
        foreach ($produk as $p) {
            $dIn = max(
                ($lot1[$p] ?? 0) - ($lot0[$p] ?? 0),
                ($uc1[$p] ?? 0) - ($uc0[$p] ?? 0),
                ($b['stats'][$p] ?? 0) - ($a['stats'][$p] ?? 0)
            );
            if ($dIn < 0.5) continue;
            $dOut = ($u1[$p] ?? 0) - ($u0[$p] ?? 0);
            if ($dOut >= $dIn - 0.5) continue;
            $sebab = [];
            foreach ($b['lot'] as $k => $l) {
                if ($l['produk'] !== $p || !$l['primer']) continue;
                $lama = $a['lot'][$k]['util'] ?? 0;
                if ($l['util'] - $lama < 0.5) continue;
                $h = iq_util_day_key($l['tgl']);
                if ($h === null) $sebab[] = "lot $k belum diberi tanggal utilisasi";
                elseif (isset($b['masterAkhir'][$p]) && $h <= $b['masterAkhir'][$p]) $sebab[] = "tanggal lot $k tidak lebih baru dari utilisasi master terakhir ({$b['masterAkhir'][$p]}) — dianggap rincian yang sama";
            }
            $obtP = ($y['usedProd'][$p] ?? 0) + ($y['sisaProd'][$p] ?? 0);
            if (!$sebab && ($u1[$p] ?? 0) + ($dIn - $dOut) > $obtP + 0.5) {
                $sebab[] = "melebihi obtained $p di dashboard ({$mt($obtP)} MT) — cek apakah kuota Re-Apply-nya sudah tercatat terbit";
            }
            $warn[] = "Input pemakaian $p bertambah {$mt($dIn)} MT, tapi Used di dashboard hanya naik {$mt(max(0, $dOut))} MT"
                . ($sebab ? ': ' . implode('; ', $sebab) : '');
        }
    }
    $dTerhitung = $b['realTerhitung'] - $a['realTerhitung'];
    if ($dRealMt > 0.5 && $dTerhitung < $dRealMt - 0.5) {
        $warn[] = "Realisasi bertambah {$mt($dRealMt)} MT di sheet, tapi yang terhitung hanya {$mt(max(0, $dTerhitung))} MT — kemungkinan PIB + nomor baris sama dengan baris lama (dobel tidak dihitung). Pakai tombol Edit di Existing Records.";
    }

    $status = $warn ? 'warning' : (($baris || $dampak) ? 'ok' : 'nochange');
    return [$status, $baris, $dampak, $warn];
}

function iq_akt_pastikan_tab(GoogleSheets $gs, string $sid): void {
    if (isset($gs->sheetMeta($sid)[IQ_AKT_TAB])) return;
    $gs->batchUpdate($sid, [['addSheet' => ['properties' => ['title' => IQ_AKT_TAB, 'gridProperties' => ['columnCount' => count(IQ_AKT_KOLOM)]]]]]);
    $gs->updateRange($sid, IQ_AKT_TAB . '!A1', [IQ_AKT_KOLOM]);
}

/**
 * Pasang pencatat untuk satu permintaan tulis. Dipanggil dari api.php SEBELUM
 * cabang penulisan berjalan. Tidak pernah melempar.
 */
function iq_akt_mulai(GoogleSheets $gs, string $sid, string $method, array $parts): void {
    try {
        $body = json_body();
        $rute = iq_akt_rute($method, $parts, $body, function (int $id) use ($gs, $sid) {
            foreach ($gs->table($sid, 'realizations')['rows'] as $r) {
                if ((int) ($r['id'] ?? 0) === $id) return (string) ($r['company_code'] ?? '');
            }
            return '';
        });
        if (!$rute || $rute[1] === '') return;
        [$aksi, $code] = $rute;
        [$t0, $p0] = iq_akt_muat($gs, $sid);
        $sebelum = iq_akt_potret($t0, $p0, $code);
        $u = function_exists('sc_user') ? (sc_user() ?: []) : [];
        $peran = (string) ($body['updatedBy'] ?? $body['importedBy'] ?? $body['editedBy'] ?? '');

        register_shutdown_function(function () use ($gs, $sid, $aksi, $code, $sebelum, $u, $peran) {
            try {
                if (http_response_code() >= 400) return;           // penulisan ditolak — tidak ada yang tersimpan
                if (function_exists('fastcgi_finish_request')) fastcgi_finish_request();
                elseif (function_exists('litespeed_finish_request')) litespeed_finish_request();
                ignore_user_abort(true);
                @set_time_limit(60);

                $gs->cacheClear();
                [$t1, $p1] = iq_akt_muat($gs, $sid);
                $sesudah = iq_akt_potret($t1, $p1, $code);
                [$status, $ringkas, $dampak, $warn] = iq_akt_banding($sebelum, $sesudah);
                // Payload segar sekalian dipakai sebagai memo /api/data berikutnya.
                if (function_exists('iq_payload_memo_file')) @file_put_contents(iq_payload_memo_file(), json_encode($p1));

                iq_akt_pastikan_tab($gs, $sid);
                $gs->appendAssoc($sid, IQ_AKT_TAB, [
                    'at'           => gmdate('Y-m-d\TH:i:s\Z'),
                    'email'        => (string) ($u['email'] ?? ''),
                    'nama'         => (string) ($u['name'] ?? ''),
                    'peran'        => $peran,
                    'aksi'         => $aksi,
                    'company_code' => $code,
                    'status'       => $status,
                    'ringkasan'    => mb_strimwidth(implode(' · ', $ringkas), 0, 1500, '…'),
                    'dampak'       => mb_strimwidth(implode(' · ', $dampak), 0, 800, '…'),
                    'detail'       => mb_strimwidth(json_encode(['ringkas' => $ringkas, 'dampak' => $dampak, 'peringatan' => $warn], JSON_UNESCAPED_UNICODE), 0, 45000, ''),
                ]);
            } catch (\Throwable $e) {
                error_log('iq activity log: ' . $e->getMessage());
            }
        });
    } catch (\Throwable $e) {
        error_log('iq activity log (mulai): ' . $e->getMessage());
    }
}

/** GET /api/activity — entri terbaru dulu. ?company= ?since=ISO ?mine=1 ?limit= */
function iq_akt_daftar(GoogleSheets $gs, string $sid, array $q): array {
    if (!isset($gs->sheetMeta($sid)[IQ_AKT_TAB])) return [];
    $rows = $gs->table($sid, IQ_AKT_TAB)['rows'];
    $email = '';
    if (!empty($q['mine']) && function_exists('sc_user')) $email = (string) ((sc_user() ?: [])['email'] ?? '');
    $out = [];
    for ($i = count($rows) - 1; $i >= 0; $i--) {
        $r = $rows[$i];
        if (!empty($q['company']) && (string) ($r['company_code'] ?? '') !== (string) $q['company']) continue;
        if (!empty($q['since']) && (string) ($r['at'] ?? '') < (string) $q['since']) continue;
        if ($email !== '' && (string) ($r['email'] ?? '') !== $email) continue;
        $d = json_decode((string) ($r['detail'] ?? ''), true);
        $out[] = [
            'at' => (string) ($r['at'] ?? ''), 'email' => (string) ($r['email'] ?? ''), 'nama' => (string) ($r['nama'] ?? ''),
            'peran' => (string) ($r['peran'] ?? ''), 'aksi' => (string) ($r['aksi'] ?? ''),
            'company' => (string) ($r['company_code'] ?? ''), 'status' => (string) ($r['status'] ?? ''),
            'ringkas' => is_array($d['ringkas'] ?? null) ? $d['ringkas'] : array_filter([(string) ($r['ringkasan'] ?? '')]),
            'dampak' => is_array($d['dampak'] ?? null) ? $d['dampak'] : array_filter([(string) ($r['dampak'] ?? '')]),
            'peringatan' => is_array($d['peringatan'] ?? null) ? $d['peringatan'] : [],
        ];
        if (count($out) >= max(1, min(500, (int) ($q['limit'] ?? 200)))) break;
    }
    return $out;
}
