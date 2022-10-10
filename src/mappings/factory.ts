import { ethereum, Bytes } from "@graphprotocol/graph-ts";
import { BigInt, Address } from "@graphprotocol/graph-ts";
import {
  VaultCreated, Factory as FactoryContract, SetAccessManager,
  SetFeesManager,
  SetHarvester,
  SetSwapContracts,
  AddTokensAndPriceFeeds,
  RemoveTokensAndPriceFeeds,
  SetSwapAdapter,
} from "../types/Factory/Factory";
import { Vault, Factory, FactoryState, LastSnapshotTimestamp } from '../types/schema';
import { Vault as VaultContract } from "../types/Factory/Vault";
import { Vault as VaultTemplate } from "../types/templates";
import { FACTORY_ADDRESS, LastSnapshotTimestampID, ZERO_BI, SNAPSHOT_TIMEFRAME } from './helpers';
import { VaultSnapshot } from "../types/schema";

import { store } from '@graphprotocol/graph-ts'


/**
 * This function should be called only once at the first vault created, when the subgraph isn't yet deployed
 * @param event The vault creation event
 * @returns The create factory entity
 */
export function _createFactory(event: VaultCreated): Factory {
  console.log("_createFactory - CALL");
  const factory = new Factory(FACTORY_ADDRESS);
  factory.vaultCount = 0;
  const bindedFactory = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS));
  // Tokens
  const tokens = bindedFactory.getWhitelistedTokens();
  const tokensArray = new Array<Bytes>(tokens.length);
  for (let x = 0; x < tokens.length; x++) tokensArray[x] = tokens[x];
  factory.tokens = tokensArray;
  // Other Addresses
  factory.feesManager = bindedFactory.feesManager();
  factory.accessManager = bindedFactory.accessManager();
  factory.harvester = bindedFactory.harvester();
  factory.swapRouter = bindedFactory.swapRouter();
  factory.swapProxy = bindedFactory.swapProxy();
  factory.swapAdapter = bindedFactory.swapAdapter();
  factory.save();

  // Create LastSnapshotTimestamp - We should only have one entity of this type
  const lastSnapshotTimestamp = new LastSnapshotTimestamp(LastSnapshotTimestampID);
  lastSnapshotTimestamp.timestamp = event.block.timestamp;
  lastSnapshotTimestamp.save();

  return factory;
}

