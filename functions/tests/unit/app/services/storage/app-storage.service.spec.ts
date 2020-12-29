import {
  APP_ADMIN_USER,
  APP_ADMIN_USER_HEADER,
  GENERAL_USER_HEADER,
  STORAGE_USER,
  STORAGE_USER_HEADER,
  STORAGE_USER_TOKEN,
  existsStorageNodes,
  getGQLErrorStatus,
  newAppStorageDirNode,
  newAppStorageFileNode,
  notExistsStorageNodes,
  removeAllStorageNodes,
  requestGQL,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
  verifyMoveStorageNodes,
} from '../../../../helpers/app'
import {
  AppStorageService,
  AppStorageServiceDI,
  CreateArticleTypeDirInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  StorageArticleNodeType,
  StorageNode,
  StorageNodeShareSettings,
  StorageUploadDataItem,
} from '../../../../../src/app/services'
import { InputValidationError, initApp } from '../../../../../src/app/base'
import { Test, TestingModule } from '@nestjs/testing'
import { shuffleArray, sleep } from 'web-base-lib'
import { Response } from 'supertest'
import StandardGQLContainerModule from '../../../../../src/app/gql/main/lv1'
import StorageRESTModule from '../../../../../src/app/rest/storage'
import { config } from '../../../../../src/config'
import request = require('supertest')

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test helpers
//
//========================================================================

let testingModule!: TestingModule
let storageService!: TestStorageService
let devUtilsService!: DevUtilsServiceDI.type

