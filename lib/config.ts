import type { SourceId } from "@getsome/core";

// Chainflip chain/asset identifiers
export const CHAINS = {
  Bitcoin: "Bitcoin",
  Ethereum: "Ethereum",
  Solana: "Solana",
  Tron: "Tron",
  Polkadot: "Polkadot",
} as const;

export const ASSETS = {
  BTC: "BTC",
  ETH: "ETH",
  USDC: "USDC",
  USDT: "USDT",
  SOL: "SOL",
  TRX: "TRX",
  DOT: "DOT",
  CASH: "CASH",
} as const;

// Source chain configs with their available assets. `native` is the network's own coin.
export const SOURCE_CHAINS = [
  { chain: CHAINS.Bitcoin, native: ASSETS.BTC, assets: [ASSETS.BTC], label: "Bitcoin" },
  {
    chain: CHAINS.Ethereum,
    native: ASSETS.ETH,
    assets: [ASSETS.ETH, ASSETS.USDC, ASSETS.USDT],
    label: "Ethereum",
  },
  {
    chain: CHAINS.Solana,
    native: ASSETS.SOL,
    assets: [ASSETS.SOL, ASSETS.USDC, ASSETS.USDT],
    label: "Solana",
  },
  { chain: CHAINS.Tron, native: ASSETS.TRX, assets: [ASSETS.TRX, ASSETS.USDT], label: "Tron" },
] as const;

/** The direct network: the buyer sends the native from any wallet to the request's own account
 *  on Asset Hub, through the manual rail. Funding only; withdraw keeps its own Asset Hub entry. */
export const POLKADOT_CHAIN = {
  chain: CHAINS.Polkadot,
  native: ASSETS.DOT,
  assets: [ASSETS.DOT],
  label: "Polkadot",
} as const;

/** The on-ramp's networks in picker order: the direct one first, then the Chainflip ones. */
export const FUNDING_CHAINS = [POLKADOT_CHAIN, ...SOURCE_CHAINS] as const;

/** The direct deposit's SourceId: the manual rail's. */
export const DIRECT_SOURCE_ID = "dot-assethub" satisfies SourceId;

export const isDirectSourceId = (sourceId: string): boolean => sourceId === DIRECT_SOURCE_ID;

// The destination is always CASH; this app has no other destination assets.

/** Whether this build moves money through Chainflip. Off until the channel rail lands: the
 *  pickers keep listing the Chainflip routes, greyed and named as not yet available, so nothing
 *  can reach a deposit or a withdrawal that would have nowhere to go. */
export const CHAINFLIP_RAIL_ENABLED = false;

/** UI pair to Chainflip SourceId, also the `?source=` deep-link vocabulary. A pair with no
 *  entry has no swap source. */
export const SOURCE_ID_BY_KEY: Readonly<Record<string, SourceId>> = {
  "Bitcoin:BTC": "btc",
  "Ethereum:ETH": "eth",
  "Ethereum:USDC": "usdc-eth",
  "Ethereum:USDT": "usdt-eth",
  "Solana:SOL": "sol-solana",
  "Solana:USDC": "usdc-solana",
  "Solana:USDT": "usdt-solana",
  "Tron:USDT": "usdt-tron",
  "Tron:TRX": "trx-tron",
};

export function sourceIdFor(chain: string, asset: string): SourceId | undefined {
  if (chain === CHAINS.Polkadot && asset === ASSETS.DOT) return DIRECT_SOURCE_ID;
  return SOURCE_ID_BY_KEY[`${chain}:${asset}`];
}