export const _updateVault = (vAddress: Address, vault: Vault, bindedFactory: FactoryContract, bindedVault: VaultContract): Vault => {
  console.log("_updateVault - CALL");

  // Update Vault Storage
  const tokensLength = bindedVault.tokensLength().toI32();
  const tokens = new Array<Bytes>(tokensLength);
  const tokensPriceFeedAddress = new Array<Bytes>(tokensLength); // String != string
  const tokensPriceFeedPrecision = new Array<BigInt>(tokensLength);
  const tokensDenominator = new Array<BigInt>(tokensLength);
  for (let x = 0; x < tokensLength; x++) {
    const tokenData = bindedVault.tokens(BigInt.fromI32(x));
    tokens[x] = tokenData.value0
    tokensPriceFeedAddress[x] = tokenData.value1;
    tokensPriceFeedPrecision[x] = BigInt.fromI32(tokenData.value2);
    tokensDenominator[x] = tokenData.value3;
  };
  vault.tokens = tokens;
  vault.tokensPriceFeedAddress = tokensPriceFeedAddress
  vault.tokensPriceFeedPrecision = tokensPriceFeedPrecision;
  vault.tokensDenominator = tokensDenominator;

  // RoLes
  const vaultRoLes = bindedFactory.getRolesPerVault(vAddress);
  const admins = new Array<string>(vaultRoLes.value1.length);
  const strategists = new Array<string>(vaultRoLes.value2.length);
  const harvesters = new Array<string>(vaultRoLes.value3.length);
  for (let x = 0; x < vaultRoLes.value1.length; x++) admins[x] = vaultRoLes.value1[x].toString();
  for (let x = 0; x < vaultRoLes.value2.length; x++) strategists[x] = vaultRoLes.value2[x].toString();
  for (let x = 0; x < vaultRoLes.value3.length; x++) harvesters[x] = vaultRoLes.value3[x].toString();

  // Config Props
  const configProps = bindedVault.getConfigProps();
  vault.paused = configProps.paused;
  vault.verified = configProps.verified;
  vault.name = configProps.name;
  vault.description = configProps.description;

  // Constant Props
  const constantProps = bindedVault.getConstantProps();
  vault.factoryAddress = constantProps.factory.toHexString();
  vault.createdAt = constantProps.createdAt;
  vault.share = constantProps.share.toString();

  // Fees Props
  const feesProps = bindedVault.getFeesProps();
  vault.beneficiary = feesProps.beneficiary; // Strange
  vault.exitFees = feesProps.exitFees;
  vault.managementFeesRate = feesProps.managementFeesRate;
  vault.managementFeesToStrategist = feesProps.managementFeesToStrategist;
  vault.performanceFeesRate = feesProps.performanceFeesRate;
  vault.performanceFeesToStrategist = feesProps.performanceFeesToStrategist;

  // History Props
  const historyProps = bindedVault.getHistoryProps();
  vault.highWaterMark = historyProps.highWaterMark;
  vault.prevRebalanceSignals = historyProps.prevRebalanceSignals;
  vault.prevSwap = historyProps.prevSwap;
  vault.prevMngHarvest = historyProps.prevMngHarvest;

  // Security Props
  const securityProps = bindedVault.getSecurityProps();
  vault.maxAUM = securityProps.maxAUM;
  vault.maxLossSwap = securityProps.maxLossSwap;
  vault.minAmountDeposit = securityProps.minAmountDeposit;
  vault.maxAmountDeposit = securityProps.maxAmountDeposit;
  vault.minFrequencySwap = securityProps.minFrequencySwap;
  vault.minSecurityTime = securityProps.minSecurityTime;
  vault.minHarvestThreshold = securityProps.minHarvestThreshold;

  // State Left
  const vaultState = bindedFactory.getVaultState(vAddress);
  vault.balances = vaultState.value6;
  vault.positions = vaultState.value7;
  vault.tvl = vaultState.value8;
  vault.sharePrice = vaultState.value9;
  const ongoingFees = vaultState.value10;
  vault.ongoingManagementFees = ongoingFees[0];
  vault.ongoingPerformanceFees = ongoingFees[1];

  vault.shareTransferability = false;

  return vault;
}

export function _createVault(event: VaultCreated, factory: Factory): Vault {
  console.log("_createVault - CALL");
  /// Factory Info
  const bindedFactory = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS));
  const bindedVault = VaultContract.bind(event.params.vault);
  /// Vault
  let vault = new Vault(event.params.vault.toHexString()) as Vault;
  vault.factory = factory.id;
  vault.vault = event.params.vault;
  vault.creator = event.transaction.from;
  // vault.share = event.params.share;
  // const size = event.params.tokens.length;
  /// https://medium.com/protofire-blog/subgraph-development-part-2-handling-arrays-and-identifying-entities-30d63d4b1dc6
  // const tmp = new Array<Bytes>(size);
  // for (let x = 0; x < size; x++) tmp[x] = event.params.tokens[x];
  // vault.tokens = tmp;
  vault.accManagementFeesToDAO = ZERO_BI;
  vault.accPerformanceFeesToDAO = ZERO_BI;
  vault.accManagementFeesToStrategists = ZERO_BI;
  vault.accPerformanceFeesToStrategists = ZERO_BI;
  vault.depositsCount = 0;
  vault.rebalancesCount = 0;
  vault.redemptionsCount = 0;
  const updatedVault = _updateVault(event.params.vault, vault, bindedFactory, bindedVault);
  // Save ...
  vault.save();
  return vault;
}

export function handleCreateVault(event: VaultCreated): void {
  console.log("handleCreateVault - CALL");
  // Factory (created when the first vault is created)
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) factory = _createFactory(event);


  factory.vaultCount = factory.vaultCount + 1;
  factory.save();
  // Vault
  const vault = _createVault(event, factory);
  VaultTemplate.create(event.params.vault);
  vault.save();
  factory.save();
}

