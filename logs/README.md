# logs/ — riwayat update sistem

**Aturan:** setiap kali sistem diubah (fitur baru, bugfix, refactor, perubahan config),
WAJIB buat **satu file log** di folder ini.

## Format nama file
```
[update]_[date]_log.md
```
- `[update]` = slug singkat **kebab-case** yang mendeskripsikan perubahan
  (mis. `soft-delete`, `add-polling`, `fix-race`, `neon-migration`)
- `[date]`   = `YYYY-MM-DD`
- Contoh: `soft-delete_2026-07-15_log.md`

## Template isi
```markdown
# [Judul singkat update]
- **Tanggal:** YYYY-MM-DD
- **Oleh:** nama / Claude Code

## Ringkasan
Apa yang diubah dalam 1–2 kalimat.

## Perubahan
- poin perubahan 1
- poin perubahan 2

## File yang disentuh
- path/file — apa yang berubah

## Alasan
Kenapa perubahan ini dilakukan.

## Verifikasi / uji
- langkah tes + hasil (lint, uji manual, dsb.)

## Sisa / risiko
- yang belum selesai atau perlu dipantau
```

> File di folder ini **ikut di-commit** (bukan gitignore) — ini catatan sejarah proyek.
