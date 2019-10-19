#!/usr/bin/env node

import { generateSchema } from '../gql'

const argv = require('yargs').argv
const srcPath = argv._[0] as string
const outPath = argv._[1] as string
const watch = argv.watch as boolean

generateSchema(srcPath, outPath, watch)
