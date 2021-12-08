
import { Octokit } from "octokit";
import { createRequire } from "module";
const require = createRequire(import.meta.url);
const { GITHUB_TOKEN } = require("./devconfig.json");

const octokit = new Octokit({
    auth: GITHUB_TOKEN
});

const { data: pullRequest } = await octokit.rest.pulls.get({
    owner: "healthvana",
    repo: "jira-github-link",
    pull_number: 1,
  });

  console.log(pullRequest);