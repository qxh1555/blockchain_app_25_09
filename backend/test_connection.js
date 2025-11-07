// Test script to verify both MySQL and Fabric connections

const db = require('./db');
const fabricClient = require('./fabric_client');

async function testConnections() {
    console.log('=== Testing Connections ===\n');
    
    let mysqlOk = false;
    let fabricOk = false;

    // Test MySQL connection
    console.log('1. Testing MySQL connection...');
    try {
        await db.sequelize.authenticate();
        console.log('   ✓ MySQL connection successful');
        console.log(`   - Database: ${db.sequelize.config.database}`);
        console.log(`   - Host: ${db.sequelize.config.host}`);
        console.log(`   - User: ${db.sequelize.config.username}`);
        mysqlOk = true;
    } catch (error) {
        console.error('   ✗ MySQL connection failed:', error.message);
        console.log('\n   To fix MySQL issues:');
        console.log('   - Make sure MySQL is running: sudo systemctl start mysql');
        console.log('   - Check credentials in backend/db.js');
        console.log('   - Run: mysql -u root -p123456 -e "CREATE DATABASE bc_db;"');
    }

    console.log('');

    // Test Fabric connection
    console.log('2. Testing Fabric network connection...');
    try {
        await fabricClient.connect();
        console.log('   ✓ Fabric connection successful');
        
        // Test a simple query
        const commodities = await fabricClient.getAllCommodities();
        console.log(`   ✓ Query test successful (found ${commodities.length} commodities)`);
        
        await fabricClient.disconnect();
        fabricOk = true;
    } catch (error) {
        console.error('   ✗ Fabric connection failed:', error.message);
        console.log('\n   To fix Fabric issues:');
        console.log('   - Make sure Fabric network is running');
        console.log('   - Check with: docker ps | grep fabric');
        console.log('   - If not running, deploy with: ./deploy_chaincode.sh');
        console.log('   - Check connection profile exists at:');
        console.log('     fabric-network/fabric-samples/test-network/organizations/peerOrganizations/org1.example.com/connection-org1.json');
    }

    console.log('\n=== Test Summary ===');
    console.log(`MySQL:  ${mysqlOk ? '✓ OK' : '✗ FAILED'}`);
    console.log(`Fabric: ${fabricOk ? '✓ OK' : '✗ FAILED'}`);
    
    if (mysqlOk && fabricOk) {
        console.log('\n✓ All systems ready! You can start the backend server.');
        process.exit(0);
    } else {
        console.log('\n✗ Some systems are not ready. Please fix the issues above.');
        process.exit(1);
    }
}

testConnections();

