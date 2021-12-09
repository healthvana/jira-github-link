import fetch from 'node-fetch';
import core from '@actions/core';
// import github from '@actions/github';

// ----FOR LOCAL DEV
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  JIRA_API_TOKEN,
  JIRA_USER_EMAIL,
  JIRA_BASE_URL,
} = require('./devconfig.json');
const github = {
  context: {
    payload: {
      pull_request: {
        title: 'PLAN-5, HV-2897 - something',
        head: {
          ref: 'i/PLAN-5/akjshdkjh',
        },
      },
    },
  },
};
//

const context = github.context;

// --- FOR PROD
// const { JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL } = process.env;
//

// UTILS - Authed Jira fetch functions
/**
 *
 * @param {string} url Stub of the rest API url, ex: '/rest/api/2/project/search'
 * @returns {object} JSON response
 */
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

/**
 * Gets all existing projects from Jira
 * @returns {array}
 */
const getProjects = async () => {
  const projects = await jiraFetch('/rest/api/2/project/search');
  return projects.values.map(project => project.key);
};

/**
 * Gets information on a specific JIRA issue
 * @param {string} issue Jira issue key
 * @returns {object} issue information
 */
const getIssue = async issue => {
  return await jiraFetch(`rest/api/2/issue/${issue}?expand=names`);
};

// ----------WORKFLOW
/**
 * Uses the context from a github action to take
 * the title and branch name in question and pull out
 * all Jira Project keys.
 * @returns {array} Array of issue keys
 */
const getIssueKeysfromBranch = async () => {
  // Get PR info from Github Action context
  const {
    payload: {
      pull_request: {
        title,
        head: { ref: branch },
      },
    },
  } = context;

  // Get every possible project key from Jira
  const projects = await getProjects();
  // Look for possible keys using this regex
  const projectsRegex = `((${projects.join('|')})-\\d{1,})`;
  const regexp = new RegExp(projectsRegex, 'gi');
  const branchMatches = branch.match(regexp);
  const titleMatches = title.match(regexp);
  // If none, throw; maybe later comment on the PR?
  if (!branchMatches?.length && !titleMatches?.length) {
    
    return new Error(`No issue keys found in branch name "${branch}"`);
  }
  return [...new Set(branchMatches.concat(titleMatches))];
};

const getIssueInfoFromBranchName = async () => {
  const keys = await getIssueKeysfromBranch();
  console.log('keys::', keys);
  const issuesData = await Promise.all(
    keys.map(async key => {
      let data = null;
      try {
        data = await getIssue(key);
      } catch (e) {
        console.error(
          `Issue ${key} could not be found in Jira or could not be fetched:`
        );
        console.error(e);
      }
      return data;
    })
  );

  // core.setOutput('issuesData', issuesData);
  console.log(issuesData);
  return issuesData;
};

getIssueInfoFromBranchName();
