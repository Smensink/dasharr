/**
 * generate-audit-report.ts
 *
 * Processes existing audit data files and generates a comprehensive report with:
 * - Aggregate precision/recall/F1 per agent
 * - Cross-agent comparison
 * - Expected match analysis (PC availability)
 * - Reason breakdown for no-match cases
 * - Summary statistics
 *
 * Usage:
 *   npx tsx apps/api/src/scripts/generate-audit-report.ts
 *
 * Reads from:
 *   - data/single-word-matching-audit.json
 *   - apps/api/src/scripts/hydra-match-audit-output.json
 *   - apps/api/src/scripts/match-training-review-focus-labeled.csv
 *   - apps/api/src/scripts/match-training-review.csv
 *
 * Outputs:
 *   - data/audit-report.md
 *   - data/audit-report.json
 */

import fs from 'fs';
import path from 'path';
import { extractFeatures, predictProbability, loadMatchModel, resolveModelPath } from '../utils/MatchModel';

function resolveRepoPath(...segments: string[]): string {
  return path.resolve(__dirname, '..', '..', '..', '..', ...segments);
}

function loadJson<T>(filePath: string): T | null {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return null;
  }
}

function parseCsv(filePath: string): Array<Record<string, string>> {
  try {
    if (!fs.existsSync(filePath)) return [];
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
  } catch {
    return [];
  }
}

// PC platform keywords
const PC_PLATFORMS = ['PC (Microsoft Windows)', 'PC', 'Windows', 'Linux', 'Mac', 'SteamOS'];

function hasPCPlatform(platforms: string[] | undefined): boolean {
  if (!platforms || platforms.length === 0) return false;
  return platforms.some(p => PC_PLATFORMS.some(pc => p.includes(pc)));
}

// Known console-only franchise patterns
const CONSOLE_ONLY_PATTERNS = [
  /gran turismo/i, /god of war.*(?:ascension|chains|ghost)/i,
  /halo.*(?:combat|reach|odst|wars)/i, /mario.*(?:galaxy|sunshine|party|kart)/i,
  /zelda.*(?:ocarina|majora|wind|twilight|skyward|minish|phantom)/i,
  /smash bros/i, /pokemon.*(?:ruby|sapphire|diamond|pearl|sun|moon|sword|shield|scarlet|violet)/i,
  /kirby/i, /animal crossing/i, /splatoon/i, /metroid.*(?:dread|fusion|zero)/i,
  /fire emblem.*(?:awakening|fates|echoes|engage)/i,
  /uncharted.*(?:fortune|thieves|legacy)/i, /ratchet.*clank/i,
  /bloodborne/i, /ghost of tsushima/i, /spider.*man.*(?:miles|2)/i,
  /the last of us/i, /horizon.*(?:forbidden|burning)/i,
];

function isLikelyConsoleOnly(name: string, platforms: string[] | undefined): boolean {
  if (hasPCPlatform(platforms)) return false;
  return CONSOLE_ONLY_PATTERNS.some(p => p.test(name));
}

type AgentMetrics = {
  agent: string;
  totalGames: number;
  matched: number;
  notMatched: number;
  avgScore: number;
  topScoreGames: Array<{ name: string; score: number }>;
  bottomScoreGames: Array<{ name: string; score: number; reasons: string[] }>;
};

type TrainingMetrics = {
  totalRows: number;
  labeledRows: number;
  positiveLabels: number;
  negativeLabels: number;
  unlabeled: number;
  sources: Record<string, { total: number; labeled: number }>;
  scoreDistribution: { bucket: string; count: number; matchRate: number }[];
};

type AuditReport = {
  generatedAt: string;
  summary: {
    singleWordAudit: { games: number; agents: string[] } | null;
    hydraAudit: { games: number; matched: number; missRate: number } | null;
    trainingData: TrainingMetrics | null;
    modelInfo: { path: string; threshold: number; featureCount: number; trainedAt: string } | null;
  };
  perAgentMetrics: AgentMetrics[];
  hydraAnalysis: {
    matchedGames: number;
    noMatchGames: number;
    noMatchReasons: Array<{ reason: string; count: number }>;
    consoleOnlyMisses: number;
    pcMisses: number;
    broadMatchesFound: number;
  } | null;
  trainingDataAnalysis: TrainingMetrics | null;
  recommendations: string[];
};

