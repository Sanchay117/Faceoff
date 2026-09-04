/**
 * Withdraw every order this wallet has resting, across every live window.
 *
 * Seeding the Arena so it does not look empty has a cost: those orders sit on
 * the same books a real duel is created on, and a post-only that would cross one
 * of them is rejected. So the thing that makes the Arena look alive can be
 * exactly what stops someone opening a challenge.
 *
 * This clears our own side of that. Escrow returns to the wallet in full.
 *
 *   npm run clear
 */

import { privateKeyToAccount } from "viem/accounts";
import { cancelDuel, listOpenDuels } from "../src/lib/duels";
import { listLiveMarkets, loadMarket, marketLabel } from "../src/lib/markets";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may already be set */
}

async function main() {
  const key = process.env.PACEMAKER_PRIVATE_KEY as `0x${string}` | undefined;
  if (!key) throw new Error("Set PACEMAKER_PRIVATE_KEY in .env.local");
  const me = privateKeyToAccount(key).address.toLowerCase();

  let cancelled = 0;
  let failed = 0;

  for (const row of await listLiveMarkets()) {
    const market = await loadMarket(row.marketId);
    const duels = await listOpenDuels(market.marketId, market.pool);
    const mine = duels.filter((d) => d.creator.toLowerCase() === me);

    for (const d of mine) {
      try {
        await cancelDuel({ privateKey: key, pool: d.pool, orderId: d.orderId });
        cancelled += 1;
        console.log(`- ${marketLabel(market.asset, market.intervalSec)} ${d.creatorSide} — ${d.orderId}`);
      } catch (err) {
        failed += 1;
        console.log(`! ${marketLabel(market.asset, market.intervalSec)} ${d.orderId}: ${String(err).slice(0, 80)}`);
      }
    }
  }

  console.log(`\nwithdrew ${cancelled} order${cancelled === 1 ? "" : "s"}${failed ? `, ${failed} failed` : ""}`);
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
