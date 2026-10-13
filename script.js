const BOARD_SIZE = 8;
const STORAGE_KEY = 'blockBlastBestScore';
const SOUND_STORAGE_KEY = 'blockBlastSoundEnabled';

// Фигуры для игры
const SHAPES = [
    [[1]],
    [[1, 1]],
    [[1], [1]],
    [[1, 1, 1]],
    [[1], [1], [1]],
    [[1, 1, 1, 1]],
    [[1], [1], [1], [1]],
    [[1, 1], [1, 1]],
    [[1, 0], [1, 0], [1, 1]],
    [[0, 1], [0, 1], [1, 1]],
    [[1, 1], [1, 0], [1, 0]],
    [[1, 1], [0, 1], [0, 1]],
    [[1, 0, 0], [1, 1, 1]],
    [[0, 0, 1], [1, 1, 1]],
    [[1, 1, 1], [1, 0, 0]],
    [[1, 1, 1], [0, 0, 1]],
    [[1, 1, 1], [0, 1, 0]],
    [[0, 1, 0], [1, 1, 1]],
    [[1, 0], [1, 1], [1, 0]],
    [[0, 1], [1, 1], [0, 1]],
    [[1, 1, 0], [0, 1, 1]],
    [[0, 1, 1], [1, 1, 0]],
    [[1, 0], [1, 1], [0, 1]],
    [[0, 1], [1, 1], [1, 0]],
    [[1, 1, 1], [1, 1, 1], [1, 1, 1]],
    [[1, 0], [0, 0]],
    [[0, 1], [0, 0]],
    [[0, 0], [1, 0]],
    [[0, 0], [0, 1]],
];

const COLORS = [
    'color-0', 'color-1', 'color-2', 'color-3', 
    'color-4', 'color-5', 'color-6'
];

// Состояние игры
let board = [];
let score = 0;
let bestScore = 0;
let currentPieces = [];
let isDragging = false;
let draggedPiece = null;
let draggedPieceIndex = -1;
let dragOffset = { x: 0, y: 0 };
let dragGhost = null;
let cellSize = 0;
let boardRect = null;

// Аудио
let audioCtx = null;
let soundEnabled = true;

// DOM элементы
const boardEl = document.getElementById('board');
const piecesEl = document.getElementById('pieces');
const scoreEl = document.getElementById('score');
const bestEl = document.getElementById('best');
const gameOverEl = document.getElementById('gameOver');
const finalScoreEl = document.getElementById('finalScore');
const finalBestEl = document.getElementById('finalBest');
const restartBtn = document.getElementById('restartBtn');
const soundToggle = document.getElementById('soundToggle');
const soundIcon = document.getElementById('soundIcon');

// ===== АУДИО СИСТЕМА =====

