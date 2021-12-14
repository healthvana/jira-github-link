import JiraJS from 'jira.js';
import core from '@actions/core';
import github from '@actions/github';
import { IncomingWebhook } from '@slack/webhook';

// ----FOR LOCAL DEV
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  JIRA_API_TOKEN,
  JIRA_USER_EMAIL,
  JIRA_BASE_URL,
} = require('./devconfig.json');
const users = require('./usermap.json');

const github = {
  context: {
    payload: {
      pull_request: {
        title: 'PLAN-5, HV-2897 - something',
        head: {
          ref: 'i/PLAN-5/akjshdkjh',
        },
      },
      repository: {
        name: 'h',
        owner: 'healthvana',
      },
      requested_reviewers: [
        {
          login: 'michaelkunc',
        },
      ],
    },
  },
};
// --- FOR PROD
// const { SLACK_WEBHOOK_URL, JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL } = process.env;

// Setup Jira client
const { Version2Client } = JiraJS;
const jira = new Version2Client({
  host: JIRA_BASE_URL,
  authentication: {
    basic: {
      email: JIRA_USER_EMAIL,
      apiToken: JIRA_API_TOKEN,
    },
  },
  telemetry: false,
});

const context = github.context;

//Setup Slack Client
const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL);

// ----------WORKFLOW
/**
 * Uses the context from a github action to take
 * the title and branch name in question and pull out
 * all Jira Project keys.
 * @returns {array} Array of unique issue keys
 */
const getIssueKeysfromBranch = async () => {
  // Get PR info from Github Action context
  const { payload } = context;
  const {
    pull_request: {
      title,
      head: { ref: branch },
    },
    number: issue_number,
    repository: {
      name: repo,
      owner: { login: owner },
    },
    requested_reviewers,
  } = payload;
  console.log('payload::', payload);
  // Get every possible project key from Jira
  const projectsInfo = await jira.projects.getAllProjects();
  const projects = projectsInfo.map(prj => prj.key);
  // Look for possible keys using this regex
  const projectsRegex = `((${projects.join('|')})-\\d{1,})`;
  const regexp = new RegExp(projectsRegex, 'gi');
  const branchMatches = branch.match(regexp);
  const titleMatches = title.match(regexp);
  // If none, throw; label PR
  if (!branchMatches?.length && !titleMatches?.length) {
    try {
      github.issues.addLabels({
        owner,
        repo,
        issue_number,
        label: [{ name: 'NO JIRA TICKET' }],
      });
    } catch (e) {
      return new Error(
        `No issue keys found in branch name "${branch} and unable to label PR."`
      );
    }
    return new Error(
      `No issue keys found in branch name "${branch}"; PR label added.`
    );
  }
  return [...new Set(branchMatches.concat(titleMatches))];
};

/*

*/
const getIssueInfoFromBranchName = async keys => {
  const issuesData = await Promise.all(
    keys.map(async key => {
      let data = null;
      try {
        data = await jira.issues.getIssue({ issueIdOrKey: key, expand: "names" });
      } catch (e) {
        console.error(
          `Issue ${key} could not be found in Jira or could not be fetched:`
        );
        console.error(e);
      }
      return data;
    })
  );

  core.setOutput('issuesData', issuesData);
  console.log(issuesData);
  return issuesData;
};

const setCodeReviewer = async issueInfo => {
  const { key } = issueInfo;
  jira.issues.editIssue({
    issueIdOrKey: key,
    fields: {},
  });
};



const onPRCreateOrReview = async () => {
  const keys = await getIssueKeysfromBranch();
  let issuesInfo = [];
  try {
    issuesInfo = await getIssueInfoFromBranchName(keys);
  } catch (e) {
    return new Error('Unable to return issue info');
  }
  const { expand: { names: customFields }} = issuesInfo[0];
  //Prepare custom field referance table.
  let customFieldMap = {};
  Object.keys(customFields).forEach(jiraName => {
    customFieldMap[customFields[jiraName]] = jiraName;
  });
  await Promise.all(issuesInfo.forEach(issue => setCodeReviewer()));
  // await webhook.send({
  //   text: "test",
  // });
};
