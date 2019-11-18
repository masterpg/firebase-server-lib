#!/usr/bin/env node

const { setupSchema } = require('./gql')

const argv = require('yargs').argv
const srcPath = argv._[0]
const outPath = argv._[1]
const watch = argv.watch

setupSchema(srcPath, outPath, watch)
