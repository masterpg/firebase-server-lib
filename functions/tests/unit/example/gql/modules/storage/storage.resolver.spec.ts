import * as path from 'path'
import * as td from 'testdouble'
import { StorageNode, StorageServiceDI } from '../../../../../../src/example/services'
import { Test, TestingModule } from '@nestjs/testing'
import { requestGQL, verifyNotSignInGQLResponse } from '../../../../../helpers/example'
import { AppModule } from '../../../../../../src/example/app.module'
import { StorageNodeType } from '../../../../../../src/lib/services'
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

const GENERAL_USER = { uid: 'yamada.one', storageDir: 'yamada.one' }
const generalAuthHeader = {
  Authorization: `Bearer {"uid": "${GENERAL_USER.uid}", "storageDir": "${GENERAL_USER.storageDir}"}`,
}

const ADMIN_USER = { uid: 'kanri.one', storageDir: 'kanri.one', isAppAdmin: true }
const adminAuthHeader = {
  Authorization: `Bearer {"uid": "${ADMIN_USER.uid}", "storageDir": "${ADMIN_USER.storageDir}", "isAppAdmin": ${ADMIN_USER.isAppAdmin}}`,
}

const dir1: StorageNode = {
  nodeType: StorageNodeType.Dir,
  name: 'dir1',
  dir: '',
  path: 'dir1',
  created: dayjs(),
  updated: dayjs(),
}

const dir1_1: StorageNode = {
  nodeType: StorageNodeType.Dir,
  name: 'dir1_1',
  dir: dir1.path,
  path: path.join(dir1.path, 'dir1_1'),
  created: dayjs(),
  updated: dayjs(),
}

const dir1_1_fileA: StorageNode = {
  nodeType: StorageNodeType.File,
  name: 'fileA.txt',
  dir: dir1_1.path,
  path: path.join(dir1_1.path, 'fileA.txt'),
  created: dayjs(),
  updated: dayjs(),
}

const dir1_1_fileB: StorageNode = {
  nodeType: StorageNodeType.File,
  name: 'fileB.txt',
  dir: dir1_1.path,
  path: path.join(dir1_1.path, 'fileB.txt'),
  created: dayjs(),
  updated: dayjs(),
}

const dir1_2: StorageNode = {
  nodeType: StorageNodeType.Dir,
  name: 'dir1_2',
  dir: dir1.path,
  path: path.join(dir1.path, 'dir1_2'),
  created: dayjs(),
  updated: dayjs(),
}

