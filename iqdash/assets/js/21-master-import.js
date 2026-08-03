/* ═══════════════════════════════════════════════════════════════════
   MASTER DATA IMPORT — quota master Excel → Google Spreadsheet

   Upload the master tracking workbook ("00 IQ Dash - Quota Data …
   dashboard master data.xlsx"), diff it against what the dashboard is
   currently showing, then apply only the changes you tick.

   Flow is deliberately three-step and never writes without a preview:
     1. Upload  → parse the "Status Submisson" sheet in-browser (SheetJS)
     2. Preview → dry-run diff, grouped by category, every row togglable
     3. Apply   → download a full /api/data backup first, then PATCH

   ── What this CAN write, and why the rest is excluded ──────────────
   `PATCH /api/company/:code/cycles` is a FULL REPLACE of the company's
   cycles (iqdash_write.php → iq_build_cycles_replacement drops every
   row for the code, then re-adds what we send). So we always send the
   MERGED list: existing cycles first — including the dashboard-native
   "Revision Request — <product>" ones the Excel knows nothing about —
   with our edits layered on, then any brand-new cycles appended. Losing
   those Revision Request rows would destroy sales-request history.

   `utilization_mt` is NOT writable: it is derived from company_shipments
   lots (iq_recompute_util_from_lots). `available_mt` is only reachable
   through `obtainedStats`, which sets available = max(0, obtained −
   utilization). So the Excel's "Obtained" figures import cleanly, while
   its "Utilization (MT)" row is treated as read-only and merely
   reported when it disagrees — fixing that means fixing shipments.
═══════════════════════════════════════════════════════════════════ */

let _mdParsed  = null;   // { fileName, sheetName, companies:{}, warnings:[] }
let _mdChanges = [];     // flat list of change records (see mdBuildChanges)
let _mdStep    = 1;
let _mdBackupDone = false;
let _mdOnlyCode = '';    // '' = every company; otherwise a single-company trial run

/* Scope gate. Everything the preview shows, counts, ticks and finally
   writes goes through these two, so a trial run on one company cannot
   leak a write to another. */
function mdInScope(c) { return !_mdOnlyCode || c.code === _mdOnlyCode; }
function mdScoped()   { return _mdChanges.filter(mdInScope); }
function mdPicked()   { return _mdChanges.filter(c => c.on && mdInScope(c)); }

/* Category registry. `on` is the default tick state — the two that alter
   representation rather than fix a number start OFF. */
const MD_CATS = {
  cycleNew:  { label: 'Cycle baru',            hint: 'Submit/Obtained/Revision yang ada di Excel tapi belum ada di dashboard', on: true  },
  cycleNum:  { label: 'Angka cycle (MT)',      hint: 'Nilai MT pada cycle yang sudah ada',                                     on: true  },
  cycleDate: { label: 'Tanggal cycle',         hint: 'submitDate / releaseDate — termasuk kolom yang keisi nomor surat',       on: true  },
  cycleProd: { label: 'Produk dalam cycle',    hint: 'Rincian MT per produk di dalam satu cycle',                              on: true  },
  obtained:  { label: 'Obtained per produk',   hint: 'Ditulis via obtainedStats → available = obtained − utilization',         on: true  },
  group:     { label: 'GROUP (AB/CD)',         hint: 'Kolom grp di tab companies',                                             on: true  },
  cosmetic:  { label: 'Label submit/release',  hint: 'Beda urutan kata saja, tidak mengubah angka apa pun',                    on: false },
  revProd:   { label: 'Produk baris Revision', hint: 'Dashboard menyimpan revisi sebagai revFrom/revTo — ini mengubah bentuk penyimpanan', on: false },
};

/* `currentRole` is a plain variable in 10-edit-form.js, but 20-realization-
   import.js calls it as a function — tolerate both rather than betting on
   either. */
function mdActor() {
  try {
    if (typeof currentRole === 'function') return currentRole() || 'Master Import';
    if (typeof currentRole === 'string' && currentRole) return currentRole;
  } catch (e) { /* not defined yet */ }
  return 'Master Import';
}

/* Cycles the Excel has no concept of. Never edited, never dropped.
   Keyed on the type prefix ONLY. `_fromRevReq` looks like it belongs here
   but does not: it flags 9 genuine "Obtained #2" rows that merely
   ORIGINATED from a revision request. Treating those as untouchable made
   the Excel's own "Obtained #2" look like a new cycle, which would have
   appended a duplicate. The flag is still round-tripped in mdMergeCycles. */
function mdIsPreservedCycle(c) {
  return /^Revision Request/i.test(String(c && c.type || ''));
}

