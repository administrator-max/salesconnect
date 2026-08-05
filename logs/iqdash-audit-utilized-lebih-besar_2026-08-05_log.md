# [iqdash-audit-utilized-lebih-besar] 2026-08-05 — Utilized > Obtained saat difilter: BENAR, plus audit menyeluruh

- **Tanggal:** 2026-08-05
- **Oleh:** Claude Code
- **Pemicu:** pimpinan menemukan filter 01 Jan – 05 Agu 2026 memberi Obtained
  21.140 tapi Utilized 21.500 — "seharusnya kan tidak begitu". Disertai
  permintaan mencari keanehan lain.

## Kesimpulan: angkanya benar, bukan bug

Utilisasi melampaui kuota yang **terbit** di jendela ini karena **kuota yang
terbit sebelumnya masih boleh dipakai di dalamnya**.

| Jendela | Obtained | Utilized |
|---|---|---|
| 2025 | 13.820 | 1.047 |
| 2026 | 21.140 | 21.500 |
| **Sepanjang waktu** | **34.960** | **22.547** |

Sepanjang 2025 terbit 13.820 MT tapi hanya 1.047 MT terpakai — **12.773 MT
terbawa ke 2026**. Di 2026 tersedia 21.140 (baru) + 12.773 (bawaan) = 33.913 MT
untuk dipakai; terpakai 21.500. Tidak ada yang berlebih.

Secara kumulatif utilisasi (22.547) tetap **jauh di bawah** obtained (34.960).
Dugaan pimpinan benar untuk angka kumulatif, tapi tidak berlaku di dalam satu
jendela — karena penerbitan dan pemakaian diiris terpisah.

Contoh konkret dari data:

| PT | Obtained | Tanggal utilisasi |
|---|---|---|
| EMS | #1 1.600 MT PERTEK **07/11/2025** · #2 500 MT 18/05/2026 | Sheet Pile **30/01/2026** · GI 20/05/2026 |
| KJK | #1 950 MT PERTEK **31/12/2025** · #2 450 MT 04/06/2026 | **25/06/2026** |
| HKG | #1 750 MT PERTEK **31/12/2025** · #2 250 MT 07/07/2026 | **08/07/2026** |

## Audit keanehan — hasil bersih

| Pemeriksaan | Hasil |
|---|---|
| PT memakai melebihi kuotanya (sepanjang waktu) | **nihil** |
| Saldo negatif | **nihil** |
| Per produk: utilisasi > obtained produk itu | **nihil** |
| Tanggal utilisasi gagal terbaca (diam-diam hilang) | **nihil** |
| Utilisasi tanpa tanggal sama sekali (0 di setiap periode) | **nihil** |

### Uji partisi — yang paling tajam

Periode yang dipecah harus berjumlah utuh. Kalau ada dobel hitung atau yang
bocor, di sinilah ketahuan.

| | Submitted | Obtained | Utilized | Realized |
|---|---|---|---|---|
| Setahun 2026 | 80.545 | 21.140 | 21.500 | 15.438,208 |
| H1 + H2 | 80.545 | 21.140 | 21.500 | 15.438,208 |
| Q1+Q2+Q3+Q4 | 80.545 | 21.140 | 21.500 | 15.438,208 |

**Keempatnya sama persis di ketiga cara pemecahan.** Obtained dan Utilized juga
terbelah rapi di batas tahun (13.820+21.140 = 34.960; 1.047+21.500 = 22.547).

## Yang diubah — keterangannya, bukan angkanya

Kartu **Total Utilized** menulis `101.7% of obtained allocated` tanpa
keterangan. Itulah yang membuatnya terbaca seperti error — angka di atas 100%
berdiri sendirian.

`03-kpis.js` — saat rasio > 100%, teksnya menjadi
**`101.7% — incl. carry-over quota`** disertai tooltip yang menjelaskan bahwa
kuota terbitan sebelumnya boleh dipakai di sini dan secara kumulatif tidak ada
kelebihan pakai. Di bawah 100% teksnya tidak berubah sama sekali.

Verifikasi live: 01 Jan – 05 Agu menampilkan teks baru + tooltip;
01 Jan – 30 Jun tetap `87.8% of obtained allocated` tanpa tooltip.

## Catatan jujur — keterbatasan yang tersisa

Master mencatat **satu** tanggal "Utilization (date)" per produk untuk angka
yang **kumulatif**. Kalau sebuah produk dipakai sebagian di 2025 dan sebagian di
2026, seluruhnya mendarat pada tanggal yang lebih akhir.

Gejalanya terlihat: sepanjang 2025 hanya **1.047 MT** tercatat terpakai padahal
13.820 MT terbit. Itu **bisa** memang benar (operasi baru ramai di 2026), tapi
bisa juga sebagian pemakaian 2025 tertulis bertanggal 2026.

Yang pasti: **totalnya tidak terpengaruh** — hanya pembagian antar periode yang
mungkin bergeser. Tidak bisa dipastikan dari sistem saja; perlu dicek ke master
apakah ada produk yang utilisasinya berlangsung lintas tahun.

Tidak diubah — mengubahnya berarti menebak tanggal yang tidak ada datanya.
