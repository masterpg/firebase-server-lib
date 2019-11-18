import { Test, TestingModule } from '@nestjs/testing'
import { requestGQL, verifyNotSignInCase } from '../../../../../helpers/gql.helpers'
import { AppModule } from '../../../../../../src/example/app.module'
import { initFirebaseApp } from '../../../../../../src/lib'

jest.setTimeout(25000)
initFirebaseApp()

describe('StorageResolver', () => {
  let app: any

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  describe('userStorageBasePath', () => {
    const gql = {
      query: `
        query GetUserStorageBasePath {
          userStorageBasePath
        }
      `,
    }

    it('サインインしていない場合', async () => {
      return verifyNotSignInCase(app, gql)
    })
  })

  describe('userStorageDirNodes', () => {
    const gql = {
      query: `
        query GetUserStorageDirNodes {
          userStorageDirNodes { __typename }
        }
      `,
    }

    it('サインインしていない場合', async () => {
      return verifyNotSignInCase(app, gql)
    })
  })

  describe('createUserStorageDirs', () => {
    it('サインインしていない場合', async () => {
      return verifyNotSignInCase(app, {
        query: `
          mutation CreateUserStorageDirs {
            createUserStorageDirs(dirPaths: [
              "dir1/dir1_1"
            ]) { __typename }
          }
        `,
      })
    })
  })

  describe('removeUserStorageFiles', () => {
    const gql = {
      query: `
        mutation RemoveUserStorageFileNodes {
          removeUserStorageFiles(filePaths: [
            "docs/fileA.png"
          ]) { __typename }
        }
      `,
    }

    it('サインインしていない場合', async () => {
      return verifyNotSignInCase(app, gql)
    })
  })

  describe('removeUserStorageDir', () => {
    const gql = {
      query: `
        mutation RemoveUserStorageDirNodes {
          removeUserStorageDir(dirPath: "dir1/dir1_1") { __typename }
        }
      `,
    }

    it('サインインしていない場合', async () => {
      return verifyNotSignInCase(app, gql)
    })
  })

  describe('signedUploadUrls', () => {
    const gql = {
      query: `
        query GetSignedUploadUrls {
          signedUploadUrls(inputs: [
            { filePath: "images/family.png", contentType: "image/png" }
          ])
        }
      `,
    }

    it('サインインしていない場合', async () => {
      return verifyNotSignInCase(app, gql)
    })

    it('アプリケーション管理者でない場合', async () => {
      const actual = await requestGQL(app, gql, {
        headers: {
          Authorization: 'Bearer {"uid": "kanri.one", "isAppAdmin": false}',
        },
      })
      expect(actual.body.errors[0].extensions.exception.status).toBe(403)
    })
  })
})
