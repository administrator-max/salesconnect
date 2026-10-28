# SalesPulse: Riwayat Input — 2026-10-28

## Permintaan
David lupa apakah "Arsen 66 - Del. November 2026 - BJM" sudah diinput. Minta log/riwayat input
yang sederhana dan mudah dimengerti tim.

## Fitur
- Tombol "🕘 Riwayat Input" di Dashboard dan Executive Summary SalesPulse (assets/js/riwayat.js).
  Ketik nama project / nomor PS → banner hijau "Ditemukan N PS yang mengandung …" (dengan PS,
  PT → customer, PO, margin, tanggal diinput) atau merah "BELUM ADA di SalesPulse".
  Di bawahnya: riwayat siapa menginput apa & kapan.
- Server (salespulse_activity.php): Import Project Sheet (baru / update), hapus PS, simpan
  plan bulanan, import/hapus budget → dicatat ke tab `activity_log` (dibuat otomatis) sesudah
  jawaban terkirim; tidak bisa menggagalkan penyimpanan. GET /api/activity?q= mencari log +
  ps_headers (pencocokan tanpa spasi/tanda baca: "arsen66" = "Arsen 66").

## Temuan saat uji (koreksi jawaban sebelumnya)
Pencarian "arsen 66" menemukan Arsen 66A & 66B (Del. December 2026 - Hanwa ID, PT SPA & SNSD,
diinput 01-Okt). Pencarian saya sebelumnya memakai \b sehingga melewatkan akhiran A/B. PS
"Arsen 66 - Del. November 2026 - BJM" tetap tidak ada. Banner hijau sengaja mengingatkan
"Arsen 66A bukan Arsen 66".

## Uji
Pencarian ke data asli (baca saja): arsen 66 → 6 PS, arsen 68 → 1, Arsen67 → 10, bjm → 4.
Pratinjau UI (mock): banner ditemukan / belum ada / riwayat terbaru tampil benar.
