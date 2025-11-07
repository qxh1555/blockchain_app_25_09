#!/bin/bash

# Script to start the blockchain game backend
# This assumes the Fabric network is already running

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'
cd /home/zyx/blockchain/blockchain_app_25_09/backend
echo -e "${BLUE}=== Starting Blockchain Game Backend ===${NC}\n"

# Check if Fabric network is running
echo -e "${YELLOW}Checking Fabric network status...${NC}"
if ! docker ps | grep -q "peer0.org1.example.com"; then
    echo -e "${RED}Error: Fabric network is not running!${NC}"
    echo -e "${YELLOW}Please run ./deploy_chaincode.sh first to start the network.${NC}"
    exit 1
fi
echo -e "${GREEN}✓ Fabric network is running${NC}\n"

# Check if MySQL is running
echo -e "${YELLOW}Checking MySQL status...${NC}"
if ! systemctl is-active --quiet mysql 2>/dev/null && ! pgrep -x mysqld > /dev/null; then
    echo -e "${RED}Warning: MySQL may not be running!${NC}"
    echo -e "${YELLOW}Please make sure MySQL is running before starting the backend.${NC}"
    echo -e "You can start MySQL with: sudo systemctl start mysql"
    read -p "Continue anyway? (y/n) " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        exit 1
    fi
else
    echo -e "${GREEN}✓ MySQL is running${NC}\n"
fi


# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
    echo -e "${GREEN}✓ Dependencies installed${NC}\n"
fi

# Start the backend server
echo -e "${BLUE}Starting backend server...${NC}\n"
echo -e "${GREEN}Server will be available at: http://localhost:3001${NC}\n"

npm start

