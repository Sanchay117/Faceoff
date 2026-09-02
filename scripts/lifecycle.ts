/**
 * End-to-end proof, headless.
 *
 * Runs a whole duel between two fresh wallets against live Shannon testnet:
 *
 *   fund both → A opens a duel (post-only, tagged) → the duel is discoverable
 *   on-chain from its tag alone → B takes the other side → the pool MINTS A
 *   PAIR → both hold opposite outcome tokens on the same market.
 *
 * Every claim is checked against chain state rather than against what we asked
 * for. Run with:  npm run lifecycle
 */

import { createPublicClient, createWalletClient, formatEther, http, parseEther } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { COLLATERAL } from "../src/lib/account";
import { NETWORK } from "../src/lib/config";
import { acceptDuel, createDuel, getDuel, listOpenDuels, stakesFor } from "../src/lib/duels";
import { readExchange, signerExchangeFor } from "../src/lib/exchange";
import { listLiveMarkets, loadMarket, STATUS } from "../src/lib/markets";

try {
  process.loadEnvFile(".env.local");
} catch {
  /* fall back to whatever is already in the environment */
}

const GAS_PER_PLAYER = parseEther("0.05");
const FAUCET_AMOUNT = 1_000n * 10n ** 6n; // 1,000 tUSDC (6dp on Shannon)

const transport = http(NETWORK.httpRpcUrl);
const pub = createPublicClient({ chain: somniaShannon, transport });

const ALICE_KEY = generatePrivateKey();
const BOB_KEY = generatePrivateKey();
const alice = privateKeyToAccount(ALICE_KEY);
const bob = privateKeyToAccount(BOB_KEY);

function log(step: string, detail?: unknown) {
  console.log(`\n\x1b[1m▸ ${step}\x1b[0m`);
  if (detail !== undefined) console.log(detail);
}

function money(raw: bigint, decimals: number): string {
  return (Number(raw) / 10 ** decimals).toFixed(4);
}

