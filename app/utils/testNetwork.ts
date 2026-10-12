// Set by the deploys that publish to test networks (the PCF devnet and PR previews).

export function isTestNetworkBuild(): boolean {
  return import.meta.env.VITE_TEST_NETWORK_NOTICE === "true";
}
