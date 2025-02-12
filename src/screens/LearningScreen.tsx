import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Modal, ScrollView, SafeAreaView } from 'react-native';
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

interface Character {
  character: string;
  pinyin: string[];
  meanings: {
    zh: string[];
    en: string[];
  };
  words?: string[];
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
  radical: string;
  strokes: number;
  traditional: string;
  japanese: string;
}

interface LearningScreenProps {
  route?: {
    params?: {
      mode?: 'review' | 'learning';
      reviewWords?: string[];
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
    if (route?.params?.mode === 'review' && route?.params?.reviewWords) {
      // 如果是从复习页面进入，使用传入的复习字列表
      loadReviewWords(route.params.reviewWords);
    } else {
      // 否则加载今天的学习列表
      loadTodayLearning();
    }
  }, [route?.params]);

  const loadTodayLearning = async () => {
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

    const learningManager = LearningManager.getInstance();
    await learningManager.recordProgress(state.currentWord.character, isCorrect);

    // 更新当前字列表
    const currentList = state.isReviewMode ? state.reviewWords : state.newWords;
    const nextIndex = currentList.findIndex(w => w.character === state.currentWord.character) + 1;

    if (nextIndex < currentList.length) {
      // 还有字要学习
      setState(prev => ({
        ...prev,
        currentWord: currentList[nextIndex]
      }));
    } else if (!state.isReviewMode && state.reviewWords.length > 0) {
      // 新字学完了，开始复习
      setState(prev => ({
        ...prev,
        isReviewMode: true,
        currentWord: state.reviewWords[0]
      }));
    } else {
      // 今天的学习任务完成
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

  if (!state.currentWord) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={styles.title}>{i18n.t('completed')}</Text>
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>{i18n.t('totalLearned')}: {state.statistics.totalLearned} {i18n.t('characters')}</Text>
          <Text style={styles.statsText}>{i18n.t('mastered')}: {state.statistics.mastered} {i18n.t('characters')}</Text>
          <Text style={styles.statsText}>{i18n.t('needReview')}: {state.statistics.needReview} {i18n.t('characters')}</Text>
        </View>
        <TouchableOpacity 
          style={styles.button}
          onPress={loadTodayLearning}
        >
          <Text style={styles.buttonText}>{i18n.t('restart')}</Text>
        </TouchableOpacity>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.header}>
          <Text style={styles.mode}>
            {state.isReviewMode ? i18n.t('reviewMode') : i18n.t('learningMode')}
          </Text>
          <Text style={styles.progress}>
            {state.isReviewMode 
              ? `${i18n.t('reviewProgress')}: ${state.reviewWords.findIndex(w => w.character === state.currentWord.character) + 1}/${state.reviewWords.length}`
              : `${i18n.t('learningProgress')}: ${state.newWords.findIndex(w => w.character === state.currentWord.character) + 1}/${state.newWords.length}`
            }
          </Text>
        </View>

        <View style={styles.characterInfo}>
          <View style={styles.characterHeader}>
            <Text style={styles.characterText}>{state.currentWord.character}</Text>
            <TouchableOpacity 
              onPress={() => playSound(state.currentWord.character)}
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
              <ScrollView 
                style={styles.modalScrollView}
                showsVerticalScrollIndicator={true}
                bounces={false}
              >
                <View style={styles.modalScrollContent}>
                  {activeTab === 'zh' && 
                    state.currentWord?.meanings?.zh.map((meaning, index) => (
                      <Text key={index} style={styles.modalMeaningText}>
                        • {meaning}
                      </Text>
                    ))
                  }
                  {activeTab === 'en' && 
                    state.currentWord?.meanings?.en.map((meaning, index) => (
                      <Text key={index} style={styles.modalMeaningText}>
                        • {meaning}
                      </Text>
                    ))
                  }
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        <CharacterLearning
          character={state.currentWord.character}
          onComplete={handleComplete}
          onHanziInfo={handleHanziInfo}
          isReviewMode={state.isReviewMode}
        />

        <TouchableOpacity 
          style={styles.nextButton}
          onPress={() => {
            const currentList = state.isReviewMode ? state.reviewWords : state.newWords;
            const currentIndex = currentList.findIndex(w => w.character === state.currentWord.character);
            
            if (currentIndex < currentList.length - 1) {
              // 还有下一个字
              setState(prev => ({
                ...prev,
                currentWord: currentList[currentIndex + 1]
              }));
            } else if (!state.isReviewMode && state.reviewWords.length > 0) {
              // 新字学完了，开始复习
              setState(prev => ({
                ...prev,
                isReviewMode: true,
                currentWord: state.reviewWords[0]
              }));
            } else {
              // 全部完成
              setState(prev => ({
                ...prev,
                currentWord: null
              }));
            }
          }}
        >
          <Text style={styles.nextButtonText}>{i18n.t('next')}</Text>
        </TouchableOpacity>
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
    marginBottom: 20,
  },
  statsContainer: {
    backgroundColor: '#f8f8f8',
    padding: 20,
    borderRadius: 10,
    marginBottom: 20,
  },
  statsText: {
    fontSize: 16,
    marginBottom: 10,
    color: '#333',
  },
  button: {
    backgroundColor: '#007AFF',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 10,
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
  nextButton: {
    backgroundColor: '#5B7B9E',
    padding: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 5,
    marginHorizontal: 20,
    width: 100,
    alignSelf: 'flex-end',
    marginRight: 20,
    zIndex: 1,
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
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
  modalScrollView: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
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
}); 