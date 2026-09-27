import { describe, it, expect } from 'vitest';
import { mergeAppearance, isLightColor } from '../src/customization/CustomizationProvider';
import { getTheme, PRESET_THEMES } from '../src/customization/themes';
import { getFont, FONT_CATALOG } from '../src/customization/fonts';
import { DEFAULT_APPEARANCE, DEFAULT_ACCESSIBILITY, DEFAULT_LAYOUT } from '../src/customization/types';

describe('mergeAppearance (malformed preference sanitization)', () => {
  it('returns full defaults for garbage input', () => {
    const merged = mergeAppearance('not-an-object');
    expect(merged).toEqual(DEFAULT_APPEARANCE);
    expect(merged.colors).toEqual({});
  });

  it('keeps valid values and discards invalid enums', () => {
    const merged = mergeAppearance({
      themeMode: 'light',
      textSize: 'gigantic', // invalid → default
      uiScale: 'spacious',
      radius: 42, // invalid type → default
      animations: 'none',
      fontFamily: 'orbitron',
    });
    expect(merged.themeMode).toBe('light');
    expect(merged.textSize).toBe('md');
    expect(merged.uiScale).toBe('spacious');
    expect(merged.radius).toBe('rounded');
    expect(merged.animations).toBe('none');
    expect(merged.fontFamily).toBe('orbitron');
  });

  it('sanitizes custom colors: only valid 6-digit hex survives', () => {
    const merged = mergeAppearance({
      colors: { primary: '#ff00aa', secondary: 'purple', bg: '#12345', text: 'javascript:alert(1)' },
    });
    expect(merged.colors.primary).toBe('#ff00aa');
    expect(merged.colors.secondary).toBeUndefined();
    expect(merged.colors.bg).toBeUndefined();
    expect(merged.colors.text).toBeUndefined();
  });

  it('preserves booleans and feed density strictly', () => {
    const merged = mergeAppearance({ sidebarCollapsed: true, compactChat: true, feedDensity: 'compact' });
    expect(merged.sidebarCollapsed).toBe(true);
    expect(merged.compactChat).toBe(true);
    expect(merged.feedDensity).toBe('compact');
    expect(mergeAppearance({ feedDensity: 'dense' }).feedDensity).toBe('comfortable');
  });
});

describe('preset themes', () => {
  it('ships all eight required presets', () => {
    const ids = PRESET_THEMES.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining(['hollow-dark', 'hollow-light', 'midnight', 'purple-void', 'cyber', 'ember', 'ocean', 'forest']),
    );
    expect(PRESET_THEMES).toHaveLength(8);
  });

  it('falls back to Hollow Dark for unknown ids', () => {
    expect(getTheme('does-not-exist').id).toBe('hollow-dark');
  });

  it('has readable default text on every preset (contrast sanity)', () => {
    for (const theme of PRESET_THEMES) {
      const bgIsLight = isLightColor(theme.tokens.bg);
      const textIsLight = isLightColor(theme.tokens.text);
      expect(textIsLight).not.toBe(bgIsLight); // text and bg must differ in luminance class
    }
  });
});

describe('font catalog', () => {
  it('contains the required categories and ids', () => {
    const ids = FONT_CATALOG.map((f) => f.id);
    expect(ids).toEqual(expect.arrayContaining(['inter', 'manrope', 'space-grotesk', 'orbitron', 'rajdhani', 'system', 'serif']));
  });

  it('never resolves to a user-supplied URL', () => {
    expect(getFont('https://evil.example/font.css').importUrl).toBeUndefined();
    // All importUrls come from the approved host.
    for (const f of FONT_CATALOG) {
      if (f.importUrl) expect(f.importUrl.startsWith('https://fonts.googleapis.com/')).toBe(true);
    }
  });
});

describe('defaults', () => {
  it('default experience stays Hollow Dark with purple accents', () => {
    expect(DEFAULT_APPEARANCE.themeMode).toBe('dark');
    expect(DEFAULT_APPEARANCE.presetTheme).toBe('hollow-dark');
    expect(DEFAULT_ACCESSIBILITY.focusIndicators).toBe(true);
    expect(DEFAULT_ACCESSIBILITY.reduceMotionOverride).toBeNull();
    expect(DEFAULT_LAYOUT.dashboardWidgets.length).toBeGreaterThan(0);
  });
});
