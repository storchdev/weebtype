// Hand-written types for the vendored Yomitan deinflector (deinflect.js, GPLv3).
// Only the surface this project uses is declared.
export interface TransformedText {
  text: string;
  conditions: number;
  trace: unknown[];
}
export declare class LanguageTransformer {
  constructor();
  addDescriptor(descriptor: unknown): void;
  transform(sourceText: string): TransformedText[];
  getConditionFlagsFromPartsOfSpeech(partsOfSpeech: string[]): number;
  static conditionsMatch(currentConditions: number, nextConditions: number): boolean;
}
export declare const japaneseTransforms: unknown;
