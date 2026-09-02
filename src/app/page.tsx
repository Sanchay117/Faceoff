"use client";

import Link from "next/link";
import { useCallback } from "react";
import { LoadingBlock } from "@/components/AppShell";
import { DuelCard } from "@/components/DuelCard";
import { LiveBadge } from "@/components/LiveBadge";
import { useWallet } from "@/components/WalletProvider";
import { Banner, Button, Empty, fmtNum } from "@/components/ui";
import { listArena, type ArenaDuel } from "@/lib/duels";
import { useOnChainAdvance } from "@/lib/live";
import { listLiveMarkets } from "@/lib/markets";

export default function ArenaPage() {
  const { burner } = useWallet();

  // Driven by blocks landing, not by a timer: when a duel is opened or taken,
  // this re-reads on the next block instead of up to eight seconds later.
  const read = useCallback(async () => listArena(await listLiveMarkets()), []);
  const { data: duels, error } = useOnChainAdvance<ArenaDuel[]>(read, []);

  const mine = burner?.address.toLowerCase();
  const open = (duels ?? []).filter((d) => d.creator.toLowerCase() !== mine);
  const yours = (duels ?? []).filter((d) => d.creator.toLowerCase() === mine);
  const totalPot = (duels ?? []).reduce((n, d) => n + d.stakes.pot, 0);

  return (
    <div className="space-y-8">
      <Hero />

      {error && <Banner tone="error">{error}</Banner>}

      {duels === null ? (
        <LoadingBlock label="Reading open duels from the order book" />
      ) : (
        <>
          {yours.length > 0 && (
            <section>
              <SectionHead title="Your open challenges" hint="Waiting for someone to take them" />
              <div className="grid gap-3 sm:grid-cols-2">
                {yours.map((d) => (
                  <DuelCard key={`${d.pool}-${d.orderId}`} duel={d} mine />
                ))}
              </div>
            </section>
          )}

          <section>
            <SectionHead
              title="Open duels"
              hint={
                open.length > 0
                  ? `${open.length} live · ${fmtNum(totalPot)} tUSDC on the table`
                  : undefined
              }
              badge={<LiveBadge />}
            />
            {open.length === 0 ? (
              <Empty
                title="No open duels right now"
                body="Be the first. Pick a side, name your odds, and send the link to whoever disagrees with you."
                action={
                  <Link href="/create">
                    <Button>Start a duel</Button>
                  </Link>
                }
              />
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {open.map((d) => (
                  <DuelCard key={`${d.pool}-${d.orderId}`} duel={d} />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      <HowItWorks />
    </div>
  );
}

function SectionHead({
  title,
  hint,
  badge,
}: {
  title: string;
  hint?: string;
  badge?: React.ReactNode;
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
      <div className="flex items-center gap-2">
        {hint && <span className="text-xs tabular text-faint">{hint}</span>}
        {badge}
      </div>
    </div>
  );
}

function Hero() {
  const { burner, start, busy, status } = useWallet();

  return (
    <section className="card relative overflow-hidden px-6 py-10 sm:px-10 sm:py-14">
      <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-brand/10 blur-3xl" />
      <div className="relative max-w-xl">
        <div className="inline-flex items-center gap-2 rounded-full border border-line-bright bg-surface-2 px-3 py-1 text-[0.7rem] font-semibold text-muted">
          <span className="size-1.5 rounded-full bg-up pulse-dot" />
          Live on Somnia Shannon testnet
        </div>

        <h1 className="mt-5 text-4xl font-black leading-[1.05] tracking-tight sm:text-5xl">
          Bet a friend
          <br />
          in one link.
        </h1>

        <p className="mt-4 text-[0.95rem] leading-relaxed text-muted">
          Pick a side, name your odds, send the link. Whoever disagrees takes the other end and the
          two of you are matched directly — <span className="text-text">no bookmaker, no house</span>
          , and settled on-chain the moment the window closes.
        </p>

        <div className="mt-7 flex flex-wrap items-center gap-3">
          {burner ? (
            <Link href="/create">
              <Button size="lg">Start a duel</Button>
            </Link>
          ) : (
            <Button size="lg" onClick={() => void start()} loading={busy}>
              {busy ? (status ?? "Setting up…") : "Play — no wallet needed"}
            </Button>
          )}
          <span className="text-xs text-faint">Free testnet money. Nothing to install.</span>
        </div>
      </div>
    </section>
  );
}

function HowItWorks() {
  return (
    <section className="card px-6 py-8 sm:px-8">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted">
        Why this works without a market maker
      </h2>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        Every prediction market has the same cold-start problem: your bet only happens if someone is
        already there to take it. DreamDEX Event Contracts have a way out —{" "}
        <span className="text-text">two buyers on opposite sides need no seller at all.</span> The
        pool takes both stakes, mints a fresh Up/Down pair from the combined collateral, and hands
        each player their side.
      </p>
      <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">
        So Faceoff never needs liquidity. It needs a disagreement. Your $6 and their $4 become a $10
        contract that did not exist a second earlier.
      </p>

      <ol className="mt-6 grid gap-4 sm:grid-cols-4">
        {[
          ["Pick a side", "Up or Down on BTC or ETH, over 5 minutes to a day."],
          ["Name the odds", "You put in $6, they put in $4. Winner takes $10."],
          ["Send the link", "Group chat, DM, anywhere. First to take it is in."],
          ["Auto-settles", "An on-chain oracle resolves the window. Winner claims."],
        ].map(([title, body], i) => (
          <li key={title}>
            <div className="text-xs font-black text-brand">0{i + 1}</div>
            <div className="mt-1 text-sm font-bold">{title}</div>
            <div className="mt-1 text-xs leading-relaxed text-faint">{body}</div>
          </li>
        ))}
      </ol>
    </section>
  );
}
