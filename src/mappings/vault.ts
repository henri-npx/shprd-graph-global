import {
	Factory,
	Vault,
	Deposit,
	Rebalance,
	Redeem,
	HarvestPerformanceFees,
	HarvestManagementFees,
} from "../types/schema";
import { buildVaultSnapshot } from "./factory";

import {
	Vault as VaultContract,
	Deposit as DepositEvent,
	Rebalance as RebalanceEvent,
	Redeem as RedeemEvent,
	HarvestManagementFees as HarvestManagementFeesEvent,
	HarvestPerformanceFees as HarvestPerformanceFeesEvent,
	AddAsset as AddAssetEvent,
} from "../types/Factory/Vault";
import { Address, BigInt, Bytes } from "@graphprotocol/graph-ts";
import { FACTORY_ADDRESS } from "./helpers";

export function handleDeposit(event: DepositEvent): void {
	const factory = Factory.load(FACTORY_ADDRESS);
	if (factory === null) return;

	let vault = Vault.load(event.address.toHexString());
	if (vault == null) return;
	const deposit = new Deposit(event.transaction.hash.toHexString()) as Deposit;
	deposit.vault = vault.id;
	deposit.from = event.transaction.from;
	deposit.sharesMinted = event.params.sharesMinted;
	deposit.baseTokenAmountIn = event.params.baseTokenAmountIn;
	deposit.timestamp = event.block.timestamp;
	// Storage Reads
	const vaultContract = VaultContract.bind(event.address);
	const vaultStatusAfter = vaultContract.getVaultStatus();
	deposit.sharePriceAfter = vaultStatusAfter.value2;
	// Save
	deposit.save();
	vault.depositsCount = vault.depositsCount + 1;
	vault.save();
	buildVaultSnapshot(factory, Address.fromString(vault.id), event.block, true);
}

export function handleRebalance(event: RebalanceEvent): void {
	const factory = Factory.load(FACTORY_ADDRESS);
	if (factory === null) return;

	let vault = Vault.load(event.address.toHexString());
	if (vault == null) return;
	const newRebalance = new Rebalance(event.transaction.hash.toHexString()) as Rebalance;
	newRebalance.vault = vault.id;
	newRebalance.from = event.transaction.from;
	newRebalance.currentSignals = event.params.currentSignals;
	newRebalance.desiredSignals = event.params.desiredSignals;
	newRebalance.timestamp = event.block.timestamp;

	// Storage Reads
	const vaultContract = VaultContract.bind(event.address);
	const vaultStatusAfter = vaultContract.getVaultStatus();
	newRebalance.recordedSignals = vaultStatusAfter.value0;
	newRebalance.sharePriceAfter = vaultStatusAfter.value2;

	// Save
	newRebalance.save();
	vault.rebalancesCount = vault.rebalancesCount + 1;
	vault.save();
	buildVaultSnapshot(factory, Address.fromString(vault.id), event.block, true);
}

// How to compute exit fees ?

export function handleRedeem(event: RedeemEvent): void {
	const factory = Factory.load(FACTORY_ADDRESS);
	if (factory === null) return;

	let vault = Vault.load(event.address.toHexString());
	if (vault == null) return;
	const newRedeem = new Redeem(event.transaction.hash.toHexString()) as Redeem;
	newRedeem.vault = vault.id;
	newRedeem.from = event.transaction.from;
	newRedeem.shareBurned = event.params.shareBurned;
	newRedeem.amountReceived = event.params.amountReceived;
	newRedeem.timestamp = event.block.timestamp;

	// Storage Reads
	const vaultContract = VaultContract.bind(event.address);
	const vaultStatusAfter = vaultContract.getVaultStatus();
	newRedeem.sharePriceAfter = vaultStatusAfter.value2;

	newRedeem.save();
	vault.redemptionsCount = vault.redemptionsCount + 1;
	vault.save();
	buildVaultSnapshot(factory, Address.fromString(vault.id), event.block, true);
}

export function handleHarvestManagementFees(event: HarvestManagementFeesEvent): void {
	const factory = Factory.load(FACTORY_ADDRESS);
	if (factory === null) return;

	let vault = Vault.load(event.address.toHexString());
	if (vault == null) return;
	const newManagementFeesHarvest = new HarvestManagementFees(event.transaction.hash.toHexString());
	const feesToDAO = event.params.amountToDAO;
	const feesToStrategist = event.params.amountToStrategist;
	newManagementFeesHarvest.from = event.transaction.from;
	newManagementFeesHarvest.amountToDAO = feesToDAO;
	newManagementFeesHarvest.amountToStrategist = feesToStrategist;
	newManagementFeesHarvest.timestamp = event.block.timestamp;
	newManagementFeesHarvest.vault = vault.id;
	vault.accManagementFeesToDAO = vault.accManagementFeesToDAO.plus(feesToDAO);
	vault.accManagementFeesToStrategists = vault.accManagementFeesToStrategists.plus(feesToStrategist);
	newManagementFeesHarvest.save();
	vault.save();
	buildVaultSnapshot(factory, Address.fromString(vault.id), event.block, true);
}

export function handleHarvestPerformanceFees(event: HarvestPerformanceFeesEvent): void {
	const factory = Factory.load(FACTORY_ADDRESS);
	if (factory === null) return;

	let vault = Vault.load(event.address.toHexString());
	if (vault == null) return;
	const feesToDAO = event.params.amountToDAO;
	const feesToStrategist = event.params.amountToStrategist;
	const newPerformanceFeesHarvest = new HarvestPerformanceFees(event.transaction.hash.toHexString());
	newPerformanceFeesHarvest.vault = vault.id;
	newPerformanceFeesHarvest.from = event.transaction.from;
	newPerformanceFeesHarvest.amountToDAO = feesToDAO;
	newPerformanceFeesHarvest.amountToStrategist = feesToStrategist;
	newPerformanceFeesHarvest.timestamp = event.block.timestamp;
	vault.accPerformanceFeesToDAO = vault.accPerformanceFeesToDAO.plus(feesToDAO);
	vault.accPerformanceFeesToStrategists = vault.accPerformanceFeesToStrategists.plus(feesToStrategist);
	newPerformanceFeesHarvest.save();
	vault.save();
	buildVaultSnapshot(factory, Address.fromString(vault.id), event.block, true);
}



/**
 * No entity are created here, only the vault is modified
 * @param event Add Asset Event from Vault
 * @returns 
 */
export function handleAddAsset(event: AddAssetEvent): void {
	const factory = Factory.load(FACTORY_ADDRESS);
	if (factory === null) return;
	const entity = Vault.load(event.address.toHexString());
	if (entity == null) return;
	const storage = VaultContract.bind(Address.fromString(event.address.toHexString()));
	const tokensLength = storage.tokensLength().toI32();
	// At this point, the new token is added so length is true
	const newTokens = new Array<Bytes>(tokensLength); // https://medium.com/protofire-blog/subgraph-development-part-2-handling-arrays-and-identifying-entities-30d63d4b1dc6
	for (let x = 0; x < tokensLength; x++) {
		const token = storage.tokens(BigInt.fromI32(x));
		newTokens[x] = token.value0; // Token Address
	}
	entity.tokens = newTokens;
	entity.save();
	buildVaultSnapshot(factory, Address.fromString(entity.id), event.block, true);
}
