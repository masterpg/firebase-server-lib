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
const base_1 = require("../base");
let AppService = class AppService {
    async customToken(user) {
        const token = await admin.auth().createCustomToken(user.uid, {
            isAppAdmin: base_1.config.role.app.admins.includes(user.email),
        });
        return token;
    }
};
AppService = __decorate([
    common_1.Injectable()
], AppService);
var AppServiceDI;
(function (AppServiceDI) {
    AppServiceDI.symbol = Symbol(AppService.name);
    AppServiceDI.provider = {
        provide: AppServiceDI.symbol,
        useClass: AppService,
    };
})(AppServiceDI = exports.AppServiceDI || (exports.AppServiceDI = {}));
//# sourceMappingURL=app.js.map