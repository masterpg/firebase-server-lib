import { CORSGuardDI, config, initFirebaseApp } from '../../../../src'
import { Test, TestingModule } from '@nestjs/testing'
import { MockCORSBaseAppModule } from '../../../tools/app.modules'
import { MockGQLContainerModule } from '../../../tools/gql.modules'
import { MockRESTContainerModule } from '../../../tools/rest.modules'
import { Module } from '@nestjs/common'
import { Response } from 'supertest'
const request = require('supertest')

jest.setTimeout(25000)
initFirebaseApp()

@Module({
  providers: [CORSGuardDI.provider],
  imports: [MockCORSBaseAppModule, MockRESTContainerModule, MockGQLContainerModule],
})
class MockAppModule {}

describe('CORSGuard', () => {
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
        .get('/unit/rest/products')
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
        .get('/unit/rest/products')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', '')
        .expect(403)
        .then((res: Response) => {
          expect(res.body.data).toBeUndefined()
        })
    })
  })

  describe('GQL', () => {
    const gqlRequestData = {
      query: `
        query GetProducts {
          products { id name }
        }
      `,
    }

    it('ホワイトリストにあるオリジンからのリクエストの場合', async () => {
      const requestOrigin = config.cors.whitelist[0]
      return request(app.getHttpServer())
        .post('/unit/gql')
        .send(gqlRequestData)
        .set('Content-Type', 'application/json')
        .set('Origin', requestOrigin)
        .expect('Access-Control-Allow-Origin', requestOrigin)
        .expect(200)
        .then((res: Response) => {
          expect(res.body.data.products).toEqual([{ id: 'product1', name: 'Product1' }])
        })
    })

    it('ホワイトリストにないオリジンからのリクエストの場合', async () => {
      const requestOrigin = 'http://aaa.bbb.ccc.co.jp'
      return request(app.getHttpServer())
        .post('/unit/gql')
        .send(gqlRequestData)
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
