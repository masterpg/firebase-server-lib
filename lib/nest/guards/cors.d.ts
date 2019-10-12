import { CanActivate, ExecutionContext } from '@nestjs/common';
import { CORSServiceDI } from '../services/cors';
declare class CORSGuard implements CanActivate {
    protected readonly corsService: CORSServiceDI.type;
    constructor(corsService: CORSServiceDI.type);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
export declare namespace CORSGuardDI {
    const provider: {
        provide: string;
        useClass: typeof CORSGuard;
    };
}
export {};
