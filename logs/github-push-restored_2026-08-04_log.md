# [github-push-restored] 2026-08-04 — Akses tulis GitHub pulih; 18 commit ter-push

- **Tanggal:** 2026-08-04
- **Oleh:** Claude Code
- **Menutup risiko:** *"Backup offsite tertinggal … satu-satunya salinan riwayat
  ada di mesin ini"* — tercatat di `deploy-iqdash-date-consistency_2026-07-31_log.md`.

## Ringkasan
`git push` mati sejak sekitar 30 Juli. Dua sebab terpisah, dua-duanya beres:

1. **`~/.ssh/config` hilang** → alias host `github-work` di remote URL tidak
   resolve ke mana pun. **Diperbaiki** (file dibuat ulang).
2. **`aldipratantio` tidak punya akses tulis** ke
   `administrator-max/salesconnect`. **Diperbaiki pemilik repo.**

Hasil: `a165de5..6f1b62d`, **18 commit** terkirim. `origin/main` kini sejajar
dengan `main` lokal.

## 1. Alias SSH
Remote memakai `git@github-work:administrator-max/salesconnect.git`, tapi
`~/.ssh/config` tidak ada sehingga `github-work` bukan host yang dikenal.
Dibuat ulang:

```
Host github-work
  HostName github.com
  User git
  IdentityFile ~/.ssh/id_ed25519
  IdentitiesOnly yes
```

Alias sengaja **dipertahankan**, bukan diganti `github.com` langsung — supaya
remote URL yang sudah ada tetap berlaku dan mudah menambah akun kedua nanti.
Verifikasi: `ssh -T git@github-work` → *"Hi aldipratantio!"*.

## 2. Akses tulis
Diagnosis memisahkan dua hal dengan jelas: `git ls-remote` **berhasil** (baca
OK) sementara `git push --dry-run` menjawab *"Permission … denied to
aldipratantio"* — jadi persoalannya izin, bukan koneksi atau kunci.

Sempat tertunda karena akses diberikan pada repo **`administrator-max/fpa`**,
bukan `salesconnect` — ketahuan dari URL di layar Collaborators
(`/administrator-max/fpa/settings/access`) sementara pesan error menyebut
`salesconnect.git`. Setelah ditambahkan di repo yang benar dan undangannya
diterima, push langsung berhasil.

## Verifikasi
- `git push --dry-run` bersih lebih dulu, baru push sungguhan — akses diuji
  tanpa menulis apa pun.
- **Fast-forward**, tanpa `--force`: `git merge-base --is-ancestor origin/main
  HEAD` lolos sebelum push, jadi tidak ada riwayat yang bisa tertimpa.
- Sesudahnya: `origin/main` = `6f1b62d` = `HEAD`; `git status -sb` tidak
  menunjukkan ahead/behind.

## Isi yang ter-push
18 commit tertanggal 3–4 Agustus: pemulihan endpoint realisasi, perbaikan
utilisasi dihitung ganda, penyegaran ledger, penyatuan sumber kelima ukuran
laporan, perbaikan PDF Summary, dan seluruh file log-nya.

## Catatan
Kunci SSH di mesin ini berkomentar `aldi.pratantio@gunungprisma.com` dan
berautentikasi sebagai akun GitHub **`aldipratantio`** — komentar kunci tidak
menentukan akun, jadi yang harus dicocokkan saat memberi akses adalah nama
akunnya.
