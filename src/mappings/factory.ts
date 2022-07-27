import { ByteArray, log, DataSourceTemplate, DataSourceContext, ethereum, Bytes } from "@graphprotocol/graph-ts";
import { BigInt, BigDecimal, store, Address } from "@graphprotocol/graph-ts";

import { VaultCreated, Factory as FactoryContract } from "../types/Factory/Factory";

import { Vault, Factory } from "../types/schema";

import { Vault as VaultContract } from "../types/Factory/Vault";

import { Vault as VaultTemplate } from "../types/templates";

import { FACTORY_ADDRESS, ZERO_BI } from "./helpers";

import { VaultSnapshot } from "../types/schema";

export function handleCreateVault(event: VaultCreated): void {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) {
    factory = new Factory(FACTORY_ADDRESS);
    factory.vaultCount = 0;
  }
  factory.vaultCount = factory.vaultCount + 1;
  factory.save();

  // log.info("handleCreateVault ! 1", []);

  let vault = new Vault(event.params.vault.toHexString()) as Vault;
  vault.factory = factory.id;
  vault.vault = event.params.vault;
  vault.creator = event.transaction.from;
  vault.share = event.params.share;

  // log.info("handleCreateVault ! 2", []);

  const size = event.params.tokens.length;
  const tmp = new Array<Bytes>(size); // https://medium.com/protofire-blog/subgraph-development-part-2-handling-arrays-and-identifying-entities-30d63d4b1dc6
  for (let x = 0; x < size; x++) tmp[x] = event.params.tokens[x];
  vault.tokens = tmp;

  vault.accManagementFeesToDAO = ZERO_BI;
  vault.accPerformanceFeesToDAO = ZERO_BI;
  vault.accManagementFeesToStrategists = ZERO_BI;
  vault.accPerformanceFeesToStrategists = ZERO_BI;

  vault.depositsCount = 0;
  vault.rebalancesCount = 0;
  vault.redemptionsCount = 0;

  // log.info("handleCreateVault ! 3", []);

  vault.save();

  // log.info("handleCreateVault ! 4", []);

  VaultTemplate.create(event.params.vault);

  // log.info("handleCreateVault ! 5", []);

  factory.save();
}

export function buildVaultSnapshot(
  factory: Factory,
  vaultAddress: Address,
  block: ethereum.Block,
  triggeredByEvent: boolean,
): void {
  const vault = VaultContract.bind(vaultAddress);
  const entityName = FACTORY_ADDRESS + "-" + vaultAddress.toHexString() + "-" + block.number.toString();
  const status = vault.getVaultStatus();

  /// assetsPrices + assets addresses + assetsBalances
  const tokensLength = vault.tokensLength().toI32();
  const assetsPrices = new Array<BigInt>(tokensLength);
  const newTokens = new Array<Bytes>(tokensLength); // https://medium.com/protofire-blog/subgraph-development-part-2-handling-arrays-and-identifying-entities-30d63d4b1dc6

  for (let y = 0; y < tokensLength; y++) {
    const asset = vault.tokens(BigInt.fromI32(y));
    const price = vault.getLatestPrice(asset.value1); // value 0 = address of price feed
    assetsPrices[y] = price;
    newTokens[y] = asset.value0; // Token Address
  }

  const assetsBalances = vault.getVaultBalances();
  const snapshot = new VaultSnapshot(entityName);

  snapshot.factory = factory.id;
  snapshot.vault = vaultAddress.toHexString();

  snapshot.assetsBalances = assetsBalances;
  snapshot.assetsPrices = assetsPrices;
  snapshot.tokens = newTokens;

  snapshot.positions = status.value0;
  snapshot.tvl = status.value1;
  snapshot.sharePrice = status.value2;

  snapshot.pendingPerfFees = vault.getManagementFees().value0;
  snapshot.pendingMngFees = vault.getPerformanceFees().value0;
  snapshot.timestamp = block.timestamp;
  snapshot.triggeredByEvent = triggeredByEvent;
  snapshot.save();
}

export function handleNewBlock(block: ethereum.Block): void {
  const blockNumber = block.number;
  if (blockNumber.toI32() % 600 != 0) return;
  // We snapshot only every 600 blocks (on the BSC due to 3 seconds per blocks
  // 3*600 = 1800 seconds = 30 min, and note that we can do 100 max requests without pagination)
  const factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return;
  const factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS));
  const factoryState = factoryContract.getFactoryState();
  for (let x = 0; x < factoryState.value0.length; x++) {
    buildVaultSnapshot(factory, factoryState.value0[x], block, false);
  }
}

/// Pro Tips

/// As a side note, the toHex() and toHexString() methods — commonly used to generate IDs out of addresses or hashes —
/// return a lowercase string. This means, when you query a subgraph for entities,
/// the ID string provided should be lowercase as the query is case-sensitive.
