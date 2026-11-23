import type { MapTheme } from '../shared/types';

export const HERO_BOARD_IMAGE = '/src/assets/images/arena_hero_board_1795376189027.jpg';

export interface MapThemeAsset {
  id: MapTheme;
  label: string;
  subtitle: string;
  imageUrl: string;
  fallbackGradient: string;
}

export const MAP_THEME_ASSETS: Record<MapTheme, MapThemeAsset> = {
  'Obsidian Grid': {
    id: 'Obsidian Grid',
    label: 'Obsidian Grid',
    subtitle: 'Matte slate Ludo track · Crisp high-contrast lanes',
    imageUrl: '/src/assets/images/map_obsidian_grid_1795376189102.jpg',
    fallbackGradient: 'from-slate-800 via-slate-900 to-zinc-950',
  },
  'Alpine Bastion': {
    id: 'Alpine Bastion',
    label: 'Alpine Bastion',
    subtitle: 'Daylight stone Ludo board · Ice-blue safe quadrants',
    imageUrl: '/src/assets/images/map_alpine_bastion_1795376189315.jpg',
    fallbackGradient: 'from-sky-900 via-slate-800 to-slate-900',
  },
  'Solaris Circuit': {
    id: 'Solaris Circuit',
    label: 'Solaris Circuit',
    subtitle: 'Warm bronze & charcoal Ludo board · Engraved star nodes',
    imageUrl: '/src/assets/images/map_solaris_circuit_1795376190034.jpg',
    fallbackGradient: 'from-amber-950 via-stone-900 to-zinc-950',
  },
};
