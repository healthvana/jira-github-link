"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const InvalidIssue = (key) => {
    return `Something went wrong trying to find issue ${key} in Jira.
  
<!-- Invalid issue Comment - added via jira-github-link -->`;
};
exports.default = InvalidIssue;
