import { afterEach, describe, expect, it, vi } from "vitest";
import { isTestNetworkBuild } from "../app/utils/testNetwork";

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
