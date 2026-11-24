import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => {
  cleanup();
  sessionStorage.clear();
  localStorage.clear();
});

// jsdom lacks these browser APIs used by MUI / the viewer
class RO {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
}
globalThis.ResizeObserver ??= RO as unknown as typeof ResizeObserver;
/** Behave like a wide desktop window: min-width queries match, everything else does not. */
window.matchMedia = ((q: string) => ({ matches: /min-width/.test(q), media: q, onchange: null, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
window.HTMLElement.prototype.scrollIntoView ??= () => {};
