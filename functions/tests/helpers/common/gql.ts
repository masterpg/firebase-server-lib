import { Response } from 'supertest'
import { config } from '../../../src/config'
import request = require('supertest')

export function requestGQL(
  app: any,
  gql: {
    query?: string
    variables?: Record<string, any>
  },
  options: {
    headers?: { [field: string]: any }
  } = {}
): Promise<Response> {
  const headers: { [field: string]: any } = {}
  if (options.headers) {
    Object.assign(headers, options.headers)
  }
  return request(app.getHttpServer())
    .post('/')
    .send(gql)
    .set('Origin', config.cors.whitelist[0])
    .set('Content-Type', 'application/json')
    .set(headers)
    .expect(200)
}

/**
 * エラーのあったGQLレスポンスからHTTPのエラーコードを取得します。
 * GQLはエラーがあってもHTTPレスポンスは200が返されます。
 * ただしレスポンスの内部では本来のHTTPエラーを保持しているため、
 * 本関数ではこれを取得します。
 * @param res
 */
export function getGQLErrorStatus(res: Response): number {
  return res.body.errors[0].extensions.exception.status
}
