"use client";

import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { handleFor, shortAddress } from "./handle";

export { handleFor, shortAddress };

/**
 * Faceoff plays on a burner wallet generated in the browser.
 *
 * The point is the first thirty seconds: a new player taps "Take this duel" and
 * is trading, with no extension to install, no seed phrase to write down, and no
 * signature popup between them and the bet. The key is generated locally, never
 * leaves the device, and is funded by the app (gas dripped by the faucet route,
 * collateral from the tUSDC token's own `faucet()`).
 *
 * This is a TESTNET pattern and nothing else. A localStorage key is the right
 * trade-off for play money on Shannon and the wrong one for real funds — a
 * mainnet build would swap this module for a connected wallet or a session key
 * scoped to the pool, which the venue already supports.
 */

const STORAGE_KEY = "faceoff.burner.v1";
const NAME_KEY = "faceoff.name.v1";

export interface Burner {
  privateKey: `0x${string}`;
  address: `0x${string}`;
}

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

export function loadBurner(): Burner | null {
  if (!isBrowser()) return null;
  const stored = window.localStorage.getItem(STORAGE_KEY);
  if (!stored || !/^0x[0-9a-fA-F]{64}$/.test(stored)) return null;
  try {
    const privateKey = stored as `0x${string}`;
    return { privateKey, address: privateKeyToAccount(privateKey).address };
  } catch {
    return null;
  }
}

export function createBurner(): Burner {
  const privateKey = generatePrivateKey();
  if (isBrowser()) window.localStorage.setItem(STORAGE_KEY, privateKey);
  return { privateKey, address: privateKeyToAccount(privateKey).address };
}

export function getOrCreateBurner(): Burner {
  return loadBurner() ?? createBurner();
}

export function clearBurner(): void {
  if (!isBrowser()) return;
  window.localStorage.removeItem(STORAGE_KEY);
  window.localStorage.removeItem(NAME_KEY);
}

/** Import an existing key (used to move a wallet between devices for a demo). */
export function importBurner(privateKey: string): Burner {
  const key = privateKey.trim().startsWith("0x") ? privateKey.trim() : `0x${privateKey.trim()}`;
  if (!/^0x[0-9a-fA-F]{64}$/.test(key)) throw new Error("That is not a valid private key.");
  if (isBrowser()) window.localStorage.setItem(STORAGE_KEY, key);
  return { privateKey: key as `0x${string}`, address: privateKeyToAccount(key as `0x${string}`).address };
}

/* ------------------------------------------------------------ display name */

export function displayName(address: string): string {
  if (isBrowser()) {
    const custom = window.localStorage.getItem(NAME_KEY);
    if (custom && custom.trim()) return custom.trim();
  }
  return handleFor(address);
}

export function setDisplayName(name: string): void {
  if (!isBrowser()) return;
  if (name.trim()) window.localStorage.setItem(NAME_KEY, name.trim().slice(0, 20));
  else window.localStorage.removeItem(NAME_KEY);
}

