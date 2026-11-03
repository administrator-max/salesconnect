<?php
/* CEK FORMAT INPUT PS — dijalankan SEBELUM PS disimpan (POST /api/cek-input).

   Dibuat 03-Nov-2026 atas permintaan Pak Jeri sesudah laporan Oktober harus
   ditarik ulang berkali-kali. Audit 175 PS 2026 menemukan pola yang sama
   berulang: PS masuk sesudah bulannya tutup, nama project ditulis beda di tiap
   leg ("…-NIM" vs "… - NIM (Okaya)"), leg ke customer luar tanpa tabel barang,
   barang tanpa berat, PS dobel (Hanwa 02 Phase 1), tahun kirim salah ("Del.
   October 2025" di PS Juli 2026), ejaan customer ganda (Mlion Intl/International).
   Semua itu dulu tersimpan diam-diam dan baru ketahuan di laporan.

   Dua tingkat:
     'blok' — angka PASTI salah kalau disimpan (revenue/volume jadi 0, bulan
              salah). Tombol simpan dikunci sampai file-nya dibetulkan.
     'cek'  — kemungkinan salah; pengunggah harus membaca & mengonfirmasi.
   Hanya membaca — tidak menulis apa pun. */

require_once __DIR__ . '/salespulse_util.php';
require_once __DIR__ . '/consolidation.php';

const SP_CI_BULAN = ['January','February','March','April','May','June','July','August','September','October','November','December'];

/** Nama bulan Indonesia / singkatan -> nama Inggris lengkap (format baku nama project). */
function sp_ci_bulan_en(string $w): ?string {
    static $peta = null;
    if ($peta === null) {
        $peta = [];
        $varian = [
            ['jan','januari','january'], ['feb','februari','february','pebruari'], ['mar','maret','march'],
            ['apr','april'], ['mei','may'], ['jun','juni','june'], ['jul','juli','july'],
            ['agu','agt','agus','agustus','aug','august'], ['sep','sept','september'],
            ['okt','oct','oktober','october'], ['nov','nop','nopember','november'], ['des','dec','desember','december'],
        ];
        foreach ($varian as $i => $vs) foreach ($vs as $v) $peta[$v] = SP_CI_BULAN[$i];
    }
    return $peta[strtolower(rtrim($w, '.'))] ?? null;
}

/** Rapikan nama project ke format baku tanpa mengubah isinya:
    spasi ganda, pemisah " - " yang menempel ("2026 -NIM"), "Del" tanpa titik,
    dan nama bulan Indonesia/singkatan -> Inggris lengkap. */
function sp_ci_rapikan_nama(string $n): string {
    $n = trim(preg_replace('/\s+/u', ' ', $n));
    // Pemisah: tanda hubung yang berspasi di salah satu sisinya -> " - " (kode "SSP#48B" / "GL-AZ" tidak tersentuh).
    $n = preg_replace('/\s+-\s*|\s*-\s+/u', ' - ', $n);
    $n = preg_replace_callback('/\bDel\b\.?\s*([A-Za-z]+\.?)?\s*(\d{4})?/i', function ($m) {
        $bln = isset($m[1]) && $m[1] !== '' ? (sp_ci_bulan_en($m[1]) ?? $m[1]) : '';
        return trim('Del. ' . $bln . (isset($m[2]) && $m[2] !== '' ? ' ' . $m[2] : ''));
    }, $n);
    return $n;
}

/** Pola baku: "[Supplier No] - Del. [Month] [Tahun] - [Customer]". */
function sp_ci_format_baku(string $n): ?array {
    $bln = implode('|', SP_CI_BULAN);
    if (!preg_match('/^(\S.*?) - Del\. (' . $bln . ') (20\d\d) - (\S.*)$/', $n, $m)) return null;
    return ['kode' => $m[1], 'bulan' => array_search($m[2], SP_CI_BULAN, true), 'tahun' => (int) $m[3], 'customer' => $m[4]];
}

/** Kunci kode project ("Arsen 69A", "Hanwa 02") untuk mencari leg lain satu transaksi. */
function sp_ci_kode(string $n): string {
    return strtolower(trim(explode(' - ', sp_ci_rapikan_nama($n))[0]));
}

