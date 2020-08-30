import * as td from 'testdouble'
import {
  APP_ADMIN_USER,
  APP_ADMIN_USER_HEADER,
  GENERAL_USER_HEADER,
  STORAGE_USER,
  STORAGE_USER_HEADER,
  STORAGE_USER_TOKEN,
} from '../../../../helpers/common/data'
import { DevUtilsServiceDI, DevUtilsServiceModule, InputValidationError, StorageNode, StorageUploadDataItem, initLib } from '../../../../../src/lib'
import { StorageArticleNodeType, StorageService, StorageServiceDI, StoreServiceDI } from '../../../../../src/example/services'
import { Test, TestingModule } from '@nestjs/testing'
import { existsNodes, notExistsNodes, removeAllNodes } from '../../../../helpers/common/storage'
import { getGQLErrorStatus, requestGQL } from '../../../../helpers/common/gql'
import {
  newTestStorageDirNode,
  newTestStorageFileNode,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
} from '../../../../helpers/example/storage'
import { shuffleArray, sleep } from 'web-base-lib'
import GQLContainerModule from '../../../../../src/example/gql/gql.module'
import { Response } from 'supertest'
import StorageRESTModule from '../../../../../src/example/rest/storage'
import { config } from '../../../../../src/config'
import request = require('supertest')

jest.setTimeout(900000)
initLib()

//========================================================================
//
//  Test helpers
//
//========================================================================

let testingModule!: TestingModule
let storageService!: TestStorageService
let storeService!: StoreServiceDI.type
let devUtilsService!: DevUtilsServiceDI.type

