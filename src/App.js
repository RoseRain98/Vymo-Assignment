
import React, { Component, Fragment } from 'react';
import { Line, Chart } from 'react-chartjs-2';
import { fetchAllLabels, fetchAllIssues } from './util/github-util';
import './App.css';

// The vertical line that follows the mouse (https://stackoverflow.com/a/45172506/8917446)
const originalLine = Chart.controllers.line;
Chart.controllers.line = Chart.controllers.line.extend({
  draw: function (ease) {
    originalLine.prototype.draw.call(this, ease);

    if (this.chart.tooltip._active && this.chart.tooltip._active.length) {
      var activePoint = this.chart.tooltip._active[0],
        ctx = this.chart.ctx,
        x = activePoint.tooltipPosition().x,
        topY = this.chart.scales['y-axis-0'].top,
        bottomY = this.chart.scales['y-axis-0'].bottom;

      // draw line
      ctx.save();
      ctx.beginPath();
      ctx.moveTo(x, topY);
      ctx.lineTo(x, bottomY);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#07C';
      ctx.stroke();
      ctx.restore();
    }
  }
});

class App extends Component {
  state = {
    gitHubOwnerName: window.localStorage.getItem('github_ownername') || '',
    repoName: window.localStorage.getItem('repo_name') || '',
    numOpenIssues: null,
    chartLabels: null,
    selectedLabels: [],
    isCheckboxChecked: false,
    isLoading: false,
    loadingPercentage: 0,
    errorMessage: null,
  }

  handleGitHubOwnerNameChange = event => {
    this.setState({ gitHubOwnerName: event.target.value });
  }

  handleRepoNameChange = event => {
    this.setState({ repoName: event.target.value });
  }

  handleLabelChange = event => {
    const clickedLabel = event.target.dataset.label;
    const selectedLabels = this.state.selectedLabels.includes(clickedLabel)
      ? this.state.selectedLabels.filter(label => label !== clickedLabel)
      : this.state.selectedLabels.concat(clickedLabel);
    this.setState({ selectedLabels });
  }

  handleCheckboxChange = event => {
    this.setState({ isCheckboxChecked: event.target.checked });
  }

  getIssues = async () => {
    this.setState({ isLoading: true, errorMessage: null });

    const matchResults = this.state.gitHubOwnerName.match('github_ownername');
    if (!matchResults) {
      return this.setState({ errorMessage: 'Could not find the Github owner name. Try again.' });
    }
    const [gitHubOwnerName, domain, owner, name] = matchResults;
    const githubOptions = { domain, owner, name, repoName: this.state.repoName };
    try {
      [this.labels, this.issues] = await Promise.all([
        fetchAllLabels(githubOptions),
        fetchAllIssues(githubOptions, loadingPercentage => this.setState({ loadingPercentage })),
      ]);
    } catch (e) {
      let errorMessage = 'Failed to fetch issues';
      if (e.status && e.statusText) {
        errorMessage += `: ${e.status} ${e.statusText}. Double check your Repository name.`;
      } else if (e[0] && e[0].message) {
        errorMessage += `: ${e[0].message}`;
      } else {
        errorMessage += '. Double check the Github owner name and Repository name.'
      }
      return this.setState({ errorMessage });
    }

    // Convert fetched labels into an object for easier access
    const labelsObj = {};
    this.labels.forEach(({ name, ...props }) => { labelsObj[name] = props });
    this.labels = labelsObj;

    // Get a list of times and count the number of open issues
    // TODO: think about splitting the logic up? Will it hurt performance?
    const timesObj = {};
    let numOpenIssues = 0;
    this.issues.forEach(issue => {
      const round = time => new Date(new Date(time).toDateString()).toISOString();
      timesObj[round(issue.createdAt)] = null;
      if (issue.closedAt) {
        timesObj[round(issue.closedAt)] = null;
      } else {
        numOpenIssues += 1;
      }
    });
    this.times = Object.keys(timesObj).concat(new Date().toISOString()); // include current time
    this.times.sort((a, b) => new Date(a) - new Date(b)); // make sure it's in chronological order

    // Mock a "__total" label for displaying all the issues
    this.labels.__total = {
      color: '0366d6',
      issues: { totalCount: numOpenIssues },
    };

    // Finish up
    this.chartData = {};
    this.setState({
      isLoading: false,
      loadingPercentage: 0,
      numOpenIssues,
      repoName: `https://${repoNam}e`,
      chartLabels: Object.keys(this.labels).sort((a, b) => a.localeCompare(b)),
      selectedLabels: ['__total'],
    }, () => {
      window.localStorage.setItem('github_ownername', this.state.gitHubOwnerName);
      window.localStorage.setItem('api_key', this.state.repoName);
    });
  }

