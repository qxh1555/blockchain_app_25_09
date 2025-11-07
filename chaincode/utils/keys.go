package utils

import (
	"fmt"
	"time"

	"github.com/hyperledger/fabric-contract-api-go/contractapi"
)

// Key prefixes for different data types
const (
	UserAssetPrefix        = "user_asset_"
	InventoryPrefix        = "inventory_"
	TradePrefix            = "trade_"
	CommodityPrefix        = "commodity_"
	RedemptionRulePrefix   = "redemption_rule_"
	RedemptionRecordPrefix = "redemption_record_"
)

// GetUserAssetKey returns the key for a user's asset
func GetUserAssetKey(userID string) string {
	return fmt.Sprintf("%s%s", UserAssetPrefix, userID)
}

// GetInventoryKey returns the key for a user's inventory item
func GetInventoryKey(userID, commodityID string) string {
	return fmt.Sprintf("%s%s_%s", InventoryPrefix, userID, commodityID)
}

// GetTradeKey returns the key for a trade
func GetTradeKey(tradeID string) string {
	return fmt.Sprintf("%s%s", TradePrefix, tradeID)
}

// GetCommodityKey returns the key for a commodity
func GetCommodityKey(commodityID string) string {
	return fmt.Sprintf("%s%s", CommodityPrefix, commodityID)
}

// GetRedemptionRuleKey returns the key for a redemption rule
func GetRedemptionRuleKey(userID string) string {
	return fmt.Sprintf("%s%s", RedemptionRulePrefix, userID)
}

// GetRedemptionRecordKey returns the key for a redemption record
func GetRedemptionRecordKey(recordID string) string {
	return fmt.Sprintf("%s%s", RedemptionRecordPrefix, recordID)
}

// GetTxTimestamp returns the deterministic transaction timestamp
// This ensures all endorsing peers return the same timestamp
func GetTxTimestamp(ctx contractapi.TransactionContextInterface) (time.Time, error) {
	txTimestamp, err := ctx.GetStub().GetTxTimestamp()
	if err != nil {
		return time.Time{}, fmt.Errorf("failed to get transaction timestamp: %v", err)
	}
	return time.Unix(txTimestamp.Seconds, int64(txTimestamp.Nanos)), nil
}
