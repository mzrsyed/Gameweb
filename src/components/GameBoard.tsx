import { useEffect, useMemo, useState } from 'react';
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

// --- 4-Arm Classic 15x15 Constants ---
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

// Precompute exact 6-Arm geometry once
(() => {
  for (let s = 0; s < 6; s++) {
    const next = (s + 1) % 6;
    const sColor = COLORS_6[s];
    const nextColor = COLORS_6[next];

    // 5 inward tiles on arm s right lane (+HEX_LANE_W)
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

    // 6 outward tiles on arm next left lane (-HEX_LANE_W)
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

    // Tip middle (Home Entry) & Tip right
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

    // 5 Home Stretch tiles for sector s
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

    // Goal spot inside center hexagon
    HEX_GOAL_PCT[sColor] = armLocalToPct(s, 0, 6.0);

    // Circular Home Yard at bisector s*60 - 90 + 30
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

const COLOR_STYLES: Record<
  LudoColor,
  {
    label: string;
    dot: string;
    tileBg: string;
    yardBg: string;
    yardRing: string;
    boxActive: string;
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
    dot: 'bg-rose-600 border-rose-800',
    tileBg: 'bg-rose-600/90 text-white',
    yardBg: 'bg-gradient-to-br from-rose-500 to-rose-700',
    yardRing: 'ring-rose-400',
    boxActive: 'border-rose-500 bg-rose-500/10 ring-2 ring-rose-500/40',
    pawnBody: '#e11d48',
    pawnTop: '#fb7185',
    pawnBase: '#9f1239',
    pawnText: '#ffffff',
    chipBtn: 'bg-rose-600 hover:bg-rose-700 text-white',
    socketBg: 'bg-rose-100 dark:bg-rose-950/75 border-rose-300 dark:border-rose-700/70',
    triangleHex: '#e11d48',
    arrowText: 'text-rose-500',
  },
  green: {
    label: 'Green',
    dot: 'bg-emerald-600 border-emerald-800',
    tileBg: 'bg-emerald-600/90 text-white',
    yardBg: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
    yardRing: 'ring-emerald-400',
    boxActive: 'border-emerald-500 bg-emerald-500/10 ring-2 ring-emerald-500/40',
    pawnBody: '#059669',
    pawnTop: '#34d399',
    pawnBase: '#065f46',
    pawnText: '#ffffff',
    chipBtn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    socketBg: 'bg-emerald-100 dark:bg-emerald-950/75 border-emerald-300 dark:border-emerald-700/70',
    triangleHex: '#059669',
    arrowText: 'text-emerald-500',
  },
  yellow: {
    label: 'Yellow',
    dot: 'bg-amber-400 border-amber-600',
    tileBg: 'bg-amber-400 text-slate-950',
    yardBg: 'bg-gradient-to-br from-amber-300 to-amber-500',
    yardRing: 'ring-amber-300',
    boxActive: 'border-amber-400 bg-amber-400/15 ring-2 ring-amber-400/50',
    pawnBody: '#f59e0b',
    pawnTop: '#fde047',
    pawnBase: '#b45309',
    pawnText: '#0f172a',
    chipBtn: 'bg-amber-400 hover:bg-amber-500 text-slate-950',
    socketBg: 'bg-amber-100 dark:bg-amber-950/75 border-amber-300 dark:border-amber-700/70',
    triangleHex: '#f59e0b',
    arrowText: 'text-amber-500',
  },
  blue: {
    label: 'Blue',
    dot: 'bg-blue-600 border-blue-800',
    tileBg: 'bg-blue-600/90 text-white',
    yardBg: 'bg-gradient-to-br from-blue-500 to-blue-700',
    yardRing: 'ring-blue-400',
    boxActive: 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/40',
    pawnBody: '#2563eb',
    pawnTop: '#60a5fa',
    pawnBase: '#1e40af',
    pawnText: '#ffffff',
    chipBtn: 'bg-blue-600 hover:bg-blue-700 text-white',
    socketBg: 'bg-blue-100 dark:bg-blue-950/75 border-blue-300 dark:border-blue-700/70',
    triangleHex: '#2563eb',
    arrowText: 'text-blue-500',
  },
  purple: {
    label: 'Purple',
    dot: 'bg-violet-600 border-violet-800',
    tileBg: 'bg-violet-600/90 text-white',
    yardBg: 'bg-gradient-to-br from-violet-500 to-violet-700',
    yardRing: 'ring-violet-400',
    boxActive: 'border-violet-500 bg-violet-500/10 ring-2 ring-violet-500/40',
    pawnBody: '#7c3aed',
    pawnTop: '#a78bfa',
    pawnBase: '#5b21b6',
    pawnText: '#ffffff',
    chipBtn: 'bg-violet-600 hover:bg-violet-700 text-white',
    socketBg: 'bg-violet-100 dark:bg-violet-950/75 border-violet-300 dark:border-violet-700/70',
    triangleHex: '#7c3aed',
    arrowText: 'text-violet-500',
  },
  cyan: {
    label: 'Cyan',
    dot: 'bg-cyan-500 border-cyan-700',
    tileBg: 'bg-cyan-500 text-slate-950',
    yardBg: 'bg-gradient-to-br from-cyan-400 to-teal-600',
    yardRing: 'ring-cyan-300',
    boxActive: 'border-cyan-400 bg-cyan-400/15 ring-2 ring-cyan-400/45',
    pawnBody: '#06b6d4',
    pawnTop: '#67e8f9',
    pawnBase: '#0e7490',
    pawnText: '#0f172a',
    chipBtn: 'bg-cyan-500 hover:bg-cyan-600 text-slate-950',
    socketBg: 'bg-cyan-100 dark:bg-cyan-950/75 border-cyan-300 dark:border-cyan-700/70',
    triangleHex: '#06b6d4',
    arrowText: 'text-cyan-500',
  },
};

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
    frame: 'bg-gradient-to-b from-[#132952] to-[#0B1834] border-amber-400/60',
    frontWall: 'bg-gradient-to-b from-[#1A3568] to-[#060E20]',
    playfield: 'bg-slate-200 dark:bg-[#0B152A]',
    tile: 'bg-white dark:bg-[#142240] border-slate-300 dark:border-slate-700/80',
    starTile: 'bg-amber-50 dark:bg-[#1C2E52] border-amber-300 dark:border-amber-500/40',
    yardPad: 'bg-white/95 dark:bg-[#0D1830]/95',
    starIcon: 'text-amber-500 dark:text-amber-400',
  },
  'Alpine Bastion': {
    frame: 'bg-gradient-to-b from-sky-200 to-sky-300 dark:from-slate-800 dark:to-slate-900 border-sky-400 dark:border-slate-600',
    frontWall: 'bg-gradient-to-b from-sky-400 to-sky-600 dark:from-slate-700 dark:to-slate-950',
    playfield: 'bg-sky-50 dark:bg-[#111B2E]',
    tile: 'bg-white dark:bg-[#182338] border-sky-200 dark:border-slate-700/80',
    starTile: 'bg-sky-100 dark:bg-[#22304A] border-sky-300 dark:border-slate-600',
    yardPad: 'bg-white/95 dark:bg-[#11192A]/95',
    starIcon: 'text-sky-600 dark:text-sky-300',
  },
  'Solaris Circuit': {
    frame: 'bg-gradient-to-b from-amber-800 to-amber-950 dark:from-[#3A2416] dark:to-[#22150C] border-amber-500/70',
    frontWall: 'bg-gradient-to-b from-amber-900 to-stone-950',
    playfield: 'bg-stone-200 dark:bg-[#1A130D]',
    tile: 'bg-amber-50/95 dark:bg-[#241B14] border-stone-300 dark:border-stone-800',
    starTile: 'bg-amber-100 dark:bg-[#33261B] border-amber-400/70 dark:border-amber-700/70',
    yardPad: 'bg-amber-50/95 dark:bg-[#19130F]/95',
    starIcon: 'text-amber-600 dark:text-amber-400',
  },
};

