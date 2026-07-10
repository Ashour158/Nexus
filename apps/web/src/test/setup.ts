/// <reference types="@testing-library/jest-dom" />
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach, beforeAll, afterAll, vi } from 'vitest';
import { server } from './msw/server';

// Polyfill ResizeObserver for recharts / other libraries
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', ResizeObserverMock);

// Polyfill matchMedia if missing
if (typeof window !== 'undefined' && !window.matchMedia) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/',
}));

// Mock Zustand stores (reset between tests)
// Must support both hook pattern useAuthStore(selector) and imperative useAuthStore.getState()
vi.mock('@/stores/auth.store', () => {
  const state = {
    accessToken: 'test-token',
    tenantId: 'test-tenant',
    userId: 'test-user',
    roles: ['ADMIN'],
    clearSession: vi.fn(),
    setAccessToken: vi.fn(),
    refreshToken: 'mock-refresh-token',
    // Permission gate used by many pages; default-allow in tests so page bodies
    // (not just the "no access" branch) render for accessibility scanning.
    hasPermission: () => true,
    hasRole: () => true,
  };
  const useAuthStore = (selector?: (s: typeof state) => unknown) =>
    selector ? selector(state) : state;
  useAuthStore.getState = () => state;
  return { useAuthStore };
});

// Start MSW before tests
beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => {
  cleanup();
  server.resetHandlers();
});
afterAll(() => server.close());
