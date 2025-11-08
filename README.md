# 区块链商品交易游戏

这是一个全栈去中心化应用（dApp），它模拟了一个商品交易游戏。项目采用混合架构，将传统的 Web 技术栈与区块链技术相结合，以实现关键事件的透明性和不可篡改性。

## 项目架构

本项目是一个单一代码库（monorepo），由三个主要部分组成：

-   **`/frontend`**: 一个基于 React 的 Web 应用，为游戏提供用户界面。
-   **`/backend`**: 一个基于 Node.js (Express) 的服务器，负责处理用户认证、游戏逻辑，并与数据库和区块链进行通信。
-   **`/chain-logic`**: 一个基于以太坊的智能合约项目，使用 Hardhat 和 Solidity。该组件负责处理链上逻辑。

## 环境要求

在开始之前，请确保您的计算机上已安装以下软件：

-   [Node.js](https://nodejs.org/) (推荐 v16 或更高版本)
-   [Docker Desktop](https://www.docker.com/products/docker-desktop/) (用于运行数据库)
-   [Git](https://git-scm.com/)

## 安装与启动指南

请严格按照以下步骤操作，以便在您的本地计算机上成功运行项目。

### 第一步：克隆仓库

首先，将项目从 GitHub 克隆到您的本地计算机：

```bash
git clone <your-repository-url>
cd <repository-name>
```

### 第二步：安装依赖

该项目包含三个独立的部分，每个部分都需要安装各自的依赖。您需要为该过程打开三个独立的终端窗口。

-   **在终端 1 (用于前端):**
    ```bash
    cd frontend
    npm install
    ```

-   **在终端 2 (用于后端):**
    ```bash
    cd backend
    npm install
    ```

-   **在终端 3 (用于区块链):**
    ```bash
    cd chain-logic
    npm install
    ```

### 第三步：启动数据库

我们使用 Docker 来运行 MySQL 数据库，这样可以避免与您本地可能已安装的任何 MySQL 实例产生冲突。

-   **在一个新的终端中，运行以下命令：**
    ```bash
    docker run -d \
      --name mysql-blockchain \
      -e MYSQL_ROOT_PASSWORD=123456 \
      -e MYSQL_DATABASE=bc_db \
      -p 3307:3306 \
      mysql:8.0
    ```
    此命令将下载 MySQL 8.0 镜像，启动一个名为 `mysql-blockchain` 的容器，并通过 `3307` 端口使其可被访问。

### 第四步：部署智能合约

智能合约需要被部署到一个本地的区块链网络上。

1.  **启动本地区块链节点 (使用 Ganache)：**
    -   在您的**区块链终端 (终端 3)** 中，运行：
        ```bash
        npx ganache
        ```
    -   这将启动一个2本地的以太坊节点，并列出10个测试账户及其私钥。请保持此终端窗口持续运行。

2.  **部署合约：**
    -   **打开一个新的终端 (终端 4)。**
    -   进入 `chain-logic` 目录：
        ```bash
        cd chain-logic
        ```
    -   运行部署脚本：
        ```bash
        npx hardhat run scripts/deploy.js --network localhost
        ```
    -   脚本将输出已部署的合约地址，内容类似：
        `DataRegistry contract successfully deployed to: 0x54Cc02c75c829F60e0F9B3A06410AbA624aC0633`

3.  **更新后端合约地址（关键步骤）：**
    -   从上一步的输出中，复制这个新的合约地址。
    -   在您的代码编辑器中，打开包含"const contractAddress"的五个文件
    -   找到 `const contractAddress = "..."` 这一行，然后将您复制的新地址**粘贴**到引号之间。保存这两个文件。


### 第五步：运行应用

现在您可以启动后端和前端服务了。

1.  **启动后端服务：**
    -   在您的**后端终端 (终端 2)** 中，运行：
        ```bash
        node index.js
        ```
    -   首次运行时，Sequelize 会在 `bc_db` 数据库中自动创建所有需要的表。您应该能看到日志信息 `Server is listening on port 3001`。

2.  **启动前端应用：**
    -   在您的**前端终端 (终端 1)** 中，运行：
        ```bash
        npm start
        ```
    -   这会自动在您的浏览器中打开一个新标签页。

### 第六步：访问应用

-   您的浏览器应该会打开 `http://localhost:3000`。
-   现在您可以注册一个新用户并开始使用该应用程序了。

## 项目工作流

-   **交易 (Trades)**: 当成功的交易累计达到10笔时，会自动批量上链。
-   **兑换 (Redemptions)**: 成功的兑换事件会立刻上链。
-   **数据验证**: 您可以通过运行 `chain-logic/scripts` 目录下的脚本（如 `read-trades.js` 和 `read-redemptions.js`）来验证链上数据。
