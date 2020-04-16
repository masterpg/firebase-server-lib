
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

export interface AddCartItemInput {
    productId: string;
    title: string;
    price: number;
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

export interface UpdateCartItemInput {
    id: string;
    quantity: number;
}

export interface AppConfigResponse {
    usersDir: string;
}

export interface CartItem {
    id: string;
    uid: string;
    productId: string;
    title: string;
    price: number;
    quantity: number;
}

export interface EditCartItemResponse {
    id: string;
    uid: string;
    productId: string;
    title: string;
    price: number;
    quantity: number;
    product: Product;
}

export interface GetStorageDict {
    dict: StorageNode[];
    nextPageToken?: string;
}

export interface IMutation {
    addCartItems(inputs: AddCartItemInput[]): EditCartItemResponse[] | Promise<EditCartItemResponse[]>;
    updateCartItems(inputs: UpdateCartItemInput[]): EditCartItemResponse[] | Promise<EditCartItemResponse[]>;
    removeCartItems(ids: string[]): EditCartItemResponse[] | Promise<EditCartItemResponse[]>;
    checkoutCart(): boolean | Promise<boolean>;
    putTestData(inputs: PutTestDataInput[]): boolean | Promise<boolean>;
    removeTestStorageDir(dirPath: string): boolean | Promise<boolean>;
    removeTestStorageFiles(filePaths: string[]): boolean | Promise<boolean>;
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
}

export interface Product {
    id: string;
    title: string;
    price: number;
    stock: number;
}

export interface IQuery {
    cartItems(ids?: string[]): CartItem[] | Promise<CartItem[]>;
    testSignedUploadUrls(inputs: TestSignedUploadUrlInput[]): string[] | Promise<string[]>;
    appConfig(): AppConfigResponse | Promise<AppConfigResponse>;
    customToken(): string | Promise<string>;
    products(ids?: string[]): Product[] | Promise<Product[]>;
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
