import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert, ActivityIndicator, FlatList } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../../../i18n/i18n';
import { useResponsive } from '../../../hooks/useResponsive';
import { LearningManager } from '../../../services/LearningManager';
import { logger } from '../../../utils/logger';
import { Theme } from '../../../theme';

interface LearningStats {
  totalCharacters: number;
  masteredCharacters: number;
  totalLearningTime: number;
  weeklyProgress: number[];
  monthlyProgress: number[];
}

interface LearnedCharacter {
  character: string;
  masteryLevel: number;
  lastReviewDate: string;
}

interface Props {
  navigation: any;
  subscriptionStatus?: {
    isActive: boolean;
  };
}

export const LearningStatsSection: React.FC<Props> = ({ navigation, subscriptionStatus = { isActive: false } }) => {
  const { theme, isDesktop } = useResponsive();
  const [learningStats, setLearningStats] = useState<LearningStats>({
    totalCharacters: 0,
    masteredCharacters: 0,
    totalLearningTime: 0,
    weeklyProgress: [],
    monthlyProgress: [],
  });
  const [learnedCharacters, setLearnedCharacters] = useState<LearnedCharacter[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const ITEMS_PER_PAGE = isDesktop ? 24 : 18;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    loadLearnedCharacters();
    loadStats();
  };

  const loadStats = async () => {
    try {
      const learningManager = LearningManager.getInstance();
      const stats = await learningManager.getStatistics();
      
      setLearningStats({
        totalCharacters: stats.totalLearned,
        masteredCharacters: stats.mastered,
        totalLearningTime: 0,
        weeklyProgress: [],
        monthlyProgress: [],
      });

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
    } catch (error) {
      logger.error('加载统计数据失败:', error);
    }
  };

  const loadLearnedCharacters = async () => {
    try {
      const learningManager = LearningManager.getInstance();
      const progress = await learningManager.getAllProgress();      
      const characters = Object.entries(progress)
        .filter(([char, data]) => char && char.trim() !== '')
        .map(([char, data]) => ({
          character: char,
          masteryLevel: data.masteryLevel,
          lastReviewDate: data.lastReviewDate,
        }));
      
      const sortedCharacters = characters.sort((a, b) => {
        if (b.masteryLevel === a.masteryLevel) {
          return new Date(b.lastReviewDate).getTime() - new Date(a.lastReviewDate).getTime();
        }
        return b.masteryLevel - a.masteryLevel;
      });
      
      setLearnedCharacters(sortedCharacters);
      setHasMore(sortedCharacters.length > ITEMS_PER_PAGE);
    } catch (error) {
      logger.error('加载已学习汉字失败:', error);
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

  const getMasteryLevelColor = (level: number): string => {
    switch (level) {
      case 2:
        return '#34C759'; // 已掌握 - 绿色
      case 1:
        return '#333333'; // 已学习 - 黑色
      default:
        return '#666666'; // 未学习 - 灰色
    }
  };

  const renderCharacterItem = ({ item }: { item: LearnedCharacter }) => {
    const masteryColor = getMasteryLevelColor(item.masteryLevel);    
    return (
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
                  onPress: () => navigation.navigate('Settings', { screen: 'premium' })
                }
              ]
            );
          }
        }}
      >
        <Text style={[
          styles.characterText, 
          { color: masteryColor }
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
  };

  const renderListFooter = () => {
    if (!hasMore && !isLoading) return null;
    
    return (
      <View style={styles.loadingFooter}>
        <ActivityIndicator size="small" color="#007AFF" />
      </View>
    );
  };

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
      
      <TouchableOpacity
        style={styles.resetButtonFullWidth}
        onPress={() => {
          Alert.alert(
            i18n.t('resetLearning'),
            i18n.t('resetLearningConfirmMessage'),
            [
              {
                text: i18n.t('cancel'),
                style: 'cancel'
              },
              {
                text: i18n.t('confirm'),
                style: 'destructive',
                onPress: async () => {
                  try {
                    const learningManager = LearningManager.getInstance();
                    await learningManager.resetAllProgress();
                    loadLearnedCharacters();
                    loadStats();
                    Alert.alert(i18n.t('success'), i18n.t('resetSuccess'));
                  } catch (error) {
                    logger.error('重置学习进度失败:', error);
                    Alert.alert(i18n.t('error'), i18n.t('resetError'));
                  }
                }
              }
            ]
          );
        }}
      >
        <MaterialCommunityIcons name="refresh" size={16} color="#FF3B30" />
        <Text style={styles.resetButtonText}>{i18n.t('resetLearning')}</Text>
      </TouchableOpacity>
      
      <View style={styles.sectionTitleContainer}>
        <Text style={styles.sectionTitle}>{i18n.t('learnedCharacters')}</Text>
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
        <Text style={styles.noDataText}>{i18n.t('noLearnedChars')}</Text>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  statsContainer: {
    flex: 1,
    width: '100%',
    padding: 20,
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
    fontSize: 24,
    fontWeight: '600',
    color: '#333',
    marginVertical: 8,
  },
  statsLabel: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  resetButtonFullWidth: {
    backgroundColor: '#F5F5F5',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    marginBottom: 15,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    width: '100%',
  },
  resetButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 15,
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
    fontSize: 28,
    fontWeight: 'bold',
  },
  lockIcon: {
    position: 'absolute',
    top: 0,
    right: 0,
    padding: 4,
  },
  loadingFooter: {
    padding: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  noDataText: {
    fontSize: 16,
    color: '#8E8E93',
    textAlign: 'center',
  },
}); 