/**
 * Local HTTP + WebSocket inspector server (§13.2).
 *
 * @packageDocumentation
 */

import * as http from 'node:http';

import type { Context, ContextEvent } from 'slotmux';
import { WebSocket, WebSocketServer } from 'ws';

import { InspectorDisabledError } from './errors.js';
import { serializeContextEventForJson } from './serialize-event.js';
import { serveInspectorStatic } from './serve-inspector-static.js';

const DEFAULT_PORT = 4200;
const DEFAULT_MAX_EVENTS = 500;
const DEFAULT_MAX_BUILDS = 50;

export type AttachInspectorOptions = {
  /** TCP port (default 4200). Use `0` to pick a free port. */
  readonly port?: number;
  /**
   * When false (default), only starts when `process.env.NODE_ENV === 'development'`.
   * Set true in tests or to force enable (avoid in real production).
   */
  readonly allowInNonDevelopment?: boolean;
  /** Cap for in-memory event ring (default 500). */
  readonly maxEvents?: number;
  /** Cap for stored build records (default 50). */
  readonly maxBuilds?: number;
};

/** Per-slot content snapshot captured during a build. */
export type SlotItemsCapture = Readonly<Record<string, readonly unknown[]>>;

/** A captured build record with pre- and post-compression slot content. */
export type BuildRecord = {
  readonly index: number;
  readonly timestamp: number;
  readonly preSlots: SlotItemsCapture;
  readonly postSlots: SlotItemsCapture;
  readonly snapshot: unknown;
  readonly compressions: readonly unknown[];
  readonly evictions: readonly unknown[];
};

export type InspectorHandle = {
  readonly port: number;
  readonly url: string;
  /** Stop the server and unsubscribe from context events. */
  close(): Promise<void>;
};

function assertDevelopmentOrOverride(opts: AttachInspectorOptions): void {
  if (opts.allowInNonDevelopment === true) {
    return;
  }
  const env = process.env['NODE_ENV'];
  if (env !== 'development') {
    throw new InspectorDisabledError(
      `attachInspector only runs when NODE_ENV is "development" (current: ${JSON.stringify(
        env,
      )}). Pass { allowInNonDevelopment: true } to override.`,
    );
  }
}

function sendJson(
  res: http.ServerResponse,
  status: number,
  body: unknown,
): void {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(json);
}

function captureSlotItems(ctx: Context): SlotItemsCapture {
  const result: Record<string, readonly unknown[]> = {};
  for (const name of ctx.registeredSlots) {
    try {
      result[name] = ctx.getItems(name).map((item) => ({
        id: item.id,
        role: item.role,
        content: typeof item.content === 'string'
          ? item.content
          : item.content,
        tokens: item.tokens ?? null,
        pinned: item.pinned ?? false,
        metadata: item.metadata ?? null,
        summarizes: item.summarizes ?? null,
      }));
    } catch {
      result[name] = [];
    }
  }
  return result;
}

function slotsPayload(ctx: Context): unknown {
  const layout = ctx.getSlotsConfig();
  if (layout === undefined) {
    return {
      ok: false,
      error: 'Context has no parsed slot config (use Context.fromParsedConfig).',
    };
  }
  const slots: Record<string, unknown> = {};
  for (const name of ctx.registeredSlots) {
    slots[name] = {
      config: layout[name],
      items: ctx.getItems(name),
    };
  }
  return { ok: true, slots };
}

/**
 * Starts a local HTTP server (and WebSocket on the same port) that exposes snapshot, slots, and events.
 *
 * @remarks
 * Guarded for `NODE_ENV === 'development'` unless {@link AttachInspectorOptions.allowInNonDevelopment} is set.
 */
