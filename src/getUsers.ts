import { resolve } from 'path';
import * as core from '@actions/core';

// Have to dynamically import the users map
// based on the path provided by the caller Workflow

const {
    GITHUB_WORKSPACE,
    USERS_PATH
} = process.env;

const getUsersFromFile = async () => {
    const h = resolve(GITHUB_WORKSPACE, USERS_PATH);
    return await import(h);
};

getUsersFromFile().then(async module => {
    const users = module.default;
    core.exportVariable('USERS', JSON.stringify(users));
});
