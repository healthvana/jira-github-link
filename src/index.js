"use strict";
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g;
    return g = { next: verb(0), "throw": verb(1), "return": verb(2) }, typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (_) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
exports.__esModule = true;
var github_1 = require("@actions/github");
var webhook_1 = require("@slack/webhook");
var jira_js_1 = require("jira.js");
var lodash_1 = require("lodash");
var CodeReviewNotification_1 = require("./templates/CodeReviewNotification");
// --- FOR PROD
var _a = process.env, SLACK_WEBHOOK_URL = _a.INPUT_SLACK_WEBHOOK_URL, SLACK_WEBHOOK_URL_DEV = _a.INPUT_SLACK_WEBHOOK_URL_DEV, JIRA_API_TOKEN = _a.INPUT_JIRA_API_TOKEN, JIRA_USER_EMAIL = _a.INPUT_JIRA_USER_EMAIL, JIRA_BASE_URL = _a.INPUT_JIRA_BASE_URL, USERS_PATH = _a.INPUT_USERS_PATH;
var users = await Promise.resolve().then(function () { return require(USERS_PATH); });
var webhookURL = SLACK_WEBHOOK_URL;
// Setup Jira client
var jira = new jira_js_1.Version2Client({
    host: JIRA_BASE_URL,
    authentication: {
        basic: {
            email: JIRA_USER_EMAIL,
            apiToken: JIRA_API_TOKEN
        }
    },
    telemetry: false
});
var context = github_1["default"].context;
//Setup Slack Client
var webhook = new webhook_1.IncomingWebhook(webhookURL);
// ----------WORKFLOW
/**
 * Uses the context from a github action to take
 * the title and branch name in question and pull out
 * all Jira Project keys.
 * @returns {array} Array of unique issue keys
 */
var getIssueKeysfromBranch = function () { return __awaiter(void 0, void 0, void 0, function () {
    var payload, _a, title, branch, issue_number, _b, repo, owner, projectsInfo, projects, projectsRegex, regexp, branchMatches, titleMatches;
    return __generator(this, function (_c) {
        switch (_c.label) {
            case 0:
                payload = context.payload;
                _a = payload.pull_request, title = _a.title, branch = _a.head.ref, issue_number = payload.number, _b = payload.repository, repo = _b.name, owner = _b.owner.login;
                console.log('payload::', payload);
                return [4 /*yield*/, jira.projects.getAllProjects()];
            case 1:
                projectsInfo = _c.sent();
                projects = projectsInfo.map(function (prj) { return prj.key; });
                projectsRegex = "((".concat(projects.join('|'), ")-\\d{1,})");
                regexp = new RegExp(projectsRegex, 'gi');
                branchMatches = branch.match(regexp);
                titleMatches = title.match(regexp);
                // If none, throw; label PR
                if (!(branchMatches === null || branchMatches === void 0 ? void 0 : branchMatches.length) && !(titleMatches === null || titleMatches === void 0 ? void 0 : titleMatches.length)) {
                    try {
                        github_1["default"].issues.addLabels({
                            owner: owner,
                            repo: repo,
                            issue_number: issue_number,
                            label: [{ name: 'NO JIRA TICKET' }]
                        });
                    }
                    catch (e) {
                        return [2 /*return*/, new Error("No issue keys found in branch name \"".concat(branch, " and unable to label PR.\""))];
                    }
                    return [2 /*return*/, new Error("No issue keys found in branch name \"".concat(branch, "\"; PR label added."))];
                }
                return [2 /*return*/, __spreadArray([], new Set(branchMatches.concat(titleMatches)), true)];
        }
    });
}); };
/**
 * Mutates and transforms the standard Jira issue JSON format for easier use in templating
 * @param {Object} issue An issue from Jira
 * @returns {Object} The issue with custom fields translated to plain text
 */
