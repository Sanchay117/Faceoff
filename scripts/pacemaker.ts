/**
 * The Pacemaker — keeps the Arena warm.
 *
 * Faceoff does not NEED a market maker: two people who disagree mint their own
 * contract. But a first-time visitor who lands on an empty Arena has nothing to
 * disagree with, and that is the whole cold-start problem again one level up.
 *
 * So this bot keeps a small ladder of open duels standing on the main windows.
 * It is a liquidity service, not a house:
 *
 *   - It only ever RESTS (post-only). It never takes a real player's duel.
 *   - It quotes both sides symmetrically around even odds, so it carries no
 *     directional view.
 *   - When both legs of a rung fill it holds one Up and one Down — a complete
 *     set, worth exactly the collateral that funded it. It is flat.
 *   - Its edge is the spread and nothing else. Keep SPREAD tight; the point is
 *     a non-empty Arena, not a rake.
 *
 * The two legs must not cross each other. A Buy Up at p rests as a BID at p; a
 * Buy Down at q rests as an ASK at q. So every rung needs p < q, and the bot
 * pays p for Up and (1 − q) for Down — under half of the pot on each side.
 *
 * Orders inherit the pool's own market expiry, so a rung on a window that rolls
 * ages off the book by itself. That is the dead-man's switch: if this process
 * dies, nothing is left stranded.
 *
 * Run:  npm run pacemaker
 */

import { createPublicClient, formatEther, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { COLLATERAL, claimCollateral } from "../src/lib/account";
import { NETWORK, ORDER_RESERVE_WEI } from "../src/lib/config";
import { createDuel, listOpenDuels, DuelError } from "../src/lib/duels";
import { readExchange } from "../src/lib/exchange";
import { listLiveMarkets, loadMarket, marketLabel, STATUS } from "../src/lib/markets";
import type { Side } from "../src/lib/tag";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may already be set */
}

/**
 * Cadences to keep stocked. The 15-minute window is the sweet spot: long enough
 * to send someone a link, short enough to settle while they are still watching.
 * Widen this once the gas budget allows — every rung is a transaction.
 */
const TARGET_CADENCES = [900, 3600];
/** Half-spread in probability. 0.02 → the taker pays 0.52 to win 1.00. */
const SPREAD = 0.02;
/** Conviction rungs, as the taker's implied probability distance from even. */
const RUNGS = [0, 0.15];  // 4 rungs x 4 markets ~= 0.12 STT/hour
/** Pot per duel, in collateral. */
const POT = 10;
/** Keep at least this much collateral spare rather than quoting it all away. */
const RESERVE = 50;
const CYCLE_MS = 30_000;
const MIN_RUNWAY_SEC = 240;

const pub = createPublicClient({ chain: somniaShannon, transport: http(NETWORK.httpRpcUrl) });

interface Rung {
  side: Side;
  /** The Up probability this rung quotes at. */
  upProbability: number;
}

/**
 * The ladder for one market: Up legs below even, Down legs above it, so no two
 * of our own orders can cross.
 */
function ladder(): Rung[] {
  const rungs: Rung[] = [];
  for (const step of RUNGS) {
    rungs.push({ side: "UP", upProbability: round3(0.5 - SPREAD - step) });
    rungs.push({ side: "DOWN", upProbability: round3(0.5 + SPREAD + step) });
  }
  return rungs;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

function log(msg: string, extra?: unknown) {
  const t = new Date().toISOString().slice(11, 19);
  console.log(`[${t}] ${msg}`, extra === undefined ? "" : extra);
}

async function cycle(key: `0x${string}`, me: `0x${string}`): Promise<void> {
  const client = readExchange().client;

  const [collateral, gas] = await Promise.all([
    client.getErc20Balance(COLLATERAL, me),
    pub.getBalance({ address: me }),
  ]);
  const spendable = Number(collateral) / 1e6 - RESERVE;

  // The node rejects a write unless the wallet can cover gasLimit *
  // maxFeePerGas, so quoting below twice that reserve just produces a stream of
  // reverts that each look like a different problem. Say it once instead.
  if (gas < ORDER_RESERVE_WEI * 2n) {
    log(
      `⚠ out of gas headroom: ${formatEther(gas)} STT, need ${formatEther(ORDER_RESERVE_WEI * 2n)}. Top up ${me}`,
    );
    return;
  }
  if (spendable <= POT) {
    log(`⚠ low collateral (${(Number(collateral) / 1e6).toFixed(2)} tUSDC) — minting more`);
    try {
      // Through the shared helper, so it inherits the sized gas ceiling. Calling
      // trader.faucet() raw uses the SDK's 10M default, which reserves more STT
      // than this bot is ever funded with.
      await claimCollateral(key);
    } catch (err) {
      log("faucet failed", String(err).slice(0, 120));
    }
    return;
  }

  const markets = (await listLiveMarkets()).filter(
    (m) =>
      TARGET_CADENCES.includes(m.intervalSec) && m.expiry - Date.now() / 1000 > MIN_RUNWAY_SEC,
  );

  let budget = spendable;

  for (const row of markets) {
    // Gate on chain state, never the indexer: an order on a just-locked market
    // reverts and costs gas for nothing.
    const market = await loadMarket(row.marketId);
    if (market.status !== STATUS.Trading) continue;

    const open = await listOpenDuels(market.marketId, market.pool);
    const mine = open.filter((d) => d.creator.toLowerCase() === me.toLowerCase());
    const taken = open.filter((d) => d.creator.toLowerCase() !== me.toLowerCase()).length;

    for (const rung of ladder()) {
      const targetPrice = BigInt(Math.round(rung.upProbability * 10 ** market.grid.decimals));
      const covered = mine.some(
        (d) => d.creatorSide === rung.side && absDiff(d.rawPrice, targetPrice) <= market.grid.tickSize,
      );
      if (covered) continue;

      const stake = rung.side === "UP" ? POT * rung.upProbability : POT * (1 - rung.upProbability);
      if (budget < stake) break;

      try {
        const res = await createDuel({
          privateKey: key,
          marketId: market.marketId,
          side: rung.side,
          pot: POT,
          upProbability: rung.upProbability,
        });
        budget -= stake;
        log(
          `+ ${marketLabel(market.asset, market.intervalSec)} ${rung.side} @ ${rung.upProbability} — order ${res.orderId}`,
        );
      } catch (err) {
        if (err instanceof DuelError && err.code === "WOULD_CROSS") {
          // Someone is already resting inside our quote. That is a healthy book,
          // not a fault — leave their order alone and skip this rung.
          continue;
        }
        log(`! ${marketLabel(market.asset, market.intervalSec)} ${rung.side}`, String(err).slice(0, 140));
      }
    }

    if (mine.length || taken) {
      log(
        `  ${marketLabel(market.asset, market.intervalSec)}: ${mine.length} ours, ${taken} from players`,
      );
    }
  }
}

function absDiff(a: bigint, b: bigint): bigint {
  return a > b ? a - b : b - a;
}

async function main() {
  const key = process.env.PACEMAKER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    throw new Error(
      "Set PACEMAKER_PRIVATE_KEY in .env.local — a funded Shannon key this bot quotes from.",
    );
  }

  const me = privateKeyToAccount(key).address;
  log(`Pacemaker starting as ${me}`);
  log(`ladder: ${ladder().map((r) => `${r.side}@${r.upProbability}`).join("  ")}`);

  for (;;) {
    try {
      await cycle(key, me);
    } catch (err) {
      log("cycle failed", String(err).slice(0, 200));
    }
    await new Promise((r) => setTimeout(r, CYCLE_MS));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
