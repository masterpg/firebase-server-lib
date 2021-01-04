import * as td from 'testdouble'
import {
  AppAdminUser,
  AppAdminUserHeader,
  AppStorageTestHelper,
  AppStorageTestService,
  GeneralUser,
  GeneralUserHeader,
  StorageUserHeader,
  StorageUserToken,
  getGQLErrorStatus,
  requestGQL,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
} from '../../../../../../helpers/app'
import {
  AppStorageService,
  AppStorageServiceDI,
  CreateArticleTypeDirInput,
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  SignedUploadUrlInput,
  StorageArticleNodeType,
  StorageNodeGetKeyInput,
  StorageNodeGetKeysInput,
  StorageNodeKeyInput,
  StorageNodeShareSettings,
  StoragePaginationResult,
} from '../../../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import Lv1GQLContainerModule from '../../../../../../../src/app/gql/main/lv1'
import { config } from '../../../../../../../src/config'
import { initApp } from '../../../../../../../src/app/base'

jest.setTimeout(5000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const InitialShareSettings: StorageNodeShareSettings = {
  isPublic: false,
  readUIds: ['ichiro', 'jiro'],
  writeUIds: [],
}

//========================================================================
//
//  Tests
//
//========================================================================

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  await devUtilsService.setTestFirebaseUsers(AppAdminUser(), GeneralUser())
})

