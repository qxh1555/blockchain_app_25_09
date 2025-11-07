package contracts

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-samples/game-chaincode/models"
	"github.com/hyperledger/fabric-samples/game-chaincode/utils"
)

// AssetContract provides functions for managing user assets
type AssetContract struct {
	contractapi.Contract
}

// InitUser initializes a user's asset with an initial balance
func (c *AssetContract) InitUser(ctx contractapi.TransactionContextInterface, userID string, initialBalance float64) error {
	// Check if user already exists
	existing, err := c.GetUserAssets(ctx, userID)
	if err == nil && existing != nil {
		return fmt.Errorf("user %s already exists", userID)
	}

	// Get deterministic timestamp
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}

	// Create new user asset
	userAsset := models.UserAsset{
		UserID:    userID,
		Balance:   initialBalance,
		UpdatedAt: timestamp,
	}

	userAssetJSON, err := json.Marshal(userAsset)
	if err != nil {
		return fmt.Errorf("failed to marshal user asset: %v", err)
	}

	key := utils.GetUserAssetKey(userID)
	return ctx.GetStub().PutState(key, userAssetJSON)
}

// GetUserAssets retrieves a user's asset information
func (c *AssetContract) GetUserAssets(ctx contractapi.TransactionContextInterface, userID string) (*models.UserAsset, error) {
	key := utils.GetUserAssetKey(userID)
	userAssetJSON, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read user asset: %v", err)
	}
	if userAssetJSON == nil {
		return nil, fmt.Errorf("user asset not found for user %s", userID)
	}

	var userAsset models.UserAsset
	err = json.Unmarshal(userAssetJSON, &userAsset)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal user asset: %v", err)
	}

	return &userAsset, nil
}

// GetInventory retrieves a user's inventory for a specific commodity
func (c *AssetContract) GetInventory(ctx contractapi.TransactionContextInterface, userID, commodityID string) (*models.Inventory, error) {
	key := utils.GetInventoryKey(userID, commodityID)
	inventoryJSON, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read inventory: %v", err)
	}
	if inventoryJSON == nil {
		// Get deterministic timestamp
		timestamp, err := utils.GetTxTimestamp(ctx)
		if err != nil {
			return nil, err
		}
		// Return empty inventory instead of error
		return &models.Inventory{
			UserID:      userID,
			CommodityID: commodityID,
			Quantity:    0,
			UpdatedAt:   timestamp,
		}, nil
	}

	var inventory models.Inventory
	err = json.Unmarshal(inventoryJSON, &inventory)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal inventory: %v", err)
	}

	return &inventory, nil
}

// GetAllInventory retrieves all inventory items for a user
func (c *AssetContract) GetAllInventory(ctx contractapi.TransactionContextInterface, userID string) ([]*models.Inventory, error) {
	// Use range query to get all inventory items for a user
	startKey := fmt.Sprintf("%s%s_", utils.InventoryPrefix, userID)
	endKey := fmt.Sprintf("%s%s_\uffff", utils.InventoryPrefix, userID)

	iterator, err := ctx.GetStub().GetStateByRange(startKey, endKey)
	if err != nil {
		return nil, fmt.Errorf("failed to get inventory iterator: %v", err)
	}
	defer iterator.Close()

	var inventories []*models.Inventory
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate inventory: %v", err)
		}

		var inventory models.Inventory
		err = json.Unmarshal(queryResponse.Value, &inventory)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal inventory: %v", err)
		}

		if inventory.Quantity > 0 {
			inventories = append(inventories, &inventory)
		}
	}

	return inventories, nil
}

// UpdateBalance updates a user's balance (internal function)
func (c *AssetContract) UpdateBalance(ctx contractapi.TransactionContextInterface, userID string, amount float64, operation string) error {
	userAsset, err := c.GetUserAssets(ctx, userID)
	if err != nil {
		return err
	}

	switch operation {
	case "add":
		userAsset.Balance += amount
	case "subtract":
		if userAsset.Balance < amount {
			return fmt.Errorf("insufficient balance for user %s", userID)
		}
		userAsset.Balance -= amount
	default:
		return fmt.Errorf("invalid operation: %s", operation)
	}

	// Get deterministic timestamp
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}
	userAsset.UpdatedAt = timestamp

	userAssetJSON, err := json.Marshal(userAsset)
	if err != nil {
		return fmt.Errorf("failed to marshal user asset: %v", err)
	}

	key := utils.GetUserAssetKey(userID)
	return ctx.GetStub().PutState(key, userAssetJSON)
}

// UpdateInventory updates a user's inventory (internal function)
func (c *AssetContract) UpdateInventory(ctx contractapi.TransactionContextInterface, userID, commodityID string, quantity int, operation string) error {
	inventory, err := c.GetInventory(ctx, userID, commodityID)
	if err != nil {
		return err
	}

	switch operation {
	case "add":
		inventory.Quantity += quantity
	case "subtract":
		if inventory.Quantity < quantity {
			return fmt.Errorf("insufficient inventory for user %s, commodity %s", userID, commodityID)
		}
		inventory.Quantity -= quantity
	default:
		return fmt.Errorf("invalid operation: %s", operation)
	}

	// Get deterministic timestamp
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}
	inventory.UpdatedAt = timestamp

	inventoryJSON, err := json.Marshal(inventory)
	if err != nil {
		return fmt.Errorf("failed to marshal inventory: %v", err)
	}

	key := utils.GetInventoryKey(userID, commodityID)
	return ctx.GetStub().PutState(key, inventoryJSON)
}
