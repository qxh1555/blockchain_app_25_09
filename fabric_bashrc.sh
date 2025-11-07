#!/bin/bash

# Fabric Environment Configuration
# Source this file to interact with the deployed chaincode
# Usage: source fabric_bashrc.sh

# Colors for output
export GREEN='\033[0;32m'
export BLUE='\033[0;34m'
export YELLOW='\033[1;33m'
export RED='\033[0;31m'
export NC='\033[0m' # No Color

# Base paths
export TEST_NETWORK_DIR="/home/zyx/blockchain/blockchain_app_25_09/fabric-network/fabric-samples/test-network"
export PROJECT_ROOT="/home/zyx/blockchain/blockchain_app_25_09"

# Common Fabric environment variables
export FABRIC_CFG_PATH="${TEST_NETWORK_DIR}/../config/"
export CORE_PEER_TLS_ENABLED=true
export ORDERER_CA="${TEST_NETWORK_DIR}/organizations/ordererOrganizations/example.com/orderers/orderer.example.com/msp/tlscacerts/tlsca.example.com-cert.pem"
export CHANNEL_NAME="mychannel"
export CHAINCODE_NAME="game-chaincode"

# Set to Org1 by default
setOrg1() {
    export CORE_PEER_LOCALMSPID="Org1MSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/users/Admin@org1.example.com/msp"
    export CORE_PEER_ADDRESS=localhost:7051
    echo -e "${GREEN}✓ Switched to Org1${NC}"
}

setOrg2() {
    export CORE_PEER_LOCALMSPID="Org2MSP"
    export CORE_PEER_TLS_ROOTCERT_FILE="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt"
    export CORE_PEER_MSPCONFIGPATH="${TEST_NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/users/Admin@org2.example.com/msp"
    export CORE_PEER_ADDRESS=localhost:9051
    echo -e "${GREEN}✓ Switched to Org2${NC}"
}

# Convenience functions for chaincode interaction

# Query functions
queryUserAssets() {
    local username=$1
    if [ -z "$username" ]; then
        echo -e "${RED}Usage: queryUserAssets <username>${NC}"
        return 1
    fi
    echo -e "${BLUE}Querying assets for user: ${username}${NC}"
    peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c "{\"function\":\"AssetContract:GetUserAssets\",\"Args\":[\"${username}\"]}"
}

queryAllCommodities() {
    echo -e "${BLUE}Querying all commodities...${NC}"
    peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c '{"function":"CommodityContract:GetAllCommodities","Args":[]}'
}

queryCommodity() {
    local commodity=$1
    if [ -z "$commodity" ]; then
        echo -e "${RED}Usage: queryCommodity <commodityName>${NC}"
        return 1
    fi
    echo -e "${BLUE}Querying commodity: ${commodity}${NC}"
    peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c "{\"function\":\"CommodityContract:GetCommodity\",\"Args\":[\"${commodity}\"]}"
}

queryAllTrades() {
    echo -e "${BLUE}Querying all trades...${NC}"
    peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c '{"function":"TradeContract:GetAllTrades","Args":[]}'
}

queryUserTrades() {
    local username=$1
    if [ -z "$username" ]; then
        echo -e "${RED}Usage: queryUserTrades <username>${NC}"
        return 1
    fi
    echo -e "${BLUE}Querying trades for user: ${username}${NC}"
    peer chaincode query \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        -c "{\"function\":\"TradeContract:GetUserTrades\",\"Args\":[\"${username}\"]}"
}

# Invoke functions (require endorsement from both peers)
initUser() {
    local username=$1
    local initialCoins=$2
    if [ -z "$username" ] || [ -z "$initialCoins" ]; then
        echo -e "${RED}Usage: initUser <username> <initialCoins>${NC}"
        return 1
    fi
    echo -e "${BLUE}Initializing user: ${username} with ${initialCoins} coins${NC}"
    peer chaincode invoke \
        -o localhost:7050 \
        --ordererTLSHostnameOverride orderer.example.com \
        --tls --cafile "$ORDERER_CA" \
        -C ${CHANNEL_NAME} \
        -n ${CHAINCODE_NAME} \
        --peerAddresses localhost:7051 \
        --tlsRootCertFiles "${TEST_NETWORK_DIR}/organizations/peerOrganizations/org1.example.com/peers/peer0.org1.example.com/tls/ca.crt" \
        --peerAddresses localhost:9051 \
        --tlsRootCertFiles "${TEST_NETWORK_DIR}/organizations/peerOrganizations/org2.example.com/peers/peer0.org2.example.com/tls/ca.crt" \
        -c "{\"function\":\"AssetContract:InitUser\",\"Args\":[\"${username}\",\"${initialCoins}\"]}"
}

# Help function
fabricHelp() {
    echo -e "${YELLOW}=== Fabric Chaincode Interaction Helper ===${NC}\n"
    echo -e "${GREEN}Organization Management:${NC}"
    echo -e "  setOrg1                                    - Switch to Org1"
    echo -e "  setOrg2                                    - Switch to Org2"
    echo -e ""
    echo -e "${GREEN}Query Functions (read-only):${NC}"
    echo -e "  queryUserAssets <username>                 - Get user's assets"
    echo -e "  queryAllCommodities                        - Get all commodities"
    echo -e "  queryCommodity <commodityName>             - Get specific commodity"
    echo -e "  queryAllTrades                             - Get all trades"
    echo -e "  queryUserTrades <username>                 - Get user's trades"
    echo -e ""
    echo -e "${GREEN}Invoke Functions (write operations):${NC}"
    echo -e "  initUser <username> <initialCoins>         - Initialize new user"
    echo -e "  buyCommodity <user> <commodity> <quantity> - Buy commodity from system"
    echo -e "  sellCommodity <user> <commodity> <quantity>- Sell commodity to system"
    echo -e "  createTrade <creator> <offeredCommodity> <offeredQty> <requestedCommodity> <requestedQty>"
    echo -e "                                             - Create trade offer"
    echo -e "  acceptTrade <tradeID> <acceptor>           - Accept a trade"
    echo -e ""
    echo -e "${GREEN}Examples:${NC}"
    echo -e "  queryUserAssets alice"
    echo -e "  buyCommodity alice wheat 10"
    echo -e "  createTrade alice wheat 5 gold 2"
    echo -e ""
    echo -e "${BLUE}Current Configuration:${NC}"
    echo -e "  Channel: ${CHANNEL_NAME}"
    echo -e "  Chaincode: ${CHAINCODE_NAME}"
    echo -e "  Organization: ${CORE_PEER_LOCALMSPID:-Not Set}"
}

# Initialize to Org1 by default
setOrg1

echo -e "${GREEN}✓ Fabric environment loaded${NC}"
echo -e "Type ${YELLOW}fabricHelp${NC} to see available commands"

