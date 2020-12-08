#!/usr/bin/env node

import * as chalk from 'chalk'
import * as inquirer from 'inquirer'
import * as program from 'commander'
import {
  AppStorageServiceDI,
  AppStorageServiceModule,
  StorageNode,
  StorageNodeType,
  StorageUploadDataItem,
  UserServiceDI,
  UserServiceModule,
} from '../app/services'
import { arrayToDict, splitHierarchicalPaths } from 'web-base-lib'
import { createNestApplication, initFirebaseApp } from '../app/base'
import { Dayjs } from 'dayjs'
import { Module } from '@nestjs/common'
import dayjs = require('dayjs')
import utc = require('dayjs/plugin/utc')

dayjs.extend(utc)

//========================================================================
//
//  Interfaces
//
//========================================================================

type OutputFormat = 'oneline' | 'json' | 'object' | 'tree'

interface Padding {
  id: number
  size: number
}

const maxChunk = 10000

//========================================================================
//
//  Implementation
//
//========================================================================

@Module({
  imports: [AppStorageServiceModule, UserServiceModule],
})
class StorageToolModule {}

function print(nodes: StorageNode[], ancestors: StorageNode[], format: OutputFormat) {
  if (nodes.length === 0) return

  switch (format) {
    case 'oneline':
      printInOneLine(nodes, ancestors)
      return
    case 'json':
      printInJSON(nodes)
      return
    case 'object':
      printInObject(nodes)
      return
    case 'tree':
      return
  }

  throw new Error(`An incorrect format was specified: ${format}`)
}

function printInOneLine(nodes: StorageNode[], ancestors: StorageNode[]): void {
  const nodeDict = arrayToDict([...nodes, ...ancestors], 'path')
  const toDisplayPath = (node: StorageNode) => {
    return splitHierarchicalPaths(node.path).reduce((result, nodePath) => {
      const node = nodeDict[nodePath]
      const name = node.articleNodeName ? node.articleNodeName : node.name
      return result ? `${result}/${name}` : name
    }, '')
  }

  const padding = getPadding(nodes)
  for (const node of nodes) {
    const nodePath = toDisplayPath(node)
    console.log(`${formatDate(node.updatedAt)} ${formatSize(node, padding.size)} ${formatId(node.id, padding.id)} ${nodePath}`)
  }
}

function printInJSON(nodes: StorageNode[]): void {
  const objects = nodes.map(node => toNodeObject(node))
  const output = JSON.stringify(objects, null, 2)
  console.log(output)
}

function printInObject(nodes: StorageNode[]): void {
  const objects = nodes.map(node => toNodeObject(node))
  console.log(objects)
}

function toNodeObject(node: StorageNode) {
  return {
    id: node.id,
    nodeType: node.nodeType,
    name: node.name,
    dir: node.dir,
    path: node.path,
    contentType: node.contentType,
    size: node.size,
    share: node.share,
    articleNodeName: node.articleNodeName,
    articleNodeType: node.articleNodeType,
    articleSortOrder: node.articleSortOrder,
    isArticleFile: node.isArticleFile,
    version: node.share,
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
    case StorageNodeType.Dir: {
      return ``.padStart(padNum, ' ')
    }
    case StorageNodeType.File: {
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
  .action(async (id_or_path: string, cmdObj: { format: OutputFormat; json?: boolean; object?: boolean }) => {
    id_or_path = id_or_path ?? ''

    // ノードID/パスが指定されなかった場合
    if (!id_or_path) {
      console.log(chalk.red(`\nThere is no nodeId/nodePath specification.\n`))
      return
    }

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(AppStorageServiceDI.symbol) as AppStorageServiceDI.type
    const userService = nestApp.get(UserServiceDI.symbol) as UserServiceDI.type

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

    // 取得されたノードがファイルの場合
    if (node.nodeType === StorageNodeType.File) {
      print([node], ancestors, cmdObj.format)
    }
    // 取得されたノードがディレクトリの場合
    else if (node.nodeType === StorageNodeType.Dir) {
      const pagination = await storageService.getDirDescendants(node.path, { maxChunk })
      print(pagination.list, ancestors, cmdObj.format)
      if (pagination.nextPageToken) {
        console.log(chalk.yellow(`\nThe specified directory has reached the display limit: '${id_or_path}'`))
      }
    }

    console.log() // 改行
  })

program
  .command('dir [id_or_path]')
  .option('-f, --format <type>', `select a format (default: 'oneline')`, 'oneline')
  .action(async (id_or_path: string, cmdObj: { format: OutputFormat; json?: boolean }) => {
    id_or_path = id_or_path ?? ''

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(AppStorageServiceDI.symbol) as AppStorageServiceDI.type

    // まずはパスで検索
    let nodePath = id_or_path
    let pagination = await storageService.getDirChildren(nodePath, { maxChunk })

    // パスで検索されなかったらノードIDで検索
    if (isId(id_or_path) && !pagination.list.length && id_or_path) {
      const node = await storageService.getNode({ id: id_or_path })
      if (node) {
        nodePath = node.path
        pagination = await storageService.getDirChildren(nodePath, { maxChunk })
      }
    }

    console.log() // 改行

    // 祖先ノードの取得
    const ancestors = await storageService.getAncestorDirs(nodePath)

    // 検索結果をコンソール出力
    print(pagination.list, ancestors, cmdObj.format)

    // ディレクトリが見つからなかった場合
    if (!pagination.list.length) {
      console.log(chalk.yellow(`The specified directory was not found: '${id_or_path}'`))
    }
    // ディレクトリ直下の子ノードの数が表示上限に達した場合
    else if (pagination.nextPageToken) {
      console.log(chalk.yellow(`\nThe specified directory has reached the display limit: '${id_or_path}'`))
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
    const storageService = nestApp.get(AppStorageServiceDI.symbol) as AppStorageServiceDI.type

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
      case StorageNodeType.Dir: {
        await storageService.removeDir(node.path, { maxChunk: 100000000 })
        break
      }
      case StorageNodeType.File: {
        await storageService.removeFile(node.path)
        break
      }
    }
  })

program
  .command('mkdir <dirPath>')
  .description('create directories.')
  .action(async (dirPath: string) => {
    if (!(await confirm('Are you sure you want to create directories?'))) return

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(AppStorageServiceDI.symbol) as AppStorageServiceDI.type

    await storageService.createHierarchicalDirs([dirPath])
  })

program
  .command('test-files <dirPath>')
  .option('-n --num <num>', 'number of files to be created', '10')
  .action(async (dirPath: string, cmdObj: { num: number }) => {
    const { num } = cmdObj

    if (!(await confirm(`Are you sure you want to upload ${num} test files?`))) return

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(AppStorageServiceDI.symbol) as AppStorageServiceDI.type

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
  .command('test-dirs <dirPath>')
  .option('-n --num <num>', 'number of directories to be created', '10')
  .action(async (dirPath: string, cmdObj: { num: number }) => {
    const { num } = cmdObj

    if (!(await confirm(`Are you sure you want to create ${num} test directories?`))) return

    initFirebaseApp()
    const nestApp = await createNestApplication(StorageToolModule)
    const storageService = nestApp.get(AppStorageServiceDI.symbol) as AppStorageServiceDI.type

    const testDirPaths: string[] = []
    for (let i = 1; i <= num; i++) {
      const dirNamePrefix = `dir${i.toString(10).padStart(num.toString(10).length, '0')}`
      const testDriPath = `${dirPath}/${dirNamePrefix}`
      testDirPaths.push(testDriPath)
    }

    await storageService.createHierarchicalDirs(testDirPaths)
  })

program.parseAsync(process.argv)
