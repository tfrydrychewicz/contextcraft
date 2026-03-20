/**
 * {@link MemoryStore} backed by better-sqlite3 (Node.js).
 *
 * `better-sqlite3` is an **optional** dependency: if install/build fails (e.g. Windows + Node without
 * prebuilds), {@link InMemoryMemoryStore} still works. This module loads the native addon lazily.
 *
 * @packageDocumentation
 */

import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import type { MemoryRecord, MemorySetInput, MemoryStore } from './memory-types.js';

const require = createRequire(fileURLToPath(import.meta.url));

/** Minimal surface used by this store (avoids fragile `import('better-sqlite3').default` typings). */
type SqliteStatement = {
  get(...params: unknown[]): unknown;
  all(...params: unknown[]): unknown[];
  run(...params: unknown[]): { changes: number };
};

type SqliteDatabase = {
  pragma(cmd: string): unknown;
  exec(sql: string): void;
  close(): void;
  prepare(sql: string): SqliteStatement;
};

type SqliteDatabaseConstructor = new (path: string) => SqliteDatabase;

/**
 * True when `better-sqlite3` can open a database (native `.node` present).
 * `require('better-sqlite3')` alone is not enough — install can leave JS without bindings.
 */
export function isBetterSqliteAvailable(): boolean {
  try {
    const Database = require('better-sqlite3') as SqliteDatabaseConstructor;
    const probe = new Database(':memory:');
    probe.close();
    return true;
  } catch {
    return false;
  }
}

function loadDatabaseConstructor(): SqliteDatabaseConstructor {
  try {
    return require('better-sqlite3') as SqliteDatabaseConstructor;
  } catch {
    throw new Error(
      'better-sqlite3 is not available (optional native dependency failed to install or load). ' +
        'Use InMemoryMemoryStore, or install on a platform with prebuilt binaries / build tools.',
    );
  }
}

function parseRow(row: {
  id: string;
  content: string;
  created_at: number;
  updated_at: number;
  metadata: string | null;
}): MemoryRecord {
  let metadata: Record<string, unknown> | undefined;
  if (row.metadata !== null && row.metadata.length > 0) {
    try {
      metadata = JSON.parse(row.metadata) as Record<string, unknown>;
    } catch {
      metadata = undefined;
    }
  }
  return {
    id: row.id,
    content: row.content,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(metadata !== undefined ? { metadata } : {}),
  };
}

/**
 * Persistent memory using SQLite (`:memory:` or a file path).
 *
 * @throws If `better-sqlite3` could not be loaded.
 */
export class SQLiteMemoryStore implements MemoryStore {
  private readonly db: SqliteDatabase;

  constructor(path: string) {
    const Database = loadDatabaseConstructor();
    this.db = new Database(path);
    if (path !== ':memory:') {
      try {
        this.db.pragma('journal_mode = WAL');
      } catch {
        /* ignore */
      }
    }
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY NOT NULL,
        content TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        metadata TEXT
      );
      CREATE INDEX IF NOT EXISTS memories_updated_at ON memories (updated_at DESC);
    `);
  }

  /** Close the DB handle (recommended for file-backed stores in tests / shutdown). */
  close(): void {
    this.db.close();
  }

  async get(id: string): Promise<MemoryRecord | undefined> {
    const row = this.db
      .prepare(
        'SELECT id, content, created_at, updated_at, metadata FROM memories WHERE id = ?',
      )
      .get(id) as
      | {
          id: string;
          content: string;
          created_at: number;
          updated_at: number;
          metadata: string | null;
        }
      | undefined;
    return row === undefined ? undefined : parseRow(row);
  }

  async set(input: MemorySetInput): Promise<MemoryRecord> {
    const t = Date.now();
    const id = input.id ?? `mem_${t}_${Math.random().toString(36).slice(2, 10)}`;
    const prev = await this.get(id);
    const createdAt = prev?.createdAt ?? t;
    const metadataJson =
      input.metadata !== undefined ? JSON.stringify(input.metadata) : null;
    this.db
      .prepare(
        `INSERT INTO memories (id, content, created_at, updated_at, metadata)
         VALUES (@id, @content, @created_at, @updated_at, @metadata)
         ON CONFLICT(id) DO UPDATE SET
           content = excluded.content,
           updated_at = excluded.updated_at,
           metadata = excluded.metadata`,
      )
      .run({
        id,
        content: input.content,
        created_at: createdAt,
        updated_at: t,
        metadata: metadataJson,
      });
    const row = this.db
      .prepare(
        'SELECT id, content, created_at, updated_at, metadata FROM memories WHERE id = ?',
      )
      .get(id) as {
      id: string;
      content: string;
      created_at: number;
      updated_at: number;
      metadata: string | null;
    };
    return parseRow(row);
  }

  async search(query: string, options?: { limit?: number }): Promise<MemoryRecord[]> {
    const cap = options?.limit ?? 200;
    const q = query.trim().toLowerCase();
    const words = q.length > 0 ? q.split(/\s+/u).filter((w) => w.length > 1) : [];

    if (words.length === 0) {
      const rows = this.db
        .prepare(
          'SELECT id, content, created_at, updated_at, metadata FROM memories ORDER BY updated_at DESC LIMIT ?',
        )
        .all(cap) as Array<{
        id: string;
        content: string;
        created_at: number;
        updated_at: number;
        metadata: string | null;
      }>;
      return rows.map(parseRow);
    }

    const clause = words.map(() => 'LOWER(content) LIKE ?').join(' OR ');
    const params = words.map((w) => `%${w}%`);
    const rows = this.db
      .prepare(
        `SELECT id, content, created_at, updated_at, metadata FROM memories WHERE ${clause} ORDER BY updated_at DESC LIMIT ?`,
      )
      .all(...params, cap) as Array<{
      id: string;
      content: string;
      created_at: number;
      updated_at: number;
      metadata: string | null;
    }>;
    return rows.map(parseRow);
  }

  async delete(id: string): Promise<boolean> {
    const r = this.db.prepare('DELETE FROM memories WHERE id = ?').run(id);
    return r.changes > 0;
  }
}
