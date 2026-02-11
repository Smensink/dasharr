import fs from 'fs';
import path from 'path';
import {
  extractFeatures,
  MatchModel,
  MatchFeatures,
  DecisionNode,
  TreeModel,
  CombinedModel,
  resolveModelPath,
} from '../utils/MatchModel';
import {
  normalizeForSimilarity,
  tokenJaccard,
  charNgramJaccard,
  lengthRatio,
} from '../utils/TextSimilarity';

type Sample = {
  features: Record<string, number>;
  label: 0 | 1;
};

function buildFeaturesFromRow(row: Record<string, string>): MatchFeatures {
  const reasons = (row.reasons || '').split('|').map((x) => x.trim()).filter(Boolean);

  // Backfill ML-only feature reasons from audit columns so training can use them
  // even if the original run didn't emit them.
  const a = normalizeForSimilarity(row.candidateTitle ?? '');
  const b = normalizeForSimilarity(row.gameName ?? '');
  if (a && b) {
    if (!reasons.some((r) => r.startsWith('token jaccard '))) {
      reasons.push(`token jaccard ${tokenJaccard(a, b).toFixed(3)}`);
    }
    if (!reasons.some((r) => r.startsWith('char3 jaccard '))) {
      reasons.push(`char3 jaccard ${charNgramJaccard(a, b, 3).toFixed(3)}`);
    }
    if (!reasons.some((r) => r.startsWith('len ratio '))) {
      reasons.push(`len ratio ${lengthRatio(a, b).toFixed(3)}`);
    }
  }

  const maybeInt = (v: string | undefined): number | null => {
    const s = (v ?? '').trim();
    if (!s) return null;
    const n = parseInt(s, 10);
    return Number.isFinite(n) ? Math.max(0, n) : null;
  };
  const seeders = maybeInt(row.seeders);
  const leechers = maybeInt(row.leechers);
  const grabs = maybeInt(row.grabs);
  if (seeders !== null && !reasons.some((r) => r.startsWith('seeders:'))) {
    reasons.push(`seeders: ${seeders}`);
  }
  if (leechers !== null && !reasons.some((r) => r.startsWith('leechers:'))) {
    reasons.push(`leechers: ${leechers}`);
  }
  if (grabs !== null && !reasons.some((r) => r.startsWith('grabs:'))) {
    reasons.push(`grabs: ${grabs}`);
  }

  const score = parseFloat(row.matchScore || '0');
  return extractFeatures(reasons, Number.isFinite(score) ? score : 0);
}

function parseCsv(filePath: string): Array<Record<string, string>> {
  const raw = fs.readFileSync(filePath, 'utf-8').trim();
  if (!raw) return [];
  const lines = raw.split(/\r?\n/);
  const header = lines[0].split(',');
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i += 1) {
    const line = lines[i];
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let j = 0; j < line.length; j += 1) {
      const char = line[j];
      if (char === '"' && line[j + 1] === '"') {
        current += '"';
        j += 1;
        continue;
      }
      if (char === '"') {
        inQuotes = !inQuotes;
        continue;
      }
      if (char === ',' && !inQuotes) {
        values.push(current);
        current = '';
        continue;
      }
      current += char;
    }
    values.push(current);
    const row: Record<string, string> = {};
    for (let k = 0; k < header.length; k += 1) {
      row[header[k]] = values[k] ?? '';
    }
    rows.push(row);
  }
  return rows;
}

