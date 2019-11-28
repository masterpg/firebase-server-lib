import { MockAppServiceDI } from '../../../../mocks/lib'
import { Test } from '@nestjs/testing'
import { initLibTestApp } from '../../../../helpers/lib'

jest.setTimeout(25000)
initLibTestApp()

const GENERAL_USER = { uid: 'yamada.one', customClaims: { storageDir: 'yamada.one' } }

describe('AppService', () => {
  let appService: MockAppServiceDI.type

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MockAppServiceDI.provider],
    }).compile()

    appService = module.get<MockAppServiceDI.type>(MockAppServiceDI.symbol)
  })

  describe('appConfig', () => {
    it('ベーシックケース', async () => {
      const actual = await appService.appConfig()
      expect(actual.usersDir).toBe('users')
    })
  })

  describe('customToken', () => {
    it('ベーシックケース', async () => {
      const actual = await appService.customToken(GENERAL_USER as any)
      expect(actual).toBeDefined()
    })
  })
})
