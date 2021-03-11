import * as td from 'testdouble'
import {
  AppAdminUser,
  GeneralUser,
  GeneralUserHeader,
  StorageTestHelper,
  StorageTestService,
  StorageUser,
  StorageUserHeader,
  StorageUserToken,
} from '../../../../helpers/app'
import { DevUtilsServiceDI, DevUtilsServiceModule, StorageService, StorageServiceDI } from '../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
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
    storageService = testingModule.get<StorageTestService>(StorageServiceDI.symbol)
    h = new StorageTestHelper(storageService)

    await h.removeAllNodes()

    await devUtilsService.setTestFirebaseUsers(AppAdminUser(), StorageUser())

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    // await sleep(1500)
  })

  afterEach(() => {
    td.reset()
  })

  describe('serveArticle', () => {
    let app: any

    beforeEach(async () => {
      app = testingModule.createNestApplication()
      await app.init()
    })

    async function setupArticleNodes() {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドル
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
      })
      // 記事1のマスターファイル
      await storageService.saveArticleMasterSrcFile(art1.path, '#header1', 'header1')
      const art1_master = await storageService.sgetFileNode({
        path: StorageService.toArticleSrcMasterPath(art1.path),
      })

      return { bundle, art1, art1_master }
    }

    it('記事は公開設定 -> 誰でもアクセス可能', async () => {
      const { art1, art1_master } = await setupArticleNodes()
      const art1_master_content = (await art1_master.file.download()).toString()

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      // Authorizationヘッダーを設定しない
      return request(app.getHttpServer())
        .get(`/articles/${art1.id}`)
        .expect(200)
        .then((res: Response) => {
          expect(res.text).toEqual(art1_master_content)
        })
    })

    it('記事は非公開設定 -> 自ユーザーはアクセス可能', async () => {
      const { art1, art1_master } = await setupArticleNodes()
      const art1_master_content = (await art1_master.file.download()).toString()

      // 記事を非公開設定
      await storageService.setDirShareDetail(art1, { isPublic: false })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 自ユーザーを設定
          .set({ ...StorageUserHeader() })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(art1_master_content)
          })
      )
    })

    it('記事は非公開設定 -> 他ユーザーはアクセス不可', async () => {
      const { art1, art1_master } = await setupArticleNodes()

      // 記事を公開未設定
      await storageService.setDirShareDetail(art1, { isPublic: false })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 他ユーザーを設定
          .set({ ...GeneralUserHeader() })
          .expect(403)
      )
    })

    it('記事は公開未設定 -> 自ユーザーはアクセス可能', async () => {
      const { art1, art1_master } = await setupArticleNodes()
      const art1_master_content = (await art1_master.file.download()).toString()

      // 記事を非公開設定
      await storageService.setDirShareDetail(art1, { isPublic: null })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 自ユーザーを設定
          .set({ ...StorageUserHeader() })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(art1_master_content)
          })
      )
    })

    it('記事は非公開未設定 -> 他ユーザーはアクセス不可', async () => {
      const { art1, art1_master } = await setupArticleNodes()

      // 記事を公開未設定
      await storageService.setDirShareDetail(art1, { isPublic: null })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 他ユーザーを設定
          .set({ ...GeneralUserHeader() })
          .expect(403)
      )
    })

    it('記事に読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
      const { art1, art1_master } = await setupArticleNodes()
      const art1_master_content = (await art1_master.file.download()).toString()

      // 記事に読み込み権限設定
      await storageService.setDirShareDetail(art1, { readUIds: [GeneralUser().uid] })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 読み込み権限に設定した他ユーザーを設定
          .set({ ...GeneralUserHeader() })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(art1_master_content)
          })
      )
    })

    it('記事は公開未設定 + 上位ディレクトリに公開設定 -> 他ユーザーもアクセス可能', async () => {
      const { bundle, art1, art1_master } = await setupArticleNodes()
      const art1_master_content = (await art1_master.file.download()).toString()

      // 上位ディレクトリに公開設定
      await storageService.setDirShareDetail(bundle, { isPublic: true })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 他ユーザーを設定
          .set({ ...GeneralUserHeader() })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(art1_master_content)
          })
      )
    })

    it('記事は非公開設定 + 上位ディレクトリに公開設定 -> 他ユーザーはアクセス不可', async () => {
      const { bundle, art1, art1_master } = await setupArticleNodes()

      // 記事に非公開設定
      await storageService.setDirShareDetail(art1, { isPublic: false })
      // 上位ディレクトリに公開設定
      await storageService.setDirShareDetail(bundle, { isPublic: true })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 他ユーザーを設定
          .set({ ...GeneralUserHeader() })
          .expect(403)
      )
    })

    it('記事は公開未設定 + 上位ディレクトリに読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
      const { bundle, art1, art1_master } = await setupArticleNodes()
      const art1_master_content = (await art1_master.file.download()).toString()

      // 上位ディレクトリに読み込み権限設定
      await storageService.setDirShareDetail(bundle, { readUIds: [GeneralUser().uid] })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 読み込み権限に設定した他ユーザーを設定
          .set({ ...GeneralUserHeader() })
          .expect(200)
          .then((res: Response) => {
            expect(res.text).toEqual(art1_master_content)
          })
      )
    })

    it('記事に読み込み権限設定 + 上位ディレクトリに読み込み権限設定 -> 他ユーザーはアクセス不可', async () => {
      const { bundle, art1, art1_master } = await setupArticleNodes()
      const art1_master_content = (await art1_master.file.download()).toString()

      // 記事に読み込み権限設定
      await storageService.setDirShareDetail(art1, { readUIds: ['ichiro'] })
      // 上位ディレクトリに読み込み権限設定
      await storageService.setDirShareDetail(bundle, { readUIds: [GeneralUser().uid] })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 上位ディレクトリに設定した読み込み権限ではなく、
          // 記事に設定した読み込み権限が適用されるため、アクセス不可
          .set({ ...GeneralUserHeader() })
          .expect(403)
      )
    })
  })
})
