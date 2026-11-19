import Phaser from 'phaser';
import { BOARD_SIZE, getRingIndex, isInCenter, RING_CELL_COUNTS } from '../core';

export class Stage1PreviewScene extends Phaser.Scene {
  constructor() {
    super({ key: 'Stage1PreviewScene' });
  }

  create(): void {
    const width = this.scale.width;
    const height = this.scale.height;

    const bg = this.add.graphics();
    bg.fillGradientStyle(0x070914, 0x070914, 0x0e1430, 0x0a0f24, 1);
    bg.fillRect(0, 0, width, height);

    // Subtle starfield backdrop (140 stars)
    const stars = this.add.graphics();
    for (let i = 0; i < 140; i++) {
      const sx = (i * 197 + 43) % width;
      const sy = (i * 313 + 71) % height;
      const alpha = 0.2 + ((i * 37) % 60) / 100;
      const radius = i % 7 === 0 ? 2.4 : 1.3;
      stars.fillStyle(i % 5 === 0 ? 0x9dd2ff : 0xffffff, alpha);
      stars.fillCircle(sx, sy, radius);
    }

    // Left-heavy layout: 12x12 square board (912x912, near full 1080p height)
    const cellSize = 76;
    const boardPixelSize = BOARD_SIZE * cellSize;
    const boardX = 108;
    const boardY = Math.round((height - boardPixelSize) / 2);

    // Outer board glow frame
    const boardFrame = this.add.graphics();
    boardFrame.lineStyle(4, 0x4cc9f0, 0.45);
    boardFrame.strokeRoundedRect(
      boardX - 12,
      boardY - 12,
      boardPixelSize + 24,
      boardPixelSize + 24,
      18,
    );
    boardFrame.lineStyle(1.5, 0xa5f3fc, 0.85);
    boardFrame.strokeRoundedRect(
      boardX - 4,
      boardY - 4,
      boardPixelSize + 8,
      boardPixelSize + 8,
      12,
    );

    const ringColors: Record<1 | 2 | 3 | 4, number> = {
      1: 0x3b82f6,
      2: 0x6366f1,
      3: 0x8b5cf6,
      4: 0xec4899,
    };

    const grid = this.add.graphics();
    for (let r = 0; r < BOARD_SIZE; r++) {
      for (let c = 0; c < BOARD_SIZE; c++) {
        const x = boardX + c * cellSize;
        const y = boardY + r * cellSize;
        const ring = getRingIndex(r, c);
        const center = isInCenter(r, c);

        if (center) {
          grid.fillStyle(0x22d3ee, 0.16);
          grid.fillRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
          grid.lineStyle(1.5, 0x67e8f9, 0.55);
          grid.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
        } else if (ring !== null) {
          grid.fillStyle(ringColors[ring], 0.14);
          grid.fillRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
          grid.lineStyle(1.5, ringColors[ring], 0.38);
          grid.strokeRect(x + 3, y + 3, cellSize - 6, cellSize - 6);
        }
      }
    }

    // Highlight central 4x4 core boundary
    const centerOffset = 4 * cellSize;
    const centerSize = 4 * cellSize;
    grid.lineStyle(3, 0x67e8f9, 0.9);
    grid.strokeRoundedRect(
      boardX + centerOffset,
      boardY + centerOffset,
      centerSize,
      centerSize,
      10,
    );

    // 8-way star reticle indicator inside center
    const cx = boardX + boardPixelSize / 2;
    const cy = boardY + boardPixelSize / 2;
    const reticle = this.add.graphics();
    reticle.lineStyle(2, 0x9dd2ff, 0.55);
    const dirs = [
      [0, -1],
      [1, -1],
      [1, 0],
      [1, 1],
      [0, 1],
      [-1, 1],
      [-1, 0],
      [-1, -1],
    ];
    for (const [dx, dy] of dirs) {
      const inner = 28;
      const len = dx !== 0 && dy !== 0 ? 74 : 96;
      reticle.lineBetween(cx + dx * inner, cy + dy * inner, cx + dx * len, cy + dy * len);
    }
    reticle.strokeCircle(cx, cy, 18);

    // Right-top glass HUD preview panel
    const panelX = boardX + boardPixelSize + 84;
    const panelY = boardY;
    const panelW = width - panelX - 84;
    const panelH = 440;

    const panel = this.add.graphics();
    panel.fillStyle(0x111936, 0.72);
    panel.fillRoundedRect(panelX, panelY, panelW, panelH, 20);
    panel.lineStyle(1.5, 0x67e8f9, 0.45);
    panel.strokeRoundedRect(panelX, panelY, panelW, panelH, 20);

    this.add.text(panelX + 38, panelY + 38, 'ANTIGRAVITY TETRIS', {
      fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
      fontSize: '42px',
      fontStyle: 'bold',
      color: '#e0f2fe',
    });

    this.add.text(panelX + 38, panelY + 98, 'STAGE 1 CORE READY · 1920x1080 (16:9)', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '26px',
      color: '#67e8f9',
    });

