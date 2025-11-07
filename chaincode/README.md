# Game Chaincode - 商品交易游戏链码

这是一个基于 Hyperledger Fabric 的区块链游戏链码，实现了商品交易、资产管理和兑换功能。

## 功能特性

### 1. 资产管理合约（AssetContract）
- `InitUser`: 初始化用户资产
- `GetUserAssets`: 查询用户资产
- `GetInventory`: 查询用户库存
- `GetAllInventory`: 查询用户所有库存
- `UpdateBalance`: 更新用户余额（内部函数）
- `UpdateInventory`: 更新用户库存（内部函数）

### 2. 商品合约（CommodityContract）
- `CreateCommodity`: 创建商品
- `GetCommodity`: 查询商品信息
- `GetAllCommodities`: 查询所有商品
- `InitializeCommodities`: 初始化默认商品

### 3. 交易合约（TradeContract）
- `CreateTrade`: 创建交易提案
- `ExecuteTrade`: 执行交易
- `RejectTrade`: 拒绝交易
- `GetTradeStatus`: 查询交易状态
- `GetTradeHistory`: 查询交易历史

### 4. 兑换合约（RedemptionContract）
- `CreateRedemptionRule`: 创建兑换规则
- `GetRedemptionRule`: 查询兑换规则
- `ExecuteRedemption`: 执行兑换
- `GetRedemptionHistory`: 查询兑换历史

## 项目结构

```
game-chaincode/
├── contracts/              # 合约实现
│   ├── asset_contract.go       # 资产管理合约
│   ├── commodity_contract.go   # 商品合约
│   ├── trade_contract.go       # 交易合约
│   ├── redemption_contract.go  # 兑换合约
│   └── contracts_test.go       # 单元测试
├── models/                # 数据模型
│   └── models.go
├── utils/                 # 工具函数
│   └── keys.go            # 状态数据库键管理
├── main.go               # 链码入口
├── go.mod               # Go 模块定义
└── README.md
```

## 环境要求

- Go 1.20+
- Hyperledger Fabric 2.x

## 安装依赖

```bash
cd chaincode/game-chaincode
go mod download
go mod tidy
```

## 运行测试

```bash
# 运行所有测试
go test ./contracts -v

# 运行单个测试
go test ./contracts -v -run TestInitUser

# 查看测试覆盖率
go test ./contracts -cover
```

## 部署到 Fabric 网络

### 1. 打包链码

```bash
peer lifecycle chaincode package game-chaincode.tar.gz \
  --path ./chaincode/game-chaincode \
  --lang golang \
  --label game_1.0
```

### 2. 安装链码

```bash
peer lifecycle chaincode install game-chaincode.tar.gz
```

### 3. 批准链码定义

```bash
peer lifecycle chaincode approveformyorg \
  --channelID mychannel \
  --name game-chaincode \
  --version 1.0 \
  --package-id <PACKAGE_ID> \
  --sequence 1
```

### 4. 提交链码定义

```bash
peer lifecycle chaincode commit \
  --channelID mychannel \
  --name game-chaincode \
  --version 1.0 \
  --sequence 1
```

### 5. 初始化链码

```bash
# 初始化商品
peer chaincode invoke \
  -o localhost:7050 \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"CommodityContract:InitializeCommodities","Args":[]}'

# 初始化用户
peer chaincode invoke \
  -o localhost:7050 \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"AssetContract:InitUser","Args":["user1","1000"]}'
```

## 使用示例

### 创建交易

```bash
# Alice 想从 Bob 购买 5 个苹果，价格 200
peer chaincode invoke \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"TradeContract:CreateTrade","Args":["trade1","alice","bob","apple","5","200","buy"]}'
```

### 执行交易

```bash
peer chaincode invoke \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"TradeContract:ExecuteTrade","Args":["trade1"]}'
```

### 查询用户资产

```bash
peer chaincode query \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"AssetContract:GetUserAssets","Args":["alice"]}'
```

### 创建兑换规则

```bash
peer chaincode invoke \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"RedemptionContract:CreateRedemptionRule","Args":["alice","[{\"commodityId\":\"apple\",\"quantity\":3}]","500"]}'
```

### 执行兑换

```bash
peer chaincode invoke \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"RedemptionContract:ExecuteRedemption","Args":["alice","record1"]}'
```

## 数据结构

### UserAsset（用户资产）
```json
{
  "userId": "user1",
  "balance": 1000.0,
  "updatedAt": "2025-11-07T10:00:00Z"
}
```

### Inventory（库存）
```json
{
  "userId": "user1",
  "commodityId": "apple",
  "quantity": 10,
  "updatedAt": "2025-11-07T10:00:00Z"
}
```

### Trade（交易）
```json
{
  "tradeId": "trade1",
  "fromUserId": "alice",
  "toUserId": "bob",
  "commodityId": "apple",
  "quantity": 5,
  "price": 200.0,
  "action": "buy",
  "status": "pending",
  "createdAt": "2025-11-07T10:00:00Z"
}
```

### RedemptionRule（兑换规则）
```json
{
  "ruleId": "rule_user1",
  "userId": "user1",
  "requiredItems": [
    {"commodityId": "apple", "quantity": 3},
    {"commodityId": "banana", "quantity": 2}
  ],
  "rewardAmount": 500.0,
  "createdAt": "2025-11-07T10:00:00Z"
}
```

## 事件

链码会在关键操作后发出事件：

- `TradeExecuted`: 交易执行成功
- `RedemptionExecuted`: 兑换执行成功

## 注意事项

1. 所有金额和数量必须为正数
2. 交易执行前会验证余额和库存是否充足
3. 交易是原子性的，要么全部成功，要么全部失败
4. 每个用户只能有一个兑换规则
5. 交易状态包括：pending（待处理）、successful（成功）、rejected（拒绝）

## 开发者

本链码基于 Hyperledger Fabric Contract API 开发，遵循最佳实践和安全规范。

## 许可证

MIT License

