import { LoggingData, LoggingServiceDI } from './logging';
import { NextFunction, Request, Response } from 'express';
import { GraphQLResolveInfo } from 'graphql';
interface CORSOptions {
    whitelist?: string[];
    methods?: string[];
    allowedHeaders?: string[];
    exposedHeaders?: string[];
    credentials?: boolean;
    maxAge?: number;
    optionsSuccessStatus?: number;
    allowedBlankOrigin?: boolean;
    isLogging?: boolean;
}
declare abstract class CORSService {
    protected readonly loggingService: LoggingServiceDI.type;
    constructor(loggingService: LoggingServiceDI.type);
    protected readonly defaultOptions: CORSOptions;
    validate(context: {
        req: Request;
        res: Response;
        info?: GraphQLResolveInfo;
    }, next?: NextFunction, options?: CORSOptions): boolean;
    protected isAllowed(options: CORSOptions, req: Request): boolean;
    protected configureOrigin(options: CORSOptions, req: Request): any;
    protected configureCredentials(options: CORSOptions): {
        key: string;
        value: string;
    } | null;
    protected configureMethods(options: CORSOptions): {
        key: string;
        value: string;
    } | null;
    protected configureAllowedHeaders(options: CORSOptions, req: Request): {
        key: string;
        value: string;
    }[];
    protected configureMaxAge(options: CORSOptions): {
        key: string;
        value: string;
    } | null;
    protected configureExposedHeaders(options: CORSOptions): {
        key: string;
        value: string;
    } | null;
    protected applyHeaders(headers: any, res: Response): void;
    protected logNotAllowed(context: {
        req: Request;
        res: Response;
        info?: GraphQLResolveInfo;
    }, options: CORSOptions): void;
    protected getErrorData(req: Request, options: CORSOptions): Partial<LoggingData>;
}
declare class ProdCORSService extends CORSService {
}
export declare namespace CORSServiceDI {
    const symbol: unique symbol;
    const provider: {
        provide: symbol;
        useClass: typeof ProdCORSService;
    };
    type type = CORSService;
}
export {};
