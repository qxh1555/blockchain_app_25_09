#!/bin/bash

# 区块链商品交易游戏启动脚本
# 这个脚本会自动启动数据库、区块链网络、部署合约并启动后端服务器

set -e  # 遇到错误立即退出

echo "🚀 启动区块链商品交易游戏..."

# 检查必要的工具
echo "📋 检查必要的工具..."

if ! command -v node &> /dev/null; then
    echo "❌ Node.js 未安装。请访问 https://nodejs.org/ 下载安装"
    exit 1
fi

if ! command -v npm &> /dev/null; then
    echo "❌ npm 未安装。请安装 Node.js"
    exit 1
fi

if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装。请访问 https://www.docker.com/products/docker-desktop/ 下载安装"
    exit 1
fi

echo "✅ 所有必要的工具都已安装"

# 检查依赖是否已安装
echo "📦 检查项目依赖..."

if [ ! -d "backend/node_modules" ]; then
    echo "安装后端依赖..."
    cd backend
    npm install
    cd ..
fi

if [ ! -d "chain-logic/node_modules" ]; then
    echo "安装链码依赖..."
    cd chain-logic
    npm install
    cd ..
fi

echo "✅ 项目依赖检查完成"

# 启动数据库
echo "🗄️ 启动 MySQL 数据库..."

# 停止可能存在的旧容器
docker stop mysql-blockchain 2>/dev/null || true
docker rm mysql-blockchain 2>/dev/null || true

# 启动新的数据库容器
docker run -d \
  --name mysql-blockchain \
  -e MYSQL_ROOT_PASSWORD=123456 \
  -e MYSQL_DATABASE=bc_db \
  -p 3307:3306 \
  mysql:8.0

echo "✅ 数据库容器已启动"

# 等待数据库启动
echo "⏳ 等待数据库启动..."
sleep 10

# 启动区块链网络
echo "⛓️ 启动 Ganache 本地区块链网络..."

# 安装 ganache-cli 如果没有安装
if ! command -v ganache &> /dev/null; then
    echo "安装 ganache-cli..."
    npm install -g ganache
fi

# 在后台启动 Ganache
ganache --port 8545 --gasLimit 8000000 &
GANACHE_PID=$!

echo "✅ Ganache 已启动 (PID: $GANACHE_PID)"

# 等待区块链网络启动
echo "⏳ 等待区块链网络启动..."
sleep 5

# 部署合约
echo "📄 部署智能合约..."

cd chain-logic

# 运行部署脚本
DEPLOY_OUTPUT=$(npx hardhat run scripts/deploy.js --network localhost)

# 提取合约地址
CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | grep "DataRegistry contract successfully deployed to:" | sed 's/.*: //' | tr -d '\n')

if [ -z "$CONTRACT_ADDRESS" ]; then
    echo "❌ 合约部署失败"
    echo "部署输出: $DEPLOY_OUTPUT"
    exit 1
fi

echo "✅ 合约已部署到地址: $CONTRACT_ADDRESS"

# 返回到项目根目录
cd ..

# 更新后端配置文件中的合约地址
echo "🔧 更新后端合约地址..."

# 更新 backend/index.js 中的合约地址
sed -i.bak "s/const contractAddress = \".*\"/const contractAddress = \"$CONTRACT_ADDRESS\"/" backend/index.js

echo "✅ 合约地址已更新"

# 启动后端服务器
echo "🖥️ 启动后端服务器..."

cd backend
node index.js &
BACKEND_PID=$!

# 返回到项目根目录
cd ..

echo ""
echo "🎉 所有服务已启动！"
echo ""
echo "📊 服务状态:"
echo "  - 数据库: 运行在端口 3307"
echo "  - Ganache: 运行在端口 8545"
echo "  - 后端服务器: 运行在端口 3001"
echo "  - 合约地址: $CONTRACT_ADDRESS"
echo ""
echo "💡 要停止所有服务，请运行: ./stop.sh"
echo "🌐 前端访问地址: http://localhost:3000 (需要单独启动前端)"
echo ""

# 创建停止脚本
cat > stop.sh << 'EOF'
#!/bin/bash
echo "🛑 停止所有服务..."

# 停止后端进程
if [ ! -z "$BACKEND_PID" ]; then
    kill $BACKEND_PID 2>/dev/null || true
    echo "✅ 后端服务器已停止"
fi

# 停止 Ganache
if [ ! -z "$GANACHE_PID" ]; then
    kill $GANACHE_PID 2>/dev/null || true
    echo "✅ Ganache 已停止"
fi

# 停止数据库容器
docker stop mysql-blockchain 2>/dev/null || true
docker rm mysql-blockchain 2>/dev/null || true
echo "✅ 数据库容器已停止"

echo "🎯 所有服务已停止"
EOF

chmod +x stop.sh

# 等待用户中断
echo "按 Ctrl+C 停止所有服务..."
trap './stop.sh; exit 0' INT
wait
