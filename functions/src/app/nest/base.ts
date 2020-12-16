import { GqlContextType, GqlExecutionContext } from '@nestjs/graphql'
import { Request, Response } from 'express'
import { ExecutionContext } from '@nestjs/common'
import { GraphQLResolveInfo } from 'graphql'

//========================================================================
//
//  Interfaces
//
//========================================================================

interface GQLContext {
  readonly req: Request
  readonly res: Response
}

//========================================================================
//
//  Implementation
//
//========================================================================

function getAllExecutionContext(context: ExecutionContext): { req: Request; res: Response; info?: GraphQLResolveInfo } {
  if (context.getType<GqlContextType>() === 'graphql') {
    const gqlExecContext = GqlExecutionContext.create(context)
    const info: GraphQLResolveInfo | undefined = gqlExecContext.getInfo<GraphQLResolveInfo>()
    const gqlContext = gqlExecContext.getContext<GQLContext>()
    const req: Request = gqlContext.req
    const res: Response = gqlContext.res
    return { req, res, info }
  } else {
    const httpContext = context.switchToHttp()
    const req = httpContext.getRequest()
    const res = httpContext.getResponse()
    const info = undefined
    return { req, res, info }
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { GQLContext, getAllExecutionContext }
