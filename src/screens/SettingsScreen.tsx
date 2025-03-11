import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, FlatList, ActivityIndicator, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import { i18n } from '../i18n/i18n';
import { LearningManager } from '../services/LearningManager';
import SubscriptionService from '../services/SubscriptionService';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { useResponsive } from '../hooks/useResponsive';
import { logger } from '../utils/logger';
import { SUBSCRIPTION_PLANS, SubscriptionPlanId } from '../services/SubscriptionService';
import gameService from '../services/GameService';

interface SettingsScreenProps {
  navigation: any;
}

type MenuSection = 'premium' | 'settings' | 'learningStats' | 'gameStats';

interface SubscriptionPlan {
  id: SubscriptionPlanId;
  title: string;
  price: number;
  period: string;
  description: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  name: string;
  duration: string;
}

interface LearningStats {
  totalCharacters: number;
  masteredCharacters: number;
  totalLearningTime: number; // 以分钟为单位
  weeklyProgress: number[];
  monthlyProgress: number[];
}

interface GameProgress {
  currentLevel: number;
  completedWords: string[];
  score: number;
  isCompleted: boolean;
}

interface GameStats {
  wordGame: {
    highScore: number;
    gamesPlayed: number;
    isCompleted: boolean;
  };
  pronunciationGame: {
    highScore: number;
    gamesPlayed: number;
    isCompleted: boolean;
  };
}

interface SubscriptionStatus {
  isActive: boolean;
  isLifetime: boolean;
  expirationDate?: Date;
  productId?: string;
}

interface LearnedCharacter {
  character: string;
  masteryLevel: number;
  lastReviewDate: string;
}

const useResponsiveFontSizes = () => {
  const { isDesktop, isIPad } = useResponsive();
  
  const getSize = (size: number) => {
    if (isDesktop) {
      return Math.round(size * 1.25); // 25% larger on desktop
    }
    if (isIPad) {
      return Math.round(size * 1.1); // 10% larger on iPad
    }
    return Math.round(size * 0.9); // 10% smaller on iPhone
  };

  return {
    menuText: getSize(14),
    settingGroupTitle: getSize(18),
    settingLabel: getSize(16),
    numberValue: getSize(18),
    languageButtonText: getSize(16),
    statsText: getSize(24),
    statsLabel: getSize(14),
    legendText: getSize(14),
    gameTitle: getSize(18),
    statText: getSize(16),
    resetButtonText: getSize(16),
    planName: getSize(16),
    planDuration: getSize(13),
    planPriceAmount: getSize(20),
    planPricePeriod: getSize(12),
    planDescription: getSize(14),
    characterText: getSize(28),
    premiumStatusText: getSize(16),
    expirationText: getSize(14),
    sectionTitle: getSize(18),
    noDataText: getSize(16),
  };
};

