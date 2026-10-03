import globals from 'globals'
import js from '@eslint/js'

export default [
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  {
    files: ['**/*.{js,mjs}'],
    languageOptions: {
      globals: {
        ...globals.node,
        // DSH 动态插件沙箱内由运行时注入的全局符号
        harness: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
      },
    },
    rules: {
      eqeqeq: ['error', 'always'],
      'no-var': 'error',
      'prefer-const': 'error',
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      'no-console': 'off',
    },
  },
  {
    // 浏览器半侧: classic script, 跑在 Web 客户端里 (window / document 由宿主提供)
    files: ['src/client.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
      },
    },
  },
]
