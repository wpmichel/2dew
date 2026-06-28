import { useRef } from "react";
import { act, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useInfiniteScroll } from "./useInfiniteScroll";

// Controllable IntersectionObserver stub: records each created observer so a test can fire an
// intersection on demand and inspect what is being observed.
let observers: MockObserver[] = [];

class MockObserver {
  callback: IntersectionObserverCallback;
  options?: IntersectionObserverInit;
  elements = new Set<Element>();

  constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
    this.callback = callback;
    this.options = options;
    observers.push(this);
  }

  observe = (el: Element) => this.elements.add(el);
  unobserve = (el: Element) => this.elements.delete(el);
  disconnect = () => this.elements.clear();
  takeRecords = (): IntersectionObserverEntry[] => [];

  fire(isIntersecting: boolean) {
    this.callback(
      [...this.elements].map((target) => ({ isIntersecting, target }) as IntersectionObserverEntry),
      this as unknown as IntersectionObserver,
    );
  }
}

beforeEach(() => {
  observers = [];
  vi.stubGlobal("IntersectionObserver", MockObserver);
});

afterEach(() => vi.unstubAllGlobals());

// Mirrors how TasksPage/CompletedSection use the hook: a bounded <ul> root with a sentinel <li>
// rendered only while there is more to load.
function Harness(props: { onLoadMore: () => void; hasMore: boolean; loading: boolean }) {
  const rootRef = useRef<HTMLUListElement | null>(null);
  const sentinelRef = useInfiniteScroll({
    onLoadMore: props.onLoadMore,
    hasMore: props.hasMore,
    loading: props.loading,
    root: rootRef,
  });
  return <ul ref={rootRef}>{props.hasMore && <li ref={sentinelRef} data-testid="sentinel" />}</ul>;
}

describe("useInfiniteScroll", () => {
  it("calls onLoadMore when the sentinel scrolls into view", () => {
    const onLoadMore = vi.fn();
    render(<Harness onLoadMore={onLoadMore} hasMore loading={false} />);

    expect(observers).toHaveLength(1);
    expect(observers[0].elements.size).toBe(1); // observing the sentinel

    act(() => observers[0].fire(true));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it("does not call onLoadMore while a page is already loading", () => {
    const onLoadMore = vi.fn();
    render(<Harness onLoadMore={onLoadMore} hasMore loading={true} />);

    act(() => observers[0].fire(true));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("does not observe anything when there is nothing more to load", () => {
    const onLoadMore = vi.fn();
    render(<Harness onLoadMore={onLoadMore} hasMore={false} loading={false} />);

    // No sentinel renders, so no observer is created and onLoadMore can never fire.
    expect(observers.every((o) => o.elements.size === 0)).toBe(true);
    observers.forEach((o) => act(() => o.fire(true)));
    expect(onLoadMore).not.toHaveBeenCalled();
  });

  it("stops observing once the last page is loaded", () => {
    const onLoadMore = vi.fn();
    const { rerender } = render(<Harness onLoadMore={onLoadMore} hasMore loading={false} />);
    const observer = observers[0];
    expect(observer.elements.size).toBe(1);

    // hasMore flips to false → sentinel unmounts → observer disconnects.
    rerender(<Harness onLoadMore={onLoadMore} hasMore={false} loading={false} />);
    expect(observer.elements.size).toBe(0);
  });
});