/** Nomor phase dalam nama ("… Phase 2") — beda phase = beda transaksi, bukan beda tulisan. */
function sp_ci_phase(string $n): string {
    return preg_match('/\bphase\s*(\d+)/i', $n, $m) ? $m[1] : '';
}

/** Batas input: hari kerja ke-3 (Senin–Jumat) bulan berikutnya, 23:59. */
function sp_ci_batas_input(int $tahun, int $bulanIdx): DateTimeImmutable {
    $d = (new DateTimeImmutable(sprintf('%04d-%02d-01', $tahun, $bulanIdx + 1)))->modify('first day of next month');
    $kerja = 0;
    while (true) {
        if ((int) $d->format('N') <= 5 && ++$kerja === 3) break;
        $d = $d->modify('+1 day');
    }
    return $d->setTime(23, 59, 59);
}

function sp_ci_kg(array $items): float {
    $kg = 0.0;
    foreach ($items as $it) $kg += sp_num($it['totalWeight'] ?? $it['total_weight_kg'] ?? null);
    return $kg;
}

/**
 * @param array  $payloads   [{header:{psNumber, projectName, customerName, poDate, baseCurrency, fxRate…}, items:[…]}]
 * @param array  $headersAll baris tab ps_headers
 * @param array  $itemsAll   baris tab ps_items
 * @param array  $aliasRows  baris tab product_aliases
 * @param string $hariIni    'Y-m-d' (untuk uji); default hari ini
 * @return array {masalah:[{ps, level, jenis, pesan}], saran:{ps:{projectName?, customerName?}}}
 */
