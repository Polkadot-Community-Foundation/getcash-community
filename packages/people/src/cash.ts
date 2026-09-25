// The coinage underlying on PCF devnet People (Paseo): asset 50000413 on Paseo Asset Hub
// (para 1000), held on People as a foreign asset keyed by its reserve Location.

import { XcmV5Junction, XcmV5Junctions } from "@polkadot-api/descriptors";

/** The opaque SettlementAsset foreign id the People port maps by default. */
export const CASH_FOREIGN_ID = "cash";

/** CASH has 6 decimals. */
export const CASH_DECIMALS = 6;

/** The Assets-pallet key for CASH on People: its Asset Hub reserve Location. */
export const CASH_LOCATION = {
  parents: 1,
  interior: XcmV5Junctions.X3([
    XcmV5Junction.Parachain(1000),
    XcmV5Junction.PalletInstance(50),
    XcmV5Junction.GeneralIndex(50_000_413n),
  ]),
};

/** The SettlementAsset a CASH handoff budget uses (pairs with createPeopleChainPort). */
export const CASH_SETTLEMENT = { kind: "foreign", id: CASH_FOREIGN_ID } as const;
