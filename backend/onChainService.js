
const { ethers } = require('ethers');
const { sequelize, Trade } = require('./db');

// --- Configuration ---
// This should ideally be in a config file, but we'll keep it here for simplicity.
const contractAddress = "0x4d8ca72AD2352fF5B52FB3a14cC34529150c0506";
const contractABI = [
    {
      "anonymous": false,
      "inputs": [
        { "indexed": false, "internalType": "uint256", "name": "userId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "redemptionRuleId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "reward", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
      ],
      "name": "RedemptionLogged",
      "type": "event"
    },
    {
      "anonymous": false,
      "inputs": [
        { "indexed": false, "internalType": "string", "name": "tradeId", "type": "string" },
        { "indexed": false, "internalType": "uint256", "name": "fromUserId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "toUserId", "type": "uint256" },
        { "indexed": false, "internalType": "uint256", "name": "timestamp", "type": "uint256" }
      ],
      "name": "TradeLogged",
      "type": "event"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "_userId", "type": "uint256" },
        { "internalType": "uint256", "name": "_redemptionRuleId", "type": "uint256" },
        { "internalType": "uint256", "name": "_reward", "type": "uint256" }
      ],
      "name": "addRedemption",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "string", "name": "_tradeId", "type": "string" },
        { "internalType": "uint256", "name": "_fromUserId", "type": "uint256" },
        { "internalType": "uint256", "name": "_toUserId", "type": "uint256" },
        { "internalType": "uint256", "name": "_commodityId", "type": "uint256" },
        { "internalType": "uint256", "name": "_quantity", "type": "uint256" },
        { "internalType": "uint256", "name": "_price", "type": "uint256" }
      ],
      "name": "addTrade",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getRedemptionCount",
      "outputs": [
        { "internalType": "uint256", "name": "", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [],
      "name": "getTradeCount",
      "outputs": [
        { "internalType": "uint256", "name": "", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "", "type": "uint256" }
      ],
      "name": "redemptionHistory",
      "outputs": [
        { "internalType": "uint256", "name": "userId", "type": "uint256" },
        { "internalType": "uint256", "name": "redemptionRuleId", "type": "uint256" },
        { "internalType": "uint256", "name": "reward", "type": "uint256" },
        { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        { "internalType": "uint256", "name": "", "type": "uint256" }
      ],
      "name": "tradeHistory",
      "outputs": [
        { "internalType": "string", "name": "tradeId", "type": "string" },
        { "internalType": "uint256", "name": "fromUserId", "type": "uint256" },
        { "internalType": "uint256", "name": "toUserId", "type": "uint256" },
        { "internalType": "uint256", "name": "commodityId", "type": "uint256" },
        { "internalType": "uint256", "name": "quantity", "type": "uint256" },
        { "internalType": "uint256", "name": "price", "type": "uint256" },
        { "internalType": "uint256", "name": "timestamp", "type": "uint256" }
      ],
      "stateMutability": "view",
      "type": "function"
    }
];
const provider = new ethers.JsonRpcProvider('http://127.0.0.1:8545');

/**
 * Finds all successful trades that are not yet on-chain and migrates them.
 */
async function batchOnChainTrades() {
  console.log('[OnChainService] Starting batch migration of trades...');

  let transaction;
  try {
    // Use a transaction to ensure data consistency.
    // If any on-chain transaction fails, we can roll back the DB updates.
    transaction = await sequelize.transaction();

    // 1. Get a signer from Ganache
    const signer = await provider.getSigner(0);
    const contract = new ethers.Contract(contractAddress, contractABI, signer);
    console.log(`[OnChainService] Connected to DataRegistry contract at: ${contractAddress}`);

    // 2. Fetch successful trades that are not yet on-chain
    const tradesToMigrate = await Trade.findAll({
      where: {
        status: 'successful',
        onChain: false,
      },
      transaction,
    });

    if (tradesToMigrate.length === 0) {
      console.log('[OnChainService] No new successful trades to migrate.');
      await transaction.commit();
      return;
    }

    console.log(`[OnChainService] Found ${tradesToMigrate.length} trades to migrate.`);

    // 3. Iterate and send transactions to the smart contract
    let migratedCount = 0;
    for (const trade of tradesToMigrate) {
      try {
        console.log(`[OnChainService] Migrating trade ID: ${trade.id}...`);
        
        const priceAsUint = Math.round(trade.price * 100);

        const tx = await contract.addTrade(
          trade.id,
          trade.fromUserId,
          trade.toUserId,
          trade.commodityId,
          trade.quantity,
          priceAsUint
        );

        await tx.wait(); // Wait for the transaction to be mined

        // 4. IMPORTANT: Update the trade record in the database to mark it as on-chain
        await trade.update({ onChain: true }, { transaction });

        console.log(`[OnChainService]   -> Success! Tx hash: ${tx.hash}`);
        migratedCount++;
      } catch (error) {
        console.error(`[OnChainService]   -> Failed to migrate trade ID: ${trade.id}. Error: ${error.message}`);
        // If one trade fails, we might want to stop or continue.
        // For now, we'll log the error and continue with the next one.
      }
    }

    await transaction.commit();

    console.log('[OnChainService] --- Migration Summary ---');
    console.log(`[OnChainService] Successfully migrated trades: ${migratedCount}/${tradesToMigrate.length}`);
    console.log('[OnChainService] --------------------------');

  } catch (error) {
    if (transaction) await transaction.rollback();
    console.error('[OnChainService] An unexpected error occurred during the batch migration:', error);
    // Re-throw the error to be handled by the caller if necessary
    throw error;
  }
}

module.exports = { batchOnChainTrades };
