import React, { useState, useEffect } from 'react';
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
import { PronunciationMatchingScreen } from '../screens/PronunciationMatchingScreen';
import { i18n } from '../i18n/i18n';
import { RouteProp } from '@react-navigation/native';
import { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { SearchScreen } from '../screens/SearchScreen';
import { useResponsive } from '../hooks/useResponsive';

type RootTabParamList = {
  Learning: { mode: 'learning' | 'review' | 'display', character?: string } | undefined;
  Review: undefined;
  Search: undefined;
  Games: undefined;
  Settings: { screen?: string } | undefined;
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
  const { isIPad } = useResponsive();
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);

  const isMacOS = Platform.OS === 'macos';
  
  const tabBarHeight = isMacOS ? 90 : isIPad ? 70 : Platform.OS === 'ios' ? 60 : 50;
  const iconSize = isMacOS ? 40 : isIPad ? 30 : 22;
  const labelSize = isMacOS ? 18 : isIPad ? 14 : 11;
  const bottomPadding = isMacOS ? 22 : isIPad ? 10 : Platform.OS === 'ios' ? 12 : 5;

  useEffect(() => {
    // 监听语言变化
    const handleLanguageChange = () => {
      setCurrentLanguage(i18n.language);
    };

    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, []);

  const getTabScreenOptions = ({ route }: { route: RouteProp<RootTabParamList, keyof RootTabParamList> }): BottomTabNavigationOptions => ({
    tabBarIcon: ({ focused, color }: { focused: boolean; color: string; size: number }) => {
      let iconName: keyof typeof MaterialCommunityIcons.glyphMap;
      switch (route.name) {
        case 'Learning':
          iconName = focused ? 'book-open-variant' : 'book-open-outline';
          break;
        case 'Review':
          iconName = focused ? 'refresh' : 'refresh-circle';
          break;
        case 'Search':
          iconName = focused ? 'magnify' : 'magnify';
          break;
        case 'Games':
          iconName = focused ? 'gamepad-variant' : 'gamepad-variant-outline';
          break;
        case 'Settings':
          iconName = focused ? 'account' : 'account-outline';
          break;
        default:
          iconName = 'help';
      }
      return <MaterialCommunityIcons name={iconName} size={iconSize} color={color} />;
    },
    tabBarActiveTintColor: '#4CAF50',
    tabBarInactiveTintColor: 'gray',
    tabBarStyle: {
      paddingBottom: bottomPadding,
      height: tabBarHeight,
      paddingTop: isMacOS ? 10 : isIPad ? 8 : 3,
      position: 'absolute' as const,
      bottom: isMacOS ? 22 : isIPad ? 18 : 12,
      left: isMacOS ? 20 : isIPad ? 15 : 10,
      right: isMacOS ? 20 : isIPad ? 15 : 10,
      borderRadius: isMacOS ? 22 : isIPad ? 18 : 12,
      backgroundColor: '#ffffff',
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
      fontSize: labelSize,
      marginBottom: Platform.OS === 'ios' ? 0 : isIPad ? 8 : 4,
      fontWeight: isIPad ? '600' : '500',
      lineHeight: isIPad ? 22 : undefined,
    },
    headerShown: false,
    tabBarLabel: route.name === 'Settings' ? i18n.t('settings') : i18n.t(route.name.toLowerCase())
  });

  return (
    <NavigationContainer>
      <Tab.Navigator screenOptions={getTabScreenOptions} key={currentLanguage}>
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
          name="Search"
          component={SearchScreen}
          options={{ title: i18n.t('search') }}
        />
        <Tab.Screen
          name="Games"
          component={GameStackNavigator}
          options={{ title: i18n.t('games') }}
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