// Инициализация аудио контекста (лениво, по первому взаимодействию)
function initAudio() {
    if (!audioCtx) {
        try {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        } catch (e) {
            console.warn('Web Audio API не поддерживается');
        }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Универсальная функция проигрывания ноты
function playTone(frequency, duration, volume = 0.05, type = 'sine', delay = 0) {
    if (!soundEnabled || !audioCtx) return;
    
    const startTime = audioCtx.currentTime + delay;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, startTime);
    
    // Плавное затухание — не навязчиво
    gain.gain.setValueAtTime(0, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);
    
    osc.connect(gain);
    gain.connect(audioCtx.destination);
    
    osc.start(startTime);
    osc.stop(startTime + duration + 0.05);
}

// Звук размещения фигуры — мягкий "клик"
function playPlaceSound() {
    playTone(440, 0.12, 0.04, 'sine');
    playTone(660, 0.1, 0.025, 'sine', 0.03);
}

// Звук взятия фигуры — лёгкий "подъём"
function playPickupSound() {
    playTone(330, 0.08, 0.02, 'sine');
}

// Звук очистки линий — приятный аккорд
function playLineClearSound(linesCount) {
    const baseFreq = 523.25; // C5
    const notes = [0, 4, 7, 12]; // Мажорный аккорд
    
    notes.forEach((semitones, i) => {
        const freq = baseFreq * Math.pow(2, semitones / 12);
        playTone(freq, 0.35, 0.03, 'sine', i * 0.05);
    });
    
    // Дополнительный бонусный звук за несколько линий
    if (linesCount > 1) {
        playTone(baseFreq * 2, 0.4, 0.025, 'sine', 0.2);
    }
}

// Звук окончания игры — мягкий нисходящий
function playGameOverSound() {
    const notes = [523.25, 466.16, 392, 329.63];
    notes.forEach((freq, i) => {
        playTone(freq, 0.4, 0.04, 'sine', i * 0.15);
    });
}

// Звук невозможного размещения — тихий "отказ"
function playInvalidSound() {
    playTone(180, 0.1, 0.02, 'triangle');
}

// ===== КОНЕЦ АУДИО СИСТЕМЫ =====

// Инициализация
function init() {
    loadBestScore();
    loadSoundSetting();
    createBoard();
    startNewGame();
    setupEventListeners();
}

// Загрузка настроек звука
function loadSoundSetting() {
    const saved = localStorage.getItem(SOUND_STORAGE_KEY);
    soundEnabled = saved === null ? true : saved === 'true';
    updateSoundIcon();
}

// Сохранение настроек звука
function saveSoundSetting() {
    localStorage.setItem(SOUND_STORAGE_KEY, soundEnabled);
}

// Обновление иконки звука
function updateSoundIcon() {
    soundIcon.textContent = soundEnabled ? '🔊' : '🔇';
    soundToggle.classList.toggle('muted', !soundEnabled);
}

// Переключение звука
function toggleSound() {
    soundEnabled = !soundEnabled;
    saveSoundSetting();
    updateSoundIcon();
    
    // Небольшой подтверждающий звук при включении
    if (soundEnabled) {
        initAudio();
        playTone(660, 0.1, 0.03, 'sine');
    }
}

// Загрузка рекорда
function loadBestScore() {
    const saved = localStorage.getItem(STORAGE_KEY);
    bestScore = saved ? parseInt(saved) : 0;
    bestEl.textContent = bestScore;
}

// Сохранение рекорда
function saveBestScore() {
    if (score > bestScore) {
        bestScore = score;
        localStorage.setItem(STORAGE_KEY, bestScore);
        bestEl.textContent = bestScore;
    }
}

// Создание игрового поля
function createBoard() {
    boardEl.innerHTML = '';
    board = [];
    
    for (let row = 0; row < BOARD_SIZE; row++) {
        board[row] = [];
        for (let col = 0; col < BOARD_SIZE; col++) {
            board[row][col] = null;
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.dataset.row = row;
            cell.dataset.col = col;
            boardEl.appendChild(cell);
        }
    }
}

// Новая игра
function startNewGame() {
    score = 0;
    scoreEl.textContent = score;
    createBoard();
    generateNewPieces();
    gameOverEl.classList.remove('active');
}

// Генерация новых фигур
function generateNewPieces() {
    currentPieces = [];
    for (let i = 0; i < 3; i++) {
        currentPieces.push(generateRandomPiece());
    }
    renderPieces();
}

// Генерация случайной фигуры
function generateRandomPiece() {
    const shape = SHAPES[Math.floor(Math.random() * SHAPES.length)];
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    return {
        shape: shape,
        color: color,
        used: false
    };
}

// Отрисовка фигур
function renderPieces() {
    piecesEl.innerHTML = '';
    
    currentPieces.forEach((piece, index) => {
        if (piece.used) {
            const placeholder = document.createElement('div');
            placeholder.className = 'piece';
            placeholder.style.visibility = 'hidden';
            piecesEl.appendChild(placeholder);
            return;
        }
        
        const pieceEl = document.createElement('div');
        pieceEl.className = 'piece';
        pieceEl.dataset.index = index;
        
        const rows = piece.shape.length;
        const cols = piece.shape[0].length;
        pieceEl.style.gridTemplateColumns = `repeat(${cols}, 1fr)`;
        pieceEl.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
        
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const cell = document.createElement('div');
                if (piece.shape[r][c]) {
                    cell.className = `piece-cell ${piece.color}`;
                } else {
                    cell.className = 'piece-cell';
                    cell.style.visibility = 'hidden';
                }
                pieceEl.appendChild(cell);
            }
        }
        
        piecesEl.appendChild(pieceEl);
    });
}

