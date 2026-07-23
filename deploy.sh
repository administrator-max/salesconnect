#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# SalesConnect → Niagahoster deploy — PRIMARY ROUTE (direct FTP, verified).
#
# Why not git-ftp / CI anymore: the git-ftp path (local AND the GitHub Action)
# TRUNCATED larger files on transfer to this host — e.g. an 81 KB PHP file
# arrived as exactly 32,768 bytes, others as 0 bytes — causing blank/500 pages.
# This script uploads each file with PLAIN binary FTP (curl) and then VERIFIES
# the remote byte size == local byte size, retrying on mismatch. That size
# check is the truncation guard. git is now used ONLY for version control;
# pushing to GitHub does NOT deploy.
#
# Usage:
#   ./deploy.sh                 # deploy ALL tracked, non-ignored files (full)
#   ./deploy.sh iqdash          # deploy only files under iqdash/ (targeted)
#   ./deploy.sh iqdash cil      # multiple paths
#
# Credentials come from LOCAL git config (never committed — see .gitignore/
# .git/config). Set them once:
#   git config git-ftp.url      'ftp://45.130.231.110/'
#   git config git-ftp.user     'salesconnect@salesconnect.tapworkspace.com'
#   git config git-ftp.password '********'
# (Plain ftp:// — on Windows curl+schannel the FTPS data channel hangs; the
#  server also serves plain FTP fine.)
#
# Run from a machine WITH network to the FTP host (Windows: Git Bash).
# ─────────────────────────────────────────────────────────────────────────────
set -uo pipefail
cd "$(dirname "$0")"

URL=$(git config --get git-ftp.url || true)
FUSER=$(git config --get git-ftp.user || true)
FPASS=$(git config --get git-ftp.password || true)
if [ -z "$URL" ] || [ -z "$FUSER" ] || [ -z "$FPASS" ]; then
  echo "ERROR: FTP credentials missing in local git config. Set them (NOT committed):"
  echo "  git config git-ftp.url 'ftp://45.130.231.110/'"
  echo "  git config git-ftp.user 'salesconnect@salesconnect.tapworkspace.com'"
  echo "  git config git-ftp.password 'YOUR_PASSWORD'"
  exit 1
fi
BASE="${URL%/}"   # strip trailing slash

# curl reads creds from this file (keeps them out of argv/ps); deleted on exit.
CONF=$(mktemp)
trap 'rm -f "$CONF"' EXIT
printf 'user = "%s:%s"\n--ftp-pasv\n--connect-timeout 25\n--max-time 300\n' "$FUSER" "$FPASS" > "$CONF"

# ── .git-ftp-ignore patterns (files present in git but NOT deployed) ──────────
IGN=()
if [ -f .git-ftp-ignore ]; then
  while IFS= read -r line; do
    [[ "$line" =~ ^[[:space:]]*# ]] && continue
    [[ -z "${line// }" ]] && continue
    IGN+=("$line")
  done < .git-ftp-ignore
fi
is_ignored() {
  local f="$1" p
  for p in "${IGN[@]}"; do
    # shellcheck disable=SC2254
    case "$f" in ($p) return 0;; esac
  done
  return 1
}

# ── optional path filter from args ───────────────────────────────────────────
FILTER=("$@")
in_filter() {
  local f="$1" pre
  [ ${#FILTER[@]} -eq 0 ] && return 0
  for pre in "${FILTER[@]}"; do
    pre="${pre%/}"
    [[ "$f" == "$pre" || "$f" == "$pre/"* ]] && return 0
  done
  return 1
}

# ── build the deploy list ────────────────────────────────────────────────────
files=()
while IFS= read -r f; do
  [ -f "$f" ] || continue
  is_ignored "$f" && continue
  in_filter "$f" || continue
  files+=("$f")
done < <(git ls-files)

if [ ${#files[@]} -eq 0 ]; then echo "Nothing to deploy (check path filter / .git-ftp-ignore)."; exit 0; fi
echo "Deploying ${#files[@]} file(s) → $BASE"

up=0; fail=0; failed=()
for f in "${files[@]}"; do
  lsz=$(wc -c < "$f" | tr -d ' ')
  ok=0; rsz=""
  for try in 1 2 3; do
    curl -sS -K "$CONF" --ftp-create-dirs -T "$f" "$BASE/$f" >/dev/null 2>&1
    rsz=$(curl -sS -K "$CONF" -I "$BASE/$f" 2>/dev/null | tr -d '\r' | awk -F': ' 'tolower($1)=="content-length"{print $2}')
    [ "$rsz" = "$lsz" ] && { ok=1; break; }
  done
  if [ $ok -eq 1 ]; then up=$((up+1));
  else fail=$((fail+1)); failed+=("$f (local=$lsz remote=${rsz:-none})"); echo "  FAIL  $f  local=$lsz remote=${rsz:-none}"; fi
done

echo "─────────────────────────────────────────────"
echo "Deployed OK: $up   Failed: $fail"
if [ $fail -gt 0 ]; then
  printf '  ! %s\n' "${failed[@]}"
  echo "Some files did not verify. Re-run ./deploy.sh (or with the failing path) to retry."
  exit 1
fi
echo "Done → https://salesconnect.tapworkspace.com/"
