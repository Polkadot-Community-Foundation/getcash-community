// TODO(production): remove; the deposit is the provider's to make, not the app's.
//
// Demo faucet: Skip has a faucet contract on Asset Hub pay the burner's deposit address the
// route's deposit asset, PAS on the native pool tier, dotUSD on the dotUSD tier and USDt or USDC
// on the stable tiers, in the exact amount, against a lite personhood proof. VITE_FAUCET_CONTRACT
// names the contract (`claim` of paseo-network/paseo-faucet), deployed with getcash's product id.
// The claim is signed by getcash's product account with its fee paid in PGAS, so nothing secret
// ships in the bundle.

import { depositTokenOf, type ConversionRoute } from "@getsome/funding";
import { proveLitePersonhood } from "@getsome/host";
import {
  formatHostError,
  getAccountsProvider,
  getTruApi,
  type ProductAccount,
} from "@parity/product-sdk-host";
import { paseo_next_v2 } from "@polkadot-api/descriptors";
import { AccountId, type PolkadotSigner, type Transaction, type TypedApi } from "polkadot-api";
import { fromHex, toHex } from "polkadot-api/utils";
import { ASSET_HUB, connectChain } from "./host-chain";

const CONTRACT: string | undefined = import.meta.env.VITE_FAUCET_CONTRACT;

/** The contract pays asset 0 as PAS and any other id as that pallet-assets token. */
const NATIVE_ASSET = 0;
/** `Tier.Lite`: getcash proves with the person's people-lite key. */
const LITE_TIER = 1n;
/** Asset Hub's transaction extension version whose pipeline pays the fee in PGAS. */
const PGAS_EXTENSION_VERSION = 1;
/** Headroom over the dry run's weight and storage deposit, in percent. */
const LIMIT_HEADROOM = 150n;
/** The `flags` bit of a contract call that reverted. */
const REVERTED = 1;

const SELECTOR = {
  productId: "0xc5ce3911",
  currentEpoch: "0x76671808",
  claimMessageFor: "0xc456bad4",
  claim: "0xec7ebc62",
} as const;

/** The contract's errors by selector, as `claim` reverts with them. */
const CLAIM_ERRORS: Readonly<Record<string, string>> = {
  "0xdbaf6b0e": "FaucetPaused",
  "0xc97d95cf": "UnknownAsset",
  "0xa77cefcd": "ClaimTooLarge",
  "0xc45cb513": "AllowanceExceeded",
  "0x3f2b1511": "EpochCapReached",
  "0x646cf558": "AlreadyClaimed",
  "0x356680b7": "InsufficientFunds",
  "0x09bde339": "InvalidProof",
  "0x3b1ab104": "PayoutFailed",
};

export function isFaucetConfigured(): boolean {
  return typeof CONTRACT === "string" && /^0x[0-9a-fA-F]{40}$/.test(CONTRACT.trim());
}

type TransferWatch = ReturnType<Transaction["signSubmitAndWatch"]>;
type AssetHubApi = TypedApi<typeof paseo_next_v2>;
type TruApi = NonNullable<Awaited<ReturnType<typeof getTruApi>>>;

/** Resolves once the claim is broadcast, and rejects when it is refused before. The watch stays
 *  subscribed, so that the claim keeps being broadcast, but nothing after the broadcast is read. */
function broadcast(watch: TransferWatch): Promise<void> {
  return new Promise((resolve, reject) => {
    const refused = (reason: string) => reject(new Error(`faucet claim refused: ${reason}`));
    watch.subscribe({
      next: (event) => {
        if (event.type === "broadcasted") resolve();
      },
      error: (error: unknown) => refused(error instanceof Error ? error.message : String(error)),
      complete: () => refused("the watch ended before the broadcast"),
    });
  });
}

/** Claims `amount` of the route's deposit asset, in that asset's base units, for `address` on
 *  Asset Hub, and resolves once the claim is broadcast. On the stable tiers an amount under the
 *  asset's `min_balance`, 70_000 for USDt and USDC, is raised to it: a smaller deposit would not
 *  create the burner's asset account, and nothing would land. */
