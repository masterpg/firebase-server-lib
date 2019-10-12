"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const common_1 = require("@nestjs/common");
var AuthRoleType;
(function (AuthRoleType) {
    AuthRoleType["AppAdmin"] = "AppAdmin";
})(AuthRoleType = exports.AuthRoleType || (exports.AuthRoleType = {}));
class AuthService {
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
    async validate(req, roles) {
        const encodedIdToken = this.m_getIdToken(req);
        if (!encodedIdToken) {
            return {
                result: false,
                errorMessage: 'Authorization failed because ID token could not be obtained from the HTTP request header.',
            };
        }
        let idToken;
        try {
            idToken = await this.decodeToken(encodedIdToken);
        }
        catch (err) {
            return {
                result: false,
                errorMessage: 'Authorization failed because ID token decoding failed.',
            };
        }
        for (const role of roles || []) {
            if (role === AuthRoleType.AppAdmin) {
                if (!idToken.isAppAdmin) {
                    return {
                        result: false,
                        errorMessage: 'Authorization failed because the role is invalid.',
                    };
                }
            }
        }
        return {
            result: true,
            idToken,
            errorMessage: '',
        };
    }
    /**
     * リクエストヘッダーからIDトークン(ユーザー情報)を取得します。
     * このメソッドは検証を行わなず、純粋にIDトークン取得のみを行います。
     * @param req
     */
    async getIdToken(req) {
        const idToken = this.m_getIdToken(req);
        if (!idToken)
            return;
        let decodedIdToken;
        try {
            decodedIdToken = await this.decodeToken(idToken);
        }
        catch (err) {
            return;
        }
        return decodedIdToken;
    }
    m_getIdToken(req) {
        // 認証リクエストがFirebase IDトークンを持っているかチェック
        const authorization = req.headers.authorization;
        if (!(authorization && authorization.startsWith('Bearer ')) && !(req.cookies && req.cookies.__session)) {
            return '';
        }
        let idToken;
        // 認証ヘッダーにBearerトークンがある場合、認証ヘッダーからIDトークンを取得
        if (authorization && authorization.startsWith('Bearer ')) {
            idToken = authorization.split('Bearer ')[1];
        }
        // 認証ヘッダーにBearerトークンがない場合、cookieからIDトークンを取得
        else {
            idToken = req.cookies.__session;
        }
        return idToken;
    }
}
//========================================================================
//
//  Concrete
//
//========================================================================
let ProdAuthService = class ProdAuthService extends AuthService {
    async decodeToken(idToken) {
        const decodedIdToken = await admin.auth().verifyIdToken(idToken);
        return decodedIdToken;
    }
};
ProdAuthService = __decorate([
    common_1.Injectable()
], ProdAuthService);
let DevAuthService = class DevAuthService extends AuthService {
    async decodeToken(idToken) {
        let decodedIdToken;
        try {
            decodedIdToken = await admin.auth().verifyIdToken(idToken);
        }
        catch (err) {
            // 開発環境用コード(主に単体テスト用)
            // 単体テストでは認証状態をつくり出すのが難しく、暗号化されたIDトークンを生成できないため、
            // JSON形式のIDトークンが送られることを許容している。
            // ここでは送られてきたJSON文字列のIDトークンをパースしている。
            decodedIdToken = JSON.parse(idToken);
        }
        return decodedIdToken;
    }
};
DevAuthService = __decorate([
    common_1.Injectable()
], DevAuthService);
var AuthServiceDI;
(function (AuthServiceDI) {
    AuthServiceDI.symbol = Symbol(AuthService.name);
    AuthServiceDI.provider = {
        provide: AuthServiceDI.symbol,
        useClass: process.env.NODE_ENV === 'production' ? ProdAuthService : DevAuthService,
    };
})(AuthServiceDI = exports.AuthServiceDI || (exports.AuthServiceDI = {}));
//# sourceMappingURL=auth.js.map