#!/usr/bin/env node
/**
 * Compare Vitest bench `--outputJson` output to `benchmarks/baseline.json`.
 *
 * Env:
 * - `BENCH_BASELINE` — baseline path (default: benchmarks/baseline.json)
 * - `BENCH_CURRENT` — current run JSON (default: benchmarks/current.json)
 * - `BENCH_ALERT_THRESHOLD` — fail/flag if current.mean > baseline.mean * threshold (default: 1.2 = 120%)
 * - `BENCH_FAIL_ON_ALERT` — exit 1 when any benchmark regresses beyond threshold (default: false)
 * - `BENCH_REPORT_MD` — markdown output path (default: benchmark-report.md)
 *
 * @packageDocumentation
 */

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const THRESHOLD = Number(process.env.BENCH_ALERT_THRESHOLD ?? '1.2');
const FAIL_ON_ALERT = process.env.BENCH_FAIL_ON_ALERT === 'true';
const BASELINE_PATH = process.env.BENCH_BASELINE ?? 'benchmarks/baseline.json';
const CURRENT_PATH = process.env.BENCH_CURRENT ?? 'benchmarks/current.json';
const REPORT_PATH = process.env.BENCH_REPORT_MD ?? 'benchmark-report.md';

const root = process.cwd();

function readJson(p) {
  const abs = path.isAbsolute(p) ? p : path.join(root, p);
  return JSON.parse(fs.readFileSync(abs, 'utf8'));
}

/** @param {unknown} data */
function flattenBenchMap(data) {
  const map = new Map();
  const files = data?.files ?? [];
  for (const file of files) {
    for (const group of file.groups ?? []) {
      const gName = group.fullName ?? '';
      for (const b of group.benchmarks ?? []) {
        const key = `${gName}::${b.name}`;
        map.set(key, {
          key,
          group: gName,
          name: b.name,
          mean: b.mean,
          hz: b.hz,
          median: b.median,
          sampleCount: b.sampleCount,
        });
      }
    }
  }
  return map;
}

function pct(x) {
  if (!Number.isFinite(x)) {
    return '—';
  }
  const sign = x > 0 ? '+' : '';
  return `${sign}${(x * 100).toFixed(2)}%`;
}

function main() {
  let baselineRaw;
  let currentRaw;
  try {
    baselineRaw = readJson(BASELINE_PATH);
  } catch (e) {
    console.error(`bench-ci-report: cannot read baseline ${BASELINE_PATH}`, e);
    process.exit(2);
  }
  try {
    currentRaw = readJson(CURRENT_PATH);
  } catch (e) {
    console.error(`bench-ci-report: cannot read current ${CURRENT_PATH}`, e);
    process.exit(2);
  }

  const baseline = flattenBenchMap(baselineRaw);
  const current = flattenBenchMap(currentRaw);

  const rows = [];
  const alerts = [];
  const news = [];

  for (const [key, cur] of current) {
    const base = baseline.get(key);
    if (!base) {
      news.push({ key, cur });
      rows.push({
        key,
        status: 'new',
        baseMean: null,
        curMean: cur.mean,
        ratio: null,
      });
      continue;
    }
    const ratio = base.mean > 0 ? cur.mean / base.mean : null;
    const delta = ratio !== null ? ratio - 1 : null;
    let status = 'ok';
    if (ratio !== null && ratio > THRESHOLD) {
      status = 'alert';
      alerts.push({ key, ratio, baseMean: base.mean, curMean: cur.mean });
    } else if (ratio !== null && ratio < 1 / THRESHOLD) {
      status = 'faster';
    }
    rows.push({
      key,
      status,
      baseMean: base.mean,
      curMean: cur.mean,
      ratio,
      delta,
    });
  }

  for (const key of baseline.keys()) {
    if (!current.has(key)) {
      rows.push({ key, status: 'removed', baseMean: baseline.get(key).mean, curMean: null, ratio: null });
    }
  }

  rows.sort((a, b) => a.key.localeCompare(b.key));

  let md = `## Benchmark vs baseline\n\n`;
  md += `Threshold: **${THRESHOLD}×** baseline mean (alert if current mean exceeds this).\n\n`;
  md += `| Benchmark | Baseline mean (ms) | Current mean (ms) | Ratio | Δ | Status |\n`;
  md += `|-----------|-------------------:|------------------:|------:|---|--------|\n`;

  for (const r of rows) {
    const short = r.key.includes('::') ? r.key.split('::').slice(-2).join('::') : r.key;
    const b =
      r.baseMean !== null && r.baseMean !== undefined ? r.baseMean.toFixed(4) : '—';
    const c = r.curMean !== null && r.curMean !== undefined ? r.curMean.toFixed(4) : '—';
    const rat = r.ratio !== null && r.ratio !== undefined ? `${r.ratio.toFixed(3)}×` : '—';
    const d = r.delta !== null && r.delta !== undefined ? pct(r.delta) : '—';
    const icon =
      r.status === 'alert'
        ? '⚠️ regress'
        : r.status === 'faster'
          ? '✅ faster'
          : r.status === 'new'
            ? '🆕 new'
            : r.status === 'removed'
              ? '⏏️ removed'
              : '✓';
    md += `| ${short.replace(/\|/g, '\\|')} | ${b} | ${c} | ${rat} | ${d} | ${icon} |\n`;
  }

  md += `\n_Artifacts: \`benchmark-current.json\`, this report._\n`;

  fs.writeFileSync(path.join(root, REPORT_PATH), md, 'utf8');
  console.log(`Wrote ${REPORT_PATH}`);

  if (alerts.length > 0) {
    console.error('\nbench-ci-report: regressions beyond threshold:');
    for (const a of alerts) {
      console.error(`  ${a.key} ratio=${a.ratio?.toFixed(3)} (baseline mean ${a.baseMean}, current ${a.curMean})`);
    }
    if (FAIL_ON_ALERT) {
      process.exit(1);
    }
  }

  process.exit(0);
}

main();
