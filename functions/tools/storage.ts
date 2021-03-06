#!/usr/bin/env node

import * as chalk from 'chalk'
import * as inquirer from 'inquirer'
import * as program from 'commander'
import { AppConfig, DevAppConfig, ProdAppConfig, TestAppConfig } from '../src/config'
import {
  StorageNode,
  StorageNodeType,
  StorageSchema,
  StorageService,
  StorageServiceDI,
  StorageServiceModule,
  StorageUploadDataItem,
  UserServiceModule,
} from '../src/app/services'
import { arrayToDict, splitHierarchicalPaths } from 'web-base-lib'
import { createNestApplication, initFirebaseApp } from '../src/app/base'
import { Dayjs } from 'dayjs'
import { Module } from '@nestjs/common'
import { Storage } from '@google-cloud/storage'
import dayjs = require('dayjs')
import utc = require('dayjs/plugin/utc')

dayjs.extend(utc)

//========================================================================
//
//  Interfaces
//
//========================================================================

type OutputFormat = 'oneline' | 'json' | 'bulk' | 'tree'

interface Padding {
  id: number
  size: number
}

//========================================================================
//
//  Implementation
//
//========================================================================

@Module({
  imports: [StorageServiceModule, UserServiceModule],
})
class StorageToolModule {}

function getConfig(env: 'prod' | 'dev' | 'test'): AppConfig {
  let config: AppConfig
  switch (env) {
    case 'prod':
      config = new ProdAppConfig()
      break
    case 'dev':
      config = new DevAppConfig()
      break
    case 'test':
      config = new TestAppConfig()
      break
  }
  if (!config) {
    throw new Error(`The specified environment is invalid: '${env}'`)
  }
  return config
}

function print(nodes: StorageNode[], format: OutputFormat, specifiedPath?: string) {
  if (nodes.length === 0) return

  switch (format) {
    case 'oneline':
      printInOneLine(nodes, specifiedPath)
      return
    case 'json':
      printInJSON(nodes)
      return
    case 'bulk':
      printInBulk(nodes)
      return
    case 'tree':
      return
  }

  throw new Error(`An incorrect format was specified: ${format}`)
}

function printInOneLine(nodes: StorageNode[], specifiedPath?: string): void {
  const nodeDict = arrayToDict(nodes, 'path')
  const toDisplayPath = (node: StorageNode) => {
    return splitHierarchicalPaths(node.path).reduce((result, nodePath) => {
      const node = nodeDict[nodePath]
      const name = StorageService.getArticleLangLabel('ja', node.article?.label) || node.name
      return result ? `${result}/${name}` : name
    }, '')
  }

  const padding = getPadding(nodes)
  for (const node of nodes) {
    const nodePath = toDisplayPath(node)
    const content = `${formatDate(node.updatedAt)} ${formatSize(node, padding.size)} ${formatId(node.id, padding.id)} ${nodePath}`
    if (node.path === specifiedPath) {
      console.log(chalk.bold(content))
    } else {
      console.log(content)
    }
  }
}

function printInJSON(nodes: StorageNode[]): void {
  const objects = nodes.map(node => toNodeObject(node))
  const output = JSON.stringify(objects, null, 2)
  console.log(output)
}

function printInBulk(nodes: StorageNode[]): void {
  const objects = nodes.map(node => toNodeObject(node))
  let output = ''
  for (const object of objects) {
    output += `{"index":{"_index":"${StorageSchema.IndexAliases.test}","_id":"${object.id}"}}\n`
    output += `${JSON.stringify(object)}\n`
  }
  console.log(output)
}

function toNodeObject(node: StorageNode) {
  const { version, createdAt, updatedAt, ...others } = node
  return {
    ...others,
    version,
    createdAt: formatDate(node.createdAt),
    updatedAt: formatDate(node.updatedAt),
  }
}

function formatId(id: string, idLength: number): string {
  return id.padEnd(idLength, ' ')
}

function formatDate(date: Dayjs) {
  return dayjs.utc(date).local().format('YYYY-MM-DD HH:mm:ss')
}

function formatSize(node: StorageNode, sizeLength: number): string {
  if (sizeLength === 0) return ''

  const suffix = 'B'
  const padNum = sizeLength + suffix.length

  switch (node.nodeType) {
    case 'Dir': {
      return ``.padStart(padNum, ' ')
    }
    case 'File': {
      const sizeStr = `${node.size}${suffix}`
      return sizeStr.padStart(padNum, ' ')
    }
  }
}

