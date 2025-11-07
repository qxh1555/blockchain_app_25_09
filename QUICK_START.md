# 快速启动指南

## 问题诊断

如果遇到 `ClientRequest.emit` 或网络连接错误，通常是因为：

1. **Fabric 网络未运行**
2. **CA 服务器不可用**
3. **连接配置文件不存在**

## 解决步骤

### 第 1 步：检查 Fabric 网络状态

```bash
# 查看 Docker 容器状态
docker ps

# 应该看到以下容器正在运行：
# - peer0.org1.example.com
# - peer0.org2.example.com
# - orderer.example.com
# - ca.org1.example.com
# - ca.org2.example.com
```

如果容器没有运行，执行：

```bash
cd /home/zyx/blockchain/blockchain_app_25_09
./deploy_chaincode.sh
```

### 第 2 步：配置 MySQL

```bash
# 登录 MySQL
sudo mysql

# 在 MySQL 中执行：
CREATE DATABASE bc_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';
FLUSH PRIVILEGES;
EXIT;

# 测试连接
mysql -u root -p123456 bc_db -e "SELECT 'MySQL is ready!' as status;"
```

### 第 3 步：测试连接

```bash
cd backend

# 安装依赖（首次运行）
npm install

# 运行连接测试
node test_connection.js
```

这个测试会检查：
- ✓ MySQL 连接
- ✓ Fabric 网络连接
- ✓ 智能合约查询

### 第 4 步：启动后端服务器

```bash
# 在 backend 目录
npm start
```

## 常见错误及解决方案

### 错误 1: `ECONNREFUSED` 连接被拒绝

**原因**：Fabric CA 服务器未运行

**解决**：
```bash
# 检查 CA 容器
docker ps | grep ca.org1.example.com

# 如果没有运行，重新部署网络
cd /home/zyx/blockchain/blockchain_app_25_09
./deploy_chaincode.sh
```

### 错误 2: `ENOENT: no such file or directory, open 'connection-org1.json'`

**原因**：连接配置文件不存在

**解决**：
```bash
# 检查文件是否存在
ls -la fabric-network/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json

# 如果不存在，重新部署网络
./deploy_chaincode.sh
```

### 错误 3: MySQL 连接失败

**原因**：MySQL 未运行或密码错误

**解决**：
```bash
# 启动 MySQL
sudo systemctl start mysql

# 检查状态
sudo systemctl status mysql

# 重置密码（如果需要）
sudo mysql
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';
FLUSH PRIVILEGES;
EXIT;
```

### 错误 4: `Admin identity not found` 然后失败

**原因**：首次连接时需要注册管理员身份

**解决**：
```bash
# 删除旧的 wallet（如果存在）
rm -rf backend/wallet

# 确保 CA 服务器运行
docker ps | grep ca.org1.example.com

# 重新启动后端，会自动注册
cd backend
npm start
```

## 完整的启动流程（从头开始）

```bash
# 1. 进入项目目录
cd /home/zyx/blockchain/blockchain_app_25_09

# 2. 部署 Fabric 网络和链码
./deploy_chaincode.sh

# 3. 配置 MySQL
sudo mysql
> CREATE DATABASE bc_db;
> ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';
> FLUSH PRIVILEGES;
> EXIT;

# 4. 进入后端目录
cd backend

# 5. 安装依赖
npm install

# 6. 测试连接
node test_connection.js

# 7. 启动服务器
npm start
```

## 验证服务器启动成功

启动成功后应该看到：

```
✓ Database synced successfully (authentication only).
✓ Connected to Fabric blockchain network.
✓ Commodities initialized on blockchain.
✓ Loaded 8 commodities from blockchain.

========================================
✓ Server is listening on port 3001
✓ Using Hyperledger Fabric for game data storage
========================================
```

## 测试 API

```bash
# 测试注册
curl -X POST http://localhost:3001/api/register \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'

# 测试登录
curl -X POST http://localhost:3001/api/login \
  -H "Content-Type: application/json" \
  -d '{"username":"testuser","password":"password123"}'
```

## 日志和调试

### 查看 Fabric 网络日志

```bash
# Peer 日志
docker logs peer0.org1.example.com

# Orderer 日志
docker logs orderer.example.com

# CA 日志
docker logs ca.org1.example.com
```

### 查看后端日志

后端日志会直接输出到终端。关键日志包括：
- 数据库连接状态
- Fabric 网络连接状态
- WebSocket 连接
- 交易执行结果

## 停止服务

```bash
# 停止后端（Ctrl+C）

# 停止 Fabric 网络
cd /home/zyx/blockchain/blockchain_app_25_09/fabric-network/fabric-samples/test-network
./network.sh down
```

## 需要帮助？

如果仍然遇到问题：

1. 运行检查脚本：
   ```bash
   cd backend
   bash check_fabric_network.sh
   ```

2. 运行连接测试：
   ```bash
   node test_connection.js
   ```

3. 查看详细的错误信息，并根据上面的错误类型进行相应的修复。

