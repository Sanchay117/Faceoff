/**
 * Which window should I demo on?
 *
 * Prints, per live market, the confidence range that keeps a duel at the front
 * of its own queue — the only odds at which the person you send the link to
 * actually matches YOU rather than a better-priced order already resting.
 *
 *   npm run windows
 */
import { confidenceRange, restBand } from "../src/lib/duels";
import { listLiveMarkets, loadMarket, marketLabel } from "../src/lib/markets";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* env may already be set */
}

async function main() {
  const rows = await listLiveMarkets();
  console.log("market            closes   back UP      back DOWN");
  for (const row of rows) {
    const m = await loadMarket(row.marketId);
    const band = await restBand(m);
    const up = confidenceRange("UP", band, m.grid.decimals);
    const dn = confidenceRange("DOWN", band, m.grid.decimals);
    const mins = Math.round((m.expiry - Date.now() / 1000) / 60);
    const fmt = (r: { min: number; max: number; canLead: boolean }) =>
      r.canLead ? `${r.min}-${r.max}%`.padEnd(11) : "crowded".padEnd(11);
    console.log(
      marketLabel(m.asset, m.intervalSec).padEnd(17),
      `${mins}m`.padStart(6),
      " ",
      fmt(up),
      " ",
      fmt(dn),
    );
  }
  console.log("\nPick a market showing a range, not 'crowded' — that is where your duel can lead its queue.");
  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
