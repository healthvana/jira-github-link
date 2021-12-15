// import { createRequire } from 'module';
// const require = createRequire(import.meta.url);

import { camelCase } from 'lodash';
import { Version2Client } from 'jira.js';
import core from '@actions/core';
// import github from '@actions/github';
import { IncomingWebhook } from '@slack/webhook';

import CodeReviewNotification from '../templates/CodeReviewNotification';

// ----FOR LOCAL DEV

const {
  JIRA_API_TOKEN,
  JIRA_USER_EMAIL,
  JIRA_BASE_URL,
  SLACK_WEBHOOK_URL_DEV
} = require('../devconfig.json');
const users = require('../usermap.json');

const github = {
  issues: {
    addLabels: (config) => config
  },
  context: {
    payload: {
      pull_request: {
        url: 'https://github.com/healthvana/h/pull/6433',
        title: 'HV2-3261 - something',
        head: {
          ref: 'i/HV2-3261/akjshdkjh'
        }
      },
      number: 1,
      repository: {
        name: 'h',
        owner: { login: 'healthvana' }
      },
      requested_reviewers: [
        {
          login: 'michaelkunc'
        }
      ]
    }
  }
};
// --- FOR PROD
// const { SLACK_WEBHOOK_URL_DEV, JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL } = process.env;

// Setup Jira client
const jira = new Version2Client({
  host: JIRA_BASE_URL,
  authentication: {
    basic: {
      email: JIRA_USER_EMAIL,
      apiToken: JIRA_API_TOKEN
    }
  },
  telemetry: false
});

const context = github.context;

//Setup Slack Client
const webhook = new IncomingWebhook(SLACK_WEBHOOK_URL_DEV);

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
      head: { ref: branch }
    },
    number: issue_number,
    repository: {
      name: repo,
      owner: { login: owner }
    }
  } = payload;
  // console.log('payload::', payload);

  // Get all existing project keys from Jira
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
        label: [{ name: 'NO JIRA TICKET' }]
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

/**
 *
 * @param {Array} keys An array of strings of issue keys
 * @returns {Array} The information from Jira for those issue keys
 */
const getIssueInfoFromKeys = async (keys: string[] | Error) => {
  if (keys instanceof Error) {
    return;
  }
  const issuesData = await Promise.all(
    keys.map(async key => {
      let data = null;
      try {
        data = await jira.issues.getIssue({
          issueIdOrKey: key,
          expand: 'names'
        });
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
  return issuesData;
};

/**
 * Mutates and transforms the standard Jira issue JSON format for easier use in templating
 * @param {Object} issue An issue from Jira
 * @returns {Object} The issue with custom fields translated to plain text
 */
const formatCustomFields = (issue) => {
  console.log('issue::', issue);
  const { names: customFields } = issue;
  let fieldMap = {};
  Object.keys(customFields)
    .filter(jiraName => {
      return jiraName.includes('custom');
    })
    .forEach(jiraName => {
      const formattedKey = camelCase(customFields[jiraName]);
      const value = issue.fields[jiraName];
      fieldMap[formattedKey] = jiraName;
      issue.fields[formattedKey] = value;
      delete issue.fields[jiraName];
    });
  // replace the old names area with the new map
  issue.names = fieldMap;
  return issue;
};

/**
 *
 * @param {Object} issueInfo
 */
const getReviewersInfo = () => {
  const {
    payload: { requested_reviewers }
  } = context;

  // find the user in the map
  return requested_reviewers.map(({ login }) => {
    return users.find(user => user.github === login);
  });
};

const onPRCreateOrReview = async () => {
  // Get the issue keys from the PR title and branch name
  const keys = await getIssueKeysfromBranch();

  // Get the info from Jira for those issue keys
  let issues = [];
  try {
    issues = await getIssueInfoFromKeys(keys);
  } catch (e) {
    return new Error('Unable to return issue info');
  }
  // Fields should be the same across the board,
  // so just grab the first issue
  issues = issues.map(formatCustomFields);

  // Get the reviewer's info from the usersmap
  const reviewersInfo = getReviewersInfo();
  const reviewersInJira = reviewersInfo.map(r => {
    return { accountId: r.jiraAccountId };
  });
  let reviewersInSlackList = reviewersInfo.map(reviewer => `<@${reviewer.slack}>`);
  let reviewersInSlack =
    reviewersInSlackList.length > 1
      ? `${reviewersInSlackList.join(', ')} are assigned`
      : `${reviewersInSlackList[0]} is assigned.`;

  const requestBodyBase = {
    fields: {
      [issues[0].names["codeReviewerS"]]: reviewersInJira
    }
  };

  let reviwerAssignResponse;

  try {
    reviwerAssignResponse = await Promise.all(
      issues.map(async issue => {
        issue.reviewersInSlack = reviewersInSlack;
        issue.epic = issue.fields.epicLink;
        issue.epicURL = `${JIRA_BASE_URL}browse/${issue.epic}`;
        issue.browseURL = `${JIRA_BASE_URL}browse/${issue.key}`;

        const finalRequestBody = {
          issueIdOrKey: issue.key,
          ...requestBodyBase
        };
        // assign to Code Reviewer in Jira
        // return await jira.issues.editIssue(finalRequestBody);
      })
    );
    // Send only one notification to Slack with all issues
    const json = CodeReviewNotification(issues, context);

    console.log(json);

    // await webhook.send(json);
  } catch (e) {
    console.log(e);
  }
  // TO DO: transition issue, send Slack notification
  //
};
onPRCreateOrReview();
