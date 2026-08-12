# [iqdash-audit-live-3-celah-terakhir] 2026-08-12 — audit dashboard live, 3 celah terakhir ditutup

- **Tanggal:** 2026-08-12
- **Oleh:** Claude Code
- **Pemicu:** instruksi tegas — *"pastikan ANGKA SAMA DAN TIDAK ADA LAGI
  PERBEDAAN DIDALAM SATU HALAMAN YANG SAMA, baik pada saat di filter atau tidak
  di filter."*

Dua commit sebelumnya diverifikasi hanya pada H1 2026. Audit kali ini dijalankan
di **dashboard live** atas **13 periode × 9 permukaan**, dan menemukan tiga
celah yang lolos dari verifikasi H1.

## Celah 1 — badge chart tertinggal (kelas bug BARU)

Q4 2026 tidak punya saldo sama sekali. Chart menulis *"No company still holds an
available balance in the selected period"* sementara **badge di sebelahnya masih
memampang "Available: 11.178 MT"** dari periode sebelumnya. Dua pernyataan yang
bertentangan, berdampingan, di satu kartu yang sama.

Ini **bukan salah hitung** — semua angkanya benar. Ini **render tertinggal**:
badge diperbarui SESUDAH `if (rows.length === 0) … return`, jadi jalur kosong
tidak pernah menyentuhnya.

Kelas bug ini luput dari seluruh rangkaian perbaikan sebelumnya karena semua
pemeriksaan sebelumnya memakai periode yang ADA ISINYA. Pelajarannya: setiap
permukaan yang bisa keluar lebih awal harus **menulis keadaan kosongnya dulu**,
bukan membiarkan sisa render sebelumnya.

## Celah 2 — baris PENDING selalu "—" di kolom Available

Potongan terakhir ketidaksesuaian SNSD. Commit kedua sudah membuat barisnya
menampilkan Obtained 120 MT, tapi `mkAvqCell()` mencetak strip untuk **setiap**
baris PENDING berapa pun saldonya — sementara kartu dan halaman Available Quota
menghitung 120 MT itu. Strip kini hanya untuk yang memang bersaldo nol.

## Celah 3 — gerbang periode tidak berlaku di tabel All Companies

Filter **"2025 saja"**: kolom Available tabel All Companies menjumlah **5.633
MT** sementara kartu menyebut **853**. Company yang kuotanya baru terbit di 2026
memamerkan saldo penuhnya di jendela 2025 — padahal *saldo tidak bisa ada
sebelum kuota yang melahirkannya* (aturan 2026-08-05).

Dua fungsi baru di `02-period-filter.js`:

- `availablePoolCodes()` — himpunan kode company di kolam Available periode ini
- `availableInPeriod(co, codes)` — saldo company, atau 0 bila di luar kolam

Dipakai tabel All Companies (baris company, sub-baris produk, baris PENDING) dan
drawer. Kolam dihitung **sekali per render**, bukan per baris.

**Sengaja TIDAK di-cache.** Kolamnya berubah bukan cuma saat periode berubah,
tapi juga tiap kali data diedit — cache di sini hanya menukar satu kelas bug
dengan kelas lain, yaitu persis celah 1 di atas. Dengan ~40 company biayanya
tidak terukur.

Drawer memberi keterangan saat saldo di-nol-kan gerbang: *"0 pada 01 Jan – 30
Jun 2026; 120 MT sepanjang waktu"* — supaya tidak terbaca seperti data hilang.

## Verifikasi di dashboard live

Sembilan permukaan diukur dari DOM yang **benar-benar dirender**: kartu
Overview · modal detail · kartu halaman AVQ · badge chart · grid By Product ·
jumlah manual kolom tabel · baris TOTAL tabel · kolom tabel All Companies ·
`reportAvailableTotal()`.

| Periode | Nilai (9 permukaan) | Sama? |
|---|---:|---|
| All Time | 11.178 | ✔ |
| H1 2026 | **11.058** | ✔ |
| Q1 / Q2 / Q3 2026 | 5.180 / 6.278 / 6.345 | ✔ |
| Q4 2026 (kosong) | 0 | ✔ |
| Jan / Jun / Aug 2026 | 200 / 5.825 / 120 | ✔ |
| 2025 saja | 853 | ✔ |
| YTD | 11.178 | ✔ |
| Rentang 1 hari | 5.825 | ✔ |
| 2024 (kosong) | 0 | ✔ |

**13 periode, tidak ada satu pun selisih.**

Uji ketahanan tambahan — 9 kali pindah periode bolak-balik
(H1 → Q4 → H1 → All → Q4 → Jan → All → 2024 → H1), semuanya konsisten. Filter
pill produk di chart juga diuji: badge mengikuti pill yang dipilih (AS STEEL →
705 MT), turun ke 0 saat pindah ke periode kosong, dan kembali 11.178 saat
kembali ke All Time + pill All.

## Tes

`test_avq_single_source.cjs` naik ke **103 assertion**:

- Σ `availableInPeriod()` atas SELURUH company = angka kartu, di lima periode
  termasuk yang kosong — inilah yang menjamin tabel All Companies (yang
  mendaftar semua company) tidak bisa berbeda dari kartu
- SNSD: 0 di H1, 120 di All Time, dan saldo all-time-nya tidak ikut berubah
- badge wajib ditulis SEBELUM cabang kosong, dan cabang itu wajib menulis 0
- baris PENDING tidak boleh otomatis strip tanpa melihat saldo

**28 suite lulus, 0 gagal.**
