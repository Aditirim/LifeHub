/**
 * Shared Components
 *
 * This file exports all reusable UI components.
 * Each component uses the current theme via useTheme().
 */

import React, { ReactNode } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Modal,
  StyleSheet,
  ViewStyle,
  TextStyle,
} from 'react-native';
import LinearGradient from 'react-native-linear-gradient';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useTheme } from '../context/ThemeContext';
import { SPACING, RADIUS } from '../constants/spacing';
import { FONT_SIZE, FONT_WEIGHT } from '../constants/typography';

// ─── Card ─────────────────────────────────────────────────────────────────────

interface CardProps {
  children: ReactNode;
  style?: ViewStyle;
  gradient?: string[];       // If provided, renders a gradient background
  onPress?: () => void;
  noPadding?: boolean;
}

/**
 * Standard card component with optional gradient and tap support.
 * Wraps content in a rounded, elevated container.
 */
export function Card({ children, style, gradient, onPress, noPadding }: CardProps) {
  const { colors } = useTheme();

  const content = (
    <View
      style={[
        styles.card,
        { backgroundColor: gradient ? 'transparent' : colors.card, borderColor: colors.border },
        noPadding ? {} : { padding: SPACING[4] },
        style,
      ]}>
      {children}
    </View>
  );

  // Gradient card wraps the content with LinearGradient
  const inner = gradient ? (
    <LinearGradient
      colors={gradient}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.card, noPadding ? {} : { padding: SPACING[4] }, style]}>
      {children}
    </LinearGradient>
  ) : content;

  if (onPress) {
    return (
      <TouchableOpacity onPress={onPress} activeOpacity={0.85}>
        {inner}
      </TouchableOpacity>
    );
  }

  return inner;
}

// ─── LoadingSpinner ───────────────────────────────────────────────────────────

interface LoadingSpinnerProps {
  message?: string;
  size?: 'small' | 'large';
}

/**
 * Centered loading spinner with an optional message below it.
 * Fills its container (flex: 1).
 */
export function LoadingSpinner({ message, size = 'large' }: LoadingSpinnerProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.centeredContainer}>
      <ActivityIndicator size={size} color={colors.primary} />
      {message ? (
        <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
          {message}
        </Text>
      ) : null}
    </View>
  );
}

// ─── EmptyState ───────────────────────────────────────────────────────────────

