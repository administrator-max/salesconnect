# [iqdash-status-revisi-ikut-tanggal] 2026-08-07 — Active Revisions dinilai dari tanggal, bukan teks status

- **Tanggal:** 2026-08-07
- **Oleh:** Claude Code
- **Pemicu:** tim melaporkan sembilan PT masih tercantum di **Active Revisions**
  padahal tanggalnya sudah lengkap: MIN, HKG, JKT, BBB, GNG, KAN, KJK, PPGL, SJH.

## Sebab

`revisionStatus()` sama sekali **tidak melihat tanggal cycle**. Ia mencocokkan
**teks** pada `revType`, `spiRef`, `revStatus`, `revNote`, `spiNo`,
`statusUpdate` — kalimat seperti *"Menunggu Disposisi Kasi"*, *"Submit SPI"*,
*"SPI Perubahan belum terbit"*.

Kalimat itu **tidak ikut diperbarui** ketika tanggalnya dilengkapi, jadi PT-nya
tertinggal di daftar revisi selamanya. Contoh paling gamblang, **PPGL**:

```
cycle : Submit #1 PERTEK 30/05/2026 -> Obtained #1 PERTEK 09/06 · SPI 09/06/2026
spiRef: "PERTEK TERBIT 30/05/2026 ... SPI belum terbit"      <- basi
spiNo : (kosong)                                              <- basi
```

Cycle-nya lengkap, teksnya masih bilang SPI belum terbit.

**Tanggal adalah fakta; kalimat status adalah catatan yang mudah basi.**
Yang dipercaya sekarang tanggalnya.

## Perubahan

**`04-charts.js`** — `hasOutstandingCycle(d)` (baru). Sebuah permohonan
(`Submit #N` / `Revision #N`) dianggap **selesai** bila sudah dijawab cycle
`Obtained` pasangannya yang membawa **PERTEK dan SPI**. Menggantung bila:

- ada cycle `Obtained` yang belum bertanggal lengkap, **atau**
- ada `Submit #N` / `Revision #N` tanpa `Obtained` pasangan yang lengkap

`revisionStatus()` mengembalikan `'completed'` begitu tidak ada yang
menggantung — apa pun bunyi teksnya.

`"Revision Request — <produk>"` **sengaja tidak dihitung**: itu permintaan sales
internal yang dikonfirmasi CorpSec, bukan permohonan izin ke pemerintah, jadi
ia memang tidak menunggu PERTEK/SPI. (Kalau ikut dihitung, MJU dan CGK akan
tertahan karena alasan yang salah.)

`TBA` diperlakukan sama dengan kosong.

## Hasil

| | Sebelum | Sesudah |
|---|---|---|
| Under Revision | MIN | MIN |
| Re-Apply Submit | CGK, GKL, HKG, JKT | CGK, GKL |
| PERTEK Pending | BBB, GNG, KAN, KJK, MJU, PPGL, SJH | MJU |
| **Total** | **12** | **4** |

**Delapan dari sembilan** PT yang dilaporkan tim keluar: HKG, JKT, BBB, GNG,
KAN, KJK, PPGL, SJH. Ketiga PT yang **tidak** disebut tim (CGK, GKL, MJU) tetap
bertahan — masing-masing memang masih punya permohonan menggantung:

| PT | Yang menggantung |
|---|---|
| CGK | `Submit #3` 3.000 MT — tanpa `Obtained #3` |
| GKL | `Obtained #2` 600 MT — tanpa PERTEK & SPI |
| MJU | `Revision #2` — tanpa `Obtained (Revision #2)` |

24 suite, 0 gagal.

## MIN — dibersihkan (dikonfirmasi tim: "MIN juga sudah bukan revisi")

Master 05/08/2026 menjadi penentu: di sana MIN **hanya** punya `Submit #1` +
`Obtained #1` (+ Utilization 247 & Available 353). **Tidak ada `Obtained #2`
maupun `Revision #1`** — keduanya sisa di sistem yang master tidak punya.

Dua baris itu dihapus lewat `PATCH /api/company/MIN/cycles`:

| Cycle | MT | Kenapa dihapus |
|---|---|---|
| `Obtained #2` | 600 | Isinya BORDES 247 + GI 353 = **realokasi 600 MT yang sama**, bukan kuota baru. Tanpa tanggal, `_fromRevReq: true`. |
| `Revision #1` | 0,3 | Tanpa produk sama sekali — artefak `.3` yang dulu mengotori total obtained. |

**Yang SENGAJA tidak dilakukan:** mengisikan tanggal PERTEK/SPI ke `Obtained #2`
supaya "lengkap". Itu justru merusak — `canonicalObtained()` akan menghitungnya
dan obtained MIN melonjak **600 → 1.200**, padahal master bilang 600. Aturan
pemilik data (2026-08-04) juga tegas: *realokasi/pindah produk tidak termasuk
obtained, karena nilai kuotanya tetap sama*.

Riwayat realokasinya **tidak hilang**: baris `Revision Request — BORDES ALLOY`
dipertahankan dan sudah memuat rincian yang sama (GI 353 / BORDES 247).

