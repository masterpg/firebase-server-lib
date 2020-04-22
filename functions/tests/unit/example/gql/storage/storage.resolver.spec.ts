import * as td from 'testdouble'
import { StorageNode, StorageServiceDI } from '../../../../../src/example/services'
import { StorageNodeShareSettings, StoragePaginationResult } from '../../../../../src/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { getGQLErrorStatus, requestGQL } from '../../../../helpers/common/gql'
import { newTestStorageDirNode, newTestStorageFileNode } from '../../../../helpers/common/storage'
import { AppModule } from '../../../../../src/example/app.module'
import { StorageResolver } from '../../../../../src/example/gql/storage'
import { initApp } from '../../../../../src/example/initializer'

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const GENERAL_USER = { uid: 'general.user', myDirName: 'general.user' }
const GENERAL_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(GENERAL_USER)}` }

const APP_ADMIN_USER = { uid: 'app.admin.user', myDirName: 'app.admin.user', isAppAdmin: true }
const APP_ADMIN_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(APP_ADMIN_USER)}` }

const SHARE_SETTINGS: StorageNodeShareSettings = {
  isPublic: false,
  uids: ['ichiro', 'jiro'],
}

//========================================================================
//
//  Test helpers
//
//========================================================================

interface ResponseStorageNode extends StorageNode {
  created: string
  updated: string
}

function toResponseStorageNodes(nodes: StorageNode[]): ResponseStorageNode[] {
  return nodes.map(node => {
    return Object.assign({}, node, {
      share: {
        isPublic: node.share.isPublic || null,
        uids: node.share.uids || null,
      },
      created: node.created!.toISOString(),
      updated: node.updated!.toISOString(),
    })
  })
}

function toResponseStorageNode(node: StorageNode): ResponseStorageNode {
  return toResponseStorageNodes([node])[0]
}

//========================================================================
//
//  Tests
//
//========================================================================

