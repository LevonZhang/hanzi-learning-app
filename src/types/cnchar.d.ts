declare module 'cnchar' {
  const cnchar: {
    stroke(char: string): number | number[];
    words(char: string): string[];
  };
  export default cnchar;
}

declare module 'cnchar-poly' {}
declare module 'cnchar-words' {}
declare module 'cnchar-all' {} 