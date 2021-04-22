import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  AppAdminUserToken,
  ArticleListItemFields,
  ArticleListItemFieldsName,
  ArticleTableOfContentsItemFields,
  ArticleTableOfContentsItemFieldsName,
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
  toGQLResponseArticleListItems,
  toGQLResponseArticleTableOfContentsItems,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
} from '../../../../../../helpers/app'
import {
  CreateArticleGeneralDirInput,
  CreateArticleTypeDirInput,
  CreateStorageDirInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  GetArticleContentsNodeInput,
  GetUserArticleListInput,
  MoveStorageFileInput,
  PaginationResult,
  RenameArticleTypeDirInput,
  RenameStorageFileInput,
  SaveArticleDraftContentInput,
  SaveArticleSrcContentInput,
  SignedUploadUrlInput,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeKeyInput,
  StorageNodeShareDetail,
  StorageSchema,
  StorageService,
  StorageServiceDI,
  UserIdClaims,
} from '../../../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import Lv1GQLContainerModule from '../../../../../../../src/app/gql/main/lv1'
import { config } from '../../../../../../../src/config'
import dayjs = require('dayjs')
import { initApp } from '../../../../../../../src/app/base'
import { pickProps } from 'web-base-lib'

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

        expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([bundle, art1]))
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

      expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
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

      expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([d1]))
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
        query GetStorageDescendants($input: StorageNodeGetUnderInput!, $pagination: PaginationInput) {
          storageDescendants(input: $input, pagination: $pagination) {
            list {
              ...${StorageNodeFieldsName}
            }
            nextPageToken
            total
            isPaginationTimeout
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const input = { path: d1.path, includeBase: true }

      const getDescendants = td.replace(storageService, 'getDescendants')
      td.when(getDescendants(AppAdminUserToken(), input, { pageSize: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
        total: 10,
      } as PaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            pagination: { pageSize: 3 },
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageDescendants.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDescendants.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageDescendants.total).toBe(10)
      expect(response.body.data.storageDescendants.isPaginationTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const input = { path: d1.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input,
          pagination: { pageSize: 3 },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageChildren', () => {
    const gql = {
      query: `
        query GetStorageChildren($input: StorageNodeGetUnderInput!, $pagination: PaginationInput) {
          storageChildren(input: $input, pagination: $pagination) {
            list {
              ...${StorageNodeFieldsName}
            }
            nextPageToken
            total
            isPaginationTimeout
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const input = { path: d1.path, includeBase: true }

      const getChildren = td.replace(storageService, 'getChildren')
      td.when(getChildren(AppAdminUserToken(), input, { pageSize: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
        total: 10,
      })

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            pagination: { pageSize: 3 },
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageChildren.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageChildren.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageChildren.total).toBe(10)
      expect(response.body.data.storageChildren.isPaginationTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const input = { path: d1.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input,
          pagination: { pageSize: 3 },
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

      expect(response.body.data.storageHierarchicalNodes).toEqual(toGQLResponseStorageNodes([d1, d11]))
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

      expect(response.body.data.storageAncestorDirs).toEqual(toGQLResponseStorageNodes([d1, d11]))
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

      expect(response.body.data.createStorageDir).toEqual(toGQLResponseStorageNode(d1))
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

      expect(response.body.data.createStorageHierarchicalDirs).toEqual(toGQLResponseStorageNodes([d11, d12]))
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

      expect(response.body.data.removeStorageFile).toEqual(toGQLResponseStorageNode(fileA))
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

      expect(response.body.data.moveStorageFile).toEqual(toGQLResponseStorageNode(fileA))
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

      expect(response.body.data.renameStorageFile).toEqual(toGQLResponseStorageNode(fileB))
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
        mutation SetStorageDirShareDetail($key: StorageNodeGetKeyInput!, $input: SetShareDetailInput!) {
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

      expect(response.body.data.setStorageDirShareDetail).toEqual(toGQLResponseStorageNode(d1))
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
        mutation SetStorageFileShareDetail($key: StorageNodeGetKeyInput!, $input: SetShareDetailInput!) {
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

      expect(response.body.data.setStorageFileShareDetail).toEqual(toGQLResponseStorageNode(fileA))
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

      expect(response.body.data.handleUploadedFile).toEqual(toGQLResponseStorageNode(fileA))
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

      expect(response.body.data.createArticleTypeDir).toEqual(toGQLResponseStorageNode(bundle))
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

      expect(response.body.data.createArticleGeneralDir).toEqual(toGQLResponseStorageNode(d1))
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

      expect(response.body.data.renameArticleTypeDir).toEqual(toGQLResponseStorageNode(cat1))
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

      const saveArticleSrcContent = td.replace(storageService, 'saveArticleSrcContent')
      td.when(
        saveArticleSrcContent(
          StorageUserToken(),
          { id: art1.id },
          {
            lang: 'ja',
            srcContent,
            searchContent,
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
            },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleSrcContent).toEqual(toGQLResponseStorageNode(art1))
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
              searchContent: '# 記事下書き1',
              draftContent: '記事1',
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
            },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleDraftContent).toEqual(toGQLResponseStorageNode(art1))
    })

    it('疎通確認 - srcContentにnullを指定した場合', async () => {
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
            },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleDraftContent).toEqual(toGQLResponseStorageNode(art1))
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
              searchContent: '# 記事下書き1',
              draftContent: '記事1',
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

      expect(response.body.data.articleContentsNode).toEqual(toGQLResponseStorageNode(art1))
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
        query GetUserArticleList($input: GetUserArticleListInput!, $pagination: PaginationInput) {
          userArticleList(input: $input, pagination: $pagination) {
            list {
              ...${ArticleListItemFieldsName}
            }
            nextPageToken
            total
          }
        }
        ${ArticleListItemFields}
      `,
    }

    function createTestData() {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const blog = h.newArticleListItem({
        path: `${articleRootPath}/${StorageSchema.generateId()}`,
        label: 'ブログ',
      })
      const art1 = h.newArticleListItem({
        path: `${blog.path}/${StorageSchema.generateId()}`,
        label: '記事1',
      })
      return { blog, art1 }
    }

    it('疎通確認', async () => {
      const { blog, art1 } = createTestData()

      const input: GetUserArticleListInput = {
        lang: 'ja',
        userName: StorageUser().userName,
        articleTypeDirId: blog.id,
      }
      const pagination = { pageSize: 3 }
      const getUserArticleList = td.replace(storageService, 'getUserArticleList')
      td.when(getUserArticleList(StorageUserToken(), input, pagination)).thenResolve({
        list: [art1],
        nextPageToken: 'abcdefg',
        total: 10,
      })

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input, pagination },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.userArticleList.list).toEqual(toGQLResponseArticleListItems([art1]))
      expect(response.body.data.userArticleList.nextPageToken).toBe('abcdefg')
      expect(response.body.data.userArticleList.total).toBe(10)
    })

    it('サインインしていない場合', async () => {
      const { blog, art1 } = createTestData()

      const input: GetUserArticleListInput = {
        lang: 'ja',
        userName: StorageUser().userName,
        articleTypeDirId: blog.id,
      }
      const pagination = { pageSize: 3 }
      const getUserArticleList = td.replace(storageService, 'getUserArticleList')
      td.when(getUserArticleList(undefined, input, pagination)).thenResolve({
        list: [art1],
        nextPageToken: 'abcdefg',
        total: 10,
      })

      const response = await requestGQL(app, {
        ...gql,
        variables: { input, pagination },
      })

      expect(response.body.data.userArticleList.list).toEqual(toGQLResponseArticleListItems([art1]))
      expect(response.body.data.userArticleList.nextPageToken).toBe('abcdefg')
      expect(response.body.data.userArticleList.total).toBe(10)
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
      const treeBundle = h.newTableOfContentsItems({
        path: `${articleRootPath}/${StorageSchema.generateId()}`,
        type: 'TreeBundle',
        label: 'ツリーバンドル1',
      })
      const cat1 = h.newTableOfContentsItems({
        path: `${treeBundle.path}/${StorageSchema.generateId()}`,
        type: 'Category',
        label: 'カテゴリ1',
      })
      const art1 = h.newTableOfContentsItems({
        path: `${cat1.path}/${StorageSchema.generateId()}`,
        type: 'Article',
        label: '記事1',
      })
      return { treeBundle, cat1, art1 }
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

      expect(response.body.data.userArticleTableOfContents).toEqual(toGQLResponseArticleTableOfContentsItems([treeBundle, cat1, art1]))
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

      expect(response.body.data.userArticleTableOfContents).toEqual(toGQLResponseArticleTableOfContentsItems([treeBundle, cat1, art1]))
    })
  })
})
