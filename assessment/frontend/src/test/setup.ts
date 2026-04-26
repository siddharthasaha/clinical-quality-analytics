import '@testing-library/jest-dom';
import { server } from './server';
import { beforeAll, afterEach, afterAll } from 'vitest';

// Recharts uses ResizeObserver which is not available in jsdom
class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}
global.ResizeObserver = ResizeObserverMock;

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
