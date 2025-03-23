import React, { useEffect, useState } from 'react';
import { View, TouchableOpacity, Text, StyleSheet, ScrollView, Platform, Linking } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { useResponsive } from '../hooks/useResponsive';
import { i18n } from '../i18n/i18n';
import { BasicSettingsScreen } from './settings/BasicSettingsScreen';
import { PremiumScreen } from './settings/PremiumScreen';
import { LearningStatsScreen } from './settings/LearningStatsScreen';
import { GameStatsScreen } from './settings/GameStatsScreen';

interface SettingsScreenProps {
  navigation: any;
  route: any;
}

interface SettingItem {
  route: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  title: string;
  component: React.ComponentType<any>;
}

export const SettingsScreen = ({ navigation, route }: SettingsScreenProps) => {
  const { theme, isDesktop, isIPad } = useResponsive();
  const isIPhone = Platform.OS === 'ios' && !isIPad;
  const [activeRoute, setActiveRoute] = useState('BasicSettings');
  const currentLanguage = i18n.language; // 添加当前语言作为依赖

  // 每次语言变化时，强制刷新设置项目
  const settingItems: SettingItem[] = React.useMemo(() => [
    { route: 'BasicSettings', icon: 'cog', title: i18n.t('settings.basic'), component: BasicSettingsScreen },
    { route: 'Premium', icon: 'crown', title: i18n.t('settings.premium'), component: PremiumScreen },
    { route: 'LearningStats', icon: 'chart-bar', title: i18n.t('settings.learningStats'), component: LearningStatsScreen },
    { route: 'GameStats', icon: 'gamepad-variant', title: i18n.t('settings.gameStats'), component: GameStatsScreen },
  ], [currentLanguage]);

  // 当语言改变时，强制更新菜单项
  useEffect(() => {
    const forceUpdate = () => {
      setActiveRoute(current => current);
    };
    i18n.on('languageChanged', forceUpdate);
    return () => {
      i18n.off('languageChanged', forceUpdate);
    };
  }, []);

  const handleMenuPress = (route: string) => {
    setActiveRoute(route);
  };

  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#fff',
    },
    content: {
      flex: 1,
      flexDirection: 'row',
    },
    sidebar: {
      width: isDesktop ? '25%' : isIPad ? '30%' : '22%',
      maxWidth: isDesktop ? 300 : isIPad ? 250 : 100,
      borderRightWidth: 1,
      borderRightColor: '#e0e0e0',
      backgroundColor: '#f8f9fa',
    },
    sidebarScroll: {
      padding: isDesktop ? 16 : isIPad ? 12 : 8,
    },
    mainContent: {
      flex: 1,
      backgroundColor: '#fff',
    },
    menuItem: {
      flexDirection: isIPhone ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: isIPhone ? 'center' : 'flex-start',
      padding: isDesktop ? 16 : isIPad ? 12 : 8,
      backgroundColor: '#fff',
      borderRadius: 12,
      marginBottom: isDesktop ? 12 : 8,
      borderWidth: 1,
      borderColor: '#e0e0e0',
      minHeight: isIPhone ? 80 : undefined,
    },
    activeMenuItem: {
      backgroundColor: theme.colors.primary + '10',
      borderColor: theme.colors.primary,
    },
    menuIcon: {
      marginRight: isIPhone ? 0 : isDesktop ? 16 : isIPad ? 12 : 8,
      marginBottom: isIPhone ? 4 : 0,
      width: isDesktop ? 40 : isIPad ? 36 : 32,
      height: isDesktop ? 40 : isIPad ? 36 : 32,
      borderRadius: isDesktop ? 20 : isIPad ? 18 : 16,
      backgroundColor: theme.colors.primary + '10',
      justifyContent: 'center',
      alignItems: 'center',
    },
    menuText: {
      fontSize: isDesktop ? 17 : isIPad ? 15 : 11,
      color: theme.colors.text,
      fontWeight: '500',
      flex: isIPhone ? 0 : 1,
      textAlign: isIPhone ? 'center' : 'left',
      marginTop: isIPhone ? 4 : 0,
    },
    activeMenuText: {
      color: theme.colors.primary,
      fontWeight: '600',
    },
    chevron: {
      opacity: 0.5,
      display: isDesktop ? 'flex' : 'none',
    },
    welcomeContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    welcomeText: {
      fontSize: isDesktop ? 24 : isIPad ? 22 : 18,
      color: theme.colors.text,
      textAlign: 'center',
    },
    welcomeDescription: {
      fontSize: isDesktop ? 16 : isIPad ? 15 : 13,
      color: theme.colors.text + '80',
      textAlign: 'center',
      marginTop: 12,
    },
  });

  const renderMenuItem = ({ route, icon, title }: SettingItem) => {
    const isActive = activeRoute === route;
    return (
      <TouchableOpacity
        key={`${route}-${currentLanguage}`} // 添加语言作为key的一部分
        style={[styles.menuItem, isActive && styles.activeMenuItem]}
        onPress={() => handleMenuPress(route)}
      >
        <View style={styles.menuIcon}>
          <MaterialCommunityIcons
            name={icon}
            size={isDesktop ? 24 : isIPad ? 20 : 16}
            color={theme.colors.primary}
          />
        </View>
        <Text 
          style={[styles.menuText, isActive && styles.activeMenuText]}
          numberOfLines={isIPhone ? 2 : 1}
        >
          {title}
        </Text>
        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color={theme.colors.text}
          style={styles.chevron}
        />
      </TouchableOpacity>
    );
  };

  const renderWelcomeContent = () => (
    <View style={styles.welcomeContainer}>
      <Text style={styles.welcomeText}>{i18n.t('settings.title')}</Text>
      <Text style={styles.welcomeDescription}>
        {i18n.t('settings.selectOption')}
      </Text>
    </View>
  );

  const renderContent = () => {
    const selectedItem = settingItems.find(item => item.route === activeRoute);
    if (selectedItem) {
      const SelectedComponent = selectedItem.component;
      return <SelectedComponent key={currentLanguage} />; // 添加语言作为key
    }
    return <BasicSettingsScreen key={currentLanguage} />; // 添加语言作为key
  };

  return (
    <ResponsiveContainer>
      <View style={styles.container}>
        <View style={styles.content}>
          <View style={styles.sidebar}>
            <ScrollView style={styles.sidebarScroll}>
              {settingItems.map(renderMenuItem)}
            </ScrollView>
          </View>
          <View style={styles.mainContent}>
            {renderContent()}
          </View>
        </View>
      </View>
    </ResponsiveContainer>
  );
};