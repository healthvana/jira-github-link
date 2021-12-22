import { Issue } from '../shared/interfaces';

const PRCommentTemplate = (issues: Issue[]) => {
  let comments = issues.map(issue => {
    const {key, fields: { summary, description }} = issue;
    return `
# ${key}: ${summary}
${description}
`;
  });

  comments.push(`
<!-- PR Creation Comment - added via jira-github-link -->
`);

  return comments.join(`
----
  `);
};

export default PRCommentTemplate;
