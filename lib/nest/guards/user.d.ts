import { CanActivate, ExecutionContext } from '@nestjs/common';
import { LoggingServiceDI } from '../services/logging';
import { AuthServiceDI } from '../services/auth';
import { Reflector } from '@nestjs/core';
export declare class UserGuard implements CanActivate {
    protected readonly reflector: Reflector;
    protected readonly authService: AuthServiceDI.type;
    protected readonly loggingService: LoggingServiceDI.type;
    constructor(reflector: Reflector, authService: AuthServiceDI.type, loggingService: LoggingServiceDI.type);
    canActivate(context: ExecutionContext): Promise<boolean>;
}
