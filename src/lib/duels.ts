import { ORDER_TYPE } from "@somnia-chain/markets-sdk";
import type { PlaceOrderResult } from "@somnia-chain/markets-sdk";
import { readExchange, signerExchangeFor } from "./exchange";
import { loadMarket, STATUS, type DuelMarket, type LiveMarket } from "./markets";
import { buySideFor, decodeTag, encodeTag, opposite, type Side } from "./tag";
import { contractsToRawQuantity, escrowFor, probabilityToRawPrice, type Grid } from "./units";

/**
 * A duel is a resting buy order on a DreamDEX binary pool, tagged as Faceoff in
 * its `userData`. There is no Faceoff database: this struct is decoded from the
 * pool contract itself.
 */
export interface Duel {
  marketId: `0x${string}`;
  pool: `0x${string}`;
  orderId: bigint;
  creator: `0x${string}`;
  /** Which outcome the creator backed. */
  creatorSide: Side;
  /** Up price, raw collateral units. */
  rawPrice: bigint;
  /** Still-open quantity — the pot a taker can still claim. */
  rawRemaining: bigint;
  /** Quantity the duel was opened with. */
  rawFull: bigint;
  nonce: number;
  expireTimestampNs: bigint;
}

/** The money view of a duel, in human units. */
export interface DuelStakes {
  /** What the winner receives in total. */
  pot: number;
  creatorStake: number;
  takerStake: number;
  /** Implied probability of Up, 0–1. */
  upProbability: number;
  /** What a taker multiplies their stake by if they win. */
  takerMultiple: number;
}

export function stakesFor(duel: Duel, grid: Grid): DuelStakes {
  const ONE = 10n ** BigInt(grid.decimals);
  const creatorRaw = escrowFor(duel.creatorSide, duel.rawPrice, duel.rawRemaining, grid);
  const takerRaw = escrowFor(opposite(duel.creatorSide), duel.rawPrice, duel.rawRemaining, grid);
  const pot = Number(duel.rawRemaining) / Number(ONE);
  const takerStake = Number(takerRaw) / Number(ONE);
  return {
    pot,
    creatorStake: Number(creatorRaw) / Number(ONE),
    takerStake,
    upProbability: Number(duel.rawPrice) / Number(ONE),
    takerMultiple: takerStake > 0 ? pot / takerStake : 0,
  };
}

/* ------------------------------------------------------------------ reading */

type OnchainOrderish = {
  orderId: bigint;
  isBid: boolean;
  owner: `0x${string}`;
  userData: bigint;
  price: bigint;
  fullQuantity: bigint;
  quantityRemaining: bigint;
  expireTimestampNs: bigint;
};

function toDuel(marketId: `0x${string}`, pool: `0x${string}`, o: OnchainOrderish): Duel | null {
  const tag = decodeTag(o.userData);
  if (!tag) return null;
  return {
    marketId,
    pool,
    orderId: o.orderId,
    creator: o.owner,
    // The tag records the creator's side explicitly. The base book only knows
    // bid/ask, and an ask could be a BUY_NO or a SELL_YES — so we never infer.
    creatorSide: tag.side,
    rawPrice: o.price,
    rawRemaining: o.quantityRemaining,
    rawFull: o.fullQuantity,
    nonce: tag.nonce,
    expireTimestampNs: o.expireTimestampNs,
  };
}

/**
 * Every open duel on one market, read straight from the pool contract.
 *
 * Both sides of the book are scanned: a creator who backed Up rests as a bid, a
 * creator who backed Down rests as an ask. Everything not carrying the Faceoff
 * tag — market-maker quotes, other bots — is filtered out.
 */
export async function listOpenDuels(
  marketId: `0x${string}`,
  pool: `0x${string}`,
): Promise<Duel[]> {
  const ex = readExchange();
  const [bids, asks] = await Promise.all([
    ex.client.getAllOpenOrdersOnchain(pool, { isBid: true, maxCount: 100 }),
    ex.client.getAllOpenOrdersOnchain(pool, { isBid: false, maxCount: 100 }),
  ]);
  return [...bids.orders, ...asks.orders]
    .map((o) => toDuel(marketId, pool, o as OnchainOrderish))
    .filter((d): d is Duel => d !== null && d.rawRemaining > 0n);
}

/** A duel joined with the window it settles on — what the Arena renders. */
export interface ArenaDuel extends Duel {
  market: LiveMarket;
  stakes: DuelStakes;
}

