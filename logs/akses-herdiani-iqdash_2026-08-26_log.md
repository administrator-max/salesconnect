# akses-herdiani-iqdash — 2026-08-26

## Ringkasan
`herdiani@gunungprisma.com` ditambahkan dengan akses **IQ Dash saja**, atas
permintaan Aldi.

## Perubahan
- `lib/access.php` — orang baru `herdiani` (nama tampil "Herdiani"), dimasukkan
  ke daftar `iqdash`. Tidak ditandai admin.
- `tools/tests/auth_test.php` — jumlah orang 13 → 14, akses iqdash 11 → 12, plus
  dua pemeriksaan: Herdiani hanya memegang `iqdash`, dan bukan admin.

## Catatan
- **Nama tampilnya ditebak dari alamat email** ("Herdiani"), karena yang
  diberikan hanya emailnya. Nama ini muncul di pojok kanan atas halaman depan.
  Kalau ejaan resminya berbeda, ubah `'name'` di `lib/access.php` — tidak
  memengaruhi hak akses sama sekali.
- Tidak ada sesi yang perlu direset: sejak `hak-akses-seketika_2026-08-26`,
  hak akses dibaca ulang tiap permintaan, jadi akses ini langsung berlaku
  begitu ter-deploy.

## Verifikasi
- `php -l lib/access.php` bersih.
- `php tools/tests/auth_test.php` → **51 lulus, 0 gagal** (sebelumnya 49).
- Sesudah deploy: `/iqdash/` → 302 ke `login.php`, `/iqdash/api/data` → 401,
  tidak ada respons 500.
