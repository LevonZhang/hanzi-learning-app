import { hskCharacterOrder, HSKCharacterInfo } from '../data/hskOrder';
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

// 获取下一个未学习的字符（包括HSK和非HSK字符）
export function getNextUnlearnedHSKCharacters(
  learnedCharacters: Set<string>,
  count: number,
  allCharacters: Character[]
): (HSKCharacterInfo & Partial<Character>)[] {
  
  // 首先获取所有未学习的HSK字符，保持原有顺序
  const unlearnedHSKCharacters = hskCharacterOrder.filter(
    char => !learnedCharacters.has(char.character)
  );

  
  // 如果HSK字符足够，直接返回前count个
  if (unlearnedHSKCharacters.length >= count) {
    const result = unlearnedHSKCharacters.slice(0, count);
    return result;
  }
  
  // 如果HSK字符不够，需要从非HSK字符中补充
  const hskResult = unlearnedHSKCharacters;
  const remainingCount = count - hskResult.length;
    
  if (remainingCount > 0) {
    // 获取所有HSK字符的集合
    const hskCharSet = new Set(hskCharacterOrder.map(char => char.character));
    
    // 获取非HSK字符，并按笔画数和使用频率排序
    const nonHSKCharacters = allCharacters
      .filter(char => 
        !hskCharSet.has(char.character) && 
        !learnedCharacters.has(char.character)
      )
      .sort((a, b) => {
        // 1. 首先按笔画数排序
        const strokeDiff = a.strokes - b.strokes;
        if (strokeDiff !== 0) {
          return strokeDiff;
        }
        
        // 2. 如果笔画数相同，按常用字排序
        if (a.isCommon !== b.isCommon) {
          return a.isCommon ? -1 : 1;
        }
        
        // 3. 如果都是常用字，按使用频率排序
        if (a.isCommon && b.isCommon) {
          return a.commonIndex - b.commonIndex;
        }
        
        return 0;
      })
      .slice(0, remainingCount)
      .map(char => ({
        level: 999, // 表示非HSK字符
        order: Number.MAX_SAFE_INTEGER, // 放在HSK字符之后
        ...char
      }));
    
    // 合并HSK和非HSK字符
    const result = [...hskResult, ...nonHSKCharacters];
    return result;
  }
  return hskResult;
}

// 获取字符的HSK等级和顺序信息
export function getHSKCharacterInfo(character: string): HSKCharacterInfo | undefined {
  return hskCharacterOrder.find(info => info.character === character);
}

// 获取某个HSK等级的所有字符
export function getHSKCharactersByLevel(level: number): HSKCharacterInfo[] {
  return hskCharacterOrder.filter(info => info.level === level);
}

// 获取学习进度统计（按HSK等级）
export function getHSKLearningProgress(learnedCharacters: Set<string>): {
  [level: number]: { total: number; learned: number }
} {
  const progress: { [level: number]: { total: number; learned: number } } = {};
  
  // 初始化每个等级的统计
  const maxLevel = Math.max(...hskCharacterOrder.map(char => char.level));
  for (let i = 1; i <= maxLevel; i++) {
    progress[i] = { total: 0, learned: 0 };
  }
  
  // 统计每个等级的字符总数和已学习数量
  hskCharacterOrder.forEach(char => {
    progress[char.level].total++;
    if (learnedCharacters.has(char.character)) {
      progress[char.level].learned++;
    }
  });
  
  return progress;
}

// 判断一个字符是否在HSK表中
export function isHSKCharacter(character: string): boolean {
  return hskCharacterOrder.some(char => char.character === character);
}

// 获取所有HSK字符
export function getAllHSKCharacters(): Set<string> {
  return new Set(hskCharacterOrder.map(char => char.character));
} 