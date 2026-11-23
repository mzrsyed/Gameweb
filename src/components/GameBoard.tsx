import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Box,
  Crown,
  Dices,
  HelpCircle,
  RotateCw,
  Square,
  Star,
} from 'lucide-react';
import type { LobbyPlayer, LudoColor, LudoGameState, LudoSlot, MapTheme } from '../shared/types';
import { soundFx } from '../lib/sound';
import { LudoDice3D } from './LudoDice3D';

interface GameBoardProps {
  gameState: LudoGameState;
  mapTheme: MapTheme;
  players: LobbyPlayer[];
  myUid: string | null;
  onRollDice: () => void;
  onMoveToken: (tokenIndex: number) => void;
}

// --- 4-Arm Classic Ludo King 15x15 Constants ---
const OUTER_TRACK_COORDS_4: [number, number][] = [
  [6, 1], [6, 2], [6, 3], [6, 4], [6, 5],
  [5, 6], [4, 6], [3, 6], [2, 6], [1, 6], [0, 6],
  [0, 7], [0, 8],
  [1, 8], [2, 8], [3, 8], [4, 8], [5, 8],
  [6, 9], [6, 10], [6, 11], [6, 12], [6, 13], [6, 14],
  [7, 14], [8, 14],
  [8, 13], [8, 12], [8, 11], [8, 10], [8, 9],
  [9, 8], [10, 8], [11, 8], [12, 8], [13, 8], [14, 8],
  [14, 7], [14, 6],
  [13, 6], [12, 6], [11, 6], [10, 6], [9, 6],
  [8, 5], [8, 4], [8, 3], [8, 2], [8, 1], [8, 0],
  [7, 0], [6, 0],
];

const HOME_STRETCH_COORDS_4: Record<'red' | 'green' | 'yellow' | 'blue', [number, number][]> = {
  red: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  green: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  yellow: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  blue: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

const YARD_TOKEN_COORDS_4: Record<'red' | 'green' | 'yellow' | 'blue', [number, number][]> = {
  red: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  green: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  yellow: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  blue: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
};

const GOAL_COORDS_4: Record<'red' | 'green' | 'yellow' | 'blue', [number, number]> = {
  red: [7, 6.18],
  green: [6.18, 7],
  yellow: [7, 7.82],
  blue: [7.82, 7],
};

// --- 6-Arm Hexagonal Ludo Constants (Normalized 0..100% Coordinates) ---
const COLORS_6: LudoColor[] = ['red', 'green', 'yellow', 'blue', 'purple', 'cyan'];
const HEX_R_IN = 12.2;
const HEX_STEP = 4.9;
const HEX_LANE_W = 4.1;
const HEX_YARD_R = 34.5;

function armLocalToPct(sector: number, u: number, v: number): [number, number] {
  const angleRad = ((sector * 60 - 90) * Math.PI) / 180;
  const dx = Math.cos(angleRad);
  const dy = Math.sin(angleRad);
  const px = -Math.sin(angleRad);
  const py = Math.cos(angleRad);
  return [50 + v * dx + u * px, 50 + v * dy + u * py];
}

interface HexTileDef {
  key: string;
  x: number;
  y: number;
  deg: number;
  kind: 'normal' | 'start' | 'star' | 'home' | 'entry';
  color?: LudoColor;
}

const HEX_BOARD_TILES: HexTileDef[] = [];
const HEX_OUTER_PCT: [number, number][] = [];
const HEX_HOME_PCT: Record<LudoColor, [number, number][]> = {
  red: [],
  green: [],
  yellow: [],
  blue: [],
  purple: [],
  cyan: [],
};
const HEX_YARD_CENTERS: Record<LudoColor, [number, number]> = {
  red: [50, 50],
  green: [50, 50],
  yellow: [50, 50],
  blue: [50, 50],
  purple: [50, 50],
  cyan: [50, 50],
};
const HEX_YARD_SOCKETS_PCT: Record<LudoColor, [number, number][]> = {
  red: [],
  green: [],
  yellow: [],
  blue: [],
  purple: [],
  cyan: [],
};
const HEX_GOAL_PCT: Record<LudoColor, [number, number]> = {
  red: [50, 50],
  green: [50, 50],
  yellow: [50, 50],
  blue: [50, 50],
  purple: [50, 50],
  cyan: [50, 50],
};

(() => {
  for (let s = 0; s < 6; s++) {
    const next = (s + 1) % 6;
    const sColor = COLORS_6[s];
    const nextColor = COLORS_6[next];

    for (let k = 0; k < 5; k++) {
      const v = HEX_R_IN + (4 - k) * HEX_STEP;
      const [x, y] = armLocalToPct(s, HEX_LANE_W, v);
      HEX_OUTER_PCT.push([x, y]);
      HEX_BOARD_TILES.push({
        key: `hex-out-${s}-${k}`,
        x,
        y,
        deg: s * 60,
        kind: k === 0 ? 'start' : 'normal',
        color: k === 0 ? sColor : undefined,
      });
    }

    for (let k = 0; k < 6; k++) {
      const v = HEX_R_IN + k * HEX_STEP;
      const [x, y] = armLocalToPct(next, -HEX_LANE_W, v);
      HEX_OUTER_PCT.push([x, y]);
      HEX_BOARD_TILES.push({
        key: `hex-out-${s}-${5 + k}`,
        x,
        y,
        deg: next * 60,
        kind: k === 3 ? 'star' : 'normal',
      });
    }

    const [txM, tyM] = armLocalToPct(next, 0, HEX_R_IN + 5 * HEX_STEP);
    HEX_OUTER_PCT.push([txM, tyM]);
    HEX_BOARD_TILES.push({
      key: `hex-out-${s}-11`,
      x: txM,
      y: tyM,
      deg: next * 60,
      kind: 'entry',
      color: nextColor,
    });

    const [txR, tyR] = armLocalToPct(next, HEX_LANE_W, HEX_R_IN + 5 * HEX_STEP);
    HEX_OUTER_PCT.push([txR, tyR]);
    HEX_BOARD_TILES.push({
      key: `hex-out-${s}-12`,
      x: txR,
      y: tyR,
      deg: next * 60,
      kind: 'normal',
    });

    for (let h = 0; h < 5; h++) {
      const v = HEX_R_IN + (4 - h) * HEX_STEP;
      const [hx, hy] = armLocalToPct(s, 0, v);
      HEX_HOME_PCT[sColor].push([hx, hy]);
      HEX_BOARD_TILES.push({
        key: `hex-home-${s}-${h}`,
        x: hx,
        y: hy,
        deg: s * 60,
        kind: 'home',
        color: sColor,
      });
    }

    HEX_GOAL_PCT[sColor] = armLocalToPct(s, 0, 6.0);

    const yAngleRad = ((s * 60 - 60) * Math.PI) / 180;
    const yx = 50 + HEX_YARD_R * Math.cos(yAngleRad);
    const yy = 50 + HEX_YARD_R * Math.sin(yAngleRad);
    HEX_YARD_CENTERS[sColor] = [yx, yy];
    const d = 2.75;
    HEX_YARD_SOCKETS_PCT[sColor] = [
      [yx - d, yy - d],
      [yx + d, yy - d],
      [yx - d, yy + d],
      [yx + d, yy + d],
    ];
  }
})();

const COLOR_START_OFFSET: Record<LudoColor, number> = {
  red: 0,
  green: 13,
  yellow: 26,
  blue: 39,
  purple: 52,
  cyan: 65,
};

const SAFE_GLOBAL_4 = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);
const STAR_GLOBAL_4 = new Set<number>([8, 21, 34, 47]);
const SAFE_GLOBAL_6 = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47, 52, 60, 65, 73]);

