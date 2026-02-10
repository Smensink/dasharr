import fs from 'fs';
import path from 'path';
import { extractFeatures, MatchModel, resolveModelPath } from '../utils/MatchModel';

type Sample = {
  features: Record<string, number>;
  label: 0 | 1;
};

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
    const reasons = (row.reasons || '').split('|').filter(Boolean);
    const score = parseFloat(row.matchScore || '0');
    const features = extractFeatures(reasons, Number.isFinite(score) ? score : 0);
    samples.push({ features, label });
  }
  return samples;
}

function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

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

function evaluate(model: MatchModel, samples: Sample[]): { accuracy: number; precision: number; recall: number; f1: number } {
  let tp = 0;
  let fp = 0;
  let tn = 0;
  let fn = 0;
  const threshold = model.threshold ?? 0.5;

  for (const sample of samples) {
    let z = model.bias;
    for (const name of model.featureNames) {
      z += (model.weights[name] ?? 0) * (sample.features[name] ?? 0);
    }
    const pred = sigmoid(z) >= threshold ? 1 : 0;
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

function pickThreshold(model: MatchModel, samples: Sample[]): number {
  let best = 0.5;
  let bestF1 = -1;
  for (let t = 0.1; t <= 0.9; t += 0.02) {
    model.threshold = t;
    const { f1 } = evaluate(model, samples);
    if (f1 > bestF1) {
      bestF1 = f1;
      best = t;
    }
  }
  return best;
}

async function main(): Promise<void> {
  const csvPath = path.resolve(__dirname, 'match-training-review.csv');
  const modelPath = resolveModelPath(process.env.MATCH_MODEL_PATH);
  fs.mkdirSync(path.dirname(modelPath), { recursive: true });

  const rows = parseCsv(csvPath);
  const samples = buildSamples(rows);
  if (samples.length < 20) {
    throw new Error(`Not enough labeled samples (${samples.length}).`);
  }

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

  const model = trainLogisticRegression(trainSamples);
  model.threshold = pickThreshold(model, trainSamples);

  const trainStats = evaluate(model, trainSamples);
  const testStats = evaluate(model, testSamples.length > 0 ? testSamples : trainSamples);
  fs.writeFileSync(modelPath, JSON.stringify(model, null, 2), 'utf-8');

  console.log(`Trained samples: ${trainSamples.length} (total labeled: ${samples.length})`);
  console.log(`Model saved to ${modelPath}`);
  console.log(`Threshold: ${model.threshold?.toFixed(2)}`);
  console.log(`Train Accuracy: ${(trainStats.accuracy * 100).toFixed(1)}%`);
  console.log(`Train Precision: ${(trainStats.precision * 100).toFixed(1)}%`);
  console.log(`Train Recall: ${(trainStats.recall * 100).toFixed(1)}%`);
  console.log(`Train F1: ${(trainStats.f1 * 100).toFixed(1)}%`);
  console.log(`Test Accuracy: ${(testStats.accuracy * 100).toFixed(1)}%`);
  console.log(`Test Precision: ${(testStats.precision * 100).toFixed(1)}%`);
  console.log(`Test Recall: ${(testStats.recall * 100).toFixed(1)}%`);
  console.log(`Test F1: ${(testStats.f1 * 100).toFixed(1)}%`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
