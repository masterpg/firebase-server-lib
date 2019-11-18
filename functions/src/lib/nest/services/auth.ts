import * as admin from 'firebase-admin'
import { Injectable } from '@nestjs/common'
import { Request } from 'express'

//========================================================================
//
//  Basis
//
//========================================================================

export interface IdToken extends admin.auth.DecodedIdToken {
  isAppAdmin?: string
}

export enum AuthRoleType {
  AppAdmin = 'AppAdmin',
}

export interface AuthValidateResult {
  result: boolean
  errorMessage: string
  idToken?: IdToken
}

abstract class AuthService {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * リクエストヘッダーからIDトークン(ユーザー情報)を取得し、そのトークンの検証も行います。
   * @param req
   * @param roles
   */
  async validate(req: Request, roles: string[]): Promise<AuthValidateResult> {
    const encodedIdToken = this.m_getIdToken(req)
    if (!encodedIdToken) {
      return {
        result: false,
        errorMessage: 'Authorization failed because ID token could not be obtained from the HTTP request header.',
      }
    }

    let idToken: IdToken
    try {
      idToken = await this.decodeToken(encodedIdToken)
    } catch (err) {
      return {
        result: false,
        errorMessage: 'Authorization failed because ID token decoding failed.',
      }
    }

    for (const role of roles || []) {
      if (role === AuthRoleType.AppAdmin) {
        if (!idToken.isAppAdmin) {
          return {
            result: false,
            errorMessage: 'Authorization failed because the role is invalid.',
          }
        }
      }
    }

    return {
      result: true,
      idToken,
      errorMessage: '',
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
      decodedIdToken = await this.decodeToken(idToken)
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

  protected abstract decodeToken(idToken: string): Promise<IdToken>

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

//========================================================================
//
//  Concrete
//
//========================================================================

@Injectable()
class ProdAuthService extends AuthService {
  protected async decodeToken(idToken: string): Promise<IdToken> {
    const decodedIdToken = await admin.auth().verifyIdToken(idToken)
    return decodedIdToken
  }
}

@Injectable()
class DevAuthService extends AuthService {
  protected async decodeToken(idToken: string): Promise<IdToken> {
    let decodedIdToken: IdToken
    try {
      decodedIdToken = await admin.auth().verifyIdToken(idToken)
    } catch (err) {
      // 開発環境用コード(主に単体テスト用)
      // 単体テストでは認証状態をつくり出すのが難しく、暗号化されたIDトークンを生成できないため、
      // JSON形式のIDトークンが送られることを許容している。
      // ここでは送られてきたJSON文字列のIDトークンをパースしている。
      decodedIdToken = JSON.parse(idToken)
    }
    return decodedIdToken
  }
}

export namespace AuthServiceDI {
  export const symbol = Symbol(AuthService.name)
  export const provider = {
    provide: symbol,
    useClass: process.env.NODE_ENV === 'production' ? ProdAuthService : DevAuthService,
  }
  export type type = AuthService
}
