import { AppConfigResponse, DevUtilsServiceDI, DevUtilsServiceModule, EnvServiceDI } from '../../../../../src/app/services'
import { GENERAL_USER } from '../../../../helpers/app'
import GQLContainerModule from '../../../../../src/app/gql/gql.module'
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
  await devUtilsService.setTestFirebaseUsers(GENERAL_USER)
})

describe('EnvService', () => {
  let envService: EnvServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [GQLContainerModule],
    }).compile()

    envService = testingModule.get<EnvServiceDI.type>(EnvServiceDI.symbol)
  })

  describe('appConfig', () => {
    it('ベーシックケース', async () => {
      const actual = await envService.appConfig()
      expect(actual.user).toEqual({
        rootName: 'users',
      } as AppConfigResponse['user'])
      expect(actual.article).toEqual({
        rootName: 'articles',
        fileName: 'index.md',
        assetsName: 'assets',
      } as AppConfigResponse['article'])
    })
  })
})
