import { GQLContext } from '../../nest'
import { createParamDecorator } from '@nestjs/common'

export const GQLCtx = createParamDecorator((data, [root, args, ctx, info]) => ctx as GQLContext)
