#!/usr/bin/env node
/**
 * Offline unit tests for the reconciliation diff logic (no network).
 * Run:  node tools/reconcile_test.js
 */
'use strict';
const assert = require('assert');
const { diffTab, indexSheet, rowKey } = require('./reconcile_neon_sheets.js');

let pass = 0, fail = 0;
function t(name, fn) {
  try { fn(); pass++; console.log('  ok  -', name); }
  catch (e) { fail++; console.log('  FAIL-', name, '\n      ', e.message); }
}

// ── id-keyed tab: equal / differ / neon-only / sheets-only all at once ──────
t('id-keyed buckets', () => {
  const header = ['id', 'name'];
  const key = (c) => c[0];
  const neonRows = [
    ['1', 'Alpha'],     // equal
    ['2', 'Beta'],      // differs (sheets says Beta-EDIT)
    ['3', 'Gamma'],     // neon-only (missing from sheets)
  ];
  const sheetValues = [
    ['id', 'name'],
    ['1', 'Alpha'],
    ['2', 'Beta-EDIT'],
    ['4', 'Delta'],     // sheets-only
  ];
  const d = diffTab('companies', header, neonRows, sheetValues, key);
  assert.deepStrictEqual(d.bothEqual, ['1'], 'equal');
  assert.deepStrictEqual(d.bothDiff, ['2'], 'differ');
  assert.deepStrictEqual(d.neonOnly, ['3'], 'neon-only');
  assert.deepStrictEqual(d.sheetOnly, ['4'], 'sheets-only');
  assert.strictEqual(d.neonCount, 3);
  assert.strictEqual(d.sheetCount, 3);
});

// ── column reorder in the sheet must not cause false diffs ──────────────────
t('column reorder resilience', () => {
  const header = ['id', 'name', 'position', 'created_at'];
  const key = (c) => c[0];
  const neonRows = [['7', 'Juna', 'Sales', '2026-01-01 00:00:00']];
  // sheet header in a DIFFERENT order — indexSheet aligns by name
  const sheetValues = [
    ['name', 'created_at', 'id', 'position'],
    ['Juna', '2026-01-01 00:00:00', '7', 'Sales'],
  ];
  const d = diffTab('staff', header, neonRows, sheetValues, key);
  assert.deepStrictEqual(d.bothEqual, ['7']);
  assert.strictEqual(d.bothDiff.length, 0);
});

// ── missing column in the sheet → treated as '' (and flagged as differ) ─────
t('missing sheet column → differ, not crash', () => {
  const header = ['id', 'name', 'note'];
  const key = (c) => c[0];
  const neonRows = [['1', 'A', 'hello']];
  const sheetValues = [['id', 'name'], ['1', 'A']]; // no note column
  const d = diffTab('x', header, neonRows, sheetValues, key);
  assert.deepStrictEqual(d.bothDiff, ['1']); // note differs ('hello' vs '')
});

// ── composite discussions key (record_id + disc_order + point_order) ────────
t('composite discussions key', () => {
  const header = ['record_id', 'disc_order', 'topic', 'point_order', 'point'];
  const key = (c) => JSON.stringify([c[0], c[1], c[3]]);
  const neonRows = [
    ['1712345678901', '0', 'Pricing', '0', 'Discuss discount'],
    ['1712345678901', '0', 'Pricing', '1', 'Volume tiers'],
  ];
  const sheetValues = [
    ['record_id', 'disc_order', 'topic', 'point_order', 'point'],
    ['1712345678901', '0', 'Pricing', '0', 'Discuss discount'], // equal
    ['1712345678901', '0', 'Pricing', '1', 'Volume tiers EDIT'], // differ
    ['1712345678901', '1', 'Delivery', '0', 'Lead time'],        // sheets-only
  ];
  const d = diffTab('discussions', header, neonRows, sheetValues, key);
  assert.strictEqual(d.bothEqual.length, 1);
  assert.strictEqual(d.bothDiff.length, 1);
  assert.strictEqual(d.sheetOnly.length, 1);
  assert.strictEqual(d.neonOnly.length, 0);
});

// ── blank trailing rows in the sheet are ignored ────────────────────────────
t('blank sheet rows ignored', () => {
  const header = ['id', 'name'];
  const key = (c) => c[0];
  const neonRows = [['1', 'A']];
  const sheetValues = [['id', 'name'], ['1', 'A'], ['', ''], []];
  const d = diffTab('x', header, neonRows, sheetValues, key);
  assert.strictEqual(d.sheetCount, 1);
  assert.deepStrictEqual(d.bothEqual, ['1']);
});

// ── missing tab (sheetsGet returned null) → headerPresent=false, all neon-only ─
t('missing tab → all neon-only', () => {
  const header = ['id', 'name'];
  const key = (c) => c[0];
  const d = diffTab('x', header, [['1', 'A']], null, key);
  assert.strictEqual(d.headerPresent, false);
  assert.deepStrictEqual(d.neonOnly, ['1']);
  assert.strictEqual(d.sheetCount, 0);
});

// ── rowKey collision-free (values containing former delimiter) ──────────────
t('rowKey collision-free', () => {
  assert.notStrictEqual(rowKey(['a', 'b']), rowKey(['ab', '']));
  assert.notStrictEqual(rowKey(['1', '0001', '2']), rowKey(['1', '', '0001', '2']));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
