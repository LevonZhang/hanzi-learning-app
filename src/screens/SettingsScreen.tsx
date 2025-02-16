import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, SafeAreaView, Switch, Alert, ScrollView, Dimensions, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../i18n/i18n';
import SubscriptionService from '../services/SubscriptionService';
import { LearningManager } from '../services/LearningManager';
import HanziService from '../services/HanziService';

interface SettingsScreenProps {
  navigation: any;
}

type MenuSection = 'premium' | 'settings' | 'learningStats' | 'gameStats';

interface SubscriptionPlan {
  id: string;
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

interface GameStats {
  wordGame: {
    highScore: number;
    gamesPlayed: number;
  };
  pronunciationGame: {
    highScore: number;
    gamesPlayed: number;
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const MENU_WIDTH = 100;
const CONTENT_WIDTH = SCREEN_WIDTH - MENU_WIDTH;

export const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
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
    wordGame: { highScore: 0, gamesPlayed: 0 },
    pronunciationGame: { highScore: 0, gamesPlayed: 0 },
  });
  const [learnedCharacters, setLearnedCharacters] = useState<LearnedCharacter[]>([]);

  useEffect(() => {
    loadSettings();
    loadStats();
    loadLearnedCharacters();
    initializeSubscription();
    
    // 检查语言和翻译
    console.log('Current language:', i18n.language);
    console.log('Monthly plan translation:', {
      name: i18n.t('monthlyName'),
      duration: i18n.t('monthlyDuration'),
      plan: i18n.t('monthlyPlan')
    });
  }, []);

  useEffect(() => {
    updateSubscriptionPlans();
  }, [currentLanguage]);

  useEffect(() => {
    return () => {
      // 清理订阅监听器
      SubscriptionService.cleanup();
    };
  }, []);

  const updateSubscriptionPlans = () => {
    const plans: SubscriptionPlan[] = [
      {
        id: 'monthly',
        title: i18n.t('monthlyPlan'),
        price: 4.99,
        period: i18n.t('perMonth'),
        description: i18n.t('monthlyDesc'),
        icon: 'star' as const,
        name: i18n.t('monthlyName'),
        duration: i18n.t('monthlyDuration'),
      },
      {
        id: 'quarterly',
        title: i18n.t('quarterlyPlan'),
        price: 12.99,
        period: i18n.t('perQuarter'),
        description: i18n.t('quarterlyDesc'),
        icon: 'star-shooting' as const,
        name: i18n.t('quarterlyName'),
        duration: i18n.t('quarterlyDuration'),
      },
      {
        id: 'yearly',
        title: i18n.t('yearlyPlan'),
        price: 39.99,
        period: i18n.t('perYear'),
        description: i18n.t('yearlyDesc'),
        icon: 'star-circle' as const,
        name: i18n.t('yearlyName'),
        duration: i18n.t('yearlyDuration'),
      },
      {
        id: 'lifetime',
        title: i18n.t('lifetimePlan'),
        price: 99.99,
        period: i18n.t('oneTime'),
        description: i18n.t('lifetimeDesc'),
        icon: 'crown' as const,
        name: i18n.t('lifetimeName'),
        duration: i18n.t('lifetimeDuration'),
      },
    ];
    setSubscriptionPlansState(plans);
  };

