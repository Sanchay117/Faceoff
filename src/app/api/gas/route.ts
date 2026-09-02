import { NextResponse } from "next/server";
import { createPublicClient, createWalletClient, http, isAddress, parseEther } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { somniaShannon } from "@somnia-chain/markets-sdk/chains";
import { GAS_DRIP_WEI, GAS_LOW_WATER_WEI, NETWORK } from "@/lib/config";

/**
 * The gas drip.
 *
 * tUSDC mints on demand from the token itself, but STT does not — so Faceoff
 * keeps one funded treasury key server-side and tops up a new burner wallet with
 * just enough gas to play. It is the app's only secret, it can only send native
 * STT, and it never touches a player's positions or collateral.
 *
 * Testnet only. Set TREASURY_PRIVATE_KEY in .env.local.
 */

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const transport = http(NETWORK.httpRpcUrl);
const publicClient = createPublicClient({ chain: somniaShannon, transport });

/** Per-address cooldown, in memory. Enough for a testnet demo; not a shared cache. */
const lastDrip = new Map<string, number>();
const COOLDOWN_MS = 60_000;

export async function POST(request: Request) {
  const key = process.env.TREASURY_PRIVATE_KEY;
  if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) {
    return NextResponse.json(
      {
        ok: false,
        error:
          "No treasury configured. Add TREASURY_PRIVATE_KEY to .env.local and fund it with STT from testnet.somnia.network.",
      },
      { status: 503 },
    );
  }

  let address: string;
  try {
    const body = (await request.json()) as { address?: string };
    address = String(body.address ?? "");
  } catch {
    return NextResponse.json({ ok: false, error: "Bad request body." }, { status: 400 });
  }

  if (!isAddress(address)) {
    return NextResponse.json({ ok: false, error: "Not a valid address." }, { status: 400 });
  }

  const target = address as `0x${string}`;
  const now = Date.now();
  const previous = lastDrip.get(target.toLowerCase()) ?? 0;
  if (now - previous < COOLDOWN_MS) {
    return NextResponse.json(
      { ok: false, error: "Already topped up a moment ago — try again shortly." },
      { status: 429 },
    );
  }

  try {
    // Only top up a wallet that actually needs it, so a returning player does not
    // drain the treasury on every page load.
    const balance = await publicClient.getBalance({ address: target });
    if (balance >= GAS_LOW_WATER_WEI) {
      return NextResponse.json({ ok: true, skipped: true, balance: balance.toString() });
    }

    const account = privateKeyToAccount(key as `0x${string}`);
    const treasury = await publicClient.getBalance({ address: account.address });
    if (treasury < GAS_DRIP_WEI + parseEther("0.01")) {
      return NextResponse.json(
        { ok: false, error: "The gas treasury is empty. Top it up at testnet.somnia.network." },
        { status: 503 },
      );
    }

    const wallet = createWalletClient({ account, chain: somniaShannon, transport });
    const hash = await wallet.sendTransaction({ to: target, value: GAS_DRIP_WEI });
    lastDrip.set(target.toLowerCase(), now);

    return NextResponse.json({ ok: true, hash });
  } catch (err) {
    return NextResponse.json({ ok: false, error: String(err).slice(0, 300) }, { status: 500 });
  }
}
