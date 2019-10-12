"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const common_1 = require("@nestjs/common");
exports.User = common_1.createParamDecorator((data, reqOrGQLParams) => {
    let req;
    if (Array.isArray(reqOrGQLParams)) {
        const root = reqOrGQLParams[0];
        const args = reqOrGQLParams[1];
        const ctx = reqOrGQLParams[2];
        const info = reqOrGQLParams[3];
        req = ctx.req;
    }
    else {
        req = reqOrGQLParams;
    }
    return req.__idToken;
});
//# sourceMappingURL=user.js.map