interface EmptyStateProps {
  icon: string;        // MaterialCommunityIcons name
  title: string;
  subtitle?: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * Full-screen empty state with icon, title, subtitle, and optional action button.
 */
export function EmptyState({ icon, title, subtitle, actionLabel, onAction }: EmptyStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.centeredContainer}>
      <View style={[styles.emptyIconBg, { backgroundColor: colors.surface }]}>
        <Icon name={icon} size={48} color={colors.primary} />
      </View>
      <Text style={[styles.emptyTitle, { color: colors.text }]}>{title}</Text>
      {subtitle ? (
        <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
          {subtitle}
        </Text>
      ) : null}
      {actionLabel && onAction ? (
        <TouchableOpacity
          style={[styles.emptyActionBtn, { backgroundColor: colors.primary }]}
          onPress={onAction}>
          <Text style={styles.emptyActionText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── ErrorState ───────────────────────────────────────────────────────────────

interface ErrorStateProps {
  message: string;
  onRetry?: () => void;
}

/**
 * Full-screen error state with a retry button.
 */
export function ErrorState({ message, onRetry }: ErrorStateProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.centeredContainer}>
      <Icon name="alert-circle-outline" size={48} color={colors.error} />
      <Text style={[styles.errorTitle, { color: colors.error }]}>
        Something went wrong
      </Text>
      <Text style={[styles.errorMessage, { color: colors.textSecondary }]}>
        {message}
      </Text>
      {onRetry ? (
        <TouchableOpacity
          style={[styles.emptyActionBtn, { backgroundColor: colors.error }]}
          onPress={onRetry}>
          <Text style={styles.emptyActionText}>Try Again</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── ConfirmDialog ────────────────────────────────────────────────────────────

interface ConfirmDialogProps {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;    // If true, the confirm button is red
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A modal confirmation dialog for destructive actions (delete, logout, etc.)
 */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const { colors } = useTheme();
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onCancel}>
      <View style={[styles.dialogOverlay, { backgroundColor: colors.overlay }]}>
        <View style={[styles.dialogBox, { backgroundColor: colors.surface, borderColor: colors.border }]}>
          <Text style={[styles.dialogTitle, { color: colors.text }]}>{title}</Text>
          <Text style={[styles.dialogMessage, { color: colors.textSecondary }]}>
            {message}
          </Text>
          <View style={styles.dialogButtons}>
            <TouchableOpacity
              style={[styles.dialogBtn, { backgroundColor: colors.card, borderColor: colors.border }]}
              onPress={onCancel}>
              <Text style={[styles.dialogBtnText, { color: colors.textSecondary }]}>
                {cancelLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dialogBtn,
                { backgroundColor: destructive ? colors.error : colors.primary },
              ]}
              onPress={onConfirm}>
              <Text style={[styles.dialogBtnText, { color: '#FFFFFF' }]}>
                {confirmLabel}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ─── SectionHeader ────────────────────────────────────────────────────────────

interface SectionHeaderProps {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}

/**
 * A section header with an optional "See all" action link.
 */
export function SectionHeader({ title, actionLabel, onAction }: SectionHeaderProps) {
  const { colors } = useTheme();
  return (
    <View style={styles.sectionHeader}>
      <Text style={[styles.sectionTitle, { color: colors.text }]}>{title}</Text>
      {actionLabel && onAction ? (
        <TouchableOpacity onPress={onAction}>
          <Text style={[styles.sectionAction, { color: colors.primaryLight }]}>
            {actionLabel}
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

// ─── Pill / Badge ─────────────────────────────────────────────────────────────

interface PillProps {
  label: string;
  color?: string;
  textColor?: string;
  style?: ViewStyle;
}

/** Small colored pill/badge for categories and tags. */
export function Pill({ label, color, textColor = '#FFFFFF', style }: PillProps) {
  const { colors } = useTheme();
  return (
    <View
      style={[
        styles.pill,
        { backgroundColor: color ?? colors.primary },
        style,
      ]}>
      <Text style={[styles.pillText, { color: textColor }]}>{label}</Text>
    </View>
  );
}

// ─── FAB (Floating Action Button) ────────────────────────────────────────────

interface FABProps {
  iconName: string;
  onPress: () => void;
  style?: ViewStyle;
  color?: string;
}

/** Floating action button positioned at bottom-right. */
export function FAB({ iconName, onPress, style, color }: FABProps) {
  const { colors } = useTheme();
  return (
    <TouchableOpacity
      style={[styles.fab, { backgroundColor: color ?? colors.primary }, style]}
      onPress={onPress}
      activeOpacity={0.85}>
      <Icon name={iconName} size={28} color="#FFFFFF" />
    </TouchableOpacity>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // Card
  card: {
    borderRadius:  RADIUS.lg,
    borderWidth:   1,
    overflow:      'hidden',
  },

  // Loading / Empty / Error (centered container)
  centeredContainer: {
    flex:           1,
    justifyContent: 'center',
    alignItems:     'center',
    padding:        SPACING[6],
  },
  loadingText: {
    marginTop:  SPACING[3],
    fontSize:   FONT_SIZE.md,
  },

  // EmptyState
  emptyIconBg: {
    width:         96,
    height:        96,
    borderRadius:  48,
    justifyContent: 'center',
    alignItems:    'center',
    marginBottom:  SPACING[4],
  },
  emptyTitle: {
    fontSize:   FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    textAlign:  'center',
    marginBottom: SPACING[2],
  },
  emptySubtitle: {
    fontSize:   FONT_SIZE.md,
    textAlign:  'center',
    marginBottom: SPACING[5],
    paddingHorizontal: SPACING[6],
  },
  emptyActionBtn: {
    paddingHorizontal: SPACING[6],
    paddingVertical:   SPACING[3],
    borderRadius:      RADIUS.full,
  },
  emptyActionText: {
    color:      '#FFFFFF',
    fontWeight: FONT_WEIGHT.semibold,
    fontSize:   FONT_SIZE.base,
  },

  // ErrorState
  errorTitle: {
    fontSize:   FONT_SIZE.xl,
    fontWeight: FONT_WEIGHT.bold,
    marginTop:  SPACING[3],
    marginBottom: SPACING[2],
  },
  errorMessage: {
    fontSize:   FONT_SIZE.md,
    textAlign:  'center',
    marginBottom: SPACING[5],
    paddingHorizontal: SPACING[4],
  },

  // ConfirmDialog
  dialogOverlay: {
    flex:            1,
    justifyContent:  'center',
    alignItems:      'center',
    paddingHorizontal: SPACING[6],
  },
  dialogBox: {
    width:         '100%',
    borderRadius:  RADIUS.xl,
    padding:       SPACING[6],
    borderWidth:   1,
    elevation:     10,
  },
  dialogTitle: {
    fontSize:     FONT_SIZE.xl,
    fontWeight:   FONT_WEIGHT.bold,
    marginBottom: SPACING[2],
  },
  dialogMessage: {
    fontSize:     FONT_SIZE.base,
    marginBottom: SPACING[6],
    lineHeight:   22,
  },
  dialogButtons: {
    flexDirection: 'row',
    gap:           SPACING[3],
  },
  dialogBtn: {
    flex:              1,
    paddingVertical:   SPACING[3],
    borderRadius:      RADIUS.md,
    alignItems:        'center',
    borderWidth:       1,
  },
  dialogBtnText: {
    fontSize:   FONT_SIZE.base,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // SectionHeader
  sectionHeader: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   SPACING[3],
    paddingHorizontal: SPACING[4],
  },
  sectionTitle: {
    fontSize:   FONT_SIZE.lg,
    fontWeight: FONT_WEIGHT.bold,
  },
  sectionAction: {
    fontSize:   FONT_SIZE.sm,
    fontWeight: FONT_WEIGHT.medium,
  },

  // Pill
  pill: {
    paddingHorizontal: SPACING[3],
    paddingVertical:   SPACING[1],
    borderRadius:      RADIUS.full,
  },
  pillText: {
    fontSize:   FONT_SIZE.xs,
    fontWeight: FONT_WEIGHT.semibold,
  },

  // FAB
  fab: {
    position:       'absolute',
    bottom:          SPACING[6],
    right:           SPACING[5],
    width:           56,
    height:          56,
    borderRadius:    28,
    justifyContent: 'center',
    alignItems:     'center',
    elevation:       6,
  },
});
