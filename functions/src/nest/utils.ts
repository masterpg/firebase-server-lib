import { Request, Response } from 'express'
import { ExecutionContext } from '@nestjs/common'
import { GQLContext } from './types'
import { GqlExecutionContext } from '@nestjs/graphql'
import { GraphQLResolveInfo } from 'graphql'

export function getAllExecutionContext(context: ExecutionContext): { req: Request; res: Response; info?: GraphQLResolveInfo } {
  const gqlExecContext = GqlExecutionContext.create(context)
  let info: GraphQLResolveInfo | undefined = gqlExecContext.getInfo<GraphQLResolveInfo>()
  const gqlContext = gqlExecContext.getContext<GQLContext>()
  let req: Request = gqlContext.req
  let res: Response = gqlContext.res

  if (!req || !res || !info) {
    const httpContext = context.switchToHttp()
    req = httpContext.getRequest()
    res = httpContext.getResponse()
    info = undefined
  }

  return { req, res, info }
}
