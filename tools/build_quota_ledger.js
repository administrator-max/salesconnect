#!/usr/bin/env node
/**
 * Node port of tools/build_quota_ledger.py — generates iqdash/data/quotaLedger.json
 * from the IQ Dash master workbook. Same model, same output shape; see the
 * Python file's docstring for WHY the ledger exists and how the master is laid
 * out. This port exists because the machine that owns the master has Node and
 * the vendored SheetJS but no Python/openpyxl; keep the two in step, or delete
 * whichever one stops being used.
 *
 *   node tools/build_quota_ledger.js <master.xlsx> [-o out.json]
 *        [--check ref.json] [--names-from ref.json]
 *
 * --check compares against an existing ledger instead of writing. Run it
 * against the current quotaLedger.json before trusting a regenerate: every
 * mismatch it prints must be one you can explain from a master edit.
 */
'use strict';
const fs = require('fs');
const path = require('path');
const XLSX = require(path.join(__dirname, '..', 'iqdash', 'assets', 'vendor', 'xlsx.full.min.js'));

const NAME_ROW = 1, HS_ROW = 2;              // 0-indexed (Python used 1-indexed 2 / 3)
const COL_NO = 0, COL_COMPANY = 1, COL_LABEL = 2;
const TOTAL_HDR = 'JUMLAH (MT)';

const clean = v => (v === null || v === undefined) ? '' : String(v).trim();

function num(v) {
  if (typeof v === 'number') return v;
  const s = clean(v).replace(/,/g, '');
  if (!s || ['TBA', '-'].includes(s.toUpperCase())) return 0;
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

function build(file) {
  const wb = XLSX.read(fs.readFileSync(file), { type: 'buffer' });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets['Status Submisson'], { header: 1, raw: true, defval: null, blankrows: true });
  const width = rows.reduce((m, r) => Math.max(m, (r || []).length), 0);

  const cols = new Map();        // col index -> hs
  const products = new Map();    // hs -> product name
  for (let c = 0; c < width; c++) {
    const hs = clean((rows[HS_ROW] || [])[c]);
    if (!/^\d{4}[.]?\d{2}[.]?\d{2}$|^\d{8,10}$/.test(hs.replace(/ /g, ''))) continue;
    let name = clean((rows[NAME_ROW] || [])[c]);
    if (name === TOTAL_HDR) continue;
    name = name.replace(/\s+/g, ' ').trim();
    cols.set(c, hs);
    if (!products.has(hs)) products.set(hs, name);
  }

  const companies = new Map();
  let cur = null;
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const a = row[COL_NO], b = clean(row[COL_COMPANY]);
    if (typeof a === 'number' && b) {
      const tok = b.split(/[\s(]+/)[0].toUpperCase();
      if (/^[A-Z]{2,6}$/.test(tok)) {
        cur = tok;
        if (!companies.has(cur)) companies.set(cur, new Map());
      }
    }
    if (!cur) continue;
    const lab = clean(row[COL_LABEL]);
    let field = null;
    if (/^Obtained/i.test(lab) || /^Revision/i.test(lab)) field = 'obtained';
    else if (/^Utili/i.test(lab) && lab.includes('(MT)')) field = 'util';
    else continue;
    for (const [c, hs] of cols) {
      const v = num(row[c]);
      if (v === 0) continue;
      const ent = companies.get(cur);
      if (!ent.has(hs)) ent.set(hs, { obtained: 0, util: 0 });
      ent.get(hs)[field] += v;
    }
  }

  const r3 = x => Math.round(x * 1000) / 1000 + 0;
  const out = new Map();
  for (const [co, ent] of companies) {
    const keep = new Map();
    for (const [hs, v] of ent) {
      const o = r3(v.obtained), u = r3(v.util);
      if (o === 0 && u === 0) continue;
      keep.set(hs, { obtained: o, util: u });
    }
    if (keep.size) out.set(co, keep);
  }
  const used = new Set();
  for (const ent of out.values()) for (const hs of ent.keys()) used.add(hs);
  const prodOut = new Map();
  for (const [hs, name] of products) if (used.has(hs)) prodOut.set(hs, name);
  return { products: prodOut, companies: out };
}

