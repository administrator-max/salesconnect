# akses-jessica-iqdash — 2026-09-14

## Ringkasan
`jessica.nathania@gunungprisma.com` (**Jessica**) ditambahkan ke **IQ Dash**.
Aksesnya sekarang tiga modul: CRM Projects · Sales Pulse · IQ Dash.

Bukan orang baru — terdaftar tetap 16. IQ Dash 14 → 15.

## Konteks permintaan
Permintaan sebelumnya di sesi yang sama ("berikan akses CRM Projects") ternyata
**sudah terpenuhi** sejak 11 September, jadi tidak ada perubahan yang dibuat
untuk itu. Yang diverifikasi waktu itu: berkas `lib/access.php` di server
diunduh dan dibandingkan dengan yang lokal — byte-identik, dan baris
`crmproject` memang sudah memuat `jessica`. Permintaan IQ Dash ini yang
benar-benar menghasilkan perubahan.

## Perubahan
- `lib/access.php` — `jessica` ditambahkan ke daftar `iqdash`. Tidak ditandai
  admin.
- `tools/tests/auth_test.php` — hitungan `iqdash` 14 → 15, dan harapan daftar
  modul Jessica diperbarui jadi `['crmproject', 'salespulse', 'iqdash']`.

## Catatan urutan
Urutan pada harapan uji **mengikuti urutan key di `'access'`**
(crmproject → cil → taskflow → costcore → salespulse → iqdash → scot), bukan
urutan penambahan. `sc_access()` membangun daftar tool per orang dengan
menelusuri `'access'` dari atas, jadi menuliskannya sesuai urutan kronologis
("salespulse, crmproject, iqdash") akan membuat uji gagal walau hak aksesnya
benar. Layak diingat saat menambah orang berikutnya.

## Verifikasi
- `php -l lib/access.php` bersih.
- `php tools/tests/auth_test.php` → **87 lulus, 0 gagal**.
- Sesudah deploy: `/iqdash/` → 302 ke `login.php`, `/iqdash/api/data` → 401,
  modul lain tidak terpengaruh, tanpa respons 500.
- Berkas di server dibandingkan ulang dengan yang lokal sesudah unggah —
  identik, jadi daftar yang berjalan di produksi memang yang terbaru.
- Tidak perlu keluar-masuk: hak akses dibaca ulang tiap permintaan, jadi kartu
  IQ Dash langsung muncul di halaman depan Jessica begitu di-refresh.
