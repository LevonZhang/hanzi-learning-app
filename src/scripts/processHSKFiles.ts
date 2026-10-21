import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface HSKCharacterInfo {
    character: string;
    level: number;
    order: number;
}

// Process a single HSK file
function processHSKFile(filePath: string, level: number): HSKCharacterInfo[] {
    const content = fs.readFileSync(filePath, 'utf-8');
    const characters = content.trim().split('\n').filter(char => char.trim());
    
    return characters.map((char, index) => ({
        character: char.trim(),
        level,
        order: index + 1
    }));
}

// Main function to process all HSK files
function processAllHSKFiles() {
    const dataDir = path.join(__dirname, '..', 'data');
    const hskCharacters: HSKCharacterInfo[] = [];

    // Process HSK 1-6
    for (let level = 1; level <= 6; level++) {
        const filePath = path.join(dataDir, `HSK ${level}.txt`);
        const levelCharacters = processHSKFile(filePath, level);
        hskCharacters.push(...levelCharacters);
    }

    // Process HSK 7-9
    const hsk79FilePath = path.join(dataDir, 'HSK 7-9.txt');
    if (fs.existsSync(hsk79FilePath)) {
        const hsk79Characters = processHSKFile(hsk79FilePath, 7); // Use level 7 for all advanced characters
        hskCharacters.push(...hsk79Characters);
    }

    // Generate the output file content
    const outputContent = `// This file is auto-generated from HSK text files
export interface HSKCharacterInfo {
    character: string;
    level: number;
    order: number;
}

export const hskCharacterOrder: HSKCharacterInfo[] = ${JSON.stringify(hskCharacters, null, 2)};

// Helper function to get HSK info for a character
export function getHSKInfo(character: string): HSKCharacterInfo | undefined {
    return hskCharacterOrder.find(info => info.character === character);
}

// Helper function to get all characters of a specific HSK level
export function getHSKLevelCharacters(level: number): string[] {
    return hskCharacterOrder
        .filter(info => info.level === level)
        .sort((a, b) => a.order - b.order)
        .map(info => info.character);
}

// Helper function to get total character count for each HSK level
export function getHSKLevelCounts(): { [key: number]: number } {
    const counts: { [key: number]: number } = {};
    hskCharacterOrder.forEach(char => {
        counts[char.level] = (counts[char.level] || 0) + 1;
    });
    return counts;
}
`;

    // Write the output to hskOrder.ts
    fs.writeFileSync(path.join(dataDir, 'hskOrder.ts'), outputContent, 'utf-8');
    
    // Print statistics
    const counts = hskCharacters.reduce((acc, char) => {
        acc[char.level] = (acc[char.level] || 0) + 1;
        return acc;
    }, {} as { [key: number]: number });
    
    console.log('Successfully generated hskOrder.ts');
    console.log('\nCharacter counts by HSK level:');
    Object.entries(counts).forEach(([level, count]) => {
        console.log(`HSK ${level}: ${count} characters`);
    });
    console.log(`Total: ${hskCharacters.length} characters`);
}

// Run the script
processAllHSKFiles(); 