import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { MenuScreen } from './src/screens/MenuScreen';
import { LearningScreen } from './src/screens/LearningScreen';
import { SettingsScreen } from './src/screens/SettingsScreen';
import { GamesScreen } from './src/screens/GamesScreen';
import { ReviewScreen } from './src/screens/ReviewScreen';

const Stack = createNativeStackNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: {
            backgroundColor: '#007AFF',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        <Stack.Screen 
          name="Menu" 
          component={MenuScreen}
          options={{ 
            headerShown: false
          }}
        />
        <Stack.Screen 
          name="Learning" 
          component={LearningScreen}
          options={{ 
            title: '字学堂',
          }}
        />
        <Stack.Screen 
          name="Games" 
          component={GamesScreen}
          options={{ 
            headerShown: false
          }}
        />
        <Stack.Screen 
          name="Review" 
          component={ReviewScreen}
          options={{ 
            headerShown: false
          }}
        />
        <Stack.Screen 
          name="Settings" 
          component={SettingsScreen}
          options={{ 
            headerShown: false
          }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
} 