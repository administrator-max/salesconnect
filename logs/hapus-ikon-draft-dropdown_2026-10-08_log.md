# IQ Dash — ikon 📝 di daftar company dihapus

**Tanggal:** 2026-10-08
**Modul:** IQ Dash (Import Quota Monitor)

## Ringkasan

Atas permintaan tim, ikon 📝 di depan nama company pada dropdown "Step 2 — Select
Company" (penanda ada draft isian yang belum tersimpan) tidak lagi ditampilkan.
Fitur draft-nya tetap: isian tersimpan otomatis dan dipulihkan saat company
dibuka kembali (toast "Draft … dipulihkan").

## Perubahan

- `09-nav-import.js` — `refreshDropdownDraftBadges()` selalu menulis label dasar.
- `index.html` — `09-nav-import.js?v=5`.

## Verifikasi

- Pratinjau: dengan draft disimulasikan untuk HDP & GNG, label tetap tanpa ikon.
- 51 uji `.cjs` lulus.

## Tindak lanjut (hari yang sama)

Akhiran "(belum ada data 2027)" pada nama company di dropdown juga dihapus; tanda `tahunLain` tetap dipakai loadEdit() (`19-init.js?v=30`).
