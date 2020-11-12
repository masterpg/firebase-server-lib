import * as admin from 'firebase-admin'
import * as fs from 'fs'
import * as td from 'testdouble'
import { APP_ADMIN_USER, APP_ADMIN_USER_HEADER } from '../../../../helpers/common/data'
import {
  CreateStorageNodeInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  InputValidationError,
  SignedUploadUrlInput,
  StorageFileNode,
  StorageNode,
  StorageNodeShareSettings,
  StorageService,
  StorageServiceDI,
  StorageUploadDataItem,
  StoreServiceDI,
  initLib,
} from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { existsNodes, notExistsNodes, removeAllNodes, verifyMoveNodes } from '../../../../helpers/common/storage'
import { newTestStorageDirNode, newTestStorageFileNode } from '../../../../helpers/example/storage'
import { MockStorageRESTModule } from '../../../../mocks/lib/rest/storage'
import { Response } from 'supertest'
import { config } from '../../../../../src/config'
import request = require('supertest')
import { sleep } from 'web-base-lib'

jest.setTimeout(25000)
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
let storeService!: StoreServiceDI.type
let devUtilsService!: DevUtilsServiceDI.type

type TestStorageService = StorageService & {
  extractMetaData: StorageService['extractMetaData']
  saveMetadata: StorageService['saveMetadata']
}

//========================================================================
//
//  Tests
//
//========================================================================

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
})

beforeEach(async () => {
  testingModule = await Test.createTestingModule({
    imports: [MockStorageRESTModule],
  }).compile()

  storageService = testingModule.get<TestStorageService>(StorageServiceDI.symbol)
  storeService = testingModule.get<StoreServiceDI.type>(StoreServiceDI.symbol)

  await removeAllNodes(storeService)

  // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
  await sleep(1500)
})

afterEach(() => {
  td.reset()
})

