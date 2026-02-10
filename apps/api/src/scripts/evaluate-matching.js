#!/usr/bin/env node
/**
 * Evaluate matching algorithm sensitivity and specificity
 *
 * Usage: node apps/api/src/scripts/evaluate-matching.js
 */

const fs = require('fs');
const path = require('path');

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const header = lines[0];
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

    // Parse CSV properly handling quoted fields
    const fields = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      if (line[j] === '"') {
        inQuotes = !inQuotes;
      } else if (line[j] === ',' && !inQuotes) {
        fields.push(current);
        current = '';
      } else {
        current += line[j];
      }
    }
    fields.push(current);

    rows.push({
      gameId: fields[0],
      gameName: fields[1],
      candidateTitle: fields[2],
      candidateSource: fields[3],
      matchScore: parseInt(fields[4]) || 0,
      matched: fields[5] === 'true',
      reasons: fields[6] || '',
      type: fields[7] || '',
      reviewFlag: fields[8] || '',
      label: parseInt(fields[9]) || 0,
    });
  }

  return rows;
}

function calculateMetrics(rows, threshold) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const row of rows) {
    const predicted = row.matchScore >= threshold ? 1 : 0;
    const actual = row.label;

    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) fp++;
    else if (predicted === 0 && actual === 0) tn++;
    else if (predicted === 0 && actual === 1) fn++;
  }

  const sensitivity = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const f1 = precision + sensitivity > 0 ? 2 * (precision * sensitivity) / (precision + sensitivity) : 0;
  const accuracy = rows.length > 0 ? (tp + tn) / rows.length : 0;

  return { threshold, tp, fp, tn, fn, sensitivity, specificity, precision, f1, accuracy };
}

function calculateMatchedMetrics(rows) {
  let tp = 0, fp = 0, tn = 0, fn = 0;

  for (const row of rows) {
    const predicted = row.matched ? 1 : 0;
    const actual = row.label;

    if (predicted === 1 && actual === 1) tp++;
    else if (predicted === 1 && actual === 0) fp++;
    else if (predicted === 0 && actual === 0) tn++;
    else if (predicted === 0 && actual === 1) fn++;
  }

  const sensitivity = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const f1 = precision + sensitivity > 0 ? 2 * (precision * sensitivity) / (precision + sensitivity) : 0;
  const accuracy = rows.length > 0 ? (tp + tn) / rows.length : 0;

  return { tp, fp, tn, fn, sensitivity, specificity, precision, f1, accuracy };
}

// Load data
const scriptsDir = path.join(__dirname);
const focusFile = path.join(scriptsDir, 'match-training-review-focus-labeled.csv');
const auditFile = path.join(scriptsDir, 'audit-training-review.csv');

const focusRows = fs.existsSync(focusFile) ? parseCSV(focusFile) : [];
const auditRows = fs.existsSync(auditFile) ? parseCSV(auditFile) : [];
const allRows = [...focusRows, ...auditRows];

// Deduplicate by gameId + candidateTitle
const seen = new Set();
const dedupedRows = [];
for (const row of allRows) {
  const key = `${row.gameId}|${row.candidateTitle}`;
  if (!seen.has(key)) {
    seen.add(key);
    dedupedRows.push(row);
  }
}

console.log('=== MATCHING ALGORITHM EVALUATION ===\n');
console.log(`Data sources:`);
console.log(`  Focus-labeled CSV: ${focusRows.length} rows`);
console.log(`  Audit-review CSV:  ${auditRows.length} rows`);
console.log(`  Combined (deduped): ${dedupedRows.length} rows`);

const positives = dedupedRows.filter(r => r.label === 1).length;
const negatives = dedupedRows.filter(r => r.label === 0).length;
console.log(`  Positive labels (actual matches): ${positives}`);
console.log(`  Negative labels (non-matches):    ${negatives}`);
console.log(`  Class balance: ${(positives / dedupedRows.length * 100).toFixed(1)}% positive\n`);

// Current algorithm performance (using 'matched' boolean)
console.log('--- Current Algorithm (matched=true/false) ---');
const matchedMetrics = calculateMatchedMetrics(dedupedRows);
console.log(`  TP: ${matchedMetrics.tp}  FP: ${matchedMetrics.fp}  TN: ${matchedMetrics.tn}  FN: ${matchedMetrics.fn}`);
console.log(`  Sensitivity (recall): ${(matchedMetrics.sensitivity * 100).toFixed(1)}%`);
console.log(`  Specificity:          ${(matchedMetrics.specificity * 100).toFixed(1)}%`);
console.log(`  Precision:            ${(matchedMetrics.precision * 100).toFixed(1)}%`);
console.log(`  F1 Score:             ${(matchedMetrics.f1 * 100).toFixed(1)}%`);
console.log(`  Accuracy:             ${(matchedMetrics.accuracy * 100).toFixed(1)}%\n`);

// Score-based threshold analysis
console.log('--- Score Threshold Analysis ---');
console.log('Threshold | Sens   | Spec   | Prec   | F1     | Acc    | TP  | FP  | TN  | FN');
console.log('----------|--------|--------|--------|--------|--------|-----|-----|-----|----');

