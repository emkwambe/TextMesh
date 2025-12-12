declare module 'sentiment' {
  interface SentimentResult {
    score: number;
    comparative: number;
    calculation: Array<{ [word: string]: number }>;
    tokens: string[];
    words: string[];
    positive: string[];
    negative: string[];
  }

  interface SentimentOptions {
    extras?: { [word: string]: number };
    language?: string;
  }

  class Sentiment {
    analyze(phrase: string, options?: SentimentOptions): SentimentResult;
    registerLanguage(languageCode: string, language: object): void;
  }

  export = Sentiment;
}