/* ── Modal open/close ────────────────────────────────────────────── */
function openMasterImport() {
  document.getElementById('masterImportModal').style.display = 'block';
  mdReset();
  mdBindDropZone();
}

function closeMasterImport() {
  document.getElementById('masterImportModal').style.display = 'none';
}

function mdReset() {
  _mdParsed = null;
  _mdChanges = [];
  _mdBackupDone = false;
  _mdOnlyCode = '';
  _mdStep = 1;
  const inp = document.getElementById('mdFileInput');
  if (inp) inp.value = '';
  mdRenderStep();
}

function mdRenderStep() {
  [1, 2, 3].forEach(n => {
    const pane = document.getElementById('mdStep' + n);
    if (pane) pane.style.display = (n === _mdStep) ? 'block' : 'none';
  });
  const foot = document.getElementById('mdFooter');
  if (foot) foot.style.display = (_mdStep === 2) ? 'flex' : 'none';
}

/* ── Drop zone ───────────────────────────────────────────────────── */
function mdBindDropZone() {
  const dz  = document.getElementById('mdDropZone');
  const inp = document.getElementById('mdFileInput');
  if (!dz || !inp || dz._wired) return;
  dz._wired = true;
  dz.onclick     = () => inp.click();
  dz.ondragover  = e => { e.preventDefault(); dz.classList.add('over'); };
  dz.ondragleave = () => dz.classList.remove('over');
  dz.ondrop      = e => {
    e.preventDefault();
    dz.classList.remove('over');
    if (e.dataTransfer.files.length) mdParseFile(e.dataTransfer.files[0]);
  };
}

function handleMasterFile(ev) {
  const f = ev.target.files && ev.target.files[0];
  if (f) mdParseFile(f);
}

/* ── Excel serial → dd/MM/yyyy ───────────────────────────────────────
   Sheet dates arrive as numbers because we read with raw:true. Anything
   outside a plausible date window (or already text, e.g. "TBA") passes
   through untouched. UTC throughout so a negative TZ offset can't shift
   a date back by one day. */
function mdSerialToDate(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = new Date(Math.round((v - 25569) * 86400000));
    const p = n => String(n).padStart(2, '0');
    return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  }
  return String(v).trim();
}

function mdCell(row, i) {
  if (!row || i == null || i < 0) return '';
  const v = row[i];
  return (v === null || v === undefined) ? '' : (typeof v === 'string' ? v.trim() : v);
}

/* Collapse a multi-line header/label cell into one line. Several cells in
   the workbook wrap ("ZAM⏎Thickness: ≤ 1.2 mm"), and a raw newline both
   breaks matching and renders badly in the preview. */
function mdFlat(v) {
  return String(v === null || v === undefined ? '' : v).replace(/\s+/g, ' ').trim();
}

function mdNum(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  if (s === '') return null;
  const n = Number(s);
  return Number.isNaN(n) ? s : n;   // "TBA" stays "TBA"
}

/* ── Parse ───────────────────────────────────────────────────────── */
async function mdParseFile(file) {
  try { await ensureXLSX(); } catch (e) { /* handled below */ }
  if (typeof XLSX === 'undefined') {
    showToast('Excel parser (SheetJS) belum termuat — refresh halaman', 'error');
    return;
  }
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      _mdParsed = mdParseWorkbook(wb, file.name);
      _mdChanges = mdBuildChanges();
      _mdStep = 2;
      mdRenderStep();
      mdRenderPreview();
    } catch (err) {
      showToast(`Gagal membaca file: ${err.message}`, 'error');
      console.error(err);
    }
  };
  reader.onerror = () => showToast('File gagal dibaca', 'error');
  reader.readAsArrayBuffer(file);
}

