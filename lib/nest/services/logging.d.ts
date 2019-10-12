import * as convertHrtime from 'convert-hrtime';
import { Request, Response } from 'express';
import { GraphQLResolveInfo } from 'graphql';
import { LogEntry } from '@google-cloud/logging/build/src/entry';
import { google } from '@google-cloud/logging/build/proto/logging';
import IHttpRequest = google.logging.type.IHttpRequest;
import IMonitoredResource = google.api.IMonitoredResource;
export interface LoggingSource {
    req: Request;
    res: Response;
    latencyTimer?: LoggingLatencyTimer;
    logName?: string;
    info?: GraphQLResolveInfo;
    error?: Error;
    metadata?: Partial<LoggingMetadata>;
    data?: Partial<LoggingData>;
}
export interface LoggingLatencyData {
    seconds: number;
    nanos: number;
}
export declare class LoggingLatencyTimer {
    private m_startTime;
    private m_diff;
    readonly diff: convertHrtime.HRTime;
    private m_data;
    readonly data: LoggingLatencyData;
    start(): LoggingLatencyTimer;
    stop(): LoggingLatencyTimer;
}
export interface LoggingMetadata extends LogEntry {
    resource: LoggingResourceData;
    httpRequest: IHttpRequest;
}
export interface LoggingResourceData extends IMonitoredResource {
    type: string;
    labels: {
        function_name: string;
        region: string;
    };
}
export interface LoggingData {
    gql?: any;
    uid?: string;
    error?: {
        message: string;
        detail?: any;
    };
}
declare abstract class LoggingService {
    private m_logMap;
    log(loggingSource: LoggingSource): void;
    getFunctionName(loggingSource: {
        req: Request;
        info?: GraphQLResolveInfo;
    }): string;
    protected abstract getFunctionNameByRequest(req: Request): string;
    protected abstract getRequestUrl(req: Request): string;
    protected getProtocol(req: Request): string;
    protected getBaseMetadata(loggingSource: {
        req: Request;
        res: Response;
        info?: GraphQLResolveInfo;
        latencyTimer?: LoggingLatencyTimer;
    }): LoggingMetadata;
    protected getData(loggingSource: {
        req: Request;
        info?: GraphQLResolveInfo;
        error?: Error;
    }): LoggingData;
    private m_writeLog;
    private m_getResourceData;
    private m_getRequestData;
}
declare class ProdLoggingService extends LoggingService {
    getFunctionNameByRequest(req: Request): string;
    protected getRequestUrl(req: Request): string;
}
declare class DevLoggingService extends LoggingService {
    log(loggingSource: LoggingSource): void;
    getFunctionNameByRequest(req: Request): string;
    protected getRequestUrl(req: Request): string;
}
declare class TestLoggingService extends LoggingService {
    log(loggingSource: LoggingSource): void;
    protected getFunctionNameByRequest(req: Request): string;
    protected getRequestUrl(req: Request): string;
}
export declare namespace LoggingServiceDI {
    const symbol: unique symbol;
    const provider: {
        provide: symbol;
        useClass: typeof ProdLoggingService | typeof DevLoggingService | typeof TestLoggingService;
    };
    type type = LoggingService;
}
export {};
