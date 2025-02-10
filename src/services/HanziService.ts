import cnchar from 'cnchar';
import 'cnchar-poly';    // 多音字
import 'cnchar-order';   // 笔顺
import 'cnchar-draw';    // 绘制
import 'cnchar-words';   // 词组功能
import { hanziDict } from '../data/hanziDict';

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

interface Character {
  character: string;
  pinyin: string[];
  meanings: {
    zh: string[];
    en: string[];
    ja: string[];
  };
}

class HanziService {
  private static instance: HanziService;
  private hanziList: HanziData[] = [];
  
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

  public static getInstance(): HanziService {
    if (!HanziService.instance) {
      HanziService.instance = new HanziService();
    }
    return HanziService.instance;
  }

  private initializeHanziList() {
    this.hanziList = HanziService.HSK1_CHARS.map(char => {
      const pinyinResult = cnchar.spell(char, 'array', 'poly', 'low');
      const pinyinArray: string[] = Array.isArray(pinyinResult) 
        ? pinyinResult 
        : [pinyinResult.toString()];
      
      const strokeResult = cnchar.stroke(char);
      const strokeCount: number = typeof strokeResult === 'number' 
        ? strokeResult 
        : Array.isArray(strokeResult) 
          ? strokeResult[0] 
          : 0;

      return {
        character: char,
        pinyin: pinyinArray,
        strokes: strokeCount,
        meanings: {
          zh: [],
          en: [],
          ja: []
        },
        words: []
      } as HanziData;
    });
  }

  public getHanziList(): HanziData[] {
    return this.hanziList;
  }

  public getHanziByPinyin(pinyin: string): HanziData[] {
    return this.hanziList.filter(hanzi => 
      hanzi.pinyin.some(p => p.startsWith(pinyin.toLowerCase()))
    );
  }

  public getHanziByStrokes(strokes: number): HanziData[] {
    return this.hanziList.filter(hanzi => hanzi.strokes === strokes);
  }

  public async getHanziListWithDetails(): Promise<Character[]> {
    return Promise.all(this.hanziList.map(async char => {
      const details = await this.getHanziDetails(char.character);
      return {
        character: char.character,
        pinyin: details.pinyin,
        meanings: details.meanings
      };
    }));
  }

  async getHanziDetails(character: string): Promise<HanziData> {
    const data = hanziDict[character];
    // 使用 cnchar.words 获取词组，如果方法不存在则返回空数组
    const wordsResult = typeof (cnchar as any).words === 'function' 
      ? (cnchar as any).words(character)
      : [];
    const words: string[] = Array.isArray(wordsResult) 
      ? wordsResult.slice(0, 4) 
      : [];
    
    const strokeResult = cnchar.stroke(character);
    const strokeCount: number = typeof strokeResult === 'number' 
      ? strokeResult 
      : Array.isArray(strokeResult) 
        ? strokeResult[0] 
        : 0;

    return {
      character,
      pinyin: data?.pinyin || [],
      strokes: strokeCount,
      meanings: {
        zh: data?.chinese || [],
        en: data?.english || [],
        ja: []
      },
      words: words
    };
  }
}

export default HanziService; 