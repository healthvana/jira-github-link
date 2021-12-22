"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const lodash_1 = require("lodash");
const CodeReviewTemplate = (issues, context) => {
    var _a, _b, _c;
    const issuesBlock = issues.map(issue => {
        const { browseURL, key, fields: { summary, priority: { name: priority }, issueSubtype, description, epicLink, issuetype, epicType } } = issue;
        const isEpic = issuetype.name === 'Epic';
        const epicText = isEpic
            ? '📂 This issue is an Epic'
            : `📂 *Epic:* <${issue.epicURL}|${epicLink} - summary>`;
        const subtype = isEpic
            ? `*Epic Type:*\n${epicType}`
            : `*Issue Subtype:*\n${issueSubtype === null || issueSubtype === void 0 ? void 0 : issueSubtype.value}`;
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Issue:* <${browseURL}|${key} - ${summary}>`
                }
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Priority:*\n${priority}`
                    },
                    {
                        type: 'mrkdwn',
                        text: subtype
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Description:* \n\`\`\`\`${(0, lodash_1.escape)((0, lodash_1.truncate)(issue.fields.description, { length: 200 }))}\`\`\`\``
                    }
                ]
            },
            {
                type: 'context',
                elements: [
                    {
                        type: 'mrkdwn',
                        text: epicText
                    }
                ]
            }
        ];
    });
    const jiraHeader = [
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: `Code Review Requested`,
                emoji: true
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Reviewer(s):* ${issues[0].reviewersInSlack}`
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Developer:* ${(_a = issues[0].fields.developer) === null || _a === void 0 ? void 0 : _a.displayName}`
            }
        },
        {
            type: 'divider'
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
    const github = [
        {
            type: 'divider'
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
                text: `*Branch Name:* ${(_b = context.payload.pull_request) === null || _b === void 0 ? void 0 : _b.head.ref}`
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `_To pull locally_:\n\`git checkout ${(_c = context.payload.pull_request) === null || _c === void 0 ? void 0 : _c.head.ref}\``
            }
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Pull Request:* <${context.payload.pull_request.html_url}| ${context.payload.pull_request.html_url} >`
            }
        },
        {
            type: 'divider'
        }
    ];
    //
    const blocks = [...jiraHeader, ...(0, lodash_1.flatten)(issuesBlock), ...github];
    // console.log(JSON.stringify(blocks, null, 4));
    return {
        blocks
    };
};
exports.default = CodeReviewTemplate;
