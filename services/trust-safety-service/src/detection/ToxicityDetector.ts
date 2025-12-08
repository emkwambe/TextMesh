// =================================
// TEXTMESH TOXICITY DETECTOR
// Content Toxicity Analysis
// =================================

// ============ TOXICITY RESULT TYPE ============

export interface ToxicityResult {
  toxicity: number;
  harassment: number;
  hateSpeech: number;
  violence: number;
  sexualContent: number;
  selfHarm: number;
  threat: number;
  insult: number;
  profanity: number;
  confidence: number;
  flaggedPhrases: FlaggedPhrase[];
}

interface FlaggedPhrase {
  text: string;
  category: string;
  severity: number;
  startIndex: number;
  endIndex: number;
}

// ============ TOXICITY PATTERNS ============

const HATE_SPEECH_PATTERNS = [
  // Racist slurs and patterns (redacted but would be comprehensive)
  /\b(racial_slur_placeholder)\b/gi,
];

const VIOLENCE_PATTERNS = [
  /\b(kill|murder|shoot|stab|attack)\s+(you|them|him|her|everyone)\b/gi,
  /\b(i('ll|'m going to|will))\s+(kill|hurt|attack)\b/gi,
  /\bdeath\s+threat\b/gi,
];

const HARASSMENT_PATTERNS = [
  /\b(you('re|r)?|ur)\s+(stupid|dumb|idiot|moron|ugly|fat|worthless)\b/gi,
  /\bkill\s+yourself\b/gi,
  /\bgo\s+die\b/gi,
  /\bnobody\s+(likes|loves|wants)\s+you\b/gi,
];

const SELF_HARM_PATTERNS = [
  /\b(want|going)\s+to\s+(die|end\s+it|kill\s+myself)\b/gi,
  /\bsuicid(e|al)\b/gi,
  /\bself[\s-]?harm\b/gi,
];

const SEXUAL_CONTENT_PATTERNS = [
  // Explicit content patterns (redacted)
];

// ============ TOXICITY KEYWORDS ============

const PROFANITY_LIST = new Set([
  // Common profanity (would be comprehensive)
  'damn', 'hell', 'crap',
  // More severe words would be included
]);

const SLUR_LIST = new Set([
  // Slurs and derogatory terms (would be comprehensive)
]);

// ============ TOXICITY DETECTOR CLASS ============

export class ToxicityDetector {
  /**
   * Analyze content for toxicity
   */
  async analyze(content: string): Promise<ToxicityResult> {
    const normalizedContent = this.normalizeContent(content);
    const flaggedPhrases: FlaggedPhrase[] = [];

    // Calculate individual scores
    const toxicityScore = this.calculateToxicityScore(normalizedContent, flaggedPhrases);
    const harassmentScore = this.detectHarassment(normalizedContent, flaggedPhrases);
    const hateSpeechScore = this.detectHateSpeech(normalizedContent, flaggedPhrases);
    const violenceScore = this.detectViolence(normalizedContent, flaggedPhrases);
    const sexualScore = this.detectSexualContent(normalizedContent, flaggedPhrases);
    const selfHarmScore = this.detectSelfHarm(normalizedContent, flaggedPhrases);
    const threatScore = this.detectThreats(normalizedContent, flaggedPhrases);
    const insultScore = this.detectInsults(normalizedContent, flaggedPhrases);
    const profanityScore = this.detectProfanity(normalizedContent, flaggedPhrases);

    // Calculate confidence based on matches and content length
    const confidence = this.calculateConfidence(
      normalizedContent,
      flaggedPhrases,
      toxicityScore
    );

    return {
      toxicity: toxicityScore,
      harassment: harassmentScore,
      hateSpeech: hateSpeechScore,
      violence: violenceScore,
      sexualContent: sexualScore,
      selfHarm: selfHarmScore,
      threat: threatScore,
      insult: insultScore,
      profanity: profanityScore,
      confidence,
      flaggedPhrases,
    };
  }

  /**
   * Quick check if content is likely toxic (for real-time filtering)
   */
  async quickCheck(content: string): Promise<boolean> {
    const normalizedContent = this.normalizeContent(content);

    // Check for obvious patterns
    for (const pattern of [
      ...HATE_SPEECH_PATTERNS,
      ...VIOLENCE_PATTERNS,
      ...HARASSMENT_PATTERNS,
    ]) {
      if (pattern.test(normalizedContent)) {
        return true;
      }
    }

    // Check for slurs
    const words = normalizedContent.split(/\s+/);
    for (const word of words) {
      if (SLUR_LIST.has(word.toLowerCase())) {
        return true;
      }
    }

    return false;
  }

  /**
   * Normalize content for analysis
   */
  private normalizeContent(content: string): string {
    return content
      .toLowerCase()
      // Handle common evasion techniques
      .replace(/0/g, 'o')
      .replace(/1/g, 'i')
      .replace(/3/g, 'e')
      .replace(/4/g, 'a')
      .replace(/5/g, 's')
      .replace(/\$/g, 's')
      .replace(/@/g, 'a')
      // Remove extra spaces
      .replace(/\s+/g, ' ')
      // Remove special characters between letters (n.i.g.g.e.r -> n i g g e r)
      .replace(/(\w)[.\-_]+(\w)/g, '$1 $2')
      .trim();
  }

  /**
   * Calculate overall toxicity score
   */
  private calculateToxicityScore(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    let score = 0;

    // Check profanity
    const words = content.split(/\s+/);
    const profanityCount = words.filter((w) => PROFANITY_LIST.has(w)).length;
    score += Math.min(0.3, profanityCount * 0.05);

    // Check for patterns
    for (const pattern of [...HARASSMENT_PATTERNS, ...VIOLENCE_PATTERNS]) {
      if (pattern.test(content)) {
        score += 0.2;
      }
    }

    // Normalize
    return Math.min(1.0, score);
  }

  /**
   * Detect harassment
   */
  private detectHarassment(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    let score = 0;

    for (const pattern of HARASSMENT_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        score += 0.3;
        matches.forEach((match) => {
          const index = content.indexOf(match);
          flaggedPhrases.push({
            text: match,
            category: 'harassment',
            severity: 0.7,
            startIndex: index,
            endIndex: index + match.length,
          });
        });
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Detect hate speech
   */
  private detectHateSpeech(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    let score = 0;

    // Check for slurs
    const words = content.split(/\s+/);
    for (const word of words) {
      if (SLUR_LIST.has(word)) {
        score += 0.5;
        const index = content.indexOf(word);
        flaggedPhrases.push({
          text: word,
          category: 'hate_speech',
          severity: 0.9,
          startIndex: index,
          endIndex: index + word.length,
        });
      }
    }

    // Check for patterns
    for (const pattern of HATE_SPEECH_PATTERNS) {
      if (pattern.test(content)) {
        score += 0.4;
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Detect violence
   */
  private detectViolence(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    let score = 0;

    for (const pattern of VIOLENCE_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        score += 0.4;
        matches.forEach((match) => {
          const index = content.indexOf(match);
          flaggedPhrases.push({
            text: match,
            category: 'violence',
            severity: 0.8,
            startIndex: index,
            endIndex: index + match.length,
          });
        });
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Detect sexual content
   */
  private detectSexualContent(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    let score = 0;

    for (const pattern of SEXUAL_CONTENT_PATTERNS) {
      if (pattern.test(content)) {
        score += 0.3;
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Detect self-harm content
   */
  private detectSelfHarm(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    let score = 0;

    for (const pattern of SELF_HARM_PATTERNS) {
      const matches = content.match(pattern);
      if (matches) {
        score += 0.5;
        matches.forEach((match) => {
          const index = content.indexOf(match);
          flaggedPhrases.push({
            text: match,
            category: 'self_harm',
            severity: 0.95,
            startIndex: index,
            endIndex: index + match.length,
          });
        });
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Detect threats
   */
  private detectThreats(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    const threatPatterns = [
      /\b(i('ll|'m going to|will))\s+(find|get|hurt|kill)\s+you\b/gi,
      /\byou('re|r)?\s+dead\b/gi,
      /\bwatch\s+your\s+back\b/gi,
    ];

    let score = 0;

    for (const pattern of threatPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        score += 0.4;
        matches.forEach((match) => {
          const index = content.indexOf(match);
          flaggedPhrases.push({
            text: match,
            category: 'threat',
            severity: 0.85,
            startIndex: index,
            endIndex: index + match.length,
          });
        });
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Detect insults
   */
  private detectInsults(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    const insultPatterns = [
      /\b(idiot|moron|stupid|dumb|loser|pathetic)\b/gi,
    ];

    let score = 0;

    for (const pattern of insultPatterns) {
      const matches = content.match(pattern);
      if (matches) {
        score += 0.2 * matches.length;
      }
    }

    return Math.min(1.0, score);
  }

  /**
   * Detect profanity
   */
  private detectProfanity(
    content: string,
    flaggedPhrases: FlaggedPhrase[]
  ): number {
    const words = content.split(/\s+/);
    const profanityWords = words.filter((w) => PROFANITY_LIST.has(w));

    profanityWords.forEach((word) => {
      const index = content.indexOf(word);
      flaggedPhrases.push({
        text: word,
        category: 'profanity',
        severity: 0.3,
        startIndex: index,
        endIndex: index + word.length,
      });
    });

    return Math.min(1.0, profanityWords.length * 0.1);
  }

  /**
   * Calculate confidence score
   */
  private calculateConfidence(
    content: string,
    flaggedPhrases: FlaggedPhrase[],
    toxicityScore: number
  ): number {
    // Base confidence
    let confidence = 0.7;

    // Higher confidence with more matches
    confidence += Math.min(0.2, flaggedPhrases.length * 0.05);

    // Lower confidence for short content (might be out of context)
    if (content.length < 20) {
      confidence -= 0.1;
    }

    // Higher confidence for clear toxicity patterns
    if (toxicityScore > 0.8) {
      confidence += 0.1;
    }

    return Math.min(1.0, Math.max(0.3, confidence));
  }
}

export default ToxicityDetector;
