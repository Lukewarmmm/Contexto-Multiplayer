import React, { useState, useRef, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css';

const API = process.env.REACT_APP_API_URL;

function App() {
  // Username setup
  const [nameInput, setNameInput] = useState('');
  const [userName, setUserName]   = useState('');

  // Game/session state
  const [sessionId, setSessionId] = useState(null);
  const [mode, setMode]           = useState(null);            // 'open' or 'alternating'
  const [joinId, setJoinId]       = useState('');
  const [guess, setGuess]         = useState('');
  const [history, setHistory]     = useState([]);
  const [error, setError]         = useState('');
  const [won, setWon]             = useState(false);
  const [winningGuesser, setWinningGuesser] = useState(null);
  const [currentTurn, setCurrentTurn]       = useState(null);

  const socketRef = useRef(null);

  // 1) Establish Socket.IO connection once
  useEffect(() => {
    // Connect to your deployed server
    socketRef.current = io(API);
    return () => socketRef.current.disconnect();
  }, []);

  // 2) Handle join, guesses, turns, and game restarts
  useEffect(() => {
    if (!sessionId || !userName) return;
    setHistory([]);
    setError('');
    setWon(false);
    setWinningGuesser(null);
    setCurrentTurn(null);

    // Join room with userName for alternating logic
    socketRef.current.emit('join', { sessionId, userName });

    const handleNewGuess = ({ guess, rank, guesser, correct }) => {
      setHistory(h => [...h, { guess, rank, guesser }]);
      if (correct) {
        setWon(true);
        setWinningGuesser(guesser);
      }
    };

    const handleTurnChanged = ({ currentPlayer }) => {
      setCurrentTurn(currentPlayer);
    };

    const handleGameRestart = () => {
      setHistory([]);
      setError('');
      setWon(false);
      setWinningGuesser(null);
      setCurrentTurn(null);
    };

    socketRef.current.on('new-guess', handleNewGuess);
    socketRef.current.on('turn-changed', handleTurnChanged);
    socketRef.current.on('game-restarted', handleGameRestart);

    return () => {
      socketRef.current.off('new-guess', handleNewGuess);
      socketRef.current.off('turn-changed', handleTurnChanged);
      socketRef.current.off('game-restarted', handleGameRestart);
    };
  }, [sessionId, userName]);

  // Prompt for username
  const confirmName = () => {
    if (!nameInput.trim()) return;
    setUserName(nameInput.trim());
    setNameInput('');
  };

  // Start a new open or alternating game
  const startGame = async (modeType) => {
    setError('');
    setWon(false);
    setWinningGuesser(null);
    setHistory([]);
    setCurrentTurn(null);
    setMode(modeType);

    const res = await fetch(`${API}/api/start`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ mode: modeType })
    });
    const { sessionId: id } = await res.json();
    setSessionId(id);
  };

  // Join an existing game and fetch its mode
  const joinGame = async () => {
    if (!joinId.trim()) return;
    setError('');

    // fetch mode from server
    const res = await fetch(`${API}/api/mode/${joinId.trim()}`);
    const { mode: joinedMode } = await res.json();
    setMode(joinedMode);
    setSessionId(joinId.trim());
  };

  // Submit a guess (enforce alternating turns if needed)
  const submitGuess = async () => {
    const trimmed = guess.trim().toLowerCase();
    if (!trimmed) return;
    if (history.some(item => item.guess === trimmed && item.guesser === userName)) {
      setError('You already guessed that word.');
      return;
    }

    // alternating turn check
    if (mode === 'alternating' && !won) {
      if (currentTurn !== userName) {
        setError(`It's not your turn.`);
        return;
      }
    }
    setError('');

    const res = await fetch(`${API}/api/guess`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId, guess: trimmed, userName })
    });
    const data = await res.json();
    if (!res.ok) {
      setError(data.error || 'Error submitting guess.');
      return;
    }
    setGuess('');
  };

  // Restart the current game (same session)
  const restartGame = async () => {
    await fetch(`${API}/api/restart`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sessionId })
    });
  };

  // Sort guesses by rank ascending
  const sortedHistory = [...history].sort((a, b) => a.rank - b.rank);

  return (
      <div className="App">
        <header>
          <h1>CONTEXTO</h1>
          {sessionId && userName && (
              <div className="session-info">
                Session: <code>{sessionId}</code> | Player: <strong>{userName}</strong> |
                Mode: <strong>{mode}</strong>
                {mode === 'alternating' && currentTurn && (
                    <> | Turn: <strong>{currentTurn}</strong></>
                )}
                | Guesses: <span className="guess-count">{history.length}</span>
              </div>
          )}
        </header>

        {/* Username prompt */}
        {!userName ? (
            <div className="name-entry">
              <input
                  type="text"
                  value={nameInput}
                  onChange={e => setNameInput(e.target.value)}
                  placeholder="Enter your username"
              />
              <button className="btn" onClick={confirmName} disabled={!nameInput.trim()}>
                Confirm
              </button>
            </div>

        ) : !sessionId ? (
            /* Session creation/join controls */
            <div className="session-controls">
              <button className="btn" onClick={() => startGame('open')}>
                New Open Game
              </button>
              <button className="btn" onClick={() => startGame('alternating')}>
                New Alternating Game
              </button>
              <div className="join-controls">
                <input
                    type="text"
                    value={joinId}
                    onChange={e => setJoinId(e.target.value)}
                    placeholder="Session Code"
                />
                <button className="btn" onClick={joinGame} disabled={!joinId.trim()}>
                  Join Game
                </button>
              </div>
            </div>

        ) : (
            /* Game area */
            <div className="game-area">
              {won && winningGuesser && (
                  <div className="win-banner">
                    🎉 {winningGuesser} guessed the word!
                    <button className="btn restart-btn" onClick={restartGame}>
                      Restart
                    </button>
                  </div>
              )}

              <div className="guess-input">
                <input
                    type="text"
                    value={guess}
                    onChange={e => setGuess(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && guess.trim()) submitGuess();
                    }}
                    placeholder="type a word"
                />
                <button className="btn" onClick={submitGuess} disabled={!guess.trim()}>
                  Guess
                </button>
              </div>
              {error && <div className="error">{error}</div>}
              <ul className="guess-list">
                {sortedHistory.map((item, i) => (
                    <li key={i} className="guess-row">
                      <span className="avatar">{item.guesser.charAt(0).toUpperCase()}</span>
                      <span className="guess-text">{item.guess}</span>
                      <span className="guess-rank">{item.rank}</span>
                    </li>
                ))}
              </ul>
            </div>
        )}
      </div>
  );
}

export default App;