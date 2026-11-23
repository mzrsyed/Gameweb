import { useEffect, useRef, useState } from 'react';
import type { MapTheme } from '../shared/types';

interface LudoDice3DProps {
  value: number | null;
  canRoll: boolean;
  mapTheme: MapTheme;
  actionNonce: string;
  size?: 'sm' | 'md';
  onRoll: () => void;
}

const FACE_PIP_MAP: Record<number, number[]> = {
  1: [4],
  2: [0, 8],
  3: [0, 4, 8],
  4: [0, 2, 6, 8],
  5: [0, 2, 4, 6, 8],
  6: [0, 2, 3, 5, 6, 8],
};

// Rotations on the inner tumbling cube that bring each face to +Z (front)
const TARGET_FACE_ROTATION: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 },
};

const DICE_MATERIAL: Record<
  MapTheme,
  { face: string; pip: string; onePip: string; tray: string }
> = {
  'Obsidian Grid': {
    face: 'bg-gradient-to-br from-white via-slate-50 to-slate-200 border-amber-400/70 shadow-[inset_0_1px_2px_rgba(255,255,255,0.95)]',
    pip: 'bg-slate-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.45)]',
    onePip: 'bg-rose-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]',
    tray: 'bg-slate-900/90 border-amber-400/40',
  },
  'Alpine Bastion': {
    face: 'bg-gradient-to-br from-white via-sky-50 to-slate-200 border-sky-300 shadow-[inset_0_1px_2px_rgba(255,255,255,0.95)]',
    pip: 'bg-slate-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.35)]',
    onePip: 'bg-rose-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.3)]',
    tray: 'bg-sky-950/75 border-sky-400/40',
  },
  'Solaris Circuit': {
    face: 'bg-gradient-to-br from-amber-50 via-stone-100 to-amber-200 border-amber-400 shadow-[inset_0_1px_2px_rgba(255,255,255,0.95)]',
    pip: 'bg-stone-900 shadow-[inset_0_1px_1px_rgba(0,0,0,0.4)]',
    onePip: 'bg-red-600 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]',
    tray: 'bg-stone-900/90 border-amber-500/45',
  },
};

function CubeFace({
  faceNum,
  transform,
  material,
  small,
}: {
  faceNum: number;
  transform: string;
  material: (typeof DICE_MATERIAL)[MapTheme];
  small: boolean;
}) {
  const pips = FACE_PIP_MAP[faceNum];
  const isOne = faceNum === 1;

  return (
    <div
      style={{ transform }}
      className={`backface-hidden absolute inset-0 rounded-lg border p-1.5 grid grid-cols-3 grid-rows-3 gap-0.5 ${material.face}`}
    >
      {Array.from({ length: 9 }).map((_, idx) => {
        const active = pips.includes(idx);
        const pipSize = small
          ? isOne
            ? 'w-2.5 h-2.5'
            : 'w-1.5 h-1.5'
          : isOne
            ? 'w-3 h-3'
            : 'w-2 h-2';
        return (
          <span
            key={idx}
            className={`m-auto rounded-full ${pipSize} ${
              active ? (isOne ? material.onePip : material.pip) : 'bg-transparent'
            }`}
          />
        );
      })}
    </div>
  );
}

export function LudoDice3D({
  value,
  canRoll,
  mapTheme,
  actionNonce,
  size = 'md',
  onRoll,
}: LudoDice3DProps) {
  const [spinCount, setSpinCount] = useState(0);
  const [isRollingAnim, setIsRollingAnim] = useState(false);
  const prevNonceRef = useRef(actionNonce);

  useEffect(() => {
    if (actionNonce !== prevNonceRef.current) {
      prevNonceRef.current = actionNonce;
      if (value !== null) {
        setSpinCount((c) => c + 1);
        setIsRollingAnim(true);
        const timer = window.setTimeout(() => setIsRollingAnim(false), 500);
        return () => window.clearTimeout(timer);
      }
    }
  }, [actionNonce, value]);

  const activeFace = value ?? 6;
  const baseTarget = TARGET_FACE_ROTATION[activeFace] ?? TARGET_FACE_ROTATION[1];
  const rotX = baseTarget.x + spinCount * 360;
  const rotY = baseTarget.y + spinCount * 360;
  const material = DICE_MATERIAL[mapTheme];
  const small = size === 'sm';
  const depth = small ? 20 : 24;

  const handleClick = () => {
    if (!canRoll) return;
    setSpinCount((c) => c + 1);
    setIsRollingAnim(true);
    onRoll();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={!canRoll}
      aria-label={
        canRoll
          ? 'Roll 3D Ludo dice'
          : value
            ? `Dice showing ${value}`
            : 'Waiting for dice roll'
      }
      className={`group relative rounded-xl border flex items-center justify-center shrink-0 transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
        small ? 'w-[56px] h-[56px]' : 'w-[68px] h-[68px]'
      } ${material.tray} ${
        canRoll
          ? 'cursor-pointer ring-2 ring-amber-400/90 hover:scale-105 active:scale-95 shadow-[0_0_16px_rgba(245,158,11,0.35)]'
          : 'cursor-default'
      }`}
    >
      {/* Recessed tray cast shadow */}
      <span
        aria-hidden="true"
        className={`absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-black/45 blur-[3px] transition-transform duration-300 ${
          small ? 'w-8 h-2' : 'w-10 h-2.5'
        } ${isRollingAnim ? 'scale-75 opacity-50' : 'scale-100 opacity-85'}`}
      />

      {/* 3D Perspective Stage */}
      <div
        className={`${small ? 'w-10 h-10' : 'w-12 h-12'} relative preserve-3d`}
        style={{ perspective: '420px' }}
      >
        <div
          className="w-full h-full relative preserve-3d"
          style={{
            transform: isRollingAnim
              ? 'rotateX(-28deg) rotateY(32deg) translateY(-5px)'
              : 'rotateX(-16deg) rotateY(20deg)',
            transition: 'transform 280ms cubic-bezier(0.16, 1, 0.3, 1)',
          }}
        >
          <div
            className="w-full h-full relative preserve-3d"
            style={{
              transform: `rotateX(${rotX}deg) rotateY(${rotY}deg)`,
              transition: 'transform 520ms cubic-bezier(0.22, 1, 0.36, 1)',
            }}
          >
            <CubeFace faceNum={1} transform={`rotateY(0deg) translateZ(${depth}px)`} material={material} small={small} />
            <CubeFace faceNum={6} transform={`rotateY(180deg) translateZ(${depth}px)`} material={material} small={small} />
            <CubeFace faceNum={2} transform={`rotateY(90deg) translateZ(${depth}px)`} material={material} small={small} />
            <CubeFace faceNum={5} transform={`rotateY(-90deg) translateZ(${depth}px)`} material={material} small={small} />
            <CubeFace faceNum={3} transform={`rotateX(90deg) translateZ(${depth}px)`} material={material} small={small} />
            <CubeFace faceNum={4} transform={`rotateX(-90deg) translateZ(${depth}px)`} material={material} small={small} />
          </div>
        </div>
      </div>
    </button>
  );
}
