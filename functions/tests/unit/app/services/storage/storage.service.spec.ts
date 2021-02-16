import { AppAdminUser, GeneralUser, StorageTestHelper, StorageTestService, StorageUser, StorageUserToken } from '../../../../helpers/app'
import { AppError, initApp } from '../../../../../src/app/base'
import {
  ArticleTableOfContentsNode,
  CreateArticleTypeDirInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  GetArticleChildrenInput,
  StorageArticleDirType,
  StorageArticleFileType,
  StorageNode,
  StorageSchema,
  StorageService,
  StorageServiceDI,
  StorageServiceModule,
  StorageUploadDataItem,
} from '../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import { pickProps, removeBothEndsSlash, shuffleArray } from 'web-base-lib'
import { config } from '../../../../../src/config'

jest.setTimeout(30000)
initApp()

//========================================================================
//
//  Tests
//
//========================================================================

describe('StorageService', () => {
  let testingModule!: TestingModule
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
    testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule, StorageServiceModule],
    }).compile()

    storageService = testingModule.get<StorageTestService>(StorageServiceDI.symbol)
    h = new StorageTestHelper(storageService)

    await h.removeAllNodes()

    // Cloud Storageで短い間隔のノード追加・削除を行うとエラーが発生するので間隔調整している
    // await sleep(1500)
  })

  describe('createArticleTypeDir', () => {
    describe('バンドル作成', () => {
      it('ベーシックケース', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])

        // テスト対象実行
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        }
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article?.dir?.name).toBe(input.name)
        expect(actual.article?.dir?.type).toBe(input.type)
        expect(actual.article?.dir?.sortOrder).toBe(1)
        await h.existsNodes([actual])
      })

      it('オプションを指定した場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])

        // テスト対象実行
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        }
        const options = {
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }
        const actual = await storageService.createArticleTypeDir(input, options)

        expect(actual.share).toEqual(options.share)
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])

        // バンドル1の作成
        const bundle1 = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル1',
          type: 'ListBundle',
        })
        // バンドル2の作成
        const bundle2 = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル2',
          type: 'ListBundle',
        })

        expect(bundle1.article?.dir?.sortOrder).toBe(1)
        expect(bundle2.article?.dir?.sortOrder).toBe(2)
      })

      it('同じ名前のバンドルを作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        }
        await storageService.createArticleTypeDir(input)

        // テスト対象実行
        // ※同じ名前のバンドルを再度作成
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article?.dir?.name).toBe(input.name)
        expect(actual.article?.dir?.type).toBe(input.type)
        expect(actual.article?.dir?.sortOrder).toBe(2)
        await h.existsNodes([actual])
      })

      it('バンドルをバケット直下に作成しようとした場合', async () => {
        const input: CreateArticleTypeDirInput = {
          dir: ``,
          name: 'バンドル',
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
          dir: `${articleRootPath}/aaa`,
          name: 'バンドル',
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
        expect(actual.data).toEqual({ input })
      })

      it('バンドルの祖先が存在しない場合', async () => {
        // ユーザーディレクトリの作成
        const usersPath = StorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([usersPath])
        // バンドル作成の引数
        // ※記事ルートが存在しない状態でバンドル作成を試みる
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const input: CreateArticleTypeDirInput = {
          dir: `${articleRootPath}`,
          name: 'バンドル',
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
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          name: 'カテゴリ1',
          type: 'Category',
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article?.dir?.name).toBe(input.name)
        expect(actual.article?.dir?.type).toBe(input.type)
        expect(actual.article?.dir?.sortOrder).toBe(1)
        await h.existsNodes([actual])
      })

      it('ベーシックケース - カテゴリ直下に作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1を作成
        const cat1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          name: 'カテゴリ1',
          type: 'Category',
        })
        // カテゴリ11作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${cat1.path}`,
          name: 'カテゴリ11',
          type: 'Category',
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article?.dir?.name).toBe(input.name)
        expect(actual.article?.dir?.type).toBe(input.type)
        expect(actual.article?.dir?.sortOrder).toBe(1)
        await h.existsNodes([actual])
      })

      it('オプションを指定した場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          name: 'カテゴリ1',
          type: 'Category',
        }
        const options = {
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input, options)

        expect(actual.share).toEqual(options.share)
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'TreeBundle',
        })

        // カテゴリ1を作成
        const cat1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          name: 'カテゴリ1',
          type: 'Category',
        })
        // カテゴリ2を作成
        const cat2 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          name: 'カテゴリ2',
          type: 'Category',
        })

        expect(cat1.article?.dir?.sortOrder).toBe(1)
        expect(cat2.article?.dir?.sortOrder).toBe(2)
      })

      it('同じ名前のカテゴリを作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          name: 'カテゴリ1',
          type: 'Category',
        }
        const cat1 = await storageService.createArticleTypeDir(input)

        // テスト対象実行
        // ※同じ名前のカテゴリを再度作成
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article?.dir?.name).toBe(input.name)
        expect(actual.article?.dir?.type).toBe(input.type)
        expect(actual.article?.dir?.sortOrder).toBe(2)
        await h.existsNodes([actual])
      })

      it('バケット直下にカテゴリを作成しようとした場合', async () => {
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: ``,
          name: 'カテゴリ1',
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
          dir: `${userRootNode.path}`,
          name: 'カテゴリ1',
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
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          name: 'カテゴリ1',
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

      it('記事ディレクトリ配下にカテゴリを作成しようとした作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: '',
          type: 'TreeBundle',
        })
        // 記事1の作成
        const art1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          name: '記事1',
          type: 'Article',
        })
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${art1.path}`,
          name: 'カテゴリ1',
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
        const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
        // カテゴリ1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${assets.path}`,
          name: 'カテゴリ1',
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
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        })
        // カテゴリ1作成の引数を作成
        // ※カテゴリの上位ディレクトリが存在しない状態でカテゴリの作成を試みる
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}/dummy`,
          name: 'カテゴリ1',
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

    describe('記事ディレクトリ作成', () => {
      it('ベーシックケース - バンドル直下に作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          name: '記事1',
          type: 'Article',
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article?.dir?.name).toBe(input.name)
        expect(actual.article?.dir?.type).toBe(input.type)
        expect(actual.article?.dir?.sortOrder).toBe(1)
        await h.existsNodes([actual])

        const art1MasterFileNodePath = StorageService.toArticleSrcMasterPath(actual.path)
        const art1MasterFileNode = await storageService.sgetNode({ path: art1MasterFileNodePath })
        expect(art1MasterFileNode.path).toBe(art1MasterFileNodePath)
        expect(art1MasterFileNode.contentType).toBe('text/markdown')
        expect(art1MasterFileNode.article?.file?.type).toBe('Master')

        const art1DraftFileNodePath = StorageService.toArticleSrcDraftPath(actual.path)
        const art1DraftFileNode = await storageService.sgetNode({ path: art1DraftFileNodePath })
        expect(art1DraftFileNode.path).toBe(art1DraftFileNodePath)
        expect(art1DraftFileNode.contentType).toBe('text/markdown')
        expect(art1DraftFileNode.article?.file?.type).toBe('Draft')
      })

      it('ベーシックケース - カテゴリ直下に記事ディレクトリを作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'TreeBundle',
        })
        // カテゴリ1を作成
        const cat1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          name: 'カテゴリ1',
          type: 'Category',
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${cat1.path}`,
          name: '記事1',
          type: 'Article',
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article?.dir!.name).toBe(input.name)
        expect(actual.article?.dir!.type).toBe(input.type)
        expect(actual.article?.dir!.sortOrder).toBe(1)
        await h.existsNodes([actual])

        const art1MasterFilePath = StorageService.toArticleSrcMasterPath(actual.path)
        const art1MasterFileNode = await storageService.sgetNode({ path: art1MasterFilePath })
        expect(art1MasterFileNode.path).toBe(art1MasterFilePath)
        expect(art1MasterFileNode.contentType).toBe('text/markdown')
        expect(art1MasterFileNode.article?.file?.type).toBe('Master')

        const art1DraftFilePath = StorageService.toArticleSrcDraftPath(actual.path)
        const art1DraftFileNode = await storageService.sgetNode({ path: art1DraftFilePath })
        expect(art1DraftFileNode.path).toBe(art1DraftFilePath)
        expect(art1DraftFileNode.contentType).toBe('text/markdown')
        expect(art1DraftFileNode.article?.file?.type).toBe('Draft')
      })

      it('オプションを指定した場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          name: '記事1',
          type: 'Article',
        }
        const options = {
          share: { isPublic: true, readUIds: ['ichiro'], writeUIds: ['jiro'] },
        }

        // テスト対象実行
        const actual = await storageService.createArticleTypeDir(input, options)

        expect(actual.share).toEqual(options.share)
      })

      it('ソート順の検証', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        })

        // 記事1の作成
        const art1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          name: '記事1',
          type: 'Article',
        })
        // 記事2の作成
        const art2 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          name: '記事2',
          type: 'Article',
        })

        expect(art1.article?.dir?.sortOrder).toBe(1)
        expect(art2.article?.dir?.sortOrder).toBe(2)
      })

      it('同じ名前の記事ディレクトリを作成', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        })
        // 記事を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}`,
          name: '記事1',
          type: 'Article',
        }
        const art1 = await storageService.createArticleTypeDir(input)

        // テスト対象実行
        // ※同名の記事ディレクトリ作成を試みる
        const actual = await storageService.createArticleTypeDir(input)

        expect(actual.path).toBe(`${actual.dir}/${actual.id}`)
        expect(actual.id === actual.name).toBeTruthy()
        expect(actual.article?.dir?.name).toBe(input.name)
        expect(actual.article?.dir?.type).toBe(input.type)
        expect(actual.article?.dir?.sortOrder).toBe(2)
        await h.existsNodes([actual])

        const art1MasterFilePath = StorageService.toArticleSrcMasterPath(actual.path)
        const art1MasterFileNode = await storageService.sgetNode({ path: art1MasterFilePath })
        expect(art1MasterFileNode.path).toBe(art1MasterFilePath)
        expect(art1MasterFileNode.contentType).toBe('text/markdown')
        expect(art1MasterFileNode.article?.file?.type).toBe('Master')

        const art1DraftFilePath = StorageService.toArticleSrcDraftPath(actual.path)
        const art1DraftFileNode = await storageService.sgetNode({ path: art1DraftFilePath })
        expect(art1DraftFileNode.path).toBe(art1DraftFilePath)
        expect(art1DraftFileNode.contentType).toBe('text/markdown')
        expect(art1DraftFileNode.article?.file?.type).toBe('Draft')
      })

      it('バケット直下に記事ディレクトリを作成しようとした場合', async () => {
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: ``,
          name: '記事1',
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

      it('ユーザールート直下に記事ディレクトリを作成しようとした場合', async () => {
        // ユーザールートの作成
        const userRootPath = StorageService.toUserRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([userRootPath])
        const userRootNode = await storageService.sgetNode({ path: userRootPath })
        // 記事1作成の引数を作成
        const input: CreateArticleTypeDirInput = {
          dir: `${userRootPath}`,
          name: '記事1',
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

      it('記事ディレクトリの祖先が存在しない場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1作成の引数を作成
        // ※カテゴリの上位ディレクトリが存在しない状態で記事ディレクトリ作成を試みる
        const input: CreateArticleTypeDirInput = {
          dir: `${bundle.path}/dummy`,
          name: '記事1',
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

      it('記事ディレクトリの祖先に記事ディレクトリが存在する場合', async () => {
        // 記事ルートの作成
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        await storageService.createHierarchicalDirs([articleRootPath])
        // バンドルを作成
        const bundle = await storageService.createArticleTypeDir({
          dir: `${articleRootPath}`,
          name: 'バンドル',
          type: 'ListBundle',
        })
        // 記事1を作成
        const art1 = await storageService.createArticleTypeDir({
          dir: `${bundle.path}`,
          name: '記事1',
          type: 'Article',
        })
        // 記事11作成の引数を作成
        // ※作成した記事ディレクトリの下にさらに記事ディレクトリを作成するよう準備
        const input: CreateArticleTypeDirInput = {
          dir: `${art1.path}`,
          name: '記事11',
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
  })

  describe('createArticleGeneralDir', () => {
    it('ベーシックケース - アセットディレクトリの作成', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // アセットディレクトリの作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const actual = await storageService.createArticleGeneralDir(assetsPath)

      expect(actual.path).toBe(assetsPath)
      expect(actual.article).toBeUndefined()
      await h.existsNodes([actual])
    })

    it('ベーシックケース - アセットディレクトリ配下にディレクトリを作成', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)

      // アセットディレクトリ配下にディレクトリを作成
      const d1Path = `${assets.path}/d1`
      const actual = await storageService.createArticleGeneralDir(d1Path)

      expect(actual.path).toBe(d1Path)
      expect(actual.article).toBeUndefined()
      await h.existsNodes([actual])
    })

    it('ベーシックケース - 記事ディレクトリ配下にディレクトリを作成', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
      })

      // 記事ディレクトリ配下にディレクトリを作成
      const d1Path = `${art1.path}/d1`
      const actual = await storageService.createArticleGeneralDir(d1Path)

      expect(actual.path).toBe(d1Path)
      expect(actual.article).toBeUndefined()
      await h.existsNodes([actual])
    })

    it('共有設定を指定した場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // アセットディレクトリの作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const share = {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      }
      const actual = await storageService.createArticleGeneralDir(assetsPath, { share })

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
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセットディレクトリ配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${assets.path}/d1`)

      // 同じパスのディレクトリ作成を試みる
      const actual = await storageService.createArticleGeneralDir(`${d1.path}`)

      expect(actual).toEqual(d1)
      await h.existsNodes([actual])
    })

    it('既に存在するディレクトリを作成しようとした場合 - 共有設定あり', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // アセットディレクトリの作成
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセットディレクトリ配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${assets.path}/d1`)

      // 同じパスのディレクトリ作成を試みる
      const share = {
        isPublic: true,
        readUIds: ['ichiro'],
        writeUIds: ['jiro'],
      }
      const actual = await storageService.createArticleGeneralDir(`${d1.path}`, { share })

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
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })
      // ディレクトリのパスを作成
      const d1Path = `${bundle.path}/d1`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir(d1Path)
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
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'TreeBundle',
      })
      // カテゴリを作成
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: 'バンドル',
        type: 'Category',
      })
      // ディレクトリのパスを作成
      const d1Path = `${cat1.path}/d1`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir(d1Path)
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
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセットディレクトリ配下に親が存在しないディレクトリのパスを作成
      // ※親ディレクトリ'd1'が存在しない
      const d1Path = `${assets.path}/d1`
      const d11Path = `${d1Path}/d1/d11`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.createArticleGeneralDir(d11Path)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The ancestor of the specified path does not exist.`)
      expect(actual.data).toEqual({
        specifiedPath: d11Path,
        ancestorPath: d1Path,
      })
    })
  })

  describe('renameArticleDir', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
      })

      // テスト対象実行
      const actual = await storageService.renameArticleDir(art1.path, 'Article1')

      // 戻り値の検証
      expect(actual.article?.dir?.name).toBe('Article1')
      expect(actual.version).toBe(art1.version + 1)
      await h.existsNodes([actual])
    })

    it('記事ソースファイルの名前を変更しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
      })
      // 記事1のソースファイルを取得
      const art1_src = await storageService.sgetNode({ path: StorageService.toArticleSrcMasterPath(art1.path) })

      let actual!: AppError
      try {
        // 記事ソースファイルの名前変更を試みる
        await storageService.renameArticleDir(`${art1_src.path}`, 'dummy')
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`The specified path is not a directory.`)
      expect(actual.data).toEqual({ specifiedPath: art1_src.path })
    })

    it('記事ルート配下でないノードの名前を変更しようとした場合', async () => {
      // ユーザールート配下にノードを作成
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      const [users, user, d1] = await storageService.createHierarchicalDirs([`${userRootPath}/d1`])

      let actual!: AppError
      try {
        // 記事ルート配下にないノードの名前変更を試みる
        await storageService.renameArticleDir(`${d1.path}`, 'D1')
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
        await storageService.renameArticleDir(`${articleRootPath}/xxx`, 'Bundle')
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`There is no node in the specified key.`)
      expect(actual.data).toEqual({ key: { path: `${articleRootPath}/xxx` } })
    })
  })

  describe('setArticleSortOrder', () => {
    it('ベーシックケース - バンドル直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })

      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
        sortOrder: 1,
      })
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事2',
        type: 'Article',
        sortOrder: 2,
      })
      const art3 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事3',
        type: 'Article',
        sortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(StorageUserToken(), [art3.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren(bundle.path)).list
      StorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art3.path, art2.path, art1.path])
      expect(nodes.map(node => node.article?.dir?.sortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - カテゴリ直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'TreeBundle',
      })
      // カテゴリを作成
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: 'カテゴリ1',
        type: 'Category',
      })

      const art1 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        name: '記事1',
        type: 'Article',
        sortOrder: 1,
      })
      const art2 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        name: '記事2',
        type: 'Article',
        sortOrder: 2,
      })
      const art3 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        name: '記事3',
        type: 'Article',
        sortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(StorageUserToken(), [art3.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren(cat1.path)).list
      StorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([art3.path, art2.path, art1.path])
      expect(nodes.map(node => node.article?.dir?.sortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - 記事ルート直下のノードにソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // アッセトを作成
      const assets = await storageService.createArticleGeneralDir(StorageService.toArticleAssetsPath(StorageUserToken()))

      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル1',
        type: 'ListBundle',
        sortOrder: 1,
      })
      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル2',
        type: 'ListBundle',
        sortOrder: 2,
      })
      // バンドル3を作成
      const bundle3 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル3',
        type: 'ListBundle',
        sortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(StorageUserToken(), [bundle3.path, bundle2.path, bundle1.path])

      const nodes = (await storageService.getChildren(`${articleRootPath}`)).list.filter(node => Boolean(node.article))
      StorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([bundle3.path, bundle2.path, bundle1.path])
      expect(nodes.map(node => node.article?.dir?.sortOrder)).toEqual([3, 2, 1])
    })

    it('ベーシックケース - カテゴリと記事の混在したディレクトリでソート順を設定', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'TreeBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
        sortOrder: 1,
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事2',
        type: 'Article',
        sortOrder: 2,
      })
      // カテゴリ1を作成
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: 'カテゴリ1',
        type: 'Category',
        sortOrder: 3,
      })

      // テスト対象実行
      await storageService.setArticleSortOrder(StorageUserToken(), [cat1.path, art2.path, art1.path])

      const nodes = (await storageService.getChildren(`${bundle.path}`)).list
      StorageService.sortNodes(nodes)
      expect(nodes.map(node => node.path)).toEqual([cat1.path, art2.path, art1.path])
      expect(nodes.map(node => node.article?.dir?.sortOrder)).toEqual([3, 2, 1])
    })

    it('親が違うノードにソート順を設定しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      // バンドル1を作成
      const bundle1 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル1',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle1.path}`,
        name: '記事1',
        type: 'Article',
      })

      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル2',
        type: 'ListBundle',
      })
      // 記事2を作成
      const art2 = await storageService.createArticleTypeDir({
        dir: `${bundle2.path}`,
        name: '記事2',
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
        dir: `${articleRootPath}`,
        name: 'バンドル1',
        type: 'ListBundle',
        sortOrder: 1,
      })
      // バンドル2を作成
      const bundle2 = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル2',
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
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
      })
      // 記事ディレクトリ配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${art1.path}/d1`)
      const d2 = await storageService.createArticleGeneralDir(`${art1.path}/d2`)

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
      const assets = await storageService.createArticleGeneralDir(`${articleRootPath}/${config.storage.article.assetsName}`)
      // アセット配下にディレクトリを作成
      const d1 = await storageService.createArticleGeneralDir(`${assets.path}/d1`)
      const d2 = await storageService.createArticleGeneralDir(`${assets.path}/d2`)

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
  })

  describe('saveArticleSrcMasterFile', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
      })
      // 記事1のマスターファイル
      const art1_master = await storageService.sgetNode({ path: StorageService.toArticleSrcMasterPath(art1.path) })
      // 記事1の下書きファイル
      const art1_draft = await storageService.sgetNode({ path: StorageService.toArticleSrcDraftPath(art1.path) })

      // テスト対象実行
      const srcContent = '#header1'
      const textContent = 'header1'
      const actual = await storageService.saveArticleSrcMasterFile(art1.path, srcContent, textContent)

      // 戻り値の検証
      {
        // マスターファイル
        const { master: art1_master_, draft: art1_draft_ } = actual
        expect(art1_master_.id).toBe(art1_master.id)
        expect(art1_master_.size).toBe(Buffer.byteLength(srcContent, 'utf-8'))
        expect(art1_master_.contentType).toBe('text/markdown')
        expect(art1_master_.updatedAt.isAfter(art1_master.updatedAt))
        expect(art1_master_.version).toBe(art1_master.version + 1)
        // 下書きファイル
        expect(art1_draft_.id).toBe(art1_draft.id)
        expect(art1_draft_.size).toBe(0)
        expect(art1_draft_.contentType).toBe('text/markdown')
        expect(art1_draft_.updatedAt.isAfter(art1_draft.updatedAt))
        expect(art1_draft_.version).toBe(art1_draft.version + 1)
      }

      // マスターファイルの検証
      {
        // マスターファイル
        const art1_master_ = await storageService.sgetFileNode({ path: StorageService.toArticleSrcMasterPath(art1.path) })
        expect(art1_master_.id).toBe(art1_master.id)
        expect(art1_master_.size).toBe(Buffer.byteLength(srcContent, 'utf-8'))
        expect(art1_master_.contentType).toBe('text/markdown')
        expect(art1_master_.updatedAt.isAfter(art1_master.updatedAt))
        expect(art1_master_.version).toBe(art1_master.version + 1)
        const art1_master_src = (await art1_master_.file.download()).toString()
        expect(art1_master_src).toBe(srcContent)
        // 下書きファイル
        const art1_draft_ = await storageService.sgetFileNode({ path: StorageService.toArticleSrcDraftPath(art1.path) })
        expect(art1_draft_.id).toBe(art1_draft.id)
        expect(art1_draft_.size).toBe(0)
        expect(art1_draft_.contentType).toBe('text/markdown')
        expect(art1_draft_.updatedAt.isAfter(art1_draft.updatedAt))
        expect(art1_draft_.version).toBe(art1_draft.version + 1)
        const art1_draft_src = (await art1_draft_.file.download()).toString()
        expect(art1_draft_src).toBe('')
      }

      await h.existsNodes(Object.values(actual))
    })
  })

  describe('saveArticleSrcDraftFile', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: '記事1',
        type: 'Article',
      })
      // 記事1の下書きファイル
      const art1_draft = await storageService.sgetNode({ path: StorageService.toArticleSrcDraftPath(art1.path) })

      // テスト対象実行
      const srcContent = '#header1'
      const actual = await storageService.saveArticleSrcDraftFile(art1.path, srcContent)

      // 戻り値の検証
      expect(actual.id).toBe(art1_draft.id)
      expect(actual.size).toBe(Buffer.byteLength(srcContent, 'utf-8'))
      expect(actual.updatedAt.isAfter(art1_draft.updatedAt))
      expect(actual.version).toBe(art1_draft.version + 1)

      // 記事1の下書きファイルの検証
      const _art1_draft = await storageService.sgetFileNode({ path: StorageService.toArticleSrcDraftPath(art1.path) })
      expect(_art1_draft.id).toBe(art1_draft.id)
      expect(_art1_draft.size).toBe(Buffer.byteLength(srcContent, 'utf-8'))
      expect(_art1_draft.contentType).toBe('text/markdown')
      expect(_art1_draft.updatedAt.isAfter(art1_draft.updatedAt))
      expect(_art1_draft.version).toBe(art1_draft.version + 1)
      const _srcContent = (await _art1_draft.file.download()).toString()
      expect(_srcContent).toBe(srcContent)

      await h.existsNodes([actual])
    })
  })

  describe('getArticleChildren', () => {
    let articleRoot: StorageNode
    let programming: StorageNode
    let introduction: StorageNode
    let introduction_master: StorageNode
    let js: StorageNode
    let variable: StorageNode
    let variable_master: StorageNode
    let ts: StorageNode
    let clazz: StorageNode
    let clazz_master: StorageNode
    let py: StorageNode
    let tmp: StorageNode

    beforeEach(async () => {
      const { srcMasterFileName } = config.storage.article

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
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      articleRoot = (await storageService.createHierarchicalDirs([articleRootPath]))[0]

      // programming
      programming = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'programming',
        type: 'TreeBundle',
        sortOrder: 1,
      })

      // introduction
      introduction = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'introduction',
        type: 'Article',
        sortOrder: 4,
      })
      // introduction/index.md
      introduction_master = await storageService.sgetNode({ path: `${introduction.path}/${srcMasterFileName}` })

      // js
      js = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'js',
        type: 'Category',
        sortOrder: 3,
      })
      // js/variable
      variable = await storageService.createArticleTypeDir({
        dir: `${js.path}`,
        name: 'variable',
        type: 'Article',
        sortOrder: 1,
      })
      // js/variable/index.md
      variable_master = await storageService.sgetNode({ path: `${variable.path}/${srcMasterFileName}` })

      // ts
      ts = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'ts',
        type: 'Category',
        sortOrder: 2,
      })
      // ts/class
      clazz = await storageService.createArticleTypeDir({
        dir: `${ts.path}`,
        name: 'class',
        type: 'Article',
        sortOrder: 1,
      })
      // ts/class/index.md
      clazz_master = await storageService.sgetNode({ path: `${clazz.path}/${srcMasterFileName}` })

      // py
      py = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'py',
        type: 'Category',
        sortOrder: 1,
      })

      // tmp
      const uerRootPath = StorageService.toUserRootPath(StorageUserToken())
      tmp = await storageService.createDir(`${uerRootPath}/tmp`)
    })

    it('ベーシックケース', async () => {
      const actual = await storageService.getArticleChildren({
        dirPath: `${programming.path}`,
        types: ['Category', 'Article'],
      })

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(4)
      expect(actual.list[0].path).toBe(`${introduction.path}`)
      expect(actual.list[1].path).toBe(`${js.path}`)
      expect(actual.list[2].path).toBe(`${ts.path}`)
      expect(actual.list[3].path).toBe(`${py.path}`)
      await h.existsNodes(actual.list)
    })

    it('対象ノードに存在しないノードを指定した場合', async () => {
      // パスに存在しないノードを指定
      const actual = await storageService.getArticleChildren({
        dirPath: `${programming.path}/cobol`,
        types: ['Category'],
      })

      expect(actual.nextPageToken).toBeUndefined()
      expect(actual.list.length).toBe(0)
    })

    it('大量データの場合', async () => {
      await Promise.all(
        [...Array(10)].map(async (_, i) => {
          await storageService.createArticleTypeDir({
            dir: `${py.path}`,
            name: `art${(i + 1).toString().padStart(2, '0')}`,
            type: 'Article',
            sortOrder: i + 1,
          })
        })
      )

      // 大量データを想定して検索を行う
      const actual: StorageNode[] = []
      const input: GetArticleChildrenInput = { dirPath: `${py.path}`, types: ['Article'] }
      let fetched = await storageService.getArticleChildren(input, { maxChunk: 3 })
      actual.push(...fetched.list)
      while (fetched.nextPageToken) {
        fetched = await storageService.getArticleChildren(input, { maxChunk: 3, pageToken: fetched.nextPageToken })
        actual.push(...fetched.list)
      }

      expect(actual.length).toBe(10)
      expect(actual[0].article?.dir?.name).toBe(`art10`)
      expect(actual[1].article?.dir?.name).toBe(`art09`)
      expect(actual[2].article?.dir?.name).toBe(`art08`)
      expect(actual[3].article?.dir?.name).toBe(`art07`)
      expect(actual[4].article?.dir?.name).toBe(`art06`)
      expect(actual[5].article?.dir?.name).toBe(`art05`)
      expect(actual[6].article?.dir?.name).toBe(`art04`)
      expect(actual[7].article?.dir?.name).toBe(`art03`)
      expect(actual[8].article?.dir?.name).toBe(`art02`)
      expect(actual[9].article?.dir?.name).toBe(`art01`)
      await h.existsNodes(actual)
    })
  })

  describe('getArticleTableOfContents', () => {
    let articleRootPath: string
    let users: StorageNode
    let userRoot: StorageNode
    let articleRoot: StorageNode
    let blog: StorageNode
    let blogArt1: StorageNode
    let blogArt1_master: StorageNode
    let programming: StorageNode
    let introduction: StorageNode
    let introduction_master: StorageNode
    let js: StorageNode
    let variable: StorageNode
    let variable_master: StorageNode
    let ts: StorageNode
    let clazz: StorageNode
    let clazz_master: StorageNode
    let generics: StorageNode
    let generics_master: StorageNode
    let secret: StorageNode
    let secretArt1: StorageNode
    let secretArt1_master: StorageNode
    let secretArt2: StorageNode
    let secretArt2_master: StorageNode

    beforeAll(async () => {
      await devUtilsService.setTestUsers(AppAdminUser(), GeneralUser(), StorageUser())
    })

    async function setupArticleTypeNodes(): Promise<void> {
      const { srcMasterFileName } = config.storage.article

      // users
      // └test.storage
      //   └articles
      //     ├blog ← 公開
      //     │└blog-art1
      //     │  └index.md
      //     ├programming ← 公開
      //     │├introduction
      //     ││└index.md
      //     │├js
      //     ││└variable ← 非公開
      //     ││  └index.md
      //     │└ts
      //     │  ├class
      //     │  │└index.md
      //     │  └generics ← 非公開
      //     │    └index.md
      //     └secret ← 非公開
      //       ├secret-art1
      //       │└index.md
      //       └secret-art2 ← 指定ユーザーにのみ公開
      //         └index.md

      // users/test.storage/articles
      articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const articleRootNodes = await storageService.createHierarchicalDirs([articleRootPath])
      users = articleRootNodes[0]
      userRoot = articleRootNodes[1]
      articleRoot = articleRootNodes[2]

      // blog
      blog = await storageService.createArticleTypeDir(
        {
          dir: `${articleRootPath}`,
          name: 'blog',
          type: 'ListBundle',
          sortOrder: 3,
        },
        { share: { isPublic: true } }
      )

      // blog-art1
      blogArt1 = await storageService.createArticleTypeDir({
        dir: `${blog.path}`,
        name: 'blog-art1',
        type: 'Article',
        sortOrder: 2,
      })
      // blog-art1/index.md
      blogArt1_master = await storageService.sgetNode({ path: `${blogArt1.path}/${srcMasterFileName}` })

      // programming
      programming = await storageService.createArticleTypeDir(
        {
          dir: `${articleRootPath}`,
          name: 'programming',
          type: 'TreeBundle',
          sortOrder: 2,
        },
        { share: { isPublic: true } }
      )

      // introduction
      introduction = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'introduction',
        type: 'Article',
        sortOrder: 4,
      })
      // introduction/index.md
      introduction_master = await storageService.sgetNode({ path: `${introduction.path}/${srcMasterFileName}` })

      // js
      js = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'js',
        type: 'Category',
        sortOrder: 3,
      })
      // js/variable
      variable = await storageService.createArticleTypeDir(
        {
          dir: `${js.path}`,
          name: 'variable',
          type: 'Article',
          sortOrder: 1,
        },
        { share: { isPublic: false } }
      )
      // js/variable/index.md
      variable_master = await storageService.sgetNode({ path: `${variable.path}/${srcMasterFileName}` })

      // ts
      ts = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'ts',
        type: 'Category',
        sortOrder: 2,
      })
      // ts/class
      clazz = await storageService.createArticleTypeDir({
        dir: `${ts.path}`,
        name: 'class',
        type: 'Article',
        sortOrder: 1,
      })
      // ts/class/index.md
      clazz_master = await storageService.sgetNode({ path: `${clazz.path}/${srcMasterFileName}` })
      // ts/generics
      generics = await storageService.createArticleTypeDir(
        {
          dir: `${ts.path}`,
          name: 'generics',
          type: 'Article',
          sortOrder: 1,
        },
        { share: { isPublic: false } }
      )
      // ts/generics/index.md
      generics_master = await storageService.sgetNode({ path: `${generics.path}/${srcMasterFileName}` })

      // secret
      secret = await storageService.createArticleTypeDir(
        {
          dir: `${articleRootPath}`,
          name: 'secret',
          type: 'TreeBundle',
          sortOrder: 1,
        },
        { share: { isPublic: false } }
      )

      // secret-art1
      secretArt1 = await storageService.createArticleTypeDir({
        dir: `${secret.path}`,
        name: 'secret-art1',
        type: 'Article',
        sortOrder: 2,
      })
      // secret-art1/index.md
      secretArt1_master = await storageService.sgetNode({ path: `${secretArt1.path}/${srcMasterFileName}` })

      // secret-art2
      secretArt2 = await storageService.createArticleTypeDir(
        {
          dir: `${secret.path}`,
          name: 'secret-art2',
          type: 'Article',
          sortOrder: 2,
        },
        { share: { readUIds: [GeneralUser().uid] } }
      )
      // secret-art2/index.md
      secretArt2_master = await storageService.sgetNode({ path: `${secretArt2.path}/${srcMasterFileName}` })
    }

    function verifyArticleTableOfContentsNode(actual: ArticleTableOfContentsNode, expected: StorageNode): void {
      expect(actual.id).toBe(expected.id)
      expect(actual.name).toBe(expected.name)
      expect(actual.dir).toBe(removeBothEndsSlash(expected.dir.replace(articleRootPath, '')))
      expect(actual.path).toBe(removeBothEndsSlash(expected.path.replace(articleRootPath, '')))
      expect(actual.label).toBe(expected.article?.dir?.name)
      expect(actual.type).toBe(expected.article?.dir?.type)
      expect(actual.version).toBe(expected.version)
      expect(actual.createdAt).toEqual(expected.createdAt)
      expect(actual.updatedAt).toEqual(expected.updatedAt)
    }

    it('ベーシックケース', async () => {
      await setupArticleTypeNodes()

      const actual = await storageService.getArticleTableOfContents(StorageUser().userName, StorageUser())

      expect(actual.length).toBe(11)
      verifyArticleTableOfContentsNode(actual[0], blog)
      verifyArticleTableOfContentsNode(actual[1], programming)
      verifyArticleTableOfContentsNode(actual[2], introduction)
      verifyArticleTableOfContentsNode(actual[3], js)
      verifyArticleTableOfContentsNode(actual[4], variable)
      verifyArticleTableOfContentsNode(actual[5], ts)
      verifyArticleTableOfContentsNode(actual[6], clazz)
      verifyArticleTableOfContentsNode(actual[7], generics)
      verifyArticleTableOfContentsNode(actual[8], secret)
      verifyArticleTableOfContentsNode(actual[9], secretArt1)
      verifyArticleTableOfContentsNode(actual[10], secretArt2)
    })

    it('他ユーザーによる目次取得', async () => {
      await setupArticleTypeNodes()

      const actual = await storageService.getArticleTableOfContents(StorageUser().userName, GeneralUser())

      expect(actual.length).toBe(7)
      verifyArticleTableOfContentsNode(actual[0], blog)
      verifyArticleTableOfContentsNode(actual[1], programming)
      verifyArticleTableOfContentsNode(actual[2], introduction)
      verifyArticleTableOfContentsNode(actual[3], ts)
      verifyArticleTableOfContentsNode(actual[4], clazz)
      verifyArticleTableOfContentsNode(actual[5], secret)
      verifyArticleTableOfContentsNode(actual[6], secretArt2)
    })

    it('サインインしていないユーザーによる目次取得', async () => {
      await setupArticleTypeNodes()

      const actual = await storageService.getArticleTableOfContents(StorageUser().userName)

      expect(actual.length).toBe(5)
      verifyArticleTableOfContentsNode(actual[0], blog)
      verifyArticleTableOfContentsNode(actual[1], programming)
      verifyArticleTableOfContentsNode(actual[2], introduction)
      verifyArticleTableOfContentsNode(actual[3], ts)
      verifyArticleTableOfContentsNode(actual[4], clazz)
    })

    it('目次がない場合', async () => {
      // 記事ルートを作成
      articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])

      const actual = await storageService.getArticleTableOfContents(StorageUser().userName, GeneralUser())

      expect(actual.length).toBe(0)
    })

    it('記事ルートがまだ存在しない場合', async () => {
      const actual = await storageService.getArticleTableOfContents(StorageUser().userName, GeneralUser())

      expect(actual.length).toBe(0)
    })
  })

  describe('sortNodes', () => {
    it('パターン①', async () => {
      // users
      // └test.storage
      //   ├articles
      //   │├blog
      //   ││├artA
      //   │││├index.md
      //   │││├index.draft.md
      //   │││├images
      //   ││││├picA.png
      //   ││││└picB.png
      //   │││└memo.txt
      //   ││└artB
      //   ││  ├index.md
      //   ││  └index.draft.md
      //   │├programming
      //   ││├artC
      //   ││├artD
      //   ││├TypeScript
      //   │││├artE
      //   ││││├index.md
      //   ││││└index.draft.md
      //   │││└artF
      //   │││  ├index.md
      //   │││  └index.draft.md
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

      const users = h.newDirNode(config.storage.user.rootName)

      const userRoot = h.newDirNode(StorageService.toUserRootPath(StorageUserToken()))

      const articleRoot = h.newDirNode(StorageService.toArticleRootPath(StorageUserToken()))

      const blog = h.newDirNode(`${articleRoot.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'blog', type: 'ListBundle', sortOrder: 2 } },
      })
      const blog_artA = h.newDirNode(`${blog.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art1', type: 'Article', sortOrder: 2 } },
      })
      const blog_artA_master = h.newFileNode(StorageService.toArticleSrcMasterPath(blog_artA.path), {
        article: { file: { type: 'Master' } },
      })
      const blog_artA_draft = h.newFileNode(StorageService.toArticleSrcDraftPath(blog_artA.path), {
        article: { file: { type: 'Draft' } },
      })
      const blog_artA_images = h.newDirNode(`${blog_artA.path}/images`)
      const blog_artA_images_picA = h.newFileNode(`${blog_artA_images.path}/picA.png`)
      const blog_artA_images_picB = h.newFileNode(`${blog_artA_images.path}/picB.png`)
      const blog_artA_memo = h.newFileNode(`${blog_artA.path}/memo.txt`)
      const blog_artB = h.newDirNode(`${blog.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art2', type: 'Article', sortOrder: 1 } },
      })
      const blog_artB_master = h.newFileNode(StorageService.toArticleSrcMasterPath(blog_artB.path), {
        article: { file: { type: 'Master' } },
      })
      const blog_artB_draft = h.newFileNode(StorageService.toArticleSrcDraftPath(blog_artB.path), {
        article: { file: { type: 'Draft' } },
      })

      const programming = h.newDirNode(`${articleRoot.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'programming', type: 'TreeBundle', sortOrder: 1 } },
      })
      const programming_artC = h.newDirNode(`${programming.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art1', type: 'Article', sortOrder: 4 } },
      })
      const programming_artD = h.newDirNode(`${programming.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art2', type: 'Article', sortOrder: 3 } },
      })
      const programming_ts = h.newDirNode(`${programming.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'TypeScript', type: 'Category', sortOrder: 2 } },
      })
      const programming_ts_artE = h.newDirNode(`${programming_ts.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art1', type: 'Article', sortOrder: 2 } },
      })
      const programming_ts_artE_master = h.newFileNode(StorageService.toArticleSrcMasterPath(programming_ts_artE.path), {
        article: { file: { type: 'Master' } },
      })
      const programming_ts_artE_draft = h.newFileNode(StorageService.toArticleSrcDraftPath(programming_ts_artE.path), {
        article: { file: { type: 'Draft' } },
      })
      const programming_ts_artF = h.newDirNode(`${programming_ts.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art2', type: 'Article', sortOrder: 1 } },
      })
      const programming_ts_artF_master = h.newFileNode(StorageService.toArticleSrcMasterPath(programming_ts_artF.path), {
        article: { file: { type: 'Master' } },
      })
      const programming_ts_artF_draft = h.newFileNode(StorageService.toArticleSrcDraftPath(programming_ts_artF.path), {
        article: { file: { type: 'Draft' } },
      })
      const programming_js = h.newDirNode(`${programming.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'JavaScript', type: 'Category', sortOrder: 1 } },
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
        blog_artA_master,
        blog_artA_draft,
        blog_artA_images,
        blog_artA_images_picA,
        blog_artA_images_picB,
        blog_artA_memo,
        blog_artB,
        blog_artB_master,
        blog_artB_draft,
        programming,
        programming_artC,
        programming_artD,
        programming_ts,
        programming_ts_artE,
        programming_ts_artE_master,
        programming_ts_artE_draft,
        programming_ts_artF,
        programming_ts_artF_master,
        programming_ts_artF_draft,
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
      expect(nodes[5]).toBe(blog_artA_master)
      expect(nodes[6]).toBe(blog_artA_draft)
      expect(nodes[7]).toBe(blog_artA_images)
      expect(nodes[8]).toBe(blog_artA_images_picA)
      expect(nodes[9]).toBe(blog_artA_images_picB)
      expect(nodes[10]).toBe(blog_artA_memo)
      expect(nodes[11]).toBe(blog_artB)
      expect(nodes[12]).toBe(blog_artB_master)
      expect(nodes[13]).toBe(blog_artB_draft)
      expect(nodes[14]).toBe(programming)
      expect(nodes[15]).toBe(programming_artC)
      expect(nodes[16]).toBe(programming_artD)
      expect(nodes[17]).toBe(programming_ts)
      expect(nodes[18]).toBe(programming_ts_artE)
      expect(nodes[19]).toBe(programming_ts_artE_master)
      expect(nodes[20]).toBe(programming_ts_artE_draft)
      expect(nodes[21]).toBe(programming_ts_artF)
      expect(nodes[22]).toBe(programming_ts_artF_master)
      expect(nodes[23]).toBe(programming_ts_artF_draft)
      expect(nodes[24]).toBe(programming_js)
      expect(nodes[25]).toBe(assets)
      expect(nodes[26]).toBe(assets_picC)
      expect(nodes[27]).toBe(assets_picD)
      expect(nodes[28]).toBe(tmp)
      expect(nodes[29]).toBe(d1)
      expect(nodes[30]).toBe(f11)
      expect(nodes[31]).toBe(f12)
      expect(nodes[32]).toBe(d2)
      expect(nodes[33]).toBe(f1)
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
      const categoryPath = `${articleRootPath}/category`

      const category_art1 = h.newDirNode(`${categoryPath}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art1', type: 'Article', sortOrder: 4 } },
      })
      const category_art2 = h.newDirNode(`${categoryPath}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art2', type: 'Article', sortOrder: 3 } },
      })
      const category_ts = h.newDirNode(`${categoryPath}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'TypeScript', type: 'Category', sortOrder: 2 } },
      })
      const category_ts_art1 = h.newDirNode(`${category_ts.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art1', type: 'Article', sortOrder: 2 } },
      })
      const category_ts_art2 = h.newDirNode(`${category_ts.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art2', type: 'Article', sortOrder: 1 } },
      })
      const category_js = h.newDirNode(`${categoryPath}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'JavaScript', type: 'Category', sortOrder: 1 } },
      })
      const category_js_art1 = h.newDirNode(`${category_js.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art1', type: 'Article', sortOrder: 2 } },
      })
      const category_js_art2 = h.newDirNode(`${category_js.path}/${StorageSchema.generateNodeId()}`, {
        article: { dir: { name: 'art2', type: 'Article', sortOrder: 1 } },
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
      StorageService.sortNodes(nodes)

      expect(nodes[0]).toBe(category_art1)
      expect(nodes[1]).toBe(category_art2)
      expect(nodes[2]).toBe(category_ts)
      expect(nodes[3]).toBe(category_ts_art1)
      expect(nodes[4]).toBe(category_ts_art2)
      expect(nodes[5]).toBe(category_js)
      expect(nodes[6]).toBe(category_js_art1)
      expect(nodes[7]).toBe(category_js_art2)
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
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const actual = await storageService.createDir(articleRootPath)

      expect(actual.path).toBe(articleRootPath)
    })

    it('アセットディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createDir(articleRootPath)
      // アセットディレクトリのパスを作成
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`

      let actual!: AppError
      try {
        // アセットディレクトリを作成
        await storageService.createDir(assetsPath)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`This method 'createDir()' cannot create an article under directory '${assetsPath}'.`)
    })

    it('記事ルート配下にディレクトリを作成しようとした場合', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createDir(articleRootPath)

      const dirPath = `${articleRootPath}/blog`
      let actual!: AppError
      try {
        // 記事ルート配下にディレクトリを作成
        await storageService.createDir(dirPath)
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`This method 'createDir()' cannot create an article under directory '${dirPath}'.`)
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
      await storageService.createDir(articleRootPath)
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

      const dirPath = `${articleRootPath}/blog`
      let actual!: AppError
      try {
        // 記事ルート配下にディレクトリを作成
        await storageService.createHierarchicalDirs([dirPath])
      } catch (err) {
        actual = err
      }

      expect(actual.cause).toBe(`This method 'createHierarchicalDirs()' cannot create an article under directory '${dirPath}'.`)
    })
  })

  describe('moveDir', () => {
    let articleRoot: StorageNode
    let programming: StorageNode
    let introduction: StorageNode
    let introduction_master: StorageNode
    let js: StorageNode
    let variable: StorageNode
    let variable_master: StorageNode
    let variable_draft: StorageNode
    let ts: StorageNode
    let clazz: StorageNode
    let clazz_master: StorageNode
    let clazz_draft: StorageNode
    let py: StorageNode
    let tmp: StorageNode

    beforeEach(async () => {
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
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      articleRoot = (await storageService.createHierarchicalDirs([articleRootPath]))[0]

      // programming
      programming = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'programming',
        type: 'TreeBundle',
        sortOrder: 1,
      })

      // introduction
      introduction = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'introduction',
        type: 'Article',
        sortOrder: 4,
      })
      // introduction/index.md
      introduction_master = await storageService.sgetNode({ path: StorageService.toArticleSrcMasterPath(introduction.path) })

      // ts
      ts = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'ts',
        type: 'Category',
        sortOrder: 3,
      })
      // ts/class
      clazz = await storageService.createArticleTypeDir({
        dir: `${ts.path}`,
        name: 'class',
        type: 'Article',
      })
      // ts/class/index.md
      clazz_master = await storageService.sgetNode({ path: StorageService.toArticleSrcMasterPath(clazz.path) })
      // ts/class/index.draft.md
      clazz_draft = await storageService.sgetNode({ path: StorageService.toArticleSrcDraftPath(clazz.path) })

      // js
      js = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'js',
        type: 'Category',
        sortOrder: 2,
      })
      // js/variable
      variable = await storageService.createArticleTypeDir({
        dir: `${js.path}`,
        name: 'variable',
        type: 'Article',
      })
      // js/variable/index.md
      variable_master = await storageService.sgetNode({ path: StorageService.toArticleSrcMasterPath(variable.path) })
      // js/variable/index.md
      variable_draft = await storageService.sgetNode({ path: StorageService.toArticleSrcDraftPath(variable.path) })

      // py
      py = await storageService.createArticleTypeDir({
        dir: `${programming.path}`,
        name: 'py',
        type: 'Category',
        sortOrder: 1,
      })

      // tmp
      const uerRootPath = StorageService.toUserRootPath(StorageUserToken())
      tmp = await storageService.createDir(`${uerRootPath}/tmp`)
    })

    describe('バンドルの移動', () => {
      it('バンドルは移動できない', async () => {
        let actual!: AppError
        try {
          // バンドルを移動しようとした場合
          // 'programming'を'tmp/programming'へ移動
          await storageService.moveDir(`${programming.path}`, `${tmp.path}/${programming.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Article bundles cannot be moved.`)
        expect(actual.data).toEqual({
          movingNode: pickProps(programming, ['id', 'path', 'article']),
        })
      })
    })

    describe('カテゴリの移動', () => {
      it('ベーシックケース', async () => {
        // 移動前の'programming/ts'のソート順を検証
        expect(ts.article?.dir?.sortOrder).toBe(3)

        // カテゴリを別のカテゴリへ移動
        // 'programming/ts'を'programming/js/ts'へ移動
        const toNodePath = `${js.path}/${ts.name}`
        await storageService.moveDir(`${ts.path}`, toNodePath)

        // 移動後の'programming/js/ts'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
        StorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(4)
        expect(toNodes[0].path).toBe(`${js.path}/${ts.name}`)
        expect(toNodes[1].path).toBe(`${js.path}/${ts.name}/${clazz.name}`)
        expect(toNodes[2].path).toBe(`${js.path}/${ts.name}/${clazz.name}/${clazz_master.name}`)
        expect(toNodes[3].path).toBe(`${js.path}/${ts.name}/${clazz.name}/${clazz_draft.name}`)

        // 移動後の'programming/js/ts'のソート順を検証
        const _ts = toNodes[0]
        expect(_ts.article?.dir?.sortOrder).toBe(2)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: AppError
        try {
          // カテゴリを記事ディレクトリ直下へ移動しようとした場合
          // 'programming/ts'を'programming/js/variable/ts'へ移動
          await storageService.moveDir(`${ts.path}`, `${variable.path}/${ts.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Categories can only be moved to category bundles or categories.`)
        expect(actual.data).toEqual({
          movingNode: pickProps(ts, ['id', 'path', 'article']),
          toParentNode: pickProps(variable, ['id', 'path', 'article']),
        })
      })
    })

    describe('記事ディレクトリの移動', () => {
      it('ベーシックケース', async () => {
        // 移動前の'programming/js/variable'のソート順を検証
        expect(variable.article?.dir?.sortOrder).toBe(1)

        // 記事ディレクトリをカテゴリ直下へ移動
        // 'programming/js/variable'を'programming/ts/variable'へ移動
        const toNodePath = `${ts.path}/${variable.name}`
        await storageService.moveDir(`${variable.path}`, toNodePath)

        // 移動後の'programming/ts/variable'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
        StorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(3)
        expect(toNodes[0].path).toBe(`${ts.path}/${variable.name}`)
        expect(toNodes[1].path).toBe(`${ts.path}/${variable.name}/${variable_master.name}`)
        expect(toNodes[2].path).toBe(`${ts.path}/${variable.name}/${variable_draft.name}`)

        // 移動後の'programming/ts/variable'のソート順を検証
        const _variable = toNodes[0]
        expect(_variable.article?.dir?.sortOrder).toBe(2)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: AppError
        try {
          //  記事ディレクトリを別の記事ディレクトリ直下へ移動しようとした場合
          // 'programming/ts/class'を'programming/js/variable/class'へ移動
          await storageService.moveDir(`${clazz.path}`, `${variable.path}/${clazz.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`Articles can only be moved to list bundles or category bundles or categories.`)
        expect(actual.data).toEqual({
          movingNode: pickProps(clazz, ['id', 'path', 'article']),
          toParentNode: pickProps(variable, ['id', 'path', 'article']),
        })
      })
    })

    describe('一般ディレクトリの移動', () => {
      it('ベーシックケース', async () => {
        // 一般ディレクトリを記事ディレクトリ直下へ移動
        // 'tmp'を'programming/js/variable/tmp'へ移動
        const toNodePath = `${variable.path}/${tmp.name}`
        await storageService.moveDir(`${tmp.path}`, toNodePath)

        // 移動後の'programming/js/variable/tmp'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
        StorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(1)
        expect(toNodes[0].path).toBe(`${variable.path}/${tmp.name}`)
      })

      it('ルートノードへ移動', async () => {
        // 一般ディレクトリをルートノードへ移動
        // 'tmp'をルートノード直下へ移動
        const toNodePath = `${tmp.name}`
        const actual = await storageService.moveDir(`${tmp.path}`, toNodePath)

        // 移動後の'tmp'＋配下ノードを検証
        const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
        StorageService.sortNodes(toNodes)
        expect(toNodes.length).toBe(1)
        expect(toNodes[0].path).toBe(`${tmp.name}`)
      })

      it('移動不可なディレクトリへ移動しようとした場合', async () => {
        let actual!: AppError
        try {
          //  一般ディレクトリをツリーバンドルへ移動しようとした場合
          // 'tmp'を'programming/tmp'へ移動
          await storageService.moveDir(`${tmp.path}`, `${programming.path}/${tmp.name}`)
        } catch (err) {
          actual = err
        }

        expect(actual.cause).toBe(`The general directory can only be moved to the general directory or articles.`)
        expect(actual.data).toEqual({
          movingNode: pickProps(tmp, ['id', 'path', 'article']),
          toParentNode: pickProps(programming, ['id', 'path', 'article']),
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
      const fromNodes = (await storageService.getDirDescendants(`d1`)).list

      // 大量データを想定して分割で移動を行う
      // 'd1'を'dA/d1'へ移動
      const toNodePath = `dA/d1`
      await storageService.moveDir(`d1`, toNodePath, { maxChunk: 3 })

      // 移動後の'dA/d1'＋配下ノードを検証
      const { list: toNodes } = await storageService.getDirDescendants(toNodePath)
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

  describe('m_validateArticleRootUnder', () => {
    it('ベーシックケース - 記事ルート直下', async () => {
      // 記事ルートのパスを作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      // バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`

      let actual!: AppError
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
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      // バンドルのパスを作成
      const bundlePath = `${articleRootPath}/blog`
      // 記事ディレクトリのパスを作成
      const art1Path = `${bundlePath}/art1`

      let actual!: AppError
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
      const userDirPath = StorageService.toUserRootPath(StorageUserToken())
      // バンドルを記事ルート以外に指定
      const bundlePath = `${userDirPath}/blog`

      let actual!: AppError
      try {
        // テスト対象実行
        await storageService.m_validateArticleRootUnder(bundlePath)
      } catch (err) {
        actual = err
      }

      // バンドルを記事ルートでないためエラーが発生
      expect(actual.cause).toBe(`The specified path is not under article root: '${bundlePath}'`)
    })
  })

  describe('m_getBelongToArticleBundle', () => {
    it('ベーシックケース', async () => {
      // 記事ルートの作成
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([articleRootPath])
      // バンドルを作成
      const bundle = await storageService.createArticleTypeDir({
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'TreeBundle',
      })
      // カテゴリ1を作成
      const cat1 = await storageService.createArticleTypeDir({
        dir: `${bundle.path}`,
        name: 'カテゴリ1',
        type: 'Category',
      })
      // 記事1を作成
      const art1 = await storageService.createArticleTypeDir({
        dir: `${cat1.path}`,
        name: '記事1',
        type: 'Article',
      })

      // テスト対象実行
      // ※引数ノードにバンドル配下のディレクトリを指定
      const actual = (await storageService.m_getBelongToArticleBundle(`${art1.path}`))!

      expect(actual.path).toBe(bundle.path)
    })

    it('記事系ノード以外を指定した場合', async () => {
      // ユーザールートの作成
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      await storageService.createHierarchicalDirs([userRootPath])
      // ユーザールート配下のパスを指定

      // テスト対象実行
      // ※引数ノードにバンドル配下のディレクトリを指定
      const actual = await storageService.m_getBelongToArticleBundle(`${userRootPath}/art1`)

      expect(actual).toBeUndefined()
    })
  })
})
