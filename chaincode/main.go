package main

import (
	"fmt"
	"log"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-samples/game-chaincode/contracts"
)

func main() {
	// Create asset contract
	assetContract := new(contracts.AssetContract)

	// Create commodity contract
	commodityContract := new(contracts.CommodityContract)

	// Create trade contract with asset contract reference
	tradeContract := &contracts.TradeContract{
		AssetContract: assetContract,
	}

	// Create redemption contract with asset contract reference
	redemptionContract := &contracts.RedemptionContract{
		AssetContract: assetContract,
	}

	// Create chaincode
	chaincode, err := contractapi.NewChaincode(
		assetContract,
		commodityContract,
		tradeContract,
		redemptionContract,
	)

	if err != nil {
		log.Panicf("Error creating game chaincode: %v", err)
	}

	if err := chaincode.Start(); err != nil {
		fmt.Printf("Error starting game chaincode: %v", err)
	}
}

