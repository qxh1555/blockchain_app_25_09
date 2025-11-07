#!/bin/bash

# Smart startup script for blockchain backend
# Checks prerequisites before starting

set -e

GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${BLUE}=== Blockchain Backend Startup ===${NC}\n"

# Check if we're in the backend directory
if [ ! -f "package.json" ]; then
    echo -e "${RED}Error: Must be run from the backend directory${NC}"
    exit 1
fi

# Check Fabric network
echo -e "${YELLOW}[1/4] Checking Fabric network...${NC}"
if ! docker ps | grep -q "peer0.org1.example.com"; then
    echo -e "${RED}✗ Fabric network is NOT running${NC}"
    echo -e "${YELLOW}Run this command first:${NC}"
    echo -e "  cd .. && ./deploy_chaincode.sh"
    exit 1
fi
echo -e "${GREEN}✓ Fabric network is running${NC}\n"

# Check MySQL
echo -e "${YELLOW}[2/4] Checking MySQL...${NC}"
if mysql -u root -p123456 -e "USE bc_db;" 2>/dev/null; then
    echo -e "${GREEN}✓ MySQL database is ready${NC}\n"
else
    echo -e "${YELLOW}⚠ MySQL database not configured${NC}"
    echo -e "${YELLOW}Attempting to create database...${NC}"
    
    if mysql -u root -p123456 -e "CREATE DATABASE IF NOT EXISTS bc_db;" 2>/dev/null; then
        echo -e "${GREEN}✓ Database created${NC}\n"
    else
        echo -e "${RED}✗ Could not access MySQL${NC}"
        echo -e "${YELLOW}Please run these commands:${NC}"
        echo -e "  sudo mysql"
        echo -e "  CREATE DATABASE bc_db;"
        echo -e "  ALTER USER 'root'@'localhost' IDENTIFIED WITH mysql_native_password BY '123456';"
        echo -e "  FLUSH PRIVILEGES;"
        echo -e "  EXIT;"
        exit 1
    fi
fi

# Check node_modules
echo -e "${YELLOW}[3/4] Checking dependencies...${NC}"
if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    npm install
fi
echo -e "${GREEN}✓ Dependencies ready${NC}\n"

# Test connections
echo -e "${YELLOW}[4/4] Testing connections...${NC}"
if node test_connection.js; then
    echo -e "\n${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ All systems ready!${NC}"
    echo -e "${GREEN}========================================${NC}\n"
    
    echo -e "${BLUE}Starting backend server...${NC}\n"
    npm start
else
    echo -e "\n${RED}========================================${NC}"
    echo -e "${RED}✗ Connection test failed${NC}"
    echo -e "${RED}========================================${NC}\n"
    echo -e "${YELLOW}Please fix the issues above before starting the server${NC}"
    exit 1
fi

