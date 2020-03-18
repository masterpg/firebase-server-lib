import { Test, TestingModule } from '@nestjs/testing'
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
  imports: [MockCORSBaseAppModule],
})
class MockAppModule {}

//========================================================================
//
//  Tests
//
//========================================================================

describe('CORSService', () => {
  let app: any

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [MockAppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  describe('REST', () => {
    it('ホワイトリストにあるオリジンからのリクエストの場合', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .get('/rest/products')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', requestOrigin)
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data).toEqual([{ id: 'product1', name: 'Product1' }])
        })
    })

    it('ホワイトリストにないオリジンからのリクエストの場合', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return request(app.getHttpServer())
        .get('/rest/products')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '')
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data).toEqual([{ id: 'product1', name: 'Product1' }])
        })
    })

    it('ホワイトリストにあるオリジンからのリクエストの場合 - プリフライトリクエスト', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .options('/rest/products')
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
        .options('/rest/products')
        .set('Origin', requestOrigin)
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .set('Access-Control-Request-Method', 'GET')
        .expect('Access-Control-Allow-Origin', '')
        .expect('Content-Length', '0')
        .expect(204)
    })

    it('除外リストが設定されている場合 - リクエストオリジンあり', async () => {
      // 除外リストの設定は`functions/functions.env.test.sh`を参照
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return request(app.getHttpServer())
        .get('/rest/site/public/config')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '*')
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data).toEqual({ siteName: 'TestSite' })
        })
    })

    it('除外リストが設定されている場合 - リクエストオリジンなし', async () => {
      // 除外リストの設定は`functions/functions.env.test.sh`を参照
      return request(app.getHttpServer())
        .get('/rest/site/public/config')
        .expect(200)
        .then((res: Response) => {
          expect(res.get('Access-Control-Allow-Origin')).toBe('*')
          expect(res.body.data).toEqual({ siteName: 'TestSite' })
        })
    })
  })

  describe('GQL', () => {
    const productsRequestData = {
      query: `
        query GetProducts {
          products { id name }
        }
      `,
    }

    const getSitePublicConfigRequestData = {
      query: `
        query GetSitePublicConfig {
          sitePublicConfig { siteName }
        }
      `,
    }

    it('ホワイトリストにあるオリジンからのリクエストの場合', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .post('/gql')
        .send(productsRequestData)
        .set('Content-Type', 'application/json')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '*')
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data.products).toEqual([{ id: 'product1', name: 'Product1' }])
        })
    })

    it('ホワイトリストにないオリジンからのリクエストの場合', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return (
        request(app.getHttpServer())
          .post('/gql')
          .send(productsRequestData)
          .set('Content-Type', 'application/json')
          .set('Origin', requestOrigin)
          // ここではGraphQLライブラリにより'*'が設定される。
          // つまりRESTツール等でアクセスすれば結果を取得できることを意味する。
          // ただしプリフライトリクエストでは空文字が設定されるので、ブラウザのJSでは結果を取得できない。
          // ※ ブラウザは本来のリクエストの前にプリフライトリクエストを送信する
          .expect('Access-Control-Allow-Origin', '*')
          .expect(200)
          .then((res: Response) => {
            expect(res.body.data.products).toEqual([{ id: 'product1', name: 'Product1' }])
          })
      )
    })

    it('ホワイトリストにあるオリジンからのリクエストの場合 - プリフライトリクエスト', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .options('/gql')
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
        .options('/gql')
        .set('Access-Control-Request-Headers', 'authorization,content-type')
        .set('Access-Control-Request-Method', 'POST')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '')
        .expect('Content-Length', '0')
        .expect(204)
    })
  })
})
