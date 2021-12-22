import { truncate, flatten, escape } from 'lodash';
import { Context, Issue } from '../shared/interfaces';

const CodeReviewTemplate = (issues: Issue[], context: Context) => {
  const issuesBlock = issues.map(issue => {
    const {
      browseURL,
      key,
      fields: {
        summary,
        priority: { name: priority },
        issueSubtype,
        description,
        epicLink,
        issuetype,
        epicType
      }
    } = issue;

    const isEpic = issuetype.name === 'Epic';

    const epicText = isEpic
      ? '📂 This issue is an Epic'
      : `📂 *Epic:* <${issue.epicURL}|${epicLink} - summary>`;

    const subtype = isEpic
      ? `*Epic Type:*\n${epicType}`
      : `*Issue Subtype:*\n${issueSubtype?.value}`;
    
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
            text: `*Description:* \n\`\`\`\`${escape(
              truncate(issue.fields.description, { length: 200 })
            )}\`\`\`\``
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
        text: `*Developer:* ${issues[0].fields.developer?.displayName}`
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
        text: `*Branch Name:* ${context.payload.pull_request?.head.ref}`
      }
    },
    {
      type: 'section',
      text: {
        type: 'mrkdwn',
        text: `_To pull locally_:\n\`git checkout ${context.payload.pull_request?.head.ref}\``
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
  const blocks = [...jiraHeader, ...flatten(issuesBlock), ...github];

  // console.log(JSON.stringify(blocks, null, 4));

  return {
    blocks
  };
};

export default CodeReviewTemplate;
