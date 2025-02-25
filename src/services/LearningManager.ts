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
    
    // 从未学习的字符中选择新的字符，按难易程度排序
    const availableChars = allCharacters
      .filter(char => !learnedChars.has(char.character))
      .sort((a, b) => {
        // 1. 首先按常用字排序（常用字优先）
        if (a.isCommon !== b.isCommon) {
          return a.isCommon ? -1 : 1;
        }

        // 2. 在常用字中，按笔画数排序（笔画少的优先）
        const strokeDiff = a.strokes - b.strokes;
        if (strokeDiff !== 0) {
          return strokeDiff;
        }

        // 3. 如果笔画数相同，按使用频率排序
        if (a.isCommon && b.isCommon) {
          return a.commonIndex - b.commonIndex;
        }

        // 4. 如果都不是常用字，保持随机顺序
        return Math.random() - 0.5;
      });
    
    const newChars = availableChars.slice(0, this.settings.dailyNewWords);

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
      if (!data) return {};
      
      try {
        const parsedData = JSON.parse(data);
        if (typeof parsedData === 'object' && parsedData !== null) {
          return parsedData;
        }
        return {};
      } catch (parseError) {
        console.error('[LearningManager] 解析学习进度数据失败:', parseError);
        return {};
      }
    } catch (error) {
      console.error('[LearningManager] 获取学习进度失败:', error);
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
    console.log('[LearningManager.recordProgress] Start -', { character, isCorrect });
    const progress = await this.getAllProgress();
    console.log('[LearningManager.recordProgress] Current progress for character:', progress[character]);
    
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    if (!progress[character]) {
      // 新字的初始进度，设置为已学习状态（等级1）
      console.log('[LearningManager.recordProgress] New character, initializing progress');
      progress[character] = {
        character,
        lastReviewDate: todayStr,
        nextReviewDate: this.getNextReviewDate(today, 0),
        mistakes: 0,
        masteryLevel: 1  // 已学习状态
      };
      console.log('[LearningManager.recordProgress] Initial progress:', progress[character]);
    } else {
      // 更新已有字的进度
      console.log('[LearningManager.recordProgress] Updating existing character progress');
      const item = progress[character];
      
      // 只有在写对了的情况下才更新掌握状态
      if (isCorrect) {
        // 写对了设置为已掌握（等级2）
        console.log('[LearningManager.recordProgress] Character written correctly, setting mastery level to 2');
        item.masteryLevel = 2;
        item.mistakes = 0;
      }
      // 如果写错了或者只是记录学习，保持当前状态不变
      
      item.lastReviewDate = todayStr;
      item.nextReviewDate = this.getNextReviewDate(today, item.masteryLevel);
      console.log('[LearningManager.recordProgress] Updated progress:', item);
    }

    await this.saveProgress(progress);
    console.log('[LearningManager.recordProgress] Progress saved successfully');
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
      mastered: chars.filter(c => c.masteryLevel === 2).length,
      needReview: chars.filter(c => c.mistakes > 0).length
    };
  }

  private async saveProgress(progress: Record<string, LearningProgress>) {
    try {
      console.log('[LearningManager.saveProgress] 正在保存进度');
      
      // 验证数据完整性
      if (!progress || typeof progress !== 'object') {
        throw new Error('无效的进度数据');
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
      
      console.log('[LearningManager.saveProgress] 进度保存成功');
    } catch (error) {
      console.error('[LearningManager.saveProgress] 保存进度失败:', error);
      throw error;
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

  // 重置所有学习进度
  public async resetAllProgress(): Promise<void> {
    try {
      console.log('[LearningManager.resetAllProgress] Resetting all learning progress');
      await AsyncStorage.removeItem('learningProgress');
      await AsyncStorage.removeItem('todayLearningList');
      this.reviewWords.clear();
      this.learningProgress.clear();
      console.log('[LearningManager.resetAllProgress] Successfully reset all progress');
    } catch (error) {
      console.error('[LearningManager.resetAllProgress] Error resetting progress:', error);
      throw error;
    }
  }

  // 获取今天已学习的字数
  public async getTodayLearnedCount(): Promise<number> {
    try {
      const progress = await this.getAllProgress();
      const today = new Date().toISOString().split('T')[0];
      
      // 计算今天学习的字数
      const todayLearned = Object.values(progress).filter(item => 
        item.lastReviewDate === today
      ).length;

      console.log('[LearningManager.getTodayLearnedCount]', {
        date: today,
        count: todayLearned
      });

      return todayLearned;
    } catch (error) {
      console.error('[LearningManager.getTodayLearnedCount] Error:', error);
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
      
      // 从未学习的字符中选择新的字符，按难易程度排序
      const availableChars = allCharacters
        .filter(char => !learnedChars.has(char.character))
        .sort((a, b) => {
          // 1. 首先按常用字排序（常用字优先）
          if (a.isCommon !== b.isCommon) {
            return a.isCommon ? -1 : 1;
          }

          // 2. 在常用字中，按笔画数排序（笔画少的优先）
          const strokeDiff = a.strokes - b.strokes;
          if (strokeDiff !== 0) {
            return strokeDiff;
          }

          // 3. 如果笔画数相同，按使用频率排序
          if (a.isCommon && b.isCommon) {
            return a.commonIndex - b.commonIndex;
          }

          // 4. 如果都不是常用字，保持随机顺序
          return Math.random() - 0.5;
        });
      
      // 返回指定数量的新字符
      return availableChars.slice(0, count);
    } catch (error) {
      console.error('[LearningManager.getMoreCharactersToLearn] Error:', error);
      return [];
    }
  }
} 