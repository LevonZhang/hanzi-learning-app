import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { CharacterLearning } from '../components/CharacterLearning';
import { LearningManager } from '../services/LearningManager';

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

      <CharacterLearning
        character={state.currentWord.character}
        onComplete={() => {}}  // 不自动标记为正确
      />

      <View style={styles.buttonContainer}>
        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#4CAF50' }]}
          onPress={() => handleComplete(true)}
        >
          <Text style={styles.buttonText}>认识</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={[styles.button, { backgroundColor: '#FF4444' }]}
          onPress={() => handleComplete(false)}
        >
          <Text style={styles.buttonText}>不认识</Text>
        </TouchableOpacity>
      </View>
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
}); 