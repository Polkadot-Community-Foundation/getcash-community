// Set by the deploys that publish to test networks (the PCF devnet and PR previews).

import { NETWORK } from "@getsome/core";
import { ASSETS } from "~~/lib/config";
import type { FundingRoute } from "../funding/selection";

export function isTestNetworkBuild(): boolean {
  return import.meta.env.VITE_TEST_NETWORK_NOTICE === "true";
}

/** The routes a test network build offers: only the direct deposit and withdrawal on Asset Hub,
 *  the one path that runs end to end on test tokens. Card, bank and the Chainflip networks stay
 *  greyed. */
export function testNetworkRoutes(routes: readonly FundingRoute[]): FundingRoute[] {
  return isTestNetworkBuild() ? routes.filter((route) => route === "crypto") : [...routes];
}

/** The native's catalog name as the screens show it: a test network names it by its own symbol. */
export function displayAsset(asset: string): string {
  return isTestNetworkBuild() && asset === ASSETS.DOT ? NETWORK.nativeSymbol : asset;
}
