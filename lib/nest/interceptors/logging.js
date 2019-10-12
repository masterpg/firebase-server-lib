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
const common_1 = require("@nestjs/common");
const logging_1 = require("../services/logging");
const core_1 = require("@nestjs/core");
const base_1 = require("../base");
const operators_1 = require("rxjs/operators");
let LoggingInterceptor = class LoggingInterceptor {
    constructor(loggingService) {
        this.loggingService = loggingService;
    }
    intercept(context, next) {
        const { req, res, info } = base_1.getAllExecutionContext(context);
        const latencyTimer = new logging_1.LoggingLatencyTimer().start();
        const loggingSource = { req, res, info, latencyTimer };
        return next.handle().pipe(operators_1.tap(() => {
            loggingSource.res.on('finish', () => {
                this.loggingService.log(loggingSource);
            });
        }, error => {
            loggingSource.res.on('finish', () => {
                this.loggingService.log(Object.assign(loggingSource, { error }));
            });
        }));
    }
};
LoggingInterceptor = __decorate([
    __param(0, common_1.Inject(logging_1.LoggingServiceDI.symbol)),
    __metadata("design:paramtypes", [Object])
], LoggingInterceptor);
var LoggingInterceptorDI;
(function (LoggingInterceptorDI) {
    LoggingInterceptorDI.provider = {
        provide: core_1.APP_INTERCEPTOR,
        useClass: LoggingInterceptor,
    };
})(LoggingInterceptorDI = exports.LoggingInterceptorDI || (exports.LoggingInterceptorDI = {}));
//# sourceMappingURL=logging.js.map