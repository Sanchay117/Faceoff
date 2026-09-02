"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { claimCollateral, getBalances, requestGas, type Balances } from "@/lib/account";
import { getOrCreateBurner, loadBurner, clearBurner, type Burner } from "@/lib/wallet";

interface WalletContextValue {
  burner: Burner | null;
  balances: Balances | null;
  /** Funded enough to place a duel. */
  ready: boolean;
  /** Mid-onboarding message, shown verbatim. */
  status: string | null;
  busy: boolean;
  error: string | null;
  /** Create a wallet if needed, then fund it with gas and play collateral. */
  start: () => Promise<void>;
  refresh: () => Promise<void>;
  topUp: () => Promise<void>;
  reset: () => void;
}

const WalletContext = createContext<WalletContextValue | null>(null);

const MIN_GAS = 5_000_000_000_000_000n; // 0.005 STT — enough for a handful of orders

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const [burner, setBurner] = useState<Burner | null>(null);
  const [balances, setBalances] = useState<Balances | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    setBurner(loadBurner());
    return () => {
      mounted.current = false;
    };
  }, []);

  const refresh = useCallback(async () => {
    const b = loadBurner();
    if (!b) return;
    try {
      const next = await getBalances(b.address);
      if (mounted.current) setBalances(next);
    } catch {
      /* a failed balance poll is not worth surfacing; the next tick retries */
    }
  }, []);

  // Poll balances while a wallet exists, so a fill or a payout shows up on its own.
  useEffect(() => {
    if (!burner) return;
    void refresh();
    const id = setInterval(refresh, 6000);
    return () => clearInterval(id);
  }, [burner, refresh]);

  const start = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setStatus("Creating your wallet…");
      const b = getOrCreateBurner();
      setBurner(b);

      let current = await getBalances(b.address);

      if (current.gas < MIN_GAS) {
        setStatus("Sending you gas…");
        const gas = await requestGas(b.address);
        if (!gas.ok && !gas.hash) throw new Error(gas.error ?? "Could not send gas.");

        // The drip route returns as soon as the transaction is sent. Wait for the
        // balance to actually land before spending it on a faucet call.
        for (let i = 0; i < 20 && current.gas < MIN_GAS; i++) {
          await sleep(1000);
          current = await getBalances(b.address);
        }
        if (current.gas < MIN_GAS) throw new Error("Gas did not arrive. Try again in a moment.");
      }

      if (current.collateral === 0n) {
        setStatus("Minting your play money…");
        await claimCollateral(b.privateKey);
        current = await getBalances(b.address);
      }

      if (mounted.current) {
        setBalances(current);
        setStatus(null);
      }
    } catch (err) {
      if (mounted.current) setError(cleanError(err));
    } finally {
      if (mounted.current) {
        setBusy(false);
        setStatus(null);
      }
    }
  }, []);

  const topUp = useCallback(async () => {
    const b = loadBurner();
    if (!b) return;
    setBusy(true);
    setError(null);
    try {
      setStatus("Minting more tUSDC…");
      if ((await getBalances(b.address)).gas < MIN_GAS) await requestGas(b.address);
      await claimCollateral(b.privateKey);
      await refresh();
    } catch (err) {
      setError(cleanError(err));
    } finally {
      setBusy(false);
      setStatus(null);
    }
  }, [refresh]);

  const reset = useCallback(() => {
    clearBurner();
    setBurner(null);
    setBalances(null);
  }, []);

  const ready = Boolean(burner && balances && balances.gas >= MIN_GAS && balances.collateral > 0n);

  return (
    <WalletContext.Provider
      value={{ burner, balances, ready, status, busy, error, start, refresh, topUp, reset }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet(): WalletContextValue {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error("useWallet must be used inside <WalletProvider>");
  return ctx;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export function cleanError(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    return String((err as { message: unknown }).message).slice(0, 240);
  }
  return String(err).replace(/^Error:\s*/, "").slice(0, 240);
}
