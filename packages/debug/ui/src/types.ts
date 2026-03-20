/**
 * Wire shapes from inspector REST / WebSocket (loosely typed JSON).
 *
 * @packageDocumentation
 */

export type SlotMetaWire = {
  readonly name: string;
  readonly budgetTokens: number;
  readonly usedTokens: number;
  readonly itemCount: number;
  readonly evictedCount: number;
  readonly overflowTriggered: boolean;
  readonly utilization: number;
};

export type SnapshotMetaWire = {
  readonly totalTokens: number;
  readonly totalBudget: number;
  readonly utilization: number;
  readonly waste: number;
  readonly slots: Readonly<Record<string, SlotMetaWire>>;
  readonly buildTimeMs: number;
  readonly builtAt: number;
};

/** Serialized snapshot from `build:complete` (matches core `SerializedSnapshot`). */
export type SerializedSnapshotWire = {
  readonly version: '1.0';
  readonly id: string;
  readonly model: string;
  readonly slots: Readonly<Record<string, SlotMetaWire>>;
  readonly messages: readonly unknown[];
  readonly meta: SnapshotMetaWire;
  readonly checksum: string;
};

export type InspectorEventWire = Readonly<Record<string, unknown>> & {
  readonly type: string;
};

export type TimedInspectorEvent = {
  readonly receivedAt: number;
  readonly event: InspectorEventWire;
};

export type SlotsOkResponse = {
  readonly ok: true;
  readonly slots: Readonly<
    Record<
      string,
      {
        readonly config: unknown;
        readonly items: readonly unknown[];
      }
    >
  >;
};
