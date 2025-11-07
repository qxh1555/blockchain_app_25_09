package contracts

import (
	"encoding/json"
	"fmt"
	"testing"

	"github.com/hyperledger/fabric-chaincode-go/shim"
	"github.com/hyperledger/fabric-chaincode-go/shimtest"
	"github.com/hyperledger/fabric-contract-api-go/contractapi"
	"github.com/hyperledger/fabric-samples/game-chaincode/models"
	"github.com/stretchr/testify/assert"
)

// MockTransactionContext is a mock transaction context
type MockTransactionContext struct {
	contractapi.TransactionContext
	stub *shimtest.MockStub
}

func (m *MockTransactionContext) GetStub() shim.ChaincodeStubInterface {
	return m.stub
}

func NewMockContext() *MockTransactionContext {
	return &MockTransactionContext{
		stub: shimtest.NewMockStub("mockStub", nil),
	}
}

// Test AssetContract
func TestInitUser(t *testing.T) {
	ctx := NewMockContext()
	contract := new(AssetContract)

	// Test successful user initialization
	ctx.stub.MockTransactionStart("someTxID")
	err := contract.InitUser(ctx, "user1", 1000.0)
	ctx.stub.MockTransactionEnd("someTxID")
	assert.NoError(t, err)

	// Verify user was created
	asset, err := contract.GetUserAssets(ctx, "user1")
	assert.NoError(t, err)
	assert.Equal(t, "user1", asset.UserID)
	assert.Equal(t, 1000.0, asset.Balance)

	// Test duplicate user
	err = contract.InitUser(ctx, "user1", 500.0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")
}

func TestGetUserAssets(t *testing.T) {
	ctx := NewMockContext()
	contract := new(AssetContract)

	// Test non-existent user
	_, err := contract.GetUserAssets(ctx, "nonexistent")
	assert.Error(t, err)

	// Initialize user and test retrieval
	ctx.stub.MockTransactionStart("someTxID")
	err = contract.InitUser(ctx, "user1", 1500.0)
	assert.NoError(t, err)
	ctx.stub.MockTransactionEnd("someTxID")
	asset, err := contract.GetUserAssets(ctx, "user1")
	assert.NoError(t, err)
	assert.Equal(t, "user1", asset.UserID)
	assert.Equal(t, 1500.0, asset.Balance)
}

func TestUpdateBalance(t *testing.T) {
	ctx := NewMockContext()
	contract := new(AssetContract)
	ctx.stub.MockTransactionStart("someTxID")
	// Initialize user
	err := contract.InitUser(ctx, "user1", 1000.0)
	assert.NoError(t, err)
	// Test add operation
	err = contract.UpdateBalance(ctx, "user1", 500.0, "add")
	assert.NoError(t, err)

	asset, _ := contract.GetUserAssets(ctx, "user1")
	assert.Equal(t, 1500.0, asset.Balance)

	// Test subtract operation
	err = contract.UpdateBalance(ctx, "user1", 300.0, "subtract")
	assert.NoError(t, err)

	asset, _ = contract.GetUserAssets(ctx, "user1")
	assert.Equal(t, 1200.0, asset.Balance)

	// Test insufficient balance
	err = contract.UpdateBalance(ctx, "user1", 2000.0, "subtract")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient balance")
	ctx.stub.MockTransactionEnd("someTxID")
}

func TestUpdateInventory(t *testing.T) {
	ctx := NewMockContext()
	contract := new(AssetContract)

	ctx.stub.MockTransactionStart("txID1")
	// Initialize user
	err := contract.InitUser(ctx, "user1", 1000.0)
	assert.NoError(t, err)

	// Test add inventory
	err = contract.UpdateInventory(ctx, "user1", "commodity1", 10, "add")
	assert.NoError(t, err)

	inventory, _ := contract.GetInventory(ctx, "user1", "commodity1")
	assert.Equal(t, 10, inventory.Quantity)

	// Test add more
	err = contract.UpdateInventory(ctx, "user1", "commodity1", 5, "add")
	assert.NoError(t, err)

	inventory, _ = contract.GetInventory(ctx, "user1", "commodity1")
	assert.Equal(t, 15, inventory.Quantity)

	// Test subtract
	err = contract.UpdateInventory(ctx, "user1", "commodity1", 7, "subtract")
	assert.NoError(t, err)

	inventory, _ = contract.GetInventory(ctx, "user1", "commodity1")
	assert.Equal(t, 8, inventory.Quantity)

	// Test insufficient inventory
	err = contract.UpdateInventory(ctx, "user1", "commodity1", 20, "subtract")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient inventory")
	ctx.stub.MockTransactionEnd("txID1")
}

// Test CommodityContract
func TestCreateCommodity(t *testing.T) {
	ctx := NewMockContext()
	contract := new(CommodityContract)

	ctx.stub.MockTransactionStart("txID1")
	// Test successful creation
	metadata := `{"description": "Test commodity", "type": "fruit"}`
	err := contract.CreateCommodity(ctx, "commodity1", "Apple", metadata)
	assert.NoError(t, err)

	// Verify commodity was created
	commodity, err := contract.GetCommodity(ctx, "commodity1")
	assert.NoError(t, err)
	assert.Equal(t, "commodity1", commodity.CommodityID)
	assert.Equal(t, "Apple", commodity.Name)

	// Test duplicate commodity
	err = contract.CreateCommodity(ctx, "commodity1", "Banana", "")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")
	ctx.stub.MockTransactionEnd("txID1")
}

func TestGetCommodity(t *testing.T) {
	ctx := NewMockContext()
	contract := new(CommodityContract)

	// Test non-existent commodity
	_, err := contract.GetCommodity(ctx, "nonexistent")
	assert.Error(t, err)

	ctx.stub.MockTransactionStart("txID1")
	// Create and test retrieval
	err = contract.CreateCommodity(ctx, "commodity1", "Orange", "")
	assert.NoError(t, err)

	commodity, err := contract.GetCommodity(ctx, "commodity1")
	assert.NoError(t, err)
	assert.Equal(t, "commodity1", commodity.CommodityID)
	assert.Equal(t, "Orange", commodity.Name)
	ctx.stub.MockTransactionEnd("txID1")
}

func TestInitializeCommodities(t *testing.T) {
	ctx := NewMockContext()
	contract := new(CommodityContract)

	ctx.stub.MockTransactionStart("txID1")
	// Initialize default commodities
	err := contract.InitializeCommodities(ctx)
	assert.NoError(t, err)

	// Verify at least one commodity was created
	commodity, err := contract.GetCommodity(ctx, "1")
	assert.NoError(t, err)
	assert.Equal(t, "苹果", commodity.Name)
	ctx.stub.MockTransactionEnd("txID1")
}

// Test TradeContract
func TestCreateTrade(t *testing.T) {
	ctx := NewMockContext()
	assetContract := new(AssetContract)
	tradeContract := &TradeContract{AssetContract: assetContract}

	ctx.stub.MockTransactionStart("txID1")
	// Initialize users
	assetContract.InitUser(ctx, "user1", 1000.0)
	assetContract.InitUser(ctx, "user2", 1000.0)

	// Give user2 some inventory
	assetContract.UpdateInventory(ctx, "user2", "commodity1", 10, "add")

	// Test successful trade creation (user1 wants to buy from user2)
	err := tradeContract.CreateTrade(ctx, "trade1", "user1", "user2", "commodity1", 5, 100.0, "buy")
	assert.NoError(t, err)

	// Verify trade was created
	trade, err := tradeContract.GetTradeStatus(ctx, "trade1")
	assert.NoError(t, err)
	assert.Equal(t, "trade1", trade.TradeID)
	assert.Equal(t, "pending", trade.Status)
	assert.Equal(t, "buy", trade.Action)

	// Test insufficient inventory
	err = tradeContract.CreateTrade(ctx, "trade2", "user1", "user2", "commodity1", 20, 100.0, "buy")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient inventory")

	// Test insufficient balance
	err = tradeContract.CreateTrade(ctx, "trade3", "user1", "user2", "commodity1", 5, 2000.0, "buy")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient balance")
	ctx.stub.MockTransactionEnd("txID1")
}

func TestExecuteTrade(t *testing.T) {
	ctx := NewMockContext()
	assetContract := new(AssetContract)
	tradeContract := &TradeContract{AssetContract: assetContract}

	ctx.stub.MockTransactionStart("txID1")
	// Initialize users
	assetContract.InitUser(ctx, "user1", 1000.0)
	assetContract.InitUser(ctx, "user2", 1000.0)

	// Give user2 some inventory
	assetContract.UpdateInventory(ctx, "user2", "commodity1", 10, "add")

	// Create trade
	tradeContract.CreateTrade(ctx, "trade1", "user1", "user2", "commodity1", 5, 100.0, "buy")

	// Execute trade
	err := tradeContract.ExecuteTrade(ctx, "trade1")
	assert.NoError(t, err)

	// Verify trade status
	trade, _ := tradeContract.GetTradeStatus(ctx, "trade1")
	assert.Equal(t, "successful", trade.Status)

	// Verify balances
	user1Asset, _ := assetContract.GetUserAssets(ctx, "user1")
	assert.Equal(t, 900.0, user1Asset.Balance) // 1000 - 100

	user2Asset, _ := assetContract.GetUserAssets(ctx, "user2")
	assert.Equal(t, 1100.0, user2Asset.Balance) // 1000 + 100

	// Verify inventory
	user1Inventory, _ := assetContract.GetInventory(ctx, "user1", "commodity1")
	assert.Equal(t, 5, user1Inventory.Quantity)

	user2Inventory, _ := assetContract.GetInventory(ctx, "user2", "commodity1")
	assert.Equal(t, 5, user2Inventory.Quantity) // 10 - 5
	ctx.stub.MockTransactionEnd("txID1")
}

func TestRejectTrade(t *testing.T) {
	ctx := NewMockContext()
	assetContract := new(AssetContract)
	tradeContract := &TradeContract{AssetContract: assetContract}

	ctx.stub.MockTransactionStart("txID1")
	// Initialize users
	assetContract.InitUser(ctx, "user1", 1000.0)
	assetContract.InitUser(ctx, "user2", 1000.0)
	assetContract.UpdateInventory(ctx, "user2", "commodity1", 10, "add")

	// Create trade
	tradeContract.CreateTrade(ctx, "trade1", "user1", "user2", "commodity1", 5, 100.0, "buy")

	// Reject trade
	err := tradeContract.RejectTrade(ctx, "trade1")
	assert.NoError(t, err)

	// Verify trade status
	trade, _ := tradeContract.GetTradeStatus(ctx, "trade1")
	assert.Equal(t, "rejected", trade.Status)

	// Verify balances and inventory unchanged
	user1Asset, _ := assetContract.GetUserAssets(ctx, "user1")
	assert.Equal(t, 1000.0, user1Asset.Balance)

	user2Inventory, _ := assetContract.GetInventory(ctx, "user2", "commodity1")
	assert.Equal(t, 10, user2Inventory.Quantity)
	ctx.stub.MockTransactionEnd("txID1")
}

// Test RedemptionContract
func TestCreateRedemptionRule(t *testing.T) {
	ctx := NewMockContext()
	contract := new(RedemptionContract)

	ctx.stub.MockTransactionStart("txID1")
	// Test successful rule creation
	requiredItems := []models.RequiredItem{
		{CommodityID: "commodity1", Quantity: 3},
		{CommodityID: "commodity2", Quantity: 2},
	}
	requiredItemsJSON, _ := json.Marshal(requiredItems)

	err := contract.CreateRedemptionRule(ctx, "user1", string(requiredItemsJSON), 500.0)
	assert.NoError(t, err)

	// Verify rule was created
	rule, err := contract.GetRedemptionRule(ctx, "user1")
	assert.NoError(t, err)
	assert.Equal(t, "user1", rule.UserID)
	assert.Equal(t, 500.0, rule.RewardAmount)
	assert.Equal(t, 2, len(rule.RequiredItems))

	// Test duplicate rule
	err = contract.CreateRedemptionRule(ctx, "user1", string(requiredItemsJSON), 600.0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "already exists")

	// Test invalid reward amount
	err = contract.CreateRedemptionRule(ctx, "user2", string(requiredItemsJSON), -100.0)
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "must be positive")
	ctx.stub.MockTransactionEnd("txID1")
}