export function attachInspector(ctx: Context, options?: AttachInspectorOptions): Promise<InspectorHandle> {
  try {
    assertDevelopmentOrOverride(options ?? {});
  } catch (err) {
    return Promise.reject(err);
  }

  const listenPort = options?.port ?? DEFAULT_PORT;
  const maxEvents = options?.maxEvents ?? DEFAULT_MAX_EVENTS;
  const maxBuilds = options?.maxBuilds ?? DEFAULT_MAX_BUILDS;

  const serializedEvents: unknown[] = [];
  let lastSnapshotSerialized: unknown = null;

  const buildRecords: BuildRecord[] = [];
  let buildCounter = 0;
  let pendingPreSlots: SlotItemsCapture | null = null;

  const server = http.createServer((req, res) => {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      res.end();
      return;
    }

    if (req.method !== 'GET') {
      sendJson(res, 405, { ok: false, error: 'Method not allowed' });
      return;
    }

    const host = req.headers.host ?? `127.0.0.1:${listenPort}`;
    const url = new URL(req.url ?? '/', `http://${host}`);
    const path = url.pathname;

    if (serveInspectorStatic(path, res)) {
      return;
    }

    if (path === '/' || path === '/health') {
      sendJson(res, 200, {
        ok: true,
        package: '@slotmux/debug',
        endpoints: ['/snapshot', '/slots', '/events', '/builds', '/inspector/', 'WebSocket same port'],
      });
      return;
    }

    if (path === '/snapshot') {
      sendJson(res, 200, {
        ok: true,
        snapshot: lastSnapshotSerialized,
      });
      return;
    }

    if (path === '/slots') {
      sendJson(res, 200, slotsPayload(ctx));
      return;
    }

    if (path === '/events') {
      sendJson(res, 200, {
        ok: true,
        events: serializedEvents,
      });
      return;
    }

    if (path === '/builds') {
      sendJson(res, 200, {
        ok: true,
        builds: buildRecords.map((b) => ({
          index: b.index,
          timestamp: b.timestamp,
          preSlots: b.preSlots,
          postSlots: b.postSlots,
          snapshot: b.snapshot,
          compressions: b.compressions,
          evictions: b.evictions,
        })),
      });
      return;
    }

    sendJson(res, 404, { ok: false, error: 'Not found' });
  });

  const wss = new WebSocketServer({ server });

  const pushEvent = (ev: ContextEvent): void => {
    const serialized = serializeContextEventForJson(ev);
    serializedEvents.push(serialized);
    if (serializedEvents.length > maxEvents) {
      serializedEvents.splice(0, serializedEvents.length - maxEvents);
    }

    if (ev.type === 'build:start') {
      pendingPreSlots = captureSlotItems(ctx);
    }

    if (ev.type === 'build:complete') {
      lastSnapshotSerialized = (serialized as { snapshot: unknown }).snapshot;

      const postSlots = captureSlotItems(ctx);
      const snapshotData = (serialized as { snapshot: unknown }).snapshot;
      const meta = snapshotData !== null && typeof snapshotData === 'object'
        ? (snapshotData as Record<string, unknown>)['meta']
        : null;
      const compressions = meta !== null && typeof meta === 'object'
        ? ((meta as Record<string, unknown>)['compressions'] as readonly unknown[] | undefined) ?? []
        : [];
      const evictions = meta !== null && typeof meta === 'object'
        ? ((meta as Record<string, unknown>)['evictions'] as readonly unknown[] | undefined) ?? []
        : [];

      const record: BuildRecord = {
        index: buildCounter++,
        timestamp: Date.now(),
        preSlots: pendingPreSlots ?? postSlots,
        postSlots,
        snapshot: snapshotData,
        compressions,
        evictions,
      };
      buildRecords.push(record);
      if (buildRecords.length > maxBuilds) {
        buildRecords.splice(0, buildRecords.length - maxBuilds);
      }
      pendingPreSlots = null;
    }

    const wsPayload = JSON.stringify({
      type: 'slotmux:event',
      event: serialized,
    });
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(wsPayload);
      }
    }
  };

  const unsubscribe = ctx.subscribeInspectorEvents(pushEvent);

  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(listenPort, () => {
      server.off('error', reject);
      const addr = server.address();
      const actualPort =
        typeof addr === 'object' && addr !== null ? addr.port : listenPort;
      const url = `http://127.0.0.1:${actualPort}`;
      resolve({
        port: actualPort,
        url,
        close: () =>
          new Promise<void>((resClose, rejClose) => {
            unsubscribe();
            wss.close((err: Error | undefined) => {
              if (err) {
                rejClose(err);
                return;
              }
              server.close((e2: Error | undefined) => {
                if (e2) {
                  rejClose(e2);
                } else {
                  resClose();
                }
              });
            });
          }),
      });
    });
  });
}

export { DEFAULT_MAX_BUILDS, DEFAULT_MAX_EVENTS, DEFAULT_PORT };
