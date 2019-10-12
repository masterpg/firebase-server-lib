"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const convertHrtime = require("convert-hrtime");
const path = require("path");
const common_1 = require("@nestjs/common");
const base_1 = require("../../base");
const logging_1 = require("@google-cloud/logging");
const web_base_lib_1 = require("web-base-lib");
const merge = require('lodash/merge');
class LoggingLatencyTimer {
    constructor() {
        this.m_startTime = [0, 0];
        this.m_diff = { seconds: 0, milliseconds: 0, nanoseconds: 0 };
        this.m_data = { seconds: 0, nanos: 0 };
    }
    get diff() {
        return this.m_diff;
    }
    get data() {
        return this.m_data;
    }
    start() {
        this.m_startTime = process.hrtime();
        this.m_diff = { seconds: 0, milliseconds: 0, nanoseconds: 0 };
        this.m_data = { seconds: 0, nanos: 0 };
        return this;
    }
    stop() {
        this.m_diff = convertHrtime(process.hrtime(this.m_startTime));
        this.m_data = {
            seconds: Math.floor(this.diff.seconds),
            nanos: this.diff.nanoseconds - Math.floor(this.diff.seconds) * 1e9,
        };
        return this;
    }
}
exports.LoggingLatencyTimer = LoggingLatencyTimer;
const DEFAULT_LOG_NAME = 'api';
class LoggingService {
    constructor() {
        //----------------------------------------------------------------------
        //
        //  Variables
        //
        //----------------------------------------------------------------------
        this.m_logMap = {};
    }
    //----------------------------------------------------------------------
    //
    //  Methods
    //
    //----------------------------------------------------------------------
    log(loggingSource) {
        const { logName, res, error, metadata, data } = loggingSource;
        const realMetadata = this.getBaseMetadata(loggingSource);
        if (!error) {
            merge(realMetadata, {
                severity: 100,
                httpRequest: {
                    responseSize: parseInt(res.get('Content-Length')),
                },
            });
        }
        else {
            merge(realMetadata, {
                severity: 500,
            });
        }
        const realData = this.getData(loggingSource);
        if (metadata) {
            merge(realMetadata, metadata);
        }
        if (data) {
            merge(realData, data);
        }
        this.m_writeLog(logName ? logName : DEFAULT_LOG_NAME, realMetadata, realData);
    }
    getFunctionName(loggingSource) {
        const { req, info } = loggingSource;
        if (info) {
            return `api/gql/${info.path.key}`;
        }
        else {
            return this.getFunctionNameByRequest(req);
        }
    }
    getProtocol(req) {
        return req.get('X-Forwarded-Proto') || req.protocol;
    }
    getBaseMetadata(loggingSource) {
        const { req, info } = loggingSource;
        return {
            resource: this.m_getResourceData(loggingSource),
            httpRequest: this.m_getRequestData(loggingSource),
        };
    }
    getData(loggingSource) {
        const { req, info, error } = loggingSource;
        const data = {};
        if (info) {
            data.gql = req.body;
        }
        const user = req.__idToken;
        if (user) {
            data.uid = user.uid;
        }
        if (error) {
            if (error instanceof common_1.HttpException) {
                data.error = {
                    message: error.getResponse().message,
                };
            }
            else {
                data.error = {
                    message: error.message,
                };
            }
            if (error instanceof base_1.ValidationErrors || error instanceof base_1.InputValidationError) {
                data.error.detail = error.detail;
            }
        }
        return data;
    }
    m_writeLog(logName, metadata, data) {
        let targetLog = this.m_logMap[logName];
        if (!targetLog) {
            targetLog = new logging_1.Logging().log(logName);
            this.m_logMap[logName] = targetLog;
        }
        const entry = targetLog.entry(metadata, data);
        return targetLog.write(entry);
    }
    m_getResourceData(loggingSource) {
        const { req, info } = loggingSource;
        return {
            type: 'cloud_function',
            labels: {
                function_name: this.getFunctionName(loggingSource),
                region: base_1.config.functions.region,
            },
        };
    }
    m_getRequestData(loggingSource) {
        const { req, res, latencyTimer } = loggingSource;
        return {
            protocol: this.getProtocol(req),
            requestMethod: req.method,
            requestUrl: this.getRequestUrl(req),
            requestSize: parseInt(req.headers['content-length'] || ''),
            userAgent: req.headers['user-agent'],
            referer: req.headers.referer,
            remoteIp: req.ip || '',
            status: res.statusCode,
            latency: latencyTimer ? latencyTimer.stop().data : { seconds: 0, nanos: 0 },
        };
    }
}
//========================================================================
//
//  Concrete
//
//========================================================================
let ProdLoggingService = class ProdLoggingService extends LoggingService {
    getFunctionNameByRequest(req) {
        // 例: function_name = "api/rest/hello"
        // ・req.baseUrl: "/rest"
        // ・req.path: "/hello"
        return web_base_lib_1.removeBothEndsSlash(path.join('api', req.baseUrl, req.path));
    }
    getRequestUrl(req) {
        return `${this.getProtocol(req)}://${req.headers.host}${path.join('/api', req.originalUrl)}`;
    }
};
ProdLoggingService = __decorate([
    common_1.Injectable()
], ProdLoggingService);
let DevLoggingService = class DevLoggingService extends LoggingService {
    log(loggingSource) {
        super.log(loggingSource);
        const { latencyTimer, error } = loggingSource;
        const functionName = this.getBaseMetadata(loggingSource).resource.labels.function_name;
        const detail = {
            functionName,
            latency: latencyTimer ? `${latencyTimer.diff.seconds}s` : undefined,
        };
        if (!error) {
            console.log('[DEBUG]:', JSON.stringify(detail, null, 2));
        }
        else {
            const errorData = this.getData(loggingSource);
            console.error('[ERROR]:', JSON.stringify(errorData, null, 2));
        }
    }
    getFunctionNameByRequest(req) {
        // 例: function_name = "api/rest/hello"
        // ・req.baseUrl: " /vue-base-project-7295/asia-northeast1/api/rest"
        // ・req.path: "/hello"
        const matched = `${req.baseUrl}${req.path}`.match(/\/api\/.*[^/]/);
        if (matched) {
            return web_base_lib_1.removeBothEndsSlash(matched[0]);
        }
        return '';
    }
    getRequestUrl(req) {
        return `${this.getProtocol(req)}://${req.headers.host}${req.originalUrl}`;
    }
};
DevLoggingService = __decorate([
    common_1.Injectable()
], DevLoggingService);
let TestLoggingService = class TestLoggingService extends LoggingService {
    log(loggingSource) { }
    getFunctionNameByRequest(req) {
        return '';
    }
    getRequestUrl(req) {
        return '';
    }
};
TestLoggingService = __decorate([
    common_1.Injectable()
], TestLoggingService);
var LoggingServiceDI;
(function (LoggingServiceDI) {
    LoggingServiceDI.symbol = Symbol(LoggingService.name);
    LoggingServiceDI.provider = {
        provide: LoggingServiceDI.symbol,
        useClass: (() => {
            if (process.env.NODE_ENV === 'production') {
                return ProdLoggingService;
            }
            else if (process.env.NODE_ENV === 'test') {
                return TestLoggingService;
            }
            else {
                return DevLoggingService;
            }
        })(),
    };
})(LoggingServiceDI = exports.LoggingServiceDI || (exports.LoggingServiceDI = {}));
//# sourceMappingURL=logging.js.map