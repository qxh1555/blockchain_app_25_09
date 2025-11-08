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
}
