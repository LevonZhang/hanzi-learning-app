import * as Speech from 'expo-speech';
import cnchar from 'cnchar';
import 'cnchar-poly';  // 添加多音字支持
import 'cnchar-order'; // 添加笔顺支持
import 'cnchar-words'; // 添加词组支持
import { pinyin } from 'pinyin-pro';
import WordFrequencyService from './WordFrequencyService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface WordPair {
  word: string;
  characters: string[];
  frequency?: number;
}

export interface PronunciationChar {
  char: string;
}

export interface GameProgress {
  currentLevel: number;
  completedWords: string[];
  score: number;
  isCompleted: boolean;
}

class GameService {
  private wordFrequencyService: WordFrequencyService;
  private initialized: boolean = false;
  private totalWordPairs: WordPair[] = [];
  private gameProgress: GameProgress | null = null;
  private commonChars: string = '一二三十大木人口日月水火山王田目白云立刀分八小土子女又力手工心上下中长门方见日开天明时车金风雨来去年生中国人会行家见说事能地得作对着过没';
  
  constructor() {
    this.wordFrequencyService = WordFrequencyService.getInstance();
    this.initialize();
  }

  private async initialize() {
    if (this.initialized) return;
    
    try {
      await this.wordFrequencyService.initialize();
      await this.loadAllWordPairs();
      this.initialized = true;
    } catch (error) {
      throw error;
    }
  }

  private async loadAllWordPairs() {
    const chars = this.commonChars.split('');
    const allPairs: WordPair[] = [];
    
    for (const char of chars) {
      try {
        const words = await this.wordFrequencyService.getWordsForCharacter(char, 20);
        const twoCharWords = words.filter(word => 
          word.length === 2 && 
          !allPairs.some(p => p.word === word)
        );
        
        for (const word of twoCharWords) {
          const frequency = await this.wordFrequencyService.getWordFrequency(word);
          allPairs.push({
            word,
            characters: word.split(''),
            frequency
          });
        }
      } catch (error) {
        // Silent error handling
      }
    }
    
    this.totalWordPairs = allPairs.sort((a, b) => (b.frequency || 0) - (a.frequency || 0));
  }

  public getTotalLevels(): number {
    const wordsPerLevel = 12; // 每关12个字
    const firstThreeLevelsWords = 3 + 5 + 10; // 前三关的词组总数
    const remainingWords = this.totalWordPairs.length - firstThreeLevelsWords;
    const remainingLevels = Math.ceil(remainingWords / wordsPerLevel);
    return 3 + remainingLevels; // 前三关加上剩余关卡
  }

  public async getWordPairsForLevel(level: number): Promise<WordPair[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    let startIndex = 0;
    if (level <= 3) {
      startIndex = [0, 3, 8][level - 1];
    } else {
      startIndex = 18 + (level - 4) * 12;
    }

    let count = level <= 3 ? [3, 5, 10][level - 1] : 12;

    let availablePairs = this.gameProgress && this.gameProgress.currentLevel === level
      ? this.totalWordPairs.slice(startIndex).filter(pair => !this.gameProgress?.completedWords.includes(pair.word))
      : this.totalWordPairs.slice(startIndex);

    const selectedPairs: WordPair[] = [];
    const usedChars = new Set<string>();

    for (const pair of availablePairs) {
      const [char1, char2] = pair.word.split('');
      if (usedChars.has(char1) || usedChars.has(char2)) {
        continue;
      }
      
      selectedPairs.push(pair);
      usedChars.add(char1);
      usedChars.add(char2);

      if (selectedPairs.length >= count) {
        break;
      }
    }

    if (selectedPairs.length < count) {
      let additionalIndex = startIndex + availablePairs.length;
      
      while (selectedPairs.length < count && additionalIndex < this.totalWordPairs.length) {
        const pair = this.totalWordPairs[additionalIndex];
        const [char1, char2] = pair.word.split('');
        
        if (!usedChars.has(char1) && !usedChars.has(char2)) {
          selectedPairs.push(pair);
          usedChars.add(char1);
          usedChars.add(char2);
        }
        additionalIndex++;
      }
    }

    return selectedPairs;
  }

  public async saveGameProgress(progress: GameProgress, gameType: 'word' | 'pronunciation'): Promise<void> {
    const key = gameType === 'word' ? 'gameProgress' : 'pronunciationGameProgress';
    await AsyncStorage.setItem(key, JSON.stringify({
      ...progress,
      isCompleted: progress.currentLevel > this.getTotalLevels()
    }));
  }

