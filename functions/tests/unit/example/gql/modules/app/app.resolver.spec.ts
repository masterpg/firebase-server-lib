import { Test, TestingModule } from '@nestjs/testing'
import { requestGQL, verifyNotSignInGQLResponse } from '../../../../../helpers/example'
import { AppModule } from '../../../../../../src/example/app.module'
import { initApp } from '../../../../../../src/example/initializer'

jest.setTimeout(25000)
initApp()

const authorizationHeader = {
  Authorization: `Bearer {"uid": "general.user", "storageDir": "general.user"}`,
}

describe('AppResolver', () => {
  let app: any

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  describe('appConfig', () => {
    const gql = {
      query: `
        query GetAppConfig {
          appConfig { __typename }
        }
      `,
    }

    it('疎通確認', async () => {
      const response = await requestGQL(app, gql)
      const appConfig = response.body.data.appConfig
      expect(appConfig.__typename).toBe('AppConfigResponse')
    })
  })

  /**
   * TODO Jest did not exit one second after the test run has completed.
   * admin.auth()の非同期メソッド`getUser()`などを実行すると上記警告が発生する
   */
  describe('customToken', () => {
    const gql = {
      query: `
        query GetCustomToken {
          customToken
        }
      `,
    }

    it('疎通確認', async () => {
      const response = await requestGQL(app, gql, {
        headers: Object.assign({}, authorizationHeader),
      })
      const customToken = response.body.data.customToken
      expect(customToken).toBeDefined()
    })

    it('サインインしていない場合', async () => {
      const response = await requestGQL(app, gql)
      await verifyNotSignInGQLResponse(response)
    })
  })
})
