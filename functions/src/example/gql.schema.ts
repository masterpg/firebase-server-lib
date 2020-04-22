
/** ------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
/* eslint-disable */
export enum StorageNodeType {
    File = "File",
    Dir = "Dir"
}

export interface CartItemAddInput {
    productId: string;
    title: string;
    price: number;
    quantity: number;
}

export interface CartItemUpdateInput {
    id: string;
    quantity: number;
}

export interface PutTestDataInput {
    collectionName: string;
    collectionRecords: JSONObject[];
}

export interface SignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}

export interface StorageNodeShareSettingsInput {
    isPublic?: boolean;
    uids?: string[];
}

export interface StoragePaginationOptionsInput {
    maxChunk?: number;
    pageToken?: string;
}

export interface TestSignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}

export interface DocumentData {
    id: string;
}

export interface AppConfigResponse {
    usersDir: string;
}

export interface CartItem extends DocumentData {
    id: string;
    uid: string;
    productId: string;
    title: string;
    price: number;
    quantity: number;
}

export interface CartItemEditResponse {
    id: string;
    uid: string;
    productId: string;
    title: string;
    price: number;
    quantity: number;
    product: Product;
}

export interface IMutation {
    handleUploadedUserFile(filePath: string): StorageNode | Promise<StorageNode>;
    createUserStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeUserStorageDir(dirPath: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    removeUserStorageFile(filePath: string): StorageNode | Promise<StorageNode>;
    moveUserStorageDir(fromDirPath: string, toDirPath: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    moveUserStorageFile(fromFilePath: string, toFilePath: string): StorageNode | Promise<StorageNode>;
    renameUserStorageDir(dirPath: string, newName: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    renameUserStorageFile(filePath: string, newName: string): StorageNode | Promise<StorageNode>;
    setUserStorageDirShareSettings(dirPath: string, settings?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    setUserStorageFileShareSettings(filePath: string, settings?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    handleUploadedFile(filePath: string): StorageNode | Promise<StorageNode>;
    createStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeStorageDir(dirPath: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    removeStorageFile(filePath: string): StorageNode | Promise<StorageNode>;
    moveStorageDir(fromDirPath: string, toDirPath: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    moveStorageFile(fromFilePath: string, toFilePath: string): StorageNode | Promise<StorageNode>;
    renameStorageDir(dirPath: string, newName: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    renameStorageFile(filePath: string, newName: string): StorageNode | Promise<StorageNode>;
    setStorageDirShareSettings(dirPath: string, settings?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    setStorageFileShareSettings(filePath: string, settings?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    putTestData(inputs: PutTestDataInput[]): boolean | Promise<boolean>;
    removeTestStorageDir(dirPath: string): boolean | Promise<boolean>;
    removeTestStorageFiles(filePaths: string[]): boolean | Promise<boolean>;
    addCartItems(inputs: CartItemAddInput[]): CartItemEditResponse[] | Promise<CartItemEditResponse[]>;
    updateCartItems(inputs: CartItemUpdateInput[]): CartItemEditResponse[] | Promise<CartItemEditResponse[]>;
    removeCartItems(ids: string[]): CartItemEditResponse[] | Promise<CartItemEditResponse[]>;
    checkoutCart(): boolean | Promise<boolean>;
}

export interface Product extends DocumentData {
    id: string;
    title: string;
    price: number;
    stock: number;
}

export interface IQuery {
    appConfig(): AppConfigResponse | Promise<AppConfigResponse>;
    customToken(): string | Promise<string>;
    userStorageNode(nodePath: string): StorageNode | Promise<StorageNode>;
    userStorageDirDescendants(dirPath?: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    userStorageDescendants(dirPath?: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    userStorageDirChildren(dirPath?: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    userStorageChildren(dirPath?: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    userStorageHierarchicalNodes(nodePath: string): StorageNode[] | Promise<StorageNode[]>;
    userStorageAncestorDirs(nodePath: string): StorageNode[] | Promise<StorageNode[]>;
    storageNode(nodePath: string): StorageNode | Promise<StorageNode>;
    storageDirDescendants(dirPath?: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    storageDescendants(dirPath?: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    storageDirChildren(dirPath?: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    storageChildren(dirPath?: string, options?: StoragePaginationOptionsInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    storageHierarchicalNodes(nodePath: string): StorageNode[] | Promise<StorageNode[]>;
    storageAncestorDirs(nodePath: string): StorageNode[] | Promise<StorageNode[]>;
    signedUploadUrls(inputs: SignedUploadUrlInput[]): string[] | Promise<string[]>;
    testSignedUploadUrls(inputs: TestSignedUploadUrlInput[]): string[] | Promise<string[]>;
    cartItems(ids?: string[]): CartItem[] | Promise<CartItem[]>;
    products(ids?: string[]): Product[] | Promise<Product[]>;
}

export interface StorageNode {
    id: string;
    nodeType: StorageNodeType;
    name: string;
    dir: string;
    path: string;
    contentType: string;
    size: number;
    share: StorageNodeShareSettings;
    created: DateTime;
    updated: DateTime;
}

export interface StorageNodeShareSettings {
    isPublic?: boolean;
    uids?: string[];
}

export interface StoragePaginationResult {
    list: StorageNode[];
    nextPageToken?: string;
}

export type DateTime = any;
export type JSON = any;
export type JSONObject = any;
