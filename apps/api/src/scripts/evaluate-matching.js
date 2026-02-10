#!/usr/bin/env node
/**
 * Evaluate matching algorithm sensitivity and specificity
 * Tests: heuristic-only, ML-only, and hybrid (heuristic + ML) approaches
 *
 * Usage: node apps/api/src/scripts/evaluate-matching.js
 */

const fs = require('fs');
const path = require('path');

// === Feature extraction (mirrors MatchModel.ts) ===

const FEATURE_RULES = [
  { key: 'exact_name', test: (r) => r === 'exact name match' },
  { key: 'exact_phrase', test: (r) => r === 'exact phrase in title' },
  { key: 'phrase_partial', test: (r) => r === 'phrase partially matches' },
  { key: 'phrase_weak', test: (r) => r === 'phrase weakly matches' },
  { key: 'title_contains', test: (r) => r === 'title contains game name' },
  { key: 'strong_title', test: (r) => r === 'strong title match' },
  { key: 'prefixed_title', test: (r) => r === 'prefixed title match' },
  { key: 'game_name_contains', test: (r) => r === 'game name contains title' },
  { key: 'alt_title', test: (r) => r === 'matches alternative title' },
  { key: 'edition_title', test: (r) => r === 'matches edition title' },
  { key: 'edition_variant', test: (r) => r === 'edition variant' },
  { key: 'word_match_very_high', test: (r) => r === 'very high word match ratio' },
  { key: 'word_match_high', test: (r) => r === 'high word match ratio' },
  { key: 'word_match_moderate', test: (r) => r === 'moderate word match' },
  { key: 'keywords_all', test: (r) => r === 'all main keywords present' },
  { key: 'too_many_unrelated', test: (r) => r === 'too many unrelated words' },
  { key: 'many_extra', test: (r) => r === 'many extra words' },
  { key: 'sequel_match', test: (r) => r === 'sequel number matches' },
  { key: 'sequel_mismatch', test: (r) => r === 'different sequel number' },
  { key: 'sequel_title', test: (r) => r === 'title is numbered sequel' },
  { key: 'related_pattern', test: (r) => r === 'matches related game pattern' },
  { key: 'related_bundle', test: (r) => r === 'related game bundle penalty' },
  { key: 'single_word_partial', test: (r) => r === 'single-word partial match' },
  { key: 'single_word_extra', test: (r) => r === 'single-word title has extra words' },
  { key: 'title_too_short', test: (r) => r === 'title too short' },
  { key: 'platform_mismatch', test: (r) => r === 'platform not in IGDB' },
  { key: 'platform_mismatch_emulator', test: (r) => r === 'platform not in IGDB (emulator)' },
  { key: 'dlc_only', test: (r) => r === 'DLC/expansion only' },
  { key: 'update_only', test: (r) => r === 'update/patch only' },
  { key: 'non_game_media', test: (r) => r === 'non-game media' },
  { key: 'language_pack', test: (r) => r === 'language pack' },
  { key: 'crack_fix', test: (r) => r === 'crack/fix only' },
  { key: 'mod_fan', test: (r) => r === 'mod/fan content' },
  { key: 'demo', test: (r) => r === 'demo/alpha/beta' },
  { key: 'bundle_penalty', test: (r) => r === 'bundle/collection penalty' },
  { key: 'hydra_spinoff', test: (r) => r === 'hydra spinoff token' },
  { key: 'hydra_extra', test: (r) => r.startsWith('hydra extra tokens') },
  { key: 'platform_info', test: (r) => r === 'platform info present' },
  { key: 'year_match', test: (r) => r === 'release year matches' },
  { key: 'year_close', test: (r) => r === 'release year close' },
  { key: 'year_off', test: (r) => r === 'release year slightly off' },
  { key: 'year_mismatch', test: (r) => r === 'release year mismatch' },
  { key: 'year_major_mismatch', test: (r) => r === 'release year major mismatch' },
  { key: 'desc_strong', test: (r) => /strong.*description match/i.test(r) },
  { key: 'desc_good', test: (r) => /good.*description/i.test(r) },
  { key: 'desc_some', test: (r) => r === 'some description overlap' },
  { key: 'desc_minor', test: (r) => r === 'minor description overlap' },
  { key: 'desc_mismatch', test: (r) => r === 'description mismatch' },
];