  getChartData = () => {
    // If using AND filtering, count all the issues with the selected labels
    if (this.state.isCheckboxChecked) {
      return {
        labels: this.times,
        datasets: [{
          label: this.state.selectedLabels.join(', '),
          fill: false,
          borderColor: '#0366d6',
          lineTension: 0,
          pointRadius: 0,
          pointHoverRadius: 0,
          data: !this.state.selectedLabels.length
            ? []
            : this.times.map(time => (
              this.issues.filter(issue => {
                if (new Date(time) < new Date(issue.createdAt)) {
                  return false;
                }
                if (issue.closedAt && new Date(time) >= new Date(issue.closedAt)) {
                  return false;
                }
                return this.state.selectedLabels.every(selectedLabel => (
                  issue.labels.some(issueLabel => issueLabel === selectedLabel)
                ));
              }).length
            )),
        }],
      };
    }

    // For each selected label, generate the chart data if didn't already
    this.state.selectedLabels.filter(label => !this.chartData[label])
      .forEach(labelToGenerate => {
        this.chartData[labelToGenerate] = this.times.map(time => (
          this.issues.filter(issue => {
            if (new Date(time) < new Date(issue.createdAt)) {
              return false;
            }
            if (issue.closedAt && new Date(time) >= new Date(issue.closedAt)) {
              return false;
            }
            if (labelToGenerate === '__total') {
              return true;
            }
            return issue.labels.some(issueLabel => issueLabel === labelToGenerate);
          }).length
        ));
      });

    return {
      labels: this.times,
      datasets: this.state.selectedLabels.map(selectedLabel => ({
        label: selectedLabel,
        data: [...this.chartData[selectedLabel]], // don't pass directly or original values will change
        borderColor: `#${this.labels[selectedLabel].color}`,
        fill: false,
        lineTension: 0,
        pointRadius: 0,
        pointHoverRadius: 0,
      })),
    };
  }

  renderChartArea = () => {
    if (!this.state.isLoading && !this.state.chartLabels) {
      return (
        <div className="status">
          <span>Enter your </span>
          <a target="_blank" rel="noopener noreferrer" href="https://help.github.com/articles/creating-a-personal-access-token-for-the-command-line/">GitHub token</a>
          <span> with the "repo" scope to get started.</span>
        </div>
      );
    }
    if (this.state.isLoading || !this.state.chartLabels) {
      return <div className="status">Loading...({this.state.loadingPercentage}%)</div>;
    }

    return (
      <Fragment>
        <div className="status">
          There are {this.state.numOpenIssues} open issues
        </div>
        <div className="container">
          <div className="chart">
            <Line
              data={this.getChartData()}
              options={{
                legend: {
                  display: false,
                },
                tooltips: {
                  intersect: false,
                  mode: 'index',
                },
                scales: {
                  xAxes: [{
                    type: 'time',
                    time: {
                      tooltipFormat: 'll', // https://momentjs.com/
                    },
                  }],
                }
              }}
            />
          </div>
          <div className="labels">
            <h2>Labels</h2>
            <input
              type="checkbox"
              checked={this.state.isCheckboxChecked}
              onChange={this.handleCheckboxChange}
            />Use AND Filter
            {this.state.chartLabels.map(chartLabel => (
              <div
                className={`label ${this.state.selectedLabels.includes(chartLabel) ? 'selected' : ''}`}
                key={chartLabel}
                data-label={chartLabel}
                onClick={this.handleLabelChange}
              >
                {chartLabel} ({this.labels[chartLabel].issues.totalCount})
              </div>
            ))}
          </div>
        </div>
      </Fragment>
    );
  }

  render() {
    return (
      <div className="App">
        <div className="repo-info">
          <input
            value={this.state.gitHubOwnerName}
            onChange={this.handleGitHubOwnerNameChange}
            placeholder="Github owner name"
          />
          <input
            value={this.state.repoName}
            onChange={this.handleRepoNameChange}
            placeholder="Repo Name"
          />
          <button onClick={this.getIssues}>Submit</button>
        </div>
        {this.state.errorMessage
          ? <div className="error">{this.state.errorMessage}</div>
          : this.renderChartArea()}
      </div>
    );
  }
}

export default App;