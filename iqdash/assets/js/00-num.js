/* ═══════════════════════════════════════
   NUMBER FORMAT — locale lock + safe parse
   Loaded first; pure (no DOM), so tests/test_mt_format.cjs can require it.
═══════════════════════════════════════ */

/* Every number in this module is read and written in the en-US convention:
   comma = thousand separator, dot = decimal point. That was already true of all
   23 parse sites and of fmtThousandInline — but display used to call
   toLocaleString() with NO locale argument, which follows the BROWSER locale.
   On an id-ID browser the dashboard rendered "4.150" while the parsers still
   expected "4,150", so a user who typed back what they saw ("2.000", meaning
   2000) had it stored as 2 — silently, no error. That is exactly how company
   IKM lost 1998 MT of utilization.
   See logs/fix-ikm-utilization_2026-07-27_log.md and
       logs/audit-mt-truncation_2026-07-27_log.md.
   Keep this explicit. A bare toLocaleString() is a regression — the structural
   check in tests/test_mt_format.cjs fails the build if one reappears. */
const MT_LOCALE = 'en-US';

/* Display formatter. Use everywhere a number is rendered for a human. */
function fmtNum(v, opts) {
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v == null ? '' : v);
  return n.toLocaleString(MT_LOCALE, opts);
}

/* Is this text ambiguous enough that we must NOT guess at its value?
   A trailing dot group of 3+ digits is either
     (a) an Indonesian thousand separator — "2.000" meaning 2000, or
     (b) more precision than these fields can hold (they cap at 2 dp).
   Both used to be silently mangled. Neither may be guessed at. */
function mtAmbiguous(str) {
  const s = String(str == null ? '' : str).trim();
  if (!s) return false;
  const m = s.match(/[.](\d+)$/);
  return !!m && m[1].length > 2;
}

/* Single parse entry point for every MT text field.
   Returns a finite number, or null when the text is empty, malformed, or
   ambiguous. null means "do not save" — callers must never coerce it to 0. */
function parseMT(str) {
  const s = String(str == null ? '' : str).trim();
  if (!s || mtAmbiguous(s)) return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* Node (tests) only — harmless in the browser, where this file is a classic
   script and the declarations above are already globals. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MT_LOCALE, fmtNum, mtAmbiguous, parseMT };
}
