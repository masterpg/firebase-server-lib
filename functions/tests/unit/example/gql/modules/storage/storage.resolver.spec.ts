import * as path from 'path'
import * as shortid from 'shortid'
import * as td from 'testdouble'
import { GetStorageResult, StorageNodeShareSettings, StorageNodeType } from '../../../../../../src/lib'
import { StorageNode, StorageServiceDI } from '../../../../../../src/example/services'
import { Test, TestingModule } from '@nestjs/testing'
import { getGQLErrorStatus, requestGQL } from '../../../../../helpers/example'
import { AppModule } from '../../../../../../src/example/app.module'
import { StorageResolver } from '../../../../../../src/example/gql/modules/storage'
import { initApp } from '../../../../../../src/example/initializer'
const dayjs = require('dayjs')

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

const dir1: StorageNode = {
  id: shortid.generate(),
  nodeType: StorageNodeType.Dir,
  name: 'dir1',
  dir: '',
  path: 'dir1',
  contentType: '',
  size: 0,
  share: SHARE_SETTINGS,
  created: dayjs(),
  updated: dayjs(),
}

const dir1_1: StorageNode = {
  id: shortid.generate(),
  nodeType: StorageNodeType.Dir,
  name: 'dir1_1',
  dir: dir1.path,
  path: path.join(dir1.path, 'dir1_1'),
  contentType: '',
  size: 0,
  share: SHARE_SETTINGS,
  created: dayjs(),
  updated: dayjs(),
}

const dir1_1_fileA: StorageNode = {
  id: shortid.generate(),
  nodeType: StorageNodeType.File,
  name: 'fileA.txt',
  dir: dir1_1.path,
  path: path.join(dir1_1.path, 'fileA.txt'),
  contentType: 'text/plain; charset=utf-8',
  size: 5,
  share: SHARE_SETTINGS,
  created: dayjs(),
  updated: dayjs(),
}

const dir1_1_fileB: StorageNode = {
  id: shortid.generate(),
  nodeType: StorageNodeType.File,
  name: 'fileB.txt',
  dir: dir1_1.path,
  path: path.join(dir1_1.path, 'fileB.txt'),
  contentType: 'text/plain; charset=utf-8',
  size: 5,
  share: SHARE_SETTINGS,
  created: dayjs(),
  updated: dayjs(),
}

const dir1_2: StorageNode = {
  id: shortid.generate(),
  nodeType: StorageNodeType.Dir,
  name: 'dir1_2',
  dir: dir1.path,
  path: path.join(dir1.path, 'dir1_2'),
  contentType: '',
  size: 0,
  share: SHARE_SETTINGS,
  created: dayjs(),
  updated: dayjs(),
}

const dir1_2_fileA: StorageNode = {
  id: shortid.generate(),
  nodeType: StorageNodeType.Dir,
  name: 'fileA.txt',
  dir: dir1_2.path,
  path: path.join(dir1_2.path, 'fileA.txt'),
  contentType: 'text/plain; charset=utf-8',
  size: 5,
  share: SHARE_SETTINGS,
  created: dayjs(),
  updated: dayjs(),
}

//========================================================================
//
//  Test helpers
//
//========================================================================

interface ResponseStorageNodes extends StorageNode {
  created: string
  updated: string
}

function toResponseStorageNodes(nodes: StorageNode[]): ResponseStorageNodes[] {
  return nodes.map(node => {
    return Object.assign({}, node, {
      created: node.created!.toISOString(),
      updated: node.updated!.toISOString(),
    })
  })
}