Sesudahnya — angka MIN **tidak bergeser sedikit pun**, cocok master:

| | Sebelum | Sesudah | Master |
|---|---|---|---|
| Obtained | 600 | 600 | 600 |
| Utilization | 247 | 247 | 247 |
| Available | 353 | 353 | 353 |
| Status revisi | active | **completed** | — |

Cadangan: `backups/min-cycles-sebelum-bersih_2026-08-07.json`.

**Active Revisions akhir: 3** — Re-Apply CGK & GKL, PERTEK Pending MJU.
Under Revision kosong.

## Temuan susulan — SNSD tertimpa edit web (BUKAN akibat perubahan ini)

Saat verifikasi akhir, Submitted H1 turun **74.945 → 71.945**. Selisihnya persis
3.000, sebesar Submit #1 milik SNSD.

Sebabnya: koreksi tanggal MOI SNSD **17/06/2026** — yang dikonfirmasi pemilik
data 2026-08-05 dan dicatat di
`logs/iqdash-koreksi-tanggal-moi-snsd_2026-08-05_log.md` — **sudah tertimpa
kembali menjadi 04/08/2026** oleh edit lewat web hari ini
(`lastUpdate` 2026-08-07T08:28:54). Edit yang sama juga mengisi
`Obtained #1` PERTEK/SPI 07/08/2026, yang tampaknya informasi baru yang sah.

**Tidak dikembalikan sepihak.** Edit itu dibuat orang lain beberapa jam lalu;
menimpanya balik hanya jadi tarik-menarik. Diserahkan ke pemilik data.

### Diselesaikan — pemilik data memberi tanggal final

> 1. Submit MOI SNSD 3000 MT pada **17/07/2026**
> 2. PERTEK Terbit 120 MT pada **04/08/2026**, Submit MOT **04/08/2026**,
>    SPI Terbit **07/08/2026**

**Perhatian: tanggal MOI berubah dari keterangan 2026-08-05.** Waktu itu
"17 Juni 2026", kini **17 Juli 2026**. Yang dipakai keterangan terbaru.
Konsekuensinya nyata — 17 Juli **di luar H1**, jadi 3.000 MT SNSD **tidak**
masuk Submitted Januari–Juni.

Struktur yang ditulis (mengikuti bentuk master: PERTEK di baris Submit, SPI di
baris Obtained):

| Cycle | MT | Submission | Release |
|---|---|---|---|
| `Submit #1` | 3.000 | Submit MOI **17/07/2026** | PERTEK **04/08/2026** |
| `Obtained #1` | 120 | Submit MOT **04/08/2026** | SPI **07/08/2026** |

`pertekDate` pada `Obtained #1` **dikosongkan** — PERTEK hidup di baris Submit
yang berpasangan, dan itulah yang dibaca `getPertekTerbitForObtained()`.
Sebelumnya baris Obtained ikut memuat 07/08/2026, yang keliru: itu tanggal SPI.

Cadangan: `backups/snsd-cycles-sebelum-koreksi-2_2026-08-07.json`

**Hasil — SNSD kini mendarat di periode yang benar:**

| Periode | Submitted | Obtained |
|---|---|---|
| H1 (1 Jan–30 Jun) | 71.945 | 19.860 |
| **Juli 2026** | 8.600 *(+3.000 SNSD)* | 1.160 |
| **Agustus 2026** | 0 | 120 *(SNSD)* |
| 2026 setahun | 80.545 | 21.140 |

Sifat partisi utuh: H1 + H2 = setahun, persis, untuk Submitted maupun Obtained.

Ini persis risiko "dua pintu masuk data" yang dijelaskan ke tim beberapa jam
sebelumnya — dan terwujud dalam hitungan jam, bukan teori. Selama belum ada
pemeriksa kecocokan otomatis, kejadian seperti ini hanya ketahuan kalau ada
yang kebetulan memperhatikan angkanya.

## (arsip) MIN sebelum dibersihkan — soal DATA bukan logika

Tim menyebut MIN ikut selesai, tapi di sistem MIN masih punya **dua cycle tanpa
tanggal sama sekali**:

| Cycle | MT | PERTEK | SPI |
|---|---|---|---|
| `Obtained #2` | 600 | *(kosong)* | *(kosong)* |
| `Revision #1` | 0,3 | *(kosong)* | *(kosong)* |

Keduanya juga janggal isinya: `Obtained #2` bernilai 600 MT — **sama persis
dengan `Obtained #1`** (600 MT, PERTEK & SPI 07/11/2025), jadi berbau baris
kembar; dan `Revision #1` hanya 0,3 MT.

`canonicalObtained(MIN)` = 600, artinya `Obtained #2` memang **sudah** tidak
ikut dihitung ke total (tersaring karena tanggal terbitnya kosong). Jadi ia
tidak merusak angka, hanya menahan MIN di daftar revisi.

Tidak ditebak sendiri. Yang perlu dipastikan tim:
1. `Obtained #2` 600 MT — baris kembar yang harus dihapus, atau pemberian nyata
   yang tanggalnya belum diisi?
2. `Revision #1` 0,3 MT — masih berjalan, atau sisa yang bisa ditutup?
