import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { i18n } from '../../../i18n/i18n';
import { useResponsive } from '../../../hooks/useResponsive';
import gameService from '../../../services/GameService';

interface GameProgress {
  currentLevel: number;
  completedWords: string[];
  score: number;
  isCompleted: boolean;
}

interface GameStats {
  wordGame: {
    highScore: number;
    gamesPlayed: number;
    isCompleted: boolean;
  };
  pronunciationGame: {
    highScore: number;
    gamesPlayed: number;
    isCompleted: boolean;
  };
}

export const GameStatsSection = () => {
  const { theme } = useResponsive();
  const [gameStats, setGameStats] = useState<GameStats>({
    wordGame: { highScore: 0, gamesPlayed: 0, isCompleted: false },
    pronunciationGame: { highScore: 0, gamesPlayed: 0, isCompleted: false }
  });
  const [gameProgress, setGameProgress] = useState<GameProgress | null>(null);
  const [pronunciationGameProgress, setPronunciationGameProgress] = useState<GameProgress | null>(null);

  useEffect(() => {
    loadGameStats();
  }, []);

  const loadGameStats = async () => {
    try {
      const gameStatsStr = await AsyncStorage.getItem('gameStats');
      if (gameStatsStr) {
        const parsedGameStats = JSON.parse(gameStatsStr);
        setGameStats(parsedGameStats);
      }

      try {
        const wordProgress = await gameService.loadGameProgress('word');
        setGameProgress(wordProgress);

        const pronunciationProgress = await gameService.loadGameProgress('pronunciation');
        setPronunciationGameProgress(pronunciationProgress);
      } catch (error) {
        console.error('加载游戏进度失败:', error);
      }
    } catch (error) {
      console.error('加载游戏统计失败:', error);
    }
  };

  const handleResetGame = async (gameType: 'word' | 'pronunciation') => {
    Alert.alert(
      i18n.t('resetGameConfirm'),
      i18n.t('resetGameConfirmMessage'),
      [
        {
          text: i18n.t('cancel'),
          style: 'cancel'
        },
        {
          text: i18n.t('confirm'),
          onPress: async () => {
            try {
              await gameService.resetGame(gameType);
              loadGameStats();
              Alert.alert(i18n.t('success'), i18n.t('resetSuccess'));
            } catch (error) {
              console.error('重置游戏失败:', error);
              Alert.alert(i18n.t('error'), i18n.t('resetError'));
            }
          }
        }
      ]
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.gameStatsContainer}>
        <View style={styles.gameStatItem}>
          <Text style={[styles.gameTitle, { color: theme.colors.text }]}>{i18n.t('wordGame')}</Text>
          <Text style={[styles.statText, { color: theme.colors.text }]}>
            {i18n.t('highScore')}: {gameStats.wordGame.highScore}
          </Text>
          <Text style={[styles.statText, { color: theme.colors.text }]}>
            {i18n.t('gamesPlayed')}: {gameStats.wordGame.gamesPlayed}
          </Text>
          {gameProgress && (
            <Text style={[styles.statText, { color: theme.colors.text }]}>
              {i18n.t('currentProgress')}: {i18n.t('level', { level: gameProgress.currentLevel })} - {gameProgress.score}{i18n.t('points')}
            </Text>
          )}
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => handleResetGame('word')}
          >
            <Text style={styles.resetButtonText}>{i18n.t('resetGame')}</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.gameStatItem}>
          <Text style={[styles.gameTitle, { color: theme.colors.text }]}>{i18n.t('pronunciationGame')}</Text>
          <Text style={[styles.statText, { color: theme.colors.text }]}>
            {i18n.t('highScore')}: {gameStats.pronunciationGame.highScore}
          </Text>
          <Text style={[styles.statText, { color: theme.colors.text }]}>
            {i18n.t('gamesPlayed')}: {gameStats.pronunciationGame.gamesPlayed}
          </Text>
          {pronunciationGameProgress && (
            <Text style={[styles.statText, { color: theme.colors.text }]}>
              {i18n.t('currentProgress')}: {i18n.t('level', { level: pronunciationGameProgress.currentLevel })} - {pronunciationGameProgress.score}{i18n.t('points')}
            </Text>
          )}
          <TouchableOpacity
            style={styles.resetButton}
            onPress={() => handleResetGame('pronunciation')}
          >
            <Text style={styles.resetButtonText}>{i18n.t('resetGame')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 20,
  },
  gameStatsContainer: {
    width: '100%',
    gap: 16,
  },
  gameStatItem: {
    backgroundColor: 'white',
    padding: 20,
    borderRadius: 12,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 3,
  },
  gameTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statText: {
    fontSize: 16,
    marginBottom: 4,
  },
  resetButton: {
    backgroundColor: '#F5F5F5',
    padding: 10,
    borderRadius: 8,
    marginTop: 10,
    alignItems: 'center',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  resetButtonText: {
    color: '#FF3B30',
    fontSize: 16,
    fontWeight: '600',
  },
}); 