describe('StorageService', () => {
  describe('getNodeById', () => {
    it('ベーシックケース - ディレクトリ', async () => {
      const [, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = (await storageService.getNodeById(d11.id))!

      expect(actual.path).toBe(`d1/d11`)
      await existsNodes([actual], storageService)
    })

    it('ベーシックケース - ファイル', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileNodeA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.getNodeById(fileNodeA.id))!

      expect(actual.path).toBe(`d1/fileA.txt`)
      await existsNodes([actual], storageService)
    })

    it('空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.getNodeById(``)
      } catch (err) {
        actual = err
      }
      expect(actual.message).toBe(`'nodeId' is not specified.`)
    })
  })

  describe('getNodeByPath', () => {
    it('ベーシックケース - ディレクトリ', async () => {
      const [, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = (await storageService.getNodeByPath(`d1/d11`))!

      expect(actual.path).toBe(`d1/d11`)
      await existsNodes([actual], storageService)
    })

    it('ベーシックケース - ファイル', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.getNodeByPath(`d1/fileA.txt`))!

      expect(actual.path).toBe(`d1/fileA.txt`)
      await existsNodes([actual], storageService)
    })

    it('空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.getNodeByPath(``)
      } catch (err) {
        actual = err
      }
      expect(actual.message).toBe(`'nodePath' is not specified.`)
    })
  })

  describe('getNodesByPaths', () => {
    it('ベーシックケース - ディレクトリ', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getNodesByPaths([`d1`, `dXXX`, `d1/d11`])

      expect(actual.length).toBe(2)
      expect(actual.map(node => node.path)).toEqual([`d1`, `d1/d11`])
      await existsNodes(actual, storageService)
    })

    it('ベーシックケース - ファイル', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      await storageService.uploadDataItems([
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
      ])

      const actual = await storageService.getNodesByPaths([`d1/fileA.txt`, `dXXX`, `d1/d11/fileB.txt`])

      expect(actual.length).toBe(2)
      expect(actual.map(node => node.path)).toEqual([`d1/fileA.txt`, `d1/d11/fileB.txt`])
      await existsNodes(actual, storageService)
    })

    it('ノードパスを0件指定した場合', async () => {
      const actual = await storageService.getNodesByPaths([])

      expect(actual.length).toBe(0)
    })

    it('ノードパスを10件より多く指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`, `d2`, `d3`])

      const actual = await storageService.getNodesByPaths([`d1`, `d2`, `d3`, `d4`, `d5`, `d6`, `d7`, `d8`, `d9`, `d10`, `d11`])

      expect(actual.length).toBe(3)
      expect(actual.map(node => node.path)).toEqual([`d1`, `d2`, `d3`])
      await existsNodes(actual, storageService)
    })

    it('空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.getNodesByPaths([``])
      } catch (err) {
        actual = err
      }
      expect(actual.message).toBe(`'nodePath' is not specified.`)
    })
  })

  describe('getDirDescendants', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`, `d1/d12`])
      await storageService.uploadDataItems([
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
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/fileC.txt`,
        },
      ])

      const actual = await storageService.getDirDescendants(`d1/d11`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/d11/d111`)
      expect(actual.list[2].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[3].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('検索対象のディレクトリ名に付け加える形のディレクトリが存在する場合', async () => {
      await storageService.createHierarchicalDirs([`d1`, `d1-bk`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1-bk/fileA.txt`,
        },
      ])

      // 'd1'を検索した場合、'd1-bk'は含まれないことを検証
      const actual = await storageService.getDirDescendants(`d1`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('バケット直下の検索', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `fileB.txt`,
        },
      ])

      // バケット直下の検索
      const actual = await storageService.getDirDescendants()

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('dirPathにファイルパスを指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDirDescendants('d1/fileA.txt')

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`, `d1/d12`, `d2`])
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
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `d2/file11.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getDirDescendants(`d1`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getDirDescendants(`d1`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      StorageService.sortNodes(actual)
      expect(actual.length).toBe(14)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual[4].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual[5].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual[6].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual[7].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual[8].path).toBe(`d1/d12`)
      expect(actual[9].path).toBe(`d1/d12/file06.txt`)
      expect(actual[10].path).toBe(`d1/d12/file07.txt`)
      expect(actual[11].path).toBe(`d1/d12/file08.txt`)
      expect(actual[12].path).toBe(`d1/d12/file09.txt`)
      expect(actual[13].path).toBe(`d1/d12/file10.txt`)
      await existsNodes(actual, storageService)
    })
  })

  describe('getDescendants', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`, `d1/d12`])
      await storageService.uploadDataItems([
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
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d12/fileC.txt`,
        },
      ])

      const actual = await storageService.getDescendants(`d1/d11`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1/d11/d111`)
      expect(actual.list[1].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[2].path).toBe(`d1/d11/fileA.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('検索対象のディレクトリ名に付け加える形のディレクトリが存在する場合', async () => {
      await storageService.createHierarchicalDirs([`d1`, `d1-bk`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1-bk/fileA.txt`,
        },
      ])

      // 'd1'を検索した場合、'd1-bk'は含まれないことを検証
      const actual = await storageService.getDescendants(`d1`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('バケット直下の検索', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `fileB.txt`,
        },
      ])

      // バケット直下の検索
      const actual = await storageService.getDescendants()

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('dirPathにファイルパスを指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDescendants('d1/fileA.txt')

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`, `d1/d12`, `d2`])
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
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `d2/file11.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getDescendants(`d1`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getDescendants(`d1`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      StorageService.sortNodes(actual)
      expect(actual.length).toBe(13)
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[1].path).toBe(`d1/d11/d111`)
      expect(actual[2].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual[3].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual[4].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual[5].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual[6].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual[7].path).toBe(`d1/d12`)
      expect(actual[8].path).toBe(`d1/d12/file06.txt`)
      expect(actual[9].path).toBe(`d1/d12/file07.txt`)
      expect(actual[10].path).toBe(`d1/d12/file08.txt`)
      expect(actual[11].path).toBe(`d1/d12/file09.txt`)
      expect(actual[12].path).toBe(`d1/d12/file10.txt`)
      await existsNodes(actual, storageService)
    })
  })

  describe('getDirChildren', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`, `d2`])
      await storageService.uploadDataItems([
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
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/fileC.txt`,
        },
      ])

      const actual = await storageService.getDirChildren(`d1`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('検索対象のディレクトリ名に付け加える形のディレクトリが存在する場合', async () => {
      await storageService.createHierarchicalDirs([`d1`, `d1-bk`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1-bk/fileA.txt`,
        },
      ])

      // 'd1'を検索した場合、'd1-bk'は含まれないことを検証
      const actual = await storageService.getDirChildren(`d1`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('バケット直下の検索', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `fileB.txt`,
        },
      ])

      // バケット直下の検索
      const actual = await storageService.getDirChildren()

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('dirPathにファイルパスを指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDirChildren('d1/fileA.txt')

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      await storageService.createHierarchicalDirs([`d1`, `d1/d11`, `d2`])
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `d1/d11/file11.txt`,
      })
      uploadItems.push({
        data: `test12`,
        contentType: 'text/plain; charset=utf-8',
        path: `d2/file12.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getDirChildren(`d1`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getDirChildren(`d1`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      StorageService.sortNodes(actual)
      expect(actual.length).toBe(12)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/file01.txt`)
      expect(actual[3].path).toBe(`d1/file02.txt`)
      expect(actual[4].path).toBe(`d1/file03.txt`)
      expect(actual[5].path).toBe(`d1/file04.txt`)
      expect(actual[6].path).toBe(`d1/file05.txt`)
      expect(actual[7].path).toBe(`d1/file06.txt`)
      expect(actual[8].path).toBe(`d1/file07.txt`)
      expect(actual[9].path).toBe(`d1/file08.txt`)
      expect(actual[10].path).toBe(`d1/file09.txt`)
      expect(actual[11].path).toBe(`d1/file10.txt`)
      await existsNodes(actual, storageService)
    })
  })

  describe('getChildren', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`, `d2`])
      await storageService.uploadDataItems([
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
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/fileC.txt`,
        },
      ])

      const actual = await storageService.getChildren(`d1`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('検索対象のディレクトリ名に付け加える形のディレクトリが存在する場合', async () => {
      await storageService.createHierarchicalDirs([`d1`, `d1-bk`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1-bk/fileA.txt`,
        },
      ])

      // 'd1'を検索した場合、'd1-bk'は含まれないことを検証
      const actual = await storageService.getChildren(`d1`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1/fileA.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('バケット直下の検索', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `fileB.txt`,
        },
      ])

      // バケット直下の検索
      const actual = await storageService.getChildren()

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
      await existsNodes(actual.list, storageService)
    })

    it('dirPathにファイルパスを指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getChildren('d1/fileA.txt')

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`, `d2`])
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `d1/d11/file11.txt`,
      })
      uploadItems.push({
        data: `test12`,
        contentType: 'text/plain; charset=utf-8',
        path: `d2/file12.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getChildren(`d1`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getChildren(`d1`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      StorageService.sortNodes(actual)
      expect(actual.length).toBe(11)
      expect(actual[0].path).toBe(`d1/d11`)
      expect(actual[1].path).toBe(`d1/file01.txt`)
      expect(actual[2].path).toBe(`d1/file02.txt`)
      expect(actual[3].path).toBe(`d1/file03.txt`)
      expect(actual[4].path).toBe(`d1/file04.txt`)
      expect(actual[5].path).toBe(`d1/file05.txt`)
      expect(actual[6].path).toBe(`d1/file06.txt`)
      expect(actual[7].path).toBe(`d1/file07.txt`)
      expect(actual[8].path).toBe(`d1/file08.txt`)
      expect(actual[9].path).toBe(`d1/file09.txt`)
      expect(actual[10].path).toBe(`d1/file10.txt`)
      await existsNodes(actual, storageService)
    })
  })

  describe('getHierarchicalNodes', () => {
    it('ベーシックケース - 引数にファイルを指定', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ])

      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/fileA.txt`)
      await existsNodes(actual, storageService)
    })

    it('ベーシックケース - 引数にバケット直下のファイルを指定', async () => {
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `fileA.txt`,
        },
      ])

      const actual = await storageService.getHierarchicalNodes(`fileA.txt`)

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`fileA.txt`)
      await existsNodes(actual, storageService)
    })

    it('ベーシックケース - 引数にディレクトリを指定', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`])

      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      await existsNodes(actual, storageService)
    })

    it('ベーシックケース - 引数にバケット直下のディレクトリを指定', async () => {
      await storageService.createHierarchicalDirs([`d1`])

      const actual = await storageService.getHierarchicalNodes(`d1`)

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`d1`)
      await existsNodes(actual, storageService)
    })

    it('階層構造の形成に必要なディレクトリが欠けている場合', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ])

      // 階層を形成するディレクトリの一部を削除
      const d11 = (await storageService.getNodeByPath(`d1/d11`))!
      await storeService.storageDao.delete(d11.id)

      // 削除されたディレクトリが穴埋めされることを検証
      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/fileA.txt`)
      await existsNodes(actual, storageService)
    })

    it('引数ノードが存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)

      // 実際に存在する祖先ノードが取得される
      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      await existsNodes(actual, storageService)
    })

    it('空文字を指定した場合', async () => {
      // 空文字を指定
      const actual = await storageService.getHierarchicalNodes(``)

      expect(actual.length).toBe(0)
    })
  })

  describe('getAncestorDirs', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/d111/fileA.txt`,
        },
      ])

      const actual = await storageService.getAncestorDirs(`d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      await existsNodes(actual, storageService)
    })

    it('空文字を指定した場合', async () => {
      // 空文字を指定
      const actual = await storageService.getAncestorDirs(``)

      expect(actual.length).toBe(0)
    })
  })

  describe('createDir', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createDir(`d1`)

      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({
        isPublic: null,
        readUIds: null,
        writeUIds: null,
      })

      await existsNodes([actual], storageService)
    })

    it('共有設定を指定した場合', async () => {
      const actual = await storageService.createDir(`d1`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      })

      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      })

      await existsNodes([actual], storageService)
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定なし', async () => {
      const before = await storageService.createDir(`d1`)

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createDir(`d1`)

      expect(actual).toEqual(before)
      await existsNodes([actual], storageService)
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定あり', async () => {
      const before = await storageService.createDir(`d1`)

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createDir(`d1`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      })

      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      })
      expect(actual.version).toBe(before.version + 1)

      await existsNodes([actual], storageService)
    })

    it('祖先が存在しない場合', async () => {
      let actual!: InputValidationError
      try {
        // 祖先がいないディレクトリ作成を試みる
        const actual = await storageService.createDir(`d1/d11`)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The ancestor directory of the specified directory does not exist.`)
      expect(actual.detail.values).toEqual({
        specifiedPath: `d1/d11`,
        ancestorPath: `d1`,
      })
    })

    it('作成ディレクトリパスへのバリデーション実行確認', async () => {
      const validatePath = td.replace(StorageService, 'validatePath')

      await storageService.createDir(`d1`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d1`)
    })

    it('共有設定入力へのバリデーション実行確認', async () => {
      const validateShareSettingInput = td.replace(StorageService, 'validateShareSettingInput')

      const input: CreateStorageNodeInput = { isPublic: null }
      await storageService.createDir(`d1`, input)

      const explanation = td.explain(validateShareSettingInput)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(input)
    })
  })

  describe('createHierarchicalDirs', () => {
    it('ベーシックケース', async () => {
      const actual = await storageService.createHierarchicalDirs([`d3`, `d1/d11`, `d1/d12`, `d2/d21`])

      expect(actual.length).toBe(6)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d12`)
      expect(actual[3].path).toBe(`d2`)
      expect(actual[4].path).toBe(`d2/d21`)
      expect(actual[5].path).toBe(`d3`)
      await existsNodes(actual, storageService)
    })

    it('既に存在するディレクトリを作成しようとした場合', async () => {
      const [d1_a] = await storageService.createHierarchicalDirs([`d1`])

      const actual = await storageService.createHierarchicalDirs([`d1`])

      expect(actual.length).toBe(0)
      const d1_b = await storageService.getNodeById(d1_a.id)
      expect(d1_a).toEqual(d1_b)
    })

    it('作成ディレクトリパスへのバリデーション実行確認', async () => {
      const validatePath = td.replace(StorageService, 'validatePath')

      await storageService.createHierarchicalDirs([`d1`, `d2`])

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(`d1`)
      expect(explanation.calls[1].args[0]).toBe(`d2`)
    })
  })

  describe('removeDir', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`, `d2`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/fileC.txt`,
        },
      ])

      const actual = await storageService.removeDir(`d1`)

      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/d11/fileA.txt`)
      expect(actual.list[3].path).toBe(`d1/fileB.txt`)
      await notExistsNodes(actual.list, storageService)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      // 何も行われない(エラーも発生しない)
      const actual = await storageService.removeDir(`d1`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('dirPathに空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.removeDir(``)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The argument 'dirPath' is empty.`)
    })

    it('大量データの場合', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`, `d1/d12`])
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
      uploadItems.push({
        data: `test11`,
        contentType: 'text/plain; charset=utf-8',
        path: `file11.txt`,
      })
      await storageService.uploadDataItems(uploadItems)

      // 大量データを想定して分割で削除を行う
      const actual: StorageNode[] = []
      let removed = await storageService.removeDir(`d1`, { maxChunk: 3 })
      actual.push(...removed.list)
      while (removed.nextPageToken) {
        removed = await storageService.removeDir(`d1`, { maxChunk: 3 })
        actual.push(...removed.list)
      }

      StorageService.sortNodes(actual)
      expect(actual.length).toBe(14)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/file01.txt`)
      expect(actual[4].path).toBe(`d1/d11/d111/file02.txt`)
      expect(actual[5].path).toBe(`d1/d11/d111/file03.txt`)
      expect(actual[6].path).toBe(`d1/d11/d111/file04.txt`)
      expect(actual[7].path).toBe(`d1/d11/d111/file05.txt`)
      expect(actual[8].path).toBe(`d1/d12`)
      expect(actual[9].path).toBe(`d1/d12/file06.txt`)
      expect(actual[10].path).toBe(`d1/d12/file07.txt`)
      expect(actual[11].path).toBe(`d1/d12/file08.txt`)
      expect(actual[12].path).toBe(`d1/d12/file09.txt`)
      expect(actual[13].path).toBe(`d1/d12/file10.txt`)
      await notExistsNodes(actual, storageService)
    })
  })

  describe('removeFile', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.removeFile(`d1/fileA.txt`))!

      expect(actual.path).toBe(`d1/fileA.txt`)
      await notExistsNodes([actual], storageService)
    })

    it('存在しないファイルを指定', async () => {
      const actual = await storageService.removeFile(`d1/fileXXX.txt`)

      expect(actual).toBeUndefined()
    })

    it('filePathに空文字を指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.removeFile(``)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The argument 'filePath' is empty.`)
    })
  })

  describe('moveDir', () => {
    it('ベーシックケース', async () => {
      // ファイルをアップロード
      await storageService.createHierarchicalDirs([`d1/d11`, `d2`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1`)).list
      expect(fmNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      const actual = await storageService.moveDir(`d1`, `d2/d1`)

      // 戻り値の検証
      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d2/d1`)
      expect(actual.list[1].path).toBe(`d2/d1/d11`)
      expect(actual.list[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // 移動後の'd2/d1'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`d2/d1`)).list
      StorageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(3)
      expect(movedNodes[0].path).toBe(`d2/d1`)
      expect(movedNodes[1].path).toBe(`d2/d1/d11`)
      expect(movedNodes[2].path).toBe(`d2/d1/d11/fileA.txt`)
    })

    it('バケット直下へ移動する場合', async () => {
      await storageService.createHierarchicalDirs([`d1/docs`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/docs/fileA.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1/docs`)).list
      expect(fmNodes.length).toBe(2)

      // 'd1/d11'をバケット直下へ移動
      const actual = await storageService.moveDir(`d1/docs`, `docs`)

      // 戻り値の検証
      StorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`docs`)
      expect(actual.list[1].path).toBe(`docs/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // 移動後の'docs'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`docs`)).list
      StorageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(2)
      expect(movedNodes[0].path).toBe(`docs`)
      expect(movedNodes[1].path).toBe(`docs/fileA.txt`)
    })

    it('移動先に同名のディレクトリが存在する場合', async () => {
      // ディレクトリを作成
      // ('d1'と'd2'配下に'docs'を作成)
      await storageService.createHierarchicalDirs([`d1/docs`, `d2/docs`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/docs/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/docs/fileB.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1/docs`)).list
      expect(fmNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir(`d1/docs`, `d2/docs`)

      // 戻り値の検証
      StorageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d2/docs`)
      expect(actual.list[1].path).toBe(`d2/docs/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // 移動後の'd2/docs'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`d2/docs`)).list
      StorageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(3)
      expect(movedNodes[0].path).toBe(`d2/docs`)
      expect(movedNodes[1].path).toBe(`d2/docs/fileA.txt`)
      expect(movedNodes[2].path).toBe(`d2/docs/fileB.txt`)
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ファイルをアップロード
      // 'd1'と'd2'配下に同じ名前の'file.txt'を配置
      await storageService.createHierarchicalDirs([`d1/docs`, `d2/docs`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/docs/file.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/docs/file.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1/docs`)).list
      expect(fmNodes.length).toBe(2)
      const existsToNodes = (await storageService.getDirDescendants(`d2/docs`)).list
      expect(existsToNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir(`d1/docs`, `d2/docs`)

      // 戻り値の検証
      StorageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d2/docs`)
      expect(actual.list[1].path).toBe(`d2/docs/file.txt`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // 移動後の'd2/docs'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`d2/docs`)).list
      StorageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(2)
      expect(movedNodes[0].path).toBe(`d2/docs`)
      expect(movedNodes[1].path).toBe(`d2/docs/file.txt`)

      // 移動元の'd1/docs/file.txt'の内容が移動先の'd2/docs/file.txt'に上書きされたことを検証
      const { file } = await storageService.getStorageFile(`d2/docs/file.txt`)
      const fileData = await file.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元と移動先が同じ場合', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1`])

      let actual: Error
      try {
        const fmNode = (await storageService.getNodeByPath(`d1`))!
        await storageService.moveDir(fmNode.path, fmNode.path + '/') // 移動先に'/'を付けて試す
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source and destination are the same: 'd1' -> 'd1'`)
    })

    it('移動先ディレクトリが存在しない場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      let actual!: Error
      try {
        await storageService.moveDir(`d1`, `d2/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory does not exist: 'd2'`)
    })

    it('移動先ディレクトリが移動元のサブディレクトリの場合', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      let actual!: Error
      try {
        await storageService.moveDir(`d1`, `d1/d11/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory is its own subdirectory: 'd1' -> 'd1/d11/d1'`)
    })

    it('移動元から移動先に共有設定が引き継がれるか検証 - 移動先に同名のディレクトリはない', async () => {
      // ファイルをアップロード
      await storageService.createHierarchicalDirs([`dX/dA/dB`, `dY`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `dX/dA/dB/fileA.txt`,
        },
      ])

      // 共有設定
      await storageService.setDirShareSettings(`dX/dA`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })
      await storageService.setDirShareSettings(`dX/dA/dB`, { isPublic: true, readUIds: ['jiro'], writeUIds: ['jiro'] })
      await storageService.setFileShareSettings(`dX/dA/dB/fileA.txt`, {
        isPublic: true,
        readUIds: ['saburo'],
        writeUIds: ['saburo'],
      })

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`dX/dA`)).list

      // 'dX/dA'を'dY/dA'へ移動
      const actual = await storageService.moveDir(`dX/dA`, `dY/dA`)

      //
      // 戻り値の検証
      //
      StorageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`dY/dA`)
      expect(actual.list[1].path).toBe(`dY/dA/dB`)
      expect(actual.list[2].path).toBe(`dY/dA/dB/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(actual.list[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })
      expect(actual.list[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro'],
        writeUIds: ['jiro'],
      })
      expect(actual.list[2].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['saburo'],
        writeUIds: ['saburo'],
      })

      //
      // 移動後の'dY/dA'＋配下ノードを検証
      //
      const movedNodes = (await storageService.getDirDescendants(`dY/dA`)).list
      expect(movedNodes.length).toBe(3)
      expect(movedNodes[0].path).toBe(`dY/dA`)
      expect(movedNodes[1].path).toBe(`dY/dA/dB`)
      expect(movedNodes[2].path).toBe(`dY/dA/dB/fileA.txt`)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(movedNodes[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })
      expect(movedNodes[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro'],
        writeUIds: ['jiro'],
      })
      expect(movedNodes[2].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['saburo'],
        writeUIds: ['saburo'],
      })
    })

    it('移動元から移動先に共有設定が引き継がれるか検証 - 移動先に同名のディレクトリがある', async () => {
      // ファイルをアップロード
      await storageService.createHierarchicalDirs([`dX/dA`, `dY/dA`])
      await storageService.uploadDataItems([
        {
          data: 'testA-X',
          contentType: 'text/plain; charset=utf-8',
          path: `dX/dA/fileA.txt`,
        },
        {
          data: 'testA-Y',
          contentType: 'text/plain; charset=utf-8',
          path: `dY/dA/fileA.txt`,
        },
      ])

      // 共有設定
      // 'dX'配下ノードの設定
      await storageService.setDirShareSettings(`dX/dA`, {
        isPublic: true,
        readUIds: ['ichiro-X'],
        writeUIds: ['ichiro-X'],
      })
      await storageService.setFileShareSettings(`dX/dA/fileA.txt`, {
        isPublic: true,
        readUIds: ['jiro-X'],
        writeUIds: ['jiro-X'],
      })
      // 'dY'配下ノードの設定
      await storageService.setDirShareSettings(`dY/dA`, { isPublic: false, readUIds: ['ichiro-Y'] })
      await storageService.setFileShareSettings(`dY/dA/fileA.txt`, {
        isPublic: false,
        readUIds: ['jiro-Y'],
        writeUIds: ['jiro-Y'],
      })

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`dX/dA`)).list

      // 'dX/dA'を'dY/dA'へ移動
      const actual = await storageService.moveDir(`dX/dA`, `dY/dA`)

      //
      // 戻り値の検証
      //
      StorageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`dY/dA`)
      expect(actual.list[1].path).toBe(`dY/dA/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(actual.list[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro-X'],
        writeUIds: ['ichiro-X'],
      })
      expect(actual.list[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro-X'],
        writeUIds: ['jiro-X'],
      })

      //
      // 移動後の'dY/dA'＋配下ノードを検証
      //
      const movedNodes = (await storageService.getDirDescendants(`dY/dA`)).list
      expect(movedNodes.length).toBe(2)
      expect(movedNodes[0].path).toBe(`dY/dA`)
      expect(movedNodes[1].path).toBe(`dY/dA/fileA.txt`)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(movedNodes[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro-X'],
        writeUIds: ['ichiro-X'],
      })
      expect(movedNodes[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro-X'],
        writeUIds: ['jiro-X'],
      })
    })

    it('移動先ディレクトリパスへのバリデーション実行確認', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // バリデーションメソッドのモック化
      const validatePath = td.replace(StorageService, 'validatePath')

      await storageService.moveDir(`d1`, `d2`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2`)
    })

    it('大量データの場合', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1/d11/d111`, `d1/d12`, `dA`])

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
      await storageService.uploadDataItems(uploadItems)

      // 移動前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1`)).list

      // 大量データを想定して分割で移動を行う
      // 'd1'を'dA/d1'へ移動
      const actual = await storageService.moveDir(`d1`, `dA/d1`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const pagination = await storageService.moveDir(`d1`, `dA/d1`, { maxChunk: 3, pageToken: actual.nextPageToken })
        actual.nextPageToken = pagination.nextPageToken
        actual.list.push(...pagination.list)
      }

      // 戻り値の検証
      StorageService.sortNodes(actual.list)
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
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // 移動後の'dA'＋配下ノードを検証
      const movedNodes = (await storageService.getDirDescendants(`dA`)).list
      StorageService.sortNodes(movedNodes)
      expect(movedNodes.length).toBe(15)
      expect(movedNodes[0].path).toBe(`dA`)
      expect(movedNodes[1].path).toBe(`dA/d1`)
      expect(movedNodes[2].path).toBe(`dA/d1/d11`)
      expect(movedNodes[3].path).toBe(`dA/d1/d11/d111`)
      expect(movedNodes[4].path).toBe(`dA/d1/d11/d111/file01.txt`)
      expect(movedNodes[5].path).toBe(`dA/d1/d11/d111/file02.txt`)
      expect(movedNodes[6].path).toBe(`dA/d1/d11/d111/file03.txt`)
      expect(movedNodes[7].path).toBe(`dA/d1/d11/d111/file04.txt`)
      expect(movedNodes[8].path).toBe(`dA/d1/d11/d111/file05.txt`)
      expect(movedNodes[9].path).toBe(`dA/d1/d12`)
      expect(movedNodes[10].path).toBe(`dA/d1/d12/file06.txt`)
      expect(movedNodes[11].path).toBe(`dA/d1/d12/file07.txt`)
      expect(movedNodes[12].path).toBe(`dA/d1/d12/file08.txt`)
      expect(movedNodes[13].path).toBe(`dA/d1/d12/file09.txt`)
      expect(movedNodes[14].path).toBe(`dA/d1/d12/file10.txt`)
    })
  })

  describe('moveFile', () => {
    it('ベーシックケース', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1`, `d2`])

      // ファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!

      // 'd1/fileA.txt'を'd2'へ移動
      const actual = await storageService.moveFile(fmNode.path, `d2/fileA.txt`)

      expect(actual.path).toBe(`d2/fileA.txt`)
      await verifyMoveNodes([fmNode], [actual], storageService, storeService)
    })

    it('バケット直下へ移動する場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!

      // 'd1/fileA.txt'をバケット直下へ移動
      const actual = await storageService.moveFile(fmNode.path, `fileA.txt`)

      expect(actual.path).toBe(`fileA.txt`)
      await verifyMoveNodes([fmNode], [actual], storageService, storeService)
    })

    it('移動先に同名のファイルが存在する場合', async () => {
      // ファイルをアップロード
      // 'd1'と'd2'配下に'file.txt'を配置
      await storageService.createHierarchicalDirs([`d1`, `d2`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/file.txt`,
        },
      ])

      // 移動前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/file.txt`))!
      const existsToFile = (await storageService.getFileNodeByPath(`d2/file.txt`))!
      expect(existsToFile).toBeDefined()

      // 'd1/file.txt'を'd2'へ移動
      const actual = await storageService.moveFile(fmNode.path, `d2/file.txt`)

      expect(actual.path).toBe(`d2/file.txt`)
      await verifyMoveNodes([fmNode], [actual], storageService, storeService)

      // 移動元の'd1/file.txt'の内容が移動先の'd2/file.txt'に上書きされたことを検証
      const { file } = await storageService.getStorageFile(`d2/file.txt`)
      const fileData = await file.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元ファイルがない場合', async () => {
      let actual: Error
      try {
        await storageService.moveFile(`d1/fileA.txt`, `d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The source file does not exist: 'd1/fileA.txt'`)
    })

    it('移動先ディレクトリが存在しない場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      let actual!: Error
      try {
        const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!
        await storageService.moveFile(fmNode.path, `d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The destination directory does not exist: 'd2'`)
    })

    it('移動先ファイルパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1`, `d2`])

      // ファイルをアップロード
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // バリデーションメソッドのモック化
      const validatePath = td.replace(StorageService, 'validatePath')

      await storageService.moveFile(`d1/fileA.txt`, `d2/fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2/fileA.txt`)
    })
  })

  describe('renameDir', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // リネーム前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1`)).list

      // 'd1'を'd2'へリネーム
      const actual = await storageService.renameDir(`d1`, `d2`)

      // 戻り値の検証
      StorageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d2`)
      expect(actual.list[1].path).toBe(`d2/d11`)
      expect(actual.list[2].path).toBe(`d2/d11/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // リネーム後の'd2'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`d2`)).list
      StorageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(3)
      expect(renamedNodes[0].path).toBe(`d2`)
      expect(renamedNodes[1].path).toBe(`d2/d11`)
      expect(renamedNodes[2].path).toBe(`d2/d11/fileA.txt`)
    })

    it('リネームしようとする名前のディレクトリが既に存在する場合', async () => {
      await storageService.createHierarchicalDirs([`d1/docs`, `d1/files`])

      let actual: Error
      try {
        // 'd1/docs'を'd1/files'へリネーム
        const dirNode = (await storageService.getNodeByPath(`d1/docs`))!
        await storageService.renameDir(dirNode.path, `files`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified directory name already exists: 'd1/docs' -> 'd1/files'`)
    })

    it('ディレクトリパスにディレクトリ名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/d1'というディレクトリを作成
      await storageService.createHierarchicalDirs([`d1/d1`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        // 'd1/d1'というディレクトリにファイルを配置
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d1/fileA.txt`,
        },
      ])

      // リネーム前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1/d1`)).list

      // 'd1/d1'を'd1/d2'へリネーム
      const actual = await storageService.renameDir(`d1/d1`, `d2`)

      // 戻り値の検証
      StorageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1/d2`)
      expect(actual.list[1].path).toBe(`d1/d2/fileA.txt`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // リネーム後の'd2'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`d1/d2`)).list
      StorageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(2)
      expect(renamedNodes[0].path).toBe(`d1/d2`)
      expect(renamedNodes[1].path).toBe(`d1/d2/fileA.txt`)
    })

    it('既存のディレクトリ名に文字を付け加える形でリネームをした場合', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1`])

      // リネーム前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`d1`)).list

      // 'd1'を'd1XXX'へリネーム
      const actual = await storageService.renameDir(`d1`, `d1XXX`)

      // 戻り値の検証
      StorageService.sortNodes(actual.list)
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1XXX`)
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // リネーム後の'd1'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`d1XXX`)).list
      StorageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(1)
      expect(renamedNodes[0].path).toBe(`d1XXX`)
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1`])

      // バリデーションメソッドのモック化
      const validateDirName = td.replace(StorageService, 'validateDirName')

      await storageService.renameDir(`d1`, `d2`)

      const explanation = td.explain(validateDirName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d2`)
    })

    it('大量データの場合', async () => {
      // ファイルをアップロード
      await storageService.createHierarchicalDirs([`dA/d1/d11/d111`, `dA/d1/d12`])
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
      await storageService.uploadDataItems(uploadItems)

      // リネーム前のノードを取得
      const fmNodes = (await storageService.getDirDescendants(`dA`)).list

      // 大量データを想定して分割でリネームを行う
      // 'dA'を'dB'へリネーム
      const actual = await storageService.renameDir(`dA`, `dB`, { maxChunk: 3 })
      while (actual.nextPageToken) {
        const nodeData = await storageService.renameDir(`dA`, `dB`, { maxChunk: 3, pageToken: actual.nextPageToken })
        actual.nextPageToken = nodeData.nextPageToken
        actual.list.push(...nodeData.list)
      }

      StorageService.sortNodes(actual.list)
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
      await verifyMoveNodes(fmNodes, actual.list, storageService, storeService)

      // 移動後の'dB'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`dB`)).list
      StorageService.sortNodes(renamedNodes)
      expect(renamedNodes.length).toBe(15)
      expect(renamedNodes[0].path).toBe(`dB`)
      expect(renamedNodes[1].path).toBe(`dB/d1`)
      expect(renamedNodes[2].path).toBe(`dB/d1/d11`)
      expect(renamedNodes[3].path).toBe(`dB/d1/d11/d111`)
      expect(renamedNodes[4].path).toBe(`dB/d1/d11/d111/file01.txt`)
      expect(renamedNodes[5].path).toBe(`dB/d1/d11/d111/file02.txt`)
      expect(renamedNodes[6].path).toBe(`dB/d1/d11/d111/file03.txt`)
      expect(renamedNodes[7].path).toBe(`dB/d1/d11/d111/file04.txt`)
      expect(renamedNodes[8].path).toBe(`dB/d1/d11/d111/file05.txt`)
      expect(renamedNodes[9].path).toBe(`dB/d1/d12`)
      expect(renamedNodes[10].path).toBe(`dB/d1/d12/file06.txt`)
      expect(renamedNodes[11].path).toBe(`dB/d1/d12/file07.txt`)
      expect(renamedNodes[12].path).toBe(`dB/d1/d12/file08.txt`)
      expect(renamedNodes[13].path).toBe(`dB/d1/d12/file09.txt`)
      expect(renamedNodes[14].path).toBe(`dB/d1/d12/file10.txt`)
    })
  })

  describe('renameFile', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // リネーム前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!

      // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
      const actual = await storageService.renameFile(`d1/fileA.txt`, `fileB.txt`)

      expect(actual.path).toBe(`d1/fileB.txt`)
      await verifyMoveNodes([fmNode], [actual], storageService, storeService)
    })

    it('リネームしようとする名前のファイルが既に存在する場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
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
      ])

      let actual: Error
      try {
        // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
        await storageService.renameFile('d1/fileA.txt', `fileB.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual!.message).toBe(`The specified file name already exists: 'd1/fileA.txt' -> 'd1/fileB.txt'`)
    })

    it('ファイルパスにファイル名と同じディレクトリがあった場合', async () => {
      // ディレクトリを作成
      // あえて'd1/fileA.txt'というディレクトリを作成
      await storageService.createHierarchicalDirs([`d1/fileA.txt`])

      // 作成したディレクトリにファイルをアップロード
      await storageService.uploadDataItems([
        // 'd1/fileA.txt'というディレクトリに'fileA.txt'というファイルを配置
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt/fileA.txt`,
        },
      ])

      // リネーム前のノードを取得
      const fmNode = (await storageService.getFileNodeByPath(`d1/fileA.txt/fileA.txt`))!

      // 'd1/fileA.txt/fileA.txt'を'd1/fileA.txt/fileB.txt'へリネーム
      const actual = await storageService.renameFile('d1/fileA.txt/fileA.txt', 'fileB.txt')

      // 'fileA.txt'というディレクトリ名は変わらず、
      // 'fileA.txt'が'fileB.txt'に名前変更されたことを確認
      expect(actual!.path).toBe(`d1/fileA.txt/fileB.txt`)
      await verifyMoveNodes([fmNode], [actual], storageService, storeService)
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // バリデーションメソッドのモック化
      const validateFileName = td.replace(StorageService, 'validateFileName')

      await storageService.renameFile(`d1/fileA.txt`, `fileB.txt`)

      const explanation = td.explain(validateFileName)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`fileB.txt`)
    })
  })

  describe('setDirShareSettings', () => {
    beforeEach(async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setDirShareSettings(`d1`, { isPublic: true })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 公開フラグをオフに設定
      const actual = await storageService.setDirShareSettings(`d1`, { isPublic: false })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: false,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: [], writeUIds: [] })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: null, writeUIds: null })

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setDirShareSettings(`dXXX`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified directory does not exist: 'dXXX'`)
    })

    it('inputにnullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setDirShareSettings(`d1`, null)

      const verify = (node: StorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify((await storageService.getNodeById(actual.id))!)
    })

    it('作成日時＋更新日時の検証', async () => {
      // 共有設定前のノードを取得
      const fm_d1 = (await storageService.getNodeByPath(`d1`))!

      // 共有設定を実行
      const to_d1 = await storageService.setDirShareSettings(`d1`, { isPublic: true })

      // 作成日時の検証
      expect(to_d1.createdAt).toEqual(fm_d1.createdAt)
      // 更新日時の検証
      expect(to_d1.updatedAt).toEqual(fm_d1.updatedAt)
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareSettings(`d1`, { readUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'readUIds' had an incorrect value: 'xxx,yyy'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareSettings(`d1`, { writeUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'writeUIds' had an incorrect value: 'xxx,yyy'`)
    })
  })

  describe('setFileShareSettings', () => {
    beforeEach(async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, { isPublic: true })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, {
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setFileShareSettings(`d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 公開フラグをオフに設定
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, { isPublic: false })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: false,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setFileShareSettings(`d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, { readUIds: [], writeUIds: [] })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setFileShareSettings(`d1/fileA.txt`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, { readUIds: null, writeUIds: null })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(`d1/zzz.txt`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified file does not exist: 'd1/zzz.txt'`)
    })

    it('inputにnullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setFileShareSettings(`d1/fileA.txt`, null)

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
        const metadata = storageService.extractMetaData(node.file)
        expect(metadata.version).toBe(node.version)
      }
      verify(actual)
      verify((await storageService.getFileNodeById(actual.id))!)
    })

    it('作成日時＋更新日時の検証', async () => {
      // 共有設定前のノードを取得
      const fm_fileA = (await storageService.getFileNodeByPath(`d1/fileA.txt`))!

      // 共有設定を実行
      const to_fileA = await storageService.setFileShareSettings(`d1/fileA.txt`, { isPublic: true })

      // 作成日時の検証
      expect(to_fileA.createdAt).toEqual(fm_fileA.createdAt)
      // 更新日時の検証
      expect(to_fileA.updatedAt).toEqual(fm_fileA.updatedAt)
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(`d1/fileA.txt`, { readUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'readUIds' had an incorrect value: 'xxx,yyy'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.setFileShareSettings(`d1/fileA.txt`, { writeUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`The specified 'writeUIds' had an incorrect value: 'xxx,yyy'`)
    })
  })

  describe('handleUploadedFile', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // テストのためストアからファイルノードを削除しておく
      await storeService.storageDao.delete((await storageService.getNodeByPath(`d1/d11/fileA.txt`))!.id)

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedFile(`d1/d11/fileA.txt`))!

      // 戻り値の検証
      const { file, ...fileNode } = actual
      await existsNodes([fileNode], storageService)

      // 祖先ディレクトリが作成されたことを検証
      const ancestors = await storageService.getAncestorDirs(fileNode.path)
      expect(ancestors[0].path).toBe(`d1`)
      expect(ancestors[1].path).toBe(`d1/d11`)
    })

    it('アップロードによるファイル更新後の実行', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      const [fileNodeA_1] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
          share: { readUIds: ['ichiro'] },
        },
      ])

      // アップロードによってファイルが更新された状態を作成する
      {
        const bucket = admin.storage().bucket()
        const file = bucket.file(fileNodeA_1.path)
        await file.save('testA-2', { contentType: 'text/plain; charset=utf-8' })
        await storageService.saveMetadata(file, { version: 2 })
      }

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedFile(fileNodeA_1.path))!

      // 戻り値の検証
      const { file, ...fileNodeA_2 } = actual
      expect(fileNodeA_2.share).toEqual(fileNodeA_1.share)
      await existsNodes([fileNodeA_2], storageService)
    })

    it('複数回実行した場合', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      const [fileNodeA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // テストのためストアからファイルノードを削除しておく
      await storeService.storageDao.delete((await storageService.getNodeByPath(`d1/d11/fileA.txt`))!.id)

      // ファイルアップロードの後処理を実行 - 1
      await storageService.handleUploadedFile(fileNodeA.path)
      const fileNodeA_1 = (await storageService.getNodeByPath(`d1/d11/fileA.txt`))!
      const fileA_1 = (await storageService.getStorageFile(`d1/d11/fileA.txt`))!

      // ファイルアップロードの後処理を実行 - 2
      await storageService.handleUploadedFile(fileNodeA.path)
      const fileNodeA_2 = (await storageService.getNodeByPath(`d1/d11/fileA.txt`))!
      const fileA_2 = (await storageService.getStorageFile(`d1/d11/fileA.txt`))!

      // 1回目と2回目で内容が同じことを検証
      expect(fileNodeA_1).toEqual(fileNodeA_2)
      expect(fileA_1.version).toEqual(fileA_2.version)
    })

    it('ファイルパスへのバリデーション実行確認', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const validatePath = td.replace(StorageService, 'validatePath')

      await storageService.handleUploadedFile(`d1/fileA.txt`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length >= 1).toBeTruthy()
      expect(explanation.calls[0].args[0]).toBe(`d1/fileA.txt`)
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: Error
      try {
        await storageService.handleUploadedFile(`d1/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`Uploaded file not found: 'd1/fileA.txt'`)
    })

    it('ファイルの祖先が存在しない場合', async () => {
      const bucket = admin.storage().bucket()
      const file = bucket.file(`d1/fileA.txt`)
      await file.save('testA', { contentType: 'text/plain' })

      let actual!: InputValidationError
      try {
        await storageService.handleUploadedFile(`${file.name}`)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The ancestor directory of the file does not exist.`)
      expect(actual.detail.values).toEqual({
        filePath: file.name,
        ancestorPath: `d1`,
      })

      const { exists } = await storageService.getStorageFile(file.name)
      expect(exists).toBeFalsy()
    })
  })

  describe('getSignedUploadUrls', () => {
    it('ベーシックケース', async () => {
      const requestOrigin = config.cors.whitelist[0]
      const inputs: SignedUploadUrlInput[] = [
        { filePath: `fileA.txt`, contentType: 'text/plain' },
        { filePath: `fileB.txt`, contentType: 'text/plain' },
      ]

      const actual = await storageService.getSignedUploadUrls(requestOrigin, inputs)

      expect(actual.length).toBe(2)
    })
  })

  describe('streamFile', () => {
    let app: any

    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER)
    })

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    it('画像ファイルをダウンロード', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const localFilePath = `${__dirname}/${TEST_FILES_DIR}/desert.jpg`
      const toFilePath = `d1/desert.jpg`
      const [fileNode] = await storageService.uploadLocalFiles([{ localFilePath, toFilePath }])

      return request(app.getHttpServer())
        .get(`/${fileNode.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          const localFileBuffer = fs.readFileSync(localFilePath)
          expect(res.body).toEqual(localFileBuffer)
        })
    })

    it('テキストファイルをダウンロード', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const fileData = 'test'
      const [fileNode] = await storageService.uploadDataItems([
        {
          data: fileData,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      return request(app.getHttpServer())
        .get(`/${fileNode.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(fileData)
        })
    })

    it('If-Modified-Sinceの検証', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileNode] = await storageService.uploadDataItems([
        {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      return request(app.getHttpServer())
        .get(`/${fileNode.path}`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .set('If-Modified-Since', fileNode.updatedAt.toString())
        .expect(304)
    })

    it('存在しないファイルを指定', async () => {
      return request(app.getHttpServer())
        .get(`/12345678901234567890`)
        .set({ ...APP_ADMIN_USER_HEADER })
        .expect(404)
    })
  })

  describe('sortNodes', () => {
    it('ベーシックケース', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
      const d12 = newTestStorageDirNode(`d1/d12`)
      const fileB = newTestStorageFileNode(`d1/d12/fileB.txt`)
      const d2 = newTestStorageDirNode(`d2`)
      const fileC = newTestStorageFileNode(`d2/fileC.txt`)
      const fileD = newTestStorageFileNode(`a.txt`)
      const fileE = newTestStorageFileNode(`b.txt`)

      const nodes = [fileA, fileB, fileC, fileE, fileD, d1, d2, d11, d12]
      StorageService.sortNodes(nodes)

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
})
