import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, SafeAreaView, Alert, FlatList, Platform, Dimensions, useWindowDimensions } from 'react-native';
import { CharacterLearning } from '../components/CharacterLearning';
import { LearningManager } from '../services/LearningManager';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import cnchar from 'cnchar';
import 'cnchar-voice';  // 导入语音模块
import 'cnchar-words';  // 导入词组模块
import * as Speech from 'expo-speech';
import { useState as useTabState } from 'react'; // 为tab状态添加一个新的useState
import { hanziDict } from '../data/hanziDict';  // 导入汉字字典数据
import { i18n } from '../i18n/i18n';
import HanziService from '../services/HanziService';
import StatisticsService from '../services/StatisticsService';
import SubscriptionService from '../services/SubscriptionService';
import { ResponsiveContainer } from '../components/ResponsiveContainer';
import { useResponsive } from '../hooks/useResponsive';

interface Character {
  character: string;
  pinyin: string[];
  meanings: {
    zh: string[];
    en: string[];
  };
  words?: string[];
  strokes?: number;
}

interface LearningState {
  newWords: Character[];
  reviewWords: Character[];
  currentWord: Character | null;
  isReviewMode: boolean;
  statistics: {
    totalLearned: number;
    mastered: number;
    needReview: number;
  };
}

interface HanziInfo {
  definition: string;
  pinyin: string[];
  words: string[];
  english: string;
  radical?: string;
  strokes: number;
  traditional?: string;
  japanese?: string;
}

interface LearningScreenProps {
  route?: {
    params?: {
      mode?: 'learning' | 'review' | 'display';
      reviewWords?: string[];
      character?: string;
    };
  };
  navigation: any;
}

