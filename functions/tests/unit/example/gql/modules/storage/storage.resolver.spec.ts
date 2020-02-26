import * as path from 'path'
import * as td from 'testdouble'
import { StorageNode, StorageServiceDI } from '../../../../../../src/example/services'
import { StorageNodeShareSettings, StorageNodeType } from '../../../../../../src/lib'
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

  describe('hierarchicalUserStorageDirDescendants', () => {
    const gql = {
      query: `
        query GetHierarchicalUserStorageDirDescendants($dirPath: String) {
          hierarchicalUserStorageDirDescendants(dirPath: $dirPath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getHierarchicalUserDirDescendants = td.replace(storageService, 'getHierarchicalUserDirDescendants')
      td.when(getHierarchicalUserDirDescendants(td.matchers.contains(GENERAL_USER), dir1.path)).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.hierarchicalUserStorageDirDescendants).toEqual(toResponseStorageNodes([dir1_1]))
    })

    it('疎通確認 - td.explain()バージョン', async () => {
      const getHierarchicalUserDirDescendants = td.replace(storageService, 'getHierarchicalUserDirDescendants')
      td.when(getHierarchicalUserDirDescendants(td.matchers.anything(), td.matchers.anything())).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.hierarchicalUserStorageDirDescendants).toEqual(toResponseStorageNodes([dir1_1]))
      const explanation = td.explain(getHierarchicalUserDirDescendants)
      expect(explanation.calls[0].args[0]).toMatchObject(GENERAL_USER)
      expect(explanation.calls[0].args[1]).toBe(dir1.path)
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('hierarchicalUserStorageDirChildren', () => {
    const gql = {
      query: `
        query GetHierarchicalUserStorageDirChildren($dirPath: String) {
          hierarchicalUserStorageDirChildren(dirPath: $dirPath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getHierarchicalUserDirChildren = td.replace(storageService, 'getHierarchicalUserDirChildren')
      td.when(getHierarchicalUserDirChildren(td.matchers.contains(GENERAL_USER), dir1.path)).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.hierarchicalUserStorageDirChildren).toEqual(toResponseStorageNodes([dir1_1]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      expect(getGQLErrorStatus(response)).toBe(401)
    })
  })

  describe('userStorageDirChildren', () => {
    const gql = {
      query: `
        query GetUserStorageDirChildren($dirPath: String) {
          userStorageDirChildren(dirPath: $dirPath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getUserDirChildren = td.replace(storageService, 'getUserDirChildren')
      td.when(getUserDirChildren(td.matchers.contains(GENERAL_USER), dir1.path)).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.userStorageDirChildren).toEqual(toResponseStorageNodes([dir1_1]))
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
          handleUploadedUserFiles(filePaths: $filePaths) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path, dir1_1_fileB.path],
      },
    }

    it('疎通確認', async () => {
      const handleUploadedUserFiles = td.replace(storageService, 'handleUploadedUserFiles')
      td.when(handleUploadedUserFiles(td.matchers.contains(GENERAL_USER), [dir1_1_fileA.path, dir1_1_fileB.path])).thenResolve([
        dir1_1_fileA,
        dir1_1_fileB,
      ])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.handleUploadedUserFiles).toEqual(toResponseStorageNodes([dir1_1_fileA, dir1_1_fileB]))
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
            nodeType name dir path contentType size share { isPublic uids } created updated
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
          removeUserStorageDirs(dirPaths: $dirPaths) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1.path],
      },
    }

    it('疎通確認', async () => {
      const removeUserDirs = td.replace(storageService, 'removeUserDirs')
      td.when(removeUserDirs(td.matchers.contains(GENERAL_USER), [dir1.path])).thenResolve([dir1, dir1_1, dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.removeUserStorageDirs).toEqual(toResponseStorageNodes([dir1, dir1_1, dir1_2]))
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
          removeUserStorageFiles(filePaths: $filePaths) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path],
      },
    }

    it('疎通確認', async () => {
      const removeUserFiles = td.replace(storageService, 'removeUserFiles')
      td.when(removeUserFiles(td.matchers.contains(GENERAL_USER), [dir1_1_fileA.path])).thenResolve([dir1_1_fileA])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.removeUserStorageFiles).toEqual(toResponseStorageNodes([dir1_1_fileA]))
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
          moveUserStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        fromDirPath: dir1_1.path,
        toDirPath: dir1_2.path,
      },
    }

    it('疎通確認', async () => {
      const moveUserDir = td.replace(storageService, 'moveUserDir')
      td.when(moveUserDir(td.matchers.contains(GENERAL_USER), dir1_1.path, dir1_2.path)).thenResolve([dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.moveUserStorageDir).toEqual(toResponseStorageNodes([dir1_2]))
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
          moveUserStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        fromFilePath: dir1_1_fileA.path,
        toFilePath: dir1_2_fileA.path,
      },
    }

    it('疎通確認', async () => {
      const moveUserFile = td.replace(storageService, 'moveUserFile')
      td.when(moveUserFile(td.matchers.contains(GENERAL_USER), dir1_1_fileA.path, dir1_2_fileA.path)).thenResolve(dir1_2_fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.moveUserStorageFile).toEqual(toResponseStorageNode(dir1_2_fileA))
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
          renameUserStorageDir(dirPath: $dirPath, newName: $newName) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1_1.path,
        newName: dir1_2.name,
      },
    }

    it('疎通確認', async () => {
      const renameUserDir = td.replace(storageService, 'renameUserDir')
      td.when(renameUserDir(td.matchers.contains(GENERAL_USER), dir1_1.path, dir1_2.name)).thenResolve([dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.renameUserStorageDir).toEqual(toResponseStorageNodes([dir1_2]))
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
          renameUserStorageFile(filePath: $filePath, newName: $newName) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: dir1_1_fileA.path,
        newName: dir1_1_fileB.name,
      },
    }

    it('疎通確認', async () => {
      const renameUserFile = td.replace(storageService, 'renameUserFile')
      td.when(renameUserFile(td.matchers.contains(GENERAL_USER), dir1_1_fileA.path, dir1_1_fileB.name)).thenResolve(dir1_1_fileB)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.renameUserStorageFile).toEqual(toResponseStorageNode(dir1_1_fileB))
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
            nodeType name dir path contentType size share { isPublic uids } created updated
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
      td.when(setUserDirShareSettings(td.matchers.contains(GENERAL_USER), dir1.path, SHARE_SETTINGS)).thenResolve([dir1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, GENERAL_USER_HEADER),
      })

      expect(response.body.data.setUserStorageDirShareSettings).toEqual(toResponseStorageNodes([dir1]))
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
            nodeType name dir path contentType size share { isPublic uids } created updated
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

  describe('hierarchicalStorageDirDescendants', () => {
    const gql = {
      query: `
        query GetHierarchicalStorageDirDescendants($dirPath: String) {
          hierarchicalStorageDirDescendants(dirPath: $dirPath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getHierarchicalDirDescendants = td.replace(storageService, 'getHierarchicalDirDescendants')
      td.when(getHierarchicalDirDescendants(dir1.path)).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.hierarchicalStorageDirDescendants).toEqual(toResponseStorageNodes([dir1_1]))
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

  describe('hierarchicalStorageDirChildren', () => {
    const gql = {
      query: `
        query GetHierarchicalStorageDirChildren($dirPath: String) {
          hierarchicalStorageDirChildren(dirPath: $dirPath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getHierarchicalDirChildren = td.replace(storageService, 'getHierarchicalDirChildren')
      td.when(getHierarchicalDirChildren(dir1.path)).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.hierarchicalStorageDirChildren).toEqual(toResponseStorageNodes([dir1_1]))
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
        query GetStorageDirChildren($dirPath: String) {
          storageDirChildren(dirPath: $dirPath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getDirChildren = td.replace(storageService, 'getDirChildren')
      td.when(getDirChildren(dir1.path)).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.storageDirChildren).toEqual(toResponseStorageNodes([dir1_1]))
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
          handleUploadedFiles(filePaths: $filePaths) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path, dir1_1_fileB.path],
      },
    }

    it('疎通確認', async () => {
      const handleUploadedFiles = td.replace(storageService, 'handleUploadedFiles')
      td.when(handleUploadedFiles([dir1_1_fileA.path, dir1_1_fileB.path])).thenResolve([dir1_1_fileA, dir1_1_fileB])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.handleUploadedFiles).toEqual(toResponseStorageNodes([dir1_1_fileA, dir1_1_fileB]))
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
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1_1.path, dir1_2.path],
      },
    }

    it('疎通確認', async () => {
      const createDirs = td.replace(storageService, 'createDirs')
      td.when(createDirs([dir1_1.path, dir1_2.path])).thenResolve([dir1_1, dir1_2])

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
        mutation RemoveStorageDirNodes($dirPaths: [String!]!) {
          removeStorageDirs(dirPaths: $dirPaths) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1.path],
      },
    }

    it('疎通確認', async () => {
      const removeDirs = td.replace(storageService, 'removeDirs')
      td.when(removeDirs([dir1.path])).thenResolve([dir1, dir1_1, dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.removeStorageDirs).toEqual(toResponseStorageNodes([dir1, dir1_1, dir1_2]))
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
          removeStorageFiles(filePaths: $filePaths) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path],
      },
    }

    it('疎通確認', async () => {
      const removeFiles = td.replace(storageService, 'removeFiles')
      td.when(removeFiles([dir1_1_fileA.path])).thenResolve([dir1_1_fileA])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.removeStorageFiles).toEqual(toResponseStorageNodes([dir1_1_fileA]))
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
          moveStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        fromDirPath: dir1_1.path,
        toDirPath: dir1_2.path,
      },
    }

    it('疎通確認', async () => {
      const moveDir = td.replace(storageService, 'moveDir')
      td.when(moveDir(dir1_1.path, dir1_2.path)).thenResolve([dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.moveStorageDir).toEqual(toResponseStorageNodes([dir1_2]))
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
          moveStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        fromFilePath: dir1_1_fileA.path,
        toFilePath: dir1_2_fileA.path,
      },
    }

    it('疎通確認', async () => {
      const moveFile = td.replace(storageService, 'moveFile')
      td.when(moveFile(dir1_1_fileA.path, dir1_2_fileA.path)).thenResolve(dir1_2_fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.moveStorageFile).toEqual(toResponseStorageNode(dir1_2_fileA))
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
          renameStorageDir(dirPath: $dirPath, newName: $newName) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        dirPath: dir1_1.path,
        newName: dir1_2.name,
      },
    }

    it('疎通確認', async () => {
      const renameDir = td.replace(storageService, 'renameDir')
      td.when(renameDir(dir1_1.path, dir1_2.name)).thenResolve([dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.renameStorageDir).toEqual(toResponseStorageNodes([dir1_2]))
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
          renameStorageFile(filePath: $filePath, newName: $newName) {
            nodeType name dir path contentType size share { isPublic uids } created updated
          }
        }
      `,
      variables: {
        filePath: dir1_1_fileA.path,
        newName: dir1_1_fileB.name,
      },
    }

    it('疎通確認', async () => {
      const renameFile = td.replace(storageService, 'renameFile')
      td.when(renameFile(dir1_1_fileA.path, dir1_1_fileB.name)).thenResolve(dir1_1_fileB)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.renameStorageFile).toEqual(toResponseStorageNode(dir1_1_fileB))
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
            nodeType name dir path contentType size share { isPublic uids } created updated
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
      td.when(setDirShareSettings(dir1.path, SHARE_SETTINGS)).thenResolve([dir1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, APP_ADMIN_USER_HEADER),
      })

      expect(response.body.data.setStorageDirShareSettings).toEqual(toResponseStorageNodes([dir1]))
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
            nodeType name dir path contentType size share { isPublic uids } created updated
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
      td.when(setFileShareSettings(dir1_1_fileA.path, SHARE_SETTINGS)).thenResolve(dir1_1_fileA)

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
