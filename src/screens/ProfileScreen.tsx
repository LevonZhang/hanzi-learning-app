import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { i18n } from '../i18n/i18n';
import { storageService } from '../services/StorageService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Stats {
  total: number;
  week: number;
  month: number;
  year: number;
}

interface GameScores {
  word: number;
  pronunciation: number;
}

export const ProfileScreen = () => {
  const [stats, setStats] = useState<Stats>({
    total: 0,
    week: 0,
    month: 0,
    year: 0,
  });
  const [scores, setScores] = useState<GameScores>({
    word: 0,
    pronunciation: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [learningStats, wordScore, pronunciationScore] = await Promise.all([
      storageService.getLearningStats(),
      storageService.getGameHighScore('word'),
      storageService.getGameHighScore('pronunciation'),
    ]);

    setStats(learningStats);
    setScores({
      word: wordScore,
      pronunciation: pronunciationScore,
    });
  };

  const renderStatCard = (title: string, value: number, icon: keyof typeof MaterialCommunityIcons.glyphMap) => (
    <View style={styles.statCard}>
      <LinearGradient
        colors={['#4CAF50', '#45a049']}
        style={styles.statGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <MaterialCommunityIcons name={icon} size={24} color="#fff" />
        <Text style={styles.statValue}>{value}</Text>
        <Text style={styles.statTitle}>{title}</Text>
      </LinearGradient>
    </View>
  );

  const renderGameScoreCard = (title: string, score: number, icon: keyof typeof MaterialCommunityIcons.glyphMap) => (
    <View style={styles.gameScoreCard}>
      <LinearGradient
        colors={['#FF9AA2', '#FFB7B2']}
        style={styles.gameScoreGradient}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
      >
        <View style={styles.gameScoreHeader}>
          <MaterialCommunityIcons name={icon} size={24} color="#fff" />
          <Text style={styles.gameScoreTitle}>{title}</Text>
        </View>
        <Text style={styles.gameScoreValue}>{score}</Text>
      </LinearGradient>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{i18n.t('profile')}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{i18n.t('gameHighScores')}</Text>
        <View style={styles.gameScoresContainer}>
          {renderGameScoreCard(i18n.t('wordGame'), scores.word, 'puzzle')}
          {renderGameScoreCard(i18n.t('pronunciationGame'), scores.pronunciation, 'volume-high')}
        </View>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>{i18n.t('studyProgress')}</Text>
        <View style={styles.statsGrid}>
          {renderStatCard(i18n.t('thisWeek'), stats.week, 'calendar-week')}
          {renderStatCard(i18n.t('thisMonth'), stats.month, 'calendar-month')}
          {renderStatCard(i18n.t('thisYear'), stats.year, 'calendar-clock')}
          {renderStatCard(i18n.t('total'), stats.total, 'book-open-variant')}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0f8ff',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 20,
    paddingBottom: 20,
    paddingHorizontal: 20,
    backgroundColor: 'transparent',
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#333',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
    marginBottom: 15,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 10,
  },
  statCard: {
    width: (SCREEN_WIDTH - 50) / 2,
    borderRadius: 15,
    overflow: 'hidden',
  },
  statGradient: {
    padding: 15,
    alignItems: 'center',
  },
  statValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#fff',
    marginVertical: 5,
  },
  statTitle: {
    fontSize: 14,
    color: '#fff',
    opacity: 0.9,
  },
  gameScoresContainer: {
    gap: 10,
  },
  gameScoreCard: {
    borderRadius: 15,
    overflow: 'hidden',
  },
  gameScoreGradient: {
    padding: 15,
  },
  gameScoreHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  gameScoreTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#fff',
  },
  gameScoreValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#fff',
    marginTop: 10,
  },
}); 