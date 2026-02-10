import fs from 'fs';
import path from 'path';

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
  { key: 'title_contains', test: (r) => r === 'title contains game name' },
  { key: 'strong_title', test: (r) => r === 'strong title match' },
  { key: 'prefixed_title', test: (r) => r === 'prefixed title match' },
  { key: 'game_name_contains', test: (r) => r === 'game name contains title' },
  { key: 'alt_title', test: (r) => r === 'matches alternative title' },
  { key: 'edition_title', test: (r) => r === 'matches edition title' },
  { key: 'edition_variant', test: (r) => r === 'edition variant' },
  { key: 'word_match_high', test: (r) => r === 'very high word match ratio' },
  { key: 'keywords_all', test: (r) => r === 'all main keywords present' },
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
];

export function extractFeatures(reasons: string[], score: number): MatchFeatures {
  const features: MatchFeatures = {
    score_norm: Math.max(0, Math.min(1, score / 150)),
  };

  for (const rule of FEATURE_RULES) {
    features[rule.key] = reasons.some(rule.test) ? 1 : 0;
  }

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

export function loadMatchModel(modelPath: string): MatchModel | null {
  try {
    if (!fs.existsSync(modelPath)) return null;
    const raw = fs.readFileSync(modelPath, 'utf-8');
    return JSON.parse(raw) as MatchModel;
  } catch {
    return null;
  }
}

export function resolveModelPath(pathOverride?: string): string {
  if (pathOverride) return pathOverride;
  return path.resolve(__dirname, '..', '..', '..', '..', 'data', 'match-model.json');
}