/**
 * Every open duel across every live window, newest windows first.
 *
 * Reads run in parallel across markets — the docs are explicit that there are no
 * rate limits here ("market data is the chain itself, and the public RPC
 * endpoints are unthrottled"), so the Arena is one fan-out rather than a queue.
 */
export async function listArena(markets: LiveMarket[]): Promise<ArenaDuel[]> {
  const perMarket = await Promise.all(
    markets.map(async (m) => {
      try {
        const duels = await listOpenDuels(m.marketId, m.pool);
        const grid: Grid = {
          decimals: m.decimals,
          tickSize: 1n,
          lotSize: 1n,
          minQuantity: 1n,
        };
        return duels.map((d) => ({ ...d, market: m, stakes: stakesFor(d, grid) }));
      } catch {
        // One unreachable pool should not blank the whole Arena.
        return [] as ArenaDuel[];
      }
    }),
  );

  return perMarket
    .flat()
    .sort((a, b) => b.stakes.pot - a.stakes.pot || a.market.expiry - b.market.expiry);
}

/**
 * One duel by order id. Returns null when the order is gone — the pool signals
 * "no active order with this id" by reverting, which the SDK turns into null, so
 * null here means the duel was taken, cancelled, or expired.
 */
export async function getDuel(
  marketId: `0x${string}`,
  pool: `0x${string}`,
  orderId: bigint,
): Promise<Duel | null> {
  const ex = readExchange();
  const o = await ex.client.getOrderOnchain(pool, orderId);
  if (!o) return null;
  return toDuel(marketId, pool, o as OnchainOrderish);
}

/* ------------------------------------------------------------------ writing */

export class DuelError extends Error {
  constructor(
    message: string,
    readonly code:
      | "MARKET_CLOSED"
      | "TOO_SMALL"
      | "WOULD_CROSS"
      | "ALREADY_TAKEN"
      | "NO_FILL"
      | "INSUFFICIENT"
      | "FAILED",
  ) {
    super(message);
    this.name = "DuelError";
  }
}

function classify(err: unknown): DuelError {
  const s = String(err);
  if (s.includes("PostOnlyWouldCross"))
    return new DuelError(
      "Someone is already offering the other side at these odds. Take their duel instead, or move your odds.",
      "WOULD_CROSS",
    );
  if (s.includes("ERC20InsufficientBalance") || s.includes("InsufficientBalance"))
    return new DuelError("Not enough tUSDC in your wallet for this stake.", "INSUFFICIENT");
  if (s.includes("OrderAlreadyExpired") || s.includes("MarketNotTrading") || s.includes("NotTrading"))
    return new DuelError("This window just closed. Pick the next one.", "MARKET_CLOSED");
  if (s.includes("IncorrectOrder"))
    return new DuelError("This duel was already taken.", "ALREADY_TAKEN");
  return new DuelError(s.replace(/^Error:\s*/, "").slice(0, 200), "FAILED");
}

export interface CreateDuelInput {
  privateKey: `0x${string}`;
  marketId: `0x${string}`;
  /** The side the creator is backing. */
  side: Side;
  /** Total the winner takes home, in collateral. */
  pot: number;
  /** Probability assigned to Up, in (0,1). Sets how the pot is split. */
  upProbability: number;
}

export interface CreateDuelResult {
  orderId: bigint;
  hash: string;
  nonce: number;
  market: DuelMarket;
  rawPrice: bigint;
  rawQuantity: bigint;
  stake: bigint;
}

/**
 * Open a duel: rest a tagged, post-only buy on the pool.
 *
 * POST_ONLY is the whole point. A normal limit order would cross whatever
 * happens to be resting and fill the "duel" against a stranger before the link
 * was ever sent. Post-only refuses to take liquidity, so the order waits for the
 * person you sent it to — and if it *would* have crossed, the pool reverts and
 * we route the creator to the existing offer instead.
 *
 * Expiry is left to the SDK default, which is the pool's own market expiry. That
 * is exactly the semantic a duel wants: the challenge stands until the window
 * closes, and it can never outlive the market it settles on.
 */
