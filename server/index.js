require('dotenv').config();
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const { loadEmbeddings, loadNouns } = require('./embeddings');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// In‐memory game sessions: sessionId → { target, lastSim, mode, players, currentPlayerIndex }
const games = {};

// Generate a unique 6-digit session ID
function generateSessionId() {
    let id;
    do {
        id = Math.floor(100000 + Math.random() * 900000).toString();
    } while (games[id]);
    return id;
}

// Cosine similarity between two equal-length vectors
function cosineSimilarity(a, b) {
    const dot = a.reduce((sum, v, i) => sum + v * b[i], 0);
    const magA = Math.sqrt(a.reduce((sum, v) => sum + v * v, 0));
    const magB = Math.sqrt(b.reduce((sum, v) => sum + v * v, 0));
    return dot / (magA * magB);
}

// ─── MIDDLEWARE ───────────────────────────────────────────────────────────────
app.use(cors());
app.use(express.json());

// ─── HEALTH CHECK ─────────────────────────────────────────────────────────────
app.get('/', (_, res) => {
    res.send('🟢 Contexto clone server is running.');
});

// ─── START A NEW GAME ─────────────────────────────────────────────────────────
app.post('/api/start', (req, res) => {
    const { mode = 'open' } = req.body;               // 'open' or 'alternating'
    const { embeddings, nouns } = app.locals;
    const valid = nouns.filter(w => embeddings[w]);
    const target = valid[Math.floor(Math.random() * valid.length)];
    const sessionId = generateSessionId();

    games[sessionId] = {
        target,
        lastSim: null,
        mode,
        players: [],                // for alternating
        currentPlayerIndex: 0
    };

    res.json({ sessionId, mode });
});

// ─── RESTART A GAME ────────────────────────────────────────────────────────────
app.post('/api/restart', (req, res) => {
    const { sessionId } = req.body;
    const game = games[sessionId];
    if (!game) return res.status(400).json({ error: 'Invalid sessionId' });

    const { embeddings, nouns } = app.locals;
    const valid = nouns.filter(w => embeddings[w]);
    game.target = valid[Math.floor(Math.random() * valid.length)];
    game.lastSim = null;
    game.players = [];
    game.currentPlayerIndex = 0;

    io.to(sessionId).emit('game-restarted');
    res.json({ success: true });
});

// ─── SUBMIT A GUESS ────────────────────────────────────────────────────────────
app.post('/api/guess', (req, res) => {
    let { sessionId, guess, userName: guesser } = req.body;
    guess = guess.toLowerCase();

    const game = games[sessionId];
    if (!game) return res.status(400).json({ error: 'Invalid sessionId' });

    // Alternating-turn enforcement
    if (game.mode === 'alternating') {
        if (game.players.length < 2) {
            return res.status(400).json({ error: 'Waiting for another player' });
        }
        const expected = game.players[game.currentPlayerIndex];
        if (guesser !== expected) {
            return res.status(400).json({ error: `Not ${guesser}’s turn` });
        }
    }

    // Validate word
    const nouns = app.locals.nouns;
    if (!nouns.includes(guess)) {
        return res.status(400).json({ error: 'Word not in list' });
    }

    // Compute rank
    const embeddings = app.locals.embeddings;
    const targetVec = embeddings[game.target];
    const valid = nouns.filter(w => embeddings[w]);
    const sims = valid
        .map(w => ({ word: w, sim: cosineSimilarity(embeddings[w], targetVec) }))
        .sort((a, b) => b.sim - a.sim);
    const rank = sims.findIndex(item => item.word === guess) + 1;

    const correct = guess === game.target;

    // Broadcast guess
    io.to(sessionId).emit('new-guess', { guess, rank, correct, guesser });

    // Advance turn if alternating and not correct
    if (game.mode === 'alternating' && !correct) {
        game.currentPlayerIndex = (game.currentPlayerIndex + 1) % game.players.length;
        const nextPlayer = game.players[game.currentPlayerIndex];
        io.to(sessionId).emit('turn-changed', { currentPlayer: nextPlayer });
    }

    return res.json({ rank, correct });
});

// ─── GET GAME MODE ─────────────────────────────────────────────────────────────
app.get('/api/mode/:sessionId', (req, res) => {
    const game = games[req.params.sessionId];
    if (!game) return res.status(400).json({ error: 'Invalid sessionId' });
    res.json({ mode: game.mode });
});

// ─── SOCKET.IO LOGIC ───────────────────────────────────────────────────────────
io.on('connection', socket => {
    socket.on('join', ({ sessionId, userName }) => {
        const game = games[sessionId];
        if (!game) return;
        socket.join(sessionId);

        // Register players for alternating games
        if (game.mode === 'alternating') {
            if (!game.players.includes(userName) && game.players.length < 2) {
                game.players.push(userName);
                // Once two have joined, announce the first turn
                if (game.players.length === 2) {
                    io.to(sessionId).emit('turn-changed', { currentPlayer: game.players[0] });
                }
            }
        }
    });

    socket.on('disconnect', () => {
        // no-op
    });
});

// ─── DEBUG: REVEAL TARGET ──────────────────────────────────────────────────────
app.get('/api/target/:sessionId', (req, res) => {
    const game = games[req.params.sessionId];
    if (!game) return res.status(400).json({ error: 'Invalid sessionId' });
    res.json({ target: game.target });
});

// ─── STARTUP ──────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
(async () => {
    const embeddings = await loadEmbeddings('glove.6B.50d.txt');
    const nouns = loadNouns('nouns.txt');
    app.locals.embeddings = embeddings;
    app.locals.nouns = nouns;
    server.listen(PORT, () => {
        console.log(`🚀 Server listening on http://localhost:${PORT}`);
    });
})();