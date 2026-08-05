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

## ⚠️ Efek samping yang perlu keputusan pemilik data

**Available H1 bergeser 11.693 → 11.813 (+120).**

Bukan bug, dan bukan akibat perubahan aturan — murni konsekuensi tanggalnya.
Available memakai **saldo kumulatif dari company yang aktif di periode**
(aturan yang dikonfirmasi 2026-08-04). Sebelum koreksi, seluruh cycle SNSD ada
di Agustus sehingga ia tidak dihitung "aktif di H1". Sesudah koreksi ia
mengajukan 17 Juni, jadi ia aktif di H1 dan saldo 120 MT-nya ikut terhitung.

Pertanyaannya untuk tim: **kuota SNSD terbit Agustus — apakah saldonya pantas
muncul di H1 hanya karena pengajuannya Juni?**

- Kalau **ya**, tidak ada yang perlu dikerjakan; 11.813 sudah benar.
- Kalau **tidak**, aturan keaktifan Available perlu diubah (mis. bersandar pada
  PERTEK, bukan aktivitas cycle apa pun). Itu **perubahan aturan** yang
  menyentuh semua periode, jadi tidak saya ambil sendiri.

## Catatan proses

Pembacaan verifikasi pertama masih menampilkan 04/08/2026 dan sempat saya kira
tulisannya ditolak — itu keliru, hanya cache baca (TTL 10 detik). Pembacaan
dengan cache-buster memastikan datanya memang tersimpan. Untuk verifikasi tulis
berikutnya: pakai cache-buster sejak awal.
