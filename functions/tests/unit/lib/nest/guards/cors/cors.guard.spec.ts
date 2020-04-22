import { Test, TestingModule } from '@nestjs/testing'
import { CORSGuardDI } from '../../../../../../src/lib'
import { MockCORSBaseAppModule } from '../../../../../mocks/lib'
import { Module } from '@nestjs/common'
import { Response } from 'supertest'
import { config } from '../../../../../../src/config'
import { initLibTestApp } from '../../../../../helpers/lib'
const request = require('supertest')

jest.setTimeout(25000)
initLibTestApp()

//========================================================================
//
//  Test helpers
//
//========================================================================

@Module({
  providers: [CORSGuardDI.provider],
  imports: [MockCORSBaseAppModule],
})
class MockAppModule {}

//========================================================================
//
//  Tests
//
//========================================================================

describe('CORSGuard', () => {
  let app: any

  beforeEach(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [MockAppModule],
    }).compile()

    app = testingModule.createNestApplication()
    await app.init()
  })

  describe('REST', () => {
    it('ホワイトリストにあるオリジンからのリクエストの場合', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .get('/rest/unit/public/settings')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', requestOrigin)
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data).toEqual({ publicKey: 'Public Key' })
        })
    })

    it('ホワイトリストにないオリジンからのリクエストの場合', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return request(app.getHttpServer())
        .get('/rest/unit/public/settings')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '')
        .expect(403)
        .then((res: Response) => {
          expect(res.body.data).toBeUndefined()
        })
    })
  })

  describe('GQL', () => {
    const publicSettingsRequestData = {
      query: `
        query GetPublicSettings {
          publicSettings { publicKey }
        }
      `,
    }

    it('ホワイトリストにあるオリジンからのリクエストの場合', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .post('/gql')
        .send(publicSettingsRequestData)
        .set('Content-Type', 'application/json')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', requestOrigin)
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data.publicSettings).toEqual({ publicKey: 'Public Key' })
        })
    })

    it('ホワイトリストにないオリジンからのリクエストの場合', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return request(app.getHttpServer())
        .post('/gql')
        .send(publicSettingsRequestData)
        .set('Content-Type', 'application/json')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '')
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data).toBeNull()
        })
    })
  })
})
