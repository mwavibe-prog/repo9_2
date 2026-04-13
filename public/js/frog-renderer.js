/**
 * Frog Renderer - Draws cute frogs on a canvas with particle effects
 */

class FrogRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.scorePopups = [];
    this.scale = options.scale || 1;
    this.offsetX = options.offsetX || 0;
    this.offsetY = options.offsetY || 0;
    this.cellSize = options.cellSize || 60;
    this.headerHeight = options.headerHeight || 70;
    this.animating = false;
  }

  resize(cellSize, offsetX, offsetY) {
    this.cellSize = cellSize;
    this.offsetX = offsetX;
    this.offsetY = offsetY;
  }

  // Get pixel position for a grid cell
  cellPos(col, row) {
    return {
      x: this.offsetX + col * this.cellSize + this.cellSize / 2,
      y: this.offsetY + this.headerHeight + row * this.cellSize + this.cellSize / 2,
    };
  }

  // Draw the complete board for a game state
  drawBoard(state, playerName) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const boardW = COLS * cs;
    const boardH = ROWS * cs + this.headerHeight;

    // Background
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(this.offsetX, this.offsetY, boardW, boardH);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      const x = this.offsetX + c * cs;
      ctx.beginPath();
      ctx.moveTo(x, this.offsetY + this.headerHeight);
      ctx.lineTo(x, this.offsetY + boardH);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      const y = this.offsetY + this.headerHeight + r * cs;
      ctx.beginPath();
      ctx.moveTo(this.offsetX, y);
      ctx.lineTo(this.offsetX + boardW, y);
      ctx.stroke();
    }

    // Header: player name + score
    ctx.fillStyle = '#16213e';
    ctx.fillRect(this.offsetX, this.offsetY, boardW, this.headerHeight);

    const fontSize = Math.max(12, cs * 0.28);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const nameStr = playerName || 'Player';
    ctx.fillText(nameStr, this.offsetX + 8, this.offsetY + this.headerHeight * 0.33, boardW - 16);

    ctx.font = `${fontSize * 0.85}px Arial, sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Score: ${state.score}`, this.offsetX + 8, this.offsetY + this.headerHeight * 0.7);

    // Draw frogs
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tier = state.grid[c][r];
        if (tier > 0) {
          this.drawFrog(c, r, tier);
        }
      }
    }

    // Game over overlay
    if (state.gameOver) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(this.offsetX, this.offsetY + this.headerHeight, boardW, ROWS * cs);
      ctx.font = `bold ${cs * 0.5}px Arial, sans-serif`;
      ctx.fillStyle = '#FF5555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('GAME OVER', this.offsetX + boardW / 2, this.offsetY + this.headerHeight + ROWS * cs / 2);
    }
  }

  // Draw a single frog
  drawFrog(col, row, tier) {
    const ctx = this.ctx;
    const pos = this.cellPos(col, row);
    const radius = this.cellSize * 0.38;
    const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];

    // Body (circle)
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
    ctx.fillStyle = tierInfo.color;
    ctx.fill();

    // Darker border
    ctx.strokeStyle = darkenColor(tierInfo.color, 0.3);
    ctx.lineWidth = Math.max(1.5, this.cellSize * 0.03);
    ctx.stroke();

    // Eyes
    const eyeOffsetX = radius * 0.35;
    const eyeOffsetY = -radius * 0.25;
    const eyeR = radius * 0.18;

    // White of eyes
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(pos.x - eyeOffsetX, pos.y + eyeOffsetY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pos.x + eyeOffsetX, pos.y + eyeOffsetY, eyeR, 0, Math.PI * 2);
    ctx.fill();

    // Pupils
    ctx.fillStyle = '#111';
    const pupilR = eyeR * 0.55;
    ctx.beginPath();
    ctx.arc(pos.x - eyeOffsetX, pos.y + eyeOffsetY, pupilR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(pos.x + eyeOffsetX, pos.y + eyeOffsetY, pupilR, 0, Math.PI * 2);
    ctx.fill();

    // Number on tummy
    const numSize = Math.max(10, radius * 0.75);
    ctx.font = `bold ${numSize}px Arial, sans-serif`;
    ctx.fillStyle = '#FFFFFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tierInfo.number.toString(), pos.x, pos.y + radius * 0.25);

    // Smile
    ctx.beginPath();
    ctx.arc(pos.x, pos.y + radius * 0.05, radius * 0.25, 0.1 * Math.PI, 0.9 * Math.PI);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = Math.max(1, this.cellSize * 0.025);
    ctx.stroke();
  }

  // Draw a single large frog for phone preview
  drawPreviewFrog(x, y, tier, size) {
    const ctx = this.ctx;
    const radius = size * 0.38;
    const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];

    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.fillStyle = tierInfo.color;
    ctx.fill();
    ctx.strokeStyle = darkenColor(tierInfo.color, 0.3);
    ctx.lineWidth = 2;
    ctx.stroke();

    // Eyes
    const eyeOffsetX = radius * 0.35;
    const eyeOffsetY = -radius * 0.25;
    const eyeR = radius * 0.18;
    ctx.fillStyle = '#FFF';
    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y + eyeOffsetY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y + eyeOffsetY, eyeR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#111';
    const pupilR = eyeR * 0.55;
    ctx.beginPath();
    ctx.arc(x - eyeOffsetX, y + eyeOffsetY, pupilR, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(x + eyeOffsetX, y + eyeOffsetY, pupilR, 0, Math.PI * 2);
    ctx.fill();

    // Number
    const numSize = Math.max(12, radius * 0.75);
    ctx.font = `bold ${numSize}px Arial, sans-serif`;
    ctx.fillStyle = '#FFF';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tierInfo.number.toString(), x, y + radius * 0.25);
  }

  // Spawn particles at a cell position
  spawnParticles(col, row, tier, count) {
    const pos = this.cellPos(col, row);
    const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1 + Math.random() * 3;
      this.particles.push({
        x: pos.x,
        y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        radius: 2 + Math.random() * 4,
        color: tierInfo.color,
      });
    }
  }

  // Spawn a floating score popup
  spawnScorePopup(col, row, score, chain) {
    const pos = this.cellPos(col, row);
    this.scorePopups.push({
      x: pos.x,
      y: pos.y,
      score: score,
      chain: chain,
      life: 1.0,
      decay: 0.018,
    });
  }

  // Update and draw all particles
  drawParticles() {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.05; // gravity
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  // Update and draw score popups
  drawScorePopups() {
    const ctx = this.ctx;
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      const p = this.scorePopups[i];
      p.y -= 1.2;
      p.life -= p.decay;
      if (p.life <= 0) {
        this.scorePopups.splice(i, 1);
        continue;
      }
      ctx.globalAlpha = p.life;
      const size = Math.max(12, this.cellSize * 0.3);
      ctx.font = `bold ${size}px Arial, sans-serif`;
      ctx.fillStyle = p.chain > 0 ? '#FFD700' : '#FFFFFF';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const text = p.chain > 0 ? `+${p.score} x${p.chain + 1}` : `+${p.score}`;
      ctx.fillText(text, p.x, p.y);
    }
    ctx.globalAlpha = 1;
  }

  hasActiveAnimations() {
    return this.particles.length > 0 || this.scorePopups.length > 0;
  }
}

// Utility: darken a hex color
function darkenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.floor(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xFF) - Math.floor(255 * amount));
  const b = Math.max(0, (num & 0xFF) - Math.floor(255 * amount));
  return `rgb(${r},${g},${b})`;
}
