import AsyncStorage from '@react-native-async-storage/async-storage';
import wordFrequencyData from '../data/wordFrequencyData.json';
import { WordFrequencyData, WordIndex, ProcessedData } from '../data/wordFrequencyData';

class WordFrequencyService {
  private static instance: WordFrequencyService;
  private wordData: Map<string, WordFrequencyData> = new Map();
  private characterWordIndex: WordIndex = {};
  private initialized: boolean = false;

  private constructor() {}

  static getInstance(): WordFrequencyService {
    if (!WordFrequencyService.instance) {
      WordFrequencyService.instance = new WordFrequencyService();
    }
    return WordFrequencyService.instance;
  }

  async initialize() {
    if (this.initialized) {
      return;
    }

    try {
      const data = wordFrequencyData as ProcessedData;
      this.wordData = new Map(Object.entries(data.wordData));
      this.characterWordIndex = data.characterWordIndex;
      this.initialized = true;
    } catch (error) {
      throw error;
    }
  }

  async getWordsForCharacter(character: string, limit: number = 10): Promise<string[]> {
    if (!this.initialized) {
      await this.initialize();
    }

    const charIndex = this.characterWordIndex[character];
    if (!charIndex) {
      return [];
    }

    return charIndex.words.slice(0, limit);
  }

  async getWordFrequency(word: string): Promise<number> {
    if (!this.initialized) {
      await this.initialize();
    }

    const wordData = this.wordData.get(word);
    return wordData?.frequency || 0;
  }

  async checkDataStatus(): Promise<{
    isInitialized: boolean;
    wordCount: number;
    characterCount: number;
  }> {
    return {
      isInitialized: this.initialized,
      wordCount: this.wordData.size,
      characterCount: Object.keys(this.characterWordIndex).length
    };
  }
}

export default WordFrequencyService; 