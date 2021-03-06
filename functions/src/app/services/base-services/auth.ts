import * as admin from 'firebase-admin'
import { AuthRoleType, IdToken } from '../base'
import { ForbiddenException, HttpException, Module, UnauthorizedException } from '@nestjs/common'
import { Request, Response } from 'express'
import { HTTPLoggingServiceDI } from './logging'
import { config } from '../../../config'
import dayjs = require('dayjs')

//========================================================================
//
//  Interfaces
//
//========================================================================

interface AuthValidateResult {
  result: boolean
  idToken?: IdToken
  error?: HttpException
}

//========================================================================
//
//  Implementation
//
//========================================================================

abstract class AuthService {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * リクエストヘッダーからIDトークン(ユーザー情報)を取得し、また必要な検証も行います。
   * @param req
   * @param res
   * @param roles
   */
  async validate(req: Request, res: Response, roles?: string[]): Promise<AuthValidateResult>

  /**
   * 指定されたIDトークン(ユーザー情報)の検証を行います。
   * @param idToken
   * @param roles
   */
  async validate(idToken: IdToken, roles?: string[]): Promise<AuthValidateResult>

  async validate(req_or_idToken: Request | IdToken, res_or_roles?: Response | string[], roles?: string[]): Promise<AuthValidateResult> {
    let idToken: IdToken
    let res: Response | undefined

    if (res_or_roles) {
      if (Array.isArray(res_or_roles)) {
        roles = res_or_roles as string[]
      } else {
        res = res_or_roles as Response
      }
    }

    if (typeof (req_or_idToken as any).uid === 'string') {
      idToken = req_or_idToken as IdToken
    } else {
      const req: Request = req_or_idToken as Request
      const validated = await this.validateIdToken(req, res!)
      if (!validated.result) {
        return validated
      }
      idToken = validated.idToken!
    }

    if (idToken.authStatus !== 'Available') {
      res && res.setHeader('WWW-Authenticate', 'Bearer error="insufficient_scope"')
      return {
        result: false,
        error: new ForbiddenException(`Authorization failed because the user '${idToken.uid}' is not available.`),
      }
    }

    for (const role of roles ?? []) {
      if (role === AuthRoleType.AppAdmin) {
        if (!idToken.isAppAdmin) {
          res && res.setHeader('WWW-Authenticate', 'Bearer error="insufficient_scope"')
          return {
            result: false,
            error: new ForbiddenException(`Authorization failed because the user '${idToken.uid}' role is invalid.`),
          }
        }
      }
    }

    return {
      result: true,
      idToken,
    }
  }

  /**
   * リクエストヘッダーからIDトークン(ユーザー情報)を取得し、そのトークンの検証も行います。
   * @param req
   * @param res
   */
  async validateIdToken(req: Request, res: Response): Promise<AuthValidateResult> {
    const encodedIdToken = this.m_getIdToken(req)
    if (!encodedIdToken) {
      res.setHeader('WWW-Authenticate', 'Bearer realm="token_required"')
      return {
        result: false,
        error: new UnauthorizedException('Authorization failed because the ID token could not be obtained from the HTTP request header.'),
      }
    }

    let idToken: IdToken
    try {
      idToken = await this.decodeIdToken(encodedIdToken)
    } catch (err) {
      res.setHeader('WWW-Authenticate', 'Bearer error="invalid_token"')
      return {
        result: false,
        error: new UnauthorizedException('Authorization failed because the ID token decoding failed.'),
      }
    }

    return {
      result: true,
      idToken,
    }
  }

  /**
   * リクエストヘッダーからIDトークン(ユーザー情報)を取得します。
   * このメソッドは検証を行わなず、純粋にIDトークン取得のみを行います。
   * @param req
   */
  async getIdToken(req: Request): Promise<IdToken | undefined> {
    const idToken = this.m_getIdToken(req)
    if (!idToken) return

    let decodedIdToken: IdToken
    try {
      decodedIdToken = await this.decodeIdToken(idToken)
    } catch (err) {
      return
    }

    return decodedIdToken
  }

  //----------------------------------------------------------------------
  //
  //  Internal methods
  //
  //----------------------------------------------------------------------

  protected abstract decodeIdToken(idToken: string): Promise<IdToken>

  private m_getIdToken(req: Request): string {
    // 認証リクエストがFirebase IDトークンを持っているかチェック
    const authorization = req.headers.authorization as string
    if (!(authorization && authorization.startsWith('Bearer ')) && !(req.cookies && req.cookies.__session)) {
      return ''
    }

    let idToken
    // 認証ヘッダーにBearerトークンがある場合、認証ヘッダーからIDトークンを取得
    if (authorization && authorization.startsWith('Bearer ')) {
      idToken = authorization.split('Bearer ')[1]
    }
    // 認証ヘッダーにBearerトークンがない場合、cookieからIDトークンを取得
    else {
      idToken = req.cookies.__session
    }

    return idToken
  }
}

class ProdAuthService extends AuthService {
  protected async decodeIdToken(idToken: string): Promise<IdToken> {
    return await admin.auth().verifyIdToken(idToken)
  }
}

class DevAuthService extends AuthService {
  protected async decodeIdToken(idToken: string): Promise<IdToken> {
    let decodedIdToken: IdToken
    try {
      decodedIdToken = await admin.auth().verifyIdToken(idToken)
    } catch (err) {
      const now = dayjs()
      // 開発環境用コード(主に単体テスト用)
      // 単体テストでは認証状態をつくり出すのが難しく、暗号化されたIDトークンを生成できないため、
      // JSON形式のIDトークンが送られることを許容している。
      // ここでは送られてきたJSON文字列のIDトークンをパースしている。
      const devIdToken = JSON.parse(idToken)
      decodedIdToken = {
        aud: 'my-app-1234',
        auth_time: now.unix(),
        email: devIdToken.email,
        email_verified: devIdToken.email_verified,
        exp: now.add(1, 'hour').unix(),
        firebase: {
          identities: {
            email: devIdToken.email ? [devIdToken.email] : [],
          },
          sign_in_provider: 'custom',
        },
        iat: now.unix(),
        iss: 'https://securetoken.google.com/my-app-1234',
        sub: devIdToken.uid,
        uid: devIdToken.uid,
        ...devIdToken,
      }
    }
    return decodedIdToken
  }
}

namespace AuthServiceDI {
  export const symbol = Symbol(AuthService.name)
  export const provider = {
    provide: symbol,
    useClass: config.env.mode === 'prod' ? ProdAuthService : DevAuthService,
  }
  export type type = AuthService
}

@Module({
  providers: [AuthServiceDI.provider, HTTPLoggingServiceDI.provider],
  exports: [AuthServiceDI.provider, HTTPLoggingServiceDI.provider],
})
class AuthServiceModule {}

//========================================================================
//
//  Exports
//
//========================================================================

export { AuthServiceModule, AuthServiceDI }
export { AuthValidateResult }