var formatCustomFields = function (issue) {
    var customFields = issue.names;
    var fieldMap = {};
    Object.keys(customFields)
        .filter(function (jiraName) {
        return jiraName.includes('custom');
    })
        .forEach(function (jiraName) {
        var formattedKey = (0, lodash_1.camelCase)(customFields[jiraName]);
        var value = issue.fields[jiraName];
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
var getIssueInfoFromKeys = function (keys) { return __awaiter(void 0, void 0, void 0, function () {
    var issuesData, formattedissues;
    return __generator(this, function (_a) {
        switch (_a.label) {
            case 0:
                if (keys instanceof Error)
                    return [2 /*return*/];
                return [4 /*yield*/, Promise.all(keys.map(function (key) { return __awaiter(void 0, void 0, void 0, function () {
                        var data, e_1;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    data = null;
                                    _a.label = 1;
                                case 1:
                                    _a.trys.push([1, 3, , 4]);
                                    return [4 /*yield*/, jira.issues.getIssue({
                                            issueIdOrKey: key,
                                            expand: 'names'
                                        })];
                                case 2:
                                    data = _a.sent();
                                    return [3 /*break*/, 4];
                                case 3:
                                    e_1 = _a.sent();
                                    console.error("Issue ".concat(key, " could not be found in Jira or could not be fetched:"));
                                    return [2 /*return*/, new Error(e_1)];
                                case 4: return [2 /*return*/, data];
                            }
                        });
                    }); }))];
            case 1:
                issuesData = _a.sent();
                formattedissues = issuesData.map(formatCustomFields);
                return [2 /*return*/, formattedissues];
        }
    });
}); };
/**
 *
 * @param {Object} issueInfo
 */
var getReviewersInfo = function () {
    var requested_reviewers = context.payload.requested_reviewers;
    // find the user in the map
    return requested_reviewers.map(function (_a) {
        var login = _a.login;
        return users.find(function (user) { return user.github.account === login; });
    });
};
var onPRCreateOrReview = function () { return __awaiter(void 0, void 0, void 0, function () {
    var keys, issues, e_2, reviewersInfo, reviewersInJira, reviewersInSlackList, reviewersInSlack, requestBodyBase, reviwerAssignResponse, json, e_3;
    var _a;
    return __generator(this, function (_b) {
        switch (_b.label) {
            case 0: return [4 /*yield*/, getIssueKeysfromBranch()];
            case 1:
                keys = _b.sent();
                issues = [];
                if (keys instanceof Error) {
                    return [2 /*return*/, keys];
                }
                _b.label = 2;
            case 2:
                _b.trys.push([2, 4, , 5]);
                return [4 /*yield*/, getIssueInfoFromKeys(keys)];
            case 3:
                issues = _b.sent();
                return [3 /*break*/, 5];
            case 4:
                e_2 = _b.sent();
                return [2 /*return*/, new Error('Unable to return issue info')];
            case 5:
                reviewersInfo = getReviewersInfo();
                reviewersInJira = reviewersInfo.map(function (r) {
                    return { accountId: r.jira.accountId };
                });
                reviewersInSlackList = reviewersInfo.map(function (reviewer) { return "<@".concat(reviewer.slack.id, ">"); });
                reviewersInSlack = reviewersInSlackList.join(', ');
                requestBodyBase = {
                    fields: (_a = {},
                        _a[issues[0].names["codeReviewerS"]] = reviewersInJira,
                        _a)
                };
                _b.label = 6;
            case 6:
                _b.trys.push([6, 9, , 10]);
                return [4 /*yield*/, Promise.all(issues.map(function (issue) { return __awaiter(void 0, void 0, void 0, function () {
                        var finalRequestBody;
                        return __generator(this, function (_a) {
                            switch (_a.label) {
                                case 0:
                                    issue.reviewersInSlack = reviewersInSlack;
                                    issue.epicURL = "".concat(JIRA_BASE_URL, "browse/").concat(issue.fields.epicLink);
                                    issue.browseURL = "".concat(JIRA_BASE_URL, "browse/").concat(issue.key);
                                    finalRequestBody = __assign({ issueIdOrKey: issue.key }, requestBodyBase);
                                    return [4 /*yield*/, jira.issues.editIssue(finalRequestBody)];
                                case 1: 
                                // assign to Code Reviewer in Jira
                                return [2 /*return*/, _a.sent()];
                            }
                        });
                    }); }))];
            case 7:
                reviwerAssignResponse = _b.sent();
                json = (0, CodeReviewNotification_1["default"])(issues, context);
                return [4 /*yield*/, webhook.send(json)];
            case 8:
                _b.sent();
                return [3 /*break*/, 10];
            case 9:
                e_3 = _b.sent();
                console.log(e_3);
                return [3 /*break*/, 10];
            case 10: return [2 /*return*/];
        }
    });
}); };
onPRCreateOrReview();
