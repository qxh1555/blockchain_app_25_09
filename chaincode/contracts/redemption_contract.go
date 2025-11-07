package contracts

import (
	"encoding/json"
	"fmt"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-samples/game-chaincode/models"
	"github.com/hyperledger/fabric-samples/game-chaincode/utils"
)

// RedemptionContract provides functions for managing redemptions
type RedemptionContract struct {
	contractapi.Contract
	AssetContract *AssetContract
}

// CreateRedemptionRule creates a new redemption rule for a user
func (r *RedemptionContract) CreateRedemptionRule(ctx contractapi.TransactionContextInterface, userID string, requiredItemsJSON string, rewardAmount float64) error {
	// Parse required items
	var requiredItems []models.RequiredItem
	err := json.Unmarshal([]byte(requiredItemsJSON), &requiredItems)
	if err != nil {
		return fmt.Errorf("failed to parse required items: %v", err)
	}

	if len(requiredItems) == 0 {
		return fmt.Errorf("required items cannot be empty")
	}

	if rewardAmount <= 0 {
		return fmt.Errorf("reward amount must be positive")
	}

	// Check if rule already exists (one rule per user)
	existing, _ := r.GetRedemptionRule(ctx, userID)
	if existing != nil {
		return fmt.Errorf("redemption rule already exists for user %s", userID)
	}

	// Get deterministic timestamp
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}

	// Create rule
	ruleID := fmt.Sprintf("rule_%s", userID)
	rule := models.RedemptionRule{
		RuleID:        ruleID,
		UserID:        userID,
		RequiredItems: requiredItems,
		RewardAmount:  rewardAmount,
		CreatedAt:     timestamp,
	}

	ruleJSON, err := json.Marshal(rule)
	if err != nil {
		return fmt.Errorf("failed to marshal redemption rule: %v", err)
	}

	key := utils.GetRedemptionRuleKey(userID)
	return ctx.GetStub().PutState(key, ruleJSON)
}

// GetRedemptionRule retrieves the redemption rule for a user
func (r *RedemptionContract) GetRedemptionRule(ctx contractapi.TransactionContextInterface, userID string) (*models.RedemptionRule, error) {
	key := utils.GetRedemptionRuleKey(userID)
	ruleJSON, err := ctx.GetStub().GetState(key)
	if err != nil {
		return nil, fmt.Errorf("failed to read redemption rule: %v", err)
	}
	if ruleJSON == nil {
		return nil, fmt.Errorf("redemption rule not found for user %s", userID)
	}

	var rule models.RedemptionRule
	err = json.Unmarshal(ruleJSON, &rule)
	if err != nil {
		return nil, fmt.Errorf("failed to unmarshal redemption rule: %v", err)
	}

	return &rule, nil
}

// ExecuteRedemption executes a redemption for a user
func (r *RedemptionContract) ExecuteRedemption(ctx contractapi.TransactionContextInterface, userID, recordID string) error {
	// Get redemption rule
	rule, err := r.GetRedemptionRule(ctx, userID)
	if err != nil {
		return fmt.Errorf("failed to get redemption rule: %v", err)
	}

	// Initialize asset contract if not set
	if r.AssetContract == nil {
		r.AssetContract = &AssetContract{}
	}

	// Verify user has all required items
	for _, item := range rule.RequiredItems {
		inventory, err := r.AssetContract.GetInventory(ctx, userID, item.CommodityID)
		if err != nil {
			return fmt.Errorf("failed to get inventory for commodity %s: %v", item.CommodityID, err)
		}
		if inventory.Quantity < item.Quantity {
			return fmt.Errorf("insufficient inventory for commodity %s (required: %d, available: %d)",
				item.CommodityID, item.Quantity, inventory.Quantity)
		}
	}

	// Execute redemption atomically
	// 1. Deduct required items from inventory
	for _, item := range rule.RequiredItems {
		err = r.AssetContract.UpdateInventory(ctx, userID, item.CommodityID, item.Quantity, "subtract")
		if err != nil {
			return fmt.Errorf("failed to deduct inventory for commodity %s: %v", item.CommodityID, err)
		}
	}

	// 2. Add reward to user balance
	err = r.AssetContract.UpdateBalance(ctx, userID, rule.RewardAmount, "add")
	if err != nil {
		return fmt.Errorf("failed to add reward balance: %v", err)
	}

	// Get deterministic timestamp
	timestamp, err := utils.GetTxTimestamp(ctx)
	if err != nil {
		return err
	}

	// 3. Record the redemption
	record := models.RedemptionRecord{
		RecordID:      recordID,
		UserID:        userID,
		RuleID:        rule.RuleID,
		RewardAmount:  rule.RewardAmount,
		ConsumedItems: rule.RequiredItems,
		Timestamp:     timestamp,
	}

	recordJSON, err := json.Marshal(record)
	if err != nil {
		return fmt.Errorf("failed to marshal redemption record: %v", err)
	}

	key := utils.GetRedemptionRecordKey(recordID)
	err = ctx.GetStub().PutState(key, recordJSON)
	if err != nil {
		return fmt.Errorf("failed to save redemption record: %v", err)
	}

	// 4. Emit event
	eventPayload := map[string]interface{}{
		"recordId":     record.RecordID,
		"userId":       record.UserID,
		"ruleId":       record.RuleID,
		"rewardAmount": record.RewardAmount,
		"timestamp":    record.Timestamp,
	}
	eventJSON, _ := json.Marshal(eventPayload)
	ctx.GetStub().SetEvent("RedemptionExecuted", eventJSON)

	return nil
}

// GetRedemptionHistory retrieves redemption history for a user
func (r *RedemptionContract) GetRedemptionHistory(ctx contractapi.TransactionContextInterface, userID string) ([]*models.RedemptionRecord, error) {
	// Get all redemption records
	iterator, err := ctx.GetStub().GetStateByRange(utils.RedemptionRecordPrefix, utils.RedemptionRecordPrefix+"\uffff")
	if err != nil {
		return nil, fmt.Errorf("failed to get redemption record iterator: %v", err)
	}
	defer iterator.Close()

	var records []*models.RedemptionRecord
	for iterator.HasNext() {
		queryResponse, err := iterator.Next()
		if err != nil {
			return nil, fmt.Errorf("failed to iterate redemption records: %v", err)
		}

		var record models.RedemptionRecord
		err = json.Unmarshal(queryResponse.Value, &record)
		if err != nil {
			return nil, fmt.Errorf("failed to unmarshal redemption record: %v", err)
		}

		// Filter records for the user
		if record.UserID == userID {
			records = append(records, &record)
		}
	}

	return records, nil
}
