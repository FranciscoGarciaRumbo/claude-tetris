'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - pale blue
  '#ffb74d', // L - orange
  '#f06292', // + (pentominó) - rosa
  '#aed581', // U (pentominó) - lima
  '#7986cb', // Y (pentominó) - índigo
  '#fff59d', // 1x1 (recompensa) - dorado claro
  '#8d6e63', // 3x3 hueca (reto) - marrón
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
  [[0,8,0],[8,8,8],[0,8,0]],                  // + (pentominó)
  [[9,0,9],[9,9,9]],                           // U (pentominó)
  [[0,10],[10,10],[0,10],[0,10]],             // Y (pentominó)
  [[11]],                                      // 1x1 (recompensa tras Tetris)
  [[12,12,12],[12,0,12],[12,12,12]],          // 3x3 hueca (reto)
];

// Pools de aparición: los tetrominós estándar son la mayoría, los pentominós
// raros aparecen ocasionalmente y la pieza reto es todavía más infrecuente.
// La pieza de recompensa nunca sale del sorteo: solo se otorga tras un Tetris.
const STANDARD_TYPES = [1, 2, 3, 4, 5, 6, 7];
const RARE_PENTOMINOES = [8, 9, 10];
const CHALLENGE_TYPE = 12;
const REWARD_TYPE = 11;
const STANDARD_PROBABILITY = 0.85;
const RARE_PENTOMINO_PROBABILITY = 0.12;
// El resto (3%) corresponde a la pieza reto (3x3 hueca).

const LINE_SCORES = [0, 100, 300, 500, 800];

const GRID_LINE_COLORS = { dark: '#22222e', light: '#d8d8e4' };
const HIGHLIGHT_COLORS = { dark: 'rgba(255,255,255,0.12)', light: 'rgba(255,255,255,0.45)' };

const THEME_KEY = 'tetris-theme';
let currentTheme = 'dark';

const themeToggleBtn = document.getElementById('theme-toggle');

function setTheme(theme) {
  currentTheme = theme;
  document.body.classList.toggle('light', theme === 'light');
  if (themeToggleBtn) themeToggleBtn.textContent = theme === 'light' ? '☀️' : '🌙';
  try {
    localStorage.setItem(THEME_KEY, theme);
  } catch (e) {
    // localStorage no disponible (ej. navegación privada); se ignora silenciosamente
  }
  if (typeof board !== 'undefined' && board) {
    draw();
    drawNext();
  }
}

function loadInitialTheme() {
  let saved = null;
  try {
    saved = localStorage.getItem(THEME_KEY);
  } catch (e) {
    saved = null;
  }
  setTheme(saved === 'light' ? 'light' : 'dark');
}

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const bestComboEl = document.getElementById('best-combo');
const maxLinesEl = document.getElementById('max-lines');
const highscoresListEl = document.getElementById('highscores-list');
const overlayHighscoresEl = document.getElementById('overlay-highscores');
const resetScoresBtn = document.getElementById('reset-scores-btn');
const nameEntryEl = document.getElementById('name-entry');
const nameInput = document.getElementById('name-input');
const saveScoreBtn = document.getElementById('save-score-btn');

const HIGHSCORES_KEY = 'tetris-highscores';
const BEST_COMBO_KEY = 'tetris-best-combo';
const MAX_LINES_KEY = 'tetris-max-lines';
const MAX_HIGHSCORES = 5;
const MAX_NAME_LENGTH = 12;

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;
let combo, maxComboThisGame;
let pendingEntryData = null;

function isValidHighscoreEntry(entry) {
  return !!entry && typeof entry === 'object' &&
    typeof entry.name === 'string' &&
    typeof entry.score === 'number' && Number.isFinite(entry.score) &&
    typeof entry.lines === 'number' && Number.isFinite(entry.lines) &&
    typeof entry.level === 'number' && Number.isFinite(entry.level);
}

function loadHighscores() {
  let raw = null;
  try {
    raw = localStorage.getItem(HIGHSCORES_KEY);
  } catch (e) {
    raw = null;
  }
  if (!raw) return [];
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    return [];
  }
  // El esquema puede venir corrupto o de una versión antigua; se descarta lo inválido.
  if (!Array.isArray(parsed)) return [];
  return parsed.filter(isValidHighscoreEntry).slice(0, MAX_HIGHSCORES);
}

function saveHighscores(list) {
  try {
    localStorage.setItem(HIGHSCORES_KEY, JSON.stringify(list));
  } catch (e) {
    // localStorage no disponible; se ignora silenciosamente
  }
}

