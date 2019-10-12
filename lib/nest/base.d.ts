import { Request, Response } from 'express';
import { ExecutionContext } from '@nestjs/common';
import { GraphQLResolveInfo } from 'graphql';
export declare function getAllExecutionContext(context: ExecutionContext): {
    req: Request;
    res: Response;
    info?: GraphQLResolveInfo;
};
