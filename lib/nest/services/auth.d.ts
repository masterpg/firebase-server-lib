import * as admin from 'firebase-admin';
import { Request } from 'express';
export interface IdToken extends admin.auth.DecodedIdToken {
    isAppAdmin?: string;
}
export declare enum AuthRoleType {
    AppAdmin = "AppAdmin"
}
export interface AuthValidateResult {
    result: boolean;
    errorMessage: string;
    idToken?: IdToken;
}
declare abstract class AuthService {
    /**
     * リクエストヘッダーからIDトークン(ユーザー情報)を取得し、そのトークンの検証も行います。
     * @param req
     * @param roles
     */
    validate(req: Request, roles: string[]): Promise<AuthValidateResult>;
    /**
     * リクエストヘッダーからIDトークン(ユーザー情報)を取得します。
     * このメソッドは検証を行わなず、純粋にIDトークン取得のみを行います。
     * @param req
     */
    getIdToken(req: Request): Promise<IdToken | undefined>;
    protected abstract decodeToken(idToken: string): Promise<IdToken>;
    private m_getIdToken;
}
declare class ProdAuthService extends AuthService {
    protected decodeToken(idToken: string): Promise<IdToken>;
}
declare class DevAuthService extends AuthService {
    protected decodeToken(idToken: string): Promise<IdToken>;
}
export declare namespace AuthServiceDI {
    const symbol: unique symbol;
    const provider: {
        provide: symbol;
        useClass: typeof ProdAuthService | typeof DevAuthService;
    };
    type type = AuthService;
}
export {};
