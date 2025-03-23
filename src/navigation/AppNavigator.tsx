import React, { useState, useEffect } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { NavigationContainer } from '@react-navigation/native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { Platform } from 'react-native';
import { LearningScreen } from '../screens/LearningScreen';
import { ReviewScreen } from '../screens/ReviewScreen';
import { GamesScreen } from '../screens/GamesScreen';
import { BubbleMatchingScreen } from '../screens/BubbleMatchingScreen';
import { PronunciationMatchingScreen } from '../screens/PronunciationMatchingScreen';
import { i18n } from '../i18n/i18n';
import { RouteProp } from '@react-navigation/native';
import { BottomTabNavigationOptions } from '@react-navigation/bottom-tabs';
import { SearchScreen } from '../screens/SearchScreen';
import { useResponsive } from '../hooks/useResponsive';
import { SettingsScreen } from '../screens/SettingsScreen';

type RootTabParamList = {
  Learning: { mode: 'learning' | 'review' | 'display', character?: string } | undefined;
  Review: undefined;
  Search: undefined;
  Games: undefined;
  Settings: undefined;
};

type GameStackParamList = {
  GamesList: undefined;
  BubbleMatching: { mode: 'word' };
  PronunciationMatching: { mode: 'pronunciation' };
};

type SettingsStackParamList = {
  SettingsMain: undefined;
  BasicSettings: undefined;
  Premium: undefined;
  LearningStats: undefined;
  GameStats: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const GameStack = createNativeStackNavigator<GameStackParamList>();
const SettingsStack = createNativeStackNavigator<SettingsStackParamList>();

const GameStackNavigator = () => {
  return (
    <GameStack.Navigator screenOptions={{ headerShown: false }}>
      <GameStack.Screen name="GamesList" component={GamesScreen} />
      <GameStack.Screen 
        name="BubbleMatching" 
        component={BubbleMatchingScreen as any} 
        initialParams={{ mode: 'word' }}
      />
      <GameStack.Screen 
        name="PronunciationMatching" 
        component={PronunciationMatchingScreen as any} 
        initialParams={{ mode: 'pronunciation' }}
      />
    </GameStack.Navigator>
  );
};

const SettingsStackNavigator = () => {
  return (
    <SettingsStack.Navigator 
      screenOptions={{ 
        headerShown: false,
        animation: 'none'
      }}
    >
      <SettingsStack.Screen name="SettingsMain" component={SettingsScreen} />
    </SettingsStack.Navigator>
  );
};

export const AppNavigator = () => {
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language);
  const { theme } = useResponsive();
  const isMacOS = Platform.OS === 'macos';

  useEffect(() => {
    const handleLanguageChange = () => {
      setCurrentLanguage(i18n.language);
    };

    i18n.on('languageChanged', handleLanguageChange);

    return () => {
      i18n.off('languageChanged', handleLanguageChange);
    };
  }, []);

  const getTabScreenOptions = ({ route }: { route: RouteProp<RootTabParamList, keyof RootTabParamList> }): BottomTabNavigationOptions => {
    const getTabLabel = (routeName: string) => {
      switch (routeName) {
        case 'Settings':
          return i18n.t('settingsTab');
        default:
          return i18n.t(routeName.toLowerCase());
      }
    };

    return {
      tabBarIcon: ({ focused, color, size }) => {
        let iconName: keyof typeof MaterialCommunityIcons.glyphMap = 'home';

        switch (route.name) {
          case 'Learning':
            iconName = focused ? 'book-open-page-variant' : 'book-open-page-variant-outline';
            break;
          case 'Review':
            iconName = focused ? 'refresh' : 'refresh';
            break;
          case 'Search':
            iconName = focused ? 'magnify' : 'magnify';
            break;
          case 'Games':
            iconName = focused ? 'gamepad-variant' : 'gamepad-variant-outline';
            break;
          case 'Settings':
            iconName = focused ? 'cog' : 'cog-outline';
            break;
        }

        return <MaterialCommunityIcons name={iconName} size={size} color={color} />;
      },
      tabBarActiveTintColor: theme.colors.primary,
      tabBarInactiveTintColor: theme.colors.text,
      tabBarLabel: getTabLabel(route.name),
      headerShown: false,
      tabBarStyle: {
        display: isMacOS ? 'none' : 'flex',
      },
    };
  };

  return (
    <NavigationContainer>
      <Tab.Navigator 
        screenOptions={getTabScreenOptions} 
        key={`navigation-${currentLanguage}`}
      >
        <Tab.Screen
          name="Learning"
          component={LearningScreen}
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
        <Tab.Screen name="Review" component={ReviewScreen} />
        <Tab.Screen name="Search" component={SearchScreen} />
        <Tab.Screen name="Games" component={GameStackNavigator} />
        <Tab.Screen name="Settings" component={SettingsStackNavigator} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}; 