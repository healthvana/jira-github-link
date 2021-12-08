import core from '@actions/core';
import github from '@actions/github';
import { IncomingWebhook } from '@slack/webhook';
import { Version2Client } from 'jira.js';
import { camelCase } from 'lodash';

import CodeReviewNotification from './templates/CodeReviewNotification';

// --- FOR PROD
const { SLACK_WEBHOOK_URL, SLACK_WEBHOOK_URL_DEV, JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL, USERS_PATH } = process.env;

const users = import(USERS_PATH);

const webhookURL = SLACK_WEBHOOK_URL;

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
const webhook = new IncomingWebhook(webhookURL);

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
  console.log('payload::', payload);

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
 * Mutates and transforms the standard Jira issue JSON format for easier use in templating
 * @param {Object} issue An issue from Jira
 * @returns {Object} The issue with custom fields translated to plain text
 */
const formatCustomFields = (issue) => {
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
 * @param {Array} keys An array of strings of issue keys
 * @returns {Array} The information from Jira for those issue keys
 */
const getIssueInfoFromKeys = async (keys: string[] | Error) => {
  if (keys instanceof Error) return;
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
        return new Error(e);
      }
      return data;
    })
  );
  // TO DO: Fetch Epic issue info as well, and append to issue as `issue.epic`
  const formattedissues = issuesData.map(formatCustomFields);
  return formattedissues;
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
    return users.find(user => user.github.account === login);
  });
};

const onPRCreateOrReview = async () => {
  // Get the issue keys from the PR title and branch name
  const keys = await getIssueKeysfromBranch();

  // Get the info from Jira for those issue keys
  let issues = [];
  if (keys instanceof Error) {
    return keys;
  }
  try {
    issues = await getIssueInfoFromKeys(keys);
  } catch (e) {
    return new Error('Unable to return issue info');
  }

  // Get the reviewer's info from the usersmap
  const reviewersInfo = getReviewersInfo();
  const reviewersInJira = reviewersInfo.map(r => {
    return { accountId: r.jira.accountId };
  });
  let reviewersInSlackList = reviewersInfo.map(reviewer => `<@${reviewer.slack.id}>`);
  let reviewersInSlack = reviewersInSlackList.join(', ')

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
        issue.epicURL = `${JIRA_BASE_URL}browse/${issue.fields.epicLink}`;
        issue.browseURL = `${JIRA_BASE_URL}browse/${issue.key}`;

        const finalRequestBody = {
          issueIdOrKey: issue.key,
          ...requestBodyBase
        };
        // assign to Code Reviewer in Jira
        return await jira.issues.editIssue(finalRequestBody);
      })
    );
    // Send only one notification to Slack with all issues
    const json = CodeReviewNotification(issues, context);
    await webhook.send(json);
    // console.log(json)
  } catch (e) {
    console.log(e);
  }
  // TO DO: transition issue
  //
};
onPRCreateOrReview();
