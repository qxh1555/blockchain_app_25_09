const { Gateway, Wallets } = require('fabric-network');
const fs = require('fs');
const path = require('path');

class FabricClient {
    constructor() {
        this.gateway = null;
        this.contract = null;
        this.network = null;
        this.wallet = null;
        this.isConnected = false;
    }

    async connect() {
        try {
            // Path to connection profile
            const ccpPath = path.resolve(__dirname, '..', 'fabric-network', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
            const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

            // Create a new file system based wallet for managing identities
            const walletPath = path.join(process.cwd(), 'wallet');
            this.wallet = await Wallets.newFileSystemWallet(walletPath);

            // Check if admin identity exists
            const identity = await this.wallet.get('admin');
            if (!identity) {
                console.log('Admin identity not found in wallet, enrolling...');
                await this.enrollAdmin();
            }

            // Create a new gateway for connecting to the peer node
            this.gateway = new Gateway();
            await this.gateway.connect(ccp, {
                wallet: this.wallet,
                identity: 'admin',
                discovery: { enabled: true, asLocalhost: true }
            });

            // Get the network (channel) our contract is deployed to
            this.network = await this.gateway.getNetwork('mychannel');

            // Get the contract from the network
            this.contract = this.network.getContract('game-chaincode');
            
            this.isConnected = true;
            console.log('✓ Connected to Fabric network');
        } catch (error) {
            console.error(`Failed to connect to Fabric network: ${error}`);
            throw error;
        }
    }

    async enrollAdmin() {
        try {
            const FabricCAServices = require('fabric-ca-client');
            const ccpPath = path.resolve(__dirname, '..', 'fabric-network', 'fabric-samples', 'test-network', 'organizations', 'peerOrganizations', 'org1.example.com', 'connection-org1.json');
            const ccp = JSON.parse(fs.readFileSync(ccpPath, 'utf8'));

            // Create a new CA client for interacting with the CA
            const caInfo = ccp.certificateAuthorities['ca.org1.example.com'];
            const caTLSCACerts = caInfo.tlsCACerts.pem;
            const ca = new FabricCAServices(caInfo.url, { trustedRoots: caTLSCACerts, verify: false }, caInfo.caName);

            // Enroll the admin user
            const enrollment = await ca.enroll({ enrollmentID: 'admin', enrollmentSecret: 'adminpw' });
            const x509Identity = {
                credentials: {
                    certificate: enrollment.certificate,
                    privateKey: enrollment.key.toBytes(),
                },
                mspId: 'Org1MSP',
                type: 'X.509',
            };
            await this.wallet.put('admin', x509Identity);
            console.log('✓ Successfully enrolled admin user and imported it into the wallet');
        } catch (error) {
            console.error(`Failed to enroll admin user: ${error}`);
            throw error;
        }
    }

    async disconnect() {
        if (this.gateway) {
            await this.gateway.disconnect();
            this.isConnected = false;
            console.log('✓ Disconnected from Fabric network');
        }
    }

    // ===== Asset Contract Methods =====
    async initUser(userId, initialBalance = 10000) {
        try {
            await this.contract.submitTransaction('AssetContract:InitUser', userId, initialBalance.toString());
            console.log('✓ User initialized successfully');
            return { success: true };
        } catch (error) {
            if (error.message.includes('already exists')) {
                // User already exists, just return success
                console.log(`✓ User ${userId} already exists, returning success`);
                return { success: true };
            }
            console.error(`Error initializing user ${userId}: ${error}`);
            throw error;
        }
    }

    async getUserAssets(userId) {
        try {
            const result = await this.contract.evaluateTransaction('AssetContract:GetUserAssets', userId);
            const resultStr = result.toString();
            
            if (!resultStr || resultStr.trim() === '') {
                return null;
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            if (error.message.includes('not found')) {
                return null;
            }
            throw error;
        }
    }

    async getAllInventory(userId) {
        try {
            const result = await this.contract.evaluateTransaction('AssetContract:GetAllInventory', userId);
            const resultStr = result.toString();
            
            // Check if result is empty or whitespace
            if (!resultStr || resultStr.trim() === '') {
                console.log(`Empty inventory result for user ${userId}, returning empty array`);
                return [];
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            console.error(`Error getting inventory: ${error}`);
            return [];
        }
    }

    async getInventory(userId, commodityId) {
        try {
            const result = await this.contract.evaluateTransaction('AssetContract:GetInventory', userId, commodityId);
            const resultStr = result.toString();
            
            if (!resultStr || resultStr.trim() === '') {
                return { quantity: 0 };
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            console.error(`Error getting inventory item: ${error}`);
            return { quantity: 0 };
        }
    }

    async updateInventory(userId, commodityId, quantity, operation) {
        try {
            await this.contract.submitTransaction('AssetContract:UpdateInventory', userId, commodityId, quantity.toString(), operation);
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    async updateBalance(userId, amount, operation) {
        try {
            await this.contract.submitTransaction('AssetContract:UpdateBalance', userId, amount.toString(), operation);
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    // ===== Commodity Contract Methods =====
    async createCommodity(commodityId, name, metadata = {}) {
        try {
            const metadataJSON = JSON.stringify(metadata);
            await this.contract.submitTransaction('CommodityContract:CreateCommodity', commodityId, name, metadataJSON);
            return { success: true };
        } catch (error) {
            if (error.message.includes('already exists')) {
                return { success: true };
            }
            throw error;
        }
    }

    async getAllCommodities() {
        try {
            const result = await this.contract.evaluateTransaction('CommodityContract:GetAllCommodities');
            const resultStr = result.toString();
            
            if (!resultStr || resultStr.trim() === '') {
                console.log('Empty commodities result, returning empty array');
                return [];
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            console.error(`Error getting commodities: ${error}`);
            return [];
        }
    }

    async getCommodity(commodityId) {
        try {
            const result = await this.contract.evaluateTransaction('CommodityContract:GetCommodity', commodityId);
            const resultStr = result.toString();
            
            if (!resultStr || resultStr.trim() === '') {
                return null;
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            return null;
        }
    }

    // ===== Trade Contract Methods =====
    async createTrade(tradeId, fromUserId, toUserId, commodityId, quantity, price, action) {
        try {
            await this.contract.submitTransaction('TradeContract:CreateTrade', 
                tradeId, fromUserId, toUserId, commodityId, 
                quantity.toString(), price.toString(), action);
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    async executeTrade(tradeId) {
        try {
            await this.contract.submitTransaction('TradeContract:ExecuteTrade', tradeId);
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    async rejectTrade(tradeId) {
        try {
            await this.contract.submitTransaction('TradeContract:RejectTrade', tradeId);
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    async getTradeStatus(tradeId) {
        try {
            const result = await this.contract.evaluateTransaction('TradeContract:GetTradeStatus', tradeId);
            const resultStr = result.toString();
            
            if (!resultStr || resultStr.trim() === '') {
                return null;
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            return null;
        }
    }

    async getTradeHistory(userId) {
        try {
            const result = await this.contract.evaluateTransaction('TradeContract:GetTradeHistory', userId);
            const resultStr = result.toString();
            
            // Check if result is empty or whitespace
            if (!resultStr || resultStr.trim() === '') {
                console.log(`Empty trade history result for user ${userId}, returning empty array`);
                return [];
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            console.error(`Error getting trade history: ${error}`);
            return [];
        }
    }

    // ===== Redemption Contract Methods =====
    async createRedemptionRule(userId, requiredItems, rewardAmount) {
        try {
            const requiredItemsJSON = JSON.stringify(requiredItems);
            await this.contract.submitTransaction('RedemptionContract:CreateRedemptionRule', 
                userId, requiredItemsJSON, rewardAmount.toString());
            return { success: true };
        } catch (error) {
            if (error.message.includes('already exists')) {
                return { success: true };
            }
            throw error;
        }
    }

    async getRedemptionRule(userId) {
        try {
            const result = await this.contract.evaluateTransaction('RedemptionContract:GetRedemptionRule', userId);
            const resultStr = result.toString();
            
            if (!resultStr || resultStr.trim() === '') {
                return null;
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            if (error.message.includes('not found')) {
                return null;
            }
            throw error;
        }
    }

    async executeRedemption(userId, recordId) {
        try {
            await this.contract.submitTransaction('RedemptionContract:ExecuteRedemption', userId, recordId);
            return { success: true };
        } catch (error) {
            throw error;
        }
    }

    async getRedemptionHistory(userId) {
        try {
            const result = await this.contract.evaluateTransaction('RedemptionContract:GetRedemptionHistory', userId);
            const resultStr = result.toString();
            
            if (!resultStr || resultStr.trim() === '') {
                console.log(`Empty redemption history result for user ${userId}, returning empty array`);
                return [];
            }
            
            return JSON.parse(resultStr);
        } catch (error) {
            console.error(`Error getting redemption history: ${error}`);
            return [];
        }
    }
}

// Singleton instance
const fabricClient = new FabricClient();

module.exports = fabricClient;

