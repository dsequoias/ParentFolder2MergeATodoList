import React, { useState } from 'react';
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Platform,
  Pressable,
  Alert,
} from 'react-native';
import { useSettings, TIME_ZONES } from '../contexts/SettingsContext';
import { resetDatabase } from '../services/database';
import { colors, spacing, radius } from '../theme';

const ABOUT_TEXT = `My.Daily.Duty version 1.0.0
It used SQLite database to store your Data.
It is built and maintained by David Sequoias
Questions or suggestion email: ds.us@hotmail.com
Copyright © 2026 DSM1 corp. All rights reserved.`;

export default function MenuModal({ visible, onClose, onReset }) {
  const { timeZone, setTimeZone } = useSettings();
  const [aboutVisible, setAboutVisible] = useState(false);

  const openAbout = () => setAboutVisible(true);
  const closeAbout = () => setAboutVisible(false);

  const handleResetDatabase = async () => {
    const message = 'All tasks will be deleted. This cannot be undone. Reset?';
    if (Platform.OS === 'web') {
      if (typeof window !== 'undefined' && !window.confirm(message)) return;
    } else {
      return new Promise((resolve) => {
        Alert.alert(
          'Reset database',
          'All tasks will be deleted. This cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve() },
            {
              text: 'Reset',
              style: 'destructive',
              onPress: () => resolve(true),
            },
          ]
        );
      }).then(async (ok) => {
        if (Platform.OS !== 'web' && !ok) return;
        try {
          await resetDatabase();
          onClose();
          if (typeof onReset === 'function') await onReset();
        } catch (e) {
          const errMsg = e?.message || 'Failed to reset database';
          if (Platform.OS === 'web' && typeof window !== 'undefined') {
            window.alert(errMsg);
          } else {
            Alert.alert('Error', errMsg);
          }
        }
      });
      return;
    }
    try {
      await resetDatabase();
      onClose();
      if (typeof onReset === 'function') await onReset();
    } catch (e) {
      window.alert(e?.message || 'Failed to reset database');
    }
  };

  return (
    <>
      <Modal
        visible={visible}
        transparent
        animationType="slide"
        onRequestClose={onClose}
      >
        <Pressable style={styles.overlay} onPress={onClose}>
          <Pressable style={styles.panel} onPress={(e) => e.stopPropagation()}>
            <View style={styles.header}>
              <Text style={styles.menuTitle}>Menu</Text>
              <TouchableOpacity onPress={onClose} style={styles.closeBtn} hitSlop={12}>
                <Text style={styles.closeBtnText}>✕</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.scroll} contentContainerStyle={styles.scrollContent}>
              {/* Time zone */}
              <Text style={styles.sectionTitle}>Time zone</Text>
              <View style={styles.tzList}>
                {TIME_ZONES.map((tz) => (
                  <TouchableOpacity
                    key={tz.value}
                    style={[styles.tzRow, timeZone === tz.value && styles.tzRowActive]}
                    onPress={() => setTimeZone(tz.value)}
                    activeOpacity={0.7}
                  >
                    <Text style={[styles.tzLabel, timeZone === tz.value && styles.tzLabelActive]}>
                      {tz.label}
                    </Text>
                    {timeZone === tz.value && <Text style={styles.tzCheck}>✓</Text>}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Reset database */}
              <Text style={styles.sectionTitle}>Data</Text>
              <TouchableOpacity style={styles.aboutRow} onPress={handleResetDatabase} activeOpacity={0.7}>
                <Text style={styles.aboutRowLabel}>Reset database (delete all tasks)</Text>
                <Text style={styles.aboutRowArrow}>›</Text>
              </TouchableOpacity>

              {/* About - opens popup */}
              <Text style={styles.sectionTitle}>About</Text>
              <TouchableOpacity style={styles.aboutRow} onPress={openAbout} activeOpacity={0.7}>
                <Text style={styles.aboutRowLabel}>About My.Daily.Duty</Text>
                <Text style={styles.aboutRowArrow}>›</Text>
              </TouchableOpacity>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      {/* About popup */}
      <Modal
        visible={aboutVisible}
        transparent
        animationType="fade"
        onRequestClose={closeAbout}
      >
        <Pressable style={styles.popupOverlay} onPress={closeAbout}>
          <Pressable style={styles.popupBox} onPress={(e) => e.stopPropagation()}>
            <Text style={styles.popupTitle}>About</Text>
            <Text style={styles.popupText}>{ABOUT_TEXT}</Text>
            <TouchableOpacity style={styles.popupOkBtn} onPress={closeAbout} activeOpacity={0.8}>
              <Text style={styles.popupOkText}>OK</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-start',
    alignItems: 'flex-start',
  },
  panel: {
    width: '85%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: colors.surface,
    ...(Platform.OS === 'web' ? { boxShadow: '4px 0 20px rgba(0,0,0,0.12)' } : { elevation: 8, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.15, shadowRadius: 16 }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingVertical: spacing.lg,
    borderBottomWidth: 1,
    borderBottomColor: colors.borderLight,
    backgroundColor: colors.background,
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
  },
  closeBtn: {
    padding: spacing.xs,
  },
  closeBtnText: {
    fontSize: 22,
    color: colors.textSecondary,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: spacing.xl,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: colors.primary,
    marginBottom: spacing.md,
    marginTop: spacing.lg,
  },
  tzList: {
    backgroundColor: colors.backgroundAlt,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  tzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.borderLight,
  },
  tzRowActive: {
    backgroundColor: colors.primaryLight,
  },
  tzLabel: {
    fontSize: 15,
    color: colors.text,
  },
  tzLabelActive: {
    fontWeight: '600',
    color: colors.primaryDark,
  },
  tzCheck: {
    fontSize: 16,
    color: colors.primary,
    fontWeight: 'bold',
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.backgroundAlt,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
  },
  aboutRowLabel: {
    fontSize: 15,
    color: colors.text,
  },
  aboutRowArrow: {
    fontSize: 20,
    color: colors.textMuted,
    fontWeight: '300',
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.xxl,
  },
  popupBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.xxl,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.18)' } : { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 16 }),
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: '700',
    color: colors.text,
    marginBottom: spacing.lg,
  },
  popupText: {
    fontSize: 14,
    color: colors.textSecondary,
    lineHeight: 22,
    marginBottom: spacing.xxl,
  },
  popupOkBtn: {
    backgroundColor: colors.primary,
    paddingVertical: spacing.md,
    borderRadius: radius.sm,
    alignItems: 'center',
  },
  popupOkText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
});
