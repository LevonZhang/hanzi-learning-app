export interface Character {
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
    hskLevel?: number;
    hskOrder?: number;
}

export interface LearningProgress {
    character: string;
    nextReviewDate: string;
    reviewCount: number;
    lastReviewDate: string;
    reviewIntervals: number[];
    mistakes: number;
    masteryLevel: number;  // 0-5, indicating mastery level
}

export interface LearningSettings {
    dailyNewWords: number;
    reviewIntervals: number[];
}

export interface ReviewResult {
    character: string;
    result: 'good' | 'again';
    reviewDate: string;
}

export interface HanziDictEntry {
    pinyin: string[];
    english: string[];
    chinese: string[];
} 