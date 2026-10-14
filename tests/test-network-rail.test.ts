import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";

// The rail as a demo build has it, so the test network flag is the only thing turning it off.
vi.mock("../app/utils/rail", () => ({ chainflipRailOn: () => true }));

import { useOffersStore } from "../app/stores/offers";
import { useWithdrawOffersStore } from "../app/stores/withdraw-offers";

describe("Chainflip rail on a test network build", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.stubEnv("VITE_CHAINFLIP_BROKER_API_KEY", "abc123");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("starts off for top-ups and withdrawals", () => {
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "true");
    expect(useOffersStore().railEnabled).toBe(false);
    expect(useWithdrawOffersStore().railOn).toBe(false);
  });

  it("starts on in any other build", () => {
    vi.stubEnv("VITE_TEST_NETWORK_NOTICE", "");
    expect(useOffersStore().railEnabled).toBe(true);
    expect(useWithdrawOffersStore().railOn).toBe(true);
  });
});
