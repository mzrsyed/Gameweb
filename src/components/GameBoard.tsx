import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  Bot,
  Box,
  Crown,
  Dices,
  HelpCircle,
  RotateCw,
  Square,
  Star,
  User,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { LobbyPlayer, LudoColor, LudoGameState, LudoSlot, MapTheme } from '../shared/types';
import { soundFx } from '../lib/sound';
import { LudoDice3D } from './LudoDice3D';

interface GameBoardProps {
  gameState: LudoGameState;
  mapTheme: MapTheme;
  players: LobbyPlayer[];
  myUid: string | null;
  isHost?: boolean;
  isLocalPassPlay?: boolean;
  turnTimeSec?: number;
  soundOn?: boolean;
  onToggleSound?: () => void;
  onRollDice: () => void;
  onMoveToken: (tokenIndex: number) => void;
}

// --- 4-Arm Classic Ludo King 15x15 Constants (Blue TL, Red TR, Green BR, Yellow BL) ---
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

const HOME_STRETCH_COORDS_4: Record<'blue' | 'red' | 'green' | 'yellow', [number, number][]> = {
  blue: [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5]],
  red: [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7]],
  green: [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7]],
};

const YARD_TOKEN_COORDS_4: Record<'blue' | 'red' | 'green' | 'yellow', [number, number][]> = {
  blue: [[1.5, 1.5], [1.5, 3.5], [3.5, 1.5], [3.5, 3.5]],
  red: [[1.5, 10.5], [1.5, 12.5], [3.5, 10.5], [3.5, 12.5]],
  green: [[10.5, 10.5], [10.5, 12.5], [12.5, 10.5], [12.5, 12.5]],
  yellow: [[10.5, 1.5], [10.5, 3.5], [12.5, 1.5], [12.5, 3.5]],
};

const GOAL_COORDS_4: Record<'blue' | 'red' | 'green' | 'yellow', [number, number]> = {
  blue: [7, 6.18],
  red: [6.18, 7],
  green: [7, 7.82],
  yellow: [7.82, 7],
};

// --- 6-Arm Hexagonal Ludo Constants (Normalized 0..100% Coordinates) ---
const COLORS_6: LudoColor[] = ['blue', 'red', 'green', 'yellow', 'purple', 'cyan'];
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
  blue: [],
  red: [],
  green: [],
  yellow: [],
  purple: [],
  cyan: [],
};
const HEX_YARD_CENTERS: Record<LudoColor, [number, number]> = {
  blue: [50, 50],
  red: [50, 50],
  green: [50, 50],
  yellow: [50, 50],
  purple: [50, 50],
  cyan: [50, 50],
};
const HEX_YARD_SOCKETS_PCT: Record<LudoColor, [number, number][]> = {
  blue: [],
  red: [],
  green: [],
  yellow: [],
  purple: [],
  cyan: [],
};
const HEX_GOAL_PCT: Record<LudoColor, [number, number]> = {
  blue: [50, 50],
  red: [50, 50],
  green: [50, 50],
  yellow: [50, 50],
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
  blue: 0,
  red: 13,
  green: 26,
  yellow: 39,
  purple: 52,
  cyan: 65,
};

const SAFE_GLOBAL_4 = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47]);
const STAR_GLOBAL_4 = new Set<number>([8, 21, 34, 47]);
const SAFE_GLOBAL_6 = new Set<number>([0, 8, 13, 21, 26, 34, 39, 47, 52, 60, 65, 73]);

// Maps current 4-arm boardRotation (0, 90, 180, 270) to which corner color sits at TL, TR, BL, BR
const CORNER_COLORS_BY_ROTATION_4: Record<
  number,
  { tl: LudoColor; tr: LudoColor; bl: LudoColor; br: LudoColor }
> = {
  0: { tl: 'blue', tr: 'red', bl: 'yellow', br: 'green' },
  90: { tl: 'yellow', tr: 'blue', bl: 'green', br: 'red' },
  180: { tl: 'green', tr: 'yellow', bl: 'red', br: 'blue' },
  270: { tl: 'red', tr: 'green', bl: 'blue', br: 'yellow' },
};

const COLOR_STYLES: Record<
  LudoColor,
  {
    label: string;
    dot: string;
    tileBg: string;
    yardBg: string;
    yardRing: string;
    pawnFill: string;
    pawnRing: string;
    pawnText: string;
    chipBtn: string;
    socketBg: string;
    triangleHex: string;
  }
