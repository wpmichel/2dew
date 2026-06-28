import "@testing-library/jest-dom";

// jsdom has no IntersectionObserver; provide a no-op so components that use it can render in tests.
// Tests that need to drive intersections install their own controllable stub via vi.stubGlobal
class NoopIntersectionObserver {
    observe() {}
    unobserve() {}
    disconnect() {}
    takeRecords(): IntersectionObserverEntry[] {
        return [];
    }
}
globalThis.IntersectionObserver =
    NoopIntersectionObserver as unknown as typeof IntersectionObserver;
