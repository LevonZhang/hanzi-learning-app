import AsyncStorage from '@react-native-async-storage/async-storage';
import HanziService from './HanziService';

interface LearningProgress {
  character: string;
  lastReviewDate: string;
  nextReviewDate: string;
  mistakes: number;
  masteryLevel: number;  // 0-5, 表示掌握程度
}

interface LearningSettings {
  dailyNewWords: number;
  reviewIntervals: number[];  // 复习间隔天数 [1, 3, 7, 14, 30]
}

export class LearningManager {
  private static instance: LearningManager;
  private settings: LearningSettings = {
    dailyNewWords: 5,
    reviewIntervals: [1, 3, 7, 14, 30]
  };

  private constructor() {}

  public static getInstance(): LearningManager {
    if (!LearningManager.instance) {
      LearningManager.instance = new LearningManager();
    }
    return LearningManager.instance;
  }

  // 获取今天的学习列表
  async getTodayLearningList() {
    const date = new Date().toISOString().split('T')[0];
    const progress = await this.getAllProgress();
    const hanziService = HanziService.getInstance();
    const allCharacters = hanziService.getHanziList();

    // 获取需要复习的字
    const reviewList = Object.values(progress).filter(item => 
      item.nextReviewDate === date
    );

    // 获取新的字（从未学习过的）
    const learnedChars = new Set(Object.keys(progress));
    const newChars = allCharacters
      .filter(char => !learnedChars.has(char.character))
      .slice(0, this.settings.dailyNewWords);

    return {
      newWords: newChars,
      reviewWords: reviewList
    };
  }

  // 记录学习进度
  async recordProgress(character: string, isCorrect: boolean) {
    const progress = await this.getAllProgress();
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (!progress[character]) {
      // 新字的初始进度
      progress[character] = {
        character,
        lastReviewDate: todayStr,
        nextReviewDate: this.getNextReviewDate(today, 0),
        mistakes: isCorrect ? 0 : 1,
        masteryLevel: 0
      };
    } else {
      // 更新已有字的进度
      const item = progress[character];
      if (isCorrect) {
        item.masteryLevel = Math.min(5, item.masteryLevel + 1);
      } else {
        item.mistakes += 1;
        item.masteryLevel = Math.max(0, item.masteryLevel - 1);
      }
      item.lastReviewDate = todayStr;
      item.nextReviewDate = this.getNextReviewDate(today, item.masteryLevel);
    }

    await this.saveProgress(progress);
  }

  // 获取所有需要复习的字
  async getReviewList() {
    const progress = await this.getAllProgress();
    const today = new Date().toISOString().split('T')[0];
    
    return Object.values(progress).filter(item => 
      item.nextReviewDate <= today
    );
  }

  // 获取错误最多的字
  async getMostMistakenChars(limit: number = 10) {
    const progress = await this.getAllProgress();
    return Object.values(progress)
      .sort((a, b) => b.mistakes - a.mistakes)
      .slice(0, limit);
  }

  // 获取学习统计
  async getStatistics() {
    const progress = await this.getAllProgress();
    const chars = Object.values(progress);
    
    return {
      totalLearned: chars.length,
      mastered: chars.filter(c => c.masteryLevel >= 4).length,
      needReview: chars.filter(c => c.mistakes > 2).length
    };
  }

  private async getAllProgress(): Promise<Record<string, LearningProgress>> {
    try {
      const data = await AsyncStorage.getItem('learningProgress');
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error loading progress:', error);
      return {};
    }
  }

  private async saveProgress(progress: Record<string, LearningProgress>) {
    try {
      await AsyncStorage.setItem('learningProgress', JSON.stringify(progress));
    } catch (error) {
      console.error('Error saving progress:', error);
    }
  }

  private getNextReviewDate(today: Date, masteryLevel: number): string {
    const interval = this.settings.reviewIntervals[masteryLevel] || 1;
    const nextDate = new Date(today);
    nextDate.setDate(nextDate.getDate() + interval);
    return nextDate.toISOString().split('T')[0];
  }
} 