// Returns [leftPct, topPct] in 0..100 coordinates for BOTH 4-Arm and 6-Arm boards
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

  // 6-Arm Hexagonal coordinates
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
        className={`w-full h-full drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)] ${
          compact ? 'scale-90' : ''
        }`}
        aria-hidden="true"
      >
        <defs>
          <radialGradient id={`crown-${color}-${number}`} cx="35%" cy="30%" r="70%">
            <stop offset="0%" stopColor="#ffffff" stopOpacity="0.58" />
            <stop offset="45%" stopColor={cStyle.pawnTop} />
            <stop offset="100%" stopColor={cStyle.pawnBody} />
          </radialGradient>
        </defs>
        <ellipse cx="20" cy="41" rx="14" ry="5" fill={cStyle.pawnBase} />
        <ellipse cx="20" cy="39" rx="13.5" ry="4.5" fill={cStyle.pawnBody} />
        <path
          d="M10 38 C12 28, 15 22, 16 17 L24 17 C25 22, 28 28, 30 38 Z"
          fill={cStyle.pawnBody}
          stroke={cStyle.pawnBase}
          strokeWidth="1.2"
        />
        <path
          d="M15 36 C16 28, 17 22, 18 18"
          stroke="#ffffff"
          strokeOpacity="0.38"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
        />
        <ellipse cx="20" cy="17.5" rx="6.5" ry="2.2" fill={cStyle.pawnTop} />
        <circle
          cx="20"
          cy="11.5"
          r="9"
          fill={`url(#crown-${color}-${number})`}
          stroke={cStyle.pawnBase}
          strokeWidth="1.2"
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
  const tiltDeg = viewMode === '3d' ? 22 : 0;
  const safeCount = armCount === 4 ? SAFE_GLOBAL_4.size : SAFE_GLOBAL_6.size;

  const previewPct = useMemo<[number, number] | null>(() => {
    if (!isMyTurn || gameState.phase !== 'move' || hoveredTokenIdx === null || !myPlayer) {
      return null;
    }
    if (!gameState.movableTokenIndices.includes(hoveredTokenIdx)) return null;
    const myState = gameState.players.find((p) => p.slot === myPlayer.slot);
    if (!myState) return null;
    const destProg = getDestinationProgress(armCount, myState.tokens[hoveredTokenIdx], gameState.diceValue);
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

  const renderTrackCell4 = (r: number, c: number) => {
    const inCorner =
      (r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c > 8) || (r > 8 && c < 6);
    const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;
    if (inCorner || inCenter) {
      return <div key={`${r}-${c}`} className="pointer-events-none" />;
    }

    if (r === 7 && c >= 1 && c <= 5) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] border-black/15 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${COLOR_STYLES.red.tileBg}`}>
          {c === 5 && <ArrowRight className="w-2.5 h-2.5 opacity-85" />}
        </div>
      );
    }
    if (c === 7 && r >= 1 && r <= 5) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] border-black/15 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${COLOR_STYLES.green.tileBg}`}>
          {r === 5 && <ArrowDown className="w-2.5 h-2.5 opacity-85" />}
        </div>
      );
    }
    if (r === 7 && c >= 9 && c <= 13) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] border-black/15 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${COLOR_STYLES.yellow.tileBg}`}>
          {c === 9 && <ArrowLeft className="w-2.5 h-2.5 opacity-85" />}
        </div>
      );
    }
    if (c === 7 && r >= 9 && r <= 13) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] border-black/15 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${COLOR_STYLES.blue.tileBg}`}>
          {r === 9 && <ArrowUp className="w-2.5 h-2.5 opacity-85" />}
        </div>
      );
    }

    const trackIdx = coordToTrackIdx4.get(`${r},${c}`);
    if (trackIdx === 0) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] border-black/15 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${COLOR_STYLES.red.tileBg}`}>
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
        </div>
      );
    }
    if (trackIdx === 13) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] border-black/15 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${COLOR_STYLES.green.tileBg}`}>
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
        </div>
      );
    }
    if (trackIdx === 26) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] border-black/15 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${COLOR_STYLES.yellow.tileBg}`}>
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
        </div>
      );
    }
    if (trackIdx === 39) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] border-black/15 flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.12)] ${COLOR_STYLES.blue.tileBg}`}>
          <Star className="w-2.5 h-2.5 sm:w-3 sm:h-3 fill-current" />
        </div>
      );
    }

    if (r === 7 && c === 0) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] flex items-center justify-center ${slab.tile}`}>
          <ArrowRight className="w-3 h-3 text-rose-500" />
        </div>
      );
    }
    if (r === 0 && c === 7) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] flex items-center justify-center ${slab.tile}`}>
          <ArrowDown className="w-3 h-3 text-emerald-500" />
        </div>
      );
    }
    if (r === 7 && c === 14) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] flex items-center justify-center ${slab.tile}`}>
          <ArrowLeft className="w-3 h-3 text-amber-500" />
        </div>
      );
    }
    if (r === 14 && c === 7) {
      return (
        <div key={`${r}-${c}`} className={`border-[0.5px] flex items-center justify-center ${slab.tile}`}>
          <ArrowUp className="w-3 h-3 text-blue-500" />
        </div>
      );
    }

    const isStar = trackIdx !== undefined && STAR_GLOBAL_4.has(trackIdx);
    return (
      <div
        key={`${r}-${c}`}
        className={`border-[0.5px] flex items-center justify-center shadow-[inset_0_-2px_0_rgba(0,0,0,0.06)] ${
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
    <div className="space-y-4">
      {/* Top Toolbar: Camera & Rules */}
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

      {/* Turn-Wise Player Boxes with Animated 3D Dice Appearing on Active Player */}
      <div
        className={`grid gap-2.5 ${
          players.length <= 2
            ? 'grid-cols-2'
            : players.length <= 4
              ? 'grid-cols-2 sm:grid-cols-4'
              : 'grid-cols-2 sm:grid-cols-3'
        }`}
      >
        {players.map((p) => {
          const pState = gameState.players.find((gs) => gs.slot === p.slot);
          const isActiveTurn = p.slot === gameState.turnSlot;
          const cStyle = COLOR_STYLES[p.ludoColor];
          const finished = pState?.finishedCount ?? 0;

          return (
            <div
              key={p.uid}
              className={`rounded-xl border p-2.5 flex items-center justify-between gap-2.5 transition-all duration-200 min-h-[78px] ${
                isActiveTurn
                  ? cStyle.boxActive
                  : 'border-slate-200 dark:border-[#1B2E54] bg-slate-50/70 dark:bg-[#09152B]/80 opacity-80'
              }`}
            >
              <div className="min-w-0 flex-1 space-y-1">
                <div className="flex items-center gap-1.5">
                  <span className={`w-2.5 h-2.5 rounded-full border shrink-0 ${cStyle.dot}`} />
                  <span className="text-xs font-bold text-slate-900 dark:text-white truncate">
                    {p.username}
                  </span>
                </div>

                {/* 4 Pawn Progress Dots */}
                <div className="flex items-center gap-1">
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

                <p className="text-[11px] font-medium text-slate-600 dark:text-slate-300 truncate">
                  {isActiveTurn
                    ? p.uid === myUid
                      ? gameState.phase === 'roll'
                        ? 'Tap dice to roll'
                        : 'Select a pawn'
                      : gameState.phase === 'roll'
                        ? 'Rolling dice...'
                        : 'Moving pawn...'
                    : 'Waiting'}
                </p>
              </div>

              {/* Animated 3D Dice Appears Turn-Wise Inside Active Player's Box */}
              {isActiveTurn && (
                <LudoDice3D
                  size="sm"
                  value={gameState.diceValue}
                  canRoll={isMyTurn && gameState.phase === 'roll'}
                  mapTheme={mapTheme}
                  actionNonce={`${gameState.turnSlot}-${gameState.phase}-${gameState.diceValue}-${gameState.lastActionText}`}
                  onRoll={() => {
                    soundFx.capture();
                    onRollDice();
                  }}
                />
              )}
            </div>
          );
        })}
      </div>

      {/* 3D Box Ludo Tabletop Stage */}
      <div
        className={`relative w-full flex justify-center select-none ${
          viewMode === '3d' ? 'py-4 sm:py-7' : 'py-1'
        }`}
        style={{ perspective: '1250px' }}
      >
        {/* 3D Tournament Box Slab */}
        <div
          className={`relative aspect-square w-full max-w-[530px] rounded-2xl border-2 p-2.5 sm:p-3.5 preserve-3d ${slab.frame}`}
          style={{
            transform: `rotateX(${tiltDeg}deg)`,
            transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
            boxShadow:
              viewMode === '3d'
                ? '0 30px 44px -16px rgba(0, 0, 0, 0.62), 0 12px 20px -10px rgba(0, 0, 0, 0.45)'
                : '0 8px 20px -12px rgba(0, 0, 0, 0.3)',
          }}
        >
          {/* 3D Box Extruded Front & Side Walls */}
          {viewMode === '3d' && (
            <>
              <div
                aria-hidden="true"
                className={`absolute left-1 right-1 -bottom-[18px] h-[18px] rounded-b-xl border-b border-amber-400/30 ${slab.frontWall}`}
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

          {/* Rotatable Playfield Bed */}
          <div
            className={`relative w-full h-full rounded-xl overflow-visible preserve-3d shadow-[inset_0_3px_10px_rgba(0,0,0,0.35)] ${slab.playfield}`}
            style={{
              transform: `rotateZ(${boardRotation}deg)`,
              transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
            }}
          >
            {armCount === 4 ? (
              <>
                {/* 15x15 Classic 4-Arm Track Grid */}
                <div
                  className="grid w-full h-full rounded-xl overflow-hidden border border-black/20"
                  style={{
                    gridTemplateColumns: 'repeat(15, minmax(0, 1fr))',
                    gridTemplateRows: 'repeat(15, minmax(0, 1fr))',
                  }}
                >
                  {Array.from({ length: 225 }).map((_, cellIdx) =>
                    renderTrackCell4(Math.floor(cellIdx / 15), cellIdx % 15)
                  )}
                </div>

                {/* 4 Sculpted Corner Yards */}
                {YARD_DEFS_4.map(({ color, posStyle }) => {
                  const cStyle = COLOR_STYLES[color];
                  const player = players.find((p) => p.ludoColor === color);
                  const isTurn = player && player.slot === gameState.turnSlot;

                  return (
                    <div
                      key={color}
                      style={{ ...posStyle, width: '40%', height: '40%' }}
                      className={`absolute p-2.5 sm:p-3.5 border border-black/25 ${cStyle.yardBg} ${
                        color === 'red'
                          ? 'rounded-tl-xl'
                          : color === 'green'
                            ? 'rounded-tr-xl'
                            : color === 'yellow'
                              ? 'rounded-br-xl'
                              : 'rounded-bl-xl'
                      } ${isTurn ? `ring-2 ring-inset ${cStyle.yardRing}` : ''}`}
                    >
                      <div
                        className={`relative w-full h-full rounded-xl shadow-[inset_0_2px_6px_rgba(0,0,0,0.2)] border border-black/10 ${slab.yardPad}`}
                      >
                        {YARD_SOCKET_PCT_4.map((sock, sIdx) => (
                          <span
                            key={sIdx}
                            style={{
                              top: sock.top,
                              left: sock.left,
                              transform: 'translate(-50%, -50%)',
                              width: '25%',
                              height: '25%',
                            }}
                            className={`absolute rounded-full border-2 shadow-inner ${cStyle.socketBg}`}
                          />
                        ))}
                        {player && (
                          <div
                            style={{ transform: `rotateZ(${-boardRotation}deg)` }}
                            className="absolute bottom-1 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-900/85 text-white text-[9px] sm:text-[10px] font-semibold truncate max-w-[85%] pointer-events-none"
                          >
                            {player.username}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Center 3x3 4-Triangle Home Goal */}
                <div
                  className="absolute border border-black/25 overflow-hidden shadow-inner"
                  style={{ left: '40%', top: '40%', width: '20%', height: '20%' }}
                >
                  <svg viewBox="0 0 100 100" className="w-full h-full block" aria-hidden="true">
                    <polygon points="0,0 50,50 0,100" fill={COLOR_STYLES.red.triangleHex} />
                    <polygon points="0,0 100,0 50,50" fill={COLOR_STYLES.green.triangleHex} />
                    <polygon points="100,0 100,100 50,50" fill={COLOR_STYLES.yellow.triangleHex} />
                    <polygon points="0,100 50,50 100,100" fill={COLOR_STYLES.blue.triangleHex} />
                    <line x1="0" y1="0" x2="100" y2="100" stroke="#0f172a" strokeOpacity="0.28" strokeWidth="2" />
                    <line x1="100" y1="0" x2="0" y2="100" stroke="#0f172a" strokeOpacity="0.28" strokeWidth="2" />
                  </svg>
                  <div
                    style={{ transform: `translate(-50%, -50%) rotateZ(${-boardRotation}deg)` }}
                    className="pointer-events-none absolute left-1/2 top-1/2 w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-white/95 dark:bg-slate-900/95 border border-amber-400 shadow-md flex items-center justify-center"
                  >
                    <Crown className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-500" />
                  </div>
                </div>
              </>
            ) : (
              /* 6-Arm Hexagonal Ludo Board (5 to 6 Players) */
              <div className="relative w-full h-full rounded-xl overflow-hidden border border-black/20">
                {/* Hex Track & Home Stretch Tiles */}
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

                {/* 6 Circular Home Yards */}
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
                        isTurn ? `ring-2 ${cStyle.yardRing}` : ''
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
                            className={`absolute rounded-full border shadow-inner ${cStyle.socketBg}`}
                          />
                        ))}
                        {player && (
                          <div
                            style={{ transform: `rotateZ(${-boardRotation}deg)` }}
                            className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 px-1.5 py-0.5 rounded bg-slate-900/90 text-white text-[8px] sm:text-[9px] font-semibold truncate max-w-[95%] pointer-events-none"
                          >
                            {player.username}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* Central 6-Triangle Hexagon Home Goal */}
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
                          stroke="#0f172a"
                          strokeOpacity="0.3"
                          strokeWidth="1.4"
                        />
                      );
                    })}
                  </svg>
                  <div
                    style={{ transform: `translate(-50%, -50%) rotateZ(${-boardRotation}deg)` }}
                    className="absolute left-1/2 top-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white/95 dark:bg-slate-900/95 border border-amber-400 shadow-md flex items-center justify-center"
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
                className="pointer-events-none absolute z-10 rounded-full border-2 border-dashed border-amber-400 bg-amber-400/25 shadow-[0_0_12px_rgba(245,158,11,0.65)]"
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
                      className="pointer-events-none ludo-target-ring absolute z-10 rounded-full border-2 border-white dark:border-amber-300 bg-amber-400/25"
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

      {/* Bottom Action & Status Strip */}
      <div className="rounded-xl border border-slate-200 dark:border-[#1B2E54] bg-slate-50 dark:bg-[#081329] px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">
            {gameState.lastActionText}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isMyTurn && gameState.phase === 'roll'
              ? 'Tap the 3D dice in your box or press Space to roll'
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
