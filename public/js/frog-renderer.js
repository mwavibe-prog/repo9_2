/**
 * Frog Renderer - Draws frog-shaped characters on canvas
 */

class FrogRenderer {
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.particles = [];
    this.scorePopups = [];
    this.offsetX = options.offsetX || 0;
    this.offsetY = options.offsetY || 0;
    this.cellSize = options.cellSize || 60;
    this.headerHeight = options.headerHeight || 70;
  }

  cellPos(col, row) {
    return {
      x: this.offsetX + col * this.cellSize + this.cellSize / 2,
      y: this.offsetY + this.headerHeight + row * this.cellSize + this.cellSize / 2,
    };
  }

  drawBoard(state, playerName, timeLeft) {
    const ctx = this.ctx;
    const cs = this.cellSize;
    const boardW = COLS * cs;
    const boardH = ROWS * cs + this.headerHeight;

    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(this.offsetX, this.offsetY, boardW, boardH);

    // Grid lines
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let c = 0; c <= COLS; c++) {
      ctx.beginPath();
      ctx.moveTo(this.offsetX + c * cs, this.offsetY + this.headerHeight);
      ctx.lineTo(this.offsetX + c * cs, this.offsetY + boardH);
      ctx.stroke();
    }
    for (let r = 0; r <= ROWS; r++) {
      ctx.beginPath();
      ctx.moveTo(this.offsetX, this.offsetY + this.headerHeight + r * cs);
      ctx.lineTo(this.offsetX + boardW, this.offsetY + this.headerHeight + r * cs);
      ctx.stroke();
    }

    // Header
    ctx.fillStyle = '#16213e';
    ctx.fillRect(this.offsetX, this.offsetY, boardW, this.headerHeight);

    const fontSize = Math.max(12, cs * 0.28);
    ctx.font = `bold ${fontSize}px Arial, sans-serif`;
    ctx.fillStyle = '#e0e0e0';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(playerName || 'Player', this.offsetX + 8, this.offsetY + this.headerHeight * 0.3, boardW * 0.55);

    ctx.font = `${fontSize * 0.85}px Arial, sans-serif`;
    ctx.fillStyle = '#FFD700';
    ctx.fillText(`Score: ${state.score}`, this.offsetX + 8, this.offsetY + this.headerHeight * 0.65);

    // Timer in header (right side)
    if (timeLeft !== undefined && timeLeft >= 0) {
      ctx.textAlign = 'right';
      ctx.font = `bold ${fontSize}px Arial, sans-serif`;
      ctx.fillStyle = timeLeft <= 10 ? '#FF5555' : '#6dd3f5';
      ctx.fillText(`${timeLeft}s`, this.offsetX + boardW - 8, this.offsetY + this.headerHeight * 0.5);
    }

    // Frogs
    for (let c = 0; c < COLS; c++) {
      for (let r = 0; r < ROWS; r++) {
        const tier = state.grid[c][r];
        if (tier > 0) {
          const pos = this.cellPos(c, r);
          drawFrogShape(ctx, pos.x, pos.y, tier, cs);
        }
      }
    }

    // Game over / time up overlay
    if (state.gameOver || (timeLeft !== undefined && timeLeft <= 0)) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(this.offsetX, this.offsetY + this.headerHeight, boardW, ROWS * cs);
      ctx.font = `bold ${cs * 0.45}px Arial, sans-serif`;
      ctx.fillStyle = timeLeft <= 0 ? '#FFD700' : '#FF5555';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(timeLeft <= 0 ? "TIME'S UP!" : 'GAME OVER',
        this.offsetX + boardW / 2, this.offsetY + this.headerHeight + ROWS * cs / 2);
    }
  }

  spawnParticles(col, row, tier, count) {
    const pos = this.cellPos(col, row);
    const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 1.5 + Math.random() * 3.5;
      this.particles.push({
        x: pos.x, y: pos.y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1.0,
        decay: 0.015 + Math.random() * 0.02,
        radius: 2 + Math.random() * 5,
        color: tierInfo.color,
      });
    }
  }

  spawnScorePopup(col, row, score, chain) {
    const pos = this.cellPos(col, row);
    this.scorePopups.push({
      x: pos.x, y: pos.y,
      score, chain, life: 1.0, decay: 0.016,
    });
  }

  drawParticles() {
    const ctx = this.ctx;
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.06;
      p.life -= p.decay;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  drawScorePopups() {
    const ctx = this.ctx;
    for (let i = this.scorePopups.length - 1; i >= 0; i--) {
      const p = this.scorePopups[i];
      p.y -= 1.3;
      p.life -= p.decay;
      if (p.life <= 0) { this.scorePopups.splice(i, 1); continue; }
      ctx.globalAlpha = p.life;
      const size = Math.max(13, this.cellSize * 0.32);
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

// ══════════════════════════════════════════════════════════════════════
// Shared frog drawing — used by both TV renderer and phone canvas
// ══════════════════════════════════════════════════════════════════════

function drawFrogShape(ctx, x, y, tier, size) {
  const tierInfo = FROG_TIERS[tier] || FROG_TIERS[1];
  const color = tierInfo.color;
  const dark = darkenColor(color, 0.25);
  const light = lightenColor(color, 0.2);
  const s = size * 0.44;          // half-size reference

  ctx.save();
  ctx.translate(x, y);

  // ── Hind legs (behind body) ──
  ctx.fillStyle = dark;
  // Left hind leg — thigh + foot
  ctx.beginPath();
  ctx.ellipse(-s * 0.72, s * 0.45, s * 0.32, s * 0.22, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // Left foot
  ctx.beginPath();
  ctx.ellipse(-s * 0.95, s * 0.62, s * 0.22, s * 0.10, -0.4, 0, Math.PI * 2);
  ctx.fill();
  // Right hind leg
  ctx.beginPath();
  ctx.ellipse(s * 0.72, s * 0.45, s * 0.32, s * 0.22, 0.3, 0, Math.PI * 2);
  ctx.fill();
  // Right foot
  ctx.beginPath();
  ctx.ellipse(s * 0.95, s * 0.62, s * 0.22, s * 0.10, 0.4, 0, Math.PI * 2);
  ctx.fill();

  // ── Body (oval) ──
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.1, s * 0.65, s * 0.55, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.stroke();

  // ── Belly (lighter oval) ──
  ctx.fillStyle = light;
  ctx.beginPath();
  ctx.ellipse(0, s * 0.2, s * 0.38, s * 0.32, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── Spots on belly ──
  ctx.fillStyle = color;
  const spotR = s * 0.06;
  ctx.beginPath(); ctx.arc(-s * 0.15, s * 0.1, spotR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.12, s * 0.28, spotR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.18, s * 0.05, spotR * 0.8, 0, Math.PI * 2); ctx.fill();

  // ── Number on belly ──
  const numSize = Math.max(10, s * 0.6);
  ctx.font = `bold ${numSize}px Arial, sans-serif`;
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(0,0,0,0.4)';
  ctx.shadowBlur = 2;
  ctx.fillText(tierInfo.number.toString(), 0, s * 0.18);
  ctx.shadowBlur = 0;

  // ── Front arms ──
  ctx.fillStyle = dark;
  // Left arm
  ctx.beginPath();
  ctx.ellipse(-s * 0.55, s * 0.0, s * 0.12, s * 0.22, 0.5, 0, Math.PI * 2);
  ctx.fill();
  // Right arm
  ctx.beginPath();
  ctx.ellipse(s * 0.55, s * 0.0, s * 0.12, s * 0.22, -0.5, 0, Math.PI * 2);
  ctx.fill();

  // ── Head (wider top) ──
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(0, -s * 0.35, s * 0.52, s * 0.3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1, size * 0.02);
  ctx.stroke();

  // ── Eye bumps (bulging circles on top of head) ──
  const eyeSpacing = s * 0.32;
  const eyeBumpY = -s * 0.58;
  const eyeBumpR = s * 0.2;

  // Bump circles (same color as head)
  ctx.fillStyle = color;
  ctx.beginPath(); ctx.arc(-eyeSpacing, eyeBumpY, eyeBumpR, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = dark; ctx.stroke();
  ctx.beginPath(); ctx.arc(eyeSpacing, eyeBumpY, eyeBumpR, 0, Math.PI * 2); ctx.fill();
  ctx.stroke();

  // White of eyes
  const eyeR = eyeBumpR * 0.75;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-eyeSpacing, eyeBumpY, eyeR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(eyeSpacing, eyeBumpY, eyeR, 0, Math.PI * 2); ctx.fill();

  // Pupils
  const pupilR = eyeR * 0.5;
  ctx.fillStyle = '#111';
  ctx.beginPath(); ctx.arc(-eyeSpacing + pupilR * 0.15, eyeBumpY + pupilR * 0.1, pupilR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(eyeSpacing + pupilR * 0.15, eyeBumpY + pupilR * 0.1, pupilR, 0, Math.PI * 2); ctx.fill();

  // Eye shine
  const shineR = pupilR * 0.35;
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath(); ctx.arc(-eyeSpacing - shineR * 0.8, eyeBumpY - shineR * 0.8, shineR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(eyeSpacing - shineR * 0.8, eyeBumpY - shineR * 0.8, shineR, 0, Math.PI * 2); ctx.fill();

  // ── Mouth (wide frog smile) ──
  ctx.beginPath();
  ctx.arc(0, -s * 0.22, s * 0.28, 0.15 * Math.PI, 0.85 * Math.PI);
  ctx.strokeStyle = dark;
  ctx.lineWidth = Math.max(1.5, size * 0.025);
  ctx.stroke();

  // Nostrils
  const nostrilR = s * 0.04;
  ctx.fillStyle = dark;
  ctx.beginPath(); ctx.arc(-s * 0.1, -s * 0.38, nostrilR, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.arc(s * 0.1, -s * 0.38, nostrilR, 0, Math.PI * 2); ctx.fill();

  ctx.restore();
}

// ── Color utilities ──────────────────────────────────────────────────

function darkenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - Math.floor(255 * amount));
  const g = Math.max(0, ((num >> 8) & 0xFF) - Math.floor(255 * amount));
  const b = Math.max(0, (num & 0xFF) - Math.floor(255 * amount));
  return `rgb(${r},${g},${b})`;
}

function lightenColor(hex, amount) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.min(255, (num >> 16) + Math.floor(255 * amount));
  const g = Math.min(255, ((num >> 8) & 0xFF) + Math.floor(255 * amount));
  const b = Math.min(255, (num & 0xFF) + Math.floor(255 * amount));
  return `rgb(${r},${g},${b})`;
}
