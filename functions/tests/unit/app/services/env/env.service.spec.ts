import { DevUtilsServiceDI, DevUtilsServiceModule, EnvServiceDI, EnvServiceModule } from '../../../../../src/app/services'
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

describe('EnvService', () => {
  let envService: EnvServiceDI.type

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule],
    }).compile()

    const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    await devUtilsService.setTestFirebaseUsers(GeneralUser())
  })

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [EnvServiceModule],
    }).compile()

    envService = testingModule.get<EnvServiceDI.type>(EnvServiceDI.symbol)
  })

  describe('dummyTest', () => {
    it('ベーシックケース', async () => {})
  })
})
