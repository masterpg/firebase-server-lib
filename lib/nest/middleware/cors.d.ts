import { NestMiddleware } from '@nestjs/common';
import { NextFunction, Request, Response } from 'express';
import { CORSServiceDI } from '../services/cors';
export declare class CORSMiddleware implements NestMiddleware {
    protected readonly corsService: CORSServiceDI.type;
    constructor(corsService: CORSServiceDI.type);
    use(req: Request, res: Response, next: NextFunction): void;
}
