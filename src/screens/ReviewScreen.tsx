import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ScrollView } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LearningManager } from '../services/LearningManager';

export const ReviewScreen = () => {
  const [reviewWords, setReviewWords] = useState<string[]>([]);
  const [statistics, setStatistics] = useState({
    totalReviewed: 0,
    correctRate: 0,
  });

  useEffect(() => {
    loadReviewWords();
  }, []);

  const loadReviewWords = async () => {
    const learningManager = LearningManager.getInstance();
    const words = await learningManager.getReviewWords();
    setReviewWords(words);
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>错字复习</Text>
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>待复习</Text>
            <Text style={styles.statValue}>{reviewWords.length}</Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>正确率</Text>
            <Text style={styles.statValue}>{statistics.correctRate}%</Text>
          </View>
        </View>
      </View>

      <ScrollView style={styles.wordList}>
        {reviewWords.map((word, index) => (
          <TouchableOpacity key={index} style={styles.wordItem}>
            <Text style={styles.wordText}>{word}</Text>
            <MaterialCommunityIcons name="chevron-right" size={24} color="#666" />
          </TouchableOpacity>
        ))}
        {reviewWords.length === 0 && (
          <View style={styles.emptyState}>
            <MaterialCommunityIcons name="check-circle" size={48} color="#5B7B9E" />
            <Text style={styles.emptyStateText}>目前没有需要复习的汉字</Text>
          </View>
        )}
      </ScrollView>

      {reviewWords.length > 0 && (
        <TouchableOpacity style={styles.startButton}>
          <Text style={styles.startButtonText}>开始复习</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
  header: {
    padding: 20,
    backgroundColor: '#f8f8f8',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#fff',
    borderRadius: 10,
    padding: 15,
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
    marginBottom: 5,
  },
  statValue: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#5B7B9E',
  },
  wordList: {
    flex: 1,
    padding: 20,
  },
  wordItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 15,
    backgroundColor: '#f8f8f8',
    borderRadius: 8,
    marginBottom: 10,
  },
  wordText: {
    fontSize: 18,
    color: '#333',
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
  startButton: {
    backgroundColor: '#5B7B9E',
    margin: 20,
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