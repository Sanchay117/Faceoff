import { readExchange } from "./exchange";
import { MIN_SECONDS_LEFT, VENUE_ID } from "./config";
import type { Grid } from "./units";

/** Lifecycle codes from the on-chain market. Only Trading (1) accepts orders. */
export const STATUS = {
  Listed: 0,
  Trading: 1,
  Locked: 2,
  Settling: 3,
  Resolved: 4,
  Voided: 5,
} as const;

/** A market row plus the on-chain truth we gate every write on. */
export interface DuelMarket {
  marketId: `0x${string}`;
  pool: `0x${string}`;
  marketAddress: `0x${string}`;
  outcomeToken: `0x${string}`;
  collateral: `0x${string}`;
  yesId: bigint;
  noId: bigint;
  asset: string;
  intervalSec: number;
  /** Unix seconds. */
  expiry: number;
  tradingStart: number;
  question: string;
  oracleQuestionId: string | null;
  /** On-chain status, not the indexer's. */
  status: number;
  grid: Grid;
  tradeCount: number;
  volume: number;
}

export function secondsLeft(m: Pick<DuelMarket, "expiry">): number {
  return m.expiry - Date.now() / 1000;
}

/**
 * Live markets on the Faceoff venue, newest window per series.
 *
 * Indexer-only, so it is one query and cheap enough to poll. It deliberately
 * does NOT gate on the on-chain status — that read is per-market and belongs
 * right before a write (see `loadMarket`). The indexer status is good enough to
 * paint a list.
 */
export interface LiveMarket {
  marketId: `0x${string}`;
  pool: `0x${string}`;
  asset: string;
  intervalSec: number;
  expiry: number;
  question: string;
  tradeCount: number;
  volume: number;
  /**
   * Collateral decimals, straight off the indexer row — so a list can render
   * money without an extra chain read per market. Anything that WRITES still
   * goes through `loadMarket`, which reads the pool's own grid.
   */
  decimals: number;
}

export async function listLiveMarkets(): Promise<LiveMarket[]> {
  const ex = readExchange();
  const rows = await ex.client.listLiveBinaryMarkets({ venueId: VENUE_ID, limit: 50 });

  return rows
    .map((m) => ({
      marketId: m.marketId as `0x${string}`,
      pool: m.poolAddress as `0x${string}`,
      asset: m.asset ?? "?",
      // A rolled window is indexed at its real duration (898s, 899s) rather than
      // the nominal cadence, so snap to the nearest rung for display.
      intervalSec: snapCadence(Number(m.intervalSec)),
      expiry: Number(m.expiry),
      question: m.question ?? "",
      tradeCount: Number(m.tradeCount ?? 0),
      volume: Number(m.cumulativeQuoteVolume ?? 0),
      decimals: Number(m.quoteDecimals ?? 6),
    }))
    .filter((m) => m.expiry - Date.now() / 1000 > MIN_SECONDS_LEFT)
    .sort((a, b) => a.intervalSec - b.intervalSec || a.expiry - b.expiry);
}

const LADDER = [60, 300, 900, 3600, 14400, 86400];

/** Snap an indexed interval to its cadence rung (898s → 900s). */
export function snapCadence(sec: number): number {
  let best = LADDER[0];
  for (const rung of LADDER) {
    if (Math.abs(sec - rung) < Math.abs(sec - best)) best = rung;
  }
  return best;
}

/**
 * Everything needed to trade one market, read at chain head.
 *
 * This is the read that must happen before any write: the indexer lags by
 * seconds and an order on a just-locked market reverts. It also carries the
 * pool's tick/lot grid and the collateral's decimals, which is what keeps the
 * price and size arithmetic honest across networks.
 */
export async function loadMarket(marketId: `0x${string}`): Promise<DuelMarket> {
  const ex = readExchange();

  const [onchain, rows] = await Promise.all([
    ex.client.getMarketOnchain(marketId),
    ex.client.listBinaryMarkets({ venueId: VENUE_ID, limit: 200 }),
  ]);

  const row = rows.find((r) => r.marketId?.toLowerCase() === marketId.toLowerCase());
  const params = await ex.client.getBinaryBookParams(onchain.pool);

  return {
    marketId,
    pool: onchain.pool,
    marketAddress: onchain.marketAddress,
    outcomeToken: onchain.outcomeToken,
    collateral: onchain.collateral,
    yesId: onchain.yesId,
    noId: onchain.noId,
    asset: row?.asset ?? "?",
    intervalSec: snapCadence(Number(row?.intervalSec ?? 0)),
    expiry: Number(onchain.expiry),
    tradingStart: Number(row?.tradingStart ?? 0),
    question: row?.question ?? "",
    oracleQuestionId: row?.oracleQuestionId ?? null,
    status: onchain.status,
    tradeCount: Number(row?.tradeCount ?? 0),
    volume: Number(row?.cumulativeQuoteVolume ?? 0),
    grid: {
      decimals: onchain.decimals,
      tickSize: params.tickSize,
      lotSize: params.lotSize,
      minQuantity: params.minQuantity,
    },
  };
}

/** True when this market can still accept a duel. */
export function isTradeable(m: DuelMarket): boolean {
  return m.status === STATUS.Trading && secondsLeft(m) > MIN_SECONDS_LEFT;
}

/** Human label for a window, e.g. "BTC · 15 min". */
export function marketLabel(asset: string, intervalSec: number): string {
  const mins = intervalSec / 60;
  const label =
    mins >= 1440 ? `${mins / 1440} day` : mins >= 60 ? `${mins / 60} hour` : `${mins} min`;
  return `${asset} · ${label}`;
}
