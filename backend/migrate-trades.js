
const { ethers } = require('ethers');
const { sequelize, Trade } = require('./db');

// --- Configuration ---
const contractAddress = '0x51D867BFd8aA363619Ba60A13Af9c000C2504E4e';
const contractABI = [
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

async function main() {
  console.log('Starting migration of trades from MySQL to the blockchain...');

  try {
    // 1. Connect to the database
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');

    // 2. Get a signer from Ganache
    const signer = await provider.getSigner(0);
    console.log(`Using signer address: ${await signer.getAddress()}`);

    // 3. Create a contract instance
    const dataRegistryContract = new ethers.Contract(contractAddress, contractABI, signer);
    console.log(`Connected to DataRegistry contract at: ${contractAddress}`);

    // 4. Fetch successful trades from the database
    const successfulTrades = await Trade.findAll({
      where: {
        status: 'successful'
      }
    });

    if (successfulTrades.length === 0) {
      console.log('No successful trades found in the database to migrate.');
      return;
    }

    console.log(`Found ${successfulTrades.length} successful trades to migrate.`);

    // 5. Iterate and send transactions to the smart contract
    let migratedCount = 0;
    for (const trade of successfulTrades) {
      try {
        console.log(`Migrating trade ID: ${trade.id}...`);
        
        // Convert price to integer to avoid float issues (e.g., 12.34 -> 1234)
        const priceAsUint = Math.round(trade.price * 100);

        const tx = await dataRegistryContract.addTrade(
          trade.id,
          trade.fromUserId,
          trade.toUserId,
          trade.commodityId,
          trade.quantity,
          priceAsUint
        );

        await tx.wait(); // Wait for the transaction to be mined
        console.log(`  -> Success! Transaction hash: ${tx.hash}`);
        migratedCount++;
      } catch (error) {
        console.error(`  -> Failed to migrate trade ID: ${trade.id}. Error: ${error.message}`);
      }
    }

    console.log('\n--- Migration Summary ---');
    console.log(`Total successful trades found: ${successfulTrades.length}`);
    console.log(`Successfully migrated trades: ${migratedCount}`);
    console.log(`Failed/Skipped trades: ${successfulTrades.length - migratedCount}`);
    console.log('--------------------------');

  } catch (error) {
    console.error('An unexpected error occurred:', error);
  } finally {
    await sequelize.close();
    console.log('Database connection closed.');
  }
}

main();
