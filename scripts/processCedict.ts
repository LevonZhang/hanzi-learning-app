import * as fs from 'fs';
import * as path from 'path';
import axios from 'axios';
import * as zlib from 'zlib';
import { promisify } from 'util';

interface WordJsonEntry {
  word: string;
  oldword: string;
  strokes: string;
  pinyin: string;
  radicals: string;
  explanation: string;
  more: string;
}

interface HanziEntry {
  simplified: string;
  traditional: string;
  pinyin: string;
  english: string[];
}

interface HanziDict {
  [key: string]: {
    pinyin: string[];
    english: string[];
    chinese: string[];
    traditional?: string;
    strokes?: number;
    radical?: string;
  }
}

async function downloadCedict() {
  const url = 'https://www.mdbg.net/chinese/export/cedict/cedict_1_0_ts_utf-8_mdbg.txt.gz';
  console.log('开始下载:', url);
  const response = await axios.get(url, { responseType: 'arraybuffer' });
  console.log('下载完成，文件大小:', response.data.length / 1024 / 1024, 'MB');
  const outputPath = path.join(__dirname, '../data/cedict.txt.gz');
  fs.writeFileSync(outputPath, response.data);
  console.log('保存到:', outputPath);
}

async function unzipFile() {
  console.log('开始解压文件...');
  const gunzip = promisify(zlib.gunzip);
  const gzipData = fs.readFileSync(path.join(__dirname, '../data/cedict.txt.gz'));
  const unzippedData = await gunzip(gzipData);
  const text = unzippedData.toString('utf8');
  console.log('解压完成，文本长度:', text.length, '字符');
  return text;
}

function parseCedictLine(line: string): HanziEntry | null {
  // 跳过注释行
  if (line.startsWith('#')) return null;

  try {
    // 先尝试分割行
    const parts = line.trim().split(' ');
    if (parts.length < 3) return null;

    // 获取拼音部分 [pin1 yin1]
    const pinyinMatch = line.match(/\[(.*?)\]/);
    if (!pinyinMatch) return null;

    // 获取英文释义部分 /def1/def2/
    const defMatch = line.match(/\/(.*)\//);
    if (!defMatch) return null;

    const traditional = parts[0];
    const simplified = parts[1];
    const pinyin = pinyinMatch[1];
    const definitions = defMatch[1];

    // 验证是否是中文字符
    if (!/[\u3000-\u9fff]/.test(simplified)) return null;

    // 只在找到单字时输出日志
    if (simplified.length === 1) {
      console.log('找到汉字:', {
        traditional,
        simplified,
        pinyin,
        definitions: definitions.split('/').slice(0, 3) // 只显示前3个释义
      });
    }

    return {
      traditional,
      simplified,
      pinyin,
      english: definitions.split('/')
    };
  } catch (error) {
    console.log('解析出错的行:', line.slice(0, 100));
    return null;
  }
}

// 加载word.json数据
function loadWordJson(): { [key: string]: WordJsonEntry } {
  const wordJsonPath = path.join(__dirname, '../data/word.json');
  console.log('正在读取word.json文件:', wordJsonPath);
  const wordJsonContent = fs.readFileSync(wordJsonPath, 'utf8');
  console.log('word.json文件大小:', wordJsonContent.length / 1024 / 1024, 'MB');
  
  const wordJsonArray = JSON.parse(wordJsonContent) as WordJsonEntry[];
  console.log('解析到的汉字数量:', wordJsonArray.length);
  
  // 转换为以汉字为key的对象
  const wordDict: { [key: string]: WordJsonEntry } = {};
  wordJsonArray.forEach(entry => {
    wordDict[entry.word] = entry;
  });
  
  console.log('转换后的字典大小:', Object.keys(wordDict).length);
  // 打印几个示例
  const examples = Object.entries(wordDict).slice(0, 2);
  console.log('示例数据:', JSON.stringify(examples, null, 2));
  
  return wordDict;
}

// 处理中文释义，提取主要解释
function processChineseExplanation(explanation: string): string[] {
  if (!explanation || typeof explanation !== 'string') {
    return ['暂无中文释义'];
  }

  const definitions: string[] = [];
  
  // 按换行符分割
  const lines = explanation.split('\n').filter(line => line.trim());
  
  for (const line of lines) {
    let trimmedLine = line.trim();
    
    // 跳过不需要的行
    if (trimmedLine.startsWith('--') || // 跳过例句
        trimmedLine.match(/^[a-zA-Z]/) || // 跳过英文开头
        trimmedLine.match(/^[0-9]/) || // 跳过数字开头
        trimmedLine.match(/^-+$/) || // 跳过分隔线
        trimmedLine.match(/^\s*$/) || // 跳过空行
        trimmedLine.includes('另见') || // 跳过"另见"说明
        trimmedLine.includes('郑码') || // 跳过编码信息
        trimmedLine.includes('笔画数') || // 跳过笔画信息
        trimmedLine.includes('部首') || // 跳过部首信息
        trimmedLine.includes('笔顺编号') || // 跳过笔顺信息
        trimmedLine.includes('按,') || // 跳过注释
        trimmedLine.includes('--《') || // 跳过引用
        trimmedLine.startsWith('又如') || // 跳过"又如"开头的例子
        trimmedLine.includes('见"') // 跳过参见
    ) {
      continue;
    }

    // 移除不需要的内容
    trimmedLine = trimmedLine
      .replace(/\[[^\]]*\]/g, '') // 移除方括号中的内容
      .replace(/《[^》]*》/g, '') // 移除书名号引用
      .replace(/\([^\)]*\)/g, '') // 移除括号中的内容
      .replace(/[āáǎàōóǒòēéěèīíǐìūúǔùüǖǘǚǜ]/g, '') // 移除声调字符
      .replace(/[ㄅㄆㄇㄈㄉㄊㄋㄌㄍㄎㄏㄐㄑㄒㄓㄔㄕㄖㄗㄘㄙㄚㄛㄜㄝㄞㄟㄠㄡㄢㄣㄤㄥㄦㄧㄨㄩ╝╔╗╚]/g, '') // 移除注音符号
      .replace(/\s[a-z]+\s/g, ' ') // 移除单个拼音
      .replace(/u[0-9a-f]{4}，/g, '') // 移除 Unicode 编码
      .replace(/gbk[0-9a-f]{4}/g, '') // 移除 GBK 编码
      .replace(/〈[^〉]*〉/g, '') // 移除〈〉中的内容
      .replace(/\s+/g, ' ') // 合并多个空格
      .replace(/。+/g, '。') // 合并多个句号
      .replace(/；+/g, '。') // 将分号转换为句号
      .replace(/\|/g, '') // 移除竖线
      .trim();

    // 如果是空行，跳过
    if (!trimmedLine) continue;

    // 移除开头的特殊标记
    trimmedLine = trimmedLine.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]/, '');
    trimmedLine = trimmedLine.replace(/^【[^】]*】/, '');
    trimmedLine = trimmedLine.replace(/^［[^］]*］/, '');
    trimmedLine = trimmedLine.replace(/^⒈/, '');
    
    // 如果以句号结尾，按句号分割；否则整行作为一个释义
    if (trimmedLine.includes('。')) {
      const subDefinitions = trimmedLine.split(/[。]/).filter(Boolean);
      subDefinitions.forEach(def => {
        const cleaned = def.trim();
        if (cleaned && !definitions.includes(cleaned)) {
          definitions.push(cleaned + '。');
        }
      });
    } else if (trimmedLine) {
      definitions.push(trimmedLine + '。');
    }
  }
  
  // 如果没有找到有效释义，返回默认值
  if (definitions.length === 0) {
    return ['暂无中文释义'];
  }
  
  // 过滤掉重复的释义，并确保每个释义都以句号结尾
  return [...new Set(definitions)].map(def => def.endsWith('。') ? def : def + '。');
}

