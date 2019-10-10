
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

export interface TestSignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}

export interface UpdateCartItemInput {
    id: string;
    quantity: number;
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
    createUserStorageDirs(dirPaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeUserStorageFiles(filePaths: string[]): StorageNode[] | Promise<StorageNode[]>;
    removeUserStorageDir(dirPath: string): StorageNode[] | Promise<StorageNode[]>;
    putTestData(inputs: PutTestDataInput[]): boolean | Promise<boolean>;
    removeTestStorageDir(dirPath: string): boolean | Promise<boolean>;
    removeTestStorageFiles(filePaths: string[]): boolean | Promise<boolean>;
}

export interface Product {
    id: string;
    title: string;
    price: number;
    stock: number;
}

export interface IQuery {
    customToken(): string | Promise<string>;
    cartItems(ids?: string[]): CartItem[] | Promise<CartItem[]>;
    products(ids?: string[]): Product[] | Promise<Product[]>;
    userStorageBasePath(): string | Promise<string>;
    userStorageDirNodes(dirPath?: string): StorageNode[] | Promise<StorageNode[]>;
    signedUploadUrls(inputs: SignedUploadUrlInput[]): string[] | Promise<string[]>;
    testSignedUploadUrls(inputs: TestSignedUploadUrlInput[]): string[] | Promise<string[]>;
}

export interface StorageNode {
    nodeType: StorageNodeType;
    name: string;
    dir: string;
    path: string;
}

export type JSON = any;
export type JSONObject = any;
