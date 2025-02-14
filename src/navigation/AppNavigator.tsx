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
import { ProfileScreen } from '../screens/ProfileScreen';
import { BubbleMatchingScreen } from '../screens/BubbleMatchingScreen';
import { PronunciationMatchingScreen } from '../screens/PronunciationMatchingScreen';
import { i18n } from '../i18n/i18n';
import { RouteProp } from '@react-navigation/native';
import { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';

type RootTabParamList = {
  Learning: { mode: 'learning' | 'review' } | undefined;
  Review: undefined;
  Games: undefined;
  Profile: undefined;
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
      <GameStack.Screen name="PronunciationGame" component={PronunciationMatchingScreen} initialParams={{ mode: 'pronunciation' }} />
    </GameStack.Navigator>
  );
};

export const AppNavigator = () => {
  const getTabScreenOptions = ({ route }: { route: RouteProp<RootTabParamList, keyof RootTabParamList> }): BottomTabNavigationOptions => ({
    tabBarIcon: ({ focused, color, size }: { focused: boolean; color: string; size: number }) => {
      let iconName: keyof typeof MaterialCommunityIcons.glyphMap;
      switch (route.name) {
        case 'Learning':
          iconName = focused ? 'book-open-variant' : 'book-open-outline';
          break;
        case 'Review':
          iconName = focused ? 'refresh' : 'refresh-circle';
          break;
        case 'Games':
          iconName = focused ? 'gamepad-variant' : 'gamepad-variant-outline';
          break;
        case 'Profile':
          iconName = focused ? 'account' : 'account-outline';
          break;
        case 'Settings':
          iconName = focused ? 'cog' : 'cog-outline';
          break;
        default:
          iconName = 'help';
      }
      return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
    },
    tabBarActiveTintColor: '#4CAF50',
    tabBarInactiveTintColor: 'gray',
    tabBarStyle: {
      paddingBottom: Platform.OS === 'ios' ? 15 : 5,
      height: Platform.OS === 'ios' ? 70 : 60,
      paddingTop: 5,
      position: 'absolute' as const,
      bottom: 15,
      left: 10,
      right: 10,
      borderRadius: 15,
      backgroundColor: 'rgba(255, 255, 255, 0.8)',
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.15,
      shadowRadius: 3.84,
      elevation: 5,
      borderTopWidth: 0,
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
          options={{ title: i18n.t('learning') }}
          initialParams={{ mode: 'learning' }}
          listeners={({ navigation }) => ({
            tabPress: (e) => {
              e.preventDefault();
              navigation.reset({
                index: 0,
                routes: [
                  {
                    name: 'Learning',
                    params: { mode: 'learning', reviewWords: undefined }
                  },
                ],
              });
            },
          })}
        />
        <Tab.Screen
          name="Review"
          component={ReviewScreen}
          options={{ title: i18n.t('review') }}
        />
        <Tab.Screen
          name="Games"
          component={GameStackNavigator}
          options={{ title: i18n.t('games') }}
        />
        <Tab.Screen
          name="Profile"
          component={ProfileScreen}
          options={{ title: i18n.t('profile') }}
        />
        <Tab.Screen
          name="Settings"
          component={SettingsScreen}
          options={{ title: i18n.t('settings') }}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}; 