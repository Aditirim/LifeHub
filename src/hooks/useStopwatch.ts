/**
 * useStopwatch — timestamp-based stopwatch hook.
 *
 * Uses Date.now() as the source of truth, NOT setInterval counts.
 * State is persisted to AsyncStorage so it survives app restarts.
 *
 * Elapsed time calculation:
 *  - Running:  elapsed = accumulatedMs + (Date.now() - startTimestamp)
 *  - Paused:   elapsed = accumulatedMs
 *
 * The setInterval here only drives UI re-renders (display updates every 10ms).
 * The ACTUAL elapsed time is always computed from timestamps.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

const SW_KEY = '@lifehub_stopwatch';

interface StopwatchState {
  running:          boolean;
  startTimestamp:   number;  // epoch ms when last started
  accumulatedMs:    number;  // ms elapsed before last pause
  laps:             number[]; // accumulated ms at each lap moment
}

const INITIAL: StopwatchState = {
  running:        false,
  startTimestamp: 0,
  accumulatedMs:  0,
  laps:           [],
};

function getElapsed(state: StopwatchState): number {
  if (!state.running) return state.accumulatedMs;
  return state.accumulatedMs + (Date.now() - state.startTimestamp);
}

export function useStopwatch() {
  const [state,   setState]   = useState<StopwatchState>(INITIAL);
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stateRef    = useRef<StopwatchState>(INITIAL);

  // ── Load persisted state ──────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(SW_KEY).then(raw => {
      if (!raw) return;
      try {
        const persisted: StopwatchState = JSON.parse(raw);
        stateRef.current = persisted;
        setState(persisted);
        setElapsed(getElapsed(persisted));
        if (persisted.running) startDisplayLoop(persisted);
      } catch {}
    });
    return () => clearInterval(intervalRef.current);
  }, []);

  // ── Persist on every state change ────────────────────────────────────────

  const persist = useCallback((s: StopwatchState) => {
    stateRef.current = s;
    setState(s);
    setElapsed(getElapsed(s));
    AsyncStorage.setItem(SW_KEY, JSON.stringify(s)).catch(() => {});
  }, []);

  // ── Display loop ──────────────────────────────────────────────────────────

  function startDisplayLoop(s: StopwatchState) {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      setElapsed(getElapsed(stateRef.current));
    }, 10); // 10ms refresh for centisecond accuracy
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  const start = useCallback(() => {
    const s: StopwatchState = {
      ...stateRef.current,
      running:        true,
      startTimestamp: Date.now(),
    };
    persist(s);
    startDisplayLoop(s);
  }, [persist]);

  const pause = useCallback(() => {
    clearInterval(intervalRef.current);
    const s: StopwatchState = {
      ...stateRef.current,
      running:       false,
      accumulatedMs: getElapsed(stateRef.current),
    };
    persist(s);
  }, [persist]);

  const reset = useCallback(() => {
    clearInterval(intervalRef.current);
    persist(INITIAL);
  }, [persist]);

  const lap = useCallback(() => {
    const current = getElapsed(stateRef.current);
    const s: StopwatchState = {
      ...stateRef.current,
      laps: [...stateRef.current.laps, current],
    };
    persist(s);
  }, [persist]);

  return {
    elapsed,                 // ms — always correct
    running: state.running,
    laps:    state.laps,
    start,
    pause,
    reset,
    lap,
  };
}