func TestExecuteRedemption(t *testing.T) {
	ctx := NewMockContext()
	assetContract := new(AssetContract)
	redemptionContract := &RedemptionContract{AssetContract: assetContract}

	ctx.stub.MockTransactionStart("txID1")
	// Initialize user
	assetContract.InitUser(ctx, "user1", 1000.0)

	// Give user inventory
	assetContract.UpdateInventory(ctx, "user1", "commodity1", 5, "add")
	assetContract.UpdateInventory(ctx, "user1", "commodity2", 3, "add")

	// Create redemption rule
	requiredItems := []models.RequiredItem{
		{CommodityID: "commodity1", Quantity: 3},
		{CommodityID: "commodity2", Quantity: 2},
	}
	requiredItemsJSON, _ := json.Marshal(requiredItems)
	redemptionContract.CreateRedemptionRule(ctx, "user1", string(requiredItemsJSON), 500.0)

	// Execute redemption
	err := redemptionContract.ExecuteRedemption(ctx, "user1", "record1")
	assert.NoError(t, err)

	// Verify balance increased
	asset, _ := assetContract.GetUserAssets(ctx, "user1")
	assert.Equal(t, 1500.0, asset.Balance) // 1000 + 500

	// Verify inventory decreased
	inventory1, _ := assetContract.GetInventory(ctx, "user1", "commodity1")
	assert.Equal(t, 2, inventory1.Quantity) // 5 - 3

	inventory2, _ := assetContract.GetInventory(ctx, "user1", "commodity2")
	assert.Equal(t, 1, inventory2.Quantity) // 3 - 2
	ctx.stub.MockTransactionEnd("txID1")
}

