# Blockchain Game Application

基于 Hyperledger Fabric 的区块链游戏应用，所有游戏数据（余额、库存、交易、兑换规则等）都存储在区块链上。

## 架构说明

### 数据存储架构
- **区块链存储**（链上）：
  - 用户资产（余额）
  - 用户库存（商品持有量）
  - 商品信息（包括图片URL在metadata中）
  - 交易记录
  - 兑换规则和记录

- **MySQL存储**（链下）：
  - 仅存储用户认证信息（username, password）
  
### 技术栈
- **区块链**: Hyperledger Fabric 2.2
- **智能合约**: Go (链码)
- **后端**: Node.js + Express + Socket.IO
- **前端**: React (待集成)
- **数据库**: MySQL (仅用于用户认证)

## 项目结构

```
blockchain_app_25_09/
├── chaincode/              # Hyperledger Fabric 智能合约（Go）
│   ├── contracts/          # 合约实现
│   │   ├── asset_contract.go       # 资产管理
│   │   ├── commodity_contract.go   # 商品管理
│   │   ├── trade_contract.go       # 交易管理
│   │   └── redemption_contract.go  # 兑换管理
│   ├── models/             # 数据模型
│   └── utils/              # 工具函数
├── backend/                # Node.js 后端服务器
│   ├── index.js            # 主服务器（使用Fabric SDK）
│   ├── fabric_client.js    # Fabric 区块链客户端
│   ├── db.js               # 数据库配置（仅用户认证）
│   └── models/             # 数据模型
├── fabric-network/         # Fabric 网络配置
│   └── fabric-samples/     # Fabric 测试网络
├── deploy_chaincode.sh     # 链码部署脚本
└── fabric_bashrc.sh        # Fabric 交互辅助脚本
```

## 部署步骤

### 1. 前置要求

确保已安装：
- Docker 和 Docker Compose
- Node.js (v14+)
- MySQL 
- Go (1.17+)
- Hyperledger Fabric binaries

### 2. 部署区块链网络和链码

```bash
# 执行链码部署脚本
cd /home/zyx/blockchain/blockchain_app_25_09
./deploy_chaincode.sh
```

这个脚本会：
1. 清理旧网络
2. 启动 Fabric 测试网络
3. 创建通道 (mychannel)
4. 打包、安装、审批和提交链码
5. 初始化商品数据
6. 创建测试用户 (alice, bob)

### 3. 配置环境变量（可选）

```bash
# 加载 Fabric 环境变量，用于命令行交互
source fabric_bashrc.sh

# 测试查询
queryUserAssets alice
queryAllCommodities
```

### 4. 启动后端服务器

```bash
cd backend

# 安装依赖（首次运行）
npm install

# 启动服务器
npm start

# 或使用开发模式（自动重启）
npm run dev
```

服务器会：
1. 连接到 MySQL（用于用户认证）
2. 连接到 Fabric 网络
3. 初始化商品数据到区块链
4. 启动 WebSocket 服务器（端口 3001）

## API 接口

### REST API

#### 用户注册
```http
POST /api/register
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

#### 用户登录
```http
POST /api/login
Content-Type: application/json

{
  "username": "testuser",
  "password": "password123"
}
```

响应：
```json
{
  "token": "jwt_token_here",
  "userId": 1,
  "username": "testuser"
}
```

### WebSocket 事件

#### 客户端发送

1. **playerReady** - 玩家准备就绪
```javascript
socket.emit('playerReady', {
  id: userId,
  username: username
});
```

2. **proposeTrade** - 提议交易
```javascript
socket.emit('proposeTrade', {
  tradeId: uuid,
  fromUserId: userId,
  toUserId: targetUserId,
  tradeDetails: {
    commodityId: "1",
    quantity: 5,
    price: 100,
    action: "buy" // or "sell"
  }
});
```

3. **tradeResponse** - 响应交易提议
```javascript
socket.emit('tradeResponse', {
  tradeId: uuid,
  fromUserId: proposerId,
  toUserId: responderId,
  accepted: true, // or false
  tradeDetails: { ... }
});
```

4. **redeem** - 兑换奖励
```javascript
socket.emit('redeem', userId);
```

5. **refreshCommodities** - 刷新商品（花费500金币获得5个随机商品）
```javascript
socket.emit('refreshCommodities', userId);
```

#### 服务器发送

1. **gameStateUpdate** - 游戏状态更新
```javascript
{
  players: {
    [userId]: {
      id: userId,
      username: "user",
      balance: 1000,
      inventory: {
        "1": 5,  // commodityId: quantity
        "2": 3
      },
      redemptionRule: { ... }
    }
  },
  commodities: [ ... ]
}
```

2. **tradeProposal** - 收到交易提议
3. **tradeResult** - 交易结果
4. **tradeHistory** - 交易历史
5. **redeemResult** - 兑换结果
6. **refreshResult** - 刷新结果

## 区块链交互

### 使用 fabric_bashrc.sh

```bash
# 加载环境
source fabric_bashrc.sh

