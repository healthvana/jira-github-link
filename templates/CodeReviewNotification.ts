interface Issue {
  reviewersInSlack: string;
  browseURL: string;
  key: string;
  epicURL: string;
  epicLink: string;
}

interface Context {
  payload: {
    pull_request: {
      url: string;
    }
  }
}


const CodeReviewTemplate = (issues: Issue[], context: Context) => {

  return {
    blocks: [
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
          text: issues[0].reviewersInSlack,
        },
      },
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: 'Jira',
          emoji: true,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Issue(s):* ${issues.map(issue => `<${issue.browseURL}|${issue.key}>`)}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Epic(s):* ${issues.map(issue => `<${issue.epicURL}|${issue.epicLink}>`)}`,
        },
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
          text: `* Pull Request* <${context.payload.pull_request.url}| ${context.payload.pull_request.url} > `,
        },
      },
    ],
  };
};

export default CodeReviewTemplate;