export async function fundFromFaucet(args: {
  address: string;
  amount: bigint;
  route: ConversionRoute;
}): Promise<void> {
  if (!isFaucetConfigured()) {
    throw new Error("faucet not configured: set VITE_FAUCET_CONTRACT to the faucet's address");
  }
  const contract = CONTRACT!.trim().toLowerCase() as `0x${string}`;
  const accounts = await getAccountsProvider();
  const truApi = await getTruApi();
  if (accounts === null || truApi === null) throw new Error("the faucet needs a Host");
  // connectChain returns the shared cached client; never destroy it.
  const api = (await connectChain(ASSET_HUB)).getTypedApi(paseo_next_v2);
  const faucet = new FaucetContract(api, contract);

  const token = depositTokenOf(args.route);
  const asset = token.assetHubId ?? NATIVE_ASSET;
  let amount = args.amount;
  if (token.assetHubId !== undefined) {
    const minBalance = (await api.query.Assets.Asset.getValue(token.assetHubId))?.min_balance ?? 0n;
    if (amount < minBalance) amount = minBalance;
  }

  const productId = decodeString(await faucet.read(SELECTOR.productId));
  const epoch = decodeWord(await faucet.read(SELECTOR.currentEpoch));
  const recipient = AccountId().enc(args.address);
  const message = decodeBytes(
    await faucet.read(
      SELECTOR.claimMessageFor,
      word(epoch),
      recipient,
      word(BigInt(asset)),
      word(amount),
    ),
  );
  const proof = await proveLitePersonhood(
    {
      listRingVrfKeys: async (owner) => accounts.listRingVrfKeys(owner),
      createRingVRFProof: async (...proofArgs: Parameters<typeof accounts.createRingVRFProof>) =>
        accounts.createRingVRFProof(...proofArgs),
    },
    productId,
    message,
    Number(epoch),
  );
  const data = encodeClaim({
    recipient,
    asset,
    amount,
    proof: proof.proof,
    alias: proof.alias,
    ringIndex: proof.ringIndex,
    revision: proof.ringRevision,
  });
  const limits = await faucet.dryRun(data);

  const account = await accounts.getProductAccount(productId, 0);
  if (account.isErr()) {
    throw new Error(`the Host has no product account: ${formatHostError(account.error)}`);
  }
  const tx = api.tx.Revive.call({
    dest: contract,
    value: 0n,
    weight_limit: limits.weight,
    storage_deposit_limit: limits.storageDeposit,
    data,
  });
  return broadcast(tx.signSubmitAndWatch(pgasSigner(truApi, account.value)));
}

/** Calls to the faucet through `ReviveApi.call`, made as the contract's own Ethereum-derived
 *  account: that account is always mapped, unlike a product account the Host has not funded with
 *  PGAS yet. */
class FaucetContract {
  private readonly origin: string;

  constructor(
    private readonly api: AssetHubApi,
    private readonly contract: `0x${string}`,
  ) {
    this.origin = AccountId().dec(concat(fromHex(contract), new Uint8Array(12).fill(0xee)));
  }

  async read(selector: string, ...words: Uint8Array[]): Promise<Uint8Array> {
    return (await this.call(concat(fromHex(selector), ...words))).data;
  }

  /** Dry-runs `claim`, so that a refusal surfaces before anything is signed, and sizes its
   *  limits. */
  async dryRun(data: Uint8Array): Promise<{
    weight: { ref_time: bigint; proof_size: bigint };
    storageDeposit: bigint;
  }> {
    const { weight, deposit } = await this.call(data);
    return {
      weight: {
        ref_time: (weight.ref_time * LIMIT_HEADROOM) / 100n,
        proof_size: (weight.proof_size * LIMIT_HEADROOM) / 100n,
      },
      storageDeposit: (deposit * LIMIT_HEADROOM) / 100n,
    };
  }

  private async call(data: Uint8Array): Promise<{
    data: Uint8Array;
    weight: { ref_time: bigint; proof_size: bigint };
    deposit: bigint;
  }> {
    const dry = await this.api.apis.ReviveApi.call(
      this.origin,
      this.contract,
      0n,
      undefined,
      undefined,
      data,
    );
    if (!dry.result.success) {
      throw new Error(`faucet claim refused: ${describe(dry.result.value)}`);
    }
    if ((dry.result.value.flags & REVERTED) !== 0) {
      const selector = toHex(dry.result.value.data.slice(0, 4));
      throw new Error(`faucet claim refused: ${CLAIM_ERRORS[selector] ?? `reverted ${selector}`}`);
    }
    return {
      data: dry.result.value.data,
      weight: dry.weight_required,
      deposit: dry.storage_deposit.type === "Charge" ? dry.storage_deposit.value : 0n,
    };
  }
}

