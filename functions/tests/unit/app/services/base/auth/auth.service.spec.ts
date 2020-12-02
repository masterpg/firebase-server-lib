import { APP_ADMIN_USER, APP_ADMIN_USER_HEADER, GENERAL_USER, GENERAL_USER_HEADER } from '../../../../../helpers/app'
import { AuthStatus, DevUtilsServiceDI, DevUtilsServiceModule, UserIdClaims } from '../../../../../../src/app/services'
import { Test, TestingModule } from '@nestjs/testing'
import { MockGQLModule } from '../../../../../helpers/app/gql'
import { MockRESTModule } from '../../../../../helpers/app/rest'
import { Response } from 'supertest'
import { initApp } from '../../../../../../src/app/base'
import request = require('supertest')

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
  await devUtilsService.setTestFirebaseUsers(APP_ADMIN_USER, GENERAL_USER)
})

describe('AuthService', () => {
  let app: any

  beforeEach(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [MockRESTModule, MockGQLModule],
    }).compile()

    app = testingModule.createNestApplication()
    await app.init()
  })

  describe('REST', () => {
    it('認証ユーザーが権限を満たしている場合', async () => {
      return (
        request(app.getHttpServer())
          .get('/dummyRESTService/admin/settings')
          // 権限を満たすユーザーを設定
          .set(APP_ADMIN_USER_HEADER)
          .expect(200)
          .then((res: Response) => {
            expect(res.body.data).toEqual({ adminKey: 'Admin Key' })
          })
      )
    })

    it('サインインしていない場合', async () => {
      return request(app.getHttpServer())
        .get('/dummyRESTService/admin/settings')
        .expect(401)
        .then((res: Response) => {
          expect(res.header['www-authenticate']).toEqual(`Bearer realm="token_required"`)
          expect(res.body.data).toBeUndefined()
        })
    })

    it('認証トークンが不正な場合', async () => {
      return (
        request(app.getHttpServer())
          .get('/dummyRESTService/admin/settings')
          // 不正な認証トークンを設定
          .set({ Authorization: `Bearer ABCDEFG` })
          .expect(401)
          .then((res: Response) => {
            expect(res.header['www-authenticate']).toEqual(`Bearer error="invalid_token"`)
            expect(res.body.data).toBeUndefined()
          })
      )
    })

    it('認証ユーザーがまだ利用可能でない場合', async () => {
      const token: UserIdClaims = {
        uid: APP_ADMIN_USER.uid,
        ...APP_ADMIN_USER.customClaims,
        authStatus: AuthStatus.WaitForEntry,
      }
      return (
        request(app.getHttpServer())
          .get('/dummyRESTService/admin/settings')
          // 認証ユーザーがまだ利用可能でないトークンを設定
          .set({ Authorization: `Bearer ${JSON.stringify(token)}` })
          .expect(403)
          .then((res: Response) => {
            expect(res.header['www-authenticate']).toEqual(`Bearer error="insufficient_scope"`)
            expect(res.body.data).toBeUndefined()
          })
      )
    })

    it('認証ユーザーのロール権限が足りない場合', async () => {
      return (
        request(app.getHttpServer())
          .get('/dummyRESTService/admin/settings')
          // ロール権限が足りないユーザーを設定
          .set(GENERAL_USER_HEADER)
          .expect(403)
          .then((res: Response) => {
            expect(res.header['www-authenticate']).toEqual(`Bearer error="insufficient_scope"`)
            expect(res.body.data).toBeUndefined()
          })
      )
    })
  })

  describe('GQL', () => {
    const adminSettingsRequestData = {
      query: `
        query GetAdminSettings {
          adminSettings { adminKey }
        }
      `,
    }

    it('認証ユーザーが権限を満たしている場合', async () => {
      return (
        request(app.getHttpServer())
          .post('/dummyService')
          .send(adminSettingsRequestData)
          .set('Content-Type', 'application/json')
          // 権限を満たすユーザーを設定
          .set(APP_ADMIN_USER_HEADER)
          .expect(200)
          .then((res: Response) => {
            expect(res.body.data.adminSettings).toEqual({ adminKey: 'Admin Key' })
          })
      )
    })

    it('サインインしていない場合', async () => {
      return request(app.getHttpServer())
        .post('/dummyService')
        .send(adminSettingsRequestData)
        .set('Content-Type', 'application/json')
        .expect(200)
        .then((res: Response) => {
          expect(res.header['www-authenticate']).toEqual(`Bearer realm="token_required"`)
          expect(res.body.data).toBeNull()
        })
    })

    it('認証トークンが不正な場合', async () => {
      return (
        request(app.getHttpServer())
          .post('/dummyService')
          .send(adminSettingsRequestData)
          .set('Content-Type', 'application/json')
          // 不正な認証トークンを設定
          .set({ Authorization: `Bearer ABCDEFG` })
          .expect(200)
          .then((res: Response) => {
            expect(res.header['www-authenticate']).toEqual(`Bearer error="invalid_token"`)
            expect(res.body.data).toBeNull()
          })
      )
    })

    it('認証ユーザーがまだ利用可能でない場合', async () => {
      const token: UserIdClaims = {
        uid: APP_ADMIN_USER.uid,
        ...APP_ADMIN_USER.customClaims,
        authStatus: AuthStatus.WaitForEntry,
      }
      return (
        request(app.getHttpServer())
          .post('/dummyService')
          .send(adminSettingsRequestData)
          .set('Content-Type', 'application/json')
          // 認証ユーザーがまだ利用可能でないトークンを設定
          .set(GENERAL_USER_HEADER)
          .expect(200)
          .then((res: Response) => {
            expect(res.header['www-authenticate']).toEqual(`Bearer error="insufficient_scope"`)
            expect(res.body.data).toBeNull()
          })
      )
    })

    it('認証ユーザーのロール権限が足りない場合', async () => {
      return (
        request(app.getHttpServer())
          .post('/dummyService')
          .send(adminSettingsRequestData)
          .set('Content-Type', 'application/json')
          // ロール権限が足りないユーザーを設定
          .set(GENERAL_USER_HEADER)
          .expect(200)
          .then((res: Response) => {
            expect(res.header['www-authenticate']).toEqual(`Bearer error="insufficient_scope"`)
            expect(res.body.data).toBeNull()
          })
      )
    })
  })
})
