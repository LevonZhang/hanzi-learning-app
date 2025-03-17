import { hanziDict } from '../data/hanziDict';
import cnchar from 'cnchar';

interface HanziDetails {
  character: string;
  pinyin: string[];
  strokes: number;
  meanings: {
    zh: string[];
    en: string[];
    ja: string[];
  };
  isCommon: boolean;
  commonIndex: number;
}

interface HanziData {
  character: string;
  pinyin: string[];
  strokes: number;
  meanings: {
    zh: string[];
    en: string[];
    ja: string[];
  };
  words: string[];
}

class HanziService {
  private static instance: HanziService;
  private hanziList: HanziDetails[] = [];
  
  // 常用汉字列表（按使用频率排序）
  private static COMMON_CHARS = '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感见明问力理尔点文几定本公特做外孩相西果走将月十实向声车全信重三机工物气每并别真打太新比才便夫再书部水像眼等体却加电主界门利海受听表德少克代员许稜先口由死安写性马光白或住难望教命花结乐色更拉东神记处让母父应直字场平报友关放至张认接告入笑内英军候民岁往何度山觉路带万男边风解叫任金快原吃妈变通师立象数四失满战远格士音轻目条呢病始达深完今提求清王化空业思切怎非找片罗钱紶吗语元喜整荣波判属近层片维律改群众必始则总感察环决投达持换区乐够存究程运待青续连速争术';

  private constructor() {
    this.initializeHanziList();
  }

  static getInstance(): HanziService {
    if (!HanziService.instance) {
      HanziService.instance = new HanziService();
    }
    return HanziService.instance;
  }

  private initializeHanziList() {
    // 使用整个汉字字典
    this.hanziList = Object.entries(hanziDict)
      .map(([char, details]) => {
        const normalizedChar = char.normalize('NFKC');
        const strokeResult = cnchar.stroke(normalizedChar);
        const strokes = Array.isArray(strokeResult) ? strokeResult[0] : strokeResult;
        return {
          character: normalizedChar,
          pinyin: details.pinyin,
          strokes,
          meanings: {
            zh: details.chinese || [],
            en: details.english || [],
            ja: [],
          },
          isCommon: HanziService.COMMON_CHARS.includes(normalizedChar),
          commonIndex: HanziService.COMMON_CHARS.indexOf(normalizedChar)
        };
      });
  }

  public getHanziList(): HanziData[] {
    // 按笔画数排序
    return this.hanziList
      .sort((a, b) => a.strokes - b.strokes)
      .map(details => ({
        character: details.character,
        pinyin: details.pinyin,
        strokes: details.strokes,
        meanings: details.meanings,
        words: cnchar.words(details.character) || []
      }));
  }

  public getHanziByPinyin(pinyin: string): HanziData[] {
    return this.hanziList
      .filter(hanzi => hanzi.pinyin.some(p => p.startsWith(pinyin.toLowerCase())))
      .map(details => ({
        character: details.character,
        pinyin: details.pinyin,
        strokes: details.strokes,
        meanings: details.meanings,
        words: cnchar.words(details.character) || []
      }));
  }

  public getHanziByStrokes(strokes: number): HanziData[] {
    return this.hanziList
      .filter(hanzi => hanzi.strokes === strokes)
      .map(details => ({
        character: details.character,
        pinyin: details.pinyin,
        strokes: details.strokes,
        meanings: details.meanings,
        words: cnchar.words(details.character) || []
      }));
  }

  public async getHanziListWithDetails(): Promise<HanziDetails[]> {
    return this.hanziList;
  }

  async getHanziDetails(character: string): Promise<HanziDetails> {
    // 规范化输入的字符
    const normalizedChar = character.normalize('NFKC');
    const details = this.hanziList.find(h => h.character === normalizedChar);
    if (!details) {
      throw new Error(`Character ${character} not found`);
    }
    return details;
  }

  // 修改搜索功能
  async searchCharacter(query: string): Promise<HanziDetails[]> {
    query = query.trim().toLowerCase();
    
    let matchingChars: HanziDetails[] = [];
    
    // 如果查询是汉字
    if (/[\u4e00-\u9fa5]/.test(query)) {
      matchingChars = this.hanziList.filter(h => h.character.includes(query));
    } else {
      // 如果查询是拼音，改进匹配逻辑
      matchingChars = this.hanziList.filter(h => 
        h.pinyin.some(p => {
          const pinyinWithoutTone = p.toLowerCase().replace(/\d/g, '');
          return pinyinWithoutTone.startsWith(query);
        })
      );
    }

    // 按常用程度和拼音排序
    return matchingChars.sort((a, b) => {
      // 首先按常用字排序
      if (a.isCommon !== b.isCommon) {
        return a.isCommon ? -1 : 1;
      }
      
      // 如果都是常用字，按常用度排序
      if (a.isCommon && b.isCommon) {
        return a.commonIndex - b.commonIndex;
      }
      
      // 如果都不是常用字，按拼音排序
      const aPinyin = a.pinyin[0].toLowerCase();
      const bPinyin = b.pinyin[0].toLowerCase();
      return aPinyin.localeCompare(bPinyin);
    });
  }
}

export default HanziService; 