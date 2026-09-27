import { useAppearance } from '../../customization/CustomizationProvider';

/** Demo extension: reads the theme engine's public hook (presentation state only). */
export function ThemeShowcasePanel() {
  const { appearance } = useAppearance();
  const tokens: [string, string][] = [
    ['Mode', appearance.themeMode],
    ['Preset', appearance.presetTheme],
    ['Font', appearance.fontFamily],
    ['Text size', appearance.textSize],
    ['Scale', appearance.uiScale],
    ['Radius', appearance.radius],
    ['Animations', appearance.animations],
    ['Glass', appearance.glass],
    ['Glow', appearance.glow],
    ['Gradients', appearance.gradients],
  ];
  return (
    <div className="page" style={{ maxWidth: 640 }}>
      <h1 style={{ fontSize: 'var(--font-2xl, 28px)' }} className="mb-3">🎨 Theme Showcase</h1>
      <section className="card">
        <p className="small muted mb-2">
          Live view of your customization state. Extensions that declare the future
          <code className="tiny"> theme</code> capability can read this through the approved API — never raw internals.
        </p>
        <div className="grid grid-2">
          {tokens.map(([label, value]) => (
            <div key={label} className="list-row" style={{ padding: '6px 0' }}>
              <span className="tiny faint grow">{label}</span>
              <span className="small bold">{value}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