const dir1_2_fileA: StorageNode = {
  nodeType: StorageNodeType.Dir,
  name: 'fileA.txt',
  dir: dir1_2.path,
  path: path.join(dir1_2.path, 'fileA.txt'),
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

  describe('userStorageDirNodes', () => {
    const gql = {
      query: `
        query GetUserStorageDirNodes($dirPath: String) {
          userStorageDirNodes(dirPath: $dirPath) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getUserStorageDirNodes = td.replace(storageService, 'getUserStorageDirNodes')
      td.when(getUserStorageDirNodes(td.matchers.contains(GENERAL_USER), dir1.path)).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })

      expect(response.body.data.userStorageDirNodes).toEqual(toResponseStorageNodes([dir1_1]))
    })

    // it('疎通確認', async () => {
    //   const getUserStorageDirNodes = td.replace(storageService, 'getUserStorageDirNodes')
    //   td.when(getUserStorageDirNodes(td.matchers.anything(), td.matchers.anything())).thenResolve([dir1_1])
    //
    //   const response = await requestGQL(app, gql, {
    //     headers: Object.assign({}, generalAuthHeader),
    //   })
    //
    //   expect(response.body.data.userStorageDirNodes).toEqual(toResponseStorageNodes([dir1_1]))
    //   const explanation = td.explain(getUserStorageDirNodes)
    //   expect(explanation.calls[0].args[0]).toMatchObject(GENERAL_USER)
    //   expect(explanation.calls[0].args[1]).toBe(dir1.path)
    // })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('createUserStorageDirs', () => {
    const gql = {
      query: `
        mutation CreateUserStorageDirs($dirPaths: [String!]!) {
          createUserStorageDirs(dirPaths: $dirPaths) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1_1.path, dir1_2.path],
      },
    }

    it('疎通確認', async () => {
      const createUserStorageDirs = td.replace(storageService, 'createUserStorageDirs')
      td.when(createUserStorageDirs(td.matchers.contains(GENERAL_USER), [dir1_1.path, dir1_2.path])).thenResolve([dir1_1, dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })

      expect(response.body.data.createUserStorageDirs).toEqual(toResponseStorageNodes([dir1_1, dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('removeUserStorageDirs', () => {
    const gql = {
      query: `
        mutation RemoveUserStorageDirs($dirPaths: [String!]!) {
          removeUserStorageDirs(dirPaths: $dirPaths) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1.path],
      },
    }

    it('疎通確認', async () => {
      const removeUserStorageDirs = td.replace(storageService, 'removeUserStorageDirs')
      td.when(removeUserStorageDirs(td.matchers.contains(GENERAL_USER), [dir1.path])).thenResolve([dir1, dir1_1, dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })

      expect(response.body.data.removeUserStorageDirs).toEqual(toResponseStorageNodes([dir1, dir1_1, dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('removeUserStorageFiles', () => {
    const gql = {
      query: `
        mutation RemoveUserStorageFiles($filePaths: [String!]!) {
          removeUserStorageFiles(filePaths: $filePaths) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path],
      },
    }

    it('疎通確認', async () => {
      const removeUserStorageFiles = td.replace(storageService, 'removeUserStorageFiles')
      td.when(removeUserStorageFiles(td.matchers.contains(GENERAL_USER), [dir1_1_fileA.path])).thenResolve([dir1_1_fileA])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })

      expect(response.body.data.removeUserStorageFiles).toEqual(toResponseStorageNodes([dir1_1_fileA]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('moveUserStorageDir', () => {
    const gql = {
      query: `
        mutation MoveUserStorageDir($fromDirPath: String!, $toDirPath: String!) {
          moveUserStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        fromDirPath: dir1_1.path,
        toDirPath: dir1_2.path,
      },
    }

    it('疎通確認', async () => {
      const moveUserStorageDir = td.replace(storageService, 'moveUserStorageDir')
      td.when(moveUserStorageDir(td.matchers.contains(GENERAL_USER), dir1_1.path, dir1_2.path)).thenResolve([dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })

      expect(response.body.data.moveUserStorageDir).toEqual(toResponseStorageNodes([dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('moveUserStorageFile', () => {
    const gql = {
      query: `
        mutation MoveUserStorageFile($fromFilePath: String!, $toFilePath: String!) {
          moveUserStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        fromFilePath: dir1_1_fileA.path,
        toFilePath: dir1_2_fileA.path,
      },
    }

    it('疎通確認', async () => {
      const moveUserStorageFile = td.replace(storageService, 'moveUserStorageFile')
      td.when(moveUserStorageFile(td.matchers.contains(GENERAL_USER), dir1_1_fileA.path, dir1_2_fileA.path)).thenResolve(dir1_2_fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })

      expect(response.body.data.moveUserStorageFile).toEqual(toResponseStorageNode(dir1_2_fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('renameUserStorageDir', () => {
    const gql = {
      query: `
        mutation RenameUserStorageDir($dirPath: String!, $newName: String!) {
          renameUserStorageDir(dirPath: $dirPath, newName: $newName) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        dirPath: dir1_1.path,
        newName: dir1_2.name,
      },
    }

    it('疎通確認', async () => {
      const renameUserStorageDir = td.replace(storageService, 'renameUserStorageDir')
      td.when(renameUserStorageDir(td.matchers.contains(GENERAL_USER), dir1_1.path, dir1_2.name)).thenResolve([dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })

      expect(response.body.data.renameUserStorageDir).toEqual(toResponseStorageNodes([dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('renameUserStorageFile', () => {
    const gql = {
      query: `
        mutation RenameUserStorageFile($filePath: String!, $newName: String!) {
          renameUserStorageFile(filePath: $filePath, newName: $newName) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        filePath: dir1_1_fileA.path,
        newName: dir1_1_fileB.name,
      },
    }

    it('疎通確認', async () => {
      const renameUserStorageFile = td.replace(storageService, 'renameUserStorageFile')
      td.when(renameUserStorageFile(td.matchers.contains(GENERAL_USER), dir1_1_fileA.path, dir1_1_fileB.name)).thenResolve(dir1_1_fileB)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })

      expect(response.body.data.renameUserStorageFile).toEqual(toResponseStorageNode(dir1_1_fileB))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
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
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.signedUploadUrls).toEqual(['xxx'])
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })

  describe('storageDirNodes', () => {
    const gql = {
      query: `
        query GetStorageDirNodes($dirPath: String) {
          storageDirNodes(dirPath: $dirPath) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        dirPath: dir1.path,
      },
    }

    it('疎通確認', async () => {
      const getStorageDirNodes = td.replace(storageService, 'getStorageDirNodes')
      td.when(getStorageDirNodes(dir1.path)).thenResolve([dir1_1])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.storageDirNodes).toEqual(toResponseStorageNodes([dir1_1]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })

  describe('createStorageDirs', () => {
    const gql = {
      query: `
        mutation CreateStorageDirs($dirPaths: [String!]!) {
          createStorageDirs(dirPaths: $dirPaths) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1_1.path, dir1_2.path],
      },
    }

    it('疎通確認', async () => {
      const createStorageDirs = td.replace(storageService, 'createStorageDirs')
      td.when(createStorageDirs([dir1_1.path, dir1_2.path])).thenResolve([dir1_1, dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.createStorageDirs).toEqual(toResponseStorageNodes([dir1_1, dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })

  describe('removeStorageDirs', () => {
    const gql = {
      query: `
        mutation RemoveStorageDirNodes($dirPaths: [String!]!) {
          removeStorageDirs(dirPaths: $dirPaths) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        dirPaths: [dir1.path],
      },
    }

    it('疎通確認', async () => {
      const removeStorageDirs = td.replace(storageService, 'removeStorageDirs')
      td.when(removeStorageDirs([dir1.path])).thenResolve([dir1, dir1_1, dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.removeStorageDirs).toEqual(toResponseStorageNodes([dir1, dir1_1, dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })

  describe('removeStorageFiles', () => {
    const gql = {
      query: `
        mutation RemoveStorageFiles($filePaths: [String!]!) {
          removeStorageFiles(filePaths: $filePaths) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        filePaths: [dir1_1_fileA.path],
      },
    }

    it('疎通確認', async () => {
      const removeStorageFiles = td.replace(storageService, 'removeStorageFiles')
      td.when(removeStorageFiles([dir1_1_fileA.path])).thenResolve([dir1_1_fileA])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.removeStorageFiles).toEqual(toResponseStorageNodes([dir1_1_fileA]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })

  describe('moveStorageDir', () => {
    const gql = {
      query: `
        mutation MoveStorageDir($fromDirPath: String!, $toDirPath: String!) {
          moveStorageDir(fromDirPath: $fromDirPath, toDirPath: $toDirPath) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        fromDirPath: dir1_1.path,
        toDirPath: dir1_2.path,
      },
    }

    it('疎通確認', async () => {
      const moveStorageDir = td.replace(storageService, 'moveStorageDir')
      td.when(moveStorageDir(dir1_1.path, dir1_2.path)).thenResolve([dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.moveStorageDir).toEqual(toResponseStorageNodes([dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })

  describe('moveStorageFile', () => {
    const gql = {
      query: `
        mutation MoveStorageFile($fromFilePath: String!, $toFilePath: String!) {
          moveStorageFile(fromFilePath: $fromFilePath, toFilePath: $toFilePath) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        fromFilePath: dir1_1_fileA.path,
        toFilePath: dir1_2_fileA.path,
      },
    }

    it('疎通確認', async () => {
      const moveStorageFile = td.replace(storageService, 'moveStorageFile')
      td.when(moveStorageFile(dir1_1_fileA.path, dir1_2_fileA.path)).thenResolve(dir1_2_fileA)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.moveStorageFile).toEqual(toResponseStorageNode(dir1_2_fileA))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })

  describe('renameStorageDir', () => {
    const gql = {
      query: `
        mutation RenameStorageDir($dirPath: String!, $newName: String!) {
          renameStorageDir(dirPath: $dirPath, newName: $newName) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        dirPath: dir1_1.path,
        newName: dir1_2.name,
      },
    }

    it('疎通確認', async () => {
      const renameStorageDir = td.replace(storageService, 'renameStorageDir')
      td.when(renameStorageDir(dir1_1.path, dir1_2.name)).thenResolve([dir1_2])

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.renameStorageDir).toEqual(toResponseStorageNodes([dir1_2]))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })

  describe('renameStorageFile', () => {
    const gql = {
      query: `
        mutation RenameStorageFile($filePath: String!, $newName: String!) {
          renameStorageFile(filePath: $filePath, newName: $newName) {
            nodeType name dir path created updated
          }
        }
      `,
      variables: {
        filePath: dir1_1_fileA.path,
        newName: dir1_1_fileB.name,
      },
    }

    it('疎通確認', async () => {
      const renameStorageFile = td.replace(storageService, 'renameStorageFile')
      td.when(renameStorageFile(dir1_1_fileA.path, dir1_1_fileB.name)).thenResolve(dir1_1_fileB)

      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, adminAuthHeader),
      })

      expect(response.body.data.renameStorageFile).toEqual(toResponseStorageNode(dir1_1_fileB))
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: Object.assign({}, generalAuthHeader),
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })
})