function getPadding(nodes: StorageNode[]): Padding {
  return nodes.reduce(
    (result, node) => {
      if (node.id.length > result.id) {
        result.id = node.id.length
      }
      if (node.size.toString().length > result.size) {
        result.size = node.size.toString().length
      }
      return result
    },
    { size: 0 } as Padding
  )
}

function isId(id: string): boolean {
  // '/'を含んでいた場合、IDではない
  return !id.includes('/')
}

async function confirm(message = 'Continue...'): Promise<boolean> {
  const answers = await inquirer.prompt([
    {
      type: 'confirm',
      name: 'confirm',
      message,
    },
  ])
  return answers.confirm
}

//========================================================================
//
//  Commands
//
//========================================================================

program
  .command('node <id_or_path>')
  .option('-f, --format <type>', `select a format (default: 'oneline')`, 'oneline')
  .action(async (id_or_path: string, cmdObj: { format: OutputFormat; json?: boolean }) => {
    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(StorageServiceDI.symbol) as StorageServiceDI.type

    // まずはパスで検索
    let node = await storageService.getNode({ path: id_or_path })

    // パスで検索されなかったらノードIDで検索
    if (isId(id_or_path) && !node && id_or_path) {
      node = await storageService.getNode({ id: id_or_path })
    }

    // ノードが見つからなかったら終了
    if (!node) {
      console.log(chalk.yellow(`\nThe specified node was not found: '${id_or_path}'\n`))
      return
    }

    console.log() // 改行

    // 祖先ノードの取得
    const ancestors = await storageService.getAncestorDirs(node.path)

    // 結果を出力
    print([...ancestors, node], cmdObj.format, node.path)

    console.log() // 改行
  })

program
  .command('descendants <id_or_path>')
  .option('-f, --format <type>', `select a format (default: 'oneline')`, 'oneline')
  .action(async (id_or_path: string, cmdObj: { format: OutputFormat; json?: boolean }) => {
    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(StorageServiceDI.symbol) as StorageServiceDI.type

    // まずはパスで検索
    let node = await storageService.getNode({ path: id_or_path })

    // パスで検索されなかったらノードIDで検索
    if (isId(id_or_path) && !node && id_or_path) {
      node = await storageService.getNode({ id: id_or_path })
    }

    // ノードが見つからなかったら終了
    if (!node) {
      console.log(chalk.yellow(`\nThe specified node was not found: '${id_or_path}'\n`))
      return
    }

    // 指定されたノードのパスとタイプを取得
    const nodePath = node?.path ?? ''
    const nodeType = node?.nodeType ?? 'Dir'

    // 祖先ノードの取得
    const ancestors = await storageService.getAncestorDirs(nodePath)

    console.log() // 改行

    // 取得されたノードがディレクトリの場合
    if (nodeType === 'Dir') {
      const count = (await storageService.getDescendantsCount({ path: nodePath, includeBase: true })) + ancestors.length
      if (count > 1000) {
        if (!(await confirm(`There are ${count} search results. Do you want to display them?`))) return
      }
      const { list } = await storageService.getDescendants({ path: nodePath, includeBase: true }, { pageSize: count })
      StorageService.sortNodes(list)
      print([...ancestors, ...list], cmdObj.format, nodePath)
    }
    // 取得されたノードがファイルの場合
    else if (nodeType === 'File') {
      print([...ancestors, node!], cmdObj.format, nodePath)
    }

    console.log() // 改行
  })

program
  .command('children [id_or_path]')
  .option('-f, --format <type>', `select a format (default: 'oneline')`, 'oneline')
  .action(async (id_or_path: string, cmdObj: { format: OutputFormat; json?: boolean }) => {
    id_or_path = id_or_path ?? ''

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(StorageServiceDI.symbol) as StorageServiceDI.type

    // まずはパスで検索
    let node = await storageService.getNode({ path: id_or_path })

    // パスで検索されなかったらノードIDで検索
    if (isId(id_or_path) && !node && id_or_path) {
      node = await storageService.getNode({ id: id_or_path })
    }

    // パスで検索されなかったらノードIDで検索
    if (isId(id_or_path) && !node && id_or_path) {
      node = await storageService.getNode({ id: id_or_path })
    }

    // 指定されたノードのパスとタイプを取得
    const nodePath = node?.path ?? ''
    const nodeType = node?.nodeType ?? 'Dir'

    // 祖先ノードの取得
    const ancestors = await storageService.getAncestorDirs(nodePath)

    console.log() // 改行

    // 取得されたノードがディレクトリの場合
    if (nodeType === 'Dir') {
      const count = (await storageService.getChildrenCount({ path: nodePath, includeBase: true })) + ancestors.length
      if (count > 1000) {
        if (!(await confirm(`There are ${count} search results. Do you want to display them?`))) return
      }
      const { list } = await storageService.getChildren({ path: nodePath, includeBase: true }, { pageSize: count })
      StorageService.sortNodes(list)
      print([...ancestors, ...list], cmdObj.format, nodePath)
    }
    // 取得されたノードがファイルの場合
    else if (nodeType === 'File') {
      print([...ancestors, node!], cmdObj.format, nodePath)
    }

    console.log() // 改行
  })