const COLOR_FRONT_ROTATION_4: Record<LudoColor, number> = {
  blue: 0,
  yellow: 90,
  green: 180,
  red: 270,
  purple: 0,
  cyan: 0,
};

// Maps current 4-arm boardRotation (0, 90, 180, 270) to which color sits at TL, TR, BL, BR
const CORNER_COLORS_BY_ROTATION_4: Record<
  number,
  { tl: LudoColor; tr: LudoColor; bl: LudoColor; br: LudoColor }
> = {
  0: { tl: 'red', tr: 'green', bl: 'blue', br: 'yellow' },
  90: { tl: 'blue', tr: 'red', bl: 'yellow', br: 'green' },
  180: { tl: 'yellow', tr: 'blue', bl: 'green', br: 'red' },
  270: { tl: 'green', tr: 'yellow', bl: 'red', br: 'blue' },
};

const COLOR_STYLES: Record<
  LudoColor,
  {
    label: string;
    dot: string;
    tileBg: string;
    yardBg: string;
    yardRing: string;
    boxActive: string;
    boxIdle: string;
    barBg: string;
    pawnBody: string;
    pawnTop: string;
    pawnBase: string;
    pawnText: string;
    chipBtn: string;
    socketBg: string;
    triangleHex: string;
    arrowText: string;
  }
> = {
  red: {
    label: 'Red',
    dot: 'bg-[#E51B24] border-rose-900',
    tileBg: 'bg-[#E51B24] text-white',
    yardBg: 'bg-gradient-to-br from-[#F42B35] to-[#C8101A]',
    yardRing: 'ring-amber-300',
    boxActive:
      'border-[#F42B35] bg-gradient-to-br from-rose-50 to-white dark:from-rose-500/25 dark:to-[#0B1733] ring-2 ring-amber-400/80 shadow-[0_6px_20px_rgba(229,27,36,0.22)]',
    boxIdle: 'border-rose-500/35 bg-white dark:bg-[#0B1733]',
    barBg: 'bg-[#E51B24]',
    pawnBody: '#E51B24',
    pawnTop: '#FF6B73',
    pawnBase: '#990B12',
    pawnText: '#ffffff',
    chipBtn: 'bg-[#E51B24] hover:bg-rose-700 text-white',
    socketBg: 'bg-[#FFE4E6] border-[#E51B24]',
    triangleHex: '#E51B24',
    arrowText: 'text-[#E51B24]',
  },
  green: {
    label: 'Green',
    dot: 'bg-[#00A651] border-emerald-900',
    tileBg: 'bg-[#00A651] text-white',
    yardBg: 'bg-gradient-to-br from-[#12BD64] to-[#008840]',
    yardRing: 'ring-amber-300',
    boxActive:
      'border-[#00A651] bg-gradient-to-br from-emerald-50 to-white dark:from-emerald-500/25 dark:to-[#0B1733] ring-2 ring-amber-400/80 shadow-[0_6px_20px_rgba(0,166,81,0.22)]',
    boxIdle: 'border-emerald-500/35 bg-white dark:bg-[#0B1733]',
    barBg: 'bg-[#00A651]',
    pawnBody: '#00A651',
    pawnTop: '#4ADE80',
    pawnBase: '#046C35',
    pawnText: '#ffffff',
    chipBtn: 'bg-[#00A651] hover:bg-emerald-700 text-white',
    socketBg: 'bg-[#DCFCE7] border-[#00A651]',
    triangleHex: '#00A651',
    arrowText: 'text-[#00A651]',
  },
  yellow: {
    label: 'Yellow',
    dot: 'bg-[#FACC15] border-amber-700',
    tileBg: 'bg-[#FACC15] text-slate-950',
    yardBg: 'bg-gradient-to-br from-[#FDE047] to-[#EAB308]',
    yardRing: 'ring-white',
    boxActive:
      'border-[#FACC15] bg-gradient-to-br from-amber-50 to-white dark:from-amber-400/25 dark:to-[#0B1733] ring-2 ring-amber-400 shadow-[0_6px_20px_rgba(250,204,21,0.25)]',
    boxIdle: 'border-amber-400/40 bg-white dark:bg-[#0B1733]',
    barBg: 'bg-[#FACC15]',
    pawnBody: '#EAB308',
    pawnTop: '#FEF08A',
    pawnBase: '#A16207',
    pawnText: '#0f172a',
    chipBtn: 'bg-[#FACC15] hover:bg-amber-400 text-slate-950',
    socketBg: 'bg-[#FEF9C3] border-[#CA8A04]',
    triangleHex: '#FACC15',
    arrowText: 'text-[#CA8A04]',
  },
  blue: {
    label: 'Blue',
    dot: 'bg-[#1D7AFC] border-blue-900',
    tileBg: 'bg-[#1D7AFC] text-white',
    yardBg: 'bg-gradient-to-br from-[#3B91FF] to-[#135ED8]',
    yardRing: 'ring-amber-300',
    boxActive:
      'border-[#1D7AFC] bg-gradient-to-br from-blue-50 to-white dark:from-blue-500/25 dark:to-[#0B1733] ring-2 ring-amber-400/80 shadow-[0_6px_20px_rgba(29,122,252,0.24)]',
    boxIdle: 'border-blue-500/35 bg-white dark:bg-[#0B1733]',
    barBg: 'bg-[#1D7AFC]',
    pawnBody: '#1D7AFC',
    pawnTop: '#7CC0FF',
    pawnBase: '#1246A6',
    pawnText: '#ffffff',
    chipBtn: 'bg-[#1D7AFC] hover:bg-blue-700 text-white',
    socketBg: 'bg-[#DBEAFE] border-[#1D7AFC]',
    triangleHex: '#1D7AFC',
    arrowText: 'text-[#1D7AFC]',
  },
  purple: {
    label: 'Purple',
    dot: 'bg-violet-600 border-violet-900',
    tileBg: 'bg-violet-600 text-white',
    yardBg: 'bg-gradient-to-br from-violet-500 to-violet-700',
    yardRing: 'ring-amber-300',
    boxActive:
      'border-violet-500 bg-gradient-to-br from-violet-50 to-white dark:from-violet-500/25 dark:to-[#0B1733] ring-2 ring-amber-400/80',
    boxIdle: 'border-violet-500/35 bg-white dark:bg-[#0B1733]',
    barBg: 'bg-violet-500',
    pawnBody: '#7c3aed',
    pawnTop: '#a78bfa',
    pawnBase: '#4c1d95',
    pawnText: '#ffffff',
    chipBtn: 'bg-violet-600 hover:bg-violet-700 text-white',
    socketBg: 'bg-violet-100 border-violet-600',
    triangleHex: '#7c3aed',
    arrowText: 'text-violet-500',
  },
  cyan: {
    label: 'Cyan',
    dot: 'bg-cyan-500 border-cyan-800',
    tileBg: 'bg-cyan-500 text-slate-950',
    yardBg: 'bg-gradient-to-br from-cyan-400 to-teal-600',
    yardRing: 'ring-amber-300',
    boxActive:
      'border-cyan-400 bg-gradient-to-br from-cyan-50 to-white dark:from-cyan-400/25 dark:to-[#0B1733] ring-2 ring-amber-400/80',
    boxIdle: 'border-cyan-400/35 bg-white dark:bg-[#0B1733]',
    barBg: 'bg-cyan-400',
    pawnBody: '#06b6d4',
    pawnTop: '#67e8f9',
    pawnBase: '#0e7490',
    pawnText: '#0f172a',
    chipBtn: 'bg-cyan-500 hover:bg-cyan-600 text-slate-950',
    socketBg: 'bg-cyan-100 border-cyan-600',
    triangleHex: '#06b6d4',
    arrowText: 'text-cyan-500',
  },
};

