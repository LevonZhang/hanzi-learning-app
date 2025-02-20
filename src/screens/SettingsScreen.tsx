import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../i18n/i18n';
import { LearningManager } from '../services/LearningManager';
import SubscriptionService from '../services/SubscriptionService';
import GameService from '../services/GameService';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { useResponsive } from '../hooks/useResponsive';

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

export const SettingsScreen = ({ navigation }: SettingsScreenProps) => {
  const { theme, isDesktop, isTablet } = useResponsive();
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
  const [gameProgress, setGameProgress] = useState<GameProgress | null>(null);
  const [pronunciationGameProgress, setPronunciationGameProgress] = useState<GameProgress | null>(null);
  const ITEMS_PER_PAGE = isDesktop ? 24 : 18;

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

  useEffect(() => {
    const loadData = async () => {
      try {
        const stats = await AsyncStorage.getItem('gameStats');
        const progress = await GameService.loadGameProgress('word');
        const pronunciationProgress = await GameService.loadGameProgress('pronunciation');
        setGameStats(stats ? JSON.parse(stats) : {
          wordGame: { highScore: 0, gamesPlayed: 0, isCompleted: false },
          pronunciationGame: { highScore: 0, gamesPlayed: 0, isCompleted: false }
        });
        setGameProgress(progress);
        setPronunciationGameProgress(pronunciationProgress);
      } catch (error) {
        // Silent error handling
      }
    };

    // 初始加载
    loadData();

    // 添加焦点监听器
    const unsubscribe = navigation.addListener('focus', () => {
      loadData(); // 当屏幕重新获得焦点时重新加载数据
    });

    // 清理订阅
    return () => {
      unsubscribe();
    };
  }, [navigation]);

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
    const nextPage = currentPage + 1;
    const nextEndIndex = (nextPage + 1) * ITEMS_PER_PAGE;
    setCurrentPage(nextPage);
    setHasMore(nextEndIndex < learnedCharacters.length);
  };

  const renderCharacterItem = ({ item }: { item: LearnedCharacter }) => (
    <TouchableOpacity 
      style={styles.characterItem}
      onPress={() => navigation.navigate('Learning', {
        mode: 'display',
        character: item.character,
        fromSettings: true
      })}
    >
      <Text style={[styles.characterText, { color: getMasteryLevelColor(item.masteryLevel) }]}>
        {item.character}
      </Text>
    </TouchableOpacity>
  );

  const renderFooter = () => {
    if (!hasMore) return null;
    return (
      <TouchableOpacity style={styles.loadMoreButton} onPress={handleLoadMore}>
        <Text style={styles.loadMoreText}>{i18n.t('showMore')}</Text>
      </TouchableOpacity>
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

  const formatRemainingDays = (expirationDate: Date): string => {
    const now = new Date();
    const diffTime = expirationDate.getTime() - now.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays > 0 ? diffDays.toString() : '0';
  };

  const getMasteryLevelColor = (level: number): string => {
    switch (level) {
      case 2:
        return '#34C759'; // 已掌握 - 绿色
      case 1:
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
        size={isDesktop ? 28 : 24}
        color={activeSection === section ? theme.colors.textLight : theme.colors.textPrimary}
      />
      <Text
        style={[
          styles.menuText,
          activeSection === section && { color: theme.colors.textLight },
          isDesktop && styles.desktopMenuText
        ]}
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
                <Text style={styles.gameTitle}>{i18n.t('wordGame')}</Text>
                <Text style={styles.statText}>
                  {i18n.t('highScore')}: {gameStats.wordGame.highScore}
                </Text>
                <Text style={styles.statText}>
                  {i18n.t('gamesPlayed')}: {gameStats.wordGame.gamesPlayed}
                </Text>
                {gameProgress && (
                  <Text style={styles.statText}>
                    {i18n.t('currentProgress')}: {i18n.t('level', { level: gameProgress.currentLevel })} - {gameProgress.score}{i18n.t('points')}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => handleResetGame('word')}
                >
                  <Text style={styles.resetButtonText}>{i18n.t('resetGame')}</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.gameStatItem}>
                <Text style={styles.gameTitle}>{i18n.t('pronunciationGame')}</Text>
                <Text style={styles.statText}>
                  {i18n.t('highScore')}: {gameStats.pronunciationGame.highScore}
                </Text>
                <Text style={styles.statText}>
                  {i18n.t('gamesPlayed')}: {gameStats.pronunciationGame.gamesPlayed}
                </Text>
                {pronunciationGameProgress && (
                  <Text style={styles.statText}>
                    {i18n.t('currentProgress')}: {i18n.t('level', { level: pronunciationGameProgress.currentLevel })} - {pronunciationGameProgress.score}{i18n.t('points')}
                  </Text>
                )}
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={() => handleResetGame('pronunciation')}
                >
                  <Text style={styles.resetButtonText}>{i18n.t('resetGame')}</Text>
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
                <Text style={styles.statsText}>
                  {learningStats.totalCharacters}
                </Text>
                <Text style={styles.statsLabel}>{i18n.t('learned')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={styles.statItem}>
                <MaterialCommunityIcons name="star" size={24} color="#007AFF" />
                <Text style={styles.statsText}>
                  {learningStats.masteredCharacters}
                </Text>
                <Text style={styles.statsLabel}>{i18n.t('mastered')}</Text>
              </View>
              <View style={styles.statDivider} />
              <View style={[styles.statItem, styles.timeStatItem]}>
                <MaterialCommunityIcons name="clock-outline" size={24} color="#007AFF" />
                <Text style={styles.statsText}>
                  {formatLearningTime(learningStats.totalLearningTime)}
                </Text>
                <Text style={styles.statsLabel}>{i18n.t('totalLearningTime')}</Text>
              </View>
            </View>
            <Text style={styles.sectionTitle}>{i18n.t('learnedCharacters')}</Text>
            <View style={styles.legendContainer}>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: '#34C759' }]} />
                <Text style={styles.legendText}>{i18n.t('masteryLevel2')}</Text>
              </View>
              <View style={styles.legendItem}>
                <View style={[styles.legendColor, { backgroundColor: '#333333' }]} />
                <Text style={styles.legendText}>{i18n.t('masteryLevel1')}</Text>
              </View>
            </View>
            {learnedCharacters.length > 0 ? (
              <FlatList
                data={getPaginatedCharacters()}
                renderItem={renderCharacterItem}
                keyExtractor={(item) => item.character}
                numColumns={3}
                contentContainerStyle={styles.characterGrid}
                ListFooterComponent={renderFooter}
                scrollEnabled={true}
                nestedScrollEnabled={true}
                style={styles.characterList}
              />
            ) : (
              <Text style={styles.noDataText}>{i18n.t('noLearnedChars')}</Text>
            )}
          </View>
        );
      default:
        return null;
    }
  };

  const handleResetGame = async (gameType: 'word' | 'pronunciation') => {
    Alert.alert(
      i18n.t('resetGameConfirm'),
      i18n.t('resetGameConfirmMessage'),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel'
        },
        {
          text: i18n.t('confirm'),
          onPress: async () => {
            try {
              await GameService.resetGame(gameType);
              
              // 重置游戏进度状态
              if (gameType === 'word') {
                setGameProgress({
                  currentLevel: 1,
                  completedWords: [],
                  score: 0,
                  isCompleted: false
                });
              } else {
                setPronunciationGameProgress({
                  currentLevel: 1,
                  completedWords: [],
                  score: 0,
                  isCompleted: false
                });
              }

              // 更新游戏统计数据
              setGameStats(prev => ({
                ...prev,
                [gameType === 'word' ? 'wordGame' : 'pronunciationGame']: {
                  highScore: prev[gameType === 'word' ? 'wordGame' : 'pronunciationGame'].highScore,
                  gamesPlayed: prev[gameType === 'word' ? 'wordGame' : 'pronunciationGame'].gamesPlayed,
                  isCompleted: false
                }
              }));
            } catch (error) {
              console.error('重置游戏失败:', error);
            }
          }
        }
      ]
    );
  };

  return (
    <ResponsiveContainer>
      <View style={[styles.container, isDesktop && styles.desktopContainer]}>
        {isDesktop || isTablet ? (
          // Desktop/Tablet Layout
          <View style={styles.splitView}>
            <View style={styles.sidebar}>
              {renderMenuItem('premium', 'crown', i18n.t('premium'))}
              {renderMenuItem('settings', 'cog', i18n.t('learningSettings'))}
              {renderMenuItem('learningStats', 'chart-bar', i18n.t('menuStats'))}
              {renderMenuItem('gameStats', 'gamepad-variant', i18n.t('gameHighScores'))}
            </View>
            <View style={styles.mainContent}>
              {renderContent()}
            </View>
          </View>
        ) : (
          // Mobile Layout
          <>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.menuScroll}>
              {renderMenuItem('premium', 'crown', i18n.t('premium'))}
              {renderMenuItem('settings', 'cog', i18n.t('learningSettings'))}
              {renderMenuItem('learningStats', 'chart-bar', i18n.t('menuStats'))}
              {renderMenuItem('gameStats', 'gamepad-variant', i18n.t('gameHighScores'))}
            </ScrollView>
            <ScrollView style={styles.contentScroll}>
              {renderContent()}
            </ScrollView>
          </>
        )}
      </View>
    </ResponsiveContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  desktopContainer: {
    paddingHorizontal: 0,
  },
  splitView: {
    flex: 1,
    flexDirection: 'row',
  },
  sidebar: {
    width: 240,
    backgroundColor: '#f8f9fa',
    borderRightWidth: 1,
    borderRightColor: '#e0e0e0',
    padding: 16,
  },
  mainContent: {
    flex: 1,
    padding: 24,
  },
  menuScroll: {
    flexGrow: 0,
    height: 60,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    backgroundColor: '#f8f9fa',
  },
  contentScroll: {
    flex: 1,
    padding: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    marginBottom: 8,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  desktopMenuItem: {
    padding: 16,
    marginBottom: 12,
  },
  menuText: {
    marginLeft: 12,
    fontSize: 16,
    color: '#333',
    fontWeight: '500',
  },
  desktopMenuText: {
    fontSize: 18,
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
    flex: 1,
    paddingBottom: 80, // Add padding at the bottom to avoid navigation bar overlap
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
  },
  noDataText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
  characterGrid: {
    paddingHorizontal: 10,
    paddingTop: 10,
    paddingBottom: 20,
  },
  characterItem: {
    flex: 1,
    alignItems: 'center',
    padding: 10,
    marginBottom: 10,
  },
  characterText: {
    fontSize: 28,
    fontWeight: 'bold',
  },
  masteryText: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
  loadMoreButton: {
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 20,
  },
  loadMoreText: {
    color: '#666',
    fontSize: 14,
  },
  gameStatsContainer: {
    marginTop: 10,
  },
  gameStatItem: {
    backgroundColor: 'white',
    padding: 15,
    borderRadius: 10,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  gameTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    color: '#333',
  },
  statText: {
    fontSize: 16,
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
    fontSize: 16,
    fontWeight: 'bold',
  },
  statsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#f8f9fa',
    padding: 20,
    borderRadius: 12,
    marginBottom: 20,
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
  statsText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#333',
    marginTop: 8,
    textAlign: 'center',
  },
  statsLabel: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textAlign: 'center',
  },
  statDivider: {
    width: 1,
    height: '70%',
    backgroundColor: '#E0E0E0',
  },
  legendContainer: {
    flexDirection: 'row',
    gap: 20,
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  legendColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  legendText: {
    fontSize: 12,
    color: '#666',
  },
  characterList: {
    flex: 1,
    height: '100%',
  },
});