type TestStorageService = StorageServiceDI.type & {
  m_toNodePaths: StorageServiceDI.type['m_toNodePaths']
  m_validateArticleBundleDescendant: StorageServiceDI.type['m_validateArticleBundleDescendant']
  m_validateArticleDescendant: StorageServiceDI.type['m_validateArticleDescendant']
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

describe('AppStorageService', () => {
  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [StorageRESTModule, GQLContainerModule],
    }).compile()

    storageService = testingModule.get<TestStorageService>(StorageServiceDI.symbol)
    storeService = testingModule.get<StoreServiceDI.type>(StoreServiceDI.symbol)

    await removeAllNodes(storeService)

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(1500)
  })

  describe('serveFile', () => {
    let app: any

    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER, STORAGE_USER)
    })

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    describe('ユーザーファイル', () => {
      it('ファイルは公開設定 -> 誰でもアクセス可能', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // ファイルを公開設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: true })

        // Authorizationヘッダーを設定しない
        return request(app.getHttpServer())
          .get(`/${fileNode.id}`)
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(fileData)
          })
      })

      it('ファイルは非公開設定 -> 自ユーザーはアクセス可能', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // ファイルを非公開設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: false })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 自ユーザーを設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは非公開設定 -> 他ユーザーはアクセス不可', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // ファイルを非公開設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: false })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 他ユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(403)
        )
      })

      it('ファイルは公開未設定 -> 自ユーザーはアクセス可能', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // ファイルを公開未設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: null })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 自ユーザーを設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは公開未設定 -> 他ユーザーはアクセス不可', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // ファイルを公開未設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: null })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 他ユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(403)
        )
      })

      it('ファイルに読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // ファイルに読み込み権限設定
        await storageService.setFileShareSettings(fileNode.path, { readUIds: [APP_ADMIN_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 読み込み権限に設定した他ユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは公開未設定 + 上位ディレクトリに公開設定 -> 他ユーザーもアクセス可能', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // 上位ディレクトリに公開設定
        await storageService.setDirShareSettings(`${userDirPath}/d1`, { isPublic: true })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 他ユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは非公開設定 + 上位ディレクトリに公開設定 -> 他ユーザーはアクセス不可', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // ファイルに非公開設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: false })
        // 上位ディレクトリに公開設定
        await storageService.setDirShareSettings(`${userDirPath}/d1`, { isPublic: true })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 他ユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(403)
        )
      })

      it('ファイルは公開未設定 + 上位ディレクトリに読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareSettings(`${userDirPath}/d1`, { readUIds: [APP_ADMIN_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 読み込み権限に設定した他ユーザーを設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルに読み込み権限設定 + 上位ディレクトリに読み込み権限設定 -> 他ユーザーもアクセス不可', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userDirPath}/d1/fileA.txt`,
          },
        ])

        // ファイルに読み込み権限設定
        await storageService.setFileShareSettings(fileNode.path, { readUIds: ['ichiro'] })
        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareSettings(`${userDirPath}/d1`, { readUIds: [APP_ADMIN_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 上位ディレクトリに設定した読み込み権限ではなく、
            // ファイルに設定した読み込み権限が適用されるため、アクセス不可
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(403)
        )
      })
    })

    describe('アプリケーションファイル', () => {
      it('ファイルは公開設定 -> 誰でもアクセス可能', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // ファイルを公開設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: true })

        // Authorizationヘッダーを設定しない
        return request(app.getHttpServer())
          .get(`/${fileNode.id}`)
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(fileData)
          })
      })

      it('ファイルは非公開設定 -> アプリケーション管理者はアクセス可能', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // ファイルを非公開設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: false })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // アプリケーション管理者を設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは非公開設定 -> アプリケーション管理者以外はアクセス不可', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // ファイルを非公開設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: false })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(403)
        )
      })

      it('ファイルは公開未設定 -> アプリケーション管理者はアクセス可能', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // ファイルを公開未設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: null })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // アプリケーション管理者を設定
            .set({ ...APP_ADMIN_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは公開未設定 -> アプリケーション管理者以外はアクセス不可', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // ファイルを公開未設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: null })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(403)
        )
      })

      it('ファイルに読み込み権限設定 -> アプリケーション管理者以外もアクセス可能', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // ファイルに読み込み権限設定
        await storageService.setFileShareSettings(fileNode.path, { readUIds: [STORAGE_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 読み込み権限に設定したアプリケーション管理者以外を設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは公開未設定 + 上位ディレクトリに公開設定 -> アプリケーション管理者以外もアクセス可能', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // 上位ディレクトリに公開設定
        await storageService.setDirShareSettings(`d1`, { isPublic: true })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは非公開設定 + 上位ディレクトリに公開設定 -> アプリケーション管理者以外はアクセス不可', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // ファイルに非公開設定
        await storageService.setFileShareSettings(fileNode.path, { isPublic: false })
        // 上位ディレクトリに公開設定
        await storageService.setDirShareSettings(`d1`, { isPublic: true })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // アプリケーション管理者以外を設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(403)
        )
      })

      it('ファイルは公開未設定 + 上位ディレクトリに読み込み権限設定 -> アプリケーション管理者以外もアクセス可能', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareSettings(`d1`, { readUIds: [STORAGE_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 読み込み権限に設定したアプリケーション管理者以外を設定
            .set({ ...STORAGE_USER_HEADER })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルに読み込み権限設定 + 上位ディレクトリに読み込み権限設定 -> 他ユーザーもアクセス不可', async () => {
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `d1/fileA.txt`,
          },
        ])

        // ファイルに読み込み権限設定
        await storageService.setFileShareSettings(fileNode.path, { readUIds: ['ichiro'] })
        // 上位ディレクトリに読み込み権限設定
        await storageService.setDirShareSettings(`d1`, { readUIds: [STORAGE_USER.uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 上位ディレクトリに設定した読み込み権限ではなく、
            // ファイルに設定した読み込み権限が適用されるため、アクセス不可
            .set({ ...STORAGE_USER_HEADER })
            .expect(403)
        )
      })
    })
  })

  describe('deleteUserDir', () => {
    it('ベーシックケース', async () => {
      const user1Dir = storageService.getUserRootPath({ uid: 'user1' })
      const user2Dir = storageService.getUserRootPath({ uid: 'user2' })
      const user3Dir = storageService.getUserRootPath({ uid: 'user3' })
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
      const user2Nodes = (await storageService.getDirDescendants(user2Dir)).list
      const otherNodes = [...(await storageService.getDirDescendants(user1Dir)).list, ...(await storageService.getDirDescendants(user3Dir)).list]

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user2')

      await notExistsNodes(user2Nodes, storageService)
      await existsNodes(otherNodes, storageService)
    })

    it('大量データの場合', async () => {
      const user1Dir = storageService.getUserRootPath({ uid: 'user1' })
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
      const user1Nodes = (await storageService.getDirDescendants(user1Dir)).list

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user1', 3)

      await notExistsNodes(user1Nodes, storageService)
    })
  })

  describe('createArticleDir', () => {
    describe('記事バンドル', () => {
      it('ベーシックケース', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])

        // テスト対象実行
        const actual = await storageService.createArticleDir(`${articleRootPath}/blog`, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })

        expect(actual.path).toBe(`${articleRootPath}/blog`)
        expect(actual.articleNodeType).toBe(StorageArticleNodeType.ListBundle)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()

        await existsNodes([actual], storageService)
      })

      it('記事バンドルをバケット直下に作成しようとした場合', async () => {
        // 記事バンドルのパスを作成
        const bundlePath = `blog`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleDir(`blog`, {
            articleNodeType: StorageArticleNodeType.ListBundle,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The article bundle must be created directly under the article root: '${bundlePath}'`)
      })

      it('記事バンドルを記事ディレクトリ直下ではなくさらに下の階層に作成しようとした場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルのパスを作成
        const bundlePath = `${articleRootPath}/aaa/blog`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleDir(bundlePath, {
            articleNodeType: StorageArticleNodeType.ListBundle,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The article bundle must be created directly under the article root: '${bundlePath}'`)
      })

      it('同名の記事バンドルが既に存在する場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })

        let actual!: InputValidationError
        try {
          // テスト対象実行
          // ※同名の記事バンドルの作成を試みる
          await storageService.createArticleDir(bundlePath, {
            articleNodeType: StorageArticleNodeType.ListBundle,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The specified directory already exists: '${bundlePath}'`)
      })

      it('記事バンドルの祖先が存在しない場合', async () => {
        // ユーザーディレクトリの作成
        const usersPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([usersPath])
        // 記事バンドルのパスを作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        const bundlePath = `${articleRootPath}/blog`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          // ※記事ルートが存在しない状態で記事バンドルの作成を試みる
          await storageService.createArticleDir(bundlePath, {
            articleNodeType: StorageArticleNodeType.ListBundle,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The ancestor directory of the specified directory does not exist.`)
        expect(actual.detail.values).toEqual({
          specifiedDirPath: bundlePath,
          ancestorDirPath: articleRootPath,
        })
      })
    })

    describe('記事カテゴリ', () => {
      it('ベーシックケース', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事カテゴリのパスを作成
        const cat1DirPath = `${bundlePath}/cat1`

        // テスト対象実行
        const actual = await storageService.createArticleDir(cat1DirPath, {
          articleNodeType: StorageArticleNodeType.CategoryDir,
        })

        expect(actual.path).toBe(cat1DirPath)
        expect(actual.articleNodeType).toBe(StorageArticleNodeType.CategoryDir)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()

        await existsNodes([actual], storageService)
      })

      it('記事カテゴリをバケット直下に作成しようとした場合', async () => {
        // 記事カテゴリのパスを作成
        const cat1DirPath = `cat1`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleDir(cat1DirPath, {
            articleNodeType: StorageArticleNodeType.CategoryDir,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The specified path is not under article bundle: '${cat1DirPath}'`)
      })

      it('記事カテゴリを記事バンドル配下以外に作成しようとした場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルをただのディレクトリとして作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createHierarchicalDirs([bundlePath])
        // 記事カテゴリのパスを作成
        const cat1DirPath = `${bundlePath}/cat1`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleDir(cat1DirPath, {
            articleNodeType: StorageArticleNodeType.CategoryDir,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The specified path is not under article bundle: '${cat1DirPath}'`)
      })

      it('同名の記事カテゴリが既に存在する場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事カテゴリを作成
        const cat1DirPath = `${bundlePath}/cat1`
        await storageService.createArticleDir(cat1DirPath, {
          articleNodeType: StorageArticleNodeType.CategoryDir,
        })

        let actual!: InputValidationError
        try {
          // テスト対象実行
          // ※同名の記事カテゴリの作成を試みる
          await storageService.createArticleDir(cat1DirPath, {
            articleNodeType: StorageArticleNodeType.CategoryDir,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The specified directory already exists: '${cat1DirPath}'`)
      })

      it('記事カテゴリの祖先が存在しない場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事カテゴリのパスを作成
        const cat1DirPath = `${bundlePath}/dummy/cat1`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          // ※記事カテゴリの上位ディレクトリが存在しない状態で記事カテゴリの作成を試みる
          await storageService.createArticleDir(cat1DirPath, {
            articleNodeType: StorageArticleNodeType.CategoryDir,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The ancestor directory of the specified directory does not exist.`)
        expect(actual.detail.values).toEqual({
          specifiedDirPath: cat1DirPath,
          ancestorDirPath: `${bundlePath}/dummy`,
        })
      })
    })

    describe('記事', () => {
      it('ベーシックケース', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事のパスを作成
        const art1Path = `${bundlePath}/art1`

        // テスト対象実行
        const actual = await storageService.createArticleDir(art1Path, {
          articleNodeType: StorageArticleNodeType.ArticleDir,
        })

        expect(actual.path).toBe(art1Path)
        expect(actual.articleNodeType).toBe(StorageArticleNodeType.ArticleDir)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()

        const art1FilePath = `${art1Path}/${config.storage.article.fileName}`
        const art1FileNode = await storageService.sgetNodeByPath(art1FilePath)
        expect(art1FileNode.path).toBe(art1FilePath)
        expect(art1FileNode.contentType).toBe('text/markdown')
      })

      it('記事カテゴリ配下に記事を作成する場合', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事カテゴリを作成
        const cat1DirPath = `${bundlePath}/cat1`
        await storageService.createArticleDir(cat1DirPath, {
          articleNodeType: StorageArticleNodeType.CategoryDir,
        })
        // 記事カテゴリの配下に'art1'を設定
        const art1Path = `${cat1DirPath}/art1`

        // テスト対象実行
        const actual = await storageService.createArticleDir(art1Path, {
          articleNodeType: StorageArticleNodeType.ArticleDir,
        })

        expect(actual.path).toBe(art1Path)
        expect(actual.articleNodeType).toBe(StorageArticleNodeType.ArticleDir)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()

        const art1FilePath = `${art1Path}/${config.storage.article.fileName}`
        const art1FileNode = await storageService.sgetNodeByPath(art1FilePath)
        expect(art1FileNode.path).toBe(art1FilePath)
        expect(art1FileNode.contentType).toBe('text/markdown')
      })

      it('記事を記事バンドル配下以外に作成しようとした場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルをただのディレクトリとして作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createHierarchicalDirs([bundlePath])
        // 記事のパスを作成
        const art1Path = `${bundlePath}/art1`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleDir(art1Path, {
            articleNodeType: StorageArticleNodeType.ArticleDir,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The specified path is not under article bundle: '${art1Path}'`)
      })

      it('同名の記事が既に存在する場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事を作成
        const art1Path = `${bundlePath}/art1`
        await storageService.createArticleDir(art1Path, {
          articleNodeType: StorageArticleNodeType.ArticleDir,
        })

        let actual!: InputValidationError
        try {
          // テスト対象実行
          // ※同名の記事の作成を試みる
          await storageService.createArticleDir(art1Path, {
            articleNodeType: StorageArticleNodeType.ArticleDir,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The specified directory already exists: '${art1Path}'`)
      })

      it('記事の祖先が存在しない場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事のパスを作成
        const art1Path = `${bundlePath}/dummy/art1`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          // ※記事カテゴリの上位ディレクトリが存在しない状態で記事の作成を試みる
          await storageService.createArticleDir(art1Path, {
            articleNodeType: StorageArticleNodeType.ArticleDir,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The ancestor directory of the specified directory does not exist.`)
        expect(actual.detail.values).toEqual({
          specifiedDirPath: art1Path,
          ancestorDirPath: `${bundlePath}/dummy`,
        })
      })

      it('記事の祖先に記事が存在する場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // 記事バンドルを作成
        const bundlePath = `${articleRootPath}/blog`
        await storageService.createArticleDir(bundlePath, {
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事を作成
        const art1Path = `${bundlePath}/art1`
        await storageService.createArticleDir(art1Path, {
          articleNodeType: StorageArticleNodeType.ArticleDir,
        })
        // 作成した記事の下にさらに記事を作成するよう準備
        const art11Path = `${bundlePath}/art1/art11`

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleDir(art11Path, {
            articleNodeType: StorageArticleNodeType.ArticleDir,
          })
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The article cannot be created under article.`)
        expect(actual.detail.values).toEqual({
          specifiedDirPath: art11Path,
          ancestorDirPath: art1Path,
        })
      })
    })
  })

  describe('setArticleSortOrder', () => {
    it('ベーシックケース - insertBeforeNodePath', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // 記事バンドルを作成
      const bundlePath = `${articleRootPath}/blog`
      await storageService.createArticleDir(bundlePath, {
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1Dir = await storageService.createArticleDir(`${bundlePath}/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      const art2Dir = await storageService.createArticleDir(`${bundlePath}/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      const art3Dir = await storageService.createArticleDir(`${bundlePath}/art3`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(art1Dir.path, { insertBeforeNodePath: art3Dir.path })

      const docNodes = await storageService.getNodesByPaths([art1Dir.path, art2Dir.path, art3Dir.path])
      StorageService.sortArticleNodes(docNodes)
      expect(docNodes.map(node => node.path)).toEqual([art1Dir.path, art3Dir.path, art2Dir.path])
    })

    it('ベーシックケース - insertAfterNodePath', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // 記事バンドルを作成
      const bundlePath = `${articleRootPath}/blog`
      await storageService.createArticleDir(bundlePath, {
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1Dir = await storageService.createArticleDir(`${bundlePath}/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      const art2Dir = await storageService.createArticleDir(`${bundlePath}/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      const art3Dir = await storageService.createArticleDir(`${bundlePath}/art3`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(art1Dir.path, { insertAfterNodePath: art3Dir.path })

      const docNodes = await storageService.getNodesByPaths([art1Dir.path, art2Dir.path, art3Dir.path])
      StorageService.sortArticleNodes(docNodes)
      expect(docNodes.map(node => node.path)).toEqual([art3Dir.path, art1Dir.path, art2Dir.path])
    })

    it('前後の挿入位置指定を両方ともしなかった場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // 記事バンドルを作成
      const bundlePath = `${articleRootPath}/blog`
      await storageService.createArticleDir(bundlePath, {
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1Dir = await storageService.createArticleDir(`${bundlePath}/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      const art2Dir = await storageService.createArticleDir(`${bundlePath}/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(art1Dir.path, {})
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`Both 'insertBeforeNodePath' and 'insertAfterNodePath' are not specified.`)
    })

    it('ターゲットノードと指定された前後のノードが兄弟でない場合 - insertBeforeNodePath', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // 記事バンドルを作成
      const bundlePath = `${articleRootPath}/category`
      await storageService.createArticleDir(bundlePath, {
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1Dir = await storageService.createArticleDir(`${bundlePath}/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      // 'art2'は'art1'とは兄弟ノードでないものとして設定する
      await storageService.createArticleDir(`${bundlePath}/dummy`, {
        articleNodeType: StorageArticleNodeType.CategoryDir,
      })
      const art2Dir = await storageService.createArticleDir(`${bundlePath}/dummy/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(art1Dir.path, { insertBeforeNodePath: art2Dir.path })
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The two nodes are not siblings.`)
      expect(actual.detail.values).toEqual({
        nodePath: art1Dir.path,
        insertBeforeNodePath: art2Dir.path,
      })
    })

    it('m_validateArticleBundleDescendant()の呼び出しを検証 - insertBeforeNodePath', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // 記事バンドルを作成
      const bundlePath = `${articleRootPath}/blog`
      await storageService.createArticleDir(bundlePath, {
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1Dir = await storageService.createArticleDir(`${bundlePath}/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      const art2Dir = await storageService.createArticleDir(`${bundlePath}/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })

      // モック設定
      const m_validateArticleBundleDescendant = td.replace(storageService, 'm_validateArticleBundleDescendant')

      // テスト対象実行
      await storageService.setArticleSortOrder(art1Dir.path, { insertBeforeNodePath: art2Dir.path })

      const explanation = td.explain(m_validateArticleBundleDescendant)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(art1Dir.path)
      expect(explanation.calls[1].args[0]).toBe(art2Dir.path)
    })

    it('m_validateArticleBundleDescendant()の呼び出しを検証 - insertAfterNodePath', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // 記事バンドルを作成
      const bundlePath = `${articleRootPath}/blog`
      await storageService.createArticleDir(bundlePath, {
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1Dir = await storageService.createArticleDir(`${bundlePath}/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      const art2Dir = await storageService.createArticleDir(`${bundlePath}/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })

      // モック設定
      const m_validateArticleBundleDescendant = td.replace(storageService, 'm_validateArticleBundleDescendant')

      // テスト対象実行
      await storageService.setArticleSortOrder(art1Dir.path, { insertAfterNodePath: art2Dir.path })

      const explanation = td.explain(m_validateArticleBundleDescendant)
      expect(explanation.calls.length).toBe(2)
      expect(explanation.calls[0].args[0]).toBe(art1Dir.path)
      expect(explanation.calls[1].args[0]).toBe(art2Dir.path)
    })
  })

  describe('getArticleChildren', () => {
    let articleRootPath: string
    let bundlePath: string
    let cat1DirPath: string
    let cat2DirPath: string
    let art1DirPath: string
    let fileAPath: string

    beforeEach(async () => {
      // 記事ルートの作成
      articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // 記事バンドルの作成
      bundlePath = `${articleRootPath}/category`
      await storageService.createArticleDir(bundlePath, {
        articleNodeType: StorageArticleNodeType.CategoryBundle,
      })
      // カテゴリの作成
      cat1DirPath = `${bundlePath}/cat1`
      await storageService.createArticleDir(cat1DirPath, {
        articleNodeType: StorageArticleNodeType.CategoryDir,
      })
      cat2DirPath = `${bundlePath}/cat2`
      await storageService.createArticleDir(cat2DirPath, {
        articleNodeType: StorageArticleNodeType.CategoryDir,
      })
      art1DirPath = `${cat2DirPath}/art1`
      await storageService.createArticleDir(art1DirPath, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
      })
      fileAPath = `${art1DirPath}/fileA.txt`
      await storageService.uploadDataItems([
        {
          data: 'testA',
          contentType: 'text/plain; charset=utf-8',
          path: fileAPath,
        },
      ])
    })

    it('ベーシックケース', async () => {
      const actual = await storageService.getArticleChildren(`${bundlePath}`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(2)
      expect(actual.list[0].path).toBe(`${cat2DirPath}`)
      expect(actual.list[1].path).toBe(`${cat1DirPath}`)
      await existsNodes(actual.list, storageService)
    })

    it('dirPathに存在しないノードを指定した場合', async () => {
      // dirPathに存在しないノードを指定
      const actual = await storageService.getArticleChildren(`${bundlePath}/cat999`)

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      for (let i = 1; i <= 10; i++) {
        const artDirPath = `${cat1DirPath}/art${i.toString().padStart(2, '0')}`
        await storageService.createArticleDir(artDirPath, {
          articleNodeType: StorageArticleNodeType.ArticleDir,
        })
      }

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getArticleChildren(`${cat1DirPath}`, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getArticleChildren(`${cat1DirPath}`, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      expect(actual.length).toBe(10)
      expect(actual[0].path).toBe(`${cat1DirPath}/art10`)
      expect(actual[1].path).toBe(`${cat1DirPath}/art09`)
      expect(actual[2].path).toBe(`${cat1DirPath}/art08`)
      expect(actual[3].path).toBe(`${cat1DirPath}/art07`)
      expect(actual[4].path).toBe(`${cat1DirPath}/art06`)
      expect(actual[5].path).toBe(`${cat1DirPath}/art05`)
      expect(actual[6].path).toBe(`${cat1DirPath}/art04`)
      expect(actual[7].path).toBe(`${cat1DirPath}/art03`)
      expect(actual[8].path).toBe(`${cat1DirPath}/art02`)
      expect(actual[9].path).toBe(`${cat1DirPath}/art01`)
      await existsNodes(actual, storageService)
    })

    it('m_validateArticleDescendant()の呼び出しを検証', async () => {
      // モック設定
      const m_validateArticleDescendant = td.replace(storageService, 'm_validateArticleDescendant')

      // テスト対象実行
      await storageService.getArticleChildren(`${bundlePath}`)

      const explanation = td.explain(m_validateArticleDescendant)
      expect(explanation.calls.length).toBe(1)
      expect(explanation.calls[0].args[0]).toBe(bundlePath)
    })
  })

  describe('m_validateArticleBundleDescendant', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // 記事バンドルを作成
      const bundlePath = `${articleRootPath}/blog`
      await storageService.createArticleDir(bundlePath, {
        articleNodeType: StorageArticleNodeType.ListBundle,
      })
      // 引数ノードに記事バンドル配下のディレクトリを指定
      const art1Dir = `${bundlePath}/art1`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleBundleDescendant(art1Dir)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('引数ノードが記事配下でない場合①', async () => {
      const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      // 引数ノードにユーザーディレクトリ直下のディレクトリを指定
      const art1Dir = `${userDirPath}/art1`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleBundleDescendant(art1Dir)
      } catch (err) {
        actual = err
      }

      // 引数ノードが記事配下でないためエラーが発生
      expect(actual.detail.message).toBe(`The specified path is not under article bundle: '${art1Dir}'`)
    })

    it('引数ノードが記事配下でない場合②', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/category`
      // 'category'をただのディレクトリとして作成
      await storageService.createHierarchicalDirs([bundlePath])
      // 'category'を記事バンドルと想定しているが実際はだたのディレクトリだった場合
      const art1Dir = `${bundlePath}/art1`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleBundleDescendant(art1Dir)
      } catch (err) {
        actual = err
      }

      // 引数ノードが記事配下でないためエラーが発生
      expect(actual.detail.message).toBe(`The specified path is not under article bundle: '${art1Dir}'`)
    })
  })

  describe('m_validateArticleDescendant', () => {
    it('ベーシックケース - 記事ルート直下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      // 記事バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleDescendant(bundlePath)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('ベーシックケース - 記事バンドル配下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      // 記事バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`
      // 記事のパスを作成
      const art1Dir = `${bundlePath}/art1`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleDescendant(art1Dir)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('引数ノードが記事ルート配下でない場合', async () => {
      const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      // 記事バンドルを記事ルート以外に指定
      const bundlePath = `${userDirPath}/blog`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleDescendant(bundlePath)
      } catch (err) {
        actual = err
      }

      // 記事バンドルを記事ルートでないためエラーが発生
      expect(actual.detail.message).toBe(`The specified path is not under article root: '${bundlePath}'`)
    })
  })

  describe('sortArticleNodes', () => {
    it('パターン①', async () => {
      // root
      // ├blog
      // │├art1
      // ││└index.md
      // │└art2
      // │  └index.md
      // └category
      //   ├art1
      //   ├art2
      //   ├TypeScript
      //   │├art1
      //   ││└index.md
      //   │└art2
      //   │  └index.md
      //   └JavaScript
      //     ├art1
      //     │︙
      //     └art2
      //       ︙
      const blog = newTestStorageDirNode(`blog`, {
        articleNodeType: StorageArticleNodeType.ListBundle,
        articleSortOrder: 9,
      })
      const blog_art1 = newTestStorageDirNode(`blog/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 99,
      })
      const blog_art1_index = newTestStorageFileNode(`blog/art1/index.md`)
      const blog_art2 = newTestStorageDirNode(`blog/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 98,
      })
      const blog_art2_index = newTestStorageFileNode(`blog/art2/index.md`)
      const category = newTestStorageDirNode(`category`, {
        articleNodeType: StorageArticleNodeType.CategoryBundle,
        articleSortOrder: 8,
      })
      const category_art1 = newTestStorageDirNode(`category/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 99,
      })
      const category_art2 = newTestStorageDirNode(`category/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 98,
      })
      const category_ts = newTestStorageDirNode(`category/TypeScript`, {
        articleSortOrder: 97,
      })
      const category_ts_art1 = newTestStorageDirNode(`category/TypeScript/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 999,
      })
      const category_ts_art1_index = newTestStorageFileNode(`category/TypeScript/art1/index.md`)
      const category_ts_art2 = newTestStorageDirNode(`category/TypeScript/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 998,
      })
      const category_ts_art2_index = newTestStorageFileNode(`category/TypeScript/art2/index.md`)
      const category_js = newTestStorageDirNode(`category/JavaScript`)
      const category_js_art1 = newTestStorageDirNode(`category/JavaScript/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 999,
      })
      const category_js_art2 = newTestStorageDirNode(`category/JavaScript/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 998,
      })

      const nodes = shuffleArray([
        blog,
        blog_art1,
        blog_art1_index,
        blog_art2,
        blog_art2_index,
        category,
        category_art1,
        category_art2,
        category_ts,
        category_ts_art1,
        category_ts_art1_index,
        category_ts_art2,
        category_ts_art2_index,
        category_js,
        category_js_art1,
        category_js_art2,
      ])

      // テスト対象実行
      StorageService.sortArticleNodes(nodes)

      expect(nodes[0]).toBe(blog)
      expect(nodes[1]).toBe(blog_art1)
      expect(nodes[2]).toBe(blog_art1_index)
      expect(nodes[3]).toBe(blog_art2)
      expect(nodes[4]).toBe(blog_art2_index)
      expect(nodes[5]).toBe(category)
      expect(nodes[6]).toBe(category_art1)
      expect(nodes[7]).toBe(category_art2)
      expect(nodes[8]).toBe(category_ts)
      expect(nodes[9]).toBe(category_ts_art1)
      expect(nodes[10]).toBe(category_ts_art1_index)
      expect(nodes[11]).toBe(category_ts_art2)
      expect(nodes[12]).toBe(category_ts_art2_index)
      expect(nodes[13]).toBe(category_js)
      expect(nodes[14]).toBe(category_js_art1)
      expect(nodes[15]).toBe(category_js_art2)
    })

    it('パターン②', async () => {
      // ......
      //   ├art1
      //   ├art2
      //   ├TypeScript
      //   │├art1
      //   │└art2
      //   └JavaScript
      //     ├art1
      //     └art2
      const category_art1 = newTestStorageDirNode(`category/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 99,
      })
      const category_art2 = newTestStorageDirNode(`category/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 98,
      })
      const category_ts = newTestStorageDirNode(`category/TypeScript`, {
        articleSortOrder: 97,
      })
      const category_ts_art1 = newTestStorageDirNode(`category/TypeScript/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 999,
      })
      const category_ts_art2 = newTestStorageDirNode(`category/TypeScript/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 998,
      })
      const category_js = newTestStorageDirNode(`category/JavaScript`, {
        articleSortOrder: 96,
      })
      const category_js_art1 = newTestStorageDirNode(`category/JavaScript/art1`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 999,
      })
      const category_js_art2 = newTestStorageDirNode(`category/JavaScript/art2`, {
        articleNodeType: StorageArticleNodeType.ArticleDir,
        articleSortOrder: 998,
      })

      // 実際は上位ディレクトリ(category)は存在するが、配列には追加されないパターン
      const nodes = shuffleArray([
        category_art1,
        category_art2,
        category_ts,
        category_ts_art1,
        category_ts_art2,
        category_js,
        category_js_art1,
        category_js_art2,
      ])

      // テスト対象実行
      StorageService.sortArticleNodes(nodes)

      expect(nodes[0]).toBe(category_art1)
      expect(nodes[1]).toBe(category_art2)
      expect(nodes[2]).toBe(category_ts)
      expect(nodes[3]).toBe(category_ts_art1)
      expect(nodes[4]).toBe(category_ts_art2)
      expect(nodes[5]).toBe(category_js)
      expect(nodes[6]).toBe(category_js_art1)
      expect(nodes[7]).toBe(category_js_art2)
    })
  })

  describe('validateAccessible', () => {
    let app: any

    beforeAll(async () => {
      await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER, STORAGE_USER)
    })

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    const gqlGetStorageNode = {
      query: `
        query GetStorageNode($input: StorageNodeKeyInput!) {
          storageNode(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    const gqlGetStorageDirChildren = {
      query: `
        query GetStorageDirChildren($dirPath: String, $input: StoragePaginationInput) {
          storageDirChildren(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    describe('アプリケーションファイル', () => {
      it('アプリケーション管理者でアクセス', async () => {
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            // バケット直下にファイルを配置
            path: `fileA.txt`,
          },
        ])

        const response = await requestGQL(
          app,
          {
            ...gqlGetStorageNode,
            variables: { input: { path: fileNode.path } },
          },
          {
            // アプリケーション管理者でアクセス
            headers: APP_ADMIN_USER_HEADER,
          }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(fileNode))
      })

      it('アプリケーション管理者以外でアクセス', async () => {
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            // バケット直下にファイルを配置
            path: `fileA.txt`,
          },
        ])

        const response = await requestGQL(
          app,
          {
            ...gqlGetStorageNode,
            variables: { input: { path: fileNode.path } },
          },
          {
            // アプリケーション管理者以外でアクセス
            headers: STORAGE_USER_HEADER,
          }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('バケット直下へアクセス', async () => {
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            // バケット直下にファイルを配置
            path: `fileA.txt`,
          },
        ])

        const response = await requestGQL(
          app,
          {
            ...gqlGetStorageDirChildren,
          },
          {
            // アプリケーション管理者でアクセス
            headers: APP_ADMIN_USER_HEADER,
          }
        )

        expect(response.body.data.storageDirChildren.list).toEqual(toGQLResponseStorageNodes([fileNode]))
      })
    })

    describe('ユーザーファイル', () => {
      it('自ユーザーのファイルにアクセス', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            // ユーザーディレクトリにファイルを配置
            path: `${userDirPath}/fileA.txt`,
          },
        ])

        const response = await requestGQL(
          app,
          {
            ...gqlGetStorageNode,
            variables: { input: { path: fileNode.path } },
          },
          {
            // 自ユーザーでアクセス
            headers: STORAGE_USER_HEADER,
          }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(fileNode))
      })

      it('自ユーザーのルートディレクトリにアクセス', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const [, userDirNode] = await storageService.createHierarchicalDirs([`${userDirPath}`])

        const response = await requestGQL(
          app,
          {
            ...gqlGetStorageNode,
            variables: { input: { path: `${userDirPath}` } },
          },
          {
            // 自ユーザーでアクセス
            headers: STORAGE_USER_HEADER,
          }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(userDirNode))
      })

      it('アプリケーション管理者でアクセス', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            // ユーザーディレクトリにファイルを配置
            path: `${userDirPath}/fileA.txt`,
          },
        ])

        const response = await requestGQL(
          app,
          {
            ...gqlGetStorageNode,
            variables: { input: { path: fileNode.path } },
          },
          {
            // 自ユーザーでアクセス
            headers: APP_ADMIN_USER_HEADER,
          }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(fileNode))
      })

      it('自ユーザー以外でアクセス', async () => {
        const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: 'test',
            contentType: 'text/plain; charset=utf-8',
            // ユーザーディレクトリにファイルを配置
            path: `${userDirPath}/fileA.txt`,
          },
        ])

        const response = await requestGQL(
          app,
          {
            ...gqlGetStorageNode,
            variables: { input: { path: fileNode.path } },
          },
          {
            // 自ユーザー以外でアクセス
            headers: GENERAL_USER_HEADER,
          }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })
  })

  describe('m_toNodePaths', () => {
    it('ベーシックケース', async () => {
      const [dir1, dir2, dir3, dir4] = await storageService.createHierarchicalDirs(['dir1', 'dir2', 'dir3', 'dir4', 'dir5'])
      const [file1, file2, file3, file4, file5, file6, file7, file8] = await storageService.uploadDataItems([
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file1.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file2.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file3.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file4.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file5.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file6.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file7.txt` },
        { data: 'test', contentType: 'text/plain; charset=utf-8', path: `file8.txt` },
      ])

      const actual = await storageService.m_toNodePaths({
        nodeId: file1.id,
        nodeIds: [file2.id],
        fileId: file3.id,
        fileIds: [file4.id],
        dirId: dir1.id,
        dirIds: [dir2.id],
        nodePath: file5.path,
        nodePaths: [file6.path],
        filePath: file7.path,
        filePaths: [file8.path],
        dirPath: dir3.path,
        dirPaths: [dir4.path],
      })
      actual.sort()

      const expected = [
        'dir1',
        'dir2',
        'dir3',
        'dir4',
        'file1.txt',
        'file2.txt',
        'file3.txt',
        'file4.txt',
        'file5.txt',
        'file6.txt',
        'file7.txt',
        'file8.txt',
      ]
      expect(actual).toEqual(expected)
    })

    it('空文字またはundefinedを指定した場合', async () => {
      const actual = await storageService.m_toNodePaths({
        nodeId: '',
        nodeIds: [''],
        fileId: undefined,
        fileIds: [''],
        dirId: '',
        dirIds: [''],
        nodePath: '',
        nodePaths: [''],
        filePath: undefined,
        filePaths: [''],
        dirPath: '',
        dirPaths: [''],
      })

      expect(actual.length).toBe(0)
    })

    it('何も指定しなかった場合', async () => {
      const actual = await storageService.m_toNodePaths({})

      expect(actual.length).toBe(0)
    })
  })
})
