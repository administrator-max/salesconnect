# Migrasi ulang data Neon → Google Sheets

- **Tanggal:** 2026-07-20
- **Oleh:** Claude Code

## Ringkasan
Menjalankan ulang `tools/migrate_neon_to_sheets.js` untuk menyalin seluruh data terkini dari kedua database Neon (CIL & TaskFlow) ke Google Sheets yang jadi DB SalesConnect. Setiap tab di-clear lalu ditulis ulang (idempotent).

## Perubahan
- Install dependency `pg` (belum ada di `node_modules`).
- Jalankan migrasi; kedua spreadsheet ditulis ulang dari Neon.

### Hasil baris tertulis
CIL (`1TYDed6FlNbDQDa1zrqQr989myZO9C50GJqdM1pIPIsg`):
- companies: 25
- salespeople: 9
- records: 57
- discussions: 257
- complaints: 1
- complaint_responses: 2

TaskFlow (`1U5J4T9jNcKji--VDpJOFkgs2VMLm6wLAtdr8mtL-164`):
- staff: 7
- tasks: 6

## File yang disentuh
- `package.json` / `package-lock.json` — menambah dependency `pg` (dev/tooling; hanya dipakai script migrasi, bukan runtime PHP).
- `node_modules/` — hasil `npm install pg` (tidak di-commit).
- Tidak ada perubahan kode aplikasi; hanya data di Google Sheets.

## Alasan
Menyamakan (refresh) data di Google Sheets dengan kondisi terkini di Neon, sesuai permintaan "update database dari neon yang sebelumnya".

## Verifikasi / uji
- Script keluar dengan `✅ Migration complete`; semua tab melaporkan jumlah baris (lihat di atas).
- Google auth OK via service account `salesconnect@eagle1-492706.iam.gserviceaccount.com`.
- Warning `pg` soal SSL mode (`require` → alias `verify-full`) muncul tapi non-fatal; koneksi berhasil.
- Verifikasi visual di app: reload `/cil/` dan `/taskflow/` (cache baca TTL 10s).

## Sisa / risiko
- Migrasi bersifat **replace penuh** per tab; perubahan yang dibuat langsung di Sheets setelah migrasi terakhir (jika ada) akan tertimpa oleh data Neon.
- `pg` menampilkan warning deprecation SSL untuk versi mayor mendatang — tidak berdampak sekarang; bila upgrade `pg` ≥9 nanti, sesuaikan `sslmode`.
- Belum ada verifikasi baris-per-baris di app UI (baru cek jumlah baris hasil tulis).
