"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const PRCommentTemplate = (issues) => {
    let comments = issues.map(issue => {
        const { key, fields: { summary, description } } = issue;
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
exports.default = PRCommentTemplate;
