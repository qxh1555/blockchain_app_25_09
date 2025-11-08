const hre = require("hardhat");

async function main() {
  console.log("Deploying DataRegistry contract...");
  
  const dataRegistry = await hre.ethers.deployContract("DataRegistry");

  await dataRegistry.waitForDeployment();

  console.log(
    `DataRegistry contract successfully deployed to: ${dataRegistry.target}`
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
