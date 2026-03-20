/**
 * Types for semantic / embedding-based selection (design §8.2 / Phase 8.5).
 *
 * @packageDocumentation
 */

/**
 * Produces a dense embedding for a text segment (app supplies — OpenAI, local model, etc.).
 */
export type EmbedFunction = (text: string) => Promise<number[]>;

/**
 * Minimal item shape for semantic scoring (plain text + ordering + pin).
 */
export type SemanticScorableItem = {
  readonly id: string;
  readonly role: string;
  readonly text: string;
  readonly createdAt: number;
  readonly pinned?: boolean;
};
