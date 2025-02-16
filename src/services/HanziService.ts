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
  
  // HSK 1级常用汉字
  private static HSK1_CHARS = [
    '我', '你', '他', '她', '它', '是', '不', '了', '在', '有',
    '好', '这', '那', '哪', '谁', '什', '么', '的', '和', '年',
    '月', '日', '上', '下', '中', '大', '小', '多', '少', '几',
    '个', '水', '火', '山', '木', '人', '口', '手', '目', '耳',
    '东', '西', '南', '北', '左', '右', '前', '后', '里', '外'
  ];

  private webViewContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <script src="https://cdn.jsdelivr.net/npm/cnchar@3.2.3/cnchar.min.js"></script>
        <script src="https://cdn.jsdelivr.net/npm/cnchar-all@3.2.3/cnchar.all.min.js"></script>
      </head>
      <body>
        <script>
          function getHanziInfo(char) {
            return {
              definition: cnchar.explain(char),
              pinyin: cnchar.spell(char, 'array', 'poly'),
              words: cnchar.words(char),
              english: cnchar.translate(char),
              strokes: cnchar.stroke(char)
            };
          }
        </script>
      </body>
    </html>
  `;

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
    // 初始化汉字列表，只包含 HSK1 常用字
    this.hanziList = Object.entries(hanziDict)
      .filter(([char]) => HanziService.HSK1_CHARS.includes(char))
      .map(([char, details]) => {
        const normalizedChar = char.normalize('NFKC');
        // 使用 cnchar 获取笔画数，确保是单个数字
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
        };
      });
  }

  public getHanziList(): HanziData[] {
    return this.hanziList.map(details => ({
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

  // 添加拼音排序辅助函数
  private comparePinyin(a: string, b: string, query: string): number {
    // 获取第一个匹配的拼音
    const aPinyin = a.toLowerCase();
    const bPinyin = b.toLowerCase();
    
    // 如果两个拼音的开头部分不同，按字母顺序排序
    if (aPinyin.startsWith(query) !== bPinyin.startsWith(query)) {
      return bPinyin.startsWith(query) ? 1 : -1;
    }
    
    // 提取音调数字
    const aNum = parseInt(aPinyin.match(/\d/)?.[0] || '5');
    const bNum = parseInt(bPinyin.match(/\d/)?.[0] || '5');
    
    // 按音调数字排序
    if (aNum !== bNum) {
      return aNum - bNum;
    }
    
    // 如果音调数字相同，按字母顺序排序
    return aPinyin.localeCompare(bPinyin);
  }

  // 添加搜索功能
  async searchCharacter(query: string): Promise<HanziDetails[]> {
    query = query.trim().toLowerCase();
    
    // 如果查询是汉字
    if (/[\u4e00-\u9fa5]/.test(query)) {
      return this.hanziList.filter(h => h.character.includes(query));
    }
    
    // 如果查询是拼音
    const matchingChars = this.hanziList.filter(h => 
      h.pinyin.some(p => p.toLowerCase().startsWith(query))
    );

    // 按拼音排序
    return matchingChars.sort((a, b) => {
      // 获取最匹配的拼音
      const aPinyin = a.pinyin.find(p => p.toLowerCase().startsWith(query)) || a.pinyin[0];
      const bPinyin = b.pinyin.find(p => p.toLowerCase().startsWith(query)) || b.pinyin[0];
      
      return this.comparePinyin(aPinyin, bPinyin, query);
    });
  }
}

export default HanziService; 