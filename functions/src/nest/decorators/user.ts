import { GQLContext } from '../types'
import { GraphQLResolveInfo } from 'graphql'
import { Request } from 'express'
import { createParamDecorator } from '@nestjs/common'

export const User = createParamDecorator((data, reqOrGQLParams) => {
  let req: Request
  if (Array.isArray(reqOrGQLParams)) {
    const root = reqOrGQLParams[0]
    const args = reqOrGQLParams[1]
    const ctx = reqOrGQLParams[2] as GQLContext
    const info = reqOrGQLParams[3] as GraphQLResolveInfo
    req = ctx.req
  } else {
    req = reqOrGQLParams as Request
  }

  return (req as any).__idToken
})
