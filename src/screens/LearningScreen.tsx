import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CharacterLearning } from '../components/CharacterLearning';
import { LearningManager } from '../services/LearningManager';

interface Character {
  character: string;
  pinyin: string[];
  meanings?: {
    zh?: string[];
    en?: string[];
    ja?: string[];
  };
}

interface LearningState {
  newWords: any[];
  reviewWords: any[];
  currentWord: any;
  isReviewMode: boolean;
  statistics: {
    totalLearned: number;
    mastered: number;
    needReview: number;
  };
}

export const LearningScreen = () => {
  const [state, setState] = useState<LearningState>({
    newWords: [],
    reviewWords: [],
    currentWord: null,
    isReviewMode: false,
    statistics: {
      totalLearned: 0,
      mastered: 0,
      needReview: 0
    }
  });

  useEffect(() => {
    loadTodayLearning();
  }, []);

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

  if (!state.currentWord) {
    return (
      <View style={styles.container}>
        <Text style={styles.title}>今日学习完成！</Text>
        <View style={styles.statsContainer}>
          <Text style={styles.statsText}>已学习: {state.statistics.totalLearned} 个字</Text>
          <Text style={styles.statsText}>已掌握: {state.statistics.mastered} 个字</Text>
          <Text style={styles.statsText}>需要复习: {state.statistics.needReview} 个字</Text>
        </View>
        <TouchableOpacity 
          style={styles.button}
          onPress={loadTodayLearning}
        >
          <Text style={styles.buttonText}>重新开始</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.mode}>
          {state.isReviewMode ? '复习模式' : '学习模式'}
        </Text>
        <Text style={styles.progress}>
          {state.isReviewMode 
            ? `复习进度: ${state.reviewWords.findIndex(w => w.character === state.currentWord.character) + 1}/${state.reviewWords.length}`
            : `学习进度: ${state.newWords.findIndex(w => w.character === state.currentWord.character) + 1}/${state.newWords.length}`
          }
        </Text>
      </View>

      <View style={styles.characterInfo}>
        <View style={styles.characterHeader}>
          <Text style={styles.characterText}>{state.currentWord.character}</Text>
          <View style={styles.pinyinContainer}>
            {state.currentWord?.pinyin?.map((pin, index) => (
              <View key={index} style={styles.pinyinItem}>
                <Text style={styles.pinyinText}>{pin}</Text>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.meaningsContainer}>
          {state.currentWord?.meanings?.zh && (
            <View style={styles.meaningSection}>
              <Text style={styles.meaningTitle}>中文释义:</Text>
              {state.currentWord.meanings.zh.map((meaning, index) => (
                <Text key={index} style={styles.meaningText}>• {meaning}</Text>
              ))}
            </View>
          )}

          {state.currentWord?.meanings?.en && (
            <View style={styles.meaningSection}>
              <Text style={styles.meaningTitle}>英文释义:</Text>
              {state.currentWord.meanings.en.map((meaning, index) => (
                <Text key={index} style={styles.meaningText}>• {meaning}</Text>
              ))}
            </View>
          )}
          
          {state.currentWord?.meanings?.ja && (
            <View style={styles.meaningSection}>
              <Text style={styles.meaningTitle}>日文释义:</Text>
              {state.currentWord.meanings.ja.map((meaning, index) => (
                <Text key={index} style={styles.meaningText}>• {meaning}</Text>
              ))}
            </View>
          )}
        </View>
      </View>

      <CharacterLearning
        character={state.currentWord.character}
        onComplete={handleComplete}
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
        <Text style={styles.nextButtonText}>下一个</Text>
      </TouchableOpacity>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
    padding: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 20,
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
    marginTop: 10,
    marginHorizontal: 20,
    width: 100,
    alignSelf: 'center',
  },
  nextButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  characterInfo: {
    marginVertical: 10,
    padding: 15,
    backgroundColor: '#f8f8f8',
    borderRadius: 10,
  },
  characterHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15,
    gap: 15,
  },
  characterText: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#333',
  },
  pinyinContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    flex: 1,
    gap: 8,
  },
  pinyinItem: {
    backgroundColor: '#5B7B9E',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  pinyinText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  meaningsContainer: {
    gap: 15,
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
    lineHeight: 20,
  },
}); 