export const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
  const { theme, isDesktop, isIPad } = useResponsive();
  const fontSizes = useResponsiveFontSizes();
  
  const styles = StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: '#fff',
      width: '100%',
    },
    desktopContainer: {
      paddingHorizontal: 0,
      maxWidth: '100%',
    },
    splitView: {
      flex: 1,
      flexDirection: 'row',
      width: '100%',
    },
    mobileSidebar: {
      width: isIPad ? 200 : 100,
      backgroundColor: '#f8f9fa',
      borderRightWidth: 1,
      borderRightColor: '#e0e0e0',
      padding: isIPad ? 16 : 12,
    },
    mainContentWrapper: {
      flex: 1,
      width: '100%',
      maxWidth: isDesktop ? 800 : '100%',
      alignSelf: 'center',
    },
    mainContent: {
      flex: 1,
      padding: 16,
      width: '100%',
    },
    menuItem: {
      flexDirection: 'column',
      alignItems: 'center',
      paddingVertical: isIPad ? 16 : 12,
      paddingHorizontal: isIPad ? 16 : 8,
      borderRadius: 8,
      backgroundColor: '#f8f9fa',
      marginBottom: isIPad ? 16 : 8,
      gap: isIPad ? 12 : 8,
      width: '100%',
    },
    desktopMenuItem: {
      padding: 16,
      marginBottom: 12,
      flexDirection: 'row',
    },
    menuText: {
      fontSize: fontSizes.menuText,
      color: '#333',
      fontWeight: '500',
      textAlign: 'center',
      width: '100%',
      flexShrink: 1,
    },
    desktopMenuText: {
      fontSize: fontSizes.menuText,
      marginLeft: 12,
    },
    sectionContent: {
      flex: 1,
      width: '100%',
      padding: 16,
    },
    premiumStatusContainer: {
      backgroundColor: '#f8f9fa',
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      width: '100%',
    },
    premiumStatusHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    premiumStatusText: {
      fontSize: fontSizes.premiumStatusText,
      fontWeight: '600',
      color: '#333',
    },
    expirationText: {
      fontSize: fontSizes.expirationText,
      color: '#666',
    },
    subscriptionPlans: {
      width: '100%',
      gap: 8,
    },
    subscriptionPlan: {
      backgroundColor: '#fff',
      borderRadius: 12,
      padding: 12,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 3,
      width: '100%',
    },
    planHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    planIconAndName: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
    },
    planIcon: {
      width: 32,
      height: 32,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: 16,
      backgroundColor: 'rgba(0, 122, 255, 0.1)',
    },
    planNameContainer: {
      marginLeft: 8,
      flex: 1,
    },
    planName: {
      fontSize: fontSizes.planName,
      fontWeight: '600',
      color: '#333',
    },
    planDuration: {
      fontSize: fontSizes.planDuration,
      color: '#666',
      marginTop: 2,
    },
    planPriceContainer: {
      alignItems: 'flex-end',
    },
    planPriceAmount: {
      fontSize: fontSizes.planPriceAmount,
      fontWeight: '700',
      color: '#007AFF',
    },
    planPricePeriod: {
      fontSize: fontSizes.planPricePeriod,
      color: '#666',
      marginTop: 2,
    },
    planDescription: {
      fontSize: fontSizes.planDescription,
      color: '#666',
      lineHeight: fontSizes.planDescription * 1.3,
      marginTop: 4,
    },
    settingGroup: {
      marginBottom: 25,
      width: '100%',
    },
    settingGroupTitle: {
      fontSize: fontSizes.settingGroupTitle,
      fontWeight: '600',
      color: '#333',
      marginBottom: 15,
    },
    settingItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 10,
      width: '100%',
    },
    settingLabel: {
      fontSize: fontSizes.settingLabel,
      color: '#666',
    },
    numberSelector: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 15,
    },
    numberButton: {
      width: 30,
      height: 30,
      borderRadius: 15,
      backgroundColor: '#007AFF',
      justifyContent: 'center',
      alignItems: 'center',
    },
    numberButtonText: {
      color: '#fff',
      fontSize: 18,
      fontWeight: 'bold',
    },
    numberValue: {
      fontSize: fontSizes.numberValue,
      fontWeight: '600',
      color: '#333',
      minWidth: 30,
      textAlign: 'center',
    },
    languageButtons: {
      flexDirection: 'row',
      gap: 10,
      flexWrap: 'wrap',
      justifyContent: 'flex-start',
      width: '100%',
    },
    languageButton: {
      paddingVertical: 8,
      paddingHorizontal: 16,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: '#e0e0e0',
      minWidth: 100,
    },
    activeLanguage: {
      backgroundColor: '#007AFF',
      borderColor: '#007AFF',
    },
    languageButtonText: {
      fontSize: fontSizes.languageButtonText,
      color: '#333',
      textAlign: 'center',
    },
    activeLanguageText: {
      color: '#fff',
    },
    statsContainer: {
      flex: 1,
      width: '100%',
    },
    statsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      backgroundColor: '#f8f9fa',
      padding: 20,
      borderRadius: 12,
      marginBottom: 20,
      width: '100%',
    },
    statItem: {
      alignItems: 'center',
      width: '30%',
      paddingHorizontal: 8,
    },
    timeStatItem: {
      alignItems: 'center',
      width: '34%',
      paddingHorizontal: 8,
    },
    statDivider: {
      width: 1,
      height: '80%',
      backgroundColor: '#e0e0e0',
    },
    statsText: {
      fontSize: fontSizes.statsText,
      fontWeight: '600',
      color: '#333',
      marginVertical: 8,
    },
    statsLabel: {
      fontSize: fontSizes.statsLabel,
      color: '#666',
      textAlign: 'center',
    },
    legendContainer: {
      flexDirection: 'row',
      marginBottom: 15,
      gap: 16,
    },
    legendItem: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    legendColor: {
      width: 16,
      height: 16,
      borderRadius: 8,
    },
    legendText: {
      fontSize: fontSizes.legendText,
      color: '#666',
    },
    characterList: {
      width: '100%',
    },
    characterGrid: {
      width: '100%',
    },
    characterItem: {
      flex: 1,
      alignItems: 'center',
      padding: 10,
      marginBottom: 10,
    },
    characterText: {
      fontSize: fontSizes.characterText,
      fontWeight: 'bold',
    },
    gameStatsContainer: {
      width: '100%',
      gap: 16,
    },
    gameStatItem: {
      backgroundColor: 'white',
      padding: 20,
      borderRadius: 12,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOffset: {
        width: 0,
        height: 2,
      },
      shadowOpacity: 0.1,
      shadowRadius: 3,
      elevation: 3,
      width: '100%',
    },
    gameTitle: {
      fontSize: fontSizes.gameTitle,
      fontWeight: 'bold',
      marginBottom: 8,
      color: '#333',
    },
    statText: {
      fontSize: fontSizes.statText,
      color: '#666',
      marginBottom: 4,
    },
    resetButton: {
      backgroundColor: '#ff6b6b',
      padding: 10,
      borderRadius: 8,
      marginTop: 10,
      alignItems: 'center',
    },
    resetButtonText: {
      color: 'white',
      fontSize: fontSizes.resetButtonText,
      fontWeight: 'bold',
    },
    sectionTitle: {
      fontSize: fontSizes.sectionTitle,
      fontWeight: '600',
      color: '#333',
      marginBottom: 15,
    },
    noDataText: {
      fontSize: fontSizes.noDataText,
      color: '#8E8E93',
      textAlign: 'center',
    },
    restoreButton: {
      backgroundColor: '#007AFF',
      padding: 10,
      borderRadius: 8,
      marginTop: 12,
      alignItems: 'center',
    },
    restoreButtonText: {
      color: 'white',
      fontSize: fontSizes.resetButtonText,
      fontWeight: 'bold',
    },
    loadingFooter: {
      padding: 10,
      justifyContent: 'center',
      alignItems: 'center',
    },
    lockIcon: {
      position: 'absolute',
      top: 0,
      right: 0,
      padding: 4,
    },
    sectionTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    premiumTagContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 4,
      borderRadius: 4,
      backgroundColor: 'rgba(255, 215, 0, 0.2)',
    },
    premiumTagText: {
      fontSize: fontSizes.settingLabel,
      color: '#FFD700',
      fontWeight: '600',
      marginLeft: 4,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      color: theme.colors.primary,
      fontSize: 16,
      fontWeight: 'bold',
      marginTop: 10,
    },
  });

  const [dailyWords, setDailyWords] = useState(5);
  const [currentLanguage, setCurrentLanguage] = useState(i18n.language || 'zh');
  const [isPremium, setIsPremium] = useState(false);
  const [activeSection, setActiveSection] = useState<MenuSection>('premium');
  const [subscriptionStatus, setSubscriptionStatus] = useState<SubscriptionStatus>({
    isActive: false,
    isLifetime: false,
  });
  const [subscriptionPlansState, setSubscriptionPlansState] = useState<SubscriptionPlan[]>([]);
  const [learningStats, setLearningStats] = useState<LearningStats>({
    totalCharacters: 0,
    masteredCharacters: 0,
    totalLearningTime: 0,
    weeklyProgress: [],
    monthlyProgress: [],
  });
  const [gameStats, setGameStats] = useState<GameStats>({
    wordGame: { highScore: 0, gamesPlayed: 0, isCompleted: false },
    pronunciationGame: { highScore: 0, gamesPlayed: 0, isCompleted: false }
  });
  const [learnedCharacters, setLearnedCharacters] = useState<LearnedCharacter[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [gameProgress, setGameProgress] = useState<GameProgress | null>(null);
  const [pronunciationGameProgress, setPronunciationGameProgress] = useState<GameProgress | null>(null);
  const ITEMS_PER_PAGE = isDesktop ? 24 : 18;
  const [lastSubscriptionAlertTime, setLastSubscriptionAlertTime] = useState<number>(0);
  const ALERT_COOLDOWN = 5000; // 5秒内不重复显示

  useEffect(() => {
    loadData();
    
    // 添加订阅更新监听器
    if (Platform.OS !== 'web') {
      const subscriptionService = SubscriptionService.getInstance();
      const unsubscribe = subscriptionService.addSubscriptionUpdateListener((data) => {
        if (data) {
          setSubscriptionStatus({
            isActive: data.isActive,
            isLifetime: data.productId?.includes('lifetime') || false,
            expirationDate: data.expirationDate ? new Date(data.expirationDate as string) : undefined,
            productId: data.productId || undefined,
          });
          setIsPremium(data.isActive);
        }
      });
      
      // 清理监听器
      return () => {
        unsubscribe();
      };
    }
  }, []);

  // 添加新的effect，当activeSection为gameStats时刷新游戏统计数据
  useEffect(() => {
    if (activeSection === 'gameStats') {
      loadGameStats();
    }
    
    // 当切换到会员页面时，刷新订阅状态
    if (activeSection === 'premium' && Platform.OS !== 'web') {
      refreshSubscriptionStatus();
    }
  }, [activeSection]);

  const loadData = async () => {
    loadLearnedCharacters();
    loadSettings();
    loadStats();
    
    // 初始化订阅相关
    if (Platform.OS !== 'web') {
      initializeSubscription();
    }
    
    // 确保加载游戏统计
    loadGameStats();
  };

  // 拆分游戏统计的加载为单独的函数
  const loadGameStats = async () => {
    try {
      // 加载游戏统计
      const gameStatsStr = await AsyncStorage.getItem('gameStats');
      if (gameStatsStr) {
        const parsedGameStats = JSON.parse(gameStatsStr);
        setGameStats(parsedGameStats);
      }

      // 加载游戏进度
      try {
        const wordProgress = await gameService.loadGameProgress('word');
        setGameProgress(wordProgress);

        const pronunciationProgress = await gameService.loadGameProgress('pronunciation');
        setPronunciationGameProgress(pronunciationProgress);
      } catch (error) {
        console.error('加载游戏进度失败:', error);
      }
    } catch (error) {
      console.error('加载游戏统计失败:', error);
    }
  };

  const loadStats = async () => {
    try {
      // 从 StatisticsService 获取学习统计数据
      const learningManager = LearningManager.getInstance();
      const stats = await learningManager.getStatistics();
      
      setLearningStats({
        totalCharacters: stats.totalLearned,
        masteredCharacters: stats.mastered,
        totalLearningTime: 0,
        weeklyProgress: [],
        monthlyProgress: [],
      });

      // 获取学习时间等其他统计数据
      const storedStats = await AsyncStorage.getItem('learningStats');
      if (storedStats) {
        const parsedStats = JSON.parse(storedStats);
        setLearningStats(prev => ({
          ...prev,
          totalLearningTime: parsedStats.totalLearningTime || 0,
          weeklyProgress: parsedStats.weeklyProgress || [],
          monthlyProgress: parsedStats.monthlyProgress || [],
        }));
      }

      // 游戏统计移动到loadGameStats函数中
    } catch (error) {
      console.error('加载统计数据失败:', error);
    }
  };

  const loadLearnedCharacters = async () => {
    try {
      const learningManager = LearningManager.getInstance();
      const progress = await learningManager.getAllProgress();
      const characters = Object.entries(progress).map(([char, data]) => ({
        character: char,
        masteryLevel: data.masteryLevel,
        lastReviewDate: data.lastReviewDate,
      }));
      const sortedCharacters = characters.sort((a, b) => b.masteryLevel - a.masteryLevel);
      setLearnedCharacters(sortedCharacters);
      setHasMore(sortedCharacters.length > ITEMS_PER_PAGE);
    } catch (error) {
      console.error('加载已学习汉字失败:', error);
    }
  };

  const getPaginatedCharacters = () => {
    const endIndex = (currentPage + 1) * ITEMS_PER_PAGE;
    return learnedCharacters.slice(0, endIndex);
  };

  const handleLoadMore = () => {
    if (isLoading) return;
    
    setIsLoading(true);
    const nextPage = currentPage + 1;
    const nextEndIndex = (nextPage + 1) * ITEMS_PER_PAGE;
    
    setTimeout(() => {
      setCurrentPage(nextPage);
      setHasMore(nextEndIndex < learnedCharacters.length);
      setIsLoading(false);
    }, 300);
  };

  const renderCharacterItem = ({ item }: { item: LearnedCharacter }) => (
    <TouchableOpacity 
      style={[
        styles.characterItem,
        !subscriptionStatus.isActive && { opacity: 0.7 }
      ]}
      onPress={() => {
        if (subscriptionStatus.isActive) {
          navigation.navigate('Learning', {
            mode: 'display',
            character: item.character,
            fromSettings: true
          });
        } else {
          // 显示需要会员的提示
          Alert.alert(
            i18n.t('premiumFeature'),
            i18n.t('searchPremiumDesc'),
            [
              { 
                text: i18n.t('cancel'), 
                style: 'cancel' 
              },
              {
                text: i18n.t('getPremiumButton'),
                onPress: () => setActiveSection('premium')
              }
            ]
          );
        }
      }}
    >
      <Text style={[
        styles.characterText, 
        { color: getMasteryLevelColor(item.masteryLevel) }
      ]}>
        {item.character}
      </Text>
      {!subscriptionStatus.isActive && (
        <MaterialCommunityIcons 
          name="lock" 
          size={14} 
          color="#7F7F7F" 
          style={styles.lockIcon} 
        />
      )}
    </TouchableOpacity>
  );

  const renderListFooter = () => {
    if (!hasMore && !isLoading) return null;
    
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  };

  const saveDailyWords = async (value: number) => {
    try {
      await AsyncStorage.setItem('dailyWords', value.toString());
      setDailyWords(value);
    } catch (error) {
      console.error('保存每日字数失败:', error);
    }
  };

  const changeLanguage = async (lang: string) => {
    try {
      await AsyncStorage.setItem('language', lang);
      await i18n.changeLanguage(lang);
      setCurrentLanguage(lang);
      updateSubscriptionPlans(); // 确保在语言改变后立即更新订阅计划
    } catch (error) {
      console.error('切换语言失败:', error);
    }
  };

  const handleSubscription = async (plan: SubscriptionPlan) => {
    try {
      // 检查是否已经有活跃的订阅
      if (subscriptionStatus.isActive) {
        Alert.alert(
          i18n.t('subscription.alreadySubscribed'),
          i18n.t('subscription.alreadySubscribedDesc'),
          [{ text: i18n.t('ok'), style: 'cancel' }]
        );
        return;
      }

      // 确定正确的时间周期键
      let periodKey = 'oneTime'; // 默认是一次性付费(终身会员)
      if (plan.id.includes('monthly')) {
        periodKey = 'perMonth';
      } else if (plan.id.includes('quarterly')) {
        periodKey = 'perQuarter';
      } else if (plan.id.includes('yearly')) {
        periodKey = 'perYear';
      }
      
      const periodText = i18n.t(periodKey);

      Alert.alert(
        i18n.t('subscriptionConfirm'),
        i18n.t('subscriptionConfirmDesc', { price: plan.price, period: periodText }),
        [
          {
            text: i18n.t('cancelButton'),
            style: 'cancel',
          },
          {
            text: i18n.t('subscribeButton'),
            onPress: async () => {
              try {
                setIsLoading(true);
                const subscriptionService = SubscriptionService.getInstance();
                const result = await subscriptionService.purchaseSubscription(plan.id);
                
                if (result.success) {
                  // 立即刷新订阅状态
                  await subscriptionService.fetchAndUpdateSubscriptionStatus();
                  
                  if (result.status === 'deferred') {
                    Alert.alert(
                      i18n.t('subscription.deferred'),
                      i18n.t('subscription.deferredMessage'),
                      [{ text: i18n.t('ok') }]
                    );
                  } else {
                    // 显示成功消息并强制刷新状态
                    Alert.alert(
                      i18n.t('subscription.purchaseSuccess'),
                      i18n.t('subscription.purchaseSuccessDesc'),
                      [{ 
                        text: i18n.t('ok'),
                        onPress: () => {
                          // 重置视图到 premium 区域，显示最新状态
                          setActiveSection('premium');
                        } 
                      }]
                    );
                  }
                } else {
                  console.error('订阅失败:', result.error);
                  Alert.alert(i18n.t('errorTitle'), i18n.t('purchaseError'));
                }
              } catch (error: any) {
                if (error.code !== 'E_USER_CANCELLED') {
                  console.error('订阅失败:', error);
                  Alert.alert(i18n.t('errorTitle'), i18n.t('purchaseError'));
                }
              } finally {
                setIsLoading(false);
              }
            },
          },
        ]
      );
    } catch (error) {
      console.error('处理订阅失败:', error);
      Alert.alert(i18n.t('errorTitle'), i18n.t('purchaseError'));
    }
  };

  const formatLearningTime = (minutes: number): string => {
    if (minutes < 60) {
      return `${minutes}${i18n.t('minutes')}`;
    }
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    if (remainingMinutes === 0) {
      return `${hours}${i18n.t('hours')}`;
    }
    return `${hours}${i18n.t('hours')}${remainingMinutes}${i18n.t('minutes')}`;
  };

  const formatRemainingDays = (expirationDate: Date): { days: number; hours: number; minutes: number } => {
    const now = new Date();
    const diffTime = expirationDate.getTime() - now.getTime();
    
    // 如果已经过期，直接返回0天0小时0分钟
    if (diffTime <= 0) {
      return { days: 0, hours: 0, minutes: 0 };
    }
    
    // 计算天数、小时和分钟
    const days = Math.floor(diffTime / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffTime % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffTime % (1000 * 60 * 60)) / (1000 * 60));
    
    return { days, hours, minutes };
  };

  const getMasteryLevelColor = (level: number): string => {
    switch (true) {
      case level >= 2:
        return '#34C759'; // 已掌握 - 绿色
      case level === 1:
        return '#333333'; // 已学习 - 黑色
      default:
        return '#333333'; // 默认黑色
    }
  };

  const renderMenuItem = (section: MenuSection, icon: keyof typeof MaterialCommunityIcons.glyphMap, title: string) => (
    <TouchableOpacity
      style={[
        styles.menuItem,
        activeSection === section && { backgroundColor: theme.colors.primary },
        isDesktop && styles.desktopMenuItem
      ]}
      onPress={() => setActiveSection(section)}
    >
      <MaterialCommunityIcons
        name={icon}
        size={isIPad ? 32 : 24}
        color={activeSection === section ? theme.colors.textLight : theme.colors.textPrimary}
      />
      <Text
        style={[
          styles.menuText,
          { fontSize: fontSizes.menuText },
          activeSection === section && { color: theme.colors.textLight },
          isDesktop && styles.desktopMenuText
        ]}
        numberOfLines={1}
      >
        {title}
      </Text>
    </TouchableOpacity>
  );

  const renderContent = () => {
    switch (activeSection) {
      case 'premium':
        return (
          <View style={styles.sectionContent}>
            <View style={styles.premiumStatusContainer}>
              <View style={styles.premiumStatusHeader}>
                <MaterialCommunityIcons 
                  name={subscriptionStatus.isLifetime ? "crown" : "star"} 
                  size={24} 
                  color="#FFD700" 
                />
                <Text style={[styles.premiumStatusText, { fontSize: fontSizes.premiumStatusText }]}>
                  {subscriptionStatus.isLifetime 
                    ? i18n.t('lifetimeName')
                    : subscriptionStatus.isActive 
                      ? subscriptionStatus.productId?.includes('monthly')
                        ? i18n.t('monthlyName')
                        : subscriptionStatus.productId?.includes('quarterly')
                          ? i18n.t('quarterlyName')
                          : subscriptionStatus.productId?.includes('yearly')
                            ? i18n.t('yearlyName')
                            : i18n.t('premiumActiveStatus')
                      : i18n.t('getPremium')
                  }
                </Text>
              </View>
              {subscriptionStatus.isActive && !subscriptionStatus.isLifetime && subscriptionStatus.expirationDate && (
                <Text style={[styles.expirationText, { fontSize: fontSizes.expirationText }]}>
                  {(() => {
                    const remaining = formatRemainingDays(subscriptionStatus.expirationDate);
                    return i18n.t('timeRemaining', { 
                      days: remaining.days, 
                      hours: remaining.hours, 
                      minutes: remaining.minutes 
                    });
                  })()}
                </Text>
              )}
            </View>

            {!subscriptionStatus.isLifetime && (
              <View style={styles.subscriptionPlans}>
                {isLoading && (
                  <View style={styles.loadingContainer}>
                    <ActivityIndicator size="large" color={theme.colors.primary} />
                    <Text style={styles.loadingText}>{i18n.t('loading')}</Text>
                  </View>
                )}
                {subscriptionPlansState.map((plan) => (
                  <TouchableOpacity
                    key={plan.id}
                    style={styles.subscriptionPlan}
                    onPress={() => handleSubscription(plan)}
                  >
                    <View style={styles.planHeader}>
                      <View style={styles.planIconAndName}>
                        <View style={styles.planIcon}>
                          <MaterialCommunityIcons name={plan.icon} size={24} color="#007AFF" />
                        </View>
                        <View style={styles.planNameContainer}>
                          <Text style={[styles.planName, { fontSize: fontSizes.planName }]}>{plan.name}</Text>
                          <Text style={[styles.planDuration, { fontSize: fontSizes.planDuration }]}>{plan.duration}</Text>
                        </View>
                      </View>
                      <View style={styles.planPriceContainer}>
                        <Text style={[styles.planPriceAmount, { fontSize: fontSizes.planPriceAmount }]}>${plan.price}</Text>
                        <Text style={[styles.planPricePeriod, { fontSize: fontSizes.planPricePeriod }]}>{plan.period}</Text>
                      </View>
                    </View>
                    <Text style={[styles.planDescription, { fontSize: fontSizes.planDescription }]}>{plan.description}</Text>
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>
        );
      case 'settings':
        return (
          <View style={styles.sectionContent}>
            <View style={styles.settingGroup}>
              <Text style={[styles.settingGroupTitle, { fontSize: fontSizes.settingGroupTitle }]}>{i18n.t('learningSettings')}</Text>
              <View style={styles.settingItem}>
                <Text style={[styles.settingLabel, { fontSize: fontSizes.settingLabel }]}>{i18n.t('dailyWords')}</Text>
                <View style={styles.numberSelector}>
                  <TouchableOpacity 
                    onPress={() => dailyWords > 1 && saveDailyWords(dailyWords - 1)}
                    style={styles.numberButton}
                  >
                    <Text style={styles.numberButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={[styles.numberValue, { fontSize: fontSizes.numberValue }]}>{dailyWords}</Text>
                  <TouchableOpacity 
                    onPress={() => dailyWords < 20 && saveDailyWords(dailyWords + 1)}
                    style={styles.numberButton}
                  >
                    <Text style={styles.numberButtonText}>+</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
            <View style={styles.settingGroup}>
              <Text style={[styles.settingGroupTitle, { fontSize: fontSizes.settingGroupTitle }]}>{i18n.t('language')}</Text>
              <View style={styles.languageButtons}>
                <TouchableOpacity 
                  style={[styles.languageButton, currentLanguage === 'zh' && styles.activeLanguage]}
                  onPress={() => changeLanguage('zh')}
                >
                  <Text style={[styles.languageButtonText, currentLanguage === 'zh' && styles.activeLanguageText]}>
                    中文
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.languageButton, currentLanguage === 'en' && styles.activeLanguage]}
                  onPress={() => changeLanguage('en')}
                >
                  <Text style={[styles.languageButtonText, currentLanguage === 'en' && styles.activeLanguageText]}>
                    English
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity 
                  style={[styles.languageButton, currentLanguage === 'ja' && styles.activeLanguage]}
                  onPress={() => changeLanguage('ja')}
                >
                  <Text style={[styles.languageButtonText, currentLanguage === 'ja' && styles.activeLanguageText]}>
                    日本語
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      case 'gameStats':
        return (
          <View style={styles.sectionContent}>
            <View style={styles.gameStatsContainer}>
              <View style={styles.gameStatItem}>
                <Text style={[styles.gameTitle, { fontSize: fontSizes.gameTitle }]}>{i18n.t('wordGame')}</Text>
                <Text style={[styles.statText, { fontSize: fontSizes.statText }]}>
                  {i18n.t('highScore')}: {gameStats.wordGame.highScore}
                </Text>
                <Text style={[styles.statText, { fontSize: fontSizes.statText }]}>
                  {i18n.t('gamesPlayed')}: {gameStats.wordGame.gamesPlayed}
                </Text>
                {gameProgress && (
                  <Text style={[styles.statText, { fontSize: fontSizes.statText }]}>
                    {i18n.t('currentProgress')}: {i18n.t('level', { level: gameProgress.currentLevel })} - {gameProgress.score}{i18n.t('points')}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => handleResetGame('word')}
                >
                  <Text style={[styles.resetButtonText, { fontSize: fontSizes.resetButtonText }]}>{i18n.t('resetGame')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.gameStatItem}>
                <Text style={[styles.gameTitle, { fontSize: fontSizes.gameTitle }]}>{i18n.t('pronunciationGame')}</Text>
                <Text style={[styles.statText, { fontSize: fontSizes.statText }]}>
                  {i18n.t('highScore')}: {gameStats.pronunciationGame.highScore}
                </Text>
                <Text style={[styles.statText, { fontSize: fontSizes.statText }]}>
                  {i18n.t('gamesPlayed')}: {gameStats.pronunciationGame.gamesPlayed}
                </Text>
                {pronunciationGameProgress && (
                  <Text style={[styles.statText, { fontSize: fontSizes.statText }]}>
                    {i18n.t('currentProgress')}: {i18n.t('level', { level: pronunciationGameProgress.currentLevel })} - {pronunciationGameProgress.score}{i18n.t('points')}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => handleResetGame('pronunciation')}
                >
                  <Text style={[styles.resetButtonText, { fontSize: fontSizes.resetButtonText }]}>{i18n.t('resetGame')}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        );
      case 'learningStats':
        return (
          <View style={styles.statsContainer}>
            <View style={styles.statsHeader}>
              <View style={styles.statItem}>
                <MaterialCommunityIcons name="book-open-variant" size={24} color="#007AFF" />
                <Text style={[styles.statsText, { fontSize: fontSizes.statsText }]}>
                  {learningStats.totalCharacters}
                </Text>
                <Text style={[styles.statsLabel, { fontSize: fontSizes.statsLabel }]}>{i18n.t('learned')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <MaterialCommunityIcons name="star" size={24} color="#007AFF" />
                <Text style={[styles.statsText, { fontSize: fontSizes.statsText }]}>
                  {learningStats.masteredCharacters}
                </Text>
                <Text style={[styles.statsLabel, { fontSize: fontSizes.statsLabel }]}>{i18n.t('mastered')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={[styles.statItem, styles.timeStatItem]}>
                <MaterialCommunityIcons name="clock-outline" size={24} color="#007AFF" />
                <Text style={[styles.statsText, { fontSize: fontSizes.statsText }]}>
                  {formatLearningTime(learningStats.totalLearningTime)}
                </Text>
                <Text style={[styles.statsLabel, { fontSize: fontSizes.statsLabel }]}>{i18n.t('totalLearningTime')}</Text>
              </View>
            </View>
            <View style={styles.sectionTitleContainer}>
              <Text style={[styles.sectionTitle, { fontSize: fontSizes.sectionTitle }]}>{i18n.t('learnedCharacters')}</Text>
              {!subscriptionStatus.isActive && (
                <View style={styles.premiumTagContainer}>
                  <MaterialCommunityIcons name="crown" size={16} color="#FFD700" />
                  <Text style={styles.premiumTagText}>{i18n.t('premium')}</Text>
                </View>
              )}
            </View>
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: '#34C759' }]} />
                <Text style={[styles.legendText, { fontSize: fontSizes.legendText }]}>{i18n.t('masteryLevel2')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: '#333333' }]} />
                <Text style={[styles.legendText, { fontSize: fontSizes.legendText }]}>{i18n.t('masteryLevel1')}</Text>
              </View>
            </View>
            {learnedCharacters.length > 0 ? (
              <FlatList
                data={getPaginatedCharacters()}
                renderItem={renderCharacterItem}
                keyExtractor={(item) => item.character}
                numColumns={3}
                contentContainerStyle={styles.characterGrid}
                ListFooterComponent={renderListFooter}
                scrollEnabled={true}
                nestedScrollEnabled={true}
                style={styles.characterList}
                onEndReached={hasMore ? handleLoadMore : null}
                onEndReachedThreshold={0.3}
                initialNumToRender={ITEMS_PER_PAGE}
              />
            ) : (
              <Text style={[styles.noDataText, { fontSize: fontSizes.noDataText }]}>{i18n.t('noLearnedChars')}</Text>
            )}
          </View>
        );
      default:
        return null;
    }
  };

  const handleResetGame = async (gameType: 'word' | 'pronunciation') => {
    Alert.alert(
      i18n.t('resetConfirmTitle'),
      i18n.t('resetConfirmMessage'),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel'
        },
        {
          text: i18n.t('confirm'),
          onPress: async () => {
            try {
              await gameService.resetGame(gameType);
              
              // 重置完成后立即刷新游戏统计
              loadGameStats();
              
              Alert.alert(i18n.t('success'), i18n.t('resetSuccess'));
            } catch (error) {
              console.error('重置游戏失败:', error);
              Alert.alert(i18n.t('error'), i18n.t('resetError'));
            }
          }
        }
      ]
    );
  };

  const loadSettings = async () => {
    try {
      const storedDailyWords = await AsyncStorage.getItem('dailyWords');
      const storedLanguage = await AsyncStorage.getItem('language');
      const storedPremium = await AsyncStorage.getItem('isPremium');

      if (storedDailyWords) setDailyWords(parseInt(storedDailyWords));
      if (storedLanguage) {
        await i18n.changeLanguage(storedLanguage);
        setCurrentLanguage(storedLanguage);
      }
      if (storedPremium) setIsPremium(storedPremium === 'true');
      
      updateSubscriptionPlans(); // 确保在加载设置后更新订阅计划
    } catch (error) {
      logger.error('加载设置失败:', error);
    }
  };

  const updateSubscriptionPlans = () => {
    const plans: SubscriptionPlan[] = Object.entries(SUBSCRIPTION_PLANS).map(([id, plan]) => {
      // 从完整的产品ID中提取简短标识符用于本地化键
      const shortId = id.split('.').pop()?.replace('sub.', '') || '';
      
      // 确定正确的时间周期键
      let periodKey = 'oneTime'; // 默认是一次性付费(终身会员)
      if (shortId === 'monthly') {
        periodKey = 'perMonth';
      } else if (shortId === 'quarterly') {
        periodKey = 'perQuarter';
      } else if (shortId === 'yearly') {
        periodKey = 'perYear';
      }
      
      return {
        id: id as SubscriptionPlanId,
        title: i18n.t(`${shortId}Plan`),
        price: plan.price,
        period: i18n.t(periodKey),
        description: i18n.t(`${shortId}Desc`),
        icon: plan.icon,
        name: i18n.t(`${shortId}Name`),
        duration: i18n.t(`${shortId}Duration`),
      };
    });
    setSubscriptionPlansState(plans);
  };

  const initializeSubscription = async () => {
    try {
      const subscriptionService = SubscriptionService.getInstance();
      await subscriptionService.initialize();
      
      // 预加载可用的订阅产品
      subscriptionService.getAvailableSubscriptions().catch(error => {
        console.error('获取可用订阅产品失败:', error);
      });
      
      // 主动刷新一次订阅状态，检查是否有退款等变更
      await subscriptionService.fetchAndUpdateSubscriptionStatus();
      
      // 获取订阅状态
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        
        setSubscriptionStatus({
          isActive: parsedData.isActive,
          isLifetime: parsedData.productId?.includes('lifetime') || false,
          expirationDate: parsedData.expirationDate ? new Date(parsedData.expirationDate) : undefined,
          productId: parsedData.productId || undefined,
        });
        setIsPremium(parsedData.isActive);
        
        // 检查是否是退款情况，但不在初始化时显示，避免双重通知
        // 初始化时不显示通知，而是依赖于refreshSubscriptionStatus来显示
      } else {
        console.log('未找到本地存储的会员信息');
      }
    } catch (error) {
      console.error('初始化订阅服务失败:', error);
    }
  };

  // 更新刷新订阅状态的函数
  const refreshSubscriptionStatus = async () => {
    try {
      if (Platform.OS !== 'web') {
        const subscriptionService = SubscriptionService.getInstance();
        await subscriptionService.fetchAndUpdateSubscriptionStatus();
        
        // 从AsyncStorage获取最新状态
        const subscriptionData = await AsyncStorage.getItem('subscriptionData');
        if (subscriptionData) {
          const parsedData = JSON.parse(subscriptionData);
          
          setSubscriptionStatus({
            isActive: parsedData.isActive,
            isLifetime: parsedData.productId?.includes('lifetime') || false,
            expirationDate: parsedData.expirationDate ? new Date(parsedData.expirationDate) : undefined,
            productId: parsedData.productId || undefined,
          });
          setIsPremium(parsedData.isActive);
          
          // 如果是退款情况，并且在冷却时间外，显示通知
          if (parsedData.possibleRefund) {
            const now = Date.now();
            if (now - lastSubscriptionAlertTime > ALERT_COOLDOWN) {
              setLastSubscriptionAlertTime(now);
              Alert.alert(
                i18n.t('subscription.statusChanged'),
                i18n.t('subscription.expired'),
                [{ text: i18n.t('ok') }]
              );
            }
          }
        }
      }
    } catch (error) {
      console.error('刷新订阅状态失败:', error);
    }
  };

  return (
    <ResponsiveContainer>
      <View style={[styles.container, isDesktop && styles.desktopContainer]}>
        <View style={styles.splitView}>
          <View style={styles.mobileSidebar}>
            {renderMenuItem('premium', 'crown', i18n.t('premium'))}
            {renderMenuItem('settings', 'cog', i18n.t('learningSettings'))}
            {renderMenuItem('learningStats', 'chart-bar', i18n.t('menuStats'))}
            {renderMenuItem('gameStats', 'gamepad-variant', i18n.t('gameHighScores'))}
          </View>
          <View style={styles.mainContentWrapper}>
            {renderContent()}
          </View>
        </View>
      </View>
    </ResponsiveContainer>
  );
};