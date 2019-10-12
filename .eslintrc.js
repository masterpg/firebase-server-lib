const merge = require('lodash/merge')

const prettierConfig = require('./prettier.config')

const eslintConfig = merge(
  require('web-base-lib/.eslintrc.base.js'),
  {
    'rules': {
      'prettier/prettier': ['error', prettierConfig],
    },
  },
)

module.exports = eslintConfig
