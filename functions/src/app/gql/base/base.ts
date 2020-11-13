import { Request, Response } from 'express'

//========================================================================
//
//  Interface
//
//========================================================================

interface GQLContext {
  readonly req: Request
  readonly res: Response
}

//========================================================================
//
//  Exports
//
//========================================================================

export { GQLContext }