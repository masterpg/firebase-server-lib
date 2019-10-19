#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gql_1 = require("../gql");
const argv = require('yargs').argv;
const srcPath = argv._[0];
const outPath = argv._[1];
const watch = argv.watch;
gql_1.generateSchema(srcPath, outPath, watch);
//# sourceMappingURL=gql.generate.schema.js.map