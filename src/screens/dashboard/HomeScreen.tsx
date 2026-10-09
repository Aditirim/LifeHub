/**
 * HomeScreen — Main Dashboard (Firestore v26 Modular API).
 *
 * Shows a complete overview of the user's day:
 *  1. Gradient header with greeting + date + time
 *  2. Weather summary card (calls OpenWeatherMap)
 *  3. Today's calendar events card
 *  4. Habit progress card (X/Y completed)
 *  5. Today's expense summary
 *  6. Quick access grid: Weather, Notes, Clock, Calendar, Habits, Money
 */

import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, StatusBar, Platform,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { format } from 'date-fns';
import {
  query, where, onSnapshot,
} from '@react-native-firebase/firestore';

import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import { MainStackParamList } from '../../navigation/types';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS } from '../../constants/colors';
import { getGreeting, formatCurrency } from '../../utils/formatters';
import {
  habitsCollection, eventsCollection, transactionsCollection,
} from '../../services/firebase';
import Geolocation from '@react-native-community/geolocation';
import { fetchCurrentWeather, CurrentWeather, getWeatherIconName } from '../../services/weatherService';

type NavProp = NativeStackNavigationProp<MainStackParamList>;

interface Module {
  key: string;
  label: string;
  icon: string;
  gradient: string[];
  nav?: keyof MainStackParamList;
  tab?: string;
}

const MODULES: Module[] = [
  { key: 'weather', label: 'Weather', icon: 'weather-partly-cloudy', gradient: GRADIENTS.blue, nav: 'Weather' },
  { key: 'notes', label: 'Notes', icon: 'note-text-outline', gradient: GRADIENTS.amber, nav: 'Notes' },
  { key: 'clock', label: 'Clock', icon: 'alarm', gradient: GRADIENTS.teal, nav: 'Clock' },
  { key: 'calendar', label: 'Calendar', icon: 'calendar-month-outline', gradient: GRADIENTS.rose, tab: 'Calendar' },
  { key: 'habits', label: 'Habits', icon: 'check-circle-outline', gradient: GRADIENTS.green, tab: 'Habits' },
  { key: 'money', label: 'Money', icon: 'wallet-outline', gradient: GRADIENTS.primary, tab: 'Money' },
];