function processCedictData(data: string): HanziDict {
  console.log('开始处理数据...');
  const dict: HanziDict = {};
  const lines = data.split('\n');
  console.log('总行数:', lines.length);
  
  // 加载word.json数据
  console.log('加载word.json数据...');
  const wordDict = loadWordJson();
  
  let processedCount = 0;
  let hanziCount = 0;

  for (const line of lines) {
    processedCount++;
    const entry = parseCedictLine(line);
    if (!entry) continue;

    // 只处理单个汉字
    if (entry.simplified.length === 1) {
      hanziCount++;
      if (!dict[entry.simplified]) {
        dict[entry.simplified] = {
          pinyin: [],
          english: [],
          chinese: [],
          traditional: entry.traditional !== entry.simplified ? entry.traditional : undefined
        };
      }

      // 添加拼音（如果不重复）
      if (!dict[entry.simplified].pinyin.includes(entry.pinyin)) {
        dict[entry.simplified].pinyin.push(entry.pinyin);
      }

      // 添加英文释义（如果不重复）
      entry.english.forEach(def => {
        if (!dict[entry.simplified].english.includes(def)) {
          dict[entry.simplified].english.push(def);
        }
      });

      // 添加中文释义（从word.json）
      const wordEntry = wordDict[entry.simplified];
      if (wordEntry) {
        // 添加笔画数和部首信息
        dict[entry.simplified].strokes = parseInt(wordEntry.strokes);
        dict[entry.simplified].radical = wordEntry.radicals;
        
        // 处理中文释义
        const chineseDefinitions = processChineseExplanation(wordEntry.explanation);
        chineseDefinitions.forEach(def => {
          if (!dict[entry.simplified].chinese.includes(def)) {
            dict[entry.simplified].chinese.push(def);
          }
        });
      } else {
        dict[entry.simplified].chinese.push('暂无中文释义');
      }
    }

    if (processedCount % 1000 === 0) {
      console.log(`已处理 ${processedCount}/${lines.length} 行，找到 ${hanziCount} 个汉字`);
    }
  }

  console.log('处理完成！');
  console.log('总共找到', Object.keys(dict).length, '个独立汉字');
  console.log('示例:', JSON.stringify(Object.entries(dict).slice(0, 2), null, 2));
  return dict;
}

async function processData() {
  try {
    // 确保目录存在
    const dataDir = path.join(__dirname, '../data');
    const srcDataDir = path.join(__dirname, '../src/data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir);
    }
    if (!fs.existsSync(srcDataDir)) {
      fs.mkdirSync(srcDataDir);
    }

    // 下载最新的 CC-CEDICT 数据
    console.log('下载 CC-CEDICT 数据...');
    await downloadCedict();

    // 解压数据
    console.log('解压数据...');
    const data = await unzipFile();

    // 处理数据
    console.log('处理数据...');
    const dict = processCedictData(data);

    // 生成 TypeScript 文件
    console.log('生成 TypeScript 文件...');
    const tsContent = `// CC-CEDICT 汉字数据
export const hanziDict = ${JSON.stringify(dict, null, 2)};
`;

    const outputPath = path.join(__dirname, '../src/data/hanziDict.ts');
    fs.writeFileSync(outputPath, tsContent, 'utf8');
    console.log('文件已保存到:', outputPath);
    console.log('文件大小:', fs.statSync(outputPath).size / 1024, 'KB');

    // 清理临时文件
    fs.unlinkSync(path.join(__dirname, '../data/cedict.txt.gz'));
    console.log('清理完成！');

  } catch (error) {
    console.error('处理过程中出错:', error);
    throw error;
  }
}

processData().catch(console.error); 