  const initializeSubscription = async () => {
    try {
      await SubscriptionService.initialize();
      // 获取订阅状态
      const subscriptionData = await AsyncStorage.getItem('subscriptionData');
      if (subscriptionData) {
        const parsedData = JSON.parse(subscriptionData);
        setSubscriptionStatus({
          isActive: parsedData.isActive,
          isLifetime: parsedData.productId?.includes('lifetime') || false,
          expirationDate: parsedData.expirationDate ? new Date(parsedData.expirationDate) : undefined,
          productId: parsedData.productId,
        });
        setIsPremium(parsedData.isActive);
      }
    } catch (error) {
      console.error('初始化订阅服务失败:', error);
    }
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
      console.error('加载设置失败:', error);
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

      // 加载游戏统计
      const gameStatsStr = await AsyncStorage.getItem('gameStats');
      if (gameStatsStr) {
        setGameStats(JSON.parse(gameStatsStr));
      }
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
      setLearnedCharacters(characters.sort((a, b) => b.masteryLevel - a.masteryLevel));
    } catch (error) {
      console.error('加载已学习汉字失败:', error);
    }
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
      Alert.alert(
        i18n.t('subscriptionConfirm'),
        i18n.t('subscriptionConfirmDesc', { price: plan.price, period: plan.period }),
        [
          {
            text: i18n.t('cancelButton'),
            style: 'cancel',
          },
          {
            text: i18n.t('subscribeButton'),
            onPress: async () => {
              try {
                await SubscriptionService.purchaseSubscription(plan.id);
                // 注意：实际的订阅状态更新会通过 SubscriptionService 的监听器处理
              } catch (error) {
                console.error('订阅失败:', error);
                Alert.alert(i18n.t('errorTitle'), i18n.t('purchaseError'));
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
    const hours = Math.floor(minutes / 60);
    const remainingMinutes = minutes % 60;
    return hours > 0 
      ? `${hours}${i18n.t('hours')} ${remainingMinutes}${i18n.t('minutes')}`
      : `${remainingMinutes}${i18n.t('minutes')}`;
  };

  const formatRemainingDays = (expirationDate: Date): string => {
    const now = new Date();
    const diffTime = expirationDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays.toString() : '0';
  };

  const getMasteryLevelColor = (level: number): string => {
    switch (level) {
      case 5: return '#34C759'; // 完全掌握
      case 4: return '#5856D6'; // 熟练
      case 3: return '#007AFF'; // 一般
      case 2: return '#FF9500'; // 需要练习
      case 1: return '#FF3B30'; // 刚学习
      default: return '#8E8E93'; // 未知状态
    }
  };

  const renderCharacterItem = ({ item }: { item: LearnedCharacter }) => (
    <TouchableOpacity
      style={[styles.characterItem, { borderColor: getMasteryLevelColor(item.masteryLevel) }]}
      onPress={() => navigation.navigate('Learning', { mode: 'display', character: item.character })}
    >
      <Text style={styles.characterText}>{item.character}</Text>
      <View style={[styles.masteryIndicator, { backgroundColor: getMasteryLevelColor(item.masteryLevel) }]} />
    </TouchableOpacity>
  );

  const renderMenuItem = (section: MenuSection, icon: keyof typeof MaterialCommunityIcons.glyphMap, title: string) => (
    <TouchableOpacity
      style={[styles.menuItem, activeSection === section && styles.activeMenuItem]}
      onPress={() => setActiveSection(section)}
    >
      <MaterialCommunityIcons 
        name={icon} 
        size={24} 
        color={activeSection === section ? '#007AFF' : '#666'} 
      />
      <Text style={[styles.menuItemText, activeSection === section && styles.activeMenuItemText]}>
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
                <Text style={styles.premiumStatusText}>
                  {subscriptionStatus.isLifetime 
                    ? i18n.t('lifetimeName')
                    : subscriptionStatus.isActive 
                      ? i18n.t('premiumActiveStatus')
                      : i18n.t('getPremium')
                  }
                </Text>
              </View>
              {subscriptionStatus.isActive && !subscriptionStatus.isLifetime && subscriptionStatus.expirationDate && (
                <Text style={styles.expirationText}>
                  {i18n.t('daysRemaining', { days: formatRemainingDays(subscriptionStatus.expirationDate) })}
                </Text>
              )}
            </View>
            
            {!subscriptionStatus.isLifetime && (
              <View style={styles.subscriptionPlans}>
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
                          <Text style={styles.planName}>{plan.name}</Text>
                          <Text style={styles.planDuration}>{plan.duration}</Text>
                        </View>
                      </View>
                      <View style={styles.planPriceContainer}>
                        <Text style={styles.planPriceAmount}>${plan.price}</Text>
                        <Text style={styles.planPricePeriod}>{plan.period}</Text>
                      </View>
                    </View>
                    <Text style={styles.planDescription}>{plan.description}</Text>
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
              <Text style={styles.settingGroupTitle}>{i18n.t('learningSettings')}</Text>
              <View style={styles.settingItem}>
                <Text style={styles.settingLabel}>{i18n.t('dailyWords')}</Text>
                <View style={styles.numberSelector}>
                  <TouchableOpacity 
                    onPress={() => dailyWords > 1 && saveDailyWords(dailyWords - 1)}
                    style={styles.numberButton}
                  >
                    <Text style={styles.numberButtonText}>-</Text>
                  </TouchableOpacity>
                  <Text style={styles.numberValue}>{dailyWords}</Text>
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
              <Text style={styles.settingGroupTitle}>{i18n.t('language')}</Text>
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
                <MaterialCommunityIcons name="puzzle" size={24} color="#007AFF" />
                <Text style={styles.gameTitle}>{i18n.t('wordGame')}</Text>
                <Text style={styles.gameScore}>
                  {i18n.t('highScore')}: {gameStats.wordGame.highScore}
                </Text>
                <Text style={styles.gamesPlayed}>
                  {i18n.t('gamesPlayed')}: {gameStats.wordGame.gamesPlayed}
                </Text>
              </View>
              <View style={styles.gameStatItem}>
                <MaterialCommunityIcons name="music-note" size={24} color="#007AFF" />
                <Text style={styles.gameTitle}>{i18n.t('pronunciationGame')}</Text>
                <Text style={styles.gameScore}>
                  {i18n.t('highScore')}: {gameStats.pronunciationGame.highScore}
                </Text>
                <Text style={styles.gamesPlayed}>
                  {i18n.t('gamesPlayed')}: {gameStats.pronunciationGame.gamesPlayed}
                </Text>
              </View>
            </View>
          </View>
        );
      case 'learningStats':
        return (
          <View style={styles.sectionContent}>
            <View style={styles.statsContainer}>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{learningStats.totalCharacters}</Text>
                <Text style={styles.statLabel}>{i18n.t('totalLearned')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>{learningStats.masteredCharacters}</Text>
                <Text style={styles.statLabel}>{i18n.t('mastered')}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statValue}>
                  {formatLearningTime(learningStats.totalLearningTime)}
                </Text>
                <Text style={styles.statLabel}>{i18n.t('totalLearningTime')}</Text>
              </View>
            </View>

            <View style={styles.learnedCharsContainer}>
              <FlatList
                data={learnedCharacters}
                renderItem={renderCharacterItem}
                keyExtractor={item => item.character}
                numColumns={3}
                contentContainerStyle={styles.characterGrid}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={() => (
                  <View style={styles.emptyState}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={64} color="#8E8E93" />
                    <Text style={styles.emptyStateText}>{i18n.t('noLearnedChars')}</Text>
                  </View>
                )}
              />
            </View>
          </View>
        );
      default:
        return null;
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.menuContainer}>
          {renderMenuItem('premium', 'crown', i18n.t('premium'))}
          {renderMenuItem('settings', 'cog', i18n.t('settings'))}
          {renderMenuItem('gameStats', 'gamepad-variant', i18n.t('gameHighScores'))}
          {renderMenuItem('learningStats', 'chart-bar', i18n.t('learningProgress'))}
        </View>
        <View style={styles.mainContentWrapper}>
          <ScrollView style={styles.mainContent}>
            {renderContent()}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
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
  menuContainer: {
    width: MENU_WIDTH,
    backgroundColor: '#f8f8f8',
    paddingTop: 20,
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
  },
  menuItem: {
    padding: 15,
    alignItems: 'center',
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
  },
  activeMenuItem: {
    backgroundColor: '#fff',
    borderLeftColor: '#007AFF',
  },
  menuItemText: {
    fontSize: 12,
    color: '#666',
    marginTop: 5,
    textAlign: 'center',
  },
  activeMenuItemText: {
    color: '#007AFF',
  },
  mainContentWrapper: {
    width: CONTENT_WIDTH,
  },
  mainContent: {
    flex: 1,
    padding: 20,
  },
  sectionContent: {
    flex: 1,
  },
  settingGroup: {
    marginBottom: 25,
  },
  settingGroupTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 10,
  },
  settingLabel: {
    fontSize: 16,
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
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    minWidth: 30,
    textAlign: 'center',
  },
  languageButtons: {
    flexDirection: 'column',
    gap: 10,
  },
  languageButton: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    width: '100%',
    alignItems: 'center',
  },
  activeLanguage: {
    backgroundColor: '#007AFF',
  },
  languageButtonText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
  },
  activeLanguageText: {
    color: '#fff',
  },
  subscriptionPlans: {
    gap: 15,
  },
  subscriptionPlan: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  planHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  planIconAndName: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  planIcon: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 20,
    backgroundColor: 'rgba(0, 122, 255, 0.1)',
  },
  planNameContainer: {
    marginLeft: 12,
    flex: 1,
  },
  planName: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  planDuration: {
    fontSize: 13,
    color: '#666',
    marginTop: 4,
  },
  planPriceContainer: {
    alignItems: 'flex-end',
  },
  planPriceAmount: {
    fontSize: 20,
    fontWeight: '700',
    color: '#007AFF',
  },
  planPricePeriod: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  planDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
    marginTop: 8,
  },
  premiumStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 12,
    gap: 10,
  },
  premiumStatusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  premiumStatusText: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
  },
  expirationText: {
    fontSize: 14,
    color: '#666',
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 15,
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    marginBottom: 20,
  },
  statItem: {
    alignItems: 'center',
  },
  statValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#007AFF',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  gameStatsContainer: {
    marginTop: 10,
    gap: 15,
  },
  gameStatItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    padding: 15,
    flexDirection: 'column',
    alignItems: 'flex-start',
  },
  gameTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginVertical: 8,
  },
  gameScore: {
    fontSize: 14,
    color: '#007AFF',
    marginBottom: 4,
  },
  gamesPlayed: {
    fontSize: 14,
    color: '#666',
  },
  learnedCharsContainer: {
    flex: 1,
  },
  characterGrid: {
    paddingVertical: 10,
  },
  characterItem: {
    width: '30%',
    aspectRatio: 1,
    margin: '1.5%',
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
    borderWidth: 2,
  },
  characterText: {
    fontSize: 24,
    color: '#333',
  },
  masteryIndicator: {
    position: 'absolute',
    bottom: 4,
    width: 20,
    height: 3,
    borderRadius: 1.5,
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
  },
  emptyStateText: {
    marginTop: 10,
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
}); 