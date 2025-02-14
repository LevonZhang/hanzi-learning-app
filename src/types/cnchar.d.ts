declare module 'cnchar' {
  const cnchar: {
    stroke(char: string): number | number[];
    words(char: string): string[];
    pinyin(char: string, ...args: any[]): string[];
    spell(char: string, ...args: any[]): string[];
  } & {
    [key: string]: any;
  };
  export default cnchar;
}

declare module 'cnchar-poly' {}
declare module 'cnchar-order' {}
declare module 'cnchar-draw' {}
declare module 'cnchar-words' {}
declare module 'cnchar-all' {}
declare module 'cnchar-voice' {} 