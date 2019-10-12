"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const vary = require("vary");
const common_1 = require("@nestjs/common");
const logging_1 = require("./logging");
const base_1 = require("../../base");
let CORSService = class CORSService {
    //----------------------------------------------------------------------
    //
    //  Constructor
    //
    //----------------------------------------------------------------------
    constructor(loggingService) {
        this.loggingService = loggingService;
    }
    //----------------------------------------------------------------------
    //
    //  Variables
    //
    //----------------------------------------------------------------------
    get defaultOptions() {
        return {
            whitelist: base_1.config.cors.whitelist,
            methods: ['GET', 'HEAD', 'PUT', 'POST', 'DELETE'],
            credentials: false,
            optionsSuccessStatus: 204,
            allowedBlankOrigin: false,
            isLogging: false,
        };
    }
    //----------------------------------------------------------------------
    //
    //  Methods
    //
    //----------------------------------------------------------------------
    validate(context, next, options) {
        const { req, res } = context;
        options = Object.assign(Object.assign({}, this.defaultOptions), (options || {}));
        const isAllowed = this.isAllowed(options, req);
        if (!isAllowed && options.isLogging) {
            !isAllowed && this.logNotAllowed(context, options);
        }
        const headers = [];
        const method = req.method && req.method.toUpperCase && req.method.toUpperCase();
        headers.push(this.configureOrigin(options, req));
        headers.push(this.configureCredentials(options));
        headers.push(this.configureExposedHeaders(options));
        // プリフライトリクエスト
        if (method === 'OPTIONS') {
            headers.push(this.configureMethods(options));
            headers.push(this.configureAllowedHeaders(options, req));
            headers.push(this.configureMaxAge(options));
            this.applyHeaders(headers, res);
            // Safari (and potentially other browsers) need content-length 0,
            //   for 204 or they just hang waiting for a body
            res.statusCode = options.optionsSuccessStatus;
            res.setHeader('Content-Length', '0');
            res.end();
        }
        // 通常リクエスト
        else {
            this.applyHeaders(headers, res);
            next && next();
        }
        return isAllowed;
    }
    //----------------------------------------------------------------------
    //
    //  Internal methods
    //
    //----------------------------------------------------------------------
    isAllowed(options, req) {
        const requestOrigin = req.headers.origin || '';
        const whitelist = options.whitelist || [];
        // リクエストオリジンの空を許容していて、かつリクエストオリジンが空の場合
        if (options.allowedBlankOrigin && !requestOrigin) {
            return true;
        }
        // ホワイトリストが指定されていない場合
        if (whitelist.length === 0) {
            return false;
        }
        // ホワイトリストが指定されている場合、
        // リクエストオリジンがホワイトリストに含まれていることを検証
        return whitelist.indexOf(requestOrigin) >= 0;
    }
    configureOrigin(options, req) {
        const headers = [];
        const whitelist = options.whitelist || [];
        const requestOrigin = req.headers.origin || '';
        // リクエストオリジンの空を許容していて、かつリクエストオリジンが空の場合
        if (options.allowedBlankOrigin && !requestOrigin) {
            headers.push({ key: 'Access-Control-Allow-Origin', value: '*' });
            return headers;
        }
        // リクエストオリジンがホワイトリストに含まれている場合
        if (whitelist.length > 0 && whitelist.indexOf(requestOrigin) >= 0) {
            headers.push({ key: 'Access-Control-Allow-Origin', value: requestOrigin });
            headers.push({ key: 'Vary', value: 'Origin' });
        }
        // リクエストオリジンがホワイトリストに含まれていない場合
        else {
            headers.push({ key: 'Access-Control-Allow-Origin', value: '' });
        }
        return headers;
    }
    configureCredentials(options) {
        if (options.credentials === true) {
            return {
                key: 'Access-Control-Allow-Credentials',
                value: 'true',
            };
        }
        return null;
    }
    configureMethods(options) {
        let methods;
        if (options.methods) {
            methods = options.methods.join(',');
        }
        if (methods) {
            return {
                key: 'Access-Control-Allow-Methods',
                value: methods,
            };
        }
        return null;
    }
    configureAllowedHeaders(options, req) {
        const headers = [];
        let allowedHeaders;
        if (!options.allowedHeaders) {
            // リクエストヘッダーの'access-control-request-headers'指定された値を
            // レスポンスの'Access-Control-Allow-Headers'に設定する
            allowedHeaders = req.headers['access-control-request-headers'];
            headers.push({
                key: 'Vary',
                value: 'Access-Control-Request-Headers',
            });
        }
        else {
            // オプションの'allowedHeaders'に指定された値を
            // レスポンスの'Access-Control-Allow-Headers'に設定する
            allowedHeaders = options.allowedHeaders.join(',');
        }
        if (allowedHeaders) {
            headers.push({
                key: 'Access-Control-Allow-Headers',
                value: allowedHeaders,
            });
        }
        return headers;
    }
    configureMaxAge(options) {
        const maxAge = (typeof options.maxAge === 'number' || options.maxAge) && options.maxAge.toString();
        if (maxAge && maxAge.length) {
            return {
                key: 'Access-Control-Max-Age',
                value: maxAge,
            };
        }
        return null;
    }
    configureExposedHeaders(options) {
        let exposedHeaders;
        if (!options.exposedHeaders) {
            return null;
        }
        else {
            exposedHeaders = options.exposedHeaders.join(',');
        }
        if (exposedHeaders) {
            return {
                key: 'Access-Control-Expose-Headers',
                value: exposedHeaders,
            };
        }
        return null;
    }
    applyHeaders(headers, res) {
        for (let i = 0; i < headers.length; i++) {
            const header = headers[i];
            if (header) {
                if (Array.isArray(header)) {
                    this.applyHeaders(header, res);
                }
                else if (header.key === 'Vary' && header.value) {
                    vary(res, header.value);
                }
                else {
                    res.setHeader(header.key, header.value);
                }
            }
        }
    }
    logNotAllowed(context, options) {
        const { req, res, info } = context;
        const latencyTimer = new logging_1.LoggingLatencyTimer().start();
        res.on('finish', () => {
            this.loggingService.log({
                req,
                res,
                info,
                latencyTimer,
                metadata: {
                    severity: 500,
                },
                data: this.getErrorData(req, options),
            });
        });
    }
    getErrorData(req, options) {
        return {
            error: {
                message: 'Not allowed by CORS.',
                detail: {
                    requestOrigin: req.headers.origin || '',
                    allowedBlankOrigin: !!options.allowedBlankOrigin,
                    whitelist: options.whitelist,
                },
            },
        };
    }
};
CORSService = __decorate([
    __param(0, common_1.Inject(logging_1.LoggingServiceDI.symbol)),
    __metadata("design:paramtypes", [Object])
], CORSService);
//========================================================================
//
//  Concrete
//
//========================================================================
let ProdCORSService = class ProdCORSService extends CORSService {
};
ProdCORSService = __decorate([
    common_1.Injectable()
], ProdCORSService);
let DevCORSService = class DevCORSService extends CORSService {
    get defaultOptions() {
        return Object.assign(Object.assign({}, super.defaultOptions), { allowedBlankOrigin: true });
    }
    logNotAllowed(context, options) {
        const { req, res, info } = context;
        const data = Object.assign({ functionName: this.loggingService.getFunctionName({ req, info }) }, this.getErrorData(req, options));
        console.error('[ERROR]:', JSON.stringify(data, null, 2));
    }
};
DevCORSService = __decorate([
    common_1.Injectable()
], DevCORSService);
var CORSServiceDI;
(function (CORSServiceDI) {
    CORSServiceDI.symbol = Symbol(CORSService.name);
    CORSServiceDI.provider = {
        provide: CORSServiceDI.symbol,
        useClass: process.env.NODE_ENV === 'production' ? ProdCORSService : DevCORSService,
    };
})(CORSServiceDI = exports.CORSServiceDI || (exports.CORSServiceDI = {}));
//# sourceMappingURL=cors.js.map