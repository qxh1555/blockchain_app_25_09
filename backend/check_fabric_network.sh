#!/bin/bash

# Script to check Fabric network status before starting backend

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${YELLOW}=== Checking Fabric Network Status ===${NC}\n"

# Check if required containers are running
required_containers=(
    "peer0.org1.example.com"
    "peer0.org2.example.com"
    "orderer.example.com"
    "ca.org1.example.com"
    "ca.org2.example.com"
)

all_running=true

for container in "${required_containers[@]}"; do
    if docker ps --format '{{.Names}}' | grep -q "^${container}$"; then
        echo -e "${GREEN}✓ ${container} is running${NC}"
    else
        echo -e "${RED}✗ ${container} is NOT running${NC}"
        all_running=false
    fi
done

echo ""

# Check if connection profile exists
CONNECTION_PROFILE="../fabric-network/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json"

if [ -f "$CONNECTION_PROFILE" ]; then
    echo -e "${GREEN}✓ Connection profile found${NC}"
else
    echo -e "${RED}✗ Connection profile NOT found at: $CONNECTION_PROFILE${NC}"
    all_running=false
fi

echo ""

if [ "$all_running" = true ]; then
    echo -e "${GREEN}========================================${NC}"
    echo -e "${GREEN}✓ All checks passed!${NC}"
    echo -e "${GREEN}✓ Fabric network is ready${NC}"
    echo -e "${GREEN}========================================${NC}"
    exit 0
else
    echo -e "${RED}========================================${NC}"
    echo -e "${RED}✗ Some checks failed!${NC}"
    echo -e "${RED}========================================${NC}"
    echo ""
    echo -e "${YELLOW}To fix this, run:${NC}"
    echo -e "  cd .."
    echo -e "  ./deploy_chaincode.sh"
    echo ""
    exit 1
fi

