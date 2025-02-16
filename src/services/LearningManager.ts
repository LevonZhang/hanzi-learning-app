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

interface Character {
  character: string;
  pinyin: string[];
  meanings: {
    zh: string[];
    en: string[];
    ja: string[];
  };
}

export class LearningManager {
  private static instance: LearningManager;
  private settings: LearningSettings = {
    dailyNewWords: 5,
    reviewIntervals: [1, 3, 7, 14, 30]
  };
  private reviewWords: Set<string> = new Set();
  private learningProgress: Map<string, { correct: number; total: number }> = new Map();

  private constructor() {}

  public static getInstance(): LearningManager {
    if (!LearningManager.instance) {
      LearningManager.instance = new LearningManager();
    }
    return LearningManager.instance;
  }

  // 重置今天的学习列表
  async resetTodayLearning() {
    try {
      // 清除今天的学习记录
      await AsyncStorage.removeItem('todayLearningList');
      // 重置当前学习进度
      const progress = await this.getAllProgress();
      const today = new Date().toISOString().split('T')[0];
      
      // 只保留需要复习的字的进度
      const updatedProgress = Object.entries(progress).reduce((acc, [char, data]) => {
        if (data.nextReviewDate === today) {
          acc[char] = data;
        }
        return acc;
      }, {} as Record<string, LearningProgress>);
      
      await this.saveProgress(updatedProgress);
    } catch (error) {
      console.error('Error resetting today learning:', error);
    }
  }

  // 获取今天的学习列表
  async getTodayLearningList() {
    const date = new Date().toISOString().split('T')[0];
    const progress = await this.getAllProgress();
    const hanziService = HanziService.getInstance();
    const allCharacters = await hanziService.getHanziListWithDetails();
    
    // 获取需要复习的字的完整信息
    const reviewList = Object.values(progress)
      .filter(item => item.nextReviewDate === date)
      .map(item => allCharacters.find(c => c.character === item.character))
      .filter(Boolean) as Character[];

    // 获取已学习的字符集
    const learnedChars = new Set(Object.keys(progress));
    
    // 从未学习的字符中随机选择新的字符
    const availableChars = allCharacters.filter(char => !learnedChars.has(char.character));
    const shuffledChars = [...availableChars].sort(() => Math.random() - 0.5);
    const newChars = shuffledChars.slice(0, this.settings.dailyNewWords);

    return {
      newWords: newChars,
      reviewWords: reviewList
    };
  }

  // 获取所有学习进度
  public async getAllProgress(): Promise<Record<string, LearningProgress>> {
    try {
      const data = await AsyncStorage.getItem('learningProgress');
      return data ? JSON.parse(data) : {};
    } catch (error) {
      console.error('Error loading progress:', error);
      return {};
    }
  }

  // 获取需要复习的字
  public async getReviewWords(): Promise<string[]> {
    const progress = await this.getAllProgress();
    return Object.values(progress)
      .filter(item => item.mistakes > 0)
      .map(item => item.character);
  }

  // 记录学习进度
  public async recordProgress(character: string, isCorrect: boolean) {
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
        // 如果完全掌握了，清除错误记录
        if (item.masteryLevel === 5) {
          item.mistakes = 0;
        }
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
  public async getStatistics() {
    const progress = await this.getAllProgress();
    const chars = Object.values(progress);
    
    return {
      totalLearned: chars.length,
      mastered: chars.filter(c => c.masteryLevel >= 4).length,
      needReview: chars.filter(c => c.mistakes > 0).length
    };
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

  // 从错字本中删除
  public async removeFromReview(character: string): Promise<void> {
    try {
      const progress = await this.getAllProgress();
      if (progress[character]) {
        delete progress[character]; // 完全删除这个字的记录
        await this.saveProgress(progress);
      }
    } catch (error) {
      console.error('Error removing from review:', error);
      throw error;
    }
  }
} 