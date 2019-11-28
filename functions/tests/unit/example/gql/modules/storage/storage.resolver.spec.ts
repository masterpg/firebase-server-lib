import { Test, TestingModule } from '@nestjs/testing'
import { requestGQL, verifyNotSignInGQLResponse } from '../../../../../helpers/example'
import { AppModule } from '../../../../../../src/example/app.module'
import { initApp } from '../../../../../../src/example/initializer'

jest.setTimeout(25000)
initApp()

describe('StorageResolver', () => {
  let app: any

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
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
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })

  describe('createUserStorageDirs', () => {
    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, {
        query: `
          mutation CreateUserStorageDirs {
            createUserStorageDirs(dirPaths: [
              "dir1/dir1_1"
            ]) { __typename }
          }
        `,
      })
      await verifyNotSignInGQLResponse(response)
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
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
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
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
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
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
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
