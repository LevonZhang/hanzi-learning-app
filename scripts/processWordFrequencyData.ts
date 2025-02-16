import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface WordFrequencyData {
  word: string;
  frequency: number;
  pinyin: string[];
  characters: string[];
}

interface WordIndex {
  [character: string]: {
    words: string[];
    frequencies: number[];
  };
}

interface ProcessedData {
  wordData: { [word: string]: WordFrequencyData };
  characterWordIndex: WordIndex;
}

// 下载SUBTLEX-CH数据
function downloadSubtlexData(): Promise<string> {
  return new Promise((resolve, reject) => {
    const url = 'https://raw.githubusercontent.com/thyferny/SUBTLEX-CH/master/SUBTLEX-CH-WF.txt';
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // 处理重定向
        https.get(response.headers.location as string, (redirectResponse) => {
          let data = '';
          redirectResponse.on('data', (chunk) => {
            data += chunk;
          });
          redirectResponse.on('end', () => {
            resolve(data);
          });
        }).on('error', (err) => {
          reject(err);
        });
      } else {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          resolve(data);
        });
      }
    }).on('error', (err) => {
      reject(err);
    });
  });
}

// 处理数据
async function processData(rawData: string): Promise<ProcessedData> {
  const wordData: { [word: string]: WordFrequencyData } = {};
  const characterWordIndex: WordIndex = {};

  const lines = rawData.split('\n').slice(1); // 跳过标题行
  console.log('总词条数:', lines.length);
  let processedCount = 0;

  for (const line of lines) {
    const [word, freqStr] = line.trim().split('\t');
    if (word && freqStr) {
      const frequency = parseInt(freqStr);
      if (word.length >= 2 && frequency > 0) {
        const wordEntry: WordFrequencyData = {
          word,
          frequency,
          pinyin: [], // 后续可以添加拼音数据
          characters: Array.from(word)
        };
        wordData[word] = wordEntry;

        // 建立字符索引
        for (const char of wordEntry.characters) {
          if (!characterWordIndex[char]) {
            characterWordIndex[char] = {
              words: [],
              frequencies: []
            };
          }
          characterWordIndex[char].words.push(word);
          characterWordIndex[char].frequencies.push(frequency);
        }
        processedCount++;
      }
    }
  }

  console.log('数据处理完成，有效词组数:', processedCount);

  // 对每个字符的词组按频率排序
  console.log('开始对词组进行频率排序...');
  for (const char in characterWordIndex) {
    const index = characterWordIndex[char];
    const pairs = index.words.map((word, i) => ({
      word,
      frequency: index.frequencies[i]
    }));
    pairs.sort((a, b) => b.frequency - a.frequency);

    characterWordIndex[char].words = pairs.map(p => p.word);
    characterWordIndex[char].frequencies = pairs.map(p => p.frequency);
  }

  return {
    wordData,
    characterWordIndex
  };
}

async function main() {
  try {
    console.log('开始下载SUBTLEX-CH数据...');
    const rawData = await downloadSubtlexData();
    console.log('数据下载完成，开始处理...');

    const processedData = await processData(rawData);
    
    // 确保目录存在
    const dataDir = path.join(__dirname, '../src/data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    // 保存处理后的数据
    const outputPath = path.join(dataDir, 'wordFrequencyData.json');
    fs.writeFileSync(outputPath, JSON.stringify(processedData, null, 2));
    console.log('数据已保存到:', outputPath);

    // 生成TypeScript类型定义文件
    const typesContent = `
export interface WordFrequencyData {
  word: string;
  frequency: number;
  pinyin: string[];
  characters: string[];
}

export interface WordIndex {
  [character: string]: {
    words: string[];
    frequencies: number[];
  };
}

export interface ProcessedData {
  wordData: { [word: string]: WordFrequencyData };
  characterWordIndex: WordIndex;
}

declare const data: ProcessedData;
export default data;
`;
    fs.writeFileSync(path.join(dataDir, 'wordFrequencyData.d.ts'), typesContent);
    
    // 输出一些统计信息
    console.log('统计信息:');
    console.log('- 总词组数:', Object.keys(processedData.wordData).length);
    console.log('- 总字符数:', Object.keys(processedData.characterWordIndex).length);
  } catch (error) {
    console.error('处理数据时出错:', error);
    process.exit(1);
  }
}

main(); 