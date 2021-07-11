import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  AppAdminUserToken,
  ArticleListItemFields,
  ArticleListItemFieldsName,
  ArticleTableOfContentsItemFields,
  ArticleTableOfContentsItemFieldsName,
  ArticleTagFields,
  ArticleTagFieldsName,
  GeneralUser,
  StorageNodeFields,
  StorageNodeFieldsName,
  StorageTestHelper,
  StorageTestService,
  StorageUser,
  StorageUserHeader,
  StorageUserToken,
  getGQLErrorStatus,
  requestGQL,
  toGQLResponse,
} from '../../../../../../helpers/app'
import {
  ArticleListItem,
  ArticleTableOfContentsItem,
  CreateArticleGeneralDirInput,
  CreateArticleTypeDirInput,
  CreateStorageDirInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  GetArticleContentsNodeInput,
  GetUserArticleListInput,
  MoveStorageFileInput,
  PagingAfterResult,
  PagingFirstResult,
  PagingInput,
  RenameArticleTypeDirInput,
  RenameStorageFileInput,
  SaveArticleDraftContentInput,
  SaveArticleSrcContentInput,
  SaveArticleTagInput,
  SignedUploadUrlInput,
  StorageNode,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeKeyInput,
  StorageNodeShareDetail,
  StorageSchema,
  StorageService,
  StorageServiceDI,
  UserIdClaims,
} from '../../../../../../../src/app/services'
import { LangCode, arrayToDict, pickProps } from 'web-base-lib'
import { Test, TestingModule } from '@nestjs/testing'
import Lv1GQLContainerModule from '../../../../../../../src/app/gql/main/lv1'
import { compressToBase64 } from 'lz-string'
import { config } from '../../../../../../../src/config'
import dayjs = require('dayjs')
import { initApp } from '../../../../../../../src/app/base'

