import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Minimal fetch mock: tests stub responses per-endpoint via vi.stubGlobal.
if (!globalThis.fetch) {
  globalThis.fetch = vi.fn(async () => new Response(JSON.stringify({ success: true, data: null, error: null }), { status: 200 }));
}

// jsdom lacks IntersectionObserver — the feed's infinite scroll uses it.
class MockIntersectionObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}
if (typeof globalThis.IntersectionObserver === 'undefined') {
  (globalThis as unknown as { IntersectionObserver: typeof MockIntersectionObserver }).IntersectionObserver = MockIntersectionObserver;
}
