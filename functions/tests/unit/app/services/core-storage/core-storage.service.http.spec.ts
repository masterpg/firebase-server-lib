import * as fs from 'fs'
import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  CoreStorageTestHelper,
  CoreStorageTestService,
  GeneralUser,
  GeneralUserHeader,
  StorageUser,
  StorageUserToken,
} from '../../../../helpers/app'
import { DevUtilsServiceDI, DevUtilsServiceModule, StorageServiceDI } from '../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import { CoreStorageService } from '../../../../../src/app/services/core-storage'
import Lv1GQLContainerModule from '../../../../../src/app/gql/main/lv1'
import { Response } from 'supertest'
import StorageRESTModule from '../../../../../src/app/rest/storage'
import { initApp } from '../../../../../src/app/base'
import request = require('supertest')

jest.setTimeout(15000)
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

describe('CoreStorageService - HTTP関連のテスト', () => {
  let testingModule!: TestingModule
  let storageService!: CoreStorageTestService
  let devUtilsService!: DevUtilsServiceDI.type
  let h!: CoreStorageTestHelper

  beforeEach(async () => {
    testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule, StorageRESTModule, Lv1GQLContainerModule],
    }).compile()

    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    storageService = testingModule.get<CoreStorageTestService>(StorageServiceDI.symbol)
    h = new CoreStorageTestHelper(storageService)

    await h.removeAllNodes()

    await devUtilsService.setTestFirebaseUsers(AppAdminUser(), StorageUser())

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    // await sleep(1500)
  })

  afterEach(() => {
    td.reset()
  })

  describe('serveFile', () => {
    let app: any

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    describe('ユーザーファイル', () => {
      it('ファイルは公開設定 -> 誰でもアクセス可能', async () => {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userRootPath}/d1/fileA.txt`,
          },
        ])

        // ファイルを公開設定
        await storageService.setFileShareDetail(fileNode, { isPublic: true })

        // Authorizationヘッダーを設定しない
        return request(app.getHttpServer())
          .get(`/nodes/${fileNode.id}`)
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(fileData)
          })
      })

      it('ファイルは非公開設定 -> 他ユーザーはアクセス不可', async () => {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userRootPath}/d1/fileA.txt`,
          },
        ])

        // ファイルを非公開設定
        await storageService.setFileShareDetail(fileNode, { isPublic: false })

        return (
          request(app.getHttpServer())
            .get(`/nodes/${fileNode.id}`)
            // 他ユーザーを設定
            .set({ ...AppAdminUserHeader() })
            .expect(403)
        )
      })

      it('ファイルに読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
        const userRootPath = CoreStorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([`${userRootPath}/d1`])
        const fileData = 'test'
        const [fileNode] = await storageService.uploadDataItems([
          {
            data: fileData,
            contentType: 'text/plain; charset=utf-8',
            path: `${userRootPath}/d1/fileA.txt`,
          },
        ])

        // ファイルに読み込み権限設定
        await storageService.setFileShareDetail(fileNode, { readUIds: [GeneralUser().uid] })

        return (
          request(app.getHttpServer())
            .get(`/nodes/${fileNode.id}`)
            // 読み込み権限に設定した他ユーザーを設定
            .set({ ...GeneralUserHeader() })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
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
        await storageService.setFileShareDetail(fileNode, { isPublic: true })

        // Authorizationヘッダーを設定しない
        return request(app.getHttpServer())
          .get(`/nodes/${fileNode.id}`)
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(fileData)
          })
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
        await storageService.setFileShareDetail(fileNode, { isPublic: false })

        return (
          request(app.getHttpServer())
            .get(`/nodes/${fileNode.id}`)
            // アプリケーション管理者以外を設定
            .set({ ...GeneralUserHeader() })
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
        await storageService.setFileShareDetail(fileNode, { readUIds: [GeneralUser().uid] })

        return (
          request(app.getHttpServer())
            .get(`/nodes/${fileNode.id}`)
            // 読み込み権限に設定したアプリケーション管理者以外を設定
            .set({ ...GeneralUserHeader() })
            .expect(200)
            .then((res: Response) => {
              expect(res.text).toEqual(fileData)
            })
        )
      })
    })

    it('存在しないファイルを指定した場合', async () => {
      return request(app.getHttpServer()).get(`/nodes/12345678901234567890`).expect(404)
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
        .get(`/nodes/${fileNode.id}`)
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
        .get(`/nodes/${fileNode.id}`)
        .set({ ...AppAdminUserHeader() })
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(fileData)
        })
    })

    it('304 Not Modified の検証', async () => {
      await storageService.createHierarchicalDirs([`d1`])
      const [fileNode] = await storageService.uploadDataItems([
        {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `d1/fileA.txt`,
        },
      ])

      return (
        request(app.getHttpServer())
          .get(`/nodes/${fileNode.id}`)
          .set({ ...AppAdminUserHeader() })
          // If-Modified-Sinceを設定
          .set('If-Modified-Since', fileNode.updatedAt.toString())
          .expect(304)
      )
    })

    it('存在しないファイルを指定', async () => {
      return request(app.getHttpServer())
        .get(`/nodes/12345678901234567890`)
        .set({ ...AppAdminUserHeader() })
        .expect(404)
    })
  })
})
