const InvalidIssue = (key: string) => {
  return `Something went wrong trying to find issue ${key} in Jira.
  
<!-- Invalid issue Comment - added via jira-github-link -->`
};

export default InvalidIssue;
