import js from '@eslint/js'
import globals from 'globals'
import tseslint from 'typescript-eslint'

const trackedSource = [
  'api/**/*.{js,ts}',
  'fixtures/**/*.{js,ts}',
  'scripts/**/*.{js,ts}',
  'src/**/*.{js,ts}',
  'test/**/*.{js,ts}',
  '*.{js,ts,mjs,cjs}'
]

const typedProject = [
  'api/**/*.ts',
  'src/**/*.ts',
  'test/**/*.ts',
  'vite.config.ts',
  'vitest.config.ts',
  'playwright.config.ts'
]

export default tseslint.config(
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'test-results/**',
      'playwright-report/**',
      'public/**'
    ]
  },
  {
    files: trackedSource,
    linterOptions: {
      reportUnusedDisableDirectives: 'error'
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.node
    }
  },
  {
    files: trackedSource,
    ...js.configs.recommended
  },
  ...tseslint.configs.recommended,
  {
    files: trackedSource,
    rules: {
      // Existing chart/UI bindings use explicit `any`; a typing rewrite is out of scope.
      '@typescript-eslint/no-explicit-any': 'off',
      // TypeScript already owns unused-name policy (`noUnusedLocals: false`).
      '@typescript-eslint/no-unused-vars': 'off',
      'no-unused-vars': 'off',
      // Sequential await-and-reassign is a known false positive for this rule.
      'require-atomic-updates': 'off',
      // Validators and tests intentionally match ASCII control characters.
      'no-control-regex': 'off',
      // Error-wrapping style is outside this correctness gate.
      'preserve-caught-error': 'off',
      'no-constructor-return': 'error',
      'no-promise-executor-return': 'error',
      'no-self-compare': 'error',
      'no-template-curly-in-string': 'error',
      'no-unmodified-loop-condition': 'error',
      'no-unreachable-loop': 'error',
      'no-useless-backreference': 'error'
    }
  },
  {
    files: typedProject,
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error'
    }
  }
)
