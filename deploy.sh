#!/usr/bin/env bash
# SalesConnect -> Niagahoster via git-ftp (plain FTP).
# Jalankan di terminal yang PUNYA jaringan (Windows: Git Bash).
#   Pertama kali:  git ftp init          (upload penuh)
#   Selanjutnya :  ./deploy.sh "pesan"   (commit + push file yang berubah)
set -e
MSG="${1:-update $(date +%F)}"
git add -A
git commit -m "$MSG" || echo "- tidak ada perubahan untuk di-commit"
git ftp push
echo "OK. Situs: https://salesconnect.tapworkspace.com/"
