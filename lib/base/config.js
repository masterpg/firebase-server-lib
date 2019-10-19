"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const firebase_functions_1 = require("firebase-functions");
exports.config = new (class {
    constructor() {
        this.functions = new (class {
            get region() {
                return firebase_functions_1.config().functions.region || '';
            }
        })();
        this.app = new (class {
            get credential() {
                return firebase_functions_1.config().app.credential || '';
            }
        })();
        this.storage = new (class {
            get bucket() {
                return firebase_functions_1.config().storage.bucket || '';
            }
        })();
        this.cors = new (class {
            get whitelist() {
                if (firebase_functions_1.config().cors) {
                    const whitelist = firebase_functions_1.config().cors.whitelist || '';
                    return whitelist.split(',').map((item) => item.trim());
                }
                return [];
            }
        })();
    }
})();
//# sourceMappingURL=config.js.map