import { afterEach, describe, expect, it, vi } from "vitest";
import { TOKENS } from "@getsome/core";
import { AccountId } from "polkadot-api";
import { fromHex, toHex } from "polkadot-api/utils";

const CONTRACT = "0x5A3c4E1f2b7d8A9c0e1F2a3b4c5D6e7f8091a2b3";
const BURNER = "14uAyRtbeRsrgERPLETm72yFPKW3oi3m4RX93arNwGQhsduC";
const PRODUCT_ID = "getcash.dot";
const EPOCH = 20_775n;
const MESSAGE = new Uint8Array(109).fill(7);
const PROOF = new Uint8Array(785).fill(3);
const ALIAS = new Uint8Array(32).fill(9);
const PRODUCT_KEY = new Uint8Array(32).fill(5);

const word = (value: bigint) => fromHex(`0x${value.toString(16).padStart(64, "0")}`);
/** ABI encoding of a single `bytes` (or `string`) return value. */
const abiBytes = (bytes: Uint8Array) => {
  const padding = new Uint8Array((32 - (bytes.length % 32)) % 32);
  return fromHex(
    toHex(word(32n)) +
      toHex(word(BigInt(bytes.length))).slice(2) +
      toHex(bytes).slice(2) +
      toHex(padding).slice(2),
  );
};

/** What the test controls and observes of the chain, the Host and the claim's watch. */
const world = vi.hoisted(() => ({
  observer: null as {
    next(event: unknown): void;
    error(error: unknown): void;
    complete(): void;
  } | null,
  claimRevert: null as string | null,
  reads: [] as string[],
  proofs: [] as unknown[][],
  txArgs: null as Record<string, unknown> | null,
  signer: null as unknown,
  createTransaction: [] as unknown[],
}));

vi.mock("../lib/host-chain", () => ({
  ASSET_HUB: {},
  connectChain: async () => ({
    getTypedApi: () => ({
      query: { Assets: { Asset: { getValue: async () => ({ min_balance: 70_000n }) } } },
      apis: {
        ReviveApi: {
          call: async (
            _origin: string,
            _dest: string,
            _value: bigint,
            _g: unknown,
            _s: unknown,
            input: Uint8Array,
          ) => {
            const selector = toHex(input.slice(0, 4));
            world.reads.push(selector);
            const ok = (data: Uint8Array) => ({
              weight_required: { ref_time: 1_000n, proof_size: 200n },
              storage_deposit: { type: "Charge", value: 80n },
              result: { success: true, value: { flags: 0, data } },
            });
            if (selector === "0xc5ce3911")
              return ok(abiBytes(new TextEncoder().encode(PRODUCT_ID)));
            if (selector === "0x76671808") return ok(word(EPOCH));
            if (selector === "0xc456bad4") return ok(abiBytes(MESSAGE));
            if (world.claimRevert === null) return ok(new Uint8Array());
            return {
              ...ok(new Uint8Array()),
              result: { success: true, value: { flags: 1, data: fromHex(world.claimRevert) } },
            };
          },
        },
      },
      tx: {
        Revive: {
          call: (args: Record<string, unknown>) => {
            world.txArgs = args;
            return {
              signSubmitAndWatch: (signer: unknown) => {
                world.signer = signer;
                return {
                  subscribe(observer: NonNullable<typeof world.observer>) {
                    world.observer = observer;
                    return { unsubscribe() {} };
                  },
                };
              },
            };
          },
        },
      },
    }),
  }),
}));

const ok = <T>(value: T) => Promise.resolve({ isErr: () => false as const, value });
const PEOPLE_LITE = toHex(
  new TextEncoder().encode("pop:polkadot.network/people-lite".padEnd(32, " ")),
);
const LITE_RING = { chainId: "0x01", junctions: [{ tag: "CollectionId", value: PEOPLE_LITE }] };

vi.mock("@parity/product-sdk-host", () => ({
  formatHostError: (error: unknown) => String(error),
  getAccountsProvider: async () => ({
    listRingVrfKeys: () => ok([{ handle: "lite", rings: [LITE_RING] }]),
    createRingVRFProof: (...args: unknown[]) => {
      world.proofs.push(args);
      return ok({
        proof: PROOF,
        ringIndex: 62,
        ringRevision: 7,
        contextualAlias: { context: new Uint8Array(32), alias: ALIAS },
      });
    },
    getProductAccount: (dotNsIdentifier: string, derivationIndex: number) =>
      ok({ dotNsIdentifier, derivationIndex, publicKey: PRODUCT_KEY }),
  }),
  getTruApi: async () => ({
    signing: {
      createTransaction: (request: unknown) => {
        world.createTransaction.push(request);
        return ok({ transaction: "0x4501" });
      },
    },
  }),
}));

async function load(contract = CONTRACT) {
  vi.stubEnv("VITE_FAUCET_CONTRACT", contract);
  vi.resetModules();
  return import("../lib/faucet");
}

function reset() {
  vi.unstubAllEnvs();
  Object.assign(world, {
    observer: null,
    claimRevert: null,
    reads: [],
    proofs: [],
    txArgs: null,
    signer: null,
    createTransaction: [],
  });
}

describe("isFaucetConfigured", () => {
  afterEach(reset);

  it.each([
    ["a 20-byte hex address", CONTRACT, true],
    ["a lowercase address", CONTRACT.toLowerCase(), true],
    ["an address of the wrong length", "0x5A3c4E1f2b7d", false],
    ["an address without 0x", CONTRACT.slice(2), false],
    ["an empty value", "", false],
  ])("%s", async (_, contract, expected) => {
    const { isFaucetConfigured } = await load(contract);
    expect(isFaucetConfigured()).toBe(expected);
  });
});

