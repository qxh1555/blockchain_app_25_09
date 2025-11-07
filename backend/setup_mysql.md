# MySQL 环境配置指南

## 1. 安装 MySQL

### Ubuntu/Debian
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
sudo systemctl enable mysql
```

### CentOS/RHEL
```bash
sudo yum install mysql-server
sudo systemctl start mysqld
sudo systemctl enable mysqld
```

### macOS
```bash
brew install mysql
brew services start mysql
```

### Windows
下载并安装 MySQL Community Server: https://dev.mysql.com/downloads/mysql/

## 2. 安全配置（可选但推荐）

```bash
sudo mysql_secure_installation
```

按照提示进行：
- 设置root密码
- 移除匿名用户
- 禁止root远程登录
- 删除测试数据库

## 3. 创建数据库和用户

### 方式一：使用 root 用户直接配置（开发环境）

```bash
# 登录 MySQL
sudo mysql -u root -p
# 或者如果没有密码
sudo mysql
```

在 MySQL 命令行中执行：

```sql
-- 创建数据库
CREATE DATABASE bc_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 如果 root 密码不是 '123456'，需要修改
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';

-- 刷新权限
FLUSH PRIVILEGES;

-- 使用数据库
USE bc_db;

-- 查看数据库
SHOW DATABASES;

-- 退出
EXIT;
```

### 方式二：创建专用用户（生产环境推荐）

```sql
-- 创建数据库
CREATE DATABASE bc_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 创建专用用户
CREATE USER 'blockchain_user'@'localhost' IDENTIFIED BY 'your_secure_password';

-- 授予权限
GRANT ALL PRIVILEGES ON bc_db.* TO 'blockchain_user'@'localhost';

-- 刷新权限
FLUSH PRIVILEGES;

-- 退出
EXIT;
```

如果使用专用用户，需要修改 `backend/db.js`：

```javascript
const sequelize = new Sequelize('bc_db', 'blockchain_user', 'your_secure_password', {
  host: 'localhost',
  dialect: 'mysql',
  logging: false,
});
```

## 4. 测试连接

```bash
# 测试登录
mysql -u root -p123456 -e "USE bc_db; SHOW TABLES;"
```

## 5. 数据库结构

后端启动时会自动创建 `Users` 表，结构如下：

```sql
CREATE TABLE Users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) UNIQUE NOT NULL,
    password VARCHAR(255) NOT NULL,
    createdAt DATETIME NOT NULL,
    updatedAt DATETIME NOT NULL
);
```

注意：
- `balance` 字段已移除，余额存储在区块链上
- 其他游戏数据（库存、交易等）都存储在区块链上
- MySQL 仅用于用户认证

## 6. 常见问题

### 问题1：无法连接 MySQL

```bash
# 检查 MySQL 是否运行
sudo systemctl status mysql

# 启动 MySQL
sudo systemctl start mysql
```

### 问题2：密码错误

```sql
-- 重置密码
ALTER USER 'root'@'localhost' IDENTIFIED BY '123456';
FLUSH PRIVILEGES;
```

### 问题3：连接被拒绝

检查 MySQL 绑定地址：
```bash
# 编辑配置文件
sudo nano /etc/mysql/mysql.conf.d/mysqld.cnf

# 确保有这一行（允许本地连接）
bind-address = 127.0.0.1

# 重启 MySQL
sudo systemctl restart mysql
```

### 问题4：字符集问题

```sql
-- 检查字符集
SHOW VARIABLES LIKE 'character_set%';

-- 修改数据库字符集
ALTER DATABASE bc_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
```

## 7. 环境变量配置（推荐）

为了安全性，建议使用环境变量存储数据库凭据。

创建 `.env` 文件（在 backend 目录）：

```bash
DB_HOST=localhost
DB_NAME=bc_db
DB_USER=root
DB_PASSWORD=123456
```

安装 dotenv：
```bash
npm install dotenv
```

修改 `backend/db.js`：

```javascript
require('dotenv').config();
const { Sequelize } = require('sequelize');

const sequelize = new Sequelize(
  process.env.DB_NAME || 'bc_db',
  process.env.DB_USER || 'root',
  process.env.DB_PASSWORD || '123456',
  {
    host: process.env.DB_HOST || 'localhost',
    dialect: 'mysql',
    logging: false,
  }
);

const User = require('./models/user')(sequelize);

const db = {
  sequelize,
  Sequelize,
  User,
};

module.exports = db;
```

记得将 `.env` 添加到 `.gitignore`：
```bash
echo ".env" >> .gitignore
```

## 8. 验证配置

创建一个测试脚本 `backend/test_db.js`：

```javascript
const db = require('./db');

async function testConnection() {
  try {
    await db.sequelize.authenticate();
    console.log('✓ MySQL connection successful');
    
    await db.sequelize.sync();
    console.log('✓ Database synchronized');
    
    console.log('\nDatabase info:');
    console.log('- Database:', db.sequelize.config.database);
    console.log('- Host:', db.sequelize.config.host);
    console.log('- User:', db.sequelize.config.username);
    
    process.exit(0);
  } catch (error) {
    console.error('✗ Connection failed:', error.message);
    process.exit(1);
  }
}

testConnection();
```

运行测试：
```bash
cd backend
node test_db.js
```

## 9. 完整的初始化命令（快速开始）

```bash
# 1. 登录 MySQL
sudo mysql

# 2. 执行以下 SQL
CREATE DATABASE bc_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';
FLUSH PRIVILEGES;
EXIT;

# 3. 测试连接
mysql -u root -p123456 bc_db -e "SELECT 'MySQL is ready!' as status;"
```

成功后会显示：
```
+------------------+
| status           |
+------------------+
| MySQL is ready!  |
+------------------+
```

## 10. Docker 方式（可选）

如果使用 Docker：

```bash
# 启动 MySQL 容器
docker run -d \
  --name mysql-blockchain \
  -e MYSQL_ROOT_PASSWORD=123456 \
  -e MYSQL_DATABASE=bc_db \
  -p 3306:3306 \
  mysql:8.0

# 检查容器状态
docker ps

# 连接测试
docker exec -it mysql-blockchain mysql -uroot -p123456 -e "SHOW DATABASES;"
```

配置完成后，就可以启动后端服务器了！

