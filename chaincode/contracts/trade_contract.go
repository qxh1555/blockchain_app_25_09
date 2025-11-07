package contracts

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-samples/game-chaincode/models"
	"github.com/hyperledger/fabric-samples/game-chaincode/utils"
)

// TradeContract provides functions for managing trades
type TradeContract struct {
	contractapi.Contract
	AssetContract *AssetContract
}

// CreateTrade creates a new trade proposal
func (t *TradeContract) CreateTrade(ctx contractapi.TransactionContextInterface, tradeID, fromUserID, toUserID, commodityID string, quantity int, price float64, action string) error {
	// Validate action
	if action != "buy" && action != "sell" {
		return fmt.Errorf("invalid action: %s (must be 'buy' or 'sell')", action)
	}

	// Check if trade already exists
	existing, err := t.GetTradeStatus(ctx, tradeID)
	if err == nil && existing != nil {
		return fmt.Errorf("trade %s already exists", tradeID)
	}

	// Determine seller and buyer based on action
	var sellerID, buyerID string
	if action == "buy" {
		// fromUser wants to buy, so toUser is the seller
		sellerID = toUserID
		buyerID = fromUserID
	} else {
		// fromUser wants to sell, so toUser is the buyer
		sellerID = fromUserID
		buyerID = toUserID
	}

	// Initialize asset contract if not set
	if t.AssetContract == nil {
		t.AssetContract = &AssetContract{}
	}

	// Verify seller has enough inventory
	inventory, err := t.AssetContract.GetInventory(ctx, sellerID, commodityID)
	if err != nil {
		return fmt.Errorf("failed to get seller inventory: %v", err)
	}
	if inventory.Quantity < quantity {
		return fmt.Errorf("seller has insufficient inventory")
	}

	// Verify buyer has enough balance
	buyerAsset, err := t.AssetContract.GetUserAssets(ctx, buyerID)
	if err != nil {
		return fmt.Errorf("failed to get buyer assets: %v", err)
	}
	if buyerAsset.Balance < price {
		return fmt.Errorf("buyer has insufficient balance")
	}

	// Get deterministic timestamp
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}

	// Create trade
	trade := models.Trade{
		TradeID:     tradeID,
		FromUserID:  fromUserID,
		ToUserID:    toUserID,
		CommodityID: commodityID,
		Quantity:    quantity,
		Price:       price,
		Action:      action,
		Status:      "pending",
		CreatedAt:   timestamp,
	}

	tradeJSON, err := json.Marshal(trade)
	if err != nil {
		return fmt.Errorf("failed to marshal trade: %v", err)
	}

	key := utils.GetTradeKey(tradeID)
	return ctx.GetStub().PutState(key, tradeJSON)
}

