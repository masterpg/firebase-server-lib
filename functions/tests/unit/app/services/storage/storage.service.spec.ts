import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserToken,
  GeneralUser,
  GeneralUserToken,
  StorageTestHelper,
  StorageTestService,
  StorageUser,
  StorageUserToken,
} from '../../../../helpers/app'
import { AppError, initApp } from '../../../../../src/app/base'
import {
  ArticleContentFields,
  ArticleDirLabelByLang,
  ArticleListItem,
  ArticleTableOfContentsItem,
  CreateArticleTypeDirInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  GetArticleSrcContentResult,
  Pager,
  SaveArticleSrcContentInput,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeShareDetail,
  StorageSchema,
  StorageService,
  StorageServiceDI,
  StorageServiceModule,
  StorageUploadDataItem,
} from '../../../../../src/app/services'
import { LangCode, pickProps, shuffleArray } from 'web-base-lib'
import { HttpException } from '@nestjs/common/exceptions/http.exception'
import { Test } from '@nestjs/testing'
import { config } from '../../../../../src/config'
import dayjs = require('dayjs')
const performance = require('perf_hooks').performance

jest.setTimeout(30000)
initApp()

//========================================================================
//
//  Test helpers
//
//========================================================================

export function EmptyShareDetail(): StorageNodeShareDetail {
  return {
    isPublic: undefined,
    readUIds: undefined,
    writeUIds: undefined,
  }
}

//========================================================================
//
//  Tests
//
//========================================================================

