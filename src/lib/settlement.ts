import { GAS } from "./config";
import { readExchange, signerExchangeFor } from "./exchange";
import { snapCadence } from "./markets";

/**
 * Positions and payouts.
 *
 * Redemption is the step people miss. `loadMarkets()` deliberately skips settled
 * binary markets, so a "scan for winnings" built on it finds nothing while real
 * money sits unclaimed. Faceoff reads the wallet's portfolio instead, which
 * carries every non-zero outcome position together with the market's terminal
 * status — and then claims them all in ONE transaction with `redeemMany`.
 */

export interface Position {
  marketId: `0x${string}`;
  marketAddress: `0x${string}`;
  asset: string;
  question: string;
  intervalSec: number;
  expiry: number;
  /** 0 = Up, 1 = Down. */
  outcomeIndex: 0 | 1;
  side: "UP" | "DOWN";
  /** Outcome tokens held, raw units. */
  balance: bigint;
  decimals: number;
  status: string;
  winningOutcome: number | null;
  voided: boolean;
  /** The window has closed and the result is final. */
  settled: boolean;
  /** Settled and this side won outright. */
  won: boolean;
  /** What redeeming pays out, raw units. Voided markets pay half to each side. */
  payout: bigint;
}

const TERMINAL = new Set(["Finalized", "Resolved", "Voided"]);

export async function loadPositions(account: `0x${string}`): Promise<Position[]> {
  const ex = readExchange();
  const portfolio = await ex.client.getPortfolio(account, { tradesLimit: 0, ordersLimit: 200 });

  return portfolio.positions.map((p): Position => {
    const m = p.market;
    const decimals = m.quoteDecimals;
    const balance = BigInt(p.balance);
    const outcomeIndex = (p.outcomeIndex === 1 ? 1 : 0) as 0 | 1;
    const voided = Boolean(m.voided);
    const settled = voided || TERMINAL.has(String(m.status));
    const won = settled && !voided && m.winningOutcome === outcomeIndex;

    // Resolved: the winning side redeems 1:1 and the losing side is worth zero.
    // Voided: there is no winner to infer — both sides redeem at 0.5.
    const payout = voided ? balance / 2n : won ? balance : 0n;

    return {
      marketId: m.id as `0x${string}`,
      marketAddress: m.marketAddress as `0x${string}`,
      asset: m.asset ?? "?",
      question: m.question ?? "",
      intervalSec: snapCadence(Number(m.intervalSec ?? 0)),
      expiry: Number(m.expiry ?? 0),
      outcomeIndex,
      side: outcomeIndex === 0 ? "UP" : "DOWN",
      balance,
      decimals,
      status: String(m.status),
      winningOutcome: m.winningOutcome ?? null,
      voided,
      settled,
      won,
      payout,
    };
  });
}

/**
 * Overlay a position with the market's live on-chain state.
 *
 * The portfolio read comes from the indexer, which trails the chain by seconds.
 * The SDK's live store keeps binary status and resolution current straight from
 * chain events, so a duel that just settled shows its result here immediately
 * rather than on the next indexer pass. Settlement itself needs no keeper: the
 * oracle's answer is delivered to the settlement hub by Somnia's on-chain
 * reactivity, so "resolved" arrives as an event we are already listening to.
 */
export function applyLiveStatus(
  p: Position,
  live: { status?: unknown; winningOutcome?: number | null; voided?: boolean } | undefined,
): Position {
  if (!live) return p;

  const status = live.status != null ? String(live.status) : p.status;
  const voided = live.voided ?? p.voided;
  const winningOutcome = live.winningOutcome ?? p.winningOutcome;
  const settled = voided || TERMINAL.has(status);
  if (settled === p.settled && status === p.status) return p;

  const won = settled && !voided && winningOutcome === p.outcomeIndex;
  return {
    ...p,
    status,
    voided,
    winningOutcome,
    settled,
    won,
    payout: voided ? p.balance / 2n : won ? p.balance : 0n,
  };
}

/** Positions still riding on an open window. */
export function livePositions(all: Position[]): Position[] {
  return all.filter((p) => !p.settled && p.balance > 0n);
}

/** Settled positions with something to collect. */
export function claimablePositions(all: Position[]): Position[] {
  return all.filter((p) => p.settled && p.payout > 0n);
}

export function totalPayout(positions: Position[]): bigint {
  return positions.reduce((n, p) => n + p.payout, 0n);
}

/**
 * Claim every settled win in a single transaction.
 *
 * `redeemMany` takes the whole batch, so a player who let ten duels settle pays
 * one gas fee and signs once instead of ten times. A voided market is included
 * on BOTH sides deliberately — each leg pays 0.5 and there is no winning outcome
 * to infer.
 */
export async function claimAll(
  privateKey: `0x${string}`,
  positions: Position[],
): Promise<{ hash: string; claimed: number; total: bigint } | null> {
  const claimable = claimablePositions(positions);
  if (claimable.length === 0) return null;

  const ex = signerExchangeFor(privateKey);
  const res = await ex.trader.redeemMany({
    entries: claimable.map((p) => ({
      marketId: p.marketId,
      outcomeIdx: p.outcomeIndex,
      amount: p.balance,
    })),
    gas: GAS.redeem,
  });

  return { hash: res.hash, claimed: claimable.length, total: totalPayout(claimable) };
}
