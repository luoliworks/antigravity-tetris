import type Phaser from 'phaser';
import type { PieceKind } from '../core';

export interface PieceVisualStyle {
  fill: number;
  edge: number;
  highlight: number;
  glow: number;
}

export const PIECE_PALETTE: Record<PieceKind, PieceVisualStyle> = {
  I: { fill: 0x06b6d4, edge: 0x67e8f9, highlight: 0xcffafe, glow: 0x22d3ee },
  O: { fill: 0xeab308, edge: 0xfef08a, highlight: 0xfef9c3, glow: 0xfacc15 },
  T: { fill: 0x9333ea, edge: 0xd8b4fe, highlight: 0xf3e8ff, glow: 0xa855f7 },
  J: { fill: 0x2563eb, edge: 0x93c5fd, highlight: 0xdbeafe, glow: 0x3b82f6 },
  L: { fill: 0xea580c, edge: 0xfdba74, highlight: 0xffedd5, glow: 0xf97316 },
  S: { fill: 0x059669, edge: 0x6ee7b7, highlight: 0xd1fae5, glow: 0x10b981 },
  Z: { fill: 0xe11d48, edge: 0xfda4af, highlight: 0xffe4e6, glow: 0xf43f5e },
  L3: { fill: 0x0d9488, edge: 0x5eead4, highlight: 0xccfbf1, glow: 0x14b8a6 },
  D2: { fill: 0x4f46e5, edge: 0xa5b4fc, highlight: 0xe0e7ff, glow: 0x818cf8 },
  M1: { fill: 0x94a3b8, edge: 0xf1f5f9, highlight: 0xffffff, glow: 0xe2e8f0 },
  NOVA_BOMB: { fill: 0xff4d6d, edge: 0xfef08a, highlight: 0xffffff, glow: 0xfb7185 },
  STARDUST_PIERCER: { fill: 0x38bdf8, edge: 0xf0abfc, highlight: 0xffffff, glow: 0xe879f9 },
};

export function drawCrystalCell(
  g: Phaser.GameObjects.Graphics,
  x: number,
  y: number,
  size: number,
  kind: PieceKind,
  alpha = 1,
): void {
  const style = PIECE_PALETTE[kind];
  const pad = Math.max(2, Math.round(size * 0.055));
  const innerX = x + pad;
  const innerY = y + pad;
  const innerSize = size - pad * 2;
  const radius = Math.max(4, Math.round(innerSize * 0.14));

  // Translucent prism body
  g.fillStyle(style.fill, 0.88 * alpha);
  g.fillRoundedRect(innerX, innerY, innerSize, innerSize, radius);

  // Upper-left glass facet highlight
  const bevel = Math.max(3, Math.round(innerSize * 0.24));
  g.fillStyle(style.highlight, 0.38 * alpha);
  g.fillTriangle(
    innerX + 2,
    innerY + 2,
    innerX + innerSize - 2,
    innerY + 2,
    innerX + bevel,
    innerY + bevel,
  );
  g.fillTriangle(
    innerX + 2,
    innerY + 2,
    innerX + bevel,
    innerY + bevel,
    innerX + 2,
    innerY + innerSize - 2,
  );

  // Subtle inner facet frame
  const inset = Math.max(4, Math.round(innerSize * 0.18));
  g.lineStyle(1, style.highlight, 0.28 * alpha);
  g.strokeRoundedRect(
    innerX + inset,
    innerY + inset,
    innerSize - inset * 2,
    innerSize - inset * 2,
    Math.max(2, radius - 3),
  );

  // Crisp luminous outer border
  g.lineStyle(Math.max(1.5, size * 0.03), style.edge, 0.95 * alpha);
  g.strokeRoundedRect(innerX, innerY, innerSize, innerSize, radius);

  // Special core emblems for 1x1 Star Cores
  const cx = innerX + innerSize / 2;
  const cy = innerY + innerSize / 2;
  if (kind === 'NOVA_BOMB') {
    g.fillStyle(style.edge, 0.95 * alpha);
    g.fillCircle(cx, cy, innerSize * 0.2);
    g.lineStyle(Math.max(1.5, size * 0.03), style.highlight, 0.9 * alpha);
    g.strokeCircle(cx, cy, innerSize * 0.32);
  } else if (kind === 'STARDUST_PIERCER') {
    const rOuter = innerSize * 0.34;
    const rInner = innerSize * 0.12;
    g.fillStyle(style.highlight, 0.95 * alpha);
    g.fillPoints(
      [
        { x: cx, y: cy - rOuter },
        { x: cx + rInner, y: cy - rInner },
        { x: cx + rOuter, y: cy },
        { x: cx + rInner, y: cy + rInner },
        { x: cx, y: cy + rOuter },
        { x: cx - rInner, y: cy + rInner },
        { x: cx - rOuter, y: cy },
        { x: cx - rInner, y: cy - rInner },
      ],
      true,
    );
  }
}
