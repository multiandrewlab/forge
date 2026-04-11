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
    ignores: ['**/dist/**', '**/coverage/**', '**/.gitkeep', '.claude/**', 'scripts/**'],
  },
);
