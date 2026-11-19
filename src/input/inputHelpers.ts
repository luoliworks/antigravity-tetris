import { DIR_VECTORS } from '../core';
import type { CardinalDir, Direction8 } from '../core';

const SECTOR_DIRS: readonly Direction8[] = ['E', 'SE', 'S', 'SW', 'W', 'NW', 'N', 'NE'];

export function angleToDirection8(
  dx: number,
  dy: number,
  deadzonePx = 26,
): Direction8 | null {
  if (Math.hypot(dx, dy) < deadzonePx) {
    return null;
  }
  const angle = Math.atan2(dy, dx);
  const sector = Math.round(angle / (Math.PI / 4));
  const idx = ((sector % 8) + 8) % 8;
  return SECTOR_DIRS[idx];
}

export function heldCardinalsToDirection8(
  held: ReadonlySet<CardinalDir>,
): Direction8 | null {
  const dr = (held.has('S') ? 1 : 0) - (held.has('N') ? 1 : 0);
  const dc = (held.has('E') ? 1 : 0) - (held.has('W') ? 1 : 0);

  if (dr === 0 && dc === 0) {
    return null;
  }

  for (const dir of SECTOR_DIRS) {
    const vec = DIR_VECTORS[dir];
    if (vec.dr === dr && vec.dc === dc) {
      return dir;
    }
  }
  return null;
}

const NUMPAD_DIR_MAP: Record<string, Direction8> = {
  Numpad8: 'N',
  Numpad9: 'NE',
  Numpad6: 'E',
  Numpad3: 'SE',
  Numpad2: 'S',
  Numpad1: 'SW',
  Numpad4: 'W',
  Numpad7: 'NW',
};

export function numpadCodeToDirection8(code: string): Direction8 | null {
  return NUMPAD_DIR_MAP[code] ?? null;
}

export function isCardinalDirection(dir: Direction8): dir is CardinalDir {
  return dir === 'N' || dir === 'E' || dir === 'S' || dir === 'W';
}

export function isSoftDropDirection(
  flightDir: Direction8,
  inputDir: Direction8,
): boolean {
  return flightDir === inputDir;
}

export function dir8ToFlightNudge(
  flightDir: Direction8,
  inputDir: Direction8,
): CardinalDir | null {
  if (isSoftDropDirection(flightDir, inputDir)) {
    return null;
  }

  const fVec = DIR_VECTORS[flightDir];
  const fIsCardinal = fVec.dr === 0 || fVec.dc === 0;

  if (isCardinalDirection(inputDir)) {
    if (!fIsCardinal) {
      return inputDir;
    }
    const iVec = DIR_VECTORS[inputDir];
    if (fVec.dr !== 0 && iVec.dc !== 0) {
      return inputDir;
    }
    if (fVec.dc !== 0 && iVec.dr !== 0) {
      return inputDir;
    }
    return null;
  }

  // Diagonal input (e.g. Numpad 7/9/1/3) during cardinal flight maps to its perpendicular component
  if (fIsCardinal) {
    const iVec = DIR_VECTORS[inputDir];
    if (fVec.dr !== 0 && iVec.dr === fVec.dr && iVec.dc !== 0) {
      return iVec.dc < 0 ? 'W' : 'E';
    }
    if (fVec.dc !== 0 && iVec.dc === fVec.dc && iVec.dr !== 0) {
      return iVec.dr < 0 ? 'N' : 'S';
    }
  }

  return null;
}
