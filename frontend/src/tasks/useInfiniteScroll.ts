import {
    useCallback,
    useEffect,
    useRef,
    useState,
    type RefObject,
} from "react";

interface InfiniteScrollOptions<R extends Element> {
    onLoadMore: () => void;
    hasMore: boolean;
    loading: boolean;
    // The scroll container the sentinel lives in; intersection is measured against it (not the
    // window), so a bounded `overflow-y: auto` list still triggers correctly.
    root: RefObject<R | null>;
    rootMargin?: string;
}

// Calls onLoadMore when the returned sentinel scrolls into view within `root`.
// The caller's loadMore already guards against double-fetching, so repeated intersections are harmless.
// `rootMargin` prefetches the next page before the user reaches the very bottom.
//
// Returns a callback ref. Capturing the sentinel node in state makes the
// observer effect re-run whenever the sentinel mounts or unmounts - e.g. when the collapsible
// completed section opens, or when hasMore flips - and guarantees the container ref is committed
// before the observer reads it.
export function useInfiniteScroll<R extends Element>({
    onLoadMore,
    hasMore,
    loading,
    root,
    rootMargin = "200px",
}: InfiniteScrollOptions<R>): (node: HTMLLIElement | null) => void {
    const [sentinel, setSentinel] = useState<HTMLLIElement | null>(null);

    // Hold the latest callback/flag in refs so toggling them doesn't tear the observer down and
    // rebuild it mid-scroll.
    const onLoadMoreRef = useRef(onLoadMore);
    const loadingRef = useRef(loading);
    useEffect(() => {
        onLoadMoreRef.current = onLoadMore;
        loadingRef.current = loading;
    });

    useEffect(() => {
        if (!sentinel || !hasMore) return;

        const observer = new IntersectionObserver(
            (entries) => {
                if (
                    entries.some((entry) => entry.isIntersecting) &&
                    !loadingRef.current
                ) {
                    onLoadMoreRef.current();
                }
            },
            { root: root.current, rootMargin },
        );
        observer.observe(sentinel);
        return () => observer.disconnect();
    }, [sentinel, hasMore, root, rootMargin]);

    return useCallback((node: HTMLLIElement | null) => setSentinel(node), []);
}
