
const hre = require("hardhat");

// The address of the deployed DataRegistry contract.
const contractAddress = "0x942429212d6326f0bDb5c66F011EA694cf1EBE03";

async function main() {
  console.log(`Connecting to contract at address: ${contractAddress}`);

  const dataRegistry = await hre.ethers.getContractAt("DataRegistry", contractAddress);

  const redemptionCount = await dataRegistry.getRedemptionCount();
  console.log(`Found ${redemptionCount.toString()} redemption(s) on the blockchain.`);
  console.log("----------------------------------------------------");

  if (redemptionCount == 0) {
    console.log("No redemptions to display.");
    return;
  }

  for (let i = 0; i < redemptionCount; i++) {
    console.log(`Fetching Redemption #${i}...`);
    const redemption = await dataRegistry.redemptionHistory(i);

    console.log({
      userId: redemption.userId.toString(),
      redemptionRuleId: redemption.redemptionRuleId.toString(),
      reward: redemption.reward.toString(),
      timestamp: new Date(Number(redemption.timestamp) * 1000).toLocaleString(),
    });
    console.log("----------------------------------------------------");
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
