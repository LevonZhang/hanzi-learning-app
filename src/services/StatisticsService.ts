import AsyncStorage from '@react-native-async-storage/async-storage';

interface LearningStats {
  totalCharacters: number;
  masteredCharacters: number;
  totalLearningTime: number;
  weeklyProgress: number[];
  monthlyProgress: number[];
  lastUpdated: string;
}

interface GameStats {
  wordGame: {
    highScore: number;
    gamesPlayed: number;
  };
  pronunciationGame: {
    highScore: number;
    gamesPlayed: number;
  };
}

class StatisticsService {
  private static instance: StatisticsService;
  private learningStartTime: number | null = null;

  private constructor() {}

  static getInstance(): StatisticsService {
    if (!StatisticsService.instance) {
      StatisticsService.instance = new StatisticsService();
    }
    return StatisticsService.instance;
  }

  // 开始记录学习时间
  startLearningSession() {
    this.learningStartTime = Date.now();
  }

  // 结束学习时间并更新统计
  async endLearningSession() {
    if (!this.learningStartTime) return;

    const learningTime = Math.floor((Date.now() - this.learningStartTime) / 60000); // 转换为分钟
    this.learningStartTime = null;

    const stats = await this.getLearningStats();
    stats.totalLearningTime += learningTime;
    await this.updateLearningStats(stats);
  }

  // 记录新学习的汉字
  async recordLearnedCharacter(character: string, isMastered: boolean = false) {
    const stats = await this.getLearningStats();
    const progress = await AsyncStorage.getItem('learningProgress');
    const learningProgress = progress ? JSON.parse(progress) : {};
    
    // 只有在字符是第一次学习时才增加总数
    if (!learningProgress[character]) {
      stats.totalCharacters += 1;
    }
    
    if (isMastered) {
      stats.masteredCharacters += 1;
    }

    // 更新每周和每月进度
    const today = new Date();
    const weekDay = today.getDay();
    const monthDay = today.getDate() - 1;

    if (stats.weeklyProgress.length !== 7) {
      stats.weeklyProgress = new Array(7).fill(0);
    }
    if (stats.monthlyProgress.length !== 31) {
      stats.monthlyProgress = new Array(31).fill(0);
    }

    stats.weeklyProgress[weekDay] += 1;
    stats.monthlyProgress[monthDay] += 1;

    await this.updateLearningStats(stats);
  }

  // 更新游戏分数
  async updateGameScore(game: 'wordGame' | 'pronunciationGame', score: number) {
    const stats = await this.getGameStats();
    const gameStats = stats[game];

    gameStats.gamesPlayed += 1;
    if (score > gameStats.highScore) {
      gameStats.highScore = score;
    }

    await AsyncStorage.setItem('gameStats', JSON.stringify(stats));
  }

  // 获取学习统计数据
  private async getLearningStats(): Promise<LearningStats> {
    const statsStr = await AsyncStorage.getItem('learningStats');
    if (statsStr) {
      return JSON.parse(statsStr);
    }
    return {
      totalCharacters: 0,
      masteredCharacters: 0,
      totalLearningTime: 0,
      weeklyProgress: new Array(7).fill(0),
      monthlyProgress: new Array(31).fill(0),
      lastUpdated: new Date().toISOString(),
    };
  }

  // 获取游戏统计数据
  public async getGameStatistics(): Promise<GameStats> {
    const statsStr = await AsyncStorage.getItem('gameStats');
    if (statsStr) {
      return JSON.parse(statsStr);
    }
    return {
      wordGame: {
        highScore: 0,
        gamesPlayed: 0,
      },
      pronunciationGame: {
        highScore: 0,
        gamesPlayed: 0,
      },
    };
  }

  // 更新学习统计数据
  private async updateLearningStats(stats: LearningStats) {
    stats.lastUpdated = new Date().toISOString();
    await AsyncStorage.setItem('learningStats', JSON.stringify(stats));
  }

  // 重置统计数据
  async resetStats() {
    await AsyncStorage.removeItem('learningStats');
    await AsyncStorage.removeItem('gameStats');
  }
}

export default StatisticsService.getInstance(); 