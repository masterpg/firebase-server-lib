import { ExecutionContext, createParamDecorator } from '@nestjs/common'
import { GQLContext } from '../../nest'

export const GQLCtx = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const type = ctx.getType() as 'http' | 'graphql'

  if (type === 'graphql') {
    return ctx.getArgByIndex(2) as GQLContext
  } else {
    throw new Error('GQLCtx not be used outside of GraphQL Resolver.')
  }
})
