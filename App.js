import React, { useEffect, useState } from 'react';
import { View, Text, Platform, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './components/ErrorBoundary';
import { SettingsProvider } from './contexts/SettingsContext';
import { initDatabase } from './services/database';
import TodoListScreen from './screens/TodoListScreen';
import TodoDetailScreen from './screens/TodoDetailScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  const [dbInitialized, setDbInitialized] = useState(false);

  useEffect(() => {
    const initializeApp = async () => {
      try {
        console.log('Initializing database...');
        await initDatabase();
        console.log('Database initialized, setting state...');
      } catch (error) {
        console.error('Failed to initialize database:', error);
        console.error('Error details:', error.message || error);
        // Continue anyway - database might still work or we'll handle errors in components
      } finally {
        // Always set initialized to true so UI can render
        setDbInitialized(true);
      }
    };

    initializeApp();
  }, []);

  if (!dbInitialized) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <Text>Loading...</Text>
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
              backgroundColor: '#6200ee',
            },
            headerTintColor: '#fff',
            headerTitleStyle: {
              fontWeight: 'bold',
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

  return appContent;
}

const styles = StyleSheet.create({
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
    backgroundColor: '#fff',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 12,
  },
});
