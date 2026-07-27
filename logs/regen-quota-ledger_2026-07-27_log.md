# [regen-quota-ledger] 2026-07-27 — Ledger dibangkitkan ulang dari master + generatornya

## Ringkasan
`iqdash/data/quotaLedger.json` menggerakkan SELURUH KPI kuota dashboard (obtained, utilization,
available) lewat `iq_apply_ledger()`. File itu dibuat **manual 2026-07-01** dari master salinan (6),
**tanpa generator**, lalu tidak pernah diperbarui. Dashboard membeku empat minggu.

| | Obtained | Utilization | Available |
|---|---|---|---|
| master (6), 1 Jul | 33.730 | 18.346 | 15.384 |
| `quotaLedger.json` (lama) | **33.730** | **18.346** | 15.384 |
| master hari ini | 34.240 | 22.547 | 11.693 |
| ledger baru | **34.240** | **22.547** | **11.693** |

Tulis ke tab Sheets tidak pernah bisa memperbaiki ini — overlay ledger menimpanya. Itu sebabnya
koreksi `companies`/`company_product_stats` sebelumnya tidak menggerakkan angka dashboard sama sekali.

## `tools/build_quota_ledger.py` (baru)
Membaca sheet `Status Submisson`: baris 2 nama produk, baris 3 kode HS, blok per perusahaan dengan
label di kolom C. `Obtained #N` + `Revision #N` → obtained (view `_meta` = "incl. revisions");
`Utilization (MT)` → util. Blok baru dikenali dari kolom A numerik + kolom B terisi, kode = token
pertama sehingga **`AMP (SUJU)` → AMP** (regex lama melewatkannya dan melipat baris AMP ke HDP).

**Uji asam:** dijalankan pada master **(6)** — sumber ledger lama — lalu `--check` terhadap file lama.
Total **cocok persis** (33.730 / 18.346). Hanya 3 sel berbeda, dan ketiganya **salah di file lama**:

- **BDG tertukar produknya.** Master: Revision #1 −650 BORDES → **+650 GL BORON** (utilisasi 650,
  28 Apr 26); Revision #2 −350 BORDES → **+350 GI BORON** (available 350). File lama menukar keduanya.
  Dikuatkan bukti independen: realisasi BDG **649,58 MT GL BORON** (ARSEN 56A) — cocok dengan GL yang
  memegang utilisasi 650. Jadi dashboard salah menampilkan 650 MT BDG di GI ALLOY sejak 1 Juli.
- **MIN 353,3 → dibulatkan 353** di file lama (master menulis 353,30).

## Pembangkitan ulang
Salinan lokal terbaru = (7) 23-Jul (34.240 / 22.047). Salinan Drive hari ini 34.240 / **22.547**;
selisihnya dua entri utilisasi bertanggal **24 Jul 26** yang dibaca langsung dari Drive:
IKM GI Boron +300, SGD GI Boron +200. Diterapkan sebagai overlay bernama, lalu **script menolak
menulis** bila total tidak mendarat persis di sel `Total Obtained` / `Total Utilization` master.
Total cocok → ditulis.

## File yang disentuh
- `tools/build_quota_ledger.py` — generator baru
- `iqdash/data/quotaLedger.json` — dibangkitkan ulang (backup: `backups/quotaLedger_before_regen_2026-07-27.json`)
- `iqdash/tests/test_ledger.php` — total parity dinaikkan ke 34.240,3 / 22.547 / 11.693,3

## Verifikasi
- Generator mereproduksi ledger lama dari master (6): total identik, 3 selisih = kesalahan file lama.
- Payload hidup: obtained **34.240**, utilized **22.547**, available **11.693** — cocok master.
- 13 suite PHP lulus, 3 suite JS lulus (35 + 15 + 21).
- Obtained membawa `.3` dari MIN 353,30; sel Total master mencetak 34.240 (dibulatkan).

## Sisa / risiko
- **Laporan Q2 yang baru dibangun memakai basis lama** (obtained 29.630 H1 / util 0). Perlu dibangun
  ulang setelah deploy ini.
- Generator memakai salinan (7) + overlay 2 entri; begitu file Drive terbaru tersedia lokal,
  jalankan langsung tanpa overlay.
- `_meta.generated` diisi manual lewat env `LEDGER_DATE`.
