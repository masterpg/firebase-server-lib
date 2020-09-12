import {
  APP_ADMIN_USER,
  APP_ADMIN_USER_HEADER,
  GENERAL_USER_HEADER,
  STORAGE_USER,
  STORAGE_USER_HEADER,
  STORAGE_USER_TOKEN,
} from '../../../../helpers/common/data'
import {
  CreateArticleTypeDirInput,
  StorageArticleNodeType,
  StorageNode,
  StorageService,
  StorageServiceDI,
  StoreServiceDI,
} from '../../../../../src/example/services'
import {
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  InputValidationError,
  StorageNodeShareSettings,
  StorageUploadDataItem,
  initLib,
} from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { existsNodes, notExistsNodes, removeAllNodes, verifyMoveNodes } from '../../../../helpers/common/storage'
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
  m_validateArticleRootDescendant: StorageServiceDI.type['m_validateArticleRootDescendant']
  m_getBelongToArticleBundle: StorageServiceDI.type['m_getBelongToArticleBundle']
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}/d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
        await storageService.createHierarchicalDirs([`d1`])
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
      const user2Nodes = (await storageService.getDirDescendants(user2Dir)).list
      const otherNodes = [...(await storageService.getDirDescendants(user1Dir)).list, ...(await storageService.getDirDescendants(user3Dir)).list]

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user2')

      await notExistsNodes(user2Nodes, storageService)
      await existsNodes(otherNodes, storageService)
    })

    it('大量データの場合', async () => {
      const user1Dir = storageService.getUserRootPath({ uid: 'user1' })
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
      const user1Nodes = (await storageService.getDirDescendants(user1Dir)).list

      // ユーザーディレクトリを削除
      await storageService.deleteUserDir('user1', 3)

      await notExistsNodes(user1Nodes, storageService)
    })
  })

  describe('createArticleTypeDir', () => {
    describe('バンドル作成', () => {
      it('ベーシックケース', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])

        // テスト対象実行
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        }
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()
        await existsNodes([actual], storageService)
      })

      it('同じ記事ノード名のバンドルを作成', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        }
        await storageService.createArticleTypeDir(input)

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()
        await existsNodes([actual], storageService)
      })

      it('バンドルをバケット直下に作成しようとした場合', async () => {
        const input: CreateArticleTypeDirInput = {
          dir: ``,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        // バケット直下が指定されたことで親パスが空文字となり、空文字でノード検索が行われるためエラーとなる
        expect(actual).toBeInstanceOf(Error)
      })

      it('バンドルを記事ルート直下ではなくさらに下の階層に作成しようとした場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドル作成の引数
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}/aaa`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The article bundle must be created directly under the article root.`)
        expect(actual.detail.values).toEqual({ input })
      })

      it('バンドルの祖先が存在しない場合', async () => {
        // ユーザーディレクトリの作成
        const usersPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([usersPath])
        // バンドル作成の引数
        // ※記事ルートが存在しない状態でバンドル作成を試みる
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The ancestor of the specified path does not exist.`)
        expect(actual.detail.values!.specifiedPath).toMatch(new RegExp(`${articleRootPath}/[^/]+$`))
        expect(actual.detail.values!.ancestorPath).toBe(articleRootPath)
      })
    })

    describe('カテゴリ作成', () => {
      it('ベーシックケース - カテゴリバンドル直下に作成', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.CategoryBundle,
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()
        await existsNodes([actual], storageService)
      })

      it('ベーシックケース - カテゴリ直下に作成', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.CategoryBundle,
        })
        // カテゴリ1を作成
        const cat1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        })
        // カテゴリ11作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${cat1.path}`,
          articleNodeName: 'カテゴリ11',
          articleNodeType: StorageArticleNodeType.Category,
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()
        await existsNodes([actual], storageService)
      })

      it('同じ記事ノード名のカテゴリを作成', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.CategoryBundle,
        })
        // カテゴリを作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        }
        const cat1 = await storageService.createArticleTypeDir(input)

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()
        await existsNodes([actual], storageService)
      })

      it('バケット直下にカテゴリを作成しようとした場合', async () => {
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: ``,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        // バケット直下が指定されたことで親パスが空文字となり、空文字でノード検索が行われるためエラーとなる
        expect(actual).toBeInstanceOf(Error)
      })

      it('ユーザールート直下にカテゴリを作成しようとした場合', async () => {
        // ユーザールートの作成
        const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([userRootPath])
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${userRootPath}`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Categories cannot be created under the specified parent.`)
        expect(actual.detail.values).toEqual({
          parentNode: { path: input.dir, articleNodeType: undefined },
        })
      })

      it('リストバンドル直下にカテゴリを作成しようとした作成', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // リストバンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Categories cannot be created under the specified parent.`)
        expect(actual.detail.values).toEqual({
          parentNode: { path: bundle.path, articleNodeType: bundle.articleNodeType },
        })
      })

      it('記事配下にカテゴリを作成しようとした作成', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: '',
          articleNodeType: StorageArticleNodeType.CategoryBundle,
        })
        // 記事1の作成
        const art1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${art1.path}`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Categories cannot be created under the specified parent.`)
        expect(actual.detail.values).toEqual({
          parentNode: { path: art1.path, articleNodeType: art1.articleNodeType },
        })
      })

      it('アセットディレクトリにカテゴリを作成しようとした作成', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // アセットディレクトリの作成
        const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${assets.path}`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Categories cannot be created under the specified parent.`)
        expect(actual.detail.values).toEqual({
          parentNode: { path: assets.path, articleNodeType: assets.articleNodeType },
        })
      })

      it('カテゴリの祖先が存在しない場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // カテゴリ1作成の引数を作成
        // ※カテゴリの上位ディレクトリが存在しない状態でカテゴリの作成を試みる
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}/dummy`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`There is no parent directory for the category to be created.`)
        expect(actual.detail.values).toEqual({
          parentPath: `${bundle.path}/dummy`,
        })
      })
    })

    describe('記事作成', () => {
      it('ベーシックケース - バンドル直下に作成', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()
        await existsNodes([actual], storageService)

        const art1FilePath = `${actual.path}/${config.storage.article.fileName}`
        const art1FileNode = await storageService.sgetNodeByPath(art1FilePath)
        expect(art1FileNode.path).toBe(art1FilePath)
        expect(art1FileNode.contentType).toBe('text/markdown')
      })

      it('ベーシックケース - カテゴリ直下に記事を作成', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.CategoryBundle,
        })
        // カテゴリ1を作成
        const cat1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          articleNodeName: 'カテゴリ1',
          articleNodeType: StorageArticleNodeType.Category,
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${cat1.path}`,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()
        await existsNodes([actual], storageService)

        const art1FilePath = `${actual.path}/${config.storage.article.fileName}`
        const art1FileNode = await storageService.sgetNodeByPath(art1FilePath)
        expect(art1FileNode.path).toBe(art1FilePath)
        expect(art1FileNode.contentType).toBe('text/markdown')
      })

      it('同じ記事ノード名の記事を作成', async () => {
        const baseSortOrder = StorageService.generateArticleSortOrder()

        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        }
        const art1 = await storageService.createArticleTypeDir(input)

        // テスト対象実行
        // ※同名の記事の作成を試みる
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder! >= baseSortOrder).toBeTruthy()
        await existsNodes([actual], storageService)

        const art1FilePath = `${actual.path}/${config.storage.article.fileName}`
        const art1FileNode = await storageService.sgetNodeByPath(art1FilePath)
        expect(art1FileNode.path).toBe(art1FilePath)
        expect(art1FileNode.contentType).toBe('text/markdown')
      })

      it('バケット直下に記事を作成しようとした場合', async () => {
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: ``,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        // バケット直下が指定されたことで親パスが空文字となり、空文字でノード検索が行われるためエラーとなる
        expect(actual).toBeInstanceOf(Error)
      })

      it('ユーザールート直下に記事を作成しようとした場合', async () => {
        // ユーザールートの作成
        const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([userRootPath])
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${userRootPath}`,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Articles cannot be created under the specified parent.`)
        expect(actual.detail.values).toEqual({
          parentNode: { path: userRootPath, articleNodeType: undefined },
        })
      })

      it('記事の祖先が存在しない場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事1作成の引数を作成
        // ※カテゴリの上位ディレクトリが存在しない状態で記事の作成を試みる
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}/dummy`,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`There is no parent directory for the article to be created.`)
        expect(actual.detail.values).toEqual({
          parentPath: `${input.dir}`,
        })
      })

      it('記事の祖先に記事が存在する場合', async () => {
        // 記事ルートの作成
        const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // 記事1を作成
        const art1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        })
        // 記事11作成の引数を作成
        // ※作成した記事の下にさらに記事を作成するよう準備
        const input: CreateArticleTypeDirInput = {
          dir: `${art1.path}`,
          articleNodeName: '記事11',
          articleNodeType: StorageArticleNodeType.Article,
        }

        let actual!: InputValidationError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Articles cannot be created under the specified parent.`)
        expect(actual.detail.values).toEqual({
          parentNode: { path: art1.path, articleNodeType: art1.articleNodeType },
        })
      })
    })
  })

  describe('createArticleGeneralDir', () => {
    it('ベーシックケース - アセットディレクトリの作成', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])

      // アセットディレクトリの作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const actual = await storageService.createArticleGeneralDir(assetsPath)

      expect(actual.path).toBe(assetsPath)
      expect(actual.articleNodeType).toBeUndefined()
      expect(actual.articleSortOrder).toBeUndefined()
      await existsNodes([actual], storageService)
    })

    it('ベーシックケース - アセットディレクトリ配下にディレクトリを作成', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)

      // アセットディレクトリ配下にディレクトリを作成
      const d1Path = `${assets.path}/d1`
      const actual = await storageService.createArticleGeneralDir(d1Path)

      expect(actual.path).toBe(d1Path)
      expect(actual.articleNodeType).toBeUndefined()
      expect(actual.articleSortOrder).toBeUndefined()
      await existsNodes([actual], storageService)
    })

    it('ベーシックケース - 記事配下にディレクトリを作成', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })
      // 記事を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })

      // 記事配下にディレクトリを作成
      const d1Path = `${art1.path}/d1`
      const actual = await storageService.createArticleGeneralDir(d1Path)

      expect(actual.path).toBe(d1Path)
      expect(actual.articleNodeType).toBeUndefined()
      expect(actual.articleSortOrder).toBeUndefined()
      await existsNodes([actual], storageService)
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定なし', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセットディレクトリ配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${assets.path}/d1`)

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createArticleGeneralDir(`${d1.path}`)

      expect(actual).toEqual(d1)
      await existsNodes([actual], storageService)
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定あり', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセットディレクトリ配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${assets.path}/d1`)

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createArticleGeneralDir(`${d1.path}`, {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      })

      expect(actual.path).toBe(`${d1.path}`)
      expect(actual.share).toEqual<StorageNodeShareSettings>({
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      })
      expect(actual.version).toBe(d1.version + 1)
      await existsNodes([actual], storageService)
    })

    it('バンドル配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })
      // ディレクトリのパスを作成
      const d1Path = `${bundle.path}/d1`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir(d1Path)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The specified path is not under article root: '${d1Path}'`)
    })

    it('カテゴリ配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.CategoryBundle,
      })
      // カテゴリを作成
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.Category,
      })
      // ディレクトリのパスを作成
      const d1Path = `${cat1.path}/d1`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir(d1Path)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The specified path is not under article root: '${d1Path}'`)
    })

    it('親ディレクトリが存在しない場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセットディレクトリ配下に親が存在しないディレクトリのパスを作成
      // ※親ディレクトリ'd1'が存在しない
      const d1Path = `${assets.path}/d1`
      const d11Path = `${d1Path}/d1/d11`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir(d11Path)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The ancestor of the specified path does not exist.`)
      expect(actual.detail.values).toEqual({
        specifiedPath: d11Path,
        ancestorPath: d1Path,
      })
    })
  })

  describe('setArticleSortOrder', () => {
    it('ベーシックケース - insertBeforeNodePath', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
      })
      const art3 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事3',
        articleNodeType: StorageArticleNodeType.Article,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(art1.path, { insertBeforeNodePath: art3.path })

      const nodes = await storageService.getNodesByPaths([art1.path, art2.path, art3.path])
      StorageService.sortArticleNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art1.path, art3.path, art2.path])
    })

    it('ベーシックケース - insertAfterNodePath', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
      })
      const art3 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事3',
        articleNodeType: StorageArticleNodeType.Article,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(art1.path, { insertAfterNodePath: art3.path })

      const nodes = await storageService.getNodesByPaths([art1.path, art2.path, art3.path])
      StorageService.sortArticleNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art3.path, art1.path, art2.path])
    })

    it('ベーシックケース - 記事ルート直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル1',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })
      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル2',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })
      // バンドル3を作成
      const bundle3 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル3',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(bundle1.path, { insertAfterNodePath: bundle3.path })

      const nodes = await storageService.getNodesByPaths([bundle1.path, bundle2.path, bundle3.path])
      StorageService.sortArticleNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([bundle3.path, bundle1.path, bundle2.path])
    })

    it('ベーシックケース - カテゴリと記事の混在したディレクトリでソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.CategoryBundle,
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // カテゴリ1を作成
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事3',
        articleNodeType: StorageArticleNodeType.Article,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(cat1.path, { insertAfterNodePath: art1.path })

      const nodes = await storageService.getNodesByPaths([art1.path, art2.path, cat1.path])
      StorageService.sortArticleNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art2.path, art1.path, cat1.path])
    })

    it('前後の挿入位置指定を両方ともしなかった場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })

      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
      })

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(art1.path, {})
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`Both 'insertBeforeNodePath' and 'insertAfterNodePath' are not specified.`)
    })

    it('ターゲットノードと指定された前後のノードが兄弟でない場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.CategoryBundle,
      })

      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
      })
      const art2 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
      })

      let actual!: InputValidationError
      try {
        // テスト対象実行
        // ※'art2'は'art1'とは兄弟ノードでない
        await storageService.setArticleSortOrder(art1.path, { insertBeforeNodePath: art2.path })
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The two nodes are not siblings.`)
      expect(actual.detail.values).toEqual({
        nodePath: art1.path,
        insertBeforeNodePath: art2.path,
      })
    })

    it('記事配下のノードをターゲットノードに指定した場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })
      // 記事を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // 記事配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${art1.path}/d1`)
      const d2 = await storageService.createArticleGeneralDir(`${art1.path}/d2`)

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(d1.path, { insertAfterNodePath: d2.path })
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`Cannot set the sort order for the node.`)
      expect(actual.detail.values).toEqual({
        node: { path: d1.path, articleNodeType: undefined },
      })
    })

    it('アセット配下のノードをターゲットノードに指定した場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットを作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセット配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${assets.path}/d1`)
      const d2 = await storageService.createArticleGeneralDir(`${assets.path}/d2`)

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(d1.path, { insertAfterNodePath: d2.path })
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`Cannot set the sort order for the node.`)
      expect(actual.detail.values).toEqual({
        node: { path: d1.path, articleNodeType: undefined },
      })
    })
  })

  describe('getArticleChildren', () => {
    let articleRoot: StorageNode
    let programing: StorageNode
    let introduction: StorageNode
    let introductionIndex: StorageNode
    let js: StorageNode
    let variable: StorageNode
    let variableIndex: StorageNode
    let ts: StorageNode
    let clazz: StorageNode
    let clazzIndex: StorageNode
    let py: StorageNode
    let tmp: StorageNode

    beforeEach(async () => {
      const articleFileName = config.storage.article.fileName

      // users
      // └test.storage
      //   ├articles
      //   │└programing
      //   │  ├introduction
      //   │  │└index.md
      //   │  ├js
      //   │  │└variable
      //   │  │  └index.md
      //   │  └ts
      //   │  │└class
      //   │  │  └index.md
      //   │  └py
      //   └tmp

      // users/test.storage
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      articleRoot = (await storageService.createHierarchicalDirs([articleRootPath]))[0]
      // programing
      programing = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'programing',
        articleNodeType: StorageArticleNodeType.CategoryBundle,
      })
      // introduction
      introduction = await storageService.createArticleTypeDir({
        dir: `${programing.path}`,
        articleNodeName: 'introduction',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // introduction/index.md
      introductionIndex = await storageService.sgetNodeByPath(`${introduction.path}/${articleFileName}`)
      // js
      js = await storageService.createArticleTypeDir({
        dir: `${programing.path}`,
        articleNodeName: 'js',
        articleNodeType: StorageArticleNodeType.Category,
      })
      await storageService.setArticleSortOrder(js.path, { insertAfterNodePath: introduction.path })
      // js/variable
      variable = await storageService.createArticleTypeDir({
        dir: `${js.path}`,
        articleNodeName: 'variable',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // js/variable/index.md
      variableIndex = await storageService.sgetNodeByPath(`${variable.path}/${articleFileName}`)
      // ts
      ts = await storageService.createArticleTypeDir({
        dir: `${programing.path}`,
        articleNodeName: 'ts',
        articleNodeType: StorageArticleNodeType.Category,
      })
      await storageService.setArticleSortOrder(ts.path, { insertAfterNodePath: js.path })
      // ts/class
      clazz = await storageService.createArticleTypeDir({
        dir: `${ts.path}`,
        articleNodeName: 'class',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // ts/class/index.md
      clazzIndex = await storageService.sgetNodeByPath(`${clazz.path}/${articleFileName}`)
      // py
      py = await storageService.createArticleTypeDir({
        dir: `${programing.path}`,
        articleNodeName: 'py',
        articleNodeType: StorageArticleNodeType.Category,
      })
      await storageService.setArticleSortOrder(py.path, { insertAfterNodePath: ts.path })
      // tmp
      const uerRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      tmp = await storageService.createDir(`${uerRootPath}/tmp`)
    })

    it('ベーシックケース', async () => {
      const actual = await storageService.getArticleChildren(`${programing.path}`, [StorageArticleNodeType.Category, StorageArticleNodeType.Article])

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`${introduction.path}`)
      expect(actual.list[1].path).toBe(`${js.path}`)
      expect(actual.list[2].path).toBe(`${ts.path}`)
      expect(actual.list[3].path).toBe(`${py.path}`)
      await existsNodes(actual.list, storageService)
    })

    it('dirPathに存在しないノードを指定した場合', async () => {
      // dirPathに存在しないノードを指定
      const actual = await storageService.getArticleChildren(`${programing.path}/cobol`, [StorageArticleNodeType.Category])

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      for (let i = 1; i <= 10; i++) {
        await storageService.createArticleTypeDir({
          dir: `${py.path}`,
          articleNodeName: `art${i.toString().padStart(2, '0')}`,
          articleNodeType: StorageArticleNodeType.Article,
        })
      }

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      let fetched = await storageService.getArticleChildren(`${py.path}`, [StorageArticleNodeType.Article], { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getArticleChildren(`${py.path}`, [StorageArticleNodeType.Article], {
          maxChunk: 3,
          pageToken: fetched.nextPageToken,
        })
        actual.push(...fetched.list)
      }

      expect(actual.length).toBe(10)
      expect(actual[0].articleNodeName).toBe(`art10`)
      expect(actual[1].articleNodeName).toBe(`art09`)
      expect(actual[2].articleNodeName).toBe(`art08`)
      expect(actual[3].articleNodeName).toBe(`art07`)
      expect(actual[4].articleNodeName).toBe(`art06`)
      expect(actual[5].articleNodeName).toBe(`art05`)
      expect(actual[6].articleNodeName).toBe(`art04`)
      expect(actual[7].articleNodeName).toBe(`art03`)
      expect(actual[8].articleNodeName).toBe(`art02`)
      expect(actual[9].articleNodeName).toBe(`art01`)
      await existsNodes(actual, storageService)
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
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 99,
      })
      const blog_art1_index = newTestStorageFileNode(`blog/art1/index.md`)
      const blog_art2 = newTestStorageDirNode(`blog/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 98,
      })
      const blog_art2_index = newTestStorageFileNode(`blog/art2/index.md`)
      const category = newTestStorageDirNode(`category`, {
        articleNodeType: StorageArticleNodeType.CategoryBundle,
        articleSortOrder: 8,
      })
      const category_art1 = newTestStorageDirNode(`category/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 99,
      })
      const category_art2 = newTestStorageDirNode(`category/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 98,
      })
      const category_ts = newTestStorageDirNode(`category/TypeScript`, {
        articleSortOrder: 97,
      })
      const category_ts_art1 = newTestStorageDirNode(`category/TypeScript/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 999,
      })
      const category_ts_art1_index = newTestStorageFileNode(`category/TypeScript/art1/index.md`)
      const category_ts_art2 = newTestStorageDirNode(`category/TypeScript/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 998,
      })
      const category_ts_art2_index = newTestStorageFileNode(`category/TypeScript/art2/index.md`)
      const category_js = newTestStorageDirNode(`category/JavaScript`)
      const category_js_art1 = newTestStorageDirNode(`category/JavaScript/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 999,
      })
      const category_js_art2 = newTestStorageDirNode(`category/JavaScript/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
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
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 99,
      })
      const category_art2 = newTestStorageDirNode(`category/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 98,
      })
      const category_ts = newTestStorageDirNode(`category/TypeScript`, {
        articleSortOrder: 97,
      })
      const category_ts_art1 = newTestStorageDirNode(`category/TypeScript/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 999,
      })
      const category_ts_art2 = newTestStorageDirNode(`category/TypeScript/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 998,
      })
      const category_js = newTestStorageDirNode(`category/JavaScript`, {
        articleSortOrder: 96,
      })
      const category_js_art1 = newTestStorageDirNode(`category/JavaScript/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 999,
      })
      const category_js_art2 = newTestStorageDirNode(`category/JavaScript/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    const gqlGetStorageDirChildren = {
      query: `
        query GetStorageDirChildren($dirPath: String, $input: StoragePaginationInput) {
          storageDirChildren(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder version createdAt updatedAt
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
        await storageService.createHierarchicalDirs([`${userDirPath}`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}`])
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
        await storageService.createHierarchicalDirs([`${userDirPath}`])
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

  describe('createDir', () => {
    let userRootPath: string

    beforeEach(async () => {
      // ユーザールートの作成
      userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([userRootPath])
    })

    it('バケット直下にディレクトリを作成', async () => {
      // バケット直下にディレクトリを作成
      const tmp = `tmp`
      const actual = await storageService.createDir(tmp)

      expect(actual.path).toBe(tmp)
    })

    it('ユーザールート配下にディレクトリを作成', async () => {
      // ユーザールート配下にディレクトリを作成
      const tmp = `${userRootPath}/tmp`
      const actual = await storageService.createDir(tmp)

      expect(actual.path).toBe(tmp)
    })

    it('記事ルートの作成', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const actual = await storageService.createDir(articleRootPath)

      expect(actual.path).toBe(articleRootPath)
    })

    it('アセットディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createDir(articleRootPath)
      // アセットディレクトリのパスを作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`

      let actual!: InputValidationError
      try {
        // アセットディレクトリを作成
        await storageService.createDir(assetsPath)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`This method 'createDir()' cannot create an article under directory '${assetsPath}'.`)
    })

    it('記事ルート配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createDir(articleRootPath)

      const dirPath = `${articleRootPath}/blog`
      let actual!: InputValidationError
      try {
        // 記事ルート配下にディレクトリを作成
        await storageService.createDir(dirPath)
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`This method 'createDir()' cannot create an article under directory '${dirPath}'.`)
    })
  })

  describe('createHierarchicalDirs', () => {
    let userRootPath: string

    beforeEach(async () => {
      // ユーザールートの作成
      userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([userRootPath])
    })

    it('バケット直下にディレクトリを作成', async () => {
      // バケット直下にディレクトリを作成
      const tmp = `tmp`
      const actual = await storageService.createHierarchicalDirs([tmp])

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(tmp)
    })

    it('ユーザールート配下にディレクトリを作成', async () => {
      // ユーザールート配下にディレクトリを作成
      const tmp = `${userRootPath}/tmp`
      const actual = await storageService.createHierarchicalDirs([tmp])

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(tmp)
    })

    it('記事ルートの作成', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const actual = await storageService.createHierarchicalDirs([articleRootPath])

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(articleRootPath)
    })

    it('アセットディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createDir(articleRootPath)
      // アセットディレクトリのパスを作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`

      let actual!: InputValidationError
      try {
        // アセットディレクトリを作成
        await storageService.createHierarchicalDirs([assetsPath])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`This method 'createHierarchicalDirs()' cannot create an article under directory '${assetsPath}'.`)
    })

    it('記事ルート配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])

      const dirPath = `${articleRootPath}/blog`
      let actual!: InputValidationError
      try {
        // 記事ルート配下にディレクトリを作成
        await storageService.createHierarchicalDirs([dirPath])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`This method 'createHierarchicalDirs()' cannot create an article under directory '${dirPath}'.`)
    })
  })

  describe('moveDir', () => {
    let articleRoot: StorageNode
    let programing: StorageNode
    let introduction: StorageNode
    let introductionIndex: StorageNode
    let js: StorageNode
    let variable: StorageNode
    let variableIndex: StorageNode
    let ts: StorageNode
    let clazz: StorageNode
    let clazzIndex: StorageNode
    let py: StorageNode
    let tmp: StorageNode

    beforeEach(async () => {
      const articleFileName = config.storage.article.fileName

      // users
      // └test.storage
      //   ├articles
      //   │└programing
      //   │  ├introduction
      //   │  │└index.md
      //   │  ├js
      //   │  │└variable
      //   │  │  └index.md
      //   │  └ts
      //   │  │└class
      //   │  │  └index.md
      //   │  └py
      //   └tmp

      // users/test.storage
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      articleRoot = (await storageService.createHierarchicalDirs([articleRootPath]))[0]
      // programing
      programing = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'programing',
        articleNodeType: StorageArticleNodeType.CategoryBundle,
      })
      // introduction
      introduction = await storageService.createArticleTypeDir({
        dir: `${programing.path}`,
        articleNodeName: 'introduction',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // introduction/index.md
      introductionIndex = await storageService.sgetNodeByPath(`${introduction.path}/${articleFileName}`)
      // js
      js = await storageService.createArticleTypeDir({
        dir: `${programing.path}`,
        articleNodeName: 'js',
        articleNodeType: StorageArticleNodeType.Category,
      })
      await storageService.setArticleSortOrder(js.path, { insertAfterNodePath: introduction.path })
      // js/variable
      variable = await storageService.createArticleTypeDir({
        dir: `${js.path}`,
        articleNodeName: 'variable',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // js/variable/index.md
      variableIndex = await storageService.sgetNodeByPath(`${variable.path}/${articleFileName}`)
      // ts
      ts = await storageService.createArticleTypeDir({
        dir: `${programing.path}`,
        articleNodeName: 'ts',
        articleNodeType: StorageArticleNodeType.Category,
      })
      await storageService.setArticleSortOrder(ts.path, { insertAfterNodePath: js.path })
      // ts/class
      clazz = await storageService.createArticleTypeDir({
        dir: `${ts.path}`,
        articleNodeName: 'class',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // ts/class/index.md
      clazzIndex = await storageService.sgetNodeByPath(`${clazz.path}/${articleFileName}`)
      // py
      py = await storageService.createArticleTypeDir({
        dir: `${programing.path}`,
        articleNodeName: 'py',
        articleNodeType: StorageArticleNodeType.Category,
      })
      await storageService.setArticleSortOrder(py.path, { insertAfterNodePath: ts.path })
      // tmp
      const uerRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      tmp = await storageService.createDir(`${uerRootPath}/tmp`)
    })

    describe('バンドルの移動', () => {
      it('バンドルは移動できない', async () => {
        let actual!: InputValidationError
        try {
          // バンドルを移動しようとした場合
          // 'programing'を'tmp/programing'へ移動
          await storageService.moveDir(`${programing.path}`, `${tmp.path}/${programing.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Article bundles cannot be moved.`)
        expect(actual.detail.values!['movingNode']).toEqual({ path: programing.path, articleNodeType: programing.articleNodeType })
      })
    })

    describe('カテゴリの移動', () => {
      it('ベーシックケース', async () => {
        // カテゴリを別のカテゴリへ移動
        // 'programing/ts'を'programing/js/ts'へ移動
        const actual = await storageService.moveDir(`${ts.path}`, `${js.path}/${ts.name}`)

        // 戻り値の検証
        StorageService.sortNodes(actual.list)
        expect(actual.nextPageToken).toBeUndefined()
        expect(actual.list.length).toBe(3)
        expect(actual.list[0].path).toBe(`${js.path}/${ts.name}`)
        expect(actual.list[1].path).toBe(`${js.path}/${ts.name}/${clazz.name}`)
        expect(actual.list[2].path).toBe(`${js.path}/${ts.name}/${clazz.name}/${clazzIndex.name}`)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: InputValidationError
        try {
          // カテゴリを記事へ移動しようとした場合
          // 'programing/ts'を'programing/js/variable/ts'へ移動
          await storageService.moveDir(`${ts.path}`, `${variable.path}/${ts.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Categories can only be moved to category bundles or categories.`)
        expect(actual.detail.values!['movingNode']).toEqual({ path: ts.path, articleNodeType: ts.articleNodeType })
        expect(actual.detail.values!['toParentNode']).toEqual({ path: variable.path, articleNodeType: variable.articleNodeType })
      })
    })

    describe('記事の移動', () => {
      it('ベーシックケース', async () => {
        // 記事をカテゴリへ移動
        // 'programing/js/variable'を'programing/ts/variable'へ移動
        const actual = await storageService.moveDir(`${variable.path}`, `${ts.path}/${variable.name}`)

        // 戻り値の検証
        StorageService.sortNodes(actual.list)
        expect(actual.nextPageToken).toBeUndefined()
        expect(actual.list.length).toBe(2)
        expect(actual.list[0].path).toBe(`${ts.path}/${variable.name}`)
        expect(actual.list[1].path).toBe(`${ts.path}/${variable.name}/${variableIndex.name}`)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: InputValidationError
        try {
          //  記事を記事へ移動しようとした場合
          // 'programing/ts/class'を'programing/js/variable/class'へ移動
          await storageService.moveDir(`${clazz.path}`, `${variable.path}/${clazz.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Articles can only be moved to list bundles or category bundles or categories.`)
        expect(actual.detail.values!['movingNode']).toEqual({ path: clazz.path, articleNodeType: clazz.articleNodeType })
        expect(actual.detail.values!['toParentNode']).toEqual({ path: variable.path, articleNodeType: variable.articleNodeType })
      })
    })

    describe('一般ディレクトリの移動', () => {
      it('ベーシックケース', async () => {
        // 一般ディレクトリを記事へ移動
        // 'tmp'を'programing/js/variable/tmp'へ移動
        const actual = await storageService.moveDir(`${tmp.path}`, `${variable.path}/${tmp.name}`)

        // 戻り値の検証
        StorageService.sortNodes(actual.list)
        expect(actual.nextPageToken).toBeUndefined()
        expect(actual.list.length).toBe(1)
        expect(actual.list[0].path).toBe(`${variable.path}/${tmp.name}`)
      })

      it('ルートノードへ移動', async () => {
        // 一般ディレクトリをルートノードへ移動
        // 'tmp'をルートノードへ移動
        const actual = await storageService.moveDir(`${tmp.path}`, `${tmp.name}`)

        // 戻り値の検証
        StorageService.sortNodes(actual.list)
        expect(actual.nextPageToken).toBeUndefined()
        expect(actual.list.length).toBe(1)
        expect(actual.list[0].path).toBe(`${tmp.name}`)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: InputValidationError
        try {
          //  一般ディレクトリをカテゴリバンドルへ移動しようとした場合
          // 'tmp'を'programing/tmp'へ移動
          await storageService.moveDir(`${tmp.path}`, `${programing.path}/${tmp.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The general directory can only be moved to the general directory or articles.`)
        expect(actual.detail.values!['movingNode']).toEqual({ path: tmp.path, articleNodeType: tmp.articleNodeType })
        expect(actual.detail.values!['toParentNode']).toEqual({ path: programing.path, articleNodeType: programing.articleNodeType })
      })
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

  describe('m_validateArticleRootDescendant', () => {
    it('ベーシックケース - 記事ルート直下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      // バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleRootDescendant(bundlePath)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('ベーシックケース - バンドル配下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      // バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`
      // 記事のパスを作成
      const art1Path = `${bundlePath}/art1`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleRootDescendant(art1Path)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('引数ノードが記事ルート配下でない場合', async () => {
      const userDirPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      // バンドルを記事ルート以外に指定
      const bundlePath = `${userDirPath}/blog`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleRootDescendant(bundlePath)
      } catch (err) {
        actual = err
      }

      // バンドルを記事ルートでないためエラーが発生
      expect(actual.detail.message).toBe(`The specified path is not under article root: '${bundlePath}'`)
    })
  })

  describe('m_getBelongToArticleBundle', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.CategoryBundle,
      })
      // カテゴリ1を作成
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })

      // テスト対象実行
      // ※引数ノードにバンドル配下のディレクトリを指定
      const actual = (await storageService.m_getBelongToArticleBundle(`${art1.path}`))!

      expect(actual.path).toBe(bundle.path)
    })

    it('記事系ノード以外を指定した場合', async () => {
      // ユーザールートの作成
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([userRootPath])
      // ユーザールート配下のパスを指定

      // テスト対象実行
      // ※引数ノードにバンドル配下のディレクトリを指定
      const actual = await storageService.m_getBelongToArticleBundle(`${userRootPath}/art1`)

      expect(actual).toBeUndefined()
    })
  })
})
