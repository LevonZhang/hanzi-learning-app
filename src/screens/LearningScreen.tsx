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

type StylesProps = {
  isTablet: boolean;
};

export const LearningScreen = ({ route, navigation }: LearningScreenProps) => {
  const { deviceType, theme, isTablet, isDesktop } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();

  const screenStyles = StyleSheet.create({
    container: {
      flex: 1,
    },
    wideContainer: {
      maxWidth: isTablet ? 1024 : 1200,
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
      paddingHorizontal: isTablet ? 24 : 32,
      gap: isTablet ? 24 : 32,
    },
    canvas: {
      width: '100%',
      aspectRatio: 1,
      marginBottom: Platform.OS === 'ios' ? 80 : 64,
    },
    wideCanvas: {
      width: isTablet ? '65%' : '60%',
      marginBottom: 0,
      marginTop: isTablet ? -60 : -80,
    },
    meaningContainer: {
      width: '100%',
      padding: isTablet ? 20 : 16,
      borderRadius: 8,
      backgroundColor: '#fff',
      marginTop: -60,
      height: isTablet ? '80%' : '40%',
      maxHeight: Platform.OS === 'ios' ? (isTablet ? '80%' : '40%') : (isTablet ? '80%' : '40%'),
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
      width: isTablet ? '32%' : '35%',
      alignSelf: 'stretch',
      marginTop: -60,
      height: '80%',
      maxHeight: '80%',
    },
    tabContainer: {
      flexDirection: 'row',
      marginBottom: 16,
    },
    tab: {
      flex: 1,
      paddingVertical: 8,
      alignItems: 'center',
      borderBottomWidth: 2,
    },
    tabText: {
      fontSize: isTablet ? 18 : 16,
      fontWeight: '500',
    },
    wideTabText: {
      fontSize: isTablet ? 20 : 18,
    },
    meaningScroll: {
      flex: 1,
    },
    meaningText: {
      fontSize: isTablet ? 24 : 16,
      lineHeight: isTablet ? 34 : 22,
      marginBottom: 8,
    },
    wideMeaningText: {
      fontSize: isTablet ? 28 : 20,
      lineHeight: isTablet ? 38 : 28,
    },
    wordsText: {
      fontSize: isTablet ? 20 : 14,
      lineHeight: isTablet ? 28 : 20,
      marginBottom: 8,
    },
    wideWordsText: {
      fontSize: isTablet ? 24 : 18,
      lineHeight: isTablet ? 32 : 24,
    },
    soundButton: {
      width: isTablet ? 60 : 50,
      paddingVertical: isTablet ? 16 : 12,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
      marginHorizontal: 8,
    },
    wideSoundButton: {
      width: isTablet ? 70 : 60,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingBottom: 16,
      marginBottom: Platform.OS === 'ios' && !isTablet ? 30 : 16,
      marginTop: Platform.OS === 'ios' && !isTablet ? 20 : 0,
    },
    wideButtonContainer: {
      paddingHorizontal: isTablet ? 24 : 32,
      ...(isTablet ? {
        position: 'relative',
        backgroundColor: 'transparent',
        borderTopWidth: 0,
        bottom: 'auto',
        marginTop: -320,
        marginBottom: 32,
        maxWidth: 200,
        alignSelf: 'center',
      } : {}),
    },
    button: {
      flex: 0,
      width: isTablet ? 200 : 150,
      marginHorizontal: 8,
      paddingVertical: isTablet ? 16 : 12,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: '#007AFF',
    },
    buttonText: {
      color: '#fff',
      fontSize: isTablet ? 24 : 16,
      fontWeight: '600',
    },
    completedContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: isTablet ? 32 : 24,
      flex: 1,
      backgroundColor: '#f9f9f9',
      borderRadius: 16,
      margin: isTablet ? 24 : 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    completedText: {
      fontSize: isTablet ? 28 : 22,
      fontWeight: '700',
      marginBottom: 24,
      textAlign: 'center',
      color: theme.colors.primary,
    },
    statsText: {
      fontSize: isTablet ? 18 : 16,
      lineHeight: isTablet ? 28 : 24,
      color: theme.colors.textSecondary,
      marginBottom: 24,
      textAlign: 'center',
    },
    statsContainer: {
      flexDirection: 'row',
      justifyContent: 'space-around',
      width: '100%',
      marginBottom: 32,
    },
    statItem: {
      alignItems: 'center',
      padding: 16,
      backgroundColor: '#fff',
      borderRadius: 12,
      minWidth: isTablet ? 120 : 90,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    statValue: {
      fontSize: isTablet ? 24 : 20,
      fontWeight: '700',
      color: theme.colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: isTablet ? 14 : 12,
      color: theme.colors.textSecondary,
    },
    learnMoreButton: {
      backgroundColor: theme.colors.primary,
      paddingVertical: isTablet ? 16 : 12,
      paddingHorizontal: isTablet ? 32 : 24,
      borderRadius: 12,
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    learnMoreText: {
      color: '#fff',
      fontSize: isTablet ? 18 : 16,
      fontWeight: '600',
      marginLeft: 8,
    },
  });

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
    const subscriptionService = SubscriptionService.getInstance();
    const reachedLimit = await subscriptionService.checkFreeCharacterLimit();
    
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
    
    // 这里的判断应该只看 newWords
    if (newWords.length === 0) {  // 修改这里，不需要考虑 reviewWords
      setState(prev => ({
        ...prev,
        newWords: [],
        reviewWords: [],
        currentWord: null,
        statistics
      }));
      return;
    }

    // 设置当前要学习的字
    const currentWord = newWords[0];  // 直接使用 newWords[0]，不需要考虑 reviewWords
    
    setState(prev => ({
      ...prev,
      newWords,
      reviewWords,
      currentWord,
      isReviewMode: false,  // 这里应该始终是 false，因为我们只关注学习
      statistics
    }));

    // 记录为已开始学习
    if (currentWord) {
      await handleCharacterLearned(currentWord.character);
    }
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

  // 加载更多汉字学习
  const loadMoreCharacters = async () => {
    try {
      const learningManager = LearningManager.getInstance();
      // 获取更多字符（默认5个）
      const moreCharacters = await learningManager.getMoreCharactersToLearn();
      
      if (moreCharacters.length === 0) {
        // 没有更多可学习的字符
        Alert.alert(
          i18n.t('success'),
          '恭喜！您已经学习了所有可用的汉字。',
          [{ text: i18n.t('confirm'), style: 'default' }]
        );
        return;
      }
      
      // 更新状态，添加新的学习字符
      setState(prev => ({
        ...prev,
        newWords: moreCharacters,
        currentWord: moreCharacters[0],
        isReviewMode: false
      }));
    } catch (error) {
      console.error('Error loading more characters:', error);
      Alert.alert(
        i18n.t('error'),
        '加载更多汉字失败，请稍后重试。',
        [{ text: i18n.t('confirm'), style: 'default' }]
      );
    }
  };

  return (
    <ResponsiveContainer useSafeArea withPadding>
      <View style={[screenStyles.container, (isDesktop || isTablet) && screenStyles.wideContainer]}>
        {state.currentWord ? (
          <>
            <View style={[
              screenStyles.displayContainer,
              (isDesktop || isTablet) && screenStyles.wideDisplayContainer
            ]}>
              <View style={[
                screenStyles.canvas,
                (isDesktop || isTablet) && screenStyles.wideCanvas
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
                screenStyles.meaningContainer,
                (isDesktop || isTablet) && screenStyles.wideMeaningContainer
              ]}>
                <View style={screenStyles.tabContainer}>
                  <TouchableOpacity
                    style={[
                      screenStyles.tab,
                      activeTab === 'zh' && { backgroundColor: theme.colors.primary }
                    ]}
                    onPress={() => setActiveTab('zh')}
                  >
                    <Text style={[
                      screenStyles.tabText,
                      activeTab === 'zh' && { color: theme.colors.textLight },
                      (isDesktop || isTablet) && screenStyles.wideTabText
                    ]}>
                      {i18n.t('chinese')}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      screenStyles.tab,
                      activeTab === 'en' && { backgroundColor: theme.colors.primary }
                    ]}
                    onPress={() => setActiveTab('en')}
                  >
                    <Text style={[
                      screenStyles.tabText,
                      activeTab === 'en' && { color: theme.colors.textLight },
                      (isDesktop || isTablet) && screenStyles.wideTabText
                    ]}>
                      {i18n.t('english')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={screenStyles.meaningScroll}>
                  {activeTab === 'zh' ? (
                    <>
                      <Text style={[
                        screenStyles.meaningText,
                        (isDesktop || isTablet) && screenStyles.wideMeaningText
                      ]}>
                        {state.currentWord.meanings.zh.join('\n')}
                      </Text>
                      {state.currentWord.words && state.currentWord.words.length > 0 && (
                        <Text style={[
                          screenStyles.wordsText,
                          (isDesktop || isTablet) && screenStyles.wideWordsText
                        ]}>
                          {i18n.t('commonWords')}：{state.currentWord.words.join('、')}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[
                      screenStyles.meaningText,
                      (isDesktop || isTablet) && screenStyles.wideMeaningText
                    ]}>
                      {state.currentWord.meanings.en.join('\n')}
                    </Text>
                  )}
                </ScrollView>
              </View>
            </View>

            <View style={[
              screenStyles.buttonContainer,
              (isDesktop || isTablet) && screenStyles.wideButtonContainer
            ]}>
              <TouchableOpacity
                style={[screenStyles.soundButton, (isDesktop || isTablet) && screenStyles.wideSoundButton]}
                onPress={() => state.currentWord && playSound(state.currentWord.character)}
              >
                <MaterialCommunityIcons
                  name="volume-high"
                  size={(isDesktop || isTablet) ? 24 : 20}
                  color={theme.colors.textLight}
                />
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[screenStyles.button, { backgroundColor: theme.colors.success }]}
                onPress={() => handleComplete(true)}
              >
                <Text style={[screenStyles.buttonText, { color: theme.colors.textLight }]}>
                  {i18n.t('next')}
                </Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <View style={screenStyles.completedContainer}>
            <Text style={screenStyles.completedText}>
              {i18n.t('learningCompleted')}
            </Text>
            
            <View style={screenStyles.statsContainer}>
              <View style={screenStyles.statItem}>
                <Text style={screenStyles.statValue}>{state.statistics.totalLearned}</Text>
                <Text style={screenStyles.statLabel}>{i18n.t('totalLearned')}</Text>
              </View>
              
              <View style={screenStyles.statItem}>
                <Text style={screenStyles.statValue}>{state.statistics.mastered}</Text>
                <Text style={screenStyles.statLabel}>{i18n.t('mastered')}</Text>
              </View>
              
              <View style={screenStyles.statItem}>
                <Text style={screenStyles.statValue}>{state.statistics.needReview}</Text>
                <Text style={screenStyles.statLabel}>{i18n.t('needReview')}</Text>
              </View>
            </View>
            
            <TouchableOpacity 
              style={screenStyles.learnMoreButton}
              onPress={loadMoreCharacters}
            >
              <MaterialCommunityIcons 
                name="book-open-variant" 
                size={isTablet ? 24 : 20} 
                color="#fff" 
              />
              <Text style={screenStyles.learnMoreText}>
                {i18n.t('learnMore')}
              </Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </ResponsiveContainer>
  );
}; 