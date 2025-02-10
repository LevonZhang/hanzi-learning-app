import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LearningScreen } from '../screens/LearningScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { Platform } from 'react-native';
import { i18n } from '../i18n/i18n';

const Tab = createBottomTabNavigator();

export const AppNavigator = () => {
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
        tabBarLabelStyle: {
          paddingBottom: Platform.OS === 'ios' ? 10 : 0,
        },
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