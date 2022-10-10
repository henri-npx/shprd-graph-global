import { BigInt } from "@graphprotocol/graph-ts";

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let BI_18 = BigInt.fromI32(18);

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const FACTORY_ADDRESS = "0xc04ed88c05fcde0f94305598eb14f1624b091a5c";
export const LastSnapshotTimestampID = "LastSnapshotTimestampID";
export const SNAPSHOT_TIMEFRAME = BigInt.fromI32(60 * 60); // 1 hours in seconds