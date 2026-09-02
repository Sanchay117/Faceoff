import { SOMNIA_TESTNET_ADDRESSES } from "@somnia-chain/markets-sdk";
import { GAS } from "./config";
import { readExchange, signerExchangeFor } from "./exchange";

export const COLLATERAL = SOMNIA_TESTNET_ADDRESSES.collateral as `0x${string}`;
/** Shannon's tUSDC faucet token is 6dp. Read, never assumed, for anything priced. */
export const COLLATERAL_DECIMALS = 6;

export interface Balances {
  /** tUSDC, raw units. */
  collateral: bigint;
  /** STT for gas, wei. */
  gas: bigint;
}

export async function getBalances(address: `0x${string}`): Promise<Balances> {
  const ex = readExchange();
  const [collateral, gas] = await Promise.all([
    ex.client.getErc20Balance(COLLATERAL, address),
    ex.client.getNativeBalance(address),
  ]);
  return { collateral, gas };
}

/**
 * Mint play collateral.
 *
 * There is no faucet website for tUSDC — the testnet token mints on demand and
 * credits `msg.sender`, capped at 10,000 per call. So a new player funds
 * themselves from inside the app, in one transaction, and never leaves to go
 * find a faucet.
 */
export async function claimCollateral(
  privateKey: `0x${string}`,
  amount?: bigint,
): Promise<{ hash: string }> {
  const ex = signerExchangeFor(privateKey);
  const res = await ex.trader.faucet(
    amount ? { amount, gas: GAS.faucet } : { gas: GAS.faucet },
  );
  return { hash: res.hash };
}

/**
 * Ask the app to cover gas.
 *
 * STT cannot be minted on demand the way tUSDC can, so the app keeps one funded
 * treasury key server-side and drips a small amount to a new burner. That is the
 * only server-side secret Faceoff has, and it can only ever send gas.
 */
export async function requestGas(address: `0x${string}`): Promise<{ ok: boolean; hash?: string; error?: string }> {
  try {
    const res = await fetch("/api/gas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    return (await res.json()) as { ok: boolean; hash?: string; error?: string };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}
