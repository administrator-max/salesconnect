# [fix-lot-utilisasi-baru-dibuang] 2026-08-10 — KAN: isian Sales yang benar-benar baru ikut terbuang

- **Tanggal:** 2026-08-10
- **Pemicu:** "yang KAN nya diisi sama tim saya gabisa, udah diisi ilang lagi".

## Bukan hilang — dibuang saat dihitung

Kali ini tanggalnya **tersimpan** (perbaikan sebelum ini bekerja):

```
KAN GI ALLOY  60 MT  07 August 2026   <- ada di sheet
```

Yang membuangnya aturan hitung, bukan penyimpanan.

KAN punya dua peristiwa pemakaian yang berbeda:

| sumber | MT | tanggal | keterangan |
|---|---|---|---|
| master `cycle_utilization` | 80 | 31/03/2026 | pemakaian atas SPI pertama |
| lot Sales | **60** | **07/08/2026** | atas kuota re-apply (Obtained #2, SPI 30/07/2026) |

Obtained 140 = 80 + 60, jadi terpakai 140 dan **sisa 0**. Yang tampil:
terpakai 80, sisa 60.

Sebabnya satu baris:

```php
if (isset($utilBaru[$c]) && $utilBaru[$c] > 0) continue;   // master sudah bicara
```

Begitu master menyebut utilisasi sebuah produk, **seluruh** lot Sales produk
itu dilewati. Maksudnya mencegah hitung ganda — akibatnya input yang
benar-benar baru ikut terbuang, tanpa jejak.

## Kenapa tidak dijumlahkan saja

Karena itu jauh lebih berbahaya, dan datanya membuktikan. Sapuan seluruh
pasangan master-vs-lot:

| | master | lot | |
|---|---|---|---|
| ADP GL ALLOY | 250 + **100** | **100** | lot = Utilization #2, peristiwa yang sama |
| HKG GL ALLOY | 750 + **250** | **250** | idem |
| JKT GL ALLOY | 300 + **100** | **100** | idem |
| IKM GI ALLOY | 2.300 | 2.000 | lot masih bagian dari yang 2.300 |
| **KAN GI ALLOY** | **80** | **60** | **peristiwa berbeda** |

Lot pada umumnya mencatat hal yang **sama** dengan master, cuma lebih rinci.
Menjumlahkan borongan akan melipatgandakan mereka — IKM jadi 4.300 dari
obtained 4.150.

Yang membedakan KAN: tanggal lotnya **sesudah seluruh baris master**. Master
terakhir tahu 31/03; tim mengisi 07/08. Itu pemakaian yang memang belum pernah
dilihat master.

## Aturan barunya

Lot ditambahkan hanya bila lolos **ketiganya**:

1. **bukan kembar** — produk, hari, dan MT sama persis (identitas yang bertahan
   saat master di-impor ulang);
2. **sesudah master** — tanggalnya melewati hari terakhir yang master tahu untuk
   produk itu. Master diam sama sekali = otomatis lolos (GKL GL ALLOY, IKM
   SEAMLESS PIPE) — mengisi kekosongan bukan membantah master;
3. **di bawah atap obtained** — memakai lebih banyak dari yang didapat itu
   mustahil, jadi ini pagar yang sah, bukan tebakan.

Diterapkan di **dua** sisi dengan aturan identik: `iq_sync_util_with_cycles()`
(PHP) dan `scopedUtilByProd()` (JS) — kalau berbeda, filter periode akan
berselisih lagi dengan Overview.

Penyeragaman tanggal lewat `iq_util_day_key()` / `_hari()`: master menulis
`31/03/2026`, form Sales menulis `07 August 2026`, cycle menulis `30-Jul-26`.
Tanpa itu dua catatan atas peristiwa yang sama tidak akan pernah dikenali sama.

## Hasil

| | sebelum | sesudah |
|---|---|---|
| KAN terpakai | 80 | **140** |
| KAN sisa | 60 | **0** |
| KAN di Available Quota | ya | **tidak lagi** |

ADP 350/0 · HKG 1.000/0 · IKM GI ALLOY tetap **2.300** (tidak terlipat) ·
GKL 3.000/0.

Total naik **335** MT: 60 dari KAN (perbaikan ini) dan 275 dari IKM SEAMLESS
PIPE — isian tim pukul 10:17 yang sekarang bertahan. Utilized 23.447 ->
**23.782**, available 11.513 -> **11.178**, pending 8.008,792 -> **8.343,792**.

Partisi utuh: H1 12.525 + H2 4.385 = 16.910 = setahun 23.782 − 6.872 (2025 ke
bawah). Kuartal berjumlah sama. Seluruh PT selaras antara total dan Σ per
produk.

Suite: 0 gagal (`tests/test_lot_utilisasi_baru.cjs` baru).

## Risiko sisa yang diketahui — perlu dibaca

**1. Yang menahan IKM adalah atap, sendirian.** Lot 2.000 itu bagian dari
master 2.300. Kalau tim memberinya tanggal sesudah 24/07/2026, syarat 1 dan 2
sama-sama lolos; yang menolaknya cuma atap (4.300 > obtained 4.150). Bila
obtained IKM suatu saat naik di atas 4.300, perlindungan itu hilang dan 2.000
MT akan terhitung dua kali. Uji regresi mencatat perilaku ini apa adanya.

Akar soalnya struktural: master dan lot menyimpan peristiwa yang sama tanpa
penanda apa pun yang mengaitkan keduanya. Selama itu belum ada, sistem hanya
bisa **menebak** mana yang kembar. Perbaikan sebenarnya: beri lot penanda
siklus utilisasi mana yang ia catat.

**2. CGK terpakai 1.020 dari obtained 800.** Bukan akibat perubahan ini — CGK
tidak punya lot ber-MT sama sekali; angka itu datang dari master
(Utilization #1 800 + #2 220) sementara obtained masih 800. Kemungkinan besar
Obtained #2 belum tercatat di master. Perlu dirapikan tim.
