import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as path from 'path'
import * as shortid from 'shortid'
import * as td from 'testdouble'
import {
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  GCSStorageNode,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareSettings,
  StorageNodeType,
  StorageService,
  StorageServiceDI,
  StorageUploadDataItem,
} from '../../../../../src/lib/services'
import { InputValidationError, initLib } from '../../../../../src/lib/base'
import { Test, TestingModule } from '@nestjs/testing'
import { arrayToDict, removeBothEndsSlash } from 'web-base-lib'
import { newTestStorageDirNode, newTestStorageFileNode } from '../../../../helpers/common/storage'
import { MockStorageRESTModule } from '../../../../mocks/lib/rest/storage'
import { Response } from 'supertest'
import { config } from '../../../../../src/config'
import dayjs = require('dayjs')
import request = require('supertest')

jest.setTimeout(900000)
initLib()

//========================================================================
//
//  Test data
//
//========================================================================

const TEST_FILES_DIR = 'test-files'

//========================================================================
//
//  Test helpers
//
//========================================================================

let testingModule!: TestingModule

let storageService!: TestStorageService

let devUtilsService!: DevUtilsServiceDI.type

type TestStorageService = StorageService & {
  saveDirNode: StorageService['saveDirNode']
  saveFileNode: StorageService['saveFileNode']
  toStorageNode: StorageService['toStorageNode']
  toStorageNodeAsync: StorageService['toStorageNodeAsync']
  sortStorageNodes: StorageService['sortStorageNodes']
  padDirNodes: StorageService['padDirNodes']
  validatePath: StorageService['validatePath']
  validateDirName: StorageService['validateDirName']
  validateFileName: StorageService['validateFileName']
  saveMetadata: StorageService['saveMetadata']
}

/**
 * 指定された`StorageNode`自体の検証と、対象のノードがCloud Storageに存在することを検証します。
 * @param basePath
 * @param nodes
 */
async function existsNodes(basePath: string | null, nodes: StorageNode[]): Promise<void> {
  const bucket = admin.storage().bucket()
  for (const node of nodes) {
    // idが設定されていることを検証
    expect(shortid.isValid(node.id)).toBeTruthy()
    // ディレクトリの末尾が'/'でないことを検証
    expect(node.dir.endsWith('/')).toBeFalsy()
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(path.join(node.dir, node.name))
    // Cloud Storageに対象のノードが存在することを検証
    let nodePath = basePath ? `${removeBothEndsSlash(basePath)}/${node.path}` : node.path
    nodePath += node.nodeType === StorageNodeType.Dir ? '/' : ''
    const gcsNode = bucket.file(nodePath)
    const [exists] = await gcsNode.exists()
    expect(exists).toBeTruthy()
  }
}

/**
 * 指定された`StorageNode`自体の検証と、対象のノードがCloud Storageに存在しないことを検証します。
 * @param basePath
 * @param nodes
 */
async function notExistsNodes(basePath: string | null, nodes: StorageNode[]): Promise<void> {
  const bucket = admin.storage().bucket()
  for (const node of nodes) {
    // ディレクトリの末尾が'/'でないことを検証
    expect(node.dir.endsWith('/')).toBeFalsy()
    // node.path が ｢node.dir + node.name｣ と一致することを検証
    expect(node.path).toBe(path.join(node.dir, node.name))
    // Cloud Storageに対象のノードが存在しないことを検証
    let nodePath = basePath ? `${removeBothEndsSlash(basePath)}/${node.path}` : node.path
    nodePath += node.nodeType === StorageNodeType.Dir ? '/' : ''
    const gcsNode = bucket.file(nodePath)
    const [exists] = await gcsNode.exists()
    expect(exists).toBeFalsy()
  }
}

/**
 * テスト結果として取得されたノードを再度取得し直します。
 * @param basePath
 * @param nodes
 */
async function getNodesByActualNodes(basePath: string | null, nodes: StorageNode[]): Promise<StorageNode[]> {
  const promises: Promise<StorageNode>[] = []
  for (const node of nodes) {
    switch (node.nodeType) {
      case StorageNodeType.Dir:
        promises.push(storageService.getRealDirNode(basePath, node.path))
        break
      case StorageNodeType.File:
        promises.push(storageService.getRealFileNode(basePath, node.path))
        break
    }
  }
  const result = await Promise.all(promises)
  return storageService.sortStorageNodes(result)
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, ms)
  }) as Promise<void>
}

//========================================================================
//
//  Tests
//
//========================================================================

