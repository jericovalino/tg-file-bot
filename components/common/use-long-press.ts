"use client";

import { useCallback, useRef } from "react";

const HOLD_MS = 450;
const MOVE_TOLERANCE_PX = 10;

/**
 * Pointer-based long press. Returns handlers to spread on the element; `onLongPress` fires once after the hold.
 * The click that the browser emits when the finger lifts is swallowed so the element's normal tap action
 * doesn't also run.
 */
export function useLongPress(onLongPress: (() => void) | undefined) {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);

  const clear = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = null;
    origin.current = null;
  }, []);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!onLongPress || e.button !== 0) return;
      fired.current = false;
      origin.current = { x: e.clientX, y: e.clientY };
      timer.current = window.setTimeout(() => {
        timer.current = null;
        fired.current = true;
        onLongPress();
      }, HOLD_MS);
    },
    [onLongPress],
  );

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!origin.current) return;
      if (Math.abs(e.clientX - origin.current.x) > MOVE_TOLERANCE_PX || Math.abs(e.clientY - origin.current.y) > MOVE_TOLERANCE_PX) clear();
    },
    [clear],
  );

  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (!fired.current) return;
    fired.current = false;
    e.stopPropagation();
    e.preventDefault();
  }, []);

  const onContextMenu = useCallback(
    (e: React.MouseEvent) => {
      // Touch long-press also raises contextmenu; keep the browser's menu out of the way.
      if (onLongPress) e.preventDefault();
    },
    [onLongPress],
  );

  return { onPointerDown, onPointerMove, onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear, onClickCapture, onContextMenu };
}
