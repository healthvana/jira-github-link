import { truncate, flatten, escape } from 'lodash';
const CodeReviewTemplate = (issues, context) => {
    const issuesBlock = issues.map(issue => {
        return [
            {
                type: 'section',
                text: {
                    type: 'mrkdwn',
                    text: `*Issue:* <${issue.browseURL}|${issue.key} - ${issue.fields.summary}>`
                }
            },
            {
                type: 'section',
                fields: [
                    {
                        type: 'mrkdwn',
                        text: `*Priority:* \n${issue.fields.priority.name}`
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Issue Subtype:* \n${issue.fields.issueSubtype.value}`
                    },
                    {
                        type: 'mrkdwn',
                        text: `*Description:* \n\`\`\`\`${escape(truncate(issue.fields.description, { length: 200 }))}\`\`\`\``
                    }
                ]
            },
            {
                type: "context",
                elements: [
                    {
                        type: "mrkdwn",
                        text: `📂 *Epic:* <${issue.epicURL}|${issue.fields.epicLink} - summary>`
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
                emoji: true,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Reviewer(s):* ${issues[0].reviewersInSlack}`,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Developer:* ${issues[0].fields.developer.displayName}`,
            },
        },
        {
            "type": "divider"
        },
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: 'Jira',
                emoji: true,
            },
        }
    ];
    const github = [{
            "type": "divider"
        },
        {
            type: 'header',
            text: {
                type: 'plain_text',
                text: 'Github',
                emoji: true,
            },
        },
        {
            type: 'section',
            text: {
                type: 'mrkdwn',
                text: `*Pull Request:* <${context.payload.pull_request.html_url}| ${context.payload.pull_request.html_url} >`,
            },
        },
        {
            "type": "divider"
        }
    ];
    const blocks = [...jiraHeader, ...flatten(issuesBlock), ...github];
    // console.log(JSON.stringify(blocks, null, 4));
    return {
        blocks
    };
};
export default CodeReviewTemplate;