    this.add.text(
      panelX + 38,
      panelY + 162,
      `12x12 Concentric Grid  |  Center 4x4 Core\n` +
        `R1: ${RING_CELL_COUNTS[1]}  |  R2: ${RING_CELL_COUNTS[2]}  |  R3: ${RING_CELL_COUNTS[3]}  |  R4: ${RING_CELL_COUNTS[4]}`,
      {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '22px',
        lineSpacing: 14,
        color: '#cbd5e1',
      },
    );

    // Ring legend swatches
    const legendItems: { ring: 1 | 2 | 3 | 4; label: string }[] = [
      { ring: 1, label: `Ring 1 (${RING_CELL_COUNTS[1]} cells)` },
      { ring: 2, label: `Ring 2 (${RING_CELL_COUNTS[2]} cells)` },
      { ring: 3, label: `Ring 3 (${RING_CELL_COUNTS[3]} cells)` },
      { ring: 4, label: `Ring 4 (${RING_CELL_COUNTS[4]} cells)` },
    ];
    legendItems.forEach((item, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const lx = panelX + 38 + col * 330;
      const ly = panelY + 288 + row * 52;
      panel.fillStyle(ringColors[item.ring], 0.85);
      panel.fillRoundedRect(lx, ly, 24, 24, 6);
      this.add.text(lx + 36, ly - 1, item.label, {
        fontFamily: 'ui-monospace, Consolas, monospace',
        fontSize: '22px',
        color: '#e2e8f0',
      });
    });

    // Right-bottom placeholder glass panel for Gemini AI-chan
    const mascotY = panelY + panelH + 36;
    const mascotH = boardY + boardPixelSize - mascotY;

    const mascotPanel = this.add.graphics();
    mascotPanel.fillStyle(0x111936, 0.56);
    mascotPanel.fillRoundedRect(panelX, mascotY, panelW, mascotH, 20);
    mascotPanel.lineStyle(1.5, 0x8b5cf6, 0.45);
    mascotPanel.strokeRoundedRect(panelX, mascotY, panelW, mascotH, 20);

    this.add.text(panelX + panelW / 2, mascotY + mascotH / 2 - 22, 'GEMINI AI-CHAN PANEL (STAGE 5)', {
      fontFamily: 'ui-monospace, Consolas, monospace',
      fontSize: '24px',
      color: '#c4b5fd',
    }).setOrigin(0.5);

    this.add.text(
      panelX + panelW / 2,
      mascotY + mascotH / 2 + 22,
      '6 Expressions · EN / 中文 Commentary · Interactive Play Begins in Stage 2',
      {
        fontFamily: 'system-ui, -apple-system, Segoe UI, sans-serif',
        fontSize: '18px',
        color: '#94a3b8',
      },
    ).setOrigin(0.5);
  }
}
