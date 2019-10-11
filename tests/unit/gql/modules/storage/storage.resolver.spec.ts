import { Test, TestingModule } from '@nestjs/testing'
import { AppModule } from '../../../../../src/app.module'
import { Response } from 'supertest'
import { initFirebaseApp } from '../../../../../src/base/firebase'
import { verifyGQLNotSignInCase } from '../../../../helper/gql'
const request = require('supertest')

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
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
        query: `
          query GetUserStorageBasePath {
            userStorageBasePath
          }
        `,
      })
    })
  })

  describe('userStorageDirNodes', () => {
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
        query: `
          query GetUserStorageDirNodes {
            userStorageDirNodes { __typename }
          }
        `,
      })
    })
  })

  describe('createUserStorageDirs', () => {
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
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
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
        query: `
          mutation RemoveUserStorageFileNodes {
            removeUserStorageFiles(filePaths: [
              "docs/fileA.png"
            ]) { __typename }
          }
        `,
      })
    })
  })

  describe('removeUserStorageDir', () => {
    it('サインインしていない場合', async () => {
      return verifyGQLNotSignInCase(app, {
        query: `
          mutation RemoveUserStorageDirNodes {
            removeUserStorageDir(dirPath: "dir1/dir1_1") { __typename }
          }
        `,
      })
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
      return verifyGQLNotSignInCase(app, gql)
    })

    it('アプリケーション管理者でない場合', async () => {
      return (
        request(app.getHttpServer())
          .post('/gql')
          .send(gql)
          .set('Content-Type', 'application/json')
          // アプリケーション管理者でない
          .set('Authorization', 'Bearer {"uid": "taro.yamada", "isAppAdmin": false}')
          .expect(200)
          .then((res: Response) => {
            expect(res.body.errors[0].extensions.exception.status).toBe(403)
          })
      )
    })
  })
})
