"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const path_1 = require("path");
const fs_1 = (0, tslib_1.__importDefault)(require("fs"));
const github_1 = require("@actions/github");
const webhook_1 = require("@slack/webhook");
const jira_js_1 = require("jira.js");
const lodash_1 = require("lodash");
const CodeReviewNotification_1 = (0, tslib_1.__importDefault)(require("./templates/CodeReviewNotification"));
// --- FOR PROD
const { SLACK_WEBHOOK_URL, SLACK_WEBHOOK_URL_DEV, JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL, USERS_PATH, GITHUB_WORKSPACE } = process.env;
const h = (0, path_1.resolve)(GITHUB_WORKSPACE, USERS_PATH);
fs_1.default.readdir((0, path_1.dirname)(h), (err, files) => {
    console.log(`files in ${(0, path_1.dirname)(h)}::`);
    files.forEach(file => {
        console.log(file);
    });
});
let users = [];
const getUsersFromFile = () => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
    users = yield Promise.resolve().then(() => (0, tslib_1.__importStar)(require(h)));
});
const webhookURL = SLACK_WEBHOOK_URL_DEV;
// Setup Jira client
const jira = new jira_js_1.Version2Client({
    host: JIRA_BASE_URL,
    authentication: {
        basic: {
            email: JIRA_USER_EMAIL,
            apiToken: JIRA_API_TOKEN
        }
    },
    telemetry: false
});
// const context = github.context;
//Setup Slack Client
const webhook = new webhook_1.IncomingWebhook(webhookURL);
// ----------WORKFLOW
/**
 * Uses the context from a github action to take
 * the title and branch name in question and pull out
 * all Jira Project keys.
 * @returns {array} Array of unique issue keys
 */
const getIssueKeysfromBranch = () => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
    // Get PR info from Github Action context
    const { payload } = github_1.context;
    const { pull_request: { title, head: { ref: branch } }, number: issue_number, repository: { name: repo, owner: { login: owner } } } = payload;
    console.log('payload::', payload);
    // Get all existing project keys from Jira
    const projectsInfo = yield jira.projects.getAllProjects();
    const projects = projectsInfo.map(prj => prj.key);
    // Look for possible keys using this regex
    const projectsRegex = `((${projects.join('|')})-\\d{1,})`;
    const regexp = new RegExp(projectsRegex, 'gi');
    const branchMatches = branch.match(regexp);
    const titleMatches = title.match(regexp);
    // If none, throw; label PR
    if (!(branchMatches === null || branchMatches === void 0 ? void 0 : branchMatches.length) && !(titleMatches === null || titleMatches === void 0 ? void 0 : titleMatches.length)) {
        try {
            console.log("no ticket");
        }
        catch (e) {
            return new Error(`No issue keys found in branch name "${branch} and unable to label PR."`);
        }
        return new Error(`No issue keys found in branch name "${branch}"; PR label added.`);
    }
    return [...new Set(branchMatches.concat(titleMatches))];
});
/**
 * Mutates and transforms the standard Jira issue JSON format for easier use in templating
 * @param {Object} issue An issue from Jira
 * @returns {Object} The issue with custom fields translated to plain text
 */
const formatCustomFields = (issue) => {
    const { names: customFields } = issue;
    let fieldMap = {};
    Object.keys(customFields)
        .filter(jiraName => {
        return jiraName.includes('custom');
    })
        .forEach(jiraName => {
        const formattedKey = (0, lodash_1.camelCase)(customFields[jiraName]);
        const value = issue.fields[jiraName];
        fieldMap[formattedKey] = jiraName;
        issue.fields[formattedKey] = value;
        delete issue.fields[jiraName];
    });
    // replace the old names area with the new map
    issue.names = fieldMap;
    return issue;
};
/**
 *
 * @param {Array} keys An array of strings of issue keys
 * @returns {Array} The information from Jira for those issue keys
 */
const getIssueInfoFromKeys = (keys) => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
    if (keys instanceof Error)
        return;
    const issuesData = yield Promise.all(keys.map((key) => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
        let data = null;
        try {
            data = yield jira.issues.getIssue({
                issueIdOrKey: key,
                expand: 'names'
            });
        }
        catch (e) {
            console.error(`Issue ${key} could not be found in Jira or could not be fetched:`);
            return new Error(e);
        }
        return data;
    })));
    // TO DO: Fetch Epic issue info as well, and append to issue as `issue.epic`
    const formattedissues = issuesData.map(formatCustomFields);
    return formattedissues;
});
/**
 *
 * @param {Object} issueInfo
 */
const getReviewersInfo = () => {
    const { payload: { requested_reviewers } } = github_1.context;
    // find the user in the map
    return requested_reviewers.map(({ login }) => {
        return users.find(user => user.github.account === login);
    });
};
const onPRCreateOrReview = () => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
    // Get the issue keys from the PR title and branch name
    const keys = yield getIssueKeysfromBranch();
    // Get the info from Jira for those issue keys
    let issues = [];
    if (keys instanceof Error) {
        return keys;
    }
    try {
        issues = yield getIssueInfoFromKeys(keys);
    }
    catch (e) {
        return new Error('Unable to return issue info');
    }
    // Get the reviewer's info from the usersmap
    const reviewersInfo = getReviewersInfo();
    const reviewersInJira = reviewersInfo.map(r => {
        return { accountId: r.jira.accountId };
    });
    let reviewersInSlackList = reviewersInfo.map(reviewer => `<@${reviewer.slack.id}>`);
    let reviewersInSlack = reviewersInSlackList.join(', ');
    const requestBodyBase = {
        fields: {
            [issues[0].names["codeReviewerS"]]: reviewersInJira
        }
    };
    let reviwerAssignResponse;
    try {
        reviwerAssignResponse = yield Promise.all(issues.map((issue) => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
            issue.reviewersInSlack = reviewersInSlack;
            issue.epicURL = `${JIRA_BASE_URL}browse/${issue.fields.epicLink}`;
            issue.browseURL = `${JIRA_BASE_URL}browse/${issue.key}`;
            const finalRequestBody = Object.assign({ issueIdOrKey: issue.key }, requestBodyBase);
            // assign to Code Reviewer in Jira
            return yield jira.issues.editIssue(finalRequestBody);
        })));
        // Send only one notification to Slack with all issues
        const json = (0, CodeReviewNotification_1.default)(issues, github_1.context);
        yield webhook.send(json);
        // console.log(json)
    }
    catch (e) {
        console.log(e);
    }
    // TO DO: transition issue
    //
});
getUsersFromFile();
onPRCreateOrReview();
