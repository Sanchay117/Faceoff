/**
 * Faceoff's on-chain duel tag.
 *
 * Every order carries a `userData` field (uint64). The pool stores it on the
 * order and emits it in `OrderPlaced`, and — per the SDK's own comment —
 * "userData is opaque MM bookkeeping, forwarded verbatim; the SDK never
 * interprets it."
 *
 * That is a free, protocol-native index. Faceoff stamps every duel order with a
 * magic value, so an open duel is a *resting order on a public order book that
 * identifies itself as a duel*. The Arena is then a plain contract read —
 * `getAllOpenOrdersOnchain` filtered on the tag — with no database, no server,
 * and no trust in us. Anyone can enumerate every open Faceoff duel from an RPC
 * endpoint alone, and any client could implement the same protocol.
 *
 *   layout (64 bits, MSB first)
 *   ┌──────────────┬─────────┬────────┬─────────────┐
 *   │ magic 32b    │ ver 8b  │ side 8b│ nonce 16b   │
 *   │ 0xFACE0FF0   │ 0x01    │ 0|1    │ random      │
 *   └──────────────┴─────────┴────────┴─────────────┘
 *
 * `side` records which outcome the CREATOR took, so a duel is self-describing
 * on-chain: the base book only knows bid/ask, and an ask could be either a
 * BUY_NO or a SELL_YES. We only ever place buys, but recording the side removes
 * the inference entirely.
 */

export const FACEOFF_MAGIC = 0xface0ff0n;
export const FACEOFF_VERSION = 1n;

export type Side = "UP" | "DOWN";

const SIDE_BIT: Record<Side, bigint> = { UP: 0n, DOWN: 1n };

export interface DuelTag {
  version: number;
  /** The side the duel's CREATOR took. */
  side: Side;
  /** Random per-duel id, for display and link disambiguation. */
  nonce: number;
}

/** Build the `userData` for a new duel order. */
export function encodeTag(side: Side, nonce = randomNonce()): bigint {
  return (
    (FACEOFF_MAGIC << 32n) |
    (FACEOFF_VERSION << 24n) |
    (SIDE_BIT[side] << 16n) |
    BigInt(nonce & 0xffff)
  );
}

/** Read a duel out of an order's `userData`. Returns null for non-Faceoff orders. */
export function decodeTag(userData: bigint): DuelTag | null {
  if (userData >> 32n !== FACEOFF_MAGIC) return null;
  const version = Number((userData >> 24n) & 0xffn);
  const sideBit = (userData >> 16n) & 0xffn;
  return {
    version,
    side: sideBit === 1n ? "DOWN" : "UP",
    nonce: Number(userData & 0xffffn),
  };
}

export function isFaceoffOrder(userData: bigint): boolean {
  return userData >> 32n === FACEOFF_MAGIC;
}

function randomNonce(): number {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return buf[0] & 0xffff;
}

/** The side that takes the other end of a duel. */
export function opposite(side: Side): Side {
  return side === "UP" ? "DOWN" : "UP";
}

/** Map a Faceoff side to the SDK's BinarySide for a BUY. */
export function buySideFor(side: Side): "BUY_YES" | "BUY_NO" {
  return side === "UP" ? "BUY_YES" : "BUY_NO";
}
