
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

export enum StorageArticleNodeType {
    ListBundle = "ListBundle",
    CategoryBundle = "CategoryBundle",
    Article = "Article",
    Category = "Category"
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

export interface CreateArticleTypeDirInput {
    dir: string;
    articleNodeName: string;
    articleNodeType?: StorageArticleNodeType;
}

export interface CreateStorageNodeInput {
    isPublic?: boolean;
    readUIds?: string[];
    writeUIds?: string[];
}

export interface PutTestStoreDataInput {
    collectionName: string;
    collectionRecords: JSONObject[];
}

export interface SetArticleSortOrderInput {
    insertBeforeNodePath?: string;
    insertAfterNodePath?: string;
}

export interface SignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}

export interface StorageNodeKeyInput {
    id?: string;
    path?: string;
}

export interface StorageNodeShareSettingsInput {
    isPublic?: boolean;
    readUIds?: string[];
    writeUIds?: string[];
}

export interface StoragePaginationInput {
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
    user: StorageUsersConfig;
    article: StorageArticlesConfig;
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
    createdAt: DateTime;
    updatedAt: DateTime;
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
    createStorageDir(dirPath: string, input?: CreateStorageNodeInput): StorageNode | Promise<StorageNode>;
    createStorageHierarchicalDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeStorageDir(dirPath: string, input?: StoragePaginationInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    removeStorageFile(filePath: string): StorageNode | Promise<StorageNode>;
    moveStorageDir(fromDirPath: string, toDirPath: string, input?: StoragePaginationInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    moveStorageFile(fromFilePath: string, toFilePath: string): StorageNode | Promise<StorageNode>;
    renameStorageDir(dirPath: string, newName: string, input?: StoragePaginationInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    renameStorageFile(filePath: string, newName: string): StorageNode | Promise<StorageNode>;
    setStorageDirShareSettings(dirPath: string, input?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    setStorageFileShareSettings(filePath: string, input?: StorageNodeShareSettingsInput): StorageNode | Promise<StorageNode>;
    handleUploadedFile(filePath: string): StorageNode | Promise<StorageNode>;
    createArticleTypeDir(input: CreateArticleTypeDirInput): StorageNode | Promise<StorageNode>;
    createArticleGeneralDir(dirPath: string, input?: CreateStorageNodeInput): StorageNode | Promise<StorageNode>;
    renameArticleNode(nodePath: string, newName: string): StorageNode | Promise<StorageNode>;
    setArticleSortOrder(nodePath: string, input: SetArticleSortOrderInput): StorageNode | Promise<StorageNode>;
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
    keepAlive(): boolean | Promise<boolean>;
    products(ids?: string[]): Product[] | Promise<Product[]>;
    storageNode(input: StorageNodeKeyInput): StorageNode | Promise<StorageNode>;
    storageDirDescendants(dirPath?: string, input?: StoragePaginationInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    storageDescendants(dirPath?: string, input?: StoragePaginationInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    storageDirChildren(dirPath?: string, input?: StoragePaginationInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    storageChildren(dirPath?: string, input?: StoragePaginationInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    storageHierarchicalNodes(nodePath: string): StorageNode[] | Promise<StorageNode[]>;
    storageAncestorDirs(nodePath: string): StorageNode[] | Promise<StorageNode[]>;
    signedUploadUrls(inputs: SignedUploadUrlInput[]): string[] | Promise<string[]>;
    articleChildren(dirPath: string, articleTypes: StorageArticleNodeType[], input?: StoragePaginationInput): StoragePaginationResult | Promise<StoragePaginationResult>;
    authData(): AuthDataResult | Promise<AuthDataResult>;
}

export interface StorageArticlesConfig {
    rootName: string;
    fileName: string;
    assetsName: string;
}

export interface StorageNode extends TimestampEntity {
    id: string;
    nodeType: StorageNodeType;
    name: string;
    dir: string;
    path: string;
    contentType: string;
    size: number;
    share: StorageNodeShareSettings;
    articleNodeName?: string;
    articleNodeType?: StorageArticleNodeType;
    articleSortOrder?: Long;
    version: number;
    createdAt: DateTime;
    updatedAt: DateTime;
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

export interface StorageUsersConfig {
    rootName: string;
}

export interface UserInfo extends TimestampEntity {
    id: string;
    fullName: string;
    email: string;
    emailVerified: boolean;
    isAppAdmin: boolean;
    createdAt: DateTime;
    updatedAt: DateTime;
    publicProfile: PublicProfile;
}

export type DateTime = any;
export type JSON = any;
export type JSONObject = any;
export type Long = any;
