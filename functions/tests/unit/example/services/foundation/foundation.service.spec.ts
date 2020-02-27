import { AppBaseModule } from '../../../../../src/example/app.module'
import { FoundationServiceDI } from '../../../../../src/example/services'
import { Test } from '@nestjs/testing'
import { initApp } from '../../../../../src/example/initializer'

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Test data
//
//========================================================================

const GENERAL_USER = { uid: 'general.user', customClaims: { myDirName: 'general.user' } }

//========================================================================
//
//  Tests
//
//========================================================================

describe('FoundationService', () => {
  let foundationService: FoundationServiceDI.type

  beforeEach(async () => {
    const testingModule = await Test.createTestingModule({
      imports: [AppBaseModule],
    }).compile()

    foundationService = testingModule.get<FoundationServiceDI.type>(FoundationServiceDI.symbol)
  })

  describe('appConfig', () => {
    it('ベーシックケース', async () => {
      const actual = await foundationService.appConfig()
      expect(actual.usersDir).toBe('users')
    })
  })

  /**
   * TODO Jest did not exit one second after the test run has completed.
   * admin.auth()の非同期メソッド`getUser()`などを実行すると上記警告が発生する
   */
  describe('customToken', () => {
    it('ベーシックケース', async () => {
      const actual = await foundationService.customToken(GENERAL_USER as any)
      expect(actual).toBeDefined()
    })
  })
})
