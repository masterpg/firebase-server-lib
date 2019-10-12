"use strict";
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
const nest_1 = require("../nest");
const firebaseTools = require('firebase-tools');
let TestService = class TestService {
    constructor(firestoreService) {
        this.firestoreService = firestoreService;
    }
    //----------------------------------------------------------------------
    //
    //  Methods
    //
    //----------------------------------------------------------------------
    async putTestData(inputs) {
        {
            const processes = [];
            for (const item of inputs) {
                processes.push(this.m_deleteCollection(item.collectionName));
            }
            await Promise.all(processes);
        }
        {
            const processes = [];
            for (const item of inputs) {
                processes.push(this.m_buildCollection(item.collectionName, item.collectionRecords));
            }
            await Promise.all(processes);
        }
    }
    async getTestSignedUploadUrls(inputs) {
        const bucket = admin.storage().bucket();
        const urlMap = {};
        for (const input of inputs) {
            const { filePath, contentType } = input;
            const { fileName, dirPath } = web_base_lib_1.splitFilePath(filePath);
            const gcsFilePath = path.join(dirPath, fileName);
            const gcsFileNode = bucket.file(gcsFilePath);
            urlMap[filePath] = (await gcsFileNode.createResumableUpload({
                origin: '*',
                metadata: { contentType },
            }))[0];
        }
        return inputs.map(input => urlMap[input.filePath]);
    }
    async removeTestStorageFiles(filePaths) {
        const bucket = admin.storage().bucket();
        const promises = [];
        for (const filePath of filePaths) {
            promises.push((async () => {
                const gcsFilePath = web_base_lib_1.removeBothEndsSlash(filePath);
                const gcsFileNode = bucket.file(gcsFilePath);
                const exists = (await gcsFileNode.exists())[0];
                if (exists) {
                    await gcsFileNode.delete();
                }
            })());
        }
        await Promise.all(promises);
    }
    async removeTestStorageDir(dirPath) {
        dirPath = path.join(web_base_lib_1.removeBothEndsSlash(dirPath), '/');
        const bucket = admin.storage().bucket();
        const response = await bucket.getFiles({ directory: dirPath });
        const gcsNodes = response[0];
        const promises = [];
        for (const gcsNode of gcsNodes) {
            promises.push(gcsNode.delete().then());
        }
        await Promise.all(promises);
    }
    //----------------------------------------------------------------------
    //
    //  Internal methods
    //
    //----------------------------------------------------------------------
    async m_deleteCollection(collectionName) {
        await this.firestoreService.deepDeleteCollection(collectionName);
    }
    async m_deleteCollectionWithFirebaseTools(collectionName) {
        await firebaseTools.firestore.delete(collectionName, {
            project: process.env.GCLOUD_PROJECT,
            recursive: true,
            yes: true,
        });
    }
    async m_buildCollection(collectionName, collectionRows) {
        const docs = await this.m_createCollectionDocs(collectionName, collectionRows);
        const db = admin.firestore();
        await db.runTransaction(async (transaction) => {
            for (const doc of docs) {
                transaction.create(doc.ref, doc.data);
            }
        });
    }
    async m_createCollectionDocs(collectionName, collectionRows, parentDoc) {
        const db = admin.firestore();
        const result = [];
        for (const collectionRow of collectionRows) {
            // ドキュメントリファレンスの作成
            let docRef;
            // 親ドキュメントがない場合
            if (!parentDoc) {
                docRef = db.collection(collectionName).doc(collectionRow.id);
            }
            // 親ドキュメントがある場合
            else {
                docRef = parentDoc.collection(collectionName).doc(collectionRow.id);
            }
            // ドキュメントデータの作成
            const docData = {};
            for (const memberKey of Object.keys(collectionRow)) {
                if (memberKey === 'id')
                    continue;
                const memberItem = collectionRow[memberKey];
                // メンバーアイテムがオブジェクト配列の場合、コレクションとみなす
                if (this.m_isArray(memberItem) && memberItem.length && this.m_isObject(memberItem[0])) {
                    const docs = await this.m_createCollectionDocs(memberKey, memberItem, docRef);
                    result.push(...docs);
                }
                // 上記以外はメンバーアイテムをプリミティブな型とみなす
                else {
                    docData[memberKey] = memberItem;
                }
            }
            result.push({ ref: docRef, data: docData });
        }
        return result;
    }
    m_isArray(value) {
        return Array.isArray(value);
    }
    m_isObject(value) {
        return value instanceof Object && !(value instanceof Array);
    }
};
TestService = __decorate([
    common_1.Injectable(),
    __param(0, common_1.Inject(nest_1.FirestoreServiceDI.symbol)),
    __metadata("design:paramtypes", [Object])
], TestService);
var TestServiceDI;
(function (TestServiceDI) {
    TestServiceDI.symbol = Symbol(TestService.name);
    TestServiceDI.provider = {
        provide: TestServiceDI.symbol,
        useClass: TestService,
    };
})(TestServiceDI = exports.TestServiceDI || (exports.TestServiceDI = {}));
//# sourceMappingURL=test.js.map