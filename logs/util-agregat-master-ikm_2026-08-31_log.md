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

## CGK — dijawab CorpSec, ditutup (31-Agu-2026)

Tim mencatat sendiri jawaban CorpSec ke spreadsheet. Kedua hal yang dilaporkan
di atas hilang dengan sendirinya:

| Dilaporkan | Keadaan sekarang |
|---|---|
| kolom SPI No. berisi tanggal `29/04/2026` | nomor sungguhan: `04.PI-05.25.3510.2` |
| Obtained #3 (300 MT GL Alloy) tanpa PERTEK/SPI, status TBA | SPI Perubahan 2 terbit **31/08/2026**; baris CGK tidak lagi meminjam dokumen siklus sebelumnya |

Dashboard membacanya tanpa perubahan kode: kedua baris CGK kini
`Obtained #3 · SPI 04.PI-05.25.3510.2 @ 31/08/2026 · Validity 31/12/2026 ·
🟢 Active`. Σ tabel PERTEK & SPI 35.260 = kartu Obtained.

### Sel stats yang tertinggal — dan kenapa itu bukan kosmetik

`company_product_stats` CGK GL ALLOY masih `util 200 + avail 180 = 380`,
sementara Obtained #3 yang sudah berdokumen menyebut **300**.

Selisih 80 MT itu punya gigi: jalur tulis memakai `util + avail` sebagai
**plafon** utilisasi (`$obtained = $prevUtil + $prevAvail`), jadi 380
mengizinkan pemakaian melebihi kuota 300 yang sebenarnya.

Diperbaiki lewat opt-in sempit pada `tools/perbaiki_util_ikm_gi_alloy.php`:

```
php tools/perbaiki_util_ikm_gi_alloy.php "--sesuaikan-obtained=CGK/GL ALLOY" --apply
```

Pagar #4 (obtained tidak boleh bergeser) tetap berlaku sebagai bawaan; yang
dikecualikan harus disebut namanya satu per satu, dan nilai barunya tetap
diambil dari hasil hitungan siklus — bukan dari angka yang diketik.

`avail 180 → 100`. Obtained 380 → 300, mengikuti dokumen. Tidak ada angka
dashboard yang bergerak (utilisasi total tetap 25.996), karena payload memang
sudah menurunkan 300/100 dari siklus. Yang berubah: sheet berhenti
bertentangan dengan dokumennya sendiri, dan plafon jalur tulis kembali benar.

Cadangan: `backups/iqdash_sebelum_perbaiki_util_2026-08-31_034109.json`

### DIOR masih terbuka — dan arahnya BERLAWANAN dari yang saya tulis semula

Catatan pertama saya di sini menyebut "revisi sudah memindahkannya ke Bordes
Alloy". **Itu terbalik.** Revisi memindahkan **BORDES ALLOY → GL ALLOY**,
100 MT, dikonfirmasi CorpSec 14-Agu-26, PERTEK Perubahan 25/08/2026.

Yang sebenarnya terjadi: 100 MT itu tercatat di DUA produk berbeda, tergantung
tab mana yang dibaca.

| Tab | Produk |
|---|---|
| `company_product_stats` | **GL ALLOY** avail 100 (baris Bordes 0/0) |
| `company_products` | **BORDES ALLOY** |
| `cycle_products` — Obtained #1 | **BORDES ALLOY** 100 |
| `cycle_products` — Revision Request | **GL ALLOY** 100 |
| Yang dirender dashboard | **BORDES ALLOY** |

Sebagian dari perpecahan ini berasal dari
`tools/catat_pertek_perubahan_dior.php` yang saya jalankan lebih awal: ia
memindahkan `company_product_stats` ke GL ALLOY, tapi `company_products`
tetap BORDES ALLOY. Tidak tuntas.

**Tidak diselesaikan sekarang**, dan bukan karena kurang data teknis melainkan
karena arah yang benar belum pasti:

- **PERTEK Perubahan sudah terbit** (25/08/2026). Menurut aturan revisi yang
  dipegang tim, penggantian berlaku sejak PERTEK Perubahan terbit — jadi
  seharusnya sudah GL ALLOY.
- Tapi **SPI Perubahan masih TBA**, dan
- **Obtained #1 sendiri belum pernah terbit** — `release_date` kosong,
  statusnya `(Hold, waiting address changes)`.

Jadi revisi ini menggantikan kuota yang sendirinya masih tertahan. Dua
pembacaan sama masuk akalnya, dan menebak berarti menulis produk yang salah ke
master. Menunggu jawaban CorpSec atas tiga hal: produk yang berlaku sekarang,
nomor + tanggal SPI Perubahan (atau konfirmasi masih TBA), dan apakah hold-nya
sudah selesai. Diputuskan tim 31-Agu-2026: `company_products` dibiarkan apa
adanya sampai jawaban itu datang.

Tidak ada angka yang terpengaruh: 100 MT tetap 100 MT, yang berbeda hanya label
produknya, jadi Obtained 35.260 dan Available 9.264 benar apa pun jawabannya.

### SNSD juga terbuka — barisnya TIDAK ADA, bukan dikosongkan

`company_product_stats` punya **nol baris** untuk SNSD. Bukan sel yang di-blank:
barisnya memang tidak pernah dibuat atau sudah terhapus. Bandingkan dengan
company sehat seperti SMS yang punya `GI ALLOY util 150 / avail 0`.

Tab lain justru lengkap dan saling cocok:

```
companies         obtained 120 · PERTEK 1078/ILMATE/PERTEK-SPIU/VIII/2026
                  SPI 04.PI-05.26.3590 · updated by CorpSec 07-Aug-26
company_products  GI BORON
cycles            Submit #1   3.000  PERTEK terbit 04/08/2026
                  Obtained #1   120  SPI terbit    07/08/2026
```

Dashboard menampilkan **120 / 0 / 120 · 🟢 Active** dengan benar, karena
diturunkan dari cycles ketika stats diam. Jadi tidak ada yang hilang di layar —
tapi SNSD berdiri di atas cadangan, bukan di atas datanya sendiri.

**Kenapa tetap perlu dibereskan meski layar sudah benar:** jalur tulis membaca
`util + avail` dari baris stats sebagai PLAFON utilisasi. Tanpa baris itu
plafonnya terbaca 0, jadi lot pertama yang dimasukkan Sales untuk SNSD akan
berperilaku berbeda dari company lain. Belum menggigit sekarang — SNSD memang
belum punya lot — tapi akan menggigit pada lot pertama.

Yang ditunggu dari CorpSec cuma satu: **apakah benar SNSD belum punya utilisasi
sama sekali?** Kalau ya, barisnya tinggal dibuat `GI BORON · util 0 · avail 120`
dan selesai — tidak ada angka yang bergerak, hanya berhenti bergantung pada
cadangan.
