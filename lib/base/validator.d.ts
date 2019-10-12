import { ValidatorOptions, ValidationError as _ValidationError } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
declare type Constructor<T = any> = new (...args: any[]) => T;
export declare class ValidationErrors extends BadRequestException {
    readonly detail: _ValidationError[];
    constructor(detail: _ValidationError[]);
}
export declare class InputValidationError extends BadRequestException {
    constructor(message: string, values?: {
        [field: string]: any;
    });
    private m_detail;
    readonly detail: {
        message: string;
        values?: {
            [field: string]: any;
        };
    };
}
export declare function validate(objectClass: Constructor, object: any, validatorOptions?: ValidatorOptions): Promise<void>;
export declare function validate(objectClass: Constructor, object: any[], validatorOptions?: ValidatorOptions): Promise<void>;
export declare function validateSync(objectClass: Constructor, object: any, validatorOptions?: ValidatorOptions): void;
export declare function validateSync(objectClass: Constructor, object: any[], validatorOptions?: ValidatorOptions): void;
export {};
