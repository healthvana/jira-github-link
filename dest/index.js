"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const tslib_1 = require("tslib");
const path_1 = require("path");
const github_1 = require("@actions/github");
const webhook_1 = require("@slack/webhook");
const jira_js_1 = require("jira.js");
const lodash_1 = require("lodash");
// Slack notification template
const CodeReviewNotification_1 = (0, tslib_1.__importDefault)(require("./templates/CodeReviewNotification"));
// Environment variables. Uses Github's provided variables in Prod
// and a dotenv file locally for development.
const { SLACK_WEBHOOK_URL, SLACK_WEBHOOK_URL_DEV, JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL, USERS_PATH, GITHUB_WORKSPACE } = process.env;
// Have to dynamically import the users map
// based on the path provided by the caller Workflow
const h = (0, path_1.resolve)(GITHUB_WORKSPACE, USERS_PATH);
const getUsersFromFile = () => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
    return yield Promise.resolve().then(() => (0, tslib_1.__importStar)(require(h)));
});
// Easily swap whether we're posting to Slack in "dev" (DMs)
// or "prod" (the actual channel we want to post to)
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
//Setup Slack Client
const webhook = new webhook_1.IncomingWebhook(webhookURL);
// Note: Github context is pre-hydrated by the Actions system
// TODO: Add a fully authed Octokit client to perform github actions
// ---------- ACTION FUNCTIONS
/**
 * Uses the context from a github action to take
 * the title and branch name in question and pull out
 * all Jira Project keys.
 * @returns {array} Array of unique issue keys
 */
const getIssueKeysfromBranch = () => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
    // Get PR info from Github Action context
    const { payload } = github_1.context;
    const { pull_request, number: issue_number, repository: { name: repo, owner: { login: owner } } } = payload;
    if (!pull_request) {
        console.error("Seems like there's no pull_request attached to the Github context; are you sure you're hooked up to the right event type?");
    }
    const { title, head: { ref: branch } } = pull_request;
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
            // TODO: Add a label to issue that there's no Jira ticket
            console.error("no ticket");
        }
        catch (e) {
            return new Error(`No issue keys found in branch name "${branch} and unable to label PR."`);
        }
        return new Error(`No issue keys found in branch name "${branch}"; PR label added.`);
    }
    // TODO: Format PR title with issue key(s) and summaries
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
 * Get the Jira information for a set of Jira issues by key
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
    // TODO: Fetch Epic issue info as well, and append to issue as `issue.epic`
    return issuesData.map(formatCustomFields);
});
/**
 * Get the github login from the PR that triggered the action
 * and get that person's information on all three systems
 * (Slack, Jira, Github)
 * @param {Array} users Dynamically fetched user map
 * @returns {Object} A map of the reviewers information
 */
const getReviewersInfo = (users) => {
    const { payload: { requested_reviewers } } = github_1.context;
    if (!requested_reviewers)
        return [];
    // find the user in the map
    return requested_reviewers.map(({ login }) => {
        console.log('requested reviewers::', login);
        return users.find(user => user.github.account === login);
    });
};
const onPRCreateOrReview = (users) => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
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
    const reviewersInfo = getReviewersInfo(users);
    const reviewersInJira = reviewersInfo.map(r => {
        return { accountId: r.jira.accountId };
    });
    let reviewersSlackList = reviewersInfo.map(r => `<@${r.slack.id}>`);
    let reviewersInSlack = reviewersSlackList.join(', ');
    const requestBodyBase = {
        fields: {
            [issues[0].names["codeReviewerS"]]: reviewersInJira
        }
    };
    const keysForLogging = issues.map(i => i.key).join();
    try {
        yield Promise.all(issues.map((issue) => (0, tslib_1.__awaiter)(void 0, void 0, void 0, function* () {
            issue.reviewersInSlack = reviewersInSlack;
            issue.epicURL = `${JIRA_BASE_URL}browse/${issue.fields.epicLink}`;
            issue.browseURL = `${JIRA_BASE_URL}browse/${issue.key}`;
            const finalRequestBody = Object.assign({ issueIdOrKey: issue.key }, requestBodyBase);
            // assign to Code Reviewer in Jira
            return yield jira.issues.editIssue(finalRequestBody);
        })));
    }
    catch (e) {
        console.error(`Updating Jira tickets ${keysForLogging} failed:`);
        return new Error(e);
    }
    try {
        // Only send notificaton if they are people to notify
        if (!reviewersInfo.length)
            return;
        // Send only one notification to Slack with all issues
        const json = (0, CodeReviewNotification_1.default)(issues, github_1.context);
        yield webhook.send(json);
        console.log('Slack notification json::', JSON.stringify(json, null, 4));
    }
    catch (e) {
        console.error(`Sending Slack notification for ticket ${keysForLogging} failed:`);
        return new Error(e);
    }
    // TODO: transition issue
});
getUsersFromFile().catch(e => {
    console.error("Couldnt get users from file.");
    throw new Error(e);
}).then(module => {
    const users = module.default;
    console.log('USERS::', JSON.stringify(users, null, 4));
    onPRCreateOrReview(users);
});
