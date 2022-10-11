import { BigInt } from "@graphprotocol/graph-ts";

export let ZERO_BI = BigInt.fromI32(0);
export let ONE_BI = BigInt.fromI32(1);
export let BI_18 = BigInt.fromI32(18);

export const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000";
export const FACTORY_ADDRESS = "0x50BaaA1668080fC7FecdE90690f4b85a04F2580F";
export const SNAPSHOT_TIMEFRAME = BigInt.fromI32(60 * 60); // 1H