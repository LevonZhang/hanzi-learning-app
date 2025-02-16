import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, SafeAreaView, Alert, FlatList } from 'react-native';
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

  if (!state.currentWord) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.completionContainer}>
          <MaterialCommunityIcons name="check-circle" size={64} color="#4CAF50" />
          <Text style={styles.title}>
            {state.isReviewMode 
              ? i18n.t('reviewCompleted') 
              : i18n.t('learningCompleted')
            }
          </Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="book-open-variant" size={24} color="#007AFF" />
              <Text style={styles.statsText}>
                {i18n.t('totalLearned')}: {state.statistics.totalLearned} {i18n.t('characters')}
              </Text>
            </View>
            <View style={styles.statItem}>
              <MaterialCommunityIcons name="star" size={24} color="#007AFF" />
              <Text style={styles.statsText}>
                {i18n.t('mastered')}: {state.statistics.mastered} {i18n.t('characters')}
              </Text>
            </View>
          </View>
          {state.isReviewMode ? (
            <TouchableOpacity 
              style={styles.button}
              onPress={() => {
                navigation.reset({
                  index: 0,
                  routes: [
                    {
                      name: 'Learning',
                      params: { mode: 'learning', reviewWords: undefined }
                    },
                  ],
                });
              }}
            >
              <MaterialCommunityIcons name="book-plus" size={24} color="#fff" />
              <Text style={styles.buttonText}>{i18n.t('continueNewLearning')}</Text>
            </TouchableOpacity>
          ) : (
            <View style={styles.buttonGroup}>
              <TouchableOpacity 
                style={styles.button}
                onPress={async () => {
                  const learningManager = LearningManager.getInstance();
                  await learningManager.resetTodayLearning();
                  setState(prev => ({
                    ...prev,
                    newWords: [],
                    reviewWords: [],
                    currentWord: null,
                    isReviewMode: false
                  }));
                  await loadTodayLearning();
                }}
              >
                <MaterialCommunityIcons name="book-plus" size={24} color="#fff" />
                <Text style={styles.buttonText}>{i18n.t('continueLearning')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.button, styles.reviewButton]}
                onPress={() => navigation.navigate('Review')}
              >
                <MaterialCommunityIcons name="refresh" size={24} color="#fff" />
                <Text style={styles.buttonText}>{i18n.t('review')}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.mode}>
            {state.isReviewMode ? i18n.t('reviewMode') : 
             route?.params?.mode === 'display' ? i18n.t('displayMode') :
             i18n.t('learningMode')}
          </Text>
          {route?.params?.mode !== 'display' && (
            <Text style={styles.progress}>
              {state.isReviewMode 
                ? `${i18n.t('reviewProgress')}: ${state.reviewWords.findIndex(w => w.character === state.currentWord!.character) + 1}/${state.reviewWords.length}`
                : `${i18n.t('learningProgress')}: ${state.newWords.findIndex(w => w.character === state.currentWord!.character) + 1}/${state.newWords.length}`
              }
            </Text>
          )}
        </View>

        <View style={styles.characterInfo}>
          <View style={styles.characterHeader}>
            <Text style={styles.characterText}>{state.currentWord!.character}</Text>
            <TouchableOpacity 
              onPress={() => playSound(state.currentWord!.character)}
              style={styles.soundButton}
            >
              <MaterialCommunityIcons name="volume-high" size={24} color="#5B7B9E" />
            </TouchableOpacity>
            <View style={styles.pinyinAndWordsContainer}>
              <View style={styles.pinyinContainer}>
                {state.currentWord?.pinyin?.map((pin, index) => (
                  <View key={index} style={styles.pinyinItem}>
                    <Text style={styles.pinyinText}>{pin}</Text>
                  </View>
                ))}
              </View>
            </View>
          </View>

          <View style={styles.meaningsContainer}>
            <View style={styles.tabButtons}>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'zh' && styles.activeTab]}
                onPress={() => setActiveTab('zh')}
              >
                <Text style={[styles.tabText, activeTab === 'zh' && styles.activeTabText]}>{i18n.t('languageZh')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'en' && styles.activeTab]}
                onPress={() => setActiveTab('en')}
              >
                <Text style={[styles.tabText, activeTab === 'en' && styles.activeTabText]}>{i18n.t('languageEn')}</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[styles.tabButton, activeTab === 'words' && styles.activeTab]}
                onPress={() => setActiveTab('words')}
              >
                <Text style={[styles.tabText, activeTab === 'words' && styles.activeTabText]}>{i18n.t('commonWords')}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.meaningContent}>
              {activeTab === 'zh' && (
                <>
                  {state.currentWord?.meanings?.zh.slice(0, 3).map((meaning, index) => (
                    <Text key={index} style={styles.meaningText} numberOfLines={1}>
                      • {meaning}
                    </Text>
                  ))}
                  {state.currentWord?.meanings?.zh.length > 3 && (
                    <TouchableOpacity 
                      style={styles.showMoreButton}
                      onPress={() => setShowFullMeaning(true)}
                    >
                      <Text style={styles.showMoreText}>{i18n.t('showMore')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {activeTab === 'en' && (
                <>
                  {state.currentWord?.meanings?.en.slice(0, 3).map((meaning, index) => (
                    <Text key={index} style={styles.meaningText} numberOfLines={1}>
                      • {meaning}
                    </Text>
                  ))}
                  {state.currentWord?.meanings?.en.length > 3 && (
                    <TouchableOpacity 
                      style={styles.showMoreButton}
                      onPress={() => setShowFullMeaning(true)}
                    >
                      <Text style={styles.showMoreText}>{i18n.t('showMore')}</Text>
                    </TouchableOpacity>
                  )}
                </>
              )}
              {activeTab === 'words' && (
                <View style={styles.wordsTabContent}>
                  {state.currentWord?.words?.slice(0, 4).map((word, index) => (
                    <View key={index} style={styles.wordItemInTab}>
                      <Text style={styles.wordText}>{word}</Text>
                    </View>
                  ))}
                  {(!state.currentWord?.words || state.currentWord.words.length === 0) && (
                    <Text style={styles.noWordsText}>{i18n.t('noCommonWords')}</Text>
                  )}
                </View>
              )}
            </View>
          </View>
        </View>

        <Modal
          visible={showFullMeaning}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowFullMeaning(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <View style={styles.modalHeader}>
                <Text style={styles.modalTitle}>
                  {activeTab === 'zh' ? i18n.t('fullMeanings') : i18n.t('fullMeanings')}
                </Text>
                <TouchableOpacity 
                  onPress={() => setShowFullMeaning(false)}
                  style={styles.closeButton}
                >
                  <Text style={styles.closeButtonText}>×</Text>
                </TouchableOpacity>
              </View>
              <FlatList
                data={activeTab === 'zh' ? state.currentWord?.meanings?.zh : state.currentWord?.meanings?.en}
                renderItem={({ item }) => (
                  <Text style={styles.modalMeaningText}>• {item}</Text>
                )}
                keyExtractor={(item, index) => index.toString()}
                contentContainerStyle={styles.modalScrollContent}
                showsVerticalScrollIndicator={true}
              />
            </View>
          </View>
        </Modal>

        {state.currentWord?.strokes === 0 && (
          <View style={styles.noStrokesContainer}>
            <MaterialCommunityIcons name="information" size={20} color="#666" />
            <Text style={styles.noStrokesText}>{i18n.t('noStrokesData')}</Text>
          </View>
        )}

        <CharacterLearning
          character={state.currentWord.character}
          onComplete={handleComplete}
          onHanziInfo={handleHanziInfo}
          isReviewMode={state.isReviewMode}
        />

        {state.currentWord && route?.params?.mode !== 'display' && (
          <View style={styles.navigationButtons}>
            <TouchableOpacity 
              style={[
                styles.navigationButton,
                styles.prevButton,
                {
                  opacity: (() => {
                    const currentList = state.isReviewMode ? state.reviewWords : state.newWords;
                    const currentIndex = currentList.findIndex(w => w.character === state.currentWord!.character);
                    return currentIndex === 0 ? 0.5 : 1;
                  })()
                }
              ]}
              onPress={() => {
                const currentList = state.isReviewMode ? state.reviewWords : state.newWords;
                const currentIndex = currentList.findIndex(w => w.character === state.currentWord!.character);
                
                if (currentIndex > 0) {
                  setState(prev => ({
                    ...prev,
                    currentWord: currentList[currentIndex - 1]
                  }));
                }
              }}
              disabled={(() => {
                const currentList = state.isReviewMode ? state.reviewWords : state.newWords;
                const currentIndex = currentList.findIndex(w => w.character === state.currentWord!.character);
                return currentIndex === 0;
              })()}
            >
              <View style={styles.navigationButtonContent}>
                <MaterialCommunityIcons name="arrow-left" size={20} color="#fff" />
                <Text style={styles.navigationButtonText}>{i18n.t('previous')}</Text>
              </View>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[styles.navigationButton]}
              onPress={async () => {
                const currentList = state.isReviewMode ? state.reviewWords : state.newWords;
                const currentIndex = currentList.findIndex(w => w.character === state.currentWord!.character);
                
                if (currentIndex < currentList.length - 1) {
                  // 如果不是复习模式，记录当前字为已学习
                  if (!state.isReviewMode) {
                    await handleCharacterLearned(state.currentWord!.character);
                  }
                  
                  // 更新到下一个字
                  setState(prev => ({
                    ...prev,
                    currentWord: currentList[currentIndex + 1]
                  }));
                } else {
                  // 如果是最后一个字，更新统计并结束学习
                  const learningManager = LearningManager.getInstance();
                  const statistics = await learningManager.getStatistics();
                  setState(prev => ({
                    ...prev,
                    currentWord: null,
                    statistics
                  }));
                }
              }}
            >
              <View style={styles.navigationButtonContent}>
                <Text style={styles.navigationButtonText}>{i18n.t('next')}</Text>
                <MaterialCommunityIcons name="arrow-right" size={20} color="#fff" />
              </View>
            </TouchableOpacity>
          </View>
        )}
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
    padding: 15,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  mode: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  progress: {
    fontSize: 16,
    color: '#666',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    textAlign: 'center',
    marginVertical: 20,
    color: '#333',
  },
  statsContainer: {
    backgroundColor: '#f8f8f8',
    padding: 20,
    borderRadius: 12,
    width: '100%',
    marginBottom: 30,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    gap: 12,
  },
  statsText: {
    fontSize: 16,
    color: '#333',
    flex: 1,
  },
  buttonGroup: {
    width: '100%',
    gap: 15,
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 12,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
    width: '100%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  reviewButton: {
    backgroundColor: '#5856D6',
  },
  buttonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  navigationButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    position: 'absolute',
    bottom: 75,
    left: 20,
    right: 20,
    zIndex: 1,
  },
  navigationButton: {
    backgroundColor: '#007AFF',
    padding: 10,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
    width: 100,
  },
  prevButton: {
    backgroundColor: '#5856D6',
  },
  navigationButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  navigationButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  characterInfo: {
    marginVertical: 5,
    padding: 10,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
    minHeight: 160,
  },
  characterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 12,
  },
  characterText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#333',
  },
  pinyinAndWordsContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  pinyinContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  pinyinItem: {
    backgroundColor: '#5B7B9E',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  pinyinText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '500',
  },
  meaningsContainer: {
    gap: 8,
  },
  meaningSection: {
    gap: 5,
  },
  meaningTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  meaningText: {
    fontSize: 14,
    color: '#666',
    lineHeight: 18,
    paddingVertical: 2,
    marginBottom: 2,
  },
  soundButton: {
    padding: 8,
  },
  tabButtons: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    marginBottom: 10,
  },
  tabButton: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#5B7B9E',
  },
  tabText: {
    fontSize: 14,
    color: '#666',
  },
  activeTabText: {
    color: '#5B7B9E',
    fontWeight: '600',
  },
  meaningContent: {
    paddingVertical: 2,
    minHeight: 70,
  },
  showMoreButton: {
    paddingVertical: 4,
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 2,
  },
  showMoreText: {
    color: '#5B7B9E',
    fontSize: 14,
    fontWeight: '600',
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    width: '90%',
    maxHeight: '70%',
    paddingTop: 15,
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
  },
  closeButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f0f0f0',
  },
  closeButtonText: {
    fontSize: 20,
    color: '#666',
    fontWeight: '600',
    textAlign: 'center',
    width: 24,
    height: 24,
    lineHeight: 24,
  },
  modalScrollContent: {
    flexGrow: 1,
  },
  modalMeaningText: {
    fontSize: 16,
    color: '#333',
    lineHeight: 24,
    marginBottom: 8,
  },
  wordsTabContent: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingVertical: 5,
  },
  wordItemInTab: {
    backgroundColor: '#f5f5f5',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
  wordText: {
    fontSize: 14,
    color: '#333',
  },
  noWordsText: {
    color: '#666',
    fontSize: 14,
    fontStyle: 'italic',
    textAlign: 'center',
    width: '100%',
    paddingVertical: 10,
  },
  completionContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  noStrokesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginVertical: 10,
    gap: 8,
  },
  noStrokesText: {
    fontSize: 14,
    color: '#666',
  },
}); 