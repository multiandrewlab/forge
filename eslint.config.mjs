import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import pluginVue from 'eslint-plugin-vue';

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.strict,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Prettier owns line-break formatting; disable conflicting Vue rules
      'vue/singleline-html-element-content-newline': 'off',
    },
  },
  {
    // Allow well-known single-word component names that match industry conventions
    // (Vuetify, PrimeVue, Naive UI, MUI all expose `Breadcrumbs` under that exact
    // name). Renaming to a 2-word local identifier would hide a familiar pattern.
    files: ['**/components/feedback/Breadcrumbs.vue'],
    rules: {
      'vue/multi-word-component-names': 'off',
    },
  },
  {
    ignores: [
      '**/dist/**',
      '**/coverage/**',
      '**/.gitkeep',
      '.claude/**',
      'scripts/**',
      'e2e/playwright-report/**',
      'e2e/test-results/**',
    ],
  },
);
