import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  AppAdminUserToken,
  ArticleTableOfContentsNodeFields,
  ArticleTableOfContentsNodeFieldsName,
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
  toGQLResponseArticleTableOfContentsNodes,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
} from '../../../../../../helpers/app'
import {
  CreateArticleTypeDirInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  GetArticleChildrenInput,
  SignedUploadUrlInput,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeKeyInput,
  StorageNodeShareDetail,
  StoragePaginationResult,
  StorageSchema,
  StorageService,
  StorageServiceDI,
  UserIdClaims,
} from '../../../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import Lv1GQLContainerModule from '../../../../../../../src/app/gql/main/lv1'
import { config } from '../../../../../../../src/config'
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
        query GetStorageNodes($input: StorageNodeGetKeysInput!) {
          storageNodes(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    describe('ベーシックケース', () => {
      it('疎通確認', async () => {
        const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
        const bundle = h.newDirNode(`${articleRootPath}/${StorageSchema.generateNodeId()}`, {
          article: {
            dir: {
              name: `リストバンドル`,
              type: 'ListBundle',
              sortOrder: 1,
            },
          },
        })
        const art1 = h.newDirNode(`${bundle.path}/${StorageSchema.generateNodeId()}`, {
          article: {
            dir: {
              name: '記事1',
              type: 'Article',
              sortOrder: 1,
            },
          },
        })
        const art1_master = h.newDirNode(`${art1.path}/${config.storage.article.masterSrcFileName}`, {
          article: { file: { type: 'Master' } },
        })
        const art1_draft = h.newDirNode(`${art1.path}/${config.storage.article.draftSrcFileName}`, {
          article: { file: { type: 'Draft' } },
        })

        const input: StorageNodeGetKeysInput = { ids: [bundle.id, art1.id, art1_master.id, art1_draft.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes(StorageUserToken(), input)).thenResolve([bundle, art1, art1_master, art1_draft])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([bundle, art1, art1_master, art1_draft]))
      })
    })
  })

  describe('storageNode', () => {
    const gql = {
      query: `
        query GetStorageNode($input: StorageNodeGetKeyInput!) {
          storageNode(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode('d1')
      const input: StorageNodeGetKeyInput = { path: d1.path }

      const getNode = td.replace(storageService, 'getNode')
      td.when(getNode(AppAdminUserToken(), { path: d1.path })).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const input: StorageNodeGetKeyInput = { path: d1.path }

      const getNode = td.replace(storageService, 'getNode')
      td.when(getNode(AppAdminUserToken(), { path: d1.path })).thenResolve(undefined)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageNode).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const input: StorageNodeGetKeyInput = { path: d1.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: { input },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageNodes', () => {
    const gql = {
      query: `
        query GetStorageNodes($input: StorageNodeGetKeysInput!) {
          storageNodes(input: $input) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode('d1')
      const input: StorageNodeGetKeysInput = { paths: [d1.path] }

      const getNodes = td.replace(storageService, 'getNodes')
      td.when(getNodes(AppAdminUserToken(), { paths: [d1.path] })).thenResolve([d1])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([d1]))
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode('d1')
      const input: StorageNodeGetKeysInput = { paths: [d1.path] }

      const response = await requestGQL(app, {
        ...gql,
        variables: { input },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageDescendants', () => {
    const gql = {
      query: `
        query GetStorageDescendants($input: StorageNodeGetUnderInput!, $pagination: StoragePaginationInput) {
          storageDescendants(input: $input, pagination: $pagination) {
            list {
              ...${StorageNodeFieldsName}
            }
            nextPageToken
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
      td.when(getDescendants(AppAdminUserToken(), input, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            pagination: { maxChunk: 3 },
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageDescendants.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDescendants.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageDescendants.isPaginationTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const input = { path: d1.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input,
          pagination: { maxChunk: 3 },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('storageChildren', () => {
    const gql = {
      query: `
        query GetStorageChildren($input: StorageNodeGetUnderInput!, $pagination: StoragePaginationInput) {
          storageChildren(input: $input, pagination: $pagination) {
            list {
              ...${StorageNodeFieldsName}
            }
            nextPageToken
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
      td.when(getChildren(AppAdminUserToken(), input, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      })

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            input,
            pagination: { maxChunk: 3 },
          },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageChildren.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageChildren.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageChildren.isPaginationTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)
      const input = { path: d1.path }

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input,
          pagination: { maxChunk: 3 },
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
        mutation CreateStorageDir($dirPath: String!, $options: CreateStorageNodeOptions) {
          createStorageDir(dirPath: $dirPath, options: $options) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const d1 = h.newDirNode(`d1`, { share: InitialShareDetail })

      const createDir = td.replace(storageService, 'createDir')
      td.when(createDir(AppAdminUserToken(), d1.path, { share: InitialShareDetail })).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { share: InitialShareDetail } },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.createStorageDir).toEqual(toGQLResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('createStorageHierarchicalDirs', () => {
    const gql = {
      query: `
        mutation CreateStorageHierarchicalDirs($dirPaths: [String!]!) {
          createStorageHierarchicalDirs(dirPaths: $dirPaths) {
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
          variables: { dirPaths: [d11.path, d12.path] },
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
        variables: { dirPaths: [d11.path, d12.path] },
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
        mutation MoveStorageFile($fromFilePath: String!, $toFilePath: String!) {
          moveStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const fileA = h.newFileNode(`docs/fileA.txt`)

      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(AppAdminUserToken(), `fileA.txt`, `docs/fileA.txt`)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `fileA.txt`, toFilePath: `docs/fileA.txt` },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.moveStorageFile).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { fromFilePath: `fileA.txt`, toFilePath: `docs/fileA.txt` },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameStorageFile', () => {
    const gql = {
      query: `
        mutation RenameStorageFile($filePath: String!, $newName: String!) {
          renameStorageFile(filePath: $filePath, newName: $newName) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const fileB = h.newFileNode(`fileB.txt`)

      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(AppAdminUserToken(), `fileA.txt`, `fileB.txt`)).thenResolve(fileB)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `fileA.txt`, newName: `fileB.txt` },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.renameStorageFile).toEqual(toGQLResponseStorageNode(fileB))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: `fileA.txt`, newName: `fileB.txt` },
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
          id: StorageSchema.generateNodeId(),
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
          id: StorageSchema.generateNodeId(),
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
        mutation CreateArticleTypeDir($input: CreateArticleTypeDirInput!, $options: CreateStorageNodeOptions) {
          createArticleTypeDir(input: $input, options: $options) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const input: CreateArticleTypeDirInput = {
        dir: `${articleRootPath}`,
        name: 'バンドル',
        type: 'ListBundle',
      }
      const bundle = h.newDirNode(`${input.dir}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: input.name,
            type: input.type,
            sortOrder: 1,
          },
        },
      })

      const createArticleTypeDir = td.replace(storageService, 'createArticleTypeDir')
      td.when(createArticleTypeDir(StorageUserToken(), input, { share: InitialShareDetail })).thenResolve(bundle)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input, options: { share: InitialShareDetail } },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.createArticleTypeDir).toEqual(toGQLResponseStorageNode(bundle))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const input: CreateArticleTypeDirInput = {
        dir: `${articleRootPath}`,
        name: 'バンドル',
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
        mutation CreateArticleGeneralDir($dirPath: String!, $options: CreateStorageNodeOptions) {
          createArticleGeneralDir(dirPath: $dirPath, options: $options) {
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
      td.when(createArticleGeneralDir(StorageUserToken(), d1.path, { share: InitialShareDetail })).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { share: InitialShareDetail } },
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
        variables: { dirPath: d1.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameArticleDir', () => {
    const gql = {
      query: `
        mutation RenameArticleDir($dirPath: String!, $newName: String!) {
          renameArticleDir(dirPath: $dirPath, newName: $newName) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${StorageSchema.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: 'カテゴリ1',
            type: 'Category',
            sortOrder: 1,
          },
        },
      })

      const renameArticleDir = td.replace(storageService, 'renameArticleDir')
      td.when(renameArticleDir(StorageUserToken(), cat1.path, cat1.article!.dir!.name)).thenResolve(cat1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: cat1.path, newName: cat1.article?.dir?.name },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.renameArticleDir).toEqual(toGQLResponseStorageNode(cat1))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${StorageSchema.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: 'カテゴリ1',
            type: 'Category',
            sortOrder: 1,
          },
        },
      })

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: cat1.path, newName: cat1.article?.dir?.name },
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
      const bundlePath = `${articleRootPath}/${StorageSchema.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: 'カテゴリ1',
            type: 'Category',
            sortOrder: 2,
          },
        },
      })
      const cat2 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: 'カテゴリ2',
            type: 'Category',
            sortOrder: 1,
          },
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
      const bundlePath = `${articleRootPath}/${StorageSchema.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: 'カテゴリ1',
            type: 'Category',
            sortOrder: 2,
          },
        },
      })
      const cat2 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: 'カテゴリ2',
            type: 'Category',
            sortOrder: 1,
          },
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

  describe('saveArticleMasterSrcFile', () => {
    const gql = {
      query: `
        mutation SaveArticleMasterSrcFile($articleDirPath: String!, $srcContent: String!, $textContent: String!) {
          saveArticleMasterSrcFile(articleDirPath: $articleDirPath, srcContent: $srcContent, textContent: $textContent) {
            master {
              ...${StorageNodeFieldsName}
            }
            draft {
              ...${StorageNodeFieldsName}
            }
          }
        }
        ${StorageNodeFields}
      `,
    }

    function newArticleNodes(user: UserIdClaims) {
      const articleRootPath = StorageService.toArticleRootPath(user)
      const bundlePath = `${articleRootPath}/${StorageSchema.generateNodeId()}`
      const art1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: '記事1',
            type: 'Article',
            sortOrder: 1,
          },
        },
      })
      const art1_master = h.newFileNode(StorageService.toArticleSrcMasterPath(art1.path), {
        article: { file: { type: 'Master' } },
      })
      const art1_draft = h.newFileNode(StorageService.toArticleSrcMasterPath(art1.path), {
        article: { file: { type: 'Master' } },
      })
      return { art1, art1_master, art1_draft }
    }

    it('疎通確認', async () => {
      const { art1_master, art1_draft } = newArticleNodes(StorageUserToken())
      const articleDirPath = art1_draft.dir
      const srcContent = '# header1'
      const textContent = 'header1'

      const saveArticleMasterSrcFile = td.replace(storageService, 'saveArticleMasterSrcFile')
      td.when(saveArticleMasterSrcFile(StorageUserToken(), articleDirPath, srcContent, textContent)).thenResolve({
        master: art1_master,
        draft: art1_draft,
      })

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { articleDirPath, srcContent, textContent },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleMasterSrcFile).toEqual({
        master: toGQLResponseStorageNode(art1_master),
        draft: toGQLResponseStorageNode(art1_draft),
      })
    })

    it('サインインしていない場合', async () => {
      const { art1_draft } = newArticleNodes(StorageUserToken())
      const articleDirPath = art1_draft.dir
      const srcContent = '# header1'
      const textContent = 'header1'

      const response = await requestGQL(app, {
        ...gql,
        variables: { articleDirPath, srcContent, textContent },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('saveArticleDraftSrcFile', () => {
    const gql = {
      query: `
        mutation SaveArticleDraftSrcFile($articleDirPath: String!, $srcContent: String) {
          saveArticleDraftSrcFile(articleDirPath: $articleDirPath, srcContent: $srcContent) {
            ...${StorageNodeFieldsName}
          }
        }
        ${StorageNodeFields}
      `,
    }

    function newArticleNodes(user: UserIdClaims) {
      const articleRootPath = StorageService.toArticleRootPath(user)
      const bundlePath = `${articleRootPath}/${StorageSchema.generateNodeId()}`
      const art1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: '記事1',
            type: 'Article',
            sortOrder: 1,
          },
        },
      })
      const art1_master = h.newFileNode(StorageService.toArticleSrcMasterPath(art1.path), {
        article: { file: { type: 'Master' } },
      })
      const art1_draft = h.newFileNode(StorageService.toArticleSrcDraftPath(art1.path), {
        article: { file: { type: 'Draft' } },
      })
      return { art1, art1_master, art1_draft }
    }

    it('疎通確認', async () => {
      const { art1_draft } = newArticleNodes(StorageUserToken())
      const articleDirPath = art1_draft.dir
      const srcContent = '# header1'

      const saveArticleDraftSrcFile = td.replace(storageService, 'saveArticleDraftSrcFile')
      td.when(saveArticleDraftSrcFile(StorageUserToken(), articleDirPath, srcContent)).thenResolve(art1_draft)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { articleDirPath, srcContent },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleDraftSrcFile).toEqual(toGQLResponseStorageNode(art1_draft))
    })

    it('疎通確認 - srcContentにnullを指定した場合', async () => {
      const { art1_draft } = newArticleNodes(StorageUserToken())
      const articleDirPath = art1_draft.dir
      const srcContent = null

      const saveArticleDraftSrcFile = td.replace(storageService, 'saveArticleDraftSrcFile')
      td.when(saveArticleDraftSrcFile(StorageUserToken(), articleDirPath, srcContent)).thenResolve(art1_draft)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { articleDirPath, srcContent: null },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.saveArticleDraftSrcFile).toEqual(toGQLResponseStorageNode(art1_draft))
    })

    it('サインインしていない場合', async () => {
      const { art1_draft } = newArticleNodes(StorageUserToken())
      const articleDirPath = art1_draft.dir
      const srcContent = 'test'

      const response = await requestGQL(app, {
        ...gql,
        variables: { articleDirPath, srcContent },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('articleChildren', () => {
    const gql = {
      query: `
        query GetArticleChildren($input: GetArticleChildrenInput!, $pagination: StoragePaginationInput) {
          articleChildren(input: $input, pagination: $pagination) {
            list {
              ...${StorageNodeFieldsName}
            }
            nextPageToken
            isPaginationTimeout
          }
        }
        ${StorageNodeFields}
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${StorageSchema.generateNodeId()}`
      const art1 = h.newDirNode(`${bundlePath}/${StorageSchema.generateNodeId()}`, {
        article: {
          dir: {
            name: '記事1',
            type: 'Article',
            sortOrder: 1,
          },
        },
      })

      const input: GetArticleChildrenInput = { dirPath: bundlePath, types: ['Article'] }
      const pagination = { maxChunk: 3 }
      const getArticleChildren = td.replace(storageService, 'getArticleChildren')
      td.when(getArticleChildren(input, pagination)).thenResolve({
        list: [art1],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input, pagination },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.articleChildren.list).toEqual(toGQLResponseStorageNodes([art1]))
      expect(response.body.data.articleChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/blog`

      const response = await requestGQL(app, {
        ...gql,
        variables: {
          input: { dirPath: bundlePath, types: ['Article'] },
          pagination: { maxChunk: 3 },
        },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('articleTableOfContents', () => {
    const gql = {
      query: `
        query GetArticleTableOfContents($userName: String!) {
          articleTableOfContents(userName: $userName) {
            ...${ArticleTableOfContentsNodeFieldsName}
          }
        }
        ${ArticleTableOfContentsNodeFields}
      `,
    }

    function createTestData() {
      const articleRootPath = StorageService.toArticleRootPath(StorageUserToken())
      const treeBundle = h.newTableOfContentsNode(`${articleRootPath}/${StorageSchema.generateNodeId()}`, {
        type: 'TreeBundle',
        label: 'ツリーバンドル1',
      })
      const cat1 = h.newTableOfContentsNode(`${treeBundle}/${StorageSchema.generateNodeId()}`, {
        type: 'Category',
        label: 'カテゴリ1',
      })
      const art1 = h.newTableOfContentsNode(`${cat1}/${StorageSchema.generateNodeId()}`, {
        type: 'Article',
        label: '記事1',
      })
      return { treeBundle, cat1, art1 }
    }

    it('疎通確認', async () => {
      const { treeBundle, cat1, art1 } = createTestData()

      const getArticleTableOfContents = td.replace(storageService, 'getArticleTableOfContents')
      td.when(getArticleTableOfContents(StorageUser().userName, StorageUserToken())).thenResolve([treeBundle, cat1, art1])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { userName: StorageUser().userName },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.articleTableOfContents).toEqual(toGQLResponseArticleTableOfContentsNodes([treeBundle, cat1, art1]))
    })

    it('サインインしていない場合', async () => {
      const { treeBundle, cat1, art1 } = createTestData()

      const getArticleTableOfContents = td.replace(storageService, 'getArticleTableOfContents')
      td.when(getArticleTableOfContents(StorageUser().userName, undefined)).thenResolve([treeBundle, cat1, art1])

      const response = await requestGQL(app, {
        ...gql,
        variables: { userName: StorageUser().userName },
      })

      expect(response.body.data.articleTableOfContents).toEqual(toGQLResponseArticleTableOfContentsNodes([treeBundle, cat1, art1]))
    })
  })
})
