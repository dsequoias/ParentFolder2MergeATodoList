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
} from 'react-native';
import { useSettings, TIME_ZONES } from '../contexts/SettingsContext';

const ABOUT_TEXT = `TodoList version 1.0.0 (Beta) 
It used SQLite database to store the data.
Build and maintained by David Sequoias
Questions email: ds.us@hotmail.com

© 2026-2032 David Sequoias. All rights reserved.
`;

export default function MenuModal({ visible, onClose }) {
  const { timeZone, setTimeZone } = useSettings();
  const [aboutVisible, setAboutVisible] = useState(false);

  const openAbout = () => setAboutVisible(true);
  const closeAbout = () => setAboutVisible(false);

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

              {/* About - opens popup */}
              <Text style={styles.sectionTitle}>About</Text>
              <TouchableOpacity style={styles.aboutRow} onPress={openAbout} activeOpacity={0.7}>
                <Text style={styles.aboutRowLabel}>About TodoList</Text>
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
    backgroundColor: '#fff',
    ...(Platform.OS === 'web' ? { boxShadow: '4px 0 20px rgba(0,0,0,0.15)' } : { elevation: 8, shadowColor: '#000', shadowOffset: { width: 2, height: 0 }, shadowOpacity: 0.2, shadowRadius: 12 }),
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f8f8f8',
  },
  menuTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
  },
  closeBtn: {
    padding: 4,
  },
  closeBtnText: {
    fontSize: 22,
    color: '#666',
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
    paddingBottom: 40,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#6200ee',
    marginBottom: 10,
    marginTop: 16,
  },
  tzList: {
    backgroundColor: '#f5f5f5',
    borderRadius: 12,
    overflow: 'hidden',
  },
  tzRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#e0e0e0',
  },
  tzRowActive: {
    backgroundColor: '#e8e0f0',
  },
  tzLabel: {
    fontSize: 15,
    color: '#333',
  },
  tzLabelActive: {
    fontWeight: '600',
    color: '#6200ee',
  },
  tzCheck: {
    fontSize: 16,
    color: '#6200ee',
    fontWeight: 'bold',
  },
  aboutRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
  },
  aboutRowLabel: {
    fontSize: 15,
    color: '#333',
  },
  aboutRowArrow: {
    fontSize: 20,
    color: '#888',
    fontWeight: '300',
  },
  popupOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  popupBox: {
    width: '100%',
    maxWidth: 340,
    backgroundColor: '#fff',
    borderRadius: 16,
    padding: 24,
    ...(Platform.OS === 'web' ? { boxShadow: '0 8px 32px rgba(0,0,0,0.2)' } : { elevation: 8, shadowColor: '#000', shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.25, shadowRadius: 12 }),
  },
  popupTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 16,
  },
  popupText: {
    fontSize: 14,
    color: '#555',
    lineHeight: 22,
    marginBottom: 24,
  },
  popupOkBtn: {
    backgroundColor: '#6200ee',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
  },
  popupOkText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
});
