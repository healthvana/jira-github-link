import { resolve, dirname } from 'path';
import fs from 'fs';
import * as core from '@actions/core';
import { getOctokit, context } from '@actions/github';
//Dev
// import context from './fixtures/github-fake.json';
import { IncomingWebhook } from '@slack/webhook';
import { Version2Client } from 'jira.js';
import { camelCase, truncate } from 'lodash';

// Slack notification template
import CodeReviewNotification from './templates/CodeReviewNotification';
import PRComment from './templates/PRComment';
import InvalidIssue from './templates/InvalidIssue';

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
  GH_API_TOKEN,
  USERS
} = process.env;

// Easily swap whether we're posting to Slack in "dev" (DMs)
// or "prod" (the actual channel we want to post to)
const webhookURL = SLACK_WEBHOOK_URL;

// Setup Gitub client (Octokit) for POST/PUT
// Note: Github context is pre-hydrated by the Actions system
// So generally there's no need to GET
const octokit = getOctokit(GH_API_TOKEN);

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

// Get PR info from Github Action context
const {
  payload: {
    pull_request,
    number: issue_number,
    repository: {
      name: repo,
      owner: { login: owner }
    }
  }
} = context;

core.info(JSON.stringify(context, null, 4));

// ---------- ACTION FUNCTIONS

/**
 * Uses the context from a github action to take
 * the title and branch name in question and pull out
 * all Jira Project keys.
 * @returns {array} Array of unique issue keys
 */
const getIssueKeysfromBranch = async () => {
  if (!pull_request) {
    core.setFailed(
      "Seems like there's no pull_request attached to the Github context; are you sure you're hooked up to the right event type?"
    );
  }
  const {
    title,
    head: { ref: branch }
  } = pull_request;
  core.startGroup('Github Context');
  core.info(JSON.stringify(context, null, 2));
  core.endGroup();

  // Get all existing project keys from Jira
  let projectsInfo;
  try {
    projectsInfo = await jira.projects.getAllProjects();
  } catch (e) {
    core.error("Couldn't fetch Jira Projects:");
    core.error(e);
  }
  const projects = projectsInfo.map(prj => prj.key);
  core.exportVariable('PROJECTS', JSON.stringify(projects));

  // Look for possible keys using this regex
  const projectsRegex = `((${projects.join('|')})[- _]\\d{1,})`;
  const regexp = new RegExp(projectsRegex, 'gi');
  const branchMatches = branch.match(regexp) || [];
  const titleMatches = title.match(regexp) || [];

  core.startGroup('Key Matches debug');
  core.debug('branchMatches::');
  core.debug(JSON.stringify(branchMatches));
  core.debug('titleMatches::');
  core.debug(JSON.stringify(titleMatches));
  core.endGroup();

  // If none, throw; label PR
  if (!branchMatches?.length && !titleMatches?.length) {
    try {
      // TODO: Add a label to issue that there's no Jira ticket
      core.error('no ticket');
    } catch (e) {
      core.setFailed(
        `No issue keys found in branch name "${branch} and unable to label PR."`
      );
      return;
    }
    octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number,
      labels: [{ name: 'NO JIRA TICKET' }]
    });
    core.setFailed(
      `No issue keys found in branch name "${branch}"; PR label added.`
    );
    return;
  }
  //make case insensitive, force dash
  const makeInsensitive = k => k.toUpperCase().replace(/[_ ]/, '-');

  const branchI = branchMatches.map(makeInsensitive);
  const titleI = titleMatches.map(makeInsensitive);

  // TODO: Format PR title with issue key(s) and summaries
  const allKeys = [...new Set(branchI.concat(titleI))];
  core.info('All keys found::');
  core.info(JSON.stringify(allKeys));
  return allKeys;
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

  core.debug(`Issue Formatted::`);
  core.debug(JSON.stringify(issue));
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
      let data = {};
      try {
        data = await jira.issues.getIssue({
          issueIdOrKey: key,
          expand: 'names'
        });
      } catch (e) {
        core.error(
          `Issue ${key} could not be found in Jira or could not be fetched:`
        );
        octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number,
          body: InvalidIssue(key)
        });
        core.setFailed(e);
      }
      return data;
    })
  );
  // TODO: Fetch Epic issue info as well, and append to issue as `issue.epic`
  core.debug('Issues data before formatting::');
  core.debug(JSON.stringify(issuesData, null, 4));
  const formattedIssues = issuesData.map(formatCustomFields);
  core.debug('Issues data before formatting::');
  core.debug(JSON.stringify(formattedIssues, null, 4));
  core.endGroup();
  return formattedIssues;
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
  core.info(JSON.stringify(requested_reviewers));
  const users = JSON.parse(USERS);

  if (!requested_reviewers) return [];
  // find the user in the map
  return requested_reviewers.map(user => {
    const { login } = user;
    core.info('github login::');
    core.info(login);
    return users.find(user => user.github.account === login);
  });
  core.endGroup();
};

const onPRCreateOrReview = async () => {
  core.debug('Start `onPRCreateOrReview`');

  // Get the issue keys from the PR title and branch name
  core.debug('Getting keys...');
  const keys = await getIssueKeysfromBranch();

  // Get the info from Jira for those issue keys
  let issues = [];
  if (keys instanceof Error) {
    core.setFailed('Invalid issue keys.');
    return;
  }

  core.debug('Getting issue info from Jira...');
  try {
    issues = await getIssueInfoFromKeys(keys);
  } catch (e) {}

  const keysDisplay = keys.join(', ');
  const pull_number = issue_number;

  core.debug('Updating PR title...');
  octokit.rest.pulls.update({
    owner,
    repo,
    pull_number,
    title: `${keysDisplay}: ${truncate(
      issues
        .map(i => {
          return i.fields.summary;
        })
        .join(', '),
      {
        length: 50
      }
    )}`
  });
  core.debug('Adding Jira info in a comment...');
  // TODO: Add this in a discrete Action step and save to local so we can use globally in this stage
  const comments = await octokit.rest.issues.listComments({
    owner,
    repo,
    issue_number
  });

  core.exportVariable('COMMENTS', JSON.stringify(comments));
  // Only add a new comment if one doesn't already exist
  if (!comments.data.some(c => c.body.includes('PR Creation Comment'))) {
    octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number,
      body: PRComment(issues)
    });
  }

  // Get the reviewer's info from the usersmap
  const reviewersInfo = getReviewersInfo();
  core.debug('reviewersInfo::');
  core.debug(JSON.stringify(reviewersInfo));
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
  core.info('Jira Update Code Reviewer requestBodyBase::');
  core.info(JSON.stringify(requestBodyBase, null, 4) || '');

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
        let jiraEditResp;
        if (issue.fields.issuetype.name !== 'Epic') {
          // assign to Code Reviewer in Jira
          jiraEditResp = await jira.issues.editIssue(finalRequestBody);
          core.debug('Jira Editing response::');
          core.debug(JSON.stringify(jiraEditResp, null, 4));
        } else {
          core.info("Epics don't have code reviewers; skipping updating Jira");
          jiraEditResp = Promise.resolve();
        }
        return jiraEditResp;
      })
    );
  } catch (e) {
    core.error(`Updating Jira tickets ${keysDisplay} failed:`);
    core.error(e);
  }

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
    core.debug(JSON.stringify(slackResponse, null, 4));
  } catch (e) {
    core.error(`Sending Slack notification for ticket ${keysDisplay} failed:`);
    core.error(e);
  }
  // TODO: transition issue
  core.endGroup();
};

onPRCreateOrReview();
