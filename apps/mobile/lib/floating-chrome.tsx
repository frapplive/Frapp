import {
  createContext,
  type ReactElement,
  useCallback,
  useContext,
  useRef,
} from "react";
import type {
  LayoutChangeEvent,
  NativeScrollEvent,
  NativeSyntheticEvent,
  ScrollViewProps,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { screenErrorLayout } from "@/components/route-error";

/**
 * Where the floating glass chrome sits (owner pick 2026-11-05, "Floating bar,
 * no glow"; `spec/ui/mobile/navigation.md` § Tab bar).
 *
 * The tab bar is a capsule that floats over the content rather than a strip
 * across the bottom, so screens scroll under it and need to know how much room
 * to leave. The floating create button sits above it, in the thumb's reach.
 */
export const FLOATING_TAB_BAR = {
  /** The drawn row: the same 62pt the docked bar had (#3344). */
  height: 62,
  /** Gap to each side of the window. */
  side: 14,
  /** Gap above the floating bar for the create button, and below content. */
  gap: 14,
  /**
   * The round glass + beside the bar on a tab screen, the bar's own height,
   * and the gap between the two (owner pick 2026-11-06). The gap is also the
   * space between the bar and the quick-actions panel above it.
   */
  actionButton: 62,
  actionGap: 10,
} as const;

/**
 * The deepest inset a bar may tuck into: the iPhone home indicator's 34pt.
 * Anything deeper is Android's three-button bar, whose buttons it must clear.
 */
const TUCKABLE_INSET = 34;

/**
 * The bar's distance from the window's bottom edge. Over a home indicator or
 * a gesture bar it tucks 8pt into the inset, as iOS's own floating bar does,
 * never closer than 12pt to the edge on a device with no inset. Over
 * Android's three-button bar it sits wholly above the buttons.
 */
export function floatingTabBarBottom(bottomInset: number): number {
  if (bottomInset > TUCKABLE_INSET) return bottomInset + 4;
  return Math.max(bottomInset - 8, 12);
}

/** The top of the bar, measured up from the window's bottom edge. */
export function floatingTabBarTop(bottomInset: number): number {
  return floatingTabBarBottom(bottomInset) + FLOATING_TAB_BAR.height;
}

type FloatingChrome = { tabBar: boolean };

const FloatingChromeContext = createContext<FloatingChrome>({ tabBar: false });

/** Whether this screen sits over the floating tab bar. */
export function useFloatingChrome(): FloatingChrome {
  return useContext(FloatingChromeContext);
}

/**
 * Bottom padding a scrolling screen adds inside its safe area so its last row
 * clears the floating bar. 0 where no bar floats: any screen pushed over the
 * tabs, or anything outside them.
 */
export function useTabBarClearance(): number {
  const { tabBar } = useFloatingChrome();
  const { bottom } = useSafeAreaInsets();
  if (!tabBar) return 0;
  return Math.max(floatingTabBarTop(bottom) - bottom, 0) + FLOATING_TAB_BAR.gap;
}

/** What a tab screen is told: the floating bar sits over all four. */
const UNDER_TAB_BAR: FloatingChrome = { tabBar: true };

/**
 * The tab navigator's `screenLayout`: the error boundary every screen already
 * gets (`screenErrorLayout`), plus that the bar floats over it. Only the four
 * tabs sit under the bar; a screen pushed over them (`app/(app)/_layout.tsx`)
 * covers it and reads the default, no bar. Module-level for the same reason
 * `screenErrorLayout` is: an inline arrow would remount every screen on each
 * render of the layout.
 */
export function floatingScreenLayout(
  props: Parameters<typeof screenErrorLayout>[0],
): ReactElement {
  return (
    <FloatingChromeContext.Provider value={UNDER_TAB_BAR}>
      {screenErrorLayout(props)}
    </FloatingChromeContext.Provider>
  );
}

/** Where the body of a screen is scrolled: its offset, viewport and content height. */
export type ScreenScroll = { y: number; viewport: number; content: number };

/**
 * A screen that reads where its own body is scrolled (Chat home's New unreads
 * pills, #6045; Documents) wraps its `ScreenShell` in this, and the shell's
 * scroll handlers ({@link useScreenScroll}) report every move to it.
 */
const ScreenScrollWatch = createContext<
  ((scroll: ScreenScroll) => void) | null
>(null);
export const ScreenScrollWatchProvider = ScreenScrollWatch.Provider;

type ScreenScrollProps = Pick<
  ScrollViewProps,
  "onScroll" | "scrollEventThrottle" | "onContentSizeChange" | "onLayout"
>;

/**
 * What a screen's scroll view spreads onto itself so a
 * {@link ScreenScrollWatchProvider} above it hears every move: the scroll
 * handler (throttled to 16ms), and its content size and layout, so a list
 * that changes length is reported with no scroll event. Empty where no screen
 * watches. `ScreenShell` spreads it for every screen it hosts.
 *
 * Until #5983 this was `useBarScroll`, which also folded the tab bar while
 * the member read down a tab (#4904); the fold went with the Frapp
 * Intelligence bar it made room for.
 */
export function useScreenScroll(): ScreenScrollProps {
  const watch = useContext(ScreenScrollWatch);
  const state = useRef<ScreenScroll>({ y: 0, viewport: 0, content: 0 });
  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, layoutMeasurement, contentSize } =
        event.nativeEvent;
      state.current = {
        y: contentOffset.y,
        viewport: layoutMeasurement.height,
        content: contentSize.height,
      };
      watch?.(state.current);
    },
    [watch],
  );
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      state.current = {
        ...state.current,
        viewport: event.nativeEvent.layout.height,
      };
      watch?.(state.current);
    },
    [watch],
  );
  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      state.current = { ...state.current, content: height };
      watch?.(state.current);
    },
    [watch],
  );
  return watch
    ? { onScroll, scrollEventThrottle: 16, onContentSizeChange, onLayout }
    : {};
}
