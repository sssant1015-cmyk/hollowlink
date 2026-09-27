# Customization & Extensions

HollowLink is designed so that *your* HollowLink looks and behaves the way you want — without
forking the core, and so that new capabilities (video meetings, games, music, productivity
tools) can be added as **extensions** later without rewriting anything.

---

## 1. Customization Engine

### Architecture

```
CustomizationProvider (React context)
        ↓  writes CSS variables on :root
Design tokens (tokens.css + global.css)
        ↓  consumed by
Every component (no hard-coded theme colors)
```

- `frontend/src/customization/types.ts` — the preference model (`AppearancePrefs`,
  `AccessibilityPrefs`, `LayoutPrefs`) plus defaults.
- `frontend/src/customization/themes.ts` — the 8 preset themes (Hollow Dark, Hollow Light,
  Midnight, Purple Void, Cyber, Ember, Ocean, Forest).
- `frontend/src/customization/fonts.ts` — the **approved font catalog**. Fonts are loaded only
  from fixed Google Fonts URLs; user-supplied font URLs are never fetched.
- `frontend/src/customization/CustomizationProvider.tsx` — the engine. Sanitizes stored/local
  preferences, applies tokens to `:root`, persists locally (immediate) and to the server
  (debounced), manages presets, and computes contrast warnings.

### What users can control

| Area | Options |
| --- | --- |
| Theme mode | Dark · Light · System (live-switch, no reload) |
| Preset theme | 8 presets with custom accent/background/surface/text overrides |
| Font | Inter, Manrope, Space Grotesk, Orbitron, Rajdhani, Classic Serif, System |
| Text size | Small → Extra large (semantic `--hl-font-*` scale) |
| UI scale | Compact · Comfortable · Spacious (spacing/padding/navigation density) |
| Radius | Sharp · Slight · Rounded · Very rounded |
| Animation | None · Reduced · Normal · High (`prefers-reduced-motion` always wins) |
| Effects | Glass blur · Glow · Gradients (each off/subtle/full) |
| Layout | Sidebar collapsed, compact chat, compact feed, dashboard widget visibility |
| Accessibility | High contrast, reduce-motion override, focus indicators |
| Presets | Save current look, apply, rename, duplicate, delete |

### Persistence & sync

- **Local (instant):** `localStorage` keys `hollowlink.appearance` / `.accessibility` /
  `.layout` / `.theme-presets`. The UI applies immediately, even offline or signed out.
- **Server (debounced 1.5 s):** `PUT /api/preferences` stores validated JSON columns
  (`user_preferences` table). Signed-in users get their look back on any browser via a
  one-time hydrate from `GET /api/preferences`.
- **Validation:** every read/write is parsed with Zod (`preferences.service.ts`). Malformed
  stored rows fall back to defaults instead of breaking the app; unknown fields are dropped.

### Tokens

Components consume semantic variables only: `--hl-bg`, `--hl-surface`, `--hl-text`,
`--hl-text-muted`, `--hl-primary`, `--hl-secondary`, `--hl-border`, `--hl-radius-*`,
`--hl-font-*`, `--hl-pad-*`, `--hl-transition`. Effect levels are driven by `data-*`
attributes on `:root` (`data-glass`, `data-glow`, `data-gradients`, `data-anim`,
`data-contrast`, `data-density`, `data-chat`).

### Public React API

```ts
useAppearance()     // full customization context (setAppearance, presets, restoreDefaults…)
useHollowTheme()    // alias, spec naming
useUserPreferences()// validated { appearance, accessibility, layout }
```

### Accessibility guardrails

- Text/background contrast is checked when custom colors are used; a visible warning appears
  in Appearance when the combination is unreadable.
- `prefers-reduced-motion` globally clamps animation regardless of the user's animation level.
- High-contrast mode strengthens borders and raises dim text to full contrast.
- Focus indicators, keyboard navigation, and ARIA labels are unaffected by any theme.

---

## 2. Extension Framework

Extensions are modular features that integrate with HollowLink **only** through declared,
permission-gated surfaces. The core never trusts extension code.

### Manifest

