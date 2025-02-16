
export interface WordFrequencyData {
  word: string;
  frequency: number;
  pinyin: string[];
  characters: string[];
}

export interface WordIndex {
  [character: string]: {
    words: string[];
    frequencies: number[];
  };
}

export interface ProcessedData {
  wordData: { [word: string]: WordFrequencyData };
  characterWordIndex: WordIndex;
}

declare const data: ProcessedData;
export default data;
