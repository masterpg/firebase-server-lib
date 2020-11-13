import { Test, TestingModule } from '@nestjs/testing'
import { DummyCORSGQLModule } from '../../../../../mocks/app/gql/dummy'
import { DummyCORSRESTModule } from '../../../../../mocks/app/rest/dummy'
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

describe('CORSService', () => {
  let app: any

  beforeEach(async () => {
    const testingModule: TestingModule = await Test.createTestingModule({
      imports: [DummyCORSRESTModule, DummyCORSGQLModule],
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
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data).toEqual({ publicKey: 'Public Key' })
        })
    })

    it('ホワイトリストにあるオリジンからのリクエストの場合 - プリフライトリクエスト', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .options('/dummyRESTService/public/settings')
        .set('Origin', requestOrigin)
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .set('Access-Control-Request-Method', 'GET')
        .expect('Access-Control-Allow-Origin', requestOrigin)
        .expect('Content-Length', '0')
        .expect(204)
    })

    it('ホワイトリストにないオリジンからのリクエストの場合 - プリフライトリクエスト', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return request(app.getHttpServer())
        .options('/dummyRESTService/public/settings')
        .set('Origin', requestOrigin)
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .set('Access-Control-Request-Method', 'GET')
        .expect('Access-Control-Allow-Origin', '')
        .expect('Content-Length', '0')
        .expect(204)
    })

    it('CORSの除外リストに設定されているURLにアクセスした場合 - リクエストオリジンあり', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return request(app.getHttpServer())
        .get('/dummyRESTService/partner/settings')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '*')
        .expect(200)
        .then((res: Response) => {
          // 正常にレスポンスを受け取れることを検証
          expect(res.body.data).toEqual({ partnerKey: 'Partner Key' })
        })
    })

    it('CORSの除外リストに設定されているURLにアクセスした場合 - リクエストオリジンなし', async () => {
      return request(app.getHttpServer())
        .get('/dummyRESTService/partner/settings')
        .expect(200)
        .then((res: Response) => {
          // 正常にレスポンスを受け取れることを検証
          expect(res.get('Access-Control-Allow-Origin')).toBe('*')
          expect(res.body.data).toEqual({ partnerKey: 'Partner Key' })
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
        .expect('Access-Control-Allow-Origin', '*')
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data.publicSettings).toEqual({ publicKey: 'Public Key' })
        })
    })

    it('ホワイトリストにないオリジンからのリクエストの場合', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return (
        request(app.getHttpServer())
          .post('/dummyService')
          .send(publicSettingsRequestData)
          .set('Content-Type', 'application/json')
          .set('Origin', requestOrigin)
          // ここではGraphQLライブラリにより'*'が設定される。
          // つまりRESTツール等でアクセスすれば結果を取得できることを意味する。
          // ただしプリフライトリクエストでは空文字が設定されるので、ブラウザのJSでは結果を取得できない。
          // ※ ブラウザは本来のリクエストの前にプリフライトリクエストを送信する
          .expect('Access-Control-Allow-Origin', '*')
          .expect(200)
          .then((res: Response) => {
            expect(res.body.data.publicSettings).toEqual({ publicKey: 'Public Key' })
          })
      )
    })

    it('ホワイトリストにあるオリジンからのリクエストの場合 - プリフライトリクエスト', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .options('/dummyService')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .set('Access-Control-Request-Method', 'POST')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', requestOrigin)
        .expect('Content-Length', '0')
        .expect(204)
    })

    it('ホワイトリストにないオリジンからのリクエストの場合 - プリフライトリクエスト', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return request(app.getHttpServer())
        .options('/dummyService')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .set('Access-Control-Request-Method', 'POST')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '')
        .expect('Content-Length', '0')
        .expect(204)
    })
  })
})
