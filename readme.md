# jira-github-link

## Current functionality (v2.0.1)

On Pull request creation, review request, and review request removal:
 -  syncs `Reviewers` in Github to the `Code Reviewer(s)` custom field in Jira (this includes clearing the current reviewer in Jira if all reviwers are unassigned in Github)
 -  If number of Reviewers > 1, sends a notification to Slack webhook with an `@` nofication to the reviewer.

## Inputs

- `JIRA_BASE_URL` - Required. Base url of your Jira installation, e.g. <https://yourorg.atlassian.net/>
- `JIRA_API_TOKEN` - Required. API token for Jira REST API.
- `JIRA_USER_EMAIL` - Required. Email of the user the Jira API token belongs to.
- `SLACK_WEBHOOK_URL` - Required. Webhook configured for the slack channel you actually want to use.
- `SLACK_WEBHOOK_URL_DEV` - Webhook configured for the slack channel you want to develop against; maybe your DMs.
- `USERS_PATH` - Path to a formatted JSON file of user information for Slack and Jira. See below for JSON structure.

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
