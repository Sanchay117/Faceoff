import { readExchange } from "./exchange";
import type { DuelMarket } from "./markets";
import type { Side } from "./tag";

/**
 * Reconstructing a settled duel from the tape.
 *
 * Once a duel is taken, the resting order is gone — the pool consumed it. But
 * the fill survives, and it names both wallets, both sides, the price, and
 * crucially the PATH the fill took. So a shared link never dies: it stops being
 * an invitation and becomes a scoreboard anyone can watch.
 */

export interface Match {
  /** The player who opened the duel. */
  creator: `0x${string}`;
  creatorSide: Side;
  /** The player who took the other side. */
  taker: `0x${string}`;
  takerSide: Side;
  /** Contracts matched, raw units — the pot. */
  quantity: bigint;
  /** Up price the duel settled at, raw. */
  price: bigint;
  /**
   * How the pool settled it. `MINT_A_PAIR` means no seller existed: the pool
   * minted both outcome tokens out of the two players' combined stakes. That is
   * the mechanic Faceoff is built on, reported by the protocol itself.
   */
  kind: string | null;
  txHash: string;
  timestamp: number;
}

function sideOf(binarySide: string | null | undefined, fallback: Side): Side {
  if (binarySide === "BUY_NO" || binarySide === "SELL_YES") return "DOWN";
  if (binarySide === "BUY_YES" || binarySide === "SELL_NO") return "UP";
  return fallback;
}

/**
 * Find the fill(s) that consumed a duel's resting order.
 *
 * Scoped to the market's own window: `getFills` is keyed on the POOL, and a pool
 * is recycled across successive markets, so an unscoped read happily returns
 * fills from dozens of markets that are not this one.
 */
export async function findMatch(
  market: DuelMarket,
  orderId: bigint,
): Promise<Match | null> {
  try {
    const rows = await readExchange().client.getFills(market.pool, {
      since: market.tradingStart || undefined,
      until: market.expiry || undefined,
    });

    const mine = rows.filter(
      (f) =>
        String(f.makerOrderId) === orderId.toString() &&
        f.market?.toLowerCase() === market.marketId.toLowerCase(),
    );
    if (mine.length === 0) return null;

    // A duel can be taken in more than one bite; fold them into one result.
    const quantity = mine.reduce((n, f) => n + BigInt(f.quantity ?? 0), 0n);
    const notional = mine.reduce(
      (n, f) => n + BigInt(f.quantity ?? 0) * BigInt(f.fillPrice ?? 0),
      0n,
    );
    const first = mine[0];

    const makerSide = sideOf(first.makerSide, "UP");
    const takerSide = sideOf(
      first.takerOrder?.side ?? first.takerSide,
      makerSide === "UP" ? "DOWN" : "UP",
    );

    return {
      creator: (first.maker ?? "0x") as `0x${string}`,
      creatorSide: makerSide,
      taker: (first.takerOrder?.owner ?? first.taker ?? "0x") as `0x${string}`,
      takerSide,
      quantity,
      price: quantity > 0n ? notional / quantity : 0n,
      kind: first.kind ?? null,
      txHash: first.txHash,
      timestamp: Number(first.timestamp ?? 0),
    };
  } catch {
    return null;
  }
}
