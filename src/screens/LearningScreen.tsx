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
  isIPad: boolean;
};

export const LearningScreen = ({ route, navigation }: LearningScreenProps) => {
  const { deviceType, theme, isDesktop, isIPad } = useResponsive();
  const { width: windowWidth } = useWindowDimensions();

  const screenStyles = StyleSheet.create({
    container: {
      flex: 1,
    },
    wideContainer: {
      maxWidth: isIPad ? 1024 : 1200,
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
      paddingHorizontal: isIPad ? 20 : 32,
      gap: isIPad ? 20 : 32,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: isDesktop ? 24 : isIPad ? 20 : 15,
      paddingVertical: isDesktop ? 20 : isIPad ? 16 : 12,
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
    },
    desktopHeader: {
      paddingHorizontal: isDesktop ? 32 : isIPad ? 28 : 24,
      paddingVertical: isDesktop ? 24 : isIPad ? 20 : 16,
    },
    headerButton: {
      padding: isDesktop ? 12 : isIPad ? 10 : 8,
      borderRadius: 8,
    },
    progressSection: {
      paddingHorizontal: isDesktop ? 24 : isIPad ? 20 : 15,
      paddingVertical: isDesktop ? 16 : isIPad ? 12 : 10,
      backgroundColor: '#fff',
      borderBottomWidth: 1,
      borderBottomColor: '#eee',
    },
    canvas: {
      width: '100%',
      aspectRatio: 1,
      marginBottom: isDesktop ? 90 : isIPad ? 80 : Platform.OS === 'ios' ? 40 : 60,
    },
    wideCanvas: {
      width: isDesktop ? '65%' : isIPad ? '60%' : '55%',
      marginBottom: 0,
      marginTop: isDesktop ? -90 : isIPad ? -70 : -60,
    },
    meaningContainer: {
      width: '100%',
      padding: isDesktop ? 24 : isIPad ? 20 : 8,
      borderRadius: 8,
      backgroundColor: '#fff',
      marginTop: isDesktop ? -70 : isIPad ? -60 : -90,
      height: isDesktop ? '90%' : isIPad ? '85%' : '45%',
      maxHeight: Platform.OS === 'ios' ? 
        (isDesktop ? '90%' : isIPad ? '85%' : '45%') : 
        (isDesktop ? '90%' : isIPad ? '85%' : '45%'),
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
      width: isDesktop ? '35%' : isIPad ? '40%' : '45%',
      alignSelf: 'stretch',
      marginTop: isDesktop ? -70 : isIPad ? -60 : -50,
      height: '90%',
      maxHeight: '90%',
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
      fontSize: isDesktop ? 18 : isIPad ? 17 : 14,
      fontWeight: '500',
    },
    wideTabText: {
      fontSize: isIPad ? 19 : 20,
    },
    meaningScroll: {
      flex: 1,
    },
    meaningText: {
      fontSize: isDesktop ? 28 : isIPad ? 24 : 15,
      lineHeight: isDesktop ? 38 : isIPad ? 32 : 20,
      marginBottom: 6,
    },
    wideMeaningText: {
      fontSize: isDesktop ? 32 : isIPad ? 28 : 24,
      lineHeight: isDesktop ? 42 : isIPad ? 36 : 32,
    },
    wordsText: {
      fontSize: isDesktop ? 24 : isIPad ? 20 : 13,
      lineHeight: isDesktop ? 32 : isIPad ? 28 : 18,
      marginBottom: 6,
    },
    wideWordsText: {
      fontSize: isDesktop ? 28 : isIPad ? 24 : 20,
      lineHeight: isDesktop ? 36 : isIPad ? 32 : 28,
    },
    soundButton: {
      width: isIPad ? 55 : 60,
      paddingVertical: isIPad ? 14 : 16,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
      marginHorizontal: 8,
    },
    wideSoundButton: {
      width: isIPad ? 65 : 70,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingBottom: 16,
      marginBottom: Platform.OS === 'ios' && !isIPad ? 30 : 16,
      marginTop: Platform.OS === 'ios' && !isIPad ? 20 : 0,
    },
    wideButtonContainer: {
      paddingHorizontal: isIPad ? 24 : 32,
      ...(isIPad ? {
        position: 'absolute',
        backgroundColor: 'transparent',
        borderTopWidth: 0,
        top: '80%',
        alignSelf: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth: 200,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
      } : {}),
    },
    button: {
      flex: 0,
      width: isIPad ? 180 : 200,
      paddingVertical: isIPad ? 14 : 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.success,
    },
    wideButton: {
      width: isIPad ? 180 : 200,
    },
    buttonText: {
      color: '#fff',
      fontSize: isDesktop ? 24 : isIPad ? 20 : 16,
      fontWeight: '600',
    },
    completedContainer: {
      alignItems: 'center',
      justifyContent: 'center',
      padding: isDesktop ? 40 : isIPad ? 32 : 24,
      flex: 1,
      backgroundColor: '#f9f9f9',
      borderRadius: 16,
      margin: isDesktop ? 32 : isIPad ? 24 : 16,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    completedText: {
      fontSize: isDesktop ? 32 : isIPad ? 28 : 24,
      fontWeight: '700',
      marginBottom: 24,
      textAlign: 'center',
      color: theme.colors.primary,
    },
    statsText: {
      fontSize: isDesktop ? 20 : isIPad ? 18 : 16,
      lineHeight: isDesktop ? 32 : isIPad ? 28 : 24,
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
      padding: isDesktop ? 20 : isIPad ? 16 : 12,
      backgroundColor: '#fff',
      borderRadius: 12,
      minWidth: isDesktop ? 140 : isIPad ? 120 : 100,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 2,
      elevation: 1,
    },
    statValue: {
      fontSize: isDesktop ? 28 : isIPad ? 24 : 20,
      fontWeight: '700',
      color: theme.colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: isDesktop ? 16 : isIPad ? 14 : 12,
      color: theme.colors.textSecondary,
    },
    learnMoreButton: {
      backgroundColor: theme.colors.primary,
      paddingVertical: isDesktop ? 20 : isIPad ? 16 : 14,
      paddingHorizontal: isDesktop ? 40 : isIPad ? 32 : 28,
      borderRadius: 12,
      marginTop: 16,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    learnMoreText: {
      color: '#fff',
      fontSize: isDesktop ? 20 : isIPad ? 18 : 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    pinyinText: {
      fontSize: isDesktop ? 24 : isIPad ? 20 : 14,
      lineHeight: isDesktop ? 32 : isIPad ? 28 : 18,
      marginBottom: 6,
    },
    widePinyinText: {
      fontSize: isDesktop ? 28 : isIPad ? 24 : 20,
      lineHeight: isDesktop ? 36 : isIPad ? 32 : 28,
    },
    levelTitle: {
      fontSize: isDesktop ? 24 : isIPad ? 20 : 16,
      fontWeight: '600',
      color: '#333',
    },
    desktopLevelTitle: {
      fontSize: isDesktop ? 28 : isIPad ? 24 : 20,
    },
    scoreText: {
      fontSize: isDesktop ? 24 : isIPad ? 20 : 16,
      fontWeight: '600',
      color: '#333',
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
      <View style={[screenStyles.container, (isDesktop || isIPad) && screenStyles.wideContainer]}>
        {state.currentWord ? (
          <>
            <View style={[
              screenStyles.displayContainer,
              (isDesktop || isIPad) && screenStyles.wideDisplayContainer
            ]}>
              <View style={[
                screenStyles.canvas,
                (isDesktop || isIPad) && screenStyles.wideCanvas
              ]}>
                <CharacterLearning
                  character={state.currentWord.character}
                  onComplete={handleComplete}
                  onHanziInfo={handleHanziInfo}
                  isReviewMode={state.isReviewMode}
                  isDesktop={isDesktop || isIPad}
                />
              </View>
              
              <View style={[
                screenStyles.meaningContainer,
                (isDesktop || isIPad) && screenStyles.wideMeaningContainer
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
                      (isDesktop || isIPad) && screenStyles.wideTabText
                    ]}>
                      {i18n.t('Chinese')}
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
                      (isDesktop || isIPad) && screenStyles.wideTabText
                    ]}>
                      {i18n.t('English')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <ScrollView style={screenStyles.meaningScroll}>
                  {activeTab === 'zh' ? (
                    <>
                      <Text style={[
                        screenStyles.pinyinText,
                        (isDesktop || isIPad) && screenStyles.widePinyinText
                      ]}>
                        {state.currentWord.pinyin.join(', ')}
                      </Text>
                      <Text style={[
                        screenStyles.meaningText,
                        (isDesktop || isIPad) && screenStyles.wideMeaningText
                      ]}>
                        {state.currentWord.meanings.zh.join('\n')}
                      </Text>
                      {state.currentWord.words && state.currentWord.words.length > 0 && (
                        <Text style={[
                          screenStyles.wordsText,
                          (isDesktop || isIPad) && screenStyles.wideWordsText
                        ]}>
                          {i18n.t('commonWords')}：{state.currentWord.words.join('、')}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[
                      screenStyles.meaningText,
                      (isDesktop || isIPad) && screenStyles.wideMeaningText
                    ]}>
                      {state.currentWord.meanings.en.join('\n')}
                    </Text>
                  )}
                </ScrollView>
              </View>
            </View>

            <View style={[
              screenStyles.buttonContainer,
              (isDesktop || isIPad) && screenStyles.wideButtonContainer
            ]}>
              <TouchableOpacity
                style={[screenStyles.soundButton, (isDesktop || isIPad) && screenStyles.wideSoundButton]}
                onPress={() => state.currentWord && playSound(state.currentWord.character)}
              >
                <MaterialCommunityIcons
                  name="volume-high"
                  size={(isDesktop || isIPad) ? (isIPad ? 22 : 24) : 20}
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
                size={isIPad ? 22 : 24} 
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