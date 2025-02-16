const fs = require('fs');
const path = require('path');
const XLSX = require('xlsx');
const pinyin = require('pinyin-pro').pinyin;

// 从Excel文件读取数据
function readExcelData() {
  try {
    const dataPath = path.join(__dirname, 'SUBTLEX-CH-WF.xlsx');
    const workbook = XLSX.readFile(dataPath);
    const sheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[sheetName];
    
    // 转换为JSON数据，跳过前两行（总词数统计和列标题）
    const jsonData = XLSX.utils.sheet_to_json(worksheet, { 
      range: 2  // 从第三行开始
    });
    console.log('Excel数据读取成功，行数:', jsonData.length);
    
    // 打印前几行数据的结构
    console.log('数据结构示例 (前3行):', JSON.stringify(jsonData.slice(0, 3), null, 2));
    
    // 转换为文本格式
    let textData = 'Word\tFrequency\n';  // 添加标题行
    let processedCount = 0;
    
    jsonData.forEach(row => {
      // 获取第一个非空的列名（这是词语）和对应的频率
      const entries = Object.entries(row);
      if (entries.length >= 2) {
        const word = entries[0][1];  // 第一列的值
        const frequency = entries[1][1];  // 第二列的值
        
        if (typeof word === 'string' && typeof frequency === 'number') {
          textData += `${word}\t${frequency}\n`;
          processedCount++;
        }
      }
    });
    
    console.log('成功处理词条数:', processedCount);
    return textData;
  } catch (error) {
    console.error('读取Excel文件失败:', error);
    throw error;
  }
}

// 处理数据
async function processData(rawData) {
  const wordData = {};
  const characterWordIndex = {};

  const lines = rawData.split('\n').slice(1); // 跳过标题行
  console.log('总词条数:', lines.length);
  let processedCount = 0;

  for (const line of lines) {
    const [word, freqStr] = line.trim().split('\t');
    if (word && freqStr) {
      const frequency = parseInt(freqStr);
      if (word.length >= 1 && frequency > 0) {  // 修改为允许单字
        const wordEntry = {
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
    console.log('开始读取Excel数据...');
    const rawData = readExcelData();
    console.log('数据读取完成，开始处理...');

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

    // 输出一些示例数据
    const sampleChar = Object.keys(processedData.characterWordIndex)[0];
    console.log('\n示例数据:');
    console.log('字符:', sampleChar);
    console.log('相关词组数:', processedData.characterWordIndex[sampleChar].words.length);
    console.log('前5个高频词:', processedData.characterWordIndex[sampleChar].words.slice(0, 5));
  } catch (error) {
    console.error('处理数据时出错:', error);
    process.exit(1);
  }
}

main(); 