// Настройка обработчиков событий
function setupEventListeners() {
    restartBtn.addEventListener('click', startNewGame);
    soundToggle.addEventListener('click', toggleSound);
    
    piecesEl.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('mousemove', handlePointerMove);
    document.addEventListener('mouseup', handlePointerUp);
    
    piecesEl.addEventListener('touchstart', handlePointerDown, { passive: false });
    document.addEventListener('touchmove', handlePointerMove, { passive: false });
    document.addEventListener('touchend', handlePointerUp);
    
    // Разблокировка аудио при первом взаимодействии
    document.addEventListener('pointerdown', initAudio, { once: true });
}

// Получение координат из события
function getEventCoords(e) {
    if (e.touches && e.touches.length > 0) {
        return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.changedTouches && e.changedTouches.length > 0) {
        return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    }
    return { x: e.clientX, y: e.clientY };
}

// Начало перетаскивания
function handlePointerDown(e) {
    const pieceEl = e.target.closest('.piece');
    if (!pieceEl || pieceEl.classList.contains('used')) return;
    
    const index = parseInt(pieceEl.dataset.index);
    if (isNaN(index) || currentPieces[index].used) return;
    
    e.preventDefault();
    initAudio();
    
    isDragging = true;
    draggedPieceIndex = index;
    draggedPiece = currentPieces[index];
    
    const coords = getEventCoords(e);
    const rect = pieceEl.getBoundingClientRect();
    
    dragOffset.x = coords.x - rect.left;
    dragOffset.y = coords.y - rect.top;
    
    createDragGhost();
    positionDragGhost(coords.x, coords.y);
    
    pieceEl.classList.add('dragging');
    
    playPickupSound();
    
    const firstCell = boardEl.querySelector('.cell');
    if (firstCell) {
        const cellRect = firstCell.getBoundingClientRect();
        cellSize = cellRect.width + 3;
    }
    
    boardRect = boardEl.getBoundingClientRect();
}

// Создание призрака
function createDragGhost() {
    if (dragGhost) {
        dragGhost.remove();
    }
    
    dragGhost = document.createElement('div');
    dragGhost.className = 'drag-ghost';
    
    const rows = draggedPiece.shape.length;
    const cols = draggedPiece.shape[0].length;
    dragGhost.style.gridTemplateColumns = `repeat(${cols}, 40px)`;
    dragGhost.style.gridTemplateRows = `repeat(${rows}, 40px)`;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            const cell = document.createElement('div');
            if (draggedPiece.shape[r][c]) {
                cell.className = `piece-cell ${draggedPiece.color}`;
            } else {
                cell.className = 'piece-cell';
                cell.style.visibility = 'hidden';
            }
            dragGhost.appendChild(cell);
        }
    }
    
    document.body.appendChild(dragGhost);
}

// Позиционирование призрака
function positionDragGhost(x, y) {
    if (!dragGhost) return;
    
    const ghostCellSize = cellSize || 40;
    const rows = draggedPiece.shape.length;
    const cols = draggedPiece.shape[0].length;
    
    dragGhost.style.gridTemplateColumns = `repeat(${cols}, ${ghostCellSize}px)`;
    dragGhost.style.gridTemplateRows = `repeat(${rows}, ${ghostCellSize}px)`;
    
    dragGhost.style.left = (x - dragOffset.x) + 'px';
    dragGhost.style.top = (y - dragOffset.y) + 'px';
}

