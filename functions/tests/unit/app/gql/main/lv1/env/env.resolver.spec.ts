import { DevUtilsServiceDI, DevUtilsServiceModule } from '../../../../../../../src/app/services'
import { GeneralUser, requestGQL } from '../../../../../../helpers/app'
import Lv1GQLContainerModule from '../../../../../../../src/app/gql/main/lv1'
import { Test } from '@nestjs/testing'
import { initApp } from '../../../../../../../src/app/base'

jest.setTimeout(5000)
initApp()

describe('Lv1 Env Resolver', () => {
  let app: any

  beforeAll(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [DevUtilsServiceModule],
    }).compile()

    const devUtilsService = testingModule.get<DevUtilsServiceDI.type>(DevUtilsServiceDI.symbol)
    await devUtilsService.setTestFirebaseUsers(GeneralUser())
  })

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [Lv1GQLContainerModule],
    }).compile()

    app = testingModule.createNestApplication()
    await app.init()
  })

  describe('dummyTest', () => {
    it('ベーシックケース', async () => {})
  })
})
