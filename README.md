# Antigravity Tetris

**English** | [简体中文](README.zh.md)

> **Native 1920 × 1080 · 16×16 Center 8-Way Launch × Hybrid Line & Concentric Ring Clears · Real-Time Snarky Gemini AI-chan Companion**

An arcade puzzle web game built with **Phaser 3 + Vite + TypeScript + Vitest**: launch crystal tetrominoes outward in **8 directions** from the central `4 × 4` core, clear the outer field via 4-way full-row/column clears and 6-tier concentric ring 8-way outward resonance, and climb the difficulty-split leaderboards alongside the smug, sharp-tongued **Gemini AI-chan** and procedural Synthwave/Lo-Fi pentatonic audio.

---

## Key Features

- **16 × 16 Center 8-Way Launch & 3-Way Wall-Slide**
  - Pieces spawn in the central `4 × 4` core. While hovering, freely aim in 8 directions (`↑ ↓ ← → ↖ ↗ ↙ ↘`) and apply SRS rotation, with a real-time outer **Ghost Piece** projecting the exact landing spot after diagonal travel and wall-sliding.
  - Supports mid-flight nudging and acceleration, 3-way wall-sliding on impact with a `0.25s` lock grace period, and a **`QUICK!`** bonus (`+8%` charge) when launching within `0.5s` of spawn.
- **Concentric Ring Priority + 4-Way Line Clear + 4-Side Resonance Hybrid**
  - **Concentric Ring Jackpot**: Filling any inner ring (rings 2–6) directly triggers a ring burst. Remaining inner blocks (including those protruding into the center) expand outward in 8 directions—with 45° corner ejection to prevent dead-end lockups.
  - **4-Way Instant Line Clear & Cross Clear**: Filling any outer 16-cell row or column clears it immediately and collapses that half-board toward its corresponding outer wall; completing both a row and column simultaneously triggers a `Cross Clear`.
  - **4-Side Ring Resonance (`RING RESONANCE!`)**: Clearing North, South, West, and East lines lights up the corresponding neon board edges (`4/4`). Lighting all 4 edges sweeps Ring 1 (clearing all remaining outer-ring blocks), expands inner cells outward in 8 directions, awards `1,200 × Level × Flow` + **`+35%` Charge**, and resets the edges for the next cycle.
  - **Clears Take Priority Over Game Over**: Post-lock direct ring clears, line clears, and 4-Side Resonance expansion always resolve before the Game Over check, enabling clutch last-second saves.
- **Dual Difficulties & Star Core Rescue System (`Charge = 100%`)**
  - **`EASY` · Nova Bomb (`3×3` Blast)**: Explodes a `3 × 3` area upon hitting the first obstacle or outer wall.
  - **`HARD` · Stardust Piercer (`1×1` Piercing Shot)**: Pierces straight through solid blocks along an 8-way ray toward the outermost gap, and can be manually locked mid-flight over any outer empty cell by pressing Launch/Hard Drop.
- **Zero-Switch Triple Parallel Input**
  - **Numpad (one-handed 8-way)**, **WASD / Arrow Keys (chorded diagonals)**, and **Mouse (radial aiming around center + click)** are all active simultaneously with zero mode switching.
- **Complete UI Flow & Anti-Peek Pause Shield**
  - Full `Title Screen → Gameplay ⇄ Pause Overlay → Game Over` flow, featuring instant **EN / 简体中文** hot-switching (including live re-translation of the current speech bubble), a Gaussian-blurred anti-peek pause shield (`0.6s` resume countdown), and `localStorage`-backed **Easy / Hard Top 5** local leaderboards.
- **Gemini AI-chan Mascot System**
  - Features 6 `512×512` expressions (`Smug / Mocking / Bored / Malicious / Shocked / Clap`) cropped from the concept sheet, covering **14 gameplay events × 3 lines (42 bilingual lines total)** with a 6–8s normal cooldown, high-priority interrupts, anti-repeat shuffle, and a 1s `Shocked → Smug` face-saving recovery.
- **Prism Visual Juice & Pure Web Audio API Synth**
  - `1.0 → 1.08 → 1.0` landing bounce & sparks, white-flash clear Hitstop (`50ms / 80ms / 100–105ms`), independent board micro-shake, clockwise prism sweep waves, diamond shatter particles, and rainbow shockwaves.
  - Built-in `96 BPM` C major pentatonic (`Cadd9 -> Am7 -> Fmaj7 -> G6`) procedural Synthwave/Lo-Fi BGM sequencer (with pause low-pass ducking and dynamic danger drums) plus pentatonic SFX for all events, with optional external audio override hooks.

