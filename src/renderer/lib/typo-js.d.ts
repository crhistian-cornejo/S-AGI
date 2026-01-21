// Type declarations for typo-js spell checker library
declare module 'typo-js' {
    export default class Typo {
        constructor(
            dictionary: string,
            affData?: string | null,
            dicData?: string | null,
            settings?: {
                dictionaryPath?: string;
                asyncLoad?: boolean;
                loadedCallback?: (dict: Typo) => void;
            }
        );

        /**
         * Check if a word is spelled correctly
         */
        check(word: string): boolean;

        /**
         * Get spelling suggestions for a word
         * @param word - The word to get suggestions for
         * @param limit - Maximum number of suggestions to return
         */
        suggest(word: string, limit?: number): string[];

        /**
         * Whether the dictionary has been loaded
         */
        loaded: boolean;
    }
}
