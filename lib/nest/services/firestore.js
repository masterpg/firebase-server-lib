"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const common_1 = require("@nestjs/common");
//========================================================================
//
//  Basis
//
//========================================================================
let FirestoreService = class FirestoreService {
    /**
     * 指定されたコレクションを再帰的に削除します。
     * @param collectionPath
     * @param batchSize
     */
    async deepDeleteCollection(collectionPath, batchSize = 500) {
        const db = admin.firestore();
        const collectionRef = db.collection(collectionPath);
        const query = collectionRef.orderBy('__name__').limit(batchSize);
        await db.runTransaction(async (transaction) => {
            const docRefs = await this.m_getDeepDocRefs(transaction, query, batchSize);
            for (const docRef of docRefs) {
                transaction.delete(docRef);
            }
        });
    }
    /**
     * 指定されたクエリを実行し、その結果からさらにクエリの作成・実行を繰り返して、
     * 再帰的にドキュメントリファレンスを取得します。
     * @param transaction
     * @param query
     * @param batchSize
     */
    async m_getDeepDocRefs(transaction, query, batchSize) {
        const snapshot = await transaction.get(query);
        if (snapshot.size === 0)
            return [];
        const result = [];
        const subCollectionPromises = [];
        for (const doc of snapshot.docs) {
            const subCollectionPromise = doc.ref.listCollections().then(async (subCollections) => {
                const promises = [];
                for (const subCollection of subCollections || []) {
                    const subQuery = subCollection.orderBy('__name__').limit(batchSize);
                    const subPromise = this.m_getDeepDocRefs(transaction, subQuery, batchSize);
                    promises.push(subPromise);
                }
                return (await Promise.all(promises)).reduce((result, docRefs) => {
                    result.push(...docRefs);
                    return result;
                }, []);
            });
            subCollectionPromises.push(subCollectionPromise);
            result.push(doc.ref);
        }
        return (await Promise.all(subCollectionPromises)).reduce((result, docRefs) => {
            result.push(...docRefs);
            return result;
        }, result);
    }
};
FirestoreService = __decorate([
    common_1.Injectable()
], FirestoreService);
//========================================================================
//
//  Concrete
//
//========================================================================
var FirestoreServiceDI;
(function (FirestoreServiceDI) {
    FirestoreServiceDI.symbol = Symbol(FirestoreService.name);
    FirestoreServiceDI.provider = {
        provide: FirestoreServiceDI.symbol,
        useClass: FirestoreService,
    };
})(FirestoreServiceDI = exports.FirestoreServiceDI || (exports.FirestoreServiceDI = {}));
//# sourceMappingURL=firestore.js.map