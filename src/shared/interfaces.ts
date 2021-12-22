export interface Issue {
  reviewersInSlack: string;
  browseURL: string;
  key: string;
  epicURL: string;
  fields: {
    issuetype: {
      name: string;
    };
    epicLink: string;
    epicType?: string;
    priority: { name: string };
    description: string;
    summary: string;
    issueSubtype: {
      value: string;
    };
    developer: {
      displayName: string;
    };
    codeReviewerS: [displayName: string];
  };
}

export interface Context {
  payload: {
    pull_request?: {
      html_url?: string;
      head?: { ref: string };
    };
  };
}
