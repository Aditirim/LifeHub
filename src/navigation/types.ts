/**
 * Navigation Type Definitions
 *
 * Defines TypeScript types for all navigation stacks and their params.
 * This gives full type safety when using useNavigation() and route.params.
 */

import { Alarm } from '../native/AlarmModule';

// ─── Auth Stack ───────────────────────────────────────────────────────────────

export type AuthStackParamList = {
  Login:          undefined;
  Register:       undefined;
  ForgotPassword: undefined;
};

// ─── Bottom Tab Navigator ─────────────────────────────────────────────────────

export type BottomTabParamList = {
  Home:     undefined;
  Calendar: undefined;
  Habits:   undefined;
  Money:    undefined;
  Profile:  undefined;
};

// ─── Main Stack ───────────────────────────────────────────────────────────────

export type MainStackParamList = {
  MainTabs:      undefined;
  Weather:       undefined;
  Notes:         undefined;
  Clock:         undefined;
  AlarmEdit:     { alarm?: Alarm };       // undefined alarm = create new
  AlarmSettings: undefined;
};