program
  .command('remove <id_or_path>')
  .description('removes a node with a specified nodeId or nodePath.')
  .action(async (id_or_path: string) => {
    if (!(await confirm('Are you sure you want to remove node?'))) return

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(StorageServiceDI.symbol) as StorageServiceDI.type

    // まずはパスで検索
    let node = await storageService.getNode({ path: id_or_path })

    // パスで検索されなかったらノードIDで検索
    if (isId(id_or_path) && !node) {
      node = await storageService.getNode({ id: id_or_path })
    }

    // ノードが見つからなかったら終了
    if (!node) {
      console.log(chalk.yellow(`\nThe specified node was not found: '${id_or_path}'\n`))
      return
    }

    // ノードを削除
    switch (node.nodeType) {
      case 'Dir': {
        await storageService.removeDir(node)
        break
      }
      case 'File': {
        await storageService.removeFile(node)
        break
      }
    }
  })

program
  .command('create:dir <dirPath>')
  .description('create directories.')
  .action(async (dirPath: string) => {
    if (!(await confirm('Are you sure you want to create directories?'))) return

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(StorageServiceDI.symbol) as StorageServiceDI.type

    await storageService.createHierarchicalDirs([dirPath])
  })

program
  .command('create:test-files <dirPath>')
  .option('-n --num <num>', 'number of files to be created', '10')
  .action(async (dirPath: string, cmdObj: { num: number }) => {
    const { num } = cmdObj

    if (!(await confirm(`Are you sure you want to upload ${num} test files?`))) return

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(StorageServiceDI.symbol) as StorageServiceDI.type

    await storageService.createHierarchicalDirs([dirPath])

    const uploadItems: StorageUploadDataItem[] = []
    for (let i = 1; i <= num; i++) {
      const fileNamePrefix = `file${i.toString(10).padStart(num.toString(10).length, '0')}`
      const filePath = `${dirPath}/${fileNamePrefix}.txt`
      uploadItems.push({
        data: `${fileNamePrefix}`,
        contentType: 'text/plain; charset=utf-8',
        path: filePath,
      })
    }

    await storageService.uploadDataItems(uploadItems)
  })

program
  .command('create:test-dirs <dirPath>')
  .option('-n --num <num>', 'number of directories to be created', '10')
  .action(async (dirPath: string, cmdObj: { num: number }) => {
    const { num } = cmdObj

    if (!(await confirm(`Are you sure you want to create ${num} test directories?`))) return

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(StorageServiceDI.symbol) as StorageServiceDI.type

    const testDirPaths: string[] = []
    for (let i = 1; i <= num; i++) {
      const dirNamePrefix = `dir${i.toString(10).padStart(num.toString(10).length, '0')}`
      const testDriPath = `${dirPath}/${dirNamePrefix}`
      testDirPaths.push(testDriPath)
    }

    await storageService.createHierarchicalDirs(testDirPaths)
  })

program
  .command('cors:set <env>')
  .description('set up CORS on the bucket.', {
    env: 'specify the environment (choices: "prod", "dev", "test")',
  })
  .action(async (env: 'prod' | 'dev' | 'test') => {
    const config = getConfig(env)
    const storage = new Storage()
    await storage.bucket(config.storage.bucket).setCorsConfiguration([
      {
        maxAgeSeconds: 3600,
        method: ['GET', 'HEAD', 'DELETE'],
        origin: config.cors.whitelist,
        responseHeader: ['Content-Type'],
      },
    ])
  })

program
  .command('cors:get <env>')
  .description('get the CORS on the bucket.', {
    env: 'specify the environment (choices: "prod", "dev", "test")',
  })
  .action(async (env: 'prod' | 'dev' | 'test') => {
    const config = getConfig(env)
    const storage = new Storage()
    const [metadata] = await storage.bucket(config.storage.bucket).getMetadata()

    console.log(`\nBucket: ${config.storage.bucket}\n`)
    console.log(JSON.stringify(metadata.cors, null, 2))
    console.log('') // 改行
  })

program.parseAsync(process.argv)
