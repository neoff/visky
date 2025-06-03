// eslint.config.mjs
import tsPlugin from '@typescript-eslint/eslint-plugin'
import tsParser from '@typescript-eslint/parser'
import js from '@eslint/js'
import globals from 'globals'

export default [
    {
        ignores: [
            'dist/**',
            'tmp/**',
            'node_modules/**',
        ],
    },
    {
        languageOptions: {
            parser: tsParser,
            ecmaVersion: 'latest',
            sourceType: 'module',
            globals: {
                ...globals.browser,
                ...globals.node,
                window: true,
                document: true,
                setInterval: true,
                clearInterval: true,
                console: true,
                process: true,
                __dirname: true,
            },
        },
        plugins: {
            '@typescript-eslint': tsPlugin,
        },
        rules: {
            ...js.configs.recommended.rules,
            ...tsPlugin.configs.recommended.rules,
            'no-unused-vars': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-unused-vars': ['error', {
                argsIgnorePattern: '^_',        // аргументы, начинающиеся с "_" — не проверять
                varsIgnorePattern: '^_',        // переменные, начинающиеся с "_" — не проверять
                caughtErrorsIgnorePattern: '^_',// ошибки, начинающиеся с "_" — не проверять
            }],
        },
    },
]