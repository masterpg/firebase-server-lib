import * as firebaseAdmin from 'firebase-admin'
import { GraphQLResolveInfo } from 'graphql'
import { IdToken } from '../types'
import { Request } from 'express'
import { config } from '../config'
import { singleton } from 'tsyringe'

//************************************************************************
//
//  Basis
//
//************************************************************************

export interface AuthValidatorResult {
  result: boolean
  errorMessage: string
  idToken?: IdToken
}

export enum AuthRoleType {
  Admin = 'ADMIN',
}

export abstract class AuthValidator {
  //----------------------------------------------------------------------
  //
  //  Methods
  //
  //----------------------------------------------------------------------

  /**
   * リクエストヘッダーからIDトークン(ユーザー情報)を取得し、そのトークンの検証も行います。
   * @param req
   * @param roles
   * @param info
   */
  async execute(req: Request, roles: string[], info?: GraphQLResolveInfo): Promise<AuthValidatorResult> {
    const idToken = this.m_getIdToken(req)
    if (!idToken) {
      return {
        result: false,
        errorMessage: 'Authorization failed because ID token could not be obtained from the HTTP request header.',
      }
    }

    let decodedIdToken: IdToken
    try {
      decodedIdToken = await this.decodeToken(idToken)
    } catch (err) {
      return {
        result: false,
        errorMessage: 'Authorization failed because ID token decoding failed.',
      }
    }

    for (const role of roles) {
      if (role === AuthRoleType.Admin) {
        if (!config.role.admins.includes(decodedIdToken.email)) {
          return {
            result: false,
            errorMessage: 'Authorization failed because the role is invalid.',
          }
        }
      }
    }

    return {
      result: true,
      idToken: decodedIdToken,
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

//************************************************************************
//
//  Concrete
//
//************************************************************************

@singleton()
export class ProdAuthValidator extends AuthValidator {
  protected async decodeToken(idToken: string): Promise<IdToken> {
    let decodedIdToken = await firebaseAdmin.auth().verifyIdToken(idToken)
    return decodedIdToken
  }
}

@singleton()
export class DevAuthValidator extends AuthValidator {
  protected async decodeToken(idToken: string): Promise<IdToken> {
    let decodedIdToken: IdToken
    try {
      decodedIdToken = await firebaseAdmin.auth().verifyIdToken(idToken)
    } catch (err) {
      // 開発環境用コード(主に単体テスト用)
      // 単体テストでは認証状態をつくり出すのが難しく暗号化されたIDトークンを生成できないため、
      // JSON形式のIDトークンが送られることを許容している。
      // ここでは送られてきたJSON文字列のIDトークンをパースしている。
      decodedIdToken = JSON.parse(idToken)
    }
    return decodedIdToken
  }
}
