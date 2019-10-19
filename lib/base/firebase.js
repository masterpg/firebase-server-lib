"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const path = require("path");
const config_1 = require("./config");
function initFirebaseApp() {
    const serviceAccount = require(path.resolve(process.cwd(), config_1.config.app.credential));
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        storageBucket: config_1.config.storage.bucket,
    });
}
exports.initFirebaseApp = initFirebaseApp;
//# sourceMappingURL=firebase.js.map