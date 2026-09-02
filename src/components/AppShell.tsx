"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { COLLATERAL_DECIMALS } from "@/lib/account";
import { displayName, shortAddress } from "@/lib/wallet";
import { useWallet } from "./WalletProvider";
import { Button, NavLink, Spinner, fmt } from "./ui";

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col px-4 pb-24 sm:px-6">
      <header className="flex items-center justify-between gap-3 py-5">
        <Link href="/" className="group flex items-center gap-2.5">
          <Logo />
          <span className="text-lg font-black tracking-tight">FACEOFF</span>
        </Link>

        <nav className="hidden items-center gap-1 sm:flex">
          <NavLink href="/" active={path === "/"}>
            Arena
          </NavLink>
          <NavLink href="/me" active={path === "/me"}>
            My duels
          </NavLink>
        </nav>

        <WalletChip />
      </header>

      <div className="flex-1">{children}</div>

      {/* Mobile tab bar — this is a phone-first product. */}
      <nav className="fixed inset-x-0 bottom-0 z-20 flex justify-center border-t border-line bg-ink/95 py-2 backdrop-blur sm:hidden">
        <div className="flex w-full max-w-5xl items-center justify-around">
          <MobileTab href="/" active={path === "/"} label="Arena" icon="⚔" />
          <MobileTab href="/create" active={path === "/create"} label="New duel" icon="＋" />
          <MobileTab href="/me" active={path === "/me"} label="My duels" icon="◆" />
        </div>
      </nav>
    </div>
  );
}

function MobileTab({
  href,
  active,
  label,
  icon,
}: {
  href: string;
  active: boolean;
  label: string;
  icon: string;
}) {
  return (
    <Link
      href={href}
      className={`flex flex-col items-center gap-0.5 px-4 py-1 text-[0.68rem] font-semibold ${
        active ? "text-text" : "text-faint"
      }`}
    >
      <span className="text-base leading-none">{icon}</span>
      {label}
    </Link>
  );
}

function Logo() {
  return (
    <span className="relative flex size-8 items-center justify-center overflow-hidden rounded-lg border border-line-bright">
      <span className="absolute inset-x-0 top-0 h-1/2 bg-up/85" />
      <span className="absolute inset-x-0 bottom-0 h-1/2 bg-down/85" />
      <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink" />
    </span>
  );
}

function WalletChip() {
  const { burner, balances, busy, status, start } = useWallet();
  const [open, setOpen] = useState(false);

  if (!burner) {
    return (
      <Button size="sm" onClick={() => void start()} loading={busy}>
        {busy ? (status ?? "Setting up…") : "Start playing"}
      </Button>
    );
  }

  const funded = balances && balances.collateral > 0n;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 rounded-xl border border-line bg-surface px-3 py-2 text-left transition hover:border-line-bright"
      >
        <span className="grid size-7 place-items-center rounded-lg bg-brand-dim text-xs font-bold text-brand">
          {displayName(burner.address).slice(0, 2).toUpperCase()}
        </span>
        <span className="hidden leading-tight sm:block">
          <span className="block text-xs font-semibold">{displayName(burner.address)}</span>
          <span className="block text-[0.7rem] tabular text-muted">
            {balances ? `${fmt(balances.collateral, COLLATERAL_DECIMALS)} tUSDC` : "…"}
          </span>
        </span>
        <span className="tabular text-xs font-semibold sm:hidden">
          {balances ? fmt(balances.collateral, COLLATERAL_DECIMALS, 0) : "…"}
        </span>
      </button>

      {open && (
        <WalletMenu
          onClose={() => setOpen(false)}
          address={burner.address}
          funded={Boolean(funded)}
        />
      )}
    </div>
  );
}

function WalletMenu({
  onClose,
  address,
  funded,
}: {
  onClose: () => void;
  address: `0x${string}`;
  funded: boolean;
}) {
  const { balances, topUp, busy, status, reset, error } = useWallet();

  return (
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} />
      <div className="card absolute right-0 z-40 mt-2 w-72 p-4 shadow-2xl rise">
        <div className="text-xs font-semibold uppercase tracking-wider text-faint">
          Your testnet wallet
        </div>
        <div className="mt-1 font-mono text-xs text-muted">{shortAddress(address)}</div>

        <dl className="mt-3 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted">Play money</dt>
            <dd className="tabular font-semibold">
              {balances ? `${fmt(balances.collateral, COLLATERAL_DECIMALS)} tUSDC` : "…"}
            </dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted">Gas</dt>
            <dd className="tabular font-semibold">
              {balances ? `${fmt(balances.gas, 18, 3)} STT` : "…"}
            </dd>
          </div>
        </dl>

        {error && <p className="mt-3 text-xs text-down">{error}</p>}

        <div className="mt-4 flex flex-col gap-2">
          <Button size="sm" variant="ghost" onClick={() => void topUp()} loading={busy}>
            {busy ? (status ?? "Working…") : funded ? "Get more tUSDC" : "Fund wallet"}
          </Button>
          <button
            className="text-left text-xs text-faint hover:text-down"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            Reset wallet
          </button>
        </div>

        <p className="mt-3 border-t border-line pt-3 text-[0.68rem] leading-relaxed text-faint">
          A burner key kept in this browser, funded with testnet play money. Never use it for real
          funds.
        </p>
      </div>
    </>
  );
}

export function LoadingBlock({ label = "Loading" }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted">
      <Spinner /> {label}…
    </div>
  );
}
