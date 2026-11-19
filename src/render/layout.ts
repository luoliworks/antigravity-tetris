import { BOARD_SIZE } from '../core';

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export const CELL_SIZE = 58;
export const BOARD_PIXEL_SIZE = BOARD_SIZE * CELL_SIZE; // 928

export const BOARD_X = 100;
export const BOARD_Y = Math.round((CANVAS_HEIGHT - BOARD_PIXEL_SIZE) / 2); // 76

export const BOARD_CENTER_X = BOARD_X + BOARD_PIXEL_SIZE / 2; // 564
export const BOARD_CENTER_Y = BOARD_Y + BOARD_PIXEL_SIZE / 2; // 540

export const HUD_PANEL = {
  x: 1104,
  y: BOARD_Y, // 76
  w: 732,
  h: 504,
} as const;

export const MASCOT_PANEL = {
  x: HUD_PANEL.x,
  y: 612,
  w: HUD_PANEL.w,
  h: BOARD_Y + BOARD_PIXEL_SIZE - 612, // 392
} as const;

export function cellToPixel(r: number, c: number): { x: number; y: number } {
  return {
    x: BOARD_X + c * CELL_SIZE,
    y: BOARD_Y + r * CELL_SIZE,
  };
}

export function cellCenterToPixel(r: number, c: number): { x: number; y: number } {
  return {
    x: BOARD_X + c * CELL_SIZE + CELL_SIZE / 2,
    y: BOARD_Y + r * CELL_SIZE + CELL_SIZE / 2,
  };
}

export function isPointInBoard(x: number, y: number): boolean {
  return (
    x >= BOARD_X &&
    x <= BOARD_X + BOARD_PIXEL_SIZE &&
    y >= BOARD_Y &&
    y <= BOARD_Y + BOARD_PIXEL_SIZE
  );
}
