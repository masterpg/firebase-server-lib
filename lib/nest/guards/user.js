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
const auth_1 = require("../services/auth");
const core_1 = require("@nestjs/core");
const base_1 = require("../base");
let UserGuard = class UserGuard {
    constructor(reflector, authService, loggingService) {
        this.reflector = reflector;
        this.authService = authService;
        this.loggingService = loggingService;
    }
    async canActivate(context) {
        const roles = this.reflector.get('roles', context.getHandler());
        const { req, res, info } = base_1.getAllExecutionContext(context);
        const latencyTimer = new logging_1.LoggingLatencyTimer().start();
        const validated = await this.authService.validate(req, roles);
        if (validated.result) {
            ;
            req.__idToken = validated.idToken;
            return true;
        }
        else {
            res.on('finish', () => {
                this.loggingService.log({ req, res, info, latencyTimer, error: new Error(validated.errorMessage) });
            });
            return false;
        }
    }
};
UserGuard = __decorate([
    common_1.Injectable(),
    __param(1, common_1.Inject(auth_1.AuthServiceDI.symbol)),
    __param(2, common_1.Inject(logging_1.LoggingServiceDI.symbol)),
    __metadata("design:paramtypes", [core_1.Reflector, Object, Object])
], UserGuard);
exports.UserGuard = UserGuard;
//# sourceMappingURL=user.js.map