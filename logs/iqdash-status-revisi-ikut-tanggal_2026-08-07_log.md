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

## MIN — belum keluar, dan ini soal DATA bukan logika

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
