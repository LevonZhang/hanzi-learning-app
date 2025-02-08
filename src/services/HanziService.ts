import cnchar from 'cnchar';
import 'cnchar-poly';  // 用于获取多音字的所有拼音

interface HanziData {
  character: string;
  pinyin: string[];
  strokes: number;
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
      const pinyinList = cnchar.spell(char, 'array', 'poly', 'low');
      return {
        character: char,
        pinyin: pinyinList,
        strokes: cnchar.stroke(char)
      };
    });

    // 按拼音排序（使用第一个拼音）
    this.hanziList.sort((a, b) => {
      const pinyinA = a.pinyin[0] || '';
      const pinyinB = b.pinyin[0] || '';
      return pinyinA.localeCompare(pinyinB);
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
}

export default HanziService; 