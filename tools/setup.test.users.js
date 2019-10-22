#!/usr/bin/env node
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const admin = require("firebase-admin");
const base_1 = require("../lib/base");
const exitHook = require('async-exit-hook');
const users = [
    {
        uid: 'yamada.one',
        email: 'yamada.one@example.com',
        emailVerified: true,
        password: 'passpass',
        displayName: '山田 一郎',
        disabled: false,
    },
    {
        uid: 'kanri.one',
        email: 'kanri.one@example.com',
        emailVerified: true,
        password: 'passpass',
        displayName: '管理 一郎',
        disabled: false,
        customUserClaims: { isAppAdmin: true },
    },
];
exitHook((callback) => {
    base_1.initFirebaseApp();
    const promises = [];
    for (const user of users) {
        promises.push((async () => {
            // 既にユーザーが存在する場合は削除
            try {
                const existUser = await admin.auth().getUser(user.uid);
                await admin.auth().deleteUser(existUser.uid);
            }
            catch (e) {
                // 存在しないuidでgetUser()するとエラーが発生するのでtry-catchしている
            }
            // ユーザーの追加
            try {
                await admin.auth().createUser(user);
                if (user.customUserClaims) {
                    await admin.auth().setCustomUserClaims(user.uid, user.customUserClaims);
                }
            }
            catch (err) {
                console.error(`${user.email}:`, err);
            }
        })());
    }
    Promise.all(promises).then(() => {
        callback();
    });
});
//# sourceMappingURL=setup.test.users.js.map