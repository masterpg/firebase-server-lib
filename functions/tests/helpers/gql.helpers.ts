import { Response } from 'supertest'
import { config } from '../../src/lib'
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

export function verifyNotSignInCase(
  app: any,
  gql: {
    query?: string
    variables?: Record<string, any>
  },
  options: {
    headers?: { [field: string]: any }
  } = {}
): Promise<void> {
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
    .then((res: Response) => {
      expect(res.body.errors[0].extensions.exception.status).toBe(403)
    })
}