async function main() {
  const treasuryKey = process.env.TREASURY_PRIVATE_KEY;
  if (!treasuryKey || !/^0x[0-9a-fA-F]{64}$/.test(treasuryKey)) {
    throw new Error("Set TREASURY_PRIVATE_KEY in .env.local (see .env.example).");
  }

  const treasury = privateKeyToAccount(treasuryKey as `0x${string}`);
  const treasuryBalance = await pub.getBalance({ address: treasury.address });
  log("Treasury", { address: treasury.address, stt: formatEther(treasuryBalance) });

  if (treasuryBalance < GAS_PER_PLAYER * 2n + parseEther("0.01")) {
    throw new Error(
      `Treasury needs more STT. Fund ${treasury.address} at https://testnet.somnia.network`,
    );
  }

  const wallet = createWalletClient({ account: treasury, chain: somniaShannon, transport });
  const client = readExchange().client;

  log("Players (fresh every run)", { alice: alice.address, bob: bob.address });

  log("Funding gas");
  for (const p of [alice, bob]) {
    const hash = await wallet.sendTransaction({ to: p.address, value: GAS_PER_PLAYER });
    await pub.waitForTransactionReceipt({ hash });
    console.log(`  ${p.address} ← ${formatEther(GAS_PER_PLAYER)} STT`);
  }

  log("Minting play collateral from the token's own faucet()");
  for (const [name, key, account] of [
    ["alice", ALICE_KEY, alice],
    ["bob", BOB_KEY, bob],
  ] as const) {
    await signerExchangeFor(key).trader.faucet({ amount: FAUCET_AMOUNT });
    const bal = await client.getErc20Balance(COLLATERAL, account.address);
    console.log(`  ${name}: ${money(bal, 6)} tUSDC`);
  }

  // Pick a window with real runway so the test never races the clock.
  const markets = await listLiveMarkets();
  const target = markets.find((m) => m.intervalSec >= 900) ?? markets[0];
  if (!target) throw new Error("No live markets on the venue.");

  const market = await loadMarket(target.marketId);
  log("Chosen window", {
    market: `${market.asset} ${market.intervalSec / 60}m`,
    marketId: market.marketId,
    pool: market.pool,
    status: market.status === STATUS.Trading ? "Trading (1)" : market.status,
    minutesLeft: Math.round((market.expiry - Date.now() / 1000) / 60),
    decimals: market.grid.decimals,
    tick: market.grid.tickSize.toString(),
    lot: market.grid.lotSize.toString(),
  });

  const beforeA = await client.getErc20Balance(COLLATERAL, alice.address);
  const beforeB = await client.getErc20Balance(COLLATERAL, bob.address);

  log("Alice opens a duel — backs UP, 60% confident, pot of 10");
  const created = await createDuel({
    privateKey: ALICE_KEY,
    marketId: market.marketId,
    side: "UP",
    pot: 10,
    upProbability: 0.6,
  });
  console.log({
    orderId: created.orderId.toString(),
    aliceStake: money(created.stake, market.grid.decimals),
    tx: `${NETWORK.explorer}/tx/${created.hash}`,
  });

  log("Discoverable on-chain from the Faceoff tag alone — no database anywhere");
  const discovered = await listOpenDuels(market.marketId, market.pool);
  const found = discovered.find((d) => d.orderId === created.orderId);
  if (!found) throw new Error("FAIL: the tagged duel was not found on the book.");
  const stakes = stakesFor(found, market.grid);
  console.log({
    creator: found.creator,
    creatorSide: found.creatorSide,
    duelNonce: found.nonce,
    pot: stakes.pot,
    creatorStake: stakes.creatorStake,
    takerStake: stakes.takerStake,
    impliedUpProbability: stakes.upProbability,
    otherFaceoffDuelsOnThisBook: discovered.length - 1,
  });

  log("Bob takes the other side");
  const accepted = await acceptDuel({
    privateKey: BOB_KEY,
    marketId: market.marketId,
    orderId: created.orderId,
  });
  console.log({
    side: accepted.side,
    filled: money(accepted.filledQuantity, market.grid.decimals),
    avgFillPrice: money(accepted.avgPrice, market.grid.decimals),
    tx: `${NETWORK.explorer}/tx/${accepted.hash}`,
  });

  log("The resting duel is consumed");
  const after = await getDuel(market.marketId, market.pool, created.orderId);
  console.log(after === null ? "  ✓ no longer on the book" : "  ✗ still resting");

  log("Positions — did the pool mint a pair out of nothing?");
  const d = market.grid.decimals;
  const balance = (account: `0x${string}`, id: bigint) =>
    client.getOutcomeBalance({ outcomeToken: market.outcomeToken, account, id });

  const [aUp, aDown, bUp, bDown] = await Promise.all([
    balance(alice.address, market.yesId),
    balance(alice.address, market.noId),
    balance(bob.address, market.yesId),
    balance(bob.address, market.noId),
  ]);
  console.table({
    alice: { UP: money(aUp, d), DOWN: money(aDown, d) },
    bob: { UP: money(bUp, d), DOWN: money(bDown, d) },
  });

  const afterA = await client.getErc20Balance(COLLATERAL, alice.address);
  const afterB = await client.getErc20Balance(COLLATERAL, bob.address);
  log("Collateral each player actually paid");
  console.table({
    alice: { paid: money(beforeA - afterA, d), expected: stakes.creatorStake.toFixed(4) },
    bob: { paid: money(beforeB - afterB, d), expected: stakes.takerStake.toFixed(4) },
  });

  const checks = {
    "alice holds UP": aUp > 0n,
    "bob holds DOWN": bDown > 0n,
    "alice holds no DOWN": aDown === 0n,
    "bob holds no UP": bUp === 0n,
    "order consumed": after === null,
    "alice paid her stake": beforeA - afterA > 0n,
    "bob paid his stake": beforeB - afterB > 0n,
    "stakes sum to the pot": Number(beforeA - afterA + (beforeB - afterB)) / 10 ** d === stakes.pot,
  };

  log("Checks");
  console.table(checks);

  const ok = Object.values(checks).every(Boolean);
  console.log(
    ok
      ? "\n\x1b[32m✓ PASS — two buyers, no seller, no market maker. The pool minted the pair.\x1b[0m"
      : "\n\x1b[31m✗ FAIL — see the tables above.\x1b[0m",
  );
  process.exit(ok ? 0 : 1);
}

main().catch((err) => {
  console.error("\n\x1b[31mFAILED\x1b[0m", err);
  process.exit(1);
});
