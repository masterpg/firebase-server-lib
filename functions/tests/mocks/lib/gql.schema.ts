
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
    sitePublicConfig(): SitePublicConfig | Promise<SitePublicConfig>;
    siteAdminConfig(): SiteAdminConfig | Promise<SiteAdminConfig>;
}

export interface SiteAdminConfig {
    uid: string;
    apiKey: string;
}

export interface SitePublicConfig {
    siteName: string;
}

export type DateTime = any;
export type JSON = any;
export type JSONObject = any;
