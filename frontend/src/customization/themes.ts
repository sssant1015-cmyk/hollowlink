import type { AppearancePrefs, PresetThemeId } from './types';
import { DEFAULT_APPEARANCE } from './types';

export interface ThemeDefinition {
  id: string;
  name: string;
  /** core token overrides applied on top of the mode base */
  tokens: {
    bg: string;
    bgRaised: string;
    surface: string;
    border: string;
    text: string;
    textDim: string;
    textFaint: string;
    primary: string;
    primarySoft: string;
    secondary: string;
    secondarySoft: string;
    shadowStrength: number; // 0..1
  };
}

export const PRESET_THEMES: ThemeDefinition[] = [
  {
    id: 'hollow-dark',
    name: 'Hollow Dark',
    tokens: {
      bg: '#0a0a0f', bgRaised: '#101018', surface: 'rgba(255,255,255,0.04)',
      border: 'rgba(255,255,255,0.08)', text: '#eceaf4', textDim: '#9b97ad', textFaint: '#6b6780',
      primary: '#a855f7', primarySoft: '#c084fc', secondary: '#22d3ee', secondarySoft: '#67e8f9',
      shadowStrength: 0.45,
    },
  },
  {
    id: 'hollow-light',
    name: 'Hollow Light',
    tokens: {
      bg: '#f4f3f9', bgRaised: '#ffffff', surface: 'rgba(15,15,30,0.03)',
      border: 'rgba(15,15,30,0.10)', text: '#1a1826', textDim: '#5a5668', textFaint: '#8a8698',
      primary: '#8b3df0', primarySoft: '#a86af5', secondary: '#0891b2', secondarySoft: '#38bdf8',
      shadowStrength: 0.12,
    },
  },
  {
    id: 'midnight',
    name: 'Midnight',
    tokens: {
      bg: '#05070d', bgRaised: '#0a0e18', surface: 'rgba(120,140,255,0.05)',
      border: 'rgba(120,140,255,0.10)', text: '#e2e8f0', textDim: '#94a3b8', textFaint: '#64748b',
      primary: '#818cf8', primarySoft: '#a5b4fc', secondary: '#38bdf8', secondarySoft: '#7dd3fc',
      shadowStrength: 0.55,
    },
  },
  {
    id: 'purple-void',
    name: 'Purple Void',
    tokens: {
      bg: '#0d0616', bgRaised: '#150a24', surface: 'rgba(168,85,247,0.06)',
      border: 'rgba(168,85,247,0.14)', text: '#f3e8ff', textDim: '#c4a8e0', textFaint: '#9272b0',
      primary: '#c084fc', primarySoft: '#dcb8fe', secondary: '#f472b6', secondarySoft: '#f9a8d4',
      shadowStrength: 0.5,
    },
  },
  {
    id: 'cyber',
    name: 'Cyber',
    tokens: {
      bg: '#03090e', bgRaised: '#06121a', surface: 'rgba(0,255,200,0.04)',
      border: 'rgba(0,255,200,0.12)', text: '#d1fae5', textDim: '#6ee7b7', textFaint: '#34d399',
      primary: '#00ffc8', primarySoft: '#5eead4', secondary: '#a3e635', secondarySoft: '#d9f99d',
      shadowStrength: 0.5,
    },
  },
  {
    id: 'ember',
    name: 'Ember',
    tokens: {
      bg: '#0f0806', bgRaised: '#1a0e09', surface: 'rgba(251,146,60,0.05)',
      border: 'rgba(251,146,60,0.12)', text: '#ffedd5', textDim: '#d4a574', textFaint: '#9a6b44',
      primary: '#fb923c', primarySoft: '#fdba74', secondary: '#f87171', secondarySoft: '#fca5a5',
      shadowStrength: 0.5,
    },
  },
  {
    id: 'ocean',
    name: 'Ocean',
    tokens: {
      bg: '#04121d', bgRaised: '#071c2b', surface: 'rgba(56,189,248,0.05)',
      border: 'rgba(56,189,248,0.12)', text: '#e0f2fe', textDim: '#93c5fd', textFaint: '#5b8fb9',
      primary: '#38bdf8', primarySoft: '#7dd3fc', secondary: '#2dd4bf', secondarySoft: '#5eead4',
      shadowStrength: 0.45,
    },
  },
  {
    id: 'forest',
    name: 'Forest',
    tokens: {
      bg: '#081109', bgRaised: '#0e1c10', surface: 'rgba(74,222,128,0.05)',
      border: 'rgba(74,222,128,0.12)', text: '#ecfdf5', textDim: '#a7c4a9', textFaint: '#6f8f72',
      primary: '#4ade80', primarySoft: '#86efac', secondary: '#a3e635', secondarySoft: '#d9f99d',
      shadowStrength: 0.45,
    },
  },
];

export function getTheme(id: string): ThemeDefinition {
  return PRESET_THEMES.find((t) => t.id === id) ?? PRESET_THEMES[0]!;
}

export function withPresetTheme(preset: PresetThemeId, base: AppearancePrefs = DEFAULT_APPEARANCE): AppearancePrefs {
  return { ...base, presetTheme: preset, colors: {} }; // switching presets clears custom overrides
}
