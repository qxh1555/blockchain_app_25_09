package contracts

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-samples/game-chaincode/models"
	"github.com/hyperledger/fabric-samples/game-chaincode/utils"
)

// CommodityContract provides functions for managing commodities
type CommodityContract struct {
	contractapi.Contract
}

// CreateCommodity creates a new commodity
func (c *CommodityContract) CreateCommodity(ctx contractapi.TransactionContextInterface, commodityID, name string, metadataJSON string) error {
	// Check if commodity already exists
	existing, err := c.GetCommodity(ctx, commodityID)
	if err == nil && existing != nil {
		return fmt.Errorf("commodity %s already exists", commodityID)
	}

	// Parse metadata
	var metadata map[string]interface{}
	if metadataJSON != "" {
		err = json.Unmarshal([]byte(metadataJSON), &metadata)
		if err != nil {
			return fmt.Errorf("failed to parse metadata: %v", err)
		}
	}

	// Get deterministic timestamp from transaction
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}

	// Create new commodity
	commodity := models.Commodity{
		CommodityID: commodityID,
		Name:        name,
		Metadata:    metadata,
		CreatedAt:   timestamp,
	}

	commodityJSON, err := json.Marshal(commodity)
	if err != nil {
		return fmt.Errorf("failed to marshal commodity: %v", err)
	}

	key := utils.GetCommodityKey(commodityID)
	return ctx.GetStub().PutState(key, commodityJSON)
}

// GetCommodity retrieves a commodity by ID
func (c *CommodityContract) GetCommodity(ctx contractapi.TransactionContextInterface, commodityID string) (*models.Commodity, error) {
	key := utils.GetCommodityKey(commodityID)
	commodityJSON, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read commodity: %v", err)
	}
	if commodityJSON == nil {
		return nil, fmt.Errorf("commodity not found: %s", commodityID)
	}

	var commodity models.Commodity
	err = json.Unmarshal(commodityJSON, &commodity)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal commodity: %v", err)
	}

	return &commodity, nil
}

// GetAllCommodities retrieves all commodities
func (c *CommodityContract) GetAllCommodities(ctx contractapi.TransactionContextInterface) ([]*models.Commodity, error) {
	// Get all commodities with the prefix
	iterator, err := ctx.GetStub().GetStateByRange(utils.CommodityPrefix, utils.CommodityPrefix+"\uffff")
	if err != nil {
		return nil, fmt.Errorf("failed to get commodity iterator: %v", err)
	}
	defer iterator.Close()

	var commodities []*models.Commodity
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate commodities: %v", err)
		}

		var commodity models.Commodity
		err = json.Unmarshal(queryResponse.Value, &commodity)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal commodity: %v", err)
		}

		commodities = append(commodities, &commodity)
	}

	return commodities, nil
}

// InitializeCommodities initializes default commodities for the game
func (c *CommodityContract) InitializeCommodities(ctx contractapi.TransactionContextInterface) error {
	commodities := []struct {
		ID       string
		Name     string
		Metadata string
	}{
		{"1", "Gold", `{"imageUrl": "/images/gold.png"}`},
		{"2", "Silver", `{"imageUrl": "/images/silver.png"}`},
		{"3", "Crude Oil", `{"imageUrl": "/images/oil.png"}`},
		{"4", "Natural Gas", `{"imageUrl": "/images/gas.png"}`},
		{"5", "Corn", `{"imageUrl": "/images/corn.png"}`},
		{"6", "Wheat", `{"imageUrl": "/images/wheat.png"}`},
		{"7", "Coffee", `{"imageUrl": "/images/coffee.png"}`},
		{"8", "Sugar", `{"imageUrl": "/images/sugar.png"}`},
	}

	for _, commodity := range commodities {
		err := c.CreateCommodity(ctx, commodity.ID, commodity.Name, commodity.Metadata)
		if err != nil {
			// If commodity already exists, skip it
			continue
		}
	}

	return nil
}
