import AsyncStorage from '@react-native-async-storage/async-storage';
import HanziService from './HanziService';
import { logger } from '../utils/logger';
import { getNextUnlearnedHSKCharacters } from '../utils/hskUtils';

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
  isCommon: boolean;
  commonIndex: number;
  strokes: number;
}

export class LearningManager {
  private static instance: LearningManager;
  private settings: LearningSettings = {
    dailyNewWords: 5,
    reviewIntervals: [1, 3, 7, 14, 30]
  };
  private reviewWords: Set<string> = new Set();
  private learningProgress: Map<string, { correct: number; total: number }> = new Map();
  private isInitialized: boolean = false;

  private constructor() {}

  public static getInstance(): LearningManager {
    if (!LearningManager.instance) {
      LearningManager.instance = new LearningManager();
    }
    return LearningManager.instance;
  }

  private async initialize() {
    if (this.isInitialized) return;
    
    try {
      // 直接从存储中读取数据
      const data = await AsyncStorage.getItem('learningProgress');
      if (!data) {
        // 如果没有数据，尝试从备份恢复
        const backup = await AsyncStorage.getItem('learningProgress_backup');
        if (backup) {
          await AsyncStorage.setItem('learningProgress', backup);
        }
      } else {
        // 验证数据格式是否正确
        try {
          const parsedData = JSON.parse(data);
          if (typeof parsedData !== 'object' || parsedData === null) {
            // 数据格式不正确，尝试从备份恢复
            const backup = await AsyncStorage.getItem('learningProgress_backup');
            if (backup) {
              await AsyncStorage.setItem('learningProgress', backup);
            }
          }
        } catch (parseError) {
          console.error('[LearningManager] 数据格式错误:', parseError);
          // 数据解析失败，尝试从备份恢复
          const backup = await AsyncStorage.getItem('learningProgress_backup');
          if (backup) {
            await AsyncStorage.setItem('learningProgress', backup);
          }
        }
      }
      
      this.isInitialized = true;
    } catch (error) {
      console.error('[LearningManager] 初始化失败:', error);
    }
  }

  // 重置今天的学习列表
  async resetTodayLearning() {
    try {
      // 只清除今天的学习记录
      await AsyncStorage.removeItem('todayLearningList');
    } catch (error) {
      console.error('Error resetting today learning:', error);
    }
  }

  // 获取今天的学习列表
  async getTodayLearningList() {
    const date = new Date().toISOString().split('T')[0];
    
    // 获取今天已学习的字数
    const todayLearned = await this.getTodayLearnedCount();
    
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
    
    // 计算还需要学习的新字数量
    const remainingNewWords = Math.max(0, this.settings.dailyNewWords - todayLearned);
    
    // 使用HSK工具获取下一批要学习的字符（包括非HSK字符）
    const nextChars = getNextUnlearnedHSKCharacters(learnedChars, remainingNewWords, allCharacters);
    
    // 从所有汉字中找到对应的完整信息
    const newChars = nextChars
      .map(hskChar => {
        // 如果是非HSK字符，已经包含了完整信息
        if (hskChar.level === 999) {
          return hskChar as Character;
        }
        // 如果是HSK字符，需要查找完整信息
        return allCharacters.find(c => c.character === hskChar.character);
      })
      .filter(Boolean) as Character[];

    return {
      newWords: newChars,
      reviewWords: reviewList
    };
  }

