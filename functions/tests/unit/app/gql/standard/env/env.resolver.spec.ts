import { AppConfig, DevUtilsServiceDI, DevUtilsServiceModule } from '../../../../../../src/app/services'
import { GENERAL_USER, requestGQL } from '../../../../../helpers/app'
import StandardGQLContainerModule from '../../../../../../src/app/gql/standard'
import { Test } from '@nestjs/testing'
import { config } from '../../../../../../src/config'
import { initApp } from '../../../../../../src/app/base'

jest.setTimeout(5000)
initApp()

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  await devUtilsService.setTestFirebaseUsers(GENERAL_USER)
})

describe('EnvResolver', () => {
  let app: any

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [StandardGQLContainerModule],
    }).compile()

    app = testingModule.createNestApplication()
    await app.init()
  })

  describe('appConfig', () => {
    const gql = {
      query: `
        query GetAppConfig {
          appConfig { 
            storage {
              user { rootName }
              article { rootName fileName assetsName }
            }
          }
        }
      `,
    }

    it('疎通確認', async () => {
      const response = await requestGQL(app, gql)
      const appConfig = response.body.data.appConfig
      expect(appConfig).toEqual({
        storage: {
          user: config.storage.user,
          article: config.storage.article,
        },
      } as AppConfig)
    })
  })
})
