#!/usr/bin/env node

const { generateSchema } = require('./gql')

const argv = require('yargs').argv
const srcPath = argv._[0]
const outPath = argv._[1]
const watch = argv.watch

generateSchema(srcPath, outPath, watch)
