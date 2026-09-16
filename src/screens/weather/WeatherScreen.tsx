/**
 * WeatherScreen — Detailed weather view.
 *
 * Shows:
 *  - Current temperature, feels like, description
 *  - Humidity, wind speed, weather condition
 *  - City and country
 *  - 5-day forecast list
 *  - Loading / error / no-permission states
 *
 * Requests location permission (Android) before fetching.
 * Falls back gracefully if location or API is unavailable.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  StyleSheet, RefreshControl, Platform, PermissionsAndroid,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import Geolocation from '@react-native-community/geolocation';
import { format } from 'date-fns';

import { useTheme } from '../../context/ThemeContext';
import { SPACING, RADIUS } from '../../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../../constants/typography';
import { GRADIENTS } from '../../constants/colors';
import {
  fetchCurrentWeather, fetchForecast,
  CurrentWeather, ForecastDay, getWeatherIconName,
} from '../../services/weatherService';
import { LoadingSpinner, ErrorState } from '../../components';

type LocationState = 'idle' | 'requesting' | 'granted' | 'denied';

export default function WeatherScreen() {
  const { colors } = useTheme();

  const [locationState, setLocationState]     = useState<LocationState>('idle');
  const [current,       setCurrent]           = useState<CurrentWeather | null>(null);
  const [forecast,      setForecast]          = useState<ForecastDay[]>([]);
  const [loading,       setLoading]           = useState(false);
  const [refreshing,    setRefreshing]        = useState(false);
  const [error,         setError]             = useState('');

  // ─── Location + weather fetch ─────────────────────────────────────────────

  const loadWeather = useCallback(() => {
    setLoading(true);
    setError('');

    // On Android we must request location permission before using Geolocation
    const proceed = (lat: number, lon: number) => {
      Promise.all([
        fetchCurrentWeather(lat, lon),
        fetchForecast(lat, lon),
      ])
        .then(([cur, fore]) => {
          setCurrent(cur);
          setForecast(fore);
        })
        .catch(e => setError(e.message ?? 'Failed to fetch weather'))
        .finally(() => { setLoading(false); setRefreshing(false); });
    };

    const onError = (err: any) => {
      setError('Unable to get location. Please enable location permission.');
      setLocationState('denied');
      setLoading(false);
      setRefreshing(false);
    };

    if (Platform.OS === 'android') {
      PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        {
          title: 'Location Permission',
          message: 'LifeHub needs your location to show current weather.',
          buttonPositive: 'Allow',
          buttonNegative: 'Deny',
        },
      ).then(result => {
        if (result === PermissionsAndroid.RESULTS.GRANTED) {
          setLocationState('granted');
          Geolocation.getCurrentPosition(
            pos => proceed(pos.coords.latitude, pos.coords.longitude),
            onError,
            { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
          );
        } else {
          setLocationState('denied');
          setError('Location permission denied. Cannot fetch weather.');
          setLoading(false);
          setRefreshing(false);
        }
      });
    } else {
      Geolocation.getCurrentPosition(
        pos => proceed(pos.coords.latitude, pos.coords.longitude),
        onError,
        { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
      );
    }
  }, []);

  useEffect(() => { loadWeather(); }, [loadWeather]);

  // ─── Render ──────────────────────────────────────────────────────────────

  if (loading && !current) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <LoadingSpinner message="Fetching weather..." />
      </View>
    );
  }

  if (error && !current) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background }]}>
        <ErrorState message={error} onRetry={loadWeather} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => { setRefreshing(true); loadWeather(); }}
            tintColor={colors.primary}
          />
        }>

        {/* ── Current Weather Hero ──────────────────────────────────── */}
        {current && (
          <LinearGradient
            colors={GRADIENTS.blue}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.hero}>
            <Text style={styles.cityName}>
              {current.city}, {current.country}
            </Text>
            <Icon name={getWeatherIconName(current.icon)} size={100} color="#FFFFFF" />
            <Text style={styles.temperature}>{current.temperature}°C</Text>
            <Text style={styles.description}>{current.description}</Text>

            {/* Stats row */}
            <View style={styles.statsRow}>
              <WeatherStat icon="thermometer" label="Feels like" value={`${current.feelsLike}°C`} />
              <View style={styles.divider} />
              <WeatherStat icon="water-percent" label="Humidity" value={`${current.humidity}%`} />
              <View style={styles.divider} />
              <WeatherStat icon="weather-windy" label="Wind" value={`${current.windSpeed} km/h`} />
            </View>
          </LinearGradient>
        )}

        {/* ── 5-Day Forecast ────────────────────────────────────────── */}
        {forecast.length > 0 && (
          <View style={styles.forecastSection}>
            <Text style={[styles.sectionTitle, { color: colors.text }]}>5-Day Forecast</Text>
            {forecast.map((day, i) => (
              <View
                key={`${day.date}-${i}`}
                style={[styles.forecastItem, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Text style={[styles.forecastDay, { color: colors.text }]}>
                  {i === 0 ? 'Today' : format(new Date(day.date + 'T12:00:00'), 'EEE')}
                </Text>
                <Icon name={getWeatherIconName(day.icon)} size={26} color={colors.primary} />
                <Text style={[styles.forecastDesc, { color: colors.textSecondary }]}>
                  {day.condition}
                </Text>
                <Text style={[styles.forecastTemp, { color: colors.text }]}>
                  {day.tempMax}° / {day.tempMin}°
                </Text>
              </View>
            ))}
          </View>
        )}

        <View style={{ height: SPACING[8] }} />
      </ScrollView>
    </View>
  );
}