# 查看帮助
fabricHelp

# 查询用户资产
queryUserAssets alice

# 查询所有商品
queryAllCommodities

# 查询用户交易历史
queryUserTrades alice

# 初始化新用户
initUser charlie 1500
```

### 直接使用 peer 命令

```bash
# 设置环境变量
source fabric_bashrc.sh

# 查询
peer chaincode query \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"AssetContract:GetUserAssets","Args":["alice"]}'

# 调用（修改状态）
peer chaincode invoke \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  -C mychannel \
  -n game-chaincode \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${TEST_NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
  -c '{"function":"AssetContract:InitUser","Args":["newuser","2000"]}'
```

## 链码合约说明

### AssetContract - 资产管理

- `InitUser(userID, initialBalance)` - 初始化用户
- `GetUserAssets(userID)` - 获取用户资产
- `GetInventory(userID, commodityID)` - 获取库存项
- `GetAllInventory(userID)` - 获取所有库存
- `UpdateBalance(userID, amount, operation)` - 更新余额
- `UpdateInventory(userID, commodityID, quantity, operation)` - 更新库存

### CommodityContract - 商品管理

- `CreateCommodity(commodityID, name, metadataJSON)` - 创建商品
- `GetCommodity(commodityID)` - 获取商品
- `GetAllCommodities()` - 获取所有商品
- `InitializeCommodities()` - 初始化默认商品

### TradeContract - 交易管理

- `CreateTrade(tradeID, fromUserID, toUserID, commodityID, quantity, price, action)` - 创建交易
- `ExecuteTrade(tradeID)` - 执行交易
- `RejectTrade(tradeID)` - 拒绝交易
- `GetTradeStatus(tradeID)` - 获取交易状态
- `GetTradeHistory(userID)` - 获取交易历史

### RedemptionContract - 兑换管理

- `CreateRedemptionRule(userID, requiredItemsJSON, rewardAmount)` - 创建兑换规则
- `GetRedemptionRule(userID)` - 获取兑换规则
- `ExecuteRedemption(userID, recordID)` - 执行兑换
- `GetRedemptionHistory(userID)` - 获取兑换历史

## 数据模型

### 商品 (Commodity)
```json
{
  "commodityId": "1",
  "name": "Gold",
  "metadata": {
    "imageUrl": "/images/gold.png"
  },
  "createdAt": "2024-01-01T00:00:00Z"
}
```

### 用户资产 (UserAsset)
```json
{
  "userId": "1",
  "balance": 1000.0,
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### 库存 (Inventory)
```json
{
  "userId": "1",
  "commodityId": "1",
  "quantity": 10,
  "updatedAt": "2024-01-01T00:00:00Z"
}
```

### 交易 (Trade)
```json
{
  "tradeId": "uuid",
  "fromUserId": "1",
  "toUserId": "2",
  "commodityId": "1",
  "quantity": 5,
  "price": 100.0,
  "action": "buy",
  "status": "successful",
  "createdAt": "2024-01-01T00:00:00Z",
  "completedAt": "2024-01-01T00:00:01Z"
}
```

### 兑换规则 (RedemptionRule)
```json
{
  "ruleId": "rule_1",
  "userId": "1",
  "requiredItems": [
    {
      "commodityId": "1",
      "quantity": 5
    },
    {
      "commodityId": "2",
      "quantity": 3
    }
  ],
  "rewardAmount": 2500.0,
  "createdAt": "2024-01-01T00:00:00Z"
}
```

## 故障排除

### 1. Fabric 网络问题

```bash
# 查看容器状态
docker ps

# 查看日志
docker logs peer0.org1.example.com
docker logs orderer.example.com

# 重新部署
./deploy_chaincode.sh
```

### 2. 后端连接问题

检查：
- Fabric 网络是否正在运行
- MySQL 是否正在运行并且可以连接
- connection-org1.json 文件是否存在

### 3. 链码更新

如果修改了链码：
```bash
# 重新部署
./deploy_chaincode.sh

# 或者增量更新（需要修改版本号和序列号）
# 详见 Fabric 文档
```

## 开发说明

### 修改链码后重新部署

1. 修改链码文件
2. 运行 `./deploy_chaincode.sh`
3. 重启后端服务器

### 添加新的链码功能

1. 在 `chaincode/contracts/` 中添加新的合约或方法
2. 在 `backend/fabric_client.js` 中添加对应的客户端方法
3. 在 `backend/index.js` 中使用新功能
4. 重新部署链码

## 安全注意事项

1. **不要在生产环境中使用默认密钥和证书**
2. **JWT密钥应该使用环境变量**：将 `'123456'` 替换为安全的密钥
3. **数据库凭据应该使用环境变量**
4. **考虑使用 Fabric CA 进行身份管理**
5. **在生产环境中启用TLS**

## License

MIT

