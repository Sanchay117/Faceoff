/**
 * Readable identities with no signup.
 *
 * A wallet address is not a name, and asking a first-time player to pick one
 * before they can take a bet is the surest way to lose them. So every address
 * gets a stable, deterministic handle derived from its own bytes — the same on
 * every device, with nothing stored anywhere.
 *
 * Kept free of "use client" so the share-card generator can use it server-side.
 */

const ADJECTIVES = [
  "Swift", "Bold", "Lucky", "Sharp", "Quiet", "Wired", "Fearless", "Cosmic",
  "Rogue", "Iron", "Neon", "Turbo", "Silent", "Wild", "Prime",
];

const NOUNS = [
  "Falcon", "Otter", "Comet", "Badger", "Nomad", "Raven", "Tiger", "Wolf",
  "Koala", "Phoenix", "Panther", "Yak", "Heron", "Bison", "Lynx",
];

export function handleFor(address: string): string {
  // `>>> 0` and `>>>` deliberately, not `>>`. Eight hex digits can exceed 2^31,
  // and JavaScript's signed shift turns those into negatives — which index off
  // the front of the array and render as "Neonundefined".
  const n = parseInt(address.slice(2, 10), 16) >>> 0;
  return `${ADJECTIVES[n % ADJECTIVES.length]}${NOUNS[(n >>> 4) % NOUNS.length]}`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}
