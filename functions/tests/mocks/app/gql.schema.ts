
/** ------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
/* eslint-disable */
export interface AdminSettings {
    adminKey: string;
}

export interface PartnerSettings {
    partnerKey: string;
}

export interface PublicSettings {
    publicKey: string;
}

export interface IQuery {
    publicSettings(): PublicSettings | Promise<PublicSettings>;
    partnerSettings(): PartnerSettings | Promise<PartnerSettings>;
    adminSettings(): AdminSettings | Promise<AdminSettings>;
}
