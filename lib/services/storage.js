"use strict";
//
// Google Cloud Storage: Node.js Client
// https://googleapis.dev/nodejs/storage/latest/index.html
//
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const path = require("path");
const common_1 = require("@nestjs/common");
const web_base_lib_1 = require("web-base-lib");
const dayjs = require('dayjs');
var StorageNodeType;
(function (StorageNodeType) {
    StorageNodeType["File"] = "File";
    StorageNodeType["Dir"] = "Dir";
})(StorageNodeType = exports.StorageNodeType || (exports.StorageNodeType = {}));
class SignedUploadUrlInput {
}
exports.SignedUploadUrlInput = SignedUploadUrlInput;
let StorageService = class StorageService {
    //----------------------------------------------------------------------
    //
    //  Methods
    //
    //----------------------------------------------------------------------
    /**
     * ローカルファイルをCloud Storageへアップロードします。
     * @param uploadList
     */
    async uploadLocalFiles(uploadList) {
        const bucket = admin.storage().bucket();
        const uploadedFileMap = {};
        const promises = [];
        for (const uploadItem of uploadList) {
            promises.push(bucket.upload(uploadItem.localFilePath, { destination: uploadItem.toFilePath }).then(response => {
                const file = response[0];
                const metadata = response[1];
                const fileNode = this.toStorageNode(file);
                uploadedFileMap[fileNode.path] = this.toStorageNode(file);
            }));
        }
        await Promise.all(promises);
        return uploadList.reduce((result, item) => {
            result.push(uploadedFileMap[web_base_lib_1.removeStartSlash(item.toFilePath)]);
            return result;
        }, []);
    }
    /**
     * 指定されたデータをファイルとしてCloud Storageへアップロードします。
     * @param uploadList
     */
    async uploadAsFiles(uploadList) {
        const bucket = admin.storage().bucket();
        const uploadedFileMap = {};
        const promises = [];
        for (const uploadItem of uploadList) {
            promises.push((async () => {
                const gcsFileNode = bucket.file(uploadItem.path);
                await gcsFileNode.save(uploadItem.data, { contentType: uploadItem.contentType });
                const fileNode = this.toStorageNode(gcsFileNode);
                uploadedFileMap[fileNode.path] = this.toStorageNode(gcsFileNode);
            })());
        }
        await Promise.all(promises);
        return uploadList.reduce((result, item) => {
            result.push(uploadedFileMap[web_base_lib_1.removeStartSlash(item.path)]);
            return result;
        }, []);
    }
    /**
     * クライアントから指定されたファイルをレスポンスします。
     * @param req
     * @param res
     * @param filePath
     */
    async sendFile(req, res, filePath) {
        const bucket = admin.storage().bucket();
        const file = bucket.file(filePath);
        const exists = (await file.exists())[0];
        if (!exists) {
            return res.sendStatus(404);
        }
        const lastModified = dayjs(file.metadata.updated).toString();
        const ifModifiedSinceStr = req.header('If-Modified-Since');
        const ifModifiedSince = ifModifiedSinceStr ? dayjs(ifModifiedSinceStr).toString() : undefined;
        if (lastModified === ifModifiedSince) {
            return res.sendStatus(304);
        }
        res.setHeader('Last-Modified', lastModified);
        res.setHeader('Content-Type', file.metadata.contentType);
        const fileStream = file.createReadStream();
        fileStream.pipe(res);
        return res;
    }
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
    async getStorageDirNodes(dirPath, basePath) {
        // Cloud Storageから指定されたディレクトリのノードを取得
        const nodeMap = await this.getStorageNodeMap(dirPath, basePath);
        // 親ディレクトリの穴埋め
        this.padVirtualDirNode(nodeMap);
        // ディレクトリ階層を表現できるようノード配列をソート
        const result = Object.values(nodeMap);
        this.sortStorageNodes(result);
        return result;
    }
    /**
     * Cloud Storageのユーザーディレクトリから指定されたディレクトリのノード一覧を取得します。
     * @param user
     * @param dirPath
     */
    async getUserStorageDirNodes(user, dirPath) {
        const userDirPath = this.getUserStorageDirPath(user);
        return this.getStorageDirNodes(dirPath, userDirPath);
    }
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
    async createStorageDirs(dirPaths, basePath = '') {
        const bucket = admin.storage().bucket();
        const result = [];
        const promises = [];
        for (const dirPath of this.splitHierarchicalDirPaths(...dirPaths)) {
            promises.push((async () => {
                const gcsDirPath = path.join(basePath, dirPath, '/');
                const gcsDirNode = bucket.file(gcsDirPath);
                const exists = (await gcsDirNode.exists())[0];
                if (exists)
                    return;
                await gcsDirNode.save('');
                result.push(this.toStorageNode(gcsDirNode, basePath));
            })());
        }
        await Promise.all(promises);
        this.sortStorageNodes(result);
        return result;
    }
    /**
     * Cloud Storageのユーザーディレクトリ配下にディレクトリを作成します。
     * @param user
     * @param dirPaths
     */
    async createUserStorageDirs(user, dirPaths) {
        const userDirPath = this.getUserStorageDirPath(user);
        return this.createStorageDirs(dirPaths, userDirPath);
    }
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
    async removeStorageFiles(filePaths, basePath = '') {
        const bucket = admin.storage().bucket();
        const nodeMap = {};
        const promises = [];
        for (const filePath of filePaths) {
            promises.push((async () => {
                const gcsFilePath = web_base_lib_1.removeBothEndsSlash(path.join(basePath, filePath));
                const gcsFileNode = bucket.file(gcsFilePath);
                const exists = (await gcsFileNode.exists())[0];
                if (exists) {
                    await gcsFileNode.delete();
                    const node = this.toStorageNode(gcsFileNode, basePath);
                    nodeMap[node.path] = node;
                }
            })());
        }
        await Promise.all(promises);
        return filePaths.reduce((result, filePath) => {
            const fileNode = nodeMap[web_base_lib_1.removeBothEndsSlash(filePath)];
            fileNode && result.push(fileNode);
            return result;
        }, []);
    }
    /**
     * Cloud Storageのユーザーディレクトリ配下にあるファイルを削除します。。
     * @param user
     * @param filePaths
     */
    async removeUserStorageFiles(user, filePaths) {
        const userDirPath = this.getUserStorageDirPath(user);
        return this.removeStorageFiles(filePaths, userDirPath);
    }
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
    async removeStorageDir(dirPath, basePath = '') {
        // Cloud Storageから指定されたディレクトリのノードを取得
        const nodeMap = await this.getStorageNodeMap(dirPath, basePath);
        // 親ディレクトリの穴埋め
        this.padVirtualDirNode(nodeMap, dirPath);
        // Cloud Storageから取得したノードを削除
        const promises = [];
        for (const node of Object.values(nodeMap)) {
            if (node.gcsNode) {
                promises.push(node.gcsNode.delete().then(() => node));
            }
        }
        const nodes = await Promise.all(promises);
        this.sortStorageNodes(nodes);
        return nodes;
    }
    /**
     * Cloud Storageのユーザーディレクトリ配下にあるファイルを削除します。。
     * @param user
     * @param dirPath
     */
    async removeUserStorageDir(user, dirPath) {
        const userDirPath = this.getUserStorageDirPath(user);
        return this.removeStorageDir(dirPath, userDirPath);
    }
    /**
     * 署名付きのアップロードURLを取得します。
     * @param requestOrigin
     * @param inputs
     */
    async getSignedUploadUrls(requestOrigin, inputs) {
        const bucket = admin.storage().bucket();
        const urlMap = {};
        for (const input of inputs) {
            const { filePath, contentType } = input;
            const { fileName, dirPath } = web_base_lib_1.splitFilePath(filePath);
            const gcsFilePath = path.join(dirPath, fileName);
            const gcsFileNode = bucket.file(gcsFilePath);
            urlMap[filePath] = (await gcsFileNode.createResumableUpload({
                origin: requestOrigin,
                metadata: { contentType },
            }))[0];
        }
        return inputs.map(input => urlMap[input.filePath]);
    }
    /**
     * Cloud Storageからノードを取得します。
     * `dirPath`を指定すると、このディレクトリパス配下のノードを取得します。
     * @param dirPath
     * @param basePath
     */
    async getStorageNodeMap(dirPath = '', basePath = '') {
        // 引数のディレクトリパスをCloud Storageのパスへ変換
        let gcsDirPath = '';
        if (dirPath || basePath) {
            basePath = web_base_lib_1.removeBothEndsSlash(basePath);
            dirPath = web_base_lib_1.removeBothEndsSlash(dirPath);
            gcsDirPath = path.join(basePath, dirPath, '/');
        }
        // Cloud Storageから指定されたディレクトリのノードを取得
        const bucket = admin.storage().bucket();
        const response = await bucket.getFiles({ prefix: gcsDirPath });
        const gcsNodes = response[0];
        const result = {};
        for (const gcsNode of gcsNodes) {
            // basePathが指定されかつ、basePathと取得ノードが一致した場合、無視する
            if (basePath && `${basePath}/` === gcsNode.name) {
                continue;
            }
            const node = this.toStorageNode(gcsNode, basePath);
            node.gcsNode = gcsNode;
            result[node.path] = node;
        }
        return result;
    }
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
    toStorageNode(gcsNode, basePath = '') {
        let nodePath = web_base_lib_1.removeBothEndsSlash(gcsNode.name);
        if (basePath) {
            basePath = web_base_lib_1.removeBothEndsSlash(basePath);
            const basePathReg = new RegExp(`^${basePath}`);
            nodePath = web_base_lib_1.removeBothEndsSlash(nodePath.replace(basePathReg, ''));
        }
        const relativePathSegments = nodePath.split('/');
        const name = relativePathSegments[relativePathSegments.length - 1];
        const dir = relativePathSegments.slice(0, relativePathSegments.length - 1).join('/');
        // ノード名の末尾が'/'の場合はディレクトリ、それ以外はファイルと判定
        const nodeType = gcsNode.name.match(/\/$/) ? StorageNodeType.Dir : StorageNodeType.File;
        return {
            nodeType,
            name,
            dir: web_base_lib_1.removeStartSlash(dir),
            path: web_base_lib_1.removeStartSlash(nodePath),
            created: dayjs(gcsNode.metadata.timeCreated),
            updated: dayjs(gcsNode.metadata.updated),
        };
    }
    /**
     * 指定されたディレクトリパスをStorageNodeのディレクトリノードへ変換します。
     * @param dirPath
     */
    toDirStorageNode(dirPath) {
        const dirPathSegments = dirPath.split('/');
        const name = dirPathSegments[dirPathSegments.length - 1];
        const dir = dirPathSegments.slice(0, dirPathSegments.length - 1).join('/');
        return {
            nodeType: StorageNodeType.Dir,
            name,
            dir,
            path: dirPathSegments.join('/'),
        };
    }
    /**
     * ノード配列をディレクトリ階層に従ってソートします。
     * @param nodes
     */
    sortStorageNodes(nodes) {
        nodes.sort((a, b) => {
            // ソート用文字列(strA, strB)の説明:
            //   ノードがファイルの場合、同じ階層にあるディレクトリより順位を下げるために
            //   大きな文字コード"0xffff"を付加している。これにより同一階層のファイルと
            //   ディレクトリを比較した際、ファイルの方が文字的に大きいと判断され、下の方へ
            //   配置されることになる。
            let strA = a.path;
            let strB = b.path;
            if (a.nodeType === StorageNodeType.File) {
                strA = `${a.dir}${String.fromCodePoint(0xffff)}${a.name}`;
            }
            if (b.nodeType === StorageNodeType.File) {
                strB = `${b.dir}${String.fromCodePoint(0xffff)}${b.name}`;
            }
            if (strA < strB) {
                return -1;
            }
            else if (strA > strB) {
                return 1;
            }
            else {
                return 0;
            }
        });
    }
    /**
     * ユーザーディレクトリのパスを取得します。
     * @param user
     */
    getUserStorageDirPath(user) {
        return `users/${user.uid}`;
    }
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
    padVirtualDirNode(nodeMap, basePath) {
        basePath = web_base_lib_1.removeEndSlash(basePath);
        // 指定された全ノードの階層的なディレクトリパスを取得
        const dirPaths = Object.values(nodeMap).map(node => node.dir);
        const hierarchicalDirPaths = this.splitHierarchicalDirPaths(...dirPaths);
        // 親ディレクトリがない場合、仮想的にディレクトリを作成して穴埋めする
        for (const dirPath of hierarchicalDirPaths) {
            if (basePath && !dirPath.startsWith(basePath))
                continue;
            if (nodeMap[dirPath])
                continue;
            nodeMap[dirPath] = this.toDirStorageNode(dirPath);
        }
    }
    /**
     * 指定されたディレクトリパスを階層的に分割します。
     *
     * 例: "aaa/bbb/ccc"が指定された場合、
     *    ["aaa", "aaa/bbb", "aaa/bbb/ccc"]を返します。
     *
     * @param dirPaths
     */
    splitHierarchicalDirPaths(...dirPaths) {
        const set = new Set();
        for (const dirPath of dirPaths) {
            const dirPathSegments = dirPath.split('/').filter(item => !!item);
            for (let i = 0; i < dirPathSegments.length; i++) {
                const currentDirPath = dirPathSegments.slice(0, i + 1).join('/');
                set.add(currentDirPath);
            }
        }
        return Array.from(set);
    }
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
    summarizeDirPaths(dirPaths) {
        const pushMaxDirPathToArray = (array, newDirPath) => {
            for (let i = 0; i < array.length; i++) {
                const dirPath = array[i];
                if (dirPath.startsWith(newDirPath)) {
                    return;
                }
                else if (newDirPath.startsWith(dirPath)) {
                    array[i] = newDirPath;
                    return;
                }
            }
            array.push(newDirPath);
        };
        const result = [];
        for (const dirPath of dirPaths) {
            pushMaxDirPathToArray(result, dirPath);
        }
        return result;
    }
};
__decorate([
    __param(0, common_1.Req()), __param(1, common_1.Res()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String]),
    __metadata("design:returntype", Promise)
], StorageService.prototype, "sendFile", null);
StorageService = __decorate([
    common_1.Injectable()
], StorageService);
var StorageServiceDI;
(function (StorageServiceDI) {
    StorageServiceDI.symbol = Symbol(StorageService.name);
    StorageServiceDI.provider = {
        provide: StorageServiceDI.symbol,
        useClass: StorageService,
    };
})(StorageServiceDI = exports.StorageServiceDI || (exports.StorageServiceDI = {}));
//# sourceMappingURL=storage.js.map