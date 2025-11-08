const hre = require("hardhat");

const contractAddress = "0x51D867BFd8aA363619Ba60A13Af9c000C2504E4e";

async function main() {
  console.log(`Connecting to contract at address: ${contractAddress}`);

  const dataRegistry = await hre.ethers.getContractAt("DataRegistry", contractAddress);

  const count = await dataRegistry.getInitialStateCount();
  console.log(`Found ${count.toString()} initial state record(s) on the blockchain.`);
  console.log("----------------------------------------------------");

  if (count == 0) {
    console.log("No initial state records to display.");
    return;
  }

  for (let i = 0; i < count; i++) {
    console.log(`Fetching Initial State Record #${i}...`);
    const state = await dataRegistry.getInitialStateRecord(i);

    const inventoryItems = state.inventory.map(item => {
        return `{ commodityId: ${item.commodityId.toString()}, quantity: ${item.quantity.toString()} }`
    }).join(', ');

    console.log({
      userId: state.userId.toString(),
      initialBalance: state.initialBalance.toString(),
      inventory: `[${inventoryItems}]`,
      timestamp: new Date(Number(state.timestamp) * 1000).toLocaleString(),
    });
    console.log("----------------------------------------------------");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