function mdParseWorkbook(wb, fileName) {
  const sheetName = wb.SheetNames.find(n => /status\s*submiss?on/i.test(n));
  if (!sheetName) {
    throw new Error(`Sheet "Status Submisson" tidak ada. Sheet yang tersedia: ${wb.SheetNames.join(', ')}`);
  }
  const aoa = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { header: 1, defval: '', raw: true });
  const warnings = [];

  /* Locate the header pair: the row carrying "Company" is the label row,
     the one right below it carries HS codes + the GROUP marker. Found by
     content, never by a hardcoded index, so inserting a title row above
     doesn't break the import. */
  let hdr = -1;
  for (let i = 0; i < Math.min(aoa.length, 20); i++) {
    if ((aoa[i] || []).some(c => String(c).trim().toLowerCase() === 'company')) { hdr = i; break; }
  }
  if (hdr < 0) throw new Error('Baris header tidak ketemu — tidak ada kolom berjudul "Company"');
  const H  = aoa[hdr] || [];
  const HS = aoa[hdr + 1] || [];

  const findIn = (row, re, from = 0) => {
    for (let i = from; i < row.length; i++) if (re.test(String(row[i]).trim())) return i;
    return -1;
  };

  const cCompany = findIn(H, /^company$/i);
  const cStatus  = findIn(H, /^status$/i);
  const cGroup   = findIn(HS, /^group$/i);
  const cJumlah  = findIn(H, /jumlah/i);
  if (cJumlah < 0) throw new Error('Kolom "JUMLAH (MT)" tidak ketemu');

  const cRemarks  = findIn(H, /^remarks$/i, cJumlah);
  const cRemarks2 = findIn(H, /^remarks\s*2$/i, cJumlah);
  const cSubmit   = findIn(H, /^submission$/i, cJumlah);
  const cRelease  = findIn(H, /^release$/i, cJumlah);
  const cStatusTail = findIn(H, /^status$/i, cJumlah);
  // The two "Date" headers sit immediately right of Submission and Release.
  const cSubmitDate  = cSubmit  >= 0 ? cSubmit  + 1 : -1;
  const cReleaseDate = cRelease >= 0 ? cRelease + 1 : -1;

  /* Product columns are identified by HS code, not by their label — the
     labels differ between the workbook and the dashboard master
     ("GI BORON" vs "GI ALLOY") while the HS code is stable. */
  const hsToCanon = {};
  Object.entries(typeof PRODUCT_META === 'object' ? PRODUCT_META : {})
    .forEach(([name, meta]) => { if (meta && meta.hsCode) hsToCanon[String(meta.hsCode).trim()] = name; });

  const prodCols = [];
  for (let i = 0; i < HS.length; i++) {
    const hs = String(HS[i]).trim();
    if (!/^\d{4}\.\d{2}\.\d{2}$/.test(hs)) continue;
    const canon = hsToCanon[hs];
    const raw = mdFlat(H[i]);
    if (!canon) {
      warnings.push(`Kolom "${raw || '(tanpa judul)'}" (HS ${hs}) tidak punya padanan di master produk dashboard — kolom ini dilewati.`);
      continue;
    }
    prodCols.push({ i, hs, canon, raw });
  }
  if (!prodCols.length) throw new Error('Tidak ada satu pun kolom produk yang cocok dengan master produk dashboard');

  const companies = {};
  let cur = null;

  for (let r = hdr + 2; r < aoa.length; r++) {
    const row = aoa[r];
    if (!row || row.every(v => v === '' || v === null || v === undefined)) continue;

    const coRaw = mdFlat(mdCell(row, cCompany));
    if (coRaw) {
      /* The cell may carry an alias on a second line or in brackets —
         "AMP⏎(SUJU)" / "AMP | (SUJU)". Flatten first (mdFlat), then keep
         only the leading code. Splitting on "|" alone silently produced
         the code "AMP (SUJU)", which matched no company and dropped AMP
         from the import entirely. */
      const code = coRaw.split(/[|(]/)[0].trim().toUpperCase();
      cur = code;
      companies[code] = {
        code, rawName: coRaw,
        group: String(mdCell(row, cGroup)).trim(),
        cycles: [], util: {}, avail: {},
        utilTotal: null, availTotal: null,
        excelRow: r + 1,
      };
    }
    if (!cur) continue;

    const rawStatus = mdFlat(mdCell(row, cStatus));
    if (!rawStatus) continue;
    // Tolerate the known "Utilizaion (date)" typo in the source workbook.
    const status = rawStatus.replace(/Utilizaion/gi, 'Utilization');

    const products = {};
    prodCols.forEach(pc => {
      const v = mdCell(row, pc.i);
      if (v === '') return;
      products[pc.canon] = mdNum(v);
    });

    if (/^Utilization \(MT\)$/i.test(status)) {
      companies[cur].util = products;
      companies[cur].utilTotal = mdNum(mdCell(row, cJumlah));
    } else if (/^Available \(MT\)$/i.test(status)) {
      companies[cur].avail = products;
      companies[cur].availTotal = mdNum(mdCell(row, cJumlah));
    } else if (/^Utilization \(date\)$/i.test(status)) {
      /* Per-product utilization dates: informational only. Nothing on the
         write surface accepts them, so they are parsed and ignored. */
    } else {
      companies[cur].cycles.push({
        type: status,
        mt: mdNum(mdCell(row, cJumlah)),
        products,
        remarks:     mdFlat(mdCell(row, cRemarks)),
        remarks2:    mdFlat(mdCell(row, cRemarks2)),
        submitType:  mdFlat(mdCell(row, cSubmit)),
        submitDate:  mdSerialToDate(mdCell(row, cSubmitDate)),
        releaseType: mdFlat(mdCell(row, cRelease)),
        releaseDate: mdSerialToDate(mdCell(row, cReleaseDate)),
        status:      mdFlat(mdCell(row, cStatusTail)),
        excelRow:    r + 1,
      });
    }
  }

  const n = Object.keys(companies).length;
  if (!n) throw new Error('Tidak ada baris company yang terbaca');

  return { fileName, sheetName, companies, warnings, prodCols };
}

