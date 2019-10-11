import { Request, Response } from 'express'

export interface GQLContext {
  readonly req: Request
  readonly res: Response
}
