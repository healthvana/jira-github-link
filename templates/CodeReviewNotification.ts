const CodeReviewTemplate = (issue:object, context:object) => {
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
          text: reviewersInSlack,
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
          text: `*Issue:* <${issue.browseURL}|${issue.key}>`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Epic:* <${issue.epicURL}|${issue.epicLink}>`,
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
          text: `*Pull Request* <${context.payload.pull_request.url}|${context.payload.pull_request.url}>`,
        },
      },
    ],
  };
};

export default CodeReviewTemplate;