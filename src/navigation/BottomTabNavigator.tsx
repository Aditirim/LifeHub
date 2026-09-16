/**
 * BottomTabNavigator — The main bottom navigation bar.
 *
 * Tabs: Home | Calendar | Habits | Money | Profile
 * Each tab icon uses MaterialCommunityIcons.
 * The tab bar is styled to match the current theme.
 */

import React from 'react';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

import { BottomTabParamList } from './types';
import { useTheme } from '../context/ThemeContext';

// Screen imports
import HomeScreen from '../screens/dashboard/HomeScreen';
import CalendarScreen from '../screens/calendar/CalendarScreen';
import HabitsScreen from '../screens/habits/HabitsScreen';
import MoneyScreen from '../screens/money/MoneyScreen';
import ProfileScreen from '../screens/profile/ProfileScreen';

const Tab = createBottomTabNavigator<BottomTabParamList>();

export default function BottomTabNavigator() {
  const { colors, isDark } = useTheme();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        // ── Header ──────────────────────────────────────────────────────────
        headerShown: false,

        // ── Tab bar icon ─────────────────────────────────────────────────────
        tabBarIcon: ({ focused, color, size }) => {
          // Map each tab name to an icon (filled when focused, outlined otherwise)
          const icons: Record<string, { active: string; inactive: string }> = {
            Home:     { active: 'home',           inactive: 'home-outline' },
            Calendar: { active: 'calendar-month', inactive: 'calendar-month-outline' },
            Habits:   { active: 'check-circle',   inactive: 'check-circle-outline' },
            Money:    { active: 'wallet',          inactive: 'wallet-outline' },
            Profile:  { active: 'account-circle', inactive: 'account-circle-outline' },
          };
          const iconSet = icons[route.name] ?? { active: 'circle', inactive: 'circle-outline' };
          const iconName = focused ? iconSet.active : iconSet.inactive;
          return <Icon name={iconName} size={24} color={color} />;
        },

        // ── Tab bar styling ──────────────────────────────────────────────────
        tabBarActiveTintColor:   colors.tabActive,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          backgroundColor: colors.tabBackground,
          borderTopColor:  colors.border,
          borderTopWidth:  1,
          paddingBottom:   Platform.OS === 'android' ? 8 : 20,
          paddingTop:      8,
          height:          Platform.OS === 'android' ? 64 : 84,
          elevation:       8,
        },
        tabBarLabelStyle: {
          fontSize:   11,
          fontWeight: '600',
          marginTop:  -2,
        },
      })}>
      <Tab.Screen name="Home"     component={HomeScreen}     options={{ tabBarLabel: 'Home' }} />
      <Tab.Screen name="Calendar" component={CalendarScreen} options={{ tabBarLabel: 'Calendar' }} />
      <Tab.Screen name="Habits"   component={HabitsScreen}   options={{ tabBarLabel: 'Habits' }} />
      <Tab.Screen name="Money"    component={MoneyScreen}    options={{ tabBarLabel: 'Money' }} />
      <Tab.Screen name="Profile"  component={ProfileScreen}  options={{ tabBarLabel: 'Profile' }} />
    </Tab.Navigator>
  );
}