Every extension declares a validated manifest (backend: `extensions.service.ts` with Zod;
frontend mirror: `extensions/types.ts`):

```json
{
  "id": "vendor.name",
  "name": "My Extension",
  "version": "1.0.0",
  "author": "…",
  "icon": "🧩",
  "platforms": ["desktop", "mobile"],
  "permissions": ["events.read"],
  "capabilities": ["panel", "dashboard-widget"],
  "routes": [{ "path": "/extensions/my-ext", "title": "My Extension" }],
  "minCoreVersion": "0.1.0"
}
```

Validation covers: dot-namespaced id, semver, platform list, permission whitelist, route path
shape, and core-version compatibility. Invalid manifests are rejected outright.

### Permissions

Approved permissions: `profile.read`, `profile.write`, `friends.read`, `groups.read`,
`chat.read`, `chat.write`, `notifications.write`, `events.read`, `events.write`,
`external_links`.

- A manifest may **request** permissions; users **grant** them explicitly at enable time.
- The granted set is always intersected with the declared set — requesting more than the
  manifest declares grants nothing (tested).
- The runtime gate is `extensionAuthorized(userId, extensionId, permission)` (backend) and
  `context.hasPermission(permission)` (frontend) — both require *granted AND declared*.

### Storage model

```
extensions          — manifests (builtin seed at boot; future: third-party)
user_extensions     — per-user install state: enabled, granted_permissions, settings
```

(`0002_preferences_extensions` migration; `extension_settings` is folded into
`user_extensions.settings_json` until third-party packaging arrives.)

### API surface

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/api/extensions` | Catalog + current user's install state |
| POST | `/api/extensions/:id/enable` | Enable with chosen permissions |
| POST | `/api/extensions/:id/disable` | Disable (idempotent, settings preserved) |
| PUT | `/api/extensions/:id/settings` | Flat primitive settings map (≤ 32 keys) |

All routes require auth; settings are rejected unless the extension is enabled; nested
objects in settings are rejected.

### Sandboxing rules (architectural)

- Extension code never touches the database, filesystem, session secrets, or Socket.IO.
- The only sanctioned path is: permission request → user consent → HollowLink authorization
  layer (`extensionAuthorized`) → allowed API. Bypassing core authorization is impossible by
  construction — every future server-side extension API must call `extensionAuthorized` first.
- Frontend panels receive only an `ExtensionContext` (`extensionId`, `settings`,
  `hasPermission`). Routes refuse to render disabled extensions.
- `external_links` exists as a *future* permission: rendering any off-site URL from extension
  content will require it.

### Future capabilities (interfaces ready, none implemented)

- **Video meetings (Zoom/Meet):** `capabilities: ['panel', 'event-attach']` +
  `events.read/write` — create meeting, get link, attach to event.
- **Games (chess etc.):** `capabilities: ['panel', 'chat-tool']` + game-session data owned by
  the extension, invitations via `notifications.write`, results via core APIs.
- **Dashboard widgets:** `capabilities: ['dashboard-widget']`; the `LayoutPrefs.dashboardWidgets`
  array is the visibility contract a future widget drag-and-drop UI will edit.

### Demo extensions (harmless, prove the loop)

| Extension | Proves |
| --- | --- |
| 👋 Hello HollowLink | zero-permission panel, route hosting, settings round-trip |
| 🎨 Theme Showcase | reading presentation state via the approved hook |
| 🧩 Test Widget | widget capability + boolean setting |

Enable them under **Settings → Extensions** (also in the sidebar footer).

---

## 3. Testing

- `backend/tests/preferences.test.ts` — defaults, partial merges, validation rejects,
  corrupt-row fallback, deletion.
- `backend/tests/extensions.test.ts` — manifest validation, version compatibility, permission
  clamping, enable/disable lifecycle, settings rules, cross-user isolation.
- `frontend/tests/customization.test.tsx` — preference sanitization, preset integrity, font
  source safety, contrast sanity of every preset.
- `frontend/tests/extensions.test.tsx` — client manifest checks, enable/disable round-trip,
  disabled-extension route refusal, controlled-context rendering.