type TestStorageService = AppStorageServiceDI.type & {
  m_validateAccessibleTargetToNodePaths: AppStorageServiceDI.type['m_validateAccessibleTargetToNodePaths']
  m_validateArticleRootUnder: AppStorageServiceDI.type['m_validateArticleRootUnder']
  m_getBelongToArticleBundle: AppStorageServiceDI.type['m_getBelongToArticleBundle']
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
      imports: [StorageRESTModule, StandardGQLContainerModule],
    }).compile()

    storageService = testingModule.get<TestStorageService>(AppStorageServiceDI.symbol)

    await removeAllStorageNodes()

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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
      const user1Dir = AppStorageService.getUserRootPath({ uid: 'user1' })
      const user2Dir = AppStorageService.getUserRootPath({ uid: 'user2' })
      const user3Dir = AppStorageService.getUserRootPath({ uid: 'user3' })
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
      await notExistsStorageNodes(user2Nodes, storageService)
      // ユーザーノード以外がが削除されていないことを検証
      await existsStorageNodes(otherNodes, storageService)
    })

    it('大量データの場合', async () => {
      const user1Dir = AppStorageService.getUserRootPath({ uid: 'user1' })
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
      await notExistsStorageNodes(user1Nodes, storageService)
    })
  })

  describe('createArticleTypeDir', () => {
    describe('バンドル作成', () => {
      it('ベーシックケース', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        expect(actual.articleSortOrder).toBe(1)
        await existsStorageNodes([actual], storageService)
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])

        // バンドル1の作成
        const bundle1 = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル1',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })
        // バンドル2の作成
        const bundle2 = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル2',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })

        expect(bundle1.articleSortOrder).toBe(1)
        expect(bundle2.articleSortOrder).toBe(2)
      })

      it('同じ記事ノード名のバンドルを作成', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        }
        await storageService.createArticleTypeDir(input)

        // テスト対象実行
        // ※同じ記事ノード名を再度作成
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.articleNodeName).toBe(input.articleNodeName)
        expect(actual.articleNodeType).toBe(input.articleNodeType)
        expect(actual.articleSortOrder).toBe(2)
        await existsStorageNodes([actual], storageService)
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
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        const usersPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([usersPath])
        // バンドル作成の引数
        // ※記事ルートが存在しない状態でバンドル作成を試みる
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        expect(actual.articleSortOrder).toBe(1)
        await existsStorageNodes([actual], storageService)
      })

      it('ベーシックケース - カテゴリ直下に作成', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        expect(actual.articleSortOrder).toBe(1)
        await existsStorageNodes([actual], storageService)
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        // カテゴリ2を作成
        const cat2 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          articleNodeName: 'カテゴリ2',
          articleNodeType: StorageArticleNodeType.Category,
        })

        expect(cat1.articleSortOrder).toBe(1)
        expect(cat2.articleSortOrder).toBe(2)
      })

      it('同じ記事ノード名のカテゴリを作成', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.CategoryBundle,
        })
        // カテゴリ1を作成
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
        expect(actual.articleSortOrder).toBe(2)
        await existsStorageNodes([actual], storageService)
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
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
          parentNode: { path: input.dir, articleNodeType: null },
        })
      })

      it('リストバンドル直下にカテゴリを作成しようとした作成', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        expect(actual.articleSortOrder).toBe(1)
        await existsStorageNodes([actual], storageService)

        const art1FilePath = `${actual.path}/${config.storage.article.fileName}`
        const art1FileNode = await storageService.sgetNode({ path: art1FilePath })
        expect(art1FileNode.path).toBe(art1FilePath)
        expect(art1FileNode.contentType).toBe('text/markdown')
        expect(art1FileNode.isArticleFile).toBeTruthy()
      })

      it('ベーシックケース - カテゴリ直下に記事を作成', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        expect(actual.articleSortOrder).toBe(1)
        await existsStorageNodes([actual], storageService)

        const art1FilePath = `${actual.path}/${config.storage.article.fileName}`
        const art1FileNode = await storageService.sgetNode({ path: art1FilePath })
        expect(art1FileNode.path).toBe(art1FilePath)
        expect(art1FileNode.contentType).toBe('text/markdown')
        expect(art1FileNode.isArticleFile).toBeTruthy()
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          articleNodeName: 'バンドル',
          articleNodeType: StorageArticleNodeType.ListBundle,
        })

        // 記事1の作成
        const art1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          articleNodeName: '記事1',
          articleNodeType: StorageArticleNodeType.Article,
        })
        // 記事2の作成
        const art2 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          articleNodeName: '記事2',
          articleNodeType: StorageArticleNodeType.Article,
        })

        expect(art1.articleSortOrder).toBe(1)
        expect(art2.articleSortOrder).toBe(2)
      })

      it('同じ記事ノード名の記事を作成', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        expect(actual.articleSortOrder).toBe(2)
        await existsStorageNodes([actual], storageService)

        const art1FilePath = `${actual.path}/${config.storage.article.fileName}`
        const art1FileNode = await storageService.sgetNode({ path: art1FilePath })
        expect(art1FileNode.path).toBe(art1FilePath)
        expect(art1FileNode.contentType).toBe('text/markdown')
        expect(art1FileNode.isArticleFile).toBeTruthy()
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
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
          parentNode: { path: userRootPath, articleNodeType: null },
        })
      })

      it('記事の祖先が存在しない場合', async () => {
        // 記事ルートの作成
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])

      // アセットディレクトリの作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const actual = await storageService.createArticleGeneralDir(assetsPath)

      expect(actual.path).toBe(assetsPath)
      expect(actual.articleNodeName).toBeNull()
      expect(actual.articleNodeType).toBeNull()
      expect(actual.articleSortOrder).toBeNull()
      expect(actual.isArticleFile).toBeFalsy()
      await existsStorageNodes([actual], storageService)
    })

    it('ベーシックケース - アセットディレクトリ配下にディレクトリを作成', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)

      // アセットディレクトリ配下にディレクトリを作成
      const d1Path = `${assets.path}/d1`
      const actual = await storageService.createArticleGeneralDir(d1Path)

      expect(actual.path).toBe(d1Path)
      expect(actual.articleNodeName).toBeNull()
      expect(actual.articleNodeType).toBeNull()
      expect(actual.articleSortOrder).toBeNull()
      expect(actual.isArticleFile).toBeFalsy()
      await existsStorageNodes([actual], storageService)
    })

    it('ベーシックケース - 記事配下にディレクトリを作成', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
      expect(actual.articleNodeName).toBeNull()
      expect(actual.articleNodeType).toBeNull()
      expect(actual.articleSortOrder).toBeNull()
      expect(actual.isArticleFile).toBeFalsy()
      await existsStorageNodes([actual], storageService)
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定なし', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセットディレクトリ配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${assets.path}/d1`)

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createArticleGeneralDir(`${d1.path}`)

      expect(actual).toEqual(d1)
      await existsStorageNodes([actual], storageService)
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定あり', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
      await existsStorageNodes([actual], storageService)
    })

    it('バンドル配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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

      expect(actual.detail.message).toBe(`The specified path is not under article: '${d1Path}'`)
    })

    it('カテゴリ配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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

      expect(actual.detail.message).toBe(`The specified path is not under article: '${d1Path}'`)
    })

    it('親ディレクトリが存在しない場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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

  describe('renameArticleNode', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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

      // テスト対象実行
      const actual = await storageService.renameArticleNode(art1.path, 'Article1')

      // 戻り値の検証
      expect(actual.articleNodeName).toBe('Article1')
      expect(actual.version).toBe(art1.version + 1)
      await existsStorageNodes([actual], storageService)
    })

    it('記事ルート配下でないノードを名前変更しようとした場合', async () => {
      // ユーザールート配下にノードを作成
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const [users, user, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])

      let actual!: InputValidationError
      try {
        // パスに存在しないノードを指定
        await storageService.renameArticleNode(`${d1.path}`, 'D1')
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The specified path is not under article root: '${d1.path}'`)
    })

    it('存在しないノードを名前変更しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])

      let actual!: Error
      try {
        // パスに存在しないノードを指定
        await storageService.renameArticleNode(`${articleRootPath}/xxx`, 'Bundle')
      } catch (err) {
        actual = err
      }

      expect(actual.message).toBe(`There is no node in the specified key: {"path":"${articleRootPath}/xxx"}`)
    })
  })

  describe('setArticleSortOrder', () => {
    it('ベーシックケース - バンドル直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        articleSortOrder: 1,
      })
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 2,
      })
      const art3 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事3',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(STORAGE_USER_TOKEN, [art3.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren(bundle.path)).list
      AppStorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art3.path, art2.path, art1.path])
      expect(nodes.map(node => node.articleSortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - カテゴリ直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
      })

      const art1 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 1,
      })
      const art2 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 2,
      })
      const art3 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        articleNodeName: '記事3',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(STORAGE_USER_TOKEN, [art3.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren(cat1.path)).list
      AppStorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art3.path, art2.path, art1.path])
      expect(nodes.map(node => node.articleSortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - 記事ルート直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル1',
        articleNodeType: StorageArticleNodeType.ListBundle,
        articleSortOrder: 1,
      })
      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル2',
        articleNodeType: StorageArticleNodeType.ListBundle,
        articleSortOrder: 2,
      })
      // バンドル3を作成
      const bundle3 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル3',
        articleNodeType: StorageArticleNodeType.ListBundle,
        articleSortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(STORAGE_USER_TOKEN, [bundle3.path, bundle2.path, bundle1.path])

      const nodes = (await storageService.getChildren(`${articleRootPath}`)).list
      AppStorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([bundle3.path, bundle2.path, bundle1.path])
      expect(nodes.map(node => node.articleSortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - カテゴリと記事の混在したディレクトリでソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        articleSortOrder: 1,
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 2,
      })
      // カテゴリ1を作成
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(STORAGE_USER_TOKEN, [cat1.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren(`${bundle.path}`)).list
      AppStorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([cat1.path, art2.path, art1.path])
      expect(nodes.map(node => node.articleSortOrder)).toEqual([3, 2, 1])
    })

    it('親が違うノードにソート順を設定しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])

      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル1',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle1.path}`,
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
      })

      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル2',
        articleNodeType: StorageArticleNodeType.ListBundle,
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle2.path}`,
        articleNodeName: '記事2',
        articleNodeType: StorageArticleNodeType.Article,
      })

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(STORAGE_USER_TOKEN, [art1.path, art2.path])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`There are multiple parents in 'orderNodePaths'.`)
      expect(actual.detail.values).toEqual({ orderNodePaths: [art1.path, art2.path] })
    })

    it('ソート順を設定するノードが足りなかった場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル1',
        articleNodeType: StorageArticleNodeType.ListBundle,
        articleSortOrder: 1,
      })
      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル2',
        articleNodeType: StorageArticleNodeType.ListBundle,
        articleSortOrder: 2,
      })

      let actual!: InputValidationError
      try {
        // テスト対象実行
        // ※本来は'bundle1'と'bundle2'を設定する必要があるが、ここでは'bundle1'のみを設定
        await storageService.setArticleSortOrder(STORAGE_USER_TOKEN, [bundle1.path])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`The number of 'orderNodePaths' does not match the number of children of the parent of 'orderNodePaths'.`)
      expect(actual.detail.values).toEqual({ orderNodePaths: [bundle1.path] })
    })

    it('記事配下のノードにソート順を設定しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        await storageService.setArticleSortOrder(STORAGE_USER_TOKEN, [d1.path, d2.path])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`It is not possible to set the sort order for child nodes.`)
      expect(actual.detail.values).toEqual({
        parent: { id: art1.id, path: art1.path, articleNodeType: art1.articleNodeType },
      })
    })

    it('アセット配下のノードにソート順を設定しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットを作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセット配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${assets.path}/d1`)
      const d2 = await storageService.createArticleGeneralDir(`${assets.path}/d2`)

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(STORAGE_USER_TOKEN, [d1.path, d2.path])
      } catch (err) {
        actual = err
      }

      expect(actual.detail.message).toBe(`It is not possible to set the sort order for child nodes.`)
      expect(actual.detail.values).toEqual({
        parent: { id: assets.id, path: assets.path, articleNodeType: assets.articleNodeType },
      })
    })
  })

  describe('getArticleChildren', () => {
    let articleRoot: StorageNode
    let programming: StorageNode
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
      //   │└programming
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      articleRoot = (await storageService.createHierarchicalDirs([articleRootPath]))[0]

      // programming
      programming = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'programming',
        articleNodeType: StorageArticleNodeType.CategoryBundle,
        articleSortOrder: 1,
      })

      // introduction
      introduction = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        articleNodeName: 'introduction',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 4,
      })
      // introduction/index.md
      introductionIndex = await storageService.sgetNode({ path: `${introduction.path}/${articleFileName}` })

      // js
      js = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        articleNodeName: 'js',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 3,
      })
      // js/variable
      variable = await storageService.createArticleTypeDir({
        dir: `${js.path}`,
        articleNodeName: 'variable',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 1,
      })
      // js/variable/index.md
      variableIndex = await storageService.sgetNode({ path: `${variable.path}/${articleFileName}` })

      // ts
      ts = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        articleNodeName: 'ts',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 2,
      })
      // ts/class
      clazz = await storageService.createArticleTypeDir({
        dir: `${ts.path}`,
        articleNodeName: 'class',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 1,
      })
      // ts/class/index.md
      clazzIndex = await storageService.sgetNode({ path: `${clazz.path}/${articleFileName}` })

      // py
      py = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        articleNodeName: 'py',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 1,
      })

      // tmp
      const uerRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      tmp = await storageService.createDir(`${uerRootPath}/tmp`)
    })

    it('ベーシックケース', async () => {
      const actual = await storageService.getArticleChildren(`${programming.path}`, [StorageArticleNodeType.Category, StorageArticleNodeType.Article])

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`${introduction.path}`)
      expect(actual.list[1].path).toBe(`${js.path}`)
      expect(actual.list[2].path).toBe(`${ts.path}`)
      expect(actual.list[3].path).toBe(`${py.path}`)
      await existsStorageNodes(actual.list, storageService)
    })

    it('対象ノードに存在しないノードを指定した場合', async () => {
      // パスに存在しないノードを指定
      const actual = await storageService.getArticleChildren(`${programming.path}/cobol`, [StorageArticleNodeType.Category])

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
      await existsStorageNodes(actual, storageService)
    })
  })

  describe('sortNodes', () => {
    it('パターン①', async () => {
      // users
      // └test.storage
      //   ├articles
      //   │├blog
      //   ││├art1
      //   │││└index.md
      //   ││└art2
      //   ││  └index.md
      //   │├category
      //   ││├art1
      //   ││├art2
      //   ││├TypeScript
      //   │││├art1
      //   ││││└index.md
      //   │││└art2
      //   │││  └index.md
      //   ││└JavaScript
      //   │└assets
      //   │  ├pic1.png
      //   │  └pic2.png
      //   └tmp
      //     ├d1
      //     │├f11.txt
      //     │└f12.txt
      //     ├d2
      //     └f1.txt

      const users = newAppStorageDirNode(config.storage.user.rootName)

      const userRoot = newAppStorageDirNode(AppStorageService.getUserRootPath(STORAGE_USER_TOKEN))

      const articleRoot = newAppStorageDirNode(AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN))

      const blog = newAppStorageDirNode(`${articleRoot.path}/blog`, {
        articleNodeType: StorageArticleNodeType.ListBundle,
        articleSortOrder: 2,
      })
      const blog_art1 = newAppStorageDirNode(`${articleRoot.path}/blog/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 2,
      })
      const blog_art1_index = newAppStorageFileNode(`${articleRoot.path}/blog/art1/index.md`)
      const blog_art2 = newAppStorageDirNode(`${articleRoot.path}/blog/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 1,
      })
      const blog_art2_index = newAppStorageFileNode(`${articleRoot.path}/blog/art2/index.md`)

      const category = newAppStorageDirNode(`${articleRoot.path}/category`, {
        articleNodeType: StorageArticleNodeType.CategoryBundle,
        articleSortOrder: 1,
      })
      const category_art1 = newAppStorageDirNode(`${articleRoot.path}/category/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 4,
      })
      const category_art2 = newAppStorageDirNode(`${articleRoot.path}/category/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 3,
      })
      const category_ts = newAppStorageDirNode(`${articleRoot.path}/category/TypeScript`, {
        articleSortOrder: 2,
      })
      const category_ts_art1 = newAppStorageDirNode(`${articleRoot.path}/category/TypeScript/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 2,
      })
      const category_ts_art1_index = newAppStorageFileNode(`${articleRoot.path}/category/TypeScript/art1/index.md`)
      const category_ts_art2 = newAppStorageDirNode(`${articleRoot.path}/category/TypeScript/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 1,
      })
      const category_ts_art2_index = newAppStorageFileNode(`${articleRoot.path}/category/TypeScript/art2/index.md`)
      const category_js = newAppStorageDirNode(`${articleRoot.path}/category/JavaScript`, {
        articleSortOrder: 1,
      })

      const assets = newAppStorageDirNode(AppStorageService.getArticleAssetPath(STORAGE_USER_TOKEN))
      const assets_pic1 = newAppStorageFileNode(`${assets.path}/pic1.png`)
      const assets_pic2 = newAppStorageFileNode(`${assets.path}/pic2.png`)

      const tmp = newAppStorageDirNode(`${userRoot.path}/tmp`)
      const d1 = newAppStorageDirNode(`${tmp.path}/d1`)
      const f11 = newAppStorageFileNode(`${tmp.path}/d1/f11.txt`)
      const f12 = newAppStorageFileNode(`${tmp.path}/d1/f12.txt`)
      const d2 = newAppStorageDirNode(`${tmp.path}/d2`)
      const f1 = newAppStorageFileNode(`${tmp.path}/f1.txt`)

      const nodes = shuffleArray([
        users,
        userRoot,
        articleRoot,
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
        assets,
        assets_pic1,
        assets_pic2,
        tmp,
        d1,
        f11,
        f12,
        d2,
        f1,
      ])

      // テスト対象実行
      AppStorageService.sortNodes(nodes)

      expect(nodes[0]).toBe(users)
      expect(nodes[1]).toBe(userRoot)
      expect(nodes[2]).toBe(articleRoot)
      expect(nodes[3]).toBe(blog)
      expect(nodes[4]).toBe(blog_art1)
      expect(nodes[5]).toBe(blog_art1_index)
      expect(nodes[6]).toBe(blog_art2)
      expect(nodes[7]).toBe(blog_art2_index)
      expect(nodes[8]).toBe(category)
      expect(nodes[9]).toBe(category_art1)
      expect(nodes[10]).toBe(category_art2)
      expect(nodes[11]).toBe(category_ts)
      expect(nodes[12]).toBe(category_ts_art1)
      expect(nodes[13]).toBe(category_ts_art1_index)
      expect(nodes[14]).toBe(category_ts_art2)
      expect(nodes[15]).toBe(category_ts_art2_index)
      expect(nodes[16]).toBe(category_js)
      expect(nodes[17]).toBe(assets)
      expect(nodes[18]).toBe(assets_pic1)
      expect(nodes[19]).toBe(assets_pic2)
      expect(nodes[20]).toBe(tmp)
      expect(nodes[21]).toBe(d1)
      expect(nodes[22]).toBe(f11)
      expect(nodes[23]).toBe(f12)
      expect(nodes[24]).toBe(d2)
      expect(nodes[25]).toBe(f1)
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

      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)

      const category_art1 = newAppStorageDirNode(`${articleRootPath}/category/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 4,
      })
      const category_art2 = newAppStorageDirNode(`${articleRootPath}/category/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 3,
      })
      const category_ts = newAppStorageDirNode(`${articleRootPath}/category/TypeScript`, {
        articleSortOrder: 2,
      })
      const category_ts_art1 = newAppStorageDirNode(`${articleRootPath}/category/TypeScript/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 2,
      })
      const category_ts_art2 = newAppStorageDirNode(`${articleRootPath}/category/TypeScript/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 1,
      })
      const category_js = newAppStorageDirNode(`${articleRootPath}/category/JavaScript`, {
        articleSortOrder: 1,
      })
      const category_js_art1 = newAppStorageDirNode(`${articleRootPath}/category/JavaScript/art1`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 2,
      })
      const category_js_art2 = newAppStorageDirNode(`${articleRootPath}/category/JavaScript/art2`, {
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 1,
      })

      // 配列に上位ディレクトリがなくてもソートできるか検証するために、
      // 上位ディレクトリは配列に追加しない
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
      AppStorageService.sortNodes(nodes)

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
        query GetStorageNode($input: StorageNodeGetKeyInput!) {
          storageNode(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    const gqlGetStorageDirChildren = {
      query: `
        query GetStorageDirChildren($dirPath: String, $input: StoragePaginationInput) {
          storageDirChildren(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
        const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
      userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const actual = await storageService.createDir(articleRootPath)

      expect(actual.path).toBe(articleRootPath)
    })

    it('アセットディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
      userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const actual = await storageService.createHierarchicalDirs([articleRootPath])

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(articleRootPath)
    })

    it('アセットディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
    let programming: StorageNode
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
      //   │└programming
      //   │  ├introduction
      //   │  │└index.md
      //   │  ├js
      //   │  │└variable
      //   │  │  └index.md
      //   │  ├ts
      //   │  │└class
      //   │  │  └index.md
      //   │  └py
      //   └tmp

      // users/test.storage
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      articleRoot = (await storageService.createHierarchicalDirs([articleRootPath]))[0]

      // programming
      programming = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        articleNodeName: 'programming',
        articleNodeType: StorageArticleNodeType.CategoryBundle,
        articleSortOrder: 1,
      })

      // introduction
      introduction = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        articleNodeName: 'introduction',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 4,
      })
      // introduction/index.md
      introductionIndex = await storageService.sgetNode({ path: `${introduction.path}/${articleFileName}` })

      // ts
      ts = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        articleNodeName: 'ts',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 3,
      })
      // ts/class
      clazz = await storageService.createArticleTypeDir({
        dir: `${ts.path}`,
        articleNodeName: 'class',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // ts/class/index.md
      clazzIndex = await storageService.sgetNode({ path: `${clazz.path}/${articleFileName}` })

      // js
      js = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        articleNodeName: 'js',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 2,
      })
      // js/variable
      variable = await storageService.createArticleTypeDir({
        dir: `${js.path}`,
        articleNodeName: 'variable',
        articleNodeType: StorageArticleNodeType.Article,
      })
      // js/variable/index.md
      variableIndex = await storageService.sgetNode({ path: `${variable.path}/${articleFileName}` })

      // py
      py = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        articleNodeName: 'py',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 1,
      })

      // tmp
      const uerRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      tmp = await storageService.createDir(`${uerRootPath}/tmp`)
    })

    describe('バンドルの移動', () => {
      it('バンドルは移動できない', async () => {
        let actual!: InputValidationError
        try {
          // バンドルを移動しようとした場合
          // 'programming'を'tmp/programming'へ移動
          await storageService.moveDir(`${programming.path}`, `${tmp.path}/${programming.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`Article bundles cannot be moved.`)
        expect(actual.detail.values!['movingNode']).toEqual({ path: programming.path, articleNodeType: programming.articleNodeType })
      })
    })

    describe('カテゴリの移動', () => {
      it('ベーシックケース', async () => {
        // 移動前の'programming/ts'のソート順を検証
        expect(ts.articleSortOrder).toBe(3)

        // カテゴリを別のカテゴリへ移動
        // 'programming/ts'を'programming/js/ts'へ移動
        const toNodePath = `${js.path}/${ts.name}`
        await storageService.moveDir(`${ts.path}`, toNodePath)

        // 移動後の'programming/js/ts'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
        AppStorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(3)
        expect(toNodes[0].path).toBe(`${js.path}/${ts.name}`)
        expect(toNodes[1].path).toBe(`${js.path}/${ts.name}/${clazz.name}`)
        expect(toNodes[2].path).toBe(`${js.path}/${ts.name}/${clazz.name}/${clazzIndex.name}`)

        // 移動後の'programming/js/ts'のソート順を検証
        const _ts = toNodes[0]
        expect(_ts.articleSortOrder).toBe(2)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: InputValidationError
        try {
          // カテゴリを記事へ移動しようとした場合
          // 'programming/ts'を'programming/js/variable/ts'へ移動
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
        // 移動前の'programming/js/variable'のソート順を検証
        expect(variable.articleSortOrder).toBe(1)

        // 記事をカテゴリへ移動
        // 'programming/js/variable'を'programming/ts/variable'へ移動
        const toNodePath = `${ts.path}/${variable.name}`
        await storageService.moveDir(`${variable.path}`, toNodePath)

        // 移動後の'programming/ts/variable'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
        AppStorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(2)
        expect(toNodes[0].path).toBe(`${ts.path}/${variable.name}`)
        expect(toNodes[1].path).toBe(`${ts.path}/${variable.name}/${variableIndex.name}`)

        // 移動後の'programming/ts/variable'のソート順を検証
        const _variable = toNodes[0]
        expect(_variable.articleSortOrder).toBe(2)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: InputValidationError
        try {
          //  記事を記事へ移動しようとした場合
          // 'programming/ts/class'を'programming/js/variable/class'へ移動
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
        // 'tmp'を'programming/js/variable/tmp'へ移動
        const toNodePath = `${variable.path}/${tmp.name}`
        const actual = await storageService.moveDir(`${tmp.path}`, toNodePath)

        // 移動後の'programming/js/variable/tmp'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
        AppStorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(1)
        expect(toNodes[0].path).toBe(`${variable.path}/${tmp.name}`)
      })

      it('ルートノードへ移動', async () => {
        // 一般ディレクトリをルートノードへ移動
        // 'tmp'をルートノードへ移動
        const toNodePath = `${tmp.name}`
        const actual = await storageService.moveDir(`${tmp.path}`, toNodePath)

        // 移動後の'tmp'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
        AppStorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(1)
        expect(toNodes[0].path).toBe(`${tmp.name}`)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: InputValidationError
        try {
          //  一般ディレクトリをカテゴリバンドルへ移動しようとした場合
          // 'tmp'を'programming/tmp'へ移動
          await storageService.moveDir(`${tmp.path}`, `${programming.path}/${tmp.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.detail.message).toBe(`The general directory can only be moved to the general directory or articles.`)
        expect(actual.detail.values!['movingNode']).toEqual({ path: tmp.path, articleNodeType: tmp.articleNodeType })
        expect(actual.detail.values!['toParentNode']).toEqual({ path: programming.path, articleNodeType: programming.articleNodeType })
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
      const fromNodes = (await storageService.getDirDescendants(`d1`)).list

      // 大量データを想定して分割で移動を行う
      // 'd1'を'dA/d1'へ移動
      const toNodePath = `dA/d1`
      await storageService.moveDir(`d1`, toNodePath, { maxChunk: 3 })

      // 移動後の'dA/d1'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
      AppStorageService.sortNodes(toNodes)
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
      await verifyMoveStorageNodes(fromNodes, toNodePath, storageService)
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

  describe('m_validateArticleRootUnder', () => {
    it('ベーシックケース - 記事ルート直下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      // バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleRootUnder(bundlePath)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('ベーシックケース - バンドル配下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      // バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`
      // 記事のパスを作成
      const art1Path = `${bundlePath}/art1`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleRootUnder(art1Path)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('引数ノードが記事ルート配下でない場合', async () => {
      const userDirPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      // バンドルを記事ルート以外に指定
      const bundlePath = `${userDirPath}/blog`

      let actual!: InputValidationError
      try {
        // テスト対象実行
        await storageService.m_validateArticleRootUnder(bundlePath)
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      await storageService.createHierarchicalDirs([userRootPath])
      // ユーザールート配下のパスを指定

      // テスト対象実行
      // ※引数ノードにバンドル配下のディレクトリを指定
      const actual = await storageService.m_getBelongToArticleBundle(`${userRootPath}/art1`)

      expect(actual).toBeUndefined()
    })
  })
})
