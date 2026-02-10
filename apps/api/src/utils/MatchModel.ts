import fs from 'fs';
import path from 'path';

// === Logistic Regression Model ===

export type MatchModel = {
  version: number;
  trainedAt: string;
  featureNames: string[];
  weights: Record<string, number>;
  bias: number;
  threshold?: number;
};

export type MatchFeatures = Record<string, number>;

type FeatureRule = {
  key: string;
  test: (reason: string) => boolean;
};

const FEATURE_RULES: FeatureRule[] = [
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

// Extract continuous features from matching reasons where available
function extractContinuousFeatures(reasons: string[], score: number): MatchFeatures {
  const features: MatchFeatures = {};

  // Normalized score as continuous feature
  features.score_norm = Math.max(0, Math.min(1, score / 150));

  // Extract ML probability if present from a previous pass (for re-training)
  for (const r of reasons) {
    const mlMatch = r.match(/^ml probability ([\d.]+)$/);
    if (mlMatch) {
      features.prev_ml_prob = parseFloat(mlMatch[1]);
    }

    // Extract hydra extra token count
    const hydraMatch = r.match(/^hydra extra tokens \(([^)]*)\)$/);
    if (hydraMatch) {
      features.hydra_extra_count = hydraMatch[1].split(',').length;
    }

    // Extract size ratio from size-related reasons
    const sizeMatch = r.match(/([\d.]+)% of Steam/);
    if (sizeMatch) {
      features.size_ratio = parseFloat(sizeMatch[1]) / 100;
    }
  }

  return features;
}

export function extractFeatures(reasons: string[], score: number): MatchFeatures {
  const continuous = extractContinuousFeatures(reasons, score);
  const features: MatchFeatures = { ...continuous };

  for (const rule of FEATURE_RULES) {
    features[rule.key] = reasons.some(rule.test) ? 1 : 0;
  }

  // Composite interaction features for non-linear signal
  features.exact_and_single_word = (features.exact_name ?? 0) * (features.single_word_partial ?? 0);
  features.exact_and_sequel = (features.exact_name ?? 0) * (features.sequel_match ?? 0);
  features.phrase_and_keywords = (features.exact_phrase ?? 0) * (features.keywords_all ?? 0);
  features.single_word_and_extra = (features.single_word_partial ?? 0) * (features.single_word_extra ?? 0);

  return features;
}

export function predictProbability(model: MatchModel, features: MatchFeatures): number {
  let z = model.bias;
  for (const key of model.featureNames) {
    const value = features[key] ?? 0;
    z += (model.weights[key] ?? 0) * value;
  }
  return 1 / (1 + Math.exp(-z));
}

// === Decision Tree / Gradient-Boosted Trees ===

export type DecisionNode = {
  feature: string;
  threshold: number;
  left: DecisionNode | number;  // left = feature <= threshold
  right: DecisionNode | number; // right = feature > threshold
};

export type TreeModel = {
  version: number;
  type: 'gradient_boosted_trees';
  trainedAt: string;
  trees: DecisionNode[];
  learningRate: number;
  basePrediction: number;
  threshold: number;
  featureImportance: Record<string, number>;
};

export type CombinedModel = {
  version: number;
  trainedAt: string;
  type: 'combined';
  logistic: MatchModel;
  trees: TreeModel | null;
  ensembleWeight: number; // 0 = logistic only, 1 = trees only
  threshold: number;
};

function predictTree(node: DecisionNode | number, features: MatchFeatures): number {
  if (typeof node === 'number') return node;
  const value = features[node.feature] ?? 0;
  return value <= node.threshold
    ? predictTree(node.left, features)
    : predictTree(node.right, features);
}

export function predictGBT(model: TreeModel, features: MatchFeatures): number {
  let rawPrediction = model.basePrediction;
  for (const tree of model.trees) {
    rawPrediction += model.learningRate * predictTree(tree, features);
  }
  return 1 / (1 + Math.exp(-rawPrediction));
}

export function predictCombined(model: CombinedModel, features: MatchFeatures): number {
  const logisticProb = predictProbability(model.logistic, features);

  if (!model.trees) return logisticProb;

  const treeProb = predictGBT(model.trees, features);
  const w = model.ensembleWeight;
  return (1 - w) * logisticProb + w * treeProb;
}

// === Model Loading ===

export function loadMatchModel(modelPath: string): MatchModel | null {
  try {
    if (!fs.existsSync(modelPath)) return null;
    const raw = fs.readFileSync(modelPath, 'utf-8');
    return JSON.parse(raw) as MatchModel;
  } catch {
    return null;
  }
}

export function loadCombinedModel(modelPath: string): CombinedModel | null {
  try {
    if (!fs.existsSync(modelPath)) return null;
    const raw = fs.readFileSync(modelPath, 'utf-8');
    const parsed = JSON.parse(raw);
    if (parsed.type === 'combined') return parsed as CombinedModel;
    // Backward compat: wrap a plain logistic model
    if (parsed.featureNames && parsed.weights) {
      return {
        version: parsed.version ?? 1,
        trainedAt: parsed.trainedAt ?? '',
        type: 'combined',
        logistic: parsed as MatchModel,
        trees: null,
        ensembleWeight: 0,
        threshold: parsed.threshold ?? 0.5,
      };
    }
    return null;
  } catch {
    return null;
  }
}

export function resolveModelPath(pathOverride?: string): string {
  if (pathOverride) return pathOverride;
  return path.resolve(__dirname, '..', '..', '..', '..', 'data', 'match-model.json');
}
