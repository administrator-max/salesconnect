# Available Quota — produk hilang saat filter Maret 2026

**Laporan tim:** dengan filter Maret 2026, GL Alloy dan HRPO Alloy tidak muncul
sama sekali di halaman Available Quota, padahal tampil di Februari dan saldonya
tidak berubah.

## Dua hal berbeda, keduanya nyata

**1 · Badge "Available: 0 MT" di sebelah kartu yang menjumlah 4.780**

Pill filter produk dijaga `!fwEl._built` — sekali dibangun, tidak pernah
diperbarui. Pill produk yang tidak ada di periode baru tetap terpampang, dan
`_active` yang menunjuk produk itu ikut bertahan. Begitu difilter ke Maret
sesudah sempat mengklik pill GL ALLOY, hasil saringannya kosong dan badge
menulis 0 — bertentangan dengan kartu di sebelahnya.

Kini pill dibangun ulang saat daftar produknya berubah (dikunci tanda tangan
daftar produk, bukan flag boolean), dan pilihan yang produknya sudah tidak ada
dikembalikan ke ALL. Badge Maret sekarang **4.780 MT**.

**2 · Saldo yang hilang tanpa jejak**

Kolam halaman ini menuntut dua syarat: perusahaan **beraktivitas di dalam
periode**, dan **kuotanya sudah terbit** s/d akhir periode.

Syarat kedua kausal dan benar — saldo tidak bisa ada sebelum kuota yang
melahirkannya (kasus SNSD). Syarat pertama adalah saringan **aktivitas** yang
dikenakan pada angka **saldo**, dan itulah yang membuat produk berkedip
hilang-muncul antar bulan tanpa saldonya berubah sepeser pun.

Maret 2026: CGK, GNG, MIN dan MJU memegang **1.053 MT** saldo berjalan
(GL ALLOY 500 · BORDES ALLOY 353 · HRPO ALLOY 200) tapi tidak punya satu pun
tanggal cycle di Maret, sehingga lenyap dari ketiga view.

Angka headline **sengaja tidak digeser** — definisinya sudah dicocokkan ke
master untuk H1 2026. Yang ditambahkan pengungkapan:
`availablePoolAsOfPeriod()` + `availableHiddenByActivity()` menghitung saldo
yang tidak ditampilkan, lalu menyatakannya di banner halaman dan sebagai kartu
bayangan opsional bertanda "di luar periode".

Saldo yang hilang tanpa jejak dibaca sebagai "tidak ada yang bisa dijual" —
kesalahan paling mahal di halaman ini.

## Verifikasi

- Maret 2026: kartu tetap 4.780 MT / 2 perusahaan; banner menyebut 1.053 MT
  tersembunyi di 4 perusahaan; kartu bayangan muncul saat diklik (5 → 8 kartu),
  dan kembali ke 5 saat ditutup
- Regresi 4 periode (tanpa filter · Feb · Mar · H1): kartu Available, AVQ kartu 1,
  badge, Σ baris AVQ, Σ per-produk → **nol selisih**
- `test_avq_saldo_tersembunyi.cjs` 18 assertion · 22 suite node lulus
