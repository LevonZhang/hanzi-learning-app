declare module 'cnchar' {
  interface ICnChar {
    words(char: string): string[];
    pinyin(char: string): string[];
    voice(char: string): void;
  }

  const cnchar: ICnChar;
  export default cnchar;
}

declare module 'cnchar-poly' {}
declare module 'cnchar-words' {}
declare module 'cnchar-pinyin' {} 