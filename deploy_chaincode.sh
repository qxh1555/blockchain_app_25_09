#!/bin/bash

# Script to deploy the game chaincode to Hyperledger Fabric test network
# This script will:
# 1. Start the test network
# 2. Create a channel
# 3. Package, install, approve, and commit the chaincode

set -e  # Exit on any error

# Colors for output
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${RED}=== Game Chaincode Deployment Script ===${NC}\n"

# Navigate to test network directory
TEST_NETWORK_DIR="/home/zyx/blockchain/blockchain_app_25_09/fabric-network/fabric-samples/test-network"
cd "$TEST_NETWORK_DIR"

# Step 1: Bring down any existing network
echo -e "${RED}Step 1: Cleaning up any existing network...${NC}"
./network.sh down

# Step 2: Start the network and create channel
echo -e "${RED}Step 2: Starting Fabric test network with channel 'mychannel'...${NC}"
./network.sh up createChannel -ca

# Step 3: Navigate back to project root
cd /home/zyx/blockchain/blockchain_app_25_09

# Step 4: Set up environment variables for peer CLI
echo -e "${RED}Step 3: Setting up environment variables...${NC}"
export FABRIC_CFG_PATH="${TEST_NETWORK_DIR}/../config/"
export CORE_PEER_TLS_ENABLED=true
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051
export ORDERER_CA="${TEST_NETWORK_DIR}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"

# Step 5: Package the chaincode
echo -e "${RED}Step 4: Packaging chaincode...${NC}"
peer lifecycle chaincode package game-chaincode.tar.gz \
  --path ./chaincode \
  --lang golang \
  --label game_1.0

echo -e "${GREEN}✓ Chaincode packaged successfully${NC}\n"

# Step 6: Install chaincode on Org1 peer
echo -e "${RED}Step 5: Installing chaincode on Org1 peer...${NC}"
peer lifecycle chaincode install game-chaincode.tar.gz

# Get package ID
echo -e "${RED}Step 6: Getting package ID...${NC}"
PACKAGE_ID=$(peer lifecycle chaincode queryinstalled | grep game_1.0 | sed 's/Package ID: //' | sed 's/, Label.*//')
echo -e "Package ID: ${GREEN}${PACKAGE_ID}${NC}\n"

# Step 7: Install chaincode on Org2 peer
echo -e "${RED}Step 7: Installing chaincode on Org2 peer...${NC}"
export CORE_PEER_LOCALMSPID="Org2MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
export CORE_PEER_ADDRESS=localhost:9051

peer lifecycle chaincode install game-chaincode.tar.gz
echo -e "${GREEN}✓ Chaincode installed on Org2${NC}\n"

# Step 8: Approve chaincode for Org2
echo -e "${RED}Step 8: Approving chaincode for Org2...${NC}"
peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  --channelID mychannel \
  --name game-chaincode \
  --version 1.0 \
  --package-id "$PACKAGE_ID" \
  --sequence 1

echo -e "${GREEN}✓ Chaincode approved for Org2${NC}\n"

# Step 9: Switch back to Org1 and approve
echo -e "${RED}Step 9: Approving chaincode for Org1...${NC}"
export CORE_PEER_LOCALMSPID="Org1MSP"
export CORE_PEER_TLS_ROOTCERT_FILE="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
export CORE_PEER_MSPCONFIGPATH="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
export CORE_PEER_ADDRESS=localhost:7051

peer lifecycle chaincode approveformyorg \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  --channelID mychannel \
  --name game-chaincode \
  --version 1.0 \
  --package-id "$PACKAGE_ID" \
  --sequence 1

echo -e "${GREEN}✓ Chaincode approved for Org1${NC}\n"

# Step 10: Check commit readiness
echo -e "${RED}Step 10: Checking commit readiness...${NC}"
peer lifecycle chaincode checkcommitreadiness \
  --channelID mychannel \
  --name game-chaincode \
  --version 1.0 \
  --sequence 1 \
  --output json

# Step 11: Commit chaincode definition
echo -e "${RED}Step 11: Committing chaincode definition...${NC}"
peer lifecycle chaincode commit \
  -o localhost:7050 \
  --ordererTLSHostnameOverride orderer.example.com \
  --tls --cafile "$ORDERER_CA" \
  --channelID mychannel \
  --name game-chaincode \
  --version 1.0 \
  --sequence 1 \
  --peerAddresses localhost:7051 \
  --tlsRootCertFiles "${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
  --peerAddresses localhost:9051 \
  --tlsRootCertFiles "${TEST_NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"

echo -e "${GREEN}✓ Chaincode committed successfully${NC}\n"

# Step 12: Query committed chaincodes
echo -e "${RED}Step 12: Verifying chaincode deployment...${NC}"
peer lifecycle chaincode querycommitted --channelID mychannel --name game-chaincode

# Step 13: Initialize the chaincode
echo -e "${RED}Step 13: Initializing chaincode data...${NC}"

# Initialize commodities
echo "Initializing commodities..."
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
  -c '{"function":"CommodityContract:InitializeCommodities","Args":[]}'

sleep 3

# Initialize test users
echo "Initializing user: alice..."
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
  -c '{"function":"AssetContract:InitUser","Args":["alice","1000"]}'

sleep 3

echo "Initializing user: bob..."
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
  -c '{"function":"AssetContract:InitUser","Args":["bob","2000"]}'

echo -e "\n${GREEN}✓ Chaincode initialized successfully${NC}\n"

# Step 14: Test queries
echo -e "${RED}Step 14: Testing chaincode with sample queries...${NC}"

echo "Querying Alice's assets..."
peer chaincode query \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"AssetContract:GetUserAssets","Args":["alice"]}'

echo -e "\nQuerying all commodities..."
peer chaincode query \
  -C mychannel \
  -n game-chaincode \
  -c '{"function":"CommodityContract:GetAllCommodities","Args":[]}'

echo -e "\n${GREEN}========================================${NC}"
echo -e "${GREEN}✓ Deployment Complete!${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "Chaincode '${GREEN}game-chaincode${NC}' has been successfully deployed to channel '${GREEN}mychannel${NC}'"
echo -e "\nYou can now interact with the chaincode using peer commands."
echo -e "Example:"
echo -e "  peer chaincode query -C mychannel -n game-chaincode -c '{\"function\":\"AssetContract:GetUserAssets\",\"Args\":[\"alice\"]}'"