describe('BaseStorageService', () => {
  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [MockStorageRESTModule, DevUtilsServiceModule],
    }).compile()

    storageService = testingModule.get<TestStorageService>(StorageServiceDI.symbol)
    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)

    await storageService.removeDir(null, `${TEST_FILES_DIR}`)

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(2500)
  })

  describe('getNode', () => {
    it('ベーシックケース - ディレクトリ', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11`))!

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      await existsNodes(null, [actual])
    })

    it('ベーシックケース - ファイル', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11/fileB.txt`))!

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/d11/fileB.txt`)
      await existsNodes(null, [actual])
    })

    it('対象ディレクトリの子ノードは存在するが、実際のディレクトリは存在しない場合', async () => {
      // ディレクトリを作成せずにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11`))!

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      await existsNodes(null, [actual])
    })

    it('対象ディレクトリが存在しない場合 - 親ディレクトリは存在する', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual).toBeUndefined()
    })

    it('対象ディレクトリが存在しない場合 - 親ディレクトリも存在しない', async () => {
      const actual = await storageService.getNode(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual).toBeUndefined()
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.getNode(`${TEST_FILES_DIR}`, `d1/d11`))!

      expect(actual.path).toBe(`d1/d11`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it('basePath直下のノードが検索対象の場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.getNode(`${TEST_FILES_DIR}`, `d1`))!

      expect(actual.path).toBe(`d1`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it('大量データの場合 - ディレクトリ', async () => {
      // ディレクトリを作成
      const dirPaths: string[] = []
      for (let i = 1; i <= 20; i++) {
        dirPaths.push(`dirs/dir${i.toString().padStart(2, '0')}`)
      }
      await storageService.createDirs(`${TEST_FILES_DIR}`, dirPaths)

      // 大量データを想定して分割検索を行う
      const actual = (await storageService.getNode(`${TEST_FILES_DIR}`, `dirs/dir20`, { maxChunk: 3 }))!

      expect(actual.path).toBe(`dirs/dir20`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it('大量データの場合 - ファイル', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 20; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `dirs/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して分割検索を行う
      const actual = (await storageService.getNode(`${TEST_FILES_DIR}`, `dirs/file20.txt`, { maxChunk: 3 }))!

      expect(actual.path).toBe(`dirs/file20.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('getDirDescendants', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual.list[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111/fileB.txt`)
      expect(actual.list[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      await existsNodes(null, actual.list)
    })

    it('ディレクトリも配下ノードも存在しない場合', async () => {
      const actual = await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('ディレクトリは存在しないが、配下ノードは存在する場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, actual.list)
    })

    it('basePathを指定した場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getDirDescendants(`/${TEST_FILES_DIR}/`, `/d1/d11/`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/d11/d111`)
      expect(actual.list[2].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[3].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して取得を行う
      const actual = await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1`, {
          maxChunk: 3,
          pageToken: actual.nextPageToken,
        })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      expect(actual.list.length).toBe(14)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/d11/d111`)
      expect(actual.list[3].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual.list[4].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual.list[5].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual.list[6].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual.list[7].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual.list[8].path).toBe(`d1/d12`)
      expect(actual.list[9].path).toBe(`d1/d12/file06.txt`)
      expect(actual.list[10].path).toBe(`d1/d12/file07.txt`)
      expect(actual.list[11].path).toBe(`d1/d12/file08.txt`)
      expect(actual.list[12].path).toBe(`d1/d12/file09.txt`)
      expect(actual.list[13].path).toBe(`d1/d12/file10.txt`)

      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
    })
  })

  describe('getDescendants', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getDescendants(null, `${TEST_FILES_DIR}/d1/d11`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111/fileB.txt`)
      expect(actual.list[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      await existsNodes(null, actual.list)
    })

    it('ディレクトリも配下ノードも存在しない場合', async () => {
      const actual = await storageService.getDescendants(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('ディレクトリは存在しないが、配下ノードは存在する場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getDescendants(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, actual.list)
    })

    it('basePathを指定した場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getDescendants(`/${TEST_FILES_DIR}/`, `/d1/d11/`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1/d11/d111`)
      expect(actual.list[1].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[2].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して取得を行う
      const actual = await storageService.getDescendants(`${TEST_FILES_DIR}`, `d1`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.getDescendants(`${TEST_FILES_DIR}`, `d1`, {
          maxChunk: 3,
          pageToken: actual.nextPageToken,
        })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      expect(actual.list.length).toBe(13)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/d11/d111`)
      expect(actual.list[2].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual.list[3].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual.list[4].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual.list[5].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual.list[6].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual.list[7].path).toBe(`d1/d12`)
      expect(actual.list[8].path).toBe(`d1/d12/file06.txt`)
      expect(actual.list[9].path).toBe(`d1/d12/file07.txt`)
      expect(actual.list[10].path).toBe(`d1/d12/file08.txt`)
      expect(actual.list[11].path).toBe(`d1/d12/file09.txt`)
      expect(actual.list[12].path).toBe(`d1/d12/file10.txt`)

      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
    })
  })

  describe('getDirChildren', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getDirChildren(null, `${TEST_FILES_DIR}/d1`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, Object.values(actual))
    })

    it('ディレクトリは存在しないが、配下ノードは存在する場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getDirChildren(null, `${TEST_FILES_DIR}/d1`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, Object.values(actual))
    })

    it('ディレクトリにIDが振られていない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // IDを強制的に未設定にする
      const d1_and_children = (await storageService.getDirChildren(null, `${TEST_FILES_DIR}/d1`)).list
      await Promise.all(
        d1_and_children.map(async node => {
          await storageService.saveMetadata(null, node.gcsNode, { id: null })
        })
      )

      const actual = (await storageService.getDirChildren(null, `${TEST_FILES_DIR}/d1`)).list
      const nodeDict = arrayToDict(actual, 'path')

      expect(actual.length).toBe(3)
      expect(shortid.isValid(nodeDict[`${TEST_FILES_DIR}/d1`].id)).toBeTruthy()
      expect(shortid.isValid(nodeDict[`${TEST_FILES_DIR}/d1/d11`].id)).toBeTruthy()
      expect(shortid.isValid(nodeDict[`${TEST_FILES_DIR}/d1/fileA.txt`].id)).toBeTruthy()
      await existsNodes(null, Object.values(actual))
    })

    it('存在しないディレクトリを指定した場合', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}`])

      const actual = (await storageService.getDirChildren(null, `${TEST_FILES_DIR}/d1`)).list

      expect(actual.length).toBe(0)
    })

    it(`パスの先頭・末尾に'/'を付与した場合`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.getDirChildren(`/${TEST_FILES_DIR}/`, `/d1/`)).list

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 10; i++) {
        const num = i.toString().padStart(2, '0')
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d${num}/file${num}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して分割取得を行う
      const actual = await storageService.getDirChildren(`${TEST_FILES_DIR}`, `d1`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.getDirChildren(`${TEST_FILES_DIR}`, `d1`, {
          maxChunk: 3,
          pageToken: actual.nextPageToken,
        })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      expect(actual.list.length).toBe(11)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d01`)
      expect(actual.list[2].path).toBe(`d1/d02`)
      expect(actual.list[3].path).toBe(`d1/d03`)
      expect(actual.list[4].path).toBe(`d1/d04`)
      expect(actual.list[5].path).toBe(`d1/d05`)
      expect(actual.list[6].path).toBe(`d1/d06`)
      expect(actual.list[7].path).toBe(`d1/d07`)
      expect(actual.list[8].path).toBe(`d1/d08`)
      expect(actual.list[9].path).toBe(`d1/d09`)
      expect(actual.list[10].path).toBe(`d1/d10`)

      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
    })

    describe('basePathを指定した場合', () => {
      it('ノードの格納ディレクトリが存在する場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

        // ファイルをアップロード
        const uploadItems: StorageUploadDataItem[] = [
          {
            data: 'testA',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
          {
            data: 'testB',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/d11/fileB.txt`,
          },
        ]
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

        const actual = (await storageService.getDirChildren(`${TEST_FILES_DIR}`, `d1`)).list

        expect(actual.length).toBe(3)
        expect(actual[0].path).toBe(`d1`)
        expect(actual[1].path).toBe(`d1/d11`)
        expect(actual[2].path).toBe(`d1/fileA.txt`)
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })

      it('ノードの格納ディレクトリが存在しない場合', async () => {
        // ディレクトリを作成せずファイルをアップロード
        const uploadItems: StorageUploadDataItem[] = [
          {
            data: 'testA',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
          {
            data: 'testB',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/d11/fileB.txt`,
          },
        ]
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

        const actual = (await storageService.getDirChildren(`${TEST_FILES_DIR}`, `d1`)).list

        expect(actual.length).toBe(3)
        expect(actual[0].path).toBe(`d1`)
        expect(actual[1].path).toBe(`d1/d11`)
        expect(actual[2].path).toBe(`d1/fileA.txt`)
        await existsNodes(`${TEST_FILES_DIR}`, actual)
      })

      it('dirPathを指定しない場合', async () => {
        // ディレクトリを作成
        await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2/d21`])

        const actual = (await storageService.getDirChildren(`${TEST_FILES_DIR}`)).list

        expect(actual.length).toBe(2)
        expect(actual[0].path).toBe(`d1`)
        expect(actual[1].path).toBe(`d2`)
        await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
      })
    })
  })

  describe('getChildren', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.getChildren(null, `${TEST_FILES_DIR}/d1`)).list

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, actual)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.getChildren(`/${TEST_FILES_DIR}/`, `/d1/`)).list

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[1].path).toBe(`d1/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 10; i++) {
        const num = i.toString().padStart(2, '0')
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d${num}/file${num}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して分割取得を行う
      const actual = await storageService.getChildren(`${TEST_FILES_DIR}`, `d1`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.getChildren(`${TEST_FILES_DIR}`, `d1`, {
          maxChunk: 3,
          pageToken: actual.nextPageToken,
        })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      expect(actual.list.length).toBe(10)
      expect(actual.list[0].path).toBe(`d1/d01`)
      expect(actual.list[1].path).toBe(`d1/d02`)
      expect(actual.list[2].path).toBe(`d1/d03`)
      expect(actual.list[3].path).toBe(`d1/d04`)
      expect(actual.list[4].path).toBe(`d1/d05`)
      expect(actual.list[5].path).toBe(`d1/d06`)
      expect(actual.list[6].path).toBe(`d1/d07`)
      expect(actual.list[7].path).toBe(`d1/d08`)
      expect(actual.list[8].path).toBe(`d1/d09`)
      expect(actual.list[9].path).toBe(`d1/d10`)

      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
    })
  })

  describe('getHierarchicalNodes', () => {
    it('ベーシックケース - 引数にファイルを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalNodes(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(5)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)
      await existsNodes(null, Object.values(actual))
    })

    it('ベーシックケース - 引数にディレクトリを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      const actual = await storageService.getHierarchicalNodes(null, `${TEST_FILES_DIR}/d1/d11/d111`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      await existsNodes(null, Object.values(actual))
    })

    it('階層構造の形成に必要なディレクトリが欠けている場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getHierarchicalNodes(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(5)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)
      await existsNodes(null, Object.values(actual))
    })

    it('引数ノードが存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      const actual = await storageService.getHierarchicalNodes(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      // 実際に存在する祖先ノードが取得される
      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      await existsNodes(null, Object.values(actual))
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getHierarchicalNodes(`/${TEST_FILES_DIR}/`, `/d1/d11/d111/fileA.txt/`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, Object.values(actual))
    })
  })

  describe('getAncestorDirs', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getAncestorDirs(null, `${TEST_FILES_DIR}/d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)
      await existsNodes(null, actual)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11/d111`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getAncestorDirs(`/${TEST_FILES_DIR}/`, `/d1/d11/d111/fileA.txt/`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })
  })

  describe('createDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createDirs(null, [
        `${TEST_FILES_DIR}/d3`,
        `${TEST_FILES_DIR}/d1/d11`,
        `${TEST_FILES_DIR}/d1/d12`,
        `${TEST_FILES_DIR}/d2/d21`,
      ])

      expect(actual.length).toBe(7)
      expect(actual[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual[3].path).toBe(`${TEST_FILES_DIR}/d1/d12`)
      expect(actual[4].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual[5].path).toBe(`${TEST_FILES_DIR}/d2/d21`)
      expect(actual[6].path).toBe(`${TEST_FILES_DIR}/d3`)
      await existsNodes(null, actual)
    })

    it('既に存在するディレクトリを作成しようとした場合', async () => {
      const [, d1] = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      expect(actual.length).toBe(0)
      const afterD1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      expect(d1.created).toEqual(afterD1.created)
      expect(d1.updated).toEqual(afterD1.updated)
    })

    it('basePathを指定した場合', async () => {
      const actual = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d3`, `d1/d11`, `d1/d12`, `d2/d21`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(`${TEST_FILES_DIR}`, actual)
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.createDirs(`/${TEST_FILES_DIR}/`, [`/d3/`, `/d1/d11/`, `/d1/d12/`, `/d2/d21/`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(`/${TEST_FILES_DIR}/`, actual)
    })

    it('作成ディレクトリパスへのバリデーション実行確認', async () => {
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d1`)
      expect(explanation.calls[1].args[0]).toBe(`${TEST_FILES_DIR}/d2`)
    })
  })

  describe('handleUploadedFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedFile(null, uploadItems[0].path))!

      await existsNodes(null, [actual])

      // 祖先ディレクトリが作成されたことを検証
      const ancestors = await storageService.getAncestorDirs(null, actual.path)
      expect(ancestors[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(ancestors[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(ancestors[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
    })

    it('複数回実行した場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // ファイルアップロードの後処理を実行 - 1
      await storageService.handleUploadedFile(null, uploadItems[0].path)
      const fileA_1 = await storageService.getRealFileNode(null, uploadItems[0].path)

      // ファイルアップロードの後処理を実行 - 2
      await storageService.handleUploadedFile(null, uploadItems[0].path)
      const fileA_2 = await storageService.getRealFileNode(null, uploadItems[0].path)

      // 1回目と2回目でidが同じことを検証
      expect(fileA_1.id).toBe(fileA_2.id)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // ファイルアップロードの後処理を実行
      const actual = await storageService.handleUploadedFile(`${TEST_FILES_DIR}`, uploadItems[0].path)

      await existsNodes(`${TEST_FILES_DIR}`, [actual])

      // 祖先ディレクトリが作成されたことを検証
      const ancestors = await storageService.getAncestorDirs(`${TEST_FILES_DIR}`, actual.path)
      expect(ancestors[0].path).toBe(`d1`)
      expect(ancestors[1].path).toBe(`d1/d11`)
    })

    it('ファイルパスへのバリデーション実行確認', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.handleUploadedFile(null, uploadItems[0].path)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual: Error
      try {
        await storageService.handleUploadedFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`Uploaded file not found: '${TEST_FILES_DIR}/d1/fileA.txt'`)
    })
  })

  describe('removeDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.removeDir(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual.list[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual.list[3].path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)

      await notExistsNodes(null, actual.list)
    })

    it('ファイルに対するディレクトリがないディレクトリを指定した場合', async () => {
      // ディレクトリを作成せずファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.removeDir(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)

      await notExistsNodes(null, actual.list)
    })

    it('ディレクトリの一部が存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111`])

      // ディレクトリ階層の中間のディレクトリを削除する
      const d11 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1/d11`)
      await d11.gcsNode.delete()

      const actual = await storageService.removeDir(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/d11/d111`)

      await notExistsNodes(null, actual.list)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      // 何も行われない(エラーも発生しない)
      const actual = await storageService.removeDir(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('dirPathに空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.removeDir(null, ``)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The argument 'dirPath' is empty.`)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.removeDir(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`d1/fileB.txt`)

      await notExistsNodes(`${TEST_FILES_DIR}`, actual.list)
    })

    it('大量データの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11/d111/`, `${TEST_FILES_DIR}/d1/d12/`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 大量データを想定して分割で削除を行う
      const actual = await storageService.removeDir(`${TEST_FILES_DIR}`, `d1`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.removeDir(`${TEST_FILES_DIR}`, `d1`, { maxChunk: 3 })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(14)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/d11/d111`)
      expect(actual.list[3].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual.list[4].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual.list[5].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual.list[6].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual.list[7].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual.list[8].path).toBe(`d1/d12`)
      expect(actual.list[9].path).toBe(`d1/d12/file06.txt`)
      expect(actual.list[10].path).toBe(`d1/d12/file07.txt`)
      expect(actual.list[11].path).toBe(`d1/d12/file08.txt`)
      expect(actual.list[12].path).toBe(`d1/d12/file09.txt`)
      expect(actual.list[13].path).toBe(`d1/d12/file10.txt`)

      await notExistsNodes(`${TEST_FILES_DIR}`, actual.list)
    })
  })

  describe('removeFile', () => {
    it('ベーシックケース', async () => {
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = (await storageService.removeFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`))!

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)

      await notExistsNodes(null, [actual])
    })

    it('basePathを指定した場合', async () => {
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = (await storageService.removeFile(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`))!

      expect(actual.path).toBe(`d1/fileA.txt`)

      await notExistsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it('存在しないファイルを指定', async () => {
      const actual = await storageService.removeFile(null, `${TEST_FILES_DIR}/d1/fileXXX.txt`)

      expect(actual).toBeUndefined()
    })

    it('filePathに空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.removeFile(null, ``)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The argument 'filePath' is empty.`)
    })
  })

  describe('moveDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1`)).list
      expect(fromDirNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d1`)

      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`)
      expect(actual.list[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
      await existsNodes(null, actual.list)
      await notExistsNodes(null, fromDirNodes)

      // 移動後の'd2/d1'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2/d1`)).list
      expect(nodes.length).toBe(3)
      expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`)
      expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1`)).list
      expect(fromDirNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.moveDir(`/${TEST_FILES_DIR}/`, `/${fromDirNodes[0].path}/`, `/d2/d1/`)

      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d2/d1`)
      expect(actual.list[1].path).toBe(`d2/d1/d11`)
      expect(actual.list[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
      await notExistsNodes(`${TEST_FILES_DIR}`, fromDirNodes)

      // 移動後の'd2/d1'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d2/d1`)).list
      expect(nodes.length).toBe(3)
      expect(nodes[0].path).toBe(`d2/d1`)
      expect(nodes[1].path).toBe(`d2/d1/d11`)
      expect(nodes[2].path).toBe(`d2/d1/d11/fileA.txt`)
    })

    it('作成日時＋更新日時の検証', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`, `d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1`)).list
      expect(fromDirNodes.length).toBe(3)
      const [f_d1, f_d11, f_fileA] = fromDirNodes

      // 'd1'を'd2/d1'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}`, `d1`, `d2/d1`)
      const [t_d1, t_d11, t_fileA] = actual.list

      expect(actual.list.length).toBe(3)
      expect(t_d1.path).toBe(`d2/d1`)
      expect(t_d11.path).toBe(`d2/d1/d11`)
      expect(t_fileA.path).toBe(`d2/d1/d11/fileA.txt`)
      // 作成日の検証
      expect(t_d1.created).toEqual(f_d1.created)
      expect(t_d11.created).toEqual(f_d11.created)
      expect(t_fileA.created).toEqual(f_fileA.created)
      // 更新日時の検証
      expect(t_d1.updated.isAfter(f_d1.updated)).toBeTruthy()
      expect(t_d11.updated).toEqual(f_d11.updated)
      expect(t_fileA.updated).toEqual(f_fileA.updated)
    })

    it('移動先に同名のディレクトリが存在する場合', async () => {
      // ディレクトリを作成
      // ('d1'と'd2'配下に'docs'を作成)
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/docs/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/docs/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1/docs`)).list
      expect(fromDirNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`)

      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileA.txt`)
      await existsNodes(null, actual.list)
      await notExistsNodes(null, fromDirNodes)

      // 移動後の'd2/docs'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2/docs`)).list
      expect(nodes.length).toBe(3)
      expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileA.txt`)
      expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d2/docs/fileB.txt`)
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ディレクトリを作成
      // ('d1'と'd2'配下に'docs'を作成)
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`])

      // 作成したディレクトリにファイルをアップロード
      // 'd1'と'd2'配下に'file.txt'を配置
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/docs/file.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/docs/file.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1/docs`)).list
      expect(fromDirNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d2/docs`)

      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/file.txt`)
      await existsNodes(null, actual.list)
      await notExistsNodes(null, fromDirNodes)

      // 移動後の'd2/docs'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2/docs`)).list
      expect(nodes.length).toBe(2)
      expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/docs`)
      expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/docs/file.txt`)

      // 移動元の'd1/docs/file.txt'の内容が移動先の'd2/docs/file.txt'に上書きされたことを検証
      const fileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d2/docs/file.txt`)
      const fileData = await fileNode.gcsNode.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元と移動先が同じ場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      let actual: Error
      try {
        const fromDirNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
        await storageService.moveDir(null, fromDirNode.path, fromDirNode.path + '/') // 移動先に'/'を付けて試す
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source and destination are the same: '${TEST_FILES_DIR}/d1' -> '${TEST_FILES_DIR}/d1'`)
    })

    it('移動元ディレクトリのサブディレクトリが実際には存在しない場合', async () => {
      // ディレクトリを作成
      // (移動元のサブディレクトリは作成しない)
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        // 'd11'といディレクトリは存在しないがアップロードはできる
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = await storageService.getRealNodes(null, [`${TEST_FILES_DIR}/d1/`, `${TEST_FILES_DIR}/d1/d11/fileA.txt`])

      // 'd1'を'd2/d1'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d1`)

      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`)
      expect(actual.list[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
      await existsNodes(null, actual.list)
      await notExistsNodes(null, fromDirNodes)

      // 移動元に存在しなかったディレクトリが作成されていることを検証
      expect(actual.list[0].exists).toBe(true)
      expect(actual.list[1].exists).toBe(true) // ← 移動元に存在しなかったディレクトリが作成されている
      expect(actual.list[2].exists).toBe(true)

      // 移動後の'd2/d1'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2/d1`)).list
      expect(nodes.length).toBe(3)
      expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2/d1`)
      expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11`)
      expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d2/d1/d11/fileA.txt`)
    })

    it('移動元ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成
      // (移動元ディレクトリは作成しない)
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      let actual: Error
      try {
        await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source directory does not exist: '${TEST_FILES_DIR}/d1'`)
    })

    it('移動先ディレクトリが存在しない場合', async () => {
      // ディレクトリを作成
      // (移動先ディレクトリ'd2'は作成しない)
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 存在しない'd2'配下へ'd1'を移動させる
      let actual: Error
      try {
        await storageService.moveDir(`${TEST_FILES_DIR}`, `d1`, `d2/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The destination directory does not exist: '${TEST_FILES_DIR}/d2'`)
    })

    it('移動先ディレクトリが存在しない場合 - ルートディレクトリ(アプリケーションまたはユーザーディレクトリ)直下へ移動する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/docs`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/docs/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1/docs`)).list
      expect(fromDirNodes.length).toBe(2)

      // ルートディレクトリ(アプリケーションまたはユーザーディレクトリ)直下へ移動
      // 'd1/docs'をルートディレクトリ直下'docs'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}`, `d1/docs`, `docs`)

      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`docs`)
      expect(actual.list[1].path).toBe(`docs/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
      await notExistsNodes(`${TEST_FILES_DIR}`, fromDirNodes)

      // 移動後の'docs'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `docs`)).list
      expect(nodes.length).toBe(2)
      expect(nodes[0].path).toBe(`docs`)
      expect(nodes[1].path).toBe(`docs/fileA.txt`)
    })

    it('移動先ディレクトリが移動元のサブディレクトリの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      let actual!: Error
      try {
        await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d1/aaa/bbb/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory is its own subdirectory: '${TEST_FILES_DIR}/d1' -> '${TEST_FILES_DIR}/d1/aaa/bbb/d1'`)
    })

    it('移動元から移動先に共有設定が引き継がれるか検証 - 移動先に同名のディレクトリはない', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/dX/dA/dB`, `${TEST_FILES_DIR}/dY`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/dX/dA/dB/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 共有設定
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/dX/dA`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/dX/dA/dB`, { isPublic: true, readUIds: ['jiro'], writeUIds: ['jiro'] })
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/dX/dA/dB/fileA.txt`, {
        isPublic: true,
        readUIds: ['saburo'],
        writeUIds: ['saburo'],
      })

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/dX/dA`)).list

      // 'dX/dA'を'dY/dA'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/dX/dA`, `${TEST_FILES_DIR}/dY/dA`)

      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/dY/dA`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/dY/dA/dB`)
      expect(actual.list[2].path).toBe(`${TEST_FILES_DIR}/dY/dA/dB/fileA.txt`)
      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(actual.list[0].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      expect(actual.list[1].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['jiro'], writeUIds: ['jiro'] })
      expect(actual.list[2].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['saburo'], writeUIds: ['saburo'] })
      await existsNodes(null, actual.list)
      await notExistsNodes(null, fromDirNodes)

      // 移動後の'dY/dA'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/dY/dA`)).list
      expect(nodes.length).toBe(3)
      expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/dY/dA`)
      expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/dY/dA/dB`)
      expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/dY/dA/dB/fileA.txt`)
      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(nodes[0].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      expect(nodes[1].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['jiro'], writeUIds: ['jiro'] })
      expect(nodes[2].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['saburo'], writeUIds: ['saburo'] })
    })

    it('移動元から移動先に共有設定が引き継がれるか検証 - 移動先に同名のディレクトリがある', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/dX/dA`, `${TEST_FILES_DIR}/dY/dA`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA-X',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/dX/dA/fileA.txt`,
        },
        {
          data: 'testA-Y',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/dY/dA/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 共有設定
      // 'dX'配下ノードの設定
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/dX/dA`, { isPublic: true, readUIds: ['ichiro-X'], writeUIds: ['ichiro-X'] })
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/dX/dA/fileA.txt`, {
        isPublic: true,
        readUIds: ['jiro-X'],
        writeUIds: ['jiro-X'],
      })
      // 'dY'配下ノードの設定
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/dY/dA`, { isPublic: false, readUIds: ['ichiro-Y'] })
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/dY/dA/fileA.txt`, {
        isPublic: false,
        readUIds: ['jiro-Y'],
        writeUIds: ['jiro-Y'],
      })

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/dX/dA`)).list

      // 'dX/dA'を'dY/dA'へ移動
      const actual = await storageService.moveDir(null, `${TEST_FILES_DIR}/dX/dA`, `${TEST_FILES_DIR}/dY/dA`)

      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/dY/dA`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/dY/dA/fileA.txt`)
      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(actual.list[0].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro-X'], writeUIds: ['ichiro-X'] })
      expect(actual.list[1].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['jiro-X'], writeUIds: ['jiro-X'] })
      await existsNodes(null, actual.list)
      await notExistsNodes(null, fromDirNodes)

      // 移動後の'dY/dA'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/dY/dA`)).list
      expect(nodes.length).toBe(2)
      expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/dY/dA`)
      expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/dY/dA/fileA.txt`)
      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(nodes[0].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro-X'], writeUIds: ['ichiro-X'] })
      expect(nodes[1].share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['jiro-X'], writeUIds: ['jiro-X'] })
    })

    it('移動先ディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // バリデーションメソッドのモック化
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.moveDir(null, `${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d2`)
    })

    it('大量データの場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`dA`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d1`)).list

      // 大量データを想定して分割で移動を行う
      // 'd1'を'dA/d1'へ移動
      const actual = await storageService.moveDir(`${TEST_FILES_DIR}`, `d1`, `dA/d1`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.moveDir(`${TEST_FILES_DIR}`, `d1`, `dA/d1`, { maxChunk: 3, pageToken: actual.nextPageToken })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      expect(actual.list.length).toBe(14)
      expect(actual.list[0].path).toBe(`dA/d1`)
      expect(actual.list[1].path).toBe(`dA/d1/d11`)
      expect(actual.list[2].path).toBe(`dA/d1/d11/d111`)
      expect(actual.list[3].path).toBe(`dA/d1/d11/d111/file01.txt`)
      expect(actual.list[4].path).toBe(`dA/d1/d11/d111/file02.txt`)
      expect(actual.list[5].path).toBe(`dA/d1/d11/d111/file03.txt`)
      expect(actual.list[6].path).toBe(`dA/d1/d11/d111/file04.txt`)
      expect(actual.list[7].path).toBe(`dA/d1/d11/d111/file05.txt`)
      expect(actual.list[8].path).toBe(`dA/d1/d12`)
      expect(actual.list[9].path).toBe(`dA/d1/d12/file06.txt`)
      expect(actual.list[10].path).toBe(`dA/d1/d12/file07.txt`)
      expect(actual.list[11].path).toBe(`dA/d1/d12/file08.txt`)
      expect(actual.list[12].path).toBe(`dA/d1/d12/file09.txt`)
      expect(actual.list[13].path).toBe(`dA/d1/d12/file10.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
      await notExistsNodes(null, fromDirNodes)

      // 移動後の'dA'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `dA`)).list
      expect(nodes.length).toBe(15)
      expect(nodes[0].path).toBe(`dA`)
      expect(nodes[1].path).toBe(`dA/d1`)
      expect(nodes[2].path).toBe(`dA/d1/d11`)
      expect(nodes[3].path).toBe(`dA/d1/d11/d111`)
      expect(nodes[4].path).toBe(`dA/d1/d11/d111/file01.txt`)
      expect(nodes[5].path).toBe(`dA/d1/d11/d111/file02.txt`)
      expect(nodes[6].path).toBe(`dA/d1/d11/d111/file03.txt`)
      expect(nodes[7].path).toBe(`dA/d1/d11/d111/file04.txt`)
      expect(nodes[8].path).toBe(`dA/d1/d11/d111/file05.txt`)
      expect(nodes[9].path).toBe(`dA/d1/d12`)
      expect(nodes[10].path).toBe(`dA/d1/d12/file06.txt`)
      expect(nodes[11].path).toBe(`dA/d1/d12/file07.txt`)
      expect(nodes[12].path).toBe(`dA/d1/d12/file08.txt`)
      expect(nodes[13].path).toBe(`dA/d1/d12/file09.txt`)
      expect(nodes[14].path).toBe(`dA/d1/d12/file10.txt`)
    })
  })

  describe('moveFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 'd1/fileA.txt'を'd2'へ移動
      const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      const actual = await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fromFileNode])
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`, `d2`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 'd1/fileA.txt'を'd2'へ移動
      // パスの先頭・末尾に'/'を付与
      const fromFileNode = await storageService.getRealFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)
      const actual = await storageService.moveFile(`/${TEST_FILES_DIR}/`, fromFileNode.path, `/d2/fileA.txt/`)

      expect(actual.path).toBe(`d2/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
      await notExistsNodes(`${TEST_FILES_DIR}`, [fromFileNode])
    })

    it('作成日時＋更新日時の検証', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`, `d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 'd1/fileA.txt'を'd2'へ移動
      const fromFileNode = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)
      const actual = await storageService.moveFile(`${TEST_FILES_DIR}`, fromFileNode.path, `d2/fileA.txt`)

      expect(actual.path).toBe(`d2/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
      await notExistsNodes(`${TEST_FILES_DIR}`, [fromFileNode])

      // 作成日時の検証
      expect(actual.created).toEqual(fromFileNode.created)
      // 更新日時の検証
      expect(actual.updated.isAfter(fromFileNode.updated)).toBeTruthy()
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      // 'd1'と'd2'配下に'file.txt'を配置
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/file.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/file.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 'd1/file.txt'を'd2'へ移動
      const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/file.txt`)
      const actual = await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/file.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d2/file.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fromFileNode])

      // 移動元の'd1/file.txt'の内容が移動先の'd2/file.txt'に上書きされたことを検証
      const toFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d2/file.txt`)
      const toFileData = await toFileNode.gcsNode.download()
      expect(toFileData.toString()).toBe('testA')
    })

    it('移動元ファイルがない場合', async () => {
      let actual: Error
      try {
        const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source file does not exist: '${TEST_FILES_DIR}/d1/fileA.txt'`)
    })

    it('移動先ディレクトリがない場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      let actual!: Error
      try {
        const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.moveFile(null, fromFileNode.path, `${TEST_FILES_DIR}/d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory does not exist: '${TEST_FILES_DIR}/d2'`)
    })

    it('移動先ファイルパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`, `${TEST_FILES_DIR}/d2`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // バリデーションメソッドのモック化
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.moveFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `${TEST_FILES_DIR}/d2/fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`${TEST_FILES_DIR}/d2/fileA.txt`)
    })
  })

  describe('renameDir', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 'd1'を'd2'へリネーム
      const fm_d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      const actual = await storageService.renameDir(null, `${TEST_FILES_DIR}/d1`, `d2`)

      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
      expect(actual.list[2].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)
      await existsNodes(null, actual.list)
      await notExistsNodes(null, [fm_d1])

      // リネーム後の'd2'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d2`)).list
      expect(nodes.length).toBe(3)
      expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d2/d11`)
      expect(nodes[2].path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 'd1'を'd2'へリネーム
      // パスの先頭・末尾に'/'を付与
      const fm_d1 = await storageService.getRealDirNode(`/${TEST_FILES_DIR}/`, `/d1/`)
      const actual = await storageService.renameDir(`/${TEST_FILES_DIR}/`, '/d1/', `d2`)

      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d2`)
      expect(actual.list[1].path).toBe(`d2/d11`)
      expect(actual.list[2].path).toBe(`d2/d11/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
      await notExistsNodes(`${TEST_FILES_DIR}`, [fm_d1])

      // リネーム後の'd2'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `d2`)).list
      expect(nodes.length).toBe(3)
      expect(nodes[0].path).toBe(`d2`)
      expect(nodes[1].path).toBe(`d2/d11`)
      expect(nodes[2].path).toBe(`d2/d11/fileA.txt`)
    })

    it('作成日時＋更新日時の検証', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d11`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 移動前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1`)).list
      expect(fromDirNodes.length).toBe(3)
      const [fm_d1, fm_d11, fm_fileA] = fromDirNodes

      // 'd1'を'd2'へリネーム
      const actual = await storageService.renameDir(null, `${TEST_FILES_DIR}/d1`, `d2`)
      const [to_d2, to_d11, to_fileA] = actual.list

      expect(actual.list.length).toBe(3)
      expect(to_d2.path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(to_d11.path).toBe(`${TEST_FILES_DIR}/d2/d11`)
      expect(to_fileA.path).toBe(`${TEST_FILES_DIR}/d2/d11/fileA.txt`)
      // 作成日の検証
      expect(to_d2.created).toEqual(fm_d1.created)
      expect(to_d11.created).toEqual(fm_d11.created)
      expect(to_fileA.created).toEqual(fm_fileA.created)
      // 更新日時の検証
      expect(to_d2.updated.isAfter(fm_d1.updated)).toBeTruthy()
      expect(to_d11.updated).toEqual(fm_d11.updated)
      expect(to_fileA.updated).toEqual(fm_fileA.updated)
    })

    it('リネームしようとする名前のディレクトリが既に存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/docs`, `${TEST_FILES_DIR}/d1/files`])

      let actual: Error
      try {
        // 'd1/docs'を'd1/files'へリネーム
        const dirNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1/docs`)
        await storageService.renameDir(null, dirNode.path, `files`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified directory name already exists: '${TEST_FILES_DIR}/d1/docs' -> '${TEST_FILES_DIR}/d1/files'`)
    })

    it('ディレクトリパスにディレクトリ名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/d1'というディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        // 'd1/d1'というディレクトリにファイルを配置
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // 'd1/d1'を'd1/d2'へリネーム
      const f_d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1/d1`)
      const actual = await storageService.renameDir(null, f_d1.path, `d2`)

      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1/d2`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/d2/fileA.txt`)
      await existsNodes(null, actual.list)
      await notExistsNodes(null, [f_d1])

      // リネーム後の'd2'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(null, `${TEST_FILES_DIR}/d1/d2`)).list
      expect(nodes.length).toBe(2)
      expect(nodes[0].path).toBe(`${TEST_FILES_DIR}/d1/d2`)
      expect(nodes[1].path).toBe(`${TEST_FILES_DIR}/d1/d2/fileA.txt`)
    })

    it('既存のディレクトリ名に文字を付け加える形でリネームをした場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 'd1'を'd1XXX'へリネーム
      const f_d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      const actual = await storageService.renameDir(null, f_d1.path, `d1XXX`)

      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1XXX`)
      await existsNodes(null, actual.list)
      await notExistsNodes(null, [f_d1])
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // バリデーションメソッドのモック化
      const validateDirName = td.replace(storageService, 'validateDirName')

      await storageService.renameDir(null, `${TEST_FILES_DIR}/d1`, `d2`)

      const explanation = td.explain(validateDirName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2`)
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `dA/d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `dA/d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // リネーム前のノードを取得
      const fromDirNodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `dA`)).list

      // 大量データを想定して分割でリネームを行う
      // 'dA'を'dB'へリネーム
      const actual = await storageService.renameDir(`${TEST_FILES_DIR}`, `dA`, `dB`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.renameDir(`${TEST_FILES_DIR}`, `dA`, `dB`, { maxChunk: 3, pageToken: actual.nextPageToken })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      expect(actual.list.length).toBe(15)
      expect(actual.list[0].path).toBe(`dB`)
      expect(actual.list[1].path).toBe(`dB/d1`)
      expect(actual.list[2].path).toBe(`dB/d1/d11`)
      expect(actual.list[3].path).toBe(`dB/d1/d11/d111`)
      expect(actual.list[4].path).toBe(`dB/d1/d11/d111/file01.txt`)
      expect(actual.list[5].path).toBe(`dB/d1/d11/d111/file02.txt`)
      expect(actual.list[6].path).toBe(`dB/d1/d11/d111/file03.txt`)
      expect(actual.list[7].path).toBe(`dB/d1/d11/d111/file04.txt`)
      expect(actual.list[8].path).toBe(`dB/d1/d11/d111/file05.txt`)
      expect(actual.list[9].path).toBe(`dB/d1/d12`)
      expect(actual.list[10].path).toBe(`dB/d1/d12/file06.txt`)
      expect(actual.list[11].path).toBe(`dB/d1/d12/file07.txt`)
      expect(actual.list[12].path).toBe(`dB/d1/d12/file08.txt`)
      expect(actual.list[13].path).toBe(`dB/d1/d12/file09.txt`)
      expect(actual.list[14].path).toBe(`dB/d1/d12/file10.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
      await notExistsNodes(null, fromDirNodes)

      // 移動後の'dB'＋配下ノードを検証
      const nodes = (await storageService.getDirDescendants(`${TEST_FILES_DIR}`, `dB`)).list
      expect(nodes.length).toBe(15)
      expect(nodes[0].path).toBe(`dB`)
      expect(nodes[1].path).toBe(`dB/d1`)
      expect(nodes[2].path).toBe(`dB/d1/d11`)
      expect(nodes[3].path).toBe(`dB/d1/d11/d111`)
      expect(nodes[4].path).toBe(`dB/d1/d11/d111/file01.txt`)
      expect(nodes[5].path).toBe(`dB/d1/d11/d111/file02.txt`)
      expect(nodes[6].path).toBe(`dB/d1/d11/d111/file03.txt`)
      expect(nodes[7].path).toBe(`dB/d1/d11/d111/file04.txt`)
      expect(nodes[8].path).toBe(`dB/d1/d11/d111/file05.txt`)
      expect(nodes[9].path).toBe(`dB/d1/d12`)
      expect(nodes[10].path).toBe(`dB/d1/d12/file06.txt`)
      expect(nodes[11].path).toBe(`dB/d1/d12/file07.txt`)
      expect(nodes[12].path).toBe(`dB/d1/d12/file08.txt`)
      expect(nodes[13].path).toBe(`dB/d1/d12/file09.txt`)
      expect(nodes[14].path).toBe(`dB/d1/d12/file10.txt`)
    })
  })

  describe('renameFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      const actual = await storageService.renameFile(null, fromFileNode.path, `fileB.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fromFileNode])
    })

    it('basePathを指定', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const fileNode = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)
      const actual = await storageService.renameFile(`${TEST_FILES_DIR}`, fileNode.path, `fileB.txt`)

      expect(actual.path).toBe(`d1/fileB.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
      await notExistsNodes(`${TEST_FILES_DIR}`, [fileNode])
    })

    it(`basePathを指定 - パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const fileNode = await storageService.getRealFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)
      const actual = await storageService.renameFile(`/${TEST_FILES_DIR}/`, fileNode.path, 'fileB.txt')

      expect(actual.path).toBe(`d1/fileB.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
      await notExistsNodes(`${TEST_FILES_DIR}`, [fileNode])
    })

    it('作成日時＋更新日時の検証', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const fromFileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      const actual = await storageService.renameFile(null, fromFileNode.path, `fileB.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileB.txt`)
      // 作成日時の検証
      expect(actual.created).toEqual(fromFileNode.created)
      // 更新日時の検証
      expect(actual.updated.isAfter(fromFileNode.updated)).toBeTruthy()
    })

    it('リネームしようとする名前のファイルが既に存在する場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileB.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      let actual: Error
      try {
        // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
        const fileNode = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
        await storageService.renameFile(null, fileNode.path, `fileB.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified file name already exists: '${TEST_FILES_DIR}/d1/fileA.txt' -> '${TEST_FILES_DIR}/d1/fileB.txt'`)
    })

    it('ファイルパスにファイル名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/fileA.txt'というディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1/fileA.txt`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        // 'd1/fileA.txt'というディレクトリに'fileA.txt'というファイルを配置
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const fileNode = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt/fileA.txt`)
      const actual = await storageService.renameFile(null, fileNode.path, 'fileB.txt')

      // 'fileA.txt'というディレクトリ名は変わらず、
      // 'fileA.txt'が'fileB.txt'に名前変更されたことを確認
      expect(actual!.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt/fileB.txt`)
      await existsNodes(null, [actual])
      await notExistsNodes(null, [fileNode])
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 作成したディレクトリにファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // バリデーションメソッドのモック化
      const validateFileName = td.replace(storageService, 'validateFileName')

      await storageService.renameFile(null, `${TEST_FILES_DIR}/d1/fileA.txt`, `fileB.txt`)

      const explanation = td.explain(validateFileName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`fileB.txt`)
    })
  })

  describe('setDirShareSettings', () => {
    beforeEach(async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 公開フラグをオフに設定
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: false })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: false, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { readUIds: [], writeUIds: [] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { readUIds: null, writeUIds: null })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/dXXX`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified directory does not exist: '${TEST_FILES_DIR}/dXXX'`)
    })

    it('settingsにnullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, null)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.getRealDirNode(null, actual.path))
    })

    it('basePathを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] }
      const actual = await storageService.setDirShareSettings(`/${TEST_FILES_DIR}/`, `/d1/`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getRealDirNode(`${TEST_FILES_DIR}`, actual.path))
    })

    it('作成日時＋更新日時の検証', async () => {
      // 共有設定前のノードを取得
      const f_d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      // 共有設定を実行
      const t_d1 = await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true })

      // 作成日時の検証
      expect(t_d1.created).toEqual(f_d1.created)
      // 更新日時の検証
      expect(t_d1.updated.isAfter(f_d1.updated)).toBeTruthy()
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { readUIds: [shortid.generate(), 'aaa,bbb'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'readUIds' had an incorrect value: 'aaa,bbb'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { writeUIds: [shortid.generate(), 'aaa,bbb'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'writeUIds' had an incorrect value: 'aaa,bbb'`)
    })
  })

  describe('setFileShareSettings', () => {
    beforeEach(async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: true })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, {
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 公開フラグをオフに設定
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: false })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: false, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { readUIds: [], writeUIds: [] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { readUIds: null, writeUIds: null })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/zzz.txt`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified file does not exist: '${TEST_FILES_DIR}/d1/zzz.txt'`)
    })

    it('settingsにnullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(null, `${TEST_FILES_DIR}/d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, null)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.getRealFileNode(null, actual.path))
    })

    it('basePathを指定した場合', async () => {
      const settings: StorageNodeShareSettings = { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] }
      const actual = await storageService.setFileShareSettings(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`, settings)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual(settings)
      }
      verify(actual)
      verify(await storageService.getRealFileNode(`${TEST_FILES_DIR}`, actual.path))
    })

    it('作成日時＋更新日時の検証', async () => {
      // 共有設定前のノードを取得
      const f_fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

      // 共有設定を実行
      const t_fileA = await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { isPublic: true })

      // 作成日時の検証
      expect(t_fileA.created).toEqual(f_fileA.created)
      // 更新日時の検証
      expect(t_fileA.updated.isAfter(f_fileA.updated)).toBeTruthy()
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { readUIds: [shortid.generate(), 'aaa,bbb'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'readUIds' had an incorrect value: 'aaa,bbb'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(null, `${TEST_FILES_DIR}/d1/fileA.txt`, { writeUIds: [shortid.generate(), 'aaa,bbb'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'writeUIds' had an incorrect value: 'aaa,bbb'`)
    })
  })

  describe('getSignedUploadUrls', () => {
    it('ベーシックケース', async () => {
      const requestOrigin = config.cors.whitelist[0]
      const inputs: SignedUploadUrlInput[] = [
        { filePath: `${TEST_FILES_DIR}/fileA.txt`, contentType: 'text/plain' },
        { filePath: `${TEST_FILES_DIR}/fileB.txt`, contentType: 'text/plain' },
      ]

      const actual = await storageService.getSignedUploadUrls(requestOrigin, inputs)

      expect(actual.length).toBe(2)
    })
  })

  describe('getRealNode', () => {
    it('ディレクトリの取得', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getRealNode(null, `${TEST_FILES_DIR}/d1/`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('ディレクトリの取得 - basePathを指定', async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      const actual = await storageService.getRealNode(`${TEST_FILES_DIR}`, `d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`ディレクトリの取得 - パスの先頭・末尾に'/'を付与`, async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      const actual = await storageService.getRealNode(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`ディレクトリの取得 - 引数のパス指定で末尾に'/'を付与しない場合`, async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 末尾に'/'を付与しない
      const actual = await storageService.getRealNode(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      // 末尾に'/'を付与しなかったのでディレクトリノードは取得されない
      expect(actual.exists).toBeFalsy()
    })

    it('ファイルの取得', async () => {
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getRealNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('ファイルの取得 - basePathを指定', async () => {
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getRealNode(`${TEST_FILES_DIR}`, `d1/fileA.txt`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })

    it(`ファイルの取得 - パスの先頭・末尾に'/'を付与`, async () => {
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getRealNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('getRealDirNode', () => {
    it('ベーシックケース', async () => {
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      const actual = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it(`basePathを指定した場合 + パスの先頭・末尾に'/'を付与`, async () => {
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getRealDirNode(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(actual.path).toBe(`d1`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('getRealFileNode', () => {
    it('ベーシックケース', async () => {
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('basePathを指定した場合', async () => {
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // パスの先頭・末尾に'/'を付与
      const actual = await storageService.getRealFileNode(`/${TEST_FILES_DIR}/`, `/d1/fileA.txt/`)

      expect(actual.path).toBe(`d1/fileA.txt`)
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('Serve files', () => {
    //--------------------------------------------------
    //  Test helpers
    //--------------------------------------------------

    const APP_ADMIN_USER = { uid: 'app.admin.user', myDirName: 'app.admin.user', isAppAdmin: true }

    const APP_ADMIN_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(APP_ADMIN_USER)}` }

    let app: any

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    //--------------------------------------------------
    //  Tests
    //--------------------------------------------------

    describe('serveFile', () => {
      it('画像ファイルをダウンロード', async () => {
        const localFilePath = `${__dirname}/${TEST_FILES_DIR}/desert.jpg`
        const toFilePath = `${TEST_FILES_DIR}/d1/desert.jpg`
        await storageService.uploadLocalFiles(null, [{ localFilePath, toFilePath }])

        return request(app.getHttpServer())
          .get(`/storage/${toFilePath}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            const localFileBuffer = fs.readFileSync(localFilePath)
            expect(res.body).toEqual(localFileBuffer)
          })
      })

      it('テキストファイルをダウンロード', async () => {
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(null, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })

      it('If-Modified-Sinceの検証', async () => {
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }
        const [uploadedFileNode] = await storageService.uploadAsFiles(null, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .set('If-Modified-Since', uploadedFileNode.updated.toString())
          .expect(304)
      })

      it('存在しないファイルを指定', async () => {
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        }

        return request(app.getHttpServer())
          .get(`/storage/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(404)
      })

      it('basePathを指定した場合', async () => {
        const uploadItem: StorageUploadDataItem = {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        }
        await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, [uploadItem])

        return request(app.getHttpServer())
          .get(`/storage/${TEST_FILES_DIR}/${uploadItem.path}`)
          .set({ ...APP_ADMIN_USER_HEADER })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(uploadItem.data)
          })
      })
    })
  })

  describe('getRealDirDescendants', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getRealDirDescendants(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, actual.list)
    })

    it('ディレクトリは存在しないが、配下ノードは存在する場合', async () => {
      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      const actual = await storageService.getRealDirDescendants(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, actual.list)
    })

    it('ディレクトリにIDが振られていない場合', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(null, uploadItems)

      // IDを強制的に未設定にする
      await Promise.all(
        dirs.map(async node => {
          await storageService.saveMetadata(null, node.gcsNode, { id: null })
        })
      )

      const actual = await storageService.getRealDirDescendants(null, `${TEST_FILES_DIR}/d1`)

      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.list[1].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      await existsNodes(null, actual.list)
    })

    it('basePathを指定した場合', async () => {
      // ディレクトリを作成
      await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルをアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ]
      await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      const actual = await storageService.getRealDirDescendants(`/${TEST_FILES_DIR}/`, `/d1/`)

      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await existsNodes(`${TEST_FILES_DIR}`, actual.list)
    })
  })

  describe('saveDirNode', () => {
    it('メタデータを指定した場合', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      const actual = await storageService.saveDirNode(null, d1.path, { share: { isPublic: true, readUIds: ['ichiro'] } })

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: null })
      expect(actual.created).not.toEqual(dayjs(0))
      expect(actual.updated).not.toEqual(dayjs(0))
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('メタデータを指定しない場合', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      const actual = await storageService.saveDirNode(null, d1.path)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).not.toEqual(dayjs(0))
      expect(actual.updated).not.toEqual(dayjs(0))
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('メタデータに作成日時と更新日時を指定した場合', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      const d1_created = dayjs('2020-01-01 01:00:00')
      const d1_updated = dayjs('2020-01-02 02:00:00')

      const actual = await storageService.saveDirNode(null, d1.path, { created: d1_created, updated: d1_updated })

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).toEqual(d1_created)
      expect(actual.updated).toEqual(d1_updated)
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('既に存在するディレクトリの保存を行った場合 - メタデータの上書き', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      // saveDirNode()を実行
      // ・メタデータの指定あり
      Object.assign(d1, await storageService.saveDirNode(null, d1.path))
      const d1_id = d1.id

      // saveDirNode()を再度実行
      // ・メタデータの指定あり
      const actual = await storageService.saveDirNode(null, d1.path, { share: { isPublic: true, readUIds: ['ichiro'] } })

      expect(actual.id).toBe(d1_id)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: null })
      expect(actual.created).toEqual(d1.created) // 作成日時は変わっていない
      expect(actual.updated.isAfter(d1.updated)).toBeTruthy() // 更新日時は変わっている
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('既に存在するディレクトリの保存を行った場合 - メタデータの上書きなし', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      // saveDirNode()を実行
      // ・メタデータの指定あり
      Object.assign(d1, await storageService.saveDirNode(null, d1.path, { share: { isPublic: true, readUIds: ['ichiro'] } }))
      const d1_id = d1.id

      // saveDirNode()を再度実行
      // ・メタデータの指定なし
      const actual = await storageService.saveDirNode(null, d1.path)

      expect(actual.id).toBe(d1_id)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: null })
      expect(actual.created).toEqual(d1.created) // 作成日時は変わっていない
      expect(actual.updated.isAfter(d1.updated)).toBeTruthy() // 更新日時は変わっている
      expect(actual.exists).toBeTruthy()
      await existsNodes(null, [actual])
    })

    it('basePathを指定した場合', async () => {
      const d1 = await storageService.getRealDirNode(`${TEST_FILES_DIR}`, `d1`)

      const actual = await storageService.saveDirNode(`/${TEST_FILES_DIR}/`, d1.path)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).not.toEqual(dayjs(0))
      expect(actual.updated).not.toEqual(dayjs(0))
      expect(actual.exists).toBeTruthy()
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('saveFileNode', () => {
    it('コンテンツデータとメタデータの両方を指定した場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      // saveDirNode()を実行
      // ・コンテンツデータ指定あり
      // ・メタデータ指定あり
      const actual = await storageService.saveFileNode(
        null,
        fileA.path,
        {
          data: 'testA',
          options: { contentType: 'text/plain; charset=utf-8' },
        },
        { share: { isPublic: true, readUIds: ['ichiro'] } }
      )
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: null })
      expect(actual.contentType).toBe('text/plain; charset=utf-8')
      expect(actual.created).not.toEqual(dayjs(0))
      expect(actual.updated).not.toEqual(dayjs(0))
      expect(actual.exists).toBeTruthy()
      expect(fileA_content).toBe('testA')
      await existsNodes(null, [actual])
    })

    it('コンテンツデータとメタデータの両方を指定しない場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      // saveDirNode()を実行
      // ・コンテンツデータ指定なし
      // ・メタデータ指定なし
      const actual = await storageService.saveFileNode(null, fileA.path)
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.contentType).toBe('')
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).not.toEqual(dayjs(0))
      expect(actual.updated).not.toEqual(dayjs(0))
      expect(actual.exists).toBeTruthy()
      expect(fileA_content).toBe('')
      await existsNodes(null, [actual])
    })

    it('メタデータに作成日時と更新日時を指定した場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)
      const fileA_created = dayjs('2020-01-01 01:00:00')
      const fileA_updated = dayjs('2020-01-02 02:00:00')

      // saveDirNode()を実行
      // ・コンテンツデータ指定あり
      // ・メタデータ指定あり
      const actual = await storageService.saveFileNode(
        null,
        fileA.path,
        {
          data: 'testA',
          options: { contentType: 'text/plain; charset=utf-8' },
        },
        { created: fileA_created, updated: fileA_updated }
      )
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.contentType).toBe('text/plain; charset=utf-8')
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).toEqual(fileA_created)
      expect(actual.updated).toEqual(fileA_updated)
      expect(actual.exists).toBeTruthy()
      expect(fileA_content).toBe('testA')
      await existsNodes(null, [actual])
    })

    it('既に存在するファイルに上書きを行った場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      // saveDirNode()を実行
      // ・コンテンツデータ指定あり
      // ・メタデータ指定あり
      Object.assign(
        fileA,
        await storageService.saveFileNode(
          null,
          fileA.path,
          {
            data: 'testA-1',
            options: { contentType: 'text/plain; charset=utf-8' },
          },
          { share: { isPublic: true, readUIds: ['ichiro'] } }
        )
      )
      const fileA_id = fileA.id

      // saveDirNode()を再度実行
      // ・コンテンツデータ指定あり
      // ・メタデータ指定あり
      const actual = await storageService.saveFileNode(
        null,
        fileA.path,
        {
          data: 'testA-2',
          options: { contentType: 'text/plain; charset=shift_jis' },
        },
        { share: { isPublic: true, readUIds: ['jiro'] } }
      )
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(actual.id).toBe(fileA_id)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.contentType).toBe('text/plain; charset=shift_jis')
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['jiro'], writeUIds: null })
      expect(actual.created).toEqual(fileA.created) // 作成日時は変わっていない
      expect(actual.updated.isAfter(fileA.updated)).toBeTruthy() // 更新日時は変わっている
      expect(actual.exists).toBeTruthy()
      expect(fileA_content).toBe('testA-2')
      await existsNodes(null, [actual])
    })

    it('コンテンツデータを指定しない場合 - ファイルが存在しない場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      // saveDirNode()を実行
      // ・コンテンツデータ指定なし
      // ・メタデータ指定あり
      const actual = await storageService.saveFileNode(null, fileA.path, null, { share: { isPublic: true, readUIds: ['ichiro'] } })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.contentType).toBe('')
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: null })
      expect(actual.created).not.toEqual(dayjs(0))
      expect(actual.updated).not.toEqual(dayjs(0))
      expect(actual.exists).toBeTruthy()
      expect(fileA_content).toBe('')
      await existsNodes(null, [actual])
    })

    it('コンテンツデータを指定しない場合 - ファイルが存在する場合', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/fileA.txt`)

      // saveDirNode()を実行
      // ・コンテンツデータ指定あり
      // ・メタデータ指定あり
      Object.assign(
        fileA,
        await storageService.saveFileNode(
          null,
          fileA.path,
          {
            data: 'testA',
            options: { contentType: 'text/plain; charset=utf-8' },
          },
          { share: { isPublic: true, readUIds: ['ichiro'] } }
        )
      )
      const fileA_id = fileA.id

      // saveDirNode()を再度実行
      // ・コンテンツデータ指定なし
      // ・メタデータ指定あり
      const actual = await storageService.saveFileNode(null, fileA.path, null, { share: { isPublic: true, readUIds: ['jiro'] } })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(fileA_id).toBeTruthy()
      expect(actual.path).toBe(`${TEST_FILES_DIR}/fileA.txt`)
      expect(actual.contentType).toBe('text/plain; charset=utf-8')
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['jiro'], writeUIds: null })
      expect(actual.created).toEqual(fileA.created) // 作成日時は変わっていない
      expect(actual.updated.isAfter(fileA.updated)).toBeTruthy() // 更新日時は変わっている
      expect(actual.exists).toBeTruthy()
      expect(fileA_content).toBe('testA')
      await existsNodes(null, [actual])
    })

    it('basePathを指定した場合', async () => {
      const fileA = await storageService.getRealFileNode(`${TEST_FILES_DIR}`, `fileA.txt`)

      // saveDirNode()を実行
      // ・コンテンツデータ指定あり
      // ・メタデータ指定なし
      const actual = await storageService.saveFileNode(`/${TEST_FILES_DIR}/`, fileA.path, {
        data: 'testA',
        options: { contentType: 'text/plain; charset=utf-8' },
      })
      const [buffer] = await actual.gcsNode.download()
      const fileA_content = buffer.toString('utf-8')

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.path).toBe(`fileA.txt`)
      expect(actual.contentType).toBe('text/plain; charset=utf-8')
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).not.toEqual(dayjs(0))
      expect(actual.updated).not.toEqual(dayjs(0))
      expect(actual.exists).toBeTruthy()
      expect(fileA_content).toBe('testA')
      await existsNodes(`${TEST_FILES_DIR}`, [actual])
    })
  })

  describe('toStorageNode', () => {
    it('ディレクトリノードの変換 - 存在しないディレクトリ', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      const actual = storageService.toStorageNode(null, d1.gcsNode)

      expect(actual.id).toBe('')
      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`d1`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).toEqual(dayjs(0))
      expect(actual.updated).toEqual(dayjs(0))
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('ディレクトリノードの変換 - 存在するディレクトリ', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      Object.assign(d1, await storageService.saveDirNode(null, d1.path, { share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] } }))

      const actual = storageService.toStorageNode(null, d1.gcsNode)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`d1`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      expect(actual.created).toEqual(d1.created)
      expect(actual.updated).toEqual(d1.updated)
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('ファイルノードの変換 - 存在しないファイル', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

      const actual = storageService.toStorageNode(null, fileA.gcsNode)

      expect(actual.id).toBe('')
      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).toEqual(dayjs(0))
      expect(actual.updated).toEqual(dayjs(0))
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('ファイルノードの変換 - 存在するディレクトリ', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      Object.assign(
        fileA,
        await storageService.saveFileNode(
          null,
          fileA.path,
          {
            data: 'testA',
            options: { contentType: 'text/plain; charset=utf-8' },
          },
          { share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] } }
        )
      )

      const actual = storageService.toStorageNode(null, fileA.gcsNode)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.nodeType).toBe(StorageNodeType.File)
      expect(actual.name).toBe(`fileA.txt`)
      expect(actual.dir).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.contentType).toBe('text/plain; charset=utf-8')
      expect(actual.size).toBeGreaterThan(0)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      expect(actual.created).toEqual(fileA.created)
      expect(actual.updated).toEqual(fileA.updated)
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })

    it('basePathを指定した場合', async () => {
      const d1 = await storageService.getRealDirNode(`${TEST_FILES_DIR}`, `d1`)
      Object.assign(
        d1,
        await storageService.saveDirNode(`${TEST_FILES_DIR}`, d1.path, { share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] } })
      )

      const actual = storageService.toStorageNode(`/${TEST_FILES_DIR}/`, d1.gcsNode)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.nodeType).toBe(StorageNodeType.Dir)
      expect(actual.name).toBe(`d1`)
      expect(actual.dir).toBe(``)
      expect(actual.path).toBe(`d1`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      expect(actual.created).toEqual(d1.created)
      expect(actual.updated).toEqual(d1.updated)
      expect(actual.exists).toBeFalsy()
      expect(actual.gcsNode).toBeDefined()
    })
  })

  describe('toStorageNodeAsync', () => {
    it('ディレクトリノードの変換 - 存在しないディレクトリ', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)

      const actual = await storageService.toStorageNodeAsync(null, d1.gcsNode)

      expect(actual.id).toBe('')
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).toEqual(dayjs(0))
      expect(actual.updated).toEqual(dayjs(0))
      expect(actual.exists).toBeFalsy()
    })

    it('ディレクトリノードの変換 - 存在するディレクトリ', async () => {
      const d1 = await storageService.getRealDirNode(null, `${TEST_FILES_DIR}/d1`)
      Object.assign(d1, await storageService.saveDirNode(null, d1.path, { share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] } }))

      const actual = await storageService.toStorageNodeAsync(null, d1.gcsNode)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      expect(actual.created).toEqual(d1.created)
      expect(actual.updated).toEqual(d1.updated)
      expect(actual.exists).toBeTruthy()
    })

    it('ファイルノードの変換 - 存在しないファイル', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)

      const actual = await storageService.toStorageNodeAsync(null, fileA.gcsNode)

      expect(actual.id).toBe('')
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      expect(actual.created).toEqual(dayjs(0))
      expect(actual.updated).toEqual(dayjs(0))
      expect(actual.exists).toBeFalsy()
    })

    it('ファイルノードの変換 - 存在するファイル', async () => {
      const fileA = await storageService.getRealFileNode(null, `${TEST_FILES_DIR}/d1/fileA.txt`)
      Object.assign(
        fileA,
        await storageService.saveFileNode(
          null,
          fileA.path,
          {
            data: 'testA',
            options: { contentType: 'text/plain; charset=utf-8' },
          },
          { share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] } }
        )
      )

      const actual = await storageService.toStorageNodeAsync(null, fileA.gcsNode)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      expect(actual.created).toEqual(fileA.created)
      expect(actual.updated).toEqual(fileA.updated)
      expect(actual.exists).toBeTruthy()
    })

    it('basePathを指定した場合', async () => {
      const d1 = await storageService.getRealDirNode(`${TEST_FILES_DIR}`, `d1`)
      Object.assign(
        d1,
        await storageService.saveDirNode(`${TEST_FILES_DIR}`, d1.path, { share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] } })
      )

      const actual = await storageService.toStorageNodeAsync(`/${TEST_FILES_DIR}/`, d1.gcsNode)

      expect(shortid.isValid(actual.id)).toBeTruthy()
      expect(actual.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      expect(actual.created).toEqual(d1.created)
      expect(actual.updated).toEqual(d1.updated)
      expect(actual.exists).toBeTruthy()
    })
  })

  describe('sortStorageNodes', () => {
    it('昇順でソート', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
      const d12 = newTestStorageDirNode(`d1/d12`)
      const fileB = newTestStorageFileNode(`d1/d12/fileB.txt`)
      const d2 = newTestStorageDirNode(`d2`)
      const fileC = newTestStorageFileNode(`d2/fileC.txt`)
      const fileD = newTestStorageFileNode(`fileD.txt`)
      const fileE = newTestStorageFileNode(`fileE.txt`)

      const nodes = [fileA, fileB, fileC, fileE, fileD, d1, d2, d11, d12]
      storageService.sortStorageNodes(nodes)

      expect(nodes[0]).toBe(d1)
      expect(nodes[1]).toBe(d11)
      expect(nodes[2]).toBe(fileA)
      expect(nodes[3]).toBe(d12)
      expect(nodes[4]).toBe(fileB)
      expect(nodes[5]).toBe(d2)
      expect(nodes[6]).toBe(fileC)
      expect(nodes[7]).toBe(fileD)
      expect(nodes[8]).toBe(fileE)
    })
  })

  describe('padDirNodes', () => {
    it('ディレクトリのみを指定した場合', async () => {
      // ディレクトリを作成
      const dirs: GCSStorageNode[] = []
      dirs.push(await storageService.saveDirNode(null, `${TEST_FILES_DIR}/d1/d11`))
      dirs.push(await storageService.saveDirNode(null, `${TEST_FILES_DIR}/d2/d21`))

      // 歯抜けノードの穴埋め
      const actual = await storageService.padDirNodes(null, dirs, null)

      expect(actual.addedList.length).toBe(3)
      expect(actual.addedList[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual.addedList[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.addedList[2].path).toBe(`${TEST_FILES_DIR}/d2`)

      expect(actual.paddedList.length).toBe(5)
      expect(actual.paddedList[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual.paddedList[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.paddedList[2].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual.paddedList[3].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual.paddedList[4].path).toBe(`${TEST_FILES_DIR}/d2/d21`)

      await existsNodes(null, actual.addedList)
      await existsNodes(null, actual.paddedList)
    })

    it('ファイルのみを指定した場合', async () => {
      // ファイルのアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/fileB.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜けノードの穴埋め
      const actual = await storageService.padDirNodes(null, files, null)

      expect(actual.addedList.length).toBe(3)
      expect(actual.addedList[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual.addedList[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.addedList[2].path).toBe(`${TEST_FILES_DIR}/d2`)

      expect(actual.paddedList.length).toBe(5)
      expect(actual.paddedList[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual.paddedList[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.paddedList[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.paddedList[3].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual.paddedList[4].path).toBe(`${TEST_FILES_DIR}/d2/fileB.txt`)

      await existsNodes(null, actual.addedList)
      await existsNodes(null, actual.paddedList)
    })

    it('topPathを指定しない場合', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d2/d21/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/fileC.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜けノードの穴埋め - topPathを指定しない
      const actual = await storageService.padDirNodes(null, [...dirs, ...files], null)

      expect(actual.addedList.length).toBe(2)
      expect(actual.addedList[0].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual.addedList[1].path).toBe(`${TEST_FILES_DIR}/d2/d21`)

      expect(actual.paddedList.length).toBe(7)
      expect(actual.paddedList[0].path).toBe(`${TEST_FILES_DIR}`)
      expect(actual.paddedList[1].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.paddedList[2].path).toBe(`${TEST_FILES_DIR}/d1/fileA.txt`)
      expect(actual.paddedList[3].path).toBe(`${TEST_FILES_DIR}/d2`)
      expect(actual.paddedList[4].path).toBe(`${TEST_FILES_DIR}/d2/d21`)
      expect(actual.paddedList[5].path).toBe(`${TEST_FILES_DIR}/d2/d21/fileB.txt`)
      expect(actual.paddedList[6].path).toBe(`${TEST_FILES_DIR}/fileC.txt`)

      await existsNodes(null, actual.addedList)
      await existsNodes(null, actual.paddedList)
    })

    it('topPathを指定した場合 - topPathノードが存在する - 配下にノードが存在する', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // ファイルのアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜けノードの穴埋め - topPathを指定
      const actual = await storageService.padDirNodes(null, [...dirs, ...files], `${TEST_FILES_DIR}/d1`)

      expect(actual.addedList.length).toBe(1)
      expect(actual.addedList[0].path).toBe(`${TEST_FILES_DIR}/d1/d11`)

      expect(actual.paddedList.length).toBe(3)
      expect(actual.paddedList[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.paddedList[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual.paddedList[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)

      await existsNodes(null, actual.addedList)
      await existsNodes(null, actual.paddedList)
    })

    it('topPathを指定した場合 - topPathノードが存在する - 配下にノードが存在しない', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(null, [`${TEST_FILES_DIR}/d1`])

      // 歯抜けノードの穴埋め - topPathを指定
      const actual = await storageService.padDirNodes(null, dirs, `${TEST_FILES_DIR}/d1`)

      expect(actual.addedList.length).toBe(0)

      expect(actual.paddedList.length).toBe(1)
      expect(actual.paddedList[0].path).toBe(`${TEST_FILES_DIR}/d1`)

      await existsNodes(null, actual.addedList)
      await existsNodes(null, actual.paddedList)
    })

    // TODO ほんとにこの挙動でよいか考察すること！
    it('topPathを指定した場合 - topPathノードが存在しない - 配下にノードが存在しない', async () => {
      // 歯抜けノードの穴埋め - topPathを指定
      const actual = await storageService.padDirNodes(null, [], `${TEST_FILES_DIR}/d1`)

      expect(actual.addedList.length).toBe(1)
      expect(actual.addedList[0].path).toBe(`${TEST_FILES_DIR}/d1`)

      expect(actual.paddedList.length).toBe(1)
      expect(actual.paddedList[0].path).toBe(`${TEST_FILES_DIR}/d1`)

      await existsNodes(null, actual.addedList)
      await existsNodes(null, actual.paddedList)
    })

    it('topPathを指定した場合 - topPathノードが存在しない - 配下にノードが存在する', async () => {
      // ファイルのアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${TEST_FILES_DIR}/d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(null, uploadItems)

      // 歯抜けノードの穴埋め - topPathを指定
      const actual = await storageService.padDirNodes(null, files, `${TEST_FILES_DIR}/d1`)

      expect(actual.addedList.length).toBe(2)
      expect(actual.addedList[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.addedList[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)

      expect(actual.paddedList.length).toBe(3)
      expect(actual.paddedList[0].path).toBe(`${TEST_FILES_DIR}/d1`)
      expect(actual.paddedList[1].path).toBe(`${TEST_FILES_DIR}/d1/d11`)
      expect(actual.paddedList[2].path).toBe(`${TEST_FILES_DIR}/d1/d11/fileA.txt`)

      await existsNodes(null, actual.addedList)
      await existsNodes(null, actual.paddedList)
    })

    it('basePathを指定した場合 - topPathを指定しない', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルのアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 歯抜けノードの穴埋め - topPathを指定しない
      const actual = await storageService.padDirNodes(`${TEST_FILES_DIR}`, [...dirs, ...files], null)

      expect(actual.addedList.length).toBe(1)
      expect(actual.addedList[0].path).toBe(`d1/d11`)

      expect(actual.paddedList.length).toBe(3)
      expect(actual.paddedList[0].path).toBe(`d1`)
      expect(actual.paddedList[1].path).toBe(`d1/d11`)
      expect(actual.paddedList[2].path).toBe(`d1/d11/fileA.txt`)

      await existsNodes(`${TEST_FILES_DIR}`, actual.addedList)
      await existsNodes(`${TEST_FILES_DIR}`, actual.paddedList)
    })

    it('basePathを指定した場合 - topPathを指定する', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルのアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 歯抜けノードの穴埋め - topPathを指定
      const actual = await storageService.padDirNodes(`${TEST_FILES_DIR}`, [...dirs, ...files], `d1`)

      expect(actual.addedList.length).toBe(1)
      expect(actual.addedList[0].path).toBe(`d1/d11`)

      expect(actual.paddedList.length).toBe(3)
      expect(actual.paddedList[0].path).toBe(`d1`)
      expect(actual.paddedList[1].path).toBe(`d1/d11`)
      expect(actual.paddedList[2].path).toBe(`d1/d11/fileA.txt`)

      await existsNodes(`${TEST_FILES_DIR}`, actual.addedList)
      await existsNodes(`${TEST_FILES_DIR}`, actual.paddedList)
    })

    it(`パスの先頭・末尾に'/'を付与`, async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])

      // ファイルのアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 歯抜けノードの穴埋め - topPathを指定
      const actual = await storageService.padDirNodes(`/${TEST_FILES_DIR}/`, [...dirs, ...files], `/d1/`)

      expect(actual.addedList.length).toBe(1)
      expect(actual.addedList[0].path).toBe(`d1/d11`)

      expect(actual.paddedList.length).toBe(3)
      expect(actual.paddedList[0].path).toBe(`d1`)
      expect(actual.paddedList[1].path).toBe(`d1/d11`)
      expect(actual.paddedList[2].path).toBe(`d1/d11/fileA.txt`)

      await existsNodes(`${TEST_FILES_DIR}`, actual.addedList)
      await existsNodes(`${TEST_FILES_DIR}`, actual.paddedList)
    })

    it('ディレクトリにIDが設定されていない場合', async () => {
      // ディレクトリを作成
      const dirs = await storageService.createDirs(`${TEST_FILES_DIR}`, [`d1`])
      // ディレクトリのIDを未設定へ変更
      const [d1] = dirs
      Object.assign(d1, await storageService.saveMetadata(`${TEST_FILES_DIR}`, d1.gcsNode, { id: null }))
      expect(d1.id).toBe('')

      // ファイルのアップロード
      const uploadItems: StorageUploadDataItem[] = [
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ]
      const files = await storageService.uploadAsFiles(`${TEST_FILES_DIR}`, uploadItems)

      // 歯抜けノードの穴埋め - topPathを指定
      const actual = await storageService.padDirNodes(`${TEST_FILES_DIR}`, [...dirs, ...files], `d1`)

      expect(actual.addedList.length).toBe(1)
      expect(actual.addedList[0].path).toBe(`d1/d11`)

      expect(actual.paddedList.length).toBe(3)
      expect(actual.paddedList[0].path).toBe(`d1`)
      expect(actual.paddedList[1].path).toBe(`d1/d11`)
      expect(actual.paddedList[2].path).toBe(`d1/d11/fileA.txt`)

      await existsNodes(`${TEST_FILES_DIR}`, actual.addedList)
      await existsNodes(`${TEST_FILES_DIR}`, actual.paddedList)
    })
  })

  describe('validatePath', () => {
    it('空の場合', async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`'\\n'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('d1/d1\n1')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`'\\r\\n'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('d1/d1\r\n1')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`'\\t'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('d1/d1\t1')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`'\\r'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validatePath('d1/d1\r1')
      } catch (err) {
        actual = err
      }
      expect(actual).toBeUndefined()
    })
  })

  describe('validateDirName', () => {
    it(`'/'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validateDirName(`d1/1`)
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`validatePath()の呼び出し確認`, async () => {
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.validateDirName(`d1`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d1`)
    })
  })

  describe('validateFileName', () => {
    it(`'/'を含んでいる場合`, async () => {
      let actual!: InputValidationError
      try {
        storageService.validateFileName(`file/A.txt`)
      } catch (err) {
        actual = err
      }
      expect(actual).toBeDefined()
    })

    it(`validatePath()の呼び出し確認`, async () => {
      const validatePath = td.replace(storageService, 'validatePath')

      await storageService.validateFileName(`fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`fileA.txt`)
    })
  })

  // it('大量のディレクトリを作成', async () => {
  //   const APP_ADMIN_USER = { uid: 'app.admin.user', myDirName: 'app.admin.user', isAppAdmin: true }
  //
  //   const dirPaths: string[] = []
  //   for (let i = 1; i <= 1000; i++) {
  //     dirPaths.push(`dirs/dir${i.toString(10).padStart(4, '0')}`)
  //   }
  //
  //   await storageService.createUserDirs(APP_ADMIN_USER, dirPaths)
  // })
})