function analyzeHydraAudit(data: any[]): AuditReport['hydraAnalysis'] {
  const matched = data.filter(d => d.topCandidate !== null);
  const noMatch = data.filter(d => d.topCandidate === null);

  const noMatchReasons: Record<string, number> = {};

  for (const game of noMatch) {
    if (game.broadMatches && game.broadMatches.length > 0) {
      noMatchReasons['Has broad matches (scoring below threshold)'] =
        (noMatchReasons['Has broad matches (scoring below threshold)'] ?? 0) + 1;
    } else {
      noMatchReasons['No candidates found in any source'] =
        (noMatchReasons['No candidates found in any source'] ?? 0) + 1;
    }
  }

  const consoleOnlyMisses = noMatch.filter(g =>
    isLikelyConsoleOnly(g.name, undefined)
  ).length;

  const broadMatchesFound = noMatch.filter(g =>
    g.broadMatches && g.broadMatches.length > 0
  ).length;

  return {
    matchedGames: matched.length,
    noMatchGames: noMatch.length,
    noMatchReasons: Object.entries(noMatchReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count),
    consoleOnlyMisses,
    pcMisses: noMatch.length - consoleOnlyMisses,
    broadMatchesFound,
  };
}

function analyzeSingleWordAudit(data: any): AgentMetrics[] {
  const agents = ['fitgirl', 'steamrip', 'dodi', 'prowlarr'];
  const metrics: AgentMetrics[] = [];

  for (const agent of agents) {
    let totalGames = 0;
    let matched = 0;
    let notMatched = 0;
    let totalScore = 0;
    const topScoreGames: Array<{ name: string; score: number }> = [];
    const bottomScoreGames: Array<{ name: string; score: number; reasons: string[] }> = [];

    for (const game of data.games || []) {
      const agentData = game.agents?.[agent];
      if (!agentData || agentData.skipped) continue;
      totalGames += 1;

      const best = agentData.best;
      if (best && best.score >= 70) {
        matched += 1;
        totalScore += best.score;
        topScoreGames.push({ name: game.name, score: best.score });
      } else {
        notMatched += 1;
        if (best) {
          totalScore += best.score;
          bottomScoreGames.push({ name: game.name, score: best.score, reasons: best.reasons || [] });
        } else {
          bottomScoreGames.push({ name: game.name, score: 0, reasons: ['no results'] });
        }
      }
    }

    topScoreGames.sort((a, b) => b.score - a.score);
    bottomScoreGames.sort((a, b) => a.score - b.score);

    metrics.push({
      agent,
      totalGames,
      matched,
      notMatched,
      avgScore: totalGames > 0 ? totalScore / totalGames : 0,
      topScoreGames: topScoreGames.slice(0, 5),
      bottomScoreGames: bottomScoreGames.slice(0, 5),
    });
  }

  return metrics;
}