  public async loadGameProgress(gameType: 'word' | 'pronunciation'): Promise<GameProgress | null> {
    try {
      const key = gameType === 'word' ? 'gameProgress' : 'pronunciationGameProgress';
      const savedProgress = await AsyncStorage.getItem(key);
      if (savedProgress) {
        return JSON.parse(savedProgress);
      }
    } catch (error) {
      // Silent error handling
    }
    return null;
  }

  public async resetGame(gameType: 'word' | 'pronunciation'): Promise<void> {
    const key = gameType === 'word' ? 'gameProgress' : 'pronunciationGameProgress';
    const defaultProgress = {
      currentLevel: 1,
      completedWords: [],
      score: 0,
      isCompleted: false
    };
    await AsyncStorage.setItem(key, JSON.stringify(defaultProgress));
  }

  public async updateGameStats(score: number, isCompleted: boolean, gameType: 'word' | 'pronunciation'): Promise<void> {
    try {
      const currentStats = await AsyncStorage.getItem('gameStats');
      let stats = currentStats ? JSON.parse(currentStats) : {
        wordGame: { highScore: 0, gamesPlayed: 0, isCompleted: false },
        pronunciationGame: { highScore: 0, gamesPlayed: 0, isCompleted: false }
      };

      const gameKey = gameType === 'word' ? 'wordGame' : 'pronunciationGame';
      stats[gameKey].gamesPlayed += 1;
      if (score > stats[gameKey].highScore) {
        stats[gameKey].highScore = score;
      }
      stats[gameKey].isCompleted = isCompleted;

      await AsyncStorage.setItem('gameStats', JSON.stringify(stats));
    } catch (error) {
      // Silent error handling
    }
  }

  public getTotalWordPairsCount(): number {
    return this.totalWordPairs.length;
  }

  private getRandomCharsFromCommon(count: number): string[] {
    const chars = this.commonChars.split('');
    const shuffled = [...chars].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  public getPronunciationCharsForLevel(level: number): PronunciationChar[] {
    if (!this.initialized) {
      console.error('GameService initialization error: Service not initialized');
      throw new Error('GameService not initialized');
    }

    try {
      const count = this.getLevelCount(level);
      const chars = this.commonChars.split('').sort(() => Math.random() - 0.5).slice(0, count * 2);
      const usedPronunciations = new Set<string>();
      const result: PronunciationChar[] = [];
      
      for (const char of chars) {
        try {
          const pronunciation = pinyin(char, { toneType: 'none' });
          
          if (!pronunciation || typeof pronunciation !== 'string') {
            console.error(`Invalid pronunciation for character: ${char}`);
            continue;
          }
          
          if (usedPronunciations.has(pronunciation)) {
            continue;
          }
          
          usedPronunciations.add(pronunciation);
          result.push({ char });
          
          if (result.length >= count) {
            break;
          }
        } catch (error) {
          console.error(`Error processing character: ${char}`, error);
        }
      }
      
      if (result.length === 0) {
        console.error('No valid characters found for level');
        throw new Error('No valid characters found for level');
      }
      
      return result;
      
    } catch (error) {
      console.error('Error in getPronunciationCharsForLevel:', error);
      throw error;
    }
  }

  public getLevelCount(level: number): number {
    if (level <= 3) {
      return [3, 5, 10][level - 1];
    }
    return 12; // 第4关之后每关12个字
  }

  public async playCharacterSound(char: string): Promise<void> {
    try {
      await Speech.speak(char, {
        language: 'zh',
        pitch: 1,
        rate: 0.8,
      });
    } catch (error) {
      // Silent error handling
    }
  }

  public async getMatchesForChar(char: string, mode: 'word' | 'pronunciation'): Promise<string[]> {
    if (mode === 'word') {
      // 使用词频服务获取高频词组中的搭配字
      const words = await this.wordFrequencyService.getWordsForCharacter(char, 20);
      const twoCharWords = words.filter(word => word.length === 2);
      
      // 提取搭配字并去重
      return Array.from(new Set(
        twoCharWords.map(word => word.split('').filter(c => c !== char)[0])
      )).filter(Boolean);
    } else {
      return [];
    }
  }

  // 添加检查词频数据状态的方法
  public async checkWordFrequencyData() {
    const status = await this.wordFrequencyService.checkDataStatus();
    return status;
  }
}

const gameServiceInstance = new GameService();
export default gameServiceInstance; 