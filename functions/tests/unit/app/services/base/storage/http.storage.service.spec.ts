import * as fs from 'fs'
import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  GeneralUserHeader,
  StorageTestHelper,
  StorageTestService,
  StorageUser,
  StorageUserHeader,
  StorageUserToken,
  getGQLErrorStatus,
  requestGQL,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
} from '../../../../../helpers/app'
import { AppStorageServiceDI, DevUtilsServiceDI, DevUtilsServiceModule } from '../../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import Lv1GQLContainerModule from '../../../../../../src/app/gql/main/lv1'
import { Response } from 'supertest'
import StorageRESTModule from '../../../../../../src/app/rest/storage'
import { StorageService } from '../../../../../../src/app/services/base/storage'
import { initApp } from '../../../../../../src/app/base'
import { sleep } from 'web-base-lib'
import request = require('supertest')

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

describe('StorageService - HTTP関連のテスト', () => {
  let testingModule!: TestingModule
  let storageService!: StorageTestService
  let devUtilsService!: DevUtilsServiceDI.type
  let h!: StorageTestHelper

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule, StorageRESTModule, Lv1GQLContainerModule],
    }).compile()

    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    storageService = testingModule.get<StorageTestService>(AppStorageServiceDI.symbol)
    h = new StorageTestHelper(storageService)

    await h.removeAllNodes()

    await devUtilsService.setTestFirebaseUsers(AppAdminUser(), StorageUser())

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    await sleep(1500)
  })

  afterEach(() => {
    td.reset()
  })

  describe('validateAccessible', () => {
    let app: any

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
            headers: AppAdminUserHeader(),
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
            headers: StorageUserHeader(),
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
            headers: AppAdminUserHeader(),
          }
        )

        expect(response.body.data.storageDirChildren.list).toEqual(toGQLResponseStorageNodes([fileNode]))
      })
    })

    describe('ユーザーファイル', () => {
      it('自ユーザーのファイルにアクセス', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            headers: StorageUserHeader(),
          }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(fileNode))
      })

      it('自ユーザーのルートディレクトリにアクセス', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
        const [, userDirNode] = await storageService.createHierarchicalDirs([`${userDirPath}`])

        const response = await requestGQL(
          app,
          {
            ...gqlGetStorageNode,
            variables: { input: { path: `${userDirPath}` } },
          },
          {
            // 自ユーザーでアクセス
            headers: StorageUserHeader(),
          }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(userDirNode))
      })

      it('アプリケーション管理者でアクセス', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            headers: AppAdminUserHeader(),
          }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(fileNode))
      })

      it('自ユーザー以外でアクセス', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            headers: GeneralUserHeader(),
          }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })
  })

  describe('serveFile', () => {
    let app: any

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    describe('ユーザーファイル', () => {
      it('ファイルは公開設定 -> 誰でもアクセス可能', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            .set({ ...StorageUserHeader() })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは非公開設定 -> 他ユーザーはアクセス不可', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            .set({ ...AppAdminUserHeader() })
            .expect(403)
        )
      })

      it('ファイルは公開未設定 -> 自ユーザーはアクセス可能', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            .set({ ...StorageUserHeader() })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは公開未設定 -> 他ユーザーはアクセス不可', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            .set({ ...AppAdminUserHeader() })
            .expect(403)
        )
      })

      it('ファイルに読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
        await storageService.setFileShareSettings(fileNode.path, { readUIds: [AppAdminUser().uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 読み込み権限に設定した他ユーザーを設定
            .set({ ...AppAdminUserHeader() })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは公開未設定 + 上位ディレクトリに公開設定 -> 他ユーザーもアクセス可能', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            .set({ ...AppAdminUserHeader() })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルは非公開設定 + 上位ディレクトリに公開設定 -> 他ユーザーはアクセス不可', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
            .set({ ...AppAdminUserHeader() })
            .expect(403)
        )
      })

      it('ファイルは公開未設定 + 上位ディレクトリに読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
        await storageService.setDirShareSettings(`${userDirPath}/d1`, { readUIds: [AppAdminUser().uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 読み込み権限に設定した他ユーザーを設定
            .set({ ...AppAdminUserHeader() })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })

      it('ファイルに読み込み権限設定 + 上位ディレクトリに読み込み権限設定 -> 他ユーザーもアクセス不可', async () => {
        const userDirPath = StorageService.toUserRootPath(StorageUserToken())
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
        await storageService.setDirShareSettings(`${userDirPath}/d1`, { readUIds: [AppAdminUser().uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 上位ディレクトリに設定した読み込み権限ではなく、
            // ファイルに設定した読み込み権限が適用されるため、アクセス不可
            .set({ ...AppAdminUserHeader() })
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
            .set({ ...AppAdminUserHeader() })
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
            .set({ ...StorageUserHeader() })
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
            .set({ ...AppAdminUserHeader() })
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
            .set({ ...StorageUserHeader() })
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
        await storageService.setFileShareSettings(fileNode.path, { readUIds: [StorageUser().uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 読み込み権限に設定したアプリケーション管理者以外を設定
            .set({ ...StorageUserHeader() })
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
            .set({ ...StorageUserHeader() })
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
            .set({ ...StorageUserHeader() })
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
        await storageService.setDirShareSettings(`d1`, { readUIds: [StorageUser().uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 読み込み権限に設定したアプリケーション管理者以外を設定
            .set({ ...StorageUserHeader() })
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
        await storageService.setDirShareSettings(`d1`, { readUIds: [StorageUser().uid] })

        return (
          request(app.getHttpServer())
            .get(`/${fileNode.id}`)
            // 上位ディレクトリに設定した読み込み権限ではなく、
            // ファイルに設定した読み込み権限が適用されるため、アクセス不可
            .set({ ...StorageUserHeader() })
            .expect(403)
        )
      })
    })
  })

  describe('streamFile', () => {
    let app: any

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    it('画像ファイルをダウンロード', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const localFilePath = `${__dirname}/${TestFilesDir}/desert.jpg`
      const fileNodePath = `d1/desert.jpg`
      const [fileNode] = await storageService.uploadLocalFiles([{ localFilePath, fileNodePath }])

      return request(app.getHttpServer())
        .get(`/${fileNode.id}`)
        .set({ ...AppAdminUserHeader() })
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
        .get(`/${fileNode.id}`)
        .set({ ...AppAdminUserHeader() })
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
        .get(`/${fileNode.id}`)
        .set({ ...AppAdminUserHeader() })
        .set('If-Modified-Since', fileNode.updatedAt.toString())
        .expect(304)
    })

    it('存在しないファイルを指定', async () => {
      return request(app.getHttpServer())
        .get(`/12345678901234567890`)
        .set({ ...AppAdminUserHeader() })
        .expect(404)
    })
  })
})
