(() => {
    'use strict';

    let installPrompt;
    const installButton = document.querySelector('.install-button');
    const game = new Chess();
    const squares = [...document.querySelectorAll('.square')];
    const status = document.querySelector('.turn');
    const resetButton = document.querySelector('.reset');
    const saveButton = document.querySelector('.save-game');
    const modeSelect = document.querySelector('#mode');
    const memberInput = document.querySelector('#member-name');
    const membersList = document.querySelector('#members');
    const whiteColor = document.querySelector('#white-color');
    const blackColor = document.querySelector('#black-color');
    const scoreWhite = document.querySelector('#score-white');
    const scoreBlack = document.querySelector('#score-black');
    const scoreDraw = document.querySelector('#score-draw');
    const files = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
    const symbols = {
        w: { p: '♙', r: '♖', n: '♘', b: '♗', q: '♕', k: '♔' },
        b: { p: '♟', r: '♜', n: '♞', b: '♝', q: '♛', k: '♚' }
    };
    let selected = null;
    let computerTimer = null;
    const STORAGE_KEY = 'chessboard-app-state';
    const SCORE_KEY = 'chessboard-app-score';
    let audioContext = null;
    let scores = { white: 0, black: 0, draw: 0 };

    window.addEventListener('beforeinstallprompt', event => {
        event.preventDefault();
        installPrompt = event;
        installButton.style.display = 'block';
    });

    installButton.addEventListener('click', async () => {
        if (!installPrompt) return;
        installPrompt.prompt();
        await installPrompt.userChoice;
        installPrompt = null;
        installButton.style.display = 'none';
    });

    if ('serviceWorker' in navigator && location.protocol !== 'file:') {
        navigator.serviceWorker.register('sw.js').catch(() => {});
    }

    function saveGame() {
        const state = {
            fen: game.fen(),
            mode: modeSelect.value,
            whiteColor: whiteColor.value,
            blackColor: blackColor.value,
            members: [...membersList.querySelectorAll('li')].map(member => member.textContent),
            savedAt: new Date().toISOString()
        };
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            return true;
        } catch {
            return false;
        }
    }

    function restoreSavedGame() {
        try {
            const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
            if (!saved || !game.load(saved.fen)) return;
            if (saved.mode === 'computer') modeSelect.value = 'computer';
            if (/^#[0-9a-f]{6}$/i.test(saved.whiteColor || '')) whiteColor.value = saved.whiteColor;
            if (/^#[0-9a-f]{6}$/i.test(saved.blackColor || '')) blackColor.value = saved.blackColor;
            document.documentElement.style.setProperty('--white-piece', whiteColor.value);
            document.documentElement.style.setProperty('--black-piece', blackColor.value);
            if (Array.isArray(saved.members)) {
                saved.members.filter(name => typeof name === 'string' && /^[\p{L}\p{N} _-]{1,24}$/u.test(name)).forEach(name => {
                    const member = document.createElement('li');
                    member.textContent = name;
                    membersList.appendChild(member);
                });
            }
        } catch {
            localStorage.removeItem(STORAGE_KEY);
        }
    }

    squares.forEach((square, index) => {
        square.dataset.square = `${files[index % 8]}${8 - Math.floor(index / 8)}`;
        square.addEventListener('click', () => selectSquare(square.dataset.square));
    });

    function updateScoreBoard() {
        scoreWhite.textContent = String(scores.white);
        scoreBlack.textContent = String(scores.black);
        scoreDraw.textContent = String(scores.draw);
    }

    function loadScores() {
        try {
            const savedScore = JSON.parse(localStorage.getItem(SCORE_KEY));
            if (savedScore && typeof savedScore === 'object') {
                scores.white = Number(savedScore.white) || 0;
                scores.black = Number(savedScore.black) || 0;
                scores.draw = Number(savedScore.draw) || 0;
            }
        } catch {
            scores = { white: 0, black: 0, draw: 0 };
        }
        updateScoreBoard();
    }

    function persistScores() {
        try {
            localStorage.setItem(SCORE_KEY, JSON.stringify(scores));
        } catch {
            // ignore storage failures
        }
    }

    function recordGameResult() {
        if (!game.game_over()) return;

        if (game.in_checkmate()) {
            const winner = game.turn() === 'w' ? 'Black' : 'White';
            if (winner === 'White') scores.white += 1;
            else scores.black += 1;
        } else if (game.in_draw()) {
            scores.draw += 1;
        }

        persistScores();
        updateScoreBoard();
    }

    function updateStatus(message) {
        const player = game.turn() === 'w' ? 'White player' : 'Black player';
        status.textContent = message || `${player}'s turn. Select a piece.`;
        status.style.whiteSpace = 'pre-line';
    }

    function playTone(kind = 'move') {
        const AudioContextClass = window.AudioContext || window.webkitAudioContext;
        if (!AudioContextClass) return;
        audioContext ||= new AudioContextClass();
        if (audioContext.state === 'suspended') audioContext.resume();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const settings = {
            move: { frequency: 520, duration: .1 },
            capture: { frequency: 330, duration: .14 },
            check: { frequency: 760, duration: .2 },
            mate: { frequency: 190, duration: .35 }
        }[kind] || { frequency: 520, duration: .1 };
        oscillator.type = 'sine';
        oscillator.frequency.value = settings.frequency;
        gain.gain.setValueAtTime(.0001, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(.12, audioContext.currentTime + .01);
        gain.gain.exponentialRampToValueAtTime(.0001, audioContext.currentTime + settings.duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + settings.duration);
    }

    function renderBoard() {
        squares.forEach(square => {
            const piece = game.get(square.dataset.square);
            const rank = square.querySelector('.rank');
            const file = square.querySelector('.file');
            square.innerHTML = '';
            if (rank) square.appendChild(rank);
            if (file) square.appendChild(file);
            square.classList.remove('piece-white', 'piece-black', 'selected', 'legal');
            if (piece) {
                square.classList.add(piece.color === 'w' ? 'piece-white' : 'piece-black');
                square.appendChild(document.createTextNode(symbols[piece.color][piece.type]));
            }
        });
        if (selected) {
            document.querySelector(`[data-square="${selected}"]`).classList.add('selected');
            game.moves({ square: selected, verbose: true }).forEach(move => {
                document.querySelector(`[data-square="${move.to}"]`).classList.add('legal');
            });
        }
    }

    function selectSquare(square) {
        const piece = game.get(square);
        if (modeSelect.value === 'computer' && game.turn() === 'b') return;
        if (!selected) {
            if (!piece || piece.color !== game.turn()) return;
            selected = square;
            updateStatus('Piece selected. Choose a legal destination.');
            renderBoard();
            return;
        }

        const legalMoves = game.moves({ square: selected, verbose: true });
        const move = legalMoves.find(candidate => candidate.to === square);
        if (!move) {
            if (piece && piece.color === game.turn()) selected = square;
            else updateStatus('Illegal move. Choose a highlighted square.');
            renderBoard();
            return;
        }

        let promotion;
        if (move.flags.includes('p')) {
            promotion = (window.prompt('Promote to: queen, rook, bishop, or knight', 'queen') || 'queen').toLowerCase()[0];
            if (!'qrbn'.includes(promotion)) promotion = 'q';
        }
        game.move({ from: selected, to: square, promotion });
        selected = null;
        saveGame();
        renderBoard();
        if (game.in_checkmate()) playTone('mate');
        else if (game.in_check()) playTone('check');
        else playTone(move.captured ? 'capture' : 'move');
        if (modeSelect.value === 'computer' && game.turn() === 'b') {
            updateStatus('Computer is thinking...');
            computerTimer = window.setTimeout(() => {
                computerTimer = null;
                computerMove();
            }, 300);
        } else showGameStatus();
    }

    function showGameStatus() {
        if (game.in_checkmate()) {
            const winner = game.turn() === 'w' ? 'Black' : 'White';
            recordGameResult();
            updateStatus(`${winner} wins by checkmate.\nScore: White ${scores.white} - ${scores.black} Black | Draws ${scores.draw}`);
        }
        else if (game.in_draw()) {
            recordGameResult();
            updateStatus(`Draw. The game is over.\nScore: White ${scores.white} - ${scores.black} Black | Draws ${scores.draw}`);
        }
        else if (game.in_check()) updateStatus(`${game.turn() === 'w' ? 'White' : 'Black'} is in check.`);
        else updateStatus();
    }

    function computerMove() {
        if (modeSelect.value !== 'computer' || game.turn() !== 'b' || game.game_over()) return;
        const moves = game.moves({ verbose: true });
        if (!moves.length) return;
        const move = moves[Math.floor(Math.random() * moves.length)];
        game.move({ from: move.from, to: move.to, promotion: move.promotion || 'q' });
        saveGame();
        renderBoard();
        if (game.in_checkmate()) playTone('mate');
        else if (game.in_check()) playTone('check');
        else playTone(move.captured ? 'capture' : 'move');
        showGameStatus();
    }

    resetButton.addEventListener('click', () => {
        window.clearTimeout(computerTimer);
        computerTimer = null;
        game.reset();
        selected = null;
        renderBoard();
        saveGame();
        updateStatus();
    });

    saveButton.addEventListener('click', () => {
        updateStatus(saveGame() ? 'Game saved on this device.' : 'Game could not be saved.');
    });

    document.querySelector('.add-member').addEventListener('click', () => {
        const name = memberInput.value.trim();
        if (!/^[\p{L}\p{N} _-]{1,24}$/u.test(name)) {
            memberInput.setCustomValidity('Use 1-24 letters, numbers, spaces, _ or -.');
            memberInput.reportValidity();
            return;
        }
        memberInput.setCustomValidity('');
        const member = document.createElement('li');
        member.textContent = name;
        membersList.appendChild(member);
        memberInput.value = '';
        memberInput.focus();
        saveGame();
    });

    modeSelect.addEventListener('change', () => {
        window.clearTimeout(computerTimer);
        computerTimer = null;
        game.reset();
        selected = null;
        renderBoard();
        saveGame();
        updateStatus(modeSelect.value === 'computer' ? 'Computer player enabled.\nWhite player moves first.' : 'Human vs Human enabled.\nWhite player moves first.');
    });

    [whiteColor, blackColor].forEach(colorInput => colorInput.addEventListener('input', () => {
        const variable = colorInput === whiteColor ? '--white-piece' : '--black-piece';
        document.documentElement.style.setProperty(variable, colorInput.value);
        saveGame();
    }));

    loadScores();
    restoreSavedGame();
    renderBoard();
    updateStatus();
})();
