
/** ------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
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

export interface GetStorageOptionsInput {
    maxResults?: number;
    pageToken?: string;
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

export interface GetStorageResult {
    list: StorageNode[];
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
    handleUploadedUserFiles(filePaths: string[]): boolean | Promise<boolean>;
    createUserStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeUserStorageDirs(dirPaths: string[]): boolean | Promise<boolean>;
    removeUserStorageFiles(filePaths: string[]): boolean | Promise<boolean>;
    moveUserStorageDir(fromDirPath: string, toDirPath: string): boolean | Promise<boolean>;
    moveUserStorageFile(fromFilePath: string, toFilePath: string): boolean | Promise<boolean>;
    renameUserStorageDir(dirPath: string, newName: string): boolean | Promise<boolean>;
    renameUserStorageFile(filePath: string, newName: string): boolean | Promise<boolean>;
    setUserStorageDirShareSettings(dirPath: string, settings?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    setUserStorageFileShareSettings(filePath: string, settings?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    handleUploadedFiles(filePaths: string[]): boolean | Promise<boolean>;
    createStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeStorageDirs(dirPaths: string[]): boolean | Promise<boolean>;
    removeStorageFiles(filePaths: string[]): boolean | Promise<boolean>;
    moveStorageDir(fromDirPath: string, toDirPath: string): boolean | Promise<boolean>;
    moveStorageFile(fromFilePath: string, toFilePath: string): boolean | Promise<boolean>;
    renameStorageDir(dirPath: string, newName: string): boolean | Promise<boolean>;
    renameStorageFile(filePath: string, newName: string): boolean | Promise<boolean>;
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
    userStorageDirDescendants(dirPath?: string, options?: GetStorageOptionsInput): GetStorageResult | Promise<GetStorageResult>;
    userStorageDescendants(dirPath?: string, options?: GetStorageOptionsInput): GetStorageResult | Promise<GetStorageResult>;
    userStorageDirChildren(dirPath?: string, options?: GetStorageOptionsInput): GetStorageResult | Promise<GetStorageResult>;
    userStorageChildren(dirPath?: string, options?: GetStorageOptionsInput): GetStorageResult | Promise<GetStorageResult>;
    storageNode(nodePath: string): StorageNode | Promise<StorageNode>;
    storageDirDescendants(dirPath?: string, options?: GetStorageOptionsInput): GetStorageResult | Promise<GetStorageResult>;
    storageDescendants(dirPath?: string, options?: GetStorageOptionsInput): GetStorageResult | Promise<GetStorageResult>;
    storageDirChildren(dirPath?: string, options?: GetStorageOptionsInput): GetStorageResult | Promise<GetStorageResult>;
    storageChildren(dirPath?: string, options?: GetStorageOptionsInput): GetStorageResult | Promise<GetStorageResult>;
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

export type DateTime = any;
export type JSON = any;
export type JSONObject = any;