/* ── Preferred spelling when writing a product into cycle_products ────
   cycle_products historically stores the workbook's own spelling
   ("GI BORON") and the dashboard resolves it through PRODUCT_ALIASES at
   render time. Keep that convention: reuse whatever spelling already
   appears in the data for the same canonical product, and only fall back
   to the canonical name when nothing exists yet. */
function mdWriteNameFor(canon) {
  const tally = {};
  [...(typeof SPI !== 'undefined' ? SPI : []), ...(typeof PENDING !== 'undefined' ? PENDING : [])]
    .forEach(co => (co.cycles || []).forEach(cy => {
      Object.keys(cy.products || {}).forEach(raw => {
        if (canonicalProduct(raw) === canon) tally[raw] = (tally[raw] || 0) + 1;
      });
    }));
  const best = Object.keys(tally).sort((a, b) => tally[b] - tally[a])[0];
  return best || canon;
}

/* ── Diff ────────────────────────────────────────────────────────── */
function mdNorm(v) {
  if (v === null || v === undefined) return '';
  return String(v).trim();
}

/* Numeric-aware equality: 2600 and "2600" match, "TBA" and "" do not. */
function mdSame(a, b) {
  const A = mdNorm(a), B = mdNorm(b);
  if (A === B) return true;
  const na = Number(A), nb = Number(B);
  if (A !== '' && B !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) return na === nb;
  return false;
}

