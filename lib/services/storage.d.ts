/// <reference types="node" />
import { Request, Response } from 'express';
import { Dayjs } from 'dayjs';
import { File } from '@google-cloud/storage';
export declare enum StorageNodeType {
    File = "File",
    Dir = "Dir"
}
export interface StorageNode {
    nodeType: StorageNodeType;
    name: string;
    dir: string;
    path: string;
    created?: Dayjs;
    updated?: Dayjs;
}
export declare class SignedUploadUrlInput {
    filePath: string;
    contentType?: string;
}
export interface GCSStorageNode extends StorageNode {
    gcsNode?: File;
}
export interface UploadDataItem {
    data: string | Buffer;
    path: string;
    contentType: string;
}
declare class StorageService {
    /**
     * ローカルファイルをCloud Storageへアップロードします。
     * @param uploadList
     */
    uploadLocalFiles(uploadList: {
        localFilePath: string;
        toFilePath: string;
    }[]): Promise<StorageNode[]>;
    /**
     * 指定されたデータをファイルとしてCloud Storageへアップロードします。
     * @param uploadList
     */
    uploadAsFiles(uploadList: UploadDataItem[]): Promise<StorageNode[]>;
    /**
     * クライアントから指定されたファイルをレスポンスします。
     * @param req
     * @param res
     * @param filePath
     */
    sendFile(req: Request, res: Response, filePath: string): Promise<Response>;
    /**
     * Cloud Storageから指定されたディレクトリのノード一覧を取得します。
     *
     * 引数が次のように指定された場合、
     *   + dirPath: "photos"
     *   + basePath: "home"
     * 次のようなノードが取得されます。
     *   + "home/photos/family.png"
     *   + "home/photos/children.png"
     * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
     *   + "photos/family.png"
     *   + "photos/children.png"
     *
     * @param dirPath
     * @param basePath
     */
    getStorageDirNodes(dirPath?: string, basePath?: string): Promise<StorageNode[]>;
    /**
     * Cloud Storageのユーザーディレクトリから指定されたディレクトリのノード一覧を取得します。
     * @param user
     * @param dirPath
     */
    getUserStorageDirNodes(user: {
        uid: string;
    }, dirPath?: string): Promise<StorageNode[]>;
    /**
     * Cloud Storageのディレクトリを作成します。
     *
     * 引数が次のように指定された場合、
     *   + dirPaths[0]: "photos"
     *   + dirPaths[1]: "docs"
     *   + basePath: "home"
     * 次のディレクトリが作成されます。
     *   + "home/photos"
     *   + "home/docs"
     * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
     *   + "photos"
     *   + "docs"
     *
     * @param dirPaths
     * @param basePath
     */
    createStorageDirs(dirPaths: string[], basePath?: string): Promise<StorageNode[]>;
    /**
     * Cloud Storageのユーザーディレクトリ配下にディレクトリを作成します。
     * @param user
     * @param dirPaths
     */
    createUserStorageDirs(user: {
        uid: string;
    }, dirPaths: string[]): Promise<StorageNode[]>;
    /**
     * Cloud Storageからファイルノードを削除します。
     *
     * 引数が次のように指定された場合、
     *   + filePaths[0]: "photos/family.png"
     *   + filePaths[1]: "photos/children.png"
     *   + basePath: "home"
     * 次のファイルが削除されます。
     *   + "home/photos/family.png"
     *   + "home/photos/children.png"
     * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
     *   + "photos/family.png"
     *   + "photos/children.png"
     *
     * @param filePaths
     * @param basePath
     */
    removeStorageFiles(filePaths: string[], basePath?: string): Promise<StorageNode[]>;
    /**
     * Cloud Storageのユーザーディレクトリ配下にあるファイルを削除します。。
     * @param user
     * @param filePaths
     */
    removeUserStorageFiles(user: {
        uid: string;
    }, filePaths: string[]): Promise<StorageNode[]>;
    /**
     * Cloud Storageから指定されたディレクトリを含め配下のノードを削除します。
     *
     * 引数が次のように指定された場合、
     *   + dirPath: "photos"
     *   + basePath: "home"
     * 次のようなディレクトリ、ファイルが削除されます。
     *   + "home/photos"
     *   + "home/photos/family.png"
     *   + "home/photos/children.png"
     * 戻り値は基準パスのノードが除去され、次のようなノードが返されます。
     *   + "photos"
     *   + "photos/family.png"
     *   + "photos/children.png"
     *
     * @param dirPath
     * @param basePath
     */
    removeStorageDir(dirPath: string, basePath?: string): Promise<StorageNode[]>;
    /**
     * Cloud Storageのユーザーディレクトリ配下にあるファイルを削除します。。
     * @param user
     * @param dirPath
     */
    removeUserStorageDir(user: {
        uid: string;
    }, dirPath: string): Promise<StorageNode[]>;
    /**
     * 署名付きのアップロードURLを取得します。
     * @param requestOrigin
     * @param inputs
     */
    getSignedUploadUrls(requestOrigin: string, inputs: SignedUploadUrlInput[]): Promise<string[]>;
    /**
     * Cloud Storageからノードを取得します。
     * `dirPath`を指定すると、このディレクトリパス配下のノードを取得します。
     * @param dirPath
     * @param basePath
     */
    getStorageNodeMap(dirPath?: string, basePath?: string): Promise<{
        [path: string]: GCSStorageNode;
    }>;
    /**
     * Cloud Storageから取得したノードをStorageNodeへ変換します。
     *
     * `basePath`が指定された場合、`gcsNode`のパスから基準パスが除去されます。
     * 引数が次のような場合:
     *   + `gcsNode`のパス: users/[USER_ID]/images/family.png
     *   + `basePath`: users/[USER_ID]
     * `gcsNode`のパスから基準パスが除去され、戻り値のノードパスは次のようになります:
     *   + images/family.png
     *
     * @param gcsNode Cloud Storageのノードを指定
     * @param basePath 基準パスを指定
     */
    toStorageNode(gcsNode: File, basePath?: string): StorageNode;
    /**
     * 指定されたディレクトリパスをStorageNodeのディレクトリノードへ変換します。
     * @param dirPath
     */
    toDirStorageNode(dirPath: string): StorageNode;
    /**
     * ノード配列をディレクトリ階層に従ってソートします。
     * @param nodes
     */
    sortStorageNodes(nodes: StorageNode[]): void;
    /**
     * ユーザーディレクトリのパスを取得します。
     * @param user
     */
    getUserStorageDirPath(user: {
        uid: string;
    }): string;
    /**
     * 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
     * このようなことを行う理由として、Cloud Storageは親ディレクトリが存在しないことがあるためです。
     * 例えば、"aaa/bbb/family.png"の場合、"aaa/bbb/"というディレクトリがない場合があります。
     * このように親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めします。
     *
     * `basePath`は基準パスで、このパスより上位のディレクトリは作成しません。
     * 例えば、"aaa/bbb/ccc/family.png"というノードがあり、ディレクトリが存在しないとします。
     * この条件で`basePath`に"aaa/bbb"を指定すると次のようにディレクトリノードが作成されます。
     * + "aaa" ← 基準パスより上なので作成されない
     * + "aaa/bbb" ← 作成される
     * + "aaa/bbb/ccc" ← 作成される
     *
     * @param nodeMap
     * @param basePath
     */
    padVirtualDirNode(nodeMap: {
        [path: string]: StorageNode;
    }, basePath?: string): void;
    /**
     * 指定されたディレクトリパスを階層的に分割します。
     *
     * 例: "aaa/bbb/ccc"が指定された場合、
     *    ["aaa", "aaa/bbb", "aaa/bbb/ccc"]を返します。
     *
     * @param dirPaths
     */
    splitHierarchicalDirPaths(...dirPaths: string[]): string[];
    /**
     * ディレクトリリストをサマリーします。
     *
     * `dirPaths`に次が指定された場合:
     *   + dir1/dir1-1
     *   + dir1/dir1-1/dir1-1-1
     *   + dir1/dir1-1/dir1-1-2
     *   + dir2/dir2-1
     *   + dir2/dir2-1/dir2-1-1
     *
     * 結果として次のようにサマリーされます:
     *   + dir1/dir1-1/dir1-1-1
     *   + dir1/dir1-1/dir1-1-2
     *   + dir2/dir2-1/dir2-1-1
     */
    summarizeDirPaths(dirPaths: string[]): string[];
}
export declare namespace StorageServiceDI {
    const symbol: unique symbol;
    const provider: {
        provide: symbol;
        useClass: typeof StorageService;
    };
    type type = StorageService;
}
export {};