---

## Quick Start

### Prerequisites

- Node.js 18+

### Install & Run

```bash
# Install dependencies
npm install

# Start the local dev server and play in your browser
npm run dev

# Run the full unit test suite (10 test files / 64 tests)
npm test

# TypeScript type-check + production build (outputs to dist/)
npm run build

# Preview the production build
npm run preview
```

> **Windows PowerShell Note**: If execution policy blocks `npm.ps1`, use `npm.cmd` instead (e.g. `npm.cmd run dev`, `npm.cmd test`, `npm.cmd run build`).

---

## Controls Cheat Sheet

All three input schemes are active at the same time:

| Action | Numpad | WASD / Arrow Keys | Mouse + Aux Keys |
| :--- | :--- | :--- | :--- |
| **8-Way Center Aim** | `7 8 9` / `4 6` / `1 2 3` | Single key for cardinal; two-key chord for diagonal (e.g. `W+A`) | Move mouse around center to snap to 8 directions |
| **Rotate CW / CCW** | `0` / `Enter` / `+` / `-` | **`Space` (CW)** / `Q` `Z` (CCW) / `E` `X` (CW) | Right Click / Scroll Wheel |
| **Launch / Hard Drop / Piercer Lock** | `5` | **`Enter` / `F`** | Left Click inside board |
| **Mid-Flight Nudge & Boost** | `7 8 9` / `4 6` / `1 2 3` | `WASD` / Arrow Keys | Combine with keyboard or hover aim |
| **Hold Piece** | `.` | `C` | Middle Click / Side Button |
| **Activate Star Core** | `/` | `Shift` | Click HUD Charge Bar |
| **Pause / Restart** | `Esc` / `P` (Pause) · `R` (Restart) | `Esc` / `P` (Pause) · `R` (Restart) | Click HUD buttons |

---

## Project Structure

```text
antigravity-tetris/
├── GDD/                                 # Game Design Document, flow SVG, and mascot concept art
│   ├── gdd_v2_0_way_concentric_tetris.md
│   └── 游戏流程图.svg
├── public/assets/aichan/                # 6 cropped 512×512 AI-chan portrait sprites
├── scripts/
│   └── extract-aichan.ps1               # PowerShell script to crop portraits from the GDD sheet
└── src/
    ├── main.ts                          # Phaser 3 entry config (1920×1080 FIT centered)
    ├── core/                            # Pure TS headless rules engine & 5 test suites (no Phaser/DOM deps)
    ├── mascot/                          # Pure TS Gemini AI-chan state machine, 42-line bank & tests
    ├── audio/                           # Web Audio API synth engine, C major pentatonic math & tests
    ├── input/                           # Triple parallel input coordinator & angle-mapping tests
    ├── storage/                         # localStorage preferences & Easy/Hard Top-5 leaderboard manager
    ├── i18n/                            # EN / ZH bilingual dictionary & hot-switch helpers
    ├── render/                          # Phaser renderers for board/FX, HUD & AI-chan mascot
    ├── ui/                              # Glassmorphic UI, Controls/HighScores modals, anti-peek pause & Game Over
    └── scenes/                          # TitleScene (title & difficulty select) & GameScene (main loop)
```

---

## External Audio Overrides (Optional)

By default, the game uses a zero-dependency procedural Web Audio API synthesizer for BGM and SFX. To swap in external `.ogg` / `.mp3` / `.wav` assets, call `audioEngine.configureOverrides` during startup:

```ts
import { audioEngine } from './src/audio';

audioEngine.configureOverrides({
  bgm: {
    main: '/audio/bgm-main.ogg',
    danger: '/audio/bgm-danger.ogg',
  },
  sfx: {
    nova_blast: '/audio/sfx-nova.ogg',
    clear_multi: '/audio/sfx-multi-clear.ogg',
  },
});
```

Any unconfigured or failed-to-load entries seamlessly fall back to the built-in procedural synth.

---

## Design Documents

- [Game Design Document (GDD v2.2)](GDD/gdd_v2_0_way_concentric_tetris.md)
- [Game State Flow Diagram](GDD/游戏流程图.svg)