// Classic Ludo King high-contrast crisp white playfield inside royal bezel
const SLAB_THEME: Record<
  MapTheme,
  {
    frame: string;
    frontWall: string;
    playfield: string;
    tile: string;
    starTile: string;
    yardPad: string;
    starIcon: string;
  }
> = {
  'Obsidian Grid': {
    frame: 'bg-gradient-to-b from-[#0E285E] to-[#08173A] border-amber-400/75',
    frontWall: 'bg-gradient-to-b from-[#173A7D] to-[#050C1D]',
    playfield: 'bg-white',
    tile: 'bg-white border-slate-300',
    starTile: 'bg-amber-50 border-amber-300',
    yardPad: 'bg-white',
    starIcon: 'text-slate-500',
  },
  'Alpine Bastion': {
    frame: 'bg-gradient-to-b from-sky-200 to-sky-400 dark:from-slate-800 dark:to-slate-900 border-sky-400 dark:border-slate-600',
    frontWall: 'bg-gradient-to-b from-sky-500 to-sky-700 dark:from-slate-700 dark:to-slate-950',
    playfield: 'bg-sky-50',
    tile: 'bg-white border-sky-200',
    starTile: 'bg-sky-100 border-sky-300',
    yardPad: 'bg-white',
    starIcon: 'text-sky-600',
  },
  'Solaris Circuit': {
    frame: 'bg-gradient-to-b from-amber-700 to-amber-950 border-amber-400/80',
    frontWall: 'bg-gradient-to-b from-amber-900 to-stone-950',
    playfield: 'bg-amber-50',
    tile: 'bg-[#FFFDF7] border-amber-200',
    starTile: 'bg-amber-100 border-amber-400',
    yardPad: 'bg-[#FFFDF7]',
    starIcon: 'text-amber-600',
  },
};

function getTokenPctCoords(
  armCount: 4 | 6,
  color: LudoColor,
  tokenIdx: number,
  progress: number
): [number, number] {
  if (armCount === 4) {
    const c4 = color as 'red' | 'green' | 'yellow' | 'blue';
    let row = 7;
    let col = 7;
    if (progress < 0) {
      [row, col] = YARD_TOKEN_COORDS_4[c4][tokenIdx];
    } else if (progress <= 50) {
      const gIdx = (COLOR_START_OFFSET[color] + progress) % 52;
      [row, col] = OUTER_TRACK_COORDS_4[gIdx];
    } else if (progress <= 55) {
      [row, col] = HOME_STRETCH_COORDS_4[c4][progress - 51];
    } else {
      [row, col] = GOAL_COORDS_4[c4];
    }
    return [((col + 0.5) / 15) * 100, ((row + 0.5) / 15) * 100];
  }

  if (progress < 0) return HEX_YARD_SOCKETS_PCT[color][tokenIdx];
  if (progress <= 76) {
    const gIdx = (COLOR_START_OFFSET[color] + progress) % 78;
    return HEX_OUTER_PCT[gIdx];
  }
  if (progress <= 81) {
    return HEX_HOME_PCT[color][progress - 77];
  }
  return HEX_GOAL_PCT[color];
}

function getDestinationProgress(
  armCount: 4 | 6,
  currentProgress: number,
  diceValue: number | null
): number | null {
  if (!diceValue) return null;
  if (currentProgress === -1) return diceValue === 6 ? 0 : null;
  const goal = armCount * 13 + 4;
  const next = currentProgress + diceValue;
  return next <= goal ? next : null;
}

function PawnPiece3D({
  color,
  number,
  movable,
  compact,
  isHovered,
}: {
  color: LudoColor;
  number: number;
  movable: boolean;
  compact: boolean;
  isHovered: boolean;
}) {
  const cStyle = COLOR_STYLES[color];

  return (
    <div
      className={`relative w-full h-full flex items-center justify-center transition-transform duration-150 ${
        movable ? (isHovered ? 'scale-120' : 'scale-110') : ''
      }`}
    >
      <svg
        viewBox="0 0 40 48"
        className={`w-full h-full drop-shadow-[0_3px_4px_rgba(0,0,0,0.52)] ${
          compact ? 'scale-90' : ''
        }`}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`lk-crown-${color}-${number}`} cx="35%" cy="28%" r="72%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.72" />
            <stop offset="42%" stopColor={cStyle.pawnTop} />
            <stop offset="100%" stopColor={cStyle.pawnBody} />
          </radialGradient>
        </defs>
        <ellipse cx="20" cy="42" rx="14.5" ry="5" fill={cStyle.pawnBase} />
        <ellipse cx="20" cy="39.5" rx="13.5" ry="4.5" fill="#ffffff" fillOpacity="0.85" />
        <ellipse cx="20" cy="39" rx="12" ry="3.8" fill={cStyle.pawnBody} />
        <path
          d="M10.5 38 C12.5 28, 15.5 22, 16.5 17 L23.5 17 C24.5 22, 27.5 28, 29.5 38 Z"
          fill={cStyle.pawnBody}
          stroke={cStyle.pawnBase}
          strokeWidth="1.2"
        />
        <circle
          cx="20"
          cy="12"
          r="9.5"
          fill={`url(#lk-crown-${color}-${number})`}
          stroke="#ffffff"
          strokeWidth="1.3"
        />
      </svg>
      <span
        style={{ color: cStyle.pawnText }}
        className={`absolute top-[11%] font-mono font-extrabold leading-none pointer-events-none select-none ${
          compact ? 'text-[8px] sm:text-[9px]' : 'text-[9px] sm:text-[10px]'
        }`}
      >
        {number}
      </span>
    </div>
  );
}

