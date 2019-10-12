import { CallHandler, ExecutionContext, NestInterceptor } from '@nestjs/common';
import { LoggingServiceDI } from '../services/logging';
import { Observable } from 'rxjs';
declare class LoggingInterceptor implements NestInterceptor {
    protected readonly loggingService: LoggingServiceDI.type;
    constructor(loggingService: LoggingServiceDI.type);
    intercept(context: ExecutionContext, next: CallHandler): Observable<any>;
}
export declare namespace LoggingInterceptorDI {
    const provider: {
        provide: string;
        useClass: typeof LoggingInterceptor;
    };
}
export {};
