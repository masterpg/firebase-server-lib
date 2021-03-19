import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  GeneralUser,
  GeneralUserHeader,
  StorageTestHelper,
  StorageTestService,
  StorageUser,
  StorageUserHeader,
  StorageUserToken,
} from '../../../../helpers/app'
import {
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  GetArticleSrcResult,
  OmitTimestamp,
  StorageService,
  StorageServiceDI,
} from '../../../../../src/app/services'
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

type RawGetArticleSrcResult = OmitTimestamp<GetArticleSrcResult> & { createdAt: string; updatedAt: string }

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

  describe('serveArticleSrc', () => {
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
      await storageService.saveArticleMasterSrcFile(art1.path, '# header1', 'header1')
      const art1_master = await storageService.sgetFileNode({
        path: StorageService.toArticleMasterSrcPath(art1.path),
      })

      // 記事1のレスポンス
      const art1_response: RawGetArticleSrcResult = {
        id: art1.id,
        title: art1.article!.dir!.name,
        src: '# header1',
        dir: [{ id: bundle.id, title: bundle.article!.dir!.name }],
        path: [
          { id: bundle.id, title: bundle.article!.dir!.name },
          { id: art1.id, title: art1.article!.dir!.name },
        ],
        createdAt: art1_master.createdAt.toISOString(),
        updatedAt: art1_master.updatedAt.toISOString(),
      }

      return { bundle, art1, art1_master, art1_response }
    }

    it('記事は公開設定 -> 誰でもアクセス可能', async () => {
      const { art1, art1_response } = await setupArticleNodes()

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      // Authorizationヘッダーを設定しない
      return request(app.getHttpServer())
        .get(`/articles/${art1.id}`)
        .expect(200)
        .then((res: Response) => {
          expect(res.body).toEqual(art1_response)
        })
    })

    it('記事は非公開設定 -> 他ユーザーはアクセス不可', async () => {
      const { art1 } = await setupArticleNodes()

      // 記事を公開未設定
      await storageService.setDirShareDetail(art1, { isPublic: false })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 他ユーザーを設定
          .set({ ...AppAdminUserHeader() })
          .expect(403)
      )
    })

    it('記事に読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
      const { art1, art1_response } = await setupArticleNodes()

      // 記事に読み込み権限設定
      await storageService.setDirShareDetail(art1, { readUIds: [GeneralUser().uid] })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // 読み込み権限に設定した他ユーザーを設定
          .set({ ...GeneralUserHeader() })
          .expect(200)
          .then((res: Response) => {
            expect(res.body).toEqual(art1_response)
          })
      )
    })

    it('存在しない記事を指定した場合', async () => {
      await setupArticleNodes()

      return request(app.getHttpServer())
        .get(`/articles/12345678901234567890`)
        .expect(200)
        .then((res: Response) => {
          expect(res.body).toBeNull()
        })
    })

    it('304 Not Modified の検証 - 公開', async () => {
      const { art1 } = await setupArticleNodes()

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // If-Modified-Sinceを設定
          .set('If-Modified-Since', art1.updatedAt.toString())
          .expect(304)
      )
    })

    it('304 Not Modified の検証 - 非公開', async () => {
      const { art1 } = await setupArticleNodes()

      // 記事を非公開設定
      await storageService.setDirShareDetail(art1, { isPublic: false })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}`)
          // If-Modified-Sinceを設定
          .set('If-Modified-Since', art1.updatedAt.toString())
          // 自ユーザーを設定
          .set({ ...StorageUserHeader() })
          .expect(304)
      )
    })
  })
})
