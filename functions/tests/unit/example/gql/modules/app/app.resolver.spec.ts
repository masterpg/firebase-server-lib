import { Test, TestingModule } from '@nestjs/testing'
import { requestGQL, verifyNotSignInGQLResponse } from '../../../../../helpers/example'
import { AppModule } from '../../../../../../src/example/app.module'
import { initApp } from '../../../../../../src/example/initializer'

jest.setTimeout(25000)
initApp()

const authorizationHeader = {
  Authorization: `Bearer {"uid": "yamada.one"}`,
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
