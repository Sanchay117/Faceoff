"use client";

import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { useLiveFills, useWatchMarket } from "@somnia-chain/markets-sdk/react";
import { LoadingBlock } from "@/components/AppShell";
import { LiveBadge } from "@/components/LiveBadge";
import { LiveStanding } from "@/components/LiveStanding";
import { Scoreboard } from "@/components/Scoreboard";
import { cleanError, useWallet } from "@/components/WalletProvider";
import { Banner, Button, Countdown, SidePill, Stat, TxLink, fmtNum } from "@/components/ui";
import {
  acceptDuel,
  cancelDuel,
  getDuel,
  isFirstInQueue,
  stakesFor,
  type AcceptDuelResult,
  type Duel,
} from "@/lib/duels";
import { ensureGas } from "@/lib/account";
import { oracleQuestion } from "@/lib/exchange";
import { useOnChainAdvance } from "@/lib/live";
import { loadMarket, marketLabel, STATUS, type DuelMarket } from "@/lib/markets";
import { findMatch, matchFromLiveFills, type Match } from "@/lib/match";
import { opposite } from "@/lib/tag";
import { displayName } from "@/lib/wallet";

interface Snapshot {
  market: DuelMarket;
  duel: Duel | null;
  /** Present once the duel has been taken — the link becomes a scoreboard. */
  match: Match | null;
  /** False when a better-priced order would be filled ahead of this duel. */
  first: boolean;
}