describe('Lv1 Storage Resolver', () => {
  let app: any
  let storageService: AppStorageTestService
  let h!: AppStorageTestHelper

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [Lv1GQLContainerModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()
    storageService = module.get<AppStorageTestService>(AppStorageServiceDI.symbol)
    h = new AppStorageTestHelper(storageService)
  })

  describe('storageNode', () => {
    const gql = {
      query: `
        query GetStorageNode($input: StorageNodeGetKeyInput!) {
          storageNode(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    describe('パス検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = h.newDirNode('d1')
        const input: StorageNodeGetKeyInput = { path: d1.path }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ path: d1.path })).thenResolve(d1)

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

      it('疎通確認 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
        const d1 = h.newDirNode(`${userRootPath}/d1`)
        const input: StorageNodeGetKeyInput = { path: d1.path }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ path: d1.path })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
      })

      it('疎通確認 - 結果が空だった場合', async () => {
        const d1 = h.newDirNode(`d1`)
        const input: StorageNodeGetKeyInput = { path: d1.path }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ path: d1.path })).thenResolve(undefined)

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

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = h.newDirNode(`d1`)
        const input: StorageNodeGetKeyInput = { path: d1.path }

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('アクセス権限がない場合 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
        const d1 = h.newDirNode(`${userRootPath}/d1`)
        const input: StorageNodeGetKeyInput = { path: d1.path }

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: GeneralUserHeader() }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })

    describe('ID検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = h.newDirNode('d1')
        const input: StorageNodeGetKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(d1)

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

      it('疎通確認 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
        const d1 = h.newDirNode(`${userRootPath}/d1`)
        const input: StorageNodeGetKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
      })

      it('疎通確認 - 結果が空だった場合', async () => {
        const d1 = h.newDirNode(`d1`)
        const input: StorageNodeGetKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(undefined)

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

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = h.newDirNode(`d1`)
        const input: StorageNodeGetKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('アクセス権限がない場合 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
        const d1 = h.newDirNode(`${userRootPath}/d1`)
        const input: StorageNodeGetKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: GeneralUserHeader() }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })
  })

  describe('storageNodes', () => {
    const gql = {
      query: `
        query GetStorageNodes($input: StorageNodeGetKeysInput!) {
          storageNodes(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    describe('パス検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = h.newDirNode('d1')
        const input: StorageNodeGetKeysInput = { paths: [d1.path] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ paths: [d1.path] })).thenResolve([d1])

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

      it('疎通確認 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
        const d1 = h.newDirNode(`${userRootPath}/d1`)
        const input: StorageNodeGetKeysInput = { paths: [d1.path] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ paths: [d1.path] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([d1]))
      })

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = h.newDirNode(`d1`)
        const input: StorageNodeGetKeysInput = { paths: [d1.path] }

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('アクセス権限がない場合 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
        const d1 = h.newDirNode(`${userRootPath}/d1`)
        const input: StorageNodeGetKeysInput = { paths: [d1.path] }

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: GeneralUserHeader() }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })

    describe('ID検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = h.newDirNode('d1')
        const input: StorageNodeGetKeysInput = { ids: [d1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ ids: [d1.id] })).thenResolve([d1])

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

      it('疎通確認 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
        const d1 = h.newDirNode(`${userRootPath}/d1`)
        const input: StorageNodeGetKeysInput = { ids: [d1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ ids: [d1.id] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([d1]))
      })

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = h.newDirNode(`d1`)
        const input: StorageNodeGetKeysInput = { ids: [d1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ ids: [d1.id] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: StorageUserHeader() }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('アクセス権限がない場合 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
        const d1 = h.newDirNode(`${userRootPath}/d1`)
        const input: StorageNodeGetKeysInput = { ids: [d1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ ids: [d1.id] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: GeneralUserHeader() }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })
  })

  describe('storageDirDescendants', () => {
    const gql = {
      query: `
        query GetStorageDirDescendants($dirPath: String, $input: StoragePaginationInput) {
          storageDirDescendants(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
            }
            nextPageToken
            isPaginationTimeout
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const getDirDescendants = td.replace(storageService, 'getDirDescendants')
      td.when(getDirDescendants(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageDirDescendants.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirDescendants.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageDirDescendants.isPaginationTimeout).toBeNull()
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const d11 = h.newDirNode(`${userRootPath}/d1/d11`)
      const getDirDescendants = td.replace(storageService, 'getDirDescendants')
      td.when(getDirDescendants(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.storageDirDescendants.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirDescendants.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageDirDescendants.isPaginationTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageDescendants', () => {
    const gql = {
      query: `
        query GetStorageDescendants($dirPath: String, $input: StoragePaginationInput) {
          storageDescendants(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
            }
            nextPageToken
            isPaginationTimeout
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const getDescendants = td.replace(storageService, 'getDescendants')
      td.when(getDescendants(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageDescendants.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageDescendants.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageDescendants.isPaginationTimeout).toBeNull()
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const d11 = h.newDirNode(`${userRootPath}/d1/d11`)
      const getDescendants = td.replace(storageService, 'getDescendants')
      td.when(getDescendants(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.storageDescendants.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageDescendants.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageDescendants.isPaginationTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageDirChildren', () => {
    const gql = {
      query: `
        query GetStorageDirChildren($dirPath: String, $input: StoragePaginationInput) {
          storageDirChildren(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
            }
            nextPageToken
            isPaginationTimeout
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const getDirChildren = td.replace(storageService, 'getDirChildren')
      td.when(getDirChildren(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageDirChildren.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirChildren.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageDirChildren.isPaginationTimeout).toBeNull()
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const d11 = h.newDirNode(`${userRootPath}/d1/d11`)
      const getDirChildren = td.replace(storageService, 'getDirChildren')
      td.when(getDirChildren(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.storageDirChildren.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirChildren.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageDirChildren.isPaginationTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageChildren', () => {
    const gql = {
      query: `
        query GetStorageChildren($dirPath: String, $input: StoragePaginationInput) {
          storageChildren(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
            }
            nextPageToken
            isPaginationTimeout
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const getChildren = td.replace(storageService, 'getChildren')
      td.when(getChildren(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.storageChildren.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageChildren.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageChildren.isPaginationTimeout).toBeNull()
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const getChildren = td.replace(storageService, 'getChildren')
      td.when(getChildren(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.storageChildren.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageChildren.nextPageToken).toBe('abcdefg')
      expect(response.body.data.storageChildren.isPaginationTimeout).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageHierarchicalNodes', () => {
    const gql = {
      query: `
        query GetStorageHierarchicalNodes($nodePath: String!) {
          storageHierarchicalNodes(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)
      const getHierarchicalNodes = td.replace(storageService, 'getHierarchicalNodes')
      td.when(getHierarchicalNodes(fileA.path)).thenResolve([d1, d11])

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

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const d11 = h.newDirNode(`${userRootPath}/d1/d11`)
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const getHierarchicalNodes = td.replace(storageService, 'getHierarchicalNodes')
      td.when(getHierarchicalNodes(fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: StorageUserHeader() }
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

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageAncestorDirs', () => {
    const gql = {
      query: `
        query GetStorageAncestorDirs($nodePath: String!) {
          storageAncestorDirs(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)
      const d11 = h.newDirNode(`d1/d11`)
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)
      const getAncestorDirs = td.replace(storageService, 'getAncestorDirs')
      td.when(getAncestorDirs(fileA.path)).thenResolve([d1, d11])

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

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const d11 = h.newDirNode(`${userRootPath}/d1/d11`)
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const getAncestorDirs = td.replace(storageService, 'getAncestorDirs')
      td.when(getAncestorDirs(fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: StorageUserHeader() }
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

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('handleUploadedFile', () => {
    const gql = {
      query: `
        mutation HandleUploadedFile($input: StorageNodeKeyInput!) {
          handleUploadedFile(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)
      const input: StorageNodeKeyInput = { id: fileA.id, path: fileA.path }
      const handleUploadedFile = td.replace(storageService, 'handleUploadedFile')
      td.when(handleUploadedFile(input)).thenResolve(fileA)

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

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const input: StorageNodeKeyInput = { id: fileA.id, path: fileA.path }
      const handleUploadedFile = td.replace(storageService, 'handleUploadedFile')
      td.when(handleUploadedFile(input)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: StorageUserHeader() }
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

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)
      const input: StorageNodeKeyInput = { id: fileA.id, path: fileA.path }

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const input: StorageNodeKeyInput = { id: fileA.id, path: fileA.path }
      const handleUploadedFile = td.replace(storageService, 'handleUploadedFile')
      td.when(handleUploadedFile(input)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('createStorageDir', () => {
    const gql = {
      query: `
        mutation CreateStorageDir($dirPath: String!, $input: CreateStorageNodeInput) {
          createStorageDir(dirPath: $dirPath, input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`, { share: InitialShareSettings })
      const createDir = td.replace(storageService, 'createDir')
      td.when(createDir(d1.path, InitialShareSettings)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: InitialShareSettings },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.createStorageDir).toEqual(toGQLResponseStorageNode(d1))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`, { share: InitialShareSettings })
      const createDir = td.replace(storageService, 'createDir')
      td.when(createDir(d1.path, InitialShareSettings)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: InitialShareSettings },
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

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('createStorageHierarchicalDirs', () => {
    const gql = {
      query: `
        mutation CreateStorageHierarchicalDirs($dirPaths: [String!]!) {
          createStorageHierarchicalDirs(dirPaths: $dirPaths) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d11 = h.newDirNode(`d1/d11`)
      const d12 = h.newDirNode(`d1/d12`)
      const createHierarchicalDirs = td.replace(storageService, 'createHierarchicalDirs')
      td.when(createHierarchicalDirs([d11.path, d12.path])).thenResolve([d11, d12])

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

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d11 = h.newDirNode(`${userRootPath}/d1/d11`)
      const d12 = h.newDirNode(`${userRootPath}/d1/d12`)
      const createHierarchicalDirs = td.replace(storageService, 'createHierarchicalDirs')
      td.when(createHierarchicalDirs([d11.path, d12.path])).thenResolve([d11, d12])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: StorageUserHeader() }
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

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d11 = h.newDirNode(`d1/d11`)
      const d12 = h.newDirNode(`d1/d12`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d11 = h.newDirNode(`${userRootPath}/d1/d11`)
      const d12 = h.newDirNode(`${userRootPath}/d1/d12`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('removeStorageFile', () => {
    const gql = {
      query: `
        mutation RemoveStorageFile($filePath: String!) {
          removeStorageFile(filePath: $filePath) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)
      const removeFile = td.replace(storageService, 'removeFile')
      td.when(removeFile(fileA.path)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.removeStorageFile).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const removeFile = td.replace(storageService, 'removeFile')
      td.when(removeFile(fileA.path)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.removeStorageFile).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('moveStorageFile', () => {
    const gql = {
      query: `
        mutation MoveStorageFile($fromFilePath: String!, $toFilePath: String!) {
          moveStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`docs/fileA.txt`)
      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(`fileA.txt`, `docs/fileA.txt`)).thenResolve(fileA)

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

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/docs/fileA.txt`)
      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(`${userRootPath}/fileA.txt`, `${userRootPath}/docs/fileA.txt`)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `${userRootPath}/fileA.txt`, toFilePath: `${userRootPath}/docs/fileA.txt` },
        },
        { headers: StorageUserHeader() }
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

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `fileA.txt`, toFilePath: `docs/fileA.txt` },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `${userRootPath}/fileA.txt`, toFilePath: `${userRootPath}/docs/fileA.txt` },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('renameStorageFile', () => {
    const gql = {
      query: `
        mutation RenameStorageFile($filePath: String!, $newName: String!) {
          renameStorageFile(filePath: $filePath, newName: $newName) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileB = h.newFileNode(`fileB.txt`)
      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(`fileA.txt`, `fileB.txt`)).thenResolve(fileB)

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

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileB = h.newFileNode(`${userRootPath}/fileB.txt`)
      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(`${userRootPath}/fileA.txt`, `${userRootPath}/fileB.txt`)).thenResolve(fileB)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `${userRootPath}/fileA.txt`, newName: `${userRootPath}/fileB.txt` },
        },
        { headers: StorageUserHeader() }
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

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `fileA.txt`, newName: `fileB.txt` },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `${userRootPath}/fileA.txt`, newName: `${userRootPath}/fileB.txt` },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('setStorageDirShareSettings', () => {
    const gql = {
      query: `
        mutation SetStorageDirShareSettings($dirPath: String!, $input: StorageNodeShareSettingsInput!) {
          setStorageDirShareSettings(dirPath: $dirPath, input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(d1.path, InitialShareSettings)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: InitialShareSettings },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.setStorageDirShareSettings).toEqual(toGQLResponseStorageNode(d1))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(d1.path, InitialShareSettings)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: InitialShareSettings },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.setStorageDirShareSettings).toEqual(toGQLResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: InitialShareSettings },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = h.newDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: InitialShareSettings },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const d1 = h.newDirNode(`${userRootPath}/d1`)
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(d1.path, InitialShareSettings)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: InitialShareSettings },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('setStorageFileShareSettings', () => {
    const gql = {
      query: `
        mutation SetFileShareSettings($filePath: String!, $input: StorageNodeShareSettingsInput!) {
          setStorageFileShareSettings(filePath: $filePath, input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)
      const setFileShareSettings = td.replace(storageService, 'setFileShareSettings')
      td.when(setFileShareSettings(fileA.path, InitialShareSettings)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, input: InitialShareSettings },
        },
        { headers: AppAdminUserHeader() }
      )

      expect(response.body.data.setStorageFileShareSettings).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const setFileShareSettings = td.replace(storageService, 'setFileShareSettings')
      td.when(setFileShareSettings(fileA.path, InitialShareSettings)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, input: InitialShareSettings },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.setStorageFileShareSettings).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path, input: InitialShareSettings },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = h.newFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, input: InitialShareSettings },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const fileA = h.newFileNode(`${userRootPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, input: InitialShareSettings },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
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

    it('疎通確認 - アプリケーションノード', async () => {
      const inputs: SignedUploadUrlInput[] = [
        {
          id: AppStorageService.generateNodeId(),
          path: `d1/d11/fileA.txt`,
          contentType: 'text/plain',
        },
      ]
      const getSignedUploadUrls = td.replace(storageService, 'getSignedUploadUrls')
      td.when(getSignedUploadUrls(td.matchers.anything(), inputs)).thenResolve([`xxx`])

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

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const inputs: SignedUploadUrlInput[] = [
        {
          id: AppStorageService.generateNodeId(),
          path: `${userRootPath}/d1/d11/fileA.txt`,
          contentType: 'text/plain',
        },
      ]
      const getSignedUploadUrls = td.replace(storageService, 'getSignedUploadUrls')
      td.when(getSignedUploadUrls(td.matchers.anything(), inputs)).thenResolve([`xxx`])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.signedUploadUrls).toEqual([`xxx`])
    })

    it('サインインしていない場合', async () => {
      const inputs: SignedUploadUrlInput[] = [
        {
          id: AppStorageService.generateNodeId(),
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

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const inputs: SignedUploadUrlInput[] = [
        {
          id: AppStorageService.generateNodeId(),
          path: `d1/d11/fileA.txt`,
          contentType: 'text/plain',
        },
      ]

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: StorageUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.toUserRootPath(StorageUserToken())
      const inputs: SignedUploadUrlInput[] = [
        {
          id: AppStorageService.generateNodeId(),
          path: `${userRootPath}/d1/d11/fileA.txt`,
          contentType: 'text/plain',
        },
      ]

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('createArticleTypeDir', () => {
    const gql = {
      query: `
        mutation CreateArticleTypeDir($input: CreateArticleTypeDirInput!) {
          createArticleTypeDir(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const input: CreateArticleTypeDirInput = {
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      }
      const bundle = h.newDirNode(`${input.dir}/${AppStorageService.generateNodeId()}`, input)

      const createArticleTypeDir = td.replace(storageService, 'createArticleTypeDir')
      td.when(createArticleTypeDir(input)).thenResolve(bundle)

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
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const input: CreateArticleTypeDirInput = {
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      }

      const response = await requestGQL(app, {
        ...gql,
        variables: { input },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const input: CreateArticleTypeDirInput = {
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      }

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('createArticleGeneralDir', () => {
    const gql = {
      query: `
        mutation CreateArticleGeneralDir($dirPath: String!, $input: CreateStorageNodeInput) {
          createArticleGeneralDir(dirPath: $dirPath, input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const d1 = h.newDirNode(`${assetsPath}/d1`)

      const createArticleGeneralDir = td.replace(storageService, 'createArticleGeneralDir')
      td.when(createArticleGeneralDir(d1.path, InitialShareSettings)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: InitialShareSettings },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.createArticleGeneralDir).toEqual(toGQLResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const d1 = h.newDirNode(`${assetsPath}/d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const d1 = h.newDirNode(`${assetsPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('renameArticleNode', () => {
    const gql = {
      query: `
        mutation RenameArticleNode($nodePath: String!, $newName: String!) {
          renameArticleNode(nodePath: $nodePath, newName: $newName) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${AppStorageService.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 1,
      })

      const renameArticleNode = td.replace(storageService, 'renameArticleNode')
      td.when(renameArticleNode(cat1.path, cat1.articleNodeName)).thenResolve(cat1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: cat1.path, newName: cat1.articleNodeName },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.renameArticleNode).toEqual(toGQLResponseStorageNode(cat1))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${AppStorageService.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 1,
      })

      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: cat1.path, newName: cat1.articleNodeName },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${AppStorageService.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 1,
      })

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: cat1.path, newName: cat1.articleNodeName },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
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
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${AppStorageService.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 2,
      })
      const cat2 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ2',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 1,
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
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${AppStorageService.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 2,
      })
      const cat2 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ2',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 1,
      })
      const orderNodePaths = [cat1.path, cat2.path]

      const response = await requestGQL(app, {
        ...gql,
        variables: { orderNodePaths },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${AppStorageService.generateNodeId()}`
      const cat1 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 2,
      })
      const cat2 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: 'カテゴリ2',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 1,
      })
      const orderNodePaths = [cat1.path, cat2.path]

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { orderNodePaths },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('articleChildren', () => {
    const gql = {
      query: `
        query GetArticleChildren($dirPath: String!, $articleTypes: [StorageArticleNodeType!]!, $input: StoragePaginationInput) {
          articleChildren(dirPath: $dirPath, articleTypes: $articleTypes, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
            }
            nextPageToken
            isPaginationTimeout
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/${AppStorageService.generateNodeId()}`
      const art1 = h.newDirNode(`${bundlePath}/${AppStorageService.generateNodeId()}`, {
        articleNodeName: '記事1',
        articleNodeType: StorageArticleNodeType.Article,
        articleSortOrder: 1,
      })
      const getArticleChildren = td.replace(storageService, 'getArticleChildren')
      td.when(getArticleChildren(bundlePath, [StorageArticleNodeType.Article], { maxChunk: 3 })).thenResolve({
        list: [art1],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: {
            dirPath: bundlePath,
            articleTypes: [StorageArticleNodeType.Article],
            input: { maxChunk: 3 },
          },
        },
        { headers: StorageUserHeader() }
      )

      expect(response.body.data.articleChildren.list).toEqual(toGQLResponseStorageNodes([art1]))
      expect(response.body.data.articleChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/blog`

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: bundlePath, articleTypes: [StorageArticleNodeType.Article], input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(StorageUserToken())
      const bundlePath = `${articleRootPath}/blog`

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: bundlePath, articleTypes: [StorageArticleNodeType.Article], input: { maxChunk: 3 } },
        },
        { headers: GeneralUserHeader() }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })
})
