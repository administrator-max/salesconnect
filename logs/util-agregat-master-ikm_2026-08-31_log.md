# Utilisasi IKM digelembungkan "baris master merangkum beberapa lot" — 31-Agu-2026

Dilaporkan tim: Available IKM GI Alloy seharusnya 1.550, bukan 1.250.
Utilisasi yang diinput Sales 2.000 + 300 + 300 = 2.600 MT.

## Yang sebenarnya terjadi

Angka 2.900 **sudah tertulis ke `company_product_stats`** — jadi bukan salah
hitung di layar.

Master punya SATU baris `Utilization #1, 2.300 MT, 24/07/2026` yang sebenarnya
merangkum DUA lot: 2.000 @ 24/07 dan 300 @ 29/07.

Dua jalur memakai asumsi yang sama dan keduanya keliru untuk baris agregat:

| Jalur | Rumus | Akibat |
|---|---|---|
| BACA `iq_sync_util_with_cycles()` | lot "sudah terliput" bila tanggalnya ≤ hari TERAKHIR yang master tahu | lot 2 (29/07 > 24/07) lolos → 2.300 + 300 = 2.600 |
| TULIS `iq_patch_company()` | `baseline = prevUtil − Σ lot sebelum patch` | 2.600 − 2.300 = 300, lalu `300 + 2.600 = 2.900` tertulis |

Selisih 300 sudah ada **sebelum** tim menambah lot ketiga. Menyimpan lot ketiga
hanya membuatnya terlihat.

## Perbaikan jalur baca

Kalau ada **awalan** lot (urut tanggal) yang jumlahnya **pas** sama dengan total
siklus master, awalan itu ADALAH rincian baris master — hanya lot sesudahnya
yang baru. IKM: 2.000 + 300 = 2.300 = master → yang baru cuma lot 3 → 2.600.

Kesamaannya harus persis. Aturan yang lebih longgar (`Σ lot ≥ master` maka lot
menang) juga memberi 2.600 untuk IKM, tapi diukur ke seluruh 40 company ia
**menghapus 425 MT milik BTS SHEET PILE**, yang master 425 dan lot 1.514-nya
memang dua peristiwa berbeda. Itu sebabnya syaratnya kesamaan awalan.

Diukur atas seluruh data: **tepat 1 produk berubah** (IKM GI ALLOY 2.900 →
2.600). Total utilisasi kembali ke 25.996.

Dikunci `iqdash/tests/test_util_master_agregat.php` — kasus IKM **dan
batasnya**: BTS tetap 1.939, KAN tetap 140, pagar obtained tetap berlaku, satu
lot tanpa tanggal membatalkan penandaan.

## Koreksi data

`tools/perbaiki_util_ikm_gi_alloy.php --apply`. Selama sel di sheet masih 2.900,
penyimpanan lot berikutnya akan menggelembung lagi — `baseline` jalur tulis
dihitung dari nilai tersimpan itu. Menyetelnya ke 2.600 membuat baseline jadi 0
dan jalur tulis ikut stabil untuk produk ini.

| Company | Produk | util | avail |
|---|---|---|---|
| IKM | GI ALLOY | 2.900 → **2.600** | 1.250 → **1.550** |
| IKM | SEAMLESS PIPE | 550 → **275** | 1.550 → **1.825** |

Seamless Pipe tidak disebut tim, tapi cacatnya sama dan form Sales mereka
sendiri sudah menampilkan 275 — sheet-nya yang tertinggal.

Pagar "obtained tidak boleh bergeser" melewati dua baris, keduanya perlu
diperiksa CorpSec, bukan ditulis diam-diam:

- **DIOR BORDES ALLOY** — stats 0+0, payload bilang obtained 100
- **CGK GL ALLOY** — stats 380, payload bilang 300 (CGK memang sedang dicek tim)

Cadangan: `backups/iqdash_sebelum_perbaiki_util_2026-08-31_025405.json`

## Sisa / risiko

1. **Jalur TULIS belum diperbaiki.** `iq_patch_company()` masih memakai
   `baseline = prevUtil − Σ lot sebelum patch` tanpa melihat `cycle_utilization`,
   jadi pola yang sama bisa terulang di produk lain: setiap kali Sales menambah
   lot yang ternyata SUDAH dirangkum baris agregat master, angkanya
   menggelembung. Untuk IKM risikonya kini nol (baseline 0), tapi obatnya baru
   di satu sisi.

2. **`cycle_utilization` IKM masih 2.300** sementara lot Sales 2.600. Aturan
   baru menanganinya, tapi saat master di-impor ulang sebaiknya lot ketiga
   tercatat sebagai `Utilization #2`.

## Utilization Breakdown

Modal baru (`iqdash/assets/js/19b-util-breakdown.js`), dibuka dengan mengklik
angka Utilized di tabel Available Quota maupun rincian Overview:
`Company | Product | Obtained | Utilization (MT) | Utilization Date | ETA JKT`,
langsung dari lot Input Manual (Sales).

Tidak semua utilisasi punya lot — BTS SHEET PILE terpakai 1.939 tapi lot hanya
1.514. Selisihnya dicetak sebagai barisnya sendiri bertanda `master · belum
dirinci`, dan kaki modal membandingkan Σ rincian dengan Utilized. Dikunci
`test_util_breakdown.cjs`: untuk KELIMA PULUH baris Available Quota,
Σ rincian harus sama dengan Utilized-nya.
