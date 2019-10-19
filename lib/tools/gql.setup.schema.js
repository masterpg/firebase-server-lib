#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const gql_1 = require("../gql");
const argv = require('yargs').argv;
const srcPath = argv._[0];
const outPath = argv._[1];
const watch = argv.watch;
gql_1.setupSchema(srcPath, outPath, watch);
//# sourceMappingURL=gql.setup.schema.js.map