function describe(value: unknown): string {
  return JSON.stringify(value, (_, v: unknown) => (typeof v === "bigint" ? v.toString() : v));
}

/** Signs on Asset Hub's PGAS pipeline: getcash's product account holds PGAS, not PAS. The Host
 *  builds the transaction from the extensions it is handed, for the extension version asked. */
export function pgasSigner(truApi: TruApi, account: ProductAccount): PolkadotSigner {
  return {
    publicKey: account.publicKey,
    async signTx(callData, signedExtensions) {
      const checkGenesis = signedExtensions.CheckGenesis;
      if (!checkGenesis) throw new Error("the claim has no genesis hash");
      const response = await truApi.signing.createTransaction({
        signer: {
          dotNsIdentifier: account.dotNsIdentifier,
          derivationIndex: { tag: "Index", value: account.derivationIndex },
        },
        genesisHash: hex(checkGenesis.additionalSigned),
        callData: hex(callData),
        extensions: Object.values(signedExtensions).map((ext) => ({
          id: ext.identifier,
          extra: hex(ext.value),
          additionalSigned: hex(ext.additionalSigned),
        })),
        txExtVersion: PGAS_EXTENSION_VERSION,
      });
      if (response.isErr()) {
        throw new Error(`the Host did not sign the claim: ${formatHostError(response.error)}`);
      }
      return fromHex(response.value.transaction);
    },
    signBytes() {
      return Promise.reject(new Error("the faucet signer signs claims only"));
    },
  };
}

/** `claim(uint8,bytes32,uint32,uint128,bytes,bytes32,uint32,uint32)` calldata. The proof goes
 *  in SCALE form, its compact length first, as the contract forwards it to the precompile. */
export function encodeClaim(claim: {
  recipient: Uint8Array;
  asset: number;
  amount: bigint;
  proof: Uint8Array;
  alias: Uint8Array;
  ringIndex: number;
  revision: number;
}): Uint8Array {
  const proof = concat(compactLength(claim.proof.length), claim.proof);
  const head = [
    word(LITE_TIER),
    claim.recipient,
    word(BigInt(claim.asset)),
    word(claim.amount),
    word(8n * 32n),
    claim.alias,
    word(BigInt(claim.ringIndex)),
    word(BigInt(claim.revision)),
  ];
  return concat(fromHex(SELECTOR.claim), ...head, word(BigInt(proof.length)), padded(proof));
}

const hex = (bytes: Uint8Array) => toHex(bytes) as `0x${string}`;

/** A big-endian 32-byte ABI word. */
function word(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let rest = value;
  for (let i = 31; i >= 0 && rest > 0n; i--) {
    out[i] = Number(rest & 0xffn);
    rest >>= 8n;
  }
  return out;
}

function decodeWord(data: Uint8Array, offset = 0): bigint {
  let value = 0n;
  for (const byte of data.subarray(offset, offset + 32)) value = (value << 8n) | BigInt(byte);
  return value;
}

/** An ABI-encoded `bytes` return value. */
function decodeBytes(data: Uint8Array): Uint8Array {
  const offset = Number(decodeWord(data));
  const length = Number(decodeWord(data, offset));
  return data.slice(offset + 32, offset + 32 + length);
}

function decodeString(data: Uint8Array): string {
  return new TextDecoder().decode(decodeBytes(data));
}

function padded(bytes: Uint8Array): Uint8Array {
  return concat(bytes, new Uint8Array((32 - (bytes.length % 32)) % 32));
}

/** SCALE compact encoding of a length below 2^30. */
function compactLength(length: number): Uint8Array {
  if (length < 1 << 6) return new Uint8Array([length << 2]);
  if (length < 1 << 14) return new Uint8Array([((length << 2) | 1) & 0xff, length >> 6]);
  const value = (length << 2) | 2;
  return new Uint8Array([value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, value >>> 24]);
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}
