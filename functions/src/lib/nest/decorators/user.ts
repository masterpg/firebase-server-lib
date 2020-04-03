import { ExecutionContext, createParamDecorator } from '@nestjs/common'
import { GQLContext } from '../types'
import { GraphQLResolveInfo } from 'graphql'
import { Request } from 'express'

export const User = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const type = ctx.getType() as 'http' | 'graphql'
  let req!: Request

  if (type === 'graphql') {
    const gqlContext = ctx.getArgByIndex(2) as GQLContext
    const info = ctx.getArgByIndex(2) as GraphQLResolveInfo
    req = gqlContext.req
  } else if (type === 'http') {
    req = ctx.switchToHttp().getRequest()
  }

  return (req as any).__idToken
})
