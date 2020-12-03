import * as td from 'testdouble'
import {
  APP_ADMIN_USER,
  APP_ADMIN_USER_HEADER,
  GENERAL_USER,
  GENERAL_USER_HEADER,
  STORAGE_USER_HEADER,
  STORAGE_USER_TOKEN,
  getGQLErrorStatus,
  newAppStorageDirNode,
  newAppStorageFileNode,
  requestGQL,
  toGQLResponseStorageNodes,
} from '../../../../../helpers/app'
import { AppStorageServiceDI, DevUtilsServiceDI, DevUtilsServiceModule, StoragePaginationResult } from '../../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import MiddleGQLContainerModule from '../../../../../../src/app/gql/middle'
import { StorageResolver } from '../../../../../../src/app/gql/standard/storage'
import { initApp } from '../../../../../../src/app/base'

jest.setTimeout(5000)
initApp()

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
      imports: [MiddleGQLContainerModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()
    storageService = module.get<AppStorageServiceDI.type>(AppStorageServiceDI.symbol)
  })

  describe('removeStorageDir', () => {
    const gql = {
      query: `
        mutation RemoveStorageDir($dirPath: String!, $input: StoragePaginationInput) {
          removeStorageDir(dirPath: $dirPath, input: $input) {
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
      const fileA = newAppStorageFileNode(`d1/fileA.txt`)
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
      const d1 = newAppStorageDirNode(`${userRootPath}/d1`)
      const fileA = newAppStorageFileNode(`${userRootPath}/d1/fileA.txt`)
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
      const userRootPath = storageService.getUserRootPath(STORAGE_USER_TOKEN)
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

  describe('moveStorageDir', () => {
    const gql = {
      query: `
        mutation MoveStorageDir($fromDirPath: String!, $toDirPath: String!, $input: StoragePaginationInput) {
          moveStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const docs = newAppStorageDirNode(`docs`)
      const fileA = newAppStorageFileNode(`archive/docs/fileA.txt`)
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
      const docs = newAppStorageDirNode(`${userRootPath}/docs`)
      const fileA = newAppStorageFileNode(`${userRootPath}/archive/docs/fileA.txt`)
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

  describe('renameStorageDir', () => {
    const gql = {
      query: `
        mutation RenameStorageDir($dirPath: String!, $newName: String!, $input: StoragePaginationInput) {
          renameStorageDir(dirPath: $dirPath, newName: $newName, input: $input) {
            list {
              id nodeType name dir path contentType size share { isPublic readUIds writeUIds } articleNodeName articleNodeType articleSortOrder isArticleFile version createdAt updatedAt
            }
            nextPageToken
          }
        }
      `,
    }

    it('疎通確認 - アプリケーションノード', async () => {
      const docs = newAppStorageDirNode(`docs`)
      const fileA = newAppStorageFileNode(`docs/fileA.txt`)
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
      const docs = newAppStorageDirNode(`${userRootPath}/docs`)
      const fileA = newAppStorageFileNode(`${userRootPath}/docs/fileA.txt`)
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
})
