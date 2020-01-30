import { MockBaseAppModule, MockGQLContainerModule, MockRESTContainerModule } from '../../../../../mocks/lib'
import { Test, TestingModule } from '@nestjs/testing'
import { Module } from '@nestjs/common'
import { Response } from 'supertest'
import { config } from '../../../../../../src/lib/base'
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
  imports: [MockBaseAppModule, MockRESTContainerModule, MockGQLContainerModule],
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
      const requestOrigin = config.cors.whitelist[0]
      return (
        request(app.getHttpServer())
          .get('/api/rest/site/admin/config')
          // 権限を満たすユーザーを設定
          .set(APP_ADMIN_USER_HEADER)
          .expect(200)
          .then((res: Response) => {
            expect(res.body.data).toEqual({ uid: APP_ADMIN_USER.uid, apiKey: '162738495' })
          })
      )
    })

    it('サインインしていない場合', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .get('/api/rest/site/admin/config')
        .expect(401)
        .then((res: Response) => {
          expect(res.header['www-authenticate']).toEqual(`Bearer realm="token_required"`)
          expect(res.body.data).toBeUndefined()
        })
    })

    it('認証トークンが不正な場合', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return (
        request(app.getHttpServer())
          .get('/api/rest/site/admin/config')
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
      const requestOrigin = config.cors.whitelist[0]
      return (
        request(app.getHttpServer())
          .get('/api/rest/site/admin/config')
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
    const getSiteAdminConfigRequestData = {
      query: `
        query GetSiteAdminConfig {
          siteAdminConfig { uid apiKey }
        }
      `,
    }

    it('認証ユーザーが権限を満たしている場合', async () => {
      return (
        request(app.getHttpServer())
          .post('/api/gql')
          .send(getSiteAdminConfigRequestData)
          .set('Content-Type', 'application/json')
          // 権限を満たすユーザーを設定
          .set(APP_ADMIN_USER_HEADER)
          .expect(200)
          .then((res: Response) => {
            expect(res.body.data.siteAdminConfig).toEqual({ uid: APP_ADMIN_USER.uid, apiKey: '162738495' })
          })
      )
    })

    it('サインインしていない場合', async () => {
      return request(app.getHttpServer())
        .post('/api/gql')
        .send(getSiteAdminConfigRequestData)
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
          .post('/api/gql')
          .send(getSiteAdminConfigRequestData)
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
          .post('/api/gql')
          .send(getSiteAdminConfigRequestData)
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