export default function DuelPage() {
  const params = useParams<{ marketId: string; orderId: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const { burner, ready, start, busy: walletBusy, status: walletStatus, refresh } = useWallet();

  const marketId = params.marketId as `0x${string}`;
  const orderId = BigInt(params.orderId);
  const justCreated = search.get("created") === "1";

  // Once you're in, you're in — the match result is sticky even though the
  // resting order it came from has since vanished from the book.
  const [matched, setMatched] = useState<AcceptDuelResult | null>(null);
  const [acting, setActing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const read = useCallback(async (): Promise<Snapshot> => {
    const market = await loadMarket(marketId);
    const duel = await getDuel(market.marketId, market.pool, orderId);
    // A duel that is no longer resting was either taken or withdrawn. The tape
    // tells us which, and names both players if it was taken.
    const match = duel ? null : await findMatch(market, orderId);
    const first = duel ? await isFirstInQueue(market, duel) : true;
    return { market, duel, match, first };
  }, [marketId, orderId]);

  const { data, error: readError, refresh: reread } = useOnChainAdvance<Snapshot>(read, [
    marketId,
    String(orderId),
  ]);

  // Hold a watch on this specific pool so the tail is definitely covering it.
  useWatchMarket(data?.market.pool);

  // The live tape sees the fill the moment its block lands, where the indexer
  // needs a few seconds. Whichever answers first wins.
  const liveFills = useLiveFills(data?.market.pool);
  const liveMatch = useMemo(
    () =>
      data
        ? matchFromLiveFills(liveFills as never, data.market.marketId, orderId)
        : null,
    [liveFills, data, orderId],
  );
  const match = data?.match ?? liveMatch;

  async function take() {
    if (!burner) return;
    setActing(true);
    setError(null);
    try {
      // A burner funded once at onboarding drifts below the node's gas reserve
      // as it trades, and the next write fails with a message that blames the
      // parameters. Top up first.
      await ensureGas(burner.address);
      const result = await acceptDuel({ privateKey: burner.privateKey, marketId, orderId });
      setMatched(result);
      void refresh();
    } catch (err) {
      setError(cleanError(err));
      reread();
    } finally {
      setActing(false);
    }
  }

  async function withdraw(duel: Duel) {
    if (!burner) return;
    setActing(true);
    setError(null);
    try {
      await ensureGas(burner.address);
      await cancelDuel({ privateKey: burner.privateKey, pool: duel.pool, orderId: duel.orderId });
      void refresh();
      router.push("/");
    } catch (err) {
      setError(cleanError(err));
      setActing(false);
    }
  }

  if (readError && !data) return <Banner tone="error">{readError}</Banner>;

  // Once the fill is on the tape, the scoreboard is the truth for everyone —
  // both players and any spectator holding the link.
  if (data && match) {
    return <Scoreboard market={data.market} match={match} viewer={burner?.address} />;
  }

  // Until then, the taker gets the celebration straight off their own receipt.
  if (matched) return <MatchedView market={matched.market} result={matched} />;
  if (!data) return <LoadingBlock label="Loading the duel" />;

  const { market, duel } = data;

  if (!duel) {
    // The order is gone but no fill has surfaced yet. It was almost certainly
    // just taken — saying "withdrawn" here would be a guess, and a wrong one at
    // the exact moment the match lands. Wait for the tape instead.
    return (
      <div className="mx-auto max-w-md py-14 text-center">
        <h1 className="text-2xl font-black">Settling the match…</h1>
        <p className="mt-2 text-sm text-muted">
          This challenge has left the book. Reading the tape to see who took it.
        </p>
        <div className="mt-6 flex justify-center">
          <LoadingBlock label="Confirming" />
        </div>
        <Link href="/">
          <Button variant="ghost" className="mt-2">
            Back to the Arena
          </Button>
        </Link>
      </div>
    );
  }

  const stakes = stakesFor(duel, market.grid);
  const isMine = burner?.address.toLowerCase() === duel.creator.toLowerCase();
  const takerSide = opposite(duel.creatorSide);
  const viewerSide = isMine ? duel.creatorSide : takerSide;
  const closed = market.status !== STATUS.Trading;

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-10">
      {justCreated && isMine && (
        <Banner tone="success">Your duel is live. Send the link and it&apos;s on.</Banner>
      )}

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-5 py-3">
          <span className="text-sm font-bold">{marketLabel(market.asset, market.intervalSec)}</span>
          <span className="flex items-center gap-2 text-xs text-muted">
            <Countdown to={market.expiry} className="font-bold" onExpire={reread} />
            <LiveBadge />
          </span>
        </div>

        <div className="px-5 py-7 text-center">
          <p className="text-xs font-semibold uppercase tracking-wider text-faint">
            {isMine ? "You are backing" : `${displayName(duel.creator)} is backing`}
          </p>
          <div
            className={`mt-2 text-5xl font-black ${duel.creatorSide === "UP" ? "text-up" : "text-down"}`}
          >
            {duel.creatorSide === "UP" ? "▲ UP" : "▼ DOWN"}
          </div>
          <p className="mt-2 text-sm text-muted">
            {market.asset} closes {duel.creatorSide === "UP" ? "at or above" : "below"} its opening
            price
          </p>
        </div>

        <div className="grid grid-cols-3 items-center gap-2 border-t border-line px-5 py-5 text-center">
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
              {isMine ? "You put up" : "They put up"}
            </div>
            <div
              className={`text-2xl font-black tabular ${duel.creatorSide === "UP" ? "text-up" : "text-down"}`}
            >
              {fmtNum(stakes.creatorStake)}
            </div>
          </div>
          <div className="text-sm font-black text-faint">VS</div>
          <div>
            <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
              {isMine ? "They put up" : "You put up"}
            </div>
            <div
              className={`text-2xl font-black tabular ${takerSide === "UP" ? "text-up" : "text-down"}`}
            >
              {fmtNum(stakes.takerStake)}
            </div>
          </div>
        </div>

        <div className="border-t border-line bg-surface-2 px-5 py-4 text-center">
          <span className="text-xs text-muted">Winner takes </span>
          <span className="tabular text-xl font-black text-gold">{fmtNum(stakes.pot)} tUSDC</span>
        </div>
      </section>

      <LiveStanding marketId={market.marketId} asset={market.asset} side={viewerSide} />

      {error && <Banner tone="error">{error}</Banner>}
      {closed && <Banner tone="error">This window stopped taking orders. Nothing was risked.</Banner>}

      {!isMine && !data.first && (
        <Banner tone="error">
          Someone has stepped in front of this challenge with a better price, so taking it now would
          match you against them instead — you&apos;d get better odds, but not this duel. Wait a
          moment, or ask them to reopen it.
        </Banner>
      )}

      {isMine ? (
        <ShareBox onCancel={() => void withdraw(duel)} busy={acting} />
      ) : !burner ? (
        <div className="card p-5 text-center">
          <p className="text-sm text-muted">
            You need a wallet to take this. It takes a few seconds and it&apos;s free.
          </p>
          <Button className="mt-4 w-full" size="lg" onClick={() => void start()} loading={walletBusy}>
            {walletBusy ? (walletStatus ?? "Setting up…") : "Set me up and take it"}
          </Button>
        </div>
      ) : (
        <Button
          size="lg"
          variant={takerSide === "UP" ? "up" : "down"}
          className="w-full"
          onClick={() => void take()}
          loading={acting}
          disabled={!ready || closed}
        >
          {acting ? "Matching you…" : `Take ${takerSide} for ${fmtNum(stakes.takerStake)} tUSDC`}
        </Button>
      )}

      <MechanicNote />

      {market.oracleQuestionId && (
        <p className="text-center text-xs text-faint">
          <a
            href={oracleQuestion(market.oracleQuestionId)}
            target="_blank"
            rel="noreferrer"
            className="text-brand hover:underline"
          >
            Inspect how this market resolves ↗
          </a>
        </p>
      )}
    </div>
  );
}

function ShareBox({ onCancel, busy }: { onCancel: () => void; busy: boolean }) {
  const [copied, setCopied] = useState(false);
  const url = typeof window === "undefined" ? "" : window.location.href.split("?")[0];

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard blocked — the input is selectable as a fallback */
    }
  }

  return (
    <div className="card space-y-3 p-5">
      <div className="shimmer flex items-center justify-center gap-2 rounded-xl border border-line-bright py-3 text-sm font-semibold text-muted">
        <span className="size-1.5 rounded-full bg-gold pulse-dot" />
        Waiting for someone to take it
      </div>

      <div className="flex gap-2">
        <input
          readOnly
          value={url}
          onFocus={(e) => e.currentTarget.select()}
          className="min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-xs text-muted outline-none"
        />
        <Button onClick={() => void copy()}>{copied ? "Copied" : "Copy link"}</Button>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`https://wa.me/?text=${encodeURIComponent(`Think you know better? Take the other side: ${url}`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1"
        >
          <Button variant="ghost" className="w-full">
            WhatsApp
          </Button>
        </a>
        <a
          href={`https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent("Think you know better?")}`}
          target="_blank"
          rel="noreferrer"
          className="flex-1"
        >
          <Button variant="ghost" className="w-full">
            Telegram
          </Button>
        </a>
      </div>

      <button
        onClick={onCancel}
        disabled={busy}
        className="w-full pt-1 text-xs text-faint hover:text-down disabled:opacity-50"
      >
        {busy ? "Withdrawing…" : "Withdraw the challenge and get my stake back"}
      </button>
    </div>
  );
}

function MatchedView({ market, result }: { market: DuelMarket; result: AcceptDuelResult }) {
  const pot = Number(result.filledQuantity) / 10 ** market.grid.decimals;
  const price = Number(result.avgPrice) / 10 ** market.grid.decimals;
  const stake = result.side === "UP" ? pot * price : pot * (1 - price);

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-10">
      <div className="card px-6 py-10 text-center rise">
        <div className="text-5xl">{result.matchedElsewhere ? "🎯" : "🤝"}</div>
        <h1 className="mt-4 text-3xl font-black">You&apos;re in.</h1>
        {result.matchedElsewhere ? (
          // Honest reporting beats a nice story. The book matches by price then
          // time and no order can be targeted, so a better-priced resting order
          // takes precedence — the taker wins on price and loses the duel.
          <p className="mt-2 text-sm text-muted">
            You got a <span className="text-up">better price</span> than the challenge offered, so
            the book filled you there instead. You&apos;re on{" "}
            <span className="font-semibold">{result.side}</span> at better odds — but this one
            wasn&apos;t against them, and their challenge is still open.
          </p>
        ) : (
          <p className="mt-2 text-sm text-muted">
            Matched directly against your opponent — the pool minted both sides of this contract
            from your two stakes.
          </p>
        )}

        <div className="mt-6 flex items-center justify-center">
          <SidePill side={result.side} />
        </div>

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Stat label="You risked" value={fmtNum(stake)} />
          <Stat label="You win" value={fmtNum(pot)} tone="gold" />
        </div>

        <div className="mt-6 flex items-center justify-center gap-2 text-sm">
          <span className="text-muted">Settles in</span>
          <Countdown to={market.expiry} className="font-bold" />
        </div>

        <div className="mt-4">
          <TxLink hash={result.hash} label="See it on-chain" />
        </div>
      </div>

      <LiveStanding marketId={market.marketId} asset={market.asset} side={result.side} />

      <Link href="/me">
        <Button variant="ghost" className="w-full">
          Track it in My duels
        </Button>
      </Link>
    </div>
  );
}

function MechanicNote() {
  return (
    <p className="text-center text-xs leading-relaxed text-faint">
      No market maker sits between you. When both sides are in, the pool mints a fresh Up/Down pair
      from the combined stakes — the contract is created by your disagreement.
    </p>
  );
}
