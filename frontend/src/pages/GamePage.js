import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const SOCKET_URL = 'http://localhost:3001';

const GamePage = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [gameState, setGameState] = useState(null);
    const [activeTrades, setActiveTrades] = useState([]);
    const [notification, setNotification] = useState(null);
    const [countdown, setCountdown] = useState('');
    const [settlementPhase, setSettlementPhase] = useState(null);
    const [socket, setSocket] = useState(null);
    const [showLeaderboard, setShowLeaderboard] = useState(false);
    const [leaderboardData, setLeaderboardData] = useState([]);

    useEffect(() => {
        const token = sessionStorage.getItem('token');
        if (!token) {
            navigate('/login');
        } else {
            try {
                const payload = JSON.parse(atob(token.split('.')[1]));
                setUser({ id: payload.id, username: payload.username });
            } catch (e) {
                console.error("Failed to decode token:", e);
                sessionStorage.removeItem('token');
                navigate('/login');
            }
        }
    }, [navigate]);

    useEffect(() => {
        if (notification) {
            const timer = setTimeout(() => setNotification(null), 5000);
            return () => clearTimeout(timer);
        }
    }, [notification]);

    useEffect(() => {
        if (user) {
            const newSocket = io(SOCKET_URL);
            setSocket(newSocket);

            newSocket.on('connect', () => newSocket.emit('playerReady', user));
            newSocket.on('gameStateUpdate', setGameState);
            newSocket.on('redeemResult', setNotification);
            newSocket.on('refreshResult', setNotification);

            newSocket.on('settlement-start', () => setSettlementPhase('结算进行中...'));

            newSocket.on('global-settlement-complete', ({ leaderboard }) => {
                setNotification({ success: true, message: '结算完成！查看排行榜了解结果。' });
                setLeaderboardData(leaderboard || []);
                setShowLeaderboard(true);
                setSettlementPhase(null);
                // 清空交易记录
                setActiveTrades([]);
                setTimeout(() => {
                    setShowLeaderboard(false);
                }, 15000);
            });

            newSocket.on('tradeHistory', (history) => {
                const processedHistory = history.map(trade => ({
                    tradeId: trade.id,
                    fromUserId: trade.fromUserId,
                    toUserId: trade.toUserId,
                    tradeDetails: { commodityId: trade.commodityId, quantity: trade.quantity, price: trade.price, action: trade.action },
                    direction: trade.fromUserId === user.id ? 'outgoing' : 'incoming',
                    status: trade.status,
                    message: trade.message,
                }));
                setActiveTrades(processedHistory);
            });

            newSocket.on('tradeProposal', (proposal) => {
                const newTrade = { ...proposal, direction: 'incoming', status: 'pending' };
                setActiveTrades(prev => prev.some(t => t.tradeId === newTrade.tradeId) ? prev : [newTrade, ...prev]);
            });

            newSocket.on('tradeResult', (result) => {
                setActiveTrades(prev => prev.map(t => t.tradeId === result.tradeId ? { ...t, status: result.success ? 'successful' : 'failed', message: result.message } : t));
            });

            return () => newSocket.disconnect();
        }
    }, [user]);

    useEffect(() => {
        const calculateAndSetCountdown = () => {
            const now = new Date();
            const minutes = now.getMinutes();
            const seconds = now.getSeconds();

            if (minutes % 5 === 0 && seconds === 0) {
                if (user && socket) {
                    console.log("Settlement time! Emitting start-global-settlement.");
                    socket.emit('start-global-settlement');
                    setSettlementPhase('in-progress');
                }
            }

            const minutesToNext = 5 - (minutes % 5);
            let secondsToNext = (minutesToNext * 60) - seconds;

            if (secondsToNext === 300) {
                secondsToNext = 0;
            }

            const displayMinutes = Math.floor(secondsToNext / 60);
            const displaySeconds = secondsToNext % 60;

            setCountdown(`${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`);
        };

        calculateAndSetCountdown();
        const interval = setInterval(calculateAndSetCountdown, 1000);
        return () => clearInterval(interval);
    }, [user, socket]);

    const handleProposeTrade = (e) => {
        e.preventDefault();
        const form = e.target;
        const tradeDetails = { action: form.action.value, commodityId: form.commodityId.value, quantity: parseInt(form.quantity.value, 10), price: parseFloat(form.price.value) };
        const newTrade = { tradeId: uuidv4(), fromUserId: user.id, toUserId: form.toUserId.value, tradeDetails, direction: 'outgoing', status: 'pending' };
        setActiveTrades(prev => [newTrade, ...prev]);
        socket.emit('proposeTrade', newTrade);
        form.reset();
    };

    const handleTradeResponse = (trade, accepted) => {
        socket.emit('tradeResponse', { ...trade, accepted });
        setActiveTrades(prev => prev.map(t => t.tradeId === trade.tradeId ? { ...t, status: accepted ? 'accepted' : 'rejected' } : t));
    };

    const handleRedeem = () => socket.emit('redeem', user.id);
    const handleRefreshCommodities = () => socket.emit('refreshCommodities', user.id);
    const handleLogout = () => {
        sessionStorage.removeItem('token');
        navigate('/login');
    };

    const handleShowLeaderboard = async () => {
        try {
            const response = await fetch('http://localhost:3001/api/leaderboard');
            const data = await response.json();
            setLeaderboardData(data.leaderboard || []);
            setShowLeaderboard(true);
        } catch (error) {
            console.error('Failed to fetch leaderboard:', error);
            setNotification({ success: false, message: '获取排行榜失败' });
        }
    };

    const handleTriggerSettlement = async () => {
        if (!window.confirm('确定要手动触发结算吗？这将计算所有用户的分数，清空物品和余额，然后重新初始化所有用户。')) {
            return;
        }
        try {
            setSettlementPhase('触发结算中...');
            const response = await fetch('http://localhost:3001/api/admin/trigger-settlement', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
            });
            const data = await response.json();
            if (data.success) {
                setNotification({ success: true, message: '结算已触发，请等待完成' });
            } else {
                setNotification({ success: false, message: data.message || '触发结算失败' });
                setSettlementPhase(null);
            }
        } catch (error) {
            console.error('Failed to trigger settlement:', error);
            setNotification({ success: false, message: '触发结算失败: ' + error.message });
            setSettlementPhase(null);
        }
    };

    if (!user || !gameState) return <div>Loading...</div>;

    const self = gameState.players[user.id];
    const otherPlayers = Object.values(gameState.players).filter(p => p.id !== user.id);

    const canRedeem = () => {
        if (!self.redemptionRule) return false;
        return self.redemptionRule.RuleItems.every(item => (self.inventory[item.CommodityId] || 0) >= item.quantity);
    };

    // 计算卡牌得分：与后端逻辑一致
    // 单价 = 100 + 50 * (quantity - 1)
    // 总得分 = quantity * 单价
    const calculateCardScore = (quantity) => {
        if (quantity === 0) return { totalScore: 0, unitPrice: 0 };
        // 单价 = 100 + 50 * (数量 - 1)
        const unitPrice = 100 + 50 * (quantity - 1);
        // 总得分 = 数量 * 单价
        const totalScore = quantity * unitPrice;
        return { totalScore, unitPrice };
    };

    const renderTradeCard = (trade) => {
        const { tradeId, fromUserId, toUserId, tradeDetails, direction, status, message } = trade;
        const commodity = gameState.commodities.find(c => c.id === parseInt(tradeDetails.commodityId, 10));
        if (!commodity) return null;

        const fromPlayer = gameState.players[fromUserId];
        const toPlayer = gameState.players[toUserId];
        const fromUsername = fromPlayer ? fromPlayer.username : `User #${fromUserId}`;
        const toUsername = toPlayer ? toPlayer.username : `User #${toUserId}`;

        const isReceiver = direction === 'incoming' && status === 'pending';

        let title = '';
        if (direction === 'outgoing') title = `You -> ${toUsername}`;
        else title = `${fromUsername} -> You`;

        let statusClass = '';
        let statusText = '';
        switch (status) {
            case 'pending': statusClass = 'text-warning'; statusText = 'Pending'; break;
            case 'successful':
            case 'accepted': statusClass = 'text-success'; statusText = 'Successful'; break;
            case 'failed':
            case 'rejected': statusClass = 'text-danger'; statusText = 'Failed/Rejected'; break;
            default: statusClass = ''; statusText = status;
        }

        return (
            <div key={tradeId} className="card mb-3">
                <div className="card-header d-flex justify-content-between">
                    <span>{title}</span>
                    <strong className={statusClass}>{statusText}</strong>
                </div>
                <div className="card-body">
                    <p className="card-text">
                        Action: <strong>{tradeDetails.action.toUpperCase()}</strong><br />
                        Commodity: <strong>{commodity.name}</strong><br />
                        Quantity: <strong>{tradeDetails.quantity}</strong><br />
                        Price: <strong>${tradeDetails.price.toFixed(2)}</strong>
                    </p>
                    {message && <p className="card-text"><small className={statusClass}>{message}</small></p>}
                </div>
                {isReceiver && (
                    <div className="card-footer">
                        <button className="btn btn-success me-2" onClick={() => handleTradeResponse(trade, true)}>Accept</button>
                        <button className="btn btn-danger" onClick={() => handleTradeResponse(trade, false)}>Reject</button>
                    </div>
                )}
            </div>
        );
    };

    return (
        <div className="container mt-4">
            {showLeaderboard && (
                <div className="modal show" tabIndex="-1" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>
                    <div className="modal-dialog modal-dialog-centered modal-lg">
                        <div className="modal-content">
                            <div className="modal-header bg-primary text-white">
                                <h5 className="modal-title">🏆 排行榜（上次结算得分）🏆</h5>
                                <button type="button" className="btn-close btn-close-white" onClick={() => setShowLeaderboard(false)}></button>
                            </div>
                            <div className="modal-body">
                                {leaderboardData.length > 0 ? (
                                    <div className="table-responsive">
                                        <table className="table table-striped">
                                            <thead>
                                                <tr>
                                                    <th>排名</th>
                                                    <th>用户名</th>
                                                    <th className="text-end">余额</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {leaderboardData.map((player) => (
                                                    <tr key={player.id}>
                                                        <td>
                                                            <strong>
                                                                {player.rank === 1 && '🥇'}
                                                                {player.rank === 2 && '🥈'}
                                                                {player.rank === 3 && '🥉'}
                                                                {player.rank > 3 && player.rank}
                                                            </strong>
                                                        </td>
                                                        <td>{player.username}</td>
                                                        <td className="text-end">
                                                            <span className="badge bg-success">${player.balance.toFixed(2)}</span>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                ) : (
                                    <p className="text-center text-muted">暂无排行榜数据，等待下次结算</p>
                                )}
                            </div>
                            <div className="modal-footer">
                                <button type="button" className="btn btn-secondary" onClick={() => setShowLeaderboard(false)}>关闭</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {notification && (
                <div className={`alert ${notification.success ? 'alert-success' : 'alert-danger'} alert-dismissible fade show`}>
                    {notification.message}
                    <button type="button" className="btn-close" onClick={() => setNotification(null)}></button>
                </div>
            )}

            <div className="d-flex justify-content-between align-items-center mb-3">
                <h3>Welcome, {user.username}!</h3>
                <div>
                    <button className="btn btn-warning me-2" onClick={handleTriggerSettlement}>手动结算</button>
                    <button className="btn btn-primary me-2" onClick={handleShowLeaderboard}>查看排行榜</button>
                    <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
                </div>
            </div>

            <div className="row">
                <div className="col-12">
                    <div className="card mb-4">
                        <div className="card-body">
                            <h4 className="card-title">Your Status</h4>
                            {countdown && <p className="fs-5 text-end">Next Global Settlement: <strong className="text-danger">{countdown}</strong></p>}
                            {settlementPhase && <p className="fs-5 text-center text-info">Settlement Status: <strong>{settlementPhase}</strong></p>}
                            <p className="fs-5">Balance: <strong>${self.balance.toFixed(2)}</strong></p>
                            <h5 className="mt-4">Your Commodities:</h5>
                            <div className="row">
                                {gameState.commodities.map(c => {
                                    const quantity = self.inventory[c.id] || 0;
                                    const { totalScore, unitPrice } = calculateCardScore(quantity);
                                    return (
                                        <div key={c.id} className="col-md-4 mb-3">
                                            <div className={`card h-100 ${quantity === 0 ? 'border-secondary opacity-75' : 'border-primary'}`}>
                                                <div className="position-relative">
                                                    <img 
                                                        src={c.imageUrl} 
                                                        className="card-img-top" 
                                                        alt={c.name} 
                                                        style={{ 
                                                            width: '100%', 
                                                            height: '200px', 
                                                            objectFit: 'cover',
                                                            objectPosition: 'center'
                                                        }} 
                                                    />
                                                    <span className={`position-absolute top-0 end-0 m-2 badge ${quantity > 0 ? 'bg-primary' : 'bg-secondary'} fs-6 px-3 py-2`}>
                                                        {quantity > 0 ? `×${quantity}` : '无'}
                                                    </span>
                                                </div>
                                                <div className="card-body">
                                                    <h5 className="card-title d-flex justify-content-between align-items-center mb-2">
                                                        <span>{c.name}</span>
                                                        <span className={`badge ${quantity > 0 ? 'bg-success' : 'bg-secondary'} fs-6 ms-2`}>
                                                            {quantity > 0 ? `已拥有 ${quantity} 个` : '未拥有'}
                                                        </span>
                                                    </h5>
                                                    {quantity > 0 && (
                                                        <div className="mt-2">
                                                            <div className="d-flex justify-content-between align-items-center">
                                                                <small className="text-muted">总得分:</small>
                                                                <strong className="text-success">${totalScore.toFixed(0)}</strong>
                                                                <span className="text-muted mx-2">|</span>
                                                                <small className="text-muted">单价:</small>
                                                                <strong className="text-info">${unitPrice.toFixed(0)}</strong>
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    </div>

                    {activeTrades.length > 0 && (
                        <div className="card mb-4">
                            <div className="card-body">
                                <h4 className="card-title">Active Trades</h4>
                                {activeTrades.map(renderTradeCard)}
                            </div>
                        </div>
                    )}

                    <div className="card mb-4">
                        <div className="card-body">
                            <h4 className="card-title">All Players</h4>
                            <div className="table-responsive">
                                <table className="table table-bordered table-hover">
                                    <thead className="table-light">
                                        <tr>
                                            <th style={{ minWidth: '150px' }}>玩家</th>
                                            <th className="text-end" style={{ minWidth: '100px' }}>余额</th>
                                            {gameState.commodities.map(c => (
                                                <th key={c.id} className="text-center" style={{ minWidth: '100px' }}>
                                                    {c.name}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {/* 自己的一行 */}
                                        <tr className="table-primary">
                                            <td>
                                                <strong>{self.username} (我)</strong>
                                            </td>
                                            <td className="text-end">
                                                <span className="badge bg-info">${self.balance.toFixed(2)}</span>
                                            </td>
                                            {gameState.commodities.map(c => {
                                                const quantity = self.inventory[c.id] || 0;
                                                return (
                                                    <td key={c.id} className="text-center">
                                                        {quantity > 0 ? (
                                                            <span className="badge bg-success">{quantity}</span>
                                                        ) : (
                                                            <span className="badge bg-secondary">0</span>
                                                        )}
                                                    </td>
                                                );
                                            })}
                                        </tr>
                                        {/* 其他玩家 */}
                                        {otherPlayers.map(p => (
                                            <tr key={p.id}>
                                                <td>
                                                    <strong>{p.username}</strong>
                                                </td>
                                                <td className="text-end">
                                                    <span className="badge bg-info">${p.balance.toFixed(2)}</span>
                                                </td>
                                                {gameState.commodities.map(c => {
                                                    const quantity = p.inventory[c.id] || 0;
                                                    return (
                                                        <td key={c.id} className="text-center">
                                                            {quantity > 0 ? (
                                                                <span className="badge bg-success">✓</span>
                                                            ) : (
                                                                <span className="badge bg-secondary">✗</span>
                                                            )}
                                                        </td>
                                                    );
                                                })}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="card mb-4">
                        <div className="card-body">
                            <h4 className="card-title">Propose a Trade</h4>
                            <form onSubmit={handleProposeTrade}>
                                <div className="row g-2">
                                    <div className="col-md-3">
                                        <select name="toUserId" className="form-select" required>
                                            <option value="">To Player...</option>
                                            {otherPlayers.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <select name="action" className="form-select">
                                            <option value="buy">Buy</option>
                                            <option value="sell">Sell</option>
                                        </select>
                                    </div>
                                    <div className="col-md-3">
                                        <select name="commodityId" className="form-select" required>
                                            <option value="">Commodity...</option>
                                            {gameState.commodities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                        </select>
                                    </div>
                                    <div className="col-md-2">
                                        <input type="number" name="quantity" placeholder="Qty" className="form-control" min="1" required />
                                    </div>
                                    <div className="col-md-2">
                                        <input type="number" name="price" placeholder="Price" className="form-control" step="0.01" min="0" required />
                                    </div>
                                    <div className="col-12">
                                        <button type="submit" className="btn btn-primary mt-2">Propose</button>
                                    </div>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>

                <div className="col-md-4">
                    {false && self.redemptionRule && (
                        <div className="card mb-4">
                            <div className="card-body">
                                <h4 className="card-title">Redemption Offer</h4>
                                <p>Redeem for <strong>${self.redemptionRule.reward}</strong>:</p>
                                <ul>
                                    {self.redemptionRule.RuleItems.map(item => (
                                        <li key={item.id}>{item.quantity}x {item.Commodity.name}</li>
                                    ))}
                                </ul>
                                <button className="btn btn-success w-100" disabled={!canRedeem()} onClick={handleRedeem}>Redeem</button>
                            </div>
                        </div>
                    )}

                    {false && (
                        <div className="card mb-4">
                            <div className="card-body">
                                <h4 className="card-title">Actions</h4>
                                <button className="btn btn-info w-100" disabled={self.balance < 500} onClick={handleRefreshCommodities}>Refresh Commodities ($500)</button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export default GamePage;


