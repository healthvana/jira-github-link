import { resolve, dirname } from 'path';
import fs from 'fs';
import * as core from '@actions/core';
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
  GITHUB_WORKSPACE,
  USERS
} = process.env;

// Easily swap whether we're posting to Slack in "dev" (DMs)
// or "prod" (the actual channel we want to post to)
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
    core.setFailed(
      "Seems like there's no pull_request attached to the Github context; are you sure you're hooked up to the right event type?"
    );
  }
  const {
    title,
    head: { ref: branch }
  } = pull_request;
  core.startGroup('GithubContext');
  core.info(JSON.stringify(pull_request, null, 2));
  core.endGroup();

  // Get all existing project keys from Jira
  const projectsInfo = await jira.projects.getAllProjects();
  const projects = projectsInfo.map(prj => prj.key);

  // Look for possible keys using this regex
  const projectsRegex = `((${projects.join('|')})-\\d{1,})`;
  const regexp = new RegExp(projectsRegex, 'gi');
  const branchMatches = branch.match(regexp);
  const titleMatches = title.match(regexp);

  core.debug('branchMatches::');
  core.debug(branchMatches);
  core.debug('titleMatches::');
  core.debug(titleMatches);

  // If none, throw; label PR
  if (!branchMatches?.length && !titleMatches?.length) {
    try {
      // TODO: Add a label to issue that there's no Jira ticket
      console.error('no ticket');
    } catch (e) {
      core.setFailed(
        `No issue keys found in branch name "${branch} and unable to label PR."`
      );
    }
    return;
    core.setFailed(
      `No issue keys found in branch name "${branch}"; PR label added.`
    );
    return;
  }
  // TODO: Format PR title with issue key(s) and summaries
  return [...new Set(branchMatches.concat(titleMatches))];
};

/**
 * Mutates and transforms the standard Jira issue JSON format for easier use in templating
 * @param {Object} issue An issue from Jira
 * @returns {Object} The issue with custom fields translated to plain text
 */
const formatCustomFields = issue => {
  core.startGroup('Formatting issue fields');
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
  core.debug(`Issue${issue.key}Formatted::`);
  core.debug(issue);
  core.endGroup();
  return issue;
};

/**
 * Get the Jira information for a set of Jira issues by key
 * @param {Array} keys An array of strings of issue keys
 * @returns {Array} The information from Jira for those issue keys
 */
const getIssueInfoFromKeys = async (keys: unknown[] | string[]) => {
  core.startGroup('Retrieve Jira Info by Keys');
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
        core.setFailed(e);
      }
      return data;
    })
  );
  // TODO: Fetch Epic issue info as well, and append to issue as `issue.epic`
  return issuesData.map(formatCustomFields);
  core.endGroup();
};

/**
 * Get the github login from the PR that triggered the action
 * and get that person's information on all three systems
 * (Slack, Jira, Github)
 * @param {Array} users Dynamically fetched user map
 * @returns {Object} A map of the reviewers information
 */

const getReviewersInfo = () => {
  core.startGroup('Retrieve reviwer information');
  const {
    payload: {
      pull_request: { requested_reviewers }
    }
  } = context;
  core.info('requested_reviewers::');
  core.info(requested_reviewers);
  const users = JSON.parse(USERS);

  if (!requested_reviewers) return [];
  // find the user in the map
  return requested_reviewers.map(({ login }) => {
    console.log('requested reviewers::', login);
    return users.find(user => user.github.account === login);
  });
  core.endGroup();
};

const onPRCreateOrReview = async () => {
  core.startGroup('Start `onPRCreateorReview`');
  // Get the issue keys from the PR title and branch name
  const keys = await getIssueKeysfromBranch();

  // Get the info from Jira for those issue keys
  let issues = [];
  if (keys instanceof Error) {
    return keys;
    core.setFailed('Invalue issue keys.');
  }
  try {
    issues = await getIssueInfoFromKeys(keys);
  } catch (e) {
    core.setFailed(e);
  }

  // Get the reviewer's info from the usersmap
  const reviewersInfo = getReviewersInfo();
  core.debug('reviewersInfo::');
  core.debug(reviewersInfo);
  const reviewersInJira = reviewersInfo.map(r => {
    return { accountId: r.jira.accountId };
  });
  let reviewersSlackList = reviewersInfo.map(r => `<@${r.slack.id}>`);
  let reviewersInSlack = reviewersSlackList.join(', ');

  const requestBodyBase = {
    fields: {
      [issues[0].names['codeReviewerS']]: reviewersInJira
    }
  };
  core.info('Jira requestBodyBase::');
  core.info(JSON.stringify(requestBodyBase, null, 4) || '');

  core.setOutput('issueKeys', issues);
  const keysForLogging = keys.join();

  try {
    await Promise.all(
      issues.map(async issue => {
        issue.reviewersInSlack = reviewersInSlack;
        issue.epicURL = `${JIRA_BASE_URL}/browse/${issue.fields.epicLink}`;
        issue.browseURL = `${JIRA_BASE_URL}/browse/${issue.key}`;

        const finalRequestBody = {
          issueIdOrKey: issue.key,
          ...requestBodyBase
        };
        // assign to Code Reviewer in Jira
        const jiraEditResp = await jira.issues.editIssue(finalRequestBody);
        core.debug('Jira Editing response::');
        core.debug(JSON.stringify(jiraEditResp, null, 4));
      })
    );
  } catch (e) {
    console.error(`Updating Jira tickets ${keysForLogging} failed:`);
    return core.setFailed(e);
  }
  core.endGroup();
  core.startGroup('Send Slack Notification');
  let slackResponse;
  try {
    // Only send notificaton if they are people to notify
    if (!reviewersInfo.length) return;

    // Send only one notification to Slack with all issues
    const json = CodeReviewNotification(issues, context);
    slackResponse = await webhook.send(json);
    core.info('Slack notification json::');
    core.info(JSON.stringify(json, null, 4));
    core.debug('slackResponse:');
    core.debug(slackResponse);
  } catch (e) {
    console.error(
      `Sending Slack notification for ticket ${keysForLogging} failed:`
    );
    core.setFailed(e);
  }
  // TODO: transition issue
  core.endGroup();
};

onPRCreateOrReview();
