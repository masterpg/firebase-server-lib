#!/usr/bin/env node

import * as chalk from 'chalk'
import * as inquirer from 'inquirer'
import * as program from 'commander'
import {
  StorageNode,
  StorageNodeType,
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
import dayjs = require('dayjs')
import utc = require('dayjs/plugin/utc')

dayjs.extend(utc)

//========================================================================
//
//  Interfaces
//
//========================================================================

type OutputFormat = 'oneline' | 'json' | 'tree'

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

function print(nodes: StorageNode[], format: OutputFormat, specifiedPath?: string) {
  if (nodes.length === 0) return

  switch (format) {
    case 'oneline':
      printInOneLine(nodes, specifiedPath)
      return
    case 'json':
      printInJSON(nodes)
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
      const name = node.article?.dir?.name || node.name
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
    const nodeType = node?.nodeType ?? StorageNodeType.Dir

    // 祖先ノードの取得
    const ancestors = await storageService.getAncestorDirs(nodePath)

    console.log() // 改行

    // 取得されたノードがディレクトリの場合
    if (nodeType === StorageNodeType.Dir) {
      const count = (await storageService.getDirDescendantCount(nodePath)) + ancestors.length
      if (count > 1000) {
        if (!(await confirm(`There are ${count} search results. Do you want to display them?`))) return
      }
      const { list } = await storageService.getDirDescendants(nodePath, { maxChunk: count })
      StorageService.sortNodes(list)
      print([...ancestors, ...list], cmdObj.format, nodePath)
    }
    // 取得されたノードがファイルの場合
    else if (nodeType === StorageNodeType.File) {
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
    const nodeType = node?.nodeType ?? StorageNodeType.Dir

    // 祖先ノードの取得
    const ancestors = await storageService.getAncestorDirs(nodePath)

    console.log() // 改行

    // 取得されたノードがディレクトリの場合
    if (nodeType === StorageNodeType.Dir) {
      const count = (await storageService.getDirChildCount(nodePath)) + ancestors.length
      if (count > 1000) {
        if (!(await confirm(`There are ${count} search results. Do you want to display them?`))) return
      }
      const { list } = await storageService.getDirChildren(nodePath, { maxChunk: count })
      StorageService.sortNodes(list)
      print([...ancestors, ...list], cmdObj.format, nodePath)
    }
    // 取得されたノードがファイルの場合
    else if (nodeType === StorageNodeType.File) {
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
      case StorageNodeType.Dir: {
        await storageService.removeDir(node.path)
        break
      }
      case StorageNodeType.File: {
        await storageService.removeFile(node.path)
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

program.parseAsync(process.argv)