function extractFeatures(reasons, score) {
  const features = {};
  features.score_norm = Math.max(0, Math.min(1, score / 150));

  for (const r of reasons) {
    const mlMatch = r.match(/^ml probability ([\d.]+)$/);
    if (mlMatch) features.prev_ml_prob = parseFloat(mlMatch[1]);
    const hydraMatch = r.match(/^hydra extra tokens \(([^)]*)\)$/);
    if (hydraMatch) features.hydra_extra_count = hydraMatch[1].split(',').length;
    const sizeMatch = r.match(/([\d.]+)% of Steam/);
    if (sizeMatch) features.size_ratio = parseFloat(sizeMatch[1]) / 100;
  }

  for (const rule of FEATURE_RULES) {
    features[rule.key] = reasons.some(rule.test) ? 1 : 0;
  }

  features.exact_and_single_word = (features.exact_name ?? 0) * (features.single_word_partial ?? 0);
  features.exact_and_sequel = (features.exact_name ?? 0) * (features.sequel_match ?? 0);
  features.phrase_and_keywords = (features.exact_phrase ?? 0) * (features.keywords_all ?? 0);
  features.single_word_and_extra = (features.single_word_partial ?? 0) * (features.single_word_extra ?? 0);

  return features;
}

// === ML Model prediction ===

function sigmoid(x) { return 1 / (1 + Math.exp(-x)); }

function predictTree(node, features) {
  if (typeof node === 'number') return node;
  const value = features[node.feature] ?? 0;
  return value <= node.threshold ? predictTree(node.left, features) : predictTree(node.right, features);
}

function predictLogistic(model, features) {
  let z = model.bias;
  for (const key of model.featureNames) {
    z += (model.weights[key] ?? 0) * (features[key] ?? 0);
  }
  return sigmoid(z);
}

function predictGBT(model, features) {
  let raw = model.basePrediction;
  for (const tree of model.trees) {
    raw += model.learningRate * predictTree(tree, features);
  }
  return sigmoid(raw);
}

function predictCombined(model, features) {
  const logP = predictLogistic(model.logistic, features);
  if (!model.trees) return logP;
  const treeP = predictGBT(model.trees, features);
  const w = model.ensembleWeight;
  return (1 - w) * logP + w * treeP;
}

// === CSV parsing ===