function toResponseStorageNode(node: StorageNode): ResponseStorageNodes {
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
    const gql = {
      query: `
        query GetUserStorageNode($nodePath: String!) {
          userStorageNode(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        nodePath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getUserNode = td.replace(storageService, 'getUserNode')
      td.when(getUserNode(td.matchers.contains(GENERAL_USER), dir1.path)).thenResolve(dir1)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageNode).toEqual(toResponseStorageNode(dir1))
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const getUserNode = td.replace(storageService, 'getUserNode')
      td.when(getUserNode(td.matchers.contains(GENERAL_USER), dir1.path)).thenResolve(undefined)

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
    const gql = {
      query: `
        query GetUserStorageDirDirDescendants($dirPath: String, $options: GetStorageOptionsInput) {
          userStorageDirDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        options: { maxResults: 3 },
      },
    }

    it('疎通確認', async () => {
      const getUserDirDescendants = td.replace(storageService, 'getUserDirDescendants')
      td.when(getUserDirDescendants(td.matchers.contains(GENERAL_USER), dir1.path, { maxResults: 3 })).thenResolve({
        list: [dir1, dir1_1],
        nextPageToken: 'abcdefg',
      } as GetStorageResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageDirDescendants.list).toEqual(toResponseStorageNodes([dir1, dir1_1]))
      expect(response.body.data.userStorageDirDescendants.nextPageToken).toBe('abcdefg')
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const getUserDirDescendants = td.replace(storageService, 'getUserDirDescendants')
      td.when(getUserDirDescendants(td.matchers.contains(GENERAL_USER), dir1.path, { maxResults: 3 })).thenResolve({
        list: [],
        nextPageToken: undefined,
      } as GetStorageResult)

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
    const gql = {
      query: `
        query GetUserStorageDescendants($dirPath: String, $options: GetStorageOptionsInput) {
          userStorageDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        options: { maxResults: 3 },
      },
    }

    it('疎通確認', async () => {
      const getUserDescendants = td.replace(storageService, 'getUserDescendants')
      td.when(getUserDescendants(td.matchers.contains(GENERAL_USER), dir1.path, { maxResults: 3 })).thenResolve({
        list: [dir1_1],
        nextPageToken: 'abcdefg',
      } as GetStorageResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageDescendants.list).toEqual(toResponseStorageNodes([dir1_1]))
      expect(response.body.data.userStorageDescendants.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageDirChildren', () => {
    const gql = {
      query: `
        query GetUserStorageDirChildren($dirPath: String, $options: GetStorageOptionsInput) {
          userStorageDirChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        options: { maxResults: 3 },
      },
    }

    it('疎通確認', async () => {
      const getUserDirChildren = td.replace(storageService, 'getUserDirChildren')
      td.when(getUserDirChildren(td.matchers.contains(GENERAL_USER), dir1.path, { maxResults: 3 })).thenResolve({
        list: [dir1, dir1_1],
        nextPageToken: 'abcdefg',
      } as GetStorageResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageDirChildren.list).toEqual(toResponseStorageNodes([dir1, dir1_1]))
      expect(response.body.data.userStorageDirChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageChildren', () => {
    const gql = {
      query: `
        query GetUserStorageChildren($dirPath: String, $options: GetStorageOptionsInput) {
          userStorageChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        options: { maxResults: 3 },
      },
    }

    it('疎通確認', async () => {
      const getUserChildren = td.replace(storageService, 'getUserChildren')
      td.when(getUserChildren(td.matchers.contains(GENERAL_USER), dir1.path, { maxResults: 3 })).thenResolve({
        list: [dir1_1],
        nextPageToken: 'abcdefg',
      } as GetStorageResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageChildren.list).toEqual(toResponseStorageNodes([dir1_1]))
      expect(response.body.data.userStorageChildren.nextPageToken).toBe('abcdefg')
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('handleUploadedUserFiles', () => {
    const gql = {
      query: `
        mutation HandleUploadedUserFiles($filePaths: [String!]!) {
          handleUploadedUserFiles(filePaths: $filePaths)
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path, dir1_1_fileB.path],
      },
    }

    it('疎通確認', async () => {
      const handleUploadedUserFiles = td.replace(storageService, 'handleUploadedUserFiles')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.handleUploadedUserFiles).toBe(true)

      const exp = td.explain(handleUploadedUserFiles)
      expect(exp.calls[0].args[0]).toMatchObject(GENERAL_USER)
      expect(exp.calls[0].args[1]).toEqual([dir1_1_fileA.path, dir1_1_fileB.path])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('createUserStorageDirs', () => {
    const gql = {
      query: `
        mutation CreateUserStorageDirs($dirPaths: [String!]!) {
          createUserStorageDirs(dirPaths: $dirPaths) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1_1.path, dir1_2.path],
      },
    }

    it('疎通確認', async () => {
      const createUserDirs = td.replace(storageService, 'createUserDirs')
      td.when(createUserDirs(td.matchers.contains(GENERAL_USER), [dir1_1.path, dir1_2.path])).thenResolve([dir1_1, dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.createUserStorageDirs).toEqual(toResponseStorageNodes([dir1_1, dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('removeUserStorageDirs', () => {
    const gql = {
      query: `
        mutation RemoveUserStorageDirs($dirPaths: [String!]!) {
          removeUserStorageDirs(dirPaths: $dirPaths)
        }
      `,
      variables: {
        dirPaths: [dir1.path],
      },
    }

    it('疎通確認', async () => {
      const removeUserDirs = td.replace(storageService, 'removeUserDirs')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.removeUserStorageDirs).toBe(true)

      const exp = td.explain(removeUserDirs)
      expect(exp.calls[0].args[0]).toMatchObject(GENERAL_USER)
      expect(exp.calls[0].args[1]).toEqual([dir1.path])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('removeUserStorageFiles', () => {
    const gql = {
      query: `
        mutation RemoveUserStorageFiles($filePaths: [String!]!) {
          removeUserStorageFiles(filePaths: $filePaths)
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path],
      },
    }

    it('疎通確認', async () => {
      const removeUserFiles = td.replace(storageService, 'removeUserFiles')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.removeUserStorageFiles).toBe(true)

      const exp = td.explain(removeUserFiles)
      expect(exp.calls[0].args[0]).toMatchObject(GENERAL_USER)
      expect(exp.calls[0].args[1]).toEqual([dir1_1_fileA.path])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('moveUserStorageDir', () => {
    const gql = {
      query: `
        mutation MoveUserStorageDir($fromDirPath: String!, $toDirPath: String!) {
          moveUserStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath)
        }
      `,
      variables: {
        fromDirPath: dir1_1.path,
        toDirPath: dir1_2.path,
      },
    }

    it('疎通確認', async () => {
      const moveUserDir = td.replace(storageService, 'moveUserDir')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.moveUserStorageDir).toBe(true)

      const exp = td.explain(moveUserDir)
      expect(exp.calls[0].args[0]).toMatchObject(GENERAL_USER)
      expect(exp.calls[0].args[1]).toBe(dir1_1.path)
      expect(exp.calls[0].args[2]).toBe(dir1_2.path)
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('moveUserStorageFile', () => {
    const gql = {
      query: `
        mutation MoveUserStorageFile($fromFilePath: String!, $toFilePath: String!) {
          moveUserStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath)
        }
      `,
      variables: {
        fromFilePath: dir1_1_fileA.path,
        toFilePath: dir1_2_fileA.path,
      },
    }

    it('疎通確認', async () => {
      const moveUserFile = td.replace(storageService, 'moveUserFile')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.moveUserStorageFile).toBe(true)

      const exp = td.explain(moveUserFile)
      expect(exp.calls[0].args[0]).toMatchObject(GENERAL_USER)
      expect(exp.calls[0].args[1]).toBe(dir1_1_fileA.path)
      expect(exp.calls[0].args[2]).toBe(dir1_2_fileA.path)
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameUserStorageDir', () => {
    const gql = {
      query: `
        mutation RenameUserStorageDir($dirPath: String!, $newName: String!) {
          renameUserStorageDir(dirPath: $dirPath, newName: $newName)
        }
      `,
      variables: {
        dirPath: dir1_1.path,
        newName: dir1_2.name,
      },
    }

    it('疎通確認', async () => {
      const renameUserDir = td.replace(storageService, 'renameUserDir')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.renameUserStorageDir).toBe(true)

      const exp = td.explain(renameUserDir)
      expect(exp.calls[0].args[0]).toMatchObject(GENERAL_USER)
      expect(exp.calls[0].args[1]).toBe(dir1_1.path)
      expect(exp.calls[0].args[2]).toBe(dir1_2.name)
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('renameUserStorageFile', () => {
    const gql = {
      query: `
        mutation RenameUserStorageFile($filePath: String!, $newName: String!) {
          renameUserStorageFile(filePath: $filePath, newName: $newName)
        }
      `,
      variables: {
        filePath: dir1_1_fileA.path,
        newName: dir1_1_fileB.name,
      },
    }

    it('疎通確認', async () => {
      const renameUserFile = td.replace(storageService, 'renameUserFile')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.renameUserStorageFile).toBe(true)

      const exp = td.explain(renameUserFile)
      expect(exp.calls[0].args[0]).toMatchObject(GENERAL_USER)
      expect(exp.calls[0].args[1]).toBe(dir1_1_fileA.path)
      expect(exp.calls[0].args[2]).toBe(dir1_1_fileB.name)
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setUserStorageDirShareSettings', () => {
    const gql = {
      query: `
        mutation SetUserStorageDirShareSettings($dirPath: String!, $settings: StorageNodeShareSettingsInput!) {
          setUserStorageDirShareSettings(dirPath: $dirPath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        settings: SHARE_SETTINGS,
      },
    }

    it('疎通確認', async () => {
      const setUserDirShareSettings = td.replace(storageService, 'setUserDirShareSettings')
      td.when(setUserDirShareSettings(td.matchers.contains(GENERAL_USER), dir1.path, SHARE_SETTINGS)).thenResolve(dir1)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.setUserStorageDirShareSettings).toEqual(toResponseStorageNode(dir1))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('setUserStorageFileShareSettings', () => {
    const gql = {
      query: `
        mutation SetUserStorageFileShareSettings($filePath: String!, $settings: StorageNodeShareSettingsInput!) {
          setUserStorageFileShareSettings(filePath: $filePath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: dir1_1_fileA.path,
        settings: SHARE_SETTINGS,
      },
    }

    it('疎通確認', async () => {
      const setUserFileShareSettings = td.replace(storageService, 'setUserFileShareSettings')
      td.when(setUserFileShareSettings(td.matchers.contains(GENERAL_USER), dir1_1_fileA.path, SHARE_SETTINGS)).thenResolve(dir1_1_fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.setUserStorageFileShareSettings).toEqual(toResponseStorageNode(dir1_1_fileA))
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
    const gql = {
      query: `
        query GetSignedUploadUrls($inputs: [SignedUploadUrlInput!]!) {
          signedUploadUrls(inputs: $inputs)
        }
      `,
      variables: {
        inputs: [
          {
            filePath: dir1_1_fileA.path,
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
    const gql = {
      query: `
        query GetStorageNode($nodePath: String!) {
          storageNode(nodePath: $nodePath) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        nodePath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getNode = td.replace(storageService, 'getNode')
      td.when(getNode(null, dir1.path)).thenResolve(dir1)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageNode).toEqual(toResponseStorageNode(dir1))
    })

    it('疎通確認 - 結果が空だった場合', async () => {
      const getNode = td.replace(storageService, 'getNode')
      td.when(getNode(null, dir1.path)).thenResolve(undefined)

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
    const gql = {
      query: `
        query GetStorageDirDescendants($dirPath: String, $options: GetStorageOptionsInput) {
          storageDirDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        options: { maxResults: 3 },
      },
    }

    it('疎通確認', async () => {
      const getDirDescendants = td.replace(storageService, 'getDirDescendants')
      td.when(getDirDescendants(null, dir1.path, { maxResults: 3 })).thenResolve({
        list: [dir1, dir1_1],
        nextPageToken: 'abcdefg',
      } as GetStorageResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageDirDescendants.list).toEqual(toResponseStorageNodes([dir1, dir1_1]))
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
    const gql = {
      query: `
        query GetStorageDescendants($dirPath: String, $options: GetStorageOptionsInput) {
          storageDescendants(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        options: { maxResults: 3 },
      },
    }

    it('疎通確認', async () => {
      const getDescendants = td.replace(storageService, 'getDescendants')
      td.when(getDescendants(null, dir1.path, { maxResults: 3 })).thenResolve({
        list: [dir1_1],
        nextPageToken: 'abcdefg',
      } as GetStorageResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageDescendants.list).toEqual(toResponseStorageNodes([dir1_1]))
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
    const gql = {
      query: `
        query GetStorageDirChildren($dirPath: String, $options: GetStorageOptionsInput) {
          storageDirChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        options: { maxResults: 3 },
      },
    }

    it('疎通確認', async () => {
      const getDirChildren = td.replace(storageService, 'getDirChildren')
      td.when(getDirChildren(null, dir1.path, { maxResults: 3 })).thenResolve({
        list: [dir1, dir1_1],
        nextPageToken: 'abcdefg',
      } as GetStorageResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageDirChildren.list).toEqual(toResponseStorageNodes([dir1, dir1_1]))
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
    const gql = {
      query: `
        query GetStorageChildren($dirPath: String, $options: GetStorageOptionsInput) {
          storageChildren(dirPath: $dirPath, options: $options) {
            list {
              id nodeType name dir path contentType size share { isPublic uids } created updated
            }
            nextPageToken
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        options: { maxResults: 3 },
      },
    }

    it('疎通確認', async () => {
      const getChildren = td.replace(storageService, 'getChildren')
      td.when(getChildren(null, dir1.path, { maxResults: 3 })).thenResolve({
        list: [dir1_1],
        nextPageToken: 'abcdefg',
      } as GetStorageResult)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageChildren.list).toEqual(toResponseStorageNodes([dir1_1]))
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

  describe('handleUploadedFiles', () => {
    const gql = {
      query: `
        mutation HandleUploadedFiles($filePaths: [String!]!) {
          handleUploadedFiles(filePaths: $filePaths)
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path, dir1_1_fileB.path],
      },
    }

    it('疎通確認', async () => {
      const handleUploadedFiles = td.replace(storageService, 'handleUploadedFiles')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.handleUploadedFiles).toBe(true)

      const exp = td.explain(handleUploadedFiles)
      expect(exp.calls[0].args[0]).toBe(null)
      expect(exp.calls[0].args[1]).toEqual([dir1_1_fileA.path, dir1_1_fileB.path])
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
    const gql = {
      query: `
        mutation CreateStorageDirs($dirPaths: [String!]!) {
          createStorageDirs(dirPaths: $dirPaths) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1_1.path, dir1_2.path],
      },
    }

    it('疎通確認', async () => {
      const createDirs = td.replace(storageService, 'createDirs')
      td.when(createDirs(null, [dir1_1.path, dir1_2.path])).thenResolve([dir1_1, dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.createStorageDirs).toEqual(toResponseStorageNodes([dir1_1, dir1_2]))
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

  describe('removeStorageDirs', () => {
    const gql = {
      query: `
        mutation RemoveStorageDirs($dirPaths: [String!]!) {
          removeStorageDirs(dirPaths: $dirPaths)
        }
      `,
      variables: {
        dirPaths: [dir1.path],
      },
    }

    it('疎通確認', async () => {
      const removeDirs = td.replace(storageService, 'removeDirs')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.removeStorageDirs).toBe(true)

      const exp = td.explain(removeDirs)
      expect(exp.calls[0].args[0]).toBe(null)
      expect(exp.calls[0].args[1]).toEqual([dir1.path])
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

  describe('removeStorageFiles', () => {
    const gql = {
      query: `
        mutation RemoveStorageFiles($filePaths: [String!]!) {
          removeStorageFiles(filePaths: $filePaths)
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path],
      },
    }

    it('疎通確認', async () => {
      const removeFiles = td.replace(storageService, 'removeFiles')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.removeStorageFiles).toBe(true)

      const exp = td.explain(removeFiles)
      expect(exp.calls[0].args[0]).toBe(null)
      expect(exp.calls[0].args[1]).toEqual([dir1_1_fileA.path])
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
    const gql = {
      query: `
        mutation MoveStorageDir($fromDirPath: String!, $toDirPath: String!) {
          moveStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath)
        }
      `,
      variables: {
        fromDirPath: dir1_1.path,
        toDirPath: dir1_2.path,
      },
    }

    it('疎通確認', async () => {
      const moveDir = td.replace(storageService, 'moveDir')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.moveStorageDir).toBe(true)

      const exp = td.explain(moveDir)
      expect(exp.calls[0].args[0]).toBe(null)
      expect(exp.calls[0].args[1]).toEqual(dir1_1.path)
      expect(exp.calls[0].args[2]).toEqual(dir1_2.path)
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
    const gql = {
      query: `
        mutation MoveStorageFile($fromFilePath: String!, $toFilePath: String!) {
          moveStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath)
        }
      `,
      variables: {
        fromFilePath: dir1_1_fileA.path,
        toFilePath: dir1_2_fileA.path,
      },
    }

    it('疎通確認', async () => {
      const moveFile = td.replace(storageService, 'moveFile')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.moveStorageFile).toBe(true)

      const exp = td.explain(moveFile)
      expect(exp.calls[0].args[0]).toBe(null)
      expect(exp.calls[0].args[1]).toEqual(dir1_1_fileA.path)
      expect(exp.calls[0].args[2]).toEqual(dir1_2_fileA.path)
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
    const gql = {
      query: `
        mutation RenameStorageDir($dirPath: String!, $newName: String!) {
          renameStorageDir(dirPath: $dirPath, newName: $newName)
        }
      `,
      variables: {
        dirPath: dir1_1.path,
        newName: dir1_2.name,
      },
    }

    it('疎通確認', async () => {
      const renameDir = td.replace(storageService, 'renameDir')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.renameStorageDir).toBe(true)

      const exp = td.explain(renameDir)
      expect(exp.calls[0].args[0]).toBe(null)
      expect(exp.calls[0].args[1]).toEqual(dir1_1.path)
      expect(exp.calls[0].args[2]).toEqual(dir1_2.name)
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
    const gql = {
      query: `
        mutation RenameStorageFile($filePath: String!, $newName: String!) {
          renameStorageFile(filePath: $filePath, newName: $newName)
        }
      `,
      variables: {
        filePath: dir1_1_fileA.path,
        newName: dir1_1_fileB.name,
      },
    }

    it('疎通確認', async () => {
      const renameFile = td.replace(storageService, 'renameFile')

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.renameStorageFile).toBe(true)

      const exp = td.explain(renameFile)
      expect(exp.calls[0].args[0]).toBe(null)
      expect(exp.calls[0].args[1]).toEqual(dir1_1_fileA.path)
      expect(exp.calls[0].args[2]).toEqual(dir1_1_fileB.name)
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
    const gql = {
      query: `
        mutation SetStorageDirShareSettings($dirPath: String!, $settings: StorageNodeShareSettingsInput!) {
          setStorageDirShareSettings(dirPath: $dirPath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
        settings: SHARE_SETTINGS,
      },
    }

    it('疎通確認', async () => {
      const setDirShareSettings = td.replace(storageService, 'setDirShareSettings')
      td.when(setDirShareSettings(null, dir1.path, SHARE_SETTINGS)).thenResolve(dir1)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.setStorageDirShareSettings).toEqual(toResponseStorageNode(dir1))
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
    const gql = {
      query: `
        mutation SetFileShareSettings($filePath: String!, $settings: StorageNodeShareSettingsInput!) {
          setStorageFileShareSettings(filePath: $filePath, settings: $settings) {
            id nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: dir1_1_fileA.path,
        settings: SHARE_SETTINGS,
      },
    }

    it('疎通確認', async () => {
      const setFileShareSettings = td.replace(storageService, 'setFileShareSettings')
      td.when(setFileShareSettings(null, dir1_1_fileA.path, SHARE_SETTINGS)).thenResolve(dir1_1_fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.setStorageFileShareSettings).toEqual(toResponseStorageNode(dir1_1_fileA))
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