export function buildVaultSnapshot(
  factory: Factory,
  vaultAddress: Address,
  block: ethereum.Block,
  triggeredByEvent: boolean,
): void {
  console.log("buildVaultSnapshot - CALL");
  const vault = VaultContract.bind(vaultAddress);
  const entityName = FACTORY_ADDRESS + "-" + vaultAddress.toHexString() + "-" + block.number.toString();
  const status = vault.getVaultStatus();
  const tokensLength = vault.tokensLength().toI32();
  const assetsPrices = new Array<BigInt>(tokensLength);
  const newTokens = new Array<Bytes>(tokensLength);

  for (let y = 0; y < tokensLength; y++) {
    const asset = vault.tokens(BigInt.fromI32(y));
    const price = vault.getLatestPrice(asset.value1);
    assetsPrices[y] = price;
    newTokens[y] = asset.value0;
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

  // TODO
  // _updateVault ? 

  snapshot.save();
}

export function handleSetAccessManager(event: SetAccessManager): void {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return; // Not possible
  factory.save();
}

export function handleSetFeesManager(event: SetFeesManager): void {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return; // Not possible
  factory.save();
}

export function handleSetHarvester(event: SetHarvester): void {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return; // Not possible
  factory.save();

}

export function handleSetSwapContracts(event: SetSwapContracts): void {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return; // Not possible
  factory.swapProxy = event.params.newSwapProxy;
  factory.swapRouter = event.params.newSwapRouter;
  factory.save();
}

export function handleAddTokensAndPriceFeeds(event: AddTokensAndPriceFeeds): void {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return; // Not possible
  const factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS));
  const currentTokens = factoryContract.getWhitelistedTokens();  // Post Remove
  const tmp = new Array<Bytes>(currentTokens.length);
  for (let x = 0; x < currentTokens.length; x++) tmp[x] = currentTokens[x];
  factory.tokens = tmp;
  factory.save();
}

export function handleRemoveTokensAndPriceFeeds(event: RemoveTokensAndPriceFeeds): void {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return; // Not possible
  const factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS));
  const currentTokens = factoryContract.getWhitelistedTokens();  // Post Remove
  const tmp = new Array<Bytes>(currentTokens.length);
  for (let x = 0; x < currentTokens.length; x++) tmp[x] = currentTokens[x];
  factory.tokens = tmp;
  factory.save();
}

export function handleSetSwapAdapter(event: SetSwapAdapter): void {
  let factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return; // Not possible
  factory.swapAdapter = event.params.newSwapAdapter;
  factory.save();
}


/**
 * New block handler
 * @notice We snapshot only every 30 minutes
 * @param block Current Block
 * @returns 
 */
export function handleNewBlock(block: ethereum.Block): void {

  console.log("handleNewBlock");

  // Snapshot Timeframe
  const lastSnap = store.get("LastSnapshotTimestamp", LastSnapshotTimestampID);
  if (lastSnap == null) return; // Error !
  const lastSnapTimestamp = lastSnap.getBigInt("timestamp");
  const currentTime = block.timestamp;
  const elaspedTime = currentTime.minus(lastSnapTimestamp)
  if (elaspedTime.le(SNAPSHOT_TIMEFRAME)) return;
  lastSnap.setBigInt("timestamp", currentTime);

  // const blockNumber = block.number;
  // if (blockNumber.toI32() % 600 != 0) return;

  const factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return;
  const factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS));
  const factoryState = factoryContract.getFactoryState();
  for (let x = 0; x < factoryState.value0.length; x++) {
    const vAddress = factoryState.value0[x]
    buildVaultSnapshot(factory, vAddress, block, false);
    // Update State :
    let vault = Vault.load(vAddress.toString());
    let bindedVault = VaultContract.bind(vAddress);
    // updateVault(vAddress, vault, factoryContract, bindedVault);
  }

}
