"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { LoadingBlock } from "@/components/AppShell";
import { useWallet, cleanError } from "@/components/WalletProvider";
import { Banner, Button, Countdown, fmtNum } from "@/components/ui";
import { COLLATERAL_DECIMALS } from "@/lib/account";
import { createDuel, restBand } from "@/lib/duels";
import { listLiveMarkets, loadMarket, marketLabel, type LiveMarket } from "@/lib/markets";
import type { Side } from "@/lib/tag";

const POT_PRESETS = [5, 10, 25, 100];

export default function CreatePage() {
  const router = useRouter();
  const { burner, balances, ready, start, busy: walletBusy, status: walletStatus } = useWallet();

  const [markets, setMarkets] = useState<LiveMarket[] | null>(null);
  const [marketId, setMarketId] = useState<`0x${string}` | null>(null);
  const [side, setSide] = useState<Side>("UP");
  const [pot, setPot] = useState(10);
  /** Your share of the pot, as a percentage. This IS your implied probability. */
  const [confidence, setConfidence] = useState(60);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listLiveMarkets()
      .then((m) => {
        setMarkets(m);
        // Default to the 15-minute window: long enough to send a link, short
        // enough to actually watch it settle.
        const preferred = m.find((x) => x.intervalSec === 900) ?? m[0];
        if (preferred) setMarketId(preferred.marketId);
      })
      .catch((e) => setError(cleanError(e)));
  }, []);

  const market = useMemo(
    () => markets?.find((m) => m.marketId === marketId) ?? null,
    [markets, marketId],
  );

  /**
   * A duel rests post-only, and the pool reverts a post-only that would cross.
   * So there is a ceiling on how confident you can be before your odds run into
   * what is already resting — past that point the honest answer is "someone is
   * already offering this, go take it" rather than a failed transaction.
   */
  const [maxConfidence, setMaxConfidence] = useState(95);

  useEffect(() => {
    let cancelled = false;
    if (!marketId) return;
    void (async () => {
      try {
        const full = await loadMarket(marketId);
        const band = await restBand(full);
        const one = 10 ** full.grid.decimals;
        const ceiling =
          side === "UP"
            ? (Number(band.maxUpForUp) / one) * 100
            : (1 - Number(band.minUpForDown) / one) * 100;
        if (!cancelled) setMaxConfidence(Math.max(5, Math.min(95, Math.floor(ceiling))));
      } catch {
        if (!cancelled) setMaxConfidence(95);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marketId, side]);

  // Keep the slider inside the band as the market or side changes.
  useEffect(() => {
    setConfidence((c) => Math.min(c, maxConfidence));
  }, [maxConfidence]);

  const myStake = (pot * confidence) / 100;
  const theirStake = pot - myStake;
  // The pool always prices in Up terms. Backing Down at confidence c means the
  // market's Up probability is 1 − c.
  const upProbability = side === "UP" ? confidence / 100 : 1 - confidence / 100;

  const balance = balances ? Number(balances.collateral) / 10 ** COLLATERAL_DECIMALS : 0;
  const tooPoor = myStake > balance;

  async function submit() {
    if (!burner || !market) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await createDuel({
        privateKey: burner.privateKey,
        marketId: market.marketId,
        side,
        pot,
        upProbability,
      });
      router.push(`/d/${res.market.marketId}/${res.orderId}?created=1`);
    } catch (err) {
      setError(cleanError(err));
      setSubmitting(false);
    }
  }

  if (!burner) {
    return (
      <div className="mx-auto max-w-md py-16 text-center">
        <h1 className="text-2xl font-black">First, grab a wallet</h1>
        <p className="mt-2 text-sm text-muted">
          Takes a few seconds. We create a testnet wallet in your browser and fund it with play
          money.
        </p>
        <Button className="mt-6" size="lg" onClick={() => void start()} loading={walletBusy}>
          {walletBusy ? (walletStatus ?? "Setting up…") : "Set me up"}
        </Button>
      </div>
    );
  }

  if (markets === null) return <LoadingBlock label="Finding open windows" />;

  return (
    <div className="mx-auto max-w-lg space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Start a duel</h1>
        <p className="mt-1 text-sm text-muted">
          Set the terms. We&apos;ll give you a link to send.
        </p>
      </div>

      {/* 1 — which window */}
      <Section step={1} title="Pick the window">
        <div className="flex flex-wrap gap-2">
          {markets.map((m) => (
            <button
              key={m.marketId}
              onClick={() => setMarketId(m.marketId)}
              className={`rounded-xl border px-3 py-2 text-left transition ${
                m.marketId === marketId
                  ? "border-brand bg-brand-dim"
                  : "border-line bg-surface hover:border-line-bright"
              }`}
            >
              <div className="text-xs font-bold">{marketLabel(m.asset, m.intervalSec)}</div>
              <div className="mt-0.5 text-[0.68rem] tabular text-faint">
                closes in <Countdown to={m.expiry} />
              </div>
            </button>
          ))}
        </div>
        {market && (
          <p className="mt-3 text-xs leading-relaxed text-faint">
            Settles on whether {market.asset} closes at or above its opening price for this window.
            Resolved on-chain by Somnia&apos;s oracle — nobody here decides the outcome.
          </p>
        )}
      </Section>

      {/* 2 — which side */}
      <Section step={2} title="Pick your side">
        <div className="grid grid-cols-2 gap-3">
          <SideButton side="UP" active={side === "UP"} onClick={() => setSide("UP")} asset={market?.asset} />
          <SideButton
            side="DOWN"
            active={side === "DOWN"}
            onClick={() => setSide("DOWN")}
            asset={market?.asset}
          />
        </div>
      </Section>

      {/* 3 — the money */}
      <Section step={3} title="Set the pot">
        <div className="flex flex-wrap gap-2">
          {POT_PRESETS.map((p) => (
            <button
              key={p}
              onClick={() => setPot(p)}
              className={`rounded-lg border px-4 py-2 text-sm font-bold tabular transition ${
                pot === p
                  ? "border-gold bg-gold/10 text-gold"
                  : "border-line bg-surface text-muted hover:border-line-bright"
              }`}
            >
              {p}
            </button>
          ))}
          <input
            type="number"
            min={1}
            value={pot}
            onChange={(e) => setPot(Math.max(0, Number(e.target.value)))}
            className="w-24 rounded-lg border border-line bg-surface px-3 py-2 text-sm font-bold tabular outline-none focus:border-brand"
            aria-label="Custom pot"
          />
        </div>

        <div className="mt-6">
          <div className="flex items-baseline justify-between">
            <label htmlFor="confidence" className="text-xs font-semibold uppercase tracking-wider text-faint">
              How sure are you?
            </label>
            <span className="tabular text-sm font-bold">{confidence}%</span>
          </div>
          <input
            id="confidence"
            type="range"
            min={5}
            max={maxConfidence}
            value={confidence}
            onChange={(e) => setConfidence(Number(e.target.value))}
            className="mt-2 w-full"
            style={{
              background: `linear-gradient(90deg, var(--color-brand) ${confidence}%, var(--color-line) ${confidence}%)`,
            }}
          />
          <p className="mt-2 text-xs text-faint">
            The surer you are, the more of the pot you put up — and the better the deal you offer
            them.
          </p>
          {maxConfidence < 95 && (
            <p className="mt-1 text-xs text-faint">
              Capped at {maxConfidence}% — past that, someone on the open book is already offering
              these odds, so you&apos;d be taking their bet instead of opening your own.
            </p>
          )}
        </div>

        <div className="card-2 mt-5 p-4">
          <div className="grid grid-cols-3 items-end gap-2 text-center">
            <div>
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
                You risk
              </div>
              <div className={`text-xl font-black tabular ${side === "UP" ? "text-up" : "text-down"}`}>
                {fmtNum(myStake)}
              </div>
            </div>
            <div className="text-xs font-bold text-faint">vs</div>
            <div>
              <div className="text-[0.65rem] font-semibold uppercase tracking-wider text-faint">
                They risk
              </div>
              <div className={`text-xl font-black tabular ${side === "UP" ? "text-down" : "text-up"}`}>
                {fmtNum(theirStake)}
              </div>
            </div>
          </div>
          <div className="mt-3 border-t border-line pt-3 text-center">
            <span className="text-xs text-muted">Winner takes </span>
            <span className="tabular text-lg font-black text-gold">{fmtNum(pot)} tUSDC</span>
          </div>
        </div>
      </Section>

      {error && <Banner tone="error">{error}</Banner>}

      {tooPoor && (
        <Banner tone="error">
          You&apos;d need {fmtNum(myStake)} tUSDC but only have {fmtNum(balance)}. Lower the pot, or
          mint more from the wallet menu.
        </Banner>
      )}

      <Button
        size="lg"
        className="w-full"
        onClick={() => void submit()}
        loading={submitting}
        disabled={!ready || !market || pot <= 0 || tooPoor}
      >
        {submitting ? "Opening your duel…" : `Put up ${fmtNum(myStake)} tUSDC`}
      </Button>

      <p className="text-center text-xs leading-relaxed text-faint">
        Your stake is escrowed by the pool the moment you sign. Nobody can take it except whoever
        accepts the other side — and you can cancel any time before they do.
      </p>
    </div>
  );
}

function Section({
  step,
  title,
  children,
}: {
  step: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="card p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="grid size-6 place-items-center rounded-md bg-surface-2 text-xs font-black text-brand">
          {step}
        </span>
        <h2 className="text-sm font-bold">{title}</h2>
      </div>
      {children}
    </section>
  );
}

function SideButton({
  side,
  active,
  onClick,
  asset,
}: {
  side: Side;
  active: boolean;
  onClick: () => void;
  asset?: string;
}) {
  const up = side === "UP";
  return (
    <button
      onClick={onClick}
      className={`rounded-2xl border-2 px-4 py-5 text-left transition ${
        active
          ? up
            ? "border-up bg-up-dim"
            : "border-down bg-down-dim"
          : "border-line bg-surface hover:border-line-bright"
      }`}
    >
      <div className={`text-2xl font-black ${up ? "text-up" : "text-down"}`}>
        {up ? "▲ UP" : "▼ DOWN"}
      </div>
      <div className="mt-1 text-xs text-muted">
        {asset ?? "Price"} closes {up ? "at or above" : "below"} where it opened
      </div>
    </button>
  );
}
