import { resolve, dirname } from 'path';
import fs from 'fs';
import core from '@actions/core';
import { context } from '@actions/github';
import { IncomingWebhook } from '@slack/webhook';
import { Version2Client } from 'jira.js';
import { camelCase } from 'lodash';

// Slack notification template
import CodeReviewNotification from './templates/CodeReviewNotification';

// Environment variables. Uses Github's provided variables in Prod
// and a dotenv file locally for development.
const {
  SLACK_WEBHOOK_URL,
  SLACK_WEBHOOK_URL_DEV,
  JIRA_API_TOKEN,
  JIRA_USER_EMAIL,
  JIRA_BASE_URL,
  USERS_PATH,
  GITHUB_WORKSPACE
} = process.env;

// Have to dynamically import the users map
// based on the path provided by the caller Workflow
const h = resolve(GITHUB_WORKSPACE, USERS_PATH);
let users = [];
const getUsersFromFile = async () => {
  return await import(h);
}

// Easily swap whether we're posting to Slack in "dev" (DMs)
// or "prod" (the actual channel we want to post to)
const webhookURL = SLACK_WEBHOOK_URL_DEV;

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

//Setup Slack Client
const webhook = new IncomingWebhook(webhookURL);

// Note: Github context is pre-hydrated by the Actions system
// TODO: Add a fully authed Octokit client to perform github actions

// ---------- ACTION FUNCTIONS

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
    pull_request,
    number: issue_number,
    repository: {
      name: repo,
      owner: { login: owner }
    }
  } = payload;

  if (!pull_request) {
    console.error("Seems like there's no pull_request attached to the Github context; are you sure you're hooked up to the right event type?")
  }
  const {
    title,
    head: { ref: branch }
  } = pull_request;

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
      // TODO: Add a label to issue that there's no Jira ticket
      console.error("no ticket")
    } catch (e) {
      return new Error(
        `No issue keys found in branch name "${branch} and unable to label PR."`
      );
    }
    return new Error(
      `No issue keys found in branch name "${branch}"; PR label added.`
    );
  }
  // TODO: Format PR title with issue key(s) and summaries
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
 * Get the Jira information for a set of Jira issues by key
 * @param {Array} keys An array of strings of issue keys
 * @returns {Array} The information from Jira for those issue keys
 */
const getIssueInfoFromKeys = async (keys: unknown[] | string[] | Error) => {
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
  // TODO: Fetch Epic issue info as well, and append to issue as `issue.epic`
  return issuesData.map(formatCustomFields);
};

/**
 * Get the github login from the PR that triggered the action
 * and get that person's information on all three systems
 * (Slack, Jira, Github)
 * @param {Array} users Dynamically fetched user map
 * @returns {Object} A map of the reviewers information
 */
const getReviewersInfo = (users) => {
  const {
    payload: { requested_reviewers }
  } = context;
  if (!requested_reviewers) return [];
  // find the user in the map
  return requested_reviewers.map(({ login }) => {
    console.log('requested reviewers::', login)
    return users.find(user => user.github.account === login);
  });
};

const onPRCreateOrReview = async (users) => {
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
  const reviewersInfo = getReviewersInfo(users);
  const reviewersInJira = reviewersInfo.map(r => {
    return { accountId: r.jira.accountId };
  });
  let reviewersSlackList = reviewersInfo.map(r => `<@${r.slack.id}>`);
  let reviewersInSlack = reviewersSlackList.join(', ')

  const requestBodyBase = {
    fields: {
      [issues[0].names["codeReviewerS"]]: reviewersInJira
    }
  };

  const keysForLogging = issues.map(i => i.key).join();

  try {
    await Promise.all(
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
  } catch (e) {
    console.error(`Updating Jira tickets ${keysForLogging} failed:`);
    return new Error(e);
  }
  try {
    // Only send notificaton if they are people to notify
    if (!reviewersInfo.length) return;

    // Send only one notification to Slack with all issues
    const json = CodeReviewNotification(issues, context);
    await webhook.send(json);
    console.log('Slack notification json::', JSON.stringify(json, null, 4));
  } catch (e) {
    console.error(`Sending Slack notification for ticket ${keysForLogging} failed:`);
    return new Error(e);
  }
  // TODO: transition issue
};

getUsersFromFile().then(users => {
  onPRCreateOrReview(users);
});