function mdBuildChanges() {
  const out = [];
  let seq = 0;
  const push = (cat, code, rec) => {
    if (!MD_CATS[cat]) return;
    out.push(Object.assign({ id: 'c' + (++seq), cat, code, on: MD_CATS[cat].on }, rec));
  };

  const dash = {};
  [...(typeof SPI !== 'undefined' ? SPI : []), ...(typeof PENDING !== 'undefined' ? PENDING : [])]
    .forEach(c => { dash[c.code] = c; });

  Object.values(_mdParsed.companies).forEach(x => {
    const d = dash[x.code];
    if (!d) {
      _mdParsed.warnings.push(`Company ${x.code} ada di Excel tapi tidak ada di dashboard — dilewati (importir ini tidak membuat company baru).`);
      return;
    }

    /* GROUP */
    if (x.group && !mdSame(x.group, d.group)) {
      push('group', x.code, { label: 'GROUP', from: mdNorm(d.group) || '(kosong)', to: x.group });
    }

    /* Cycles — preserved ones are invisible to the diff entirely. */
    const byType = {};
    (d.cycles || []).forEach(c => { if (!mdIsPreservedCycle(c)) byType[c.type] = c; });

    x.cycles.forEach(xc => {
      const dc = byType[xc.type];
      if (!dc) {
        const plist = Object.keys(xc.products).map(p => `${p}=${xc.products[p]}`).join(', ');
        push('cycleNew', x.code, {
          label: xc.type, field: '(cycle baru)',
          from: '(belum ada)',
          to: `mt=${mdNorm(xc.mt) || '—'} · ${plist || 'tanpa produk'} · ${xc.submitType} ${xc.submitDate} → ${xc.releaseType} ${xc.releaseDate}`,
          cycle: xc,
        });
        return;
      }
      const isRev = /^Revision #/i.test(xc.type);

      /* An empty JUMLAH cell against a dashboard 0 is not a correction —
         it is the same fact written two ways. Skip, or every Revision row
         generates a meaningless "0 → (kosong)" entry. */
      const mtNoise = mdNorm(xc.mt) === '' && Number(dc.mt) === 0;
      if (!mtNoise && !mdSame(xc.mt, dc.mt)) {
        push('cycleNum', x.code, { label: xc.type, field: 'mt', from: mdNorm(dc.mt) || '(kosong)', to: mdNorm(xc.mt) || '(kosong)', cycleType: xc.type, key: 'mt', val: xc.mt });
      }
      [['submitDate', 'submitDate'], ['releaseDate', 'releaseDate']].forEach(([k]) => {
        if (mdNorm(xc[k]) === '' && mdNorm(dc[k]) === '') return;
        if (!mdSame(xc[k], dc[k])) {
          push('cycleDate', x.code, { label: xc.type, field: k, from: mdNorm(dc[k]) || '(kosong)', to: mdNorm(xc[k]) || '(kosong)', cycleType: xc.type, key: k, val: xc[k] });
        }
      });
      [['submitType'], ['releaseType']].forEach(([k]) => {
        if (mdNorm(xc[k]) === '' && mdNorm(dc[k]) === '') return;
        if (!mdSame(xc[k], dc[k])) {
          push('cosmetic', x.code, { label: xc.type, field: k, from: mdNorm(dc[k]) || '(kosong)', to: mdNorm(xc[k]) || '(kosong)', cycleType: xc.type, key: k, val: xc[k] });
        }
      });

      /* Products inside the cycle — compare canonically, write rawly. */
      const dProd = {};
      Object.keys(dc.products || {}).forEach(raw => { dProd[canonicalProduct(raw)] = dc.products[raw]; });
      const keys = [...new Set([...Object.keys(xc.products), ...Object.keys(dProd)])];
      keys.forEach(p => {
        const xv = Object.prototype.hasOwnProperty.call(xc.products, p) ? xc.products[p] : null;
        const dv = Object.prototype.hasOwnProperty.call(dProd, p) ? dProd[p] : null;
        if (mdSame(xv, dv)) return;
        if (xv === null && dv === null) return;
        push(isRev ? 'revProd' : 'cycleProd', x.code, {
          label: xc.type, field: `produk ${p}`,
          from: dv === null ? '(tidak ada)' : mdNorm(dv),
          to:   xv === null ? '(dihapus)'   : mdNorm(xv),
          cycleType: xc.type, product: p, val: xv,
        });
      });
    });

    /* Obtained per product: Excel sums every "Obtained #n" row; the
       dashboard equivalent is utilization + available (see
       iqdash_write.php — obtained = utilization_mt + available_quota). */
    const xObt = {};
    x.cycles.forEach(c => {
      if (!/^Obtained/i.test(c.type)) return;
      Object.keys(c.products).forEach(p => {
        const n = Number(c.products[p]);
        if (!Number.isNaN(n)) xObt[p] = (xObt[p] || 0) + n;
      });
    });
    /* utilizationByProd/availableByProd are keyed canonically today, but
       canonicalise anyway so an alias creeping into the stats tab cannot
       silently split one product into two rows here. */
    const dUtilC = {}, dAvailC = {};
    Object.keys(d.utilizationByProd || {}).forEach(raw => {
      const c = canonicalProduct(raw);
      dUtilC[c] = (dUtilC[c] || 0) + (Number(d.utilizationByProd[raw]) || 0);
    });
    Object.keys(d.availableByProd || {}).forEach(raw => {
      const c = canonicalProduct(raw);
      dAvailC[c] = (dAvailC[c] || 0) + (Number(d.availableByProd[raw]) || 0);
    });
    const dObt = {};
    [...new Set([...Object.keys(dUtilC), ...Object.keys(dAvailC)])].forEach(c => {
      dObt[c] = (dUtilC[c] || 0) + (dAvailC[c] || 0);
    });
    [...new Set([...Object.keys(xObt), ...Object.keys(dObt)])].forEach(p => {
      const xv = xObt[p], dv = dObt[p];
      if (xv === undefined) return;                 // never zero out what Excel omits
      if (dv !== undefined && Math.abs(xv - dv) < 0.001) return;
      const utilNow = dUtilC[p] || 0;
      push('obtained', x.code, {
        label: p, field: 'obtained',
        from: dv === undefined ? '(tidak ada)' : String(dv),
        to: String(xv),
        note: xv < utilNow ? `⚠ di bawah utilization (${utilNow}) — available akan jadi 0` : '',
        product: p, val: xv,
      });
    });

    /* Utilization is derived from shipments — report only, never write. */
    Object.keys(x.util).forEach(p => {
      const dv = dUtilC[p] === undefined ? NaN : dUtilC[p];
      const xv = Number(x.util[p]);
      if (Number.isNaN(xv)) return;
      if (!Number.isNaN(dv) && Math.abs(xv - dv) < 0.001) return;
      _mdParsed.warnings.push(
        `${x.code} · utilization ${p}: Excel ${xv} vs dashboard ${Number.isNaN(dv) ? '(tidak ada)' : dv}. ` +
        `Utilization dihitung dari data shipment, tidak bisa ditulis dari sini — perbaiki lewat Shipment.`
      );
    });
  });

  return out;
}

