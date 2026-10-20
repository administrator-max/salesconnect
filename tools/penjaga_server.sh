#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Penjaga server SalesConnect — HANYA MEMBACA, tidak pernah mengupload.
#
# Membandingkan ukuran file program di server (listing FTP) dengan file yang
# sudah di-commit di repo ini. Kalau ada yang beda/hilang → notifikasi Windows
# + catatan di logs/penjaga-server.log. Dibuat setelah server dua kali tertimpa
# salinan lama (19 & 20-Okt-2026; logs/insiden-upload-versi-lama_2026-10-19_log.md).
# Kunci read-only tidak bisa (Hostinger mengabaikan SITE CHMOD), jadi kita
# mendeteksi cepat lalu pemulihan tetap lewat ./deploy.sh oleh pengguna.
#
# Pemakaian:
#   tools/penjaga_server.sh          # cek sekali, notifikasi hanya bila temuan BERUBAH
#   tools/penjaga_server.sh --tes    # cek sekali, selalu tampilkan hasil + notifikasi tes
# Dijadwalkan tiap 10 menit lewat Windows Task Scheduler ("SalesConnect Penjaga").
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")/.."

TES=0; [ "${1:-}" = "--tes" ] && TES=1
LOG=logs/penjaga-server.log
STATE=cache/penjaga_server_state.txt
mkdir -p cache logs

URL=$(git config --get git-ftp.url || true)
FUSER=$(git config --get git-ftp.user || true)
FPASS=$(git config --get git-ftp.password || true)
[ -z "$URL" ] || [ -z "$FUSER" ] || [ -z "$FPASS" ] && { echo "Kredensial FTP belum diset (git config git-ftp.*)"; exit 1; }
BASE="${URL%/}"
CONF=$(mktemp); trap 'rm -f "$CONF"' EXIT
printf 'user = "%s:%s"\n--ftp-pasv\n--connect-timeout 25\n--max-time 60\n' "$FUSER" "$FPASS" > "$CONF"

notify() {  # notify JUDUL PESAN — balon notifikasi Windows (tanpa modul tambahan)
  powershell.exe -NoProfile -WindowStyle Hidden -Command "
    Add-Type -AssemblyName System.Windows.Forms;
    \$n = New-Object System.Windows.Forms.NotifyIcon;
    \$n.Icon = [System.Drawing.SystemIcons]::Warning; \$n.Visible = \$true;
    \$n.ShowBalloonTip(30000, '$1', '$2', 'Warning'); Start-Sleep 30; \$n.Dispose()" >/dev/null 2>&1 &
}

# Folder program yang dijaga (sama dengan yang di-deploy).
DIRS_RE='^(lib|iqdash|cil|taskflow|costcore|salespulse|scot|crmproject)/'
IGN_RE='(\.md$|/tests/|^tools/|^docs/|^logs/)'

declare -A LOCAL
while IFS= read -r f; do
  [ -f "$f" ] || continue
  if [[ "$f" =~ $DIRS_RE || ( "$f" != */* && "$f" == *.php ) ]]; then
    [[ "$f" =~ $IGN_RE ]] && continue
    [ "$f" = "setup.php" ] || [ "$f" = "config.sample.php" ] && continue
    git diff --quiet HEAD -- "$f" 2>/dev/null || continue   # sedang diedit lokal → lewati
    LOCAL["$f"]=$(wc -c < "$f" | tr -d ' ')
  fi
done < <(git ls-files)

# Uji alarm tanpa menyentuh server: PENJAGA_SIMULASI=lib/auth.php tools/penjaga_server.sh
[ -n "${PENJAGA_SIMULASI:-}" ] && LOCAL["$PENJAGA_SIMULASI"]=1271
# Semua listing folder dalam SATU koneksi FTP (server membatasi koneksi beruntun;
# satu curl per folder membuat sebagian listing gagal → alarm palsu "HILANG").
declare -A REMOTE RDATE
TMPD=$(mktemp -d); trap 'rm -f "$CONF"; rm -rf "$TMPD"' EXIT
mapfile -t dirs < <(for f in "${!LOCAL[@]}"; do dirname "$f"; done | sort -u)
args=(); i=0
for d in "${dirs[@]}"; do
  p="$d/"; [ "$d" = "." ] && p=""
  args+=("$BASE/$p" -o "$TMPD/$i"); i=$((i+1))
done
curl -sS -K "$CONF" "${args[@]}" 2>/dev/null
gagal_listing=0; i=0
for d in "${dirs[@]}"; do
  if [ ! -s "$TMPD/$i" ]; then gagal_listing=1; i=$((i+1)); continue; fi
  while read -r perm _ _ _ size m dd t name; do
    [[ "$perm" == -* ]] || continue
    key="$name"; [ "$d" != "." ] && key="$d/$name"
    REMOTE["$key"]=$size; RDATE["$key"]="$m $dd $t"
  done < <(tr -d '\r' < "$TMPD/$i")
  i=$((i+1))
done

if [ $gagal_listing -eq 1 ]; then
  # Listing tak lengkap → jangan menebak "HILANG"; coba lagi di putaran berikutnya.
  echo "$(date '+%F %T') listing FTP tidak lengkap (jaringan/password?) — dilewati" >> "$LOG"
  [ $TES -eq 1 ] && echo "Listing FTP tidak lengkap — dilewati."
  exit 2
fi

temuan=()
for f in $(printf '%s\n' "${!LOCAL[@]}" | sort); do
  r="${REMOTE[$f]:-}"
  if [ -z "$r" ]; then temuan+=("HILANG  $f")
  elif [ "$r" != "${LOCAL[$f]}" ]; then temuan+=("BEDA    $f  server=$r repo=${LOCAL[$f]}  (diubah ${RDATE[$f]})")
  fi
done

ringkas=$(printf '%s\n' "${temuan[@]+"${temuan[@]}"}")
lama=$(cat "$STATE" 2>/dev/null || true)

if [ ${#temuan[@]} -eq 0 ]; then
  [ -n "$lama" ] && echo "$(date '+%F %T') PULIH — semua ${#LOCAL[@]} file cocok lagi" >> "$LOG"
  : > "$STATE"
  if [ $TES -eq 1 ]; then
    echo "OK — ${#LOCAL[@]} file program di server cocok dengan repo."
    notify "Penjaga SalesConnect (tes)" "OK - ${#LOCAL[@]} file server cocok dengan repo."
  fi
  exit 0
fi

if [ "$ringkas" != "$lama" ] || [ $TES -eq 1 ]; then
  { echo "$(date '+%F %T') PERINGATAN — ${#temuan[@]} file server beda dari repo:"; printf '    %s\n' "${temuan[@]}"; } >> "$LOG"
  contoh=$(printf '%s' "${temuan[0]}" | awk '{print $2}')
  notify "SalesConnect: ${#temuan[@]} file server berubah!" "Contoh: $contoh. Mungkin ada upload liar. Cek logs/penjaga-server.log lalu minta Claude memulihkan."
fi
printf '%s' "$ringkas" > "$STATE"
[ $TES -eq 1 ] && printf '%s\n' "${temuan[@]}"
exit 3
