import { DevUtilsServiceDI, DevUtilsServiceModule } from '../../../../../src/lib'
import { GENERAL_USER, GENERAL_USER_HEADER } from '../../../../helpers/common/data'
import { getGQLErrorStatus, requestGQL } from '../../../../helpers/common/gql'
import GQLContainerModule from '../../../../../src/example/gql/gql.module'
import { Test } from '@nestjs/testing'
import { initApp } from '../../../../../src/example/base'

jest.setTimeout(25000)
initApp()

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  await devUtilsService.setTestFirebaseUsers(GENERAL_USER)
})

describe('FoundationResolver', () => {
  let app: any

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [GQLContainerModule],
    }).compile()

    app = testingModule.createNestApplication()
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
})