> = {
  blue: {
    label: 'Blue',
    dot: 'bg-[#1D7AFC] border-blue-900',
    tileBg: 'bg-[#1777EC] text-white',
    yardBg: 'bg-[#1777EC]',
    yardRing: 'ring-amber-300',
    pawnFill: '#1777EC',
    pawnRing: '#0D4FA8',
    pawnText: '#1777EC',
    chipBtn: 'bg-[#1777EC] hover:bg-blue-700 text-white',
    socketBg: 'bg-[#1777EC] border-[#1360C4]',
    triangleHex: '#1777EC',
  },
  red: {
    label: 'Red',
    dot: 'bg-[#E51B24] border-rose-900',
    tileBg: 'bg-[#E31E24] text-white',
    yardBg: 'bg-[#E31E24]',
    yardRing: 'ring-amber-300',
    pawnFill: '#E31E24',
    pawnRing: '#9E1116',
    pawnText: '#E31E24',
    chipBtn: 'bg-[#E31E24] hover:bg-rose-700 text-white',
    socketBg: 'bg-[#E31E24] border-[#B9161B]',
    triangleHex: '#E31E24',
  },
  green: {
    label: 'Green',
    dot: 'bg-[#00A651] border-emerald-900',
    tileBg: 'bg-[#009E49] text-white',
    yardBg: 'bg-[#009E49]',
    yardRing: 'ring-amber-300',
    pawnFill: '#009E49',
    pawnRing: '#046B33',
    pawnText: '#009E49',
    chipBtn: 'bg-[#009E49] hover:bg-emerald-700 text-white',
    socketBg: 'bg-[#009E49] border-[#037D3B]',
    triangleHex: '#009E49',
  },
  yellow: {
    label: 'Yellow',
    dot: 'bg-[#FACC15] border-amber-700',
    tileBg: 'bg-[#F7D117] text-slate-950',
    yardBg: 'bg-[#F7D117]',
    yardRing: 'ring-white',
    pawnFill: '#F7D117',
    pawnRing: '#B38E00',
    pawnText: '#9E7800',
    chipBtn: 'bg-[#F7D117] hover:bg-amber-400 text-slate-950',
    socketBg: 'bg-[#F7D117] border-[#D9B107]',
    triangleHex: '#F7D117',
  },
  purple: {
    label: 'Purple',
    dot: 'bg-violet-600 border-violet-900',
    tileBg: 'bg-violet-600 text-white',
    yardBg: 'bg-violet-600',
    yardRing: 'ring-amber-300',
    pawnFill: '#7c3aed',
    pawnRing: '#4c1d95',
    pawnText: '#7c3aed',
    chipBtn: 'bg-violet-600 hover:bg-violet-700 text-white',
    socketBg: 'bg-violet-600 border-violet-800',
    triangleHex: '#7c3aed',
  },
  cyan: {
    label: 'Cyan',
    dot: 'bg-cyan-500 border-cyan-800',
    tileBg: 'bg-cyan-500 text-slate-950',
    yardBg: 'bg-cyan-500',
    yardRing: 'ring-amber-300',
    pawnFill: '#06b6d4',
    pawnRing: '#0e7490',
    pawnText: '#0e7490',
    chipBtn: 'bg-cyan-500 hover:bg-cyan-600 text-slate-950',
    socketBg: 'bg-cyan-500 border-cyan-700',
    triangleHex: '#06b6d4',
  },
};

