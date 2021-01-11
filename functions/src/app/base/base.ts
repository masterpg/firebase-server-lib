import { BadRequestException } from '@nestjs/common'

//========================================================================
//
//  Implementation
//
//========================================================================

class AppError extends BadRequestException {
  constructor(public readonly cause: string, public readonly detail?: { [field: string]: any }) {
    super('Application Error')
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { AppError }
