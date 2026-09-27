export type ThemeMode = 'dark' | 'light' | 'system';
export type PresetThemeId =
  | 'hollow-dark'
  | 'hollow-light'
  | 'midnight'
  | 'purple-void'
  | 'cyber'
  | 'ember'
  | 'ocean'
  | 'forest';
export type TextSize = 'sm' | 'md' | 'lg' | 'xl';
export type UiScale = 'compact' | 'comfortable' | 'spacious';
export type RadiusScale = 'sharp' | 'slight' | 'rounded' | 'very-rounded';
export type AnimationLevel = 'none' | 'reduced' | 'normal' | 'high';
export type EffectLevel = 'off' | 'subtle' | 'full';

export interface CustomColors {
  primary?: string;
  secondary?: string;
  bg?: string;
  surface?: string;
  text?: string;
  textMuted?: string;
}

export interface AppearancePrefs {
  themeMode: ThemeMode;
  presetTheme: PresetThemeId;
  colors: CustomColors;
  fontFamily: string; // id from the approved font catalog
  textSize: TextSize;
  uiScale: UiScale;
  radius: RadiusScale;
  animations: AnimationLevel;
  glass: EffectLevel;
  glow: EffectLevel;
  gradients: EffectLevel;
  sidebarCollapsed: boolean;
  compactChat: boolean;
  feedDensity: 'comfortable' | 'compact';
}

export const DEFAULT_APPEARANCE: AppearancePrefs = {
  themeMode: 'dark',
  presetTheme: 'hollow-dark',
  colors: {},
  fontFamily: 'inter',
  textSize: 'md',
  uiScale: 'comfortable',
  radius: 'rounded',
  animations: 'normal',
  glass: 'full',
  glow: 'full',
  gradients: 'full',
  sidebarCollapsed: false,
  compactChat: false,
  feedDensity: 'comfortable',
};

/** Shape of the user_preferences row (appearance column). */
export interface PreferencesRecord {
  appearance: AppearancePrefs;
  accessibility: AccessibilityPrefs;
  layout: LayoutPrefs;
}

export interface AccessibilityPrefs {
  highContrast: boolean;
  reduceMotionOverride: boolean | null; // null = follow appearance.animations / OS
  focusIndicators: boolean;
}

export const DEFAULT_ACCESSIBILITY: AccessibilityPrefs = {
  highContrast: false,
  reduceMotionOverride: null,
  focusIndicators: true,
};

export interface LayoutPrefs {
  dashboardWidgets: { id: string; visible: boolean }[];
}

export const DEFAULT_LAYOUT: LayoutPrefs = {
  dashboardWidgets: [
    { id: 'friends', visible: true },
    { id: 'groups', visible: true },
    { id: 'events', visible: true },
    { id: 'activity', visible: true },
  ],
};

export interface ThemePreset {
  id: string;
  name: string;
  appearance: AppearancePrefs;
  builtIn: boolean;
  createdAt: string;
}