const totals = led => {
  let o = 0, u = 0;
  for (const ent of led.companies.values()) for (const v of ent.values()) { o += v.obtained; u += v.util; }
  return [o, u];
};
const toObj = led => ({
  products: Object.fromEntries(led.products),
  companies: Object.fromEntries([...led.companies].map(([k, v]) => [k, Object.fromEntries(v)])),
});

// ── CLI ─────────────────────────────────────────────────────────────────────
const argv = process.argv.slice(2);
const flag = n => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : null; };
const master = argv.find(a => !a.startsWith('-') && argv[argv.indexOf(a) - 1] !== '-o'
  && argv[argv.indexOf(a) - 1] !== '--check' && argv[argv.indexOf(a) - 1] !== '--names-from');
if (!master) { console.error('usage: node tools/build_quota_ledger.js <master.xlsx> [-o out] [--check ref] [--names-from ref]'); process.exit(2); }

const led = build(master);
const namesFrom = flag('--names-from');
if (namesFrom && fs.existsSync(namesFrom)) {
  const prev = JSON.parse(fs.readFileSync(namesFrom, 'utf8')).products || {};
  const kept = [...led.products.keys()].filter(hs => hs in prev);
  kept.forEach(hs => led.products.set(hs, prev[hs]));
  const nw = [...led.products.keys()].filter(hs => !(hs in prev));
  console.log(`names: kept ${kept.length} curated, ${nw.length} new from master`
    + (nw.length ? ` -> ${JSON.stringify(nw.map(h => led.products.get(h)))}` : ''));
}
const [o, u] = totals(led);
console.log(`parsed ${led.companies.size} companies, ${led.products.size} products`);
console.log(`  obtained ${o.toLocaleString('en-US')}   util ${u.toLocaleString('en-US')}   available ${(o - u).toLocaleString('en-US')}`);

const check = flag('--check');
if (check) {
  const ref = JSON.parse(fs.readFileSync(check, 'utf8'));
  const ro = Object.values(ref.companies).reduce((s, e) => s + Object.values(e).reduce((t, v) => t + v.obtained, 0), 0);
  const ru = Object.values(ref.companies).reduce((s, e) => s + Object.values(e).reduce((t, v) => t + v.util, 0), 0);
  console.log(`reference: obtained ${ro.toLocaleString('en-US')}   util ${ru.toLocaleString('en-US')}`);
  const g = toObj(led).companies, e = ref.companies, diffs = [];
  for (const co of [...new Set([...Object.keys(g), ...Object.keys(e)])].sort()) {
    const G = g[co] || {}, E = e[co] || {};
    for (const hs of [...new Set([...Object.keys(G), ...Object.keys(E)])].sort()) {
      const gv = G[hs] || { obtained: 0, util: 0 }, ev = E[hs] || { obtained: 0, util: 0 };
      if (gv.obtained !== ev.obtained || gv.util !== ev.util)
        diffs.push(`  ${co.padEnd(5)} ${hs.padEnd(12)} generated ${JSON.stringify(gv)} != reference ${JSON.stringify(ev)}`);
    }
  }
  console.log(`\nper-(company,HS) mismatches: ${diffs.length}`);
  diffs.slice(0, 40).forEach(d => console.log(d));
  process.exit(diffs.length ? 1 : 0);
}

const outObj = {
  _meta: {
    source: 'master ' + path.basename(master),
    generated: process.env.LEDGER_DATE || '',
    view: 'effective (obtained incl. revisions)',
    generator: 'tools/build_quota_ledger.js',
  },
  ...toObj(led),
};
const dst = flag('-o') || 'iqdash/data/quotaLedger.json';
fs.writeFileSync(dst, JSON.stringify(outObj, null, 1) + '\n', 'utf8');
console.log('wrote ' + dst);
