import { AppConfigResponse, FoundationServiceDI } from '../../../../../src/example/services'
import { DevUtilsServiceDI, DevUtilsServiceModule } from '../../../../../src/lib'
import { GENERAL_USER } from '../../../../helpers/common/data'
import GQLContainerModule from '../../../../../src/example/gql/gql.module'
import { Test } from '@nestjs/testing'
import { initApp } from '../../../../../src/example/base'

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

describe('FoundationService', () => {
  let foundationService: FoundationServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [GQLContainerModule],
    }).compile()

    foundationService = testingModule.get<FoundationServiceDI.type>(FoundationServiceDI.symbol)
  })

  describe('appConfig', () => {
    it('ベーシックケース', async () => {
      const actual = await foundationService.appConfig()
      expect(actual.users).toEqual({
        dir: 'users',
      } as AppConfigResponse['users'])
      expect(actual.articles).toEqual({
        dir: 'articles',
        assetsDir: 'articles/assets',
        fileName: '__index__.md',
      } as AppConfigResponse['articles'])
    })
  })
})
