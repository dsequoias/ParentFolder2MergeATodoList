import React, { useEffect, useState } from 'react';
import { View, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import ErrorBoundary from './components/ErrorBoundary';
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
        setDbInitialized(true);
      } catch (error) {
        console.error('Failed to initialize app:', error);
        console.error('Error details:', JSON.stringify(error, null, 2));
        // Still set initialized to true to show the UI, database might work anyway
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

  return (
    <ErrorBoundary>
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
            options={{ title: 'My Todos' }}
          />
          <Stack.Screen 
            name="TodoDetail" 
            component={TodoDetailScreen}
            options={{ title: 'Todo Details' }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </ErrorBoundary>
  );
}
