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
#   ./deploy.sh --lock-only     # only (re)lock tracked files on the server
#
# SERVER LOCK (since 2026-10-20): code on the server is kept READ-ONLY
# (files 444, folders 555) so a stray FTP upload of an old copy fails instead
# of silently replacing live code (outages 19-Oct & 20-Oct-2026, see
# logs/insiden-upload-versi-lama_2026-10-19_log.md). This script unlocks
# exactly the files/folders it deploys, uploads, then locks them again.
# cache/ is never locked — the app writes there at runtime (OTP, tokens,
# memo files, OCR jobs). Dashboard upload/input buttons write to Google
# Sheets/cache, not code, so they are unaffected.
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

# ── server lock helpers ──────────────────────────────────────────────────────
# Folders that the app writes to at runtime — never lock these.
NOLOCK_DIRS=(cache .well-known)
is_nolock_dir() {
  local d="$1" n
  for n in "${NOLOCK_DIRS[@]}"; do
    [[ "$d" == "$n" || "$d" == "$n/"* ]] && return 0
  done
  return 1
}
# ftp_chmod MODE path...  — batched SITE CHMOD over one connection per chunk.
# A leading '*' tells curl to ignore a failing quote (e.g. file not there yet).
ftp_chmod() {
  local mode="$1"; shift
  local q=() p n=0
  for p in "$@"; do
    q+=(-Q "*SITE CHMOD $mode $p"); n=$((n+1))
    if [ $n -ge 80 ]; then
      curl -sS -K "$CONF" "${q[@]}" -l "$BASE/" >/dev/null 2>&1; q=(); n=0
    fi
  done
  [ $n -gt 0 ] && curl -sS -K "$CONF" "${q[@]}" -l "$BASE/" >/dev/null 2>&1
  return 0
}
# parent_dirs file...  — unique list of every parent folder (not the root).
parent_dirs() {
  local f d
  for f in "$@"; do
    d="$(dirname "$f")"
    while [ "$d" != "." ] && [ -n "$d" ]; do echo "$d"; d="$(dirname "$d")"; done
  done | sort -u
}
lock_files() {   # lock_files file...
  local dirs=() d lf=() f
  for f in "$@"; do is_nolock_dir "$(dirname "$f")" || lf+=("$f"); done
  while IFS= read -r d; do is_nolock_dir "$d" || dirs+=("$d"); done < <(parent_dirs "$@")
  [ ${#lf[@]} -gt 0 ] && ftp_chmod 444 "${lf[@]}"
  [ ${#dirs[@]} -gt 0 ] && ftp_chmod 555 "${dirs[@]}"
  return 0
}
unlock_files() { # unlock_files file...
  local dirs=() d
  while IFS= read -r d; do dirs+=("$d"); done < <(parent_dirs "$@")
  [ ${#dirs[@]} -gt 0 ] && ftp_chmod 755 "${dirs[@]}"
  ftp_chmod 644 "$@"
}

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

# ── optional path filter from args (plus --allow-dirty escape hatch) ─────────
ALLOW_DIRTY=0
LOCK_ONLY=0
ARGS=()
for a in "$@"; do
  case "$a" in
    --allow-dirty) ALLOW_DIRTY=1;;
    --lock-only)   LOCK_ONLY=1;;
    *)             ARGS+=("$a");;
  esac
done
FILTER=("${ARGS[@]+"${ARGS[@]}"}")
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

if [ $LOCK_ONLY -eq 1 ]; then
  echo "Locking ${#files[@]} file(s) + their folders read-only on $BASE …"
  lock_files "${files[@]}"
  echo "Locked (files 444, folders 555; cache/ left writable)."
  exit 0
fi

# ── clean-tree guard ─────────────────────────────────────────────────────────
# This script uploads the WORKING TREE, not a commit. Without this check an
# edit that is still in progress (e.g. another session mid-save) silently goes
# live — it happened on 2026-08-12 with iqdash/assets/js/13-rev-mgmt.js, which
# reached production as an untested half-written file. Deploy only what is
# committed; use --allow-dirty to override deliberately.
dirty=()
for f in "${files[@]}"; do
  git diff --quiet HEAD -- "$f" 2>/dev/null || dirty+=("$f")
done
if [ ${#dirty[@]} -gt 0 ]; then
  echo "REFUSING TO DEPLOY — ${#dirty[@]} file(s) in this set differ from the last commit:"
  printf '  ! %s\n' "${dirty[@]}"
  if [ $ALLOW_DIRTY -eq 1 ]; then
    echo "--allow-dirty given → continuing anyway."
  else
    echo "Commit them (or 'git stash') first, then re-run. To deploy uncommitted"
    echo "work on purpose: ./deploy.sh ${FILTER[*]:-} --allow-dirty"
    exit 1
  fi
fi

echo "Deploying ${#files[@]} file(s) → $BASE"
echo "Unlocking target files on the server …"
unlock_files "${files[@]}"
# Re-lock even if the upload loop is interrupted (Ctrl+C) or fails.
trap 'echo "Re-locking …"; lock_files "${files[@]}"; rm -f "$CONF"' EXIT

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
