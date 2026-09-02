"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { explorerTx } from "@/lib/exchange";
import type { Side } from "@/lib/tag";

/* ------------------------------------------------------------------ buttons */

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "up" | "down" | "ghost" | "quiet";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
};

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...rest
}: ButtonProps) {
  const sizes = {
    sm: "h-9 px-3 text-sm rounded-lg",
    md: "h-11 px-4 text-[0.95rem] rounded-xl",
    lg: "h-14 px-6 text-base rounded-2xl",
  }[size];

  const variants = {
    primary: "bg-brand text-white hover:brightness-110 disabled:bg-line",
    up: "bg-up text-ink hover:brightness-110 disabled:bg-line disabled:text-faint",
    down: "bg-down text-white hover:brightness-110 disabled:bg-line disabled:text-faint",
    ghost: "border border-line-bright text-text hover:bg-surface-2 disabled:text-faint",
    quiet: "text-muted hover:text-text",
  }[variant];

  return (
    <button
      className={`inline-flex items-center justify-center gap-2 font-semibold transition disabled:cursor-not-allowed ${sizes} ${variants} ${className}`}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <span
      className={`inline-block size-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent ${className}`}
      aria-hidden
    />
  );
}

/* ---------------------------------------------------------------- countdown */

/** Live mm:ss to a unix-seconds deadline. Turns urgent under a minute. */
export function Countdown({
  to,
  className = "",
  onExpire,
}: {
  to: number;
  className?: string;
  onExpire?: () => void;
}) {
  const [left, setLeft] = useState(() => Math.max(0, to - Date.now() / 1000));

  useEffect(() => {
    const tick = () => {
      const next = Math.max(0, to - Date.now() / 1000);
      setLeft(next);
      if (next <= 0) onExpire?.();
    };
    tick();
    const id = setInterval(tick, 500);
    return () => clearInterval(id);
    // onExpire is intentionally not a dep: callers pass inline closures.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [to]);

  const urgent = left < 60;
  return (
    <span className={`tabular ${urgent ? "text-down" : ""} ${className}`}>{formatDuration(left)}</span>
  );
}

export function formatDuration(seconds: number): string {
  const s = Math.max(0, Math.floor(seconds));
  if (s >= 86400) return `${Math.floor(s / 86400)}d ${Math.floor((s % 86400) / 3600)}h`;
  if (s >= 3600) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, "0")}`;
}

/* -------------------------------------------------------------------- sides */

export function SidePill({
  side,
  className = "",
  size = "md",
}: {
  side: Side;
  className?: string;
  size?: "sm" | "md";
}) {
  const up = side === "UP";
  const pad = size === "sm" ? "px-2 py-0.5 text-[0.7rem]" : "px-2.5 py-1 text-xs";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold uppercase tracking-wide ${pad} ${
        up ? "bg-up-dim text-up" : "bg-down-dim text-down"
      } ${className}`}
    >
      {up ? "▲" : "▼"} {side}
    </span>
  );
}

/* ------------------------------------------------------------------- pieces */

export function Stat({
  label,
  value,
  hint,
  tone = "default",
}: {
  label: string;
  value: React.ReactNode;
  hint?: React.ReactNode;
  tone?: "default" | "up" | "down" | "gold";
}) {
  const toneClass = {
    default: "text-text",
    up: "text-up",
    down: "text-down",
    gold: "text-gold",
  }[tone];
  return (
    <div className="card-2 px-4 py-3">
      <div className="text-[0.68rem] font-semibold uppercase tracking-wider text-faint">{label}</div>
      <div className={`mt-1 text-xl font-bold tabular ${toneClass}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}

export function TxLink({ hash, label = "View transaction" }: { hash: string; label?: string }) {
  return (
    <a
      href={explorerTx(hash)}
      target="_blank"
      rel="noreferrer"
      className="inline-flex items-center gap-1 text-xs font-medium text-brand hover:underline"
    >
      {label} ↗
    </a>
  );
}

export function Banner({
  tone = "info",
  children,
}: {
  tone?: "info" | "error" | "success";
  children: React.ReactNode;
}) {
  const tones = {
    info: "border-line-bright bg-surface-2 text-muted",
    error: "border-down/40 bg-down-dim/60 text-down",
    success: "border-up/40 bg-up-dim/60 text-up",
  }[tone];
  return <div className={`rounded-xl border px-4 py-3 text-sm ${tones}`}>{children}</div>;
}

export function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-14 text-center">
      <div className="text-lg font-bold">{title}</div>
      <p className="max-w-sm text-sm text-muted">{body}</p>
      {action}
    </div>
  );
}

export function NavLink({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={`rounded-lg px-3 py-1.5 text-sm font-semibold transition ${
        active ? "bg-surface-2 text-text" : "text-muted hover:text-text"
      }`}
    >
      {children}
    </Link>
  );
}

/** 4.20 with thousands separators, from a raw bigint. */
export function fmt(raw: bigint, decimals: number, dp = 2): string {
  const v = Number(raw) / 10 ** decimals;
  return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}

export function fmtNum(v: number, dp = 2): string {
  return v.toLocaleString(undefined, { minimumFractionDigits: dp, maximumFractionDigits: dp });
}
