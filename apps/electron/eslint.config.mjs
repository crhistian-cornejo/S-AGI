/**
 * ESLint Configuration for Electron App
 *
 * Uses flat config format (ESLint 9+).
 * Includes custom rules for security and best practices.
 */

import tsParser from '@typescript-eslint/parser'
import tsPlugin from '@typescript-eslint/eslint-plugin'
import reactPlugin from 'eslint-plugin-react'
import reactHooksPlugin from 'eslint-plugin-react-hooks'
import noProcessEnv from './eslint-rules/no-process-env.cjs'

export default [
    // Ignore patterns
    {
        ignores: [
            'dist/**',
            'node_modules/**',
            'out/**',
            '*.cjs',
            'eslint-rules/**',
        ],
    },

    // TypeScript/React files (renderer only)
    {
        files: ['renderer/**/*.{ts,tsx}'],
        languageOptions: {
            parser: tsParser,
            parserOptions: {
                ecmaVersion: 'latest',
                sourceType: 'module',
                ecmaFeatures: {
                    jsx: true,
                },
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
            react: reactPlugin,
            'react-hooks': reactHooksPlugin,
            // Custom plugin for security rules
            'sagi-security': {
                rules: {
                    'no-process-env': noProcessEnv,
                },
            },
        },
        settings: {
            react: {
                version: 'detect',
            },
        },
        rules: {
            // React Hooks rules
            'react-hooks/rules-of-hooks': 'error',
            'react-hooks/exhaustive-deps': 'warn',

            // Custom security rule
            'sagi-security/no-process-env': 'error',
        },
    },
]