function parseCSV(filePath) {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.trim().split('\n');
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;

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

// === Metrics calculation ===

function calcMetrics(predictions, labels) {
  let tp = 0, fp = 0, tn = 0, fn = 0;
  for (let i = 0; i < predictions.length; i++) {
    const pred = predictions[i];
    const actual = labels[i];
    if (pred === 1 && actual === 1) tp++;
    else if (pred === 1 && actual === 0) fp++;
    else if (pred === 0 && actual === 0) tn++;
    else if (pred === 0 && actual === 1) fn++;
  }
  const sensitivity = tp + fn > 0 ? tp / (tp + fn) : 0;
  const specificity = tn + fp > 0 ? tn / (tn + fp) : 0;
  const precision = tp + fp > 0 ? tp / (tp + fp) : 0;
  const f1 = precision + sensitivity > 0 ? 2 * (precision * sensitivity) / (precision + sensitivity) : 0;
  const accuracy = predictions.length > 0 ? (tp + tn) / predictions.length : 0;
  return { tp, fp, tn, fn, sensitivity, specificity, precision, f1, accuracy };
}

function printMetrics(label, m) {
  console.log(`  TP: ${m.tp}  FP: ${m.fp}  TN: ${m.tn}  FN: ${m.fn}`);
  console.log(`  Sensitivity (recall): ${(m.sensitivity * 100).toFixed(1)}%`);
  console.log(`  Specificity:          ${(m.specificity * 100).toFixed(1)}%`);
  console.log(`  Precision:            ${(m.precision * 100).toFixed(1)}%`);
  console.log(`  F1 Score:             ${(m.f1 * 100).toFixed(1)}%`);
  console.log(`  Accuracy:             ${(m.accuracy * 100).toFixed(1)}%`);
}

function printRow(m) {
  return `${(m.sensitivity*100).toFixed(1).padStart(5)}% | ${(m.specificity*100).toFixed(1).padStart(5)}% | ${(m.precision*100).toFixed(1).padStart(5)}% | ${(m.f1*100).toFixed(1).padStart(5)}% | ${(m.accuracy*100).toFixed(1).padStart(5)}% | ${String(m.tp).padStart(3)} | ${String(m.fp).padStart(3)} | ${String(m.tn).padStart(3)} | ${String(m.fn).padStart(3)}`;
}

// === Main ===

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

// Load ML model
const modelPath = path.resolve(__dirname, '..', '..', '..', '..', 'data', 'match-model.json');
let model = null;
if (fs.existsSync(modelPath)) {
  try {
    const raw = fs.readFileSync(modelPath, 'utf-8');
    model = JSON.parse(raw);
    console.log(`Loaded ML model from ${modelPath} (trained: ${model.trainedAt})`);
  } catch (e) {
    console.log(`Warning: Could not load ML model: ${e.message}`);
  }
}

// Compute ML probabilities for each row
for (const row of dedupedRows) {
  const reasons = (row.reasons || '').split('|').filter(Boolean);
  row.features = extractFeatures(reasons, row.matchScore);
  row.mlProb = model ? predictCombined(model, row.features) : null;
}

const labels = dedupedRows.map(r => r.label);

console.log('\n=== MATCHING ALGORITHM EVALUATION ===\n');
console.log(`Data: ${dedupedRows.length} rows (${dedupedRows.filter(r=>r.label===1).length} positive, ${dedupedRows.filter(r=>r.label===0).length} negative, ${(dedupedRows.filter(r=>r.label===1).length / dedupedRows.length * 100).toFixed(1)}% positive)`);

// ============================================================
// 1. Heuristic only (score >= threshold)
// ============================================================
console.log('\n' + '='.repeat(60));
console.log('1. HEURISTIC ONLY (score >= threshold)');
console.log('='.repeat(60));
console.log('Threshold | Sens   | Spec   | Prec   | F1     | Acc    | TP  | FP  | TN  | FN');
console.log('----------|--------|--------|--------|--------|--------|-----|-----|-----|----');

const thresholds = [30, 40, 50, 60, 70, 80, 90, 100];
let bestHeuristic = { f1: 0, threshold: 0, m: null };
for (const t of thresholds) {
  const preds = dedupedRows.map(r => r.matchScore >= t ? 1 : 0);
  const m = calcMetrics(preds, labels);
  if (m.f1 > bestHeuristic.f1) bestHeuristic = { f1: m.f1, threshold: t, m };
  console.log(`    ${String(t).padStart(3)}   | ${printRow(m)}`);
}

// ============================================================
// 2. ML model only (probability >= threshold)
// ============================================================
if (model) {
  console.log('\n' + '='.repeat(60));
  console.log('2. ML MODEL ONLY (probability >= threshold)');
  console.log('='.repeat(60));
  console.log('Threshold | Sens   | Spec   | Prec   | F1     | Acc    | TP  | FP  | TN  | FN');
  console.log('----------|--------|--------|--------|--------|--------|-----|-----|-----|----');

  const mlThresholds = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
  let bestML = { f1: 0, threshold: 0, m: null };
  for (const t of mlThresholds) {
    const preds = dedupedRows.map(r => (r.mlProb ?? 0) >= t ? 1 : 0);
    const m = calcMetrics(preds, labels);
    if (m.f1 > bestML.f1) bestML = { f1: m.f1, threshold: t, m };
    console.log(`    ${t.toFixed(1).padStart(3)}   | ${printRow(m)}`);
  }

  // ============================================================
  // 3. Hybrid: heuristic score >= T1 AND ML prob >= T2
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('3. HYBRID AND: score >= T1 AND ml_prob >= T2');
  console.log('   (Both must agree — conservative, high specificity)');
  console.log('='.repeat(60));
  console.log('Score | ML    | Sens   | Spec   | Prec   | F1     | Acc    | TP  | FP  | TN  | FN');
  console.log('------|-------|--------|--------|--------|--------|--------|-----|-----|-----|----');

  let bestAnd = { f1: 0, t1: 0, t2: 0, m: null };
  const hThresholds = [30, 40, 50, 60, 70, 80];
  const mThresholds = [0.2, 0.3, 0.4, 0.5, 0.6, 0.7];
  for (const t1 of hThresholds) {
    for (const t2 of mThresholds) {
      const preds = dedupedRows.map(r => (r.matchScore >= t1 && (r.mlProb ?? 0) >= t2) ? 1 : 0);
      const m = calcMetrics(preds, labels);
      if (m.f1 > bestAnd.f1) bestAnd = { f1: m.f1, t1, t2, m };
      console.log(`  ${String(t1).padStart(3)} | ${t2.toFixed(1)} | ${printRow(m)}`);
    }
  }

  // ============================================================
  // 4. Hybrid: heuristic score >= T1 OR ML prob >= T2
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('4. HYBRID OR: score >= T1 OR ml_prob >= T2');
  console.log('   (Either can trigger — permissive, high sensitivity)');
  console.log('='.repeat(60));
  console.log('Score | ML    | Sens   | Spec   | Prec   | F1     | Acc    | TP  | FP  | TN  | FN');
  console.log('------|-------|--------|--------|--------|--------|--------|-----|-----|-----|----');

  let bestOr = { f1: 0, t1: 0, t2: 0, m: null };
  for (const t1 of hThresholds) {
    for (const t2 of mThresholds) {
      const preds = dedupedRows.map(r => (r.matchScore >= t1 || (r.mlProb ?? 0) >= t2) ? 1 : 0);
      const m = calcMetrics(preds, labels);
      if (m.f1 > bestOr.f1) bestOr = { f1: m.f1, t1, t2, m };
      console.log(`  ${String(t1).padStart(3)} | ${t2.toFixed(1)} | ${printRow(m)}`);
    }
  }

  // ============================================================
  // 5. Hybrid weighted: alpha * score_norm + (1-alpha) * ml_prob >= threshold
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('5. HYBRID WEIGHTED: alpha * score_norm + (1-alpha) * ml_prob >= threshold');
  console.log('   (Blended signal — balanced approach)');
  console.log('='.repeat(60));
  console.log('Alpha | Thresh | Sens   | Spec   | Prec   | F1     | Acc    | TP  | FP  | TN  | FN');
  console.log('------|--------|--------|--------|--------|--------|--------|-----|-----|-----|----');

  let bestWeighted = { f1: 0, alpha: 0, threshold: 0, m: null };
  for (let alpha = 0.0; alpha <= 1.0; alpha += 0.1) {
    for (let th = 0.1; th <= 0.9; th += 0.05) {
      const preds = dedupedRows.map(r => {
        const scoreNorm = Math.max(0, Math.min(1, r.matchScore / 150));
        const combined = alpha * scoreNorm + (1 - alpha) * (r.mlProb ?? 0);
        return combined >= th ? 1 : 0;
      });
      const m = calcMetrics(preds, labels);
      if (m.f1 > bestWeighted.f1) bestWeighted = { f1: m.f1, alpha, threshold: th, m };
    }
  }
  // Print only the best per alpha
  for (let alpha = 0.0; alpha <= 1.0; alpha += 0.1) {
    let bestForAlpha = { f1: 0, threshold: 0, m: null };
    for (let th = 0.1; th <= 0.9; th += 0.05) {
      const preds = dedupedRows.map(r => {
        const scoreNorm = Math.max(0, Math.min(1, r.matchScore / 150));
        const combined = alpha * scoreNorm + (1 - alpha) * (r.mlProb ?? 0);
        return combined >= th ? 1 : 0;
      });
      const m = calcMetrics(preds, labels);
      if (m.f1 > bestForAlpha.f1) bestForAlpha = { f1: m.f1, threshold: th, m };
    }
    if (bestForAlpha.m) {
      console.log(`  ${alpha.toFixed(1)} |  ${bestForAlpha.threshold.toFixed(2)} | ${printRow(bestForAlpha.m)}`);
    }
  }

  // ============================================================
  // 6. Current production: heuristic match, ML can veto
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('6. CURRENT PRODUCTION: heuristic match=true, ML can veto if prob < threshold');
  console.log('='.repeat(60));
  console.log('H_thr | ML_thr | Sens   | Spec   | Prec   | F1     | Acc    | TP  | FP  | TN  | FN');
  console.log('------|--------|--------|--------|--------|--------|--------|-----|-----|-----|----');

  let bestVeto = { f1: 0, ht: 0, mt: 0, m: null };
  for (const ht of [40, 50, 60, 70]) {
    for (const mt of [0.2, 0.3, 0.4, 0.5, 0.6]) {
      const preds = dedupedRows.map(r => {
        // Heuristic says match
        if (r.matchScore >= ht) {
          // ML can veto
          if ((r.mlProb ?? 1) < mt) return 0;
          return 1;
        }
        return 0;
      });
      const m = calcMetrics(preds, labels);
      if (m.f1 > bestVeto.f1) bestVeto = { f1: m.f1, ht, mt, m };
      console.log(`   ${String(ht).padStart(2)} |  ${mt.toFixed(1)}  | ${printRow(m)}`);
    }
  }

  // ============================================================
  // SUMMARY: Best configuration per strategy
  // ============================================================
  console.log('\n' + '='.repeat(60));
  console.log('SUMMARY: Best F1 per strategy');
  console.log('='.repeat(60));
  console.log(`  1. Heuristic only:    F1=${(bestHeuristic.f1*100).toFixed(1)}% (score>=${bestHeuristic.threshold})  Sens=${(bestHeuristic.m.sensitivity*100).toFixed(1)}% Spec=${(bestHeuristic.m.specificity*100).toFixed(1)}%`);
  console.log(`  2. ML only:           F1=${(bestML.f1*100).toFixed(1)}% (prob>=${bestML.threshold.toFixed(1)})  Sens=${(bestML.m.sensitivity*100).toFixed(1)}% Spec=${(bestML.m.specificity*100).toFixed(1)}%`);
  console.log(`  3. Hybrid AND:        F1=${(bestAnd.f1*100).toFixed(1)}% (score>=${bestAnd.t1} AND prob>=${bestAnd.t2.toFixed(1)})  Sens=${(bestAnd.m.sensitivity*100).toFixed(1)}% Spec=${(bestAnd.m.specificity*100).toFixed(1)}%`);
  console.log(`  4. Hybrid OR:         F1=${(bestOr.f1*100).toFixed(1)}% (score>=${bestOr.t1} OR prob>=${bestOr.t2.toFixed(1)})  Sens=${(bestOr.m.sensitivity*100).toFixed(1)}% Spec=${(bestOr.m.specificity*100).toFixed(1)}%`);
  console.log(`  5. Hybrid weighted:   F1=${(bestWeighted.f1*100).toFixed(1)}% (${bestWeighted.alpha.toFixed(1)}*score + ${(1-bestWeighted.alpha).toFixed(1)}*ml >= ${bestWeighted.threshold.toFixed(2)})  Sens=${(bestWeighted.m.sensitivity*100).toFixed(1)}% Spec=${(bestWeighted.m.specificity*100).toFixed(1)}%`);
  console.log(`  6. Heuristic+ML veto: F1=${(bestVeto.f1*100).toFixed(1)}% (score>=${bestVeto.ht}, veto if ml<${bestVeto.mt.toFixed(1)})  Sens=${(bestVeto.m.sensitivity*100).toFixed(1)}% Spec=${(bestVeto.m.specificity*100).toFixed(1)}%`);

  // Show false positives/negatives for the best hybrid strategy
  const bestStrategy = [
    { name: 'Heuristic', f1: bestHeuristic.f1, predict: (r) => r.matchScore >= bestHeuristic.threshold ? 1 : 0 },
    { name: 'ML only', f1: bestML.f1, predict: (r) => (r.mlProb ?? 0) >= bestML.threshold ? 1 : 0 },
    { name: 'Hybrid AND', f1: bestAnd.f1, predict: (r) => (r.matchScore >= bestAnd.t1 && (r.mlProb ?? 0) >= bestAnd.t2) ? 1 : 0 },
    { name: 'Hybrid OR', f1: bestOr.f1, predict: (r) => (r.matchScore >= bestOr.t1 || (r.mlProb ?? 0) >= bestOr.t2) ? 1 : 0 },
    { name: 'Hybrid weighted', f1: bestWeighted.f1, predict: (r) => {
      const scoreNorm = Math.max(0, Math.min(1, r.matchScore / 150));
      return (bestWeighted.alpha * scoreNorm + (1 - bestWeighted.alpha) * (r.mlProb ?? 0)) >= bestWeighted.threshold ? 1 : 0;
    }},
    { name: 'Heuristic+ML veto', f1: bestVeto.f1, predict: (r) => {
      if (r.matchScore >= bestVeto.ht) {
        if ((r.mlProb ?? 1) < bestVeto.mt) return 0;
        return 1;
      }
      return 0;
    }},
  ].sort((a, b) => b.f1 - a.f1)[0];

  console.log(`\n--- Best overall: ${bestStrategy.name} (F1=${(bestStrategy.f1*100).toFixed(1)}%) ---`);

  const fnRows = dedupedRows.filter(r => r.label === 1 && bestStrategy.predict(r) === 0)
    .sort((a, b) => b.matchScore - a.matchScore);
  const fpRows = dedupedRows.filter(r => r.label === 0 && bestStrategy.predict(r) === 1)
    .sort((a, b) => b.matchScore - a.matchScore);

  console.log(`\nFalse Negatives (${fnRows.length} matches we'd miss):`);
  for (const r of fnRows.slice(0, 15)) {
    console.log(`  Score=${String(r.matchScore).padStart(3)} ML=${(r.mlProb??0).toFixed(2)}: "${r.gameName}" -> "${r.candidateTitle.substring(0, 70)}" [${r.candidateSource}]`);
  }
  if (fnRows.length > 15) console.log(`  ... and ${fnRows.length - 15} more`);

  console.log(`\nFalse Positives (${fpRows.length} non-matches we'd accept):`);
  for (const r of fpRows.slice(0, 15)) {
    console.log(`  Score=${String(r.matchScore).padStart(3)} ML=${(r.mlProb??0).toFixed(2)}: "${r.gameName}" -> "${r.candidateTitle.substring(0, 70)}" [${r.candidateSource}]`);
  }
  if (fpRows.length > 15) console.log(`  ... and ${fpRows.length - 15} more`);
} else {
  console.log('\nNo ML model found — skipping hybrid evaluation.');
  console.log(`Best heuristic: F1=${(bestHeuristic.f1*100).toFixed(1)}% at threshold ${bestHeuristic.threshold}`);
}
