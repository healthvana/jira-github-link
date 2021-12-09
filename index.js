import fetch from 'node-fetch';
import core from '@actions/core';
import github from '@actions/github';

const context = github.context;

const { JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL } = process.env;

const getIssueKeyfromBranch = async () => {
  //branch
  const {
    title,
    base: { ref: branch },
  } = context;
  const projects = await getProjects();
  const projectsRegex = `((${projects.join('|')})-\\d{1,})`;
  // TO DO: also check title
  const matches = branch.match(new RegExp(projectsRegex));
  const titleMatches = title.match(new RegExp(projectsRegex));
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

// const getIssueInfoFromBranchName = async () => {
//   const key = await getIssueKeyfromBranch();
//   const issueData = await getIssue(key);
//   core.setOutput('issueData', issueData);
//   console.log(context);
//   return issueData;
// };

getIssueKeyfromBranch();
