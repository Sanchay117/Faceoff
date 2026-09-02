"use client";

import { SomniaMarketsProvider } from "@somnia-chain/markets-sdk/react";
import { AppShell } from "@/components/AppShell";
import { WalletProvider } from "@/components/WalletProvider";
import { readExchange } from "@/lib/exchange";
import { useWatchAllMarkets } from "@/lib/live";

/**
 * One read-only client provides the whole tree. The SDK's hooks read it from
 * context, and `useWatchAllMarkets` holds a single discovery watch for the app,
 * so every page shares one socket and one materialized store rather than each
 * opening its own.
 */
function LiveTail({ children }: { children: React.ReactNode }) {
  useWatchAllMarkets();
  return <>{children}</>;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SomniaMarketsProvider client={readExchange().client}>
      <LiveTail>
        <WalletProvider>
          <AppShell>{children}</AppShell>
        </WalletProvider>
      </LiveTail>
    </SomniaMarketsProvider>
  );
}