export default function HomeScreen() {
  const navigation = useNavigation<NavProp>();
  const { user } = useAuth();
  const { colors, isDark } = useTheme();

  const [currentTime, setCurrentTime] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [weather, setWeather] = useState<CurrentWeather | null>(null);
  const [weatherError, setWeatherError] = useState('');
  const [todayEvents, setTodayEvents] = useState<any[]>([]);
  const [habits, setHabits] = useState<any[]>([]);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [refreshing, setRefreshing] = useState(false);

  const uid = user?.uid ?? '';
  const today = format(new Date(), 'yyyy-MM-dd');

  // Clock
  useEffect(() => {
    timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // Weather
  function loadWeather() {
    Geolocation.getCurrentPosition(
      async pos => {
        try {
          const data = await fetchCurrentWeather(pos.coords.latitude, pos.coords.longitude);
          setWeather(data);
          setWeatherError('');
        } catch (e: any) {
          setWeatherError(e.message ?? 'Weather unavailable');
        }
      },
      () => setWeatherError('Location unavailable'),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 600000 },
    );
  }

  useEffect(() => { loadWeather(); }, []);

  // Firestore listeners
  useEffect(() => {
    if (!uid) return;

    const eventsRef = eventsCollection(uid);
    const eventsQ = query(eventsRef, where('date', '==', today));
    const unsubEvents = onSnapshot(eventsQ, snap => {
      setTodayEvents(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }, () => setTodayEvents([]));

    const habitsRef = habitsCollection(uid);
    const unsubHabits = onSnapshot(habitsRef, snap => {
      setHabits(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }, () => setHabits([]));

    const txRef = transactionsCollection(uid);
    const txQ = query(txRef, where('type', '==', 'expense'));
    const unsubTx = onSnapshot(txQ, snap => {
      const total = snap.docs
        .filter((d: any) => {
          const txDate = d.data().date;
          const txDay = txDate?.toDate
            ? format(txDate.toDate(), 'yyyy-MM-dd')
            : (txDate?.split?.('T')?.[0] ?? '');
          return txDay === today;
        })
        .reduce((sum: number, d: any) => sum + (d.data().amount ?? 0), 0);
      setTodayExpenses(total);
    }, () => setTodayExpenses(0));

    return () => { unsubEvents(); unsubHabits(); unsubTx(); };
  }, [uid, today]);

  // Pull-to-refresh
  function onRefresh() {
    setRefreshing(true);
    loadWeather();
    setTimeout(() => setRefreshing(false), 1500);
  }

  // Derived
  const habitsCompletedToday = habits.filter(h =>
    Array.isArray(h.completedDates) && h.completedDates.includes(today),
  ).length;
  const habitProgress = habits.length > 0 ? habitsCompletedToday / habits.length : 0;

  function navigateToModule(mod: Module) {
    if (mod.nav) { navigation.push(mod.nav as any); }
    else if (mod.tab) { (navigation as any).navigate('MainTabs', { screen: mod.tab }); }
  }

  const headerGradient: string[] = isDark
    ? GRADIENTS.headerDark
    : GRADIENTS.headerLight;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* @ts-ignore: translucent is a valid Android-only StatusBar prop */}
      <StatusBar barStyle="light-content" translucent />
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={colors.primaryLight}
            colors={[colors.primary]}
          />
        }>

        {/* Header */}
        <LinearGradient
          colors={headerGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.header}>

          <View style={styles.greetRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.greeting}>
                {getGreeting()}, {user?.displayName?.split(' ')[0] ?? 'there'} 👋
              </Text>
              <Text style={styles.dateText}>{format(currentTime, 'EEEE, MMMM d')}</Text>
            </View>
            <View style={styles.clockBadge}>
              <Text style={styles.clockText}>{format(currentTime, 'HH:mm')}</Text>
              <Text style={styles.clockSeconds}>:{format(currentTime, 'ss')}</Text>
            </View>
          </View>

          {weather ? (
            <TouchableOpacity onPress={() => navigation.push('Weather')} activeOpacity={0.85}>
              <View style={styles.weatherCard}>
                <View style={styles.weatherCardInner}>
                  <View style={styles.weatherLeft}>
                    <Text style={styles.weatherTemp}>{weather.temperature}°</Text>
                    <Text style={styles.weatherCity}>{weather.city}, {weather.country}</Text>
                    <Text style={styles.weatherDesc}>{weather.description}</Text>
                  </View>
                  <View style={styles.weatherRight}>
                    <Icon name={getWeatherIconName(weather.icon)} size={56} color="rgba(255,255,255,0.92)" />
                    <View style={styles.weatherMetaRow}>
                      <Text style={styles.weatherMeta}>💧 {weather.humidity}%</Text>
                      <Text style={[styles.weatherMeta, { marginLeft: SPACING[3] }]}>
                        💨 {weather.windSpeed} km/h
                      </Text>
                    </View>
                  </View>
                </View>
                <View style={styles.weatherTapRow}>
                  <Text style={styles.weatherTapText}>Tap for full forecast</Text>
                  <Icon name="chevron-right" size={14} color="rgba(255,255,255,0.5)" />
                </View>
              </View>
            </TouchableOpacity>
          ) : (
            <View style={styles.weatherSkeleton}>
              <Icon
                name={weatherError ? 'weather-cloudy-alert' : 'cloud-sync-outline'}
                size={24}
                color="rgba(255,255,255,0.45)"
              />
              <Text style={styles.weatherErrorText}>{weatherError || 'Fetching weather…'}</Text>
            </View>
          )}
        </LinearGradient>

        {/* Stats Row */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Calendar' })}
            activeOpacity={0.8}>
            <View style={[styles.statIconCircle, { backgroundColor: isDark ? 'rgba(90,138,158,0.2)' : 'rgba(58,96,128,0.14)' }]}>
              <Icon name="calendar-today" size={20} color={colors.info} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>{todayEvents.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Events</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Habits' })}
            activeOpacity={0.8}>
            <View style={[styles.statIconCircle, { backgroundColor: isDark ? 'rgba(90,158,114,0.2)' : 'rgba(58,122,88,0.14)' }]}>
              <Icon name="check-circle-outline" size={20} color={colors.success} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>{habitsCompletedToday}/{habits.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Habits</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Money' })}
            activeOpacity={0.8}>
            <View style={[styles.statIconCircle, { backgroundColor: isDark ? 'rgba(194,107,92,0.2)' : 'rgba(168,64,64,0.14)' }]}>
              <Icon name="cash-minus" size={20} color={colors.error} />
            </View>
            <Text style={[styles.statNumber, { color: colors.text }]}>{formatCurrency(todayExpenses)}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Spent</Text>
          </TouchableOpacity>
        </View>

        {/* Today's Events */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Events</Text>
            <TouchableOpacity
              onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Calendar' })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.seeAll, { color: colors.primaryLight }]}>See all →</Text>
            </TouchableOpacity>
          </View>
          {todayEvents.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
              <Icon name="calendar-check-outline" size={32} color={colors.textMuted} />
              <View style={{ flex: 1 }}>
                <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>No events today</Text>
                <Text style={[styles.emptySubtitle, { color: colors.textMuted }]}>Enjoy your free day!</Text>
              </View>
            </View>
          ) : (
            todayEvents.slice(0, 3).map((event) => (
              <View key={event.id} style={[styles.eventItem, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
                <View style={[styles.eventAccent, { backgroundColor: colors.primary }]} />
                <View style={{ flex: 1, marginLeft: SPACING[3] }}>
                  <Text style={[styles.eventTitle, { color: colors.text }]} numberOfLines={1}>
                    {event.title}
                  </Text>
                  {event.startTime ? (
                    <Text style={[styles.eventTime, { color: colors.textSecondary }]}>{event.startTime}</Text>
                  ) : null}
                </View>
                <Icon name="chevron-right" size={16} color={colors.textMuted} />
              </View>
            ))
          )}
        </View>

        {/* Habit Progress */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Habit Progress</Text>
            <TouchableOpacity
              onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Habits' })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.seeAll, { color: colors.primaryLight }]}>See all →</Text>
            </TouchableOpacity>
          </View>
          <View style={[styles.habitCard, { backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1 }]}>
            <View style={styles.habitCardTop}>
              <View>
                <Text style={[styles.habitCount, { color: colors.text }]}>
                  {habitsCompletedToday}
                  <Text style={[styles.habitTotal, { color: colors.textSecondary }]}>/{habits.length}</Text>
                </Text>
                <Text style={[styles.habitSubtitle, { color: colors.textSecondary }]}>habits completed today</Text>
              </View>
              <View style={[
                styles.habitBadge,
                { backgroundColor: habitProgress === 1 ? (isDark ? '#1A3325' : '#C8EDD8') : (isDark ? '#263D30' : '#D8EDE8') },
              ]}>
                <Text style={[styles.habitBadgeText, { color: habitProgress === 1 ? colors.success : colors.primary }]}>
                  {habits.length > 0 ? `${Math.round(habitProgress * 100)}%` : '—'}
                </Text>
              </View>
            </View>
            <View style={[styles.progressTrack, { backgroundColor: isDark ? '#2E4035' : '#C8DDD8' }]}>
              <LinearGradient
                colors={GRADIENTS.green}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={[styles.progressFill, { width: `${habitProgress * 100}%` }]}
              />
            </View>
            <Text style={[styles.habitEncouragement, { color: colors.textMuted }]}>
              {habitProgress === 0
                ? "Let's get started! 💪"
                : habitProgress < 0.5
                  ? 'Keep going, you got this! 🔥'
                  : habitProgress < 1
                    ? 'Almost there! 🌟'
                    : 'All done! Amazing work! 🎉'}
            </Text>
          </View>
        </View>

        {/* Today's Spending */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Spending</Text>
            <TouchableOpacity
              onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Money' })}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.seeAll, { color: colors.primaryLight }]}>See all →</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Money' })}>
            <LinearGradient
              colors={isDark ? ['#1E3028', '#263D30'] : ['#31473A', '#4A6254']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.expenseCard}>
              <View style={styles.expenseCardContent}>
                <View>
                  <Text style={styles.expenseLabel}>Total Spent Today</Text>
                  <Text style={styles.expenseAmount}>{formatCurrency(todayExpenses)}</Text>
                </View>
                <View style={styles.expenseIconWrap}>
                  <Icon name="wallet-outline" size={32} color="rgba(255,255,255,0.85)" />
                </View>
              </View>
              <View style={styles.expenseTapRow}>
                <Text style={styles.expenseTapText}>View transactions</Text>
                <Icon name="arrow-right" size={14} color="rgba(255,255,255,0.55)" />
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </View>

        {/* Quick Access Grid */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Access</Text>
          <View style={styles.moduleGrid}>
            {MODULES.map(mod => (
              <TouchableOpacity
                key={mod.key}
                style={styles.moduleCard}
                onPress={() => navigateToModule(mod)}
                activeOpacity={0.82}>
                <LinearGradient
                  colors={mod.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.moduleGradient}>
                  <Icon name={mod.icon} size={28} color="#FFFFFF" />
                  <Text style={styles.moduleLabel}>{mod.label}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: SPACING[10] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  scrollContent: { paddingBottom: SPACING[4] },

  // Header
  header: {
    paddingTop: Platform.OS === 'android' ? 52 : 48,
    paddingBottom: SPACING[5],
    paddingHorizontal: SPACING[5],
    borderBottomLeftRadius: RADIUS['2xl'],
    borderBottomRightRadius: RADIUS['2xl'],
  },
  greetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: SPACING[4],
  },
  greeting: {
    fontSize: FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  dateText: {
    fontSize: FONT_SIZE.sm,
    color: 'rgba(255,255,255,0.55)',
    marginTop: SPACING[1],
  },
  clockBadge: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: RADIUS.lg,
    paddingHorizontal: SPACING[3],
    paddingVertical: SPACING[2],
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  clockText: {
    fontSize: FONT_SIZE['2xl'],
    fontWeight: FONT_WEIGHT.bold,
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  clockSeconds: {
    fontSize: FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.medium,
    color: 'rgba(255,255,255,0.5)',
    marginBottom: 2,
  },

  // Weather
  weatherCard: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: RADIUS.xl,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.16)',
    overflow: 'hidden',
  },
  weatherCardInner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[4],
    paddingTop: SPACING[4],
    paddingBottom: SPACING[2],
  },
  weatherLeft: { flex: 1 },
  weatherTemp: {
    fontSize: 54,
    fontWeight: FONT_WEIGHT.black,
    color: '#FFFFFF',
    lineHeight: 58,
    letterSpacing: -2,
  },
  weatherCity: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.78)', marginTop: SPACING[1] },
  weatherDesc: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.55)', textTransform: 'capitalize', marginTop: SPACING[1] },
  weatherRight: { alignItems: 'center', gap: SPACING[2] },
  weatherMetaRow: { flexDirection: 'row', alignItems: 'center' },
  weatherMeta: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.65)' },
  weatherTapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: SPACING[4],
    paddingBottom: SPACING[3],
    gap: SPACING[1],
  },
  weatherTapText: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.45)' },
  weatherSkeleton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[2],
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderRadius: RADIUS.lg,
    padding: SPACING[4],
  },
  weatherErrorText: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.45)' },

  // Stats
  statsRow: {
    flexDirection: 'row',
    paddingHorizontal: SPACING[4],
    gap: SPACING[3],
    marginTop: SPACING[5],
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: SPACING[4],
    paddingHorizontal: SPACING[2],
    borderRadius: RADIUS.xl,
    gap: SPACING[1],
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  statIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: SPACING[1],
  },
  statNumber: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold, letterSpacing: -0.3 },
  statLabel: { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },

  // Section
  section: { paddingHorizontal: SPACING[4], marginTop: SPACING[5] },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: SPACING[3] },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, letterSpacing: -0.2 },
  seeAll: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold },

  // Events
  eventItem: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: RADIUS.lg,
    marginBottom: SPACING[2],
    paddingVertical: SPACING[3],
    paddingRight: SPACING[4],
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  eventAccent: { width: 4, alignSelf: 'stretch', borderRadius: 2, marginLeft: SPACING[3] },
  eventTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  eventTime: { fontSize: FONT_SIZE.xs, marginTop: 2 },
  emptyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: SPACING[4],
    padding: SPACING[4],
    borderRadius: RADIUS.xl,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
  },
  emptyTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.semibold },
  emptySubtitle: { fontSize: FONT_SIZE.sm, marginTop: 2 },

  // Habit progress
  habitCard: {
    borderRadius: RADIUS.xl,
    padding: SPACING[4],
    elevation: 3,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
  },
  habitCardTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: SPACING[3],
  },
  habitCount: { fontSize: FONT_SIZE['2xl'], fontWeight: FONT_WEIGHT.black, letterSpacing: -0.5 },
  habitTotal: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.medium },
  habitSubtitle: { fontSize: FONT_SIZE.sm, marginTop: SPACING[1] },
  habitBadge: { borderRadius: RADIUS.full, paddingHorizontal: SPACING[3], paddingVertical: SPACING[1] },
  habitBadgeText: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.bold },
  progressTrack: { height: 8, borderRadius: RADIUS.full, overflow: 'hidden', marginBottom: SPACING[3] },
  progressFill: { height: 8, borderRadius: RADIUS.full, minWidth: 4 },
  habitEncouragement: { fontSize: FONT_SIZE.sm },

  // Expense card
  expenseCard: {
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#31473A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
  },
  expenseCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: SPACING[5],
    paddingTop: SPACING[5],
    paddingBottom: SPACING[2],
  },
  expenseLabel: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.65)' },
  expenseAmount: { fontSize: FONT_SIZE['3xl'], fontWeight: FONT_WEIGHT.black, color: '#FFFFFF', marginTop: SPACING[1], letterSpacing: -1 },
  expenseIconWrap: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.12)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  expenseTapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: SPACING[1],
    paddingHorizontal: SPACING[5],
    paddingBottom: SPACING[4],
  },
  expenseTapText: { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.5)' },

  // Module grid
  moduleGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: SPACING[3],
    marginTop: SPACING[3],
  },
  moduleCard: {
    width: '30.5%',
    aspectRatio: 1,
    borderRadius: RADIUS.xl,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  moduleGradient: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: SPACING[2] },
  moduleLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: '#FFFFFF', letterSpacing: 0.1 },
});
