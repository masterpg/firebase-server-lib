import { Response } from 'supertest'
import { config } from '../../../src/example/base'
const request = require('supertest')

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
    .post('/gql')
    .send(gql)
    .set('Origin', config.cors.whitelist[0])
    .set('Content-Type', 'application/json')
    .set(headers)
    .expect(200)
}

export function verifyNotSignInGQLResponse(res: Response): void {
  expect(res.body.errors[0].extensions.exception.status).toBe(403)
}