/* ── Preview ─────────────────────────────────────────────────────── */
function mdRenderPreview() {
  const p = _mdParsed;
  const sum = document.getElementById('mdSummary');
  const cats = document.getElementById('mdCats');
  const body = document.getElementById('mdTableBody');
  const warn = document.getElementById('mdWarnings');
  if (!sum || !cats || !body) return;

  const nCo = Object.keys(p.companies).length;
  sum.innerHTML =
    `<strong>${p.fileName}</strong> — sheet "${p.sheetName}" · ${nCo} company · ` +
    `${p.prodCols.length} kolom produk terpetakan · <strong>${_mdChanges.length}</strong> selisih terdeteksi` +
    (_mdOnlyCode
      ? `<div style="margin-top:6px;padding:5px 9px;background:#fef3c7;border:1px solid #fcd34d;border-radius:4px;color:#78350f;font-weight:700">
           🔒 Uji coba satu company — hanya <strong>${_mdOnlyCode}</strong> yang akan ditulis (${mdScoped().length} selisih). Company lain diabaikan.
         </div>`
      : '');

  /* Company scope picker — only companies that actually have a diff. */
  const scopeSel = document.getElementById('mdScope');
  if (scopeSel) {
    const codes = [...new Set(_mdChanges.map(c => c.code))].sort();
    scopeSel.innerHTML =
      `<option value="">Semua company (${codes.length})</option>` +
      codes.map(k => {
        const n = _mdChanges.filter(c => c.code === k).length;
        return `<option value="${k}" ${k === _mdOnlyCode ? 'selected' : ''}>${k} — ${n} selisih</option>`;
      }).join('');
  }

  const scoped = mdScoped();
  const counts = {};
  scoped.forEach(c => { counts[c.cat] = (counts[c.cat] || 0) + 1; });
  cats.innerHTML = Object.keys(MD_CATS).map(k => {
    const n = counts[k] || 0;
    const anyOn = scoped.some(c => c.cat === k && c.on);
    return `
      <label title="${MD_CATS[k].hint}" style="display:inline-flex;align-items:center;gap:6px;padding:5px 10px;border:1px solid var(--border);border-radius:var(--r);background:${n ? 'var(--surf)' : 'transparent'};opacity:${n ? 1 : .45};cursor:${n ? 'pointer' : 'default'};font-size:11px;font-weight:600">
        <input type="checkbox" ${anyOn ? 'checked' : ''} ${n ? '' : 'disabled'} onchange="mdToggleCat('${k}',this.checked)">
        ${MD_CATS[k].label} <span style="color:var(--txt3);font-weight:700">${n}</span>
      </label>`;
  }).join('');

  if (warn) {
    warn.style.display = p.warnings.length ? 'block' : 'none';
    warn.innerHTML = p.warnings.length
      ? `<strong>⚠ ${p.warnings.length} catatan</strong><ul style="margin:6px 0 0 16px;padding:0">` +
        p.warnings.map(w => `<li style="margin-bottom:3px">${w}</li>`).join('') + '</ul>'
      : '';
  }

  if (!scoped.length) {
    body.innerHTML = `<tr><td colspan="6" style="padding:24px;text-align:center;color:var(--green)">✅ ${
      _mdOnlyCode ? `Tidak ada selisih untuk ${_mdOnlyCode}.` : 'Tidak ada selisih — dashboard sudah sama dengan Excel.'
    }</td></tr>`;
    mdUpdateApplyCount();
    return;
  }

  const rows = [...scoped].sort((a, b) =>
    a.code.localeCompare(b.code) || a.cat.localeCompare(b.cat) || String(a.label).localeCompare(String(b.label)));

  body.innerHTML = rows.map(c => `
    <tr style="opacity:${c.on ? 1 : .5}">
      <td style="padding:4px 6px;border-bottom:1px solid var(--border);text-align:center">
        <input type="checkbox" ${c.on ? 'checked' : ''} onchange="mdToggleOne('${c.id}',this.checked)">
      </td>
      <td style="padding:4px 6px;border-bottom:1px solid var(--border);font-weight:700">${c.code}</td>
      <td style="padding:4px 6px;border-bottom:1px solid var(--border)"><span style="font-size:9px;font-weight:700;padding:1px 5px;border-radius:3px;background:var(--blue-bg);color:var(--blue);border:1px solid var(--blue-bd)">${MD_CATS[c.cat].label}</span></td>
      <td style="padding:4px 6px;border-bottom:1px solid var(--border)">${c.label}${c.field && c.field !== '(cycle baru)' ? ` · <span style="color:var(--txt3)">${c.field}</span>` : ''}</td>
      <td style="padding:4px 6px;border-bottom:1px solid var(--border);color:var(--txt3);font-family:'DM Mono',monospace;font-size:10px">${c.from}</td>
      <td style="padding:4px 6px;border-bottom:1px solid var(--border);font-weight:700;font-family:'DM Mono',monospace;font-size:10px">${c.to}${c.note ? `<div style="font-weight:600;color:var(--red2);font-size:9.5px">${c.note}</div>` : ''}</td>
    </tr>`).join('');

  mdUpdateApplyCount();
}

