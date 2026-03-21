#!/usr/bin/env node

/**
 * Analyzes a question trace against the original dataset to produce a detailed
 * report on how slotmux handled the conversation — specifically, whether
 * answer-bearing content survived overflow and what could be improved.
 *
 * Usage:
 *   pnpm bench:longmemeval:analyze <trace.jsonl>
 *
 * Examples:
 *   pnpm bench:longmemeval:analyze results/trace-1e043500-summarize-16384.jsonl
 *   pnpm bench:longmemeval:analyze results/trace-e47becba-truncate-8192.jsonl
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DatasetEntry } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Args ─────────────────────────────────────────────────────────────

const traceFile = process.argv[2];
if (!traceFile) {
  console.error('Usage: pnpm bench:longmemeval:analyze <trace.jsonl>');
  process.exit(1);
}

const tracePath = traceFile.startsWith('/') ? traceFile : join(process.cwd(), traceFile);
if (!existsSync(tracePath)) {
  console.error(`Trace file not found: ${tracePath}`);
  process.exit(1);
}

// ── Load trace ───────────────────────────────────────────────────────

type TraceHeader = {
  _type: 'header';
  questionId: string;
  questionType: string;
  question: string;
  expectedAnswer: string;
  strategy: string;
  budgetTokens: number;
  totalSessions: number;
  totalTurns: number;
};

type TraceMessage = {
  role: string;
  content: string;
  name?: string;
};

type TraceSlotMeta = {
  budgetTokens: number;
  usedTokens: number;
  itemCount: number;
  evictedCount: number;
  overflowTriggered: boolean;
  utilization: number;
};

type TraceStep = {
  _type: 'step';
  step: number;
  label: string;
  sessionIndex: number | null;
  turnsAdded: number;
  totalTurnsIngested: number;
  buildTimeMs: number;
  totalTokens: number;
  totalBudget: number;
  utilization: number;
  slots: Record<string, TraceSlotMeta>;
  overflowOccurred: boolean;
  compressionCount: number;
  evictionCount: number;
  warnings: string[];
  messages: TraceMessage[];
};

const lines = readFileSync(tracePath, 'utf-8').trim().split('\n');
const header: TraceHeader = JSON.parse(lines[0]!);
const steps: TraceStep[] = lines.slice(1).map((l) => JSON.parse(l));

// ── Load dataset & find entry ────────────────────────────────────────

const dataPath = join(__dirname, 'data', 'longmemeval_s_cleaned.json');
if (!existsSync(dataPath)) {
  console.error(`Dataset not found at ${dataPath}`);
  console.error('Run: pnpm bench:longmemeval:download');
  process.exit(1);
}

const dataset: DatasetEntry[] = JSON.parse(readFileSync(dataPath, 'utf-8'));
const entry = dataset.find((e) => e.question_id === header.questionId);
if (!entry) {
  console.error(`Question "${header.questionId}" not found in dataset`);
  process.exit(1);
}

// ── Identify answer-bearing content ──────────────────────────────────

type AnswerLocation = {
  sessionIndex: number;
  sessionId: string;
  turnIndex: number;
  role: string;
  contentPreview: string;
  fullContent: string;
};

const answerLocations: AnswerLocation[] = [];
const answerSessionIndices = new Set<number>();

for (let si = 0; si < entry.haystack_sessions.length; si++) {
  const session = entry.haystack_sessions[si]!;
  for (let ti = 0; ti < session.length; ti++) {
    const turn = session[ti]!;
    if (turn.has_answer) {
      answerSessionIndices.add(si);
      answerLocations.push({
        sessionIndex: si,
        sessionId: entry.haystack_session_ids[si] ?? `session-${String(si)}`,
        turnIndex: ti,
        role: turn.role,
        contentPreview: turn.content.slice(0, 200),
        fullContent: turn.content,
      });
    }
  }
}

// Also check by answer_session_ids mapping
for (const ansId of entry.answer_session_ids) {
  const idx = entry.haystack_session_ids.indexOf(ansId);
  if (idx >= 0) answerSessionIndices.add(idx);
}

// ── Analyze answer retention across steps ────────────────────────────

function contentContainsAnswer(messages: TraceMessage[], expectedAnswer: string): boolean {
  const answerLower = expectedAnswer.toLowerCase();
  for (const m of messages) {
    if (typeof m.content === 'string' && m.content.toLowerCase().includes(answerLower)) {
      return true;
    }
  }
  return false;
}

function findAnswerTurnInContext(messages: TraceMessage[], answerLocs: AnswerLocation[]): {
  exactMatch: boolean;
  substringMatch: boolean;
  answerTextPresent: boolean;
} {
  let exactMatch = false;
  let substringMatch = false;

  for (const loc of answerLocs) {
    for (const m of messages) {
      if (typeof m.content !== 'string') continue;
      if (m.content === loc.fullContent) {
        exactMatch = true;
        substringMatch = true;
        break;
      }
      if (m.content.includes(loc.fullContent.slice(0, 100))) {
        substringMatch = true;
      }
    }
    if (exactMatch) break;
  }

  const answerTextPresent = contentContainsAnswer(messages, header.expectedAnswer);

  return { exactMatch, substringMatch, answerTextPresent };
}

type StepAnalysis = {
  step: number;
  label: string;
  totalTokens: number;
  utilization: number;
  historyItems: number;
  historyEvicted: number;
  overflowOccurred: boolean;
  answerTurnExactMatch: boolean;
  answerTurnSubstringMatch: boolean;
  answerTextPresent: boolean;
  messageCount: number;
  buildTimeMs: number;
};

const stepAnalyses: StepAnalysis[] = [];

for (const step of steps) {
  const retention = findAnswerTurnInContext(step.messages, answerLocations);
  const hist = step.slots['history'];

  stepAnalyses.push({
    step: step.step,
    label: step.label,
    totalTokens: step.totalTokens,
    utilization: step.utilization,
    historyItems: hist?.itemCount ?? 0,
    historyEvicted: hist?.evictedCount ?? 0,
    overflowOccurred: step.overflowOccurred,
    answerTurnExactMatch: retention.exactMatch,
    answerTurnSubstringMatch: retention.substringMatch,
    answerTextPresent: retention.answerTextPresent,
    messageCount: step.messages.length,
    buildTimeMs: step.buildTimeMs,
  });
}

// ── Compute derived metrics ──────────────────────────────────────────

const firstOverflowStep = stepAnalyses.find((s) => s.overflowOccurred);
const answerIngestedStep = steps.find(
  (s) => s.sessionIndex !== null && answerSessionIndices.has(s.sessionIndex),
);

const answerLostStep = (() => {
  let wasPresent = false;
  for (const sa of stepAnalyses) {
    if (sa.answerTextPresent) wasPresent = true;
    if (wasPresent && !sa.answerTextPresent) return sa;
  }
  return null;
})();

const exactMatchLostStep = (() => {
  let wasPresent = false;
  for (const sa of stepAnalyses) {
    if (sa.answerTurnExactMatch) wasPresent = true;
    if (wasPresent && !sa.answerTurnExactMatch) return sa;
  }
  return null;
})();

const finalStep = stepAnalyses[stepAnalyses.length - 1]!;

const utilizationStats = {
  min: Math.min(...stepAnalyses.map((s) => s.utilization)),
  max: Math.max(...stepAnalyses.map((s) => s.utilization)),
  avg: stepAnalyses.reduce((sum, s) => sum + s.utilization, 0) / stepAnalyses.length,
  finalUtilization: finalStep.utilization,
};

const overflowSteps = stepAnalyses.filter((s) => s.overflowOccurred);

const buildTimeStats = {
  min: Math.min(...stepAnalyses.map((s) => s.buildTimeMs)),
  max: Math.max(...stepAnalyses.map((s) => s.buildTimeMs)),
  avg: Math.round(stepAnalyses.reduce((sum, s) => sum + s.buildTimeMs, 0) / stepAnalyses.length),
  total: stepAnalyses.reduce((sum, s) => sum + s.buildTimeMs, 0),
};

// Token growth: how quickly tokens accumulate before overflow
const preOverflowSteps = firstOverflowStep
  ? stepAnalyses.filter((s) => s.step < firstOverflowStep.step)
  : stepAnalyses;
const tokenGrowthRate = preOverflowSteps.length >= 2
  ? (preOverflowSteps[preOverflowSteps.length - 1]!.totalTokens - preOverflowSteps[0]!.totalTokens) /
    (preOverflowSteps.length - 1)
  : 0;

// Post-overflow utilization stability
const postOverflowUtils = overflowSteps.map((s) => s.utilization);
const postOverflowVariance = postOverflowUtils.length >= 2
  ? (() => {
      const mean = postOverflowUtils.reduce((a, b) => a + b, 0) / postOverflowUtils.length;
      return postOverflowUtils.reduce((sum, u) => sum + (u - mean) ** 2, 0) / postOverflowUtils.length;
    })()
  : 0;

// Compression aggressiveness: biggest single-step token drop
let maxTokenDrop = 0;
let maxTokenDropStep: StepAnalysis | null = null;
for (let i = 1; i < stepAnalyses.length; i++) {
  const drop = stepAnalyses[i - 1]!.totalTokens - stepAnalyses[i]!.totalTokens;
  if (drop > maxTokenDrop) {
    maxTokenDrop = drop;
    maxTokenDropStep = stepAnalyses[i]!;
  }
}

// ── Generate report ──────────────────────────────────────────────────

const md: string[] = [];

function heading(level: number, text: string): void {
  md.push(`${'#'.repeat(level)} ${text}\n`);
}

function paragraph(text: string): void {
  md.push(`${text}\n`);
}

function table(headers: string[], rows: string[][]): void {
  md.push(`| ${headers.join(' | ')} |`);
  md.push(`| ${headers.map(() => '---').join(' | ')} |`);
  for (const row of rows) {
    md.push(`| ${row.join(' | ')} |`);
  }
  md.push('');
}

heading(1, `Trace Analysis: ${header.questionId}`);

paragraph(`**Strategy:** ${header.strategy} · **Budget:** ${String(header.budgetTokens)} tokens · **Type:** ${header.questionType}`);

heading(2, 'Question & Answer');

paragraph(`> **Q:** ${header.question}`);
paragraph(`> **Expected A:** ${header.expectedAnswer}`);

heading(2, 'Answer Source');

if (answerLocations.length === 0) {
  paragraph('⚠️ No turns marked with `has_answer` in the dataset. Analysis of answer retention may be limited to text matching.');
} else {
  table(
    ['Session', 'Session ID', 'Turn', 'Role', 'Content preview'],
    answerLocations.map((loc) => [
      String(loc.sessionIndex + 1) + '/' + String(header.totalSessions),
      loc.sessionId,
      String(loc.turnIndex),
      loc.role,
      loc.contentPreview.slice(0, 100).replace(/\|/g, '\\|').replace(/\n/g, ' '),
    ]),
  );

  const answerPosition = answerLocations[0]!;
  const positionRatio = (answerPosition.sessionIndex + 1) / header.totalSessions;
  const positionLabel =
    positionRatio < 0.25 ? 'early' : positionRatio < 0.5 ? 'first half' : positionRatio < 0.75 ? 'second half' : 'late';
  paragraph(`Answer appears **${positionLabel}** in the conversation (session ${String(answerPosition.sessionIndex + 1)} of ${String(header.totalSessions)}, ${(positionRatio * 100).toFixed(0)}% through).`);
}

heading(2, 'Timeline');

heading(3, 'Key Events');

const events: string[] = [];
if (answerIngestedStep) {
  events.push(`- **Session with answer ingested** at step ${String(answerIngestedStep.step)} (${answerIngestedStep.label})`);
}
if (firstOverflowStep) {
  events.push(`- **First overflow** at step ${String(firstOverflowStep.step)} (${firstOverflowStep.label}) — ${String(firstOverflowStep.totalTokens)} tokens`);
}
if (exactMatchLostStep) {
  events.push(`- **Answer turn evicted** (exact match lost) at step ${String(exactMatchLostStep.step)} (${exactMatchLostStep.label})`);
}
if (answerLostStep) {
  events.push(`- **Answer text lost** from context at step ${String(answerLostStep.step)} (${answerLostStep.label})`);
}
if (!answerLostStep && finalStep.answerTextPresent) {
  events.push(`- ✅ **Answer text survived** through final context`);
}
if (answerLostStep) {
  events.push(`- ❌ **Answer was lost** — the LLM cannot answer correctly from this context`);
}
if (events.length === 0) {
  events.push('- No significant events detected.');
}
md.push(events.join('\n'));
md.push('');

heading(3, 'Step-by-Step Progression');

const progressionRows: string[][] = [];
for (const sa of stepAnalyses) {
  const answerStatus = sa.answerTextPresent ? '✅' : (sa.answerTurnSubstringMatch ? '⚠️' : '❌');
  const overflowMark = sa.overflowOccurred ? '🔄' : '';
  progressionRows.push([
    String(sa.step),
    sa.label,
    String(sa.totalTokens),
    (sa.utilization * 100).toFixed(1) + '%',
    String(sa.historyItems),
    String(sa.historyEvicted),
    overflowMark,
    answerStatus,
    String(sa.buildTimeMs) + 'ms',
  ]);
}
table(
  ['Step', 'Label', 'Tokens', 'Util', 'Items', 'Evicted', 'Overflow', 'Answer', 'Build'],
  progressionRows,
);

heading(2, 'Answer Retention Analysis');

if (answerLocations.length > 0) {
  const answerSessionIdx = answerLocations[0]!.sessionIndex;

  if (firstOverflowStep && answerIngestedStep) {
    const overflowBeforeAnswer = firstOverflowStep.step < answerIngestedStep.step;

    if (overflowBeforeAnswer) {
      paragraph(`Overflow started at step ${String(firstOverflowStep.step)}, **before** the answer was ingested at step ${String(answerIngestedStep.step)}. The strategy was already discarding content by the time the answer arrived.`);
    } else {
      paragraph(`Answer was ingested at step ${String(answerIngestedStep.step)}, **before** overflow started at step ${String(firstOverflowStep.step)}. The strategy had to decide whether to keep the answer or newer content.`);
    }
  }

  if (answerLostStep) {
    const stepsAfterIngest = answerLostStep.step - (answerIngestedStep?.step ?? 0);
    paragraph(`The answer text survived for **${String(stepsAfterIngest)} steps** after being ingested before it was lost at step ${String(answerLostStep.step)} (${answerLostStep.label}).`);

    if (header.strategy === 'truncate' || header.strategy === 'truncate-latest') {
      paragraph(`With the **${header.strategy}** strategy, older content is dropped first. Since the answer appeared at session ${String(answerSessionIdx + 1)}, it was eventually evicted as newer sessions pushed it out of the window.`);
    }
    if (header.strategy === 'summarize') {
      paragraph(`With the **summarize** strategy, the answer text was lost during compression. This suggests the summarizer did not recognize the answer content as important enough to preserve verbatim.`);
    }
  } else if (finalStep.answerTextPresent) {
    paragraph('The expected answer text is present in the final context. The strategy successfully preserved the answer-bearing content.');

    if (!finalStep.answerTurnExactMatch && finalStep.answerTurnSubstringMatch) {
      paragraph('However, the original answer turn was modified (likely summarized). The answer text survived within a compressed representation.');
    }
  }

  // Answer position vs. strategy effectiveness
  const positionRatio = (answerSessionIdx + 1) / header.totalSessions;
  if (positionRatio < 0.3 && answerLostStep && (header.strategy === 'truncate' || header.strategy === 'sliding-window')) {
    paragraph(`**⚠️ Strategy weakness:** The answer appears early in the conversation (${(positionRatio * 100).toFixed(0)}%). Truncation-based strategies inherently discard oldest content first, making early answers highly vulnerable. Consider \`summarize\` or \`fallback-chain\` for this question type.`);
  }
  if (positionRatio > 0.7 && answerLostStep && header.strategy === 'truncate-latest') {
    paragraph(`**⚠️ Strategy weakness:** The answer appears late in the conversation (${(positionRatio * 100).toFixed(0)}%). The \`truncate-latest\` strategy discards newest content first, making late answers vulnerable.`);
  }
}

heading(2, 'Compression Efficiency');

table(
  ['Metric', 'Value'],
  [
    ['Budget', String(header.budgetTokens) + ' tokens'],
    ['Final tokens used', String(finalStep.totalTokens)],
    ['Final utilization', (finalStep.utilization * 100).toFixed(1) + '%'],
    ['Wasted budget', String(header.budgetTokens - finalStep.totalTokens) + ' tokens (' + ((1 - finalStep.utilization) * 100).toFixed(1) + '%)'],
    ['Avg utilization (post-overflow)', overflowSteps.length > 0 ? (postOverflowUtils.reduce((a, b) => a + b, 0) / postOverflowUtils.length * 100).toFixed(1) + '%' : 'N/A'],
    ['Utilization variance (post-overflow)', postOverflowVariance > 0 ? postOverflowVariance.toFixed(6) : 'N/A'],
    ['Total content ingested', String(header.totalTurns) + ' turns across ' + String(header.totalSessions) + ' sessions'],
    ['Content retained (final)', String(finalStep.historyItems) + ' items (' + (finalStep.historyItems / header.totalTurns * 100).toFixed(1) + '% of original)'],
    ['Total evictions', String(finalStep.historyEvicted)],
  ],
);

if (finalStep.utilization < 0.7) {
  paragraph(`**⚠️ Low utilization** (${(finalStep.utilization * 100).toFixed(1)}%) — the strategy is not filling the available budget. This suggests overly aggressive compression or an item-granularity issue where the next item doesn't fit but there's still significant room.`);
}

if (postOverflowVariance > 0.02) {
  paragraph(`**⚠️ Unstable utilization** — post-overflow utilization swings widely (variance: ${postOverflowVariance.toFixed(4)}). This can mean the strategy alternates between compressing too little and too much.`);
}

heading(2, 'Performance');

table(
  ['Metric', 'Value'],
  [
    ['Total build time', String(buildTimeStats.total) + 'ms'],
    ['Avg build time/step', String(buildTimeStats.avg) + 'ms'],
    ['Min build time', String(buildTimeStats.min) + 'ms'],
    ['Max build time', String(buildTimeStats.max) + 'ms'],
    ['Steps with overflow', String(overflowSteps.length) + ' / ' + String(stepAnalyses.length)],
  ],
);

if (maxTokenDropStep) {
  paragraph(`Largest single-step token reduction: **${String(maxTokenDrop)} tokens** at step ${String(maxTokenDropStep.step)} (${maxTokenDropStep.label}). This is where the strategy compressed/evicted the most content in one pass.`);
}

heading(2, 'Final Context Snapshot');

const finalMessages = steps[steps.length - 1]!.messages;
paragraph(`The final context contains **${String(finalMessages.length)} messages**. Here's a summary of what the LLM sees:`);

const msgSummary: string[][] = [];
for (let i = 0; i < finalMessages.length; i++) {
  const m = finalMessages[i]!;
  const content = typeof m.content === 'string' ? m.content : JSON.stringify(m.content);
  const charCount = content.length;
  const preview = content.slice(0, 120).replace(/\|/g, '\\|').replace(/\n/g, ' ');
  const containsAnswer = content.toLowerCase().includes(header.expectedAnswer.toLowerCase()) ? '✅' : '';
  msgSummary.push([
    String(i + 1),
    m.role,
    String(charCount),
    preview + (charCount > 120 ? '…' : ''),
    containsAnswer,
  ]);
}
table(['#', 'Role', 'Chars', 'Content preview', 'Has answer'], msgSummary);

heading(2, 'Improvement Recommendations');

const recs: string[] = [];

if (answerLostStep) {
  // Answer was lost
  if (header.strategy === 'truncate') {
    recs.push('- **Try `summarize` or `fallback-chain`** — truncation discards entire messages. Summarization can preserve key facts across evicted content.');
    recs.push('- **Try `sliding-window`** — keeps both oldest and newest content, which may help if the answer is early in the conversation.');
  }
  if (header.strategy === 'sliding-window') {
    recs.push('- **Increase budget** — the sliding window may not be wide enough to reach the answer-bearing session.');
    recs.push('- **Try `summarize`** — it can compress older sessions into summaries rather than dropping messages entirely.');
  }
  if (header.strategy === 'summarize') {
    recs.push('- **The summarizer lost key information.** Consider fine-tuning the compression prompt to prioritize preserving specific facts, names, numbers, and preferences.');
    recs.push('- **Try a more capable compression model** — `gpt-4o` may preserve details better than `gpt-4o-mini` at the cost of latency and price.');
    recs.push('- **Consider `fallback-chain`** — it tries truncation first and falls back to summarization only when needed, potentially preserving more verbatim content.');
  }
  if (header.strategy === 'fallback-chain') {
    recs.push('- **Increase budget** — more room means the fallback chain can retain more content before needing to compress.');
    recs.push('- **Review summarization quality** — the fallback chain uses summarization as a last resort; if the summarizer discards the answer, the chain can\'t recover it.');
  }
  recs.push(`- **Increase budget** — current budget (${String(header.budgetTokens)}) may be too small for this conversation (${String(header.totalTurns)} turns, ${String(header.totalSessions)} sessions). Try ${String(header.budgetTokens * 2)} or ${String(header.budgetTokens * 4)} tokens.`);
}

if (!answerLostStep && finalStep.answerTextPresent) {
  recs.push('- ✅ Answer is preserved — current configuration works for this question.');
  if (finalStep.utilization < 0.7) {
    recs.push(`- **Budget could be reduced** — only ${(finalStep.utilization * 100).toFixed(0)}% utilized. Try ${String(Math.ceil(finalStep.totalTokens * 1.3))} tokens.`);
  }
}

if (finalStep.utilization < 0.7) {
  recs.push(`- **Investigate low utilization** (${(finalStep.utilization * 100).toFixed(1)}%) — the overflow strategy is discarding more than necessary. This may indicate the strategy removes items at too coarse a granularity.`);
}

if (buildTimeStats.max > 5000) {
  recs.push(`- **Slow builds detected** (max: ${String(buildTimeStats.max)}ms) — consider caching token counts or using a faster tokenizer.`);
}

if (maxTokenDrop > header.budgetTokens * 0.5 && maxTokenDropStep) {
  recs.push(`- **Aggressive single-step compression** — ${String(maxTokenDrop)} tokens dropped at step ${String(maxTokenDropStep.step)}. Consider incremental compression (compressing smaller batches more frequently) to preserve more information.`);
}

if (postOverflowVariance > 0.02) {
  recs.push('- **Stabilize post-overflow utilization** — large swings suggest the strategy over-corrects. More granular eviction or progressive summarization could help.');
}

// Strategy-specific observations
const overflowStepCount = overflowSteps.length;
const totalStepCount = stepAnalyses.length;
if (overflowStepCount > totalStepCount * 0.8) {
  recs.push(`- **Overflow is nearly constant** (${String(overflowStepCount)}/${String(totalStepCount)} steps) — the budget is significantly smaller than the input. For such aggressive compression ratios, \`summarize\` or hierarchical strategies tend to outperform truncation.`);
}

if (recs.length === 0) {
  recs.push('- No specific recommendations. The current configuration handles this question well.');
}

for (const rec of recs) {
  md.push(rec);
}
md.push('');

heading(2, 'Raw Numbers');

paragraph('Token progression (for plotting):');
paragraph('```');
md.push('step,tokens,utilization,items,evicted,overflow,answer_present');
for (const sa of stepAnalyses) {
  md.push(
    `${String(sa.step)},${String(sa.totalTokens)},${sa.utilization.toFixed(4)},${String(sa.historyItems)},${String(sa.historyEvicted)},${sa.overflowOccurred ? '1' : '0'},${sa.answerTextPresent ? '1' : '0'}`,
  );
}
md.push('```');
md.push('');

// ── Write report ─────────────────────────────────────────────────────

const report = md.join('\n');
const outName = basename(tracePath, '.jsonl') + '-analysis.md';
const outPath = join(dirname(tracePath), outName);
writeFileSync(outPath, report);

console.log(report);
console.log(`\nReport written to ${outPath}`);
