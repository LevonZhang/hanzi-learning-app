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
  let currentDefinition = '';

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
      .replace(/\([^)]+\)/g, '') // Remove content in round brackets
      .replace(/（[^）]+）/g, '') // Remove content in full-width round brackets
      .replace(/\[[^\]]+\]/g, '') // Remove content in square brackets
      .replace(/［[^］]+］/g, '') // Remove content in full-width square brackets
      .replace(/〈[^〉]+〉/g, '') // Remove content in angle brackets
      .replace(/《[^》]+》/g, '') // Remove book titles
      .replace(/「[^」]+」/g, '') // Remove content in corner brackets
      .replace(/『[^』]+』/g, '') // Remove content in white corner brackets
      .replace(/\{[^}]+\}/g, '') // Remove content in curly brackets
      .replace(/～/g, '') // Remove wave dash
      .replace(/\s+/g, ' ') // Replace multiple spaces with single space
      .replace(/[""]/g, '') // Remove quotation marks
      .replace(/\d+\./g, '') // Remove numbered list markers
      .replace(/⒈|⒉|⒊|⒋|⒌|⒍|⒎|⒏|⒐|⒑/g, '') // Remove circled numbers
      .replace(/①|②|③|④|⑤|⑥|⑦|⑧|⑨|⑩/g, '') // Remove circled numbers
      .replace(/\-\-.*$/, '') // Remove everything after --
      .trim();

    // Skip if line is empty after cleaning
    if (line.length < 2) {
      continue;
    }

    // If line contains multiple definitions separated by semicolons or periods
    if (line.includes('。') || line.includes('；')) {
      const subDefs = line.split(/[。；]/).filter(def => def.trim().length > 0);
      for (const def of subDefs) {
        if (currentDefinition) {
          definitions.push(currentDefinition + def + '。');
          currentDefinition = '';
        } else {
          definitions.push(def + '。');
        }
      }
    } else {
      // If line doesn't end with period, accumulate it
      currentDefinition += line;
    }
  }

  // Add any remaining definition
  if (currentDefinition) {
    definitions.push(currentDefinition + '。');
  }

  // Filter and clean the definitions
  return [...new Set(definitions)]
    .filter(def => {
      // Filter out definitions that are too short or contain unwanted patterns
      return def.length > 2 && 
             !def.match(/^[a-zA-Z0-9]/) &&
             !def.includes('见') &&
             !def.includes('通') &&
             !def.includes('同') &&
             !def.includes('亦作') &&
             !def.includes('或作');
    })
    .map(def => {
      // Ensure definition ends with proper punctuation
      if (!def.match(/[。！？；]$/)) {
        def += '。';
      }
      return def;
    });
} 