/* Scope-aware: ticking a category affects only what is currently visible,
   so it can never silently re-arm a change for a company you filtered out. */
function mdToggleCat(cat, on) {
  _mdChanges.forEach(c => { if (c.cat === cat && mdInScope(c)) c.on = on; });
  mdRenderPreview();
}

function mdSetScope(code) {
  _mdOnlyCode = code || '';
  mdRenderPreview();
}

function mdToggleOne(id, on) {
  const c = _mdChanges.find(x => x.id === id);
  if (c) c.on = on;
  mdUpdateApplyCount();
}

function mdUpdateApplyCount() {
  const picked = mdPicked();
  const n = picked.length;
  const codes = new Set(picked.map(c => c.code));
  const el = document.getElementById('mdApplyCount');
  if (el) el.textContent = `${n} perubahan · ${codes.size} company` + (_mdOnlyCode ? ' (uji coba)' : '');
  /* The backup requirement is enforced in the UI, not only at click time,
     so "Terapkan" is never offered as available before a backup exists. */
  const btn = document.getElementById('mdApplyBtn');
  if (btn) {
    btn.disabled = !n || !_mdBackupDone;
    btn.title = !n ? 'Belum ada perubahan yang dicentang'
              : !_mdBackupDone ? 'Unduh backup dulu' : '';
  }
}

/* ── Backup ──────────────────────────────────────────────────────── */
async function mdDownloadBackup() {
  const btn = document.getElementById('mdBackupBtn');
  if (btn) { btn.disabled = true; btn.textContent = 'Mengunduh…'; }
  try {
    const res = await fetch('api/data');
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const txt = await res.text();
    const now = new Date();
    const p = n => String(n).padStart(2, '0');
    const stamp = `${now.getFullYear()}${p(now.getMonth() + 1)}${p(now.getDate())}-${p(now.getHours())}${p(now.getMinutes())}`;
    const url = URL.createObjectURL(new Blob([txt], { type: 'application/json' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `iqdash-backup-${stamp}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    _mdBackupDone = true;
    showToast('Backup terunduh', 'success');
  } catch (err) {
    showToast(`Backup gagal: ${err.message} — apply dibatalkan`, 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.textContent = _mdBackupDone ? '⬇ Backup ✓' : '⬇ Unduh backup'; }
    mdUpdateApplyCount();   // unlocks "Terapkan" once a backup exists
  }
}

/* ── Apply ───────────────────────────────────────────────────────── */
async function mdApply() {
  const picked = mdPicked();
  if (!picked.length) return;

  if (!_mdBackupDone) {
    showToast('Unduh backup dulu sebelum menerapkan perubahan', 'error');
    return;
  }
  const codes = [...new Set(picked.map(c => c.code))];
  const scopeNote = _mdOnlyCode ? `\n\nMode uji coba: HANYA ${_mdOnlyCode} yang ditulis.` : '';
  if (!confirm(`Terapkan ${picked.length} perubahan ke ${codes.length} company?${scopeNote}\n\nData ditulis langsung ke Google Spreadsheet.`)) return;

  _mdStep = 3;
  mdRenderStep();
  const log = document.getElementById('mdApplyLog');
  const write = (msg, kind) => {
    if (!log) return;
    const color = kind === 'err' ? 'var(--red2)' : kind === 'ok' ? 'var(--green)' : 'var(--txt2)';
    log.innerHTML += `<div style="color:${color};padding:2px 0">${msg}</div>`;
    log.scrollTop = log.scrollHeight;
  };

  const dash = {};
  [...(typeof SPI !== 'undefined' ? SPI : []), ...(typeof PENDING !== 'undefined' ? PENDING : [])]
    .forEach(c => { dash[c.code] = c; });

  let okCount = 0, errCount = 0;

  for (const code of codes) {
    const mine = picked.filter(c => c.code === code);
    const co = dash[code];
    if (!co) { write(`✗ ${code}: tidak ada di data dashboard`, 'err'); errCount++; continue; }
    write(`▸ ${code} — ${mine.length} perubahan…`);

    try {
      /* 1. company-level: grp + obtainedStats */
      const grpChange = mine.find(c => c.cat === 'group');
      const obtChanges = mine.filter(c => c.cat === 'obtained');
      if (grpChange || obtChanges.length) {
        const body = { _ifUpdatedAt: co.updatedAt || null, updatedBy: mdActor() };
        if (grpChange) body.grp = grpChange.to;
        if (obtChanges.length) {
          body.obtainedStats = obtChanges.map(c => ({ product: mdWriteNameFor(c.product), obtained: c.val }));
        }
        const r = await fetch(`api/company/${encodeURIComponent(code)}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error === 'stale'
            ? 'data di server sudah berubah sejak halaman dimuat — refresh lalu ulangi'
            : (e.error || `HTTP ${r.status}`));
        }
        write(`  ✓ company (${grpChange ? 'grp' : ''}${grpChange && obtChanges.length ? ' + ' : ''}${obtChanges.length ? `${obtChanges.length} obtained` : ''})`, 'ok');
      }

      /* 2. cycles — always send the MERGED list */
      const cycleCats = ['cycleNew', 'cycleNum', 'cycleDate', 'cycleProd', 'cosmetic', 'revProd'];
      const cyChanges = mine.filter(c => cycleCats.includes(c.cat));
      if (cyChanges.length) {
        const merged = mdMergeCycles(co, cyChanges);
        const r = await fetch(`api/company/${encodeURIComponent(code)}/cycles`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cycles: merged }),
        });
        if (!r.ok) {
          const e = await r.json().catch(() => ({}));
          throw new Error(e.error || `HTTP ${r.status}`);
        }
        const kept = merged.filter(mdIsPreservedCycle).length;
        write(`  ✓ cycles: ${merged.length} baris ditulis (${kept} Revision Request dipertahankan)`, 'ok');
      }

      okCount++;
    } catch (err) {
      write(`  ✗ ${code}: ${err.message}`, 'err');
      errCount++;
    }
  }

  write('');
  write(`Selesai — ${okCount} company berhasil, ${errCount} gagal.`, errCount ? 'err' : 'ok');
  if (okCount) {
    write('Memuat ulang data dashboard…');
    try { await loadData(); write('✓ Dashboard diperbarui', 'ok'); }
    catch (e) { write('Reload gagal — refresh halaman manual', 'err'); }
  }
  const done = document.getElementById('mdDoneBtn');
  if (done) done.style.display = 'inline-block';
}

