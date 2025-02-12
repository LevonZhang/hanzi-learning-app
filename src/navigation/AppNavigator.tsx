import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { LearningScreen } from '../screens/LearningScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { GamesScreen } from '../screens/GamesScreen';
import { SettingsScreen } from '../screens/SettingsScreen';
import { BubbleMatchingScreen } from '../screens/BubbleMatchingScreen';
import { i18n } from '../i18n/i18n';
import { RouteProp } from '@react-navigation/native';
import { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

type RootTabParamList = {
  Learning: undefined;
  Review: undefined;
  Games: undefined;
  Settings: undefined;
};

type GameStackParamList = {
  GamesList: undefined;
  WordGame: { mode: 'word' };
  PronunciationGame: { mode: 'pronunciation' };
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const GameStack = createNativeStackNavigator<GameStackParamList>();

const GameStackNavigator = () => {
  return (
    <GameStack.Navigator screenOptions={{ headerShown: false }}>
      <GameStack.Screen name="GamesList" component={GamesScreen} />
      <GameStack.Screen name="WordGame" component={BubbleMatchingScreen} initialParams={{ mode: 'word' }} />
      <GameStack.Screen name="PronunciationGame" component={BubbleMatchingScreen} initialParams={{ mode: 'pronunciation' }} />
    </GameStack.Navigator>
  );
};

export const AppNavigator = () => {
  const getTabScreenOptions = ({ route }: { route: RouteProp<RootTabParamList, keyof RootTabParamList> }): BottomTabNavigationOptions => ({
    tabBarIcon: ({ color, size }: { color: string; size: number }) => {
      let iconName: keyof typeof MaterialCommunityIcons.glyphMap;
      switch (route.name) {
        case 'Learning':
          iconName = 'book-open-variant';
          break;
        case 'Review':
          iconName = 'refresh';
          break;
        case 'Games':
          iconName = 'gamepad-variant';
          break;
        case 'Settings':
          iconName = 'cog';
          break;
        default:
          iconName = 'help';
      }
      return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
    },
    tabBarActiveTintColor: '#4CAF50',
    tabBarInactiveTintColor: '#666',
    tabBarStyle: {
      paddingBottom: Platform.OS === 'ios' ? 15 : 5,
      height: Platform.OS === 'ios' ? 70 : 60,
      paddingTop: 5,
      position: 'absolute' as const,
      bottom: 15,
      left: 10,
      right: 10,
      borderRadius: 15,
      backgroundColor: '#fff',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
    },
    tabBarLabelStyle: {
      fontSize: 12,
      marginBottom: Platform.OS === 'ios' ? 0 : 5,
    },
    headerShown: false,
    tabBarLabel: i18n.t(route.name.toLowerCase())
  });

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={getTabScreenOptions}>
        <Tab.Screen
          name="Learning"
          component={LearningScreen}
        />
        <Tab.Screen
          name="Review"
          component={ReviewScreen}
        />
        <Tab.Screen
          name="Games"
          component={GameStackNavigator}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}; 