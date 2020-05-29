
/** ------------------------------------------------------
 * THIS FILE WAS AUTOMATICALLY GENERATED (DO NOT MODIFY)
 * -------------------------------------------------------
 */

/* tslint:disable */
/* eslint-disable */
export enum AuthStatus {
    WaitForEmailVerified = "WaitForEmailVerified",
    WaitForEntry = "WaitForEntry",
    Available = "Available"
}

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

export interface PutTestStoreDataInput {
    collectionName: string;
    collectionRecords: JSONObject[];
}

export interface SignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}

export interface StorageNodeShareSettingsInput {
    isPublic?: boolean;
    readUIds?: string[];
    writeUIds?: string[];
}

export interface StoragePaginationOptionsInput {
    maxChunk?: number;
    pageToken?: string;
}

export interface TestFirebaseUserInput {
    uid: string;
    email?: string;
    emailVerified?: boolean;
    password?: string;
    displayName?: string;
    disabled?: boolean;
    photoURL?: string;
    customClaims?: JSONObject;
}

export interface TestSignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}

export interface TestUserInput {
    uid: string;
    email?: string;
    emailVerified?: boolean;
    password?: string;
    displayName: string;
    disabled?: boolean;
    photoURL?: string;
    customClaims?: JSONObject;
    fullName: string;
}

export interface UserInfoInput {
    fullName: string;
    displayName: string;
}

export interface Entity {
    id: string;
}

export interface TimestampEntity {
    id: string;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface AppConfigResponse {
    usersDir: string;
}

export interface AuthDataResult {
    status: AuthStatus;
    token: string;
    user?: UserInfo;
}

export interface CartItem extends TimestampEntity {
    id: string;
    uid: string;
    productId: string;
    title: string;
    price: number;
    quantity: number;
    createdAt: DateTime;
    updatedAt: DateTime;
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
    addCartItems(inputs: CartItemAddInput[]): CartItemEditResponse[] | Promise<CartItemEditResponse[]>;
    updateCartItems(inputs: CartItemUpdateInput[]): CartItemEditResponse[] | Promise<CartItemEditResponse[]>;
    removeCartItems(ids: string[]): CartItemEditResponse[] | Promise<CartItemEditResponse[]>;
    checkoutCart(): boolean | Promise<boolean>;
    putTestStoreData(inputs: PutTestStoreDataInput[]): boolean | Promise<boolean>;
    removeTestStorageDir(dirPath: string): boolean | Promise<boolean>;
    removeTestStorageFiles(filePaths: string[]): boolean | Promise<boolean>;
    setTestFirebaseUsers(users: TestFirebaseUserInput[]): boolean | Promise<boolean>;
    deleteTestFirebaseUsers(uids: string[]): boolean | Promise<boolean>;
    setTestUsers(users: TestUserInput[]): UserInfo[] | Promise<UserInfo[]>;
    deleteTestUsers(uids: string[]): boolean | Promise<boolean>;
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
    setOwnUserInfo(input: UserInfoInput): UserInfo | Promise<UserInfo>;
    deleteOwnUser(): boolean | Promise<boolean>;
}

export interface Product extends TimestampEntity {
    id: string;
    title: string;
    price: number;
    stock: number;
    createdAt: DateTime;
    updatedAt: DateTime;
}

export interface PublicProfile extends TimestampEntity {
    id: string;
    displayName: string;
    photoURL?: string;
    createdAt: DateTime;
    updatedAt: DateTime;
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
    authData(): AuthDataResult | Promise<AuthDataResult>;
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
    readUIds?: string[];
    writeUIds?: string[];
}

export interface StoragePaginationResult {
    list: StorageNode[];
    nextPageToken?: string;
}

export interface UserInfo extends TimestampEntity {
    id: string;
    fullName: string;
    email: string;
    emailVerified: boolean;
    isAppAdmin: boolean;
    myDirName: string;
    createdAt: DateTime;
    updatedAt: DateTime;
    publicProfile: PublicProfile;
}

export type DateTime = any;
export type JSON = any;
export type JSONObject = any;
