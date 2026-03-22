/**
 * Build history explorer with per-slot content breakdown.
 *
 * @packageDocumentation
 */

import { useCallback, useState } from 'preact/hooks';

import type { BuildRecordWire, SlotItemWire, SlotMetaWire } from '../types.js';

type Props = {
  readonly builds: readonly BuildRecordWire[];
};

function formatTime(ms: number): string {
  try {
    return new Date(ms).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return String(ms);
  }
}

function truncate(text: string, max: number): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + '…';
}

function contentPreview(item: SlotItemWire): string {
  if (typeof item.content === 'string') {
    return item.content;
  }
  return JSON.stringify(item.content);
}

function SlotItems({ items, label }: { items: readonly SlotItemWire[]; label: string }) {
  const [expanded, setExpanded] = useState<string | null>(null);

  if (items.length === 0) {
    return (
      <div class="cx-slot-items">
        <p class="cx-slot-items__label muted">{label}: empty</p>
      </div>
    );
  }

  return (
    <div class="cx-slot-items">
      <p class="cx-slot-items__label muted">{label} ({items.length} items)</p>
      {items.map((item) => {
        const isExpanded = expanded === item.id;
        const preview = contentPreview(item);
        return (
          <div
            key={item.id}
            class={`cx-item${isExpanded ? ' cx-item--expanded' : ''}`}
          >
            <div
              class="cx-item__header"
              onClick={() => setExpanded(isExpanded ? null : item.id)}
            >
              <span class={`cx-item__role cx-item__role--${item.role}`}>
                {item.role}
              </span>
              <span class="cx-item__preview">
                {truncate(preview, 120)}
              </span>
              <span class="cx-item__meta">
                {item.tokens !== null ? `${item.tokens} tok` : ''}
                {item.pinned ? ' 📌' : ''}
                {item.summarizes ? ' 🗜' : ''}
              </span>
            </div>
            {isExpanded ? (
              <pre class="cx-item__body">{preview}</pre>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function SlotSection({
  name,
  preItems,
  postItems,
  meta,
}: {
  name: string;
  preItems: readonly SlotItemWire[];
  postItems: readonly SlotItemWire[];
  meta: SlotMetaWire | undefined;
}) {
  const [open, setOpen] = useState(false);
  const hasCompression = preItems.length !== postItems.length
    || preItems.some((item, i) => {
      const post = postItems[i];
      return post === undefined || item.id !== post.id;
    });

  return (
    <div class="cx-slot">
      <div class="cx-slot__header" onClick={() => setOpen(!open)}>
        <span class="cx-slot__toggle">{open ? '▾' : '▸'}</span>
        <span class="cx-slot__name">{name}</span>
        {meta ? (
          <span class="cx-slot__stats">
            {meta.usedTokens}/{meta.budgetTokens} tok
            · {meta.itemCount} items
            {meta.evictedCount > 0 ? ` · ${meta.evictedCount} evicted` : ''}
            {meta.overflowTriggered ? ' · overflow' : ''}
          </span>
        ) : null}
        {hasCompression ? (
          <span class="cx-slot__badge cx-slot__badge--compressed">compressed</span>
        ) : null}
      </div>
      {open ? (
        <div class="cx-slot__body">
          {hasCompression ? (
            <div class="cx-slot__columns">
              <div class="cx-slot__col">
                <SlotItems items={preItems} label="Before overflow" />
              </div>
              <div class="cx-slot__col">
                <SlotItems items={postItems} label="After overflow" />
              </div>
            </div>
          ) : (
            <SlotItems items={postItems} label="Content" />
          )}
        </div>
      ) : null}
    </div>
  );
}

export function ContextExplorer({ builds }: Props) {
  const [selectedIdx, setSelectedIdx] = useState<number | null>(null);

  const selectBuild = useCallback((idx: number) => {
    setSelectedIdx((prev) => (prev === idx ? null : idx));
  }, []);

  const selected = selectedIdx !== null
    ? builds.find((b) => b.index === selectedIdx) ?? null
    : null;

  const snapshotMeta = selected?.snapshot !== null && typeof selected?.snapshot === 'object'
    ? (selected.snapshot as Record<string, unknown>)['meta'] as Record<string, unknown> | undefined
    : undefined;
  const slotsMeta = snapshotMeta?.['slots'] as Record<string, SlotMetaWire> | undefined;
  const messages = selected?.snapshot !== null && typeof selected?.snapshot === 'object'
    ? (selected.snapshot as Record<string, unknown>)['messages'] as readonly Record<string, unknown>[] | undefined
    : undefined;

  const allSlotNames = selected
    ? [...new Set([...Object.keys(selected.preSlots), ...Object.keys(selected.postSlots)])]
    : [];

  return (
    <div class="panel cx-panel">
      <h2>Context explorer</h2>

      <div class="cx-layout">
        {/* Build list */}
        <div class="cx-build-list">
          {builds.length === 0 ? (
            <p class="muted">No builds yet. Trigger a context build to see content here.</p>
          ) : (
            [...builds].reverse().map((b) => {
              const snap = b.snapshot as Record<string, unknown> | null;
              const meta = snap !== null ? snap['meta'] as Record<string, unknown> | undefined : undefined;
              const totalTokens = typeof meta?.['totalTokens'] === 'number' ? meta['totalTokens'] : '?';
              const totalBudget = typeof meta?.['totalBudget'] === 'number' ? meta['totalBudget'] : '?';
              const msgCount = Array.isArray(snap?.['messages']) ? snap['messages'].length : '?';
              const slotCount = Object.keys(b.postSlots).length;
              const isActive = selectedIdx === b.index;

              return (
                <div
                  key={b.index}
                  class={`cx-build-card${isActive ? ' cx-build-card--active' : ''}`}
                  onClick={() => selectBuild(b.index)}
                >
                  <div class="cx-build-card__top">
                    <span class="cx-build-card__idx">#{b.index + 1}</span>
                    <span class="cx-build-card__time">{formatTime(b.timestamp)}</span>
                  </div>
                  <div class="cx-build-card__stats">
                    {totalTokens}/{totalBudget} tok · {slotCount} slots · {msgCount} msgs
                    {b.compressions.length > 0 ? ` · ${b.compressions.length} compressions` : ''}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Detail view */}
        <div class="cx-detail">
          {selected === null ? (
            <p class="muted">Select a build to inspect its context content slot by slot.</p>
          ) : (
            <>
              {/* Slot breakdown */}
              <div class="cx-slots">
                {allSlotNames.map((name) => (
                  <SlotSection
                    key={name}
                    name={name}
                    preItems={(selected.preSlots[name] ?? []) as readonly SlotItemWire[]}
                    postItems={(selected.postSlots[name] ?? []) as readonly SlotItemWire[]}
                    meta={slotsMeta?.[name]}
                  />
                ))}
              </div>

              {/* Final messages sent to LLM */}
              {messages && messages.length > 0 ? (
                <div class="cx-messages">
                  <h3>Final messages sent to LLM ({messages.length})</h3>
                  <div class="cx-messages__list">
                    {messages.map((msg, i) => {
                      const role = typeof msg['role'] === 'string' ? msg['role'] : 'unknown';
                      const content = typeof msg['content'] === 'string'
                        ? msg['content']
                        : JSON.stringify(msg['content']);
                      return (
                        <MessageRow key={i} index={i} role={role} content={content} />
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function MessageRow({ index, role, content }: { index: number; role: string; content: string }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div class={`cx-msg cx-msg--${role}`}>
      <div class="cx-msg__header" onClick={() => setExpanded(!expanded)}>
        <span class="cx-msg__idx">{index + 1}</span>
        <span class={`cx-item__role cx-item__role--${role}`}>{role}</span>
        <span class="cx-msg__preview">
          {expanded ? '' : truncate(content, 200)}
        </span>
        <span class="cx-msg__len">{content.length} chars</span>
      </div>
      {expanded ? (
        <pre class="cx-msg__body">{content}</pre>
      ) : null}
    </div>
  );
}
