// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title DataRegistry
 * @dev A contract to store structured trade and redemption data on the blockchain.
 */
contract DataRegistry {

    // --- Trade Records ---

    struct TradeRecord {
        string tradeId;
        uint256 fromUserId;
        uint256 toUserId;
        uint256 commodityId;
        uint256 quantity;
        uint256 price;
        uint256 timestamp;
    }

    TradeRecord[] public tradeHistory;

    event TradeLogged(
        string tradeId,
        uint256 fromUserId,
        uint256 toUserId,
        uint256 timestamp
    );

    function addTrade(
        string memory _tradeId,
        uint256 _fromUserId,
        uint256 _toUserId,
        uint256 _commodityId,
        uint256 _quantity,
        uint256 _price
    ) public {
        tradeHistory.push(TradeRecord({
            tradeId: _tradeId,
            fromUserId: _fromUserId,
            toUserId: _toUserId,
            commodityId: _commodityId,
            quantity: _quantity,
            price: _price,
            timestamp: block.timestamp
        }));
        emit TradeLogged(_tradeId, _fromUserId, _toUserId, block.timestamp);
    }

    function getTradeCount() public view returns (uint) {
        return tradeHistory.length;
    }

    // --- Redemption Records ---

    struct RedemptionRecord {
        uint256 userId;
        uint256 redemptionRuleId;
        uint256 reward;
        uint256 timestamp;
    }

    RedemptionRecord[] public redemptionHistory;

    event RedemptionLogged(
        uint256 userId,
        uint256 redemptionRuleId,
        uint256 reward,
        uint256 timestamp
    );

    function addRedemption(
        uint256 _userId,
        uint256 _redemptionRuleId,
        uint256 _reward
    ) public {
        redemptionHistory.push(RedemptionRecord({
            userId: _userId,
            redemptionRuleId: _redemptionRuleId,
            reward: _reward,
            timestamp: block.timestamp
        }));
        emit RedemptionLogged(_userId, _redemptionRuleId, _reward, block.timestamp);
    }

    function getRedemptionCount() public view returns (uint) {
        return redemptionHistory.length;
    }

    // --- Initial State Records ---

    struct InitialStateItem {
        uint256 commodityId;
        uint256 quantity;
    }

    struct InitialStateRecord {
        uint256 userId;
        uint256 initialBalance;
        InitialStateItem[] inventory;
        uint256 timestamp;
    }

    InitialStateRecord[] public initialStates;

    event UserInitialized(
        uint256 userId,
        uint256 initialBalance,
        uint256 timestamp
    );

    function initializeUser(
        uint256 _userId,
        uint256 _initialBalance,
        uint256[] memory _commodityIds,
        uint256[] memory _quantities
    ) public {
        require(_commodityIds.length == _quantities.length, "Input arrays must have the same length");

        // Push a new record to storage and get a reference to it.
        InitialStateRecord storage newState = initialStates.push();

        // Populate the fields of the new storage struct.
        newState.userId = _userId;
        newState.initialBalance = _initialBalance;
        newState.timestamp = block.timestamp;

        // Now, populate the inventory array within the storage struct.
        for (uint i = 0; i < _commodityIds.length; i++) {
            newState.inventory.push(InitialStateItem({
                commodityId: _commodityIds[i],
                quantity: _quantities[i]
            }));
        }

        emit UserInitialized(_userId, _initialBalance, block.timestamp);
    }

    function getInitialStateCount() public view returns (uint) {
        return initialStates.length;
    }

    function getInitialStateRecord(uint256 _index) public view returns (
        uint256 userId,
        uint256 initialBalance,
        InitialStateItem[] memory inventory,
        uint256 timestamp
    ) {
        require(_index < initialStates.length, "Index out of bounds");
        InitialStateRecord storage record = initialStates[_index];
        return (
            record.userId,
            record.initialBalance,
            record.inventory,
            record.timestamp
        );
    }
}
