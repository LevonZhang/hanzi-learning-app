function processChineseExplanation(explanation: string): string[] {
  if (!explanation || typeof explanation !== 'string') {
    return ['暂无中文释义'];
  }

  // Split into lines and clean each line
  const lines = explanation
    .split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);

  const definitions: string[] = [];

  for (let line of lines) {
    // Skip lines that are not definitions
    if (line.match(/^[a-zA-Z0-9]/) || // Skip lines starting with letters or numbers
        line.includes('部首') ||
        line.includes('笔画') ||
        line.includes('郑码') ||
        line.includes('笔顺编号') ||
        line.startsWith('--') ||
        line.startsWith('见"') ||
        line.length < 2) {
      continue;
    }

    // Clean the line
    line = line
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/\-\-.*$/, '') // Remove everything after --
      .replace(/^\d+\.\s*/, '') // Remove leading numbers
      .trim();

    // Skip if line is empty after cleaning
    if (line.length < 2) {
      continue;
    }

    // If line contains multiple definitions separated by semicolons or periods
    if (line.includes('。') || line.includes('；')) {
      const subDefs = line.split(/[。；]/).filter(def => def.trim().length > 0);
      definitions.push(...subDefs.map(def => def.trim() + '。'));
    } else {
      // If line doesn't end with period, add it
      definitions.push(line + (line.endsWith('。') ? '' : '。'));
    }
  }

  // Filter and clean the definitions
  return [...new Set(definitions)]
    .filter(def => def.length > 2);
}

// Test the function with some sample data
const testExplanation = `测试（测试用例）这是一个测试。
这是第二个解释；这是第二个解释的第二部分。
《诗经》中的一句 [这是注释] 实际文本。
(这是括号中的内容) 主要解释。
这是「重要内容」的说明。`;

console.log("Testing processChineseExplanation function:");
console.log("Input explanation:");
console.log(testExplanation);
console.log("\nProcessed result:");
console.log(processChineseExplanation(testExplanation)); 