  // 获取所有学习进度
  public async getAllProgress(): Promise<Record<string, LearningProgress>> {
    if (!this.isInitialized) {
      await this.initialize();
    }
    
    try {
      const data = await AsyncStorage.getItem('learningProgress');
      
      if (!data) {
        return {};
      }
      
      try {
        const parsedData = JSON.parse(data);
        if (typeof parsedData === 'object' && parsedData !== null) {
          // 验证并修正数据
          const validatedData: Record<string, LearningProgress> = {};
          for (const [char, data] of Object.entries(parsedData)) {
            // 跳过空字符或无效字符
            if (!char || char.trim() === '') {
              continue;
            }
            if (typeof data === 'object' && data !== null) {
              const progressData = data as Partial<LearningProgress>;
              validatedData[char] = {
                character: char,
                lastReviewDate: progressData.lastReviewDate || new Date().toISOString().split('T')[0],
                nextReviewDate: progressData.nextReviewDate || this.getNextReviewDate(new Date(), progressData.masteryLevel || 1),
                mistakes: typeof progressData.mistakes === 'number' ? progressData.mistakes : 0,
                masteryLevel: typeof progressData.masteryLevel === 'number' && progressData.masteryLevel >= 0 && progressData.masteryLevel <= 2 
                  ? progressData.masteryLevel 
                  : 1
              };
            }
          }
          
          return validatedData;
        }
        return {};
      } catch (parseError) {
        return {};
      }
    } catch (error) {
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
  async handleCharacterLearned(character: string, isCorrect: boolean): Promise<void> {
    try {
      await this.recordProgress(character, isCorrect);
    } catch (error) {
    }
  }

  async recordProgress(character: string, isCorrect: boolean, forceAddToReview: boolean = false): Promise<void> {
    try {
      const progress = await this.getAllProgress();
      
      if (!progress[character]) {
        // 新字符，初始化进度
        const initialProgress = {
          character,
          lastReviewDate: new Date().toISOString().split('T')[0],
          masteryLevel: isCorrect ? 2 : 1, // 如果回答正确，设置为掌握状态(2)，否则设置为已学习状态(1)
          mistakes: forceAddToReview ? 1 : 0,
          nextReviewDate: this.getNextReviewDate(new Date(), isCorrect ? 2 : 1)
        };
        progress[character] = initialProgress;
      } else {
        // 更新现有进度
        const item = progress[character];
        const oldMasteryLevel = item.masteryLevel;
        item.lastReviewDate = new Date().toISOString().split('T')[0];
        
        // 更新掌握等级
        if (isCorrect) {
          item.masteryLevel = 2; // 练习正确，设置为已掌握状态
        } else if (!item.masteryLevel || item.masteryLevel < 1) {
          item.masteryLevel = 1; // 确保至少是已学习状态
        }
        
        if (forceAddToReview) {
          item.mistakes += 1;
        }
        
        item.nextReviewDate = this.getNextReviewDate(new Date(), item.masteryLevel);
      }

      await this.saveProgress(progress);
    } catch (error) {
      logger.error('记录学习进度失败:', error);
    }
  }

  // 初始化一个字符的学习记录，标记为"已学习但未掌握"
  async initCharacterLearning(character: string): Promise<void> {
    try {
      const progress = await this.getAllProgress();
      
      // 只有当字符不在进度记录中，或者掌握等级未设置时才初始化
      if (!progress[character] || progress[character].masteryLevel === undefined) {
        const initialProgress = {
          character,
          lastReviewDate: new Date().toISOString().split('T')[0],
          masteryLevel: 1,  // 设置掌握度为1表示"已学习但未掌握"
          mistakes: 0,
          nextReviewDate: this.getNextReviewDate(new Date(), 1)
        };
        progress[character] = initialProgress;
        await this.saveProgress(progress);
      }
    } catch (error) {
      logger.error('初始化字符学习记录失败:', error);
    }
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
      .filter(item => item.mistakes > 0)
      .sort((a, b) => b.mistakes - a.mistakes)
      .slice(0, limit);
  }

  // 获取学习统计
  public async getStatistics() {
    const progress = await this.getAllProgress();
    const chars = Object.values(progress);
    
    return {
      totalLearned: chars.length,
      mastered: chars.filter(c => c.masteryLevel >= 2).length,
      needReview: chars.filter(c => c.mistakes > 0).length
    };
  }

  private async saveProgress(progress: Record<string, LearningProgress>) {
    try {
      // 验证数据完整性
      if (!progress || typeof progress !== 'object') {
        throw new Error('无效的进度数据');
      }
      
      // 过滤掉无效字符
      const filteredProgress: Record<string, LearningProgress> = {};
      // 验证并修正数据
      for (const [char, data] of Object.entries(progress)) {
        // 跳过空字符或无效字符
        if (!char || char.trim() === '') {
          continue;
        }
        // 确保 masteryLevel 在有效范围内
        if (typeof data.masteryLevel !== 'number' || data.masteryLevel < 0 || data.masteryLevel > 2) {
          data.masteryLevel = 1; // 默认设置为已学习状态
        }
        
        // 确保其他必要字段存在且类型正确
        if (!data.lastReviewDate || typeof data.lastReviewDate !== 'string') {
          data.lastReviewDate = new Date().toISOString().split('T')[0];
        }
        if (!data.nextReviewDate || typeof data.nextReviewDate !== 'string') {
          data.nextReviewDate = this.getNextReviewDate(new Date(), data.masteryLevel);
        }
        if (typeof data.mistakes !== 'number') {
          data.mistakes = 0;
        }
      }
      
      const progressJson = JSON.stringify(progress);
      
      // 先保存备份
      await AsyncStorage.setItem('learningProgress_backup', progressJson);
      
      // 然后保存主数据
      await AsyncStorage.setItem('learningProgress', progressJson);
      
      // 验证保存是否成功
      const savedData = await AsyncStorage.getItem('learningProgress');
      if (savedData !== progressJson) {
        throw new Error('数据保存验证失败');
      }
    } catch (error) {
      logger.error('保存进度失败:', error);
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
      logger.error('从错字本删除失败:', error);
    }
  }

  // 重置所有学习进度
  public async resetAllProgress(): Promise<void> {
    try {
      // 清除存储的学习进度
      await AsyncStorage.removeItem('learningProgress');
      await AsyncStorage.removeItem('learningProgress_backup');
      await AsyncStorage.removeItem('todayLearningList');
      this.reviewWords.clear();
      this.learningProgress.clear();
    } catch (error) {
      logger.error('重置进度失败:', error);
    }
  }

  // 获取今天已学习的字数
  public async getTodayLearnedCount(): Promise<number> {
    try {
      const progress = await this.getAllProgress();
      const today = new Date().toISOString().split('T')[0];
      
      // 计算今天学习的字数
      return Object.values(progress).filter(item => 
        item.lastReviewDate === today
      ).length;
    } catch (error) {
      logger.error('获取今日学习数量失败:', error);
      return 0;
    }
  }

  // 获取更多字符学习
  public async getMoreCharactersToLearn(count: number = 5): Promise<Character[]> {
    try {
      const progress = await this.getAllProgress();
      const hanziService = HanziService.getInstance();
      const allCharacters = await hanziService.getHanziListWithDetails();
      
      // 获取已学习的字符集
      const learnedChars = new Set(Object.keys(progress));
      
      // 使用HSK工具获取下一批要学习的字符（包括非HSK字符）
      const nextChars = getNextUnlearnedHSKCharacters(learnedChars, count, allCharacters);
      
      // 从所有汉字中找到对应的完整信息
      return nextChars
        .map(hskChar => {
          // 如果是非HSK字符，已经包含了完整信息
          if (hskChar.level === 999) {
            return hskChar as Character;
          }
          // 如果是HSK字符，需要查找完整信息
          return allCharacters.find(c => c.character === hskChar.character);
        })
        .filter(Boolean) as Character[];
    } catch (error) {
      logger.error('获取更多学习字符失败:', error);
      return [];
    }
  }

  // Add getter and setter for settings
  public getSettings(): LearningSettings {
    return { ...this.settings };
  }

  public updateSettings(newSettings: Partial<LearningSettings>): void {
    this.settings = {
      ...this.settings,
      ...newSettings
    };
  }
} 