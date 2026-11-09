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

/* Titik yang tidak bisa dibaca sebagai desimal en-US:
     (a) grup 3+ digit di akhir: ribuan gaya Indonesia ("2.000") atau lebih
         presisi daripada yang tertampung (2 desimal);
     (b) koma sesudah titik: desimal gaya Indonesia ("1.234,5");
     (c) lebih dari satu titik ("1.23.45"). */
function mtTitikSalah(str) {
  const s = String(str == null ? '' : str).trim();
  if (!s) return false;
  if (/\..*,/.test(s) || (s.match(/\./g) || []).length > 1) return true;
  const m = s.match(/[.](\d+)$/);
  return !!m && m[1].length > 2;
}

/* Is this text ambiguous enough that we must NOT guess at its value?
   Selain titik di atas, koma harus benar-benar pemisah ribuan. "123,5" dulu
   dibaca 1235 dan "2,5" dibaca 25 (koma dibuang begitu saja), tanpa peringatan. */
function mtAmbiguous(str) {
  const s = String(str == null ? '' : str).trim();
  if (!s) return false;
  if (mtTitikSalah(s)) return true;
  return s.includes(',') && !/^-?\d{1,3}(,\d{3})+(\.\d*)?$/.test(s);
}

/* Pemeriksaan saat MENGETIK. Kolom MT diformat ulang setiap ketukan, jadi koma
   buatan formatter wajar berada di posisi "salah" sesaat: 2,000 + "5" = "2,0005",
   dan backspace pada 2,000 = "2,00". Keduanya harus tetap lolos. Yang ditolak:
     - koma yang diketik sendiri lalu diikuti kurang dari 3 digit ("123,5");
     - teks tempelan (bertambah lebih dari satu karakter) yang ambigu.
   Kolom kembali sah begitu digit ke-3 masuk ("2,000"), atau komanya dihapus. */
function mtKetikanSalah(raw, sebelumnya) {
  if (mtTitikSalah(raw)) return true;
  const tumbuh = String(raw).length - String(sebelumnya == null ? '' : sebelumnya).length;
  if (tumbuh > 0 && /,\d{0,2}$/.test(raw)) return true;
  return tumbuh > 1 && mtAmbiguous(raw);
}

/* Single parse entry point for every MT text field.
   Returns a finite number, or null when the text is empty, malformed, or
   ambiguous. null means "do not save" — callers must never coerce it to 0. */
function parseMT(str) {
  const s = String(str == null ? '' : str).trim();
  if (!s || mtAmbiguous(s) || !/^-?[\d,]*\.?\d*$/.test(s)) return null;
  const n = parseFloat(s.replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

/* Node (tests) only — harmless in the browser, where this file is a classic
   script and the declarations above are already globals. */
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { MT_LOCALE, fmtNum, mtTitikSalah, mtAmbiguous, mtKetikanSalah, parseMT };
}
