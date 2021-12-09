import fetch from 'node-fetch';
import core from '@actions/core';
import github from '@actions/github';

const context = github.context;

const { JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL } = process.env;

const getIssueKeyfromBranch = async () => {
  //branch
  const { pull_request } = context;

  console.log(pull_request);

  const {
    title,
    head: { ref: branch },
  } = pull_request;
  // Get every possible project key from Jira
  const projects = await getProjects();
  //Look for possible keys using this regex
  const projectsRegex = `((${projects.join('|')})-\\d{1,})`;
  const branchMatches = branch.match(new RegExp(projectsRegex), 'gi');
  const titleMatches = title.match(new RegExp(projectsRegex));
  if (!branchMatches?.length && !titleMatches?.length) {
    return new Error(`No issue keys found in branch name "${branch}"`);
  }
  const issues = [];
  // evaluate both and return best

  return branchMatches[0];
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
