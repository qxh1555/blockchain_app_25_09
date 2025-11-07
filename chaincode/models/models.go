package models

import "time"

// UserAsset represents a user's balance
type UserAsset struct {
	UserID    string    `json:"userId"`
	Balance   float64   `json:"balance"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// Inventory represents user's commodity holdings
type Inventory struct {
	UserID      string    `json:"userId"`
	CommodityID string    `json:"commodityId"`
	Quantity    int       `json:"quantity"`
	UpdatedAt   time.Time `json:"updatedAt"`
}

// Trade represents a trade transaction
type Trade struct {
	TradeID     string    `json:"tradeId"`
	FromUserID  string    `json:"fromUserId"`
	ToUserID    string    `json:"toUserId"`
	CommodityID string    `json:"commodityId"`
	Quantity    int       `json:"quantity"`
	Price       float64   `json:"price"`
	Action      string    `json:"action"` // "buy" or "sell"
	Status      string    `json:"status"` // "pending", "successful", "rejected"
	CreatedAt   time.Time `json:"createdAt"`
	CompletedAt time.Time `json:"completedAt,omitempty"`
}

// Commodity represents a game commodity/item
type Commodity struct {
	CommodityID string                 `json:"commodityId"`
	Name        string                 `json:"name"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt   time.Time              `json:"createdAt"`
}

// RedemptionRule represents the redemption rule for a user
type RedemptionRule struct {
	RuleID        string         `json:"ruleId"`
	UserID        string         `json:"userId"`
	RequiredItems []RequiredItem `json:"requiredItems"`
	RewardAmount  float64        `json:"rewardAmount"`
	CreatedAt     time.Time      `json:"createdAt"`
}

// RequiredItem represents an item required for redemption
type RequiredItem struct {
	CommodityID string `json:"commodityId"`
	Quantity    int    `json:"quantity"`
}

// RedemptionRecord represents a redemption transaction
type RedemptionRecord struct {
	RecordID      string         `json:"recordId"`
	UserID        string         `json:"userId"`
	RuleID        string         `json:"ruleId"`
	RewardAmount  float64        `json:"rewardAmount"`
	ConsumedItems []RequiredItem `json:"consumedItems"`
	Timestamp     time.Time      `json:"timestamp"`
}

