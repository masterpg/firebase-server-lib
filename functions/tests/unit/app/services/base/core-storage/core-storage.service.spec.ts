import * as admin from 'firebase-admin'
import * as td from 'testdouble'
import { AppError, initApp } from '../../../../../../src/app/base'
import {
  CoreStorageNode,
  CreateStorageNodeInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  SignedUploadUrlInput,
  StorageNodeShareSettings,
  StorageNodeType,
  StorageUploadDataItem,
} from '../../../../../../src/app/services'
import {
  CoreStorageService,
  CoreStorageServiceDI,
  CoreStorageServiceModule,
  StorageFileNode,
} from '../../../../../../src/app/services/base/core-storage'
import { CoreStorageTestHelper, CoreStorageTestService } from '../../../../../helpers/app'
import { Test, TestingModule } from '@nestjs/testing'
import { closePointInTime, decodePageToken, newElasticClient } from '../../../../../../src/app/base/elastic'
import { removeBothEndsSlash, sleep } from 'web-base-lib'
import { config } from '../../../../../../src/config'
const performance = require('perf_hooks').performance

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const TestFilesDir = 'test-files'

//========================================================================
//
//  Tests
//
//========================================================================

describe('CoreStorageService', () => {
  let testingModule!: TestingModule
  let storageService!: CoreStorageTestService
  let devUtilsService!: DevUtilsServiceDI.type
  let h!: CoreStorageTestHelper

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule, CoreStorageServiceModule],
    }).compile()

    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    storageService = testingModule.get<CoreStorageTestService>(CoreStorageServiceDI.symbol)
    h = new CoreStorageTestHelper(storageService)

    await h.removeAllNodes()

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(1500)
  })

  afterEach(() => {
    td.reset()
  })

  describe('getNode', () => {
    describe('ID検索', () => {
      it('ベーシックケース - ディレクトリ', async () => {
        const [, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

        const actual = (await storageService.getNode({ id: d11.id }))!

        expect(actual.id).toBe(d11.id)
        await h.existsNodes([actual])
      })

      it('ベーシックケース - ファイル', async () => {
        await storageService.createHierarchicalDirs([`d1`])
        const [fileA] = await storageService.uploadDataItems([
          {
            data: 'testA',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        const actual = (await storageService.getNode({ id: fileA.id }))!

        expect(actual.id).toBe(fileA.id)
        await h.existsNodes([actual])
      })

      it('空文字を指定した場合', async () => {
        const actual = await storageService.getNode({ id: '' })

        expect(actual).toBeUndefined()
      })
    })

    describe('パス検索', () => {
      it('ベーシックケース - ディレクトリ', async () => {
        const [, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

        const actual = (await storageService.getNode({ path: d11.path }))!

        expect(actual.path).toBe(d11.path)
        await h.existsNodes([actual])
      })

      it('ベーシックケース - ファイル', async () => {
        await storageService.createHierarchicalDirs([`d1`])
        const [fileA] = await storageService.uploadDataItems([
          {
            data: 'testA',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        const actual = (await storageService.getNode({ path: fileA.path }))!

        expect(actual.path).toBe(fileA.path)
        await h.existsNodes([actual])
      })

      it('空文字を指定した場合', async () => {
        const actual = await storageService.getNode({ path: '' })

        expect(actual).toBeUndefined()
      })
    })
  })

  describe('sgetNode', () => {
    describe('ID検索', () => {
      it('ベーシックケース', async () => {
        const [, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

        const actual = await storageService.sgetNode({ id: d11.id })

        expect(actual.id).toBe(actual.id)
        await h.existsNodes([actual])
      })

      it('引数ノードが存在しない場合', async () => {
        let actual!: AppError
        try {
          await storageService.sgetNode({ id: '12345678901234567890' })
        } catch (err) {
          actual = err
        }
        expect(actual.cause).toBe(`There is no node in the specified key: {"id":"12345678901234567890"}`)
      })
    })

    describe('パス検索', () => {
      it('ベーシックケース', async () => {
        const [, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

        const actual = await storageService.sgetNode({ path: d11.path })

        expect(actual.path).toBe(d11.path)
        await h.existsNodes([actual])
      })

      it('引数ノードが存在しない場合', async () => {
        let actual!: AppError
        try {
          await storageService.sgetNode({ path: 'aaa/bbb/ccc' })
        } catch (err) {
          actual = err
        }
        expect(actual.cause).toBe(`There is no node in the specified key: {"path":"aaa/bbb/ccc"}`)
      })
    })
  })

  describe('getNodes', () => {
    it('ベーシックケース', async () => {
      const [d1, d2, d3] = await storageService.createHierarchicalDirs([`d1`, `d2`, `d3`])
      const [fileA, fileB, fileC] = await storageService.uploadDataItems([
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
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileC.txt`,
        },
      ])

      const actual = await storageService.getNodes({
        ids: [d1.id, d3.id, '12345678901234567890'],
        paths: [fileA.path, fileC.path, 'aaa/bbb/ccc'],
      })

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d3`)
      expect(actual[2].path).toBe(`d1/fileA.txt`)
      expect(actual[3].path).toBe(`d1/fileC.txt`)
      await h.existsNodes(actual)
    })

    it('IDまたはパスを0件指定した場合', async () => {
      const actual = await storageService.getNodes({ ids: [], paths: [] })

      expect(actual.length).toBe(0)
    })

    it('IDまたはパスに空文字を指定した場合', async () => {
      const [d1] = await storageService.createHierarchicalDirs([`d1`])
      const [fileA, fileB, fileC] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = await storageService.getNodes({
        ids: [d1.id, ''],
        paths: [fileA.path, ''],
      })

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual)
    })
  })

  describe('getFileNode', () => {
    it('ベーシックケース - ID検索', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileNodeA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.getFileNode({ id: fileNodeA.id }))!

      expect(actual.id).toBe(actual.id)
      expect(actual.file.name).toBe(actual.id)
      await h.existsNodes([actual])
    })

    it('ベーシックケース - パス検索', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileNodeA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.getFileNode({ path: fileNodeA.path }))!

      expect(actual.path).toBe(actual.path)
      expect(actual.file.name).toBe(actual.id)
      await h.existsNodes([actual])
    })

    it('引数ノードが存在しない場合', async () => {
      const actual = await storageService.getFileNode({ id: '12345678901234567890' })

      expect(actual).toBeUndefined()
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/d11/d111`)
      expect(actual.list[2].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[3].path).toBe(`d1/d11/fileA.txt`)
      await h.existsNodes(actual.list)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual.list)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
      await h.existsNodes(actual.list)
    })

    it('対象ディレクトリにファイルパスを指定した場合', async () => {
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

    it('ページングがタイムアウトした場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 4; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadDataItems(uploadItems)

      // 強制的にページングをタイムアウトさせる
      const pagination = await storageService.getDirDescendants(`d1`, { maxChunk: 3 })
      const pageToken = decodePageToken(pagination.nextPageToken)
      await closePointInTime(storageService.client, pageToken.pit.id)

      // ページングがタイムアウトした状態で検索実行
      const actual = await storageService.getDirDescendants(`d1`, {
        maxChunk: 3,
        pageToken: pagination.nextPageToken,
      })

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
      expect(actual.isPaginationTimeout).toBeTruthy()
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
      const actual: CoreStorageNode[] = []
      let pagination = await storageService.getDirDescendants(`d1`, { maxChunk: 3 })
      actual.push(...pagination.list)
      while (pagination.nextPageToken) {
        pagination = await storageService.getDirDescendants(`d1`, { maxChunk: 3, pageToken: pagination.nextPageToken })
        actual.push(...pagination.list)
      }

      CoreStorageService.sortNodes(actual)
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
      await h.existsNodes(actual)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1/d11/d111`)
      expect(actual.list[1].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[2].path).toBe(`d1/d11/fileA.txt`)
      await h.existsNodes(actual.list)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual.list)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
      await h.existsNodes(actual.list)
    })

    it('対象ディレクトリにファイルパスを指定した場合', async () => {
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

    it('ページングがタイムアウトした場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 4; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadDataItems(uploadItems)

      // 強制的にページングをタイムアウトさせる
      const pagination = await storageService.getDescendants(`d1`, { maxChunk: 3 })
      const pageToken = decodePageToken(pagination.nextPageToken)
      await closePointInTime(storageService.client, pageToken.pit.id)

      // ページングがタイムアウトした状態で検索実行
      const actual = await storageService.getDescendants(`d1`, {
        maxChunk: 3,
        pageToken: pagination.nextPageToken,
      })

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
      expect(actual.isPaginationTimeout).toBeTruthy()
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
      const actual: CoreStorageNode[] = []
      let pagination = await storageService.getDescendants(`d1`, { maxChunk: 3 })
      actual.push(...pagination.list)
      while (pagination.nextPageToken) {
        pagination = await storageService.getDescendants(`d1`, { maxChunk: 3, pageToken: pagination.nextPageToken })
        actual.push(...pagination.list)
      }

      CoreStorageService.sortNodes(actual)
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
      await h.existsNodes(actual)
    })
  })

  describe('getDirDescendantCount', () => {
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

      const actual = await storageService.getDirDescendantCount(`d1/d11`)

      expect(actual).toBe(4)
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
      const actual = await storageService.getDirDescendantCount(`d1`)

      expect(actual).toBe(2)
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
      const actual = await storageService.getDirDescendantCount()

      expect(actual).toBe(3)
    })

    it('対象ディレクトリにファイルパスを指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDirDescendantCount('d1/fileA.txt')

      expect(actual).toBe(0)
    })
  })

  describe('getDescendantCount', () => {
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

      const actual = await storageService.getDescendantCount(`d1/d11`)

      expect(actual).toBe(3)
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
      const actual = await storageService.getDescendantCount(`d1`)

      expect(actual).toBe(1)
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
      const actual = await storageService.getDescendantCount()

      expect(actual).toBe(3)
    })

    it('対象ディレクトリにファイルパスを指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDescendantCount('d1/fileA.txt')

      expect(actual).toBe(0)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual.list)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual.list)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
      await h.existsNodes(actual.list)
    })

    it('対象ディレクトリにファイルパスを指定した場合', async () => {
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

    it('ページングがタイムアウトした場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 4; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadDataItems(uploadItems)

      // 強制的にページングをタイムアウトさせる
      const pagination = await storageService.getDirChildren(`d1`, { maxChunk: 3 })
      const pageToken = decodePageToken(pagination.nextPageToken)
      await closePointInTime(storageService.client, pageToken.pit.id)

      // ページングがタイムアウトした状態で検索実行
      const actual = await storageService.getDirChildren(`d1`, {
        maxChunk: 3,
        pageToken: pagination.nextPageToken,
      })

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
      expect(actual.isPaginationTimeout).toBeTruthy()
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
      const actual: CoreStorageNode[] = []
      let pagination = await storageService.getDirChildren(`d1`, { maxChunk: 3 })
      actual.push(...pagination.list)
      while (pagination.nextPageToken) {
        pagination = await storageService.getDirChildren(`d1`, { maxChunk: 3, pageToken: pagination.nextPageToken })
        actual.push(...pagination.list)
      }

      CoreStorageService.sortNodes(actual)
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
      await h.existsNodes(actual)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual.list)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual.list)
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

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
      await h.existsNodes(actual.list)
    })

    it('対象ディレクトリにファイルパスを指定した場合', async () => {
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

    it('ページングがタイムアウトした場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 4; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `d1/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadDataItems(uploadItems)

      // 強制的にページングをタイムアウトさせる
      const pagination = await storageService.getChildren(`d1`, { maxChunk: 3 })
      const pageToken = decodePageToken(pagination.nextPageToken)
      await closePointInTime(storageService.client, pageToken.pit.id)

      // ページングがタイムアウトした状態で検索実行
      const actual = await storageService.getChildren(`d1`, {
        maxChunk: 3,
        pageToken: pagination.nextPageToken,
      })

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
      expect(actual.isPaginationTimeout).toBeTruthy()
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
      const actual: CoreStorageNode[] = []
      let pagination = await storageService.getChildren(`d1`, { maxChunk: 3 })
      actual.push(...pagination.list)
      while (pagination.nextPageToken) {
        pagination = await storageService.getChildren(`d1`, { maxChunk: 3, pageToken: pagination.nextPageToken })
        actual.push(...pagination.list)
      }

      CoreStorageService.sortNodes(actual)
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
      await h.existsNodes(actual)
    })
  })

  describe('getDirChildCount', () => {
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

      const actual = await storageService.getDirChildCount(`d1`)

      expect(actual).toBe(3)
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
      const actual = await storageService.getDirChildCount(`d1`)

      expect(actual).toBe(2)
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
      const actual = await storageService.getDirChildCount()

      expect(actual).toBe(2)
    })

    it('対象ディレクトリにファイルパスを指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getDirChildCount('d1/fileA.txt')

      expect(actual).toBe(0)
    })
  })

  describe('getChildCount', () => {
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

      const actual = await storageService.getChildCount(`d1`)

      expect(actual).toBe(2)
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
      const actual = await storageService.getChildCount(`d1`)

      expect(actual).toBe(1)
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
      const actual = await storageService.getChildCount()

      expect(actual).toBe(2)
    })

    it('対象ディレクトリにファイルパスを指定した場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // dirPathにファイルパスを指定
      const actual = await storageService.getChildCount('d1/fileA.txt')

      expect(actual).toBe(0)
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
      await h.existsNodes(actual)
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
      await h.existsNodes(actual)
    })

    it('ベーシックケース - 引数にディレクトリを指定', async () => {
      await storageService.createHierarchicalDirs([`d1/d11/d111`])

      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111`)

      expect(actual.length).toBe(3)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      await h.existsNodes(actual)
    })

    it('ベーシックケース - 引数にバケット直下のディレクトリを指定', async () => {
      await storageService.createHierarchicalDirs([`d1`])

      const actual = await storageService.getHierarchicalNodes(`d1`)

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(`d1`)
      await h.existsNodes(actual)
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
      const d11 = await storageService.sgetNode({ path: `d1/d11` })
      const client = newElasticClient()
      await client.delete({
        index: CoreStorageService.IndexAlias,
        id: d11.id,
        refresh: true,
      })

      // 削除されたディレクトリが穴埋めされることを検証
      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)

      expect(actual.length).toBe(4)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      expect(actual[2].path).toBe(`d1/d11/d111`)
      expect(actual[3].path).toBe(`d1/d11/d111/fileA.txt`)
      await h.existsNodes(actual)
    })

    it('引数ノードが存在しない場合', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)

      // 実際に存在する祖先ノードが取得される
      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/d11`)
      await h.existsNodes(actual)
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
      await h.existsNodes(actual)
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
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual<StorageNodeShareSettings>({
        isPublic: null,
        readUIds: null,
        writeUIds: null,
      })

      await h.existsNodes([actual])
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

      await h.existsNodes([actual])
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定なし', async () => {
      const before = await storageService.createDir(`d1`)

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createDir(`d1`)

      expect(actual).toEqual(before)
      await h.existsNodes([actual])
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
      expect(actual.updatedAt.isAfter(before.updatedAt))
      expect(actual.version).toBe(before.version + 1)

      await h.existsNodes([actual])
    })

    it('祖先が存在しない場合', async () => {
      let actual!: AppError
      try {
        // 祖先がいないディレクトリ作成を試みる
        const actual = await storageService.createDir(`d1/d11`)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The ancestor directory of the specified directory does not exist.`)
      expect(actual.data).toEqual({
        specifiedPath: `d1/d11`,
        ancestorPath: `d1`,
      })
    })

    it('作成ディレクトリパスへのバリデーション実行確認', async () => {
      const validatePath = td.replace(CoreStorageService, 'validateNodePath')

      await storageService.createDir(`d1`)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(`d1`)
    })

    it('共有設定入力へのバリデーション実行確認', async () => {
      const validateShareSettingInput = td.replace(CoreStorageService, 'validateShareSettingInput')

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
      await h.existsNodes(actual)

      for (const node of actual) {
        expect(node.contentType).toBe('')
        expect(node.size).toBe(0)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: null,
          writeUIds: null,
        })
      }
    })

    it('既に存在するディレクトリを作成しようとした場合', async () => {
      const [d1] = await storageService.createHierarchicalDirs([`d1`])

      // 既に存在するディレクトリを作成
      const actual = await storageService.createHierarchicalDirs([`d1`])

      expect(actual.length).toBe(0)
      const _d1 = await storageService.getNode({ id: d1.id })
      expect(_d1).toEqual(d1)
    })

    it('作成ディレクトリパスへのバリデーション実行確認', async () => {
      const validatePath = td.replace(CoreStorageService, 'validateNodePath')

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
      const { list: beforeNodes } = await storageService.getDirDescendants(`d1`)

      await storageService.removeDir(`d1`)

      const removedNodes = await storageService.getDirDescendants(`d1`)
      expect(removedNodes.list.length).toBe(0)
      await h.notExistsNodes(beforeNodes)
    })

    it('存在しないディレクトリを指定した場合', async () => {
      // 何も行われない(エラーも発生しない)
      await storageService.removeDir(`d1`)
    })

    it('dirPathに空文字を指定した場合', async () => {
      let actual!: AppError
      try {
        await storageService.removeDir(``)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The argument 'dirPath' is empty.`)
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

      // 削除前の対象ノードを検証
      const { list: beforeNodes } = await storageService.getDirDescendants(`d1`)
      CoreStorageService.sortNodes(beforeNodes)
      expect(beforeNodes.map(node => node.path)).toEqual([
        `d1`,
        `d1/d11`,
        `d1/d11/d111`,
        `d1/d11/d111/file01.txt`,
        `d1/d11/d111/file02.txt`,
        `d1/d11/d111/file03.txt`,
        `d1/d11/d111/file04.txt`,
        `d1/d11/d111/file05.txt`,
        `d1/d12`,
        `d1/d12/file06.txt`,
        `d1/d12/file07.txt`,
        `d1/d12/file08.txt`,
        `d1/d12/file09.txt`,
        `d1/d12/file10.txt`,
      ])

      // テスト対象実行
      // 大量データを想定して分割で削除を行う
      await storageService.removeDir(`d1`, { maxChunk: 3 })

      // 削除後の対象ノードを検証
      const removedNodes = await storageService.getDirDescendants(`d1`)
      expect(removedNodes.list.length).toBe(0)
      await h.notExistsNodes(beforeNodes)
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
      await h.notExistsNodes([actual])
    })

    it('存在しないファイルを指定', async () => {
      const actual = await storageService.removeFile(`d1/fileXXX.txt`)

      expect(actual).toBeUndefined()
    })

    it('filePathに空文字を指定した場合', async () => {
      let actual!: AppError
      try {
        await storageService.removeFile(``)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The argument 'filePath' is empty.`)
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
      const { list: fromNodes } = await storageService.getDirDescendants(`d1`)
      expect(fromNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      await storageService.moveDir(`d1`, `d2/d1`)

      // 移動後の'd2/d1'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`d2/d1`)
      CoreStorageService.sortNodes(toNodes)
      expect(toNodes.length).toBe(3)
      expect(toNodes[0].path).toBe(`d2/d1`)
      expect(toNodes[1].path).toBe(`d2/d1/d11`)
      expect(toNodes[2].path).toBe(`d2/d1/d11/fileA.txt`)
      await h.verifyMoveNodes(fromNodes, `d2/d1`)
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
      const { list: fromNodes } = await storageService.getDirDescendants(`d1/docs`)
      expect(fromNodes.length).toBe(2)

      // 'd1/d11'をバケット直下へ移動
      const actual = await storageService.moveDir(`d1/docs`, `docs`)

      // 移動後の'docs'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`docs`)
      expect(toNodes.length).toBe(2)
      expect(toNodes[0].path).toBe(`docs`)
      expect(toNodes[1].path).toBe(`docs/fileA.txt`)
      await h.verifyMoveNodes(fromNodes, `docs`)
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
      const { list: fromNodes } = await storageService.getDirDescendants(`d1/docs`)
      expect(fromNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir(`d1/docs`, `d2/docs`)

      // 移動後の'd2/docs'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`d2/docs`)
      CoreStorageService.sortNodes(toNodes)
      expect(toNodes.length).toBe(3)
      expect(toNodes[0].path).toBe(`d2/docs`)
      expect(toNodes[1].path).toBe(`d2/docs/fileA.txt`)
      expect(toNodes[2].path).toBe(`d2/docs/fileB.txt`)
      await h.verifyMoveNodes(fromNodes, `d2/docs`)
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
      const { list: fromNodes } = await storageService.getDirDescendants(`d1/docs`)
      expect(fromNodes.length).toBe(2)
      const { list: existsToNodes } = await storageService.getDirDescendants(`d2/docs`)
      expect(existsToNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir(`d1/docs`, `d2/docs`)

      // 移動後の'd2/docs'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`d2/docs`)
      CoreStorageService.sortNodes(toNodes)
      expect(toNodes.length).toBe(2)
      expect(toNodes[0].path).toBe(`d2/docs`)
      expect(toNodes[1].path).toBe(`d2/docs/file.txt`)
      await h.verifyMoveNodes(fromNodes, `d2/docs`)

      // 移動元の'd1/docs/file.txt'の内容が移動先の'd2/docs/file.txt'に上書きされたことを検証
      const overwritten_d2_file = toNodes[1]
      const { file } = await storageService.getStorageFile(overwritten_d2_file.id)
      const fileData = await file.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元と移動先が同じ場合', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1`])

      let actual!: AppError
      try {
        const fromNode = await storageService.sgetNode({ path: `d1` })
        await storageService.moveDir(fromNode.path, fromNode.path + '/') // 移動先に'/'を付けて試す
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The source and destination are the same: 'd1' -> 'd1'`)
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

      let actual!: AppError
      try {
        await storageService.moveDir(`d1`, `d2/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The destination directory does not exist: 'd2'`)
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

      let actual!: AppError
      try {
        await storageService.moveDir(`d1`, `d1/d11/d1`)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The destination directory is its own subdirectory: 'd1' -> 'd1/d11/d1'`)
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
      await storageService.setDirShareSettings(`dX/dA`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })
      await storageService.setDirShareSettings(`dX/dA/dB`, {
        isPublic: true,
        readUIds: ['jiro'],
        writeUIds: ['jiro'],
      })
      await storageService.setFileShareSettings(`dX/dA/dB/fileA.txt`, {
        isPublic: true,
        readUIds: ['saburo'],
        writeUIds: ['saburo'],
      })

      // 移動前のノードを取得
      const { list: fromNodes } = await storageService.getDirDescendants(`dX/dA`)

      // 'dX/dA'を'dY/dA'へ移動
      await storageService.moveDir(`dX/dA`, `dY/dA`)

      // 移動後の'dY/dA'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`dY/dA`)
      expect(toNodes.length).toBe(3)
      expect(toNodes[0].path).toBe(`dY/dA`)
      expect(toNodes[1].path).toBe(`dY/dA/dB`)
      expect(toNodes[2].path).toBe(`dY/dA/dB/fileA.txt`)
      await h.verifyMoveNodes(fromNodes, `dY/dA`)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(toNodes[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })
      expect(toNodes[1].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['jiro'],
        writeUIds: ['jiro'],
      })
      expect(toNodes[2].share).toEqual<StorageNodeShareSettings>({
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
      const { list: fromNodes } = await storageService.getDirDescendants(`dX/dA`)

      // 'dX/dA'を'dY/dA'へ移動
      const actual = await storageService.moveDir(`dX/dA`, `dY/dA`)

      // 移動後の'dY/dA'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`dY/dA`)
      expect(toNodes.length).toBe(2)
      expect(toNodes[0].path).toBe(`dY/dA`)
      expect(toNodes[1].path).toBe(`dY/dA/fileA.txt`)
      await h.verifyMoveNodes(fromNodes, `dY/dA`)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(toNodes[0].share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro-X'],
        writeUIds: ['ichiro-X'],
      })
      expect(toNodes[1].share).toEqual<StorageNodeShareSettings>({
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
      const validatePath = td.replace(CoreStorageService, 'validateNodePath')

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
      const { list: fromNodes } = await storageService.getDirDescendants(`d1`)

      // 大量データを想定して分割で移動を行う
      // 'd1'を'dA/d1'へ移動
      await storageService.moveDir(`d1`, `dA/d1`, { maxChunk: 3 })

      // 移動後の'dA'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`dA/d1`)
      CoreStorageService.sortNodes(toNodes)
      expect(toNodes.length).toBe(14)
      expect(toNodes[0].path).toBe(`dA/d1`)
      expect(toNodes[1].path).toBe(`dA/d1/d11`)
      expect(toNodes[2].path).toBe(`dA/d1/d11/d111`)
      expect(toNodes[3].path).toBe(`dA/d1/d11/d111/file01.txt`)
      expect(toNodes[4].path).toBe(`dA/d1/d11/d111/file02.txt`)
      expect(toNodes[5].path).toBe(`dA/d1/d11/d111/file03.txt`)
      expect(toNodes[6].path).toBe(`dA/d1/d11/d111/file04.txt`)
      expect(toNodes[7].path).toBe(`dA/d1/d11/d111/file05.txt`)
      expect(toNodes[8].path).toBe(`dA/d1/d12`)
      expect(toNodes[9].path).toBe(`dA/d1/d12/file06.txt`)
      expect(toNodes[10].path).toBe(`dA/d1/d12/file07.txt`)
      expect(toNodes[11].path).toBe(`dA/d1/d12/file08.txt`)
      expect(toNodes[12].path).toBe(`dA/d1/d12/file09.txt`)
      expect(toNodes[13].path).toBe(`dA/d1/d12/file10.txt`)
      await h.verifyMoveNodes(fromNodes, `dA/d1`)
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
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] },
        },
      ])

      // 移動前のノードを取得
      const fromNode = await storageService.sgetFileNode({ path: `d1/fileA.txt` })

      // 'd1/fileA.txt'を'd2'へ移動
      const actual = await storageService.moveFile(fromNode.path, `d2/fileA.txt`)

      expect(actual.path).toBe(`d2/fileA.txt`)
      await h.verifyMoveNodes([fromNode], `d2/fileA.txt`)
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
      const fromNode = await storageService.sgetFileNode({ path: `d1/fileA.txt` })

      // 'd1/fileA.txt'をバケット直下へ移動
      const actual = await storageService.moveFile(fromNode.path, `fileA.txt`)

      expect(actual.path).toBe(`fileA.txt`)
      await h.verifyMoveNodes([fromNode], `fileA.txt`)
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
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] },
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `d2/file.txt`,
        },
      ])

      // 移動前のノードを取得
      const fromNode = await storageService.sgetFileNode({ path: `d1/file.txt` })
      const existsToFile = await storageService.sgetFileNode({ path: `d2/file.txt` })
      expect(existsToFile).toBeDefined()

      // 'd1/file.txt'を'd2'へ移動
      const actual = await storageService.moveFile(fromNode.path, `d2/file.txt`)

      expect(actual.path).toBe(`d2/file.txt`)
      await h.verifyMoveNodes([fromNode], `d2/file.txt`)

      // 移動元の'd1/file.txt'の内容が移動先の'd2/file.txt'に上書きされたことを検証
      const { file } = await storageService.getStorageFile(actual.id)
      const fileData = await file.download()
      expect(fileData.toString()).toBe('testA')
    })

    it('移動元ファイルがない場合', async () => {
      let actual!: AppError
      try {
        await storageService.moveFile(`d1/fileA.txt`, `d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The source file does not exist: 'd1/fileA.txt'`)
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

      let actual!: AppError
      try {
        const fromNode = await storageService.sgetFileNode({ path: `d1/fileA.txt` })
        await storageService.moveFile(fromNode.path, `d2/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The destination directory does not exist: 'd2'`)
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
      const validatePath = td.replace(CoreStorageService, 'validateNodePath')

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
      const { list: fromNodes } = await storageService.getDirDescendants(`d1`)

      // 'd1'を'd2'へリネーム
      await storageService.renameDir(`d1`, `d2`)

      // リネーム後の'd2'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`d2`)
      CoreStorageService.sortNodes(toNodes)
      expect(toNodes.length).toBe(3)
      expect(toNodes[0].path).toBe(`d2`)
      expect(toNodes[1].path).toBe(`d2/d11`)
      expect(toNodes[2].path).toBe(`d2/d11/fileA.txt`)
      await h.verifyMoveNodes(fromNodes, `d2`)
    })

    it('リネームしようとする名前のディレクトリが既に存在する場合', async () => {
      await storageService.createHierarchicalDirs([`d1/docs`, `d1/files`])

      let actual: AppError
      try {
        // 'd1/docs'を'd1/files'へリネーム
        const dirNode = await storageService.sgetNode({ path: `d1/docs` })
        await storageService.renameDir(dirNode.path, `files`)
      } catch (err) {
        actual = err
      }

      expect(actual!.cause).toBe(`The specified directory name already exists: 'd1/docs' -> 'd1/files'`)
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
      const fromNodes = (await storageService.getDirDescendants(`d1/d1`)).list

      // 'd1/d1'を'd1/d2'へリネーム
      await storageService.renameDir(`d1/d1`, `d2`)

      // リネーム後の'd2'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`d1/d2`)
      CoreStorageService.sortNodes(toNodes)
      expect(toNodes.length).toBe(2)
      expect(toNodes[0].path).toBe(`d1/d2`)
      expect(toNodes[1].path).toBe(`d1/d2/fileA.txt`)
      await h.verifyMoveNodes(fromNodes, `d1/d2`)
    })

    it('既存のディレクトリ名に文字を付け加える形でリネームをした場合', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1`])

      // リネーム前のノードを取得
      const fromNodes = (await storageService.getDirDescendants(`d1`)).list

      // 'd1'を'd1XXX'へリネーム
      await storageService.renameDir(`d1`, `d1XXX`)

      // リネーム後の'd1'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(`d1XXX`)
      CoreStorageService.sortNodes(toNodes)
      expect(toNodes.length).toBe(1)
      expect(toNodes[0].path).toBe(`d1XXX`)
      await h.verifyMoveNodes(fromNodes, `d1XXX`)
    })

    it('リネームディレクトリパスへのバリデーション実行確認', async () => {
      // ディレクトリを作成
      await storageService.createHierarchicalDirs([`d1`])

      // バリデーションメソッドのモック化
      const validateDirName = td.replace(CoreStorageService, 'validateNodeName')

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
      const { list: fromNodes } = await storageService.getDirDescendants(`dA`)

      // 大量データを想定して分割でリネームを行う
      // 'dA'を'dB'へリネーム
      await storageService.renameDir(`dA`, `dB`, { maxChunk: 3 })

      // 移動後の'dB'＋配下ノードを検証
      const renamedNodes = (await storageService.getDirDescendants(`dB`)).list
      CoreStorageService.sortNodes(renamedNodes)
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
      await h.verifyMoveNodes(fromNodes, `dB`)
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
      const fromNode = await storageService.sgetFileNode({ path: `d1/fileA.txt` })

      // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
      const actual = await storageService.renameFile(`d1/fileA.txt`, `fileB.txt`)

      expect(actual.path).toBe(`d1/fileB.txt`)
      await h.verifyMoveNodes([fromNode], `d1/fileB.txt`)
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

      let actual!: AppError
      try {
        // 'd1/fileA.txt'を'd1/fileB.txt'へリネーム
        await storageService.renameFile('d1/fileA.txt', `fileB.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified file name already exists: 'd1/fileA.txt' -> 'd1/fileB.txt'`)
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
      const fromNode = await storageService.sgetFileNode({ path: `d1/fileA.txt/fileA.txt` })

      // 'd1/fileA.txt/fileA.txt'を'd1/fileA.txt/fileB.txt'へリネーム
      const actual = await storageService.renameFile('d1/fileA.txt/fileA.txt', 'fileB.txt')

      // 'fileA.txt'というディレクトリ名は変わらず、
      // 'fileA.txt'が'fileB.txt'に名前変更されたことを確認
      expect(actual!.path).toBe(`d1/fileA.txt/fileB.txt`)
      await h.verifyMoveNodes([fromNode], 'd1/fileA.txt/fileB.txt')
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
      const validateFileName = td.replace(CoreStorageService, 'validateNodeName')

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

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      // 公開フラグをオンに設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 公開フラグをオフに設定
      const actual = await storageService.setDirShareSettings(`d1`, { isPublic: false })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({
          isPublic: false,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: [], writeUIds: [] })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareSettings(`d1`, { readUIds: null, writeUIds: null })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: AppError
      try {
        await storageService.setDirShareSettings(`dXXX`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified directory does not exist: 'dXXX'`)
    })

    it('inputにnullを指定した場合', async () => {
      // 共有設定をしておく
      await storageService.setDirShareSettings(`d1`, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setDirShareSettings(`d1`, null)

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareSettings>({ isPublic: null, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('作成日時＋更新日時の検証', async () => {
      // 共有設定前のノードを取得
      const fm_d1 = await storageService.sgetNode({ path: `d1` })

      // 共有設定を実行
      const to_d1 = await storageService.setDirShareSettings(`d1`, { isPublic: true })

      // 作成日時の検証
      expect(to_d1.createdAt).toEqual(fm_d1.createdAt)
      // 更新日時の検証
      expect(to_d1.updatedAt).toEqual(fm_d1.updatedAt)
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: AppError
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareSettings(`d1`, { readUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'readUIds' had an incorrect value: 'xxx,yyy'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: AppError
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareSettings(`d1`, { writeUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'writeUIds' had an incorrect value: 'xxx,yyy'`)
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
        expect(metadata.isPublic).toBeTruthy()
        expect(metadata.readUIds).toBeNull()
        expect(metadata.writeUIds).toBeNull()
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
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
        expect(metadata.isPublic).toBeNull()
        expect(metadata.readUIds).toEqual(['ichiro'])
        expect(metadata.writeUIds).toEqual(['ichiro'])
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
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
        expect(metadata.isPublic).toBeFalsy()
        expect(metadata.readUIds).toEqual(['ichiro'])
        expect(metadata.writeUIds).toEqual(['ichiro'])
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
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
        expect(metadata.isPublic).toBeTruthy()
        expect(metadata.readUIds).toBeNull()
        expect(metadata.writeUIds).toBeNull()
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
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
        expect(metadata.isPublic).toBeTruthy()
        expect(metadata.readUIds).toBeNull()
        expect(metadata.writeUIds).toBeNull()
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('存在しないファイルを指定した場合', async () => {
      let actual!: AppError
      try {
        await storageService.setFileShareSettings(`d1/zzz.txt`, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified file does not exist: 'd1/zzz.txt'`)
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
        expect(metadata.isPublic).toBeNull()
        expect(metadata.readUIds).toBeNull()
        expect(metadata.writeUIds).toBeNull()
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('作成日時＋更新日時の検証', async () => {
      // 共有設定前のノードを取得
      const fm_fileA = await storageService.sgetFileNode({ path: `d1/fileA.txt` })

      // 共有設定を実行
      const to_fileA = await storageService.setFileShareSettings(`d1/fileA.txt`, { isPublic: true })

      // 作成日時の検証
      expect(to_fileA.createdAt).toEqual(fm_fileA.createdAt)
      // 更新日時の検証
      expect(to_fileA.updatedAt).toEqual(fm_fileA.updatedAt)
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: AppError
      try {
        await storageService.setFileShareSettings(`d1/fileA.txt`, { readUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'readUIds' had an incorrect value: 'xxx,yyy'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      let actual!: AppError
      try {
        await storageService.setFileShareSettings(`d1/fileA.txt`, { writeUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'writeUIds' had an incorrect value: 'xxx,yyy'`)
    })
  })

  describe('handleUploadedFile', () => {
    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // テストのためデータベースからファイルノードを削除しておく
      const client = newElasticClient()
      await client.delete({
        index: CoreStorageService.IndexAlias,
        id: fileA.id,
        refresh: true,
      })

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedFile(fileA))!

      // 戻り値の検証
      await h.existsNodes([actual])
    })

    it('アップロードによるファイル｢更新｣後の実行', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
          share: {
            isPublic: true,
            readUIds: ['ichiro'],
            writeUIds: ['ichiro'],
          },
        },
      ])

      // アップロードによってファイルが｢更新｣された状態を作成する
      {
        const bucket = admin.storage().bucket()
        const file = bucket.file(fileA.id)
        await file.save('testA-2', { contentType: 'text/plain; charset=utf-8' })
      }

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedFile(fileA))!

      // 戻り値の検証
      const fileData = await actual.file.download()
      expect(fileData.toString()).toBe('testA-2')
      await h.existsNodes([actual])
    })

    it('複数回実行した場合', async () => {
      await storageService.createHierarchicalDirs([`d1/d11`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/d11/fileA.txt`,
        },
      ])

      // テストのためデータベースからファイルノードを削除しておく
      const client = newElasticClient()
      await client.delete({
        index: CoreStorageService.IndexAlias,
        id: fileA.id,
        refresh: true,
      })

      // ファイルアップロードの後処理を実行 - 1
      await storageService.handleUploadedFile(fileA)
      const fileA_1 = await storageService.sgetNode({ path: fileA.path })
      const fileDetailA_1 = await storageService.getStorageFile(fileA.path)

      // ファイルアップロードの後処理を実行 - 2
      await storageService.handleUploadedFile(fileA)
      const fileA_2 = await storageService.sgetNode({ path: fileA.path })
      const fileDetailA_2 = await storageService.getStorageFile(fileA.path)

      // 1回目と2回目で内容が同じことを検証
      expect(fileA_1).toEqual(fileA_2)
      expect(fileDetailA_1.metadata).toEqual(fileDetailA_2.metadata)
    })

    it('ファイルパスへのバリデーション実行確認', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const validatePath = td.replace(CoreStorageService, 'validateNodePath')

      await storageService.handleUploadedFile(fileA)

      const explanation = td.explain(validatePath)
      expect(explanation.calls.length >= 1).toBeTruthy()
      expect(explanation.calls[0].args[0]).toBe(`d1/fileA.txt`)
    })

    it('存在しないファイルを指定した場合', async () => {
      const fileA = {
        id: CoreStorageService.generateNodeId(),
        path: `d1/fileA.txt`,
      }

      let actual!: AppError
      try {
        await storageService.handleUploadedFile(fileA)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`Uploaded file not found.`)
      expect(actual.data).toEqual(fileA)
    })

    it('ファイルの祖先が存在しない場合', async () => {
      const fileA = {
        id: CoreStorageService.generateNodeId(),
        path: `d1/fileA.txt`,
      }

      const bucket = admin.storage().bucket()
      const file = bucket.file(fileA.id)
      await file.save('testA', { contentType: 'text/plain' })

      let actual!: AppError
      try {
        await storageService.handleUploadedFile(fileA)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The ancestor directory of the file does not exist.`)
      expect(actual.data).toEqual({
        fileNodePath: fileA.path,
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
        { id: CoreStorageService.generateNodeId(), path: `fileA.txt`, contentType: 'text/plain' },
        { id: CoreStorageService.generateNodeId(), path: `fileB.txt`, contentType: 'text/plain' },
      ]

      const actual = await storageService.getSignedUploadUrls(requestOrigin, inputs)

      expect(actual.length).toBe(2)
    })
  })

  describe('deleteUserDir', () => {
    it('ベーシックケース', async () => {
      const user1Dir = CoreStorageService.toUserRootPath({ uid: 'user1' })
      const user2Dir = CoreStorageService.toUserRootPath({ uid: 'user2' })
      const user3Dir = CoreStorageService.toUserRootPath({ uid: 'user3' })
      await storageService.createHierarchicalDirs([`${user1Dir}`, `${user2Dir}/d1`, `${user3Dir}`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${user1Dir}/fileA.txt`,
        },
        {
          data: 'testB',
          contentType: 'text/plain; charset=utf-8',
          path: `${user2Dir}/d1/fileB.txt`,
        },
        {
          data: 'testC',
          contentType: 'text/plain; charset=utf-8',
          path: `${user2Dir}/fileC.txt`,
        },
        {
          data: 'testD',
          contentType: 'text/plain; charset=utf-8',
          path: `${user3Dir}/fileD.txt`,
        },
      ])

      // ユーザーノードを全て取得
      const user2Nodes = (await storageService.getDirDescendants(user2Dir)).list
      // ユーザーノード以外を取得
      const otherNodes = [...(await storageService.getDirDescendants(user1Dir)).list, ...(await storageService.getDirDescendants(user3Dir)).list]

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user2')

      // ユーザーノードが全て削除されたことを検証
      await h.notExistsNodes(user2Nodes)
      // ユーザーノード以外がが削除されていないことを検証
      await h.existsNodes(otherNodes)
    })

    it('大量データの場合', async () => {
      const user1Dir = CoreStorageService.toUserRootPath({ uid: 'user1' })
      await storageService.createHierarchicalDirs([`${user1Dir}/d1/d11/d111`, `${user1Dir}/d1/d12`])
      const uploadItems: StorageUploadDataItem[] = []
      for (let i = 1; i <= 5; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `${user1Dir}/d1/d11/d111/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      for (let i = 6; i <= 10; i++) {
        uploadItems.push({
          data: `test${i}`,
          contentType: 'text/plain; charset=utf-8',
          path: `${user1Dir}/d1/d12/file${i.toString().padStart(2, '0')}.txt`,
        })
      }
      await storageService.uploadDataItems(uploadItems)

      // ユーザーノードを全て取得
      const user1Nodes = (await storageService.getDirDescendants(user1Dir)).list

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user1', 3)

      // ユーザーノードが全て削除されたことを検証
      await h.notExistsNodes(user1Nodes)
    })
  })

  describe('m_validateAccessibleTargetToNodePaths', () => {
    it('ベーシックケース', async () => {
      const [dir1, dir2] = await storageService.createHierarchicalDirs(['dir1', 'dir2'])
      const [file1, file2, file3, file4, file5, file6] = await storageService.uploadDataItems([
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file1.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file2.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file3.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file4.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file5.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file6.txt` },
      ])

      const actual = await storageService.m_validateAccessibleTargetToNodePaths({
        nodePath: file1.path,
        nodePaths: [file2.path],
        filePath: file3.path,
        filePaths: [file4.path],
        dirPath: dir1.path,
        dirPaths: [dir2.path],
        node: file5,
        nodes: [file6],
      })
      actual.sort()

      const expected = ['dir1', 'dir2', 'file1.txt', 'file2.txt', 'file3.txt', 'file4.txt', 'file5.txt', 'file6.txt']
      expect(actual).toEqual(expected)
    })

    it('空文字またはundefinedを指定した場合', async () => {
      const actual = await storageService.m_validateAccessibleTargetToNodePaths({
        nodePath: '',
        nodePaths: [''],
        filePath: undefined,
        filePaths: [''],
        dirPath: '',
        dirPaths: [''],
        node: undefined,
        nodes: [],
      })

      expect(actual.length).toBe(0)
    })

    it('何も指定しなかった場合', async () => {
      const actual = await storageService.m_validateAccessibleTargetToNodePaths({})

      expect(actual.length).toBe(0)
    })
  })
})

describe('大量データのテスト', () => {
  let testingModule!: TestingModule
  let storageService!: CoreStorageTestService
  let h!: CoreStorageTestHelper

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [CoreStorageServiceModule],
    }).compile()

    storageService = testingModule.get<CoreStorageTestService>(CoreStorageServiceDI.symbol)
    h = new CoreStorageTestHelper(storageService)
  })

  /**
   * 指定されたディレクトリにテスト用のファイルを作成します。
   * @param dirPath
   * @param startFileNumber
   * @param endFileNumber
   */
  async function createTestData(dirPath: string, startFileNumber: number, endFileNumber: number): Promise<void> {
    const start = performance.now()

    dirPath = removeBothEndsSlash(dirPath)

    // 現在存在するノードを全て削除
    await h.removeAllNodes()

    // ファイルを格納するディレクトリを作成
    await storageService.createHierarchicalDirs([dirPath])

    // ファイルを作成
    const uploadItems: StorageUploadDataItem[] = []
    for (let i = startFileNumber; i <= endFileNumber; i++) {
      uploadItems.push({
        data: `test${i}`,
        contentType: 'text/plain; charset=utf-8',
        path: `${dirPath}/${i.toString().padStart(6, '0')}.txt`,
      })
    }
    await storageService.uploadDataItems(uploadItems)

    const end = performance.now()
    console.log(`createTestData: ${(end - start) / 1000}s`)
  }

  /**
   * 指定されたディレクトリとその配下ノードの数を取得します。
   * @param dirPath
   */
  async function getFileCount(dirPath: string): Promise<number> {
    const client = newElasticClient()
    const response = await client.count({
      index: CoreStorageService.IndexAlias,
      body: {
        query: {
          bool: {
            must: [{ wildcard: { path: `${dirPath}/*` } }, { term: { nodeType: StorageNodeType.File } }],
          },
        },
      },
    })
    return response.body.count as number
  }

  describe('removeDir', () => {
    const FileNum = 10
    const DirPath = `d1/files`

    it('テストデータ作成', async () => createTestData(`d1/files`, 1, FileNum))

    it('テスト実行', async () => {
      const start = performance.now()
      await storageService.removeDir(DirPath)
      const end = performance.now()
      console.log(`removeDir: ${(end - start) / 1000}s`)

      expect(await getFileCount(DirPath)).toBe(0)
    })
  })

  describe('moveDir', () => {
    const FileNum = 10
    const FromDirPath = `d1/files`
    const ToDirPath = `d2/files`

    it('テストデータ作成', async () => createTestData(FromDirPath, 1, FileNum))

    it('テスト実行', async () => {
      // 移動先のディレクトリを作成
      await storageService.createHierarchicalDirs([ToDirPath])

      const start = performance.now()
      await storageService.moveDir(FromDirPath, ToDirPath, { maxChunk: 100 })
      const end = performance.now()
      console.log(`removeDir: ${(end - start) / 1000}s`)

      expect(await getFileCount(FromDirPath)).toBe(0)
      expect(await getFileCount(ToDirPath)).toBe(FileNum)
    })
  })
})

class Super {
  hello(value: string): void {
    console.log(Super.msg)
  }

  static msg = 'super'
}

class Sub extends Super {
  hello<T>(value: T): void {
    console.log(super.hello(''), value)
  }

  static msg = 'sub'
}

it('テストデータ作成', async () => {
  const obj = new Sub()
  const { hello } = obj
  hello(1)
})
