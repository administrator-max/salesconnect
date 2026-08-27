# akses-jeany-iqdash — 2026-08-26

## Ringkasan
`operations2@gunungprisma.com` (**Jeany**) diberi akses **IQ Dash**, atas
permintaan Aldi. Ia sudah terdaftar sebelumnya dengan akses SCOT saja, jadi ini
menambah modul ke orang yang sudah ada — bukan orang baru. Sekarang: SCOT +
IQ Dash. Jumlah orang terdaftar tetap 14; IQ Dash naik dari 12 ke 13.

## Perubahan
- `lib/access.php` — `jeany` ditambahkan ke daftar `iqdash`. Komentar kelompok
  dipisah: dulu satu baris menyebut "Cost Core, Sales Pulse, IQ Dash" punya
  daftar yang sama, padahal IQ Dash kini berbeda (ada Herdiani & Jeany).
  Komentar yang salah lebih berbahaya daripada tidak ada komentar.
- `tools/tests/auth_test.php` — jumlah iqdash 12 → 13; harapan untuk Jeany
  diganti dari `['scot']` jadi `['iqdash','scot']`; uji sesi Jeany diperbarui
  (boleh scot, boleh iqdash, tidak boleh cil, tidak boleh costcore).

## Catatan uji yang perlu diketahui
Blok uji "hak akses dibaca ulang tiap permintaan" memakai orang yang hanya
punya SATU modul, supaya modul lain jadi kontrol yang jelas saat salinan di
sesi dirusak. Dulu itu Jeany; karena ia sekarang punya dua modul, fixture-nya
**dipindah ke Maya** (masih SCOT saja). Isi ujinya tidak berubah, hanya
subjeknya. Kalau nanti Maya juga ditambah modul, fixture ini perlu dipindah
lagi — atau uji itu diam-diam kehilangan daya bedanya.

## Verifikasi
- `php -l lib/access.php` bersih.
- `php tools/tests/auth_test.php` → **52 lulus, 0 gagal** (sebelumnya 51).
- Sesudah deploy: `/iqdash/` → 302 ke `login.php`, `/iqdash/api/data` → 401,
  modul lain tidak terpengaruh, tidak ada respons 500.
- Tidak perlu reset sesi: sejak `hak-akses-seketika_2026-08-26`, hak akses
  dibaca ulang tiap permintaan. Kalau Jeany sedang membuka SCOT saat ini, IQ
  Dash langsung muncul di halaman depannya tanpa perlu keluar-masuk.
