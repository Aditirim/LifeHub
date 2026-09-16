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
  query, where, orderBy, onSnapshot,
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
  key:    string;
  label:  string;
  icon:   string;
  gradient: string[];
  nav?:   keyof MainStackParamList;
  tab?:   string;
}

const MODULES: Module[] = [
  { key: 'weather',  label: 'Weather',   icon: 'weather-partly-cloudy', gradient: GRADIENTS.blue,    nav: 'Weather' },
  { key: 'notes',    label: 'Notes',     icon: 'note-text-outline',     gradient: GRADIENTS.amber,   nav: 'Notes'   },
  { key: 'clock',    label: 'Clock',     icon: 'alarm',                 gradient: GRADIENTS.teal,    nav: 'Clock'   },
  { key: 'calendar', label: 'Calendar',  icon: 'calendar-month-outline', gradient: GRADIENTS.rose,  tab: 'Calendar' },
  { key: 'habits',   label: 'Habits',    icon: 'check-circle-outline',  gradient: GRADIENTS.green,   tab: 'Habits'  },
  { key: 'money',    label: 'Money',     icon: 'wallet-outline',        gradient: GRADIENTS.primary, tab: 'Money'   },
];

export default function HomeScreen() {
  const navigation  = useNavigation<NavProp>();
  const { user }    = useAuth();
  const { colors }  = useTheme();

  const [currentTime, setCurrentTime] = useState(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  const [weather,       setWeather]       = useState<CurrentWeather | null>(null);
  const [weatherError,  setWeatherError]  = useState('');
  const [todayEvents,   setTodayEvents]   = useState<any[]>([]);
  const [habits,        setHabits]        = useState<any[]>([]);
  const [todayExpenses, setTodayExpenses] = useState(0);
  const [refreshing,    setRefreshing]    = useState(false);

  const uid   = user?.uid ?? '';
  const today = format(new Date(), 'yyyy-MM-dd');

  // ── Clock ─────────────────────────────────────────────────────────────────

  useEffect(() => {
    timerRef.current = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerRef.current);
  }, []);

  // ── Weather ───────────────────────────────────────────────────────────────

  function loadWeather() {
    Geolocation.getCurrentPosition(
      async pos => {
        try {
          const data = await fetchCurrentWeather(
            pos.coords.latitude, pos.coords.longitude,
          );
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

  // ── Firestore listeners (modular API) ────────────────────────────────────

  useEffect(() => {
    if (!uid) return;

    // Today's events
    const eventsRef = eventsCollection(uid);
    const eventsQ   = query(eventsRef, where('date', '==', today));
    const unsubEvents = onSnapshot(eventsQ, snap => {
      setTodayEvents(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }, () => setTodayEvents([]));

    // All habits (to calculate today's completion ratio)
    const habitsRef = habitsCollection(uid);
    const unsubHabits = onSnapshot(habitsRef, snap => {
      setHabits(snap.docs.map((d: any) => ({ id: d.id, ...d.data() })));
    }, () => setHabits([]));

    // Today's expenses — sum from all transactions
    const txRef = transactionsCollection(uid);
    const txQ   = query(txRef, where('type', '==', 'expense'));
    const unsubTx = onSnapshot(txQ, snap => {
      const total = snap.docs
        .filter((d: any) => {
          const txDate = d.data().date;
          const txDay  = txDate?.toDate
            ? format(txDate.toDate(), 'yyyy-MM-dd')
            : (txDate?.split?.('T')?.[0] ?? '');
          return txDay === today;
        })
        .reduce((sum: number, d: any) => sum + (d.data().amount ?? 0), 0);
      setTodayExpenses(total);
    }, () => setTodayExpenses(0));

    return () => {
      unsubEvents();
      unsubHabits();
      unsubTx();
    };
  }, [uid, today]);

  // ── Pull-to-refresh ───────────────────────────────────────────────────────

  function onRefresh() {
    setRefreshing(true);
    loadWeather();
    setTimeout(() => setRefreshing(false), 1500);
  }

  // ── Derived values ────────────────────────────────────────────────────────

  const habitsCompletedToday = habits.filter(h =>
    Array.isArray(h.completedDates) && h.completedDates.includes(today),
  ).length;

  function navigateToModule(mod: Module) {
    if (mod.nav) { navigation.push(mod.nav as any); }
    else if (mod.tab) { (navigation as any).navigate('MainTabs', { screen: mod.tab }); }
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.primary} />}>

        {/* ── Header ─────────────────────────────────────────────────── */}
        <LinearGradient colors={['#16213E', '#1A1A2E', '#0D0D1A']} style={styles.header}>
          <View style={styles.greetRow}>
            <View>
              <Text style={styles.greeting}>
                {getGreeting()}, {user?.displayName?.split(' ')[0] ?? 'there'} 👋
              </Text>
              <Text style={styles.dateText}>{format(currentTime, 'EEEE, MMMM d')}</Text>
            </View>
            <View style={[styles.clockBadge, { backgroundColor: 'rgba(255,255,255,0.1)' }]}>
              <Text style={styles.clockText}>{format(currentTime, 'HH:mm')}</Text>
            </View>
          </View>

          {/* Weather card */}
          {weather ? (
            <TouchableOpacity onPress={() => navigation.push('Weather')} activeOpacity={0.85}>
              <LinearGradient
                colors={GRADIENTS.blue}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.weatherCard}>
                <View>
                  <Text style={styles.weatherTemp}>{weather.temperature}°C</Text>
                  <Text style={styles.weatherCity}>{weather.city}, {weather.country}</Text>
                  <Text style={styles.weatherDesc}>{weather.description}</Text>
                </View>
                <View style={styles.weatherRight}>
                  <Icon name={getWeatherIconName(weather.icon)} size={52} color="#FFFFFF" />
                  <Text style={styles.weatherMeta}>💧{weather.humidity}% 💨{weather.windSpeed}km/h</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          ) : (
            <View style={[styles.weatherError, { backgroundColor: 'rgba(255,255,255,0.05)' }]}>
              <Icon name={weatherError ? 'weather-cloudy-alert' : 'loading'} size={22} color="rgba(255,255,255,0.5)" />
              <Text style={styles.weatherErrorText}>
                {weatherError || 'Fetching weather...'}
              </Text>
            </View>
          )}
        </LinearGradient>

        {/* ── Stats row ─────────────────────────────────────────────── */}
        <View style={styles.statsRow}>
          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Calendar' })}>
            <Icon name="calendar-today" size={22} color={colors.primary} />
            <Text style={[styles.statNumber, { color: colors.text }]}>{todayEvents.length}</Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Events</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Habits' })}>
            <Icon name="check-circle-outline" size={22} color={colors.success} />
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {habitsCompletedToday}/{habits.length}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Habits</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.statCard, { backgroundColor: colors.card, borderColor: colors.border }]}
            onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Money' })}>
            <Icon name="cash-minus" size={22} color={colors.error} />
            <Text style={[styles.statNumber, { color: colors.text }]}>
              {formatCurrency(todayExpenses)}
            </Text>
            <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Spent</Text>
          </TouchableOpacity>
        </View>

        {/* ── Today's Events ─────────────────────────────────────────── */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>Today's Events</Text>
            <TouchableOpacity onPress={() => (navigation as any).navigate('MainTabs', { screen: 'Calendar' })}>
              <Text style={[styles.seeAll, { color: colors.primaryLight }]}>See all</Text>
            </TouchableOpacity>
          </View>
          {todayEvents.length === 0 ? (
            <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Icon name="calendar-check-outline" size={28} color={colors.textMuted} />
              <Text style={[styles.emptyText, { color: colors.textMuted }]}>No events today</Text>
            </View>
          ) : (
            todayEvents.slice(0, 3).map(event => (
              <View key={event.id} style={[styles.eventItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.eventDot, { backgroundColor: colors.primary }]} />
                <View>
                  <Text style={[styles.eventTitle, { color: colors.text }]}>{event.title}</Text>
                  {event.startTime ? (
                    <Text style={[styles.eventTime, { color: colors.textSecondary }]}>{event.startTime}</Text>
                  ) : null}
                </View>
              </View>
            ))
          )}
        </View>

        {/* ── Quick Access Grid ──────────────────────────────────────── */}
        <View style={styles.section}>
          <Text style={[styles.sectionTitle, { color: colors.text }]}>Quick Access</Text>
          <View style={styles.moduleGrid}>
            {MODULES.map(mod => (
              <TouchableOpacity
                key={mod.key}
                style={styles.moduleCard}
                onPress={() => navigateToModule(mod)}
                activeOpacity={0.85}>
                <LinearGradient
                  colors={mod.gradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.moduleGradient}>
                  <Icon name={mod.icon} size={30} color="#FFFFFF" />
                  <Text style={styles.moduleLabel}>{mod.label}</Text>
                </LinearGradient>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        <View style={{ height: SPACING[8] }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: {
    paddingTop:    Platform.OS === 'android' ? 50 : 44,
    paddingBottom: SPACING[5],
    paddingHorizontal: SPACING[5],
  },
  greetRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   SPACING[4],
  },
  greeting:  { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
  dateText:  { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.55)', marginTop: SPACING[1] },
  clockBadge: { paddingHorizontal: SPACING[3], paddingVertical: SPACING[2], borderRadius: RADIUS.md },
  clockText:  { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, color: '#FFFFFF' },
  weatherCard: {
    borderRadius:  RADIUS.lg, padding: SPACING[4],
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
  },
  weatherTemp:      { fontSize: FONT_SIZE['4xl'], fontWeight: FONT_WEIGHT.black, color: '#FFFFFF' },
  weatherCity:      { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.8)', marginTop: SPACING[1] },
  weatherDesc:      { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.6)', textTransform: 'capitalize' },
  weatherRight:     { alignItems: 'center' },
  weatherMeta:      { fontSize: FONT_SIZE.xs, color: 'rgba(255,255,255,0.7)', marginTop: SPACING[1] },
  weatherError: {
    flexDirection: 'row', alignItems: 'center',
    borderRadius:  RADIUS.lg, padding: SPACING[4], gap: SPACING[2],
  },
  weatherErrorText: { fontSize: FONT_SIZE.sm, color: 'rgba(255,255,255,0.5)' },
  statsRow: {
    flexDirection: 'row', paddingHorizontal: SPACING[4],
    gap: SPACING[3], marginTop: SPACING[4],
  },
  statCard: {
    flex: 1, alignItems: 'center', padding: SPACING[3],
    borderRadius: RADIUS.lg, borderWidth: 1, gap: SPACING[1], elevation: 2,
  },
  statNumber: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  statLabel:  { fontSize: FONT_SIZE.xs, fontWeight: FONT_WEIGHT.medium },
  section:       { paddingHorizontal: SPACING[4], marginTop: SPACING[5] },
  sectionHeader: {
    flexDirection: 'row', justifyContent: 'space-between',
    alignItems: 'center', marginBottom: SPACING[3],
  },
  sectionTitle: { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold },
  seeAll:       { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.medium },
  eventItem: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING[3], borderRadius: RADIUS.md,
    borderWidth: 1, marginBottom: SPACING[2], gap: SPACING[3],
  },
  eventDot:   { width: 8, height: 8, borderRadius: 4 },
  eventTitle: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium },
  eventTime:  { fontSize: FONT_SIZE.sm, marginTop: 2 },
  emptyCard: {
    flexDirection: 'row', alignItems: 'center',
    padding: SPACING[4], borderRadius: RADIUS.md,
    borderWidth: 1, gap: SPACING[3],
  },
  emptyText: { fontSize: FONT_SIZE.sm },
  moduleGrid: {
    flexDirection: 'row', flexWrap: 'wrap',
    gap: SPACING[3], marginTop: SPACING[3],
  },
  moduleCard: {
    width: '30.5%', aspectRatio: 1,
    borderRadius: RADIUS.lg, overflow: 'hidden', elevation: 4,
  },
  moduleGradient: {
    flex: 1, justifyContent: 'center',
    alignItems: 'center', gap: SPACING[2],
  },
  moduleLabel: { fontSize: FONT_SIZE.sm, fontWeight: FONT_WEIGHT.semibold, color: '#FFFFFF' },
});
