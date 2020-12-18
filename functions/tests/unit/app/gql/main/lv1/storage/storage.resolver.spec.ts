import * as td from 'testdouble'
import {
  APP_ADMIN_USER,
  APP_ADMIN_USER_HEADER,
  GENERAL_USER,
  GENERAL_USER_HEADER,
  STORAGE_USER_HEADER,
  STORAGE_USER_TOKEN,
  generateFirestoreId,
  getGQLErrorStatus,
  newAppStorageDirNode,
  newAppStorageFileNode,
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
  StorageArticleNodeType,
  StorageNodeKeyInput,
  StorageNodeKeysInput,
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

const SHARE_SETTINGS: StorageNodeShareSettings = {
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
  await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER, GENERAL_USER)
})

describe('Lv1 Storage Resolver', () => {
  let app: any
  let storageService: AppStorageServiceDI.type

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [Lv1GQLContainerModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()
    storageService = module.get<AppStorageServiceDI.type>(AppStorageServiceDI.symbol)
  })

  describe('storageNode', () => {
    const gql = {
      query: `
        query GetStorageNode($input: StorageNodeKeyInput!) {
          storageNode(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    describe('パス検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = newAppStorageDirNode('d1')
        const input: StorageNodeKeyInput = { path: d1.path }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ path: d1.path })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: APP_ADMIN_USER_HEADER }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
      })

      it('疎通確認 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeyInput = { path: d1.path }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ path: d1.path })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: STORAGE_USER_HEADER }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
      })

      it('疎通確認 - 結果が空だった場合', async () => {
        const d1 = newAppStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { path: d1.path }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ path: d1.path })).thenResolve(undefined)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: APP_ADMIN_USER_HEADER }
        )

        expect(response.body.data.storageNode).toBeNull()
      })

      it('サインインしていない場合', async () => {
        const d1 = newAppStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { path: d1.path }

        const response = await requestGQL(app, {
          ...gql,
          variables: { input },
        })

        expect(getGQLErrorStatus(response)).toBe(401)
      })

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = newAppStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { path: d1.path }

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: STORAGE_USER_HEADER }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('アクセス権限がない場合 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeyInput = { path: d1.path }

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: GENERAL_USER_HEADER }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })

    describe('ID検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = newAppStorageDirNode('d1')
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: APP_ADMIN_USER_HEADER }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
      })

      it('疎通確認 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: STORAGE_USER_HEADER }
        )

        expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
      })

      it('疎通確認 - 結果が空だった場合', async () => {
        const d1 = newAppStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(undefined)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: APP_ADMIN_USER_HEADER }
        )

        expect(response.body.data.storageNode).toBeNull()
      })

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = newAppStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: STORAGE_USER_HEADER }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('アクセス権限がない場合 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNode = td.replace(storageService, 'getNode')
        td.when(getNode({ id: d1.id })).thenResolve(d1)

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: GENERAL_USER_HEADER }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })
  })

  describe('storageNodes', () => {
    const gql = {
      query: `
        query GetStorageNodes($input: StorageNodeKeysInput!) {
          storageNodes(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    describe('パス検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = newAppStorageDirNode('d1')
        const input: StorageNodeKeysInput = { paths: [d1.path] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ paths: [d1.path] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: APP_ADMIN_USER_HEADER }
        )

        expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([d1]))
      })

      it('疎通確認 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeysInput = { paths: [d1.path] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ paths: [d1.path] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: STORAGE_USER_HEADER }
        )

        expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([d1]))
      })

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = newAppStorageDirNode(`d1`)
        const input: StorageNodeKeysInput = { paths: [d1.path] }

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: STORAGE_USER_HEADER }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('アクセス権限がない場合 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeysInput = { paths: [d1.path] }

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: GENERAL_USER_HEADER }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })
    })

    describe('ID検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = newAppStorageDirNode('d1')
        const input: StorageNodeKeysInput = { ids: [d1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ ids: [d1.id] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: APP_ADMIN_USER_HEADER }
        )

        expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([d1]))
      })

      it('疎通確認 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeysInput = { ids: [d1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ ids: [d1.id] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: STORAGE_USER_HEADER }
        )

        expect(response.body.data.storageNodes).toEqual(toGQLResponseStorageNodes([d1]))
      })

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = newAppStorageDirNode(`d1`)
        const input: StorageNodeKeysInput = { ids: [d1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ ids: [d1.id] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: STORAGE_USER_HEADER }
        )

        expect(getGQLErrorStatus(response)).toBe(403)
      })

      it('アクセス権限がない場合 - ユーザーノード', async () => {
        const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeysInput = { ids: [d1.id] }

        const getNodes = td.replace(storageService, 'getNodes')
        td.when(getNodes({ ids: [d1.id] })).thenResolve([d1])

        const response = await requestGQL(
          app,
          {
            ...gql,
            variables: { input },
          },
          { headers: GENERAL_USER_HEADER }
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
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)
      const d11 = newAppStorageDirNode(`d1/d11`)
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
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageDirDescendants.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirDescendants.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const d11 = newAppStorageDirNode(`${userRootPath}/d1/d11`)
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.storageDirDescendants.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirDescendants.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
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
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)
      const d11 = newAppStorageDirNode(`d1/d11`)
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
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageDescendants.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageDescendants.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const d11 = newAppStorageDirNode(`${userRootPath}/d1/d11`)
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.storageDescendants.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageDescendants.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
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
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)
      const d11 = newAppStorageDirNode(`d1/d11`)
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
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageDirChildren.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirChildren.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const d11 = newAppStorageDirNode(`${userRootPath}/d1/d11`)
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.storageDirChildren.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
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
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)
      const d11 = newAppStorageDirNode(`d1/d11`)
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
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageChildren.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageChildren.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const d11 = newAppStorageDirNode(`d1/d11`)
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.storageChildren.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
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
      const d1 = newAppStorageDirNode(`d1`)
      const d11 = newAppStorageDirNode(`d1/d11`)
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)
      const getHierarchicalNodes = td.replace(storageService, 'getHierarchicalNodes')
      td.when(getHierarchicalNodes(fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageHierarchicalNodes).toEqual(toGQLResponseStorageNodes([d1, d11]))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const d11 = newAppStorageDirNode(`${userRootPath}/d1/d11`)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const getHierarchicalNodes = td.replace(storageService, 'getHierarchicalNodes')
      td.when(getHierarchicalNodes(fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.storageHierarchicalNodes).toEqual(toGQLResponseStorageNodes([d1, d11]))
    })

    it('サインインしていない場合', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: GENERAL_USER_HEADER }
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
      const d1 = newAppStorageDirNode(`d1`)
      const d11 = newAppStorageDirNode(`d1/d11`)
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)
      const getAncestorDirs = td.replace(storageService, 'getAncestorDirs')
      td.when(getAncestorDirs(fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageAncestorDirs).toEqual(toGQLResponseStorageNodes([d1, d11]))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const d11 = newAppStorageDirNode(`${userRootPath}/d1/d11`)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const getAncestorDirs = td.replace(storageService, 'getAncestorDirs')
      td.when(getAncestorDirs(fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.storageAncestorDirs).toEqual(toGQLResponseStorageNodes([d1, d11]))
    })

    it('サインインしていない場合', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: fileA.path },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('handleUploadedFile', () => {
    const gql = {
      query: `
        mutation HandleUploadedFile($filePath: String!) {
          handleUploadedFile(filePath: $filePath) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)
      const handleUploadedFile = td.replace(storageService, 'handleUploadedFile')
      td.when(handleUploadedFile(fileA.path)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.handleUploadedFile).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const handleUploadedFile = td.replace(storageService, 'handleUploadedFile')
      td.when(handleUploadedFile(fileA.path)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.handleUploadedFile).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const handleUploadedFile = td.replace(storageService, 'handleUploadedFile')
      td.when(handleUploadedFile(fileA.path)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: GENERAL_USER_HEADER }
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
      const d1 = newAppStorageDirNode(`d1`, { share: SHARE_SETTINGS })
      const createDir = td.replace(storageService, 'createDir')
      td.when(createDir(d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: SHARE_SETTINGS },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.createStorageDir).toEqual(toGQLResponseStorageNode(d1))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`, { share: SHARE_SETTINGS })
      const createDir = td.replace(storageService, 'createDir')
      td.when(createDir(d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: SHARE_SETTINGS },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.createStorageDir).toEqual(toGQLResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: GENERAL_USER_HEADER }
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
      const d11 = newAppStorageDirNode(`d1/d11`)
      const d12 = newAppStorageDirNode(`d1/d12`)
      const createHierarchicalDirs = td.replace(storageService, 'createHierarchicalDirs')
      td.when(createHierarchicalDirs([d11.path, d12.path])).thenResolve([d11, d12])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.createStorageHierarchicalDirs).toEqual(toGQLResponseStorageNodes([d11, d12]))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d11 = newAppStorageDirNode(`${userRootPath}/d1/d11`)
      const d12 = newAppStorageDirNode(`${userRootPath}/d1/d12`)
      const createHierarchicalDirs = td.replace(storageService, 'createHierarchicalDirs')
      td.when(createHierarchicalDirs([d11.path, d12.path])).thenResolve([d11, d12])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.createStorageHierarchicalDirs).toEqual(toGQLResponseStorageNodes([d11, d12]))
    })

    it('サインインしていない場合', async () => {
      const d11 = newAppStorageDirNode(`d1/d11`)
      const d12 = newAppStorageDirNode(`d1/d12`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPaths: [d11.path, d12.path] },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d11 = newAppStorageDirNode(`d1/d11`)
      const d12 = newAppStorageDirNode(`d1/d12`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d11 = newAppStorageDirNode(`${userRootPath}/d1/d11`)
      const d12 = newAppStorageDirNode(`${userRootPath}/d1/d12`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: GENERAL_USER_HEADER }
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
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)
      const removeFile = td.replace(storageService, 'removeFile')
      td.when(removeFile(fileA.path)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.removeStorageFile).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const removeFile = td.replace(storageService, 'removeFile')
      td.when(removeFile(fileA.path)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.removeStorageFile).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path },
        },
        { headers: GENERAL_USER_HEADER }
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
      const fileA = newAppStorageFileNode(`docs/fileA.txt`)
      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(`fileA.txt`, `docs/fileA.txt`)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `fileA.txt`, toFilePath: `docs/fileA.txt` },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.moveStorageFile).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/docs/fileA.txt`)
      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(`${userRootPath}/fileA.txt`, `${userRootPath}/docs/fileA.txt`)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `${userRootPath}/fileA.txt`, toFilePath: `${userRootPath}/docs/fileA.txt` },
        },
        { headers: STORAGE_USER_HEADER }
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `${userRootPath}/fileA.txt`, toFilePath: `${userRootPath}/docs/fileA.txt` },
        },
        { headers: GENERAL_USER_HEADER }
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
      const fileB = newAppStorageFileNode(`fileB.txt`)
      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(`fileA.txt`, `fileB.txt`)).thenResolve(fileB)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `fileA.txt`, newName: `fileB.txt` },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.renameStorageFile).toEqual(toGQLResponseStorageNode(fileB))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileB = newAppStorageFileNode(`${userRootPath}/fileB.txt`)
      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(`${userRootPath}/fileA.txt`, `${userRootPath}/fileB.txt`)).thenResolve(fileB)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `${userRootPath}/fileA.txt`, newName: `${userRootPath}/fileB.txt` },
        },
        { headers: STORAGE_USER_HEADER }
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `${userRootPath}/fileA.txt`, newName: `${userRootPath}/fileB.txt` },
        },
        { headers: GENERAL_USER_HEADER }
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
      const d1 = newAppStorageDirNode(`d1`)
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: SHARE_SETTINGS },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.setStorageDirShareSettings).toEqual(toGQLResponseStorageNode(d1))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.setStorageDirShareSettings).toEqual(toGQLResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: SHARE_SETTINGS },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newAppStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: SHARE_SETTINGS },
        },
        { headers: GENERAL_USER_HEADER }
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
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)
      const setFileShareSettings = td.replace(storageService, 'setFileShareSettings')
      td.when(setFileShareSettings(fileA.path, SHARE_SETTINGS)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, input: SHARE_SETTINGS },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.setStorageFileShareSettings).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const setFileShareSettings = td.replace(storageService, 'setFileShareSettings')
      td.when(setFileShareSettings(fileA.path, SHARE_SETTINGS)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, input: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.setStorageFileShareSettings).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path, input: SHARE_SETTINGS },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, input: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, input: SHARE_SETTINGS },
        },
        { headers: GENERAL_USER_HEADER }
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
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)
      const inputs = [{ filePath: fileA.path, contentType: 'text/plain' }]
      const getSignedUploadUrls = td.replace(storageService, 'getSignedUploadUrls')
      td.when(getSignedUploadUrls(td.matchers.anything(), inputs)).thenResolve([`xxx`])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.signedUploadUrls).toEqual([`xxx`])
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const inputs = [{ filePath: fileA.path, contentType: 'text/plain' }]
      const getSignedUploadUrls = td.replace(storageService, 'getSignedUploadUrls')
      td.when(getSignedUploadUrls(td.matchers.anything(), inputs)).thenResolve([`xxx`])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.signedUploadUrls).toEqual([`xxx`])
    })

    it('サインインしていない場合', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)
      const inputs = [{ filePath: fileA.path, contentType: 'text/plain' }]

      const response = await requestGQL(app, {
        ...gql,
        variables: { inputs },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newAppStorageFileNode(`d1/d11/fileA.txt`)
      const inputs = [{ filePath: fileA.path, contentType: 'text/plain' }]

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = AppStorageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
      const inputs = [{ filePath: fileA.path, contentType: 'text/plain' }]

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { inputs },
        },
        { headers: GENERAL_USER_HEADER }
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const input: CreateArticleTypeDirInput = {
        dir: `${articleRootPath}`,
        articleNodeName: 'バンドル',
        articleNodeType: StorageArticleNodeType.ListBundle,
      }
      const bundle = newAppStorageDirNode(`${input.dir}/${generateFirestoreId()}`, input)

      const createArticleTypeDir = td.replace(storageService, 'createArticleTypeDir')
      td.when(createArticleTypeDir(input)).thenResolve(bundle)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { input },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.createArticleTypeDir).toEqual(toGQLResponseStorageNode(bundle))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
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
        { headers: GENERAL_USER_HEADER }
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const d1 = newAppStorageDirNode(`${assetsPath}/d1`)

      const createArticleGeneralDir = td.replace(storageService, 'createArticleGeneralDir')
      td.when(createArticleGeneralDir(d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, input: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.createArticleGeneralDir).toEqual(toGQLResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const d1 = newAppStorageDirNode(`${assetsPath}/d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const assetsPath = `${articleRootPath}/${config.storage.article.assetsName}`
      const d1 = newAppStorageDirNode(`${assetsPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path },
        },
        { headers: GENERAL_USER_HEADER }
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/${generateFirestoreId()}`
      const cat1 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.renameArticleNode).toEqual(toGQLResponseStorageNode(cat1))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/${generateFirestoreId()}`
      const cat1 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/${generateFirestoreId()}`
      const cat1 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
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
        { headers: GENERAL_USER_HEADER }
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/${generateFirestoreId()}`
      const cat1 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 2,
      })
      const cat2 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.setArticleSortOrder).toEqual(true)

      const exp = td.explain(setArticleSortOrder)
      expect(exp.calls.length).toBe(1)
      expect(exp.calls[0].args).toEqual([STORAGE_USER_TOKEN, orderNodePaths])
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/${generateFirestoreId()}`
      const cat1 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 2,
      })
      const cat2 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
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
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/${generateFirestoreId()}`
      const cat1 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
        articleNodeName: 'カテゴリ1',
        articleNodeType: StorageArticleNodeType.Category,
        articleSortOrder: 2,
      })
      const cat2 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
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
        { headers: GENERAL_USER_HEADER }
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
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/${generateFirestoreId()}`
      const art1 = newAppStorageDirNode(`${bundlePath}/${generateFirestoreId()}`, {
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
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.articleChildren.list).toEqual(toGQLResponseStorageNodes([art1]))
      expect(response.body.data.articleChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: bundlePath, articleTypes: [StorageArticleNodeType.Article], input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = AppStorageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: bundlePath, articleTypes: [StorageArticleNodeType.Article], input: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })
})