const thresholds = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 110, 120, 130, 140, 150];
let bestF1 = { f1: 0, threshold: 0 };
let bestBalanced = { score: 0, threshold: 0 };

for (const t of thresholds) {
  const m = calculateMetrics(dedupedRows, t);
  const balanced = (m.sensitivity + m.specificity) / 2;

  if (m.f1 > bestF1.f1) bestF1 = { f1: m.f1, threshold: t };
  if (balanced > bestBalanced.score) bestBalanced = { score: balanced, threshold: t };

  console.log(
    `    ${String(t).padStart(3)}   | ${(m.sensitivity*100).toFixed(1).padStart(5)}% | ${(m.specificity*100).toFixed(1).padStart(5)}% | ${(m.precision*100).toFixed(1).padStart(5)}% | ${(m.f1*100).toFixed(1).padStart(5)}% | ${(m.accuracy*100).toFixed(1).padStart(5)}% | ${String(m.tp).padStart(3)} | ${String(m.fp).padStart(3)} | ${String(m.tn).padStart(3)} | ${String(m.fn).padStart(3)}`
  );
}

console.log(`\nBest F1 Score: ${(bestF1.f1*100).toFixed(1)}% at threshold ${bestF1.threshold}`);
console.log(`Best Balanced (Sens+Spec)/2: ${(bestBalanced.score*100).toFixed(1)}% at threshold ${bestBalanced.threshold}`);

// False negatives at recommended threshold
const recommendedThreshold = bestF1.threshold;
console.log(`\n--- False Negatives at threshold ${recommendedThreshold} (matches we'd miss) ---`);
const fnRows = dedupedRows
  .filter(r => r.label === 1 && r.matchScore < recommendedThreshold)
  .sort((a, b) => b.matchScore - a.matchScore);

if (fnRows.length === 0) {
  console.log('  None!');
} else {
  for (const row of fnRows.slice(0, 20)) {
    console.log(`  Score ${String(row.matchScore).padStart(3)}: "${row.gameName}" → "${row.candidateTitle.substring(0, 80)}..." [${row.candidateSource}]`);
  }
  if (fnRows.length > 20) console.log(`  ... and ${fnRows.length - 20} more`);
}

// False positives at recommended threshold
console.log(`\n--- False Positives at threshold ${recommendedThreshold} (non-matches we'd accept) ---`);
const fpRows = dedupedRows
  .filter(r => r.label === 0 && r.matchScore >= recommendedThreshold)
  .sort((a, b) => b.matchScore - a.matchScore);

if (fpRows.length === 0) {
  console.log('  None!');
} else {
  for (const row of fpRows.slice(0, 20)) {
    console.log(`  Score ${String(row.matchScore).padStart(3)}: "${row.gameName}" → "${row.candidateTitle.substring(0, 80)}..." [${row.candidateSource}]`);
  }
  if (fpRows.length > 20) console.log(`  ... and ${fpRows.length - 20} more`);
}

// Audit-only metrics (better balance)
console.log('\n\n=== AUDIT DATA ONLY (better class balance) ===\n');
const auditPositives = auditRows.filter(r => r.label === 1).length;
const auditNegatives = auditRows.filter(r => r.label === 0).length;
console.log(`  ${auditRows.length} rows: ${auditPositives} positive, ${auditNegatives} negative (${(auditPositives/auditRows.length*100).toFixed(1)}% positive)\n`);

console.log('--- Current Algorithm (matched=true/false) ---');
const auditMatchedMetrics = calculateMatchedMetrics(auditRows);
console.log(`  TP: ${auditMatchedMetrics.tp}  FP: ${auditMatchedMetrics.fp}  TN: ${auditMatchedMetrics.tn}  FN: ${auditMatchedMetrics.fn}`);
console.log(`  Sensitivity: ${(auditMatchedMetrics.sensitivity * 100).toFixed(1)}%`);
console.log(`  Specificity: ${(auditMatchedMetrics.specificity * 100).toFixed(1)}%`);
console.log(`  Precision:   ${(auditMatchedMetrics.precision * 100).toFixed(1)}%`);
console.log(`  F1 Score:    ${(auditMatchedMetrics.f1 * 100).toFixed(1)}%\n`);

console.log('Threshold | Sens   | Spec   | Prec   | F1     | TP  | FP  | TN  | FN');
console.log('----------|--------|--------|--------|--------|-----|-----|-----|----');
for (const t of thresholds) {
  const m = calculateMetrics(auditRows, t);
  console.log(
    `    ${String(t).padStart(3)}   | ${(m.sensitivity*100).toFixed(1).padStart(5)}% | ${(m.specificity*100).toFixed(1).padStart(5)}% | ${(m.precision*100).toFixed(1).padStart(5)}% | ${(m.f1*100).toFixed(1).padStart(5)}% | ${String(m.tp).padStart(3)} | ${String(m.fp).padStart(3)} | ${String(m.tn).padStart(3)} | ${String(m.fn).padStart(3)}`
  );
}
