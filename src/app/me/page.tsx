"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { isBinaryMarket } from "@somnia-chain/markets-sdk";
import { useLiveMarkets, useWatchUser } from "@somnia-chain/markets-sdk/react";
import { LoadingBlock } from "@/components/AppShell";
import { LiveBadge } from "@/components/LiveBadge";
import { cleanError, useWallet } from "@/components/WalletProvider";
import { Banner, Button, Countdown, Empty, SidePill, Stat, TxLink, fmt } from "@/components/ui";
import { COLLATERAL_DECIMALS, ensureGas } from "@/lib/account";
import { useOnChainAdvance } from "@/lib/live";
import { marketLabel } from "@/lib/markets";
import {
  applyLiveStatus,
  claimAll,
  claimablePositions,
  livePositions,
  loadPositions,
  totalPayout,
  type Position,
} from "@/lib/settlement";

export default function MePage() {
  const { burner, start, busy: walletBusy, refresh } = useWallet();
  const [claiming, setClaiming] = useState(false);
  const [claimed, setClaimed] = useState<{ hash: string; claimed: number; total: bigint } | null>(
    null,
  );
  const [claimError, setClaimError] = useState<string | null>(null);

  // Hydrate and hold this wallet's order/fill history while mounted.
  useWatchUser(burner?.address);

  const read = useCallback(
    async () => (burner ? loadPositions(burner.address) : []),
    [burner],
  );
  const { data: raw, error, refresh: reread } = useOnChainAdvance<Position[]>(read, [
    burner?.address ?? "",
  ]);

  // The settlement watcher: chain-current market state overlaid on the indexer's
  // portfolio, so a result lands the moment the oracle answer does.
  const liveMarkets = useLiveMarkets();
  const liveById = useMemo(() => {
    const map = new Map<
      string,
      { status?: unknown; winningOutcome?: number | null; voided?: boolean }
    >();
    for (const m of liveMarkets) {
      if (!isBinaryMarket(m)) continue;
      if (m.marketId) map.set(m.marketId.toLowerCase(), m);
    }
    return map;
  }, [liveMarkets]);

  const positions = useMemo(
    () => (raw ?? []).map((p) => applyLiveStatus(p, liveById.get(p.marketId.toLowerCase()))),
    [raw, liveById],
  );

  const justSettled = useJustSettled(positions);

  async function claim() {
    if (!burner) return;
    setClaiming(true);
    setClaimError(null);
    try {
      await ensureGas(burner.address);
      const res = await claimAll(burner.privateKey, positions);
      if (res) setClaimed(res);
      reread();
      void refresh();
    } catch (err) {
      setClaimError(cleanError(err));
    } finally {
      setClaiming(false);
    }
  }

  if (!burner) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-black">No wallet yet</h1>
        <p className="mt-2 text-sm text-muted">Set one up and your duels will show here.</p>
        <Button className="mt-6" size="lg" onClick={() => void start()} loading={walletBusy}>
          Set me up
        </Button>
      </div>
    );
  }

  if (!raw) return <LoadingBlock label="Loading your duels" />;

  const live = livePositions(positions);
  const claimable = claimablePositions(positions);
  const settled = positions.filter((p) => p.settled);
  const owed = totalPayout(claimable);
  const atRisk = live.reduce((n, p) => n + p.balance, 0n);
  const record = settled.reduce(
    (acc, p) => {
      if (p.voided) acc.voided += 1;
      else if (p.won) acc.won += 1;
      else acc.lost += 1;
      return acc;
    },
    { won: 0, lost: 0, voided: 0 },
  );

  return (
    <div className="space-y-6 pb-10">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-3xl font-black tracking-tight">My duels</h1>
        <LiveBadge />
      </div>

      {justSettled && (
        <Banner tone={justSettled.won ? "success" : "info"}>
          {justSettled.won ? (
            <>
              <strong>{marketLabel(justSettled.asset, justSettled.intervalSec)} just settled —
              you won {fmt(justSettled.payout, justSettled.decimals)} tUSDC.</strong>{" "}
              Claim it below.
            </>
          ) : (
            <>
              {marketLabel(justSettled.asset, justSettled.intervalSec)} just settled. Your{" "}
              {justSettled.side} side didn&apos;t land this time.
            </>
          )}
        </Banner>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Stat
          label="Riding on live windows"
          value={fmt(atRisk, COLLATERAL_DECIMALS)}
          hint="tUSDC you'd collect if every open duel lands"
        />
        <Stat
          label="Ready to claim"
          value={fmt(owed, COLLATERAL_DECIMALS)}
          tone={owed > 0n ? "gold" : "default"}
          hint={claimable.length > 0 ? `${claimable.length} settled` : "Nothing waiting"}
        />
        <Stat
          label="Record"
          value={`${record.won}–${record.lost}`}
          hint={record.voided > 0 ? `${record.voided} voided` : "Won–lost"}
        />
      </div>

      {(error || claimError) && <Banner tone="error">{claimError ?? error}</Banner>}

      {claimed && (
        <Banner tone="success">
          Claimed {fmt(claimed.total, COLLATERAL_DECIMALS)} tUSDC from {claimed.claimed} duel
          {claimed.claimed === 1 ? "" : "s"} in one transaction. <TxLink hash={claimed.hash} />
        </Banner>
      )}

      {claimable.length > 0 && (
        <div className="card flex flex-wrap items-center justify-between gap-4 border-gold/40 p-5">
          <div>
            <div className="tabular text-lg font-black text-gold">
              {fmt(owed, COLLATERAL_DECIMALS)} tUSDC waiting
            </div>
            <p className="mt-0.5 text-xs text-muted">
              {claimable.length} settled duel{claimable.length === 1 ? "" : "s"} — collected in a
              single transaction.
            </p>
          </div>
          <Button onClick={() => void claim()} loading={claiming}>
            {claiming ? "Claiming…" : "Claim all"}
          </Button>
        </div>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">In play</h2>
        {live.length === 0 ? (
          <Empty
            title="Nothing riding right now"
            body="Take a duel from the Arena, or start your own and send the link."
            action={
              <Link href="/create">
                <Button>Start a duel</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {live.map((p) => (
              <PositionRow key={`${p.marketId}-${p.outcomeIndex}`} position={p} />
            ))}
          </div>
        )}
      </section>

      {settled.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-muted">Settled</h2>
          <div className="space-y-2">
            {settled.slice(0, 25).map((p) => (
              <PositionRow key={`${p.marketId}-${p.outcomeIndex}`} position={p} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

/**
 * Notice the moment a position crosses from in-play to settled.
 *
 * Because the live store carries resolution from chain events, this fires while
 * the player is still looking at the screen — the duel settles itself in front
 * of them rather than appearing already-decided on a later visit.
 */
function useJustSettled(positions: Position[]): Position | null {
  const seen = useRef<Map<string, boolean> | null>(null);
  const [event, setEvent] = useState<Position | null>(null);

  useEffect(() => {
    const key = (p: Position) => `${p.marketId}-${p.outcomeIndex}`;

    if (seen.current === null) {
      // First pass just records the baseline; anything already settled when the
      // page opened is history, not news.
      seen.current = new Map(positions.map((p) => [key(p), p.settled]));
      return;
    }

    for (const p of positions) {
      const was = seen.current.get(key(p));
      if (was === false && p.settled) {
        setEvent(p);
        const timer = setTimeout(() => setEvent(null), 15000);
        seen.current.set(key(p), true);
        return () => clearTimeout(timer);
      }
      seen.current.set(key(p), p.settled);
    }
  }, [positions]);

  return event;
}

function PositionRow({ position: p }: { position: Position }) {
  const outcome = !p.settled
    ? null
    : p.voided
      ? { label: "Voided", tone: "text-muted" }
      : p.won
        ? { label: "Won", tone: "text-up" }
        : { label: "Lost", tone: "text-faint" };

  return (
    <div className="card flex items-center justify-between gap-3 p-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <SidePill side={p.side} size="sm" />
          <span className="truncate text-sm font-bold">{marketLabel(p.asset, p.intervalSec)}</span>
        </div>
        <div className="mt-1 text-xs text-muted">
          {p.settled ? (
            <span className={outcome?.tone}>
              {outcome?.label}
              {p.voided && " — both sides refunded half"}
            </span>
          ) : (
            <>
              settles in <Countdown to={p.expiry} />
            </>
          )}
        </div>
      </div>

      <div className="shrink-0 text-right">
        <div
          className={`tabular text-lg font-black ${
            !p.settled ? "text-gold" : p.payout > 0n ? "text-up" : "text-faint"
          }`}
        >
          {p.settled && p.payout === 0n ? "—" : fmt(p.settled ? p.payout : p.balance, p.decimals)}
        </div>
        <div className="text-[0.65rem] uppercase tracking-wider text-faint">
          {p.settled ? (p.payout > 0n ? "to claim" : "no payout") : "if it lands"}
        </div>
      </div>
    </div>
  );
}
