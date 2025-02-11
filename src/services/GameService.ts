import * as Speech from 'expo-speech';
import cnchar from 'cnchar';
import 'cnchar-words';  // 导入词组模块
import 'cnchar-poly';   // 导入多音字模块

export interface WordPair {
  word: string;
  characters: string[];
}

export interface PronunciationChar {
  char: string;
  pronunciation: string;
  samePronounciation?: string[];
}

class GameService {
  // 常用汉字列表
  private commonChars = '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感见明问力理尔点文几定本公特做外孩相西果走将月十实向声车全信重三机工物气每并别真打太新比才便夫再书部水像眼等体却加电主界门利海受听表德少克代员许稜先口由死安写性马光白或住难望教命花结乐色更拉东神记处让母父应直字场平报友关放至张认接告入笑内英军候民岁往何度山觉路带万男边风解叫任金快原吃妈变通师立象数四失满战远格士音轻目条呢病始达深完今提求清王化空业思切怎非找片罗钱紶吗语元喜整荣波判属近层片维律改群众必始则总感察环决投达持换区乐够存究程运待青续连速争术';

  private getRandomCharsFromCommon(count: number): string[] {
    const chars = this.commonChars.split('');
    const shuffled = [...chars].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
  }

  public getWordPairsForLevel(level: number): WordPair[] {
    const count = this.getLevelCount(level);
    const chars = this.getRandomCharsFromCommon(count);
    
    return chars.map(char => {
      // 获取包含该字的常用词组（限制长度为2的词组）
      const words = cnchar.words(char).filter(word => word.length === 2);
      if (words.length === 0) {
        console.log('No words found for char:', char);
      }
      const word = words[Math.floor(Math.random() * words.length)] || '';
      
      return {
        word,
        characters: word.split('')
      };
    }).filter(pair => pair.word !== ''); // 过滤掉没有找到合适词组的情况
  }

  public getPronunciationCharsForLevel(level: number): PronunciationChar[] {
    const count = this.getLevelCount(level);
    const chars = this.getRandomCharsFromCommon(count);
    
    return chars.map(char => {
      const pronunciation = cnchar.pinyin(char)[0]; // 获取拼音
      if (!pronunciation) {
        console.log('No pronunciation found for char:', char);
      }
      const samePronounciation = this.findSamePronunciationChars(char, pronunciation);
      
      return {
        char,
        pronunciation: pronunciation || '',
        samePronounciation
      };
    }).filter(char => char.pronunciation && char.samePronounciation.length > 0); // 过滤掉没有找到发音或同音字的情况
  }

  private findSamePronunciationChars(char: string, targetPinyin: string): string[] {
    if (!targetPinyin) return [];
    // 从常用字中找出发音相同的字
    return this.commonChars
      .split('')
      .filter(c => {
        const pinyin = cnchar.pinyin(c)[0];
        return c !== char && pinyin === targetPinyin;
      })
      .slice(0, 3); // 限制数量，避免太多
  }

  private getLevelCount(level: number): number {
    const counts = {
      1: 3,
      2: 5,
      3: 10,
      4: 15,
      5: 18,
    };
    return counts[level as keyof typeof counts];
  }

  public async playCharacterSound(char: string): Promise<void> {
    try {
      await Speech.speak(char, {
        language: 'zh',
        pitch: 1,
        rate: 0.8,
      });
    } catch (error) {
      console.error('播放失败:', error);
    }
  }

  public getMatchesForChar(char: string, mode: 'word' | 'pronunciation'): string[] {
    if (mode === 'word') {
      // 获取所有包含该字的二字词组中的搭配字
      const words = cnchar.words(char).filter(word => word.length === 2);
      return Array.from(new Set(
        words.map(word => word.split('').filter(c => c !== char)[0])
      )).filter(Boolean);
    } else {
      const pronunciation = cnchar.pinyin(char)[0];
      return this.findSamePronunciationChars(char, pronunciation);
    }
  }
}

export const gameService = new GameService(); 