
/** ------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
export interface Product {
    id: string;
    name: string;
}

export interface IQuery {
    products(): Product[] | Promise<Product[]>;
    site(): Site | Promise<Site>;
}

export interface Site {
    name: string;
}

export type DateTime = any;
export type JSON = any;
export type JSONObject = any;
