export interface FontDefinition {
  id: string;
  name: string;
  category: 'Modern' | 'Futuristic' | 'Classic';
  cssStack: string;
  /** Google Fonts stylesheet URL — approved source only */
  importUrl?: string;
}

/**
 * Approved font catalog. Fonts are loaded ONLY from these fixed, audited sources.
 * User-supplied font URLs are never loaded (XSS / supply-chain safety).
 */
export const FONT_CATALOG: FontDefinition[] = [
  { id: 'system', name: 'System Default', category: 'Classic', cssStack: "system-ui, -apple-system, 'Segoe UI', sans-serif" },
  { id: 'inter', name: 'Inter', category: 'Modern', cssStack: "'Inter', system-ui, sans-serif", importUrl: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap' },
  { id: 'manrope', name: 'Manrope', category: 'Modern', cssStack: "'Manrope', system-ui, sans-serif", importUrl: 'https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap' },
  { id: 'space-grotesk', name: 'Space Grotesk', category: 'Modern', cssStack: "'Space Grotesk', system-ui, sans-serif", importUrl: 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600;700&display=swap' },
  { id: 'orbitron', name: 'Orbitron', category: 'Futuristic', cssStack: "'Orbitron', system-ui, sans-serif", importUrl: 'https://fonts.googleapis.com/css2?family=Orbitron:wght@400;500;600;700;800&display=swap' },
  { id: 'rajdhani', name: 'Rajdhani', category: 'Futuristic', cssStack: "'Rajdhani', system-ui, sans-serif", importUrl: 'https://fonts.googleapis.com/css2?family=Rajdhani:wght@400;500;600;700&display=swap' },
  { id: 'serif', name: 'Classic Serif', category: 'Classic', cssStack: "Georgia, 'Times New Roman', serif" },
];

export function getFont(id: string): FontDefinition {
  return FONT_CATALOG.find((f) => f.id === id) ?? FONT_CATALOG[0]!;
}

const loadedUrls = new Set<string>();

/** Inject the Google Fonts stylesheet once per selected font. */
export function ensureFontLoaded(id: string): void {
  const font = getFont(id);
  if (!font.importUrl || loadedUrls.has(font.importUrl)) return;
  loadedUrls.add(font.importUrl);
  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = font.importUrl;
  document.head.appendChild(link);
}
