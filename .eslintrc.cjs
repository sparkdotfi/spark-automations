/* eslint-env node */

module.exports = {
  root: true,
  env: { es2020: true },
  extends: ['typestrict'],
  parser: '@typescript-eslint/parser',
  parserOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      project: true,
      tsconfigRootDir: __dirname,
  },
  plugins: ['simple-import-sort', 'unused-imports', 'import'],
  rules: {
      '@typescript-eslint/explicit-function-return-type': [
          'error',
          {
              allowExpressions: true,
              allowDirectConstAssertionInArrowFunctions: true,
          },
      ],
      '@typescript-eslint/no-useless-constructor': 'error',
      // this rule can't find automatically mistakes and needs to be guided
      'import/no-internal-modules': ['error', { forbid: ['**/abis/*'] }],
      'import/no-useless-path-segments': ['error', { noUselessIndex: true }],
      'no-console': 'error',
      'no-debugger': 'error',
      'no-with': 'error',
      'one-var': ['error', { initialized: 'never' }],
      'prefer-const': ['error', { destructuring: 'all' }],
      'simple-import-sort/exports': 'error',
      'simple-import-sort/imports': 'error',
      'unused-imports/no-unused-imports-ts': 'error',
  },
}
