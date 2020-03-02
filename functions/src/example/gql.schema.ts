
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

export interface PutTestDataInput {
    collectionName: string;
    collectionRecords: JSONObject[];
}

export interface SignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}

export interface StorageNodeShareSettingsInput {
    isPublic: boolean;
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

export interface IMutation {
    addCartItems(inputs: AddCartItemInput[]): EditCartItemResponse[] | Promise<EditCartItemResponse[]>;
    updateCartItems(inputs: UpdateCartItemInput[]): EditCartItemResponse[] | Promise<EditCartItemResponse[]>;
    removeCartItems(ids: string[]): EditCartItemResponse[] | Promise<EditCartItemResponse[]>;
    checkoutCart(): boolean | Promise<boolean>;
    putTestData(inputs: PutTestDataInput[]): boolean | Promise<boolean>;
    removeTestStorageDir(dirPath: string): boolean | Promise<boolean>;
    removeTestStorageFiles(filePaths: string[]): boolean | Promise<boolean>;
    createUserStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    handleUploadedUserFiles(filePaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeUserStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeUserStorageFiles(filePaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    moveUserStorageDir(fromDirPath: string, toDirPath: string): StorageNode[] | Promise<StorageNode[]>;
    moveUserStorageFile(fromFilePath: string, toFilePath: string): StorageNode | Promise<StorageNode>;
    renameUserStorageDir(dirPath: string, newName: string): StorageNode[] | Promise<StorageNode[]>;
    renameUserStorageFile(filePath: string, newName: string): StorageNode | Promise<StorageNode>;
    setUserStorageDirShareSettings(dirPath: string, settings?: StorageNodeShareSettingsInput): StorageNode[] | Promise<StorageNode[]>;
    setUserStorageFileShareSettings(filePath: string, settings?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    createStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    handleUploadedFiles(filePaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeStorageFiles(filePaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    moveStorageDir(fromDirPath: string, toDirPath: string): StorageNode[] | Promise<StorageNode[]>;
    moveStorageFile(fromFilePath: string, toFilePath: string): StorageNode | Promise<StorageNode>;
    renameStorageDir(dirPath: string, newName: string): StorageNode[] | Promise<StorageNode[]>;
    renameStorageFile(filePath: string, newName: string): StorageNode | Promise<StorageNode>;
    setStorageDirShareSettings(dirPath: string, settings?: StorageNodeShareSettingsInput): StorageNode[] | Promise<StorageNode[]>;
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
    hierarchicalUserStorageDescendants(dirPath?: string): StorageNode[] | Promise<StorageNode[]>;
    hierarchicalUserStorageChildren(dirPath?: string): StorageNode[] | Promise<StorageNode[]>;
    userStorageChildren(dirPath?: string): StorageNode[] | Promise<StorageNode[]>;
    signedUploadUrls(inputs: SignedUploadUrlInput[]): string[] | Promise<string[]>;
    hierarchicalStorageDescendants(dirPath?: string): StorageNode[] | Promise<StorageNode[]>;
    hierarchicalStorageChildren(dirPath?: string): StorageNode[] | Promise<StorageNode[]>;
    storageChildren(dirPath?: string): StorageNode[] | Promise<StorageNode[]>;
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
    isPublic: boolean;
    uids: string[];
}

export type DateTime = any;
export type JSON = any;
export type JSONObject = any;