function analyzeTrainingData(rows: Array<Record<string, string>>): TrainingMetrics {
  const sources: Record<string, { total: number; labeled: number }> = {};
  let labeled = 0;
  let positive = 0;
  let negative = 0;

  const scoreBuckets: Record<string, { count: number; matches: number }> = {
    '0-30': { count: 0, matches: 0 },
    '31-50': { count: 0, matches: 0 },
    '51-70': { count: 0, matches: 0 },
    '71-90': { count: 0, matches: 0 },
    '91-110': { count: 0, matches: 0 },
    '111-130': { count: 0, matches: 0 },
    '131-150': { count: 0, matches: 0 },
  };

  for (const row of rows) {
    const source = row.candidateSource || 'unknown';
    const sourceKey = source.match(/Hydra Library \(([^)]+)\)/)?.[1] || source;
    if (!sources[sourceKey]) sources[sourceKey] = { total: 0, labeled: 0 };
    sources[sourceKey].total += 1;

    const label = row.label?.trim();
    if (label === '1' || label === '0') {
      labeled += 1;
      sources[sourceKey].labeled += 1;
      if (label === '1') positive += 1;
      else negative += 1;
    }

    const score = parseFloat(row.matchScore || '0');
    let bucket = '0-30';
    if (score > 130) bucket = '131-150';
    else if (score > 110) bucket = '111-130';
    else if (score > 90) bucket = '91-110';
    else if (score > 70) bucket = '71-90';
    else if (score > 50) bucket = '51-70';
    else if (score > 30) bucket = '31-50';

    scoreBuckets[bucket].count += 1;
    if (label === '1') scoreBuckets[bucket].matches += 1;
  }

  return {
    totalRows: rows.length,
    labeledRows: labeled,
    positiveLabels: positive,
    negativeLabels: negative,
    unlabeled: rows.length - labeled,
    sources,
    scoreDistribution: Object.entries(scoreBuckets).map(([bucket, data]) => ({
      bucket,
      count: data.count,
      matchRate: data.count > 0 ? data.matches / data.count : 0,
    })),
  };
}

function generateRecommendations(report: AuditReport): string[] {
  const recs: string[] = [];

  if (report.trainingDataAnalysis) {
    const td = report.trainingDataAnalysis;
    if (td.unlabeled > td.labeledRows) {
      recs.push(`Label more training data: ${td.unlabeled} unlabeled rows remain (vs ${td.labeledRows} labeled). Target 1000+ labeled samples for reliable model performance.`);
    }
    if (td.positiveLabels > 0 && td.negativeLabels > 0) {
      const ratio = td.positiveLabels / td.negativeLabels;
      if (ratio > 2 || ratio < 0.5) {
        recs.push(`Class imbalance detected: ${td.positiveLabels} positive vs ${td.negativeLabels} negative labels (ratio ${ratio.toFixed(2)}). Consider balancing the training set.`);
      }
    }
  }

  if (report.hydraAnalysis) {
    const ha = report.hydraAnalysis;
    if (ha.broadMatchesFound > 0) {
      recs.push(`${ha.broadMatchesFound} games have broad matches but no top candidate. These are scoring below threshold and may need rule adjustments (likely single-word or sequel issues).`);
    }
    if (ha.consoleOnlyMisses > 10) {
      recs.push(`${ha.consoleOnlyMisses} no-match games appear console-only. Filter these out of the audit to get accurate PC miss rates.`);
    }
    const missRate = ha.noMatchGames / (ha.matchedGames + ha.noMatchGames);
    if (missRate > 0.4) {
      recs.push(`High miss rate (${(missRate * 100).toFixed(0)}%). Many popular games have no Hydra Library match. Consider adding more sources or relaxing the match threshold for high-confidence name matches.`);
    }
  }

  const singleWordMetrics = report.perAgentMetrics.find(m => m.agent === 'prowlarr');
  if (singleWordMetrics && singleWordMetrics.notMatched > singleWordMetrics.matched) {
    recs.push(`Prowlarr has more misses than matches on single-word titles. The single-word penalty (-60) may be too aggressive. Consider reducing it when exact_name or exact_phrase fires.`);
  }

  recs.push('Re-run the audit with --limit 500 for statistically significant results (current audits use 25-200 games).');
  recs.push('Add the Hydra Library agent to the single-word audit for cross-agent comparison.');
  recs.push('After re-training the model, re-run both audits to measure improvement.');

  return recs;
}

