/**
 * Put a handful of duels on the board, once, and stop.
 *
 * The Pacemaker quotes a ladder away from mid, which is the EXPENSIVE insertion
 * path: the pool walks a price-ordered list to place the order, so an order far
 * from the touch costs several times one next to it (2.46M gas versus 486k,
 * measured). Worse, a failed attempt still burns everything it used, so a bot
 * retrying a too-deep quote drains a wallet fast.
 *
 * This seeds the Arena the cheap way — each duel rests immediately inside the
 * current touch, which is both the lowest-gas insertion and the most attractive
 * odds a taker can be offered. One pass, no retry loop.
 *
 *   npm run seed
 */

import { privateKeyToAccount } from "viem/accounts";
import { GAS } from "../src/lib/config";
import { canRest, createDuel, listOpenDuels, restBand } from "../src/lib/duels";
import { listLiveMarkets, loadMarket, marketLabel, STATUS } from "../src/lib/markets";
import type { Side } from "../src/lib/tag";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may already be set */
}

const POT = 10;
/** Windows that settle inside a demo. */
const CADENCES = [900, 3600];
const MIN_RUNWAY_SEC = 300;

async function main() {
  const key = process.env.PACEMAKER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("Set PACEMAKER_PRIVATE_KEY in .env.local");
  const me = privateKeyToAccount(key).address;

  const rows = (await listLiveMarkets()).filter(
    (m) => CADENCES.includes(m.intervalSec) && m.expiry - Date.now() / 1000 > MIN_RUNWAY_SEC,
  );

  let placed = 0;

  for (const row of rows) {
    const market = await loadMarket(row.marketId);
    if (market.status !== STATUS.Trading) continue;

    const band = await restBand(market);
    const one = 10 ** market.grid.decimals;

    const existing = await listOpenDuels(market.marketId, market.pool);
    const mine = existing.filter((d) => d.creator.toLowerCase() === me.toLowerCase());

    // One of each side — but quoted around a midpoint with our own spread, not
    // both squeezed onto the touch. A single wallet cannot rest a bid and an ask
    // at the same price: they would cross each other and the pool rejects the
    // second as a self-match.
    const bid = band.bestYesBid === null ? null : Number(band.bestYesBid) / one;
    const ask = band.bestYesAsk === null ? null : Number(band.bestYesAsk) / one;
    const mid = bid !== null && ask !== null ? (bid + ask) / 2 : (bid ?? ask ?? 0.5);
    const HALF_SPREAD = 0.05;

    for (const side of ["UP", "DOWN"] as Side[]) {
      if (mine.some((d) => d.creatorSide === side)) continue;

      const wanted = side === "UP" ? mid - HALF_SPREAD : mid + HALF_SPREAD;
      const limit =
        side === "UP" ? Number(band.maxUpForUp) / one : Number(band.minUpForDown) / one;
      const upProbability =
        side === "UP" ? Math.min(wanted, limit) : Math.max(wanted, limit);
      if (upProbability <= 0.02 || upProbability >= 0.98) continue;

      const raw = BigInt(Math.round(upProbability * one));
      if (!canRest(side, raw, band)) continue;

      try {
        const res = await createDuel({
          privateKey: key,
          marketId: market.marketId,
          side,
          pot: POT,
          upProbability,
          gas: GAS.order,
        });
        placed += 1;
        console.log(
          `+ ${marketLabel(market.asset, market.intervalSec)} ${side} @ ${upProbability.toFixed(3)} — order ${res.orderId}`,
        );
      } catch (err) {
        console.log(
          `! ${marketLabel(market.asset, market.intervalSec)} ${side}: ${String(err).slice(0, 90)}`,
        );
      }
    }
  }

  console.log(`\nplaced ${placed} duel${placed === 1 ? "" : "s"}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
