export interface Character {
  id: number;
  hanzi: string;
  pinyin: string[];
  meanings_en: string[];
  meanings_ja: string[];
  strokes: number;
  difficulty: number;  // 1-10 表示难度
  hsk_level: number;
}

export interface UserProgress {
  id: number;
  character_id: number;
  learned_date: string;
  review_count: number;
  mistake_count: number;
  mastery_level: number;  // 0-100 表示掌握程度
}

export interface GameScore {
  id: number;
  game_type: 'balloon' | 'matching';
  score: number;
  date: string;
}

export interface LearningSettings {
  daily_new_words: number;
  review_interval: number[];  // [1, 3, 7, 14, 30] 复习间隔天数
} 