function formatMarkdown(report: AuditReport): string {
  const lines: string[] = [];

  lines.push('# Game Matching Audit Report');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push('');

  // Summary
  lines.push('## Summary');
  lines.push('');
  if (report.summary.singleWordAudit) {
    lines.push(`- **Single-word audit**: ${report.summary.singleWordAudit.games} games across ${report.summary.singleWordAudit.agents.length} agents`);
  }
  if (report.summary.hydraAudit) {
    lines.push(`- **Hydra audit**: ${report.summary.hydraAudit.games} games, ${report.summary.hydraAudit.matched} matched (${(100 - report.summary.hydraAudit.missRate * 100).toFixed(0)}% hit rate)`);
  }
  if (report.summary.trainingData) {
    const td = report.summary.trainingData;
    lines.push(`- **Training data**: ${td.labeledRows} labeled / ${td.totalRows} total (${td.positiveLabels} positive, ${td.negativeLabels} negative)`);
  }
  if (report.summary.modelInfo) {
    const m = report.summary.modelInfo;
    lines.push(`- **Model**: ${m.featureCount} features, threshold=${m.threshold}, trained ${m.trainedAt}`);
  }
  lines.push('');

  // Per-agent metrics
  if (report.perAgentMetrics.length > 0) {
    lines.push('## Per-Agent Metrics (Single-Word Audit)');
    lines.push('');
    lines.push('| Agent | Games | Matched | Missed | Match Rate | Avg Score |');
    lines.push('|-------|-------|---------|--------|------------|-----------|');
    for (const m of report.perAgentMetrics) {
      const rate = m.totalGames > 0 ? ((m.matched / m.totalGames) * 100).toFixed(0) : 'N/A';
      lines.push(`| ${m.agent} | ${m.totalGames} | ${m.matched} | ${m.notMatched} | ${rate}% | ${m.avgScore.toFixed(0)} |`);
    }
    lines.push('');

    for (const m of report.perAgentMetrics) {
      if (m.bottomScoreGames.length > 0) {
        lines.push(`### ${m.agent} - Lowest scoring games`);
        for (const g of m.bottomScoreGames) {
          lines.push(`- **${g.name}** (score ${g.score}): ${g.reasons.slice(0, 3).join(', ')}`);
        }
        lines.push('');
      }
    }
  }

  // Hydra analysis
  if (report.hydraAnalysis) {
    const ha = report.hydraAnalysis;
    lines.push('## Hydra Library Audit Analysis');
    lines.push('');
    lines.push(`- Matched: ${ha.matchedGames}`);
    lines.push(`- No match: ${ha.noMatchGames} (${ha.consoleOnlyMisses} console-only, ${ha.pcMisses} PC games)`);
    lines.push(`- Broad matches found (below threshold): ${ha.broadMatchesFound}`);
    lines.push('');

    if (ha.noMatchReasons.length > 0) {
      lines.push('### No-match reasons');
      for (const r of ha.noMatchReasons) {
        lines.push(`- ${r.reason}: ${r.count}`);
      }
      lines.push('');
    }
  }

  // Training data analysis
  if (report.trainingDataAnalysis) {
    const td = report.trainingDataAnalysis;
    lines.push('## Training Data Analysis');
    lines.push('');
    lines.push(`- Total rows: ${td.totalRows}`);
    lines.push(`- Labeled: ${td.labeledRows} (${td.positiveLabels} match, ${td.negativeLabels} no-match)`);
    lines.push(`- Unlabeled: ${td.unlabeled}`);
    lines.push('');

    lines.push('### Score Distribution');
    lines.push('');
    lines.push('| Score Range | Count | Match Rate |');
    lines.push('|-------------|-------|------------|');
    for (const d of td.scoreDistribution) {
      const rate = d.count > 0 ? `${(d.matchRate * 100).toFixed(0)}%` : 'N/A';
      lines.push(`| ${d.bucket} | ${d.count} | ${rate} |`);
    }
    lines.push('');

    const topSources = Object.entries(td.sources)
      .sort((a, b) => b[1].total - a[1].total)
      .slice(0, 10);
    if (topSources.length > 0) {
      lines.push('### Top Sources');
      lines.push('');
      lines.push('| Source | Total | Labeled |');
      lines.push('|--------|-------|---------|');
      for (const [source, data] of topSources) {
        lines.push(`| ${source} | ${data.total} | ${data.labeled} |`);
      }
      lines.push('');
    }
  }

  // Recommendations
  if (report.recommendations.length > 0) {
    lines.push('## Recommendations');
    lines.push('');
    for (let i = 0; i < report.recommendations.length; i += 1) {
      lines.push(`${i + 1}. ${report.recommendations[i]}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main(): Promise<void> {
  // Load data
  const singleWordData = loadJson<any>(resolveRepoPath('data', 'single-word-matching-audit.json'));
  const hydraAuditData = loadJson<any[]>(resolveRepoPath('apps', 'api', 'src', 'scripts', 'hydra-match-audit-output.json'));
  const focusLabeledRows = parseCsv(resolveRepoPath('apps', 'api', 'src', 'scripts', 'match-training-review-focus-labeled.csv'));
  const mainTrainingRows = parseCsv(resolveRepoPath('apps', 'api', 'src', 'scripts', 'match-training-review.csv'));
  const allTrainingRows = [...focusLabeledRows, ...mainTrainingRows];

  // Load model info
  const modelPath = resolveModelPath();
  const modelRaw = loadJson<any>(modelPath);
  const modelInfo = modelRaw ? {
    path: modelPath,
    threshold: modelRaw.threshold ?? modelRaw.logistic?.threshold ?? 0.5,
    featureCount: modelRaw.featureNames?.length ?? modelRaw.logistic?.featureNames?.length ?? 0,
    trainedAt: modelRaw.trainedAt ?? '',
  } : null;

  // Build report
  const report: AuditReport = {
    generatedAt: new Date().toISOString(),
    summary: {
      singleWordAudit: singleWordData ? {
        games: singleWordData.games?.length ?? 0,
        agents: ['fitgirl', 'steamrip', 'dodi', 'prowlarr'],
      } : null,
      hydraAudit: hydraAuditData ? {
        games: hydraAuditData.length,
        matched: hydraAuditData.filter(d => d.topCandidate !== null).length,
        missRate: hydraAuditData.filter(d => d.topCandidate === null).length / Math.max(1, hydraAuditData.length),
      } : null,
      trainingData: allTrainingRows.length > 0 ? analyzeTrainingData(allTrainingRows) : null,
      modelInfo,
    },
    perAgentMetrics: singleWordData ? analyzeSingleWordAudit(singleWordData) : [],
    hydraAnalysis: hydraAuditData ? analyzeHydraAudit(hydraAuditData) : null,
    trainingDataAnalysis: allTrainingRows.length > 0 ? analyzeTrainingData(allTrainingRows) : null,
    recommendations: [],
  };

  report.recommendations = generateRecommendations(report);

  // Write outputs
  const reportJsonPath = resolveRepoPath('data', 'audit-report.json');
  const reportMdPath = resolveRepoPath('data', 'audit-report.md');

  fs.writeFileSync(reportJsonPath, JSON.stringify(report, null, 2), 'utf-8');
  fs.writeFileSync(reportMdPath, formatMarkdown(report), 'utf-8');

  console.log(`Audit report written to:\n  ${reportJsonPath}\n  ${reportMdPath}`);
  console.log(`\nSummary:`);
  if (report.summary.singleWordAudit) {
    console.log(`  Single-word audit: ${report.summary.singleWordAudit.games} games`);
  }
  if (report.summary.hydraAudit) {
    console.log(`  Hydra audit: ${report.summary.hydraAudit.games} games, ${(100 - report.summary.hydraAudit.missRate * 100).toFixed(0)}% hit rate`);
  }
  if (report.summary.trainingData) {
    console.log(`  Training data: ${report.summary.trainingData.labeledRows} labeled / ${report.summary.trainingData.totalRows} total`);
  }
  console.log(`\nRecommendations:`);
  for (const rec of report.recommendations) {
    console.log(`  - ${rec}`);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