// Перемещение
function handlePointerMove(e) {
    if (!isDragging) return;
    
    e.preventDefault();
    
    const coords = getEventCoords(e);
    positionDragGhost(coords.x, coords.y);
    
    const cellPos = getCellFromPointer(coords.x, coords.y);
    
    clearHighlights();
    
    if (cellPos) {
        const canPlace = canPlacePiece(draggedPiece, cellPos.row, cellPos.col);
        highlightCells(draggedPiece, cellPos.row, cellPos.col, canPlace);
    }
}

// Получение позиции клетки из координат указателя
function getCellFromPointer(x, y) {
    if (!boardRect) {
        boardRect = boardEl.getBoundingClientRect();
    }
    
    const rows = draggedPiece.shape.length;
    const cols = draggedPiece.shape[0].length;
    
    const offsetX = (cols - 1) * cellSize / 2;
    const offsetY = (rows - 1) * cellSize / 2;
    
    const relX = x - dragOffset.x + offsetX - boardRect.left;
    const relY = y - dragOffset.y + offsetY - boardRect.top;
    
    const col = Math.round(relX / cellSize);
    const row = Math.round(relY / cellSize);
    
    if (row >= -2 && row < BOARD_SIZE + 2 && col >= -2 && col < BOARD_SIZE + 2) {
        return { row, col };
    }
    
    return null;
}

// Очистка подсветки
function clearHighlights() {
    boardEl.querySelectorAll('.cell.highlight, .cell.invalid').forEach(cell => {
        cell.classList.remove('highlight', 'invalid');
    });
}

// Подсветка клеток
function highlightCells(piece, startRow, startCol, isValid) {
    const rows = piece.shape.length;
    const cols = piece.shape[0].length;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece.shape[r][c]) {
                const boardRow = startRow + r;
                const boardCol = startCol + c;
                
                if (boardRow >= 0 && boardRow < BOARD_SIZE && 
                    boardCol >= 0 && boardCol < BOARD_SIZE) {
                    const cell = boardEl.querySelector(
                        `.cell[data-row="${boardRow}"][data-col="${boardCol}"]`
                    );
                    if (cell && !board[boardRow][boardCol]) {
                        cell.classList.add(isValid ? 'highlight' : 'invalid');
                    }
                }
            }
        }
    }
}

// Проверка возможности размещения
function canPlacePiece(piece, startRow, startCol) {
    const rows = piece.shape.length;
    const cols = piece.shape[0].length;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece.shape[r][c]) {
                const boardRow = startRow + r;
                const boardCol = startCol + c;
                
                if (boardRow < 0 || boardRow >= BOARD_SIZE || 
                    boardCol < 0 || boardCol >= BOARD_SIZE) {
                    return false;
                }
                
                if (board[boardRow][boardCol]) {
                    return false;
                }
            }
        }
    }
    
    return true;
}

// Конец перетаскивания
function handlePointerUp(e) {
    if (!isDragging) return;
    
    const coords = getEventCoords(e);
    const cellPos = getCellFromPointer(coords.x, coords.y);
    
    if (dragGhost) {
        dragGhost.remove();
        dragGhost = null;
    }
    
    const pieceEl = piecesEl.querySelector('.piece.dragging');
    if (pieceEl) {
        pieceEl.classList.remove('dragging');
    }
    
    clearHighlights();
    
    if (cellPos && canPlacePiece(draggedPiece, cellPos.row, cellPos.col)) {
        placePiece(draggedPiece, cellPos.row, cellPos.col);
        draggedPiece.used = true;
        
        if (currentPieces.every(p => p.used)) {
            generateNewPieces();
        } else {
            renderPieces();
        }
        
        checkGameOver();
    } else if (cellPos) {
        // Был над полем, но разместить нельзя — тихий звук отказа
        playInvalidSound();
    }
    
    isDragging = false;
    draggedPiece = null;
    draggedPieceIndex = -1;
}