function loadNumberStat(key) {
  let raw = null;
  try {
    raw = localStorage.getItem(key);
  } catch (e) {
    raw = null;
  }
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

function saveNumberStat(key, value) {
  try {
    localStorage.setItem(key, String(value));
  } catch (e) {
    // localStorage no disponible; se ignora silenciosamente
  }
}

let highscores = loadHighscores();
let bestComboEver = loadNumberStat(BEST_COMBO_KEY);
let maxLinesEver = loadNumberStat(MAX_LINES_KEY);

function isTopScore(s) {
  return highscores.length < MAX_HIGHSCORES || s > highscores[highscores.length - 1].score;
}

function insertHighscore(name, s, l, lvl) {
  const entry = { name: name.slice(0, MAX_NAME_LENGTH), score: s, lines: l, level: lvl };
  highscores.push(entry);
  highscores.sort((a, b) => b.score - a.score);
  highscores = highscores.slice(0, MAX_HIGHSCORES);
  saveHighscores(highscores);
  return entry;
}

function renderHighscoresInto(container, highlightEntry) {
  container.replaceChildren();
  if (highscores.length === 0) {
    const li = document.createElement('li');
    li.textContent = 'Sin records aún';
    container.appendChild(li);
    return;
  }
  highscores.forEach((entry, idx) => {
    const li = document.createElement('li');
    if (entry === highlightEntry) li.classList.add('highscore-new');
    const nameSpan = document.createElement('span');
    nameSpan.className = 'hs-name';
    nameSpan.textContent = `${idx + 1}. ${entry.name}`;
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'hs-score';
    scoreSpan.textContent = entry.score.toLocaleString();
    li.appendChild(nameSpan);
    li.appendChild(scoreSpan);
    container.appendChild(li);
  });
}

function renderAllHighscores(highlightEntry) {
  renderHighscoresInto(highscoresListEl, highlightEntry);
  renderHighscoresInto(overlayHighscoresEl, highlightEntry);
}

function updateStatsHUD() {
  bestComboEl.textContent = bestComboEver;
  maxLinesEl.textContent = maxLinesEver;
}

function handleSaveScore() {
  if (!pendingEntryData) return;
  const rawName = nameInput.value.trim();
  const name = (rawName || 'Jugador').slice(0, MAX_NAME_LENGTH);
  const entry = insertHighscore(name, pendingEntryData.score, pendingEntryData.lines, pendingEntryData.level);
  pendingEntryData = null;
  nameEntryEl.classList.add('hidden');
  renderAllHighscores(entry);
}

function handleResetScores() {
  if (!confirm('¿Seguro que quieres borrar todos los records?')) return;
  highscores = [];
  bestComboEver = 0;
  maxLinesEver = 0;
  try {
    localStorage.removeItem(HIGHSCORES_KEY);
    localStorage.removeItem(BEST_COMBO_KEY);
    localStorage.removeItem(MAX_LINES_KEY);
  } catch (e) {
    // localStorage no disponible; se ignora silenciosamente
  }
  updateStatsHUD();
  renderAllHighscores(null);
}

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function pickPieceType() {
  const roll = Math.random();
  if (roll < STANDARD_PROBABILITY) {
    return STANDARD_TYPES[Math.floor(Math.random() * STANDARD_TYPES.length)];
  }
  if (roll < STANDARD_PROBABILITY + RARE_PENTOMINO_PROBABILITY) {
    return RARE_PENTOMINOES[Math.floor(Math.random() * RARE_PENTOMINOES.length)];
  }
  return CHALLENGE_TYPE;
}

function createPiece(type) {
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function randomPiece() {
  return createPiece(pickPieceType());
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const rotated = rotateCW(current.shape);
  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    if (cleared === 4) {
      // Tetris: la recompensa reemplaza la pieza ya sorteada para "next",
      // así el jugador la recibe inmediatamente, no una pieza después.
      next = createPiece(REWARD_TYPE);
    }
    updateHUD();
  }
  return cleared;
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  if (gameOver) return;
  merge();
  const cleared = clearLines();
  // Combo: bloqueos consecutivos que limpian línea; una pieza sin limpiar lo resetea.
  if (cleared > 0) {
    combo++;
    if (combo > maxComboThisGame) maxComboThisGame = combo;
  } else {
    combo = 0;
  }
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
    return;
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = HIGHLIGHT_COLORS[currentTheme];
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = GRID_LINE_COLORS[currentTheme];
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  overlayTitle.textContent = 'GAME OVER';
  overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;

  if (maxComboThisGame > bestComboEver) {
    bestComboEver = maxComboThisGame;
    saveNumberStat(BEST_COMBO_KEY, bestComboEver);
  }
  if (lines > maxLinesEver) {
    maxLinesEver = lines;
    saveNumberStat(MAX_LINES_KEY, maxLinesEver);
  }
  updateStatsHUD();

  if (isTopScore(score)) {
    pendingEntryData = { score, lines, level };
    nameEntryEl.classList.remove('hidden');
    nameInput.value = '';
    renderAllHighscores(null);
    nameInput.focus();
  } else {
    pendingEntryData = null;
    nameEntryEl.classList.add('hidden');
    renderAllHighscores(null);
  }
  overlay.classList.remove('hidden');
}

function togglePause() {
  if (gameOver) return;
  paused = !paused;
  if (!paused) {
    lastTime = performance.now();
    animId = requestAnimationFrame(loop);
  } else {
    cancelAnimationFrame(animId);
    overlayTitle.textContent = 'PAUSA';
    overlayScore.textContent = '';
    overlay.classList.remove('hidden');
  }
}

function loop(ts) {
  if (gameOver || paused) return;
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;
  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
    } else {
      lockPiece();
    }
  }
  draw();
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = 1;
  paused = false;
  gameOver = false;
  combo = 0;
  maxComboThisGame = 0;
  pendingEntryData = null;
  dropInterval = 1000;
  dropAccum = 0;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  nameEntryEl.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

document.addEventListener('keydown', e => {
  if (e.code === 'KeyP') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', init);
resetScoresBtn.addEventListener('click', handleResetScores);
saveScoreBtn.addEventListener('click', handleSaveScore);
nameInput.addEventListener('keydown', e => {
  if (e.code === 'Enter') handleSaveScore();
});

if (themeToggleBtn) {
  themeToggleBtn.addEventListener('click', () => {
    setTheme(currentTheme === 'dark' ? 'light' : 'dark');
  });
}

loadInitialTheme();
updateStatsHUD();
renderAllHighscores(null);
init();
