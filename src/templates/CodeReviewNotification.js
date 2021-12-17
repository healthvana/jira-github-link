"use strict";
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
var lodash_1 = require("lodash");
var CodeReviewTemplate = function (issues, context) {
    var issuesBlock = issues.map(function (issue) {
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: "*Issue:* <".concat(issue.browseURL, "|").concat(issue.key, " - ").concat(issue.fields.summary, ">")
                }
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: "*Priority:* \n".concat(issue.fields.priority.name)
                    },
                    {
                        type: 'mrkdwn',
                        text: "*Issue Subtype:* \n".concat(issue.fields.issueSubtype.value)
                    },
                    {
                        type: 'mrkdwn',
                        text: "*Description:* \n````".concat((0, lodash_1.escape)((0, lodash_1.truncate)(issue.fields.description, { length: 200 })), "````")
                    }
                ]
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: "\uD83D\uDCC2 *Epic:* <".concat(issue.epicURL, "|").concat(issue.fields.epicLink, " - summary>")
                    }
                ]
            }
        ];
    });
    var jiraHeader = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: "Code Review Requested",
                emoji: true
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: "*Reviewer(s):* ".concat(issues[0].reviewersInSlack)
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: "*Developer:* ".concat(issues[0].fields.developer.displayName)
            }
        },
        {
            "type": "divider"
        },
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: 'Jira',
                emoji: true
            }
        }
    ];
    var github = [{
            "type": "divider"
        },
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: 'Github',
                emoji: true
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: "*Pull Request:* <".concat(context.payload.pull_request.url, "| ").concat(context.payload.pull_request.url, " >")
            }
        },
        {
            "type": "divider"
        }];
    var blocks = __spreadArray(__spreadArray(__spreadArray([], jiraHeader, true), (0, lodash_1.flatten)(issuesBlock), true), github, true);
    // console.log(JSON.stringify(blocks, null, 4));
    return {
        blocks: blocks
    };
};
exports["default"] = CodeReviewTemplate;
