import { Test, TestingModule } from '@nestjs/testing'
import { MockBaseAppModule } from '../../../../../mocks/lib'
import { Module } from '@nestjs/common'
import { Response } from 'supertest'
import { initLibTestApp } from '../../../../../helpers/lib'
const request = require('supertest')

jest.setTimeout(25000)
initLibTestApp()

//========================================================================
//
//  Test data
//
//========================================================================

const GENERAL_USER = { uid: 'general.user', myDirName: 'general.user' }
const GENERAL_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(GENERAL_USER)}` }

const APP_ADMIN_USER = { uid: 'app.admin.user', myDirName: 'app.admin.user', isAppAdmin: true }
const APP_ADMIN_USER_HEADER = { Authorization: `Bearer ${JSON.stringify(APP_ADMIN_USER)}` }

//========================================================================
//
//  Test helpers
//
//========================================================================

@Module({
  imports: [MockBaseAppModule],
})
class MockAppModule {}

//========================================================================
//
//  Tests
//
//========================================================================

describe('AuthService', () => {
  let app: any

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MockAppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  describe('REST', () => {
    it('認証ユーザーが権限を満たしている場合', async () => {
      return (
        request(app.getHttpServer())
          .get('/rest/unit/admin/settings')
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
        .get('/rest/unit/admin/settings')
        .expect(401)
        .then((res: Response) => {
          expect(res.header['www-authenticate']).toEqual(`Bearer realm="token_required"`)
          expect(res.body.data).toBeUndefined()
        })
    })

    it('認証トークンが不正な場合', async () => {
      return (
        request(app.getHttpServer())
          .get('/rest/unit/admin/settings')
          // 不正な認証トークンを設定
          .set({ Authorization: `Bearer ABCDEFG` })
          .expect(401)
          .then((res: Response) => {
            expect(res.header['www-authenticate']).toEqual(`Bearer error="invalid_token"`)
            expect(res.body.data).toBeUndefined()
          })
      )
    })

    it('認証ユーザーのロール権限が足りない場合', async () => {
      return (
        request(app.getHttpServer())
          .get('/rest/unit/admin/settings')
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
          .post('/gql')
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
        .post('/gql')
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
          .post('/gql')
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

    it('認証ユーザーのロール権限が足りない場合', async () => {
      return (
        request(app.getHttpServer())
          .post('/gql')
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
