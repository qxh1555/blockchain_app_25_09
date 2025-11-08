
const hre = require("hardhat");

// --- Configuration ---
// The address of the deployed DataRegistry contract.
// Replace with your actual deployed contract address.
const contractAddress = "0x4f6e894fec609F1a5AD69eA5ac83424786863FE3";

async function main() {
  console.log(`Connecting to contract at address: ${contractAddress}`);

  // Get the contract instance
  const dataRegistry = await hre.ethers.getContractAt("DataRegistry", contractAddress);

  // Get the total number of trades stored on the blockchain
  const tradeCount = await dataRegistry.getTradeCount();
  console.log(`Found ${tradeCount.toString()} trade(s) on the blockchain.`);
  console.log("----------------------------------------------------");

  if (tradeCount == 0) {
    console.log("No trades to display.");
    return;
  }

  // Loop through all the trades and print their details
  for (let i = 0; i < tradeCount; i++) {
    console.log(`Fetching Trade #${i}...`);
    const trade = await dataRegistry.tradeHistory(i);

    // The price was stored as an integer (e.g., price * 100), so we convert it back
    const priceAsFloat = parseFloat(trade.price.toString()) / 100;

    console.log({
      tradeId: trade.tradeId,
      fromUserId: trade.fromUserId.toString(),
      toUserId: trade.toUserId.toString(),
      commodityId: trade.commodityId.toString(),
      quantity: trade.quantity.toString(),
      price: priceAsFloat,
      timestamp: new Date(Number(trade.timestamp) * 1000).toLocaleString(),
    });
    console.log("----------------------------------------------------");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