function getTokenPctCoords(
  armCount: 4 | 6,
  color: LudoColor,
  tokenIdx: number,
  progress: number
): [number, number] {
  if (armCount === 4) {
    const c4 = color as 'blue' | 'red' | 'green' | 'yellow';
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

// Authentic Ludo King Teardrop Map-Pin Pawn
function PawnPiecePin({
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
        movable ? (isHovered ? 'scale-125' : 'scale-112') : ''
      }`}
    >
      <svg
        viewBox="0 0 40 48"
        className={`w-full h-full drop-shadow-[0_3px_4px_rgba(0,0,0,0.5)] ${
          compact ? 'scale-90' : ''
        }`}
        aria-hidden="true"
      >
        <ellipse cx="20" cy="43.5" rx="9" ry="3.2" fill="rgba(0,0,0,0.3)" />
        <path
          d="M20 4 C11 4, 5.5 10.5, 5.5 18.5 C5.5 28, 20 43.5, 20 43.5 C20 43.5, 34.5 28, 34.5 18.5 C34.5 10.5, 29 4, 20 4 Z"
          fill="#FFFFFF"
          stroke="#1E293B"
          strokeWidth="1.6"
        />
        <circle
          cx="20"
          cy="18.2"
          r="9.4"
          fill={cStyle.pawnFill}
          stroke={cStyle.pawnRing}
          strokeWidth="1.3"
        />
        <circle cx="20" cy="18.2" r="4.1" fill="#FFFFFF" fillOpacity="0.92" />
      </svg>
      <span
        style={{ color: cStyle.pawnText }}
        className={`absolute top-[27.5%] font-mono font-black leading-none pointer-events-none select-none ${
          compact ? 'text-[7px] sm:text-[8px]' : 'text-[8px] sm:text-[9px]'
        }`}
      >
        {number}
      </span>
    </div>
  );
}

const YARD_DEFS_4: {
  color: 'blue' | 'red' | 'green' | 'yellow';
  posStyle: { top?: string; bottom?: string; left?: string; right?: string };
}[] = [
  { color: 'blue', posStyle: { top: '0%', left: '0%' } },
  { color: 'red', posStyle: { top: '0%', right: '0%' } },
  { color: 'green', posStyle: { bottom: '0%', right: '0%' } },
  { color: 'yellow', posStyle: { bottom: '0%', left: '0%' } },
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
  isHost = false,
  isLocalPassPlay = false,
  turnTimeSec = 15,
  soundOn = true,
  onToggleSound,
  onRollDice,
  onMoveToken,
}: GameBoardProps) {
  const armCount = gameState.armCount || (players.length > 4 ? 6 : 4);
  const activePlayer = players.find((p) => p.slot === gameState.turnSlot) || null;
  const canControlActiveTurn = Boolean(
    activePlayer &&
      !activePlayer.isCpu &&
      (activePlayer.uid === myUid || (isLocalPassPlay && isHost))
  );
  const controllableSlot = canControlActiveTurn ? gameState.turnSlot : null;

  const [viewMode, setViewMode] = useState<'3d' | 'top'>('top');
  const [boardRotation, setBoardRotation] = useState<number>(0);
  const [hoveredTokenIdx, setHoveredTokenIdx] = useState<number | null>(null);
  const [showRules, setShowRules] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(turnTimeSec);

  // Per-player independent dice state driven by authoritative server lastRoll
  const [diceBySlot, setDiceBySlot] = useState<
    Record<number, { value: number | null; rollSeq: number }>
  >({});
  const lastSeqRef = useRef<number>(0);

  useEffect(() => {
    if (!gameState.lastRoll) {
      if (lastSeqRef.current !== 0) {
        lastSeqRef.current = 0;
        setDiceBySlot({});
      }
      return;
    }
    if (gameState.lastRoll.seq !== lastSeqRef.current) {
      lastSeqRef.current = gameState.lastRoll.seq;
      const { slot, value, seq } = gameState.lastRoll;
      setDiceBySlot((prev) => ({
        ...prev,
        [slot]: { value, rollSeq: seq },
      }));
    }
  }, [gameState.lastRoll]);

  useEffect(() => {
    const update = () => {
      setSecondsLeft(Math.max(0, Math.ceil((gameState.turnDeadline - Date.now()) / 1000)));
    };
    update();
    const id = window.setInterval(update, 200);
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
      if (!canControlActiveTurn) return;

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
  }, [canControlActiveTurn, gameState.phase, gameState.movableTokenIndices, onRollDice, onMoveToken]);

  useEffect(() => {
    setHoveredTokenIdx(null);
  }, [gameState.phase, gameState.turnSlot, gameState.diceValue]);

  const coordToTrackIdx4 = useMemo(() => {
    const map = new Map<string, number>();
    OUTER_TRACK_COORDS_4.forEach(([r, c], idx) => map.set(`${r},${c}`, idx));
    return map;
  }, []);

  const tiltDeg = viewMode === '3d' ? 18 : 0;
  const safeCount = armCount === 4 ? SAFE_GLOBAL_4.size : SAFE_GLOBAL_6.size;

  const previewPct = useMemo<[number, number] | null>(() => {
    if (
      !canControlActiveTurn ||
      !activePlayer ||
      gameState.phase !== 'move' ||
      hoveredTokenIdx === null
    ) {
      return null;
    }
    if (!gameState.movableTokenIndices.includes(hoveredTokenIdx)) return null;
    const pState = gameState.players.find((p) => p.slot === activePlayer.slot);
    if (!pState) return null;
    const destProg = getDestinationProgress(
      armCount,
      pState.tokens[hoveredTokenIdx],
      gameState.diceValue
    );
    if (destProg === null) return null;
    return getTokenPctCoords(armCount, activePlayer.ludoColor, hoveredTokenIdx, destProg);
  }, [
    armCount,
    canControlActiveTurn,
    activePlayer,
    gameState.phase,
    gameState.movableTokenIndices,
    gameState.players,
    gameState.diceValue,
    hoveredTokenIdx,
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
          controllableSlot !== null &&
          pl.slot === controllableSlot &&
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
  }, [
    armCount,
    gameState.players,
    gameState.phase,
    gameState.movableTokenIndices,
    controllableSlot,
  ]);

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

  // Ludo King Royal Blue & Gold Player Dock with Avatar + Separate Dice Tray
  const renderLudoKingDock = (
    player: LobbyPlayer | undefined,
    side: 'left' | 'right',
    slotLabel: string
  ) => {
    if (!player) {
      return (
        <div
          aria-hidden="true"
          className="hidden md:flex rounded-xl border border-dashed border-white/15 bg-[#082E7A]/40 min-h-[82px] items-center justify-center text-[11px] font-medium text-blue-200/40"
        >
          Empty {slotLabel}
        </div>
      );
    }

    const pState = gameState.players.find((gs) => gs.slot === player.slot);
    const isActiveTurn = player.slot === gameState.turnSlot;
    const isControllable =
      isActiveTurn &&
      !player.isCpu &&
      (player.uid === myUid || (isLocalPassPlay && isHost));
    const canThisRoll = isControllable && gameState.phase === 'roll';
    const finished = pState?.finishedCount ?? 0;
    const cStyle = COLOR_STYLES[player.ludoColor];

    const slotDice = diceBySlot[player.slot] || { value: null, rollSeq: 0 };
    const shownDiceVal =
      isActiveTurn && gameState.diceValue !== null ? gameState.diceValue : slotDice.value;
    const timerPct = isActiveTurn
      ? Math.max(0, Math.min(100, (secondsLeft / turnTimeSec) * 100))
      : 0;

    const diceTray = (
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

    const avatarBox = (
      <div className="flex flex-col items-center gap-1 shrink-0">
        <div
          className={`relative w-[50px] h-[50px] rounded-lg border-2 flex items-center justify-center overflow-hidden bg-slate-100 ${
            isActiveTurn
              ? 'border-lime-400 ring-2 ring-lime-400/80 shadow-[0_0_12px_rgba(163,230,53,0.65)]'
              : 'border-amber-300/85'
          }`}
        >
          {player.avatar.startsWith('http') ? (
            <img
              src={player.avatar}
              alt={player.username}
              className="w-full h-full object-cover"
              referrerPolicy="no-referrer"
            />
          ) : player.isCpu ? (
            <div className="w-full h-full bg-slate-800 text-amber-300 flex items-center justify-center">
              <Bot className="w-6 h-6" />
            </div>
          ) : (
            <div className="w-full h-full bg-gradient-to-b from-slate-100 to-slate-300 text-slate-500 flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
          )}
          <span
            aria-hidden="true"
            className={`absolute bottom-0.5 right-0.5 w-3 h-3 rounded-full border border-white ${cStyle.dot}`}
          />
        </div>
      </div>
    );

    return (
      <div
        key={player.uid}
        className={`relative rounded-xl border-2 px-2.5 py-2 transition-all duration-200 ${
          isActiveTurn
            ? 'bg-gradient-to-b from-[#115CE0] to-[#0A3A96] border-amber-300 shadow-[0_0_20px_rgba(251,191,36,0.4)]'
            : 'bg-gradient-to-b from-[#0C4AB8] to-[#072E78] border-amber-400/75 opacity-95'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          {side === 'left' ? (
            <>
              {avatarBox}
              {diceTray}
            </>
          ) : (
            <>
              {diceTray}
              {avatarBox}
            </>
          )}
        </div>

        <div className="mt-1.5 flex items-center justify-between gap-1.5">
          <span className="text-[11px] font-bold text-white truncate">
            {player.username}
          </span>
          <span className="flex items-center gap-0.5 shrink-0" title={`${finished}/4 Home`}>
            {Array.from({ length: 4 }).map((_, i) => (
              <span
                key={i}
                className={`w-1.5 h-1.5 rounded-full ${
                  i < finished ? 'bg-lime-400' : 'bg-white/25'
                }`}
              />
            ))}
          </span>
        </div>

        {/* Turn Status / Countdown Progress Bar */}
        <div className="mt-1 flex items-center justify-between gap-2">
          <span
            className={`text-[10px] font-semibold truncate ${
              canThisRoll
                ? 'text-lime-300'
                : isActiveTurn
                  ? 'text-amber-300'
                  : 'text-blue-200/75'
            }`}
          >
            {isActiveTurn
              ? canThisRoll
                ? 'Tap dice!'
                : isControllable && gameState.phase === 'move'
                  ? 'Tap pawn'
                  : player.isCpu
                    ? 'CPU playing'
                    : `${secondsLeft}s`
              : `${cStyle.label}`}
          </span>
          {isActiveTurn && (
            <span className="font-mono tabular-nums text-[10px] font-bold text-amber-300">
              {secondsLeft}s
            </span>
          )}
        </div>

        {isActiveTurn && (
          <div className="mt-1 h-1 w-full rounded-full bg-black/30 overflow-hidden">
            <div
              className={`h-full transition-all duration-200 ${
                secondsLeft <= 4 ? 'bg-rose-400' : 'bg-lime-400'
              }`}
              style={{ width: `${timerPct}%` }}
            />
          </div>
        )}
      </div>
    );
  };

  // Compute Corner Docks aligned with board corners/sectors
  const corners4 = useMemo(() => {
    const normalizedRot = ((boardRotation % 360) + 360) % 360;
    const map = CORNER_COLORS_BY_ROTATION_4[normalizedRot] || CORNER_COLORS_BY_ROTATION_4[0];
    const byColor = (c: LudoColor) => players.find((p) => p.ludoColor === c);
    return {
      tl: byColor(map.tl),
      tr: byColor(map.tr),
      bl: byColor(map.bl),
      br: byColor(map.br),
    };
  }, [boardRotation, players]);

  const { topRowPlayers6, bottomRowPlayers6 } = useMemo(() => {
    const byColor = (c: LudoColor) => players.find((p) => p.ludoColor === c);
    return {
      topRowPlayers6: [
        { player: byColor('cyan'), align: 'left' as const, label: 'Cyan' },
        { player: byColor('blue'), align: 'left' as const, label: 'Blue' },
        { player: byColor('red'), align: 'right' as const, label: 'Red' },
      ],
      bottomRowPlayers6: [
        { player: byColor('purple'), align: 'left' as const, label: 'Purple' },
        { player: byColor('yellow'), align: 'left' as const, label: 'Yellow' },
        { player: byColor('green'), align: 'right' as const, label: 'Green' },
      ],
    };
  }, [players]);

  const renderTrackCell4 = (r: number, c: number) => {
    const inCorner =
      (r < 6 && c < 6) || (r < 6 && c > 8) || (r > 8 && c > 8) || (r > 8 && c < 6);
    const inCenter = r >= 6 && r <= 8 && c >= 6 && c <= 8;
    if (inCorner || inCenter) {
      return <div key={`${r}-${c}`} className="pointer-events-none" />;
    }

    // Blue Home Stretch (Left arm middle row: r=7, c=1..5)
    if (r === 7 && c >= 1 && c <= 5) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-slate-500/45 flex items-center justify-center ${COLOR_STYLES.blue.tileBg}`}
        />
      );
    }
    // Red Home Stretch (Top arm middle col: c=7, r=1..5)
    if (c === 7 && r >= 1 && r <= 5) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-slate-500/45 flex items-center justify-center ${COLOR_STYLES.red.tileBg}`}
        />
      );
    }
    // Green Home Stretch (Right arm middle row: r=7, c=9..13)
    if (r === 7 && c >= 9 && c <= 13) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-slate-500/45 flex items-center justify-center ${COLOR_STYLES.green.tileBg}`}
        />
      );
    }
    // Yellow Home Stretch (Bottom arm middle col: c=7, r=9..13)
    if (c === 7 && r >= 9 && r <= 13) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-slate-500/45 flex items-center justify-center ${COLOR_STYLES.yellow.tileBg}`}
        />
      );
    }

    // Colored Start Tiles
    const trackIdx = coordToTrackIdx4.get(`${r},${c}`);
    if (trackIdx === 0) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-slate-500/45 flex items-center justify-center ${COLOR_STYLES.blue.tileBg}`}
        >
          <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white stroke-[1.75]" />
        </div>
      );
    }
    if (trackIdx === 13) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-slate-500/45 flex items-center justify-center ${COLOR_STYLES.red.tileBg}`}
        >
          <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white stroke-[1.75]" />
        </div>
      );
    }
    if (trackIdx === 26) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-slate-500/45 flex items-center justify-center ${COLOR_STYLES.green.tileBg}`}
        >
          <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-white stroke-[1.75]" />
        </div>
      );
    }
    if (trackIdx === 39) {
      return (
        <div
          key={`${r}-${c}`}
          className={`border-[0.5px] border-slate-500/45 flex items-center justify-center ${COLOR_STYLES.yellow.tileBg}`}
        >
          <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-900 stroke-[1.75]" />
        </div>
      );
    }

    // Home-Entry Arrows
    if (r === 7 && c === 0) {
      return (
        <div key={`${r}-${c}`} className="bg-white border-[0.5px] border-slate-400/75 flex items-center justify-center">
          <ArrowRight className="w-3 h-3 text-[#1777EC]" />
        </div>
      );
    }
    if (r === 0 && c === 7) {
      return (
        <div key={`${r}-${c}`} className="bg-white border-[0.5px] border-slate-400/75 flex items-center justify-center">
          <ArrowDown className="w-3 h-3 text-[#E31E24]" />
        </div>
      );
    }
    if (r === 7 && c === 14) {
      return (
        <div key={`${r}-${c}`} className="bg-white border-[0.5px] border-slate-400/75 flex items-center justify-center">
          <ArrowLeft className="w-3 h-3 text-[#009E49]" />
        </div>
      );
    }
    if (r === 14 && c === 7) {
      return (
        <div key={`${r}-${c}`} className="bg-white border-[0.5px] border-slate-400/75 flex items-center justify-center">
          <ArrowUp className="w-3 h-3 text-[#CA8A04]" />
        </div>
      );
    }

    const isStar = trackIdx !== undefined && STAR_GLOBAL_4.has(trackIdx);
    return (
      <div
        key={`${r}-${c}`}
        className="bg-white border-[0.5px] border-slate-400/75 flex items-center justify-center"
      >
        {isStar && <Star className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400 stroke-[1.75]" />}
      </div>
    );
  };

  const rotateStep = armCount === 4 ? 90 : 60;
  const pawnWidthPct = armCount === 4 ? 6.8 : 4.6;
  const pawnHeightPct = armCount === 4 ? 8.2 : 5.6;

  // Royal Blue Patterned Arena Background matching reference image
  const arenaPatternStyle = {
    backgroundColor: '#0E48AC',
    backgroundImage:
      'radial-gradient(circle at 25% 25%, rgba(255,255,255,0.06) 2px, transparent 2.5px), radial-gradient(circle at 75% 75%, rgba(255,255,255,0.05) 2px, transparent 2.5px), linear-gradient(135deg, rgba(19, 86, 198, 0.55) 25%, transparent 25%, transparent 50%, rgba(19, 86, 198, 0.55) 50%, rgba(19, 86, 198, 0.55) 75%, transparent 75%, transparent)',
    backgroundSize: '44px 44px, 44px 44px, 88px 88px',
  };

  const renderBoardStage = () => (
    <div
      className={`relative w-full flex justify-center select-none ${
        viewMode === '3d' ? 'py-3 sm:py-4' : 'py-0.5'
      }`}
      style={{ perspective: '1250px' }}
    >
      <div
        className="relative aspect-square w-full max-w-[500px] rounded-xl border-2 border-amber-400/90 bg-gradient-to-b from-[#0C2F75] to-[#081F52] p-1.5 sm:p-2 preserve-3d"
        style={{
          transform: `rotateX(${tiltDeg}deg)`,
          transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
          boxShadow:
            viewMode === '3d'
              ? '0 26px 40px -16px rgba(0, 0, 0, 0.65), 0 12px 20px -10px rgba(0, 0, 0, 0.45)'
              : '0 10px 26px -8px rgba(0, 0, 0, 0.55)',
        }}
      >
        {viewMode === '3d' && (
          <div
            aria-hidden="true"
            className="absolute left-1 right-1 -bottom-[14px] h-[14px] rounded-b-xl border-b border-amber-400/45 bg-[#061538]"
            style={{
              transformOrigin: 'top center',
              transform: 'rotateX(-82deg)',
            }}
          />
        )}

        <div
          className="relative w-full h-full rounded-lg bg-white overflow-visible preserve-3d shadow-inner"
          style={{
            transform: `rotateZ(${boardRotation}deg)`,
            transition: 'transform 420ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          {armCount === 4 ? (
            <>
              <div
                className="grid w-full h-full rounded-lg overflow-hidden border border-slate-700/70"
                style={{
                  gridTemplateColumns: 'repeat(15, minmax(0, 1fr))',
                  gridTemplateRows: 'repeat(15, minmax(0, 1fr))',
                }}
              >
                {Array.from({ length: 225 }).map((_, cellIdx) =>
                  renderTrackCell4(Math.floor(cellIdx / 15), cellIdx % 15)
                )}
              </div>

              {/* 4 Ludo King Corner Yards (Blue TL, Red TR, Green BR, Yellow BL) */}
              {YARD_DEFS_4.map(({ color, posStyle }) => {
                const cStyle = COLOR_STYLES[color];
                const player = players.find((p) => p.ludoColor === color);
                const isTurn = player && player.slot === gameState.turnSlot;

                return (
                  <div
                    key={color}
                    style={{ ...posStyle, width: '40%', height: '40%' }}
                    className={`absolute p-3 sm:p-4 border border-slate-700/60 ${cStyle.yardBg} ${
                      color === 'blue'
                        ? 'rounded-tl-lg'
                        : color === 'red'
                          ? 'rounded-tr-lg'
                          : color === 'green'
                            ? 'rounded-br-lg'
                            : 'rounded-bl-lg'
                    } ${isTurn ? `ring-3 ring-inset ${cStyle.yardRing}` : ''} ${
                      !player ? 'opacity-80' : ''
                    }`}
                  >
                    <div className="relative w-full h-full rounded-sm bg-white shadow-inner border border-black/15">
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
                          className={`absolute rounded-full border shadow-inner ${cStyle.socketBg}`}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}

              {/* Center 3x3 4-Triangle Ludo King Home */}
              <div
                className="absolute border border-slate-700/60 overflow-hidden shadow-inner"
                style={{ left: '40%', top: '40%', width: '20%', height: '20%' }}
              >
                <svg viewBox="0 0 100 100" className="w-full h-full block" aria-hidden="true">
                  <polygon points="0,0 50,50 0,100" fill={COLOR_STYLES.blue.triangleHex} />
                  <polygon points="0,0 100,0 50,50" fill={COLOR_STYLES.red.triangleHex} />
                  <polygon points="100,0 100,100 50,50" fill={COLOR_STYLES.green.triangleHex} />
                  <polygon points="0,100 50,50 100,100" fill={COLOR_STYLES.yellow.triangleHex} />
                  <line x1="0" y1="0" x2="100" y2="100" stroke="#1E293B" strokeOpacity="0.45" strokeWidth="1.5" />
                  <line x1="100" y1="0" x2="0" y2="100" stroke="#1E293B" strokeOpacity="0.45" strokeWidth="1.5" />
                </svg>
                <div
                  style={{ transform: `translate(-50%, -50%) rotateZ(${-boardRotation}deg)` }}
                  className="pointer-events-none absolute left-1/2 top-1/2 w-6 h-6 sm:w-7 sm:h-7 rounded-full bg-white border-2 border-amber-400 shadow-md flex items-center justify-center"
                >
                  <Crown className="w-3.5 h-3.5 text-amber-500" />
                </div>
              </div>
            </>
          ) : (
            /* 6-Arm Hexagonal Ludo Board (5 to 6 Players) */
            <div className="relative w-full h-full rounded-lg overflow-hidden border border-slate-700/60 bg-[#F8FAFC]">
              {HEX_BOARD_TILES.map((tile) => {
                const cStyle = tile.color ? COLOR_STYLES[tile.color] : null;
                const bgClass =
                  tile.kind === 'start' || tile.kind === 'home'
                    ? cStyle!.tileBg
                    : 'bg-white border-slate-400/75';

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
                    className={`absolute rounded-[3px] border-[0.5px] border-slate-500/45 flex items-center justify-center ${bgClass}`}
                  >
                    {(tile.kind === 'start' || tile.kind === 'star') && (
                      <Star
                        className={`w-2 h-2 sm:w-2.5 sm:h-2.5 ${
                          tile.kind === 'start'
                            ? tile.color === 'yellow'
                              ? 'text-slate-900'
                              : 'text-white'
                            : 'text-slate-400'
                        }`}
                      />
                    )}
                    {tile.kind === 'entry' && cStyle && (
                      <ArrowDown className="w-2.5 h-2.5 text-slate-600" />
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
                    className={`absolute rounded-xl p-1.5 border border-slate-700/50 shadow-md ${cStyle.yardBg} ${
                      isTurn ? `ring-3 ${cStyle.yardRing}` : ''
                    } ${!player ? 'opacity-45' : ''}`}
                  >
                    <div className="relative w-full h-full rounded-lg bg-white border border-black/10">
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
                        stroke="#1E293B"
                        strokeOpacity="0.45"
                        strokeWidth="1.2"
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
              className="pointer-events-none absolute z-10 rounded-full border-2 border-dashed border-amber-500 bg-amber-400/35 shadow-[0_0_12px_rgba(245,158,11,0.65)]"
            />
          )}

          {/* Teardrop Map-Pin Pawns Layer */}
          {allTokens.map((t) => {
            const key = `${t.leftPct.toFixed(1)},${t.topPct.toFixed(1)}`;
            const group = stackGroups.get(key) || [t];
            const stackPos = group.findIndex(
              (g) => g.slot === t.slot && g.tokenIdx === t.tokenIdx
            );
            const isStacked = group.length > 1;
            const offsetX = isStacked ? ((stackPos % 2) - 0.5) * 1.45 : 0;
            const offsetY = isStacked ? (Math.floor(stackPos / 2) - 0.5) * 1.45 : 0;
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
                      width: `${isStacked ? pawnWidthPct * 0.92 : pawnWidthPct * 1.05}%`,
                      height: `${isStacked ? pawnWidthPct * 0.92 : pawnWidthPct * 1.05}%`,
                    }}
                    className="pointer-events-none ludo-target-ring absolute z-10 rounded-full border-2 border-lime-400 bg-amber-400/35"
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
                    width: `${isStacked ? pawnWidthPct * 0.85 : pawnWidthPct}%`,
                    height: `${isStacked ? pawnHeightPct * 0.85 : pawnHeightPct}%`,
                    transform: `translate(-50%, -62%) translateZ(${elevationPx}px) rotateZ(${-boardRotation}deg) rotateX(${-tiltDeg}deg)`,
                    transition:
                      'transform 220ms cubic-bezier(0.16, 1, 0.3, 1), left 240ms ease, top 240ms ease',
                  }}
                  className={`pointer-events-auto absolute flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 rounded-full ${
                    t.movable ? 'z-30 cursor-pointer' : 'z-20 cursor-default'
                  }`}
                >
                  <PawnPiecePin
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
  );

  return (
    <div
      style={arenaPatternStyle}
      className="rounded-2xl border-2 border-amber-400/70 p-3 sm:p-4 space-y-3 shadow-2xl text-white"
    >
      {/* Compact Arena Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-white/15">
        <div className="flex items-center gap-2 text-xs">
          <span
            className={`w-2.5 h-2.5 rounded-full border ${
              activePlayer ? COLOR_STYLES[activePlayer.ludoColor].dot : 'bg-slate-400'
            }`}
          />
          <span className="font-bold text-white">
            {canControlActiveTurn
              ? isLocalPassPlay
                ? `${activePlayer?.username}'s Turn`
                : 'Your Turn'
              : `${activePlayer?.username || 'Player'}'s Turn`}
          </span>
          <span aria-hidden="true" className="text-blue-200/60">
            ·
          </span>
          <span
            className={`font-mono tabular-nums font-bold ${
              secondsLeft <= 4 ? 'text-rose-300' : 'text-amber-300'
            }`}
          >
            {secondsLeft}s
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <div
            className="flex items-center p-0.5 rounded-lg bg-[#082B70]/85 border border-white/15"
            role="group"
            aria-label="Board camera angle"
          >
            <button
              type="button"
              onClick={() => setViewMode('top')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap min-h-[30px] cursor-pointer ${
                viewMode === 'top'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-blue-100 hover:text-white'
              }`}
            >
              <Square className="w-3 h-3" />
              Flat
            </button>
            <button
              type="button"
              onClick={() => setViewMode('3d')}
              className={`px-2 py-1 text-[11px] font-semibold rounded-md inline-flex items-center gap-1 transition-colors whitespace-nowrap min-h-[30px] cursor-pointer ${
                viewMode === '3d'
                  ? 'bg-amber-400 text-slate-950'
                  : 'text-blue-100 hover:text-white'
              }`}
            >
              <Box className="w-3 h-3" />
              3D
            </button>
          </div>

          <button
            type="button"
            onClick={() => setBoardRotation((r) => (r + rotateStep) % 360)}
            title="Rotate board"
            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#082B70]/85 border border-white/15 text-blue-100 hover:text-white inline-flex items-center gap-1 min-h-[32px] cursor-pointer"
          >
            <RotateCw className="w-3.5 h-3.5" />
            Rotate
          </button>

          {onToggleSound && (
            <button
              type="button"
              onClick={onToggleSound}
              aria-label={soundOn ? 'Mute sound' : 'Unmute sound'}
              className="px-2 py-1 rounded-lg bg-[#082B70]/85 border border-white/15 text-blue-100 hover:text-white inline-flex items-center justify-center min-h-[32px] cursor-pointer"
            >
              {soundOn ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowRules((v) => !v)}
            title="Toggle Ludo rules"
            className="px-2.5 py-1 text-[11px] font-semibold rounded-lg bg-[#082B70]/85 border border-white/15 text-blue-100 hover:text-white inline-flex items-center gap-1 min-h-[32px] cursor-pointer"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Rules
          </button>
        </div>
      </div>

      {showRules && (
        <div className="rounded-xl border border-amber-400/40 bg-[#082B70]/90 px-3.5 py-2 text-xs text-blue-100 flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>Roll 6 to exit yard</span>
          <span aria-hidden="true">·</span>
          <span>Bonus roll on 6, capture, or Home goal</span>
          <span aria-hidden="true">·</span>
          <span>{safeCount} safe star squares</span>
          <span aria-hidden="true">·</span>
          <span>Three 6s forfeits turn</span>
        </div>
      )}

      {/* Ludo King Arena Layout: 4 Corner Flanking Docks on Desktop (2+2 Top/Bottom on Mobile) */}
      {armCount === 4 ? (
        <div className="space-y-2.5">
          {/* Mobile Top Row (TL + TR) */}
          <div className="grid grid-cols-2 gap-2 md:hidden">
            {renderLudoKingDock(corners4.tl, 'left', 'Top-Left')}
            {renderLudoKingDock(corners4.tr, 'right', 'Top-Right')}
          </div>

          {/* Desktop 3-Column Ludo King Arena: [Left Docks] [Board] [Right Docks] */}
          <div className="md:grid md:grid-cols-[152px_minmax(0,1fr)_152px] lg:grid-cols-[168px_minmax(0,1fr)_168px] md:gap-3 md:items-stretch">
            <div className="hidden md:flex flex-col justify-between py-1">
              {renderLudoKingDock(corners4.tl, 'left', 'Top-Left')}
              {renderLudoKingDock(corners4.bl, 'left', 'Bottom-Left')}
            </div>

            {renderBoardStage()}

            <div className="hidden md:flex flex-col justify-between py-1">
              {renderLudoKingDock(corners4.tr, 'right', 'Top-Right')}
              {renderLudoKingDock(corners4.br, 'right', 'Bottom-Right')}
            </div>
          </div>

          {/* Mobile Bottom Row (BL + BR) */}
          <div className="grid grid-cols-2 gap-2 md:hidden">
            {renderLudoKingDock(corners4.bl, 'left', 'Bottom-Left')}
            {renderLudoKingDock(corners4.br, 'right', 'Bottom-Right')}
          </div>
        </div>
      ) : (
        /* 6-Arm Hexagonal Board with 3 Top + 3 Bottom Player Docks */
        <div className="space-y-2.5">
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {topRowPlayers6.map((entry) =>
              renderLudoKingDock(entry.player, entry.align, entry.label)
            )}
          </div>
          {renderBoardStage()}
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {bottomRowPlayers6.map((entry) =>
              renderLudoKingDock(entry.player, entry.align, entry.label)
            )}
          </div>
        </div>
      )}

      {/* Action & Status Strip */}
      <div className="rounded-xl border border-amber-400/50 bg-[#082B70]/90 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs sm:text-sm font-bold text-white truncate">
            {gameState.lastActionText}
          </p>
          <p className="text-[11px] text-blue-200/80 mt-0.5">
            {canControlActiveTurn && gameState.phase === 'roll'
              ? 'Tap your glowing dice or press Space to roll'
              : canControlActiveTurn && gameState.phase === 'move'
                ? 'Tap a glowing pawn on the board or choose Move #1–#4'
                : `Consecutive sixes: ${gameState.consecutiveSixes}/3`}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canControlActiveTurn && gameState.phase === 'roll' && (
            <button
              type="button"
              onClick={() => {
                soundFx.capture();
                onRollDice();
              }}
              className="px-4 py-2 text-xs sm:text-sm font-bold rounded-lg bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 text-slate-950 transition-all min-h-[42px] inline-flex items-center gap-2 cursor-pointer shadow-md"
            >
              <Dices className="w-4 h-4" />
              Roll Dice
            </button>
          )}

          {canControlActiveTurn && gameState.phase === 'move' && activePlayer && (
            <div className="flex flex-wrap items-center gap-1.5">
              {gameState.movableTokenIndices.map((idx) => {
                const cStyle = COLOR_STYLES[activePlayer.ludoColor];
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
                    className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-colors min-h-[40px] cursor-pointer shadow-sm border border-white/25 ${cStyle.chipBtn}`}
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
