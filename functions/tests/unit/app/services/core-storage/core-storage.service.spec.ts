import * as admin from 'firebase-admin'
import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserToken,
  CoreStorageTestHelper,
  CoreStorageTestService,
  GeneralUser,
  GeneralUserToken,
  StorageUser,
  StorageUserToken,
} from '../../../../helpers/app'
import { AppError, initApp } from '../../../../../src/app/base'
import {
  CoreStorageNode,
  CoreStorageSchema,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  SetShareDetailInput,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeShareDetail,
  StorageService,
  StorageUploadDataItem,
  UserClaims,
  UserHelper,
} from '../../../../../src/app/services'
import { CoreStorageService, CoreStorageServiceDI, CoreStorageServiceModule, StorageFileNode } from '../../../../../src/app/services/core-storage'
import { Test, TestingModule } from '@nestjs/testing'
import { closePointInTime, decodePageToken, newElasticClient } from '../../../../../src/app/base/elastic'
import { pickProps, removeBothEndsSlash } from 'web-base-lib'
import { HttpException } from '@nestjs/common/exceptions/http.exception'
import { config } from '../../../../../src/config'
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

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule],
    }).compile()

    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  })

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule, CoreStorageServiceModule],
    }).compile()

    storageService = testingModule.get<CoreStorageTestService>(CoreStorageServiceDI.symbol)
    h = new CoreStorageTestHelper(storageService)

    await h.removeAllNodes()

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    // await sleep(1500)
  })

  afterEach(() => {
    td.reset()
  })

  describe('getNode', () => {
    async function setupAppNodes() {
      const [d1, d11, d12] = await storageService.createHierarchicalDirs([`d1/d11`, `d1/d12`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])
      return { d1, d11, fileA, d12 }
    }

    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    describe('ID検索', () => {
      it('ベーシックケース - ディレクトリ', async () => {
        const { d11 } = await setupAppNodes()

        const actual = (await storageService.getNode({ id: d11.id }))!

        expect(actual.id).toBe(d11.id)
        await h.existsNodes([actual])
      })

      it('ベーシックケース - ファイル', async () => {
        const { fileA } = await setupAppNodes()

        const actual = (await storageService.getNode({ id: fileA.id }))!

        expect(actual.id).toBe(fileA.id)
        await h.existsNodes([actual])
      })

      it('バケットパスを指定した場合', async () => {
        const actual = await storageService.getNode({ id: '' })

        expect(actual).toBeUndefined()
      })
    })

    describe('パス検索', () => {
      it('ベーシックケース - ディレクトリ', async () => {
        const { d11 } = await setupAppNodes()

        const actual = (await storageService.getNode({ path: d11.path }))!

        expect(actual.path).toBe(d11.path)
        await h.existsNodes([actual])
      })

      it('ベーシックケース - ファイル', async () => {
        const { fileA } = await setupAppNodes()

        const actual = (await storageService.getNode({ path: fileA.path }))!

        expect(actual.path).toBe(fileA.path)
        await h.existsNodes([actual])
      })

      it('バケットパスを指定した場合', async () => {
        const actual = await storageService.getNode({ path: '' })

        expect(actual).toBeUndefined()
      })
    })

    it('IDとパス両方指定しなかった場合', async () => {
      const actual = await storageService.getNode({})

      expect(actual).toBeUndefined()
    })

    it('IDとパスに別ノードを指定した場合', async () => {
      const [, d11, d12] = await storageService.createHierarchicalDirs([`d1/d11`, `d1/d12`])

      const actual = (await storageService.getNode({ id: d11.id, path: d12.path }))!

      // ID指定のノードが取得される
      expect(actual.id).toBe(d11.id)
      await h.existsNodes([actual])
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])

        return { users, storage: { root: storage_root, tmp: storage_tmp }, general: { root: general_root, tmp: general_tmp }, app: { tmp: app_tmp } }
      }

      describe('ID検索', () => {
        it('自ユーザーのディレクトリを検索', async () => {
          const { storage } = await setupUserNodes()

          const actual = await storageService.getNode(StorageUserToken(), { id: storage.tmp.id })

          expect(actual!.path).toBe(storage.tmp.path)
        })

        it('他ユーザーのディレクトリを検索', async () => {
          const { storage } = await setupUserNodes()

          let actual!: HttpException
          try {
            await storageService.getNode(GeneralUserToken(), { id: storage.tmp.id })
          } catch (err) {
            actual = err
          }

          expect(actual.getStatus()).toBe(403)
        })

        it('一般ユーザーでアプリケーションディレクトリを検索', async () => {
          const { app } = await setupUserNodes()

          let actual!: HttpException
          try {
            await storageService.getNode(GeneralUserToken(), { id: app.tmp.id })
          } catch (err) {
            actual = err
          }

          expect(actual.getStatus()).toBe(403)
        })

        it('アプリケーション管理者で他ユーザーのディレクトリを検索', async () => {
          const { storage } = await setupUserNodes()

          const actual = await storageService.getNode(AppAdminUserToken(), { id: storage.tmp.id })

          expect(actual!.path).toBe(storage.tmp.path)
        })
      })

      describe('パス検索', () => {
        it('自ユーザーのディレクトリを検索', async () => {
          const { storage } = await setupUserNodes()

          const actual = await storageService.getNode(StorageUserToken(), { path: storage.tmp.path })

          expect(actual!.path).toBe(storage.tmp.path)
        })

        it('他ユーザーのディレクトリを検索', async () => {
          const { storage } = await setupUserNodes()

          let actual!: HttpException
          try {
            await storageService.getNode(GeneralUserToken(), { path: storage.tmp.path })
          } catch (err) {
            actual = err
          }

          expect(actual.getStatus()).toBe(403)
        })

        it('一般ユーザーでアプリケーションディレクトリを検索', async () => {
          const { app } = await setupUserNodes()

          let actual!: HttpException
          try {
            await storageService.getNode(GeneralUserToken(), { path: app.tmp.path })
          } catch (err) {
            actual = err
          }

          expect(actual.getStatus()).toBe(403)
        })

        it('アプリケーション管理者で他ユーザーのディレクトリを検索', async () => {
          const { storage } = await setupUserNodes()

          const actual = await storageService.getNode(AppAdminUserToken(), { path: storage.tmp.path })

          expect(actual!.path).toBe(storage.tmp.path)
        })
      })
    })
  })

  describe('sgetNode', () => {
    async function setupAppNodes() {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])
      return { d1, d11 }
    }

    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ベーシックケース', async () => {
      const { d11 } = await setupAppNodes()

      const actual = await storageService.sgetNode({ id: d11.id })

      expect(actual.path).toEqual(d11.path)
    })

    it('引数ノードが存在しない場合', async () => {
      let actual!: AppError
      try {
        await storageService.sgetNode({ id: '12345678901234567890' })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`There is no node in the specified key.`)
      expect(actual.data).toEqual({ id: '12345678901234567890' })
    })

    it('IDとパス両方指定しなかった場合', async () => {
      let actual!: AppError
      try {
        await storageService.sgetNode({})
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`Either 'id' or 'path' must be specified.`)
    })
  })

  describe('getNodes', () => {
    async function setupAppNodes() {
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

      return { d1, fileA, fileB, fileC, d2, d3 }
    }

    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ベーシックケース', async () => {
      const { d1, fileA, fileC, d3 } = await setupAppNodes()

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
      const { d1, fileA } = await setupAppNodes()

      const actual = await storageService.getNodes({
        ids: [d1.id, ''],
        paths: [fileA.path, ''],
      })

      expect(actual.length).toBe(2)
      expect(actual[0].path).toBe(`d1`)
      expect(actual[1].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])

        return { users, storage: { root: storage_root, tmp: storage_tmp }, general: { root: general_root, tmp: general_tmp }, app: { tmp: app_tmp } }
      }

      it('自ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getNodes(StorageUserToken(), { paths: [storage.tmp.path] })

        expect(actual[0].path).toBe(storage.tmp.path)
      })

      it('他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        let actual!: HttpException
        try {
          await storageService.getNodes(GeneralUserToken(), { paths: [storage.tmp.path] })
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('一般ユーザーでアプリケーションディレクトリを検索', async () => {
        const { app } = await setupUserNodes()

        let actual!: HttpException
        try {
          await storageService.getNodes(GeneralUserToken(), { paths: [app.tmp.path] })
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getNodes(AppAdminUserToken(), { paths: [storage.tmp.path] })

        expect(actual[0].path).toBe(storage.tmp.path)
      })
    })
  })

  describe('getFileNode', () => {
    async function setupAppNodes() {
      const [d1] = await storageService.createHierarchicalDirs([`d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])
      return { d1, fileA }
    }

    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${d1.path}/fileA.txt`,
        },
      ])
      return { users, userRoot, d1, fileA }
    }

    it('ベーシックケース', async () => {
      const { fileA } = await setupAppNodes()

      const actual = (await storageService.getFileNode(fileA))!

      expect(actual.path).toBe(actual.path)
      expect(actual.file.name).toBe(actual.id)
      await h.existsNodes([actual])
    })

    it('引数ノードが存在しない場合', async () => {
      const actual = await storageService.getFileNode({ id: '12345678901234567890' })

      expect(actual).toBeUndefined()
    })
  })

  describe('getDescendants', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ベーシックケース - ID検索', async () => {
      const [d1, d11, d111, d12] = await storageService.createHierarchicalDirs([`d1/d11/d111`, `d1/d12`])
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

      const actual = await storageService.getDescendants({ id: d11.id, includeBase: true })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/d11/d111`)
      expect(actual.list[2].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[3].path).toBe(`d1/d11/fileA.txt`)
      await h.existsNodes(actual.list)
    })

    it('ベーシックケース - パス検索', async () => {
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

      const actual = await storageService.getDescendants({ path: `d1/d11`, includeBase: true })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`d1/d11`)
      expect(actual.list[1].path).toBe(`d1/d11/d111`)
      expect(actual.list[2].path).toBe(`d1/d11/d111/fileB.txt`)
      expect(actual.list[3].path).toBe(`d1/d11/fileA.txt`)
      await h.existsNodes(actual.list)
    })

    it('ベースノードを含める場合', async () => {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getDescendants({ id: d1.id, includeBase: true })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      await h.existsNodes(actual.list)
    })

    it('ベースノードを含めない場合', async () => {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getDescendants({ id: d1.id, includeBase: false })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1/d11`)
      await h.existsNodes(actual.list)
    })

    it('バケット配下の検索', async () => {
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
      const actual = await storageService.getDescendants({ path: `` })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
      expect(actual.list[2].path).toBe(`fileB.txt`)
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
      const actual = await storageService.getDescendants({ path: `d1`, includeBase: true })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
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
      const actual = await storageService.getDescendants({ path: 'd1/fileA.txt', includeBase: true })

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
      const pagination = await storageService.getDescendants({ path: `d1`, includeBase: true }, { maxChunk: 3 })
      const pageToken = decodePageToken(pagination.nextPageToken)
      await closePointInTime(storageService.client, pageToken.pit.id)

      // ページングがタイムアウトした状態で検索実行
      const actual = await storageService.getDescendants(
        { path: `d1`, includeBase: true },
        {
          maxChunk: 3,
          pageToken: pagination.nextPageToken,
        }
      )

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
      expect(actual.isPaginationTimeout).toBeTruthy()
    })

    it('IDとパス両方指定しなかった場合', async () => {
      let actual!: AppError
      try {
        await storageService.getDescendants({})
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`Either 'id' or 'path' must be specified.`)
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
      let pagination = await storageService.getDescendants({ path: `d1`, includeBase: true }, { maxChunk: 3 })
      actual.push(...pagination.list)
      while (pagination.nextPageToken) {
        pagination = await storageService.getDescendants({ path: `d1`, includeBase: true }, { maxChunk: 3, pageToken: pagination.nextPageToken })
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

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${general_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getDescendants(StorageUserToken(), { path: storage.tmp.path })

        expect(actual.list[0].path).toBe(storage.fileA.path)
      })

      it('自ユーザーのルートディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getDescendants(StorageUserToken(), { path: storage.root.path, includeBase: true })

        expect(actual.list[0].path).toBe(storage.root.path)
      })

      it('他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getDescendants(GeneralUserToken(), { path: storage.tmp.path })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリを検索', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getDescendants(GeneralUserToken(), { path: app.tmp.path })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getDescendants(AppAdminUserToken(), { path: storage.tmp.path })

        expect(actual.list[0].path).toBe(storage.fileA.path)
      })
    })
  })

  describe('getDescendantsCount', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ベーシックケース - ID検索', async () => {
      const [d1, d11, d111, d12] = await storageService.createHierarchicalDirs([`d1/d11/d111`, `d1/d12`])
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

      const actual = await storageService.getDescendantsCount({ id: d11.id, includeBase: true })

      expect(actual).toBe(4)
    })

    it('ベーシックケース - パス検索', async () => {
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

      const actual = await storageService.getDescendantsCount({ path: `d1/d11`, includeBase: true })

      expect(actual).toBe(4)
    })

    it('ベースノードを含める場合', async () => {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getDescendantsCount({ id: d1.id, includeBase: true })

      expect(actual).toBe(2)
    })

    it('ベースノードを含めない場合', async () => {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getDescendantsCount({ id: d1.id, includeBase: false })

      expect(actual).toBe(1)
    })

    it('バケット配下の検索', async () => {
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
      const actual = await storageService.getDescendantsCount({ path: `` })

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
      const actual = await storageService.getDescendantsCount({ path: `d1`, includeBase: true })

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
      const actual = await storageService.getDescendantsCount({ path: 'd1/fileA.txt', includeBase: true })

      expect(actual).toBe(0)
    })

    it('IDとパス両方指定しなかった場合', async () => {
      let actual!: AppError
      try {
        await storageService.getDescendantsCount({})
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`Either 'id' or 'path' must be specified.`)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${general_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getDescendantsCount(StorageUserToken(), { path: storage.tmp.path })

        expect(actual).toBe(1)
      })

      it('自ユーザーのルートディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getDescendantsCount(StorageUserToken(), { path: storage.root.path, includeBase: true })

        expect(actual).toBe(3)
      })

      it('他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getDescendantsCount(GeneralUserToken(), { path: storage.tmp.path })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリを検索', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getDescendantsCount(GeneralUserToken(), { path: app.tmp.path })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getDescendantsCount(AppAdminUserToken(), { path: storage.tmp.path })

        expect(actual).toBe(1)
      })
    })
  })

  describe('getChildren', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ベーシックケース - ID検索', async () => {
      const [d1, d11, d2] = await storageService.createHierarchicalDirs([`d1/d11`, `d2`])
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

      const actual = await storageService.getChildren({ id: d1.id, includeBase: true })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual.list)
    })

    it('ベーシックケース - パス検索', async () => {
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

      const actual = await storageService.getChildren({ path: `d1`, includeBase: true })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(3)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      expect(actual.list[2].path).toBe(`d1/fileA.txt`)
      await h.existsNodes(actual.list)
    })

    it('ベースノードを含める場合', async () => {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getChildren({ id: d1.id, includeBase: true })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/d11`)
      await h.existsNodes(actual.list)
    })

    it('ベースノードを含めない場合', async () => {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getChildren({ id: d1.id, includeBase: false })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(1)
      expect(actual.list[0].path).toBe(`d1/d11`)
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
      const actual = await storageService.getChildren({ path: `` })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`fileB.txt`)
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
      const actual = await storageService.getChildren({ path: `d1`, includeBase: true })

      CoreStorageService.sortNodes(actual.list)
      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`d1`)
      expect(actual.list[1].path).toBe(`d1/fileA.txt`)
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
      const actual = await storageService.getChildren({ path: 'd1/fileA.txt', includeBase: true })

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
      const pagination = await storageService.getChildren({ path: `d1`, includeBase: true }, { maxChunk: 3 })
      const pageToken = decodePageToken(pagination.nextPageToken)
      await closePointInTime(storageService.client, pageToken.pit.id)

      // ページングがタイムアウトした状態で検索実行
      const actual = await storageService.getChildren(
        { path: `d1`, includeBase: true },
        {
          maxChunk: 3,
          pageToken: pagination.nextPageToken,
        }
      )

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
      expect(actual.isPaginationTimeout).toBeTruthy()
    })

    it('IDとパス両方指定しなかった場合', async () => {
      let actual!: AppError
      try {
        await storageService.getChildren({})
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`Either 'id' or 'path' must be specified.`)
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
      let pagination = await storageService.getChildren({ path: `d1`, includeBase: true }, { maxChunk: 3 })
      actual.push(...pagination.list)
      while (pagination.nextPageToken) {
        pagination = await storageService.getChildren({ path: `d1`, includeBase: true }, { maxChunk: 3, pageToken: pagination.nextPageToken })
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

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${general_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getChildren(StorageUserToken(), { path: storage.tmp.path })

        expect(actual.list[0].path).toBe(storage.fileA.path)
      })

      it('自ユーザーのルートディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getChildren(StorageUserToken(), { path: storage.root.path, includeBase: true })

        expect(actual.list[0].path).toBe(storage.root.path)
      })

      it('他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getChildren(GeneralUserToken(), { path: storage.tmp.path })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリを検索', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getChildren(GeneralUserToken(), { path: app.tmp.path })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getChildren(AppAdminUserToken(), { path: storage.tmp.path })

        expect(actual.list[0].path).toBe(storage.fileA.path)
      })
    })
  })

  describe('getChildrenCount', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ベーシックケース - ID検索', async () => {
      const [d1, d11, d2] = await storageService.createHierarchicalDirs([`d1/d11`, `d2`])
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

      const actual = await storageService.getChildrenCount({ id: d1.id, includeBase: true })

      expect(actual).toBe(3)
    })

    it('ベーシックケース - パス検索', async () => {
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

      const actual = await storageService.getChildrenCount({ path: `d1`, includeBase: true })

      expect(actual).toBe(3)
    })

    it('ベースノードを含める場合', async () => {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getChildrenCount({ id: d1.id, includeBase: true })

      expect(actual).toBe(2)
    })

    it('ベースノードを含めない場合', async () => {
      const [d1, d11] = await storageService.createHierarchicalDirs([`d1/d11`])

      const actual = await storageService.getChildrenCount({ id: d1.id, includeBase: false })

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
      const actual = await storageService.getChildrenCount({ path: `` })

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
      const actual = await storageService.getChildrenCount({ path: `d1`, includeBase: true })

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
      const actual = await storageService.getChildrenCount({ path: 'd1/fileA.txt', includeBase: true })

      expect(actual).toBe(0)
    })

    it('IDとパス両方指定しなかった場合', async () => {
      let actual!: AppError
      try {
        await storageService.getChildrenCount({})
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`Either 'id' or 'path' must be specified.`)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${general_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getChildrenCount(StorageUserToken(), { path: storage.tmp.path })

        expect(actual).toBe(1)
      })

      it('自ユーザーのルートディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getChildrenCount(StorageUserToken(), { path: storage.root.path, includeBase: true })

        expect(actual).toBe(2)
      })

      it('他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getChildrenCount(GeneralUserToken(), { path: storage.tmp.path })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリを検索', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getChildrenCount(GeneralUserToken(), { path: app.tmp.path })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.getChildrenCount(AppAdminUserToken(), { path: storage.tmp.path })

        expect(actual).toBe(1)
      })
    })
  })

  describe('getHierarchicalNodes', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

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

    it('バケットパスを指定した場合', async () => {
      // 空文字を指定
      const actual = await storageService.getHierarchicalNodes(``)

      expect(actual.length).toBe(0)
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
        index: CoreStorageSchema.IndexAlias,
        id: d11.id,
        refresh: true,
      })

      let actual!: AppError
      try {
        await storageService.getHierarchicalNodes(`d1/d11/d111/fileA.txt`)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The ancestor of the node you are trying to retrieve does not exist.`)
      expect(actual.data).toEqual({
        nodePath: `d1/d11/d111/fileA.txt`,
        ancestorPaths: ['d1', 'd1/d11/d111'],
      })
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${general_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーのディレクトリを検索', async () => {
        const { users, storage } = await setupUserNodes()

        const actual = await storageService.getHierarchicalNodes(StorageUserToken(), storage.tmp.path)

        expect(actual.length).toBe(3)
        expect(actual[0].path).toBe(users.path)
        expect(actual[1].path).toBe(storage.root.path)
        expect(actual[2].path).toBe(storage.tmp.path)
      })

      it('自ユーザーのルートディレクトリを検索', async () => {
        const { users, storage } = await setupUserNodes()

        const actual = await storageService.getHierarchicalNodes(StorageUserToken(), storage.root.path)

        expect(actual.length).toBe(2)
        expect(actual[0].path).toBe(users.path)
        expect(actual[1].path).toBe(storage.root.path)
      })

      it('他ユーザーのディレクトリを検索', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getHierarchicalNodes(GeneralUserToken(), storage.tmp.path)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリを検索', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.getHierarchicalNodes(GeneralUserToken(), app.tmp.path)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを検索', async () => {
        const { users, storage } = await setupUserNodes()

        const actual = await storageService.getHierarchicalNodes(AppAdminUserToken(), storage.tmp.path)

        expect(actual.length).toBe(3)
        expect(actual[0].path).toBe(users.path)
        expect(actual[1].path).toBe(storage.root.path)
        expect(actual[2].path).toBe(storage.tmp.path)
      })
    })
  })

  describe('getAncestorDirs', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

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

    it('バケットパスを指定した場合', async () => {
      // 空文字を指定
      const actual = await storageService.getAncestorDirs(``)

      expect(actual.length).toBe(0)
    })
  })

  describe('createDir', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ベーシックケース', async () => {
      const actual = await storageService.createDir({ dir: `d1` })

      expect(actual.path).toBe(`d1`)
      expect(actual.contentType).toBe('')
      expect(actual.size).toBe(0)
      expect(actual.share).toEqual<StorageNodeShareDetail>({
        isPublic: null,
        readUIds: null,
        writeUIds: null,
      })

      await h.existsNodes([actual])
    })

    it('共有設定を指定した場合', async () => {
      const actual = await storageService.createDir({
        dir: `d1`,
        share: {
          isPublic: true,
          readUIds: ['ichiro'],
          writeUIds: ['jiro'],
        },
      })

      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual<StorageNodeShareDetail>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      })

      await h.existsNodes([actual])
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定なし', async () => {
      const before = await storageService.createDir({ dir: `d1` })

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createDir({ dir: `d1` })

      expect(actual).toEqual(before)
      await h.existsNodes([actual])
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定あり', async () => {
      const before = await storageService.createDir({ dir: `d1` })

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createDir({
        dir: `d1`,
        share: {
          isPublic: true,
          readUIds: ['ichiro'],
          writeUIds: ['jiro'],
        },
      })

      expect(actual.path).toBe(`d1`)
      expect(actual.share).toEqual<StorageNodeShareDetail>({
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
        const actual = await storageService.createDir({ dir: `d1/d11` })
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

      await storageService.createDir({ dir: `d1` })

      const exp = td.explain(validatePath)
      expect(exp.calls[0].args[0]).toBe(`d1`)
    })

    it('共有設定入力へのバリデーション実行確認', async () => {
      const validateShareDetailInput = td.replace(CoreStorageService, 'validateShareDetailInput')

      const share: SetShareDetailInput = { isPublic: null }
      await storageService.createDir({ dir: `d1`, share })

      const exp = td.explain(validateShareDetailInput)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args[0]).toBe(share)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root] = await storageService.createHierarchicalDirs([`${storageUserRootPath}`])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root] = await storageService.createHierarchicalDirs([`${generalUserRootPath}`])

        return { users, storage: { root: storage_root }, general: { root: general_root } }
      }

      it('自ユーザーのディレクトリを作成', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.createDir(StorageUserToken(), { dir: `${storage.root.path}/tmp` })

        expect(actual.path).toBe(`${storage.root.path}/tmp`)
      })

      it('自ユーザーのルートディレクトリを作成', async () => {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })
        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())

        const actual = await storageService.createDir(StorageUserToken(), { dir: `${storageUserRootPath}` })

        expect(actual.path).toBe(`${storageUserRootPath}`)
      })

      it('他ユーザーのディレクトリを作成', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.createDir(GeneralUserToken(), { dir: `${storage.root}/tmp` })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリを作成', async () => {
        let actual!: AppError
        try {
          await storageService.createDir(GeneralUserToken(), { dir: `tmp` })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを作成', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.createDir(AppAdminUserToken(), { dir: `${storage.root.path}/tmp` })

        expect(actual.path).toBe(`${storage.root.path}/tmp`)
      })
    })
  })

  describe('createHierarchicalDirs', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

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
        expect(node.share).toEqual<StorageNodeShareDetail>({
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

      const exp = td.explain(validatePath)
      expect(exp.calls[0].args[0]).toBe(`d1`)
      expect(exp.calls[1].args[0]).toBe(`d2`)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root] = await storageService.createHierarchicalDirs([`${storageUserRootPath}`])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root] = await storageService.createHierarchicalDirs([`${generalUserRootPath}`])

        return { users, storage: { root: storage_root }, general: { root: general_root } }
      }

      it('自ユーザーのディレクトリを作成', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.createHierarchicalDirs(StorageUserToken(), [`${storage.root.path}/tmp`])

        expect(actual[0].path).toBe(`${storage.root.path}/tmp`)
      })

      it('自ユーザーのルートディレクトリを作成', async () => {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })
        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())

        const actual = await storageService.createHierarchicalDirs(StorageUserToken(), [`${storageUserRootPath}`])

        expect(actual[0].path).toBe(`${storageUserRootPath}`)
      })

      it('他ユーザーのディレクトリを作成', async () => {
        const { storage, general } = await setupUserNodes()

        let actual!: AppError
        try {
          // 自身と他者のユーザーディレクトリの作成を試みる
          await storageService.createHierarchicalDirs(GeneralUserToken(), [`${storage.root.path}/tmp`, `${general.root.path}/tmp`])
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
        // 自身のディレクトリも作成されなかったことを検証
        expect(await storageService.getNode({ path: `${storage.root.path}/tmp1` })).toBeUndefined()
      })

      it('一般ユーザーでアプリケーションディレクトリを作成', async () => {
        const { storage, general } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.createHierarchicalDirs(GeneralUserToken(), [`tmp`])
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを作成', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.createHierarchicalDirs(AppAdminUserToken(), [`${storage.root.path}/tmp`])

        expect(actual[0].path).toBe(`${storage.root.path}/tmp`)
      })
    })
  })

  describe('removeDir', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

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
      const { list: beforeNodes } = await storageService.getDescendants({ path: `d1`, includeBase: true })

      await storageService.removeDir({ path: `d1` })

      const removedNodes = await storageService.getDescendants({ path: `d1`, includeBase: true })
      expect(removedNodes.list.length).toBe(0)
      await h.notExistsNodes(beforeNodes)
    })

    it('ID指定', async () => {
      const [d1] = await storageService.createHierarchicalDirs([`d1`])

      await storageService.removeDir({ id: d1.id })

      const d1_ = await storageService.getNode(d1)
      expect(d1_).toBeUndefined()
    })

    it('パス指定', async () => {
      const [d1] = await storageService.createHierarchicalDirs([`d1`])

      await storageService.removeDir({ path: d1.path })

      const d1_ = await storageService.getNode(d1)
      expect(d1_).toBeUndefined()
    })

    it('存在しないディレクトリを指定した場合', async () => {
      // 何も行われない(エラーも発生しない)
      await storageService.removeDir({ path: `d1` })
    })

    it('パスに空文字を指定した場合', async () => {
      // 何も行われない(エラーも発生しない)
      await storageService.removeDir({ path: `` })
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
      const { list: beforeNodes } = await storageService.getDescendants({ path: `d1`, includeBase: true })
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
      await storageService.removeDir({ path: `d1` }, { maxChunk: 3 })

      // 削除後の対象ノードを検証
      const removedNodes = await storageService.getDescendants({ path: `d1`, includeBase: true })
      expect(removedNodes.list.length).toBe(0)
      await h.notExistsNodes(beforeNodes)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])

        return { users, storage: { root: storage_root, tmp: storage_tmp }, general: { root: general_root, tmp: general_tmp }, app: { tmp: app_tmp } }
      }

      it('自ユーザーのディレクトリを削除', async () => {
        const { storage } = await setupUserNodes()

        await storageService.removeDir(StorageUserToken(), storage.tmp)

        await h.notExistsNodes([storage.tmp])
      })

      it('自ユーザーのルートディレクトリを削除', async () => {
        const { storage } = await setupUserNodes()

        await storageService.removeDir(StorageUserToken(), storage.root)

        await h.notExistsNodes([storage.root])
      })

      it('他ユーザーのディレクトリを削除', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.removeDir(GeneralUserToken(), storage.tmp)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリを削除', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.removeDir(GeneralUserToken(), app.tmp)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを削除', async () => {
        const { storage } = await setupUserNodes()

        await storageService.removeDir(AppAdminUserToken(), storage.tmp)

        await h.notExistsNodes([storage.tmp])
      })
    })
  })

  describe('removeFile', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${d1.path}/fileA.txt`,
        },
      ])
      return { users, userRoot, d1, fileA }
    }

    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      const actual = (await storageService.removeFile({ path: `d1/fileA.txt` }))!

      expect(actual.path).toBe(`d1/fileA.txt`)
      await h.notExistsNodes([actual])
    })

    it('ID指定', async () => {
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `fileA.txt`,
        },
      ])

      await storageService.removeFile({ id: fileA.id })

      const fileA_ = await storageService.getNode(fileA)
      expect(fileA_).toBeUndefined()
    })

    it('パス指定', async () => {
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `fileA.txt`,
        },
      ])

      await storageService.removeFile({ path: fileA.path })

      const fileA_ = await storageService.getNode(fileA)
      expect(fileA_).toBeUndefined()
    })

    it('存在しないファイルを指定', async () => {
      const actual = await storageService.removeFile({ path: `d1/fileXXX.txt` })

      expect(actual).toBeUndefined()
    })

    it('filePathに空文字を指定した場合', async () => {
      const actual = await storageService.removeFile({ path: `` })

      expect(actual).toBeUndefined()
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${general_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーのファイルを削除', async () => {
        const { storage } = await setupUserNodes()

        await storageService.removeFile(StorageUserToken(), storage.fileA)

        await h.notExistsNodes([storage.fileA])
      })

      it('他ユーザーのファイルを削除', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.removeDir(GeneralUserToken(), storage.fileA)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションファイルを削除', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.removeDir(GeneralUserToken(), app.fileA)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのファイルを削除', async () => {
        const { storage } = await setupUserNodes()

        await storageService.removeDir(AppAdminUserToken(), storage.fileA)

        await h.notExistsNodes([storage.fileA])
      })
    })
  })

  describe('moveDir', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1, tmp] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`, `${userRootPath}/tmp`])
      return { users, userRoot, d1, tmp }
    }

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
      const { list: fromNodes } = await storageService.getDescendants({ path: `d1`, includeBase: true })
      expect(fromNodes.length).toBe(3)

      // 'd1'を'd2/d1'へ移動
      await storageService.moveDir({ fromDir: `d1`, toDir: `d2/d1` })

      // 移動後の'd2/d1'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `d2/d1`, includeBase: true })
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
      const { list: fromNodes } = await storageService.getDescendants({ path: `d1/docs`, includeBase: true })
      expect(fromNodes.length).toBe(2)

      // 'd1/d11'をバケット直下へ移動
      const actual = await storageService.moveDir({ fromDir: `d1/docs`, toDir: `docs` })

      // 移動後の'docs'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `docs`, includeBase: true })
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
      const { list: fromNodes } = await storageService.getDescendants({ path: `d1/docs`, includeBase: true })
      expect(fromNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir({ fromDir: `d1/docs`, toDir: `d2/docs` })

      // 移動後の'd2/docs'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `d2/docs`, includeBase: true })
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
      const { list: fromNodes } = await storageService.getDescendants({ path: `d1/docs`, includeBase: true })
      expect(fromNodes.length).toBe(2)
      const { list: existsToNodes } = await storageService.getDescendants({ path: `d2/docs`, includeBase: true })
      expect(existsToNodes.length).toBe(2)

      // 'd1/docs'を'd2/docs'へ移動
      const actual = await storageService.moveDir({ fromDir: `d1/docs`, toDir: `d2/docs` })

      // 移動後の'd2/docs'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `d2/docs`, includeBase: true })
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
        await storageService.moveDir({ fromDir: fromNode.path, toDir: fromNode.path + '/' }) // 移動先に'/'を付けて試す
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The source and destination are the same: 'd1' -> 'd1'`)
    })

    it('移動元ディレクトリが存在しない場合', async () => {
      let actual!: AppError
      try {
        await storageService.moveDir({ fromDir: `d1`, toDir: `d2/d1` })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The node to be moved does not exist.`)
      expect(actual.data).toEqual({ path: 'd1' })
    })

    it('移動元がディレクトリでない場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      let actual!: AppError
      try {
        await storageService.moveDir({ fromDir: `d1/fileA.txt`, toDir: `d2/d1` })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The node to be moved is not directory.`)
      expect(actual.data).toEqual({ from: { ...pickProps(fileA, ['id', 'path', 'nodeType']) } })
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
        await storageService.moveDir({ fromDir: `d1`, toDir: `d2/d1` })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The destination directory does not exist: 'd2'`)
    })

    it('移動先がディレクトリでない場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [d2] = await storageService.uploadDataItems([
        {
          data: 'd2',
          contentType: 'text/plain; charset=utf-8',
          path: `d2`,
        },
      ])

      let actual!: AppError
      try {
        await storageService.moveDir({ fromDir: `d1`, toDir: `d2/d1` })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The destination node is not directory.`)
      expect(actual.data).toEqual({ to: { ...pickProps(d2, ['id', 'path', 'nodeType']) } })
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
        await storageService.moveDir({ fromDir: `d1`, toDir: `d1/d11/d1` })
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
      await storageService.setDirShareDetail(
        { path: `dX/dA` },
        {
          isPublic: true,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        }
      )
      await storageService.setDirShareDetail(
        { path: `dX/dA/dB` },
        {
          isPublic: true,
          readUIds: ['jiro'],
          writeUIds: ['jiro'],
        }
      )
      await storageService.setFileShareDetail(
        { path: `dX/dA/dB/fileA.txt` },
        {
          isPublic: true,
          readUIds: ['saburo'],
          writeUIds: ['saburo'],
        }
      )

      // 移動前のノードを取得
      const { list: fromNodes } = await storageService.getDescendants({ path: `dX/dA`, includeBase: true })

      // 'dX/dA'を'dY/dA'へ移動
      await storageService.moveDir({ fromDir: `dX/dA`, toDir: `dY/dA` })

      // 移動後の'dY/dA'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `dY/dA`, includeBase: true })
      expect(toNodes.length).toBe(3)
      expect(toNodes[0].path).toBe(`dY/dA`)
      expect(toNodes[1].path).toBe(`dY/dA/dB`)
      expect(toNodes[2].path).toBe(`dY/dA/dB/fileA.txt`)
      await h.verifyMoveNodes(fromNodes, `dY/dA`)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(toNodes[0].share).toEqual<StorageNodeShareDetail>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['ichiro'],
      })
      expect(toNodes[1].share).toEqual<StorageNodeShareDetail>({
        isPublic: true,
        readUIds: ['jiro'],
        writeUIds: ['jiro'],
      })
      expect(toNodes[2].share).toEqual<StorageNodeShareDetail>({
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
      await storageService.setDirShareDetail(
        { path: `dX/dA` },
        {
          isPublic: true,
          readUIds: ['ichiro-X'],
          writeUIds: ['ichiro-X'],
        }
      )
      await storageService.setFileShareDetail(
        { path: `dX/dA/fileA.txt` },
        {
          isPublic: true,
          readUIds: ['jiro-X'],
          writeUIds: ['jiro-X'],
        }
      )
      // 'dY'配下ノードの設定
      await storageService.setDirShareDetail(
        { path: `dY/dA` },
        {
          isPublic: false,
          readUIds: ['ichiro-Y'],
        }
      )
      await storageService.setFileShareDetail(
        { path: `dY/dA/fileA.txt` },
        {
          isPublic: false,
          readUIds: ['jiro-Y'],
          writeUIds: ['jiro-Y'],
        }
      )

      // 移動前のノードを取得
      const { list: fromNodes } = await storageService.getDescendants({ path: `dX/dA`, includeBase: true })

      // 'dX/dA'を'dY/dA'へ移動
      const actual = await storageService.moveDir({ fromDir: `dX/dA`, toDir: `dY/dA` })

      // 移動後の'dY/dA'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `dY/dA`, includeBase: true })
      expect(toNodes.length).toBe(2)
      expect(toNodes[0].path).toBe(`dY/dA`)
      expect(toNodes[1].path).toBe(`dY/dA/fileA.txt`)
      await h.verifyMoveNodes(fromNodes, `dY/dA`)

      // 移動後のノードに共有設定が引き継がれていることを検証
      expect(toNodes[0].share).toEqual<StorageNodeShareDetail>({
        isPublic: true,
        readUIds: ['ichiro-X'],
        writeUIds: ['ichiro-X'],
      })
      expect(toNodes[1].share).toEqual<StorageNodeShareDetail>({
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

      await storageService.moveDir({ fromDir: `d1`, toDir: `d2` })

      const exp = td.explain(validatePath)
      expect(exp.calls[0].args[0]).toBe(`d1`)
      expect(exp.calls[1].args[0]).toBe(`d2`)
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
      const { list: fromNodes } = await storageService.getDescendants({ path: `d1`, includeBase: true })

      // 大量データを想定して分割で移動を行う
      // 'd1'を'dA/d1'へ移動
      await storageService.moveDir({ fromDir: `d1`, toDir: `dA/d1` }, { maxChunk: 3 })

      // 移動後の'dA'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `dA/d1`, includeBase: true })
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

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp, storage_work] = await storageService.createHierarchicalDirs([
          `${storageUserRootPath}/tmp`,
          `${storageUserRootPath}/work`,
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp, general_work] = await storageService.createHierarchicalDirs([
          `${generalUserRootPath}/tmp`,
          `${generalUserRootPath}/work`,
        ])

        const [app_tmp, app_work] = await storageService.createHierarchicalDirs([`tmp`, `work`])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, work: storage_work },
          general: { root: general_root, tmp: general_tmp, work: general_work },
          app: { tmp: app_tmp, work: app_work },
        }
      }

      describe('自ユーザー', () => {
        it('自ユーザーの範囲内でディレクトリを移動', async () => {
          const { storage } = await setupUserNodes()

          const moved_work_path = `${storage.tmp.path}/${storage.work.name}`
          await storageService.moveDir(StorageUserToken(), { fromDir: storage.work.path, toDir: moved_work_path })

          const moved_work = await storageService.sgetNode({ id: storage.work.id })
          expect(moved_work.path).toBe(moved_work_path)
        })

        it('自ユーザーのディレクトリを他ユーザーのディレクトリへ移動', async () => {
          const { storage, general } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_work_path = `${general.tmp.path}/${storage.work.name}`
            await storageService.moveDir(StorageUserToken(), { fromDir: storage.work.path, toDir: moved_work_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })

        it('自ユーザーのルートディレクトリを移動', async () => {
          const { storage, general } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_work_path = `${general.root.path}/${storage.root.name}`
            await storageService.moveDir(StorageUserToken(), { fromDir: storage.root.path, toDir: moved_work_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`You do not have permission to move the user root directory.`)
          expect(actual.data).toEqual({ uid: StorageUserToken().uid })
        })
      })

      describe('他ユーザー', () => {
        it('他ユーザーの範囲内でディレクトリを移動', async () => {
          const { storage } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_work_path = `${storage.tmp.path}/${storage.work.name}`
            await storageService.moveDir(GeneralUserToken(), { fromDir: storage.work.path, toDir: moved_work_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })

        it('他ユーザーのディレクトリを自ユーザーのディレクトリへ移動', async () => {
          const { storage, general } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_work_path = `${general.root.path}/${storage.work.name}`
            await storageService.moveDir(GeneralUserToken(), { fromDir: storage.work.path, toDir: moved_work_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })
      })

      describe('一般ユーザー', () => {
        it('一般ユーザーでアプリケーションディレクトリの範囲内でディレクトリを移動', async () => {
          const { app } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_work_path = `${app.tmp.path}/${app.work.name}`
            await storageService.moveDir(GeneralUserToken(), { fromDir: app.work.path, toDir: moved_work_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })

        it('一般ユーザーでアプリケーションディレクトリを自ユーザーのディレクトリへ移動', async () => {
          const { app, general } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_work_path = `${general.root.path}/${app.work.name}`
            await storageService.moveDir(GeneralUserToken(), { fromDir: app.work.path, toDir: moved_work_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })
      })

      describe('アプリケーション管理者', () => {
        it('Aユーザーの範囲内でディレクトリを移動', async () => {
          const { storage } = await setupUserNodes()

          const moved_work_path = `${storage.tmp.path}/${storage.work.name}`
          await storageService.moveDir(AppAdminUserToken(), { fromDir: storage.work.path, toDir: moved_work_path })

          const moved_work = await storageService.sgetNode({ id: storage.work.id })
          expect(moved_work.path).toBe(moved_work_path)
        })

        it('AユーザーのディレクトリをBユーザーのディレクトリへ移動', async () => {
          const { storage, general } = await setupUserNodes()

          const moved_work_path = `${general.root.path}/${storage.work.name}`
          await storageService.moveDir(AppAdminUserToken(), { fromDir: storage.work.path, toDir: moved_work_path })

          const moved_work = await storageService.sgetNode({ id: storage.work.id })
          expect(moved_work.path).toBe(moved_work_path)
        })
      })
    })
  })

  describe('moveFile', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1, d2] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`, `${userRootPath}/d2`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${d1.path}/fileA.txt`,
        },
      ])
      return { users, userRoot, d1, fileA, d2 }
    }

    it('ベーシックケース', async () => {
      await storageService.createHierarchicalDirs([`d1`, `d2`])
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
      const actual = await storageService.moveFile({ fromFile: fromNode.path, toFile: `d2/fileA.txt` })

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
      const actual = await storageService.moveFile({ fromFile: fromNode.path, toFile: `fileA.txt` })

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
      const actual = await storageService.moveFile({ fromFile: fromNode.path, toFile: `d2/file.txt` })

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
        await storageService.moveFile({ fromFile: `d1/fileA.txt`, toFile: `d2/fileA.txt` })
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
        await storageService.moveFile({ fromFile: fromNode.path, toFile: `d2/fileA.txt` })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The destination directory does not exist: 'd2'`)
    })

    it('移動先がディレクトリでない場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileA, d2] = await storageService.uploadDataItems([
        {
          data: 'fileA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
        {
          data: 'd2',
          contentType: 'text/plain; charset=utf-8',
          path: `d2`,
        },
      ])

      let actual!: AppError
      try {
        await storageService.moveFile({ fromFile: `d1/fileA.txt`, toFile: `d2/fileA.txt` })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The destination node is not directory.`)
      expect(actual.data).toEqual({ to: { ...pickProps(d2, ['id', 'path', 'nodeType']) } })
    })

    it('移動先ファイルパスへのバリデーション実行確認', async () => {
      await storageService.createHierarchicalDirs([`d1`, `d2`])
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      // バリデーションメソッドのモック化
      const validatePath = td.replace(CoreStorageService, 'validateNodePath')

      await storageService.moveFile({ fromFile: `d1/fileA.txt`, toFile: `d2/fileA.txt` })

      const exp = td.explain(validatePath)
      expect(exp.calls[0].args[0]).toBe(`d1/fileA.txt`)
      expect(exp.calls[1].args[0]).toBe(`d2/fileA.txt`)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${general_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      describe('自ユーザー', () => {
        it('自ユーザーの範囲内でファイルを移動', async () => {
          const { storage } = await setupUserNodes()

          const moved_fileA_path = `${storage.root.path}/${storage.fileA.name}`
          await storageService.moveFile(StorageUserToken(), { fromFile: storage.fileA.path, toFile: moved_fileA_path })

          const moved_fileA = await storageService.sgetNode({ id: storage.fileA.id })
          expect(moved_fileA.path).toBe(moved_fileA_path)
        })

        it('自ユーザーのファイルを他ユーザーのディレクトリへ移動', async () => {
          const { storage, general } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_fileA_path = `${general.root.path}/${storage.fileA.name}`
            await storageService.moveFile(StorageUserToken(), { fromFile: storage.fileA.path, toFile: moved_fileA_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })
      })

      describe('アプリケーション管理者', () => {
        it('ユーザーの範囲内でファイルを移動', async () => {
          const { storage } = await setupUserNodes()

          const moved_fileA_path = `${storage.root.path}/${storage.fileA.name}`
          await storageService.moveFile(AppAdminUserToken(), { fromFile: storage.fileA.path, toFile: moved_fileA_path })

          const moved_fileA = await storageService.sgetNode({ id: storage.fileA.id })
          expect(moved_fileA.path).toBe(moved_fileA_path)
        })

        it('AユーザーのファイルをBユーザーのディレクトリへ移動', async () => {
          const { storage, general } = await setupUserNodes()

          const moved_fileA_path = `${general.root.path}/${storage.fileA.name}`
          await storageService.moveFile(AppAdminUserToken(), { fromFile: storage.fileA.path, toFile: moved_fileA_path })

          const moved_fileA = await storageService.sgetNode({ id: storage.fileA.id })
          expect(moved_fileA.path).toBe(moved_fileA_path)
        })
      })

      describe('一般ユーザー', () => {
        it('一般ユーザーでアプリケーションディレクトリの範囲内でファイルを移動', async () => {
          const { app } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_fileA_path = `${app.fileA.name}`
            await storageService.moveFile(GeneralUserToken(), { fromFile: app.fileA.path, toFile: moved_fileA_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })

        it('一般ユーザーでアプリケーションファイルを自ユーザーのファイルへ移動', async () => {
          const { app, general } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_fileA_path = `${general.root.path}/${app.fileA.name}`
            await storageService.moveFile(GeneralUserToken(), { fromFile: app.fileA.path, toFile: moved_fileA_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })
      })

      describe('他ユーザー', () => {
        it('他ユーザーの範囲内でファイルを移動', async () => {
          const { storage } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_fileA_path = `${storage.root.path}/${storage.fileA.name}`
            await storageService.moveFile(GeneralUserToken(), { fromFile: storage.fileA.path, toFile: moved_fileA_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })

        it('他ユーザーのファイルを自ユーザーのディレクトリへ移動', async () => {
          const { storage, general } = await setupUserNodes()

          let actual!: AppError
          try {
            const moved_fileA_path = `${general.root.path}/${storage.fileA.name}`
            await storageService.moveFile(GeneralUserToken(), { fromFile: storage.fileA.path, toFile: moved_fileA_path })
          } catch (err) {
            actual = err
          }

          expect(actual.cause).toBe(`Not implemented yet.`)
        })
      })
    })
  })

  describe('renameDir', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1, tmp] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

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
      const { list: fromNodes } = await storageService.getDescendants({ path: `d1`, includeBase: true })

      // 'd1'を'd2'へリネーム
      await storageService.renameDir({ dir: `d1`, name: `d2` })

      // リネーム後の'd2'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `d2`, includeBase: true })
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
        await storageService.renameDir({ dir: dirNode.path, name: `files` })
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
      const fromNodes = (await storageService.getDescendants({ path: `d1/d1`, includeBase: true })).list

      // 'd1/d1'を'd1/d2'へリネーム
      await storageService.renameDir({ dir: `d1/d1`, name: `d2` })

      // リネーム後の'd2'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `d1/d2`, includeBase: true })
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
      const fromNodes = (await storageService.getDescendants({ path: `d1`, includeBase: true })).list

      // 'd1'を'd1XXX'へリネーム
      await storageService.renameDir({ dir: `d1`, name: `d1XXX` })

      // リネーム後の'd1'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: `d1XXX`, includeBase: true })
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

      await storageService.renameDir({ dir: `d1`, name: `d2` })

      const exp = td.explain(validateDirName)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args[0]).toBe(`d2`)
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
      const { list: fromNodes } = await storageService.getDescendants({ path: `dA`, includeBase: true })

      // 大量データを想定して分割でリネームを行う
      // 'dA'を'dB'へリネーム
      await storageService.renameDir({ dir: `dA`, name: `dB` }, { maxChunk: 3 })

      // 移動後の'dB'＋配下ノードを検証
      const renamedNodes = (await storageService.getDescendants({ path: `dB`, includeBase: true })).list
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

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp },
          general: { root: general_root, tmp: general_tmp },
          app: { tmp: app_tmp },
        }
      }

      it('自ユーザーのディレクトリ名を変更', async () => {
        const { storage } = await setupUserNodes()

        await storageService.renameDir(StorageUserToken(), { dir: storage.tmp.path, name: '__tmp__' })

        const renamed_tmp = await storageService.sgetNode({ id: storage.tmp.id })
        expect(renamed_tmp.path).toBe(`${storage.tmp.dir}/__tmp__`)
      })

      it('自ユーザーのルートディレクトリ名を変更', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.renameDir(StorageUserToken(), { dir: storage.root.path, name: CoreStorageSchema.generateId() })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`You do not have permission to rename the user root directory.`)
        expect(actual.data).toEqual({ uid: StorageUserToken().uid })
      })

      it('他ユーザーのディレクトリ名を変更', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.renameDir(GeneralUserToken(), { dir: storage.tmp.path, name: '__tmp__' })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリ名を変更', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.renameDir(GeneralUserToken(), { dir: app.tmp.path, name: '__tmp__' })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリ名を変更', async () => {
        const { storage } = await setupUserNodes()

        await storageService.renameDir(AppAdminUserToken(), { dir: storage.tmp.path, name: '__tmp__' })

        const renamed_tmp = await storageService.sgetNode({ id: storage.tmp.id })
        expect(renamed_tmp.path).toBe(`${storage.tmp.dir}/__tmp__`)
      })
    })
  })

  describe('renameFile', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${d1.path}/fileA.txt`,
        },
      ])
      return { users, userRoot, d1, fileA }
    }

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
      const actual = await storageService.renameFile({ file: `d1/fileA.txt`, name: `fileB.txt` })

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
        await storageService.renameFile({ file: 'd1/fileA.txt', name: `fileB.txt` })
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
      const actual = await storageService.renameFile({ file: 'd1/fileA.txt/fileA.txt', name: 'fileB.txt' })

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

      await storageService.renameFile({ file: `d1/fileA.txt`, name: `fileB.txt` })

      const exp = td.explain(validateFileName)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args[0]).toBe(`fileB.txt`)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${general_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーのファイル名を変更', async () => {
        const { storage } = await setupUserNodes()

        await storageService.renameFile(StorageUserToken(), { file: storage.fileA.path, name: '__fileA__.text' })

        const renamed_tmp = await storageService.sgetNode({ id: storage.fileA.id })
        expect(renamed_tmp.path).toBe(`${storage.fileA.dir}/__fileA__.text`)
      })

      it('他ユーザーのファイル名を変更', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.renameFile(GeneralUserToken(), { file: storage.fileA.path, name: '__fileA__.text' })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションファイル名を変更', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.renameFile(GeneralUserToken(), { file: app.fileA.path, name: '__fileA__.text' })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのファイル名を変更', async () => {
        const { storage } = await setupUserNodes()

        await storageService.renameFile(AppAdminUserToken(), { file: storage.fileA.path, name: '__fileA__.text' })

        const renamed_tmp = await storageService.sgetNode({ id: storage.fileA.id })
        expect(renamed_tmp.path).toBe(`${storage.fileA.dir}/__fileA__.text`)
      })
    })
  })

  describe('setFileAccessAuthClaims', () => {
    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(AppAdminUser(), GeneralUser(), StorageUser())
    })

    function expectOtherUserClaims(actual: UserClaims, expected: UserClaims): void {
      expect(actual.isAppAdmin).toBe(expected.isAppAdmin)
      expect(actual.authStatus).toBe(expected.authStatus)
    }

    describe('ユーザーファイル', () => {
      let fileNodeA: StorageNode

      beforeEach(async () => {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
        const [uploadedNode] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${userRootPath}/d1/fileA.txt`,
          },
        ])
        fileNodeA = uploadedNode
      })

      it('ファイルは公開設定 -> 誰でも読み込み可能', async () => {
        // ファイルに公開設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: true,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは非公開設定 -> 自ユーザーは読み書き可能', async () => {
        // ファイルに非公開設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: false,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※自ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(StorageUserToken(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(StorageUserToken().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBe(fileNodeA.id)
        expectOtherUserClaims(userClaims, StorageUserToken())
      })

      it('ファイルは非公開設定 -> 他ユーザーは読み書き不可', async () => {
        // ファイルに非公開設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: false,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(AppAdminUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(AppAdminUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, AppAdminUser())
      })

      it('ファイルは公開未設定 -> 自ユーザーは読み書き可能', async () => {
        // ファイルに公開未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: null,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※自ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(StorageUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(StorageUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBe(fileNodeA.id)
        expectOtherUserClaims(userClaims, StorageUser())
      })

      it('ファイルは公開未設定 -> 他ユーザーは読み書き不可', async () => {
        // ファイルを公開未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: null,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルに読み書き権限設定 -> 他ユーザーも読み書き可能', async () => {
        // ファイルに読み書き権限設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            readUIds: [GeneralUser().uid],
            writeUIds: [GeneralUser().uid],
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBe(fileNodeA.id)
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは公開未設定 + 上位ディレクトリに公開設定 -> 他ユーザーも読み込み可能', async () => {
        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            isPublic: true,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは非公開設定 + 上位ディレクトリに公開設定 -> 他ユーザーは読み込み不可', async () => {
        // ファイルに非公開設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: false,
          }
        )

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            isPublic: true,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは公開未設定 + 上位ディレクトリに読み書き権限設定 -> 他ユーザーも読み書き可能', async () => {
        // ファイルに公開未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: null,
          }
        )

        // 上位ディレクトリに読み書き権限設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            readUIds: [GeneralUser().uid],
            writeUIds: [GeneralUser().uid],
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBe(fileNodeA.id)
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルに読み込み権限設定 + 上位ディレクトリに読み書き権限設定 -> 他ユーザーも読み書き不可', async () => {
        // ファイルに読み書き権限設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            readUIds: ['ichiro'],
            writeUIds: ['ichiro'],
          }
        )

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            readUIds: [GeneralUser().uid],
            writeUIds: [GeneralUser().uid],
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        // 上位ディレクトリに設定した読み込み権限ではなく、
        // ファイルに設定した読み込み権限が適用されるため、アクセス不可
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('アップロード前 + 上位ディレクトリに読み書き権限未設定 -> 自ユーザーは読み書き可能', async () => {
        // アップロード前のファイルノードを取得
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
        const fileNodeX = h.newFileNode(`${userRootPath}/d1/fileX.txt`)

        // 上位ディレクトリは権限未設定
        await storageService.setDirShareDetail({ path: fileNodeA.dir }, null)

        // ユーザークレイムにノードアクセス権限を設定
        // ※自ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(StorageUser(), fileNodeX)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(StorageUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeX.id)
        expect(userClaims.writableNodeId).toBe(fileNodeX.id)
        expectOtherUserClaims(userClaims, StorageUser())
      })

      it('アップロード前 + 上位ディレクトリに読み書き権限未設定 -> 他ユーザーは読み書き不可', async () => {
        // アップロード前のファイルノードを取得
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
        const fileNodeX = h.newFileNode(`${userRootPath}/d1/fileX.txt`)

        // 上位ディレクトリは権限未設定
        await storageService.setDirShareDetail({ path: fileNodeA.dir }, null)

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeX)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('アップロード前 + 上位ディレクトリに読み書き権限設定 -> 他ユーザーは読み書き可能', async () => {
        // アップロード前のファイルノードを取得
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
        const fileNodeX = h.newFileNode(`${userRootPath}/d1/fileX.txt`)

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            readUIds: [GeneralUser().uid],
            writeUIds: [GeneralUser().uid],
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeX)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeX.id)
        expect(userClaims.writableNodeId).toBe(fileNodeX.id)
        expectOtherUserClaims(userClaims, GeneralUser())
      })
    })

    describe('アプリケーションファイル', () => {
      let fileNodeA: StorageNode

      beforeEach(async () => {
        await storageService.createHierarchicalDirs([`d1`])
        const [uploadedNode] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])
        fileNodeA = uploadedNode
      })

      it('ファイルは公開設定 -> 誰でも読み込み可能', async () => {
        // ファイルに公開設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: true,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者以外に権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは非公開設定 -> アプリケーション管理者は読み書き可能', async () => {
        // ファイルに非公開設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: false,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者に権限設定
        const actual = await storageService.setFileAccessAuthClaims(AppAdminUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(AppAdminUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBe(fileNodeA.id)
        expectOtherUserClaims(userClaims, AppAdminUser())
      })

      it('ファイルは非公開設定 -> アプリケーション管理者以外は読み書き不可', async () => {
        // ファイルに非公開設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: false,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者以外に権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは公開未設定 -> アプリケーション管理者は読み書き可能', async () => {
        // ファイルに公開未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: null,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者に権限設定
        const actual = await storageService.setFileAccessAuthClaims(AppAdminUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(AppAdminUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBe(fileNodeA.id)
        expectOtherUserClaims(userClaims, AppAdminUser())
      })

      it('ファイルは公開未設定 -> アプリケーション管理者以外は読み書き不可', async () => {
        // ファイルに公開未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: null,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者以外に権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルに読み書き権限設定 -> アプリケーション管理者以外も読み書き可能', async () => {
        // ファイルに公開未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            readUIds: [GeneralUser().uid],
            writeUIds: [GeneralUser().uid],
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者以外に権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBe(fileNodeA.id)
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは公開未設定 + 上位ディレクトリに公開設定 -> アプリケーション管理者以外も読み込み可能', async () => {
        // ファイルに公開未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: null,
          }
        )

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            isPublic: true,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者以外に権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは非公開設定 + 上位ディレクトリに公開設定 -> アプリケーション管理者以外は読み書き不可', async () => {
        // ファイルに非公開設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            isPublic: false,
          }
        )

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            isPublic: true,
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者以外に権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルは公開未設定 + 上位ディレクトリに読み書き権限設定 -> アプリケーション管理者以外も読み書き可能', async () => {
        // ファイルに読み書き未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            readUIds: null,
            writeUIds: null,
          }
        )

        // 上位ディレクトリに読み書き設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            readUIds: [GeneralUser().uid],
            writeUIds: [GeneralUser().uid],
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者以外に権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeA.id)
        expect(userClaims.writableNodeId).toBe(fileNodeA.id)
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('ファイルに読み書き権限設定 + 上位ディレクトリに読み書き権限設定 -> 他ユーザーも読み書き不可', async () => {
        // ファイルに読み書き未設定
        await storageService.setFileShareDetail(
          { path: fileNodeA.path },
          {
            readUIds: ['ichiro'],
            writeUIds: ['ichiro'],
          }
        )

        // 上位ディレクトリに読み書き設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            readUIds: [GeneralUser().uid],
            writeUIds: [GeneralUser().uid],
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※アプリケーション管理者以外に権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeA)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('アップロード前 + 上位ディレクトリに読み書き権限未設定 -> 自ユーザーは読み書き可能', async () => {
        // アップロード前のファイルノードを取得
        await storageService.createHierarchicalDirs([`d1`])
        const fileNodeX = h.newFileNode(`d1/fileX.txt`)

        // 上位ディレクトリは権限未設定
        await storageService.setDirShareDetail({ path: fileNodeA.dir }, null)

        // ユーザークレイムにノードアクセス権限を設定
        // ※自ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(AppAdminUser(), fileNodeX)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(AppAdminUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeX.id)
        expect(userClaims.writableNodeId).toBe(fileNodeX.id)
        expectOtherUserClaims(userClaims, AppAdminUser())
      })

      it('アップロード前 + 上位ディレクトリに読み書き権限未設定 -> 他ユーザーは読み書き不可', async () => {
        // アップロード前のファイルノードを取得
        await storageService.createHierarchicalDirs([`d1`])
        const fileNodeX = h.newFileNode(`d1/fileX.txt`)

        // 上位ディレクトリは権限未設定
        await storageService.setDirShareDetail({ path: fileNodeA.dir }, null)

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeX)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBeUndefined()
        expect(userClaims.writableNodeId).toBeUndefined()
        expectOtherUserClaims(userClaims, GeneralUser())
      })

      it('アップロード前 + 上位ディレクトリに読み書き権限設定 -> 他ユーザーは読み書き可能', async () => {
        // アップロード前のファイルノードを取得
        await storageService.createHierarchicalDirs([`d1`])
        const fileNodeX = h.newFileNode(`d1/fileX.txt`)

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(
          { path: fileNodeA.dir },
          {
            readUIds: [GeneralUser().uid],
            writeUIds: [GeneralUser().uid],
          }
        )

        // ユーザークレイムにノードアクセス権限を設定
        // ※他ユーザーに権限設定
        const actual = await storageService.setFileAccessAuthClaims(GeneralUser(), fileNodeX)

        expect(actual.length).toBeGreaterThan(0)

        const userRecord = await UserHelper.getUserRecord(GeneralUser().uid)
        const userClaims = userRecord.customClaims as UserClaims
        expect(userClaims.readableNodeId).toBe(fileNodeX.id)
        expect(userClaims.writableNodeId).toBe(fileNodeX.id)
        expectOtherUserClaims(userClaims, GeneralUser())
      })
    })
  })

  describe('removeFileAccessAuthClaims', () => {
    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(AppAdminUser(), GeneralUser(), StorageUser())
    })

    function expectOtherUserClaims(actual: UserClaims, expected: UserClaims): void {
      expect(actual.isAppAdmin).toBe(expected.isAppAdmin)
      expect(actual.authStatus).toBe(expected.authStatus)
    }

    it('ベーシックケース', async () => {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      const fileData = 'test'
      const [fileNode] = await storageService.uploadDataItems([
        {
          data: fileData,
          contentType: 'text/plain; charset=utf-8',
          path: `${userRootPath}/d1/fileA.txt`,
          // ファイルに読み書き権限設定
          share: {
            readUIds: [StorageUserToken().uid],
            writeUIds: [StorageUserToken().uid],
          },
        },
      ])

      // ユーザーにノードアクセス権限を設定
      await storageService.setFileAccessAuthClaims(StorageUserToken(), fileNode)

      // ユーザーのノードアクセス権限をクリア
      const actual = await storageService.removeFileAccessAuthClaims(StorageUserToken())

      expect(actual.length).toBeGreaterThan(0)

      const userRecord = await UserHelper.getUserRecord(StorageUserToken().uid)
      const userClaims = userRecord.customClaims as UserClaims
      expect(userClaims.readableNodeId).toBeUndefined()
      expect(userClaims.writableNodeId).toBeUndefined()
      expectOtherUserClaims(userClaims, StorageUserToken())
    })

    it('2回実行した場合', async () => {
      // ユーザーのノードアクセス権限をクリア - 1回目
      await storageService.removeFileAccessAuthClaims(StorageUserToken())
      // ユーザーのノードアクセス権限をクリア - 2回目
      const actual = await storageService.removeFileAccessAuthClaims(StorageUserToken())

      expect(actual.length).toBeGreaterThan(0)

      const userRecord = await UserHelper.getUserRecord(StorageUserToken().uid)
      const userClaims = userRecord.customClaims as UserClaims
      expect(userClaims.readableNodeId).toBeUndefined()
      expect(userClaims.writableNodeId).toBeUndefined()
      expectOtherUserClaims(userClaims, StorageUserToken())
    })
  })

  describe('setDirShareDetail', () => {
    async function setupAppNodes() {
      const [d1] = await storageService.createHierarchicalDirs([`d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])
      return { d1, fileA }
    }

    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ID指定', async () => {
      const { d1 } = await setupAppNodes()

      const actual = await storageService.setDirShareDetail({ id: d1.id }, { isPublic: true })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('パス指定', async () => {
      const { d1 } = await setupAppNodes()

      const actual = await storageService.setDirShareDetail({ path: d1.path }, { isPublic: true })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ path: actual.path }))
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      await setupAppNodes()

      const actual = await storageService.setDirShareDetail({ path: `d1` }, { isPublic: true })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      await setupAppNodes()

      const actual = await storageService.setDirShareDetail({ path: `d1` }, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      await setupAppNodes()

      const actual = await storageService.setDirShareDetail({ path: `d1` }, { readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      await setupAppNodes()

      // 公開フラグをオンに設定しておく
      await storageService.setDirShareDetail({ path: `d1` }, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 公開フラグをオフに設定
      const actual = await storageService.setDirShareDetail({ path: `d1` }, { isPublic: false })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({
          isPublic: false,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      await setupAppNodes()

      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareDetail({ path: `d1` }, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareDetail({ path: `d1` }, { readUIds: [], writeUIds: [] })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      await setupAppNodes()

      // 読み込み・書き込み権限を設定しておく
      await storageService.setDirShareDetail({ path: `d1` }, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setDirShareDetail({ path: `d1` }, { readUIds: null, writeUIds: null })

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('存在しないディレクトリを指定した場合', async () => {
      await setupAppNodes()

      let actual!: AppError
      try {
        await storageService.setDirShareDetail({ path: `dXXX` }, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`There is no node in the specified key.`)
      expect(actual.data).toEqual({ path: `dXXX` })
    })

    it('共有設定するノードがディレクトリでない場合', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      let actual!: AppError
      try {
        await storageService.setDirShareDetail({ path: `d1/fileA.txt` }, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The node to be shared is not directory.`)
      expect(actual.data).toEqual({ to: { ...pickProps(fileA, ['id', 'path', 'nodeType']) } })
    })

    it('inputにnullを指定した場合', async () => {
      await setupAppNodes()

      // 共有設定をしておく
      await storageService.setDirShareDetail({ path: `d1` }, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setDirShareDetail({ path: `d1` }, null)

      const verify = (node: CoreStorageNode) => {
        expect(node.path).toBe(`d1`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: null, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetNode({ id: actual.id }))
    })

    it('作成日時＋更新日時の検証', async () => {
      await setupAppNodes()

      // 共有設定前のノードを取得
      const fm_d1 = await storageService.sgetNode({ path: `d1` })

      // 共有設定を実行
      const to_d1 = await storageService.setDirShareDetail({ path: `d1` }, { isPublic: true })

      // 作成日時の検証
      expect(to_d1.createdAt).toEqual(fm_d1.createdAt)
      // 更新日時の検証
      expect(to_d1.updatedAt).toEqual(fm_d1.updatedAt)
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      await setupAppNodes()

      let actual!: AppError
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareDetail({ path: `d1` }, { readUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'readUIds' had an incorrect value: 'xxx,yyy'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      await setupAppNodes()

      let actual!: AppError
      try {
        // カンマを含んだユーザーIDを設定
        await storageService.setDirShareDetail({ path: `d1` }, { writeUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'writeUIds' had an incorrect value: 'xxx,yyy'`)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp },
          general: { root: general_root, tmp: general_tmp },
          app: { tmp: app_tmp },
        }
      }

      it('自ユーザーディレクトリの共有設定を変更', async () => {
        const { storage } = await setupUserNodes()

        await storageService.setDirShareDetail(StorageUserToken(), storage.tmp, { isPublic: true })

        const renamed_tmp = await storageService.sgetNode(storage.tmp)
        expect(renamed_tmp.share.isPublic).toBeTruthy()
      })

      it('自ユーザーのルートディレクトリの共有設定を変更', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.setDirShareDetail(GeneralUserToken(), storage.root, { isPublic: true })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`You do not have permission to set share detail the user root directory.`)
        expect(actual.data).toEqual({ uid: GeneralUserToken().uid })
      })

      it('他ユーザーディレクトリの共有設定を変更', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.setDirShareDetail(GeneralUserToken(), storage.tmp, { isPublic: true })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションディレクトリの共有設定を変更', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.setDirShareDetail(GeneralUserToken(), app.tmp, { isPublic: true })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーディレクトリの共有設定を変更', async () => {
        const { storage } = await setupUserNodes()

        await storageService.setDirShareDetail(AppAdminUserToken(), storage.tmp, { isPublic: true })

        const renamed_tmp = await storageService.sgetNode(storage.tmp)
        expect(renamed_tmp.share.isPublic).toBeTruthy()
      })
    })
  })

  describe('setFileShareDetail', () => {
    async function setupAppNodes() {
      const [d1] = await storageService.createHierarchicalDirs([`d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])
      return { d1, fileA }
    }

    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${d1.path}/fileA.txt`,
        },
      ])
      return { users, userRoot, d1, fileA }
    }

    it('ID指定', async () => {
      const { fileA } = await setupAppNodes()

      const actual = await storageService.setFileShareDetail({ id: fileA.id }, { isPublic: true })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('パス指定', async () => {
      const { fileA } = await setupAppNodes()

      const actual = await storageService.setFileShareDetail({ path: fileA.path }, { isPublic: true })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ path: actual.path }))
    })

    it('共有設定 - 設定なしの状態から公開フラグを設定', async () => {
      await setupAppNodes()

      const actual = await storageService.setFileShareDetail({ path: `d1/fileA.txt` }, { isPublic: true })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('共有設定 - 設定なしの状態から読み込み・書き込み権限を設定', async () => {
      await setupAppNodes()

      const actual = await storageService.setFileShareDetail(
        { path: `d1/fileA.txt` },
        {
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        }
      )

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareDetail>({
          isPublic: null,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('共有設定 - 公開フラグがオンの状態からオフへ設定', async () => {
      await setupAppNodes()

      // 公開フラグをオンに設定しておく
      await storageService.setFileShareDetail(
        { path: `d1/fileA.txt` },
        {
          isPublic: true,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        }
      )

      // 公開フラグをオフに設定
      const actual = await storageService.setFileShareDetail({ path: `d1/fileA.txt` }, { isPublic: false })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareDetail>({
          isPublic: false,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        })
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態から空を設定', async () => {
      await setupAppNodes()

      // 読み込み・書き込み権限を設定しておく
      await storageService.setFileShareDetail(
        { path: `d1/fileA.txt` },
        {
          isPublic: true,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        }
      )

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setFileShareDetail({ path: `d1/fileA.txt` }, { readUIds: [], writeUIds: [] })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('共有設定 - 読み込み・書き込み権限が設定されている状態からnullを設定', async () => {
      await setupAppNodes()

      // 読み込み・書き込み権限を設定しておく
      await storageService.setFileShareDetail(
        { path: `d1/fileA.txt` },
        {
          isPublic: true,
          readUIds: ['ichiro'],
          writeUIds: ['ichiro'],
        }
      )

      // 読み込み・書き込み権限を空に設定
      const actual = await storageService.setFileShareDetail({ path: `d1/fileA.txt` }, { readUIds: null, writeUIds: null })

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: true, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('存在しないファイルを指定した場合', async () => {
      await setupAppNodes()

      let actual!: AppError
      try {
        await storageService.setFileShareDetail({ path: `d1/zzz.txt` }, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`There is no node in the specified key.`)
      expect(actual.data).toEqual({ path: `d1/zzz.txt` })
    })

    it('共有設定するノードがファイルでない場合', async () => {
      const [d1] = await storageService.createHierarchicalDirs([`d1`])

      let actual!: AppError
      try {
        await storageService.setFileShareDetail({ path: `d1` }, { isPublic: true })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The node to be shared is not file.`)
      expect(actual.data).toEqual({ to: { ...pickProps(d1, ['id', 'path', 'nodeType']) } })
    })

    it('inputにnullを指定した場合', async () => {
      await setupAppNodes()

      // 共有設定をしておく
      await storageService.setDirShareDetail({ path: `d1` }, { isPublic: true, readUIds: ['ichiro'], writeUIds: ['ichiro'] })

      // nullを指定
      const actual = await storageService.setFileShareDetail({ path: `d1/fileA.txt` }, null)

      const verify = (node: StorageFileNode) => {
        expect(node.path).toBe(`d1/fileA.txt`)
        expect(node.share).toEqual<StorageNodeShareDetail>({ isPublic: null, readUIds: null, writeUIds: null })
      }
      verify(actual)
      verify(await storageService.sgetFileNode({ id: actual.id }))
    })

    it('作成日時＋更新日時の検証', async () => {
      await setupAppNodes()

      // 共有設定前のノードを取得
      const fm_fileA = await storageService.sgetFileNode({ path: `d1/fileA.txt` })

      // 共有設定を実行
      const to_fileA = await storageService.setFileShareDetail({ path: `d1/fileA.txt` }, { isPublic: true })

      // 作成日時の検証
      expect(to_fileA.createdAt).toEqual(fm_fileA.createdAt)
      // 更新日時の検証
      expect(to_fileA.updatedAt).toEqual(fm_fileA.updatedAt)
    })

    it('読み込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      await setupAppNodes()

      let actual!: AppError
      try {
        await storageService.setFileShareDetail({ path: `d1/fileA.txt` }, { readUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'readUIds' had an incorrect value: 'xxx,yyy'`)
    })

    it('書き込み権限の設定値に不正なユーザーIDを指定した場合', async () => {
      await setupAppNodes()

      let actual!: AppError
      try {
        await storageService.setFileShareDetail({ path: `d1/fileA.txt` }, { writeUIds: ['aaa', 'xxx,yyy'] })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified 'writeUIds' had an incorrect value: 'xxx,yyy'`)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーファイルの共有設定を変更', async () => {
        const { storage } = await setupUserNodes()

        await storageService.setFileShareDetail(StorageUserToken(), storage.fileA, { isPublic: true })

        const renamed_tmp = await storageService.sgetNode(storage.fileA)
        expect(renamed_tmp.share.isPublic).toBeTruthy()
      })

      it('他ユーザーファイルの共有設定を変更', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.setFileShareDetail(GeneralUserToken(), storage.fileA, { isPublic: true })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションファイルの共有設定を変更', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await storageService.setFileShareDetail(GeneralUserToken(), app.fileA, { isPublic: true })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーファイルの共有設定を変更', async () => {
        const { storage } = await setupUserNodes()

        await storageService.setFileShareDetail(AppAdminUserToken(), storage.fileA, { isPublic: true })

        const renamed_tmp = await storageService.sgetNode(storage.fileA)
        expect(renamed_tmp.share.isPublic).toBeTruthy()
      })
    })
  })

  describe('handleUploadedFile', () => {
    async function setupAppNodes() {
      const [d1] = await storageService.createHierarchicalDirs([`d1/d11`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
          share: {
            isPublic: true,
            readUIds: ['ichiro'],
            writeUIds: ['ichiro'],
          },
        },
      ])
      return { d1, fileA }
    }

    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: `${d1.path}/fileA.txt`,
        },
      ])
      return { users, userRoot, d1, fileA }
    }

    it('ベーシックケース', async () => {
      const { fileA } = await setupAppNodes()

      // テストのためデータベースからファイルノードを削除しておく
      const client = newElasticClient()
      await client.delete({
        index: CoreStorageSchema.IndexAlias,
        id: fileA.id,
        refresh: true,
      })

      // ファイルアップロードの後処理を実行
      const actual = (await storageService.handleUploadedFile(fileA))!

      // 戻り値の検証
      await h.existsNodes([actual])
    })

    it('アップロードによるファイル｢更新｣後の実行', async () => {
      const { fileA } = await setupAppNodes()

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
      const { fileA } = await setupAppNodes()

      // テストのためデータベースからファイルノードを削除しておく
      const client = newElasticClient()
      await client.delete({
        index: CoreStorageSchema.IndexAlias,
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

      // 1回目と2回目の内容を比較検証
      expect(fileA_2.updatedAt.isAfter(fileA_1.updatedAt)).toBeTruthy()
      expect(fileA_2.version).toBe(fileA_1.version + 1)
    })

    it('ファイルパスへのバリデーション実行確認', async () => {
      const { fileA } = await setupAppNodes()

      const validatePath = td.replace(CoreStorageService, 'validateNodePath')

      await storageService.handleUploadedFile(fileA)

      const exp = td.explain(validatePath)
      expect(exp.calls.length >= 1).toBeTruthy()
      expect(exp.calls[0].args[0]).toBe(`d1/fileA.txt`)
    })

    it('存在しないファイルを指定した場合', async () => {
      const fileA = {
        id: CoreStorageSchema.generateId(),
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
        id: CoreStorageSchema.generateId(),
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

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])
        const [storage_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])
        const [general_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${storage_tmp.path}/fileA.txt`,
          },
        ])

        const [app_tmp] = await storageService.createHierarchicalDirs([`tmp`])
        const [app_fileA] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            path: `${app_tmp.path}/fileA.txt`,
          },
        ])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp, fileA: storage_fileA },
          general: { root: general_root, tmp: general_tmp, fileA: general_fileA },
          app: { tmp: app_tmp, fileA: app_fileA },
        }
      }

      it('自ユーザーのファイルアップロード後処理を実行', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.handleUploadedFile(StorageUserToken(), storage.fileA)

        await h.existsNodes([actual])
      })

      it('他ユーザーのファイルアップロード後処理を実行', async () => {
        const { storage } = await setupUserNodes()

        let actual!: AppError
        try {
          await await storageService.handleUploadedFile(GeneralUserToken(), storage.fileA)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションファイルアップロード後処理を実行', async () => {
        const { app } = await setupUserNodes()

        let actual!: AppError
        try {
          await await storageService.handleUploadedFile(GeneralUserToken(), app.fileA)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのファイルアップロード後処理を実行', async () => {
        const { storage } = await setupUserNodes()

        const actual = await storageService.handleUploadedFile(AppAdminUserToken(), storage.fileA)

        await h.existsNodes([actual])
      })
    })
  })

  describe('getSignedUploadUrls', () => {
    async function setupUserNodes() {
      const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
      const [users, userRoot, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
      return { users, userRoot, d1 }
    }

    it('ベーシックケース', async () => {
      const requestOrigin = config.cors.whitelist[0]
      const inputs: SignedUploadUrlInput[] = [
        { id: CoreStorageSchema.generateId(), path: `fileA.txt`, contentType: 'text/plain' },
        { id: CoreStorageSchema.generateId(), path: `fileB.txt`, contentType: 'text/plain' },
      ]

      const actual = await storageService.getSignedUploadUrls(requestOrigin, inputs)

      expect(actual.length).toBe(2)
    })

    describe('権限の検証', () => {
      async function setupUserNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageUserRootPath = StorageService.toUserRootPath(StorageUserToken())
        const [storage_root, storage_tmp] = await storageService.createHierarchicalDirs([`${storageUserRootPath}/tmp`])

        const generalUserRootPath = StorageService.toUserRootPath(GeneralUserToken())
        const [general_root, general_tmp] = await storageService.createHierarchicalDirs([`${generalUserRootPath}/tmp`])

        return {
          users,
          storage: { root: storage_root, tmp: storage_tmp },
          general: { root: general_root, tmp: general_tmp },
        }
      }

      it('自ユーザーファイルのアップロードURL取得', async () => {
        const { storage } = await setupUserNodes()
        const requestOrigin = config.cors.whitelist[0]

        const actual = await storageService.getSignedUploadUrls(StorageUserToken(), requestOrigin, [
          { id: CoreStorageSchema.generateId(), path: `${storage.tmp.path}/fileA.txt`, contentType: 'text/plain' },
        ])

        expect(actual.length).toBe(1)
      })

      it('他ユーザーファイルのアップロードURL取得', async () => {
        const { storage, general } = await setupUserNodes()
        const requestOrigin = config.cors.whitelist[0]

        let actual!: AppError
        try {
          // 自身と他者のURL取得を試みる
          await storageService.getSignedUploadUrls(GeneralUserToken(), requestOrigin, [
            // 自身
            { id: CoreStorageSchema.generateId(), path: `${general.tmp.path}/fileA.txt`, contentType: 'text/plain' },
            // 他ユーザー
            { id: CoreStorageSchema.generateId(), path: `${storage.tmp.path}/fileA.txt`, contentType: 'text/plain' },
          ])
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('一般ユーザーでアプリケーションファイルのアップロードURL取得', async () => {
        const requestOrigin = config.cors.whitelist[0]

        let actual!: AppError
        try {
          await storageService.getSignedUploadUrls(GeneralUserToken(), requestOrigin, [
            { id: CoreStorageSchema.generateId(), path: `fileA.txt`, contentType: 'text/plain' },
          ])
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーファイルのアップロードURL取得', async () => {
        const { storage } = await setupUserNodes()
        const requestOrigin = config.cors.whitelist[0]

        const actual = await storageService.getSignedUploadUrls(AppAdminUserToken(), requestOrigin, [
          { id: CoreStorageSchema.generateId(), path: `${storage.tmp.path}/fileA.txt`, contentType: 'text/plain' },
        ])

        expect(actual.length).toBe(1)
      })
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
      const user2Nodes = (await storageService.getDescendants({ path: user2Dir, includeBase: true })).list
      // ユーザーノード以外を取得
      const otherNodes = [
        ...(await storageService.getDescendants({ path: user1Dir, includeBase: true })).list,
        ...(await storageService.getDescendants({ path: user3Dir, includeBase: true })).list,
      ]

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
      const user1Nodes = (await storageService.getDescendants({ path: user1Dir, includeBase: true })).list

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user1', 3)

      // ユーザーノードが全て削除されたことを検証
      await h.notExistsNodes(user1Nodes)
    })
  })

  describe('validateBrowsable', () => {
    describe('アプリケーションノード', () => {
      async function setupAppNodes() {
        const [d1, d11, d12] = await storageService.createHierarchicalDirs([`d1/d11`, `d1/d12`])
        return { d1, d11, d12 }
      }

      it('ノードは公開設定 -> 誰でもアクセス可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })
        await storageService.setDirShareDetail(d12, { isPublic: true })

        // アプリケーション管理者で検証
        await storageService.validateBrowsable(AppAdminUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> アプリケーション管理者はアクセス可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: false })
        await storageService.setDirShareDetail(d12, { isPublic: false })

        // アプリケーション管理者で検証
        await storageService.validateBrowsable(AppAdminUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> アプリケーション管理者以外はアクセス不可', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらには公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // アプリケーション管理者以外で検証
          await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードは公開未設定 -> アプリケーション管理者はアクセス可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // アプリケーション管理者で検証
        await storageService.validateBrowsable(AppAdminUserToken(), [d11.path, d12.path])
      })

      it('ノードは公開未設定 -> アプリケーション管理者以外はアクセス不可', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらには公開設定
        await storageService.setDirShareDetail(d12, { isPublic: null })

        let actual!: HttpException
        try {
          // アプリケーション管理者以外で検証
          await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードに読み込み権限設定 -> アプリケーション管理者以外もアクセス可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d11, { readUIds: [StorageUserToken().uid] })
        await storageService.setDirShareDetail(d12, { readUIds: [StorageUserToken().uid] })

        // アプリケーション管理者以外で検証
        await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開未設定 + ノードは公開設定 -> アプリケーション管理者以外もアクセス可能', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに公開未設定
        await storageService.setDirShareDetail(d1, { isPublic: null })
        // ノードに公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })
        await storageService.setDirShareDetail(d12, { isPublic: true })

        // アプリケーション管理者以外で検証
        await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開設定 + ノードは公開未設定 -> アプリケーション管理者以外もアクセス可能', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(d1, { isPublic: true })
        // ノードに公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // アプリケーション管理者以外で検証
        await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開設定 + ノードは非公開設定 -> アプリケーション管理者以外はアクセス不可', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(d1, { isPublic: true })
        // ディレクトリに非公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // アプリケーション管理者以外で検証
          await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('上位ディレクトリに読み込み権限設定 + ノードは公開未設定 -> アプリケーション管理者以外もアクセス可能', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [StorageUserToken().uid] })
        // ノードは公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // アプリケーション管理者以外で検証
        await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに読み込み権限設定 + ノードに読み込み権限設定 -> 他ユーザーもアクセス不可', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [StorageUserToken().uid] })
        // ノードに読み込み権限設定
        await storageService.setDirShareDetail(d12, { readUIds: ['ichiro'] })

        let actual!: HttpException
        try {
          // 上位ディレクトリに設定した読み込み権限ではなく、
          // ノードに設定した読み込み権限が適用されるため、アクセス不可
          await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('バケットを指定 -> アプリケーション管理者はアクセス可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // アプリケーション管理者で検証
        await storageService.validateBrowsable(AppAdminUserToken(), [``, d11.path, d12.path])
      })

      it('バケットを指定 -> アプリケーション管理者以外はアクセス不可', async () => {
        const { d11, d12 } = await setupAppNodes()

        let actual!: HttpException
        try {
          // アプリケーション管理者以外で検証
          await storageService.validateBrowsable(StorageUserToken(), [``, d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })

    describe('ユーザーノード', () => {
      async function setupUserNodes() {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        const [users, userRoot, d1, d11, d12] = await storageService.createHierarchicalDirs([`${userRootPath}/d1/d11`, `${userRootPath}/d1/d12`])
        return { users, userRoot, d1, d11, d12 }
      }

      it('ノードは公開設定 -> 誰でもアクセス可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })
        await storageService.setDirShareDetail(d12, { isPublic: true })

        // 他ユーザーで検証
        await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> 自ユーザーはアクセス可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: false })
        await storageService.setDirShareDetail(d12, { isPublic: false })

        // 自ユーザーで検証
        await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> アプリケーション管理者はアクセス可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: false })
        await storageService.setDirShareDetail(d12, { isPublic: false })

        // アプリケーション管理者で検証
        await storageService.validateBrowsable(AppAdminUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> 他ユーザーはアクセス不可', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらには公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // 他ユーザーで検証
          await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードは公開未設定 -> 自ユーザーはアクセス可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // 自ユーザーで検証
        await storageService.validateBrowsable(StorageUserToken(), [d11.path, d12.path])
      })

      it('ノードは公開未設定 -> アプリケーション管理者はアクセス可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // アプリケーション管理者で検証
        await storageService.validateBrowsable(AppAdminUserToken(), [d11.path, d12.path])
      })

      it('ノードは公開未設定 -> 他ユーザーはアクセス不可', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        let actual!: HttpException
        try {
          // 他ユーザーで検証
          await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードに読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードに読み込み権限設定
        await storageService.setDirShareDetail(d11, { readUIds: [GeneralUser().uid] })
        await storageService.setDirShareDetail(d12, { readUIds: [GeneralUser().uid] })

        // 他ユーザーで検証
        await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開未設定 + ノードは公開設定 -> 他ユーザーもアクセス可能', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに公開未設定
        await storageService.setDirShareDetail(d1, { isPublic: null })
        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })
        await storageService.setDirShareDetail(d12, { isPublic: true })

        // 他ユーザーで検証
        await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開設定 + ノードは公開未設定 -> 他ユーザーもアクセス可能', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(d1, { isPublic: true })
        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // 他ユーザーで検証
        await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開設定 + ノードは非公開設定 -> 他ユーザーはアクセス不可', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(d1, { isPublic: true })
        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらは公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // 他ユーザーで検証
          await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('上位ディレクトリに読み込み権限設定 + ノードは公開未設定 -> 他ユーザーもアクセス可能', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [GeneralUser().uid] })
        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // 他ユーザーで検証
        await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに読み込み権限設定 + ノードに読み込み権限設定 -> 他ユーザーはアクセス不可', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [GeneralUser().uid] })
        // ノードに読み込み権限設定
        await storageService.setDirShareDetail(d12, { readUIds: ['ichiro'] })

        let actual!: HttpException
        try {
          // 上位ディレクトリに設定した読み込み権限ではなく、
          // ノードに設定した読み込み権限が適用されるため、アクセス不可
          await storageService.validateBrowsable(GeneralUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ユーザールートを指定 -> 自ユーザーはアクセス可能', async () => {
        const { userRoot, d11, d12 } = await setupUserNodes()

        // 自ユーザーで検証
        await storageService.validateBrowsable(StorageUserToken(), [userRoot.path, d11.path, d12.path])
      })

      it('ユーザールートを指定 -> アプリケーション管理者はアクセス可能', async () => {
        const { userRoot, d11, d12 } = await setupUserNodes()

        // アプリケーション管理者で検証
        await storageService.validateBrowsable(AppAdminUserToken(), [userRoot.path, d11.path, d12.path])
      })

      it('ユーザールートを指定 -> 他ユーザーはアクセス不可', async () => {
        const { userRoot, d11, d12 } = await setupUserNodes()

        let actual!: HttpException
        try {
          // 他ユーザーで検証
          await storageService.validateBrowsable(GeneralUserToken(), [userRoot.path, d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })

    describe('単数', () => {
      async function setupUserNodes() {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        const [users, userRoot, d1, d11, d12] = await storageService.createHierarchicalDirs([`${userRootPath}/d1/d11`, `${userRootPath}/d1/d12`])
        return { users, userRoot, d1, d11, d12 }
      }

      it('権限あり', async () => {
        const { d11 } = await setupUserNodes()

        // 自ユーザーで検証
        await storageService.validateBrowsable(StorageUserToken(), d11.path)
      })

      it('権限なし', async () => {
        const { d11 } = await setupUserNodes()

        let actual!: HttpException
        try {
          // 自ユーザー以外で検証
          await storageService.validateBrowsable(GeneralUserToken(), d11.path)
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })

    describe('IDトークン指定なし', () => {
      async function setupUserNodes() {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        const [users, userRoot, d1, d11] = await storageService.createHierarchicalDirs([`${userRootPath}/d1/d11`])
        return { users, userRoot, d1, d11 }
      }

      it('権限あり', async () => {
        const { d11 } = await setupUserNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })

        // IDトークンなしで検証
        await storageService.validateBrowsableImpl(undefined, d11.path)
      })

      it('権限なし', async () => {
        const { d11 } = await setupUserNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: false })

        let actual!: HttpException
        try {
          // IDトークンなしで検証
          await storageService.validateBrowsable(undefined, d11.path)
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })

    describe('hierarchicalNodesを指定した場合', () => {
      async function setupUserNodes() {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        const [users, userRoot, d1, d11, d111] = await storageService.createHierarchicalDirs([`${userRootPath}/d1/d11/d111`])
        return { users, userRoot, d1, d11, d111 }
      }

      it('ベーシックケース', async () => {
        const { d1, d111 } = await setupUserNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [GeneralUser().uid] })

        // ノードと階層を構成するノードを取得
        const hierarchicalNodes = await storageService.getHierarchicalNodes(d111.path)

        // hierarchicalNodesを指定して検証
        await storageService.validateBrowsableImpl(GeneralUserToken(), d111.path, hierarchicalNodes)
      })

      it('階層を構成するノードの一部が欠けている場合', async () => {
        const { d1, d11, d111 } = await setupUserNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [GeneralUser().uid] })

        // ノード階層の一部を欠けさせてノードを取得
        const hierarchicalNodes = await storageService.getHierarchicalNodes(d111.path)
        const index = hierarchicalNodes.findIndex(node => node.path === d11.path)
        hierarchicalNodes.splice(index, 1)

        let actual!: AppError
        try {
          // hierarchicalNodesを指定して検証
          await storageService.validateBrowsableImpl(GeneralUserToken(), d111.path, hierarchicalNodes)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`There is a missing node in the hierarchy.`)
        expect(actual.data).toEqual({
          hierarchicalNodes: hierarchicalNodes.map(node => node.path),
          missingNode: d11.path,
        })
      })
    })
  })

  describe('validateReadable', () => {
    describe('アプリケーションノード', () => {
      async function setupAppNodes() {
        const [d1, d11, d12] = await storageService.createHierarchicalDirs([`d1/d11`, `d1/d12`])
        return { d1, d11, d12 }
      }

      it('ノードは公開設定 -> 誰でも読み込み可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })
        await storageService.setDirShareDetail(d12, { isPublic: true })

        // アプリケーション管理者で検証
        await storageService.validateReadable(AppAdminUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> アプリケーション管理者は読み込み可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: false })
        await storageService.setDirShareDetail(d12, { isPublic: false })

        // アプリケーション管理者で検証
        await storageService.validateReadable(AppAdminUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> アプリケーション管理者以外は読み込み不可', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらには公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // アプリケーション管理者以外で検証
          await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードは公開未設定 -> アプリケーション管理者は読み込み可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // アプリケーション管理者で検証
        await storageService.validateReadable(AppAdminUserToken(), [d11.path, d12.path])
      })

      it('ノードは公開未設定 -> アプリケーション管理者以外は読み込み不可', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらには公開設定
        await storageService.setDirShareDetail(d12, { isPublic: null })

        let actual!: HttpException
        try {
          // アプリケーション管理者以外で検証
          await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードに読み込み権限設定 -> アプリケーション管理者以外も読み込み可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d11, { readUIds: [StorageUserToken().uid] })
        await storageService.setDirShareDetail(d12, { readUIds: [StorageUserToken().uid] })

        // アプリケーション管理者以外で検証
        await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開未設定 + ノードは公開設定 -> アプリケーション管理者以外も読み込み可能', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに公開未設定
        await storageService.setDirShareDetail(d1, { isPublic: null })
        // ノードに公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })
        await storageService.setDirShareDetail(d12, { isPublic: true })

        // アプリケーション管理者以外で検証
        await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開設定 + ノードは公開未設定 -> アプリケーション管理者以外も読み込み可能', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(d1, { isPublic: true })
        // ノードに公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // アプリケーション管理者以外で検証
        await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開設定 + ノードは非公開設定 -> アプリケーション管理者以外は読み込み不可', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(d1, { isPublic: true })
        // ディレクトリに非公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // アプリケーション管理者以外で検証
          await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('上位ディレクトリに読み込み権限設定 + ノードは公開未設定 -> アプリケーション管理者以外も読み込み可能', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [StorageUserToken().uid] })
        // ノードは公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // アプリケーション管理者以外で検証
        await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに読み込み権限設定 + ノードに読み込み権限設定 -> 他ユーザーも読み込み不可', async () => {
        const { d1, d11, d12 } = await setupAppNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [StorageUserToken().uid] })
        // ノードに読み込み権限設定
        await storageService.setDirShareDetail(d12, { readUIds: ['ichiro'] })

        let actual!: HttpException
        try {
          // 上位ディレクトリに設定した読み込み権限ではなく、
          // ノードに設定した読み込み権限が適用されるため、読み込み不可
          await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('バケットを指定 -> アプリケーション管理者は読み込み可能', async () => {
        const { d11, d12 } = await setupAppNodes()

        // アプリケーション管理者で検証
        await storageService.validateReadable(AppAdminUserToken(), [``, d11.path, d12.path])
      })

      it('バケットを指定 -> アプリケーション管理者以外は読み込み不可', async () => {
        const { d11, d12 } = await setupAppNodes()

        let actual!: HttpException
        try {
          // アプリケーション管理者以外で検証
          await storageService.validateReadable(StorageUserToken(), [``, d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })

    describe('ユーザーノード', () => {
      async function setupUserNodes() {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        const [users, userRoot, d1, d11, d12] = await storageService.createHierarchicalDirs([`${userRootPath}/d1/d11`, `${userRootPath}/d1/d12`])
        return { users, userRoot, d1, d11, d12 }
      }

      it('ノードは公開設定 -> 誰でも読み込み可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })
        await storageService.setDirShareDetail(d12, { isPublic: true })

        // 他ユーザーで検証
        await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> 自ユーザーは読み込み可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: false })
        await storageService.setDirShareDetail(d12, { isPublic: false })

        // 自ユーザーで検証
        await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
      })

      it('ノードは非公開設定 -> アプリケーション管理者は読み込み不可', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらには公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // アプリケーション管理者ユーザーで検証
          await storageService.validateReadable(AppAdminUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードは非公開設定 -> 他ユーザーは読み込み不可', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらには公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // 他ユーザーで検証
          await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードは公開未設定 -> 自ユーザーは読み込み可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // 自ユーザーで検証
        await storageService.validateReadable(StorageUserToken(), [d11.path, d12.path])
      })

      it('ノードは公開未設定 -> アプリケーション管理者は読み込み不可', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        let actual!: HttpException
        try {
          // アプリケーション管理者で検証
          await storageService.validateReadable(AppAdminUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードは公開未設定 -> 他ユーザーは読み込み不可', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        let actual!: HttpException
        try {
          // 他ユーザーで検証
          await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ノードに読み込み権限設定 -> 他ユーザーも読み込み可能', async () => {
        const { d11, d12 } = await setupUserNodes()

        // ノードに読み込み権限設定
        await storageService.setDirShareDetail(d11, { readUIds: [GeneralUser().uid] })
        await storageService.setDirShareDetail(d12, { readUIds: [GeneralUser().uid] })

        // 他ユーザーで検証
        await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開未設定 + ノードは公開設定 -> 他ユーザーも読み込み可能', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに公開未設定
        await storageService.setDirShareDetail(d1, { isPublic: null })
        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })
        await storageService.setDirShareDetail(d12, { isPublic: true })

        // 他ユーザーで検証
        await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開設定 + ノードは公開未設定 -> 他ユーザーも読み込み可能', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(d1, { isPublic: true })
        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // 他ユーザーで検証
        await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに公開設定 + ノードは非公開設定 -> 他ユーザーは読み込み不可', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに公開設定
        await storageService.setDirShareDetail(d1, { isPublic: true })
        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true }) // こちらは公開設定
        await storageService.setDirShareDetail(d12, { isPublic: false })

        let actual!: HttpException
        try {
          // 他ユーザーで検証
          await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('上位ディレクトリに読み込み権限設定 + ノードは公開未設定 -> 他ユーザーも読み込み可能', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [GeneralUser().uid] })
        // ノードを公開未設定
        await storageService.setDirShareDetail(d11, { isPublic: null })
        await storageService.setDirShareDetail(d12, { isPublic: null })

        // 他ユーザーで検証
        await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
      })

      it('上位ディレクトリに読み込み権限設定 + ノードに読み込み権限設定 -> 他ユーザーは読み込み不可', async () => {
        const { d1, d11, d12 } = await setupUserNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [GeneralUser().uid] })
        // ノードに読み込み権限設定
        await storageService.setDirShareDetail(d12, { readUIds: ['ichiro'] })

        let actual!: HttpException
        try {
          // 上位ディレクトリに設定した読み込み権限ではなく、
          // ノードに設定した読み込み権限が適用されるため、読み込み不可
          await storageService.validateReadable(GeneralUserToken(), [d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ユーザールートを指定 -> 自ユーザーは読み込み可能', async () => {
        const { userRoot, d11, d12 } = await setupUserNodes()

        // 自ユーザーで検証
        await storageService.validateReadable(StorageUserToken(), [userRoot.path, d11.path, d12.path])
      })

      it('ユーザールートを指定 -> アプリケーション管理者は読み込み不可', async () => {
        const { userRoot, d11, d12 } = await setupUserNodes()

        let actual!: HttpException
        try {
          // アプリケーション管理者で検証
          await storageService.validateReadable(AppAdminUserToken(), [userRoot.path, d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('ユーザールートを指定 -> 他ユーザーは読み込み不可', async () => {
        const { userRoot, d11, d12 } = await setupUserNodes()

        let actual!: HttpException
        try {
          // 他ユーザーで検証
          await storageService.validateReadable(GeneralUserToken(), [userRoot.path, d11.path, d12.path])
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })

    describe('単数', () => {
      async function setupUserNodes() {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        const [users, userRoot, d1, d11, d12] = await storageService.createHierarchicalDirs([`${userRootPath}/d1/d11`, `${userRootPath}/d1/d12`])
        return { users, userRoot, d1, d11, d12 }
      }

      it('権限あり', async () => {
        const { d11 } = await setupUserNodes()

        // 自ユーザーで検証
        await storageService.validateReadable(StorageUserToken(), d11.path)
      })

      it('権限なし', async () => {
        const { d11 } = await setupUserNodes()

        let actual!: HttpException
        try {
          // 自ユーザー以外で検証
          await storageService.validateReadable(GeneralUserToken(), d11.path)
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })

    describe('IDトークン指定なし', () => {
      async function setupUserNodes() {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        const [users, userRoot, d1, d11] = await storageService.createHierarchicalDirs([`${userRootPath}/d1/d11`])
        return { users, userRoot, d1, d11 }
      }

      it('権限あり', async () => {
        const { d11 } = await setupUserNodes()

        // ノードを公開設定
        await storageService.setDirShareDetail(d11, { isPublic: true })

        // IDトークンなしで検証
        await storageService.validateReadable(undefined, d11.path)
      })

      it('権限なし', async () => {
        const { d11 } = await setupUserNodes()

        // ノードを非公開設定
        await storageService.setDirShareDetail(d11, { isPublic: false })

        let actual!: HttpException
        try {
          // IDトークンなしで検証
          await storageService.validateReadable(undefined, d11.path)
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })

    describe('hierarchicalNodesを指定した場合', () => {
      async function setupUserNodes() {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        const [users, userRoot, d1, d11, d111] = await storageService.createHierarchicalDirs([`${userRootPath}/d1/d11/d111`])
        return { users, userRoot, d1, d11, d111 }
      }

      it('ベーシックケース', async () => {
        const { d1, d111 } = await setupUserNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [GeneralUser().uid] })

        // ノードと階層を構成するノードを取得
        const hierarchicalNodes = await storageService.getHierarchicalNodes(d111.path)

        // hierarchicalNodesを指定して検証
        await storageService.validateReadableImpl(GeneralUserToken(), d111.path, hierarchicalNodes)
      })

      it('階層を構成するノードの一部が欠けている場合', async () => {
        const { d1, d11, d111 } = await setupUserNodes()

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareDetail(d1, { readUIds: [GeneralUser().uid] })

        // ノード階層の一部を欠けさせてノードを取得
        const hierarchicalNodes = await storageService.getHierarchicalNodes(d111.path)
        const index = hierarchicalNodes.findIndex(node => node.path === d11.path)
        hierarchicalNodes.splice(index, 1)

        let actual!: AppError
        try {
          // hierarchicalNodesを指定して検証
          await storageService.validateReadableImpl(GeneralUserToken(), d111.path, hierarchicalNodes)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`There is a missing node in the hierarchy.`)
        expect(actual.data).toEqual({
          hierarchicalNodes: hierarchicalNodes.map(node => node.path),
          missingNode: d11.path,
        })
      })
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
   * @param dir
   * @param startFileNumber
   * @param endFileNumber
   */
  async function createTestData(dir: string, startFileNumber: number, endFileNumber: number): Promise<void> {
    const start = performance.now()

    dir = removeBothEndsSlash(dir)

    // 現在存在するノードを全て削除
    await h.removeAllNodes()

    // ファイルを格納するディレクトリを作成
    await storageService.createHierarchicalDirs([dir])

    // ファイルを作成
    const uploadItems: StorageUploadDataItem[] = []
    for (let i = startFileNumber; i <= endFileNumber; i++) {
      uploadItems.push({
        data: `test${i}`,
        contentType: 'text/plain; charset=utf-8',
        path: `${dir}/${i.toString().padStart(6, '0')}.txt`,
      })
    }
    await storageService.uploadDataItems(uploadItems)

    const end = performance.now()
    console.log(`createTestData: ${(end - start) / 1000}s`)
  }

  /**
   * 指定されたディレクトリとその配下ノードの数を取得します。
   * @param dir
   */
  async function getFileCount(dir: string): Promise<number> {
    const client = newElasticClient()
    const response = await client.count({
      index: CoreStorageSchema.IndexAlias,
      body: {
        query: {
          bool: {
            must: [{ wildcard: { path: `${dir}/*` } }, { term: { nodeType: 'File' } }],
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
      await storageService.removeDir({ path: DirPath })
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
      await storageService.moveDir({ fromDir: FromDirPath, toDir: ToDirPath }, { maxChunk: 100 })
      const end = performance.now()
      console.log(`removeDir: ${(end - start) / 1000}s`)

      expect(await getFileCount(FromDirPath)).toBe(0)
      expect(await getFileCount(ToDirPath)).toBe(FileNum)
    })
  })
})
