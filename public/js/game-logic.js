/**
 * Frog Drop Puzzle - Core Game Logic
 *
 * Grid: COLS columns x ROWS rows. Frogs drop to the lowest empty cell.
 * Merge: Two adjacent same-tier frogs in a column merge into next tier.
 * Chain: Merges cascade recursively with 80ms delay between chains.
 */

const COLS = 5;
const ROWS = 8;
const MAX_UNDO = 10;
const MAX_TIER = 8;
const CHAIN_DELAY = 80; // ms between chain merges

// Frog tier definitions: color + label
const FROG_TIERS = [
  null, // index 0 unused
  { color: '#4CAF50', name: 'Green',  number: 1 },
  { color: '#2196F3', name: 'Blue',   number: 2 },
  { color: '#F44336', name: 'Red',    number: 3 },
  { color: '#FF9800', name: 'Orange', number: 4 },
  { color: '#9C27B0', name: 'Purple', number: 5 },
  { color: '#E91E63', name: 'Pink',   number: 6 },
  { color: '#00BCD4', name: 'Cyan',   number: 7 },
  { color: '#FFD700', name: 'Gold',   number: 8 },
];

function createGameState() {
  return {
    grid: createEmptyGrid(),
    score: 0,
    bestScore: 0,
    nextFrog: randomTier(),
    previewFrog: randomTier(),
    undoStack: [],
    discoveredTiers: new Set([1, 2, 3]), // start with tiers 1-3 visible
    gameOver: false,
    mergeEvents: [],   // { col, row, fromTier, toTier, score } for animations
    dropEvents: [],    // { col, row, tier } for drop animations
    chainDepth: 0,
  };
}

function createEmptyGrid() {
  const grid = [];
  for (let c = 0; c < COLS; c++) {
    grid[c] = [];
    for (let r = 0; r < ROWS; r++) {
      grid[c][r] = 0; // 0 = empty
    }
  }
  return grid;
}

function cloneGrid(grid) {
  return grid.map(col => [...col]);
}

function randomTier() {
  // Weighted: mostly tier 1-3, small chance of tier 4
  const roll = Math.random();
  if (roll < 0.45) return 1;
  if (roll < 0.80) return 2;
  if (roll < 0.95) return 3;
  return 4;
}

// Save state for undo (before a drop)
function pushUndo(state) {
  const snapshot = {
    grid: cloneGrid(state.grid),
    score: state.score,
    nextFrog: state.nextFrog,
    previewFrog: state.previewFrog,
    discoveredTiers: new Set(state.discoveredTiers),
  };
  state.undoStack.push(snapshot);
  if (state.undoStack.length > MAX_UNDO) {
    state.undoStack.shift();
  }
}

function undo(state) {
  if (state.undoStack.length === 0 || state.gameOver) return false;
  const snapshot = state.undoStack.pop();
  state.grid = snapshot.grid;
  state.score = snapshot.score;
  state.nextFrog = snapshot.nextFrog;
  state.previewFrog = snapshot.previewFrog;
  state.discoveredTiers = snapshot.discoveredTiers;
  state.mergeEvents = [];
  state.dropEvents = [];
  return true;
}

// Find the lowest empty row in a column (-1 if full)
function findDropRow(grid, col) {
  for (let r = ROWS - 1; r >= 0; r--) {
    if (grid[col][r] === 0) return r;
  }
  return -1;
}

// Drop a frog into a column. Returns false if column is full.
function dropFrog(state, col) {
  if (state.gameOver || col < 0 || col >= COLS) return false;

  const row = findDropRow(state.grid, col);
  if (row < 0) return false; // column full

  // Save undo state before the drop
  pushUndo(state);

  // Clear previous animation events
  state.mergeEvents = [];
  state.dropEvents = [];

  const tier = state.nextFrog;
  state.grid[col][row] = tier;
  state.dropEvents.push({ col, row, tier });

  // Advance next/preview frogs
  state.nextFrog = state.previewFrog;
  state.previewFrog = randomTier();

  // Process merges synchronously (animations handled by renderer with delays)
  state.chainDepth = 0;
  processMerges(state);

  // Check game over
  state.gameOver = checkGameOver(state.grid);

  // Update best score
  if (state.score > state.bestScore) {
    state.bestScore = state.score;
  }

  return true;
}

// Process all merges in all columns (one chain pass)
function processMerges(state) {
  let merged = false;
  for (let c = 0; c < COLS; c++) {
    if (processMergesInColumn(state, c)) {
      merged = true;
    }
  }
  if (merged) {
    // Apply gravity after merges
    applyGravity(state.grid);
    // Chain: process again
    state.chainDepth++;
    processMerges(state);
  }
}

// Check and merge adjacent same-tier frogs in a single column (bottom-up)
function processMergesInColumn(state, col) {
  let merged = false;
  for (let r = ROWS - 1; r > 0; r--) {
    const tier = state.grid[col][r];
    if (tier === 0) continue;
    if (tier >= MAX_TIER) continue;
    if (state.grid[col][r - 1] === tier) {
      // Merge! Bottom frog becomes next tier, top frog removed
      const newTier = tier + 1;
      state.grid[col][r] = newTier;
      state.grid[col][r - 1] = 0;

      // Score: higher tiers worth more
      const points = newTier * 10 * (state.chainDepth + 1);
      state.score += points;

      // Track discovery
      state.discoveredTiers.add(newTier);

      // Record merge event for animation
      state.mergeEvents.push({
        col, row: r,
        fromTier: tier,
        toTier: newTier,
        score: points,
        chain: state.chainDepth,
      });

      merged = true;
      // Only one merge per column per pass (bottom-up priority)
      break;
    }
  }
  return merged;
}

// Drop all frogs down to fill gaps in each column
function applyGravity(grid) {
  for (let c = 0; c < COLS; c++) {
    let writePos = ROWS - 1;
    for (let r = ROWS - 1; r >= 0; r--) {
      if (grid[c][r] !== 0) {
        if (r !== writePos) {
          grid[c][writePos] = grid[c][r];
          grid[c][r] = 0;
        }
        writePos--;
      }
    }
  }
}

function checkGameOver(grid) {
  for (let c = 0; c < COLS; c++) {
    if (grid[c][0] === 0) return false; // top row has space
  }
  return true;
}

// Get a serializable snapshot of state (for network transfer)
function serializeState(state) {
  return {
    grid: state.grid,
    score: state.score,
    bestScore: state.bestScore,
    nextFrog: state.nextFrog,
    previewFrog: state.previewFrog,
    discoveredTiers: Array.from(state.discoveredTiers),
    gameOver: state.gameOver,
    mergeEvents: state.mergeEvents,
    dropEvents: state.dropEvents,
    undoCount: state.undoStack.length,
  };
}

// Restore state from serialized data
function deserializeState(data) {
  return {
    grid: data.grid,
    score: data.score,
    bestScore: data.bestScore,
    nextFrog: data.nextFrog,
    previewFrog: data.previewFrog,
    undoStack: [],
    discoveredTiers: new Set(data.discoveredTiers),
    gameOver: data.gameOver,
    mergeEvents: data.mergeEvents || [],
    dropEvents: data.dropEvents || [],
    chainDepth: 0,
  };
}

// Export for both Node.js and browser
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    COLS, ROWS, MAX_TIER, CHAIN_DELAY, FROG_TIERS,
    createGameState, dropFrog, undo, serializeState, deserializeState,
    randomTier, cloneGrid, findDropRow,
  };
}