const YARD_DEFS_4: {
  color: 'red' | 'green' | 'yellow' | 'blue';
  posStyle: { top?: string; bottom?: string; left?: string; right?: string };
}[] = [
  { color: 'red', posStyle: { top: '0%', left: '0%' } },
  { color: 'green', posStyle: { top: '0%', right: '0%' } },
  { color: 'yellow', posStyle: { bottom: '0%', right: '0%' } },
  { color: 'blue', posStyle: { bottom: '0%', left: '0%' } },
];

const YARD_SOCKET_PCT_4 = [
  { top: '33.333%', left: '33.333%' },
  { top: '33.333%', left: '66.667%' },
  { top: '66.667%', left: '33.333%' },
  { top: '66.667%', left: '66.667%' },
];

export function GameBoard({
  gameState,
  mapTheme,
  players,
  myUid,
  onRollDice,
  onMoveToken,
}: GameBoardProps) {
  const armCount = gameState.armCount || (players.length > 4 ? 6 : 4);
  const myPlayer = players.find((p) => p.uid === myUid) || null;
  const mySlot = myPlayer?.slot ?? null;
  const activePlayer = players.find((p) => p.slot === gameState.turnSlot);
  const isMyTurn = mySlot !== null && gameState.turnSlot === mySlot;

  const [viewMode, setViewMode] = useState<'3d' | 'top'>('3d');
  const [boardRotation, setBoardRotation] = useState<number>(() =>
    armCount === 4 && myPlayer ? COLOR_FRONT_ROTATION_4[myPlayer.ludoColor] : 0
  );
  const [hoveredTokenIdx, setHoveredTokenIdx] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(15);

  // Per-player independent dice state so every player has their own visible 3D die
  const [diceBySlot, setDiceBySlot] = useState<
    Record<number, { value: number | null; rollSeq: number }>
  >({});
  const lastRecordedRollRef = useRef<string>('');

  useEffect(() => {
    if (gameState.diceValue === null) return;
    const key = `${gameState.turnSlot}-${gameState.phase}-${gameState.diceValue}-${gameState.lastActionText}`;
    if (key === lastRecordedRollRef.current) return;
    lastRecordedRollRef.current = key;
    setDiceBySlot((prev) => {
      const existing = prev[gameState.turnSlot] || { value: null, rollSeq: 0 };
      return {
        ...prev,
        [gameState.turnSlot]: {
          value: gameState.diceValue,
          rollSeq: existing.rollSeq + 1,
        },
      };
    });
  }, [gameState.turnSlot, gameState.phase, gameState.diceValue, gameState.lastActionText]);

  useEffect(() => {
    const update = () => {
      setSecondsLeft(Math.max(0, Math.ceil((gameState.turnDeadline - Date.now()) / 1000)));
    };
    update();
    const id = window.setInterval(update, 250);
    return () => window.clearInterval(id);
  }, [gameState.turnDeadline]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      if (!isMyTurn) return;

      if (gameState.phase === 'roll' && (e.code === 'Space' || e.key.toLowerCase() === 'r')) {
        e.preventDefault();
        soundFx.capture();
        onRollDice();
      } else if (gameState.phase === 'move' && ['1', '2', '3', '4'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (gameState.movableTokenIndices.includes(idx)) {
          e.preventDefault();
          soundFx.move();
          onMoveToken(idx);
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isMyTurn, gameState.phase, gameState.movableTokenIndices, onRollDice, onMoveToken]);

  useEffect(() => {
    setHoveredTokenIdx(null);
  }, [gameState.phase, gameState.turnSlot, gameState.diceValue]);

  const coordToTrackIdx4 = useMemo(() => {
    const map = new Map<string, number>();
    OUTER_TRACK_COORDS_4.forEach(([r, c], idx) => map.set(`${r},${c}`, idx));
    return map;
  }, []);

  const slab = SLAB_THEME[mapTheme];
  const tiltDeg = viewMode === '3d' ? 20 : 0;
  const safeCount = armCount === 4 ? SAFE_GLOBAL_4.size : SAFE_GLOBAL_6.size;

  const previewPct = useMemo<[number, number] | null>(() => {
    if (!isMyTurn || gameState.phase !== 'move' || hoveredTokenIdx === null || !myPlayer) {
      return null;
    }
    if (!gameState.movableTokenIndices.includes(hoveredTokenIdx)) return null;
    const myState = gameState.players.find((p) => p.slot === myPlayer.slot);
    if (!myState) return null;
    const destProg = getDestinationProgress(
      armCount,
      myState.tokens[hoveredTokenIdx],
      gameState.diceValue
    );
    if (destProg === null) return null;
    return getTokenPctCoords(armCount, myPlayer.ludoColor, hoveredTokenIdx, destProg);
  }, [
    armCount,
    isMyTurn,
    gameState.phase,
    gameState.movableTokenIndices,
    gameState.players,
    gameState.diceValue,
    hoveredTokenIdx,
    myPlayer,
  ]);

  const allTokens = useMemo(() => {
    const list: {
      slot: LudoSlot;
      color: LudoColor;
      tokenIdx: number;
      progress: number;
      leftPct: number;
      topPct: number;
      movable: boolean;
    }[] = [];

    for (const pl of gameState.players) {
      for (let i = 0; i < 4; i++) {
        const prog = pl.tokens[i];
        const [leftPct, topPct] = getTokenPctCoords(armCount, pl.color, i, prog);
        const movable =
          isMyTurn &&
          pl.slot === mySlot &&
          gameState.phase === 'move' &&
          gameState.movableTokenIndices.includes(i);
        list.push({
          slot: pl.slot,
          color: pl.color,
          tokenIdx: i,
          progress: prog,
          leftPct,
          topPct,
          movable,
        });
      }
    }
    return list;
  }, [armCount, gameState.players, gameState.phase, gameState.movableTokenIndices, isMyTurn, mySlot]);

  const stackGroups = useMemo(() => {
    const map = new Map<string, typeof allTokens>();
    for (const t of allTokens) {
      const key = `${t.leftPct.toFixed(1)},${t.topPct.toFixed(1)}`;
      const group = map.get(key) || [];
      group.push(t);
      map.set(key, group);
    }
    return map;
  }, [allTokens]);

  // Renders an individual Ludo King player dock with its own separate 3D Dice
  const renderPlayerDiceDock = (player: LobbyPlayer | undefined, align: 'left' | 'right') => {
    if (!player) return <div className="hidden sm:block" aria-hidden="true" />;

    const pState = gameState.players.find((gs) => gs.slot === player.slot);
    const isActiveTurn = player.slot === gameState.turnSlot;
    const isMe = player.uid === myUid;
    const cStyle = COLOR_STYLES[player.ludoColor];
    const finished = pState?.finishedCount ?? 0;
    const slotDice = diceBySlot[player.slot] || { value: 1, rollSeq: 0 };
    const shownDiceVal = isActiveTurn && gameState.diceValue !== null ? gameState.diceValue : slotDice.value;
    const canThisRoll = isActiveTurn && isMe && gameState.phase === 'roll';

    const diceNode = (
      <LudoDice3D
        size="sm"
        value={shownDiceVal}
        canRoll={canThisRoll}
        inactive={!isActiveTurn}
        playerColor={player.ludoColor}
        mapTheme={mapTheme}
        actionNonce={`${player.slot}-${slotDice.rollSeq}-${shownDiceVal ?? 'idle'}`}
        onRoll={() => {
          soundFx.capture();
          onRollDice();
        }}
      />
    );

    const infoNode = (
      <div className={`min-w-0 flex-1 space-y-1 ${align === 'right' ? 'text-right' : 'text-left'}`}>
        <div
          className={`flex items-center gap-1.5 ${
            align === 'right' ? 'justify-end' : 'justify-start'
          }`}
        >
          {align === 'left' && (
            <span className={`w-2.5 h-2.5 rounded-full border shrink-0 ${cStyle.dot}`} />
          )}
          <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
            {player.username}
          </span>
          {align === 'right' && (
            <span className={`w-2.5 h-2.5 rounded-full border shrink-0 ${cStyle.dot}`} />
          )}
        </div>

        <div
          className={`flex items-center gap-1 ${
            align === 'right' ? 'justify-end' : 'justify-start'
          }`}
        >
          {Array.from({ length: 4 }).map((_, dotIdx) => (
            <span
              key={dotIdx}
              className={`w-2 h-2 rounded-full border ${
                dotIdx < finished
                  ? cStyle.dot
                  : 'bg-slate-200 dark:bg-slate-800 border-slate-300 dark:border-slate-700'
              }`}
            />
          ))}
          <span className="ml-1 font-mono tabular-nums text-[10px] text-slate-500 dark:text-slate-400">
            {finished}/4
          </span>
        </div>

        <p
          className={`text-[11px] font-semibold truncate ${
            canThisRoll
              ? 'text-amber-600 dark:text-amber-400'
              : isActiveTurn
                ? 'text-slate-800 dark:text-slate-200'
                : 'text-slate-500 dark:text-slate-400'
          }`}
        >
          {isActiveTurn
            ? isMe
              ? gameState.phase === 'roll'
                ? 'Tap your dice!'
                : 'Move a pawn'
              : gameState.phase === 'roll'
                ? `Rolling (${secondsLeft}s)`
                : `Moving (${secondsLeft}s)`
            : 'Waiting'}
        </p>
      </div>
    );

    return (
      <div
        key={player.uid}
        className={`relative rounded-xl border px-3 py-2 flex items-center gap-2.5 transition-all duration-200 min-h-[74px] ${
          isActiveTurn ? cStyle.boxActive : cStyle.boxIdle
        }`}
      >
        {align === 'left' ? (
          <>
            {diceNode}
            {infoNode}
          </>
        ) : (
          <>
            {infoNode}
            {diceNode}
          </>
        )}
      </div>
    );
  };

  // Compute Top & Bottom Ludo King Player Docks aligned with board corners/sectors
  const { topRowPlayers, bottomRowPlayers } = useMemo(() => {
    if (armCount === 4) {
      const normalizedRot = ((boardRotation % 360) + 360) % 360;
      const corners = CORNER_COLORS_BY_ROTATION_4[normalizedRot] || CORNER_COLORS_BY_ROTATION_4[0];
      const byColor = (c: LudoColor) => players.find((p) => p.ludoColor === c);
      return {
        topRowPlayers: [
          { player: byColor(corners.tl), align: 'left' as const },
          { player: byColor(corners.tr), align: 'right' as const },
        ],
        bottomRowPlayers: [
          { player: byColor(corners.bl), align: 'left' as const },
          { player: byColor(corners.br), align: 'right' as const },
        ],
      };
    }

    // 6-Arm Hexagonal board: top sectors (cyan, red, green) & bottom sectors (purple, blue, yellow)
    const byColor = (c: LudoColor) => players.find((p) => p.ludoColor === c);
    return {
      topRowPlayers: [
        { player: byColor('cyan'), align: 'left' as const },
        { player: byColor('red'), align: 'left' as const },
        { player: byColor('green'), align: 'right' as const },
      ],
      bottomRowPlayers: [
        { player: byColor('purple'), align: 'left' as const },
        { player: byColor('blue'), align: 'left' as const },
        { player: byColor('yellow'), align: 'right' as const },
      ],
    };
  }, [armCount, boardRotation, players]);

  const renderTrackCell4 = (r: number, c: number) => {
    const inCorner =
      (r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c > 8) || (r > 8 && c < 6);
    const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;
    if (inCorner || inCenter) {
      return <div key={`${r}-${c}`} className="pointer-events-none" />;
    }

    if (r === 7 && c >= 1 && c <= 5) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-black/20 flex items-center justify-center ${COLOR_STYLES.red.tileBg}`}
        >
          {c === 5 && <ArrowRight className="w-2.5 h-2.5 opacity-90" />}
        </div>
      );
    }
    if (c === 7 && r >= 1 && r <= 5) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-black/20 flex items-center justify-center ${COLOR_STYLES.green.tileBg}`}
        >
          {r === 5 && <ArrowDown className="w-2.5 h-2.5 opacity-90" />}
        </div>
      );
    }
    if (r === 7 && c >= 9 && c <= 13) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-black/20 flex items-center justify-center ${COLOR_STYLES.yellow.tileBg}`}
        >
          {c === 9 && <ArrowLeft className="w-2.5 h-2.5 opacity-90" />}
        </div>
      );
    }
    if (c === 7 && r >= 9 && r <= 13) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-black/20 flex items-center justify-center ${COLOR_STYLES.blue.tileBg}`}
        >
          {r === 9 && <ArrowUp className="w-2.5 h-2.5 opacity-90" />}
        </div>
      );
    }

    const trackIdx = coordToTrackIdx4.get(`${r},${c}`);
    if (trackIdx === 0) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-black/20 flex items-center justify-center ${COLOR_STYLES.red.tileBg}`}
        >
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
        </div>
      );
    }
    if (trackIdx === 13) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-black/20 flex items-center justify-center ${COLOR_STYLES.green.tileBg}`}
        >
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
        </div>
      );
    }
    if (trackIdx === 26) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-black/20 flex items-center justify-center ${COLOR_STYLES.yellow.tileBg}`}
        >
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
        </div>
      );
    }
    if (trackIdx === 39) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-black/20 flex items-center justify-center ${COLOR_STYLES.blue.tileBg}`}
        >
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
        </div>
      );
    }

    if (r === 7 && c === 0) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] flex items-center justify-center ${slab.tile}`}>
          <ArrowRight className="w-3 h-3 text-[#E51B24]" />
        </div>
      );
    }
    if (r === 0 && c === 7) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] flex items-center justify-center ${slab.tile}`}>
          <ArrowDown className="w-3 h-3 text-[#00A651]" />
        </div>
      );
    }
    if (r === 7 && c === 14) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] flex items-center justify-center ${slab.tile}`}>
          <ArrowLeft className="w-3 h-3 text-[#CA8A04]" />
        </div>
      );
    }
    if (r === 14 && c === 7) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] flex items-center justify-center ${slab.tile}`}>
          <ArrowUp className="w-3 h-3 text-[#1D7AFC]" />
        </div>
      );
    }

    const isStar = trackIdx !== undefined && STAR_GLOBAL_4.has(trackIdx);
    return (
      <div
        key={`${r}-${c}`}
        className={`border-[0.5px] flex items-center justify-center ${
          isStar ? slab.starTile : slab.tile
        }`}
      >
        {isStar && <Star className={`w-2.5 h-2.5 sm:w-3 sm:h-3 ${slab.starIcon}`} />}
      </div>
    );
  };

  const rotateStep = armCount === 4 ? 90 : 60;
  const pawnWidthPct = armCount === 4 ? 6.6 : 4.5;
  const pawnHeightPct = armCount === 4 ? 8.0 : 5.5;

  return (
    <div className="space-y-3.5">
      {/* Top Toolbar: Turn Status, Camera Angle, Rotate & Rules */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-200 dark:border-[#1B2E54]">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2.5 h-2.5 rounded-full border ${
              activePlayer ? COLOR_STYLES[activePlayer.ludoColor].dot : 'bg-slate-400'
            }`}
          />
          <span className="font-semibold text-slate-900 dark:text-white">
            {isMyTurn ? 'Your Turn' : `${activePlayer?.username || 'Player'}'s Turn`}
          </span>
          <span aria-hidden="true" className="text-slate-400">
            ·
          </span>
          <span
            className={`font-mono tabular-nums font-bold ${
              secondsLeft <= 4
                ? 'text-red-600 dark:text-red-400'
                : 'text-amber-600 dark:text-amber-400'
            }`}
          >
            {secondsLeft}s
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div
            className="flex items-center p-0.5 rounded-lg bg-slate-100 dark:bg-[#081329] border border-slate-200 dark:border-[#1B2E54]"
            role="group"
            aria-label="Board camera angle"
          >
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[32px] cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-white dark:bg-[#132952] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Box className="w-3.5 h-3.5" />
              3D Box
            </button>
            <button
              type="button"
              onClick={() => setViewMode('top')}
              className={`px-2.5 py-1 text-xs font-medium rounded-md inline-flex items-center gap-1.5 transition-colors whitespace-nowrap min-h-[32px] cursor-pointer ${
                viewMode === 'top'
                  ? 'bg-white dark:bg-[#132952] text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              <Square className="w-3.5 h-3.5" />
              Top View
            </button>
          </div>

          <button
            type="button"
            onClick={() => setBoardRotation((r) => (r + rotateStep) % 360)}
            title="Rotate board"
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#1B2E54] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#132952] inline-flex items-center gap-1.5 whitespace-nowrap min-h-[34px] cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Rotate
          </button>

          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            title="Toggle Ludo rules"
            className="px-2.5 py-1.5 text-xs font-medium rounded-lg border border-slate-200 dark:border-[#1B2E54] text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#132952] inline-flex items-center gap-1 whitespace-nowrap min-h-[34px] cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Rules
          </button>
        </div>
      </div>

      {showRules && (
        <div className="rounded-xl border border-slate-200 dark:border-[#1B2E54] bg-slate-50 dark:bg-[#081329] px-4 py-2.5 text-xs text-slate-600 dark:text-slate-300 flex flex-wrap items-center gap-x-4 gap-y-1">
          <span>Roll 6 to exit yard</span>
          <span aria-hidden="true">·</span>
          <span>Bonus roll on 6, capture, or Home goal</span>
          <span aria-hidden="true">·</span>
          <span>{safeCount} safe star squares</span>
          <span aria-hidden="true">·</span>
          <span>Three 6s forfeits turn</span>
        </div>
      )}

      {/* Ludo King Top Corner Player Docks (Each With Separate 3D Dice) */}
      <div
        className={`grid gap-2.5 max-w-[560px] mx-auto ${
          armCount === 4 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'
        }`}
      >
        {topRowPlayers.map((entry) => renderPlayerDiceDock(entry.player, entry.align))}
      </div>

      {/* 3D Box Ludo King Tabletop Stage */}
      <div
        className={`relative w-full flex justify-center select-none ${
          viewMode === '3d' ? 'py-3 sm:py-5' : 'py-1'
        }`}
        style={{ perspective: '1250px' }}
      >
        <div
          className={`relative aspect-square w-full max-w-[520px] rounded-2xl border-2 p-2.5 sm:p-3.5 preserve-3d ${slab.frame}`}
          style={{
            transform: `rotateX(${tiltDeg}deg)`,
            transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow:
              viewMode === '3d'
                ? '0 28px 42px -16px rgba(0, 0, 0, 0.62), 0 12px 20px -10px rgba(0, 0, 0, 0.45)'
                : '0 8px 20px -12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* 3D Box Extruded Front & Side Walls */}
          {viewMode === '3d' && (
            <>
              <div
                aria-hidden="true"
                className={`absolute left-1 right-1 -bottom-[16px] h-[16px] rounded-b-xl border-b border-amber-400/35 ${slab.frontWall}`}
                style={{
                  transformOrigin: 'top center',
                  transform: 'rotateX(-82deg)',
                }}
              />
              <div
                aria-hidden="true"
                className="absolute -left-[8px] top-2 bottom-2 w-[8px] rounded-l-lg bg-black/35"
                style={{
                  transformOrigin: 'right center',
                  transform: 'rotateY(-75deg)',
                }}
              />
              <div
                aria-hidden="true"
                className="absolute -right-[8px] top-2 bottom-2 w-[8px] rounded-r-lg bg-black/35"
                style={{
                  transformOrigin: 'left center',
                  transform: 'rotateY(75deg)',
                }}
              />
            </>
          )}

          {/* Rotatable Ludo King Playfield */}
          <div
            className={`relative w-full h-full rounded-xl overflow-visible preserve-3d shadow-[inset_0_2px_8px_rgba(0,0,0,0.28)] ${slab.playfield}`}
            style={{
              transform: `rotateZ(${boardRotation}deg)`,
              transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {armCount === 4 ? (
              <>
                <div
                  className="grid w-full h-full rounded-xl overflow-hidden border border-black/25"
                  style={{
                    gridTemplateColumns: 'repeat(15, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(15, minmax(0, 1fr))',
                  }}
                >
                  {Array.from({ length: 225 }).map((_, cellIdx) =>
                    renderTrackCell4(Math.floor(cellIdx / 15), cellIdx % 15)
                  )}
                </div>

                {/* 4 Ludo King Corner Yards */}
                {YARD_DEFS_4.map(({ color, posStyle }) => {
                  const cStyle = COLOR_STYLES[color];
                  const player = players.find((p) => p.ludoColor === color);
                  const isTurn = player && player.slot === gameState.turnSlot;

                  return (
                    <div
                      key={color}
                      style={{ ...posStyle, width: '40%', height: '40%' }}
                      className={`absolute p-3 sm:p-4 border border-black/25 ${cStyle.yardBg} ${
                        color === 'red'
                          ? 'rounded-tl-xl'
                          : color === 'green'
                            ? 'rounded-tr-xl'
                            : color === 'yellow'
                              ? 'rounded-br-xl'
                              : 'rounded-bl-xl'
                      } ${isTurn ? `ring-3 ring-inset ${cStyle.yardRing}` : ''} ${
                        !player ? 'opacity-75' : ''
                      }`}
                    >
                      <div
                        className={`relative w-full h-full rounded-2xl shadow-[inset_0_2px_6px_rgba(0,0,0,0.18)] border border-black/15 ${slab.yardPad}`}
                      >
                        {YARD_SOCKET_PCT_4.map((sock, sIdx) => (
                          <span
                            key={sIdx}
                            style={{
                              top: sock.top,
                              left: sock.left,
                              transform: 'translate(-50%, -50%)',
                              width: '26%',
                              height: '26%',
                            }}
                            className={`absolute rounded-full border-2 shadow-inner ${cStyle.socketBg}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                {/* Center 3x3 4-Triangle Ludo King Home Crown */}
                <div
                  className="absolute border border-black/25 overflow-hidden shadow-inner"
                  style={{ left: '40%', top: '40%', width: '20%', height: '20%' }}
                >
                  <svg viewBox="0 0 100 100" className="w-full h-full block" aria-hidden="true">
                    <polygon points="0,0 50,50 0,100" fill={COLOR_STYLES.red.triangleHex} />
                    <polygon points="0,0 100,0 50,50" fill={COLOR_STYLES.green.triangleHex} />
                    <polygon points="100,0 100,100 50,50" fill={COLOR_STYLES.yellow.triangleHex} />
                    <polygon points="0,100 50,50 100,100" fill={COLOR_STYLES.blue.triangleHex} />
                    <line x1="0" y1="0" x2="100" y2="100" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2" />
                    <line x1="100" y1="0" x2="0" y2="100" stroke="#ffffff" strokeOpacity="0.55" strokeWidth="2" />
                  </svg>
                  <div
                    style={{ transform: `translate(-50%, -50%) rotateZ(${-boardRotation}deg)` }}
                    className="pointer-events-none absolute left-1/2 top-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white border-2 border-amber-400 shadow-md flex items-center justify-center"
                  >
                    <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
                  </div>
                </div>
              </>
            ) : (
              /* 6-Arm Hexagonal Ludo Board (5 to 6 Players) */
              <div className="relative w-full h-full rounded-xl overflow-hidden border border-black/20">
                {HEX_BOARD_TILES.map((tile) => {
                  const cStyle = tile.color ? COLOR_STYLES[tile.color] : null;
                  const bgClass =
                    tile.kind === 'start' || tile.kind === 'home'
                      ? cStyle!.tileBg
                      : tile.kind === 'star'
                        ? slab.starTile
                        : slab.tile;

                  return (
                    <div
                      key={tile.key}
                      style={{
                        left: `${tile.x}%`,
                        top: `${tile.y}%`,
                        width: '4.1%',
                        height: '4.8%',
                        transform: `translate(-50%, -50%) rotate(${tile.deg}deg)`,
                      }}
                      className={`absolute rounded-[3px] border-[0.5px] flex items-center justify-center shadow-[inset_0_-1.5px_0_rgba(0,0,0,0.12)] ${bgClass}`}
                    >
                      {(tile.kind === 'start' || tile.kind === 'star') && (
                        <Star
                          className={`w-2 h-2 sm:w-2.5 sm:h-2.5 ${
                            tile.kind === 'start' ? 'fill-current' : slab.starIcon
                          }`}
                        />
                      )}
                      {tile.kind === 'entry' && cStyle && (
                        <ArrowDown className={`w-2.5 h-2.5 ${cStyle.arrowText}`} />
                      )}
                    </div>
                  );
                })}

                {COLORS_6.map((color) => {
                  const cStyle = COLOR_STYLES[color];
                  const [yx, yy] = HEX_YARD_CENTERS[color];
                  const player = players.find((p) => p.ludoColor === color);
                  const isTurn = player && player.slot === gameState.turnSlot;

                  return (
                    <div
                      key={`hex-yard-${color}`}
                      style={{
                        left: `${yx}%`,
                        top: `${yy}%`,
                        width: '17.4%',
                        height: '17.4%',
                        transform: 'translate(-50%, -50%)',
                      }}
                      className={`absolute rounded-2xl p-1.5 border border-black/25 shadow-md ${cStyle.yardBg} ${
                        isTurn ? `ring-3 ${cStyle.yardRing}` : ''
                      } ${!player ? 'opacity-45' : ''}`}
                    >
                      <div className={`relative w-full h-full rounded-xl ${slab.yardPad}`}>
                        {[
                          ['32%', '32%'],
                          ['68%', '32%'],
                          ['32%', '68%'],
                          ['68%', '68%'],
                        ].map(([sx, sy], idx) => (
                          <span
                            key={idx}
                            style={{
                              left: sx,
                              top: sy,
                              width: '28%',
                              height: '28%',
                              transform: 'translate(-50%, -50%)',
                            }}
                            className={`absolute rounded-full border-2 shadow-inner ${cStyle.socketBg}`}
                          />
                        ))}
                      </div>
                    </div>
                  );
                })}

                <div
                  style={{
                    left: '50%',
                    top: '50%',
                    width: '21%',
                    height: '21%',
                    transform: 'translate(-50%, -50%)',
                  }}
                  className="pointer-events-none absolute"
                >
                  <svg viewBox="0 0 100 100" className="w-full h-full block drop-shadow-sm" aria-hidden="true">
                    {COLORS_6.map((color, s) => {
                      const a1 = ((s * 60 - 120) * Math.PI) / 180;
                      const a2 = ((s * 60 - 60) * Math.PI) / 180;
                      const r = 49;
                      const x1 = (50 + r * Math.cos(a1)).toFixed(1);
                      const y1 = (50 + r * Math.sin(a1)).toFixed(1);
                      const x2 = (50 + r * Math.cos(a2)).toFixed(1);
                      const y2 = (50 + r * Math.sin(a2)).toFixed(1);
                      return (
                        <polygon
                          key={color}
                          points={`50,50 ${x1},${y1} ${x2},${y2}`}
                          fill={COLOR_STYLES[color].triangleHex}
                          stroke="#ffffff"
                          strokeOpacity="0.55"
                          strokeWidth="1.4"
                        />
                      );
                    })}
                  </svg>
                  <div
                    style={{ transform: `translate(-50%, -50%) rotateZ(${-boardRotation}deg)` }}
                    className="absolute left-1/2 top-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white border-2 border-amber-400 shadow-md flex items-center justify-center"
                  >
                    <Crown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-amber-500" />
                  </div>
                </div>
              </div>
            )}

            {/* Destination Landing Preview Indicator */}
            {previewPct && (
              <div
                aria-hidden="true"
                style={{
                  left: `${previewPct[0]}%`,
                  top: `${previewPct[1]}%`,
                  width: `${pawnWidthPct}%`,
                  height: `${pawnWidthPct}%`,
                  transform: 'translate(-50%, -50%) translateZ(2px)',
                }}
                className="pointer-events-none absolute z-10 rounded-full border-2 border-dashed border-amber-500 bg-amber-400/30 shadow-[0_0_12px_rgba(245,158,11,0.65)]"
              />
            )}

            {/* 3D Standing Pawns Layer */}
            {allTokens.map((t) => {
              const key = `${t.leftPct.toFixed(1)},${t.topPct.toFixed(1)}`;
              const group = stackGroups.get(key) || [t];
              const stackPos = group.findIndex(
                (g) => g.slot === t.slot && g.tokenIdx === t.tokenIdx
              );
              const isStacked = group.length > 1;
              const offsetX = isStacked ? ((stackPos % 2) - 0.5) * 1.4 : 0;
              const offsetY = isStacked ? (Math.floor(stackPos / 2) - 0.5) * 1.4 : 0;
              const cStyle = COLOR_STYLES[t.color];
              const leftPct = t.leftPct + offsetX;
              const topPct = t.topPct + offsetY;
              const elevationPx = viewMode === '3d' ? (t.movable ? 16 : 9) : 0;

              return (
                <div
                  key={`${t.slot}-${t.tokenIdx}`}
                  className="absolute inset-0 pointer-events-none preserve-3d"
                >
                  {t.movable && (
                    <span
                      aria-hidden="true"
                      style={{
                        left: `${leftPct}%`,
                        top: `${topPct}%`,
                        width: `${isStacked ? pawnWidthPct * 0.85 : pawnWidthPct}%`,
                        height: `${isStacked ? pawnWidthPct * 0.85 : pawnWidthPct}%`,
                      }}
                      className="pointer-events-none ludo-target-ring absolute z-10 rounded-full border-2 border-white dark:border-amber-300 bg-amber-400/30"
                    />
                  )}

                  <button
                    type="button"
                    disabled={!t.movable}
                    onMouseEnter={() => t.movable && setHoveredTokenIdx(t.tokenIdx)}
                    onMouseLeave={() => hoveredTokenIdx === t.tokenIdx && setHoveredTokenIdx(null)}
                    onFocus={() => t.movable && setHoveredTokenIdx(t.tokenIdx)}
                    onBlur={() => hoveredTokenIdx === t.tokenIdx && setHoveredTokenIdx(null)}
                    onClick={() => {
                      if (t.movable) {
                        soundFx.move();
                        onMoveToken(t.tokenIdx);
                      }
                    }}
                    aria-label={`${cStyle.label} token ${t.tokenIdx + 1}${
                      t.movable ? ' (movable)' : ''
                    }`}
                    style={{
                      left: `${leftPct}%`,
                      top: `${topPct}%`,
                      width: `${isStacked ? pawnWidthPct * 0.84 : pawnWidthPct}%`,
                      height: `${isStacked ? pawnHeightPct * 0.84 : pawnHeightPct}%`,
                      transform: `translate(-50%, -62%) translateZ(${elevationPx}px) rotateZ(${-boardRotation}deg) rotateX(${-tiltDeg}deg)`,
                      transition: 'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), left 240ms ease, top 240ms ease',
                    }}
                    className={`pointer-events-auto absolute flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-full ${
                      t.movable ? 'z-30 cursor-pointer' : 'z-20 cursor-default'
                    }`}
                  >
                    <PawnPiece3D
                      color={t.color}
                      number={t.tokenIdx + 1}
                      movable={t.movable}
                      compact={isStacked}
                      isHovered={hoveredTokenIdx === t.tokenIdx}
                    />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ludo King Bottom Corner Player Docks (Each With Separate 3D Dice) */}
      <div
        className={`grid gap-2.5 max-w-[560px] mx-auto ${
          armCount === 4 ? 'grid-cols-2' : 'grid-cols-1 sm:grid-cols-3'
        }`}
      >
        {bottomRowPlayers.map((entry) => renderPlayerDiceDock(entry.player, entry.align))}
      </div>

      {/* Bottom Action & Status Strip */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1B2E54] bg-slate-50 dark:bg-[#081329] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {gameState.lastActionText}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isMyTurn && gameState.phase === 'roll'
              ? 'Tap your 3D dice or press Space to roll'
              : isMyTurn && gameState.phase === 'move'
                ? 'Tap a glowing pawn or choose Move #1–#4'
                : `Consecutive sixes: ${gameState.consecutiveSixes}/3`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {isMyTurn && gameState.phase === 'roll' && (
            <button
              type="button"
              onClick={() => {
                soundFx.capture();
                onRollDice();
              }}
              className="px-5 py-2.5 text-sm font-semibold rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 transition-colors min-h-[44px] inline-flex items-center gap-2 cursor-pointer shadow-xs"
            >
              <Dices className="w-4 h-4" />
              Roll Dice
            </button>
          )}

          {isMyTurn && gameState.phase === 'move' && myPlayer && (
            <div className="flex flex-wrap items-center gap-2">
              {gameState.movableTokenIndices.map((idx) => {
                const cStyle = COLOR_STYLES[myPlayer.ludoColor];
                return (
                  <button
                    key={idx}
                    type="button"
                    onMouseEnter={() => setHoveredTokenIdx(idx)}
                    onMouseLeave={() => hoveredTokenIdx === idx && setHoveredTokenIdx(null)}
                    onFocus={() => setHoveredTokenIdx(idx)}
                    onBlur={() => hoveredTokenIdx === idx && setHoveredTokenIdx(null)}
                    onClick={() => {
                      soundFx.move();
                      onMoveToken(idx);
                    }}
                    className={`px-4 py-2 text-xs font-semibold rounded-lg transition-colors min-h-[44px] cursor-pointer shadow-xs ${cStyle.chipBtn}`}
                  >
                    Move #{idx + 1}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
