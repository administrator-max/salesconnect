# Phase 1 — Read-only Neon↔Sheets reconciliation script

- **Tanggal:** 2026-07-21
- **Oleh:** Claude Code

## Ringkasan
Menambah `tools/reconcile_neon_sheets.js` — **READ-ONLY**; membaca Neon (CIL & TaskFlow) dan
Sheets, membangun ulang bentuk kanonik Neon memakai transform yang sama persis dengan
`migrate_neon_to_sheets.js`, lalu mendiff terhadap tab Sheets aktual. Menulis laporan ke
`reports/reconcile_<ts>.md`. Tidak pernah menulis ke Neon atau Sheets (pakai scope OAuth
`spreadsheets.readonly`). Ini reinterpretasi Phase 1: sinkron "Neon→Sheets" tak lagi benar karena
Sheets kini satu-satunya jalur tulis hidup — jadi ini sekadar konfirmasi Sheets ⊇ Neon.

## Perubahan
- `tools/reconcile_neon_sheets.js` (baru) — reconciler read-only + report generator.
- `tools/reconcile_test.js` (baru) — 7 unit test offline untuk logika diff.
- Tidak ada perubahan kode aplikasi; tidak ada tulisan DB.

## File yang disentuh
- `tools/reconcile_neon_sheets.js` (baru)
- `tools/reconcile_test.js` (baru)
- `logs/reconcile-script_2026-07-21_log.md` (log ini)

## Alasan
Deliverable Phase 1 (safe): verifikasi tak ada baris Neon yang hilang dari Sheets sebelum
menganggap Neon aman diarsipkan; menegakkan aturan "Sheets-only rows = keep & flag" (tak pernah
hapus).

## Verifikasi / uji
- `node --check tools/reconcile_neon_sheets.js` → OK.
- `node tools/reconcile_test.js` → **7 passed, 0 failed** (bucket equal/differ/neon-only/
  sheets-only; ketahanan reorder kolom; kolom hilang; composite key discussions; baris blank;
  tab hilang; rowKey bebas-collision).
- Belum dijalankan live (butuh host ber-jaringan; lihat instruksi di bawah).

## Cara jalan (di host ber-jaringan)
```
cd salesconnect
npm install pg          # bila belum
node tools/reconcile_neon_sheets.js            # -> reports/reconcile_<ts>.md
# opsi: --samples 50 (jumlah id contoh per bucket), --stdout (cetak report juga)
```
Perlu `../cil/.env`, `../taskflow/.env`, `secure/service_account.json`, dan kedua spreadsheet
di-share ke service account (read cukup).

## Sisa / risiko
- Jika report menampilkan **Neon-only** rows: itu tak terduga (Sheets seharusnya superset) →
  backfill insert-only butuh persetujuan; belum dibuat scriptnya.
- Baris "differs" = data diedit di Sheets setelah migrasi terakhir — normal; hanya diinformasikan.
