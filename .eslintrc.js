const prettierConfig = require('./prettier.config')

module.exports = {
  'root': true,
  'env': {
    'node': true,
  },
  'parserOptions': {
    'parser': '@typescript-eslint/parser',
  },
  'extends': [
    'eslint:recommended',
    'plugin:vue/recommended',
    '@vue/typescript',
    'prettier',
  ],
  'plugins': ['@typescript-eslint', 'prettier'],
  'rules': {
    'prettier/prettier': ['error', prettierConfig],
    'array-bracket-spacing': ['error', 'never'],
    'comma-dangle': [
      'error',
      {
        'arrays': 'always-multiline',
        'objects': 'always-multiline',
        'imports': 'always-multiline',
        'exports': 'always-multiline',
        'functions': 'never',
      },
    ],
    'comma-spacing': ['error', {'before': false, 'after': true}],
    'computed-property-spacing': ['error', 'never'],
    'no-console': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-debugger': process.env.NODE_ENV === 'production' ? 'error' : 'off',
    'no-dupe-class-members': 'off',
    'no-unreachable': 'error',
    'no-var': 'error',
    'quotes': ['error', 'single', { 'allowTemplateLiterals': true }],
    'semi': ['error', 'never', {'beforeStatementContinuationChars': 'never'}],
    'sort-imports': ['error'],
    'space-before-function-paren': [
      'error',
      {
        'anonymous': 'never',
        'named': 'never',
        'asyncArrow': 'always',
      },
    ],
    'space-in-parens': ['error', 'never'],
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/explicit-member-accessibility': 'off',
    '@typescript-eslint/indent': ['off', 2],
    '@typescript-eslint/member-delimiter-style': [
      'error',
      {
        'multiline': {
          'delimiter': 'none',
        },
        'singleline': {
          'delimiter': 'semi',
          'requireLast': false,
        },
      },
    ],
    '@typescript-eslint/no-angle-bracket-type-assertion': ['error'],
    '@typescript-eslint/no-explicit-any': 'off',
    '@typescript-eslint/no-non-null-assertion': 'off',
    '@typescript-eslint/no-unused-vars': 'off',
    '@typescript-eslint/no-use-before-define': 'off',
    '@typescript-eslint/no-var-requires': 'off',
    '@typescript-eslint/type-annotation-spacing': ['error'],
    'vue/html-self-closing': 'off',
    'vue/max-attributes-per-line': 'off',
    'vue/singleline-html-element-content-newline': 'off',
  },
}
