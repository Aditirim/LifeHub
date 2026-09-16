/**
 * useTimer — absolute-timestamp countdown timer hook.
 *
 * The source of truth is `targetTimestamp` (epoch ms when timer finishes),
 * NOT a decrementing counter driven by setInterval.
 *
 * This means: if the user backgrounds the app and comes back, the displayed
 * remaining time is always correct (remaining = targetTimestamp - Date.now()).
 *
 * The setInterval here only drives UI re-renders.
 *
 * When started, a native AlarmManager notification is scheduled so the timer
 * fires even when the app is completely closed.
 */

import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { scheduleTimer, cancelTimer } from '../native/AlarmModule';

const TIMER_KEY = '@lifehub_timer';

export type TimerStatus = 'idle' | 'running' | 'paused' | 'done';

interface TimerState {
  status:              TimerStatus;
  targetTimestamp:     number;  // epoch ms when timer reaches 0
  remainingMsAtPause:  number;  // ms remaining when paused
  totalMs:             number;  // original duration (for progress display)
  label:               string;
  nativeTimerId:       string;  // for cancelling the AlarmManager notification
}

const INITIAL: TimerState = {
  status:             'idle',
  targetTimestamp:    0,
  remainingMsAtPause: 0,
  totalMs:            0,
  label:              '',
  nativeTimerId:      '',
};

function getRemaining(s: TimerState): number {
  if (s.status === 'idle' || s.status === 'done') return 0;
  if (s.status === 'paused') return s.remainingMsAtPause;
  return Math.max(0, s.targetTimestamp - Date.now());
}

export function useTimer() {
  const [state,     setState]     = useState<TimerState>(INITIAL);
  const [remaining, setRemaining] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const stateRef    = useRef<TimerState>(INITIAL);

  // ── Load persisted state ──────────────────────────────────────────────────

  useEffect(() => {
    AsyncStorage.getItem(TIMER_KEY).then(raw => {
      if (!raw) return;
      try {
        const persisted: TimerState = JSON.parse(raw);
        // Check if a running timer already expired while app was closed
        if (persisted.status === 'running') {
          const rem = getRemaining(persisted);
          if (rem <= 0) {
            // Timer expired while app was away — show done state
            const done = { ...persisted, status: 'done' as TimerStatus };
            applyState(done);
            return;
          }
        }
        applyState(persisted);
        if (persisted.status === 'running') startDisplayLoop();
      } catch {}
    });
    return () => clearInterval(intervalRef.current);
  }, []);

  // ── Internal helpers ──────────────────────────────────────────────────────

  function applyState(s: TimerState) {
    stateRef.current = s;
    setState(s);
    setRemaining(getRemaining(s));
    AsyncStorage.setItem(TIMER_KEY, JSON.stringify(s)).catch(() => {});
  }

  function startDisplayLoop() {
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(() => {
      const rem = getRemaining(stateRef.current);
      setRemaining(rem);
      if (rem <= 0 && stateRef.current.status === 'running') {
        clearInterval(intervalRef.current);
        applyState({ ...stateRef.current, status: 'done' });
      }
    }, 500);
  }

  // ── Controls ──────────────────────────────────────────────────────────────

  const start = useCallback(async (durationMs: number, label: string = 'Timer') => {
    clearInterval(intervalRef.current);
    const targetTimestamp = Date.now() + durationMs;

    // Cancel any previous native timer
    if (stateRef.current.nativeTimerId) {
      await cancelTimer(stateRef.current.nativeTimerId).catch(() => {});
    }

    // Schedule native notification for when timer completes
    const nativeTimerId = await scheduleTimer(durationMs, label).catch(() => '');

    const s: TimerState = {
      status:             'running',
      targetTimestamp,
      remainingMsAtPause: durationMs,
      totalMs:            durationMs,
      label,
      nativeTimerId,
    };
    applyState(s);
    startDisplayLoop();
  }, []);

  const pause = useCallback(async () => {
    clearInterval(intervalRef.current);
    const rem = getRemaining(stateRef.current);
    // Cancel the native notification (we'll reschedule when resumed)
    if (stateRef.current.nativeTimerId) {
      await cancelTimer(stateRef.current.nativeTimerId).catch(() => {});
    }
    applyState({ ...stateRef.current, status: 'paused', remainingMsAtPause: rem, nativeTimerId: '' });
  }, []);

  const resume = useCallback(async () => {
    if (stateRef.current.status !== 'paused') return;
    const rem             = stateRef.current.remainingMsAtPause;
    const targetTimestamp = Date.now() + rem;
    const nativeTimerId   = await scheduleTimer(rem, stateRef.current.label).catch(() => '');
    applyState({ ...stateRef.current, status: 'running', targetTimestamp, nativeTimerId });
    startDisplayLoop();
  }, []);

  const reset = useCallback(async () => {
    clearInterval(intervalRef.current);
    if (stateRef.current.nativeTimerId) {
      await cancelTimer(stateRef.current.nativeTimerId).catch(() => {});
    }
    applyState(INITIAL);
  }, []);

  const progress = state.totalMs > 0 ? remaining / state.totalMs : 0;

  return {
    status: state.status,
    remaining,   // ms — always accurate
    totalMs: state.totalMs,
    progress,    // 0 → 1
    label: state.label,
    start,
    pause,
    resume,
    reset,
  };
}
