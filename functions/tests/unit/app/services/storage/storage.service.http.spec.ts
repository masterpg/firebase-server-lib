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
  ArticleContentFields,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  GetArticleSrcContentResult,
  StorageService,
  StorageServiceDI,
} from '../../../../../src/app/services'
import { LangCode, ToDeepRawDate } from 'web-base-lib'
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

type RawGetArticleSrcContentResult = ToDeepRawDate<GetArticleSrcContentResult>

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

    async function setupArticleNodes(lang: LangCode) {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドル
      const bundle = await storageService.createArticleTypeDir({
        lang,
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1
      let art1 = await storageService.createArticleTypeDir({
        lang,
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })
      await storageService.saveArticleSrcContent(art1, {
        lang,
        srcContent: '# 記事1',
        searchContent: '記事1',
      })
      await storageService.saveArticleDraftContent(art1, {
        lang,
        draftContent: '# 記事下書き1',
      })
      art1 = await storageService.sgetNode(art1, [
        ArticleContentFields[lang].SrcContent,
        ArticleContentFields[lang].DraftContent,
        ArticleContentFields[lang].SearchContent,
      ])

      // 記事1のレスポンス
      const art1_response: RawGetArticleSrcContentResult = {
        id: art1.id,
        label: art1.article!.label[lang]!,
        srcContent: art1.article!.src![lang]!.srcContent!,
        dir: [{ id: bundle.id, label: bundle.article!.label[lang]! }],
        path: [
          { id: bundle.id, label: bundle.article!.label[lang]! },
          { id: art1.id, label: art1.article!.label[lang]! },
        ],
        isPublic: false,
        createdAt: art1.article!.src![lang]!.createdAt!.toISOString(),
        updatedAt: art1.article!.src![lang]!.updatedAt!.toISOString(),
      }

      return { bundle, art1, art1_response }
    }

    it('記事は公開設定 -> 誰でもアクセス可能', async () => {
      const { art1, art1_response } = await setupArticleNodes('ja')

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      // Authorizationヘッダーを設定しない
      await request(app.getHttpServer())
        .get(`/articles/${art1.id}?lang=ja`)
        .expect(200)
        .then((res: Response) => {
          expect(res.body).toEqual<RawGetArticleSrcContentResult>({
            ...art1_response,
            isPublic: true,
          })
        })
    })

    it('記事は非公開設定 -> 他ユーザーはアクセス不可', async () => {
      const { art1 } = await setupArticleNodes('ja')

      // 記事を公開未設定
      await storageService.setDirShareDetail(art1, { isPublic: false })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}?lang=ja`)
          // 他ユーザーを指定
          .set({ ...AppAdminUserHeader() })
          .expect(403)
      )
    })

    it('記事に読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
      const { art1, art1_response } = await setupArticleNodes('ja')

      // 記事に読み込み権限設定
      await storageService.setDirShareDetail(art1, { readUIds: [GeneralUser().uid] })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}?lang=ja`)
          // 読み込み権限に設定した他ユーザーを設定
          .set({ ...GeneralUserHeader() })
          .expect(200)
          .then((res: Response) => {
            expect(res.body).toEqual<RawGetArticleSrcContentResult>(art1_response)
          })
      )
    })

    it('存在しない記事を指定した場合', async () => {
      await setupArticleNodes('ja')

      return request(app.getHttpServer()).get(`/articles/12345678901234567890?lang=ja`).expect(404)
    })

    it('記事以外を指定した場合', async () => {
      const { bundle } = await setupArticleNodes('ja')

      // 記事ではなくバンドルを指定
      return request(app.getHttpServer()).get(`/articles/${bundle.id}?lang=ja`).expect(404)
    })

    it('304 Not Modified の検証 - 公開', async () => {
      const { art1 } = await setupArticleNodes('ja')

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}?lang=ja`)
          // If-Modified-Sinceを設定
          .set('If-Modified-Since', art1.article!.src!['ja']!.updatedAt!.toString())
          .expect(304)
      )
    })

    it('304 Not Modified の検証 - 非公開', async () => {
      const { art1 } = await setupArticleNodes('ja')

      // 記事を非公開設定
      await storageService.setDirShareDetail(art1, { isPublic: false })

      return (
        request(app.getHttpServer())
          .get(`/articles/${art1.id}?lang=ja`)
          // If-Modified-Sinceを設定
          .set('If-Modified-Since', art1.article!.src!['ja']!.updatedAt!.toString())
          // 自ユーザーを設定
          .set({ ...StorageUserHeader() })
          .expect(304)
      )
    })

    it('日本語', async () => {
      const { art1, art1_response } = await setupArticleNodes('ja')

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      // テスト対象実行
      return request(app.getHttpServer())
        .get(`/articles/${art1.id}?lang=ja`)
        .expect(200)
        .then((res: Response) => {
          expect(res.body).toEqual<RawGetArticleSrcContentResult>({
            ...art1_response,
            isPublic: true,
          })
        })
    })

    it('英語', async () => {
      const { art1, art1_response } = await setupArticleNodes('en')

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      // テスト対象実行
      return request(app.getHttpServer())
        .get(`/articles/${art1.id}?lang=en`)
        .expect(200)
        .then((res: Response) => {
          expect(res.body).toEqual<RawGetArticleSrcContentResult>({
            ...art1_response,
            isPublic: true,
          })
        })
    })

    it('読み込み権限の検証が行われているか確認', async () => {
      const validateReadable = td.replace(storageService, 'validateReadable')

      // 記事に非公開設定
      const { art1 } = await setupArticleNodes('ja')
      await storageService.setDirShareDetail(art1, { isPublic: false })
      const hierarchicalNodes = await storageService.getHierarchicalNodes(art1.path, [ArticleContentFields.ja.SrcContent])

      // テスト対象実行
      return request(app.getHttpServer())
        .get(`/articles/${art1.id}?lang=ja`)
        .set({ ...StorageUserHeader() })
        .expect(200)
        .then((res: Response) => {
          const exp = td.explain(validateReadable)
          expect(exp.calls.length).toBe(1)
          expect(exp.calls[0].args).toEqual([StorageUserToken(), art1.path, hierarchicalNodes])
        })
    })
  })
})