describe('StorageService', () => {
  let storageService!: StorageTestService
  let devUtilsService!: DevUtilsServiceDI.type
  let h!: StorageTestHelper

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule],
    }).compile()

    devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  })

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule, StorageServiceModule],
    }).compile()

    storageService = testingModule.get<StorageTestService>(StorageServiceDI.symbol)
    h = new StorageTestHelper(storageService)

    await h.removeAllNodes()
    await h.removeAllTags()

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    // await sleep(1500)
  })

  afterEach(() => {
    td.reset()
  })

  describe('createArticleTypeDir', () => {
    describe('バンドル作成', () => {
      it('ベーシックケース', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])

        // テスト対象実行
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        }
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
        expect(actual.article!.type).toBe(input.type)
        expect(actual.article!.sortOrder).toBe(1)
        expect(actual.share).toEqual<StorageNodeShareDetail>({ isPublic: false, readUIds: undefined, writeUIds: undefined })
        await h.existsNodes([actual])
      })

      it('ベーシックケース - 日本語', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])

        // テスト対象実行
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        }
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
      })

      it('ベーシックケース - 英語', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])

        // テスト対象実行
        const input: CreateArticleTypeDirInput = {
          lang: 'en',
          dir: `${articleRootPath}`,
          label: 'Bundle',
          type: 'ListBundle',
        }
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ en: input.label })
      })

      it('共有設定を指定した場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])

        // テスト対象実行
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.share).toEqual(input.share)
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])

        // バンドル1の作成
        const bundle1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル1',
          type: 'ListBundle',
        })
        // バンドル2の作成
        const bundle2 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル2',
          type: 'ListBundle',
        })

        expect(bundle1.article!.sortOrder).toBe(1)
        expect(bundle2.article!.sortOrder).toBe(2)
      })

      it('同じ名前のバンドルを作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        }
        await storageService.createArticleTypeDir(input)

        // テスト対象実行
        // ※同じ名前のバンドルを再度作成
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
        expect(actual.article!.type).toBe(input.type)
        expect(actual.article!.sortOrder).toBe(2)
        expect(actual.share).toEqual<StorageNodeShareDetail>({ isPublic: false, readUIds: undefined, writeUIds: undefined })
        await h.existsNodes([actual])
      })

      it('バンドルをバケット直下に作成しようとした場合', async () => {
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: ``,
          label: 'バンドル',
          type: 'ListBundle',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        // バケット直下が指定されたことで親パスが空文字となり、空文字でノード検索が行われるためエラーとなる
        expect(actual.cause).toBe(`Either the 'id' or the 'path' must be specified.`)
      })

      it('バンドルを記事ルート直下ではなくさらに下の階層に作成しようとした場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドル作成の引数
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${articleRootPath}/aaa`,
          label: 'バンドル',
          type: 'ListBundle',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`The article bundle must be created directly under the article root.`)
        expect(actual.data).toEqual({ input: pickProps(input, ['dir', 'label', 'type']) })
      })

      it('バンドルの祖先が存在しない場合', async () => {
        // ユーザーディレクトリの作成
        const usersPath = StorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([usersPath])
        // バンドル作成の引数
        // ※記事ルートが存在しない状態でバンドル作成を試みる
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`The ancestor of the specified path does not exist.`)
        expect(actual.data!.specifiedPath).toMatch(new RegExp(`${articleRootPath}/[^/]+$`))
        expect(actual.data!.ancestorPath).toBe(articleRootPath)
      })
    })

    describe('カテゴリ作成', () => {
      it('ベーシックケース - ツリーバンドル直下に作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
        expect(actual.article!.type).toBe(input.type)
        expect(actual.article!.sortOrder).toBe(1)
        expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
        await h.existsNodes([actual])
      })

      it('ベーシックケース - カテゴリ直下に作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1を作成
        const cat1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        })
        // カテゴリ11作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${cat1.path}`,
          label: 'カテゴリ11',
          type: 'Category',
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
        expect(actual.article!.type).toBe(input.type)
        expect(actual.article!.sortOrder).toBe(1)
        expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
        await h.existsNodes([actual])
      })

      it('ベーシックケース - 日本語', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ1',
          type: 'Category',
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
      })

      it('ベーシックケース - 英語', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'en',
          dir: `${articleRootPath}`,
          label: 'Bundle',
          type: 'TreeBundle',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'en',
          dir: `${bundle.path}`,
          label: 'Category1',
          type: 'Category',
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ en: input.label })
      })

      it('共有設定を指定した場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ1',
          type: 'Category',
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.share).toEqual(input.share)
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'TreeBundle',
        })

        // カテゴリ1を作成
        const cat1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        })
        // カテゴリ2を作成
        const cat2 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ2',
          type: 'Category',
        })

        expect(cat1.article!.sortOrder).toBe(1)
        expect(cat2.article!.sortOrder).toBe(2)
      })

      it('同じ名前のカテゴリを作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        }
        const cat1 = await storageService.createArticleTypeDir(input)

        // テスト対象実行
        // ※同じ名前のカテゴリを再度作成
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
        expect(actual.article!.type).toBe(input.type)
        expect(actual.article!.sortOrder).toBe(2)
        expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
        await h.existsNodes([actual])
      })

      it('バケット直下にカテゴリを作成しようとした場合', async () => {
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: ``,
          label: 'カテゴリ1',
          type: 'Category',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        // バケット直下が指定されたことで親パスが空文字となり、空文字でノード検索が行われるためエラーとなる
        expect(actual.cause).toBe(`Either the 'id' or the 'path' must be specified.`)
      })

      it('ユーザールート直下にカテゴリを作成しようとした場合', async () => {
        // ユーザールートの作成
        const userRootPath = StorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([userRootPath])
        const userRootNode = await storageService.sgetNode({ path: userRootPath })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${userRootNode.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Categories cannot be created under the specified parent.`)
        expect(actual.data).toEqual({
          parentNode: pickProps(userRootNode, ['id', 'path', 'article']),
        })
      })

      it('リストバンドル直下にカテゴリを作成しようとした作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // リストバンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Categories cannot be created under the specified parent.`)
        expect(actual.data).toEqual({
          parentNode: pickProps(bundle, ['id', 'path', 'article']),
        })
      })

      it('記事配下にカテゴリを作成しようとした作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: '',
          type: 'TreeBundle',
        })
        // 記事1の作成
        const art1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${bundle.path}`,
          label: '記事1',
          type: 'Article',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${art1.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Categories cannot be created under the specified parent.`)
        expect(actual.data).toEqual({
          parentNode: pickProps(art1, ['id', 'path', 'article']),
        })
      })

      it('アセットディレクトリにカテゴリを作成しようとした作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // アセットディレクトリの作成
        const assets = await storageService.createArticleGeneralDir({ dir: `${articleRootPath}/${config.storage.article.assetsName}` })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${assets.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Categories cannot be created under the specified parent.`)
        expect(actual.data).toEqual({
          parentNode: pickProps(assets, ['id', 'path', 'article']),
        })
      })

      it('カテゴリの祖先が存在しない場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })
        // カテゴリ1作成の引数を作成
        // ※カテゴリの上位ディレクトリが存在しない状態でカテゴリの作成を試みる
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}/dummy`,
          label: 'カテゴリ1',
          type: 'Category',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`There is no parent directory for the category to be created.`)
        expect(actual.data).toEqual({
          parentPath: `${bundle.path}/dummy`,
        })
      })
    })

    describe('記事作成', () => {
      it('ベーシックケース - バンドル直下に作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: '記事1',
          type: 'Article',
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
        expect(actual.article!.type).toBe(input.type)
        expect(actual.article!.sortOrder).toBe(1)
        expect(actual.article!.src).toBeUndefined()
        expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
        await h.existsNodes([actual])
      })

      it('ベーシックケース - カテゴリ直下に記事を作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1を作成
        const cat1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${bundle.path}`,
          label: 'カテゴリ1',
          type: 'Category',
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${cat1.path}`,
          label: '記事1',
          type: 'Article',
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
        expect(actual.article!.type).toBe(input.type)
        expect(actual.article!.sortOrder).toBe(1)
        expect(actual.article!.src).toBeUndefined()
        expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
        await h.existsNodes([actual])
      })

      it('ベーシックケース - 日本語', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: '記事1',
          type: 'Article',
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
      })

      it('ベーシックケース - 英語', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'en',
          dir: `${articleRootPath}`,
          label: 'Bundle',
          type: 'ListBundle',
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'en',
          dir: `${bundle.path}`,
          label: 'Article1',
          type: 'Article',
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ en: input.label })
      })

      it('共有設定を指定した場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: '記事1',
          type: 'Article',
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.share).toEqual(input.share)
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })

        // 記事1の作成
        const art1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${bundle.path}`,
          label: '記事1',
          type: 'Article',
        })
        // 記事2の作成
        const art2 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${bundle.path}`,
          label: '記事2',
          type: 'Article',
        })

        expect(art1.article!.sortOrder).toBe(1)
        expect(art2.article!.sortOrder).toBe(2)
      })

      it('同じ名前の記事を作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })
        // 記事を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}`,
          label: '記事1',
          type: 'Article',
        }
        const art1 = await storageService.createArticleTypeDir(input)

        // テスト対象実行
        // ※同名の記事作成を試みる
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: input.label })
        expect(actual.article!.type).toBe(input.type)
        expect(actual.article!.sortOrder).toBe(2)
        expect(actual.article!.src).toBeUndefined()
        expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
        await h.existsNodes([actual])
      })

      it('バケット直下に記事を作成しようとした場合', async () => {
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: ``,
          label: '記事1',
          type: 'Article',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        // バケット直下が指定されたことで親パスが空文字となり、空文字でノード検索が行われるためエラーとなる
        expect(actual.cause).toBe(`Either the 'id' or the 'path' must be specified.`)
      })

      it('ユーザールート直下に記事を作成しようとした場合', async () => {
        // ユーザールートの作成
        const userRootPath = StorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([userRootPath])
        const userRootNode = await storageService.sgetNode({ path: userRootPath })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${userRootPath}`,
          label: '記事1',
          type: 'Article',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Articles cannot be created under the specified parent.`)
        expect(actual.data).toEqual({
          parentNode: pickProps(userRootNode, ['id', 'path', 'article']),
        })
      })

      it('記事の祖先が存在しない場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1作成の引数を作成
        // ※カテゴリの上位ディレクトリが存在しない状態で記事作成を試みる
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${bundle.path}/dummy`,
          label: '記事1',
          type: 'Article',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`There is no parent directory for the article to be created.`)
        expect(actual.data).toEqual({
          parentPath: `${input.dir}`,
        })
      })

      it('記事の祖先に記事が存在する場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRootPath}`,
          label: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1を作成
        const art1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${bundle.path}`,
          label: '記事1',
          type: 'Article',
        })
        // 記事11作成の引数を作成
        // ※作成した記事の下にさらに記事を作成するよう準備
        const input: CreateArticleTypeDirInput = {
          lang: 'ja',
          dir: `${art1.path}`,
          label: '記事11',
          type: 'Article',
        }

        let actual!: AppError
        try {
          // テスト対象実行
          await storageService.createArticleTypeDir(input)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Articles cannot be created under the specified parent.`)
        expect(actual.data).toEqual({
          parentNode: pickProps(art1, ['id', 'path', 'article']),
        })
      })
    })

    describe('権限の検証', () => {
      async function setupArticleNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageArticleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const [storage_root, storage_article_root] = await storageService.createHierarchicalDirs([storageArticleRootPath])

        const generalArticleRootPath = StorageService.toArticleRootPath(GeneralUserToken())
        const [general_root, general_article_root] = await storageService.createHierarchicalDirs([generalArticleRootPath])

        return {
          users,
          storage: { userRoot: storage_root, articleRoot: storage_article_root },
          general: { userRoot: general_root, articleRoot: general_article_root },
        }
      }

      it('自ユーザーの記事系ディレクトリを作成', async () => {
        const { storage } = await setupArticleNodes()

        const actual = await storageService.createArticleTypeDir(StorageUserToken(), {
          lang: 'ja',
          dir: `${storage.articleRoot.path}`,
          label: 'バンドル',
          type: 'ListBundle',
        })

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
      })

      it('他ユーザーの記事系ディレクトリを作成', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          await storageService.createArticleTypeDir(GeneralUserToken(), {
            lang: 'ja',
            dir: `${storage.articleRoot.path}`,
            label: 'バンドル',
            type: 'ListBundle',
          })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーの記事系ディレクトリを作成', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          await storageService.createArticleTypeDir(AppAdminUserToken(), {
            lang: 'ja',
            dir: `${storage.articleRoot.path}`,
            label: 'バンドル',
            type: 'ListBundle',
          })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })
    })
  })

  describe('createArticleGeneralDir', () => {
    it('ベーシックケース - アセットディレクトリの作成', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // アセットディレクトリの作成
      const assetsPath = StorageService.toArticleAssetsPath(StorageUserToken())
      const actual = await storageService.createArticleGeneralDir({ dir: assetsPath })

      expect(actual.path).toBe(assetsPath)
      expect(actual.article).toBeUndefined()
      await h.existsNodes([actual])
    })

    it('ベーシックケース - アセットディレクトリ配下にディレクトリを作成', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir({
        dir: StorageService.toArticleAssetsPath(StorageUserToken()),
      })

      // アセットディレクトリ配下にディレクトリを作成
      const d1Path = `${assets.path}/d1`
      const actual = await storageService.createArticleGeneralDir({ dir: d1Path })

      expect(actual.path).toBe(d1Path)
      expect(actual.article).toBeUndefined()
      await h.existsNodes([actual])
    })

    it('ベーシックケース - 記事配下にディレクトリを作成', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })

      // 記事配下にディレクトリを作成
      const d1Path = `${art1.path}/d1`
      const actual = await storageService.createArticleGeneralDir({ dir: d1Path })

      expect(actual.path).toBe(d1Path)
      expect(actual.article).toBeUndefined()
      await h.existsNodes([actual])
    })

    it('共有設定を指定した場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // アセットディレクトリの作成
      const assetsPath = StorageService.toArticleAssetsPath(StorageUserToken())
      const share = {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      }
      const actual = await storageService.createArticleGeneralDir({ dir: assetsPath, share })

      expect(actual.path).toBe(assetsPath)
      expect(actual.article).toBeUndefined()
      expect(actual.share).toEqual(share)
      await h.existsNodes([actual])
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定なし', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir({
        dir: StorageService.toArticleAssetsPath(StorageUserToken()),
      })
      // アセットディレクトリ配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir({ dir: `${assets.path}/d1` })

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createArticleGeneralDir({ dir: `${d1.path}` })

      expect(actual).toEqual(d1)
      await h.existsNodes([actual])
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定あり', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir({
        dir: StorageService.toArticleAssetsPath(StorageUserToken()),
      })
      // アセットディレクトリ配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir({ dir: `${assets.path}/d1` })

      // 同じパスのディレクトリ作成を試みる
      const share = {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      }
      const actual = await storageService.createArticleGeneralDir({ dir: `${d1.path}`, share })

      expect(actual.path).toBe(`${d1.path}`)
      expect(actual.share).toEqual(share)
      expect(actual.version).toBe(d1.version + 1)
      await h.existsNodes([actual])
    })

    it('バンドル配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // ディレクトリのパスを作成
      const d1Path = `${bundle.path}/d1`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir({ dir: d1Path })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified path is not under article: '${d1Path}'`)
    })

    it('カテゴリ配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'TreeBundle',
      })
      // カテゴリを作成
      const cat1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: 'バンドル',
        type: 'Category',
      })
      // ディレクトリのパスを作成
      const d1Path = `${cat1.path}/d1`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir({ dir: d1Path })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified path is not under article: '${d1Path}'`)
    })

    it('親ディレクトリが存在しない場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir({
        dir: StorageService.toArticleAssetsPath(StorageUserToken()),
      })
      // アセットディレクトリ配下に親が存在しないディレクトリのパスを作成
      // ※親ディレクトリ'd1'が存在しない
      const d1Path = `${assets.path}/d1`
      const d11Path = `${d1Path}/d1/d11`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir({ dir: d11Path })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The ancestor of the specified path does not exist.`)
      expect(actual.data).toEqual({
        specifiedPath: d11Path,
        ancestorPath: d1Path,
      })
    })

    describe('権限の検証', () => {
      async function setupArticleNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageArticleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const [storage_root, storage_article_root] = await storageService.createHierarchicalDirs([storageArticleRootPath])

        const generalArticleRootPath = StorageService.toArticleRootPath(GeneralUserToken())
        const [general_root, general_article_root] = await storageService.createHierarchicalDirs([generalArticleRootPath])

        return {
          users,
          storage: { userRoot: storage_root, articleRoot: storage_article_root },
          general: { userRoot: general_root, articleRoot: general_article_root },
        }
      }

      it('自ユーザーのディレクトリを作成', async () => {
        await setupArticleNodes()

        const assetsPath = StorageService.toArticleAssetsPath(StorageUserToken())
        const actual = await storageService.createArticleGeneralDir(StorageUserToken(), { dir: assetsPath })

        expect(actual.path).toBe(assetsPath)
      })

      it('他ユーザーのディレクトリを作成', async () => {
        await setupArticleNodes()

        let actual!: AppError
        try {
          const assetsPath = StorageService.toArticleAssetsPath(StorageUserToken())
          await storageService.createArticleGeneralDir(GeneralUserToken(), { dir: assetsPath })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーのディレクトリを作成', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          const assetsPath = StorageService.toArticleAssetsPath(StorageUserToken())
          await storageService.createArticleGeneralDir(AppAdminUserToken(), { dir: assetsPath })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })
    })
  })

  describe('renameArticleTypeDir', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })

      // テスト対象実行
      const actual = await storageService.renameArticleTypeDir({ lang: 'ja', dir: art1.path, label: 'Article1' })

      // 戻り値の検証
      expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: 'Article1' })
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)
      await h.existsNodes([actual])
    })

    it('ベーシックケース - 日本語', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })

      // テスト対象実行
      const actual = await storageService.renameArticleTypeDir({ lang: 'ja', dir: bundle.path, label: 'ばんどる' })

      // 戻り値の検証
      expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ ja: 'ばんどる' })
    })

    it('ベーシックケース - 英語', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'en',
        dir: `${articleRootPath}`,
        label: 'Bundle',
        type: 'ListBundle',
      })

      // テスト対象実行
      const actual = await storageService.renameArticleTypeDir({ lang: 'en', dir: bundle.path, label: 'bundle' })

      // 戻り値の検証
      expect(actual.article!.label).toEqual<ArticleDirLabelByLang>({ en: 'bundle' })
    })

    it('記事配下にあるファイルの名前を変更しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })
      // 記事1の配下にファイルを配置
      const [fileA] = await storageService.uploadDataItems([
        {
          data: 'test',
          contentType: 'text/plain; charset=utf-8',
          path: `${art1.path}/fileA.txt`,
        },
      ])

      let actual!: AppError
      try {
        // 記事1の配下にあるファイルの名前変更を試みる
        await storageService.renameArticleTypeDir({ lang: 'ja', dir: `${fileA.path}`, label: 'dummy' })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified path is not a directory.`)
      expect(actual.data).toEqual({ dir: fileA.path })
    })

    it('記事配下にあるディレクトリの名前を変更しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })
      // 記事1の配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir({ dir: `${art1.path}/d1` })

      let actual!: AppError
      try {
        // 記事1の配下にあるディレクトリの名前変更を試みる
        await storageService.renameArticleTypeDir({ lang: 'ja', dir: `${d1.path}`, label: 'dummy' })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified path is not a article type directory.`)
      expect(actual.data).toEqual({ dir: d1.path })
    })

    it('記事ルート配下でないノードの名前を変更しようとした場合', async () => {
      // ユーザールート配下にノードを作成
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      const [users, user, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])

      let actual!: AppError
      try {
        // 記事ルート配下にないノードの名前変更を試みる
        await storageService.renameArticleTypeDir({ lang: 'ja', dir: `${d1.path}`, label: 'D1' })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified path is not under article root: '${d1.path}'`)
    })

    it('存在しないノードを名前変更しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      let actual!: AppError
      try {
        // パスに存在しないノードを指定
        await storageService.renameArticleTypeDir({ lang: 'ja', dir: `${articleRootPath}/xxx`, label: 'Bundle' })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`There is no node in the specified key.`)
      expect(actual.data).toEqual({ path: `${articleRootPath}/xxx` })
    })

    describe('権限の検証', () => {
      async function setupArticleNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageArticleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const [storage_root, storage_article_root] = await storageService.createHierarchicalDirs([storageArticleRootPath])
        const storage_blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${storageArticleRootPath}`,
          label: 'ブログ',
          type: 'ListBundle',
        })

        const generalArticleRootPath = StorageService.toArticleRootPath(GeneralUserToken())
        const [general_root, general_article_root] = await storageService.createHierarchicalDirs([generalArticleRootPath])
        const general_blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${generalArticleRootPath}`,
          label: 'ブログ',
          type: 'ListBundle',
        })

        return {
          users,
          storage: { userRoot: storage_root, articleRoot: storage_article_root, blog: storage_blog },
          general: { userRoot: general_root, articleRoot: general_article_root, blog: general_blog },
        }
      }

      it('自ユーザーの記事系ディレクトリを名前変更', async () => {
        const { storage } = await setupArticleNodes()

        const actual = await storageService.renameArticleTypeDir(StorageUserToken(), { lang: 'ja', dir: `${storage.blog.path}`, label: 'Blog' })

        expect(actual.article!.label.ja).toBe('Blog')
      })

      it('他ユーザーの記事系ディレクトリを名前変更', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          await storageService.renameArticleTypeDir(GeneralUserToken(), { lang: 'ja', dir: `${storage.blog.path}`, label: 'Blog' })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーの記事系ディレクトリを名前変更', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          await storageService.renameArticleTypeDir(AppAdminUserToken(), { lang: 'ja', dir: `${storage.blog.path}`, label: 'Blog' })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })
    })
  })

  describe('setArticleSortOrder', () => {
    it('ベーシックケース - バンドル直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })

      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
        sortOrder: 1,
      })
      const art2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事2',
        type: 'Article',
        sortOrder: 2,
      })
      const art3 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事3',
        type: 'Article',
        sortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(StorageUserToken(), [art3.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren({ path: bundle.path })).list
      StorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art3.path, art2.path, art1.path])
      expect(nodes.map(node => node.article!.sortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - カテゴリ直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'TreeBundle',
      })
      // カテゴリを作成
      const cat1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: 'カテゴリ1',
        type: 'Category',
      })

      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${cat1.path}`,
        label: '記事1',
        type: 'Article',
        sortOrder: 1,
      })
      const art2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${cat1.path}`,
        label: '記事2',
        type: 'Article',
        sortOrder: 2,
      })
      const art3 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${cat1.path}`,
        label: '記事3',
        type: 'Article',
        sortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(StorageUserToken(), [art3.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren({ path: cat1.path })).list
      StorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art3.path, art2.path, art1.path])
      expect(nodes.map(node => node.article!.sortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - 記事ルート直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // アッセトを作成
      const assets = await storageService.createArticleGeneralDir({
        dir: StorageService.toArticleAssetsPath(StorageUserToken()),
      })

      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル1',
        type: 'ListBundle',
        sortOrder: 1,
      })
      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル2',
        type: 'ListBundle',
        sortOrder: 2,
      })
      // バンドル3を作成
      const bundle3 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル3',
        type: 'ListBundle',
        sortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(StorageUserToken(), [bundle3.path, bundle2.path, bundle1.path])

      const nodes = (await storageService.getChildren({ path: `${articleRootPath}` })).list.filter(node => Boolean(node.article))
      StorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([bundle3.path, bundle2.path, bundle1.path])
      expect(nodes.map(node => node.article!.sortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - カテゴリと記事の混在したディレクトリでソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'TreeBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
        sortOrder: 1,
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事2',
        type: 'Article',
        sortOrder: 2,
      })
      // カテゴリ1を作成
      const cat1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: 'カテゴリ1',
        type: 'Category',
        sortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(StorageUserToken(), [cat1.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren({ path: `${bundle.path}` })).list
      StorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([cat1.path, art2.path, art1.path])
      expect(nodes.map(node => node.article!.sortOrder)).toEqual([3, 2, 1])
    })

    it('親が違うノードにソート順を設定しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル1',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle1.path}`,
        label: '記事1',
        type: 'Article',
      })

      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル2',
        type: 'ListBundle',
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle2.path}`,
        label: '記事2',
        type: 'Article',
      })

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(StorageUserToken(), [art1.path, art2.path])
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`There are multiple parents in 'orderNodePaths'.`)
      expect(actual.data).toEqual({ orderNodePaths: [art1.path, art2.path] })
    })

    it('ソート順を設定するノードが足りなかった場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル1',
        type: 'ListBundle',
        sortOrder: 1,
      })
      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル2',
        type: 'ListBundle',
        sortOrder: 2,
      })

      let actual!: AppError
      try {
        // テスト対象実行
        // ※本来は'bundle1'と'bundle2'を設定する必要があるが、ここでは'bundle1'のみを設定
        await storageService.setArticleSortOrder(StorageUserToken(), [bundle1.path])
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The number of 'orderNodePaths' does not match the number of children of the parent of 'orderNodePaths'.`)
      expect(actual.data).toEqual({ orderNodePaths: [bundle1.path] })
    })

    it('記事配下のノードにソート順を設定しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })
      // 記事配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir({ dir: `${art1.path}/d1` })
      const d2 = await storageService.createArticleGeneralDir({ dir: `${art1.path}/d2` })

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(StorageUserToken(), [d1.path, d2.path])
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`It is not possible to set the sort order for child nodes.`)
      expect(actual.data).toEqual({
        parent: pickProps(art1, ['id', 'path', 'article']),
      })
    })

    it('アセット配下のノードにソート順を設定しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットを作成
      const assets = await storageService.createArticleGeneralDir({
        dir: `${articleRootPath}/${config.storage.article.assetsName}`,
      })
      // アセット配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir({ dir: `${assets.path}/d1` })
      const d2 = await storageService.createArticleGeneralDir({ dir: `${assets.path}/d2` })

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.setArticleSortOrder(StorageUserToken(), [d1.path, d2.path])
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`It is not possible to set the sort order for child nodes.`)
      expect(actual.data).toEqual({
        parent: pickProps(assets, ['id', 'path', 'article']),
      })
    })

    describe('権限の検証', () => {
      async function setupArticleNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageArticleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const [storage_root, storage_article_root] = await storageService.createHierarchicalDirs([storageArticleRootPath])
        const storage_blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${storageArticleRootPath}`,
          label: 'ブログ',
          type: 'ListBundle',
          sortOrder: 2,
        })
        const storage_movie = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${storageArticleRootPath}`,
          label: '映画',
          type: 'TreeBundle',
          sortOrder: 1,
        })

        const generalArticleRootPath = StorageService.toArticleRootPath(GeneralUserToken())
        const [general_root, general_article_root] = await storageService.createHierarchicalDirs([generalArticleRootPath])
        const general_blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${generalArticleRootPath}`,
          label: 'ブログ',
          type: 'ListBundle',
          sortOrder: 2,
        })
        const general_movie = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${generalArticleRootPath}`,
          label: '映画',
          type: 'TreeBundle',
          sortOrder: 1,
        })

        return {
          users,
          storage: { userRoot: storage_root, articleRoot: storage_article_root, blog: storage_blog, movie: storage_movie },
          general: { userRoot: general_root, articleRoot: general_article_root, blog: general_blog, movie: general_movie },
        }
      }

      it('自ユーザーの記事系ディレクトリをソート順変更', async () => {
        const { storage } = await setupArticleNodes()

        await storageService.setArticleSortOrder(StorageUserToken(), [storage.movie.path, storage.blog.path])

        const nodes = (await storageService.getChildren({ path: `${storage.articleRoot.path}` })).list
        StorageService.sortNodes(nodes)
        expect(nodes.map(node => node.id)).toEqual([storage.movie.id, storage.blog.id])
      })

      it('他ユーザーの記事系ディレクトリをソート順変更', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          await storageService.setArticleSortOrder(GeneralUserToken(), [storage.movie.path, storage.blog.path])
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーの記事系ディレクトリをソート順変更', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          await storageService.setArticleSortOrder(AppAdminUserToken(), [storage.movie.path, storage.blog.path])
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })
    })
  })

  describe('saveArticleSrcContent', () => {
    async function setupArticleTypeNodes() {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事2',
        type: 'Article',
      })

      return { bundle, art1, art2 }
    }

    it('初回保存の場合', async () => {
      const { art1 } = await setupArticleTypeNodes()

      // テスト対象実行
      const srcContent = '# 記事1'
      const searchContent = '記事1'
      const srcTags = ['旅行', 'キャンプ']
      const actual = await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent,
        searchContent,
        srcTags,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBe(srcContent)
      expect(actual.article!.src!.ja!.draftContent).toBeUndefined()
      expect(actual.article!.src!.ja!.searchContent).toBe(searchContent)
      expect(actual.article!.src!.ja!.srcTags).toEqual(srcTags)
      expect(actual.article!.src!.ja!.draftTags).toBeUndefined()
      expect(actual.article!.src!.ja!.createdAt).toEqual(actual.updatedAt)
      expect(actual.article!.src!.ja!.updatedAt).toEqual(actual.updatedAt)
      expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)

      // 格納値の検証
      // - ノード
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual).toEqual(actual)
      // - タグ
      const _tags = await storageService.getArticleTags(srcTags)
      expect(_tags.length).toBe(srcTags.length)
      expect(_tags).toMatchObject([
        { name: srcTags[0], usedCount: 1 },
        { name: srcTags[1], usedCount: 1 },
      ])
    })

    it('2回目以降の保存の場合', async () => {
      let { art1 } = await setupArticleTypeNodes()

      // 1回目の保存
      art1 = await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent: '# 記事1',
        searchContent: '記事1',
        srcTags: ['旅行'],
      })

      // 2回目の保存
      const srcContent = '# Article1'
      const searchContent = 'Article1'
      const srcTags = ['旅行', 'キャンプ']
      const actual = await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent,
        searchContent,
        srcTags,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBe(srcContent)
      expect(actual.article!.src!.ja!.draftContent).toBeUndefined()
      expect(actual.article!.src!.ja!.searchContent).toBe(searchContent)
      expect(actual.article!.src!.ja!.srcTags).toEqual(srcTags)
      expect(actual.article!.src!.ja!.draftTags).toBeUndefined()
      expect(actual.article!.src!.ja!.createdAt).toEqual(art1.article!.src!['ja']!.updatedAt)
      expect(actual.article!.src!.ja!.updatedAt).toEqual(actual.updatedAt)
      expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)

      // 格納値の検証
      // - ノード
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual).toEqual(actual)
      // - タグ
      const _tags = await storageService.getArticleTags(srcTags)
      expect(_tags.length).toBe(srcTags.length)
      expect(_tags).toMatchObject([
        { name: srcTags[0], usedCount: 1 },
        { name: srcTags[1], usedCount: 1 },
      ])
    })

    it('下書きがある場合', async () => {
      let { art1 } = await setupArticleTypeNodes()

      // 下書き保存
      art1 = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent: '# 記事下書き1',
        draftTags: ['旅行'],
      })

      // テスト対象実行
      const srcContent = '# 記事1'
      const searchContent = '記事1'
      const srcTags = ['旅行', 'キャンプ']
      const actual = await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent,
        searchContent,
        srcTags,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBe(srcContent)
      expect(actual.article!.src!.ja!.draftContent).toBeUndefined() // 下書きはクリアされる
      expect(actual.article!.src!.ja!.searchContent).toBe(searchContent)
      expect(actual.article!.src!.ja!.srcTags).toEqual(srcTags)
      expect(actual.article!.src!.ja!.draftTags).toBeUndefined()
      expect(actual.article!.src!.ja!.createdAt).toEqual(actual.updatedAt)
      expect(actual.article!.src!.ja!.updatedAt).toEqual(actual.updatedAt)
      expect(actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)

      // 格納値の検証
      // - ノード
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual.id).toBe(art1.id)
      expect(_actual.article!.src!.ja!.srcContent).toBe(srcContent)
      expect(_actual.article!.src!.ja!.draftContent).toBeUndefined() // 下書きはクリアされる
      expect(_actual.article!.src!.ja!.searchContent).toBe(searchContent)
      expect(_actual.article!.src!.ja!.srcTags).toEqual(srcTags)
      expect(_actual.article!.src!.ja!.draftTags).toBeUndefined()
      expect(_actual.share).toEqual<StorageNodeShareDetail>(EmptyShareDetail())
      // - タグ
      const _tags = await storageService.getArticleTags(srcTags)
      expect(_tags.length).toBe(srcTags.length)
      expect(_tags).toMatchObject([
        { name: srcTags[0], usedCount: 1 },
        { name: srcTags[1], usedCount: 1 },
      ])
    })

    it('対象言語以外の記事がある場合', async () => {
      const { art1 } = await setupArticleTypeNodes()

      //
      // 英語記事の保存
      //
      const actual1 = await storageService.saveArticleSrcContent(art1, {
        lang: 'en',
        srcContent: '# Article1',
        searchContent: 'Article1',
        srcTags: ['Travel', 'Camp'],
      })
      // 戻り値の検証
      expect(actual1.id).toBe(art1.id)

      // - 英語
      expect(actual1.article!.src!.en!.srcContent).toBe('# Article1')
      expect(actual1.article!.src!.en!.draftContent).toBeUndefined()
      expect(actual1.article!.src!.en!.searchContent).toBe('Article1')
      expect(actual1.article!.src!.en!.srcTags).toEqual(['Travel', 'Camp'])
      expect(actual1.article!.src!.en!.draftTags).toBeUndefined()
      expect(dayjs.isDayjs(actual1.article!.src!.en!.createdAt)).toBeTruthy()
      expect(dayjs.isDayjs(actual1.article!.src!.en!.updatedAt)).toBeTruthy()
      // - 日本語
      expect(actual1.article!.src!.ja).toBeUndefined()

      //
      // 日本語記事の保存
      //
      const actual2 = await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent: '# 記事1',
        searchContent: '記事1',
        srcTags: ['旅行', 'Camp'],
      })

      // 戻り値の検証
      expect(actual2.id).toBe(art1.id)
      // - 英語
      expect(actual2.article!.src!.en!.srcContent).toBeUndefined()
      expect(actual2.article!.src!.en!.draftContent).toBeUndefined()
      expect(actual2.article!.src!.en!.searchContent).toBeUndefined()
      expect(actual2.article!.src!.en!.srcTags).toEqual(['Travel', 'Camp'])
      expect(actual2.article!.src!.en!.draftTags).toBeUndefined()
      expect(dayjs.isDayjs(actual2.article!.src!.en!.createdAt)).toBeTruthy()
      expect(dayjs.isDayjs(actual2.article!.src!.en!.updatedAt)).toBeTruthy()
      // - 日本語
      expect(actual2.article!.src!.ja!.srcContent).toBe('# 記事1')
      expect(actual2.article!.src!.ja!.draftContent).toBeUndefined()
      expect(actual2.article!.src!.ja!.searchContent).toBe('記事1')
      expect(actual2.article!.src!.ja!.srcTags).toEqual(['旅行', 'Camp'])
      expect(actual2.article!.src!.ja!.draftTags).toBeUndefined()
      expect(dayjs.isDayjs(actual2.article!.src!.ja!.createdAt)).toBeTruthy()
      expect(dayjs.isDayjs(actual2.article!.src!.ja!.updatedAt)).toBeTruthy()

      //
      // 格納値の検証
      //
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.en.SrcContent,
        ArticleContentFields.en.DraftContent,
        ArticleContentFields.en.SearchContent,
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual.id).toBe(art1.id)
      // - 英語
      expect(_actual.article!.src!.en).toEqual(actual1.article!.src!.en)
      // - 日本語
      expect(_actual.article!.src!.ja).toEqual(actual2.article!.src!.ja)
      // - タグ
      const _tags = await storageService.getArticleTags(['Travel', '旅行', 'Camp'])
      expect(_tags.length).toBe(3)
      expect(_tags).toMatchObject([
        { name: 'Travel', usedCount: 1 },
        { name: '旅行', usedCount: 1 },
        { name: 'Camp', usedCount: 1 }, // 日本語/英語の両方で使用されているが「1件」とカウント
      ])
    })

    it('タグの使用件数を検証', async () => {
      const { art1, art2 } = await setupArticleTypeNodes()

      // テスト対象実行
      await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent: '# 記事1',
        searchContent: '記事1',
        srcTags: ['旅行', 'キャンプ'],
      })
      await storageService.saveArticleSrcContent(art2, {
        lang: 'ja',
        srcContent: '# 記事2',
        searchContent: '記事2',
        srcTags: ['旅行', 'ツアー'],
      })

      // 格納値の検証
      const _tags = await storageService.getArticleTags(['旅行', 'キャンプ', 'ツアー'])
      expect(_tags.length).toBe(3)
      expect(_tags).toMatchObject([
        { name: '旅行', usedCount: 2 },
        { name: 'キャンプ', usedCount: 1 },
        { name: 'ツアー', usedCount: 1 },
      ])
    })

    it('日本語', async () => {
      const { art1 } = await setupArticleTypeNodes()

      // テスト対象実行
      const srcContent = '# 記事1'
      const searchContent = '記事1'
      const srcTags = ['旅行']
      const actual = await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent,
        searchContent,
        srcTags,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBe(srcContent)
      expect(actual.article!.src!.ja!.draftContent).toBeUndefined()
      expect(actual.article!.src!.ja!.searchContent).toBe(searchContent)
      expect(actual.article!.src!.ja!.srcTags).toEqual(srcTags)
      expect(actual.article!.src!.ja!.draftTags).toBeUndefined()

      // 格納値の検証
      // - ノード
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual.id).toBe(art1.id)
      expect(_actual.article!.src!.ja!.srcContent).toBe(srcContent)
      expect(_actual.article!.src!.ja!.draftContent).toBeUndefined()
      expect(_actual.article!.src!.ja!.searchContent).toBe(searchContent)
      expect(_actual.article!.src!.ja!.srcTags).toEqual(srcTags)
      expect(_actual.article!.src!.ja!.draftTags).toBeUndefined()
      // - タグ
      const _tags = await storageService.getArticleTags(srcTags)
      expect(_tags.length).toBe(srcTags.length)
      expect(_tags).toMatchObject([{ name: srcTags[0], usedCount: 1 }])
    })

    it('英語', async () => {
      const { art1 } = await setupArticleTypeNodes()

      // テスト対象実行
      const srcContent = '# 記事1'
      const searchContent = '記事1'
      const srcTags = ['Travel']
      const actual = await storageService.saveArticleSrcContent(art1, {
        lang: 'en',
        srcContent,
        searchContent,
        srcTags,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.en!.srcContent).toBe(srcContent)
      expect(actual.article!.src!.en!.draftContent).toBeUndefined()
      expect(actual.article!.src!.en!.searchContent).toBe(searchContent)
      expect(actual.article!.src!.en!.srcTags).toEqual(srcTags)
      expect(actual.article!.src!.en!.draftTags).toBeUndefined()

      // 格納値の検証
      // - ノード
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.en.SrcContent,
        ArticleContentFields.en.DraftContent,
        ArticleContentFields.en.SearchContent,
      ])
      expect(_actual.id).toBe(art1.id)
      expect(_actual.article!.src!.en!.srcContent).toBe(srcContent)
      expect(_actual.article!.src!.en!.draftContent).toBeUndefined()
      expect(_actual.article!.src!.en!.searchContent).toBe(searchContent)
      expect(_actual.article!.src!.en!.srcTags).toEqual(srcTags)
      expect(_actual.article!.src!.en!.draftTags).toBeUndefined()
      // - タグ
      const _tags = await storageService.getArticleTags(srcTags)
      expect(_tags.length).toBe(srcTags.length)
      expect(_tags).toMatchObject([{ name: srcTags[0], usedCount: 1 }])
    })

    describe('権限の検証', () => {
      async function setupArticleNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageArticleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const [storage_root, storage_article_root] = await storageService.createHierarchicalDirs([storageArticleRootPath])
        const storage_blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${storageArticleRootPath}`,
          label: 'ブログ',
          type: 'ListBundle',
        })
        const storage_note1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${storage_blog.path}`,
          label: '記事1',
          type: 'Article',
        })

        const generalArticleRootPath = StorageService.toArticleRootPath(GeneralUserToken())
        const [general_root, general_article_root] = await storageService.createHierarchicalDirs([generalArticleRootPath])
        const general_blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${generalArticleRootPath}`,
          label: 'ブログ',
          type: 'ListBundle',
        })
        const general_note1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${general_blog.path}`,
          label: '記事1',
          type: 'Article',
        })

        return {
          users,
          storage: { userRoot: storage_root, articleRoot: storage_article_root, blog: storage_blog, note1: storage_note1 },
          general: { userRoot: general_root, articleRoot: general_article_root, blog: general_blog, note1: general_note1 },
        }
      }

      it('自ユーザーの記事本文の保存', async () => {
        const { storage } = await setupArticleNodes()

        const srcContent = '# 記事1'
        const searchContent = '記事1'
        const actual = await storageService.saveArticleSrcContent(StorageUserToken(), storage.note1, {
          lang: 'ja',
          srcContent,
          searchContent,
          srcTags: ['旅行'],
        })

        expect(actual.id).toBe(storage.note1.id)
        expect(actual.article!.src!.ja!.srcContent).toBe(srcContent)
      })

      it('他ユーザーの記事本文の保存', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          const srcContent = '# 記事1'
          const searchContent = '記事1'
          await storageService.saveArticleSrcContent(GeneralUserToken(), storage.note1, {
            lang: 'ja',
            srcContent,
            searchContent,
            srcTags: ['旅行'],
          })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーの記事本文の保存', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          const srcContent = '# 記事1'
          const searchContent = '記事1'
          await storageService.saveArticleSrcContent(AppAdminUserToken(), storage.note1, {
            lang: 'ja',
            srcContent,
            searchContent,
            srcTags: ['旅行'],
          })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })
    })
  })

  describe('saveArticleDraftContent', () => {
    async function setupArticleTypeNodes() {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })

      return { bundle, art1 }
    }

    it('初回保存の場合', async () => {
      const { art1 } = await setupArticleTypeNodes()

      // テスト対象実行
      const draftContent = '# 記事下書き1'
      const draftTags = ['旅行', 'キャンプ']
      const actual = await storageService.saveArticleDraftContent(art1, { lang: 'ja', draftContent, draftTags })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBeUndefined()
      expect(actual.article!.src!.ja!.draftContent).toBe(draftContent)
      expect(actual.article!.src!.ja!.searchContent).toBeUndefined()
      expect(actual.article!.src!.ja!.srcTags).toBeUndefined()
      expect(actual.article!.src!.ja!.draftTags).toEqual(draftTags)
      expect(actual.article!.src!.ja!.createdAt).toBeUndefined()
      expect(actual.article!.src!.ja!.updatedAt).toBeUndefined()
      expect(actual.share).toEqual(EmptyShareDetail())
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)

      // 格納値の検証
      const _actual = await storageService.sgetNode({ path: art1.path }, [ArticleContentFields.ja.SrcContent, ArticleContentFields.ja.DraftContent])
      expect(_actual).toEqual(actual)
    })

    it('2回目以降の保存の場合', async () => {
      let { art1 } = await setupArticleTypeNodes()

      // 1回目の保存
      art1 = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent: '# 記事下書き1',
        draftTags: ['旅行', 'キャンプ'],
      })

      // 2回目の保存
      const draftContent = '# ArticleDraft1'
      const draftTags = ['旅行']
      const actual = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent,
        draftTags,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBeUndefined()
      expect(actual.article!.src!.ja!.draftContent).toBe(draftContent)
      expect(actual.article!.src!.ja!.searchContent).toBeUndefined()
      expect(actual.article!.src!.ja!.srcTags).toBeUndefined()
      expect(actual.article!.src!.ja!.draftTags).toEqual(draftTags)
      expect(actual.article!.src!.ja!.createdAt).toBeUndefined()
      expect(actual.article!.src!.ja!.updatedAt).toBeUndefined()
      expect(actual.share).toEqual(EmptyShareDetail())
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)

      // 格納値の検証
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual).toEqual(actual)
    })

    it('本文がある場合', async () => {
      let { art1 } = await setupArticleTypeNodes()

      // 本文保存
      const srcContent = '# 記事1'
      const searchContent = '記事1'
      const srcTags = ['旅行', 'キャンプ']
      art1 = await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent,
        searchContent,
        srcTags,
      })

      // テスト対象実行
      const draftContent = '# 記事下書き1'
      const draftTags = ['旅行']
      const actual = await storageService.saveArticleDraftContent(art1, { lang: 'ja', draftContent, draftTags })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBe(srcContent)
      expect(actual.article!.src!.ja!.draftContent).toBe(draftContent)
      expect(actual.article!.src!.ja!.searchContent).toBeUndefined() // 戻り値に検索用コンテンツは設定されない
      expect(actual.article!.src!.ja!.srcTags).toEqual(srcTags)
      expect(actual.article!.src!.ja!.draftTags).toEqual(draftTags)
      expect(actual.article!.src!.ja!.createdAt).toEqual(art1.article!.src!['ja']!.createdAt)
      expect(actual.article!.src!.ja!.updatedAt).toEqual(art1.article!.src!['ja']!.updatedAt)
      expect(actual.share).toEqual(EmptyShareDetail())
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)

      // 格納値の検証
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual.id).toBe(art1.id)
      expect(_actual.article!.src!.ja!.srcContent).toBe(srcContent) // DBに本文は存在する
      expect(_actual.article!.src!.ja!.draftContent).toBe(draftContent)
      expect(_actual.article!.src!.ja!.searchContent).toBe(searchContent) // DBに検索用コンテンツは存在する
      expect(_actual.article!.src!.ja!.srcTags).toEqual(srcTags)
      expect(_actual.article!.src!.ja!.draftTags).toEqual(draftTags)
      expect(_actual.share).toEqual(EmptyShareDetail())
    })

    it('対象言語以外の記事がある場合', async () => {
      const { art1 } = await setupArticleTypeNodes()

      //
      // 英語記事の保存
      //
      const actual1 = await storageService.saveArticleDraftContent(art1, {
        lang: 'en',
        draftContent: '# ArticleDraft1',
        draftTags: ['Travel'],
      })
      // 戻り値の検証
      expect(actual1.id).toBe(art1.id)

      // - 英語
      expect(actual1.article!.src!.en!.srcContent).toBeUndefined()
      expect(actual1.article!.src!.en!.draftContent).toBe('# ArticleDraft1')
      expect(actual1.article!.src!.en!.searchContent).toBeUndefined()
      expect(actual1.article!.src!.en!.srcTags).toBeUndefined()
      expect(actual1.article!.src!.en!.draftTags).toEqual(['Travel'])
      expect(actual1.article!.src!.en!.createdAt).toBeUndefined()
      expect(actual1.article!.src!.en!.updatedAt).toBeUndefined()
      // - 日本語
      expect(actual1.article!.src!.ja).toBeUndefined()

      //
      // 日本語記事の保存
      //
      const actual2 = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent: '# 記事下書き1',
        draftTags: ['旅行'],
      })

      // 戻り値の検証
      expect(actual2.id).toBe(art1.id)
      // - 英語
      expect(actual2.article!.src!.en!.srcContent).toBeUndefined()
      expect(actual2.article!.src!.en!.draftContent).toBeUndefined()
      expect(actual2.article!.src!.en!.searchContent).toBeUndefined()
      expect(actual2.article!.src!.en!.draftTags).toEqual(['Travel'])
      expect(actual2.article!.src!.en!.createdAt).toBeUndefined()
      expect(actual2.article!.src!.en!.updatedAt).toBeUndefined()
      // - 日本語
      expect(actual2.article!.src!.ja!.srcContent).toBeUndefined()
      expect(actual2.article!.src!.ja!.draftContent).toBe('# 記事下書き1')
      expect(actual2.article!.src!.ja!.searchContent).toBeUndefined()
      expect(actual2.article!.src!.ja!.srcTags).toBeUndefined()
      expect(actual2.article!.src!.ja!.draftTags).toEqual(['旅行'])
      expect(actual2.article!.src!.ja!.createdAt).toBeUndefined()
      expect(actual2.article!.src!.ja!.updatedAt).toBeUndefined()

      //
      // 格納値の検証
      //
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.en.SrcContent,
        ArticleContentFields.en.DraftContent,
        ArticleContentFields.en.SearchContent,
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual.id).toBe(art1.id)
      // - 英語
      expect(_actual.article!.src!.en).toEqual(actual1.article!.src!.en)
      // - 日本語
      expect(_actual.article!.src!.ja).toEqual(actual2.article!.src!.ja)
    })

    it('下書きにnullを指定した場合', async () => {
      let { art1 } = await setupArticleTypeNodes()

      // 下書きの保存
      art1 = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent: '# 記事1',
        draftTags: ['旅行'],
      })

      // 下書きの破棄
      const actual = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent: null,
        draftTags: null,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBeUndefined()
      expect(actual.article!.src!.ja!.draftContent).toBeUndefined() // undefinedになる
      expect(actual.article!.src!.ja!.searchContent).toBeUndefined()
      expect(actual.article!.src!.ja!.srcTags).toBeUndefined()
      expect(actual.article!.src!.ja!.draftTags).toBeUndefined()
      expect(actual.article!.src!.ja!.createdAt).toEqual(art1.article!.src!['ja']!.createdAt)
      expect(actual.article!.src!.ja!.updatedAt).toEqual(art1.article!.src!['ja']!.updatedAt)
      expect(actual.share).toEqual(EmptyShareDetail())
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)

      // 格納値の検証
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual).toEqual(actual)
    })

    it('下書きに空文字を指定した場合', async () => {
      let { art1 } = await setupArticleTypeNodes()

      // 下書きの保存
      art1 = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent: '# 記事下書き1',
        draftTags: ['旅行'],
      })

      // 下書きの破棄
      const actual = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent: '', // 空文字を指定
        draftTags: [], // 空配列を指定
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBeUndefined()
      expect(actual.article!.src!.ja!.draftContent).toBe('')
      expect(actual.article!.src!.ja!.searchContent).toBeUndefined()
      expect(actual.article!.src!.ja!.srcTags).toBeUndefined()
      expect(actual.article!.src!.ja!.draftTags).toBeUndefined()
      expect(actual.article!.src!.ja!.createdAt).toEqual(art1.article!.src!['ja']!.createdAt)
      expect(actual.article!.src!.ja!.updatedAt).toEqual(art1.article!.src!['ja']!.updatedAt)
      expect(actual.share).toEqual(EmptyShareDetail())
      expect(actual.updatedAt.isAfter(art1.updatedAt)).toBeTruthy()
      expect(actual.version).toBe(art1.version + 1)

      // 格納値の検証
      const _actual = await storageService.sgetNode({ path: art1.path }, [
        ArticleContentFields.ja.SrcContent,
        ArticleContentFields.ja.DraftContent,
        ArticleContentFields.ja.SearchContent,
      ])
      expect(_actual).toEqual(actual)
    })

    it('日本語', async () => {
      const { art1 } = await setupArticleTypeNodes()

      // テスト対象実行
      const draftContent = '# 記事下書き1'
      const draftTags = ['旅行']
      const actual = await storageService.saveArticleDraftContent(art1, {
        lang: 'ja',
        draftContent,
        draftTags,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.ja!.srcContent).toBeUndefined()
      expect(actual.article!.src!.ja!.draftContent).toBe(draftContent)
      expect(actual.article!.src!.ja!.searchContent).toBeUndefined()
      expect(actual.article!.src!.ja!.srcTags).toBeUndefined()
      expect(actual.article!.src!.ja!.draftTags).toEqual(draftTags)

      // 格納値の検証
      {
        const _actual = await storageService.sgetNode({ path: art1.path }, [
          ArticleContentFields.ja.SrcContent,
          ArticleContentFields.ja.DraftContent,
          ArticleContentFields.ja.SearchContent,
        ])
        expect(_actual.article!.src!.ja!.srcContent).toBeUndefined()
        expect(_actual.article!.src!.ja!.draftContent).toBe(draftContent)
        expect(_actual.article!.src!.ja!.searchContent).toBeUndefined()
        expect(_actual.article!.src!.ja!.srcTags).toBeUndefined()
        expect(_actual.article!.src!.ja!.draftTags).toEqual(draftTags)
      }
    })

    it('英語 ', async () => {
      const { art1 } = await setupArticleTypeNodes()

      // テスト対象実行
      const draftContent = '# Article1'
      const draftTags = ['Travel']
      const actual = await storageService.saveArticleDraftContent(art1, {
        lang: 'en',
        draftContent,
        draftTags,
      })

      // 戻り値の検証
      expect(actual.id).toBe(art1.id)
      expect(actual.article!.src!.en!.srcContent).toBeUndefined()
      expect(actual.article!.src!.en!.draftContent).toBe(draftContent)
      expect(actual.article!.src!.en!.searchContent).toBeUndefined()
      expect(actual.article!.src!.en!.srcTags).toBeUndefined()
      expect(actual.article!.src!.en!.draftTags).toEqual(draftTags)

      // 格納値の検証
      {
        const _actual = await storageService.sgetNode({ path: art1.path }, [
          ArticleContentFields.en.SrcContent,
          ArticleContentFields.en.DraftContent,
          ArticleContentFields.en.SearchContent,
        ])
        expect(_actual.article!.src!.en!.srcContent).toBeUndefined()
        expect(_actual.article!.src!.en!.draftContent).toBe(draftContent)
        expect(_actual.article!.src!.en!.searchContent).toBeUndefined()
        expect(_actual.article!.src!.en!.srcTags).toBeUndefined()
        expect(_actual.article!.src!.en!.draftTags).toEqual(draftTags)
      }
    })

    describe('権限の検証', () => {
      async function setupArticleNodes() {
        const users = await storageService.createDir({ dir: config.storage.user.rootName })

        const storageArticleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const [storage_root, storage_article_root] = await storageService.createHierarchicalDirs([storageArticleRootPath])
        const storage_blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${storageArticleRootPath}`,
          label: 'ブログ',
          type: 'ListBundle',
        })
        const storage_note1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${storage_blog.path}`,
          label: '記事1',
          type: 'Article',
        })

        const generalArticleRootPath = StorageService.toArticleRootPath(GeneralUserToken())
        const [general_root, general_article_root] = await storageService.createHierarchicalDirs([generalArticleRootPath])
        const general_blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${generalArticleRootPath}`,
          label: 'ブログ',
          type: 'ListBundle',
        })
        const general_note1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${general_blog.path}`,
          label: '記事1',
          type: 'Article',
        })

        return {
          users,
          storage: { userRoot: storage_root, articleRoot: storage_article_root, blog: storage_blog, note1: storage_note1 },
          general: { userRoot: general_root, articleRoot: general_article_root, blog: general_blog, note1: general_note1 },
        }
      }

      it('自ユーザーの記事下書きの保存', async () => {
        const { storage } = await setupArticleNodes()

        const draftContent = '記事下書き1'
        const draftTags = ['旅行']
        const actual = await storageService.saveArticleDraftContent(StorageUserToken(), storage.note1, {
          lang: 'ja',
          draftContent,
          draftTags,
        })

        expect(actual.id).toBe(storage.note1.id)
        expect(actual.article!.src!.ja!.draftContent).toBe(draftContent)
      })

      it('他ユーザーの記事下書きの保存', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          await storageService.saveArticleDraftContent(GeneralUserToken(), storage.note1, {
            lang: 'ja',
            draftContent: '記事下書き1',
            draftTags: ['旅行'],
          })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })

      it('アプリケーション管理者で他ユーザーの記事下書きの保存', async () => {
        const { storage } = await setupArticleNodes()

        let actual!: AppError
        try {
          await storageService.saveArticleDraftContent(AppAdminUserToken(), storage.note1, {
            lang: 'ja',
            draftContent: '記事下書き1',
            draftTags: ['旅行'],
          })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Not implemented yet.`)
      })
    })
  })

  describe('getArticleContentsNode', () => {
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
        srcTags: ['旅行'],
      })
      await storageService.saveArticleDraftContent(art1, {
        lang,
        draftContent: '# 記事下書き1',
        draftTags: ['旅行', 'キャンプ'],
      })
      art1 = await storageService.sgetNode(art1, [ArticleContentFields[lang].SrcContent, ArticleContentFields[lang].DraftContent])

      return { bundle, art1 }
    }

    it('本文と下書きを指定', async () => {
      const { art1 } = await setupArticleNodes('ja')

      // 本文と下書きを指定
      const actual = await storageService.getArticleContentsNode(StorageUserToken(), art1, {
        lang: 'ja',
        contentTypes: ['Src', 'Draft'],
      })

      expect(actual!.article!.src!.ja!.srcContent).toEqual(art1.article!.src!.ja!.srcContent)
      expect(actual!.article!.src!.ja!.draftContent).toEqual(art1.article!.src!.ja!.draftContent)
    })

    it('本文のみを指定', async () => {
      const { art1 } = await setupArticleNodes('ja')

      // 本文のみを指定
      const actual = await storageService.getArticleContentsNode(StorageUserToken(), art1, {
        lang: 'ja',
        contentTypes: ['Src'],
      })

      expect(actual!.article!.src!.ja!.srcContent).toEqual(art1.article!.src!.ja!.srcContent)
      expect(actual!.article!.src!.ja!.draftContent).toBeUndefined()
    })

    it('下書きのみを指定', async () => {
      const { art1 } = await setupArticleNodes('ja')

      // 下書きのみを指定
      const actual = await storageService.getArticleContentsNode(StorageUserToken(), art1, {
        lang: 'ja',
        contentTypes: ['Draft'],
      })

      expect(actual!.article!.src!.ja!.srcContent).toBeUndefined()
      expect(actual!.article!.src!.ja!.draftContent).toEqual(art1.article!.src!.ja!.draftContent)
    })

    it('存在しない記事を指定した場合', async () => {
      await setupArticleNodes('ja')

      const actual = await storageService.getArticleContentsNode(
        GeneralUserToken(),
        { id: '12345678901234567890' },
        {
          lang: 'ja',
          contentTypes: ['Src'],
        }
      )

      expect(actual).toBeUndefined()
    })

    it('記事以外を指定した場合', async () => {
      const { bundle } = await setupArticleNodes('ja')

      // 記事ではなくバンドルを指定
      const actual = await storageService.getArticleContentsNode(GeneralUserToken(), bundle, {
        lang: 'ja',
        contentTypes: ['Src'],
      })

      expect(actual).toBeUndefined()
    })

    it('日本語', async () => {
      const { art1 } = await setupArticleNodes('ja')

      const actual = await storageService.getArticleContentsNode(StorageUserToken(), art1, {
        lang: 'ja',
        contentTypes: ['Src', 'Draft'],
      })

      expect(actual!.article!.src!.ja!.srcContent).toEqual(art1.article!.src!.ja!.srcContent)
      expect(actual!.article!.src!.ja!.draftContent).toEqual(art1.article!.src!.ja!.draftContent)
    })

    it('英語', async () => {
      const { art1 } = await setupArticleNodes('en')

      const actual = await storageService.getArticleContentsNode(StorageUserToken(), art1, {
        lang: 'en',
        contentTypes: ['Src', 'Draft'],
      })

      expect(actual!.article!.src!.en!.srcContent).toEqual(art1.article!.src!.en!.srcContent)
      expect(actual!.article!.src!.en!.draftContent).toEqual(art1.article!.src!.en!.draftContent)
    })

    describe('権限の検証', () => {
      it('自ユーザーのノードを検索', async () => {
        const { art1 } = await setupArticleNodes('ja')

        const actual = await storageService.getArticleContentsNode(StorageUserToken(), art1, {
          lang: 'ja',
          contentTypes: ['Src', 'Draft'],
        })

        expect(actual!.path).toBe(art1.path)
      })

      it('他ユーザーのノードを検索', async () => {
        const { art1 } = await setupArticleNodes('ja')

        let actual!: HttpException
        try {
          await await storageService.getArticleContentsNode(GeneralUserToken(), art1, {
            lang: 'ja',
            contentTypes: ['Src', 'Draft'],
          })
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })

      it('アプリケーション管理者で他ユーザーのノードを検索', async () => {
        const { art1 } = await setupArticleNodes('ja')

        let actual!: HttpException
        try {
          await await storageService.getArticleContentsNode(AppAdminUserToken(), art1, {
            lang: 'ja',
            contentTypes: ['Src', 'Draft'],
          })
        } catch (err) {
          actual = err
        }

        expect(actual.getStatus()).toBe(403)
      })
    })
  })

  describe('getArticleSrcContent', () => {
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
        share: { isPublic: null }, // 公開未設定
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
        srcTags: ['旅行'],
      })
      await storageService.saveArticleDraftContent(art1, {
        lang,
        draftContent: '# 記事下書き1',
        draftTags: ['旅行', 'キャンプ'],
      })
      art1 = await storageService.sgetNode(art1, [ArticleContentFields[lang].SrcContent, ArticleContentFields[lang].DraftContent])

      // 記事1のレスポンス
      const art1_result: GetArticleSrcContentResult = {
        id: art1.id,
        label: art1.article!.label[lang]!,
        srcContent: art1.article!.src![lang]!.srcContent!,
        srcTags: art1.article!.src![lang]!.srcTags!,
        dir: [{ id: bundle.id, label: bundle.article!.label[lang]! }],
        path: [
          { id: bundle.id, label: bundle.article!.label[lang]! },
          { id: art1.id, label: art1.article!.label[lang]! },
        ],
        isPublic: false,
        createdAt: art1.article!.src![lang]!.createdAt!,
        updatedAt: art1.article!.src![lang]!.updatedAt!,
      }

      return { bundle, art1, art1_result }
    }

    it('記事は公開設定 -> 誰でもアクセス可能', async () => {
      const { art1, art1_result } = await setupArticleNodes('ja')

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      const actual = await storageService.getArticleSrcContent(StorageUserToken(), { lang: 'ja', articleId: art1.id })

      expect(actual).toEqual<GetArticleSrcContentResult>({
        ...art1_result,
        isPublic: true,
      })
    })

    it('記事は非公開設定 -> 他ユーザーはアクセス不可', async () => {
      const { art1 } = await setupArticleNodes('ja')

      // 記事を公開未設定
      await storageService.setDirShareDetail(art1, { isPublic: false })

      let actual!: HttpException
      try {
        // 他ユーザーを指定
        await storageService.getArticleSrcContent(GeneralUserToken(), { lang: 'ja', articleId: art1.id })
      } catch (err) {
        actual = err
      }

      expect(actual.getStatus()).toBe(403)
    })

    it('記事に読み込み権限設定 -> 他ユーザーもアクセス可能', async () => {
      const { art1, art1_result } = await setupArticleNodes('ja')

      // 記事に読み込み権限設定
      await storageService.setDirShareDetail(art1, { readUIds: [GeneralUser().uid] })

      // 読み込み権限に設定した他ユーザーを指定
      const actual = await storageService.getArticleSrcContent(GeneralUserToken(), { lang: 'ja', articleId: art1.id })

      expect(actual).toEqual(art1_result)
    })

    it('存在しない記事を指定した場合', async () => {
      await setupArticleNodes('ja')

      const actual = await storageService.getArticleSrcContent(GeneralUserToken(), { lang: 'ja', articleId: '12345678901234567890' })

      expect(actual).toBeUndefined()
    })

    it('日本語', async () => {
      const { art1, art1_result } = await setupArticleNodes('ja')

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      const actual = await storageService.getArticleSrcContent(StorageUserToken(), { lang: 'ja', articleId: art1.id })

      expect(actual).toEqual<GetArticleSrcContentResult>({
        ...art1_result,
        isPublic: true,
      })
    })

    it('英語', async () => {
      const { art1, art1_result } = await setupArticleNodes('en')

      // 記事を公開設定
      await storageService.setDirShareDetail(art1, { isPublic: true })

      const actual = await storageService.getArticleSrcContent(StorageUserToken(), { lang: 'en', articleId: art1.id })

      expect(actual).toEqual<GetArticleSrcContentResult>({
        ...art1_result,
        isPublic: true,
      })
    })

    it('読み込み権限の検証が行われているか確認', async () => {
      const validateReadable = td.replace(storageService, 'validateReadable')

      // 記事を非公開設定
      const { art1 } = await setupArticleNodes('ja')
      await storageService.setDirShareDetail(art1, { isPublic: false })
      const hierarchicalNodes = await storageService.getHierarchicalNodes(art1.path, [ArticleContentFields.ja.SrcContent])

      // テスト対象実行
      await storageService.getArticleSrcContent(StorageUserToken(), { lang: 'ja', articleId: art1.id })

      const exp = td.explain(validateReadable)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([StorageUserToken(), art1.path, hierarchicalNodes])
    })
  })

  describe('getUserArticleList', () => {
    beforeAll(async () => {
      await devUtilsService.setTestUsers(AppAdminUser(), GeneralUser(), StorageUser())
    })

    async function verifyArticleListItem(lang: LangCode, actual: ArticleListItem, expected: StorageNode): Promise<void> {
      const allNodes = (await storageService.getDescendants({ path: '' })).list

      expect(actual.id).toBe(expected.id)
      expect(actual.name).toBe(expected.name)
      expect(actual.dir).toEqual(StorageService.toArticlePathDetails(lang, expected.dir, allNodes))
      expect(actual.path).toEqual(StorageService.toArticlePathDetails(lang, expected.path, allNodes))
      expect(actual.label).toBe(expected.article!.label![lang])
      expect(actual.createdAt).toEqual(expected.article!.src![lang]!.createdAt)
      expect(actual.updatedAt).toEqual(expected.article!.src![lang]!.updatedAt)
    }

    async function setupArticleTypeNodes(lang: LangCode) {
      // users
      // └test.storage
      //   ├articles
      //   │├TypeScript
      //   ││├Interface
      //   ││├Class
      //   ││└Types
      //   ││  ├PrimitiveType
      //   ││  └LiteralType
      //   │└JavaScript
      //   ︙  ︙

      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
      const users = articleRootNodes[0]
      const userRoot = articleRootNodes[1]
      const articleRoot = articleRootNodes[2]

      // TypeScript
      const ts = await storageService.createArticleTypeDir({
        lang,
        dir: `${articleRoot.path}`,
        label: 'TypeScript',
        type: 'TreeBundle',
        sortOrder: 2,
      })

      // Interface
      let ts_interface = await storageService.createArticleTypeDir({
        lang,
        dir: `${ts.path}`,
        label: 'Interface',
        type: 'Article',
        sortOrder: 3,
      })
      ts_interface = await storageService.saveArticleSrcContent(ts_interface, {
        lang,
        srcContent: 'Interface',
        searchContent: 'Interface',
        srcTags: [],
      })

      // Class
      let ts_class = await storageService.createArticleTypeDir({
        lang,
        dir: `${ts.path}`,
        label: 'Class',
        type: 'Article',
        sortOrder: 2,
      })
      ts_class = await storageService.saveArticleSrcContent(ts_class, {
        lang,
        srcContent: 'Class',
        searchContent: 'Class',
        srcTags: [],
      })

      // Types
      const ts_types = await storageService.createArticleTypeDir({
        lang,
        dir: `${ts.path}`,
        label: 'Types',
        type: 'Category',
        sortOrder: 1,
      })

      // JavaScript
      const js = await storageService.createArticleTypeDir({
        lang,
        dir: `${articleRoot.path}`,
        label: 'JavaScript',
        type: 'TreeBundle',
        sortOrder: 1,
      })

      return { users, userRoot, articleRoot, ts, ts_interface, ts_class, ts_types, js }
    }

    async function setupArticleNodes(dirNode: StorageNode, num: number, privateNumbers: number[] = []) {
      const articleNodes = await Promise.all(
        [...Array(num)].map(async (_, i) => {
          const label = `art${(i + 1).toString().padStart(num.toString().length, '0')}`
          const articleNode = await storageService.createArticleTypeDir({
            lang: 'ja',
            dir: `${dirNode.path}`,
            label,
            type: 'Article',
            sortOrder: i + 1,
            share: { isPublic: !privateNumbers.includes(i + 1) },
          })
          return await storageService.saveArticleSrcContent(articleNode, {
            lang: 'ja',
            srcContent: label,
            searchContent: label,
            srcTags: [],
          })
        })
      )
      articleNodes.sort((a, b) => b.article!.sortOrder - a.article!.sortOrder)
      return articleNodes
    }

    it('ベーシックケース', async () => {
      const { js } = await setupArticleTypeNodes('ja')
      // 以下配列の番号の記事を非公開にする
      await setupArticleNodes(js, 10, [1, 2, 5, 6, 9, 10])

      // 対象バンドルを公開設定
      await storageService.setDirShareDetail(js, { isPublic: true })

      const pager = new Pager(storageService, storageService.getUserArticleList, { pageSize: 3 })

      const actual1 = await pager.start(
        GeneralUserToken(), // 他ユーザーを指定
        { lang: 'ja', articleDirId: js.id }
      )
      expect(pager.token).toBeDefined()
      expect(pager.pageNum).toBe(1)
      expect(pager.totalPages).toBe(2)
      expect(pager.totalItems).toBe(4)
      expect(pager.maxItems).toBe(4)
      expect(pager.hasNext()).toBeTruthy()
      expect(actual1.length).toBe(3)
      expect(actual1[0].label).toEqual('art08')
      expect(actual1[1].label).toEqual('art07')
      expect(actual1[2].label).toEqual('art04')

      const actual2 = await pager.next()
      expect(pager.pageNum).toBe(2)
      expect(pager.hasNext()).toBeFalsy()
      expect(actual2.length).toBe(1)
      expect(actual2[0].label).toEqual('art03')
    })

    it('日本語', async () => {
      const { ts, ts_interface, ts_class } = await setupArticleTypeNodes('ja')

      const pager = new Pager(storageService, storageService.getUserArticleList)
      const actual = await pager.start(StorageUserToken(), {
        lang: 'ja',
        articleDirId: ts.id,
      })

      expect(actual.length).toBe(2)
      await verifyArticleListItem('ja', actual[0], ts_interface)
      await verifyArticleListItem('ja', actual[1], ts_class)
    })

    it('英語', async () => {
      const { ts, ts_interface, ts_class } = await setupArticleTypeNodes('en')

      const pager = new Pager(storageService, storageService.getUserArticleList)
      const actual = await pager.start(StorageUserToken(), {
        lang: 'en',
        articleDirId: ts.id,
      })

      expect(actual.length).toBe(2)
      await verifyArticleListItem('en', actual[0], ts_interface)
      await verifyArticleListItem('en', actual[1], ts_class)
    })

    describe('他ユーザーによる記事リスト取得', () => {
      it('対象カテゴリを公開設定', async () => {
        const { ts, ts_interface, ts_class } = await setupArticleTypeNodes('ja')

        // 対象カテゴリを公開設定
        await storageService.setDirShareDetail(ts, { isPublic: true })

        const pager = new Pager(storageService, storageService.getUserArticleList)
        const actual = await pager.start(GeneralUserToken(), {
          lang: 'ja',
          articleDirId: ts.id,
        })

        expect(actual.length).toBe(2)
        await verifyArticleListItem('ja', actual[0], ts_interface)
        await verifyArticleListItem('ja', actual[1], ts_class)
      })

      it('対象カテゴリを公開設定 - 記事の一部を非公開設定', async () => {
        const { ts, ts_interface, ts_class } = await setupArticleTypeNodes('ja')

        // 対象カテゴリを公開設定
        await storageService.setDirShareDetail(ts, { isPublic: true })
        // 対象カテゴリ直下の記事を一部非公開設定
        await storageService.setDirShareDetail(ts_interface, { isPublic: false })

        const pager = new Pager(storageService, storageService.getUserArticleList)
        const actual = await pager.start(GeneralUserToken(), {
          lang: 'ja',
          articleDirId: ts.id,
        })

        expect(actual.length).toBe(1)
        await verifyArticleListItem('ja', actual[0], ts_class)
      })

      it('対象カテゴリを公開設定 - 記事の一部に読み込み権限設定', async () => {
        const { ts, ts_interface } = await setupArticleTypeNodes('ja')

        // 対象カテゴリを非公開設定
        await storageService.setDirShareDetail(ts, { isPublic: false })
        // 対象カテゴリ直下の記事を一部読み込み権限設定
        await storageService.setDirShareDetail(ts_interface, { readUIds: [GeneralUserToken().uid] })

        const pager = new Pager(storageService, storageService.getUserArticleList)
        const actual = await pager.start(GeneralUserToken(), {
          lang: 'ja',
          articleDirId: ts.id,
        })

        expect(actual.length).toBe(1)
        await verifyArticleListItem('ja', actual[0], ts_interface)
      })
    })

    it('自ユーザーによる記事リスト取得', async () => {
      const { ts, ts_interface, ts_class } = await setupArticleTypeNodes('ja')

      const pager = new Pager(storageService, storageService.getUserArticleList)
      const actual = await pager.start(StorageUserToken(), {
        lang: 'ja',
        articleDirId: ts.id,
      })

      expect(actual.length).toBe(2)
      await verifyArticleListItem('ja', actual[0], ts_interface)
      await verifyArticleListItem('ja', actual[1], ts_class)
    })

    it('サインインしていないユーザーによる記事リスト取得', async () => {
      const { ts, ts_interface, ts_class } = await setupArticleTypeNodes('ja')

      // 対象カテゴリを公開設定
      await storageService.setDirShareDetail(ts, { isPublic: true })

      const pager = new Pager(storageService, storageService.getUserArticleList)
      const actual = await pager.start(undefined, {
        lang: 'ja',
        articleDirId: ts.id,
      })

      expect(actual.length).toBe(2)
      await verifyArticleListItem('ja', actual[0], ts_interface)
      await verifyArticleListItem('ja', actual[1], ts_class)
    })

    it('対象カテゴリが存在しない場合', async () => {
      await setupArticleTypeNodes('ja')

      let actual!: HttpException
      try {
        const pager = new Pager(storageService, storageService.getUserArticleList)
        await pager.start(StorageUserToken(), {
          lang: 'ja',
          articleDirId: 'abcdefghijklmnopqrst', // 存在しないカテゴリを指定
        })
      } catch (err) {
        actual = err
      }

      expect(actual.getStatus()).toBe(404)
    })

    it('対象カテゴリに記事を指定した場合', async () => {
      const { ts_interface } = await setupArticleTypeNodes('ja')

      let actual!: HttpException
      try {
        const pager = new Pager(storageService, storageService.getUserArticleList)
        await pager.start(StorageUserToken(), {
          lang: 'ja',
          articleDirId: ts_interface.id, // 記事を指定
        })
      } catch (err) {
        actual = err
      }

      expect(actual.getStatus()).toBe(404)
    })

    it('対象カテゴリに記事がない場合', async () => {
      const { articleRoot } = await setupArticleTypeNodes('ja')

      const travel = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRoot.path}`,
        label: '旅行',
        type: 'TreeBundle',
        sortOrder: 1,
      })

      const pager = new Pager(storageService, storageService.getUserArticleList)
      const actual = await pager.start(StorageUserToken(), {
        lang: 'ja',
        articleDirId: travel.id,
      })

      expect(actual.length).toBe(0)
    })

    it('記事に下書きしかない場合', async () => {
      const { articleRoot } = await setupArticleTypeNodes('ja')

      const travel = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRoot.path}`,
        label: '旅行',
        type: 'TreeBundle',
        sortOrder: 1,
      })

      // 旅行記1 (下書きのみ)
      let travel1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${travel.path}`,
        label: '旅行記1',
        type: 'Article',
        sortOrder: 2,
      })
      travel1 = await storageService.saveArticleDraftContent(travel1, {
        lang: 'ja',
        draftContent: '# 旅行記1',
        draftTags: [],
      })

      // 旅行記2 (本文あり)
      let travel2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${travel.path}`,
        label: '旅行記2',
        type: 'Article',
        sortOrder: 1,
      })
      travel2 = await storageService.saveArticleSrcContent(travel2, {
        lang: 'ja',
        srcContent: '# 旅行記2',
        searchContent: '旅行記2',
        srcTags: [],
      })

      const pager = new Pager(storageService, storageService.getUserArticleList)
      const actual = await pager.start(StorageUserToken(), {
        lang: 'ja',
        articleDirId: travel.id,
      })

      expect(actual.length).toBe(1)
      await verifyArticleListItem('ja', actual[0], travel2)
    })

    it('取得上限より記事リストが多い場合', async () => {
      // この設定により、1回の検索で取得上限の記事リストが取得されることになる
      const elastic = require('../../../../../src/app/services/base/elastic')
      // - Elasticsearchの取得上限を変更
      td.replace(elastic.ElasticConstants, 'MaxResultSize', 5)
      // - 1回の検索で取得する件数を変更
      td.replace(elastic.ElasticConstants, 'ChunkSize', 5)

      // 記事リストを10件作成
      const { js } = await setupArticleTypeNodes('ja')
      await setupArticleNodes(js, 10)

      // 記事リストを1ページ3件で分割する
      const pager = new Pager(storageService, storageService.getUserArticleList, { pageSize: 3 })

      const actual1 = await pager.start(
        StorageUserToken(), // 自ユーザーを指定
        { lang: 'ja', articleDirId: js.id }
      )
      expect(pager.token).toBeDefined()
      expect(pager.pageNum).toBe(1)
      expect(pager.totalPages).toBe(2)
      expect(pager.totalItems).toBe(10) // 実際に存在する記事リストは10件
      expect(pager.maxItems).toBe(5) // 取得可能な記事リストは5件
      expect(pager.hasNext()).toBeTruthy()
      expect(actual1.length).toBe(3) // 1ページ目で3件取得

      const actual2 = await pager.next()
      expect(pager.pageNum).toBe(2)
      expect(pager.hasNext()).toBeFalsy()
      expect(actual2.length).toBe(2) // 2ページ目で2件取得
    })

    describe('大量データの場合', () => {
      it('ベーシックケース', async () => {
        const { js } = await setupArticleTypeNodes('ja')
        await setupArticleNodes(js, 10)

        // 大量データを想定して検索を行う
        const actual = await new Pager(storageService, storageService.getUserArticleList, { pageSize: 3 }).fetchAll(
          StorageUserToken(), // 自ユーザーを指定
          { lang: 'ja', articleDirId: js.id }
        )

        expect(actual.length).toBe(10)
        expect(actual[0].label).toBe(`art10`)
        expect(actual[1].label).toBe(`art09`)
        expect(actual[2].label).toBe(`art08`)
        expect(actual[3].label).toBe(`art07`)
        expect(actual[4].label).toBe(`art06`)
        expect(actual[5].label).toBe(`art05`)
        expect(actual[6].label).toBe(`art04`)
        expect(actual[7].label).toBe(`art03`)
        expect(actual[8].label).toBe(`art02`)
        expect(actual[9].label).toBe(`art01`)
      })

      it('読み込みできない記事が含まれている場合', async () => {
        const { js } = await setupArticleTypeNodes('ja')
        // 以下の番号の記事を非公開にする
        await setupArticleNodes(js, 20, [3, 5, 6, 12, 13, 15, 16, 19, 20])

        // 対象バンドルを公開設定
        await storageService.setDirShareDetail(js, { isPublic: true })

        // 大量データを想定して検索を行う
        const actual = await new Pager(storageService, storageService.getUserArticleList, { pageSize: 3 }).fetchAll(
          GeneralUserToken(), // 他ユーザーを指定
          { lang: 'ja', articleDirId: js.id }
        )

        expect(actual.length).toBe(11)
        expect(actual[0].label).toBe(`art18`)
        expect(actual[1].label).toBe(`art17`)
        expect(actual[2].label).toBe(`art14`)
        expect(actual[3].label).toBe(`art11`)
        expect(actual[4].label).toBe(`art10`)
        expect(actual[5].label).toBe(`art09`)
        expect(actual[6].label).toBe(`art08`)
        expect(actual[7].label).toBe(`art07`)
        expect(actual[8].label).toBe(`art04`)
        expect(actual[9].label).toBe(`art02`)
        expect(actual[10].label).toBe(`art01`)
      })
    })
  })

  describe('getUserArticleTableOfContents', () => {
    let users: StorageNode
    let userRoot: StorageNode
    let articleRoot: StorageNode
    let blog: StorageNode
    let blog_note2: StorageNode
    let blog_note1: StorageNode
    let js: StorageNode
    let js_variable: StorageNode
    let ts: StorageNode
    let ts_interface: StorageNode
    let ts_class: StorageNode
    let ts_types: StorageNode
    let ts_types_primitive: StorageNode
    let ts_types_literal: StorageNode

    beforeAll(async () => {
      await devUtilsService.setTestUsers(AppAdminUser(), GeneralUser(), StorageUser())
    })

    async function verifyArticleTableOfContentsItem(lang: LangCode, actual: ArticleTableOfContentsItem, expected: StorageNode): Promise<void> {
      const allNodes = (await storageService.getDescendants({ path: '' })).list

      expect(actual.id).toBe(expected.id)
      expect(actual.name).toBe(expected.name)
      expect(actual.dir).toEqual(StorageService.toArticlePathDetails(lang, expected.dir, allNodes))
      expect(actual.path).toEqual(StorageService.toArticlePathDetails(lang, expected.path, allNodes))
      expect(actual.label).toBe(expected.article!.label![lang])
      expect(actual.type).toBe(expected.article!.type)
      expect(actual.sortOrder).toBe(expected.article!.sortOrder)
    }

    async function setupArticleTypeNodes(lang: LangCode): Promise<void> {
      // users
      // └test.storage
      //   └articles
      //     ├Blog
      //     │├Note2
      //     │└Note1
      //     ├JavaScript
      //     │└Variable
      //     └TypeScript
      //       ├Interface
      //       ├Class
      //       └Types
      //         ├PrimitiveType
      //         └LiteralType

      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
      users = articleRootNodes[0]
      userRoot = articleRootNodes[1]
      articleRoot = articleRootNodes[2]

      // Blog
      const input_blog: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}`,
        label: 'Blog',
        type: 'ListBundle',
        sortOrder: 3,
      }

      // Blog/Note2
      const input_blog_note2: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}/${input_blog.id}`,
        label: 'Note2',
        type: 'Article',
        sortOrder: 2,
      }
      const input_blog_note2_src: { key: StorageNodeGetKeyInput; input: SaveArticleSrcContentInput } = {
        key: input_blog_note2,
        input: {
          lang,
          srcContent: 'Note2',
          searchContent: 'Note2',
          srcTags: [],
        },
      }

      // Blog/Note1
      const input_blog_note1: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}/${input_blog.id}`,
        label: 'Note1',
        type: 'Article',
        sortOrder: 1,
      }
      const input_blog_note1_src: { key: StorageNodeGetKeyInput; input: SaveArticleSrcContentInput } = {
        key: input_blog_note1,
        input: {
          lang,
          srcContent: 'Note1',
          searchContent: 'Note1',
          srcTags: [],
        },
      }

      // JavaScript
      const input_js: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}`,
        label: 'JavaScript',
        type: 'TreeBundle',
        sortOrder: 2,
      }

      // JavaScript/Variable
      const input_js_variable: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}/${input_js.id}`,
        label: 'Variable',
        type: 'Article',
        sortOrder: 1,
      }
      const input_js_variable_src: { key: StorageNodeGetKeyInput; input: SaveArticleSrcContentInput } = {
        key: input_js_variable,
        input: {
          lang,
          srcContent: 'Variable',
          searchContent: 'Variable',
          srcTags: [],
        },
      }

      // TypeScript
      const input_ts: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}`,
        label: 'TypeScript',
        type: 'TreeBundle',
        sortOrder: 1,
      }

      // TypeScript/Interface
      const input_ts_interface: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}/${input_ts.id}`,
        label: 'Interface',
        type: 'Article',
        sortOrder: 3,
      }
      const input_ts_interface_src: { key: StorageNodeGetKeyInput; input: SaveArticleSrcContentInput } = {
        key: input_ts_interface,
        input: {
          lang,
          srcContent: 'Interface',
          searchContent: 'Interface',
          srcTags: [],
        },
      }

      // TypeScript/Class
      const input_ts_class: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}/${input_ts.id}`,
        label: 'Class',
        type: 'Article',
        sortOrder: 2,
      }
      const input_ts_class_src: { key: StorageNodeGetKeyInput; input: SaveArticleSrcContentInput } = {
        key: input_ts_class,
        input: {
          lang,
          srcContent: 'Class',
          searchContent: 'Class',
          srcTags: [],
        },
      }

      // TypeScript/Types
      const input_ts_types: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}/${input_ts.id}`,
        label: 'Types',
        type: 'Category',
        sortOrder: 1,
      }

      // TypeScript/Types/PrimitiveType
      const input_ts_types_primitive: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}/${input_ts.id}/${input_ts_types.id}`,
        label: 'PrimitiveType',
        type: 'Article',
        sortOrder: 2,
      }
      const input_ts_types_primitive_src: { key: StorageNodeGetKeyInput; input: SaveArticleSrcContentInput } = {
        key: input_ts_types_primitive,
        input: {
          lang,
          srcContent: 'PrimitiveType',
          searchContent: 'PrimitiveType',
          srcTags: [],
        },
      }

      // TypeScript/Types/LiteralType
      const input_ts_types_literal: CreateArticleTypeDirInput = {
        lang,
        id: StorageSchema.generateId(),
        dir: `${articleRoot.path}/${input_ts.id}/${input_ts_types.id}`,
        label: 'LiteralType',
        type: 'Article',
        sortOrder: 1,
      }
      const input_ts_types_literal_src: { key: StorageNodeGetKeyInput; input: SaveArticleSrcContentInput } = {
        key: input_ts_types_literal,
        input: {
          lang,
          srcContent: 'LiteralType',
          searchContent: 'LiteralType',
          srcTags: [],
        },
      }

      try {
        await Promise.all([
          storageService.createArticleTypeDir(input_blog).then(node => (blog = node)),
          storageService.createArticleTypeDir(input_js).then(node => (js = node)),
          storageService.createArticleTypeDir(input_ts).then(node => (ts = node)),
        ])
        await Promise.all([
          storageService.createArticleTypeDir(input_blog_note2).then(node => (blog_note2 = node)),
          storageService.createArticleTypeDir(input_blog_note1).then(node => (blog_note1 = node)),
          storageService.createArticleTypeDir(input_js_variable).then(node => (js_variable = node)),
          storageService.createArticleTypeDir(input_ts_interface).then(node => (ts_interface = node)),
          storageService.createArticleTypeDir(input_ts_class).then(node => (ts_class = node)),
          storageService.createArticleTypeDir(input_ts_types).then(node => (ts_types = node)),
        ])
        await Promise.all([
          storageService.createArticleTypeDir(input_ts_types_primitive).then(node => (ts_types_primitive = node)),
          storageService.createArticleTypeDir(input_ts_types_literal).then(node => (ts_types_literal = node)),
        ])
        await Promise.all([
          storageService.saveArticleSrcContent(input_blog_note2_src.key, input_blog_note2_src.input),
          storageService.saveArticleSrcContent(input_blog_note1_src.key, input_blog_note1_src.input),
          storageService.saveArticleSrcContent(input_js_variable_src.key, input_js_variable_src.input),
          storageService.saveArticleSrcContent(input_ts_interface_src.key, input_ts_interface_src.input),
          storageService.saveArticleSrcContent(input_ts_class_src.key, input_ts_class_src.input),
          storageService.saveArticleSrcContent(input_ts_types_primitive_src.key, input_ts_types_primitive_src.input),
          storageService.saveArticleSrcContent(input_ts_types_literal_src.key, input_ts_types_literal_src.input),
        ])
      } catch (err) {
        console.log(err)
      }
    }

    describe('他ユーザーによる目次取得', () => {
      it('全ての記事系ディレクトリは公開未設定', async () => {
        await setupArticleTypeNodes('ja')

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        expect(actual.length).toBe(0)
      })

      it('リストバンドルを公開設定 - リストバンドル配下に公開記事がある場合', async () => {
        await setupArticleTypeNodes('ja')

        await Promise.all([
          // リストバンドルを公開未設定
          storageService.setDirShareDetail(blog, { isPublic: null }),
          // リストバンドル配下の記事を一部公開設定
          storageService.setDirShareDetail(blog_note1, { isPublic: true }),
          storageService.setDirShareDetail(blog_note2, { isPublic: false }),
          // ツリーバンドルを非公開設定
          storageService.setDirShareDetail(js, { isPublic: false }),
          storageService.setDirShareDetail(ts, { isPublic: false }),
        ])

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        // リストバンドルは取得される
        expect(actual.length).toBe(1)
        await verifyArticleTableOfContentsItem('ja', actual[0], blog)
      })

      it('リストバンドルを公開設定 - リストバンドル配下に公開記事がない場合', async () => {
        await setupArticleTypeNodes('ja')

        await Promise.all([
          // リストバンドルを公開未設定
          storageService.setDirShareDetail(blog, { isPublic: null }),
          // リストバンドル配下の記事を非公開設定
          storageService.setDirShareDetail(blog_note1, { isPublic: false }), // 非公開
          storageService.setDirShareDetail(blog_note2, { isPublic: null }), // 未設定
          // ツリーバンドルを非公開設定
          storageService.setDirShareDetail(js, { isPublic: false }),
          storageService.setDirShareDetail(ts, { isPublic: false }),
        ])

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        // リストバンドル配下に読み込み可能な記事がないのでリストバンドルは取得されない
        expect(actual.length).toBe(0)
      })

      it('リストバンドルを公開設定 - 記事に下書きしかない場合', async () => {
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
        users = articleRootNodes[0]
        userRoot = articleRootNodes[1]
        articleRoot = articleRootNodes[2]

        // Blog
        blog = await storageService.createArticleTypeDir({
          lang: 'ja',
          id: StorageSchema.generateId(),
          dir: `${articleRoot.path}`,
          label: 'Blog',
          type: 'ListBundle',
          sortOrder: 3,
          share: { isPublic: true }, // 公開設定
        })

        // Blog/Note2 (下書きのみ)
        blog_note2 = await storageService.createArticleTypeDir({
          lang: 'ja',
          id: StorageSchema.generateId(),
          dir: `${articleRoot.path}/${blog.id}`,
          label: 'Note2',
          type: 'Article',
          sortOrder: 2,
          share: { isPublic: true }, // 公開設定
        })

        // Blog/Note1 (下書きのみ)
        blog_note1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          id: StorageSchema.generateId(),
          dir: `${articleRoot.path}/${blog.id}`,
          label: 'Note1',
          type: 'Article',
          sortOrder: 1,
          share: { isPublic: null }, // 公開未設定
        })

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        // リストバンドル配下に下書きしかない場合、リストバンドルは取得されない
        expect(actual.length).toBe(0)
      })

      it('リストバンドルを非公開設定 - リストバンドル配下に公開記事がある場合', async () => {
        await setupArticleTypeNodes('ja')

        await Promise.all([
          // リストバンドルを非公開設定
          storageService.setDirShareDetail(blog, { isPublic: false }),
          // リストバンドル配下の記事を非公開設定
          storageService.setDirShareDetail(blog_note1, { isPublic: true }), // 公開
          storageService.setDirShareDetail(blog_note2, { isPublic: null }), // 未設定
          // ツリーバンドルを非公開設定
          storageService.setDirShareDetail(js, { isPublic: false }),
          storageService.setDirShareDetail(ts, { isPublic: false }),
        ])

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        // リストバンドルが非公開だと配下の記事が公開されていてもそのリストバンドルは取得されない
        expect(actual.length).toBe(0)
      })

      it('リストバンドルを非公開設定 - リストバンドル配下に読み込み権限設定された記事がある場合', async () => {
        await setupArticleTypeNodes('ja')

        await Promise.all([
          // リストバンドルを非公開設定
          storageService.setDirShareDetail(blog, { isPublic: false }),
          // リストバンドル配下のノードを読み込み権限設定
          storageService.setDirShareDetail(blog_note1, { readUIds: [GeneralUserToken().uid] }),
          // ツリーバンドルを非公開設定
          storageService.setDirShareDetail(js, { isPublic: false }),
          storageService.setDirShareDetail(ts, { isPublic: false }),
        ])

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        // リストバンドルが非公開でも配下の記事が読み込み権限設定されていればそのリストバンドルが取得される
        expect(actual.length).toBe(1)
        await verifyArticleTableOfContentsItem('ja', actual[0], blog)
      })

      it('カテゴリを公開設定 - カテゴリ配下に読公開記事がある場合', async () => {
        await setupArticleTypeNodes('ja')

        await Promise.all([
          // カテゴリを公開設定
          storageService.setDirShareDetail(ts, { isPublic: true }),
          // カテゴリ配下の記事を一部公開設定
          storageService.setDirShareDetail(ts_interface, { isPublic: true }),
          storageService.setDirShareDetail(ts_class, { isPublic: false }),
          storageService.setDirShareDetail(ts_types, { isPublic: false }),
          // リストバンドルを非公開設定
          storageService.setDirShareDetail(blog, { isPublic: false }),
        ])

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        expect(actual.length).toBe(2)
        await verifyArticleTableOfContentsItem('ja', actual[0], ts)
        await verifyArticleTableOfContentsItem('ja', actual[1], ts_interface)
      })

      it('カテゴリを公開設定 - カテゴリ配下に公開記事がない場合', async () => {
        await setupArticleTypeNodes('ja')

        await Promise.all([
          // カテゴリを公開設定
          storageService.setDirShareDetail(ts, { isPublic: true }),
          // カテゴリ配下の記事を非公開設定
          storageService.setDirShareDetail(ts_interface, { isPublic: false }), // 非公開
          storageService.setDirShareDetail(ts_class, { isPublic: false }), // 非公開
          storageService.setDirShareDetail(ts_types, { isPublic: false }), // 非公開
          // リストバンドルを非公開設定
          storageService.setDirShareDetail(blog, { isPublic: false }),
        ])

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        expect(actual.length).toBe(0)
      })

      it('カテゴリを公開設定 - 記事に下書きしかない場合', async () => {
        // 記事ルートを作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
        users = articleRootNodes[0]
        userRoot = articleRootNodes[1]
        articleRoot = articleRootNodes[2]

        // TypeScript
        ts = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRoot.path}`,
          label: 'TypeScript',
          type: 'TreeBundle',
          sortOrder: 1,
          share: { isPublic: true }, // 公開設定
        })

        // Interface (下書きのみ)
        ts_interface = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${ts.path}`,
          label: 'Interface',
          type: 'Article',
          sortOrder: 2,
          share: { isPublic: true }, // 公開設定
        })
        ts_interface = await storageService.saveArticleDraftContent(ts_interface, {
          lang: 'ja',
          draftContent: 'Interface',
          draftTags: [],
        })

        // Class (本文あり)
        ts_class = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${ts.path}`,
          label: 'Class',
          type: 'Article',
          sortOrder: 1,
          share: { isPublic: null }, // 公開未設定
        })
        ts_class = await storageService.saveArticleSrcContent(ts_class, {
          lang: 'ja',
          srcContent: 'Class',
          searchContent: 'Class',
          srcTags: [],
        })

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        expect(actual.length).toBe(2)
        await verifyArticleTableOfContentsItem('ja', actual[0], ts)
        await verifyArticleTableOfContentsItem('ja', actual[1], ts_class)
      })

      it('カテゴリを非公開設定 - カテゴリ配下に公開記事がある場合', async () => {
        await setupArticleTypeNodes('ja')

        await Promise.all([
          // カテゴリを非公開設定
          storageService.setDirShareDetail(ts, { isPublic: false }),
          storageService.setDirShareDetail(ts_types, { isPublic: false }),
          // カテゴリ配下の記事を公開設定
          storageService.setDirShareDetail(ts_types_primitive, { isPublic: true }),
          // リストバンドルを非公開設定
          storageService.setDirShareDetail(blog, { isPublic: false }),
        ])

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        // カテゴリが非公開だと配下の記事が公開されていてもそのカテゴリの階層は取得されない
        expect(actual.length).toBe(0)
      })

      it('カテゴリを非公開設定 - カテゴリ配下に読み込み権限設定された記事がある場合', async () => {
        await setupArticleTypeNodes('ja')

        await Promise.all([
          // カテゴリを非公開設定
          storageService.setDirShareDetail(ts, { isPublic: false }),
          storageService.setDirShareDetail(ts_types, { isPublic: false }),
          // カテゴリ配下の記事に読み込み権限設定
          storageService.setDirShareDetail(ts_types_primitive, { readUIds: [GeneralUserToken().uid] }),
          // リストバンドルを非公開設定
          storageService.setDirShareDetail(blog, { isPublic: false }),
        ])

        const actual = await storageService.getUserArticleTableOfContents(GeneralUserToken(), { lang: 'ja', userName: StorageUser().userName })

        // カテゴリが非公開でも配下の記事が読み込み権限設定されていればその階層が取得される
        expect(actual.length).toBe(3)
        await verifyArticleTableOfContentsItem('ja', actual[0], ts)
        await verifyArticleTableOfContentsItem('ja', actual[1], ts_types)
        await verifyArticleTableOfContentsItem('ja', actual[2], ts_types_primitive)
      })
    })

    it('自ユーザーによる目次取得', async () => {
      await setupArticleTypeNodes('ja')

      const actual = await storageService.getUserArticleTableOfContents(StorageUserToken(), { lang: 'ja', userName: StorageUser().userName })

      expect(actual.length).toBe(9)
      await verifyArticleTableOfContentsItem('ja', actual[0], blog)
      await verifyArticleTableOfContentsItem('ja', actual[1], js)
      await verifyArticleTableOfContentsItem('ja', actual[2], js_variable)
      await verifyArticleTableOfContentsItem('ja', actual[3], ts)
      await verifyArticleTableOfContentsItem('ja', actual[4], ts_interface)
      await verifyArticleTableOfContentsItem('ja', actual[5], ts_class)
      await verifyArticleTableOfContentsItem('ja', actual[6], ts_types)
      await verifyArticleTableOfContentsItem('ja', actual[7], ts_types_primitive)
      await verifyArticleTableOfContentsItem('ja', actual[8], ts_types_literal)
    })

    it('サインインしていないユーザーによる目次取得', async () => {
      await setupArticleTypeNodes('ja')

      await Promise.all([
        // リストバンドルを公開設定
        storageService.setDirShareDetail(blog, { isPublic: true }),
        // カテゴリを公開設定
        storageService.setDirShareDetail(ts, { isPublic: true }),
        // カテゴリ配下のノードの一部を非公開設定
        storageService.setDirShareDetail(ts_interface, { isPublic: true }),
        storageService.setDirShareDetail(ts_class, { isPublic: false }),
        storageService.setDirShareDetail(ts_types, { isPublic: false }),
      ])

      const actual = await storageService.getUserArticleTableOfContents(undefined, { lang: 'ja', userName: StorageUser().userName })

      expect(actual.length).toBe(3)
      await verifyArticleTableOfContentsItem('ja', actual[0], blog)
      await verifyArticleTableOfContentsItem('ja', actual[1], ts)
      await verifyArticleTableOfContentsItem('ja', actual[2], ts_interface)
    })

    it('目次がない場合', async () => {
      // 記事ルートを作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      const actual = await storageService.getUserArticleTableOfContents(StorageUserToken(), { lang: 'ja', userName: StorageUser().userName })

      expect(actual.length).toBe(0)
    })

    it('記事ルートがまだ存在しない場合', async () => {
      const actual = await storageService.getUserArticleTableOfContents(StorageUserToken(), { lang: 'ja', userName: StorageUser().userName })

      expect(actual.length).toBe(0)
    })

    it('日本語', async () => {
      await setupArticleTypeNodes('ja')

      // カテゴリを公開設定
      await storageService.setDirShareDetail(js, { isPublic: true })

      const actual = await storageService.getUserArticleTableOfContents(undefined, { lang: 'ja', userName: StorageUser().userName })

      expect(actual.length).toBe(2)
      await verifyArticleTableOfContentsItem('ja', actual[0], js)
      await verifyArticleTableOfContentsItem('ja', actual[1], js_variable)
    })

    it('英語 ', async () => {
      await setupArticleTypeNodes('en')

      // カテゴリを公開設定
      await storageService.setDirShareDetail(js, { isPublic: true })

      const actual = await storageService.getUserArticleTableOfContents(undefined, { lang: 'en', userName: StorageUser().userName })

      expect(actual.length).toBe(2)
      await verifyArticleTableOfContentsItem('en', actual[0], js)
      await verifyArticleTableOfContentsItem('en', actual[1], js_variable)
    })
  })

  describe('searchArticleList', () => {
    beforeAll(async () => {
      await devUtilsService.setTestUsers(AppAdminUser(), GeneralUser(), StorageUser())
    })

    async function setupArticleTypeNodes() {
      // users
      // └test.storage
      //   └articles
      //     ├漫画
      //     │├「ドラゴンボール」の感想
      //     │└「Dr.スランプ」の感想
      //     ├ゲーム
      //     │├「ドラゴンボールZ カカロット」のレビュー
      //     │└「ドラゴンクエスト」のレビュー
      //     └旅行

      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
      const users = articleRootNodes[0]
      const userRoot = articleRootNodes[1]
      const articleRoot = articleRootNodes[2]

      let comics!: StorageNode
      let comic1!: StorageNode
      let comic2!: StorageNode
      let games!: StorageNode
      let game1!: StorageNode
      let game2!: StorageNode
      let travel!: StorageNode

      // eslint-disable-next-line no-async-promise-executor
      const comicsPromise = new Promise<void>(async resolve => {
        comics = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRoot.path}`,
          label: '漫画',
          type: 'TreeBundle',
          sortOrder: 2,
        })
        comics = await storageService.renameArticleTypeDir({
          lang: 'en',
          dir: `${comics.path}`,
          label: 'Comics',
        })
        comic1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${comics.path}`,
          label: '「ドラゴンボール」の感想',
          type: 'Article',
          sortOrder: 2,
        })
        comic1 = await storageService.saveArticleSrcContent(comic1, {
          lang: 'ja',
          srcContent: `# 概要\n鳥山明による日本の漫画作品とその作中に登場するアイテムの名称。`,
          searchContent: `概要 鳥山明による日本の漫画作品とその作中に登場するアイテムの名称。`,
          srcTags: ['少年漫画', '冒険', 'バトル'],
        })
        comic2 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${comics.path}`,
          label: '「Dr.スランプ」の感想',
          type: 'Article',
          sortOrder: 1,
        })
        comic2 = await storageService.saveArticleSrcContent(comic2, {
          lang: 'ja',
          srcContent: `# 概要\n鳥山明による日本のギャグ漫画作品。`,
          searchContent: `概要 鳥山明による日本のギャグ漫画作品。`,
          srcTags: ['少年漫画', 'ギャグ'],
        })

        comic1 = await storageService.renameArticleTypeDir({
          lang: 'en',
          dir: `${comic1.path}`,
          label: 'Impression of DRAGON BALL',
        })
        comic1 = await storageService.saveArticleSrcContent(comic1, {
          lang: 'en',
          srcContent: `# Overview\nThe name of a Japanese manga work by Akira Toriyama and the items that appear in it.`,
          searchContent: `Overview The name of a Japanese manga work by Akira Toriyama and the items that appear in it.`,
          srcTags: ['BoysComic', 'Adventure', 'Battle'],
        })

        resolve()
      })

      // eslint-disable-next-line no-async-promise-executor
      const gamesPromise = new Promise<void>(async resolve => {
        games = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRoot.path}`,
          label: 'ゲーム',
          type: 'TreeBundle',
          sortOrder: 1,
        })
        game1 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${games.path}`,
          label: '「ドラゴンボールZ カカロット」のレビュー',
          type: 'Article',
          sortOrder: 2,
        })
        game1 = await storageService.saveArticleSrcContent(game1, {
          lang: 'ja',
          srcContent: `# 概要\n鳥山明の漫画およびアニメ「ドラゴンボール」を題材にしたアクションRPG。`,
          searchContent: `概要 鳥山明の漫画およびアニメ「ドラゴンボール」を題材にしたアクションRPG。`,
          srcTags: ['アクション', 'RPG'],
        })
        game2 = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${games.path}`,
          label: '「ドラゴンクエスト」のレビュー',
          type: 'Article',
          sortOrder: 1,
        })
        game2 = await storageService.saveArticleSrcContent(game2, {
          lang: 'ja',
          srcContent: `# 概要\nエニックスより発売されたファミコン用ロールプレイングゲーム。キャラクターデザインは鳥山明が担当。`,
          searchContent: `概要 エニックスより発売されたファミコン用ロールプレイングゲーム。キャラクターデザインは鳥山明が担当。`,
          srcTags: ['RPG'],
        })

        resolve()
      })

      // eslint-disable-next-line no-async-promise-executor
      const travelPromise = new Promise<void>(async resolve => {
        travel = await storageService.createArticleTypeDir({
          lang: 'ja',
          dir: `${articleRoot.path}`,
          label: '旅行',
          type: 'TreeBundle',
          sortOrder: 1,
        })

        resolve()
      })

      await Promise.all([comicsPromise, gamesPromise])

      return { users, userRoot, articleRoot, comics, comic1, comic2, games, game1, game2, travel }
    }

    async function setupArticleNodes(dirNode: StorageNode, num: number, privateNumbers: number[] = []) {
      const articleNodes = await Promise.all(
        [...Array(num)].map(async (_, i) => {
          const label = `記事${(i + 1).toString().padStart(num.toString().length, '0')}`
          const articleNode = await storageService.createArticleTypeDir({
            lang: 'ja',
            dir: `${dirNode.path}`,
            label,
            type: 'Article',
            sortOrder: i + 1,
            share: { isPublic: !privateNumbers.includes(i + 1) },
          })
          return await storageService.saveArticleSrcContent(articleNode, {
            lang: 'ja',
            srcContent: label,
            searchContent: label,
            srcTags: [],
          })
        })
      )
      articleNodes.sort((a, b) => b.article!.sortOrder - a.article!.sortOrder)

      return articleNodes
    }

    async function verifyArticleListItem(lang: LangCode, actual: ArticleListItem, expected: StorageNode): Promise<void> {
      const allNodes = (await storageService.getDescendants({ path: '' })).list

      expect(actual.id).toBe(expected.id)
      expect(actual.name).toBe(expected.name)
      expect(actual.dir).toEqual(StorageService.toArticlePathDetails(lang, expected.dir, allNodes))
      expect(actual.path).toEqual(StorageService.toArticlePathDetails(lang, expected.path, allNodes))
      expect(actual.createdAt).toEqual(expected.article!.src![lang]!.createdAt)
      expect(actual.updatedAt).toEqual(expected.article!.src![lang]!.updatedAt)
    }

    it('ベーシックケース', async () => {
      await setupArticleTypeNodes()

      const pager = new Pager(storageService, storageService.searchArticleList, { pageSize: 3, useToken: false })

      const actual1 = await pager.start(StorageUserToken(), `lang:ja 鳥山`)
      expect(pager.token).toBeDefined()
      expect(pager.pageNum).toBe(1)
      expect(pager.totalPages).toBe(2)
      expect(pager.totalItems).toBe(4)
      expect(pager.maxItems).toBe(4)
      expect(pager.hasNext()).toBeTruthy()
      expect(actual1.length).toBe(3)
      expect(actual1[0].label).toEqual('「Dr.スランプ」の感想')
      expect(actual1[1].label).toEqual('「ドラゴンボール」の感想')
      expect(actual1[2].label).toEqual('「ドラゴンボールZ カカロット」のレビュー')

      const actual2 = await pager.next()
      expect(pager.pageNum).toBe(2)
      expect(pager.hasNext()).toBeFalsy()
      expect(actual2.length).toBe(1)
      expect(actual2[0].label).toEqual('「ドラゴンクエスト」のレビュー')
    })

    it('日本語', async () => {
      const { comics, comic1 } = await setupArticleTypeNodes()

      const pager = new Pager(storageService, storageService.searchArticleList, { pageSize: 3, useToken: false })
      const actual = await pager.fetchAll(
        StorageUserToken(),
        `lang:ja user:${StorageUser().userName} title:ドラゴンボール tag:冒険 dir:${comics.id} 鳥山 漫画`
      )

      expect(actual.length).toBe(1)
      expect(actual[0].label).toBe(`「<mark>ドラゴン</mark><mark>ボール</mark>」の感想`)
      expect(actual[0].tags).toEqual(['少年漫画', '<mark>冒険</mark>', 'バトル'])
      expect(actual[0].content).toEqual(`概要 <mark>鳥山</mark>明による日本の<mark>漫画</mark>作品とその作中に登場するアイテムの名称。`)
      await verifyArticleListItem('ja', actual[0], comic1)
    })

    it('英語', async () => {
      const { comics, comic1 } = await setupArticleTypeNodes()

      const pager = new Pager(storageService, storageService.searchArticleList, { pageSize: 3, useToken: false })
      const actual = await pager.fetchAll(
        StorageUserToken(),
        `lang:en user:${StorageUser().userName} title:"DRAGON BALL" tag:Adventure dir:${comics.id} Toriyama manga`
      )

      expect(actual.length).toBe(1)
      expect(actual[0].label).toBe(`Impression of <mark>DRAGON</mark> <mark>BALL</mark>`)
      expect(actual[0].tags).toEqual(['BoysComic', '<mark>Adventure</mark>', 'Battle'])
      expect(actual[0].content).toEqual(
        `Overview The name of a Japanese <mark>manga</mark> work by Akira <mark>Toriyama</mark> and the items that appear in it.`
      )
      await verifyArticleListItem('en', actual[0], comic1)
    })

    describe('他ユーザーによる記事リスト取得', () => {
      it('対象カテゴリを公開設定', async () => {
        const { comics, comic1, comic2 } = await setupArticleTypeNodes()

        // 対象カテゴリを公開設定
        await storageService.setDirShareDetail(comics, { isPublic: true })

        const pager = new Pager(storageService, storageService.searchArticleList)
        const actual = await pager.start(GeneralUserToken(), '鳥山')

        expect(actual.length).toBe(2)
        await verifyArticleListItem('ja', actual[0], comic2)
        await verifyArticleListItem('ja', actual[1], comic1)
      })

      it('対象カテゴリを公開設定 - 記事の一部を非公開設定', async () => {
        const { comics, comic1, comic2 } = await setupArticleTypeNodes()

        // 対象カテゴリを公開設定
        await storageService.setDirShareDetail(comics, { isPublic: true })
        // 対象カテゴリ直下の記事を一部非公開設定
        await storageService.setDirShareDetail(comic1, { isPublic: false })

        const pager = new Pager(storageService, storageService.searchArticleList)
        const actual = await pager.start(GeneralUserToken(), '鳥山')

        expect(actual.length).toBe(1)
        await verifyArticleListItem('ja', actual[0], comic2)
      })

      it('対象カテゴリを公開設定 - 記事の一部に読み込み権限設定', async () => {
        const { comics, comic1 } = await setupArticleTypeNodes()

        // 対象カテゴリを非公開設定
        await storageService.setDirShareDetail(comics, { isPublic: false })
        // 対象カテゴリ直下の記事を一部読み込み権限設定
        await storageService.setDirShareDetail(comic1, { readUIds: [GeneralUserToken().uid] })

        const pager = new Pager(storageService, storageService.searchArticleList)
        const actual = await pager.start(GeneralUserToken(), '鳥山')

        expect(actual.length).toBe(1)
        await verifyArticleListItem('ja', actual[0], comic1)
      })
    })

    it('自ユーザーによる記事リスト取得', async () => {
      const { comic1, comic2, game1, game2 } = await setupArticleTypeNodes()

      const pager = new Pager(storageService, storageService.searchArticleList)
      const actual = await pager.start(StorageUserToken(), '鳥山')

      expect(actual.length).toBe(4)
      await verifyArticleListItem('ja', actual[0], comic2)
      await verifyArticleListItem('ja', actual[1], game1)
      await verifyArticleListItem('ja', actual[2], comic1)
      await verifyArticleListItem('ja', actual[3], game2)
    })

    it('サインインしていないユーザーによる記事リスト取得', async () => {
      const { comics, comic1, comic2 } = await setupArticleTypeNodes()

      // 対象カテゴリを公開設定
      await storageService.setDirShareDetail(comics, { isPublic: true })

      const pager = new Pager(storageService, storageService.searchArticleList)
      const actual = await pager.start(undefined, '鳥山')

      expect(actual.length).toBe(2)
      await verifyArticleListItem('ja', actual[0], comic2)
      await verifyArticleListItem('ja', actual[1], comic1)
    })

    it('検索条件に記事がマッチしない場合', async () => {
      await setupArticleTypeNodes()

      const pager = new Pager(storageService, storageService.searchArticleList)
      const actual = await pager.start(StorageUserToken(), '漢人')

      expect(actual.length).toBe(0)
    })

    it('記事に下書きしかない場合', async () => {
      const { articleRoot } = await setupArticleTypeNodes()

      const travel = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRoot.path}`,
        label: '旅行',
        type: 'TreeBundle',
        sortOrder: 1,
      })

      // 旅行記1 (下書きのみ)
      let travel1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${travel.path}`,
        label: '旅行記1',
        type: 'Article',
        sortOrder: 2,
      })
      travel1 = await storageService.saveArticleDraftContent(travel1, {
        lang: 'ja',
        draftContent: '# 旅行記1',
        draftTags: [],
      })

      // 旅行記2 (本文あり)
      let travel2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${travel.path}`,
        label: '旅行記2',
        type: 'Article',
        sortOrder: 1,
      })
      travel2 = await storageService.saveArticleSrcContent(travel2, {
        lang: 'ja',
        srcContent: '# 旅行記2',
        searchContent: '旅行記2',
        srcTags: [],
      })

      const pager = new Pager(storageService, storageService.searchArticleList)
      const actual = await pager.start(StorageUserToken(), `lang:ja dir:${travel.id}`)

      expect(actual.length).toBe(1)
      await verifyArticleListItem('ja', actual[0], travel2)
    })

    it('取得上限より記事リストが多い場合', async () => {
      // この設定により、1回の検索で取得上限の記事リストが取得されることになる
      const elastic = require('../../../../../src/app/services/base/elastic')
      // - Elasticsearchの取得上限を変更
      td.replace(elastic.ElasticConstants, 'MaxResultSize', 5)
      // - 1回の検索で取得する件数を変更
      td.replace(elastic.ElasticConstants, 'ChunkSize', 5)

      // 記事リストを10件作成
      const { travel } = await setupArticleTypeNodes()
      await setupArticleNodes(travel, 10)

      // 記事リストを1ページ3件で分割する
      const pager = new Pager(storageService, storageService.searchArticleList, { pageSize: 3 })

      const actual1 = await pager.start(
        StorageUserToken(), // 自ユーザーを指定
        `記事`
      )
      expect(pager.token).toBeDefined()
      expect(pager.pageNum).toBe(1)
      expect(pager.totalPages).toBe(2)
      expect(pager.totalItems).toBe(10) // 実際に存在する記事リストは10件
      expect(pager.maxItems).toBe(5) // 取得可能な記事リストは5件
      expect(pager.hasNext()).toBeTruthy()
      expect(actual1.length).toBe(3) // 1ページ目で3件取得

      const actual2 = await pager.next()
      expect(pager.pageNum).toBe(2)
      expect(pager.hasNext()).toBeFalsy()
      expect(actual2.length).toBe(2) // 2ページ目で2件取得
    })

    describe('大量データの場合', () => {
      it('ベーシックケース', async () => {
        const { travel } = await setupArticleTypeNodes()
        await setupArticleNodes(travel, 10)

        // 大量データを想定して検索を行う
        const actual = await new Pager(storageService, storageService.searchArticleList, { pageSize: 3 }).fetchAll(
          StorageUserToken(), // 自ユーザーを指定
          `dir:${travel.id} 記事`
        )

        actual.sort((a, b) => {
          return a.label > b.label ? -1 : a.label < b.label ? 1 : 0
        })
        expect(actual.length).toBe(10)
        expect(actual[0].label).toBe(`<mark>記事</mark>10`)
        expect(actual[1].label).toBe(`<mark>記事</mark>09`)
        expect(actual[2].label).toBe(`<mark>記事</mark>08`)
        expect(actual[3].label).toBe(`<mark>記事</mark>07`)
        expect(actual[4].label).toBe(`<mark>記事</mark>06`)
        expect(actual[5].label).toBe(`<mark>記事</mark>05`)
        expect(actual[6].label).toBe(`<mark>記事</mark>04`)
        expect(actual[7].label).toBe(`<mark>記事</mark>03`)
        expect(actual[8].label).toBe(`<mark>記事</mark>02`)
        expect(actual[9].label).toBe(`<mark>記事</mark>01`)
      })

      it('読み込みできない記事が含まれている場合', async () => {
        const { travel } = await setupArticleTypeNodes()
        // 以下の番号の記事を非公開にする
        await setupArticleNodes(travel, 20, [3, 5, 6, 12, 13, 15, 16, 19, 20])

        // 対象バンドルを公開設定
        await storageService.setDirShareDetail(travel, { isPublic: true })

        // 大量データを想定して検索を行う
        const actual = await new Pager(storageService, storageService.searchArticleList, { pageSize: 3 }).fetchAll(
          GeneralUserToken(), // 他ユーザーを指定
          `dir:${travel.id} 記事`
        )

        actual.sort((a, b) => {
          return a.label > b.label ? -1 : a.label < b.label ? 1 : 0
        })
        expect(actual.length).toBe(11)
        expect(actual[0].label).toBe(`<mark>記事</mark>18`)
        expect(actual[1].label).toBe(`<mark>記事</mark>17`)
        expect(actual[2].label).toBe(`<mark>記事</mark>14`)
        expect(actual[3].label).toBe(`<mark>記事</mark>11`)
        expect(actual[4].label).toBe(`<mark>記事</mark>10`)
        expect(actual[5].label).toBe(`<mark>記事</mark>09`)
        expect(actual[6].label).toBe(`<mark>記事</mark>08`)
        expect(actual[7].label).toBe(`<mark>記事</mark>07`)
        expect(actual[8].label).toBe(`<mark>記事</mark>04`)
        expect(actual[9].label).toBe(`<mark>記事</mark>02`)
        expect(actual[10].label).toBe(`<mark>記事</mark>01`)
      })
    })
  })

  describe('sortNodes', () => {
    it('パターン①', async () => {
      // users
      // └test.storage
      //   ├articles
      //   │├blog
      //   ││├artA
      //   │││├images
      //   ││││├picA.png
      //   ││││└picB.png
      //   │││└memo.txt
      //   ││└artB
      //   │├programming
      //   ││├artC
      //   ││├artD
      //   ││├TypeScript
      //   │││├artE
      //   │││└artF
      //   ││└JavaScript
      //   │└assets
      //   │  ├picC.png
      //   │  └picD.png
      //   └tmp
      //     ├d1
      //     │├f11.txt
      //     │└f12.txt
      //     ├d2
      //     └f1.txt

      const now = dayjs()

      const users = h.newDirNode(config.storage.user.rootName)

      const userRoot = h.newDirNode(StorageService.toUserRootPath(StorageUserToken()))

      const articleRoot = h.newDirNode(StorageService.toArticleRootPath(StorageUserToken()))

      const blog = h.newDirNode(`${articleRoot.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'blog' }, type: 'ListBundle', sortOrder: 2 },
      })

      const blog_artA = h.newDirNode(`${blog.path}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'art1' },
          type: 'Article',
          sortOrder: 2,
          src: { ja: { createdAt: now, updatedAt: now } },
        },
      })

      const blog_artA_images = h.newDirNode(`${blog_artA.path}/images`)

      const blog_artA_images_picA = h.newFileNode(`${blog_artA_images.path}/picA.png`)

      const blog_artA_images_picB = h.newFileNode(`${blog_artA_images.path}/picB.png`)

      const blog_artA_memo = h.newFileNode(`${blog_artA.path}/memo.txt`)

      const blog_artB = h.newDirNode(`${blog.path}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'art2' },
          type: 'Article',
          sortOrder: 1,
          src: { ja: { createdAt: now, updatedAt: now } },
        },
      })

      const programming = h.newDirNode(`${articleRoot.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'programming' }, type: 'TreeBundle', sortOrder: 1 },
      })

      const programming_artC = h.newDirNode(`${programming.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'art1' }, type: 'Article', sortOrder: 4 },
      })

      const programming_artD = h.newDirNode(`${programming.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'art2' }, type: 'Article', sortOrder: 3 },
      })

      const programming_ts = h.newDirNode(`${programming.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'TypeScript' }, type: 'Category', sortOrder: 2 },
      })

      const programming_ts_artE = h.newDirNode(`${programming_ts.path}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'art1' },
          type: 'Article',
          sortOrder: 2,
          src: { ja: { createdAt: now, updatedAt: now } },
        },
      })

      const programming_ts_artF = h.newDirNode(`${programming_ts.path}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'art2' },
          type: 'Article',
          sortOrder: 1,
          src: { ja: { createdAt: now, updatedAt: now } },
        },
      })

      const programming_js = h.newDirNode(`${programming.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'JavaScript' }, type: 'Category', sortOrder: 1 },
      })

      const assets = h.newDirNode(StorageService.toArticleAssetsPath(StorageUserToken()))
      const assets_picC = h.newFileNode(`${assets.path}/picC.png`)
      const assets_picD = h.newFileNode(`${assets.path}/picD.png`)

      const tmp = h.newDirNode(`${userRoot.path}/tmp`)
      const d1 = h.newDirNode(`${tmp.path}/d1`)
      const f11 = h.newFileNode(`${d1.path}/f11.txt`)
      const f12 = h.newFileNode(`${d1.path}/f12.txt`)
      const d2 = h.newDirNode(`${tmp.path}/d2`)
      const f1 = h.newFileNode(`${tmp.path}/f1.txt`)

      const nodes = shuffleArray([
        users,
        userRoot,
        articleRoot,
        blog,
        blog_artA,
        blog_artA_images,
        blog_artA_images_picA,
        blog_artA_images_picB,
        blog_artA_memo,
        blog_artB,
        programming,
        programming_artC,
        programming_artD,
        programming_ts,
        programming_ts_artE,
        programming_ts_artF,
        programming_js,
        assets,
        assets_picC,
        assets_picD,
        tmp,
        d1,
        f11,
        f12,
        d2,
        f1,
      ])

      // テスト対象実行
      StorageService.sortNodes(nodes)

      expect(nodes[0]).toBe(users)
      expect(nodes[1]).toBe(userRoot)
      expect(nodes[2]).toBe(articleRoot)
      expect(nodes[3]).toBe(blog)
      expect(nodes[4]).toBe(blog_artA)
      expect(nodes[5]).toBe(blog_artA_images)
      expect(nodes[6]).toBe(blog_artA_images_picA)
      expect(nodes[7]).toBe(blog_artA_images_picB)
      expect(nodes[8]).toBe(blog_artA_memo)
      expect(nodes[9]).toBe(blog_artB)
      expect(nodes[10]).toBe(programming)
      expect(nodes[11]).toBe(programming_artC)
      expect(nodes[12]).toBe(programming_artD)
      expect(nodes[13]).toBe(programming_ts)
      expect(nodes[14]).toBe(programming_ts_artE)
      expect(nodes[15]).toBe(programming_ts_artF)
      expect(nodes[16]).toBe(programming_js)
      expect(nodes[17]).toBe(assets)
      expect(nodes[18]).toBe(assets_picC)
      expect(nodes[19]).toBe(assets_picD)
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

      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const programmingPath = `${articleRootPath}/programming`

      const programming_art1 = h.newDirNode(`${programmingPath}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'art1' }, type: 'Article', sortOrder: 4 },
      })
      const programming_art2 = h.newDirNode(`${programmingPath}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'art2' }, type: 'Article', sortOrder: 3 },
      })
      const programming_ts = h.newDirNode(`${programmingPath}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'TypeScript' }, type: 'Category', sortOrder: 2 },
      })
      const programming_ts_art1 = h.newDirNode(`${programming_ts.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'art1' }, type: 'Article', sortOrder: 2 },
      })
      const programming_ts_art2 = h.newDirNode(`${programming_ts.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'art2' }, type: 'Article', sortOrder: 1 },
      })
      const programming_js = h.newDirNode(`${programmingPath}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'JavaScript' }, type: 'Category', sortOrder: 1 },
      })
      const programming_js_art1 = h.newDirNode(`${programming_js.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'art1' }, type: 'Article', sortOrder: 2 },
      })
      const programming_js_art2 = h.newDirNode(`${programming_js.path}/${StorageSchema.generateId()}`, {
        article: { label: { ja: 'art2' }, type: 'Article', sortOrder: 1 },
      })

      // 配列に上位ディレクトリがなくてもソートできるか検証するために、
      // 上位ディレクトリは配列に追加しない
      const nodes = shuffleArray([
        programming_art1,
        programming_art2,
        programming_ts,
        programming_ts_art1,
        programming_ts_art2,
        programming_js,
        programming_js_art1,
        programming_js_art2,
      ])

      // テスト対象実行
      StorageService.sortNodes(nodes)

      expect(nodes[0]).toBe(programming_art1)
      expect(nodes[1]).toBe(programming_art2)
      expect(nodes[2]).toBe(programming_ts)
      expect(nodes[3]).toBe(programming_ts_art1)
      expect(nodes[4]).toBe(programming_ts_art2)
      expect(nodes[5]).toBe(programming_js)
      expect(nodes[6]).toBe(programming_js_art1)
      expect(nodes[7]).toBe(programming_js_art2)
    })

    it('パターン③', async () => {
      // エラーも何も発生しないことを検証
      StorageService.sortNodes([])
    })
  })

  describe('createDir', () => {
    let userRootPath: string

    beforeEach(async () => {
      // ユーザールートの作成
      userRootPath = StorageService.toUserRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([userRootPath])
    })

    it('バケット直下にディレクトリを作成', async () => {
      // バケット直下にディレクトリを作成
      const tmp = `tmp`
      const actual = await storageService.createDir({ dir: tmp })

      expect(actual.path).toBe(tmp)
    })

    it('ユーザールート配下にディレクトリを作成', async () => {
      // ユーザールート配下にディレクトリを作成
      const tmp = `${userRootPath}/tmp`
      const actual = await storageService.createDir({ dir: tmp })

      expect(actual.path).toBe(tmp)
    })

    it('記事ルートの作成', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const actual = await storageService.createDir({ dir: articleRootPath })

      expect(actual.path).toBe(articleRootPath)
    })

    it('アセットディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createDir({ dir: articleRootPath })
      // アセットディレクトリのパスを作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`

      let actual!: AppError
      try {
        // アセットディレクトリを作成
        await storageService.createDir({ dir: assetsPath })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`This method 'createDir()' cannot create an article under directory '${assetsPath}'.`)
    })

    it('記事ルート配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createDir({ dir: articleRootPath })

      const dir = `${articleRootPath}/blog`
      let actual!: AppError
      try {
        // 記事ルート配下にディレクトリを作成
        await storageService.createDir({ dir })
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`This method 'createDir()' cannot create an article under directory '${dir}'.`)
    })
  })

  describe('createHierarchicalDirs', () => {
    let userRootPath: string

    beforeEach(async () => {
      // ユーザールートの作成
      userRootPath = StorageService.toUserRootPath(StorageUserToken())
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
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const actual = await storageService.createHierarchicalDirs([articleRootPath])

      expect(actual.length).toBe(1)
      expect(actual[0].path).toBe(articleRootPath)
    })

    it('アセットディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createDir({ dir: articleRootPath })
      // アセットディレクトリのパスを作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`

      let actual!: AppError
      try {
        // アセットディレクトリを作成
        await storageService.createHierarchicalDirs([assetsPath])
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`This method 'createHierarchicalDirs()' cannot create an article under directory '${assetsPath}'.`)
    })

    it('記事ルート配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      const dir = `${articleRootPath}/blog`
      let actual!: AppError
      try {
        // 記事ルート配下にディレクトリを作成
        await storageService.createHierarchicalDirs([dir])
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`This method 'createHierarchicalDirs()' cannot create an article under directory '${dir}'.`)
    })
  })

  describe('removeDir', () => {
    async function setupArticleTypeNodes() {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
      const users = articleRootNodes[0]
      const userRoot = articleRootNodes[1]
      const articleRoot = articleRootNodes[2]
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })
      await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent: '# 記事1',
        searchContent: '記事1',
        srcTags: ['旅行', 'キャンプ'],
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事2',
        type: 'Article',
      })
      await storageService.saveArticleSrcContent(art2, {
        lang: 'ja',
        srcContent: '# 記事2',
        searchContent: '記事2',
        srcTags: ['旅行', 'ツアー'],
      })

      return { articleRoot, bundle, art1, art2 }
    }

    it('タグの使用件数が更新されることを検証 - 記事の削除', async () => {
      const { art1 } = await setupArticleTypeNodes()

      const [travelTag, campTag, tourTag] = await storageService.getArticleTags(['旅行', 'キャンプ', 'ツアー'])
      expect(travelTag.name).toBe('旅行')
      expect(travelTag.usedCount).toBe(2)
      expect(campTag.name).toBe('キャンプ')
      expect(campTag.usedCount).toBe(1)
      expect(tourTag.name).toBe('ツアー')
      expect(tourTag.usedCount).toBe(1)

      // 記事1の削除
      await storageService.removeDir(art1)

      const [_travelTag, _campTag, _tourTag] = await storageService.getArticleTags(['旅行', 'キャンプ', 'ツアー'])
      expect(_travelTag.name).toBe('旅行')
      expect(_travelTag.usedCount).toBe(1)
      expect(_campTag.name).toBe('キャンプ')
      expect(_campTag.usedCount).toBe(0)
      expect(_tourTag.name).toBe('ツアー')
      expect(_tourTag.usedCount).toBe(1)
    })

    it('タグの使用件数が更新されることを検証 - 記事ルートの削除', async () => {
      const { articleRoot } = await setupArticleTypeNodes()

      // 記事ルートの削除
      await storageService.removeDir(articleRoot)

      const [_travelTag, _campTag, _tourTag] = await storageService.getArticleTags(['旅行', 'キャンプ', 'ツアー'])
      expect(_travelTag.name).toBe('旅行')
      expect(_travelTag.usedCount).toBe(0)
      expect(_campTag.name).toBe('キャンプ')
      expect(_campTag.usedCount).toBe(0)
      expect(_tourTag.name).toBe('ツアー')
      expect(_tourTag.usedCount).toBe(0)
    })
  })

  describe('moveDir', () => {
    let articleRootPath: string
    let users: StorageNode
    let userRoot: StorageNode
    let articleRoot: StorageNode
    let programming: StorageNode
    let introduction: StorageNode
    let js: StorageNode
    let variable: StorageNode
    let iteration: StorageNode
    let ts: StorageNode
    let clazz: StorageNode
    let image1: StorageNode
    let image2: StorageNode
    let py: StorageNode
    let tmp: StorageNode

    beforeEach(async () => {
      // users
      // └test.storage
      //   ├articles
      //   │└programming
      //   │  ├introduction
      //   │  ├js
      //   │  │├variable
      //   │  │└iteration
      //   │  ├ts
      //   │  │└class
      //   │  │  ├image1.png
      //   │  │  └image2.png
      //   │  └py
      //   └tmp

      articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
      users = articleRootNodes[0]
      userRoot = articleRootNodes[1]
      articleRoot = articleRootNodes[2]

      // programming
      programming = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'programming',
        type: 'TreeBundle',
        sortOrder: 1,
      })

      // introduction
      introduction = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${programming.path}`,
        label: 'introduction',
        type: 'Article',
        sortOrder: 4,
      })

      // js
      js = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${programming.path}`,
        label: 'js',
        type: 'Category',
        sortOrder: 3,
      })
      // js/variable
      variable = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${js.path}`,
        label: 'variable',
        type: 'Article',
        sortOrder: 2,
      })
      // js/iteration
      iteration = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${js.path}`,
        label: 'iteration',
        type: 'Article',
        sortOrder: 1,
      })

      // ts
      ts = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${programming.path}`,
        label: 'ts',
        type: 'Category',
        sortOrder: 2,
      })
      // ts/class
      clazz = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${ts.path}`,
        label: 'class',
        type: 'Article',
      })
      await storageService
        .uploadDataItems([
          { data: '', contentType: 'image/png', path: `${clazz.path}/image1.png` },
          { data: '', contentType: 'image/png', path: `${clazz.path}/image2.png` },
        ])
        .then(([_image1, _image2]) => {
          image1 = _image1
          image2 = _image2
        })

      // py
      py = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${programming.path}`,
        label: 'py',
        type: 'Category',
        sortOrder: 1,
      })

      // tmp
      const uerRootPath = StorageService.toUserRootPath(StorageUserToken())
      tmp = await storageService.createDir({ dir: `${uerRootPath}/tmp` })
    })

    /**
     * 指定されたノードをエラー情報用ノードに変換します。
     * @param node
     */
    function toErrorNodeData(node: StorageNode) {
      const article = node.article ? pickProps(node.article, ['type', 'label']) : undefined
      return { ...pickProps(node, ['id', 'path']), article }
    }

    describe('バンドルの移動', () => {
      it('バンドルは移動できない', async () => {
        let actual!: AppError
        try {
          // バンドルを移動しようとした場合
          // 'programming'を'tmp/programming'へ移動
          await storageService.moveDir({ fromDir: `${programming.path}`, toDir: `${tmp.path}/${programming.name}` })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Article bundles cannot be moved.`)
        expect(actual.data).toEqual({
          movingNode: toErrorNodeData(programming),
        })
      })
    })

    describe('カテゴリの移動', () => {
      it('ベーシックケース', async () => {
        // 移動前の'programming/ts'のソート順を検証
        expect(ts.article!.sortOrder).toBe(2)

        // カテゴリを別のカテゴリへ移動
        // 'programming/ts'を'programming/js/ts'へ移動
        const toNodePath = `${js.path}/${ts.name}`
        await storageService.moveDir({ fromDir: `${ts.path}`, toDir: toNodePath })

        // 移動後の'programming/js/ts'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDescendants({ path: toNodePath, includeBase: true })
        StorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(4)
        expect(toNodes[0].path).toBe(`${js.path}/${ts.name}`)
        expect(toNodes[1].path).toBe(`${js.path}/${ts.name}/${clazz.name}`)
        expect(toNodes[2].path).toBe(`${js.path}/${ts.name}/${clazz.name}/${image1.name}`)
        expect(toNodes[3].path).toBe(`${js.path}/${ts.name}/${clazz.name}/${image2.name}`)

        // 移動後の'programming/js/ts'のソート順を検証
        const _ts = toNodes[0]
        expect(_ts.article!.sortOrder).toBe(3)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: AppError
        try {
          // カテゴリを記事直下へ移動しようとした場合
          // 'programming/ts'を'programming/js/variable/ts'へ移動
          await storageService.moveDir({ fromDir: `${ts.path}`, toDir: `${variable.path}/${ts.name}` })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Categories can only be moved to category bundles or categories.`)
        expect(actual.data).toEqual({
          movingNode: toErrorNodeData(ts),
          toParentNode: toErrorNodeData(variable),
        })
      })
    })

    describe('記事の移動', () => {
      it('ベーシックケース', async () => {
        // 移動前の'programming/js/variable'のソート順を検証
        expect(variable.article!.sortOrder).toBe(2)

        // 記事をカテゴリ直下へ移動
        // 'programming/js/variable'を'programming/ts/variable'へ移動
        const toNodePath = `${ts.path}/${variable.name}`
        await storageService.moveDir({ fromDir: `${variable.path}`, toDir: toNodePath })

        // 移動後の'programming/ts/variable'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDescendants({ path: toNodePath, includeBase: true })
        StorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(1)
        expect(toNodes[0].path).toBe(`${ts.path}/${variable.name}`)

        // 移動後の'programming/ts/variable'のソート順を検証
        const _variable = toNodes[0]
        expect(_variable.article!.sortOrder).toBe(2)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: AppError
        try {
          //  記事を別の記事直下へ移動しようとした場合
          // 'programming/ts/class'を'programming/js/variable/class'へ移動
          await storageService.moveDir({ fromDir: `${clazz.path}`, toDir: `${variable.path}/${clazz.name}` })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Articles can only be moved to list bundles or category bundles or categories.`)
        expect(actual.data).toEqual({
          movingNode: toErrorNodeData(clazz),
          toParentNode: toErrorNodeData(variable),
        })
      })
    })

    describe('一般ディレクトリの移動', () => {
      it('ベーシックケース', async () => {
        // 一般ディレクトリを記事直下へ移動
        // 'tmp'を'programming/js/variable/tmp'へ移動
        const toNodePath = `${variable.path}/${tmp.name}`
        await storageService.moveDir({ fromDir: `${tmp.path}`, toDir: toNodePath })

        // 移動後の'programming/js/variable/tmp'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDescendants({ path: toNodePath, includeBase: true })
        StorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(1)
        expect(toNodes[0].path).toBe(`${variable.path}/${tmp.name}`)
      })

      it('ルートノードへ移動', async () => {
        // 一般ディレクトリをルートノードへ移動
        // 'tmp'をルートノード直下へ移動
        const toNodePath = `${tmp.name}`
        const actual = await storageService.moveDir({ fromDir: `${tmp.path}`, toDir: toNodePath })

        // 移動後の'tmp'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDescendants({ path: toNodePath, includeBase: true })
        StorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(1)
        expect(toNodes[0].path).toBe(`${tmp.name}`)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: AppError
        try {
          //  一般ディレクトリをツリーバンドルへ移動しようとした場合
          // 'tmp'を'programming/tmp'へ移動
          await storageService.moveDir({ fromDir: `${tmp.path}`, toDir: `${programming.path}/${tmp.name}` })
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`The general directory can only be moved to the general directory or articles.`)
        expect(actual.data).toEqual({
          movingNode: toErrorNodeData(tmp),
          toParentNode: toErrorNodeData(programming),
        })
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
      const fromNodes = (await storageService.getDescendants({ path: `d1`, includeBase: true })).list

      // 大量データを想定して分割で移動を行う
      // 'd1'を'dA/d1'へ移動
      const toNodePath = `dA/d1`
      await storageService.moveDir({ fromDir: `d1`, toDir: toNodePath }, { size: 3 })

      // 移動後の'dA/d1'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDescendants({ path: toNodePath, includeBase: true })
      StorageService.sortNodes(toNodes)
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
      await h.verifyMoveNodes(fromNodes, toNodePath)
    })
  })

  describe('validateArticleRootUnder', () => {
    it('ベーシックケース - 記事ルート直下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      // バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.validateArticleRootUnder(bundlePath)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('ベーシックケース - バンドル配下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      // バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`
      // 記事のパスを作成
      const art1Path = `${bundlePath}/art1`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.validateArticleRootUnder(art1Path)
      } catch (err) {
        actual = err
      }

      // エラーは発生せず正常終了
      expect(actual).toBeUndefined()
    })

    it('引数ノードが記事ルート配下でない場合', async () => {
      const userDirPath = StorageService.toUserRootPath(StorageUserToken())
      // バンドルを記事ルート以外に指定
      const bundlePath = `${userDirPath}/blog`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.validateArticleRootUnder(bundlePath)
      } catch (err) {
        actual = err
      }

      // バンドルを記事ルートでないためエラーが発生
      expect(actual.cause).toBe(`The specified path is not under article root: '${bundlePath}'`)
    })
  })

  describe('getBelongToArticleBundle', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'TreeBundle',
      })
      // カテゴリ1を作成
      const cat1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: 'カテゴリ1',
        type: 'Category',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${cat1.path}`,
        label: '記事1',
        type: 'Article',
      })

      // テスト対象実行
      // ※引数ノードにバンドル配下のディレクトリを指定
      const actual = (await storageService.getBelongToArticleBundle(`${art1.path}`))!

      expect(actual.path).toBe(bundle.path)
    })

    it('記事系ノード以外を指定した場合', async () => {
      // ユーザールートの作成
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([userRootPath])
      // ユーザールート配下のパスを指定

      // テスト対象実行
      // ※引数ノードにバンドル配下のディレクトリを指定
      const actual = await storageService.getBelongToArticleBundle(`${userRootPath}/art1`)

      expect(actual).toBeUndefined()
    })
  })

  describe('toArticlePathDetails', () => {
    let users: StorageNode
    let userRoot: StorageNode
    let articleRoot: StorageNode
    let ts: StorageNode
    let ts_types: StorageNode
    let ts_types_primitive: StorageNode

    async function setupArticleTypeNodes(lang: LangCode): Promise<void> {
      // users
      // └test.storage
      //   └articles
      //     └TypeScript
      //       └Types
      //         └PrimitiveType

      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
      users = articleRootNodes[0]
      userRoot = articleRootNodes[1]
      articleRoot = articleRootNodes[2]

      // TypeScript
      ts = await storageService.createArticleTypeDir({
        lang,
        dir: `${articleRoot.path}`,
        label: 'TypeScript',
        type: 'TreeBundle',
        sortOrder: 1,
      })

      // TypeScript/Types
      ts_types = await storageService.createArticleTypeDir({
        lang,
        dir: `${ts.path}`,
        label: 'Types',
        type: 'Category',
        sortOrder: 1,
      })

      // TypeScript/Types/PrimitiveType
      ts_types_primitive = await storageService.createArticleTypeDir({
        lang,
        id: StorageSchema.generateId(),
        dir: `${ts_types.path}`,
        label: 'PrimitiveType',
        type: 'Article',
        sortOrder: 1,
      })
    }

    it('ベーシックケース', async () => {
      await setupArticleTypeNodes('ja')
      const allNodes = (await storageService.getDescendants({ path: '' })).list

      const actual = await StorageService.toArticlePathDetails('ja', ts_types_primitive.path, allNodes)

      expect(actual[0]).toEqual({ id: ts.id, label: ts.article!.label!['ja'] })
      expect(actual[1]).toEqual({ id: ts_types.id, label: ts_types.article!.label!['ja'] })
      expect(actual[2]).toEqual({ id: ts_types_primitive.id, label: ts_types_primitive.article!.label!['ja'] })
    })
  })

  describe('suggestArticleTags', () => {
    const setupArticleTags = async () => {
      await storageService.saveArticleTags([
        { name: '日本' },
        { name: 'Travel' },
        { name: 'Camp' },
        { name: 'Tourism' },
        { name: '旅行' },
        { name: '旅客機' },
        { name: 'キャンプ' },
        { name: 'ツアー' },
      ])
    }

    it('ベーシックケース', async () => {
      await setupArticleTags()

      const actual = await storageService.suggestArticleTags('旅k')
      console.log(JSON.stringify(actual, null, 2))

      // expect(actual.length).toBe(1)
      // expect(actual[0].name).toBe('Travel')
    })
  })

  describe('getArticleTags', () => {
    it('小文字で検索した場合', async () => {
      await storageService.saveArticleTags([{ name: 'Travel' }])

      const actual = await storageService.getArticleTags(['travel'])

      expect(actual.length).toBe(1)
      expect(actual[0].name).toBe('Travel')
    })

    it('存在しないタグを指定した場合', async () => {
      await storageService.saveArticleTags([{ name: 'Travel' }, { name: 'Camp' }])

      const actual = await storageService.getArticleTags(['Travel', 'Camp', 'Tourism'])

      expect(actual.length).toBe(2)
      expect(actual[0].name).toBe('Travel')
      expect(actual[1].name).toBe('Camp')
    })
  })

  describe('saveArticleTags', () => {
    it('ベーシックケース', async () => {
      await storageService.saveArticleTags([{ name: 'Travel' }, { name: 'Camp' }, { name: 'Tourism' }])

      const actual = await storageService.getArticleTags(['Travel', 'Camp'])

      expect(actual.length).toBe(2)
      expect(actual[0].name).toBe('Travel')
      expect(actual[1].name).toBe('Camp')
    })

    it('重複したタグを指定した場合', async () => {
      await storageService.saveArticleTags([{ name: 'Travel' }, { name: 'Travel' }, { name: 'Camp' }])

      const actual = await storageService.getArticleTags(['Travel', 'Camp'])

      expect(actual.length).toBe(2)
      expect(actual[0].name).toBe('Travel')
      expect(actual[1].name).toBe('Camp')
    })

    it('同じタイミングで同じタグを登録しようとした場合', async () => {
      await Promise.all(
        [...Array(10)].map(async () => {
          await storageService.saveArticleTags([{ name: 'Travel' }])
        })
      )

      const actual = await storageService.getArticleTags(['Travel'])

      expect(actual.length).toBe(1)
      expect(actual[0].name).toBe('Travel')
    })

    it('タグ名のバリデーション実行確認', async () => {
      const validateTagName = td.replace(StorageService, 'validateTagName')

      await storageService.saveArticleTags([{ name: 'Travel' }, { name: 'Camp' }])

      const exp = td.explain(validateTagName)
      expect(exp.calls[0].args[0]).toBe('Travel')
      expect(exp.calls[1].args[0]).toBe('Camp')
    })
  })

  describe('getUsedTagNames', () => {
    async function setupArticleTypeNodes() {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
      const users = articleRootNodes[0]
      const userRoot = articleRootNodes[1]
      const articleRoot = articleRootNodes[2]
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事1',
        type: 'Article',
      })
      await storageService.saveArticleSrcContent(art1, {
        lang: 'ja',
        srcContent: '# 記事1',
        searchContent: '記事1',
        srcTags: ['旅行', 'キャンプ'],
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${bundle.path}`,
        label: '記事2',
        type: 'Article',
      })
      await storageService.saveArticleSrcContent(art2, {
        lang: 'ja',
        srcContent: '# 記事2',
        searchContent: '記事2',
        srcTags: ['旅行', 'ツアー'],
      })

      return { articleRoot, bundle, art1, art2 }
    }

    it('ベーシックケース - 記事ルートを指定', async () => {
      const { articleRoot } = await setupArticleTypeNodes()

      const actual = await storageService.getUsedTagNames(articleRoot.path)

      expect(actual.length).toBe(3)
      actual.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      const [campTag, tourTag, travelTag] = actual
      expect(travelTag).toBe('旅行')
      expect(campTag).toBe('キャンプ')
      expect(tourTag).toBe('ツアー')
    })

    it('ベーシックケース - 記事を指定', async () => {
      const { art1 } = await setupArticleTypeNodes()

      const actual = await storageService.getUsedTagNames(art1.path)

      expect(actual.length).toBe(2)
      actual.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
      const [campTag, travelTag] = actual
      expect(travelTag).toBe('旅行')
      expect(campTag).toBe('キャンプ')
    })

    it('大量データの場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      })
      // 記事を作成
      const promises: Promise<void>[] = []
      for (let i = 1; i <= 10; i++) {
        promises.push(
          (async () => {
            const art = await storageService.createArticleTypeDir({
              lang: 'ja',
              dir: `${bundle.path}`,
              label: `記事${i}`,
              type: 'Article',
            })
            await storageService.saveArticleSrcContent(art, {
              lang: 'ja',
              srcContent: `# 記事${i}`,
              searchContent: `記事${i}`,
              srcTags: (() => {
                if (i <= 3) return ['タグA']
                if (i <= 6) return ['タグB']
                if (i <= 9) return ['タグC']
                return ['タグD']
              })(),
            })
          })()
        )
      }
      await Promise.all(promises)

      // 大量データを想定して検索を行う
      const actual = await storageService.getUsedTagNames(articleRootPath, { chunkSize: 3 })

      expect(actual.length).toBe(4)
      expect(actual.includes('タグA')).toBeTruthy()
      expect(actual.includes('タグB')).toBeTruthy()
      expect(actual.includes('タグC')).toBeTruthy()
      expect(actual.includes('タグD')).toBeTruthy()

      const _tags = await storageService.getArticleTags(['タグA', 'タグB', 'タグC', 'タグD'])
      const [tagA, tagB, tagC, tagD] = _tags
      expect(_tags.length).toBe(4)
      expect(tagA.name).toBe('タグA')
      expect(tagA.usedCount).toBe(3)
      expect(tagB.name).toBe('タグB')
      expect(tagB.usedCount).toBe(3)
      expect(tagC.name).toBe('タグC')
      expect(tagC.usedCount).toBe(3)
      expect(tagD.name).toBe('タグD')
      expect(tagD.usedCount).toBe(1)
    })
  })

  describe('parseSearchCriteria', () => {
    it('ベーシックケース', async () => {
      const actual = storageService.parseSearchCriteria(
        `lang:ja user:TaroYamada title:"DRAGON BALL" tag:冒険 dir:3v9dUUsX4wOxUjo6w2pPoYbAdtE3 鳥山 漫画`
      )

      expect(Object.keys(actual).length).toBe(6)
      expect(actual.lang).toBe('ja')
      expect(actual.user).toBe('TaroYamada')
      expect(actual.title).toBe('DRAGON BALL')
      expect(actual.tag).toBe('冒険')
      expect(actual.dir).toBe('3v9dUUsX4wOxUjo6w2pPoYbAdtE3')
      expect(actual.words).toBe('鳥山 漫画')
    })

    it('条件が1つの場合', async () => {
      const actual = storageService.parseSearchCriteria(`title:ドラゴンボール`)

      expect(Object.keys(actual).length).toBe(1)
      expect(actual.title).toBe('ドラゴンボール')
    })

    it('同じキーの条件が複数ある場合', async () => {
      const actual = storageService.parseSearchCriteria(`title:ドラゴンボール title:"Dragon Ball" title:"DRAGON BALL"`)

      expect(Object.keys(actual).length).toBe(1)
      expect(actual.title).toBe('DRAGON BALL') // 後ろ条件の方が優先度が高い
    })

    describe('「"」で囲われた条件', () => {
      it('条件が並びの先頭にある場合', async () => {
        const actual = storageService.parseSearchCriteria(`title:"DRAGON BALL" lang:ja 鳥山 漫画`)

        expect(Object.keys(actual).length).toBe(3)
        expect(actual.lang).toBe('ja')
        expect(actual.title).toBe('DRAGON BALL')
        expect(actual.words).toBe('鳥山 漫画')
      })

      it('条件が並びの中央にある場合', async () => {
        const actual = storageService.parseSearchCriteria(`lang:ja title:"DRAGON BALL" 鳥山 漫画`)

        expect(Object.keys(actual).length).toBe(3)
        expect(actual.lang).toBe('ja')
        expect(actual.title).toBe('DRAGON BALL')
        expect(actual.words).toBe('鳥山 漫画')
      })

      it('条件が並びの最後にある場合', async () => {
        const actual = storageService.parseSearchCriteria(`lang:ja 鳥山 漫画 title:"DRAGON BALL"`)

        expect(Object.keys(actual).length).toBe(3)
        expect(actual.lang).toBe('ja')
        expect(actual.title).toBe('DRAGON BALL')
        expect(actual.words).toBe('鳥山 漫画')
      })

      it('「"」が閉じられていない場合', async () => {
        const actual = storageService.parseSearchCriteria(`lang:ja title:"DRAGON BALL 鳥山 漫画`)

        expect(Object.keys(actual).length).toBe(1)
        expect(actual.lang).toBe('ja')
        // 囲みが閉じられていない以降の条件が無効になる
        expect(actual.title).toBeUndefined()
        expect(actual.words).toBeUndefined()
      })
    })
  })

  describe('validateTagName', () => {
    it('255バイトを超えていた場合', async () => {
      let tagName = 'tag'
      while (Buffer.byteLength(tagName) <= 255) {
        tagName += 'A' // 「A」は適当な文字
      }

      let actual!: AppError
      try {
        await StorageService.validateTagName(tagName)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified tag name is too long.`)
      expect(actual.data).toEqual({ 'tagName.byteLength': 256 })
    })

    it('改行、タブを含んでいる場合', async () => {
      for (const char of ['\r\n', '\n', '\t']) {
        const tagName = `tag${char}`

        let actual!: AppError
        try {
          await StorageService.validateTagName(tagName)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`The specified tag name is invalid.`)
        expect(actual.data).toEqual({ tagName })
      }
    })

    it('スペースを含んでいる場合', async () => {
      for (const char of [' ', '　']) {
        const tagName = `tag${char}`

        let actual!: AppError
        try {
          await StorageService.validateTagName(tagName)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`The specified tag name is invalid.`)
        expect(actual.data).toEqual({ tagName })
      }
    })

    it('禁則文字を含んでいる場合', async () => {
      const chars = [
        '!',
        '"',
        '#',
        '$',
        '%',
        '&',
        `'`,
        '(',
        ')',
        '*',
        '+',
        ',',
        '-',
        '.',
        '/',
        ':',
        ';',
        '<',
        '=',
        '>',
        '?',
        '@',
        '[',
        '\\',
        ']',
        '^',
        '`',
        '{',
        '|',
        '}',
        '~',
      ]
      for (const char of chars) {
        const tagName = `tag${char}`

        let actual!: AppError
        try {
          await StorageService.validateTagName(tagName)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`The specified tag name is invalid.`)
        expect(actual.data).toEqual({ tagName })
      }
    })
  })
})
