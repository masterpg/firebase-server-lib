import { Test, TestingModule } from '@nestjs/testing'
import { MockCORSGuardGQLModule } from '../../../../../helpers/app/gql/mock'
import { MockCORSGuardRESTModule } from '../../../../../helpers/app/rest/mock'
import { Response } from 'supertest'
import { config } from '../../../../../../src/config'
import { initApp } from '../../../../../../src/app/base'
import request = require('supertest')

jest.setTimeout(25000)
initApp()

//========================================================================
//
//  Tests
//
//========================================================================

describe('CORSGuard', () => {
  let app: any

  beforeEach(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [MockCORSGuardRESTModule, MockCORSGuardGQLModule],
    }).compile()

    app = testingModule.createNestApplication()
    await app.init()
  })

  describe('REST', () => {
    it('ホワイトリストにあるオリジンからのリクエストの場合', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .get('/dummyRESTService/public/settings')
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
        .get('/dummyRESTService/public/settings')
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
        .post('/dummyService')
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
        .post('/dummyService')
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
