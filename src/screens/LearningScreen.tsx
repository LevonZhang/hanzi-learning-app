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
  
  // 添加明确的Mac设备检测
  const isMacOS = Platform.OS === 'macos' || (Platform.OS === 'web' && navigator?.platform?.includes('Mac'));
  // 兼容新旧版本 React Native 的 Mac Catalyst 检测
  const isMacCatalyst = Platform.OS === 'ios' && (
    Platform.isMacCatalyst || // React Native 0.64+
    (isIPad && windowWidth > 1024) // 兼容旧版本 RN
  );
  const isMacDevice = isDesktop && !isIPad || isMacOS || isMacCatalyst;
  
  // 调试输出
  console.log('设备信息:', { 
    Platform: Platform.OS, 
    deviceType, 
    isDesktop, 
    isIPad, 
    isMacOS,
    isMacCatalyst,
    isMacDevice,
    windowWidth
  });

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
      marginTop: Platform.OS === 'ios' && !isIPad && !isMacDevice ? -30 : 0, // 针对iPhone设备，使写字板靠屏幕上方
    },
    wideDisplayContainer: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      alignItems: 'flex-start',
      paddingHorizontal: isIPad ? 15 : isDesktop && !isIPad ? 15 : 20,
      gap: isIPad ? 25 : isDesktop && !isIPad ? 25 : 35,
      height: isDesktop || isIPad ? (isDesktop && !isIPad ? '80%' : '92%') : 'auto',
      marginBottom: isDesktop || isIPad ? 20 : 0,
      paddingTop: isDesktop && !isIPad ? 10 : 0,
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
      marginBottom: isDesktop ? 60 : isIPad ? 80 : Platform.OS === 'ios' ? 40 : 60,
    },
    wideCanvas: {
      width: isDesktop ? (isDesktop && !isIPad ? '38%' : '42%') : isIPad ? '48%' : '55%',
      marginBottom: 0,
      marginTop: isDesktop ? (isDesktop && !isIPad ? -5 : 0) : isIPad ? -20 : -60,
      alignSelf: 'flex-start',
      marginLeft: isDesktop ? (isDesktop && !isIPad ? '10%' : '8%') : isIPad ? '3%' : 0,
      marginRight: 'auto',
    },
    meaningContainer: {
      width: '100%',
      padding: isMacDevice ? 15 : isDesktop ? 20 : isIPad ? 20 : 8,
      borderRadius: 8,
      backgroundColor: '#fff',
      marginTop: isDesktop ? 0 : isIPad ? -20 : (Platform.OS === 'ios' && !isIPad && !isMacDevice ? -85 : -70), // iPhone设备降低上边距，从-100改为-85
      height: isDesktop ? (isMacDevice ? '70%' : '75%') : isIPad ? '80%' : (Platform.OS === 'ios' && !isIPad && !isMacDevice ? '52%' : '47%'), // 增加iPhone设备高度
      maxHeight: Platform.OS === 'ios' ? 
        (isDesktop ? (isMacDevice ? '70%' : '75%') : isIPad ? '80%' : (Platform.OS === 'ios' && !isIPad && !isMacDevice ? '52%' : '47%')) : 
        (isDesktop ? (isMacDevice ? '70%' : '75%') : isIPad ? '80%' : '45%'),
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
      width: isDesktop ? (isDesktop && !isIPad ? '40%' : '42%') : isIPad ? '36%' : '45%',
      alignSelf: 'stretch',
      marginTop: isDesktop ? 0 : isIPad ? -20 : -50,
      height: isDesktop && !isIPad ? '75%' : '85%',
      maxHeight: isDesktop && !isIPad ? '75%' : '85%',
      marginLeft: 'auto',
    },
    tabContainer: {
      flexDirection: 'row',
      marginBottom: isMacDevice ? 8 : 16,
    },
    tab: {
      flex: 1,
      paddingVertical: isMacDevice ? 5 : 8,
      alignItems: 'center',
      borderBottomWidth: 2,
    },
    tabText: {
      fontSize: isMacDevice ? 16 : isDesktop ? 16 : isIPad ? 17 : 14,
      fontWeight: '500',
    },
    wideTabText: {
      fontSize: isMacDevice ? 18 : isDesktop ? 18 : isIPad ? 19 : 18,
    },
    meaningScroll: {
      flex: 1,
    },
    meaningText: {
      fontSize: isMacDevice ? 18 : isDesktop ? 22 : isIPad ? 24 : 15,
      lineHeight: isMacDevice ? 24 : isDesktop ? 30 : isIPad ? 32 : 20,
      marginBottom: 6,
    },
    wideMeaningText: {
      fontSize: isMacDevice ? 20 : isDesktop ? 24 : isIPad ? 28 : 24,
      lineHeight: isMacDevice ? 28 : isDesktop ? 32 : isIPad ? 36 : 32,
    },
    wordsText: {
      fontSize: isMacDevice ? 16 : isDesktop ? 18 : isIPad ? 20 : 13,
      lineHeight: isMacDevice ? 22 : isDesktop ? 26 : isIPad ? 28 : 18,
      marginBottom: 6,
    },
    wideWordsText: {
      fontSize: isMacDevice ? 18 : isDesktop ? 20 : isIPad ? 24 : 20,
      lineHeight: isMacDevice ? 26 : isDesktop ? 28 : isIPad ? 32 : 28,
    },
    soundButton: {
      width: isDesktop && !isIPad ? 45 : isIPad ? 55 : 60,
      paddingVertical: isDesktop && !isIPad ? 10 : isIPad ? 14 : 16,
      borderRadius: 8,
      alignItems: 'center',
      backgroundColor: theme.colors.primary,
      marginHorizontal: 8,
    },
    wideSoundButton: {
      width: isDesktop && !isIPad ? 50 : isIPad ? 65 : 70,
    },
    buttonContainer: {
      flexDirection: 'row',
      justifyContent: 'center',
      paddingHorizontal: 16,
      paddingBottom: 16,
      marginBottom: Platform.OS === 'ios' && !isIPad ? 50 : 16,
      marginTop: isDesktop && !isIPad ? 30 : Platform.OS === 'ios' ? (isIPad ? 60 : 30) : 0,
    },
    wideButtonContainer: {
      paddingHorizontal: isDesktop && !isIPad ? 24 : isIPad ? 24 : 32,
      ...(isIPad ? {
        position: 'absolute',
        backgroundColor: 'transparent',
        borderTopWidth: 0,
        top: '82%',
        alignSelf: 'center',
        justifyContent: 'center',
        width: '100%',
        maxWidth: 200,
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
      } : {}),
      ...(isDesktop && !isIPad ? {
        position: 'absolute',
        backgroundColor: 'rgba(255,255,255,0.9)',
        borderTopWidth: 1,
        borderTopColor: '#eee',
        bottom: 80,
        left: '22%',
        transform: [{translateX: -100}],
        alignSelf: 'flex-start',
        justifyContent: 'center',
        paddingVertical: 10,
        width: 'auto',
        zIndex: 1000,
        flexDirection: 'row',
        alignItems: 'center',
        borderRadius: 8,
        paddingHorizontal: 10,
      } : {}),
    },
    button: {
      flex: 0,
      width: isDesktop && !isIPad ? 140 : isIPad ? 180 : 200,
      paddingVertical: isDesktop && !isIPad ? 10 : isIPad ? 14 : 16,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: theme.colors.success,
    },
    wideButton: {
      width: isDesktop && !isIPad ? 150 : isIPad ? 180 : 200,
    },
    buttonText: {
      color: '#fff',
      fontSize: isDesktop ? 18 : isIPad ? 20 : 16,
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
      fontSize: isDesktop ? 26 : isIPad ? 28 : 24,
      fontWeight: '700',
      marginBottom: 24,
      textAlign: 'center',
      color: theme.colors.primary,
    },
    statsText: {
      fontSize: isDesktop ? 16 : isIPad ? 18 : 16,
      lineHeight: isDesktop ? 26 : isIPad ? 28 : 24,
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
      fontSize: isDesktop ? 22 : isIPad ? 24 : 20,
      fontWeight: '700',
      color: theme.colors.primary,
      marginBottom: 4,
    },
    statLabel: {
      fontSize: isDesktop ? 14 : isIPad ? 14 : 12,
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
      fontSize: isDesktop ? 16 : isIPad ? 18 : 16,
      fontWeight: '600',
      marginLeft: 8,
    },
    pinyinText: {
      fontSize: isMacDevice ? 16 : isDesktop ? 18 : isIPad ? 20 : 14,
      lineHeight: isMacDevice ? 22 : isDesktop ? 26 : isIPad ? 28 : 18,
      marginBottom: 6,
    },
    widePinyinText: {
      fontSize: isMacDevice ? 18 : isDesktop ? 20 : isIPad ? 24 : 20,
      lineHeight: isMacDevice ? 26 : isDesktop ? 28 : isIPad ? 32 : 28,
    },
    levelTitle: {
      fontSize: isDesktop ? 18 : isIPad ? 20 : 16,
      fontWeight: '600',
      color: '#333',
    },
    desktopLevelTitle: {
      fontSize: isDesktop ? 20 : isIPad ? 24 : 20,
    },
    scoreText: {
      fontSize: isDesktop ? 18 : isIPad ? 20 : 16,
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
                
                {/* 使用更明确的Mac判断条件 */}
                {isMacDevice && (
                  <View style={{
                    flexDirection: 'row',
                    justifyContent: 'center',
                    alignItems: 'center',
                    paddingVertical: 16,
                    marginTop: 10,
                    marginBottom: 0,
                    backgroundColor: 'rgba(255,255,255,0.98)',
                    borderRadius: 12,
                    borderWidth: 2,
                    borderColor: '#4CAF50',
                    shadowColor: '#000',
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    zIndex: 5000,
                    width: '100%',
                    position: 'absolute',
                    bottom: -200, // 从 -110 调整为 -200，向下移动更多距离
                  }}>
                    <TouchableOpacity
                      style={[
                        screenStyles.soundButton, 
                        { 
                          width: 60, 
                          paddingVertical: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.5)',
                          marginRight: 16
                        }
                      ]}
                      onPress={() => state.currentWord && playSound(state.currentWord.character)}
                    >
                      <MaterialCommunityIcons
                        name="volume-high"
                        size={28}
                        color={theme.colors.textLight}
                      />
                    </TouchableOpacity>
                    
                    <TouchableOpacity
                      style={[
                        screenStyles.button, 
                        { 
                          backgroundColor: theme.colors.success, 
                          width: 140, 
                          paddingVertical: 12,
                          borderWidth: 1,
                          borderColor: 'rgba(255,255,255,0.5)'
                        }
                      ]}
                      onPress={() => handleComplete(true)}
                    >
                      <Text style={[screenStyles.buttonText, { color: theme.colors.textLight, fontSize: 18, fontWeight: 'bold' }]}>
                        {i18n.t('next')}
                      </Text>
                    </TouchableOpacity>
                  </View>
                )}
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
                        (isDesktop || isIPad) && screenStyles.wideMeaningText,
                        isMacDevice && { marginTop: -3, marginBottom: 3 }
                      ]}>
                        {state.currentWord.meanings.zh.join('\n')}
                      </Text>
                      {state.currentWord.words && state.currentWord.words.length > 0 && (
                        <Text style={[
                          screenStyles.wordsText,
                          (isDesktop || isIPad) && screenStyles.wideWordsText,
                          isMacDevice && { marginTop: -3 }
                        ]}>
                          {i18n.t('commonWords')}：{state.currentWord.words.join('、')}
                        </Text>
                      )}
                    </>
                  ) : (
                    <Text style={[
                      screenStyles.meaningText,
                      (isDesktop || isIPad) && screenStyles.wideMeaningText,
                      isMacDevice && { marginTop: -3 }
                    ]}>
                      {state.currentWord.meanings.en.join('\n')}
                    </Text>
                  )}
                </ScrollView>
              </View>
            </View>
            
            {/* 仅对非Mac设备显示原有的按钮 */}
            {!isMacDevice && (
              <View style={[
                screenStyles.buttonContainer,
                isIPad && screenStyles.wideButtonContainer
              ]}>
                <TouchableOpacity
                  style={[screenStyles.soundButton, isIPad && screenStyles.wideSoundButton]}
                  onPress={() => state.currentWord && playSound(state.currentWord.character)}
                >
                  <MaterialCommunityIcons
                    name="volume-high"
                    size={isIPad ? 22 : 20}
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
            )}
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