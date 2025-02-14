import AsyncStorage from '@react-native-async-storage/async-storage';

interface GameScore {
  score: number;
  date: string;
}

interface LearningRecord {
  char: string;
  date: string;
}

class StorageService {
  private static readonly WORD_GAME_SCORE_KEY = 'wordGameHighScore';
  private static readonly PRONUNCIATION_GAME_SCORE_KEY = 'pronunciationGameHighScore';
  private static readonly LEARNING_RECORDS_KEY = 'learningRecords';

  // 保存游戏分数
  async saveGameScore(gameType: 'word' | 'pronunciation', score: number): Promise<boolean> {
    try {
      const key = gameType === 'word' ? 
        StorageService.WORD_GAME_SCORE_KEY : 
        StorageService.PRONUNCIATION_GAME_SCORE_KEY;
      
      const currentHighScore = await this.getGameHighScore(gameType);
      if (score > currentHighScore) {
        const gameScore: GameScore = {
          score,
          date: new Date().toISOString()
        };
        await AsyncStorage.setItem(key, JSON.stringify(gameScore));
        return true;
      }
      return false;
    } catch (error) {
      console.error('保存游戏分数失败:', error);
      return false;
    }
  }

  // 获取游戏最高分
  async getGameHighScore(gameType: 'word' | 'pronunciation'): Promise<number> {
    try {
      const key = gameType === 'word' ? 
        StorageService.WORD_GAME_SCORE_KEY : 
        StorageService.PRONUNCIATION_GAME_SCORE_KEY;
      
      const scoreData = await AsyncStorage.getItem(key);
      if (scoreData) {
        const gameScore: GameScore = JSON.parse(scoreData);
        return gameScore.score;
      }
      return 0;
    } catch (error) {
      console.error('获取游戏最高分失败:', error);
      return 0;
    }
  }

  // 记录学习的汉字
  async recordLearnedCharacter(char: string): Promise<void> {
    try {
      const records = await this.getLearningRecords();
      if (!records.some(record => record.char === char)) {
        records.push({
          char,
          date: new Date().toISOString()
        });
        await AsyncStorage.setItem(StorageService.LEARNING_RECORDS_KEY, JSON.stringify(records));
      }
    } catch (error) {
      console.error('记录学习汉字失败:', error);
    }
  }

  // 获取所有学习记录
  async getLearningRecords(): Promise<LearningRecord[]> {
    try {
      const records = await AsyncStorage.getItem(StorageService.LEARNING_RECORDS_KEY);
      return records ? JSON.parse(records) : [];
    } catch (error) {
      console.error('获取学习记录失败:', error);
      return [];
    }
  }

  // 获取特定时间范围内的学习记录
  async getLearningRecordsByRange(range: 'week' | 'month' | 'year' | 'all'): Promise<LearningRecord[]> {
    try {
      const records = await this.getLearningRecords();
      const now = new Date();
      
      return records.filter(record => {
        const recordDate = new Date(record.date);
        switch (range) {
          case 'week':
            const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
            return recordDate >= weekAgo;
          case 'month':
            const monthAgo = new Date(now.getFullYear(), now.getMonth() - 1, now.getDate());
            return recordDate >= monthAgo;
          case 'year':
            const yearAgo = new Date(now.getFullYear() - 1, now.getMonth(), now.getDate());
            return recordDate >= yearAgo;
          default:
            return true;
        }
      });
    } catch (error) {
      console.error('获取时间范围内的学习记录失败:', error);
      return [];
    }
  }

  // 获取学习统计数据
  async getLearningStats(): Promise<{
    total: number;
    week: number;
    month: number;
    year: number;
  }> {
    try {
      const [weekRecords, monthRecords, yearRecords, allRecords] = await Promise.all([
        this.getLearningRecordsByRange('week'),
        this.getLearningRecordsByRange('month'),
        this.getLearningRecordsByRange('year'),
        this.getLearningRecordsByRange('all'),
      ]);

      return {
        total: allRecords.length,
        week: weekRecords.length,
        month: monthRecords.length,
        year: yearRecords.length,
      };
    } catch (error) {
      console.error('获取学习统计数据失败:', error);
      return {
        total: 0,
        week: 0,
        month: 0,
        year: 0,
      };
    }
  }
}

export const storageService = new StorageService(); 