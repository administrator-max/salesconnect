# [iqdash-koreksi-tanggal-moi-snsd] 2026-08-05 — Tanggal Submit MOI SNSD 04/08 → 17/06/2026

- **Tanggal:** 2026-08-05
- **Oleh:** Claude Code
- **Jenis:** koreksi **DATA** (bukan kode). Tidak ada aturan yang diubah.
- **Pemicu:** tim melaporkan Submitted H1 dashboard 71.945 vs master 74.945.

## Diagnosis

Selisihnya persis **3.000 MT** — tepat sebesar Submit #1 milik SNSD, dan
SNSD-lah satu-satunya selisih (71.945 + 3.000 = 74.945, sama persis).

Di sistem, `submit_date` SNSD tertulis **04/08/2026**, di luar jendela
1 Jan – 30 Jun. Jadi filter benar mengecualikannya; yang salah datanya.

Bukti bahwa itu artefak input, bukan tanggal sebenarnya: dari 41 company,
**SNSD satu-satunya** yang tanggal Submit dan tanggal PERTEK-nya sama persis
(04/08/2026 keduanya). Pengajuan dan terbitnya PERTEK di hari yang sama praktis
tidak terjadi — Lead Time Alert menunjukkan jaraknya berminggu-minggu. Tanggal
4 Agustus adalah hari tim menginput, dan tampaknya terisi ke semua kolom
tanggal sekaligus.

Master tim menguatkan: di sana SNSD **masuk** Submitted H1 tapi **tidak** masuk
Obtained H1 — dan Obtained H1 dashboard (19.710) memang sudah cocok tanpa SNSD.
Kedua sisi sepakat: pengajuan di H1, PERTEK di Agustus.

## Yang diubah

Dikonfirmasi pemilik data: **MOT dan PERTEK = 4 Agustus 2026 (benar, tetap);
MOI = 17 Juni 2026.**

`PATCH /api/company/SNSD/cycles` (full-replace) — **satu field**:

| | Sebelum | Sesudah |
|---|---|---|
| Submit #1 `submitDate` | 04/08/2026 | **17/06/2026** |
| Submit #1 `releaseDate` / `pertekDate` | 04/08/2026 | *tidak diubah* |
| Obtained #1 (seluruhnya) | — | *tidak diubah* |

Cadangan lengkap sebelum perubahan:
`backups/snsd-cycles-sebelum-koreksi-moi_2026-08-05.json` (berisi array
`cycles` apa adanya untuk rollback satu langkah).

## Hasil

| H1 2026 | Sebelum | Sesudah | |
|---|---|---|---|
| Submitted | 71.945 | **74.945** | ✅ cocok master |
| Obtained | 19.710 | 19.710 | tetap — PERTEK memang Agustus |
| Utilized | 17.300 | 17.300 | tetap |
| **Available** | 11.693 | **11.813** | ⚠️ naik 120 |

Q3 2026 Submitted turun 8.600 → 5.600 (3.000 SNSD pindah ke H1, sebagaimana
mestinya). Konsistensi antar menu tetap terjaga: Obtained sama di ketiga menu
untuk H1, Q3, dan All Time.

## Efek samping — SUDAH DIPUTUSKAN & DIPERBAIKI

Koreksi tanggal membuat Available H1 naik 11.693 → 11.813 (+120): SNSD kini
"aktif di H1" (mengajukan 17 Juni), sehingga saldo 120 MT-nya ikut terhitung —
padahal kuotanya baru terbit Agustus.

**Jawaban tim: tidak.** Saldo itu tidak boleh muncul di H1.

### Aturan Available diperketat (`02-period-filter.js`)

Sekarang **dua syarat, keduanya wajib**:

1. company **aktif di periode** (ada cycle-nya di jendela ini) — syarat lama
2. kuotanya **sudah terbit paling lambat di akhir periode** — syarat baru

Dasarnya: **saldo tidak bisa ada sebelum kuota yang melahirkannya.** Sepanjang
H1, kuota SNSD belum pernah tersedia.

Syarat kedua memakai **"s/d akhir periode"**, bukan "di dalam periode". Dua
kandidat lain diuji lebih dulu dan **keduanya keliru** — dicatat supaya tidak
dicoba lagi:

| Kandidat | H1 | Kenapa salah |
|---|---|---|
| obtained **di dalam** periode | 10.780 | menggugurkan ADP, DIOR, KAN, MIN, MJU, MSN — saldo mereka sah, kuotanya cuma terbit sebelum jendela ini |
| obtained **s/d akhir**, tanpa syarat aktif | 12.293 | menarik masuk company yang tidak beraktivitas sama sekali di periode ini |
| saldo "per 30 Jun" penuh (obtained − utilisasi s/d 30 Jun) | 15.333 | bukan definisi kumulatif yang dipakai master |
| **gabungan 1 + 2** | **11.693** ✅ | cocok master, All Time tetap 12.413, Q1/Q3 tidak bergeser |

Dikerjakan lewat `_asOfPeriod(from, to, fn)` — menukar jendela sementara lalu
memulihkannya, supaya pertanyaan "apa yang benar per tanggal X" tetap dijawab
oleh `canonicalObtainedFiltered()` yang kanonik, **bukan** oleh salinan aturan
obtained yang baru. Sinkron saja; tidak boleh ada `await` di dalamnya.

### Verifikasi akhir

| | Submitted | Obtained | Utilized | Available |
|---|---|---|---|---|
| **H1 2026** | **74.945** ✅ | **19.710** ✅ | **17.300** ✅ | **11.693** ✅ |
| Q1 2026 | 13.150 | 8.650 | 7.014 | 5.793 |
| Q2 2026 | 61.795 | 11.060 | 10.286 | 6.913 |
| Q3 2026 | 5.600 | 1.430 | 4.200 | 7.580 |
| All Time | 277.545 | 34.960 | 22.547 | 12.413 ✅ |

Available **identik di ketiga menu** pada kelima periode. Q1 dan Q3 tidak
bergeser dari sebelum perubahan — jadi tidak ada regresi.

## Catatan proses

Pembacaan verifikasi pertama masih menampilkan 04/08/2026 dan sempat saya kira
tulisannya ditolak — itu keliru, hanya cache baca (TTL 10 detik). Pembacaan
dengan cache-buster memastikan datanya memang tersimpan. Untuk verifikasi tulis
berikutnya: pakai cache-buster sejak awal.
