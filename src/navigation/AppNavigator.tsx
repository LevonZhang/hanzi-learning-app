import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { LearningScreen } from '../screens/LearningScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { GamesScreen } from '../screens/GamesScreen';
import { BubbleMatchingScreen } from '../screens/BubbleMatchingScreen';
import { i18n } from '../i18n/i18n';

export type RootStackParamList = {
  MainTabs: undefined;
  BubbleMatching: {
    mode: 'word' | 'pronunciation';
  };
};

export type MainTabParamList = {
  Learning: undefined;
  Review: undefined;
  Games: undefined;
  Settings: undefined;
};

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createStackNavigator<RootStackParamList>();

const MainTabs = () => {
  return (
    <Tab.Navigator
      screenOptions={{
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopColor: '#e0e0e0',
          height: Platform.OS === 'ios' ? 85 : 60,
          paddingBottom: Platform.OS === 'ios' ? 25 : 5,
          paddingTop: 5,
        },
        tabBarActiveTintColor: '#5B7B9E',
        tabBarInactiveTintColor: '#666',
        headerShown: false,
      }}
    >
      <Tab.Screen
        name="Learning"
        component={LearningScreen}
        options={{
          tabBarLabel: i18n.t('learningMode'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="book-open-variant" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Review"
        component={ReviewScreen}
        options={{
          tabBarLabel: i18n.t('reviewMode'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="refresh" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Games"
        component={GamesScreen}
        options={{
          tabBarLabel: i18n.t('games'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="gamepad-variant" size={size} color={color} />
          ),
        }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{
          tabBarLabel: i18n.t('settings'),
          tabBarIcon: ({ color, size }) => (
            <MaterialCommunityIcons name="cog" size={size} color={color} />
          ),
        }}
      />
    </Tab.Navigator>
  );
};

export const AppNavigator = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="MainTabs"
        component={MainTabs}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="BubbleMatching"
        component={BubbleMatchingScreen}
        options={({ route }) => ({
          title: route.params.mode === 'word' 
            ? i18n.t('wordMatching')
            : i18n.t('pronunciationMatching'),
          headerStyle: {
            backgroundColor: '#4a90e2',
          },
          headerTintColor: '#fff',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        })}
      />
    </Stack.Navigator>
  );
}; 