// Размещение фигуры
function placePiece(piece, startRow, startCol) {
    const rows = piece.shape.length;
    const cols = piece.shape[0].length;
    
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            if (piece.shape[r][c]) {
                const boardRow = startRow + r;
                const boardCol = startCol + c;
                board[boardRow][boardCol] = piece.color;
                
                const cell = boardEl.querySelector(
                    `.cell[data-row="${boardRow}"][data-col="${boardCol}"]`
                );
                if (cell) {
                    cell.className = `cell filled ${piece.color} placing`;
                    setTimeout(() => cell.classList.remove('placing'), 200);
                }
            }
        }
    }
    
    playPlaceSound();
    
    addScore(rows * cols);
    
    setTimeout(() => checkLines(), 100);
}

// Добавление очков
function addScore(points) {
    score += points;
    scoreEl.textContent = score;
    saveBestScore();
}

// Проверка заполненных линий
function checkLines() {
    const rowsToClear = [];
    const colsToClear = [];
    
    for (let row = 0; row < BOARD_SIZE; row++) {
        if (board[row].every(cell => cell !== null)) {
            rowsToClear.push(row);
        }
    }
    
    for (let col = 0; col < BOARD_SIZE; col++) {
        let full = true;
        for (let row = 0; row < BOARD_SIZE; row++) {
            if (board[row][col] === null) {
                full = false;
                break;
            }
        }
        if (full) {
            colsToClear.push(col);
        }
    }
    
    if (rowsToClear.length > 0 || colsToClear.length > 0) {
        playLineClearSound(rowsToClear.length + colsToClear.length);
        
        rowsToClear.forEach(row => {
            for (let col = 0; col < BOARD_SIZE; col++) {
                const cell = boardEl.querySelector(
                    `.cell[data-row="${row}"][data-col="${col}"]`
                );
                if (cell) cell.classList.add('clearing');
            }
        });
        
        colsToClear.forEach(col => {
            for (let row = 0; row < BOARD_SIZE; row++) {
                const cell = boardEl.querySelector(
                    `.cell[data-row="${row}"][data-col="${col}"]`
                );
                if (cell) cell.classList.add('clearing');
            }
        });
        
        rowsToClear.forEach(row => {
            for (let col = 0; col < BOARD_SIZE; col++) {
                board[row][col] = null;
            }
        });
        
        colsToClear.forEach(col => {
            for (let row = 0; row < BOARD_SIZE; row++) {
                board[row][col] = null;
            }
        });
        
        const linesCleared = rowsToClear.length + colsToClear.length;
        const points = linesCleared * 10 * linesCleared;
        addScore(points);
        
        setTimeout(() => {
            for (let row = 0; row < BOARD_SIZE; row++) {
                for (let col = 0; col < BOARD_SIZE; col++) {
                    const cell = boardEl.querySelector(
                        `.cell[data-row="${row}"][data-col="${col}"]`
                    );
                    if (cell) {
                        cell.classList.remove('clearing');
                        if (board[row][col]) {
                            cell.className = `cell filled ${board[row][col]}`;
                        } else {
                            cell.className = 'cell';
                        }
                    }
                }
            }
        }, 300);
    }
    
    setTimeout(checkGameOver, 350);
}

// Проверка конца игры
function checkGameOver() {
    for (const piece of currentPieces) {
        if (piece.used) continue;
        
        for (let row = 0; row < BOARD_SIZE; row++) {
            for (let col = 0; col < BOARD_SIZE; col++) {
                if (canPlacePiece(piece, row, col)) {
                    return;
                }
            }
        }
    }
    
    setTimeout(() => {
        finalScoreEl.textContent = score;
        finalBestEl.textContent = bestScore;
        gameOverEl.classList.add('active');
        playGameOverSound();
    }, 400);
}

// Запуск игры
init();