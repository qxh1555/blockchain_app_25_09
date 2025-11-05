
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { v4 as uuidv4 } from 'uuid';

const SOCKET_URL = 'http://localhost:3001';
let socket;

const GamePage = () => {
    const navigate = useNavigate();
    const [user, setUser] = useState(null);
    const [gameState, setGameState] = useState(null);
    const [activeTrades, setActiveTrades] = useState([]);

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
        if (user) {
            socket = io(SOCKET_URL);

            socket.on('connect', () => {
                socket.emit('playerReady', user);
            });

            socket.on('gameStateUpdate', (newGameState) => {
                setGameState(newGameState);
            });

            socket.on('tradeHistory', (history) => {
                const processedHistory = history.map(trade => ({
                    tradeId: trade.id,
                    fromUserId: trade.fromUserId,
                    toUserId: trade.toUserId,
                    tradeDetails: {
                        commodityId: trade.commodityId,
                        quantity: trade.quantity,
                        price: trade.price,
                        action: trade.action,
                    },
                    direction: trade.fromUserId === user.id ? 'outgoing' : 'incoming',
                    status: trade.status,
                    message: trade.message,
                }));
                setActiveTrades(processedHistory);
            });

            socket.on('tradeProposal', (proposal) => {
                const newTrade = {
                    ...proposal,
                    direction: 'incoming',
                    status: 'pending'
                };
                setActiveTrades(prevTrades => {
                    if (prevTrades.some(t => t.tradeId === newTrade.tradeId)) {
                        return prevTrades; // Avoid duplicates
                    }
                    return [newTrade, ...prevTrades];
                });
            });

            socket.on('tradeResult', (result) => {
                setActiveTrades(prevTrades => prevTrades.map(trade => {
                    if (trade.tradeId === result.tradeId) {
                        const newStatus = result.success ? 'successful' : 'failed';
                        return { ...trade, status: newStatus, message: result.message };
                    }
                    return trade;
                }));
            });

            return () => {
                socket.disconnect();
            };
        }
    }, [user]);

    const handleProposeTrade = (e) => {
        e.preventDefault();
        const form = e.target;
        const toUserId = form.toUserId.value;
        const tradeDetails = {
            action: form.action.value,
            commodityId: form.commodityId.value,
            quantity: parseInt(form.quantity.value, 10),
            price: parseFloat(form.price.value)
        };

        const newTrade = {
            tradeId: uuidv4(),
            fromUserId: user.id,
            toUserId: toUserId,
            tradeDetails: tradeDetails,
            direction: 'outgoing',
            status: 'pending'
        };

        setActiveTrades(prevTrades => [newTrade, ...prevTrades]);
        socket.emit('proposeTrade', newTrade);
        form.reset();
    };

    const handleTradeResponse = (trade, accepted) => {
        const response = {
            ...trade,
            accepted
        };
        socket.emit('tradeResponse', response);

        // Optimistically update the UI for the receiver
        setActiveTrades(prevTrades => prevTrades.map(t => {
            if (t.tradeId === trade.tradeId) {
                const newStatus = accepted ? 'accepted' : 'rejected';
                return { ...t, status: newStatus, message: `You have ${newStatus} the trade.` };
            }
            return t;
        }));
    };
    
    const handleLogout = () => {
        sessionStorage.removeItem('token');
        navigate('/login');
    };

    if (!user || !gameState) {
        return <div>Loading...</div>;
    }

    const self = gameState.players[user.id];
    const otherPlayers = Object.values(gameState.players).filter(p => p.id !== user.id);

    const renderTradeCard = (trade) => {
        const { tradeId, fromUserId, toUserId, tradeDetails, direction, status, message } = trade;
        const commodity = gameState.commodities.find(c => c.id === parseInt(tradeDetails.commodityId, 10));
        const fromPlayer = gameState.players[fromUserId];
        const toPlayer = gameState.players[toUserId];

        if (!commodity || !fromPlayer || !toPlayer) return null;

        const isReceiver = direction === 'incoming' && status === 'pending';

        let title = '';
        if (direction === 'outgoing') title = `You -> ${toPlayer.username}`;
        else title = `${fromPlayer.username} -> You`;

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
                        Action: <strong>{tradeDetails.action.toUpperCase()}</strong><br/>
                        Commodity: <strong>{commodity.name}</strong><br/>
                        Quantity: <strong>{tradeDetails.quantity}</strong><br/>
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
    }

    return (
        <div className="container mt-4">
            <div className="d-flex justify-content-between align-items-center mb-3">
                <h3>Welcome, {user.username}!</h3>
                <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>
            </div>

            {/* Player's Info */}
            <div className="card mb-4">
                <div className="card-body">
                    <h4 className="card-title">Your Status</h4>
                    <p>Balance: ${self.balance.toFixed(2)}</p>
                    <h5>Your Commodities:</h5>
                    <div className="row">
                        {gameState.commodities.map(c => (
                            <div key={c.id} className="col-md-3 mb-3">
                                <div className="card">
                                    <img src={c.imageUrl} className="card-img-top" alt={c.name} />
                                    <div className="card-body">
                                        <h5 className="card-title">{c.name}</h5>
                                        <p className="card-text">Quantity: {self.inventory[c.id] || 0}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Active Trades */}
            {activeTrades.length > 0 && (
                <div className="card mb-4">
                    <div className="card-body">
                        <h4 className="card-title">Active Trades</h4>
                        {activeTrades.map(renderTradeCard)}
                    </div>
                </div>
            )}

            {/* Other Players */}
            <div className="card mb-4">
                <div className="card-body">
                    <h4 className="card-title">Other Players</h4>
                    {otherPlayers.map(p => (
                        <div key={p.id} className="mb-3">
                            <h5>{p.username}</h5>
                            <div className="row">
                                {gameState.commodities.map(c => (
                                    <div key={c.id} className="col-md-3 mb-3">
                                        <div className={`card ${p.inventory[c.id] > 0 ? 'border-success' : ''}`}>
                                            <img src={c.imageUrl} className="card-img-top" alt={c.name} />
                                            <div className="card-body">
                                                <h5 className="card-title">{c.name}</h5>
                                                <p className="card-text">{p.inventory[c.id] > 0 ? 'Owned' : 'Not Owned'}</p>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Propose Trade Form */}
            <div className="card mb-4">
                <div className="card-body">
                    <h4 className="card-title">Propose a Trade</h4>
                    <form onSubmit={handleProposeTrade}>
                        <div className="row">
                            <div className="col-md-3">
                                <select name="toUserId" className="form-control" required>
                                    <option value="">Select Player...</option>
                                    {otherPlayers.map(p => <option key={p.id} value={p.id}>{p.username}</option>)}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <select name="action" className="form-control">
                                    <option value="buy">Buy</option>
                                    <option value="sell">Sell</option>
                                </select>
                            </div>
                            <div className="col-md-3">
                                <select name="commodityId" className="form-control" required>
                                     <option value="">Select Commodity...</option>
                                    {gameState.commodities.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>
                            <div className="col-md-2">
                                <input type="number" name="quantity" placeholder="Quantity" className="form-control" min="1" required />
                            </div>
                            <div className="col-md-2">
                                <input type="number" name="price" placeholder="Price" className="form-control" step="0.01" min="0" required />
                            </div>
                        </div>
                        <button type="submit" className="btn btn-primary mt-2">Propose</button>
                    </form>
                </div>
            </div>
        </div>
    );
};

export default GamePage;
