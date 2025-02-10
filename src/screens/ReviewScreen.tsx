import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, SafeAreaView, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LearningManager } from '../services/LearningManager';
import { useNavigation } from '@react-navigation/native';
import { i18n } from '../i18n/i18n';

interface ReviewCharacter {
  character: string;
  mistakes: number;
  lastReviewDate: string;
}

export const ReviewScreen = () => {
  const [reviewWords, setReviewWords] = useState<ReviewCharacter[]>([]);
  const [statistics, setStatistics] = useState({
    totalReviewed: 0,
    correctRate: 0,
  });
  const navigation = useNavigation();

  useEffect(() => {
    loadReviewWords();
  }, []);

  const loadReviewWords = async () => {
    const learningManager = LearningManager.getInstance();
    const progress = await learningManager.getAllProgress();
    
    // 获取所有需要复习的字
    const reviewList = Object.values(progress)
      .filter(item => item.mistakes > 0)
      .map(item => ({
        character: item.character,
        mistakes: item.mistakes,
        lastReviewDate: item.lastReviewDate
      }))
      .sort((a, b) => b.mistakes - a.mistakes); // 按错误次数降序排序

    setReviewWords(reviewList);

    // 更新统计信息
    const stats = await learningManager.getStatistics();
    setStatistics({
      totalReviewed: reviewList.length,
      correctRate: stats.mastered / (stats.totalLearned || 1) * 100,
    });
  };

  const startReview = () => {
    // 导航到学习页面，并传递复习模式参数
    navigation.navigate('Learning', { 
      mode: 'review',
      reviewWords: reviewWords.map(w => w.character)
    });
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>{i18n.t('reviewMode')}</Text>
          <View style={styles.statsContainer}>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{i18n.t('needReview')}</Text>
              <Text style={styles.statValue}>{reviewWords.length}</Text>
            </View>
            <View style={styles.statItem}>
              <Text style={styles.statLabel}>{i18n.t('correctRate')}</Text>
              <Text style={styles.statValue}>{Math.round(statistics.correctRate)}%</Text>
            </View>
          </View>
        </View>

        <ScrollView 
          style={styles.wordList}
          contentContainerStyle={styles.wordListContent}
        >
          {reviewWords.map((word, index) => (
            <TouchableOpacity 
              key={index} 
              style={styles.wordItem}
              onPress={() => {
                navigation.navigate('Learning', { 
                  mode: 'review',
                  reviewWords: [word.character]
                });
              }}
            >
              <View style={styles.wordInfo}>
                <Text style={styles.wordText}>{word.character}</Text>
                <Text style={styles.wordMistakes}>
                  {i18n.t('mistakes')}: {word.mistakes}
                </Text>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
            </TouchableOpacity>
          ))}
          {reviewWords.length === 0 && (
            <View style={styles.emptyState}>
              <MaterialCommunityIcons name="check-circle" size={48} color="#5B7B9E" />
              <Text style={styles.emptyStateText}>{i18n.t('noReviewNeeded')}</Text>
            </View>
          )}
        </ScrollView>

        {reviewWords.length > 0 && (
          <View style={styles.buttonContainer}>
            <TouchableOpacity 
              style={styles.startButton}
              onPress={startReview}
            >
              <Text style={styles.startButtonText}>{i18n.t('startReview')}</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#fff',
  },
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 0 : 10,
    paddingHorizontal: 20,
    paddingBottom: 12,
    backgroundColor: '#f8f8f8',
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 10,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  statItem: {
    alignItems: 'center',
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#5B7B9E',
  },
  wordList: {
    flex: 1,
  },
  wordListContent: {
    padding: 15,
  },
  wordItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginBottom: 8,
  },
  wordInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 15,
  },
  wordText: {
    fontSize: 20,
    color: '#333',
  },
  wordMistakes: {
    fontSize: 14,
    color: '#666',
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 40,
  },
  emptyStateText: {
    fontSize: 16,
    color: '#666',
    marginTop: 10,
  },
  buttonContainer: {
    padding: 15,
    paddingBottom: Platform.OS === 'ios' ? 25 : 15,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  startButton: {
    backgroundColor: '#5B7B9E',
    padding: 15,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
}); 