describe('StorageResolver', () => {
  let app: any
  let storageService: StorageServiceDI.type

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = module.createNestApplication()
    await app.init()
    storageService = module.get<StorageServiceDI.type>(StorageServiceDI.symbol)
  })

  //--------------------------------------------------
  //  User
  //--------------------------------------------------

  describe('userStorageNode', () => {
    const d1 = newTestStorageDirNode('d1')

    const gql = {
      query: `
        query GetUserStorageNode($nodePath: String!) {
          userStorageNode(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        nodePath: d1.path,
      },
    }

    it('疎通確認', async () => {
      const getUserNode = td.replace(storageService, 'getUserNode')
      td.when(getUserNode(td.matchers.contains(GENERAL_USER), d1.path)).thenResolve(d1)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageNode).toEqual(toResponseStorageNode(d1))
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const getUserNode = td.replace(storageService, 'getUserNode')
      td.when(getUserNode(td.matchers.contains(GENERAL_USER), d1.path)).thenResolve(undefined)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageNode).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageDirDescendants', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')

    const gql = {
      query: `
        query GetUserStorageDirDirDescendants($dirPath: String, $options: StoragePaginationOptionsInput) {
          userStorageDirDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const getUserDirDescendants = td.replace(storageService, 'getUserDirDescendants')
      td.when(getUserDirDescendants(td.matchers.contains(GENERAL_USER), d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageDirDescendants.list).toEqual(toResponseStorageNodes([d1, d11]))
      expect(response.body.data.userStorageDirDescendants.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const getUserDirDescendants = td.replace(storageService, 'getUserDirDescendants')
      td.when(getUserDirDescendants(td.matchers.contains(GENERAL_USER), d1.path, { maxChunk: 3 })).thenResolve({
        list: [],
        nextPageToken: undefined,
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageDirDescendants.list).toEqual(toResponseStorageNodes([]))
      expect(response.body.data.userStorageDirDescendants.nextPageToken).toBe(null)
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageDescendants', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')

    const gql = {
      query: `
        query GetUserStorageDescendants($dirPath: String, $options: StoragePaginationOptionsInput) {
          userStorageDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const getUserDescendants = td.replace(storageService, 'getUserDescendants')
      td.when(getUserDescendants(td.matchers.contains(GENERAL_USER), d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageDescendants.list).toEqual(toResponseStorageNodes([d11]))
      expect(response.body.data.userStorageDescendants.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageDirChildren', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')

    const gql = {
      query: `
        query GetUserStorageDirChildren($dirPath: String, $options: StoragePaginationOptionsInput) {
          userStorageDirChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const getUserDirChildren = td.replace(storageService, 'getUserDirChildren')
      td.when(getUserDirChildren(td.matchers.contains(GENERAL_USER), d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageDirChildren.list).toEqual(toResponseStorageNodes([d1, d11]))
      expect(response.body.data.userStorageDirChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageChildren', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')

    const gql = {
      query: `
        query GetUserStorageChildren($dirPath: String, $options: StoragePaginationOptionsInput) {
          userStorageChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const getUserChildren = td.replace(storageService, 'getUserChildren')
      td.when(getUserChildren(td.matchers.contains(GENERAL_USER), d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageChildren.list).toEqual(toResponseStorageNodes([d11]))
      expect(response.body.data.userStorageChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageHierarchicalNodes', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        query GetUserStorageHierarchicalNodes($nodePath: String!) {
          userStorageHierarchicalNodes(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        nodePath: fileA.path,
      },
    }

    it('疎通確認', async () => {
      const getUserHierarchicalNode = td.replace(storageService, 'getUserHierarchicalNode')
      td.when(getUserHierarchicalNode(td.matchers.contains(GENERAL_USER), fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageHierarchicalNodes).toEqual(toResponseStorageNodes([d1, d11]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageAncestorDirs', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        query GetUserStorageAncestorDirs($nodePath: String!) {
          userStorageAncestorDirs(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        nodePath: fileA.path,
      },
    }

    it('疎通確認', async () => {
      const getUserAncestorDirs = td.replace(storageService, 'getUserAncestorDirs')
      td.when(getUserAncestorDirs(td.matchers.contains(GENERAL_USER), fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageAncestorDirs).toEqual(toResponseStorageNodes([d1, d11]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('handleUploadedUserFile', () => {
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        mutation HandleUploadedUserFile($filePath: String!) {
          handleUploadedUserFile(filePath: $filePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: fileA.path,
      },
    }

    it('疎通確認', async () => {
      const handleUploadedUserFile = td.replace(storageService, 'handleUploadedUserFile')
      td.when(handleUploadedUserFile(td.matchers.contains(GENERAL_USER), fileA.path)).thenResolve(fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.handleUploadedUserFile).toEqual(toResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('createUserStorageDirs', () => {
    const d11 = newTestStorageDirNode('d1/d11')
    const d12 = newTestStorageDirNode('d1/d12')

    const gql = {
      query: `
        mutation CreateUserStorageDirs($dirPaths: [String!]!) {
          createUserStorageDirs(dirPaths: $dirPaths) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPaths: [d11.path, d12.path],
      },
    }

    it('疎通確認', async () => {
      const createUserDirs = td.replace(storageService, 'createUserDirs')
      td.when(createUserDirs(td.matchers.contains(GENERAL_USER), [d11.path, d12.path])).thenResolve([d11, d12])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.createUserStorageDirs).toEqual(toResponseStorageNodes([d11, d12]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('removeUserStorageDir', () => {
    const d1 = newTestStorageDirNode('d1')
    const fileA = newTestStorageFileNode('d1/fileA.txt')

    const gql = {
      query: `
        mutation RemoveUserStorageDir($dirPath: String!, $options: StoragePaginationOptionsInput) {
          removeUserStorageDir(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const removeUserDir = td.replace(storageService, 'removeUserDir')
      td.when(removeUserDir(td.matchers.contains(GENERAL_USER), d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.removeUserStorageDir.list).toEqual(toResponseStorageNodes([d1, fileA]))
      expect(response.body.data.removeUserStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('removeUserStorageFile', () => {
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        mutation RemoveUserStorageFile($filePath: String!) {
          removeUserStorageFile(filePath: $filePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: fileA.path,
      },
    }

    it('疎通確認', async () => {
      const removeUserFile = td.replace(storageService, 'removeUserFile')
      td.when(removeUserFile(td.matchers.contains(GENERAL_USER), fileA.path)).thenResolve(fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.removeUserStorageFile).toEqual(toResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('moveUserStorageDir', () => {
    const docs = newTestStorageDirNode('archive/docs')
    const fileA = newTestStorageFileNode('archive/docs/fileA.txt')

    const gql = {
      query: `
        mutation MoveUserStorageDir($fromDirPath: String!, $toDirPath: String!, $options: StoragePaginationOptionsInput) {
          moveUserStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        fromDirPath: 'docs',
        toDirPath: 'archive/docs',
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const moveUserDir = td.replace(storageService, 'moveUserDir')
      td.when(moveUserDir(td.matchers.contains(GENERAL_USER), 'docs', 'archive/docs', { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.moveUserStorageDir.list).toEqual(toResponseStorageNodes([docs, fileA]))
      expect(response.body.data.moveUserStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('moveUserStorageFile', () => {
    const fileA = newTestStorageFileNode('docs/fileA.txt')

    const gql = {
      query: `
        mutation MoveUserStorageFile($fromFilePath: String!, $toFilePath: String!) {
          moveUserStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        fromFilePath: 'fileA.txt',
        toFilePath: 'docs/fileA.txt',
      },
    }

    it('疎通確認', async () => {
      const moveUserFile = td.replace(storageService, 'moveUserFile')
      td.when(moveUserFile(td.matchers.contains(GENERAL_USER), 'fileA.txt', 'docs/fileA.txt')).thenResolve(fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.moveUserStorageFile).toEqual(toResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameUserStorageDir', () => {
    const docs = newTestStorageDirNode('docs')
    const fileA = newTestStorageFileNode('docs/fileA.txt')

    const gql = {
      query: `
        mutation RenameUserStorageDir($dirPath: String!, $newName: String!, $options: StoragePaginationOptionsInput) {
          renameUserStorageDir(dirPath: $dirPath, newName: $newName, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: 'documents',
        newName: 'docs',
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const renameUserDir = td.replace(storageService, 'renameUserDir')
      td.when(renameUserDir(td.matchers.contains(GENERAL_USER), 'documents', 'docs', { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.renameUserStorageDir.list).toEqual(toResponseStorageNodes([docs, fileA]))
      expect(response.body.data.renameUserStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameUserStorageFile', () => {
    const fileB = newTestStorageFileNode('fileB.txt')

    const gql = {
      query: `
        mutation RenameUserStorageFile($filePath: String!, $newName: String!) {
          renameUserStorageFile(filePath: $filePath, newName: $newName) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: 'fileA.txt',
        newName: 'fileB.txt',
      },
    }

    it('疎通確認', async () => {
      const renameUserFile = td.replace(storageService, 'renameUserFile')
      td.when(renameUserFile(td.matchers.contains(GENERAL_USER), 'fileA.txt', 'fileB.txt')).thenResolve(fileB)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.renameUserStorageFile).toEqual(toResponseStorageNode(fileB))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setUserStorageDirShareSettings', () => {
    const d1 = newTestStorageDirNode('d1')

    const gql = {
      query: `
        mutation SetUserStorageDirShareSettings($dirPath: String!, $settings: StorageNodeShareSettingsInput!) {
          setUserStorageDirShareSettings(dirPath: $dirPath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        settings: SHARE_SETTINGS,
      },
    }

    it('疎通確認', async () => {
      const setUserDirShareSettings = td.replace(storageService, 'setUserDirShareSettings')
      td.when(setUserDirShareSettings(td.matchers.contains(GENERAL_USER), d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.setUserStorageDirShareSettings).toEqual(toResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setUserStorageFileShareSettings', () => {
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        mutation SetUserStorageFileShareSettings($filePath: String!, $settings: StorageNodeShareSettingsInput!) {
          setUserStorageFileShareSettings(filePath: $filePath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: fileA.path,
        settings: SHARE_SETTINGS,
      },
    }

    it('疎通確認', async () => {
      const setUserFileShareSettings = td.replace(storageService, 'setUserFileShareSettings')
      td.when(setUserFileShareSettings(td.matchers.contains(GENERAL_USER), fileA.path, SHARE_SETTINGS)).thenResolve(fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.setUserStorageFileShareSettings).toEqual(toResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  //--------------------------------------------------
  //  Application
  //--------------------------------------------------

  describe('signedUploadUrls', () => {
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        query GetSignedUploadUrls($inputs: [SignedUploadUrlInput!]!) {
          signedUploadUrls(inputs: $inputs)
        }
      `,
      variables: {
        inputs: [
          {
            filePath: fileA.path,
            contentType: 'text/plain',
          },
        ],
      },
    }

    it('疎通確認', async () => {
      const getSignedUploadUrls = td.replace(storageService, 'getSignedUploadUrls')
      td.when(getSignedUploadUrls(td.matchers.anything(), gql.variables.inputs)).thenResolve(['xxx'])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.signedUploadUrls).toEqual(['xxx'])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageNode', () => {
    const d1 = newTestStorageDirNode('d1')

    const gql = {
      query: `
        query GetStorageNode($nodePath: String!) {
          storageNode(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        nodePath: d1.path,
      },
    }

    it('疎通確認', async () => {
      const getNode = td.replace(storageService, 'getNode')
      td.when(getNode(null, d1.path)).thenResolve(d1)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageNode).toEqual(toResponseStorageNode(d1))
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const getNode = td.replace(storageService, 'getNode')
      td.when(getNode(null, d1.path)).thenResolve(undefined)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageNode).toBeNull()
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageDirDescendants', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')

    const gql = {
      query: `
        query GetStorageDirDescendants($dirPath: String, $options: StoragePaginationOptionsInput) {
          storageDirDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const getDirDescendants = td.replace(storageService, 'getDirDescendants')
      td.when(getDirDescendants(null, d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageDirDescendants.list).toEqual(toResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirDescendants.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageDescendants', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')

    const gql = {
      query: `
        query GetStorageDescendants($dirPath: String, $options: StoragePaginationOptionsInput) {
          storageDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const getDescendants = td.replace(storageService, 'getDescendants')
      td.when(getDescendants(null, d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageDescendants.list).toEqual(toResponseStorageNodes([d11]))
      expect(response.body.data.storageDescendants.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageDirChildren', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')

    const gql = {
      query: `
        query GetStorageDirChildren($dirPath: String, $options: StoragePaginationOptionsInput) {
          storageDirChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const getDirChildren = td.replace(storageService, 'getDirChildren')
      td.when(getDirChildren(null, d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageDirChildren.list).toEqual(toResponseStorageNodes([d1, d11]))
      expect(response.body.data.storageDirChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageChildren', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')

    const gql = {
      query: `
        query GetStorageChildren($dirPath: String, $options: StoragePaginationOptionsInput) {
          storageChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const getChildren = td.replace(storageService, 'getChildren')
      td.when(getChildren(null, d1.path, { maxChunk: 3 })).thenResolve({
        list: [d11],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageChildren.list).toEqual(toResponseStorageNodes([d11]))
      expect(response.body.data.storageChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageHierarchicalNodes', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        query GetStorageHierarchicalNodes($nodePath: String!) {
          storageHierarchicalNodes(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        nodePath: fileA.path,
      },
    }

    it('疎通確認', async () => {
      const getHierarchicalNodes = td.replace(storageService, 'getHierarchicalNodes')
      td.when(getHierarchicalNodes(null, fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageHierarchicalNodes).toEqual(toResponseStorageNodes([d1, d11]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('storageAncestorDirs', () => {
    const d1 = newTestStorageDirNode('d1')
    const d11 = newTestStorageDirNode('d1/d11')
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        query GetStorageAncestorDirs($nodePath: String!) {
          storageAncestorDirs(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        nodePath: fileA.path,
      },
    }

    it('疎通確認', async () => {
      const getAncestorDirs = td.replace(storageService, 'getAncestorDirs')
      td.when(getAncestorDirs(null, fileA.path)).thenResolve([d1, d11])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageAncestorDirs).toEqual(toResponseStorageNodes([d1, d11]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('handleUploadedFile', () => {
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        mutation HandleUploadedFile($filePath: String!) {
          handleUploadedFile(filePath: $filePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: fileA.path,
      },
    }

    it('疎通確認', async () => {
      const handleUploadedFile = td.replace(storageService, 'handleUploadedFile')
      td.when(handleUploadedFile(null, fileA.path)).thenResolve(fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.handleUploadedFile).toEqual(toResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('createStorageDirs', () => {
    const d11 = newTestStorageDirNode('d1/d11')
    const d12 = newTestStorageDirNode('d1/d12')

    const gql = {
      query: `
        mutation CreateStorageDirs($dirPaths: [String!]!) {
          createStorageDirs(dirPaths: $dirPaths) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPaths: [d11.path, d12.path],
      },
    }

    it('疎通確認', async () => {
      const createDirs = td.replace(storageService, 'createDirs')
      td.when(createDirs(null, [d11.path, d12.path])).thenResolve([d11, d12])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.createStorageDirs).toEqual(toResponseStorageNodes([d11, d12]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('removeStorageDir', () => {
    const d1 = newTestStorageDirNode('d1')
    const fileA = newTestStorageFileNode('d1/fileA.txt')

    const gql = {
      query: `
        mutation RemoveStorageDir($dirPath: String!, $options: StoragePaginationOptionsInput) {
          removeStorageDir(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const removeDir = td.replace(storageService, 'removeDir')
      td.when(removeDir(null, d1.path, { maxChunk: 3 })).thenResolve({
        list: [d1, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.removeStorageDir.list).toEqual(toResponseStorageNodes([d1, fileA]))
      expect(response.body.data.removeStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('removeStorageFile', () => {
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        mutation RemoveStorageFile($filePath: String!) {
          removeStorageFile(filePath: $filePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: fileA.path,
      },
    }

    it('疎通確認', async () => {
      const removeFile = td.replace(storageService, 'removeFile')
      td.when(removeFile(null, fileA.path)).thenResolve(fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.removeStorageFile).toEqual(toResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('moveStorageDir', () => {
    const docs = newTestStorageDirNode('archive/docs')
    const fileA = newTestStorageFileNode('archive/docs/fileA.txt')

    const gql = {
      query: `
        mutation MoveStorageDir($fromDirPath: String!, $toDirPath: String!, $options: StoragePaginationOptionsInput) {
          moveStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        fromDirPath: 'docs',
        toDirPath: 'archive/docs',
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const moveDir = td.replace(storageService, 'moveDir')
      td.when(moveDir(null, 'docs', 'archive/docs', { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.moveStorageDir.list).toEqual(toResponseStorageNodes([docs, fileA]))
      expect(response.body.data.moveStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('moveStorageFile', () => {
    const fileA = newTestStorageFileNode('docs/fileA.txt')

    const gql = {
      query: `
        mutation MoveStorageFile($fromFilePath: String!, $toFilePath: String!) {
          moveStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        fromFilePath: 'fileA.txt',
        toFilePath: 'docs/fileA.txt',
      },
    }

    it('疎通確認', async () => {
      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(null, 'fileA.txt', 'docs/fileA.txt')).thenResolve(fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.moveStorageFile).toEqual(toResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('renameStorageDir', () => {
    const docs = newTestStorageDirNode('docs')
    const fileA = newTestStorageFileNode('docs/fileA.txt')

    const gql = {
      query: `
        mutation RenameStorageDir($dirPath: String!, $newName: String!, $options: StoragePaginationOptionsInput) {
          renameStorageDir(dirPath: $dirPath, newName: $newName, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: 'documents',
        newName: 'docs',
        options: { maxChunk: 3 },
      },
    }

    it('疎通確認', async () => {
      const renameDir = td.replace(storageService, 'renameDir')
      td.when(renameDir(null, 'documents', 'docs', { maxChunk: 3 })).thenResolve({
        list: [docs, fileA],
        nextPageToken: 'abcdefg',
      } as StoragePaginationResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.renameStorageDir.list).toEqual(toResponseStorageNodes([docs, fileA]))
      expect(response.body.data.renameStorageDir.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('renameStorageFile', () => {
    const fileB = newTestStorageFileNode('fileB.txt')

    const gql = {
      query: `
        mutation RenameStorageFile($filePath: String!, $newName: String!) {
          renameStorageFile(filePath: $filePath, newName: $newName) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: 'fileA.txt',
        newName: 'fileB.txt',
      },
    }

    it('疎通確認', async () => {
      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(null, 'fileA.txt', 'fileB.txt')).thenResolve(fileB)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.renameStorageFile).toEqual(toResponseStorageNode(fileB))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('setStorageDirShareSettings', () => {
    const d1 = newTestStorageDirNode('d1')

    const gql = {
      query: `
        mutation SetStorageDirShareSettings($dirPath: String!, $settings: StorageNodeShareSettingsInput!) {
          setStorageDirShareSettings(dirPath: $dirPath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: d1.path,
        settings: SHARE_SETTINGS,
      },
    }

    it('疎通確認', async () => {
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(null, d1.path, SHARE_SETTINGS)).thenResolve(d1)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.setStorageDirShareSettings).toEqual(toResponseStorageNode(d1))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })

  describe('setStorageFileShareSettings', () => {
    const fileA = newTestStorageFileNode('d1/d11/fileA.txt')

    const gql = {
      query: `
        mutation SetFileShareSettings($filePath: String!, $settings: StorageNodeShareSettingsInput!) {
          setStorageFileShareSettings(filePath: $filePath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: fileA.path,
        settings: SHARE_SETTINGS,
      },
    }

    it('疎通確認', async () => {
      const setFileShareSettings = td.replace(storageService, 'setFileShareSettings')
      td.when(setFileShareSettings(null, fileA.path, SHARE_SETTINGS)).thenResolve(fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.setStorageFileShareSettings).toEqual(toResponseStorageNode(fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })

    it('アプリケーション管理者でない場合', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })
      expect(getGQLErrorStatus(response)).toBe(403)
    })
  })
})
