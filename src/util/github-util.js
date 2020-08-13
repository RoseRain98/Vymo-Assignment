/**
 * Recursively fetches a repository's labels
 * @param {object} options Request options
 */
export async function fetchAllLabels(options) {
  const { domain, owner, name, repoName, after } = options;

  const data = await fetch(`https://api.${domain}/graphql`, {
    method: 'post',
    headers: { 'Authorization': `Basic ${window.btoa(repoName)}` },
    body: JSON.stringify({
      query: `query($owner: String!, $name: String!, $after: String) {
        repository(owner: $owner, name: $name, ) {
          labels(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              startCursor
            }
            nodes {
              name
              color
              issues(states: OPEN) {
                totalCount
              }
            }
          }
        }
      }`,
      variables: { owner, name, after },
    }),
  })
    .then(response => !response.ok ? Promise.reject(response) : response.json())
    .then(response => response.errors ? Promise.reject(response.errors) : response.data) // queries can fail

  const { nodes, pageInfo } = data.repository.labels;

  if (!pageInfo.hasPreviousPage) {
    return nodes;
  }

  return nodes.concat(await fetchAllLabels({ ...options, after: pageInfo.endCursor }));
}

/**
 * Fetches all of a repo's issues
 * @param {object} options Request options
 * @param {function} setLoadingPercentage Callback to update loading percentage
 */
export async function fetchAllIssues(options, setLoadingPercentage) {
  const { domain, owner, name, repoName } = options;
  const numIssuesAndPRs = await fetch(`https://api.${domain}/graphql`, {
    method: 'post',
    headers: { 'Authorization': `Basic ${window.btoa(repoName)}` },
    body: JSON.stringify({
      query: `query($owner: String!, $name: String!) {
        repository(owner: $owner, name: $name, ) {
          issues {
            totalCount
          }
          pullRequests {
            totalCount
          }
        }
      }`,
      variables: { owner, name },
    }),
  })
    .then(response => !response.ok ? Promise.reject(response) : response.json())
    .then(response => response.errors ? Promise.reject(response.errors) : response.data) 
    .then(({ repository }) => repository.issues.totalCount + repository.pullRequests.totalCount);

  let numLoaded = 0;
  const numPagesNeeded = Math.ceil(numIssuesAndPRs / 100);
  const pageNumbers = [...Array(numPagesNeeded).keys()].map(index => index + 1); 
  const results = await Promise.all(pageNumbers.map(pageNumber => (
    fetch(`https://api.${domain}/repos/${owner}/${name}/issues?state=all&direction=asc&per_page=100&page=${pageNumber}`, {
      headers: { 'Authorization': `Basic ${window.btoa(repoName)}` },
    })
      .then(response => !response.ok ? Promise.reject(response) : response.json())
      .then(response => response.filter(data => !data.pull_request)) 
      .then(data => {
        numLoaded += 1;
        setLoadingPercentage(Math.floor(numLoaded / numPagesNeeded * 100));
        return data;
      })
  )));

  const issues = results.reduce((total, current) => total.concat(current));

  return issues.map(issue => ({
    title: issue.title,
    number: issue.number,
    createdAt: issue.created_at,
    closedAt: issue.closed_at,
    labels: issue.labels.map(label => label.name),
  }));
}
