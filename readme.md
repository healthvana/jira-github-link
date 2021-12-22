# jira-github-link

## Current functionality (v2.1.0)

On Pull request creation, review request, and review request removal:
 - Checks branch name and PR title for Jira issue keys that match linked projects
 - Grabs issue information based on keys, and posts a comment in the PR with that info.
 - Syncs `Reviewers` in Github to the `Code Reviewer(s)` custom field in Jira (this includes clearing the current reviewer in Jira if all reviwers are unassigned in Github)
 - If number of Reviewers > 1 and issue type is _not_ an Epic, sends a notification to Slack webhook with an `@` nofication to the reviewer.
 - If no issues can be found in the branch name or PR title, adds the label "NO JIRA TICKET" to the PR

## Inputs

- `JIRA_BASE_URL` - Required. Base url of your Jira installation, e.g. <https://yourorg.atlassian.net/>
- `JIRA_API_TOKEN` - Required. API token for Jira REST API.
- `JIRA_USER_EMAIL` - Required. Email of the user the Jira API token belongs to.
- `SLACK_WEBHOOK_URL` - Required. Webhook configured for the slack channel you actually want to use.
- `SLACK_WEBHOOK_URL_DEV` - Optional. Webhook configured for the slack channel you want to develop against; maybe your DMs.
- `USERS_PATH` - Required. Path to a formatted JSON file of user information for Slack and Jira. See below for JSON structure.
- `GH_API_TOKEN` - Required. API Token for Github, to authenticate a fully copy of Octokit.

## Users file

User information should be in the following format, with at least the following keys:

```json
[
  {
    "slack": {
      "id": "string"
    },
    "jira": {
      "accountId": "string",
      "displayName": "string",
    },
    "github": {
      "account": "string",
      "displayNames": ["string"]
    }
  }
  ...
]
```
