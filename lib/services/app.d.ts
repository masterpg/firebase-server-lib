import { IdToken } from '../nest';
declare class AppService {
    customToken(user: IdToken): Promise<string>;
}
export declare namespace AppServiceDI {
    const symbol: unique symbol;
    const provider: {
        provide: symbol;
        useClass: typeof AppService;
    };
    type type = AppService;
}
export {};
