import { ethereum, Bytes } from "@graphprotocol/graph-ts";
import { BigInt, Address } from "@graphprotocol/graph-ts";
import { VaultCreated, Factory as FactoryContract } from "../types/Factory/Factory";
import { Vault, Factory, FactoryState } from '../types/schema';
import { Vault as VaultContract } from "../types/Factory/Vault";
import { Vault as VaultTemplate } from "../types/templates";
import { FACTORY_ADDRESS, ZERO_BI } from "./helpers";
import { VaultSnapshot } from "../types/schema";


export function _createFactory(event: VaultCreated): Factory {
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
  return factory;
}

export function _createVault(event: VaultCreated, factory: Factory): Vault {
  /// Factory Info
  const bindedFactory = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS));
  const bindedVault = VaultContract.bind(event.params.vault);
  /// Vault
  let vault = new Vault(event.params.vault.toHexString()) as Vault;
  vault.factory = factory.id;
  vault.vault = event.params.vault;
  vault.creator = event.transaction.from;
  vault.share = event.params.share;
  const size = event.params.tokens.length;
  /// https://medium.com/protofire-blog/subgraph-development-part-2-handling-arrays-and-identifying-entities-30d63d4b1dc6
  const tmp = new Array<Bytes>(size);
  for (let x = 0; x < size; x++) tmp[x] = event.params.tokens[x];
  vault.tokens = tmp;
  vault.accManagementFeesToDAO = ZERO_BI;
  vault.accPerformanceFeesToDAO = ZERO_BI;
  vault.accManagementFeesToStrategists = ZERO_BI;
  vault.accPerformanceFeesToStrategists = ZERO_BI;
  vault.depositsCount = 0;
  vault.rebalancesCount = 0;
  vault.redemptionsCount = 0;

  // RoLes
  const vaultRoLes = bindedFactory.getRolesPerVault(event.params.vault);
  const admins = vaultRoLes.value1;
  const strategists = vaultRoLes.value2;
  const harvesters = vaultRoLes.value3;
  // Tokens
  const vaultState = bindedFactory.getVaultState(event.params.vault);
  const tokensArray = new Array<Bytes>(vaultState.value0.length);
  for (let x = 0; x < vaultState.value0.length; x++) tokensArray[x] = vaultState.value0[x].tokenAddress;
  vault.tokens = tokensArray;
  vault.constantProps = vaultState.value1;

  // State
  configProps: VaultConfigProps!
  securityProps: VaultSecurityProps!
  feesProps: VaultFeesProps!
  historyProps: VaultHistoryProps!
  balances: [BigInt!]!
  positions: [BigInt!]!
  tvl: BigInt!
  sharePrice: BigInt!
	# Fees - In shares
  ongoingPerformanceFees: BigInt!
  ongoingManagementFees: BigInt!


  vault.save();
  return vault;
}

export function handleCreateVault(event: VaultCreated): void {
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
  snapshot.save();
}

/**
 * New block handler
 * @notice We snapshot only every 600 blocks (on the BSC due to 3 seconds per blocks
 * @notice 3*600 = 1800 seconds = 30 min, and note that we can do 100 max requests without pagination)
 * @param block Current Block
 * @returns 
 */
export function handleNewBlock(block: ethereum.Block): void {
  const blockNumber = block.number;
  if (blockNumber.toI32() % 600 != 0) return;
  const factory = Factory.load(FACTORY_ADDRESS);
  if (factory === null) return;
  const factoryContract = FactoryContract.bind(Address.fromString(FACTORY_ADDRESS));
  const factoryState = factoryContract.getFactoryState();
  for (let x = 0; x < factoryState.value0.length; x++) {
    buildVaultSnapshot(factory, factoryState.value0[x], block, false);
    // Update State ?
  }
}
