


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







    const [leaderboard, setLeaderboard] = useState(null);







    const [settlementPhase, setSettlementPhase] = useState(null);







    const [socket, setSocket] = useState(null);















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















            newSocket.on('settlement-phase-1-complete', () => setSettlementPhase('Phase 1 Complete: Standard Settlement Done'));







            newSocket.on('settlement-phase-2-complete', () => setSettlementPhase('Phase 2 Complete: Top 3 Identified'));







            newSocket.on('settlement-phase-3-complete', () => setSettlementPhase('Phase 3 Complete: Top 3 Rules Applied'));















            newSocket.on('global-settlement-complete', ({ leaderboard }) => {







                setNotification({ success: true, message: 'Global settlement complete! See leaderboard for results.' });







                setLeaderboard(leaderboard);







                setSettlementPhase(null);







                setTimeout(() => {







                    setLeaderboard(null);







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

            // Check if it's the exact moment for settlement
            if (minutes % 5 === 0 && seconds === 0) {
                if (user && socket) {
                    console.log("Settlement time! Emitting start-global-settlement.");
                    socket.emit('start-global-settlement');
                    setSettlementPhase('in-progress');
                }
            }

            // Calculate time remaining for display
            const minutesToNext = 5 - (minutes % 5);
            let secondsToNext = (minutesToNext * 60) - seconds;

            // At the exact boundary (e.g., 10:35:00), the old logic would calculate 300 seconds.
            // We adjust it to show 0 for that one second.
            if (secondsToNext === 300) {
                secondsToNext = 0;
            }

            const displayMinutes = Math.floor(secondsToNext / 60);
            const displaySeconds = secondsToNext % 60;

            setCountdown(`${displayMinutes.toString().padStart(2, '0')}:${displaySeconds.toString().padStart(2, '0')}`);
        };

        calculateAndSetCountdown(); // Initial call
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







    if (!user || !gameState) return <div>Loading...</div>;







    const self = gameState.players[user.id];



    const otherPlayers = Object.values(gameState.players).filter(p => p.id !== user.id);







        const canRedeem = () => {







            if (!self.redemptionRule) return false;







            return self.redemptionRule.RuleItems.every(item => (self.inventory[item.CommodityId] || 0) >= item.quantity);







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



    };







        return (







            <div className="container mt-4">







                {leaderboard && (







                    <div className="modal show" tabIndex="-1" style={{ display: 'block', backgroundColor: 'rgba(0,0,0,0.5)' }}>







                        <div className="modal-dialog modal-dialog-centered">







                            <div className="modal-content">







                                <div className="modal-header bg-primary text-white">







                                    <h5 className="modal-title">🏆 Global Settlement Leaderboard 🏆</h5>







                                    <button type="button" className="btn-close btn-close-white" onClick={() => setLeaderboard(null)}></button>







                                </div>







                                <div className="modal-body">







                                    <p className="text-center">New balances after settlement and Top 3 adjustments!</p>







                                    <ul className="list-group">







                                        {leaderboard.map((player, index) => (







                                            <li key={player.id} className="list-group-item d-flex justify-content-between align-items-center fs-5">







                                                <span>







                                                    <strong className="me-2">{index + 1}.</strong> {player.username}







                                                </span>







                                                <span className="badge bg-success rounded-pill">${player.balance.toFixed(2)}</span>







                                            </li>







                                        ))}







                                    </ul>







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



                <button className="btn btn-secondary" onClick={handleLogout}>Logout</button>



            </div>







            <div className="row">



                <div className="col-md-8">



                    <div className="card mb-4">



                                                <div className="card-body">



                                                                                                        <h4 className="card-title">Your Status</h4>
                                                                                                        {countdown && <p className="fs-5 text-end">Next Global Settlement: <strong className="text-danger">{countdown}</strong></p>}
                                                                                                        {settlementPhase && <p className="fs-5 text-center text-info">Settlement Status: <strong>{settlementPhase}</strong></p>}
                                                                                                        <p className="fs-5">Balance: <strong>${self.balance.toFixed(2)}</strong></p>



                                                                                                        <h5 className="mt-4">Your Commodities:</h5>



                            <div className="row">



                                {gameState.commodities.map(c => (



                                    <div key={c.id} className="col-md-4 mb-3">



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







                                                <h4 className="card-title">Other Players</h4>







                                                {otherPlayers.map(p => (







                                                    <div key={p.id} className="card mb-4">







                                                        <div className="card-header d-flex justify-content-between">







                                                            <h5 className="mb-0">{p.username}</h5>







                                                            <strong>Balance: ${p.balance.toFixed(2)}</strong>







                                                        </div>







                                                        <div className="card-body">







                                                            <div className="row">







                                                                {gameState.commodities.map(c => {







                                                                    const hasCommodity = (p.inventory[c.id] || 0) > 0;







                                                                    return (







                                                                        <div key={c.id} className="col-md-4 mb-3">







                                                                            <div className={`card h-100 ${!hasCommodity ? 'bg-light opacity-50' : ''}`}>







                                                                                <img src={c.imageUrl} className="card-img-top" alt={c.name} style={{ height: '150px', objectFit: 'contain', paddingTop: '10px' }}/>







                                                                                <div className="card-body">







                                                                                    <h5 className="card-title">{c.name}</h5>







                                                                                    <p className={`card-text fw-bold ${hasCommodity ? 'text-success' : 'text-muted'}`}>







                                                                                        {hasCommodity ? 'Owned' : 'Not Owned'}







                                                                                    </p>







                                                                                </div>







                                                                            </div>







                                                                        </div>







                                                                    );







                                                                })}







                                                            </div>







                                                        </div>







                                                    </div>







                                                ))}







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



                    {self.redemptionRule && (



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







                    <div className="card mb-4">



                        <div className="card-body">



                            <h4 className="card-title">Actions</h4>



                            <button className="btn btn-info w-100" disabled={self.balance < 500} onClick={handleRefreshCommodities}>Refresh Commodities ($500)</button>



                        </div>



                    </div>



                </div>



            </div>



        </div>



    );



};







export default GamePage;


