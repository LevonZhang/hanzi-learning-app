const fs = require('fs');
const path = require('path');

// 读取词频数据
console.log('开始测试游戏服务...\n');

// 模拟 GameService 的词组获取逻辑
const wordFrequencyData = JSON.parse(fs.readFileSync(path.join(__dirname, '../src/data/wordFrequencyData.json'), 'utf8'));

// 测试不同关卡的词组获取
const levels = [1, 2, 3, 4, 5];
const levelCounts = {
  1: 3,
  2: 5,
  3: 10,
  4: 15,
  5: 18,
};

// 常用汉字列表（简化版）
const commonChars = '的一是了我不人在他有这个上们来到时大地为子中你说生国年着就那和要她出也得里后自以会家可下而过天去能对小多然于心学么之都好看起发当没成只如事把还用第样道想作种开美总从无情己面最女但现前些所同日手又行意动方期它头经长儿回位分爱老因很给名法间斯知世什两次使身者被高已亲其进此话常与活正感见明问力理尔点文几定本公特做外孩相西果走将月十实向声车全信重三机工物气每并别真打太新比才便夫再书部水像眼等体却加电主界门利海受听表德少克代员许稜先口由死安写性马光白或住难望教命花结乐色更拉东神记处让母父应直字场平报友关放至张认接告入笑内英军候民岁往何度山觉路带万男边风解叫任金快原吃妈变通师立象数四失满战远格士音轻目条呢病始达深完今提求清王化空业思切怎非找片罗钱紶吗语元喜整荣波判属近层片维律改群众必始则总感察环决投达持换区乐够存究程运待青续连速争术';

function getRandomCharsFromCommon(count) {
  const chars = commonChars.split('');
  const shuffled = [...chars].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

function getWordsForCharacter(char) {
  const charIndex = wordFrequencyData.characterWordIndex[char];
  if (!charIndex) return [];
  return charIndex.words;
}

function getWordFrequency(word) {
  const wordData = wordFrequencyData.wordData[word];
  return wordData?.frequency || 0;
}

async function testLevel(level) {
  console.log(`\n测试第 ${level} 关:`);
  console.log('------------------------');
  
  const count = levelCounts[level];
  console.log(`目标词组数量: ${count}`);
  
  const chars = getRandomCharsFromCommon(count * 2);
  console.log('随机选择的字符:', chars.join(', '));
  
  const pairs = [];
  for (const char of chars) {
    // 获取词组
    const words = getWordsForCharacter(char);
    console.log(`\n字符 "${char}" 获取到 ${words.length} 个词组`);
    
    // 只使用二字词
    const twoCharWords = words.filter(word => word.length === 2);
    console.log(`其中二字词有 ${twoCharWords.length} 个`);
    
    if (twoCharWords.length > 0) {
      // 随机选择一个高频词
      const word = twoCharWords[Math.floor(Math.random() * Math.min(5, twoCharWords.length))];
      const frequency = getWordFrequency(word);
      
      // 检查是否已经有这个词了
      if (!pairs.some(p => p.word === word)) {
        pairs.push({
          word,
          characters: word.split(''),
          frequency
        });
        console.log(`添加词组: ${word} (频率: ${frequency})`);
        
        // 如果已经收集够了，就提前结束
        if (pairs.length >= count) {
          console.log('已收集足够的词组，提前结束');
          break;
        }
      }
    }
  }
  
  console.log('\n本关结果:');
  console.log(`- 获取到 ${pairs.length} 个词组`);
  console.log('- 词组列表:');
  pairs.forEach(pair => {
    console.log(`  * ${pair.word} (频率: ${pair.frequency})`);
  });
}

// 测试所有关卡
async function testAllLevels() {
  for (const level of levels) {
    await testLevel(level);
  }
}

// 运行测试
testAllLevels().catch(console.error); 