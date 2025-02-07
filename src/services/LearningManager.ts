import { DatabaseManager } from '../database/DatabaseManager';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class LearningManager {
  private db: DatabaseManager;
  private settings: LearningSettings;

  constructor() {
    this.db = new DatabaseManager();
    this.loadSettings();
  }

  private async loadSettings() {
    const savedSettings = await AsyncStorage.getItem('learningSettings');
    this.settings = savedSettings ? JSON.parse(savedSettings) : {
      daily_new_words: 5,
      review_interval: [1, 3, 7, 14, 30]
    };
  }

  async getTodayLearningList() {
    // 获取新词
    const newWords = await this.db.getDailyLearningList(this.settings.daily_new_words);
    
    // 获取需要复习的字
    const reviewWords = await this.getReviewList();
    
    return {
      newWords,
      reviewWords
    };
  }

  async recordMistake(characterId: number) {
    await this.db.updateProgress(characterId, 'mistake');
  }

  async updateGameScore(gameType: string, score: number) {
    await this.db.saveGameScore(gameType, score);
  }
} 