describe("fundFromFaucet", () => {
  afterEach(reset);

  /** Starts a claim and waits for its watch. */
  async function claim(args: {
    amount: bigint;
    route: Parameters<typeof import("../lib/faucet").fundFromFaucet>[0]["route"];
  }) {
    const { fundFromFaucet, encodeClaim } = await load();
    const sent = fundFromFaucet({ address: BURNER, ...args });
    await vi.waitFor(() => expect(world.observer).not.toBeNull());
    return { sent, observer: world.observer!, encodeClaim };
  }

  it("claims the exact PAS amount for the burner and resolves once broadcast", async () => {
    const { sent, observer, encodeClaim } = await claim({ amount: 5n, route: { tier: "pool" } });
    observer.next({ type: "signed", txHash: "0x01" });
    observer.next({ type: "broadcasted", txHash: "0x01" });

    await expect(sent).resolves.toBeUndefined();
    expect(world.proofs).toEqual([
      [
        "lite",
        { productId: PRODUCT_ID, suffix: { tag: "Index", value: Number(EPOCH) } },
        LITE_RING,
        MESSAGE,
      ],
    ]);
    expect(world.txArgs).toEqual({
      dest: CONTRACT.toLowerCase(),
      value: 0n,
      weight_limit: { ref_time: 1_500n, proof_size: 300n },
      storage_deposit_limit: 120n,
      data: encodeClaim({
        recipient: AccountId().enc(BURNER),
        asset: 0,
        amount: 5n,
        proof: PROOF,
        alias: ALIAS,
        ringIndex: 62,
        revision: 7,
      }),
    });
  });

  it("raises a stable claim to the asset's min_balance and names the asset", async () => {
    const { observer, encodeClaim } = await claim({
      amount: 5n,
      route: { tier: "pool", external: "USDT" },
    });
    observer.next({ type: "broadcasted", txHash: "0x01" });

    expect(world.txArgs?.data).toEqual(
      encodeClaim({
        recipient: AccountId().enc(BURNER),
        asset: TOKENS.USDT.assetHubId!,
        amount: 70_000n,
        proof: PROOF,
        alias: ALIAS,
        ringIndex: 62,
        revision: 7,
      }),
    );
  });

  it("refuses with the contract's error before anything is signed", async () => {
    world.claimRevert = "0x646cf558";
    const { fundFromFaucet } = await load();

    await expect(
      fundFromFaucet({ address: BURNER, amount: 5n, route: { tier: "pool" } }),
    ).rejects.toThrow("faucet claim refused: AlreadyClaimed");
    expect(world.txArgs).toBeNull();
  });

  it("rejects when the claim is refused before the broadcast", async () => {
    const { sent, observer } = await claim({ amount: 5n, route: { tier: "pool" } });
    observer.error(new Error("Invalid: Payment"));

    await expect(sent).rejects.toThrow("faucet claim refused: Invalid: Payment");
  });

  it("signs with the product account on the PGAS pipeline", async () => {
    const { observer } = await claim({ amount: 5n, route: { tier: "pool" } });
    observer.next({ type: "broadcasted", txHash: "0x01" });
    const signer = world.signer as {
      publicKey: Uint8Array;
      signTx(callData: Uint8Array, extensions: Record<string, unknown>): Promise<Uint8Array>;
    };

    const signed = await signer.signTx(new Uint8Array([1, 2]), {
      CheckGenesis: {
        identifier: "CheckGenesis",
        value: new Uint8Array(),
        additionalSigned: new Uint8Array([0xaa]),
      },
      CheckNonce: {
        identifier: "CheckNonce",
        value: new Uint8Array([4]),
        additionalSigned: new Uint8Array(),
      },
    });

    expect(signer.publicKey).toEqual(PRODUCT_KEY);
    expect(signed).toEqual(new Uint8Array([0x45, 0x01]));
    expect(world.createTransaction).toEqual([
      {
        signer: { dotNsIdentifier: PRODUCT_ID, derivationIndex: { tag: "Index", value: 0 } },
        genesisHash: "0xaa",
        callData: "0x0102",
        extensions: [
          { id: "CheckGenesis", extra: "0x", additionalSigned: "0xaa" },
          { id: "CheckNonce", extra: "0x04", additionalSigned: "0x" },
        ],
        txExtVersion: 1,
      },
    ]);
  });
});

describe("encodeClaim", () => {
  it("lays out claim's arguments with the proof as SCALE bytes", async () => {
    const { encodeClaim } = await load();
    const data = encodeClaim({
      recipient: new Uint8Array(32).fill(1),
      asset: 1984,
      amount: 70_000n,
      proof: PROOF,
      alias: ALIAS,
      ringIndex: 62,
      revision: 7,
    });
    const at = (slot: number) => toHex(data.slice(4 + 32 * slot, 4 + 32 * (slot + 1)));

    expect(toHex(data.slice(0, 4))).toBe("0xec7ebc62");
    expect(at(0)).toBe(toHex(word(1n)));
    expect(at(1)).toBe(toHex(new Uint8Array(32).fill(1)));
    expect(at(2)).toBe(toHex(word(1984n)));
    expect(at(3)).toBe(toHex(word(70_000n)));
    expect(at(4)).toBe(toHex(word(256n)));
    expect(at(5)).toBe(toHex(ALIAS));
    expect(at(6)).toBe(toHex(word(62n)));
    expect(at(7)).toBe(toHex(word(7n)));
    expect(at(8)).toBe(toHex(word(787n)));
    expect(toHex(data.slice(4 + 32 * 9, 4 + 32 * 9 + 2))).toBe("0x450c");
    expect(data.length).toBe(4 + 32 * 9 + 800);
  });
});
