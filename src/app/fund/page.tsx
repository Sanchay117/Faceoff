"use client";

import { useEffect, useState } from "react";
import { Banner, Button, Spinner, TxLink } from "@/components/ui";
import { NETWORK } from "@/lib/config";

/**
 * Top up the gas treasury from a browser wallet.
 *
 * Faceoff funds its players' gas from one treasury key, and that treasury has
 * to be topped up by a human with a faucet claim. Doing that by hand means
 * finding the right network in a wallet UI that hides testnets by default,
 * which is a genuinely annoying five minutes.
 *
 * So this page does it: it asks the wallet to add-and-switch to Shannon itself
 * (`wallet_addEthereumChain` is add-or-switch, and we fall back to an explicit
 * switch), then sends. No settings to hunt for.
 */

const CHAIN_ID_HEX = `0x${NETWORK.chainId.toString(16)}`;

interface Eip1193 {
  request(args: { method: string; params?: unknown[] }): Promise<unknown>;
}

function wallet(): Eip1193 | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { ethereum?: Eip1193 }).ethereum ?? null;
}

export default function FundPage() {
  const [treasury, setTreasury] = useState<string | null>(null);
  const [balance, setBalance] = useState<string | null>(null);
  const [account, setAccount] = useState<string | null>(null);
  const [amount, setAmount] = useState("0.9");
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState<string | null>(null);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTreasury = () => {
    void fetch("/api/gas")
      .then((r) => r.json())
      .then((d: { address?: string; balance?: string | null; error?: string }) => {
        if (d.address) setTreasury(d.address);
        setBalance(d.balance ?? null);
        if (d.error) setError(d.error);
      })
      .catch(() => setError("Could not reach the app's treasury endpoint."));
  };

  useEffect(loadTreasury, []);

  async function send() {
    const eth = wallet();
    if (!eth) {
      setError("No browser wallet found. Install MetaMask, or use a browser where it's enabled.");
      return;
    }
    if (!treasury) return;

    setBusy(true);
    setError(null);
    setHash(null);

    try {
      setStep("Connecting…");
      const accounts = (await eth.request({ method: "eth_requestAccounts" })) as string[];
      const from = accounts?.[0];
      if (!from) throw new Error("No account was shared.");
      setAccount(from);

      setStep("Switching to Somnia Shannon…");
      try {
        // add-or-switch in one call; this is what makes the network appear even
        // when the wallet is hiding testnets in its own UI.
        await eth.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: CHAIN_ID_HEX,
              chainName: "Somnia Testnet",
              nativeCurrency: { name: "Somnia Test Token", symbol: "STT", decimals: 18 },
              rpcUrls: [NETWORK.httpRpcUrl],
              blockExplorerUrls: [NETWORK.explorer],
            },
          ],
        });
      } catch {
        // Already known to the wallet — just switch.
        await eth.request({
          method: "wallet_switchEthereumChain",
          params: [{ chainId: CHAIN_ID_HEX }],
        });
      }

      setStep("Confirm in your wallet…");
      const value = BigInt(Math.round(Number(amount) * 1e18));
      const txHash = (await eth.request({
        method: "eth_sendTransaction",
        params: [{ from, to: treasury, value: `0x${value.toString(16)}` }],
      })) as string;

      setHash(txHash);
      setStep(null);
      setTimeout(loadTreasury, 4000);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message.slice(0, 220));
      setStep(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md space-y-5 py-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Top up the gas tank</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Faceoff pays every new player&apos;s gas so they never have to find a faucet. This tops up
          the wallet it pays from. Testnet STT only — it has no value.
        </p>
      </div>

      <div className="card space-y-3 p-5">
        <div>
          <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
            Treasury
          </div>
          {treasury ? (
            <a
              href={`${NETWORK.explorer}/address/${treasury}`}
              target="_blank"
              rel="noreferrer"
              className="break-all font-mono text-xs text-brand hover:underline"
            >
              {treasury}
            </a>
          ) : (
            <div className="flex items-center gap-2 text-xs text-faint">
              <Spinner /> loading…
            </div>
          )}
          {balance !== null && (
            <div className="mt-1 tabular text-sm font-bold">
              {(Number(balance) / 1e18).toFixed(4)} STT
            </div>
          )}
        </div>

        <div>
          <label
            htmlFor="amount"
            className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint"
          >
            Amount to send
          </label>
          <div className="mt-1 flex items-center gap-2">
            <input
              id="amount"
              type="number"
              step="0.1"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-32 rounded-lg border border-line bg-surface-2 px-3 py-2 text-sm font-bold tabular outline-none focus:border-brand"
            />
            <span className="text-sm font-semibold text-muted">STT</span>
          </div>
          <p className="mt-1.5 text-xs text-faint">
            Leave a little behind so you can still transact.
          </p>
        </div>

        <Button className="w-full" size="lg" onClick={() => void send()} loading={busy} disabled={!treasury}>
          {busy ? (step ?? "Working…") : "Connect wallet and send"}
        </Button>

        {account && !busy && (
          <p className="text-center font-mono text-[0.7rem] text-faint">from {account}</p>
        )}
      </div>

      {error && <Banner tone="error">{error}</Banner>}

      {hash && (
        <Banner tone="success">
          Sent. <TxLink hash={hash} /> — the balance above updates in a few seconds.
        </Banner>
      )}

      <p className="text-xs leading-relaxed text-faint">
        This page never sees a private key. Your wallet signs the transfer, and the treasury key
        lives server-side where it can only send gas — it cannot place orders or touch positions.
      </p>
    </div>
  );
}
