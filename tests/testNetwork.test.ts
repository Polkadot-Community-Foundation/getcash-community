import { afterEach, describe, expect, it, vi } from "vitest";
import { displayAsset, isTestNetworkBuild, testNetworkRoutes } from "../app/utils/testNetwork";

describe("isTestNetworkBuild", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("shows the notice only when the deploy sets it", () => {
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "true");
    expect(isTestNetworkBuild()).toBe(true);
  });

  it("stays off for any other value or none", () => {
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "false");
    expect(isTestNetworkBuild()).toBe(false);
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "");
    expect(isTestNetworkBuild()).toBe(false);
  });
});

describe("testNetworkRoutes", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("keeps only the crypto route on a test network", () => {
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "true");
    expect(testNetworkRoutes(["crypto", "card", "bank"])).toEqual(["crypto"]);
    expect(testNetworkRoutes(["card", "bank"])).toEqual([]);
  });

  it("keeps every route otherwise", () => {
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "");
    expect(testNetworkRoutes(["crypto", "card", "bank"])).toEqual(["crypto", "card", "bank"]);
  });
});

describe("displayAsset", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("names the native by the network's symbol on a test network", () => {
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "true");
    expect(displayAsset("DOT")).toBe("PAS");
    expect(displayAsset("USDT")).toBe("USDT");
  });

  it("leaves every name alone otherwise", () => {
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "");
    expect(displayAsset("DOT")).toBe("DOT");
  });
});
