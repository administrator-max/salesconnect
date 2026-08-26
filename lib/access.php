<?php
/**
 * SalesConnect — DAFTAR ORANG & HAK AKSES DASHBOARD.
 *
 * Ini satu-satunya tempat untuk menambah/menghapus orang atau mengubah siapa
 * boleh membuka dashboard yang mana. Tidak ada rahasia di file ini (hanya nama
 * + email), jadi ia ikut di-commit dan ikut ter-deploy oleh deploy.sh —
 * berbeda dengan config.php yang harus diedit manual di server.
 *
 * Cara menambah orang:
 *   1. Tambahkan barisnya di 'people' (kunci bebas, huruf kecil, unik).
 *   2. Tambahkan kunci itu ke setiap tool di 'access' yang boleh ia buka.
 *   3. Commit + ./deploy.sh   (tidak perlu menyentuh config.php)
 *
 * Email dibandingkan case-insensitive; sc_access() sudah me-lowercase-kan.
 * Orang yang tidak terdaftar di sini TIDAK BISA login sama sekali — halaman
 * login sengaja tetap menjawab "kode sudah dikirim" agar tidak membocorkan
 * email mana yang terdaftar.
 */
return [

    // ── Orang ────────────────────────────────────────────────────────────
    // 'admin' => true hanya menambah akses ke halaman diagnostik (diag.php);
    // ia TIDAK memberi akses tool di luar daftar 'access' di bawah.
    'people' => [
        'david'  => ['name' => 'David',   'email' => 'davidadi.nugroho@gunungprisma.com'],
        'luzy'   => ['name' => 'Luzy',    'email' => 'luzya.rahmadilla@gunungprisma.com'],
        'anne'   => ['name' => 'Anne',    'email' => 'june.anneble@gunungprisma.com'],
        'jeri'   => ['name' => 'Ko Jeri', 'email' => 'jeri@gunungprisma.com'],
        'irma'   => ['name' => 'Irma',    'email' => 'irma.chairani@selarasprisma.com'],
        'angely' => ['name' => 'Angely',  'email' => 'angely.setiawan@gunungprisma.com'],
        'putri'  => ['name' => 'Putri',   'email' => 'putri.aulia@gunungprisma.com'],
        'jeany'  => ['name' => 'Jeany',   'email' => 'operations2@gunungprisma.com'],
        'maya'   => ['name' => 'Maya',    'email' => 'maya.ristiana@gunungprisma.com'],
        'aldi'   => ['name' => 'Aldi',    'email' => 'aldi.pratantio@gunungcapital.com',   'admin' => true],
        'ridwan' => ['name' => 'Ridwan',  'email' => 'ridwan.abdillah@gunungcapital.com',  'admin' => true],
        'trian'  => ['name' => 'Trian',   'email' => 'komangtrian.mp@gunungcapital.com'],
    ],

    // ── Hak akses per dashboard ──────────────────────────────────────────
    // Kunci = nama folder modul. Nilai = daftar kunci orang di atas.
    // Sesuai arahan Direktur (26 Agustus 2026).
    'access' => [
        // Client Interaction Log & Task Flow — tim sales inti
        'cil'      => ['david', 'luzy', 'anne', 'jeri', 'aldi', 'ridwan', 'trian'],
        'taskflow' => ['david', 'luzy', 'anne', 'jeri', 'aldi', 'ridwan', 'trian'],

        // Cost Core, Sales Pulse, IQ Dash — tim sales inti + Irma, Angely, Putri
        'costcore'   => ['david', 'luzy', 'anne', 'jeri', 'irma', 'angely', 'putri', 'aldi', 'ridwan', 'trian'],
        'salespulse' => ['david', 'luzy', 'anne', 'jeri', 'irma', 'angely', 'putri', 'aldi', 'ridwan', 'trian'],
        'iqdash'     => ['david', 'luzy', 'anne', 'jeri', 'irma', 'angely', 'putri', 'aldi', 'ridwan', 'trian'],

        // SCOT — tim sales inti + Irma, Angely, Jeany, Maya (TANPA Putri)
        'scot' => ['david', 'luzy', 'anne', 'jeri', 'irma', 'angely', 'jeany', 'maya', 'aldi', 'ridwan', 'trian'],
    ],

    // ── Label & deskripsi kartu di halaman depan ─────────────────────────
    'tools' => [
        'cil'        => ['icon' => '📇', 'title' => 'Client Interaction Log', 'href' => 'cil/',
                         'desc'  => 'Catat komunikasi &amp; complaint pelanggan untuk tim sales.'],
        'taskflow'   => ['icon' => '✅', 'title' => 'TaskFlow', 'href' => 'taskflow/',
                         'desc'  => 'Penugasan task antar staff dengan status &amp; deadline.'],
        'costcore'   => ['icon' => '🧮', 'title' => 'Cost Core', 'href' => 'costcore/',
                         'desc'  => 'Hitung costing produk baja (import &amp; domestic), simpan ke Sheet.'],
        'scot'       => ['icon' => '🚢', 'title' => 'Shipment Control Tower', 'href' => 'scot/',
                         'desc'  => 'Pantau shipment: BL, vessel, clearance, delivery &amp; alerts.'],
        'salespulse' => ['icon' => '📈', 'title' => 'Sales Pulse', 'href' => 'salespulse/',
                         'desc'  => 'Dashboard sales eksekutif: budget vs actual, margin, konsolidasi PS.'],
        'iqdash'     => ['icon' => '📊', 'title' => 'Import Quota Monitor', 'href' => 'iqdash/',
                         'desc'  => 'Steel import quota (PERTEK/SPI) lifecycle &amp; realization tracking.'],
    ],
];