func TestExecuteRedemptionInsufficientInventory(t *testing.T) {
	ctx := NewMockContext()
	assetContract := new(AssetContract)
	redemptionContract := &RedemptionContract{AssetContract: assetContract}

	ctx.stub.MockTransactionStart("txID1")
	// Initialize user
	assetContract.InitUser(ctx, "user1", 1000.0)

	// Give user insufficient inventory
	assetContract.UpdateInventory(ctx, "user1", "commodity1", 2, "add")
	assetContract.UpdateInventory(ctx, "user1", "commodity2", 1, "add")

	// Create redemption rule
	requiredItems := []models.RequiredItem{
		{CommodityID: "commodity1", Quantity: 3},
		{CommodityID: "commodity2", Quantity: 2},
	}
	requiredItemsJSON, _ := json.Marshal(requiredItems)
	redemptionContract.CreateRedemptionRule(ctx, "user1", string(requiredItemsJSON), 500.0)

	// Try to execute redemption
	err := redemptionContract.ExecuteRedemption(ctx, "user1", "record1")
	assert.Error(t, err)
	assert.Contains(t, err.Error(), "insufficient inventory")
	ctx.stub.MockTransactionEnd("txID1")
}

// Integration test: Complete trade flow
func TestCompleteTradeFlow(t *testing.T) {
	ctx := NewMockContext()
	assetContract := new(AssetContract)
	tradeContract := &TradeContract{AssetContract: assetContract}
	commodityContract := new(CommodityContract)

	ctx.stub.MockTransactionStart("txID1")
	// Create commodity
	commodityContract.CreateCommodity(ctx, "apple", "Apple", `{"type": "fruit"}`)

	// Initialize users
	assetContract.InitUser(ctx, "alice", 1000.0)
	assetContract.InitUser(ctx, "bob", 1000.0)

	// Give Bob some apples
	assetContract.UpdateInventory(ctx, "bob", "apple", 10, "add")

	fmt.Println("=== Initial State ===")
	aliceAsset, _ := assetContract.GetUserAssets(ctx, "alice")
	bobAsset, _ := assetContract.GetUserAssets(ctx, "bob")
	bobInventory, _ := assetContract.GetInventory(ctx, "bob", "apple")
	fmt.Printf("Alice Balance: %.2f\n", aliceAsset.Balance)
	fmt.Printf("Bob Balance: %.2f, Apples: %d\n", bobAsset.Balance, bobInventory.Quantity)

	// Alice wants to buy 5 apples from Bob for 200
	err := tradeContract.CreateTrade(ctx, "trade123", "alice", "bob", "apple", 5, 200.0, "buy")
	assert.NoError(t, err)
	fmt.Println("\n=== Trade Created ===")

	// Execute trade
	err = tradeContract.ExecuteTrade(ctx, "trade123")
	assert.NoError(t, err)
	fmt.Println("=== Trade Executed ===")

	// Verify final state
	aliceAsset, _ = assetContract.GetUserAssets(ctx, "alice")
	bobAsset, _ = assetContract.GetUserAssets(ctx, "bob")
	aliceInventory, _ := assetContract.GetInventory(ctx, "alice", "apple")
	bobInventory, _ = assetContract.GetInventory(ctx, "bob", "apple")

	fmt.Println("\n=== Final State ===")
	fmt.Printf("Alice Balance: %.2f, Apples: %d\n", aliceAsset.Balance, aliceInventory.Quantity)
	fmt.Printf("Bob Balance: %.2f, Apples: %d\n", bobAsset.Balance, bobInventory.Quantity)

	assert.Equal(t, 800.0, aliceAsset.Balance)  // 1000 - 200
	assert.Equal(t, 1200.0, bobAsset.Balance)   // 1000 + 200
	assert.Equal(t, 5, aliceInventory.Quantity) // 0 + 5
	assert.Equal(t, 5, bobInventory.Quantity)   // 10 - 5
	ctx.stub.MockTransactionEnd("txID1")
}