export const LearningScreen = ({ route, navigation }: LearningScreenProps) => {
  const { theme, isDesktop, isTablet } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();

  const [state, setState] = useState<LearningState>({
    newWords: [],
    reviewWords: [],
    currentWord: {
      character: '',
      pinyin: [],
      meanings: {
        zh: [],
        en: []
      }
    },
    isReviewMode: route?.params?.mode === 'review',
    statistics: {
      totalLearned: 0,
      mastered: 0,
      needReview: 0
    }
  });

  const [activeTab, setActiveTab] = useTabState('zh'); // 默认显示中文释义
  const [showFullMeaning, setShowFullMeaning] = useState(false);

  useEffect(() => {
    if (route?.params?.mode === 'display' && route?.params?.character) {
      // 显示模式：直接显示指定的汉字，不需要加载学习列表
      loadSingleCharacter(route.params.character);
    } else if (route?.params?.mode === 'review' && route?.params?.reviewWords) {
      // 复习模式：加载复习字列表
      loadReviewWords(route.params.reviewWords);
    } else {
      // 学习模式：加载今天的学习列表
      loadTodayLearning();
    }
    loadTodayProgress();
    StatisticsService.startLearningSession();

    return () => {
      StatisticsService.endLearningSession();
    };
  }, [route?.params]);

  const loadTodayLearning = async () => {
    const reachedLimit = await SubscriptionService.checkFreeCharacterLimit();
    
    if (reachedLimit) {
      Alert.alert(
        i18n.t('characterLimitReached'),
        i18n.t('characterLimitDesc'),
        [
          { text: i18n.t('cancel'), style: 'cancel' },
          { 
            text: i18n.t('getPremium'),
            onPress: () => navigation.navigate('Settings', { screen: 'premium' })
          }
        ]
      );
      setState(prev => ({
        ...prev,
        currentWord: null,
      }));
      return;
    }

    const learningManager = LearningManager.getInstance();
    const { newWords, reviewWords } = await learningManager.getTodayLearningList();
    const statistics = await learningManager.getStatistics();

    setState(prev => ({
      ...prev,
      newWords,
      reviewWords,
      currentWord: newWords[0] || reviewWords[0],
      statistics
    }));
  };

  const loadReviewWords = async (reviewWords: string[]) => {
    const learningManager = LearningManager.getInstance();
    const hanziService = HanziService.getInstance();
    const allCharacters = await hanziService.getHanziListWithDetails();
    
    // 获取复习字的完整信息
    const reviewList = reviewWords
      .map(char => allCharacters.find(c => c.character === char))
      .filter(Boolean) as Character[];

    const statistics = await learningManager.getStatistics();

    setState(prev => ({
      ...prev,
      reviewWords: reviewList,
      currentWord: reviewList[0],
      isReviewMode: true,
      statistics
    }));
  };

  const handleComplete = async (isCorrect: boolean) => {
    if (!state.currentWord) return;

    console.log('[handleComplete] Start - Current character:', state.currentWord.character, 'isCorrect:', isCorrect);

    const learningManager = LearningManager.getInstance();
    await learningManager.recordProgress(state.currentWord.character, isCorrect);
    console.log('[handleComplete] Recorded progress for character:', state.currentWord.character);

    // 如果练习正确，记录为已掌握
    if (isCorrect) {
      console.log('[handleComplete] Character written correctly, marking as mastered');
      await handleCharacterMastered(state.currentWord.character);
    }

    // 更新当前字列表
    const currentList = state.isReviewMode ? state.reviewWords : state.newWords;
    const currentIndex = currentList.findIndex(w => w.character === state.currentWord!.character);
    const nextIndex = currentIndex + 1;
    console.log('[handleComplete] Current index:', currentIndex, 'Next index:', nextIndex, 'List length:', currentList.length);

    if (nextIndex < currentList.length) {
      // 记录下一个字为已学习
      if (!state.isReviewMode) {
        console.log('[handleComplete] Not in review mode, marking next character as learned:', currentList[nextIndex].character);
        await handleCharacterLearned(currentList[nextIndex].character);
      }
      setState(prev => ({
        ...prev,
        currentWord: currentList[nextIndex]
      }));
      console.log('[handleComplete] Updated current word to:', currentList[nextIndex].character);
    } else {
      console.log('[handleComplete] Reached end of list, updating statistics');
      const statistics = await learningManager.getStatistics();
      setState(prev => ({
        ...prev,
        currentWord: null,
        statistics
      }));
    }
  };

  const playSound = async (character: string) => {
    try {
      await Speech.speak(character, { language: 'zh' });
    } catch (error) {
      console.error('播放失败:', error);
    }
  };

  const handleHanziInfo = async (info: HanziInfo) => {
    if (state.currentWord) {
      const hanziService = HanziService.getInstance();
      const hanziDetails = await hanziService.getHanziDetails(state.currentWord.character);
      const words = cnchar.words(state.currentWord.character).slice(0, 4);
      
      setState(prev => ({
        ...prev,
        currentWord: {
          ...prev.currentWord!,
          meanings: {
            zh: hanziDetails.meanings.zh || ['暂无中文释义'],
            en: hanziDetails.meanings.en || [info.english || '暂无翻译']
          },
          words: words
        }
      }));
    }
  };

  const handleCharacterLearned = async (character: string) => {
    try {
      console.log('[handleCharacterLearned] Start - Character:', character);
      // 记录学习的汉字（仅设置为已学习状态，不标记为已掌握）
      const learningManager = LearningManager.getInstance();
      await learningManager.recordProgress(character, false);  // 设置 isCorrect 为 false，确保不会被标记为已掌握
      await StatisticsService.recordLearnedCharacter(character, false);
      console.log('[handleCharacterLearned] Successfully recorded character as learned');
    } catch (error) {
      console.error('[handleCharacterLearned] Failed to record learned character:', error);
    }
  };

  const handleCharacterMastered = async (character: string) => {
    try {
      console.log('[handleCharacterMastered] Start - Character:', character);
      // 记录掌握的汉字（设置为已掌握状态）
      const learningManager = LearningManager.getInstance();
      await learningManager.recordProgress(character, true);
      await StatisticsService.recordLearnedCharacter(character, true);
      console.log('[handleCharacterMastered] Successfully recorded character as mastered');
    } catch (error) {
      console.error('[handleCharacterMastered] Failed to record mastered character:', error);
    }
  };

  const loadTodayProgress = async () => {
    // Implementation of loadTodayProgress
  };

  const loadSingleCharacter = async (character: string) => {
    try {
      const hanziService = HanziService.getInstance();
      const hanziDetails = await hanziService.getHanziDetails(character);
      const words = cnchar.words(character).slice(0, 4);

      setState(prev => ({
        ...prev,
        currentWord: {
          character: hanziDetails.character,
          pinyin: hanziDetails.pinyin,
          meanings: {
            zh: hanziDetails.meanings.zh,
            en: hanziDetails.meanings.en
          },
          words: words,
          strokes: hanziDetails.strokes
        },
        isReviewMode: false
      }));
    } catch (error) {
      console.error('加载汉字详情失败:', error);
      Alert.alert(i18n.t('error'), i18n.t('loadCharacterError'));
    }
  };

  return (
    <ResponsiveContainer useSafeArea withPadding>
      <View style={[styles.container, (isDesktop || isTablet) && styles.wideContainer]}>
        {state.currentWord ? (
          <>
            <View style={[
              styles.displayContainer,
              (isDesktop || isTablet) && styles.wideDisplayContainer
            ]}>
              <View style={[
                styles.canvas,
                (isDesktop || isTablet) && styles.wideCanvas
              ]}>
                <CharacterLearning
                  character={state.currentWord.character}
                  onComplete={handleComplete}
                  onHanziInfo={handleHanziInfo}
                  isReviewMode={state.isReviewMode}
                  isDesktop={isDesktop || isTablet}
                />
              </View>
              
              <View style={[
                styles.meaningContainer,
                (isDesktop || isTablet) && styles.wideMeaningContainer
              ]}>
                <View style={styles.tabContainer}>
                  <TouchableOpacity
                    style={[
                      styles.tab,
                      activeTab === 'zh' && { backgroundColor: theme.colors.primary }
                    ]}
                    onPress={() => setActiveTab('zh')}
                  >
                    <Text style={[
                      styles.tabText,
                      activeTab === 'zh' && { color: theme.colors.textLight },
                      (isDesktop || isTablet) && styles.wideTabText
                    ]}>
                      {i18n.t('chinese')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.tab,
                      activeTab === 'en' && { backgroundColor: theme.colors.primary }
                    ]}
                    onPress={() => setActiveTab('en')}
                  >
                    <Text style={[
                      styles.tabText,
                      activeTab === 'en' && { color: theme.colors.textLight },
                      (isDesktop || isTablet) && styles.wideTabText
                    ]}>
                      {i18n.t('english')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={styles.meaningScroll}>
                  {activeTab === 'zh' ? (
                    <>
                      <Text style={[
                        styles.meaningText,
                        (isDesktop || isTablet) && styles.wideMeaningText
                      ]}>
                        {state.currentWord.meanings.zh.join('\n')}
                      </Text>
                      {state.currentWord.words && state.currentWord.words.length > 0 && (
                        <Text style={[
                          styles.wordsText,
                          (isDesktop || isTablet) && styles.wideWordsText
                        ]}>
                          {i18n.t('commonWords')}：{state.currentWord.words.join('、')}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[
                      styles.meaningText,
                      (isDesktop || isTablet) && styles.wideMeaningText
                    ]}>
                      {state.currentWord.meanings.en.join('\n')}
                    </Text>
                  )}
                </ScrollView>

                <TouchableOpacity
                  style={[styles.soundButton, (isDesktop || isTablet) && styles.wideSoundButton]}
                  onPress={() => state.currentWord && playSound(state.currentWord.character)}
                >
                  <MaterialCommunityIcons
                    name="volume-high"
                    size={(isDesktop || isTablet) ? 28 : 24}
                    color={theme.colors.primary}
                  />
                </TouchableOpacity>
              </View>
            </View>

            <View style={[
              styles.buttonContainer,
              (isDesktop || isTablet) && styles.wideButtonContainer
            ]}>
              <TouchableOpacity
                style={[styles.button, { backgroundColor: theme.colors.success }]}
                onPress={() => handleComplete(true)}
              >
                <Text style={[styles.buttonText, { color: theme.colors.textLight }]}>
                  {i18n.t('next')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={styles.completedContainer}>
            <Text style={[styles.completedText, { color: theme.colors.textPrimary }]}>
              {i18n.t('learningCompleted')}
            </Text>
            <Text style={[styles.statsText, { color: theme.colors.textSecondary }]}>
              {`${i18n.t('totalLearned')}: ${state.statistics.totalLearned}\n`}
              {`${i18n.t('mastered')}: ${state.statistics.mastered}\n`}
              {`${i18n.t('needReview')}: ${state.statistics.needReview}`}
            </Text>
          </View>
        )}
      </View>
    </ResponsiveContainer>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  wideContainer: {
    maxWidth: 1200,
    alignSelf: 'center',
    width: '100%',
  },
  displayContainer: {
    flex: 1,
    alignItems: 'center',
  },
  wideDisplayContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'flex-start',
    paddingHorizontal: 32,
    gap: 32,
  },
  canvas: {
    width: '100%',
    aspectRatio: 1,
    marginBottom: Platform.OS === 'ios' ? 80 : 64,
  },
  wideCanvas: {
    width: '60%',
    marginBottom: 0,
    marginTop: -80,
  },
  meaningContainer: {
    width: '100%',
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#fff',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      },
      android: {
        elevation: 4,
      },
    }),
  },
  wideMeaningContainer: {
    width: '35%',
    alignSelf: 'stretch',
    marginTop: -40,
  },
  tabContainer: {
    flexDirection: 'row',
    marginBottom: 16,
  },
  tab: {
    flex: 1,
    paddingVertical: 8,
    marginHorizontal: 4,
    borderRadius: 4,
    alignItems: 'center',
  },
  tabText: {
    fontSize: 14,
    fontWeight: '500',
  },
  wideTabText: {
    fontSize: 16,
  },
  meaningScroll: {
    maxHeight: 200,
  },
  meaningText: {
    fontSize: 16,
    lineHeight: 24,
    marginBottom: 8,
  },
  wideMeaningText: {
    fontSize: 18,
    lineHeight: 28,
  },
  wordsText: {
    fontSize: 14,
    lineHeight: 20,
    color: '#666',
  },
  wideWordsText: {
    fontSize: 16,
    lineHeight: 24,
  },
  soundButton: {
    position: 'absolute',
    top: 16,
    right: 16,
    padding: 8,
  },
  wideSoundButton: {
    padding: 12,
  },
  buttonContainer: {
    padding: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 24,
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    zIndex: 10,
  },
  wideButtonContainer: {
    position: 'relative',
    backgroundColor: 'transparent',
    borderTopWidth: 0,
    bottom: 'auto',
    marginTop: -100,
    marginBottom: 32,
    maxWidth: 200,
    alignSelf: 'center',
  },
  button: {
    paddingVertical: 12,
    paddingHorizontal: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 16,
    fontWeight: '600',
  },
  completedContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  completedText: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 16,
    textAlign: 'center',
  },
  statsText: {
    fontSize: 16,
    textAlign: 'center',
  },
}); 