export async function createDuel(input: CreateDuelInput): Promise<CreateDuelResult> {
  const market = await loadMarket(input.marketId);
  if (market.status !== STATUS.Trading)
    throw new DuelError("This window is no longer taking orders.", "MARKET_CLOSED");

  const rawPrice = probabilityToRawPrice(input.upProbability, market.grid);
  const rawQuantity = contractsToRawQuantity(input.pot, market.grid);
  if (rawQuantity === 0n)
    throw new DuelError("That pot is below the market's minimum size.", "TOO_SMALL");

  const nonce = Math.floor(Math.random() * 0x10000);
  const ex = signerExchangeFor(input.privateKey);

  try {
    const res = await ex.trader.placeOrder({
      pool: market.pool,
      side: buySideFor(input.side),
      price: rawPrice,
      quantity: rawQuantity,
      orderType: ORDER_TYPE.POST_ONLY,
      userData: encodeTag(input.side, nonce),
    });

    if (res.receipt?.status === "reverted")
      throw new DuelError("The transaction reverted on-chain.", "FAILED");
    if (res.orderId === undefined)
      throw new DuelError("The order did not rest on the book.", "FAILED");

    return {
      orderId: res.orderId,
      hash: res.hash,
      nonce,
      market,
      rawPrice,
      rawQuantity,
      stake: escrowFor(input.side, rawPrice, rawQuantity, market.grid),
    };
  } catch (err) {
    if (err instanceof DuelError) throw err;
    throw classify(err);
  }
}

export interface AcceptDuelResult {
  hash: string;
  /** What actually filled, raw units — read from the receipt, not from intent. */
  filledQuantity: bigint;
  /** Volume-weighted fill price, raw. */
  avgPrice: bigint;
  side: Side;
  market: DuelMarket;
}

/**
 * Take the other side of a duel.
 *
 * The two orders cross through the pool's **mint-a-pair** path: neither player
 * is a seller and no market maker is involved. Both buys pay collateral, the
 * pool mints a fresh Up/Down pair from the combined amount, and each player
 * keeps one leg. This is why a duel needs no liquidity to exist.
 *
 * FILL_OR_KILL, sized to the order's *current* remaining quantity: if a stranger
 * partially took the duel between the link being sent and opened, we take what
 * is actually left rather than reverting on a stale number.
 */
export async function acceptDuel(input: {
  privateKey: `0x${string}`;
  marketId: `0x${string}`;
  orderId: bigint;
}): Promise<AcceptDuelResult> {
  const market = await loadMarket(input.marketId);
  if (market.status !== STATUS.Trading)
    throw new DuelError("This window closed before you could take it.", "MARKET_CLOSED");

  const duel = await getDuel(market.marketId, market.pool, input.orderId);
  if (!duel) throw new DuelError("This duel was already taken.", "ALREADY_TAKEN");

  const takerSide = opposite(duel.creatorSide);
  const ex = signerExchangeFor(input.privateKey);

  try {
    const res: PlaceOrderResult = await ex.trader.placeOrder({
      pool: market.pool,
      side: buySideFor(takerSide),
      price: duel.rawPrice,
      quantity: duel.rawRemaining,
      orderType: ORDER_TYPE.FILL_OR_KILL,
      userData: encodeTag(takerSide, duel.nonce),
    });

    if (res.receipt?.status === "reverted")
      throw new DuelError("This duel was taken a moment before you.", "ALREADY_TAKEN");

    // Reconcile against the fills the transaction actually produced. The docs are
    // explicit that intent is not position: "treat your own trade history as the
    // source of truth for position, not what you asked for."
    const filled = res.fills.reduce((n, f) => n + f.quantityFilled, 0n);
    if (filled === 0n)
      throw new DuelError("Nothing filled — the duel is no longer available.", "NO_FILL");

    const notional = res.fills.reduce((n, f) => n + f.quantityFilled * f.fillPrice, 0n);

    return {
      hash: res.hash,
      filledQuantity: filled,
      avgPrice: filled > 0n ? notional / filled : duel.rawPrice,
      side: takerSide,
      market,
    };
  } catch (err) {
    if (err instanceof DuelError) throw err;
    throw classify(err);
  }
}

/** Withdraw an unmatched duel. The escrow returns to the creator's wallet. */
export async function cancelDuel(input: {
  privateKey: `0x${string}`;
  pool: `0x${string}`;
  orderId: bigint;
}): Promise<{ hash: string }> {
  const ex = signerExchangeFor(input.privateKey);
  try {
    const res = await ex.trader.cancelOrder({ pool: input.pool, orderId: input.orderId });
    return { hash: res.hash };
  } catch (err) {
    throw classify(err);
  }
}