function buildSamples(rows: Array<Record<string, string>>): Sample[] {
  const samples: Sample[] = [];
  for (const row of rows) {
    const labelRaw = row.label?.trim();
    if (labelRaw !== '1' && labelRaw !== '0') continue;
    const label = labelRaw === '1' ? 1 : 0;
    samples.push({ features: buildFeaturesFromRow(row), label });
  }
  return samples;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

// === Logistic Regression ===

function trainLogisticRegression(samples: Sample[], iterations = 1200, lr = 0.2, l2 = 0.001): MatchModel {
  const featureNames = Array.from(new Set(samples.flatMap((s) => Object.keys(s.features))));
  const weights: Record<string, number> = {};
  for (const name of featureNames) {
    weights[name] = 0;
  }
  let bias = 0;

  for (let iter = 0; iter < iterations; iter += 1) {
    let gradBias = 0;
    const gradWeights: Record<string, number> = {};
    for (const name of featureNames) gradWeights[name] = 0;

    for (const sample of samples) {
      let z = bias;
      for (const name of featureNames) {
        z += (weights[name] ?? 0) * (sample.features[name] ?? 0);
      }
      const pred = sigmoid(z);
      const error = pred - sample.label;
      gradBias += error;
      for (const name of featureNames) {
        gradWeights[name] += error * (sample.features[name] ?? 0);
      }
    }

    const n = samples.length || 1;
    bias -= lr * (gradBias / n);
    for (const name of featureNames) {
      const reg = l2 * (weights[name] ?? 0);
      weights[name] -= lr * ((gradWeights[name] / n) + reg);
    }
  }

  return {
    version: 1,
    trainedAt: new Date().toISOString(),
    featureNames,
    weights,
    bias,
  };
}

// === Gradient-Boosted Decision Trees ===

type TreeSample = {
  features: MatchFeatures;
  residual: number;
};

function buildTree(
  samples: TreeSample[],
  featureNames: string[],
  maxDepth: number,
  minSamplesLeaf: number,
  depth = 0,
  lambda = 1.0,
): DecisionNode | number {
  if (depth >= maxDepth || samples.length < minSamplesLeaf * 2) {
    // Leaf: average residual with L2 regularization
    const sum = samples.reduce((acc, s) => acc + s.residual, 0);
    return sum / (samples.length + lambda);
  }

  let bestFeature = '';
  let bestThreshold = 0;
  let bestGain = -Infinity;
  let bestLeftSamples: TreeSample[] = [];
  let bestRightSamples: TreeSample[] = [];

  const totalSum = samples.reduce((acc, s) => acc + s.residual, 0);
  const totalSumSq = samples.reduce((acc, s) => acc + s.residual * s.residual, 0);
  const totalVariance = totalSumSq - (totalSum * totalSum) / samples.length;

  for (const feature of featureNames) {
    // Get unique sorted values for this feature
    const values = [...new Set(samples.map((s) => s.features[feature] ?? 0))].sort((a, b) => a - b);
    if (values.length < 2) continue;

    // Try midpoints between consecutive unique values
    for (let i = 0; i < values.length - 1; i += 1) {
      const threshold = (values[i] + values[i + 1]) / 2;
      const left: TreeSample[] = [];
      const right: TreeSample[] = [];

      for (const s of samples) {
        if ((s.features[feature] ?? 0) <= threshold) {
          left.push(s);
        } else {
          right.push(s);
        }
      }

      if (left.length < minSamplesLeaf || right.length < minSamplesLeaf) continue;

      const leftSum = left.reduce((acc, s) => acc + s.residual, 0);
      const rightSum = right.reduce((acc, s) => acc + s.residual, 0);
      const leftVar = left.reduce((acc, s) => acc + s.residual * s.residual, 0) - (leftSum * leftSum) / left.length;
      const rightVar = right.reduce((acc, s) => acc + s.residual * s.residual, 0) - (rightSum * rightSum) / right.length;

      const gain = totalVariance - leftVar - rightVar;

      if (gain > bestGain) {
        bestGain = gain;
        bestFeature = feature;
        bestThreshold = threshold;
        bestLeftSamples = left;
        bestRightSamples = right;
      }
    }
  }

  if (bestGain <= 0 || !bestFeature) {
    const sum = samples.reduce((acc, s) => acc + s.residual, 0);
    return sum / (samples.length + lambda);
  }

  return {
    feature: bestFeature,
    threshold: bestThreshold,
    left: buildTree(bestLeftSamples, featureNames, maxDepth, minSamplesLeaf, depth + 1, lambda),
    right: buildTree(bestRightSamples, featureNames, maxDepth, minSamplesLeaf, depth + 1, lambda),
  };
}

function predictTreeValue(node: DecisionNode | number, features: MatchFeatures): number {
  if (typeof node === 'number') return node;
  const value = features[node.feature] ?? 0;
  return value <= node.threshold
    ? predictTreeValue(node.left, features)
    : predictTreeValue(node.right, features);
}

function collectFeatureImportance(
  node: DecisionNode | number,
  importance: Record<string, number>,
  sampleCount: number
): void {
  if (typeof node === 'number') return;
  importance[node.feature] = (importance[node.feature] ?? 0) + 1 / Math.max(1, sampleCount);
  collectFeatureImportance(node.left, importance, sampleCount);
  collectFeatureImportance(node.right, importance, sampleCount);
}

function trainGBT(
  samples: Sample[],
  {
    numTrees = 80,
    maxDepth = 4,
    learningRate = 0.05,
    minSamplesLeaf = 5,
    subsampleRatio = 0.8,
    colSampleRatio = 0.7,
    lambda = 1.0,
    rand,
  }: {
    numTrees?: number;
    maxDepth?: number;
    learningRate?: number;
    minSamplesLeaf?: number;
    subsampleRatio?: number;
    colSampleRatio?: number;
    lambda?: number;
    rand: () => number;
  }
): TreeModel {
  const allFeatureNames = Array.from(new Set(samples.flatMap((s) => Object.keys(s.features))));

  // Initialize with log-odds of positive class
  const positiveCount = samples.filter((s) => s.label === 1).length;
  const negativeCount = samples.length - positiveCount;
  const basePrediction = Math.log(Math.max(1, positiveCount) / Math.max(1, negativeCount));

  const predictions = samples.map(() => basePrediction);
  const trees: DecisionNode[] = [];
  const importance: Record<string, number> = {};

  for (let t = 0; t < numTrees; t += 1) {
    // Compute residuals (negative gradient of log-loss)
    const treeSamples: TreeSample[] = samples.map((s, i) => ({
      features: s.features,
      residual: s.label - sigmoid(predictions[i]),
    }));

    // Row subsampling
    const subsampled = treeSamples.filter(() => rand() < subsampleRatio);
    if (subsampled.length < minSamplesLeaf * 2) continue;

    // Column subsampling — randomly select a subset of features per tree
    const featureNames = allFeatureNames.filter(() => rand() < colSampleRatio);
    if (featureNames.length === 0) continue;

    const tree = buildTree(subsampled, featureNames, maxDepth, minSamplesLeaf, 0, lambda);
    if (typeof tree === 'number') continue; // degenerate tree

    trees.push(tree);
    collectFeatureImportance(tree, importance, samples.length);

    // Update predictions
    for (let i = 0; i < samples.length; i += 1) {
      predictions[i] += learningRate * predictTreeValue(tree, samples[i].features);
    }
  }

  // Normalize importance
  const maxImp = Math.max(...Object.values(importance), 1e-6);
  for (const key of Object.keys(importance)) {
    importance[key] /= maxImp;
  }

  return {
    version: 1,
    type: 'gradient_boosted_trees',
    trainedAt: new Date().toISOString(),
    trees,
    learningRate,
    basePrediction,
    threshold: 0.5,
    featureImportance: importance,
  };
}

// === Evaluation ===

function evaluateModel(
  predict: (features: MatchFeatures) => number,
  samples: Sample[],
  threshold: number
): { accuracy: number; precision: number; recall: number; f1: number } {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;

  for (const sample of samples) {
    const pred = predict(sample.features) >= threshold ? 1 : 0;
    if (pred === 1 && sample.label === 1) tp += 1;
    else if (pred === 1 && sample.label === 0) fp += 1;
    else if (pred === 0 && sample.label === 0) tn += 1;
    else fn += 1;
  }

  const accuracy = (tp + tn) / Math.max(1, tp + tn + fp + fn);
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = (2 * precision * recall) / Math.max(1e-6, precision + recall);

  return { accuracy, precision, recall, f1 };
}

function pickThreshold(
  predict: (features: MatchFeatures) => number,
  samples: Sample[]
): number {
  let best = 0.5;
  let bestF1 = -1;
  for (let t = 0.1; t <= 0.9; t += 0.02) {
    const { f1 } = evaluateModel(predict, samples, t);
    if (f1 > bestF1) {
      bestF1 = f1;
      best = t;
    }
  }
  return best;
}

// === Main ===

async function main(): Promise<void> {
  // Collect training data from multiple sources
  const focusPath = path.resolve(__dirname, 'match-training-review-focus-labeled.csv');
  const mainPath = path.resolve(__dirname, 'match-training-review.csv');
  const auditPath = path.resolve(__dirname, 'audit-training-review.csv');
  const modelPath = resolveModelPath(process.env.MATCH_MODEL_PATH);
  fs.mkdirSync(path.dirname(modelPath), { recursive: true });

  // Also check for auto-labeled training data (from compile-training-labels.ts)
  const autoLabeledPath = process.env.AUTO_LABELED_CSV
    ? path.resolve(process.env.AUTO_LABELED_CSV)
    : path.resolve('/tmp/autolabeled-training.csv');

  const samples: Sample[] = [];
  const csvSources = [
    { path: autoLabeledPath, name: 'auto-labeled (91K)' },
    { path: focusPath, name: 'focus-labeled' },
    { path: mainPath, name: 'main-training' },
    { path: auditPath, name: 'audit-training' },
  ];

  // Deduplicate across sources. Default is gameId+candidateTitle which will drop
  // duplicates across indexers/sources (often ~30k in the 91k audit file).
  const dedupModeRaw = (process.env.MATCH_TRAIN_DEDUP_MODE ?? 'gameIdTitleSource').trim();
  const dedupMode = dedupModeRaw.toLowerCase();
  const dedupToken = dedupMode.replace(/[^a-z0-9]/g, '');
  const seen = new Set<string>();
  const conflictMode = (process.env.MATCH_TRAIN_CONFLICT_MODE ?? 'first').trim().toLowerCase();
  const makeDedupKey = (row: Record<string, string>): string => {
    const gameId = row.gameId ?? '';
    const title = row.candidateTitle ?? '';
    if (dedupToken === 'none') return `${Math.random()}|${gameId}|${title}`; // effectively disable
    if (dedupToken === 'gameidtitlesource') {
      return `${gameId}|${title}|${row.candidateSource ?? ''}|${row.indexerName ?? ''}`;
    }
    if (dedupToken === 'full') {
      return `${gameId}|${title}|${row.candidateSource ?? ''}|${row.indexerName ?? ''}|${row.releaseType ?? ''}|${row.uploader ?? ''}`;
    }
    // gameIdTitle
    return `${gameId}|${title}`;
  };
  console.log(`Dedup mode: ${dedupModeRaw} (token=${dedupToken})`);
  console.log(`Conflict mode: ${conflictMode}`);

  // When requested, drop keys that have conflicting labels (0 vs 1) under the
  // active dedup key definition.
  const conflictingKeys = new Set<string>();
  if (dedupToken !== 'none' && conflictMode === 'drop') {
    const labelSets = new Map<string, Set<string>>();
    for (const source of csvSources) {
      if (!fs.existsSync(source.path)) continue;
      const rows = parseCsv(source.path);
      for (const row of rows) {
        const labelRaw = row.label?.trim();
        if (labelRaw !== '1' && labelRaw !== '0') continue;
        const key = makeDedupKey(row);
        const s = labelSets.get(key) ?? new Set<string>();
        s.add(labelRaw);
        labelSets.set(key, s);
      }
    }
    for (const [k, s] of labelSets.entries()) {
      if (s.size > 1) conflictingKeys.add(k);
    }
    console.log(`Conflicting keys (will drop): ${conflictingKeys.size}`);
  }

  for (const source of csvSources) {
    if (!fs.existsSync(source.path)) continue;
    console.log(`Reading training data from: ${source.path} (${source.name})`);
    const rows = parseCsv(source.path);
    let added = 0;
    let skippedDupes = 0;
    let droppedConflicts = 0;

    for (const row of rows) {
      const labelRaw = row.label?.trim();
      if (labelRaw !== '1' && labelRaw !== '0') continue;
      const key = makeDedupKey(row);

      if (dedupMode !== 'none' && conflictMode === 'drop' && conflictingKeys.has(key)) {
        droppedConflicts++;
        continue;
      }
      if (seen.has(key)) continue;
      seen.add(key);
      const label = labelRaw === '1' ? 1 : 0;
      samples.push({ features: buildFeaturesFromRow(row), label: label as 0 | 1 });
      added++;
    }
    if (dedupToken !== 'none') {
      // Approximate dupe count as total labeled rows - added (since label filter happens before dedup).
      const labeledRows = rows.filter((r) => (r.label?.trim() === '0' || r.label?.trim() === '1')).length;
      skippedDupes = Math.max(0, labeledRows - added);
    }
    console.log(`  Added ${added} labeled samples from ${source.name}`);
    if (dedupToken !== 'none' && conflictMode === 'drop') {
      console.log(`  Dropped ${droppedConflicts} conflicting labeled rows from ${source.name}`);
    }
    if (dedupToken !== 'none') {
      console.log(`  Skipped ~${skippedDupes} duplicates from ${source.name}`);
    }
  }

  if (samples.length < 20) {
    throw new Error(`Not enough labeled samples (${samples.length}). Need at least 20.`);
  }

  console.log(`Found ${samples.length} labeled samples (${samples.filter(s => s.label === 1).length} positive, ${samples.filter(s => s.label === 0).length} negative)`);

  const seed = process.env.MATCH_TRAIN_SEED ? parseInt(process.env.MATCH_TRAIN_SEED, 10) : 42;
  const splitRatio = process.env.MATCH_TRAIN_RATIO ? parseFloat(process.env.MATCH_TRAIN_RATIO) : 0.8;
  const shuffled = [...samples];
  let rng = seed;
  const rand = () => {
    rng = (rng * 1664525 + 1013904223) % 0xffffffff;
    return rng / 0xffffffff;
  };
  shuffled.sort(() => rand() - 0.5);
  const trainCount = Math.max(1, Math.floor(shuffled.length * splitRatio));
  const trainSamples = shuffled.slice(0, trainCount);
  const testSamples = shuffled.slice(trainCount);

  // --- Train Logistic Regression ---
  console.log('\n=== Training Logistic Regression ===');
  const logistic = trainLogisticRegression(trainSamples);
  const logisticPredict = (f: MatchFeatures) => {
    let z = logistic.bias;
    for (const key of logistic.featureNames) {
      z += (logistic.weights[key] ?? 0) * (f[key] ?? 0);
    }
    return sigmoid(z);
  };
  logistic.threshold = pickThreshold(logisticPredict, trainSamples);

  const lrTrain = evaluateModel(logisticPredict, trainSamples, logistic.threshold!);
  const lrTest = evaluateModel(logisticPredict, testSamples.length > 0 ? testSamples : trainSamples, logistic.threshold!);
  console.log(`  Threshold: ${logistic.threshold?.toFixed(2)}`);
  console.log(`  Train: Acc=${(lrTrain.accuracy * 100).toFixed(1)}% P=${(lrTrain.precision * 100).toFixed(1)}% R=${(lrTrain.recall * 100).toFixed(1)}% F1=${(lrTrain.f1 * 100).toFixed(1)}%`);
  console.log(`  Test:  Acc=${(lrTest.accuracy * 100).toFixed(1)}% P=${(lrTest.precision * 100).toFixed(1)}% R=${(lrTest.recall * 100).toFixed(1)}% F1=${(lrTest.f1 * 100).toFixed(1)}%`);

  // --- Train Gradient-Boosted Trees ---
  console.log('\n=== Training Gradient-Boosted Trees ===');
  // Reset RNG for reproducibility
  rng = seed + 1;
  const envInt = (k: string, def: number): number => {
    const v = process.env[k];
    if (!v) return def;
    const n = parseInt(v, 10);
    return Number.isFinite(n) ? n : def;
  };
  const envFloat = (k: string, def: number): number => {
    const v = process.env[k];
    if (!v) return def;
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : def;
  };
  const gbt = trainGBT(trainSamples, {
    numTrees: envInt('MATCH_TRAIN_GBT_TREES', 80),
    maxDepth: envInt('MATCH_TRAIN_GBT_DEPTH', 4),
    learningRate: envFloat('MATCH_TRAIN_GBT_LR', 0.05),
    minSamplesLeaf: envInt('MATCH_TRAIN_GBT_MIN_LEAF', 3),
    subsampleRatio: envFloat('MATCH_TRAIN_GBT_SUBSAMPLE', 0.8),
    colSampleRatio: envFloat('MATCH_TRAIN_GBT_COLSAMPLE', 0.7),
    lambda: envFloat('MATCH_TRAIN_GBT_LAMBDA', 1.0),
    rand,
  });
  const gbtPredict = (f: MatchFeatures) => {
    let raw = gbt.basePrediction;
    for (const tree of gbt.trees) {
      raw += gbt.learningRate * predictTreeValue(tree, f);
    }
    return sigmoid(raw);
  };
  gbt.threshold = pickThreshold(gbtPredict, trainSamples);

  const gbtTrain = evaluateModel(gbtPredict, trainSamples, gbt.threshold);
  const gbtTest = evaluateModel(gbtPredict, testSamples.length > 0 ? testSamples : trainSamples, gbt.threshold);
  console.log(`  Trees: ${gbt.trees.length}`);
  console.log(`  Threshold: ${gbt.threshold.toFixed(2)}`);
  console.log(`  Train: Acc=${(gbtTrain.accuracy * 100).toFixed(1)}% P=${(gbtTrain.precision * 100).toFixed(1)}% R=${(gbtTrain.recall * 100).toFixed(1)}% F1=${(gbtTrain.f1 * 100).toFixed(1)}%`);
  console.log(`  Test:  Acc=${(gbtTest.accuracy * 100).toFixed(1)}% P=${(gbtTest.precision * 100).toFixed(1)}% R=${(gbtTest.recall * 100).toFixed(1)}% F1=${(gbtTest.f1 * 100).toFixed(1)}%`);

  // Top feature importance
  const sortedImportance = Object.entries(gbt.featureImportance)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15);
  console.log('\n  Top features by importance:');
  for (const [feature, imp] of sortedImportance) {
    console.log(`    ${feature}: ${imp.toFixed(3)}`);
  }

  // --- Build Combined Ensemble ---
  console.log('\n=== Building Ensemble ===');

  // Find optimal ensemble weight
  let bestWeight = 0;
  let bestEnsembleF1 = -1;
  const evalSamples = testSamples.length > 0 ? testSamples : trainSamples;
  for (let w = 0; w <= 1.0; w += 0.05) {
    const ensemblePredict = (f: MatchFeatures) => (1 - w) * logisticPredict(f) + w * gbtPredict(f);
    // Search for best threshold at this weight
    let bestThreshF1 = -1;
    let bestThresh = 0.5;
    for (let t = 0.1; t <= 0.9; t += 0.02) {
      const { f1 } = evaluateModel(ensemblePredict, evalSamples, t);
      if (f1 > bestThreshF1) {
        bestThreshF1 = f1;
        bestThresh = t;
      }
    }
    if (bestThreshF1 > bestEnsembleF1) {
      bestEnsembleF1 = bestThreshF1;
      bestWeight = w;
    }
  }

  const ensemblePredict = (f: MatchFeatures) => (1 - bestWeight) * logisticPredict(f) + bestWeight * gbtPredict(f);
  const ensembleThreshold = pickThreshold(ensemblePredict, evalSamples);
  const ensembleTrain = evaluateModel(ensemblePredict, trainSamples, ensembleThreshold);
  const ensembleTest = evaluateModel(ensemblePredict, evalSamples, ensembleThreshold);

  console.log(`  Ensemble weight: ${bestWeight.toFixed(2)} (0=logistic, 1=trees)`);
  console.log(`  Threshold: ${ensembleThreshold.toFixed(2)}`);
  console.log(`  Train: Acc=${(ensembleTrain.accuracy * 100).toFixed(1)}% P=${(ensembleTrain.precision * 100).toFixed(1)}% R=${(ensembleTrain.recall * 100).toFixed(1)}% F1=${(ensembleTrain.f1 * 100).toFixed(1)}%`);
  console.log(`  Test:  Acc=${(ensembleTest.accuracy * 100).toFixed(1)}% P=${(ensembleTest.precision * 100).toFixed(1)}% R=${(ensembleTest.recall * 100).toFixed(1)}% F1=${(ensembleTest.f1 * 100).toFixed(1)}%`);

  // --- Save ---
  // Save before (optional) cross-validation so long CV runs don't block producing a model file.
  const combined: CombinedModel = {
    version: 2,
    trainedAt: new Date().toISOString(),
    type: 'combined',
    logistic,
    trees: gbt,
    ensembleWeight: bestWeight,
    threshold: ensembleThreshold,
  };

  fs.writeFileSync(modelPath, JSON.stringify(combined, null, 2), 'utf-8');
  console.log(`\nModel saved to ${modelPath}`);

  // Also save individual models for inspection
  const logisticPath = modelPath.replace('.json', '-logistic.json');
  const gbtPath = modelPath.replace('.json', '-gbt.json');
  fs.writeFileSync(logisticPath, JSON.stringify(logistic, null, 2), 'utf-8');
  fs.writeFileSync(gbtPath, JSON.stringify(gbt, null, 2), 'utf-8');
  console.log(`Individual models saved to ${logisticPath} and ${gbtPath}`);

  // --- Cross-Validation (Optional) ---
  const skipCv = process.env.MATCH_TRAIN_SKIP_CV === 'true';
  const envFoldsRaw = process.env.MATCH_TRAIN_CV_FOLDS;
  const envFolds = envFoldsRaw ? parseInt(envFoldsRaw, 10) : 0;
  const kFolds = skipCv ? 0 : (Number.isFinite(envFolds) ? envFolds : 0);
  if (kFolds < 2) {
    console.log('\n=== Cross-Validation ===');
    console.log('  Skipped (set MATCH_TRAIN_CV_FOLDS>=2 to enable)');
    return;
  }

  console.log(`\n=== ${kFolds}-Fold Cross-Validation ===`);
  const foldSize = Math.floor(shuffled.length / kFolds);
  const cvMetrics: { accuracy: number; precision: number; recall: number; f1: number }[] = [];

  for (let fold = 0; fold < kFolds; fold += 1) {
    const foldStart = fold * foldSize;
    const foldEnd = fold === kFolds - 1 ? shuffled.length : (fold + 1) * foldSize;
    const cvTest = shuffled.slice(foldStart, foldEnd);
    const cvTrain = [...shuffled.slice(0, foldStart), ...shuffled.slice(foldEnd)];

    // Train on fold
    let foldRng = seed + fold * 100;
    const foldRand = () => {
      foldRng = (foldRng * 1664525 + 1013904223) % 0xffffffff;
      return foldRng / 0xffffffff;
    };

    const foldLR = trainLogisticRegression(cvTrain);
    const foldLRPredict = (f: MatchFeatures) => {
      let z = foldLR.bias;
      for (const key of foldLR.featureNames) z += (foldLR.weights[key] ?? 0) * (f[key] ?? 0);
      return sigmoid(z);
    };

    const foldGBT = trainGBT(cvTrain, {
      numTrees: 80, maxDepth: 4, learningRate: 0.05,
      minSamplesLeaf: 3, subsampleRatio: 0.8, colSampleRatio: 0.7, lambda: 1.0,
      rand: foldRand,
    });
    const foldGBTPredict = (f: MatchFeatures) => {
      let raw = foldGBT.basePrediction;
      for (const tree of foldGBT.trees) raw += foldGBT.learningRate * predictTreeValue(tree, f);
      return sigmoid(raw);
    };

    const foldPredict = (f: MatchFeatures) => (1 - bestWeight) * foldLRPredict(f) + bestWeight * foldGBTPredict(f);
    const foldThreshold = pickThreshold(foldPredict, cvTrain);
    const foldMetrics = evaluateModel(foldPredict, cvTest, foldThreshold);
    cvMetrics.push(foldMetrics);
    console.log(`  Fold ${fold + 1}: Acc=${(foldMetrics.accuracy * 100).toFixed(1)}% P=${(foldMetrics.precision * 100).toFixed(1)}% R=${(foldMetrics.recall * 100).toFixed(1)}% F1=${(foldMetrics.f1 * 100).toFixed(1)}%`);
  }

  const avgF1 = cvMetrics.reduce((s, m) => s + m.f1, 0) / kFolds;
  const avgAcc = cvMetrics.reduce((s, m) => s + m.accuracy, 0) / kFolds;
  const avgP = cvMetrics.reduce((s, m) => s + m.precision, 0) / kFolds;
  const avgR = cvMetrics.reduce((s, m) => s + m.recall, 0) / kFolds;
  console.log(`  Average: Acc=${(avgAcc * 100).toFixed(1)}% P=${(avgP * 100).toFixed(1)}% R=${(avgR * 100).toFixed(1)}% F1=${(avgF1 * 100).toFixed(1)}%`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
