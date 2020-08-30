import * as td from 'testdouble'
import {
  APP_ADMIN_USER,
  APP_ADMIN_USER_HEADER,
  GENERAL_USER,
  GENERAL_USER_HEADER,
  STORAGE_USER_HEADER,
  STORAGE_USER_TOKEN,
} from '../../../../helpers/common/data'
import { CreateArticleDirInput, SetArticleSortOrderInput, StorageArticleNodeType, StorageServiceDI } from '../../../../../src/example/services'
import {
  DevUtilsServiceDI,
  DevUtilsServiceModule,
  StorageNodeKeyInput,
  StorageNodeShareSettings,
  StoragePaginationResult,
} from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { getGQLErrorStatus, requestGQL } from '../../../../helpers/common/gql'
import {
  newTestStorageDirNode,
  newTestStorageFileNode,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
} from '../../../../helpers/example/storage'
import GQLContainerModule from '../../../../../src/example/gql/gql.module'
import { StorageResolver } from '../../../../../src/example/gql/storage'
import { initApp } from '../../../../../src/example/base'

jest.setTimeout(25000)
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

describe('StorageResolver', () => {
  let app: any
  let storageService: StorageServiceDI.type

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [GQLContainerModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()
    storageService = module.get<StorageServiceDI.type>(StorageServiceDI.symbol)
  })

  describe('storageNode', () => {
    const gql = {
      query: `
        query GetStorageNode($input: StorageNodeKeyInput!) {
          storageNode(input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    describe('パス検索', () => {
      it('疎通確認 - アプリケーションノード', async () => {
        const d1 = newTestStorageDirNode('d1')
        const input: StorageNodeKeyInput = { path: d1.path }

        const getNodeByPath = td.replace(storageService, 'getNodeByPath')
        td.when(getNodeByPath(d1.path)).thenResolve(d1)

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
        const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeyInput = { path: d1.path }

        const getNodeByPath = td.replace(storageService, 'getNodeByPath')
        td.when(getNodeByPath(d1.path)).thenResolve(d1)

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
        const d1 = newTestStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { path: d1.path }

        const getNodeByPath = td.replace(storageService, 'getNodeByPath')
        td.when(getNodeByPath(d1.path)).thenResolve(undefined)

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
        const d1 = newTestStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { path: d1.path }

        const response = await requestGQL(app, {
          ...gql,
          variables: { input },
        })

        expect(getGQLErrorStatus(response)).toBe(401)
      })

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = newTestStorageDirNode(`d1`)
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
        const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
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
        const d1 = newTestStorageDirNode('d1')
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNodeById = td.replace(storageService, 'getNodeById')
        td.when(getNodeById(d1.id)).thenResolve(d1)

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
        const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNodeById = td.replace(storageService, 'getNodeById')
        td.when(getNodeById(d1.id)).thenResolve(d1)

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
        const d1 = newTestStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNodeById = td.replace(storageService, 'getNodeById')
        td.when(getNodeById(d1.id)).thenResolve(undefined)

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
        const d1 = newTestStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const response = await requestGQL(app, {
          ...gql,
          variables: { input },
        })

        expect(getGQLErrorStatus(response)).toBe(401)
      })

      it('アクセス権限がない場合 - アプリケーションノード', async () => {
        const d1 = newTestStorageDirNode(`d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNodeById = td.replace(storageService, 'getNodeById')
        td.when(getNodeById(d1.id)).thenResolve(d1)

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
        const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
        const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
        const input: StorageNodeKeyInput = { id: d1.id }

        const getNodeById = td.replace(storageService, 'getNodeById')
        td.when(getNodeById(d1.id)).thenResolve(d1)

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
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
      const d11 = newTestStorageDirNode(`${userRootPath}/d1/d11`)
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
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)

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
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
      const d11 = newTestStorageDirNode(`${userRootPath}/d1/d11`)
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
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)

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
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
      const d11 = newTestStorageDirNode(`${userRootPath}/d1/d11`)
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
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)

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
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
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
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)

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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
      const d11 = newTestStorageDirNode(`${userRootPath}/d1/d11`)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
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
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)

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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const d11 = newTestStorageDirNode(`d1/d11`)
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
      const d11 = newTestStorageDirNode(`${userRootPath}/d1/d11`)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
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
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)

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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
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
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`, { share: SHARE_SETTINGS })
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`, { share: SHARE_SETTINGS })
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
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)

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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d11 = newTestStorageDirNode(`d1/d11`)
      const d12 = newTestStorageDirNode(`d1/d12`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d11 = newTestStorageDirNode(`${userRootPath}/d1/d11`)
      const d12 = newTestStorageDirNode(`${userRootPath}/d1/d12`)
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
      const d11 = newTestStorageDirNode(`d1/d11`)
      const d12 = newTestStorageDirNode(`d1/d12`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPaths: [d11.path, d12.path] },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d11 = newTestStorageDirNode(`d1/d11`)
      const d12 = newTestStorageDirNode(`d1/d12`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d11 = newTestStorageDirNode(`${userRootPath}/d1/d11`)
      const d12 = newTestStorageDirNode(`${userRootPath}/d1/d12`)

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

  describe('removeStorageDir', () => {
    const gql = {
      query: `
        mutation RemoveStorageDir($dirPath: String!, $input: StoragePaginationInput) {
          removeStorageDir(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const fileA = newTestStorageFileNode(`d1/fileA.txt`)
      const removeDir = td.replace(storageService, 'removeDir')
      td.when(removeDir(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, fileA],
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

      expect(response.body.data.removeStorageDir.list).toEqual(toGQLResponseStorageNodes([d1, fileA]))
      expect(response.body.data.removeStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/fileA.txt`)
      const removeDir = td.replace(storageService, 'removeDir')
      td.when(removeDir(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, fileA],
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

      expect(response.body.data.removeStorageDir.list).toEqual(toGQLResponseStorageNodes([d1, fileA]))
      expect(response.body.data.removeStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)

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

  describe('removeStorageFile', () => {
    const gql = {
      query: `
        mutation RemoveStorageFile($filePath: String!) {
          removeStorageFile(filePath: $filePath) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
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
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)

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

  describe('moveStorageDir', () => {
    const gql = {
      query: `
        mutation MoveStorageDir($fromDirPath: String!, $toDirPath: String!, $input: StoragePaginationInput) {
          moveStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const docs = newTestStorageDirNode(`docs`)
      const fileA = newTestStorageFileNode(`archive/docs/fileA.txt`)
      const moveDir = td.replace(storageService, 'moveDir')
      td.when(moveDir(`docs`, `archive/docs`, { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `docs`, toDirPath: `archive/docs`, input: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.moveStorageDir.list).toEqual(toGQLResponseStorageNodes([docs, fileA]))
      expect(response.body.data.moveStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const docs = newTestStorageDirNode(`${userRootPath}/docs`)
      const fileA = newTestStorageFileNode(`${userRootPath}/archive/docs/fileA.txt`)
      const moveDir = td.replace(storageService, 'moveDir')
      td.when(moveDir(`${userRootPath}/docs`, `${userRootPath}/archive/docs`, { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `${userRootPath}/docs`, toDirPath: `${userRootPath}/archive/docs`, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.moveStorageDir.list).toEqual(toGQLResponseStorageNodes([docs, fileA]))
      expect(response.body.data.moveStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { fromDirPath: `docs`, toDirPath: `archive/docs`, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `docs`, toDirPath: `archive/docs`, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `${userRootPath}/docs`, toDirPath: `${userRootPath}/archive/docs`, input: { maxChunk: 3 } },
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`docs/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/docs/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)

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

  describe('renameStorageDir', () => {
    const gql = {
      query: `
        mutation RenameStorageDir($dirPath: String!, $newName: String!, $input: StoragePaginationInput) {
          renameStorageDir(dirPath: $dirPath, newName: $newName, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const docs = newTestStorageDirNode(`docs`)
      const fileA = newTestStorageFileNode(`docs/fileA.txt`)
      const renameDir = td.replace(storageService, 'renameDir')
      td.when(renameDir(`documents`, `docs`, { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `documents`, newName: `docs`, input: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.renameStorageDir.list).toEqual(toGQLResponseStorageNodes([docs, fileA]))
      expect(response.body.data.renameStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const docs = newTestStorageDirNode(`${userRootPath}/docs`)
      const fileA = newTestStorageFileNode(`${userRootPath}/docs/fileA.txt`)
      const renameDir = td.replace(storageService, 'renameDir')
      td.when(renameDir(`${userRootPath}/documents`, `${userRootPath}/docs`, { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `${userRootPath}/documents`, newName: `${userRootPath}/docs`, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.renameStorageDir.list).toEqual(toGQLResponseStorageNodes([docs, fileA]))
      expect(response.body.data.renameStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: `documents`, newName: `docs`, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `documents`, newName: `docs`, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `${userRootPath}/documents`, newName: `${userRootPath}/docs`, input: { maxChunk: 3 } },
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileB = newTestStorageFileNode(`fileB.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileB = newTestStorageFileNode(`${userRootPath}/fileB.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)

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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
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
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, input: SHARE_SETTINGS },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userRootPath}/d1`)
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
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
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path, input: SHARE_SETTINGS },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)

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
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
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
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
      const inputs = [{ filePath: fileA.path, contentType: 'text/plain' }]

      const response = await requestGQL(app, {
        ...gql,
        variables: { inputs },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userRootPath}/d1/d11/fileA.txt`)
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

  describe('createArticleDir', () => {
    const gql = {
      query: `
        mutation CreateArticleDir($dirPath: String!, $input: CreateArticleDirInput!) {
          createArticleDir(dirPath: $dirPath, input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`
      const input: CreateArticleDirInput = { articleNodeType: StorageArticleNodeType.ListBundle }
      const bundleNode = newTestStorageDirNode(`${bundlePath}`, input)

      const createArticleDir = td.replace(storageService, 'createArticleDir')
      td.when(createArticleDir(bundleNode.path, input)).thenResolve(bundleNode)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: bundlePath, input },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.createArticleDir).toEqual(toGQLResponseStorageNode(bundleNode))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`
      const input: CreateArticleDirInput = { articleNodeType: StorageArticleNodeType.ListBundle }

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: bundlePath, input },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`
      const input: CreateArticleDirInput = { articleNodeType: StorageArticleNodeType.ListBundle }

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: bundlePath, input },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('setArticleSortOrder', () => {
    const gql = {
      query: `
        mutation SetArticleSortOrder($nodePath: String!, $input: SetArticleSortOrderInput!) {
          setArticleSortOrder(nodePath: $nodePath, input: $input) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`
      const cat1Node = newTestStorageDirNode(`${bundlePath}/cat1`, { articleSortOrder: 999 })
      const input: SetArticleSortOrderInput = { insertBeforeNodePath: `${bundlePath}/cat2` }

      const setArticleSortOrder = td.replace(storageService, 'setArticleSortOrder')
      td.when(setArticleSortOrder(cat1Node.path, input)).thenResolve(cat1Node)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: cat1Node.path, input },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.setArticleSortOrder).toEqual(toGQLResponseStorageNode(cat1Node))
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`
      const cat1Node = newTestStorageDirNode(`${bundlePath}/cat1`, { articleSortOrder: 999 })
      const input: SetArticleSortOrderInput = { insertBeforeNodePath: `${bundlePath}/cat2` }

      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: cat1Node.path, input },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`
      const cat1Node = newTestStorageDirNode(`${bundlePath}/cat1`, { articleSortOrder: 999 })
      const input: SetArticleSortOrderInput = { insertBeforeNodePath: `${bundlePath}/cat2` }

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: cat1Node.path, input },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('articleChildren', () => {
    const gql = {
      query: `
        query GetArticleChildren($dirPath: String!, $input: StoragePaginationInput) {
          articleChildren(dirPath: $dirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeType articleSortOrder version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`
      const cat1Node = newTestStorageDirNode(`${bundlePath}/cat1`, { articleSortOrder: 999 })
      const getArticleChildren = td.replace(storageService, 'getArticleChildren')
      td.when(getArticleChildren(bundlePath, { maxChunk: 3 })).thenResolve({
        list: [cat1Node],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: bundlePath, input: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.articleChildren.list).toEqual(toGQLResponseStorageNodes([cat1Node]))
      expect(response.body.data.articleChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: bundlePath, input: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合', async () => {
      const articleRootPath = storageService.getArticleRootPath(STORAGE_USER_TOKEN)
      const bundlePath = `${articleRootPath}/blog`

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: bundlePath, input: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })
})