function sp_cek_input(array $payloads, array $headersAll, array $itemsAll, array $aliasRows, ?string $hariIni = null): array {
    $hari = new DateTimeImmutable($hariIni ?? date('Y-m-d'));
    $kgDb = [];
    foreach ($itemsAll as $it) {
        $k = (string) ($it['ps_number'] ?? '');
        $kgDb[$k] = ($kgDb[$k] ?? 0.0) + sp_num($it['total_weight_kg'] ?? null);
    }
    $psBatch = [];
    foreach ($payloads as $p) $psBatch[(string) ($p['header']['psNumber'] ?? '')] = true;

    /* Pembanding = PS lain di database (kecuali yang akan ditimpa batch ini) + PS lain dalam batch. */
    $lain = [];
    foreach ($headersAll as $h) {
        $ps = (string) ($h['ps_number'] ?? '');
        if (isset($psBatch[$ps])) continue;
        $lain[] = ['ps' => $ps, 'nama' => (string) ($h['project_name'] ?? ''), 'customer' => (string) ($h['customer_name'] ?? ''),
                   'kg' => $kgDb[$ps] ?? 0.0, 'tahun' => (int) ($h['dashboard_year'] ?? 0), 'db' => true];
    }
    foreach ($payloads as $p) {
        $h = $p['header'] ?? [];
        $lain[] = ['ps' => (string) ($h['psNumber'] ?? ''), 'nama' => (string) ($h['projectName'] ?? ''), 'customer' => (string) ($h['customerName'] ?? ''),
                   'kg' => sp_ci_kg($p['items'] ?? []), 'tahun' => 0, 'db' => false];
    }
    // Ejaan customer yang sudah dipakai: kunci -> [ejaan => jumlah]
    $ejaan = [];
    foreach ($headersAll as $h) {
        $c = trim((string) ($h['customer_name'] ?? ''));
        if ($c !== '') $ejaan[sp_customer_key($c)][$c] = ($ejaan[sp_customer_key($c)][$c] ?? 0) + 1;
    }

    $masalah = []; $saran = [];
    $tambah = function (string $ps, string $level, string $jenis, string $pesan) use (&$masalah) {
        $masalah[] = ['ps' => $ps, 'level' => $level, 'jenis' => $jenis, 'pesan' => $pesan];
    };

    foreach ($payloads as $p) {
        $h = $p['header'] ?? [];
        $items = is_array($p['items'] ?? null) ? $p['items'] : [];
        $ps = trim((string) ($h['psNumber'] ?? ''));
        $nama = (string) ($h['projectName'] ?? '');
        $cust = trim((string) ($h['customerName'] ?? ''));
        $kg = sp_ci_kg($items);
        $luar = $cust !== '' && !sp_is_internal_company($cust);

        // ── BLOK ──────────────────────────────────────────────────────────
        if (trim($nama) === '') $tambah($ps, 'blok', 'Nama project kosong', 'Kolom Project Name di file PS kosong.');
        $po = sp_parse_project_sheet_date($h['poDate'] ?? null);
        if ($po['date'] === null) $tambah($ps, 'blok', 'PO Date tidak terbaca', 'Isi PO Date dengan format tanggal (dd/mm/yyyy). Bulan laporan ditentukan dari PO Date.');
        $tanpaBerat = [];
        foreach ($items as $it) if (sp_num($it['totalWeight'] ?? null) <= 0) $tanpaBerat[] = $it['no'] ?? '?';
        if ($tanpaBerat) $tambah($ps, 'blok', 'Barang tanpa berat', 'Baris barang no. ' . implode(', ', array_slice($tanpaBerat, 0, 10)) . (count($tanpaBerat) > 10 ? ' …' : '') . ' tidak punya Total Weight (kg). Volume (MT) dihitung dari kolom ini.');
        if ($luar && (!$items || $kg <= 0)) {
            $tambah($ps, 'blok', 'Tabel barang kosong', "PS ini penjualan ke customer luar ($cust) tapi tabel barangnya kosong. Kalau disimpan, revenue, volume (MT) dan produknya = 0.");
        } elseif (!$items) {
            // Leg internal tanpa barang boleh, asal ada leg lain satu transaksi yang membawa barang.
            $kode = sp_ci_kode($nama); $adaBarang = false;
            foreach ($lain as $o) if ($o['ps'] !== $ps && sp_ci_kode($o['nama']) === $kode && $o['kg'] > 0) { $adaBarang = true; break; }
            if (!$adaBarang) $tambah($ps, 'cek', 'Tabel barang kosong', 'PS ini tanpa tabel barang, dan belum ada leg lain dengan kode project yang sama yang membawa barang. Pastikan leg ke customer akhir diupload lengkap dengan barang.');
        }

        // ── NAMA PROJECT ──────────────────────────────────────────────────
        $rapi = sp_ci_rapikan_nama($nama);
        $baku = sp_ci_format_baku($rapi);
        if ($nama !== '' && !sp_ci_format_baku($nama)) {
            if ($baku) {
                $tambah($ps, 'cek', 'Format nama project', "Ditulis \"$nama\". Format baku: \"$rapi\".");
                $saran[$ps]['projectName'] = $rapi;
            } else {
                $tambah($ps, 'cek', 'Format nama project', "\"$nama\" tidak mengikuti format [Supplier No] - Del. [Month] [Tahun] - [Customer], mis. \"Arsen 69A - Del. December 2026 - NIM\".");
            }
        }
        if ($baku && $po['date'] !== null) {
            $poY = (int) substr($po['date'], 0, 4); $poM = (int) substr($po['date'], 5, 2) - 1;
            if ($baku['tahun'] * 12 + $baku['bulan'] < $poY * 12 + $poM) {
                $tambah($ps, 'cek', 'Bulan kirim sebelum PO', "Nama project menulis Del. " . SP_CI_BULAN[$baku['bulan']] . " {$baku['tahun']}, padahal PO Date {$h['poDate']}. Kemungkinan salah tahun/bulan.");
            }
        }

        // ── LEG LAIN SATU TRANSAKSI ───────────────────────────────────────
        $kode = sp_ci_kode($nama); $phase = sp_ci_phase($nama); $beda = [];
        foreach ($lain as $o) {
            if ($o['ps'] === $ps || $kode === '' || sp_ci_kode($o['nama']) !== $kode || sp_ci_phase($o['nama']) !== $phase) continue;
            if ($o['db'] && $o['tahun'] && $po['date'] !== null && abs($o['tahun'] - (int) substr($po['date'], 0, 4)) > 1) continue;
            // Pola induk paralel "… - A dan B" sengaja beda nama dengan leg anaknya (lihat customerSplit).
            if (preg_match('/\s+dan\s+/i', sp_end_customer_from_name($o['nama']) . ' ' . sp_end_customer_from_name($nama))) continue;
            if (sp_ci_rapikan_nama($o['nama']) !== $rapi) $beda[$o['nama']][] = $o['ps'];
        }
        foreach ($beda as $n2 => $pss) {
            $tambah($ps, 'cek', 'Nama beda dengan leg lain', "Leg lain (" . implode(', ', array_slice($pss, 0, 3)) . ") ditulis \"$n2\". Semua leg satu transaksi harus memakai nama yang sama persis.");
        }

        // ── DOBEL & VERSI LAMA ────────────────────────────────────────────
        $dasar = preg_replace('/[._]R\d+$/i', '', $ps);
        foreach ($lain as $o) {
            if (!$o['db'] || $o['ps'] === $ps) continue;
            $oDasar = preg_replace('/[._]R\d+$/i', '', $o['ps']);
            if ($oDasar === $dasar) {
                $tambah($ps, 'cek', 'Versi lain masih ada', "Versi {$o['ps']} masih tersimpan. Hapus versi lama supaya angkanya tidak terhitung dua kali.");
            } elseif ($kg > 0 && abs($o['kg'] - $kg) < 1.0 && sp_customer_key($o['customer']) === sp_customer_key($cust)
                      && strtolower(sp_ci_rapikan_nama($o['nama'])) === strtolower($rapi)) {
                $tambah($ps, 'cek', 'Dugaan PS dobel', "{$o['ps']} punya nama, customer dan berat yang sama (" . number_format($kg / 1000, 1, ',', '.') . " MT). Kalau PS ini pengganti, hapus {$o['ps']}.");
            }
        }

        // ── CUSTOMER ──────────────────────────────────────────────────────
        $ck = sp_customer_key($cust);
        if ($cust !== '' && isset($ejaan[$ck]) && !isset($ejaan[$ck][$cust])) {
            arsort($ejaan[$ck]);
            $pakai = array_key_first($ejaan[$ck]);
            $tambah($ps, 'cek', 'Ejaan customer', "Ditulis \"$cust\"; data sebelumnya memakai \"$pakai\".");
            $saran[$ps]['customerName'] = $pakai;
        }

        // ── TERLAMBAT ─────────────────────────────────────────────────────
        if ($po['date'] !== null) {
            $batas = sp_ci_batas_input((int) substr($po['date'], 0, 4), (int) substr($po['date'], 5, 2) - 1);
            if ($hari > $batas) {
                $bln = SP_CI_BULAN[(int) substr($po['date'], 5, 2) - 1] . ' ' . substr($po['date'], 0, 4);
                $tambah($ps, 'cek', 'Lewat batas input', "PO bulan $bln; batas input-nya " . $batas->format('d/m/Y') . ". Menyimpan PS ini mengubah angka $bln yang mungkin sudah dilaporkan — beri tahu penyusun laporan.");
            }
        }

        // ── LAIN-LAIN ─────────────────────────────────────────────────────
        if ($ps !== '' && !preg_match('/^PS[A-Z]\d{2}-[A-Z]{2,5}-\d{6}(\.R\d+)?$/', $ps)) {
            $tambah($ps, 'cek', 'Format nomor PS', "\"$ps\" tidak mengikuti format PSF26-XXX-000000 (revisi: .R1, .R2).");
        }
        if (sp_detect_product($nama, $items, $aliasRows) === null) {
            $tambah($ps, 'cek', 'Produk tidak dikenali', 'Produk tidak terbaca dari kode material maupun nama project. Nilainya akan masuk "(Produk Belum Diisi)".');
        }
        $cur = strtoupper((string) ($h['baseCurrency'] ?? 'IDR'));
        if ($cur !== 'IDR' && sp_num($h['fxRate'] ?? null) <= 1) {
            $tambah($ps, 'cek', 'Kurs belum diisi', "Mata uang $cur tapi kurs di file belum diisi; sistem memakai kurs default.");
        }
    }
    return ['masalah' => $masalah, 'saran' => (object) $saran];
}
