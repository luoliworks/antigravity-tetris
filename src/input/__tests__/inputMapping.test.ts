import { describe, expect, it } from 'vitest';
import type { CardinalDir, Direction8 } from '../../core';
import {
  angleToDirection8,
  dir8ToFlightNudge,
  heldCardinalsToDirection8,
  isSoftDropDirection,
  numpadCodeToDirection8,
} from '../inputHelpers';

describe('inputHelpers', () => {
  it('maps 2D mouse offsets to all 8 compass directions and respects deadzone & wraparound', () => {
    expect(angleToDirection8(0, 0)).toBeNull();
    expect(angleToDirection8(15, 15, 26)).toBeNull(); // hypot ~21.2 < 26
    expect(angleToDirection8(30, 0, 26)).toBe('E');
    expect(angleToDirection8(40, 40)).toBe('SE');
    expect(angleToDirection8(0, 50)).toBe('S');
    expect(angleToDirection8(-40, 40)).toBe('SW');
    expect(angleToDirection8(-50, 0)).toBe('W');
    expect(angleToDirection8(-50, 0.01)).toBe('W');
    expect(angleToDirection8(-50, -0.01)).toBe('W');
    expect(angleToDirection8(-40, -40)).toBe('NW');
    expect(angleToDirection8(0, -50)).toBe('N');
    expect(angleToDirection8(40, -40)).toBe('NE');
  });

  it('resolves WASD/Arrow cardinal sets into 8 directions and cancels opposites', () => {
    const set = (dirs: CardinalDir[]) => new Set<CardinalDir>(dirs);

    expect(heldCardinalsToDirection8(set([]))).toBeNull();
    expect(heldCardinalsToDirection8(set(['N', 'S']))).toBeNull();
    expect(heldCardinalsToDirection8(set(['E', 'W']))).toBeNull();
    expect(heldCardinalsToDirection8(set(['N', 'S', 'E']))).toBe('E');

    expect(heldCardinalsToDirection8(set(['N']))).toBe('N');
    expect(heldCardinalsToDirection8(set(['N', 'E']))).toBe('NE');
    expect(heldCardinalsToDirection8(set(['E']))).toBe('E');
    expect(heldCardinalsToDirection8(set(['S', 'E']))).toBe('SE');
    expect(heldCardinalsToDirection8(set(['S']))).toBe('S');
    expect(heldCardinalsToDirection8(set(['S', 'W']))).toBe('SW');
    expect(heldCardinalsToDirection8(set(['W']))).toBe('W');
    expect(heldCardinalsToDirection8(set(['N', 'W']))).toBe('NW');
  });

  it('maps Numpad 1-9 (excluding 5) to 8 directions', () => {
    const expected: Record<string, Direction8 | null> = {
      Numpad8: 'N',
      Numpad9: 'NE',
      Numpad6: 'E',
      Numpad3: 'SE',
      Numpad2: 'S',
      Numpad1: 'SW',
      Numpad4: 'W',
      Numpad7: 'NW',
      Numpad5: null,
      Numpad0: null,
      KeyW: null,
    };

    for (const [code, dir] of Object.entries(expected)) {
      expect(numpadCodeToDirection8(code)).toBe(dir);
    }
  });

  it('identifies soft drop and valid nudges for cardinal and diagonal flights', () => {
    // Cardinal flight N
    expect(isSoftDropDirection('N', 'N')).toBe(true);
    expect(isSoftDropDirection('N', 'NE')).toBe(false);
    expect(dir8ToFlightNudge('N', 'N')).toBeNull();
    expect(dir8ToFlightNudge('N', 'S')).toBeNull();
    expect(dir8ToFlightNudge('N', 'W')).toBe('W');
    expect(dir8ToFlightNudge('N', 'E')).toBe('E');
    // Forward diagonal numpad nudge during cardinal flight
    expect(dir8ToFlightNudge('N', 'NW')).toBe('W');
    expect(dir8ToFlightNudge('N', 'NE')).toBe('E');
    expect(dir8ToFlightNudge('N', 'SW')).toBeNull();

    // Cardinal flight E
    expect(dir8ToFlightNudge('E', 'N')).toBe('N');
    expect(dir8ToFlightNudge('E', 'S')).toBe('S');
    expect(dir8ToFlightNudge('E', 'W')).toBeNull();
    expect(dir8ToFlightNudge('E', 'NE')).toBe('N');
    expect(dir8ToFlightNudge('E', 'SE')).toBe('S');

    // Diagonal flight NW
    expect(isSoftDropDirection('NW', 'NW')).toBe(true);
    expect(dir8ToFlightNudge('NW', 'NW')).toBeNull();
    expect(dir8ToFlightNudge('NW', 'N')).toBe('N');
    expect(dir8ToFlightNudge('NW', 'E')).toBe('E');
    expect(dir8ToFlightNudge('NW', 'W')).toBe('W');
    expect(dir8ToFlightNudge('NW', 'S')).toBe('S');
  });
});
