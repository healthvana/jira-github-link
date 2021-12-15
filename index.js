import JiraJS from 'jira.js';
import core from '@actions/core';
// import github from '@actions/github';
import { IncomingWebhook } from '@slack/webhook';

// ----FOR LOCAL DEV
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const {
  JIRA_API_TOKEN,
  JIRA_USER_EMAIL,
  JIRA_BASE_URL,
  SLACK_WEBHOOK_URL
} = require('./devconfig.json');
const users = require('./usermap.json');

const github = {
  context: {
    payload: {
      pull_request: {
        url: 'https://github.com/healthvana/h/pull/6433',
        title: 'HV2-3261 - something',
        head: {
          ref: 'i/HV2-3261/akjshdkjh'
        }
      },
      repository: {
        name: 'h',
        owner: 'healthvana'
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
// const { SLACK_WEBHOOK_URL, JIRA_API_TOKEN, JIRA_USER_EMAIL, JIRA_BASE_URL } = process.env;

// Setup Jira client
const { Version2Client } = JiraJS;
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
      head: { ref: branch }
    },
    number: issue_number,
    repository: {
      name: repo,
      owner: { login: owner }
    }
  } = payload;
  // console.log('payload::', payload);
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

/*

*/
const getIssueInfoFromBranchName = async keys => {
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

const formatCustomFields = issueInfo => {
  //Prepare custom field referance table.
  const { names: customFields } = issueInfo;
  let customFieldMap = {};
  Object.keys(customFields).forEach(jiraName => {
    customFieldMap[customFields[jiraName]] = jiraName;
  });
  return customFieldMap;
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
  const keys = await getIssueKeysfromBranch();
  let issuesInfo = [];
  try {
    issuesInfo = await getIssueInfoFromBranchName(keys);
  } catch (e) {
    return new Error('Unable to return issue info');
  }
  // Fields should be the same across the board
  const customFieldsMap = formatCustomFields(issuesInfo[0]);

  // Get the reviewer's info from the usersmap
  const reviewersInfo = getReviewersInfo();
  const cfCodeReviewerField = customFieldsMap['Code Reviewer(s)'];
  const cfEpicLink = customFieldsMap['Epic Link'];

  const reviewersInJira = reviewersInfo.map(r => {
    return { accountId: r.jiraAccountId };
  });
  let reviewersInSlack = reviewersInfo.map(reviewer => `<@${reviewer.slack}>`);
  reviewersInSlack =
    reviewersInSlack.length > 1
      ? `${reviewersInSlack.join(', ')} are assigned`
      : `${reviewersInSlack[0]} is assigned.`;

  const requestBodyBase = {
    fields: {
      [cfCodeReviewerField]: reviewersInJira
    }
  };

  let reviwerAssignResponse;

  try {
    reviwerAssignResponse = await Promise.all(
      issuesInfo.map(async issue => {
        await webhook.send({
          blocks: [
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: `Code Review Requested`,
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: reviewersInSlack
              }
            },
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: 'Jira',
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Issue:* <${JIRA_BASE_URL}browse/${issue.key}}|${issue.key}>`
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Epic:* <${JIRA_BASE_URL}browse/${issue[cfEpicLink]}|${issue[cfEpicLink]}>`
              }
            },
            {
              type: 'header',
              text: {
                type: 'plain_text',
                text: 'Github',
                emoji: true
              }
            },
            {
              type: 'section',
              text: {
                type: 'mrkdwn',
                text: `*Pull Request* <${context.payload.pull_request.url}|${context.payload.pull_request.url}>`
              }
            }
          ]
        });

        const finalRequestBody = {
          issueIdOrKey: issue.key,
          ...requestBodyBase
        };
        return await jira.issues.editIssue(finalRequestBody);
      })
    );
  } catch (e) {
    console.log(e);
  }
  // TO DO: transition issue, send Slack notification
  //
};
onPRCreateOrReview();
