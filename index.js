import fetch from 'node-fetch';
// import { createRequire } from "module";
// const require = createRequire(import.meta.url);

const {
  JIRA_API_TOKEN,
  JIRA_USER_EMAIL,
  JIRA_BASE_URL
} = process.env;

const getIssueKeyfromBranch = async branch => {
  const projects = await getProjects();
  const projectsRegex = `((${projects.join('|')})-\\d{1,})`;
  const matches = branch.match(new RegExp(projectsRegex));
  if (!matches.length) {
    return new Error(`No issue keys found in branch name "${branch}"`);
  }
  return matches[0];
};

const jiraFetch = async url => {
  const encodedString = Buffer.from(
    `${JIRA_USER_EMAIL}:${JIRA_API_TOKEN}`
  ).toString('base64');

  const response = await fetch(`${JIRA_BASE_URL}${url}`, {
    headers: {
      Authorization: `Basic ${encodedString}`,
    },
  });
  return await response.json();
};

const getProjects = async () => {
  const projects = await jiraFetch('/rest/api/2/project/search');
  return projects.values.map(project => project.key);
};

const getIssue = async issue => {
  return await jiraFetch(`rest/api/2/issue/${issue}?expand=names`);
};

const getIssueInfoFromBranchName = async branch => {
  const key = await getIssueKeyfromBranch(branch);
  const issueData = await getIssue(key);
  return issueData;
};

getIssueInfoFromBranchName(process.argv[2]);
