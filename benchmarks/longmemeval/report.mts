#!/usr/bin/env node

/**
 * Generates a markdown report from evaluated LongMemEval benchmark results.
 *
 * Usage:
 *   LONGMEM_RUN_ID=<id> pnpm bench:longmemeval:report
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { getCategory, type EvaluatedRun } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const resultsDir = join(__dirname, 'results');

function resolveRunId(): string {
  const explicit = process.env['LONGMEM_RUN_ID'];
  if (explicit) return explicit;

  const files = readdirSync(resultsDir)
    .filter((f) => f.endsWith('.evaluated.jsonl'))
    .sort()
    .reverse();
  if (files.length === 0) {
    console.error('No evaluated result files found. Run evaluation first.');
    process.exit(1);
  }
  return files[0]!.replace('.evaluated.jsonl', '');
}

const RUN_ID = resolveRunId();
const inputPath = join(resultsDir, `${RUN_ID}.evaluated.jsonl`);
const outputPath = join(resultsDir, `${RUN_ID}-report.md`);

if (!existsSync(inputPath)) {
  console.error(`Evaluated results not found: ${inputPath}`);
  process.exit(1);
}

// ── Load data ────────────────────────────────────────────────────────

const lines = readFileSync(inputPath, 'utf-8').trim().split('\n').filter(Boolean);
const rows: EvaluatedRun[] = lines.map((line) => JSON.parse(line) as EvaluatedRun);
console.log(`Loaded ${String(rows.length)} evaluated runs`);

// ── Collect unique strategies and budgets ─────────────────────────────

const strategies = [...new Set(rows.map((r) => r.strategy))];
const budgets = [...new Set(rows.map((r) => r.budgetTokens))].sort((a, b) => a - b);

// ── Helper: compute accuracy for a subset ────────────────────────────

function accuracy(subset: EvaluatedRun[]): string {
  if (subset.length === 0) return '-';
  const correct = subset.filter((r) => r.correct).length;
  return ((correct / subset.length) * 100).toFixed(1);
}

function avgNum(values: number[]): string {
  if (values.length === 0) return '-';
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return mean.toFixed(0);
}

// ── Build tables ─────────────────────────────────────────────────────

function mdTable(
  title: string,
  rowLabels: string[],
  colLabels: string[],
  cellFn: (row: string, col: string) => string,
): string {
  const header = `| Strategy | ${colLabels.join(' | ')} |`;
  const separator = `|${colLabels.map(() => '------').join('|')}|---------|`;
  const body = rowLabels.map((row) => {
    const cells = colLabels.map((col) => cellFn(row, col));
    return `| ${row} | ${cells.join(' | ')} |`;
  });
  return [`## ${title}`, '', header, separator, ...body].join('\n');
}

// ── Overall accuracy table ───────────────────────────────────────────

const budgetLabels = budgets.map((b) => `${String(Math.round(b / 1024))}K`);

const overallTable = mdTable(
  'Overall accuracy (%)',
  strategies,
  budgetLabels,
  (strategy, budgetLabel) => {
    const budgetIdx = budgetLabels.indexOf(budgetLabel);
    const budget = budgets[budgetIdx]!;
    const subset = rows.filter((r) => r.strategy === strategy && r.budgetTokens === budget);
    return accuracy(subset);
  },
);

// ── Per-category tables ──────────────────────────────────────────────

const categories = [...new Set(rows.map((r) => getCategory(r.questionType, r.questionId)))].sort();

const categoryTables = categories.map((cat) => {
  const catRows = rows.filter((r) => getCategory(r.questionType, r.questionId) === cat);
  return mdTable(
    `${cat} accuracy (%)`,
    strategies,
    budgetLabels,
    (strategy, budgetLabel) => {
      const budgetIdx = budgetLabels.indexOf(budgetLabel);
      const budget = budgets[budgetIdx]!;
      const subset = catRows.filter((r) => r.strategy === strategy && r.budgetTokens === budget);
      return accuracy(subset);
    },
  );
});

// ── Compression efficiency ───────────────────────────────────────────

const efficiencyRows = strategies.map((strategy) => {
  const stratRows = rows.filter((r) => r.strategy === strategy);
  const budgetCells = budgets.map((budget) => {
    const subset = stratRows.filter((r) => r.budgetTokens === budget);
    const avgTokens = avgNum(subset.map((r) => r.actualTokens));
    return `${avgTokens}/${String(budget)}`;
  });
  const avgBuild = avgNum(stratRows.map((r) => r.buildTimeMs));
  return `| ${strategy} | ${budgetCells.join(' | ')} | ${avgBuild}ms |`;
});

const efficiencyHeader = `| Strategy | ${budgetLabels.map((b) => `${b} (actual/budget)`).join(' | ')} | Avg build |`;
const efficiencySep = `|${budgetLabels.map(() => '------').join('|')}|---------|---------|`;

const efficiencyTable = [
  '## Compression efficiency',
  '',
  efficiencyHeader,
  efficiencySep,
  ...efficiencyRows,
].join('\n');

// ── Summary stats ────────────────────────────────────────────────────

const totalQuestions = new Set(rows.map((r) => r.questionId)).size;
const totalCorrect = rows.filter((r) => r.correct).length;
const errorRuns = rows.filter((r) => r.modelAnswer.startsWith('[ERROR]')).length;

const summary = [
  '## Summary',
  '',
  `- **Questions**: ${String(totalQuestions)}`,
  `- **Total runs**: ${String(rows.length)}`,
  `- **Overall accuracy**: ${((totalCorrect / rows.length) * 100).toFixed(1)}%`,
  `- **Error runs**: ${String(errorRuns)}`,
  `- **Strategies**: ${strategies.join(', ')}`,
  `- **Budgets**: ${budgets.map(String).join(', ')} tokens`,
  `- **Run ID**: ${RUN_ID}`,
].join('\n');

// ── Assemble report ──────────────────────────────────────────────────

const report = [
  '# LongMemEval Benchmark Report',
  '',
  summary,
  '',
  overallTable,
  '',
  ...categoryTables.map((t) => t + '\n'),
  efficiencyTable,
  '',
].join('\n');

writeFileSync(outputPath, report);
console.log(`Report written to ${outputPath}`);