// ExecuteTrade executes a pending trade
func (t *TradeContract) ExecuteTrade(ctx contractapi.TransactionContextInterface, tradeID string) error {
	// Get trade
	trade, err := t.GetTradeStatus(ctx, tradeID)
	if err != nil {
		return err
	}

	// Check trade status
	if trade.Status != "pending" {
		return fmt.Errorf("trade is not pending (status: %s)", trade.Status)
	}

	// Determine seller and buyer
	var sellerID, buyerID string
	if trade.Action == "buy" {
		sellerID = trade.ToUserID
		buyerID = trade.FromUserID
	} else {
		sellerID = trade.FromUserID
		buyerID = trade.ToUserID
	}

	// Initialize asset contract if not set
	if t.AssetContract == nil {
		t.AssetContract = &AssetContract{}
	}

	// Verify seller still has enough inventory
	sellerInventory, err := t.AssetContract.GetInventory(ctx, sellerID, trade.CommodityID)
	if err != nil {
		return fmt.Errorf("failed to get seller inventory: %v", err)
	}
	if sellerInventory.Quantity < trade.Quantity {
		return fmt.Errorf("seller has insufficient inventory")
	}

	// Verify buyer still has enough balance
	buyerAsset, err := t.AssetContract.GetUserAssets(ctx, buyerID)
	if err != nil {
		return fmt.Errorf("failed to get buyer assets: %v", err)
	}
	if buyerAsset.Balance < trade.Price {
		return fmt.Errorf("buyer has insufficient balance")
	}

	// Execute trade atomically
	// 1. Update seller inventory (subtract)
	err = t.AssetContract.UpdateInventory(ctx, sellerID, trade.CommodityID, trade.Quantity, "subtract")
	if err != nil {
		return fmt.Errorf("failed to update seller inventory: %v", err)
	}

	// 2. Update buyer inventory (add)
	err = t.AssetContract.UpdateInventory(ctx, buyerID, trade.CommodityID, trade.Quantity, "add")
	if err != nil {
		return fmt.Errorf("failed to update buyer inventory: %v", err)
	}

	// 3. Update buyer balance (subtract)
	err = t.AssetContract.UpdateBalance(ctx, buyerID, trade.Price, "subtract")
	if err != nil {
		return fmt.Errorf("failed to update buyer balance: %v", err)
	}

	// 4. Update seller balance (add)
	err = t.AssetContract.UpdateBalance(ctx, sellerID, trade.Price, "add")
	if err != nil {
		return fmt.Errorf("failed to update seller balance: %v", err)
	}

	// 5. Update trade status
	// Get deterministic timestamp
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}
	trade.Status = "successful"
	trade.CompletedAt = timestamp

	tradeJSON, err := json.Marshal(trade)
	if err != nil {
		return fmt.Errorf("failed to marshal trade: %v", err)
	}

	key := utils.GetTradeKey(tradeID)
	err = ctx.GetStub().PutState(key, tradeJSON)
	if err != nil {
		return fmt.Errorf("failed to update trade: %v", err)
	}

	// 6. Emit event
	eventPayload := map[string]interface{}{
		"tradeId":     trade.TradeID,
		"fromUserId":  trade.FromUserID,
		"toUserId":    trade.ToUserID,
		"commodityId": trade.CommodityID,
		"quantity":    trade.Quantity,
		"price":       trade.Price,
		"timestamp":   trade.CompletedAt,
	}
	eventJSON, _ := json.Marshal(eventPayload)
	ctx.GetStub().SetEvent("TradeExecuted", eventJSON)

	return nil
}

// RejectTrade rejects a pending trade
func (t *TradeContract) RejectTrade(ctx contractapi.TransactionContextInterface, tradeID string) error {
	// Get trade
	trade, err := t.GetTradeStatus(ctx, tradeID)
	if err != nil {
		return err
	}

	// Check trade status
	if trade.Status != "pending" {
		return fmt.Errorf("trade is not pending (status: %s)", trade.Status)
	}

	// Get deterministic timestamp
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}

	// Update trade status
	trade.Status = "rejected"
	trade.CompletedAt = timestamp

	tradeJSON, err := json.Marshal(trade)
	if err != nil {
		return fmt.Errorf("failed to marshal trade: %v", err)
	}

	key := utils.GetTradeKey(tradeID)
	return ctx.GetStub().PutState(key, tradeJSON)
}

// GetTradeStatus retrieves the status of a trade
func (t *TradeContract) GetTradeStatus(ctx contractapi.TransactionContextInterface, tradeID string) (*models.Trade, error) {
	key := utils.GetTradeKey(tradeID)
	tradeJSON, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read trade: %v", err)
	}
	if tradeJSON == nil {
		return nil, fmt.Errorf("trade not found: %s", tradeID)
	}

	var trade models.Trade
	err = json.Unmarshal(tradeJSON, &trade)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal trade: %v", err)
	}

	return &trade, nil
}

// GetTradeHistory retrieves trade history for a user
func (t *TradeContract) GetTradeHistory(ctx contractapi.TransactionContextInterface, userID string) ([]*models.Trade, error) {
	// Get all trades
	iterator, err := ctx.GetStub().GetStateByRange(utils.TradePrefix, utils.TradePrefix+"\uffff")
	if err != nil {
		return nil, fmt.Errorf("failed to get trade iterator: %v", err)
	}
	defer iterator.Close()

	var trades []*models.Trade
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate trades: %v", err)
		}

		var trade models.Trade
		err = json.Unmarshal(queryResponse.Value, &trade)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal trade: %v", err)
		}

		// Filter trades involving the user
		if trade.FromUserID == userID || trade.ToUserID == userID {
			trades = append(trades, &trade)
		}
	}

	return trades, nil
}
