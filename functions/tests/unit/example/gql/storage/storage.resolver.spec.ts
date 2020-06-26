import * as td from 'testdouble'
import {
  APP_ADMIN_USER,
  APP_ADMIN_USER_HEADER,
  GENERAL_USER,
  GENERAL_USER_HEADER,
  STORAGE_USER_HEADER,
  STORAGE_USER_TOKEN,
} from '../../../../helpers/common/data'
import { DevUtilsServiceDI, DevUtilsServiceModule, StorageNode, StorageNodeShareSettings, StoragePaginationResult } from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { getGQLErrorStatus, requestGQL } from '../../../../helpers/common/gql'
import {
  newTestStorageDirNode,
  newTestStorageFileNode,
  toGQLResponseStorageNode,
  toGQLResponseStorageNodes,
} from '../../../../helpers/common/storage'
import { AppStorageServiceDI } from '../../../../../src/example/services'
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
//  Test helpers
//
//========================================================================

interface ResponseStorageNode extends Omit<StorageNode, 'createdAt' | 'updatedAt'> {
  createdAt: string
  updatedAt: string
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
  let storageService: AppStorageServiceDI.type

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [GQLContainerModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()
    storageService = module.get<AppStorageServiceDI.type>(AppStorageServiceDI.symbol)
  })

  describe('storageNode', () => {
    const gql = {
      query: `
        query GetStorageNode($nodePath: String!) {
          storageNode(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode('d1')
      const getNodeByPath = td.replace(storageService, 'getNodeByPath')
      td.when(getNodeByPath(d1.path)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: d1.path },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d`)
      const getNodeByPath = td.replace(storageService, 'getNodeByPath')
      td.when(getNodeByPath(d1.path)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: d1.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.storageNode).toEqual(toGQLResponseStorageNode(d1))
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const getNodeByPath = td.replace(storageService, 'getNodeByPath')
      td.when(getNodeByPath(d1.path)).thenResolve(undefined)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: d1.path },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageNode).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const d1 = newTestStorageDirNode(`d1`)
      const response = await requestGQL(app, {
        ...gql,
        variables: { nodePath: d1.path },
      })
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: d1.path },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { nodePath: d1.path },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageDirDescendants', () => {
    const gql = {
      query: `
        query GetStorageDirDescendants($dirPath: String, $options: StoragePaginationOptionsInput) {
          storageDirDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageDirDescendants.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirDescendants.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
      const d11 = newTestStorageDirNode(`${userDirPath}/d1/d11`)
      const getDirDescendants = td.replace(storageService, 'getDirDescendants')
      td.when(getDirDescendants(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
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
        variables: { dirPath: d1.path, options: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageDescendants', () => {
    const gql = {
      query: `
        query GetStorageDescendants($dirPath: String, $options: StoragePaginationOptionsInput) {
          storageDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageDescendants.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageDescendants.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
      const d11 = newTestStorageDirNode(`${userDirPath}/d1/d11`)
      const getDescendants = td.replace(storageService, 'getDescendants')
      td.when(getDescendants(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
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
        variables: { dirPath: d1.path, options: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageDirChildren', () => {
    const gql = {
      query: `
        query GetStorageDirChildren($dirPath: String, $options: StoragePaginationOptionsInput) {
          storageDirChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageDirChildren.list).toEqual(toGQLResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirChildren.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
      const d11 = newTestStorageDirNode(`${userDirPath}/d1/d11`)
      const getDirChildren = td.replace(storageService, 'getDirChildren')
      td.when(getDirChildren(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
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
        variables: { dirPath: d1.path, options: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageChildren', () => {
    const gql = {
      query: `
        query GetStorageChildren($dirPath: String, $options: StoragePaginationOptionsInput) {
          storageChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.storageChildren.list).toEqual(toGQLResponseStorageNodes([d11]))
      expect(response.body.data.storageChildren.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
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
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
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
        variables: { dirPath: d1.path, options: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
      const d11 = newTestStorageDirNode(`${userDirPath}/d1/d11`)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)

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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
      const d11 = newTestStorageDirNode(`${userDirPath}/d1/d11`)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)

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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)
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

  describe('createStorageDirs', () => {
    const gql = {
      query: `
        mutation CreateStorageDirs($dirPaths: [String!]!) {
          createStorageDirs(dirPaths: $dirPaths) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const d11 = newTestStorageDirNode(`d1/d11`)
      const d12 = newTestStorageDirNode(`d1/d12`)
      const createDirs = td.replace(storageService, 'createDirs')
      td.when(createDirs([d11.path, d12.path])).thenResolve([d11, d12])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.createStorageDirs).toEqual(toGQLResponseStorageNodes([d11, d12]))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d11 = newTestStorageDirNode(`${userDirPath}/d1/d11`)
      const d12 = newTestStorageDirNode(`${userDirPath}/d1/d12`)
      const createDirs = td.replace(storageService, 'createDirs')
      td.when(createDirs([d11.path, d12.path])).thenResolve([d11, d12])

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPaths: [d11.path, d12.path] },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.createStorageDirs).toEqual(toGQLResponseStorageNodes([d11, d12]))
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d11 = newTestStorageDirNode(`${userDirPath}/d1/d11`)
      const d12 = newTestStorageDirNode(`${userDirPath}/d1/d12`)

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
        mutation RemoveStorageDir($dirPath: String!, $options: StoragePaginationOptionsInput) {
          removeStorageDir(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.removeStorageDir.list).toEqual(toGQLResponseStorageNodes([d1, fileA]))
      expect(response.body.data.removeStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/fileA.txt`)
      const removeDir = td.replace(storageService, 'removeDir')
      td.when(removeDir(d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
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
        variables: { dirPath: d1.path, options: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, options: { maxChunk: 3 } },
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)

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
        mutation MoveStorageDir($fromDirPath: String!, $toDirPath: String!, $options: StoragePaginationOptionsInput) {
          moveStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { fromDirPath: `docs`, toDirPath: `archive/docs`, options: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.moveStorageDir.list).toEqual(toGQLResponseStorageNodes([docs, fileA]))
      expect(response.body.data.moveStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const docs = newTestStorageDirNode(`${userDirPath}/docs`)
      const fileA = newTestStorageFileNode(`${userDirPath}/archive/docs/fileA.txt`)
      const moveDir = td.replace(storageService, 'moveDir')
      td.when(moveDir(`${userDirPath}/docs`, `${userDirPath}/archive/docs`, { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `${userDirPath}/docs`, toDirPath: `${userDirPath}/archive/docs`, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.moveStorageDir.list).toEqual(toGQLResponseStorageNodes([docs, fileA]))
      expect(response.body.data.moveStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { fromDirPath: `docs`, toDirPath: `archive/docs`, options: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `docs`, toDirPath: `archive/docs`, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromDirPath: `${userDirPath}/docs`, toDirPath: `${userDirPath}/archive/docs`, options: { maxChunk: 3 } },
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/docs/fileA.txt`)
      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(`${userDirPath}/fileA.txt`, `${userDirPath}/docs/fileA.txt`)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `${userDirPath}/fileA.txt`, toFilePath: `${userDirPath}/docs/fileA.txt` },
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { fromFilePath: `${userDirPath}/fileA.txt`, toFilePath: `${userDirPath}/docs/fileA.txt` },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('renameStorageDir', () => {
    const gql = {
      query: `
        mutation RenameStorageDir($dirPath: String!, $newName: String!, $options: StoragePaginationOptionsInput) {
          renameStorageDir(dirPath: $dirPath, newName: $newName, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { dirPath: `documents`, newName: `docs`, options: { maxChunk: 3 } },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.renameStorageDir.list).toEqual(toGQLResponseStorageNodes([docs, fileA]))
      expect(response.body.data.renameStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const docs = newTestStorageDirNode(`${userDirPath}/docs`)
      const fileA = newTestStorageFileNode(`${userDirPath}/docs/fileA.txt`)
      const renameDir = td.replace(storageService, 'renameDir')
      td.when(renameDir(`${userDirPath}/documents`, `${userDirPath}/docs`, { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `${userDirPath}/documents`, newName: `${userDirPath}/docs`, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.renameStorageDir.list).toEqual(toGQLResponseStorageNodes([docs, fileA]))
      expect(response.body.data.renameStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: `documents`, newName: `docs`, options: { maxChunk: 3 } },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `documents`, newName: `docs`, options: { maxChunk: 3 } },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: `${userDirPath}/documents`, newName: `${userDirPath}/docs`, options: { maxChunk: 3 } },
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
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileB = newTestStorageFileNode(`${userDirPath}/fileB.txt`)
      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(`${userDirPath}/fileA.txt`, `${userDirPath}/fileB.txt`)).thenResolve(fileB)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `${userDirPath}/fileA.txt`, newName: `${userDirPath}/fileB.txt` },
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: `${userDirPath}/fileA.txt`, newName: `${userDirPath}/fileB.txt` },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('setStorageDirShareSettings', () => {
    const gql = {
      query: `
        mutation SetStorageDirShareSettings($dirPath: String!, $settings: StorageNodeShareSettingsInput!) {
          setStorageDirShareSettings(dirPath: $dirPath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { dirPath: d1.path, settings: SHARE_SETTINGS },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.setStorageDirShareSettings).toEqual(toGQLResponseStorageNode(d1))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, settings: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.setStorageDirShareSettings).toEqual(toGQLResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { dirPath: d1.path, settings: SHARE_SETTINGS },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const d1 = newTestStorageDirNode(`d1`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, settings: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const d1 = newTestStorageDirNode(`${userDirPath}/d1`)
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { dirPath: d1.path, settings: SHARE_SETTINGS },
        },
        { headers: GENERAL_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('setStorageFileShareSettings', () => {
    const gql = {
      query: `
        mutation SetFileShareSettings($filePath: String!, $settings: StorageNodeShareSettingsInput!) {
          setStorageFileShareSettings(filePath: $filePath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic readUIds writeUIds } version createdAt updatedAt
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
          variables: { filePath: fileA.path, settings: SHARE_SETTINGS },
        },
        { headers: APP_ADMIN_USER_HEADER }
      )

      expect(response.body.data.setStorageFileShareSettings).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('疎通確認 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)
      const setFileShareSettings = td.replace(storageService, 'setFileShareSettings')
      td.when(setFileShareSettings(fileA.path, SHARE_SETTINGS)).thenResolve(fileA)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, settings: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(response.body.data.setStorageFileShareSettings).toEqual(toGQLResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(app, {
        ...gql,
        variables: { filePath: fileA.path, settings: SHARE_SETTINGS },
      })

      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アクセス権限がない場合 - アプリケーションノード', async () => {
      const fileA = newTestStorageFileNode(`d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, settings: SHARE_SETTINGS },
        },
        { headers: STORAGE_USER_HEADER }
      )

      expect(getGQLErrorStatus(response)).toBe(403)
    })

    it('アクセス権限がない場合 - ユーザーノード', async () => {
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)

      const response = await requestGQL(
        app,
        {
          ...gql,
          variables: { filePath: fileA.path, settings: SHARE_SETTINGS },
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)
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
      const userDirPath = storageService.getUserDirPath(STORAGE_USER_TOKEN)
      const fileA = newTestStorageFileNode(`${userDirPath}/d1/d11/fileA.txt`)
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
})