/* Build the full cycles array to send: every existing cycle in order
   (preserved ones untouched, others with the ticked edits applied),
   then the ticked new cycles appended. */
function mdMergeCycles(co, changes) {
  const edits = {};   // cycleType → { field/product edits }
  const news  = [];
  changes.forEach(c => {
    if (c.cat === 'cycleNew') { news.push(c.cycle); return; }
    const t = c.cycleType;
    if (!t) return;
    if (!edits[t]) edits[t] = { fields: {}, products: {} };
    if (c.product) edits[t].products[c.product] = c.val;
    else if (c.key) edits[t].fields[c.key] = c.val;
  });

  const out = (co.cycles || []).map(cy => {
    const clone = {
      type: cy.type, mt: cy.mt,
      submitType: cy.submitType, submitDate: cy.submitDate,
      releaseType: cy.releaseType, releaseDate: cy.releaseDate,
      status: cy.status,
      products: Object.assign({}, cy.products || {}),
      pertekDate: cy.pertekDate, spiDate: cy.spiDate,
      _fromRevReq: cy._fromRevReq,
    };
    if (mdIsPreservedCycle(cy)) return clone;      // never edited
    const e = edits[cy.type];
    if (!e) return clone;
    Object.keys(e.fields).forEach(k => { clone[k] = e.fields[k]; });
    Object.keys(e.products).forEach(canon => {
      const v = e.products[canon];
      // Replace under whatever spelling the row already uses, else add.
      const existing = Object.keys(clone.products).find(raw => canonicalProduct(raw) === canon);
      if (v === null) { if (existing) delete clone.products[existing]; return; }
      clone.products[existing || mdWriteNameFor(canon)] = v;
    });
    return clone;
  });

  news.forEach(xc => {
    const products = {};
    Object.keys(xc.products).forEach(canon => { products[mdWriteNameFor(canon)] = xc.products[canon]; });
    out.push({
      type: xc.type, mt: xc.mt,
      submitType: xc.submitType, submitDate: xc.submitDate,
      releaseType: xc.releaseType, releaseDate: xc.releaseDate,
      status: xc.status, products,
      pertekDate: '', spiDate: '', _fromRevReq: false,
    });
  });

  return out;
}

function mdFinish() {
  closeMasterImport();
  mdReset();
}
