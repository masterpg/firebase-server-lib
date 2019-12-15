import { MockAppServiceDI, MockStorageServiceDI } from '../../../../mocks/lib'
import { Test } from '@nestjs/testing'
import { initLibTestApp } from '../../../../helpers/lib'

jest.setTimeout(25000)
initLibTestApp()

const GENERAL_USER = { uid: 'yamada.one', customClaims: { storageDir: 'yamada.one' } }

describe('AppService', () => {
  let appService: MockAppServiceDI.type

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      providers: [MockAppServiceDI.provider, MockStorageServiceDI.provider],
    }).compile()

    appService = module.get<MockAppServiceDI.type>(MockAppServiceDI.symbol)
  })

  describe('appConfig', () => {
    it('ベーシックケース', async () => {
      const actual = await appService.appConfig()
      expect(actual.usersDir).toBe('users')
    })
  })

  /**
   * TODO Jest did not exit one second after the test run has completed.
   * admin.auth()の非同期メソッド`getUser()`などを実行すると上記警告が発生する
   */
  describe('customToken', () => {
    it('ベーシックケース', async () => {
      const actual = await appService.customToken(GENERAL_USER as any)
      expect(actual).toBeDefined()
    })
  })
})
