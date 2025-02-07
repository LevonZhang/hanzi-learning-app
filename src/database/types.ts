interface HanziData {
  character: string;
  pinyin: string[];
  meanings: {
    en: string[];
    ja: string[];
  };
  strokes: number;
  hskLevel: number;
} 