// Benchmark tests
func BenchmarkInitUser(b *testing.B) {
	ctx := NewMockContext()
	contract := new(AssetContract)
	ctx.stub.MockTransactionStart("txID")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		userID := fmt.Sprintf("user%d", i)
		contract.InitUser(ctx, userID, 1000.0)
	}
	b.StopTimer()
	ctx.stub.MockTransactionEnd("txID")
}

func BenchmarkGetUserAssets(b *testing.B) {
	ctx := NewMockContext()
	contract := new(AssetContract)
	ctx.stub.MockTransactionStart("setupTx")
	contract.InitUser(ctx, "user1", 1000.0)
	ctx.stub.MockTransactionEnd("setupTx")

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		contract.GetUserAssets(ctx, "user1")
	}
}

func BenchmarkExecuteTrade(b *testing.B) {
	assetContract := new(AssetContract)
	tradeContract := &TradeContract{AssetContract: assetContract}

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		b.StopTimer()
		ctx := NewMockContext()
		ctx.stub.MockTransactionStart("txID")
		assetContract.InitUser(ctx, "user1", 1000.0)
		assetContract.InitUser(ctx, "user2", 1000.0)
		assetContract.UpdateInventory(ctx, "user2", "commodity1", 10, "add")
		tradeID := fmt.Sprintf("trade%d", i)
		tradeContract.CreateTrade(ctx, tradeID, "user1", "user2", "commodity1", 5, 100.0, "buy")
		b.StartTimer()

		tradeContract.ExecuteTrade(ctx, tradeID)

		b.StopTimer()
		ctx.stub.MockTransactionEnd("txID")
	}
}