// ─── WeatherStat sub-component ───────────────────────────────────────────────

function WeatherStat({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <View style={{ alignItems: 'center', flex: 1 }}>
      <Icon name={icon} size={22} color="rgba(255,255,255,0.8)" />
      <Text style={{ color: '#FFFFFF', fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginTop: 4 }}>
        {value}
      </Text>
      <Text style={{ color: 'rgba(255,255,255,0.6)', fontSize: FONT_SIZE.xs }}>
        {label}
      </Text>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },

  // Hero
  hero: {
    padding:     SPACING[6],
    alignItems:  'center',
    paddingTop:  SPACING[8],
    paddingBottom: SPACING[6],
  },
  cityName:    { fontSize: FONT_SIZE.xl, fontWeight: FONT_WEIGHT.semibold, color: 'rgba(255,255,255,0.9)' },
  temperature: { fontSize: FONT_SIZE['5xl'], fontWeight: FONT_WEIGHT.black, color: '#FFFFFF', marginTop: -SPACING[2] },
  description: {
    fontSize:      FONT_SIZE.lg,
    color:         'rgba(255,255,255,0.8)',
    textTransform: 'capitalize',
    marginBottom:  SPACING[5],
  },

  // Stats
  statsRow: {
    flexDirection:   'row',
    backgroundColor: 'rgba(0,0,0,0.2)',
    borderRadius:    RADIUS.lg,
    padding:         SPACING[4],
    width:           '100%',
  },
  divider: {
    width:        1,
    backgroundColor: 'rgba(255,255,255,0.3)',
    marginHorizontal: SPACING[2],
  },

  // Forecast
  forecastSection: { padding: SPACING[4] },
  sectionTitle:    { fontSize: FONT_SIZE.lg, fontWeight: FONT_WEIGHT.bold, marginBottom: SPACING[3] },
  forecastItem: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'space-between',
    padding:        SPACING[4],
    borderRadius:   RADIUS.lg,
    borderWidth:    1,
    marginBottom:   SPACING[2],
  },
  forecastDay:  { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.medium, width: 50 },
  forecastDesc: { fontSize: FONT_SIZE.sm, flex: 1, textAlign: 'center' },
  forecastTemp: { fontSize: FONT_SIZE.base, fontWeight: FONT_WEIGHT.bold },
});
