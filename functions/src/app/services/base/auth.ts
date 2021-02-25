import { IdToken } from './types'

//========================================================================
//
//  Implementation
//
//========================================================================

class AuthHelper {
  //----------------------------------------------------------------------
  //
  //  Static
  //
  //----------------------------------------------------------------------

  static isIdToken(value: any): value is IdToken {
    if (
      typeof value.aud === 'string' &&
      typeof value.auth_time === 'number' &&
      typeof value.exp === 'number' &&
      typeof value.firebase?.sign_in_provider === 'string' &&
      typeof value.iat === 'number' &&
      typeof value.iss === 'string' &&
      typeof value.sub === 'string' &&
      typeof value.uid === 'string'
    ) {
      return true
    } else {
      return false
    }
  }
}

//========================================================================
//
//  Exports
//
//========================================================================

export { AuthHelper }
