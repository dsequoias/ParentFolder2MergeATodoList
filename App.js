import * as SplashScreen from 'expo-splash-screen';

import { Platform, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import React, { useEffect, useRef, useState } from 'react';
import { colors, spacing } from './theme';
import { getAllTodos, initDatabase } from './services/database';

import ErrorBoundary from './components/ErrorBoundary';
import { NavigationContainer } from '@react-navigation/native';
import { SettingsProvider } from './contexts/SettingsContext';
import { StatusBar } from 'expo-status-bar';
import TodoDetailScreen from './screens/TodoDetailScreen';
import TodoListScreen from './screens/TodoListScreen';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { startForegroundReminderChecker } from './services/notifications';

SplashScreen.preventAutoHideAsync();

const Stack = createNativeStackNavigator();

export default function App() {
  const [initState, setInitState] = useState('loading'); // 'loading' | 'ready' | 'error'
  const stopCheckerRef = useRef(() => {});

  const tryInit = async () => {
    try {
      setInitState('loading');
      await initDatabase();
      stopCheckerRef.current = startForegroundReminderChecker(() => getAllTodos());
      setInitState('ready');
    } catch (error) {
      console.error('Failed to initialize database:', error);
      setInitState('error');
    }
  };

  useEffect(() => {
    tryInit();
    const t = setTimeout(() => {
      setInitState(prev => (prev === 'loading' ? 'error' : prev));
    }, 12000);
    const hideSplash = () => {
      SplashScreen.hideAsync().catch(() => {});
    };
    const splashT = setTimeout(hideSplash, 100);
    return () => {
      clearTimeout(t);
      clearTimeout(splashT);
      stopCheckerRef.current();
    };
  }, []);

  if (initState === 'loading') {
    return (
      <View style={styles.loadingRoot}>
        <Text style={styles.loadingText}>Loading...</Text>
      </View>
    );
  }

  if (initState === 'error') {
    return (
      <View style={styles.errorRoot}>
        <Text style={styles.errorTitle}>Database could not be loaded.</Text>
        <Text style={styles.errorSubtext}>Initialize the database yourself if needed, then tap Retry.</Text>
        <TouchableOpacity onPress={tryInit} style={styles.retryButton} activeOpacity={0.8}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const appContent = (
    <ErrorBoundary>
      <SettingsProvider>
        <NavigationContainer>
          <StatusBar style="auto" />
          <Stack.Navigator
          initialRouteName="TodoList"
          screenOptions={{
            headerStyle: {
              backgroundColor: colors.primary,
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: '700',
            },
          }}
        >
          <Stack.Screen 
            name="TodoList" 
            component={TodoListScreen}
            options={{ headerShown: false }}
          />
          <Stack.Screen 
            name="TodoDetail" 
            component={TodoDetailScreen}
            options={{ headerShown: false }}
          />
        </Stack.Navigator>
        </NavigationContainer>
      </SettingsProvider>
    </ErrorBoundary>
  );

  // On web: show mobile phone version in a centered frame
  if (Platform.OS === 'web') {
    return (
      <View style={styles.webWrapper}>
        <View style={styles.webPhoneFrame}>
          {appContent}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.appRoot}>
      {appContent}
    </View>
  );
}

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  loadingText: {
    fontSize: 18,
    color: colors.text,
  },
  errorRoot: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
    padding: spacing.xxl,
  },
  errorTitle: {
    textAlign: 'center',
    color: colors.text,
    marginBottom: spacing.sm,
    fontSize: 16,
    fontWeight: '600',
  },
  errorSubtext: {
    textAlign: 'center',
    color: colors.textSecondary,
    marginBottom: spacing.lg,
    paddingHorizontal: spacing.lg,
  },
  appRoot: {
    flex: 1,
    backgroundColor: colors.background,
  },
  retryButton: {
    backgroundColor: colors.primary,
    paddingHorizontal: spacing.xxl,
    paddingVertical: spacing.md,
    borderRadius: 8,
  },
  retryButtonText: {
    color: colors.surface,
    fontSize: 16,
    fontWeight: '600',
  },
  webWrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#2d2d2d',
    minHeight: '100vh',
  },
  webPhoneFrame: {
    width: '100%',
    maxWidth: 390,
    minHeight: '100vh',
    backgroundColor: colors.surface,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
});
