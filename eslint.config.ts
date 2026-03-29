import globals from 'globals'
import pluginJs from '@eslint/js'
import tseslint from 'typescript-eslint'
import pluginVue from 'eslint-plugin-vue'
import pluginPrettierRecommendedConfigs from 'eslint-plugin-prettier/recommended'
import path from 'path'
export default [
  {
    ignores: [
      'dist/**',
      'assets/**',
      '*.js',
      '*.ts',
      '*.d.ts',
      'vite.config.ts',
      'eslint.config.ts',
      'env.d.ts',
      'auto-imports.d.ts',
      'package.json',
      'node_modules/**',
      'depracate/**',
      'src/views/Draw.vue',
      'scripts/**',
      'duplicated/**',
      'duplictated/**',
      'core/pkg/**',
      '../ancient/**',
      '../bak/**',
      '../latest/**',
      '../old/**',
      '../WGPU/**',
    ],
  },
  // eslint 默认推荐规则
  pluginJs.configs.recommended,
  // ts 默认推荐规则
  ...tseslint.configs.recommended,
  // vue3 基础推荐规则
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['src/**/*.{js,ts,tsx,vue}', 'resource/**/*.{js,ts,tsx,vue}'],
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.es2020,
        ...globals.node,
      },
      ecmaVersion: 2020,

      parserOptions: {
        parser: tseslint.parser,
        tsconfigRootDir: path.dirname(__dirname),
      },
    },
  },
  pluginPrettierRecommendedConfigs,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'prettier/prettier': ['error', { usePrettierrc: true }],
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
]
