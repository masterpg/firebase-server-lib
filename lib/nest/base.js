"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const graphql_1 = require("@nestjs/graphql");
function getAllExecutionContext(context) {
    const gqlExecContext = graphql_1.GqlExecutionContext.create(context);
    let info = gqlExecContext.getInfo();
    const gqlContext = gqlExecContext.getContext();
    let req = gqlContext.req;
    let res = gqlContext.res;
    if (!req || !res || !info) {
        const httpContext = context.switchToHttp();
        req = httpContext.getRequest();
        res = httpContext.getResponse();
        info = undefined;
    }
    return { req, res, info };
}
exports.getAllExecutionContext = getAllExecutionContext;
//# sourceMappingURL=base.js.map