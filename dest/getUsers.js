"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const path_1 = require("path");
const core = (0, tslib_1.__importStar)(require("@actions/core"));
// Have to dynamically import the users map
// based on the path provided by the caller Workflow
const { GITHUB_WORKSPACE, USERS_PATH } = process.env;
const getUsersFromFile = () => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
    const h = (0, path_1.resolve)(GITHUB_WORKSPACE, USERS_PATH);
    return yield Promise.resolve().then(() => (0, tslib_1.__importStar)(require(h)));
});
getUsersFromFile().then((module) => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
    const users = module.default;
    core.exportVariable('USERS', JSON.stringify(users));
}));
