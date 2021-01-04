import { AppConfig, DevUtilsServiceDI, DevUtilsServiceModule, EnvServiceDI, EnvServiceModule } from '../../../../../src/app/services'
import { GeneralUser } from '../../../../helpers/app'
import { Test } from '@nestjs/testing'
import { initApp } from '../../../../../src/app/base'

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Tests
//
//========================================================================

beforeAll(async () => {
  const testingModule = await Test.createTestingModule({
    imports: [DevUtilsServiceModule],
  }).compile()

  const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
  await devUtilsService.setTestFirebaseUsers(GeneralUser())
})

describe('EnvService', () => {
  let envService: EnvServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [EnvServiceModule],
    }).compile()

    envService = testingModule.get<EnvServiceDI.type>(EnvServiceDI.symbol)
  })

  describe('appConfig', () => {
    it('ベーシックケース', async () => {
      const actual = await envService.appConfig()
      expect(actual).toEqual({
        storage: {
          user: {
            rootName: 'users',
          },
          article: {
            rootName: 'articles',
            fileName: 'index.md',
            assetsName: 'assets',
          },
        },
      } as AppConfig)
    })
  })
})