jest.setTimeout(5000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const InitialShareDetail: StorageNodeShareDetail = {
  isPublic: false,
  readUIds: ['ichiro', 'jiro'],
  writeUIds: [],
}

//========================================================================
//
//  Tests
//
//========================================================================

describe('Lv1 Storage Resolver', () => {
  let app: any
  let storageService: StorageTestService
  let h!: StorageTestHelper

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule],
    }).compile()

    const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    await devUtilsService.setTestFirebaseUsers(AppAdminUser(), GeneralUser())
  })

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [Lv1GQLContainerModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()
    storageService = module.get<StorageTestService>(StorageServiceDI.symbol)
    h = new StorageTestHelper(storageService)
  })

  describe('GQL Schema', () => {
    const gql = {
      query: `
        query GetStorageNodes($keys: StorageNodeGetKeysInput!) {
          storageNodes(keys: $keys) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    describe('ベーシックケース', () => {
      it('疎通確認', async () => {
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const bundle = h.newDirNode(`${articleRootPath}/${StorageSchema.generateId()}`, {
          article: {
            label: { ja: 'リストバンドル' },
            type: 'ListBundle',
            sortOrder: 1,
          },
        })
        const art1 = h.newDirNode(`${bundle.path}/${StorageSchema.generateId()}`, {
          article: {
            label: { ja: '記事1' },
            type: 'Article',
            sortOrder: 1,
            src: {
              ja: {
                srcContent: '# 記事1',
                draftContent: '# 記事下書き1',
                searchContent: '記事1',
                srcTags: ['旅行'],
                draftTags: ['旅行', 'キャンプ'],
                createdAt: dayjs('2020-01-02T00:00:00.000Z'),
                updatedAt: dayjs('2020-01-02T00:00:00.000Z'),
              },
            },
          },
        })

        const keys: StorageNodeGetKeysInput = { ids: [bundle.id, art1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes(StorageUserToken(), keys)).thenResolve([bundle, art1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { keys },
          },
          { headers: StorageUserHeader() }
        )

        expect(response.body.data.storageNodes).toEqual(toGQLResponse([bundle, art1]))
      })
    })
  })

  describe('storageNode', () => {
    const gql = {
      query: `
        query GetStorageNode($key: StorageNodeGetKeyInput!) {
          storageNode(key: $key) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode('d1')
      const key: StorageNodeGetKeyInput = { path: d1.path }

      const getNode = td.replace(storageService, 'getNode')
      td.when(getNode(AppAdminUserToken(), key)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { key },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageNode).toEqual(toGQLResponse(d1))
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const key: StorageNodeGetKeyInput = { path: d1.path }

      const getNode = td.replace(storageService, 'getNode')
      td.when(getNode(AppAdminUserToken(), key)).thenResolve(undefined)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { key },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageNode).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const key: StorageNodeGetKeyInput = { path: d1.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: { key },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageNodes', () => {
    const gql = {
      query: `
        query GetStorageNodes($keys: StorageNodeGetKeysInput!) {
          storageNodes(keys: $keys) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode('d1')
      const keys: StorageNodeGetKeysInput = { paths: [d1.path] }

      const getNodes = td.replace(storageService, 'getNodes')
      td.when(getNodes(AppAdminUserToken(), keys)).thenResolve([d1])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { keys },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageNodes).toEqual(toGQLResponse([d1]))
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode('d1')
      const keys: StorageNodeGetKeysInput = { paths: [d1.path] }

      const response = await requestGQL(app, {
        ...gql,
        variables: { keys },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageDescendants', () => {
    const gql = {
      query: `
        query GetStorageDescendants($input: StorageNodeGetUnderInput!, $paging: PagingInput) {
          storageDescendants(input: $input, paging: $paging) {
            ... on PagingFirstResult {
              list {
                ... on StorageNode {
                  ...${StorageNodeFieldsName}
                }
              }
              token
              pageSegments
              pageSize
              pageNum
              totalPages
              totalItems
              maxItems
            }
            ... on PagingAfterResult {
              list {
                ... on StorageNode {
                  ...${StorageNodeFieldsName}
                }
              }
              isPagingTimeout
            }
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認 - 初回', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const input = { path: d1.path, includeBase: true }
      const original: PagingFirstResult = {
        list: [d1, d11],
        token: 'abcdefg',
        pageSegments: [{ size: 2 }],
        pageSize: 10,
        pageNum: 1,
        totalPages: 1,
        totalItems: 2,
        maxItems: 2,
      }

      const getDescendants = td.replace(storageService, 'getDescendants')
      td.when(
        getDescendants(AppAdminUserToken(), input, {
          pageSize: original.pageSize,
        })
      ).thenResolve(original)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            paging: { pageSize: original.pageSize },
          },
        },
        { headers: AppAdminUserHeader() }
      )
      const actual: PagingFirstResult = response.body.data.storageDescendants

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.token).toBe(original.token)
      expect(actual.pageSegments).toEqual(compressToBase64(JSON.stringify(original.pageSegments)))
      expect(actual.pageNum).toBe(original.pageNum)
      expect(actual.pageSize).toBe(original.pageSize)
      expect(actual.totalPages).toBe(original.totalPages)
      expect(actual.totalItems).toBe(original.totalItems)
    })

    it('疎通確認 - 2回目以降', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const input = { path: d1.path, includeBase: true }
      const original: PagingAfterResult = {
        list: [d1, d11],
      }

      const getDescendants = td.replace(storageService, 'getDescendants')
      td.when(
        getDescendants(AppAdminUserToken(), input, {
          pageSize: 10,
        })
      ).thenResolve(original)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            paging: { pageSize: 10 },
          },
        },
        { headers: AppAdminUserHeader() }
      )
      const actual: PagingAfterResult = response.body.data.storageDescendants

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.isPagingTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const input = { path: d1.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input,
          paging: { pageSize: 3 },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageChildren', () => {
    const gql = {
      query: `
        query GetStorageChildren($input: StorageNodeGetUnderInput!, $paging: PagingInput) {
          storageChildren(input: $input, paging: $paging) {
            ... on PagingFirstResult {
              list {
                ... on StorageNode {
                  ...${StorageNodeFieldsName}
                }
              }
              token
              pageSegments
              pageSize
              pageNum
              totalPages
              totalItems
              maxItems
            }
            ... on PagingAfterResult {
              list {
                ... on StorageNode {
                  ...${StorageNodeFieldsName}
                }
              }
              isPagingTimeout
            }
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認 - 初回', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const input = { path: d1.path, includeBase: true }
      const original: PagingFirstResult = {
        list: [d1, d11],
        token: 'abcdefg',
        pageSegments: [{ size: 2 }],
        pageSize: 10,
        pageNum: 1,
        totalPages: 1,
        totalItems: 2,
        maxItems: 2,
      }

      const getChildren = td.replace(storageService, 'getChildren')
      td.when(
        getChildren(AppAdminUserToken(), input, {
          pageSize: original.pageSize,
        })
      ).thenResolve(original)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            paging: { pageSize: original.pageSize },
          },
        },
        { headers: AppAdminUserHeader() }
      )
      const actual: PagingFirstResult = response.body.data.storageChildren

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.token).toBe(original.token)
      expect(actual.pageSegments).toEqual(compressToBase64(JSON.stringify(original.pageSegments)))
      expect(actual.pageNum).toBe(original.pageNum)
      expect(actual.pageSize).toBe(original.pageSize)
      expect(actual.totalPages).toBe(original.totalPages)
      expect(actual.totalItems).toBe(original.totalItems)
    })

    it('疎通確認 - 2回目以降', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const input = { path: d1.path, includeBase: true }
      const original: PagingAfterResult = {
        list: [d1, d11],
      }

      const getChildren = td.replace(storageService, 'getChildren')
      td.when(
        getChildren(AppAdminUserToken(), input, {
          pageSize: 10,
        })
      ).thenResolve(original)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            paging: { pageSize: 10 },
          },
        },
        { headers: AppAdminUserHeader() }
      )
      const actual: PagingAfterResult = response.body.data.storageChildren

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.isPagingTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const input = { path: d1.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input,
          paging: { pageSize: 3 },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageHierarchicalNodes', () => {
    const gql = {
      query: `
        query GetStorageHierarchicalNodes($nodePath: String!) {
          storageHierarchicalNodes(nodePath: $nodePath) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const getHierarchicalNodes = td.replace(storageService, 'getHierarchicalNodes')
      td.when(getHierarchicalNodes(AppAdminUserToken(), fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageHierarchicalNodes).toEqual(toGQLResponse([d1, d11]))
    })

    it('サインインしていない場合', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageAncestorDirs', () => {
    const gql = {
      query: `
        query GetStorageAncestorDirs($nodePath: String!) {
          storageAncestorDirs(nodePath: $nodePath) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const getAncestorDirs = td.replace(storageService, 'getAncestorDirs')
      td.when(getAncestorDirs(AppAdminUserToken(), fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageAncestorDirs).toEqual(toGQLResponse([d1, d11]))
    })

    it('サインインしていない場合', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('createStorageDir', () => {
    const gql = {
      query: `
        mutation CreateStorageDir($input: CreateStorageDirInput!) {
          createStorageDir(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode(`d1`, { share: InitialShareDetail })

      const createDir = td.replace(storageService, 'createDir')
      td.when(createDir(AppAdminUserToken(), { dir: d1.path, share: InitialShareDetail })).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input: <CreateStorageDirInput>{
              dir: d1.path,
              share: InitialShareDetail,
            },
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.createStorageDir).toEqual(toGQLResponse(d1))
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input: <CreateStorageDirInput>{ dir: d1.path },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('createStorageHierarchicalDirs', () => {
    const gql = {
      query: `
        mutation CreateStorageHierarchicalDirs($dirs: [String!]!) {
          createStorageHierarchicalDirs(dirs: $dirs) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d11 = h.newDirNode(`d1/d11`)
      const d12 = h.newDirNode(`d1/d12`)

      const createHierarchicalDirs = td.replace(storageService, 'createHierarchicalDirs')
      td.when(createHierarchicalDirs(AppAdminUserToken(), [d11.path, d12.path])).thenResolve([d11, d12])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirs: [d11.path, d12.path] },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.createStorageHierarchicalDirs).toEqual(toGQLResponse([d11, d12]))
    })

    it('サインインしていない場合', async () => {
      const d11 = h.newDirNode(`d1/d11`)
      const d12 = h.newDirNode(`d1/d12`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirs: [d11.path, d12.path] },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('removeStorageFile', () => {
    const gql = {
      query: `
        mutation RemoveStorageFile($key: StorageNodeGetKeyInput!) {
          removeStorageFile(key: $key) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const removeFile = td.replace(storageService, 'removeFile')
      td.when(removeFile(AppAdminUserToken(), { path: fileA.path })).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { key: { path: fileA.path } },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.removeStorageFile).toEqual(toGQLResponse(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { key: { path: fileA.path } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('moveStorageFile', () => {
    const gql = {
      query: `
        mutation MoveStorageFile($input: MoveStorageFileInput!) {
          moveStorageFile(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const fileA = h.newFileNode(`docs/fileA.txt`)

      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(AppAdminUserToken(), { fromFile: `fileA.txt`, toFile: `docs/fileA.txt` })).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input: <MoveStorageFileInput>{
              fromFile: `fileA.txt`,
              toFile: `docs/fileA.txt`,
            },
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.moveStorageFile).toEqual(toGQLResponse(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input: <MoveStorageFileInput>{
            fromFile: `fileA.txt`,
            toFile: `docs/fileA.txt`,
          },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameStorageFile', () => {
    const gql = {
      query: `
        mutation RenameStorageFile($input: RenameStorageFileInput!) {
          renameStorageFile(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const fileB = h.newFileNode(`fileB.txt`)

      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(AppAdminUserToken(), { file: `fileA.txt`, name: `fileB.txt` })).thenResolve(fileB)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input: <RenameStorageFileInput>{
              file: `fileA.txt`,
              name: `fileB.txt`,
            },
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.renameStorageFile).toEqual(toGQLResponse(fileB))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input: <RenameStorageFileInput>{
            file: `fileA.txt`,
            name: `fileB.txt`,
          },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setStorageDirShareDetail', () => {
    const gql = {
      query: `
        mutation SetStorageDirShareDetail($key: StorageNodeGetKeyInput!, $input: StorageNodeShareDetailInput!) {
          setStorageDirShareDetail(key: $key, input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode(`d1`)

      const setDirShareDetail = td.replace(storageService, 'setDirShareDetail')
      td.when(setDirShareDetail(AppAdminUserToken(), { path: d1.path }, InitialShareDetail)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            key: { path: d1.path },
            input: InitialShareDetail,
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.setStorageDirShareDetail).toEqual(toGQLResponse(d1))
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { key: { path: d1.path }, input: InitialShareDetail },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setStorageFileShareDetail', () => {
    const gql = {
      query: `
        mutation SetStorageFileShareDetail($key: StorageNodeGetKeyInput!, $input: StorageNodeShareDetailInput!) {
          setStorageFileShareDetail(key: $key, input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const setFileShareDetail = td.replace(storageService, 'setFileShareDetail')
      td.when(setFileShareDetail(AppAdminUserToken(), { path: fileA.path }, InitialShareDetail)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            key: { path: fileA.path },
            input: InitialShareDetail,
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.setStorageFileShareDetail).toEqual(toGQLResponse(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          key: { path: fileA.path },
          input: InitialShareDetail,
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('handleUploadedFile', () => {
    const gql = {
      query: `
        mutation HandleUploadedFile($input: StorageNodeKeyInput!) {
          handleUploadedFile(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)
      const input: StorageNodeKeyInput = { id: fileA.id, path: fileA.path }

      const handleUploadedFile = td.replace(storageService, 'handleUploadedFile')
      td.when(handleUploadedFile(AppAdminUserToken(), input)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.handleUploadedFile).toEqual(toGQLResponse(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)
      const input: StorageNodeKeyInput = { id: fileA.id, path: fileA.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: { input },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setFileAccessAuthClaims', () => {
    const gql = {
      query: `
        mutation SetFileAccessAuthClaims($input: StorageNodeKeyInput!) {
          setFileAccessAuthClaims(input: $input)
        }
      `,
    }

    it('疎通確認', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const input: StorageNodeKeyInput = pickProps(d1, ['id', 'path'])

      const setFileAccessAuthClaims = td.replace(storageService, 'setFileAccessAuthClaims')
      td.when(setFileAccessAuthClaims(StorageUserToken(), input)).thenResolve(`xxx`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.setFileAccessAuthClaims).toBe('xxx')
    })

    it('サインインしていない場合', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const input: StorageNodeKeyInput = pickProps(d1, ['id', 'path'])

      const response = await requestGQL(app, {
        ...gql,
        variables: { input },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('removeFileAccessAuthClaims', () => {
    const gql = {
      query: `
        mutation RemoveFileAccessAuthClaims {
          removeFileAccessAuthClaims
        }
      `,
    }

    it('疎通確認', async () => {
      const removeFileAccessAuthClaims = td.replace(storageService, 'removeFileAccessAuthClaims')
      td.when(removeFileAccessAuthClaims(StorageUserToken())).thenResolve(`xxx`)

      const response = await requestGQL(
        app,
        {
          ...gql,
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.removeFileAccessAuthClaims).toBe('xxx')
    })

    it('サインインしていない場合', async () => {
      const userRootPath = StorageService.toUserRootPath(StorageUserToken())

      const response = await requestGQL(app, {
        ...gql,
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('signedUploadUrls', () => {
    const gql = {
      query: `
        query GetSignedUploadUrls($inputs: [SignedUploadUrlInput!]!) {
          signedUploadUrls(inputs: $inputs)
        }
      `,
    }

    it('疎通確認', async () => {
      const inputs: SignedUploadUrlInput[] = [
        {
          id: StorageSchema.generateId(),
          path: `d1/d11/fileA.txt`,
          contentType: 'text/plain',
        },
      ]

      const getSignedUploadUrls = td.replace(storageService, 'getSignedUploadUrls')
      td.when(getSignedUploadUrls(AppAdminUserToken(), td.matchers.anything(), inputs)).thenResolve([`xxx`])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.signedUploadUrls).toEqual([`xxx`])
    })

    it('サインインしていない場合', async () => {
      const inputs: SignedUploadUrlInput[] = [
        {
          id: StorageSchema.generateId(),
          path: `d1/d11/fileA.txt`,
          contentType: 'text/plain',
        },
      ]

      const response = await requestGQL(app, {
        ...gql,
        variables: { inputs },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('createArticleTypeDir', () => {
    const gql = {
      query: `
        mutation CreateArticleTypeDir($input: CreateArticleTypeDirInput!) {
          createArticleTypeDir(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const input: CreateArticleTypeDirInput = {
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
        share: InitialShareDetail,
      }
      const bundle = h.newDirNode(`${input.dir}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: input.label },
          type: input.type,
          sortOrder: 1,
        },
      })

      const createArticleTypeDir = td.replace(storageService, 'createArticleTypeDir')
      td.when(createArticleTypeDir(StorageUserToken(), input)).thenResolve(bundle)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.createArticleTypeDir).toEqual(toGQLResponse(bundle))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const input: CreateArticleTypeDirInput = {
        lang: 'ja',
        dir: `${articleRootPath}`,
        label: 'バンドル',
        type: 'ListBundle',
      }

      const response = await requestGQL(app, {
        ...gql,
        variables: { input },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('createArticleGeneralDir', () => {
    const gql = {
      query: `
        mutation CreateArticleGeneralDir($input: CreateArticleGeneralDirInput!) {
          createArticleGeneralDir(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const d1 = h.newDirNode(`${assetsPath}/d1`)

      const createArticleGeneralDir = td.replace(storageService, 'createArticleGeneralDir')
      td.when(createArticleGeneralDir(StorageUserToken(), { dir: d1.path, share: InitialShareDetail })).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input: <CreateArticleGeneralDirInput>{
              dir: d1.path,
              share: InitialShareDetail,
            },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.createArticleGeneralDir).toEqual(toGQLResponse(d1))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const d1 = h.newDirNode(`${assetsPath}/d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input: <CreateArticleGeneralDirInput>{ dir: d1.path },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameArticleTypeDir', () => {
    const gql = {
      query: `
        mutation RenameArticleTypeDir($input: RenameArticleTypeDirInput!) {
          renameArticleTypeDir(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${StorageSchema.generateId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'カテゴリ1' },
          type: 'Category',
          sortOrder: 1,
        },
      })

      const renameArticleTypeDir = td.replace(storageService, 'renameArticleTypeDir')
      td.when(renameArticleTypeDir(StorageUserToken(), { lang: 'ja', dir: cat1.path, label: cat1.article!.label.ja! })).thenResolve(cat1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input: <RenameArticleTypeDirInput>{
              lang: 'ja',
              dir: cat1.path,
              label: cat1.article!.label.ja!,
            },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.renameArticleTypeDir).toEqual(toGQLResponse(cat1))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${StorageSchema.generateId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'カテゴリ1' },
          type: 'Category',
          sortOrder: 1,
        },
      })

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input: <RenameArticleTypeDirInput>{
            lang: 'ja',
            dir: cat1.path,
            label: cat1.article!.label.ja!,
          },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setArticleSortOrder', () => {
    const gql = {
      query: `
        mutation SetArticleSortOrder($orderNodePaths: [String!]!) {
          setArticleSortOrder(orderNodePaths: $orderNodePaths)
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${StorageSchema.generateId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'カテゴリ1' },
          type: 'Category',
          sortOrder: 2,
        },
      })
      const cat2 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'カテゴリ2' },
          type: 'Category',
          sortOrder: 1,
        },
      })
      const orderNodePaths = [cat1.path, cat2.path]

      const setArticleSortOrder = td.replace(storageService, 'setArticleSortOrder')

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { orderNodePaths },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.setArticleSortOrder).toEqual(true)

      const exp = td.explain(setArticleSortOrder)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([StorageUserToken(), orderNodePaths])
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${StorageSchema.generateId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'カテゴリ1' },
          type: 'Category',
          sortOrder: 2,
        },
      })
      const cat2 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: 'カテゴリ2' },
          type: 'Category',
          sortOrder: 1,
        },
      })
      const orderNodePaths = [cat1.path, cat2.path]

      const response = await requestGQL(app, {
        ...gql,
        variables: { orderNodePaths },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('saveArticleSrcContent', () => {
    const gql = {
      query: `
        mutation SaveArticleSrcContent($key: StorageNodeGetKeyInput!, $input: SaveArticleSrcContentInput!) {
          saveArticleSrcContent(key: $key, input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    function newArticleNodes(user: UserIdClaims) {
      const articleRootPath = StorageService.toArticleRootPath(user)
      const bundlePath = `${articleRootPath}/${StorageSchema.generateId()}`
      const art1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: '記事1' },
          type: 'Article',
          sortOrder: 1,
          src: {
            ja: {
              srcContent: '# 記事1',
              draftContent: undefined,
              searchContent: '記事1',
              srcTags: ['旅行'],
              draftTags: undefined,
              createdAt: dayjs('2020-01-02T00:00:00.000Z'),
              updatedAt: dayjs('2020-01-02T00:00:00.000Z'),
            },
          },
        },
      })
      return { art1 }
    }

    it('疎通確認', async () => {
      const { art1 } = newArticleNodes(StorageUserToken())
      const srcContent = art1.article!.src!.ja!.srcContent!
      const searchContent = art1.article!.src!.ja!.searchContent!
      const srcTags = art1.article!.src!.ja!.srcTags!

      const saveArticleSrcContent = td.replace(storageService, 'saveArticleSrcContent')
      td.when(
        saveArticleSrcContent(
          StorageUserToken(),
          { id: art1.id },
          {
            lang: 'ja',
            srcContent,
            searchContent,
            srcTags,
          }
        )
      ).thenResolve(art1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            key: { id: art1.id },
            input: <SaveArticleSrcContentInput>{
              lang: 'ja',
              srcContent,
              searchContent,
              srcTags,
            },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleSrcContent).toEqual(toGQLResponse(art1))
    })

    it('サインインしていない場合', async () => {
      const { art1 } = newArticleNodes(StorageUserToken())
      const srcContent = art1.article!.src!.ja!.srcContent!
      const searchContent = art1.article!.src!.ja!.searchContent!

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          key: { id: art1.id },
          input: <SaveArticleSrcContentInput>{
            lang: 'ja',
            srcContent,
            searchContent,
          },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('saveArticleDraftContent', () => {
    const gql = {
      query: `
        mutation SaveArticleDraftContent($key: StorageNodeGetKeyInput!, $input: SaveArticleDraftContentInput!) {
          saveArticleDraftContent(key: $key, input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    function newArticleNodes(user: UserIdClaims) {
      const articleRootPath = StorageService.toArticleRootPath(user)
      const bundlePath = `${articleRootPath}/${StorageSchema.generateId()}`
      const art1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: '記事1' },
          type: 'Article',
          sortOrder: 1,
          src: {
            ja: {
              srcContent: '# 記事1',
              searchContent: '# 記事1',
              draftContent: '記事1下書き1',
              srcTags: ['旅行'],
              draftTags: ['旅行', 'キャンプ'],
              createdAt: dayjs('2020-01-02T00:00:00.000Z'),
              updatedAt: dayjs('2020-01-02T00:00:00.000Z'),
            },
          },
        },
      })
      return { art1 }
    }

    it('疎通確認', async () => {
      const { art1 } = newArticleNodes(StorageUserToken())

      const saveArticleDraftContent = td.replace(storageService, 'saveArticleDraftContent')
      td.when(
        saveArticleDraftContent(
          StorageUserToken(),
          { id: art1.id },
          {
            lang: 'ja',
            draftContent: art1.article!.src!.ja!.draftContent!,
            draftTags: art1.article!.src!.ja!.draftTags!,
          }
        )
      ).thenResolve(art1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            key: { id: art1.id },
            input: <SaveArticleDraftContentInput>{
              lang: 'ja',
              draftContent: art1.article!.src!.ja!.draftContent!,
              draftTags: art1.article!.src!.ja!.draftTags!,
            },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleDraftContent).toEqual(toGQLResponse(art1))
    })

    it('疎通確認 - draftContentにnullを指定した場合', async () => {
      const { art1 } = newArticleNodes(StorageUserToken())
      art1.article!.src!.ja!.draftContent = undefined

      const saveArticleDraftContent = td.replace(storageService, 'saveArticleDraftContent')
      td.when(
        saveArticleDraftContent(
          StorageUserToken(),
          { id: art1.id },
          {
            lang: 'ja',
            draftContent: null,
            draftTags: null,
          }
        )
      ).thenResolve(art1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            key: { id: art1.id },
            input: <SaveArticleDraftContentInput>{
              lang: 'ja',
              draftContent: null,
              draftTags: null,
            },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleDraftContent).toEqual(toGQLResponse(art1))
    })

    it('サインインしていない場合', async () => {
      const { art1 } = newArticleNodes(StorageUserToken())

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          key: { id: art1.id },
          input: <SaveArticleDraftContentInput>{
            lang: 'ja',
            draftContent: art1.article!.src!.ja!.draftContent!,
          },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('saveArticleTags', () => {
    const gql = {
      query: `
        mutation SaveArticleTags($inputs: [SaveArticleTagInput!]!) {
          saveArticleTags(inputs: $inputs) {
            ...${ArticleTagFieldsName}
          }
        }
        ${ArticleTagFields}
      `,
    }

    it('疎通確認', async () => {
      const tags = [h.newArticleTag('旅行'), h.newArticleTag('旅客機')]
      const inputs: SaveArticleTagInput[] = tags.map(tag => ({ name: tag.name }))

      const saveArticleTags = td.replace(storageService, 'saveArticleTags')
      td.when(saveArticleTags(inputs)).thenResolve(tags)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            inputs,
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.saveArticleTags).toEqual(toGQLResponse(tags))
    })

    it('サインインしていない場合', async () => {
      const tags = [h.newArticleTag('旅行'), h.newArticleTag('旅客機')]
      const inputs: SaveArticleTagInput[] = tags.map(tag => ({ name: tag.name }))

      const saveArticleTags = td.replace(storageService, 'saveArticleTags')
      td.when(saveArticleTags(inputs)).thenResolve(tags)

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          inputs,
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('articleContentsNode', () => {
    const gql = {
      query: `
        query GetArticleContentsNode($key: StorageNodeGetKeyInput!, $input: GetArticleContentsNodeInput!) {
          articleContentsNode(key: $key, input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    function newArticleNodes(user: UserIdClaims) {
      const articleRootPath = StorageService.toArticleRootPath(user)
      const bundlePath = `${articleRootPath}/${StorageSchema.generateId()}`
      const art1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateId()}`, {
        article: {
          label: { ja: '記事1' },
          type: 'Article',
          sortOrder: 1,
          src: {
            ja: {
              srcContent: '# 記事1',
              searchContent: '# 記事1',
              draftContent: '記事1下書き1',
              srcTags: ['旅行'],
              draftTags: ['旅行', 'キャンプ'],
              createdAt: dayjs('2020-01-02T00:00:00.000Z'),
              updatedAt: dayjs('2020-01-02T00:00:00.000Z'),
            },
          },
        },
      })
      return { art1 }
    }

    it('疎通確認', async () => {
      const { art1 } = newArticleNodes(StorageUser())

      const input: GetArticleContentsNodeInput = {
        lang: 'ja',
        contentTypes: ['Src', 'Draft'],
      }
      const getArticleContentsNode = td.replace(storageService, 'getArticleContentsNode')
      td.when(getArticleContentsNode(StorageUserToken(), { id: art1.id }, input)).thenResolve(art1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            key: { id: art1.id },
            input,
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.articleContentsNode).toEqual(toGQLResponse(art1))
    })

    it('サインインしていない場合', async () => {
      const { art1 } = newArticleNodes(StorageUser())

      const input: GetArticleContentsNodeInput = {
        lang: 'ja',
        contentTypes: ['Src', 'Draft'],
      }

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          key: { id: art1.id },
          input,
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userArticleList', () => {
    const gql = {
      query: `
        query GetUserArticleList($input: GetUserArticleListInput!, $paging: PagingInput) {
          userArticleList(input: $input, paging: $paging) {
            ... on PagingFirstResult {
              list {
                ... on ArticleListItem {
                  ...${ArticleListItemFieldsName}
                }
              }
              token
              pageSegments
              pageSize
              pageNum
              totalPages
              totalItems
              maxItems
            }
            ... on PagingAfterResult {
              list {
                ... on ArticleListItem {
                  ...${ArticleListItemFieldsName}
                }
              }
              isPagingTimeout
            }
          }
        }
        ${ArticleListItemFields}
      `,
    }

    function createTestData() {
      function newArticleListItem(lang: LangCode, nodePath: string, hierarchicalNodes: StorageNode[]): ArticleListItem {
        const nodeDict = arrayToDict(hierarchicalNodes, 'path')
        const node = nodeDict[nodePath]
        const now = dayjs()

        return {
          id: node.id,
          name: node.name,
          dir: StorageService.toArticlePathDetails(lang, node.dir, hierarchicalNodes),
          path: StorageService.toArticlePathDetails(lang, node.path, hierarchicalNodes),
          label: StorageService.getArticleLangLabel(lang, node.article!.label!),
          tags: node.article?.src?.[lang]?.srcTags ?? [],
          content: undefined,
          createdAt: now,
          updatedAt: now,
        }
      }

      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const blog = h.newDirNode(`${articleRootPath}/${StorageSchema.generateId()}`, {
        article: {
          type: 'ListBundle',
          label: { ja: 'ツリーバンドル1' },
          sortOrder: 1,
        },
      })
      const art1 = h.newDirNode(`${blog.path}/${StorageSchema.generateId()}`, {
        article: {
          type: 'Article',
          label: { ja: '記事1' },
          sortOrder: 1,
          src: {
            ja: {
              srcTags: ['旅行'],
            },
          },
        },
      })

      const allNodes = [blog, art1]
      return {
        blog: newArticleListItem('ja', blog.path, allNodes),
        art1: newArticleListItem('ja', art1.path, allNodes),
      }
    }

    it('疎通確認 - 初回', async () => {
      const { blog, art1 } = createTestData()
      const input: GetUserArticleListInput = {
        lang: 'ja',
        articleDirId: blog.id,
      }
      const original: PagingFirstResult = {
        list: [art1],
        token: 'abcdefg',
        pageSegments: [{ size: 1 }],
        pageSize: 10,
        pageNum: 1,
        totalPages: 1,
        totalItems: 1,
        maxItems: 1,
      }

      const getUserArticleList = td.replace(storageService, 'getUserArticleList')
      td.when(
        getUserArticleList(StorageUserToken(), input, {
          pageSize: original.pageSize,
        })
      ).thenResolve(original)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            paging: { pageSize: original.pageSize },
          },
        },
        { headers: StorageUserHeader() }
      )
      const actual: PagingFirstResult = response.body.data.userArticleList

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.token).toBe(original.token)
      expect(actual.pageSegments).toEqual(compressToBase64(JSON.stringify(original.pageSegments)))
      expect(actual.pageNum).toBe(original.pageNum)
      expect(actual.pageSize).toBe(original.pageSize)
      expect(actual.totalPages).toBe(original.totalPages)
      expect(actual.totalItems).toBe(original.totalItems)
      expect(actual.maxItems).toBe(original.maxItems)
    })

    it('疎通確認 - 2回目以降', async () => {
      const { blog, art1 } = createTestData()
      const input: GetUserArticleListInput = {
        lang: 'ja',
        articleDirId: blog.id,
      }
      const original: PagingAfterResult = {
        list: [art1],
      }

      const getUserArticleList = td.replace(storageService, 'getUserArticleList')
      td.when(
        getUserArticleList(StorageUserToken(), input, {
          pageSize: 10,
        })
      ).thenResolve(original)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            paging: { pageSize: 10 },
          },
        },
        { headers: StorageUserHeader() }
      )
      const actual: PagingAfterResult = response.body.data.userArticleList

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.isPagingTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const { blog, art1 } = createTestData()
      const input: GetUserArticleListInput = {
        lang: 'ja',
        articleDirId: blog.id,
      }
      const original: PagingFirstResult = {
        list: [art1],
        token: 'abcdefg',
        pageSegments: [{ size: 1 }],
        pageSize: 10,
        pageNum: 1,
        totalPages: 1,
        totalItems: 1,
        maxItems: 1,
      }

      const getUserArticleList = td.replace(storageService, 'getUserArticleList')
      td.when(
        getUserArticleList(undefined, input, {
          pageSize: original.pageSize,
        })
      ).thenResolve(original)

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input,
          paging: { pageSize: original.pageSize },
        },
      })
      const actual: PagingFirstResult = response.body.data.userArticleList

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.token).toBe(original.token)
      expect(actual.pageSegments).toEqual(compressToBase64(JSON.stringify(original.pageSegments)))
      expect(actual.pageNum).toBe(original.pageNum)
      expect(actual.pageSize).toBe(original.pageSize)
      expect(actual.totalPages).toBe(original.totalPages)
      expect(actual.totalItems).toBe(original.totalItems)
    })
  })

  describe('userArticleTableOfContents', () => {
    const gql = {
      query: `
        query GetUserArticleTableOfContents($input: GetUserArticleTableOfContentsInput!) {
          userArticleTableOfContents(input: $input) {
            ...${ArticleTableOfContentsItemFieldsName}
          }
        }
        ${ArticleTableOfContentsItemFields}
      `,
    }

    function createTestData() {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const treeBundle = h.newDirNode(`${articleRootPath}/${StorageSchema.generateId()}`, {
        article: {
          type: 'TreeBundle',
          label: { ja: 'ツリーバンドル1' },
          sortOrder: 1,
        },
      })
      const cat1 = h.newDirNode(`${treeBundle.path}/${StorageSchema.generateId()}`, {
        article: {
          type: 'Category',
          label: { ja: 'カテゴリ1' },
          sortOrder: 2,
        },
      })
      const art1 = h.newDirNode(`${cat1.path}/${StorageSchema.generateId()}`, {
        article: {
          type: 'Article',
          label: { ja: '記事1' },
          sortOrder: 1,
        },
      })

      const allNodes = [treeBundle, cat1, art1]
      return {
        treeBundle: newTableOfContentsItems('ja', treeBundle.path, allNodes),
        cat1: newTableOfContentsItems('ja', cat1.path, allNodes),
        art1: newTableOfContentsItems('ja', art1.path, allNodes),
      }
    }

    function newTableOfContentsItems(lang: LangCode, nodePath: string, hierarchicalNodes: StorageNode[]): ArticleTableOfContentsItem {
      const nodeDict = arrayToDict(hierarchicalNodes, 'path')
      const node = nodeDict[nodePath]

      return {
        id: node.id,
        type: node.article!.type,
        name: node.name,
        dir: StorageService.toArticlePathDetails(lang, node.dir, hierarchicalNodes),
        path: StorageService.toArticlePathDetails(lang, node.path, hierarchicalNodes),
        label: StorageService.getArticleLangLabel(lang, node.article!.label!),
        sortOrder: node.article!.sortOrder,
      }
    }

    it('疎通確認', async () => {
      const { treeBundle, cat1, art1 } = createTestData()

      const getUserArticleTableOfContents = td.replace(storageService, 'getUserArticleTableOfContents')
      td.when(
        getUserArticleTableOfContents(StorageUserToken(), {
          lang: 'ja',
          userName: StorageUser().userName,
        })
      ).thenResolve([treeBundle, cat1, art1])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input: { lang: 'ja', userName: StorageUser().userName },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.userArticleTableOfContents).toEqual(toGQLResponse([treeBundle, cat1, art1]))
    })

    it('サインインしていない場合', async () => {
      const { treeBundle, cat1, art1 } = createTestData()

      const getUserArticleTableOfContents = td.replace(storageService, 'getUserArticleTableOfContents')
      td.when(
        getUserArticleTableOfContents(undefined, {
          lang: 'ja',
          userName: StorageUser().userName,
        })
      ).thenResolve([treeBundle, cat1, art1])

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input: { lang: 'ja', userName: StorageUser().userName },
        },
      })

      expect(response.body.data.userArticleTableOfContents).toEqual(toGQLResponse([treeBundle, cat1, art1]))
    })
  })

  describe('searchArticleList', () => {
    const gql = {
      query: `
        query SearchArticleList($criteria: String!, $paging: PagingInput) {
          searchArticleList(criteria: $criteria, paging: $paging) {
            ... on PagingFirstResult {
              list {
                ... on ArticleListItem {
                  ...${ArticleListItemFieldsName}
                }
              }
              token
              pageSegments
              pageSize
              pageNum
              totalPages
              totalItems
              maxItems
            }
            ... on PagingAfterResult {
              list {
                ... on ArticleListItem {
                  ...${ArticleListItemFieldsName}
                }
              }
              isPagingTimeout
            }
          }
        }
        ${ArticleListItemFields}
      `,
    }

    function createTestData() {
      function newArticleListItem(
        lang: LangCode,
        hierarchicalNodes: StorageNode[],
        node: StorageNode,
        highlight: { label: string; tags: string[]; content: string }
      ): ArticleListItem {
        const now = dayjs()
        return {
          id: node.id,
          name: node.name,
          dir: StorageService.toArticlePathDetails(lang, node.dir, hierarchicalNodes),
          path: StorageService.toArticlePathDetails(lang, node.path, hierarchicalNodes),
          ...highlight,
          createdAt: now,
          updatedAt: now,
        }
      }

      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const blog = h.newDirNode(`${articleRootPath}/${StorageSchema.generateId()}`, {
        article: {
          type: 'ListBundle',
          label: { ja: 'リストバンドル1' },
          sortOrder: 1,
        },
      })
      const art1 = h.newDirNode(`${blog.path}/${StorageSchema.generateId()}`, {
        article: {
          type: 'Article',
          label: { ja: '「ドラゴンボール」の感想' },
          sortOrder: 1,
        },
      })

      const allNodes = [blog, art1]

      return {
        comic1: newArticleListItem('ja', allNodes, art1, {
          label: '「==ドラゴン==ボール」の感想',
          tags: ['少年==漫画==', '冒険', 'バトル'],
          content: '概要 鳥山明による日本の==漫画==作品とその作中に登場するアイテムの名称。',
        }),
      }
    }

    it('疎通確認 - 初回', async () => {
      const { comic1 } = createTestData()
      const criteria = `lan:ja user:test.general 漫画 ドラゴン`
      const paging: PagingInput = { pageSize: 10 }
      const original: PagingFirstResult = {
        list: [comic1],
        token: 'abcdefg',
        pageSegments: [{ size: 10 }, { size: 1, from: 10 }],
        pageSize: paging.pageSize!,
        pageNum: 1,
        totalPages: 1,
        totalItems: 1,
        maxItems: 1,
      }

      const searchArticleList = td.replace(storageService, 'searchArticleList')
      td.when(searchArticleList(StorageUserToken(), criteria, paging)).thenResolve(original)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { criteria, paging },
        },
        { headers: StorageUserHeader() }
      )
      const actual: PagingFirstResult = response.body.data.searchArticleList

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.token).toBe(original.token)
      expect(actual.pageSegments).toEqual(compressToBase64(JSON.stringify(original.pageSegments)))
      expect(actual.pageNum).toBe(original.pageNum)
      expect(actual.pageSize).toBe(original.pageSize)
      expect(actual.totalPages).toBe(original.totalPages)
      expect(actual.totalItems).toBe(original.totalItems)
      expect(actual.maxItems).toBe(original.maxItems)
    })

    it('疎通確認 - 2回目以降', async () => {
      const { comic1 } = createTestData()
      const criteria = `lan:ja user:test.general 漫画 ドラゴン`
      const paging: PagingInput = { pageSegment: { size: 1, from: 10 } }
      const original: PagingAfterResult = {
        list: [comic1],
      }

      const searchArticleList = td.replace(storageService, 'searchArticleList')
      td.when(searchArticleList(StorageUserToken(), criteria, paging)).thenResolve(original)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { criteria, paging },
        },
        { headers: StorageUserHeader() }
      )
      const actual: PagingAfterResult = response.body.data.searchArticleList

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.isPagingTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const { comic1 } = createTestData()
      const criteria = `lan:ja user:test.general 漫画 ドラゴン`
      const paging: PagingInput = { pageSize: 10 }
      const original: PagingFirstResult = {
        list: [comic1],
        token: 'abcdefg',
        pageSegments: [{ size: 10 }, { size: 1, from: 10 }],
        pageSize: paging.pageSize!,
        pageNum: 1,
        totalPages: 1,
        totalItems: 1,
        maxItems: 1,
      }

      const searchArticleList = td.replace(storageService, 'searchArticleList')
      td.when(searchArticleList(undefined, criteria, paging)).thenResolve(original)

      const response = await requestGQL(app, {
        ...gql,
        variables: { criteria, paging },
      })
      const actual: PagingFirstResult = response.body.data.searchArticleList

      expect(actual.list).toEqual(toGQLResponse(original.list))
      expect(actual.token).toBe(original.token)
      expect(actual.pageSegments).toEqual(compressToBase64(JSON.stringify(original.pageSegments)))
      expect(actual.pageNum).toBe(original.pageNum)
      expect(actual.pageSize).toBe(original.pageSize)
      expect(actual.totalPages).toBe(original.totalPages)
      expect(actual.totalItems).toBe(original.totalItems)
      expect(actual.maxItems).toBe(original.maxItems)
    })
  })

  describe('suggestArticleTags', () => {
    const gql = {
      query: `
        query SuggestArticleTags($keyword: String!) {
          suggestArticleTags(keyword: $keyword) {
            ...${ArticleTagFieldsName}
          }
        }
        ${ArticleTagFields}
      `,
    }

    it('疎通確認', async () => {
      const tags = [h.newArticleTag('旅行'), h.newArticleTag('旅客機')]

      const keyword = '旅'
      const suggestArticleTags = td.replace(storageService, 'suggestArticleTags')
      td.when(suggestArticleTags(keyword)).thenResolve(tags)

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          keyword,
        },
      })

      expect(response.body.data.suggestArticleTags).toEqual(toGQLResponse(tags))
    })
  })
})
