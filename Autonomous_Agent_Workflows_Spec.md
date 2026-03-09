# Autonomous Agent Workflows with Claude Code

**Specification & Implementation Guide**

*Continuous Backlog Processing, Multi-Agent Orchestration, and Remote Direction via Mobile*

Version 1.0 — March 2026

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [System Architecture](#2-system-architecture)
3. [Core Components](#3-core-components)
4. [Implementation Phases](#4-implementation-phases)
5. [Remote Direction and Mobile Workflows](#5-remote-direction-and-mobile-workflows)
6. [Safety, Guardrails, and Risk Mitigation](#6-safety-guardrails-and-risk-mitigation)
7. [Cost Model and Optimization](#7-cost-model-and-optimization)
8. [Reference Workflow Configurations](#8-reference-workflow-configurations)
9. [Quick-Start Checklist](#9-quick-start-checklist)
10. [Appendix: Key References](#10-appendix-key-references)

---

## 1. Executive Summary

This document specifies an architecture and implementation plan for building autonomous agent workflows using Claude Code. The goal is to enable teams of AI agents to continuously process a development backlog around the clock, with human operators providing direction and feedback remotely from any device, including mobile phones.

The system combines four core Anthropic capabilities into a single integrated pipeline:

- **Claude Code** as the agentic coding engine that reads codebases, edits files, and runs commands
- **Subagents and Agent Teams** for parallelizing work across multiple independent AI workers
- **Headless Mode** (the `-p` flag) for running Claude Code non-interactively in scripts and CI/CD pipelines
- **GitHub Actions Integration** for event-driven automation triggered by issues, PRs, comments, and schedules

Additionally, the Model Context Protocol (MCP) connects Claude to external data sources such as Jira, Slack, Google Drive, and custom internal tools, enabling agents to stay synchronized with real-world project workflows.

---

## 2. System Architecture

### 2.1 Architecture Overview

The system operates as a four-layer stack. Each layer handles a distinct concern, and they compose together to create end-to-end autonomous workflows.

| Layer         | Component               | Responsibility                                                                       |
|---------------|-------------------------|--------------------------------------------------------------------------------------|
| Orchestration | GitHub Actions / Cron   | Triggers work from events, schedules, or @claude mentions                            |
| Execution     | Claude Code (Headless)  | Runs tasks non-interactively with the `-p` flag, reads CLAUDE.md for project context |
| Parallelism   | Subagents / Agent Teams | Spawns independent workers for parallel execution across domains                     |
| Integration   | MCP Servers             | Connects to Jira, Slack, Google Drive, and custom data sources                       |

### 2.2 Data Flow

The typical lifecycle of a backlog item through the system follows this sequence:

1. **Trigger:** A GitHub Issue is created (manually or via Jira sync), a cron schedule fires, or a human comments @claude on an existing issue or PR.
2. **Pickup:** A GitHub Actions workflow detects the event and runs the Claude Code Action or invokes Claude Code in headless mode.
3. **Planning:** Claude reads the CLAUDE.md file for project conventions, analyzes the codebase, and decomposes the task into subtasks.
4. **Execution:** Claude spawns subagents or Agent Teams to work on independent subtasks in parallel (e.g., frontend, backend, tests).
5. **Delivery:** Claude commits changes, opens a Pull Request, and posts a status update (via Slack MCP or GitHub comment).
6. **Review:** A human reviews the PR from any device. They can request changes via @claude comments, and Claude iterates.
7. **Merge:** Once approved, the PR is merged and the system picks up the next item from the backlog.

---

## 3. Core Components

### 3.1 Claude Code Headless Mode

Headless mode is the foundation for all unattended automation. The `-p` flag transforms Claude Code from an interactive terminal tool into a scriptable CLI that can be called from any script or pipeline.

#### 3.1.1 Basic Usage

```bash
# Simple one-shot task
claude -p "Generate a .gitignore for a Node.js project"

# Piping input for analysis
cat src/utils.ts | claude -p "Find potential bugs"

# Structured JSON output for downstream processing
claude -p "List all TODO comments" --output-format json
```

#### 3.1.2 Key Flags

| Flag              | Purpose                                                                               |
|-------------------|---------------------------------------------------------------------------------------|
| `--output-format` | `text` (default), `json` (structured with metadata), `stream-json` (real-time NDJSON) |
| `--max-turns N`   | Limits the number of agentic turns to control cost and duration                       |
| `--allowedTools`  | Restricts available tools (e.g., `Read,Grep,Glob` for read-only analysis)             |
| `--model`         | Selects the model (e.g., `claude-opus-4-6`, `claude-sonnet-4-6`)                      |

#### 3.1.3 Cost Control

Always set `--max-turns` in CI workflows. A standard diff review rarely needs more than two to three turns. Each additional agentic turn consumes tokens. Combine with `--allowedTools` to restrict the agent to read-only operations when appropriate (e.g., during code review).

### 3.2 GitHub Actions Integration

The Claude Code GitHub Action (`anthropics/claude-code-action@v1`) is the primary mechanism for connecting your backlog to the agent pipeline. It supports two operational modes.

#### 3.2.1 Interactive Mode

Claude responds to @claude mentions in issue and PR comments. This is how remote operators provide direction from mobile devices.

```yaml
# .github/workflows/claude.yml
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
  issues: { types: [opened, assigned] }

steps:
  - uses: anthropics/claude-code-action@v1
    with:
      anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

#### 3.2.2 Automation Mode

Claude runs immediately with a predefined prompt, triggered by events like PR creation or cron schedules.

```yaml
# Automated code review on every PR
on:
  pull_request: { types: [opened, synchronize] }

steps:
  - uses: anthropics/claude-code-action@v1
    with:
      anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
      prompt: "/review"
      claude_args: "--max-turns 5"
```

#### 3.2.3 Scheduled Backlog Processing

Use cron triggers to have Claude work through your backlog continuously.

```yaml
on:
  schedule:
    - cron: '0 */4 * * *'  # Every 4 hours

steps:
  - uses: anthropics/claude-code-action@v1
    with:
      prompt: |
        Find the highest-priority open issue labeled 'auto-assign'.
        Implement the requested changes and open a PR.
```

### 3.3 Subagents

Subagents are specialized AI workers that run in isolated context windows. Each subagent has its own system prompt, tool access, and permissions. They are defined as Markdown files with YAML frontmatter in your project's `.claude/agents/` directory.

#### 3.3.1 When to Use Subagents

- The task produces verbose output you don't need in your main conversation context
- You want to enforce specific tool restrictions (e.g., read-only for research agents)
- The work is self-contained and can return a summary when complete
- You need to parallelize multiple independent research or analysis tasks

#### 3.3.2 Example: Custom Code Reviewer Agent

```markdown
# .claude/agents/code-reviewer.md
---
name: code-reviewer
description: Reviews code for bugs, security issues, and style violations
tools: [Read, Grep, Glob]
model: claude-sonnet-4-6
---

You are a senior code reviewer. Analyze changed files for:
1. Potential bugs and logic errors
2. Security vulnerabilities
3. Performance issues
4. Adherence to project conventions in CLAUDE.md

Return a structured summary with severity ratings.
```

#### 3.3.3 Parallel Dispatch Pattern

Explicitly request parallel subagents in your prompts to maximize throughput:

```
Explore this codebase using 4 parallel tasks.
Each subagent should focus on a different area:
  - Frontend components
  - Backend APIs
  - Database layer
  - Authentication system
```

### 3.4 Agent Teams (Experimental)

Agent Teams extend subagents with inter-agent communication. Unlike subagents which report back in isolation, Agent Team members can share findings, challenge each other, and coordinate directly through a shared task list.

#### 3.4.1 Enabling Agent Teams

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
```

#### 3.4.2 When to Use Agent Teams over Subagents

| Use Subagents When…                                   | Use Agent Teams When…                                             |
|-------------------------------------------------------|-------------------------------------------------------------------|
| Tasks are independent and don't need to share state   | Agents need to communicate and share findings mid-task            |
| You need quick, focused workers that return summaries | You want agents to challenge assumptions and debate approaches    |
| Cost efficiency is a priority (lower token overhead)  | Cross-layer coordination is required (frontend + backend + tests) |

#### 3.4.3 Example Prompt

```
Create an agent team to refactor the payment module.
Spawn three teammates:
  - One for the API layer
  - One for the database migrations
  - One for test coverage
Have them coordinate through the shared task list.
```

### 3.5 MCP Integration

The Model Context Protocol (MCP) connects Claude Code to external data sources and tools. This is what allows agents to interact with your real project management and communication stack, not just code.

#### 3.5.1 Key Integration Points

| Service       | Use Case                                      | Value                                         |
|---------------|-----------------------------------------------|-----------------------------------------------|
| Jira / Linear | Pull tasks from backlog, update ticket status | Agents work from the same backlog as the team |
| Slack         | Post status updates, notify on PR creation    | Team stays informed without checking GitHub   |
| Google Drive  | Read design docs, specs, and requirements     | Agents have full context beyond just code     |
| Figma         | Verify implementations against designs        | Design-to-code accuracy validation            |

#### 3.5.2 Configuration

MCP servers are configured in your Claude Code settings or CLAUDE.md:

```json
// In .claude/settings.json or via CLI
"mcpServers": {
  "jira": { "url": "https://jira.mcp.example.com/sse" },
  "slack": { "url": "https://slack.mcp.example.com/sse" }
}
```

### 3.6 CLAUDE.md Project Configuration

CLAUDE.md is a Markdown file at your project root that Claude reads at the start of every session, including headless and CI runs. It provides persistent project context, coding conventions, and workflow rules. This is the most important configuration artifact in the system.

#### 3.6.1 Recommended Structure

```markdown
# CLAUDE.md

## Project Overview
[Brief description of the project and its architecture]

## Coding Conventions
- Use TypeScript strict mode
- All functions must have JSDoc comments
- Follow the existing import ordering pattern

## Sub-Agent Routing Rules
**Parallel dispatch** when: 3+ unrelated tasks, no shared state
**Sequential dispatch** when: tasks have dependencies
**Background dispatch** for: research / analysis (not file mods)

## Testing Requirements
- Run `npm test` before committing
- Minimum 80% coverage on new code

## PR Conventions
- Prefix branch names with issue number: `123-feature-name`
- Include a summary of changes in PR description
```

---

## 4. Implementation Phases

This section provides a phased rollout plan. Each phase builds on the previous one, allowing teams to validate and build confidence before expanding automation scope.

### 4.1 Phase 1: Foundation (Week 1–2)

**Goal:** Establish core infrastructure and validate basic automation.

1. Install Claude Code across the development team's terminals and IDEs.
2. Create a comprehensive CLAUDE.md file at the project root with coding conventions, testing requirements, and PR standards.
3. Set up the Claude Code GitHub Action for interactive mode: @claude mentions in issues and PRs.
4. Add `ANTHROPIC_API_KEY` to repository secrets.
5. Create a `#claude-updates` Slack channel and configure a webhook for notifications.
6. Define two to three custom subagents in `.claude/agents/` for common tasks (e.g., code-reviewer, test-writer).

**Validation criteria:** Team can comment @claude on a PR and receive a useful code review within 60 seconds. Team can open an issue and have Claude begin implementation within 2 minutes.

### 4.2 Phase 2: Automated Pipelines (Week 3–4)

**Goal:** Automate repetitive tasks and introduce scheduled processing.

1. Add automated code review on every PR (automation mode with `--max-turns 5`).
2. Add a scheduled security audit workflow (weekly cron).
3. Create a backlog-processor workflow that picks up issues labeled 'auto-assign' on a cron schedule.
4. Configure MCP connections to Slack for status updates.
5. Set up cost monitoring: use `--output-format json` to track token usage per run and establish a daily budget.
6. Create a dashboard or Slack bot that reports daily agent activity (PRs opened, issues resolved, tokens consumed).

**Validation criteria:** Agents are autonomously opening PRs for low-complexity backlog items. Security audit runs weekly without human intervention. Daily cost is within budget.

### 4.3 Phase 3: Multi-Agent Orchestration (Week 5–6)

**Goal:** Scale to parallel execution and complex multi-domain tasks.

1. Add sub-agent routing rules to CLAUDE.md to guide parallel vs. sequential dispatch decisions.
2. Define domain-specific subagents (frontend-agent, backend-agent, database-agent, test-agent) with appropriate tool restrictions.
3. Implement the plan-then-execute pattern: a planning agent decomposes tasks, then dispatches domain agents in parallel.
4. Experiment with Agent Teams (experimental) for tasks requiring inter-agent communication.
5. Configure model routing: run the planning agent on Opus for complex reasoning, subagents on Sonnet for cost efficiency.
6. Add background agent support: use Ctrl+B during interactive sessions to background long-running agents.

**Validation criteria:** A single prompt can decompose a multi-domain feature into parallel subtasks that are executed simultaneously. Agent Teams can coordinate across frontend/backend/test boundaries.

### 4.4 Phase 4: Full Autonomy (Week 7–8)

**Goal:** Achieve continuous 24/7 backlog processing with remote oversight.

1. Connect MCP to Jira/Linear for automatic task ingestion: new tickets with a specific label trigger agent workflows.
2. Implement priority-aware scheduling: the backlog processor picks up highest-priority items first.
3. Add a mobile-friendly review interface: operators approve/reject PRs and provide @claude feedback from GitHub Mobile.
4. Create guardrails: require human approval for PRs touching production configs, database migrations, or security-sensitive code.
5. Set up alerting: notify on-call when agents fail, exceed cost thresholds, or create PRs with failing tests.
6. Document runbooks for common failure modes and escalation procedures.

**Validation criteria:** The system processes backlog items 24/7 with <5% failure rate. Operators can direct and review agent work entirely from mobile. Cost per resolved issue is tracked and within acceptable bounds.

---

## 5. Remote Direction and Mobile Workflows

A key requirement is the ability to steer agent work from a mobile device when away from a PC. The system supports this through several channels.

### 5.1 GitHub Mobile App

- **Direct agents:** Open an issue from your phone with a description of the work needed. If the issue body contains @claude, the GitHub Action picks it up immediately.
- **Review and iterate:** Comment `@claude fix the error handling` on a PR from the mobile app. Claude reads the comment, makes changes, and pushes a new commit.
- **Approve and merge:** Review Claude's PR, approve it, and merge — all from the GitHub mobile interface.

### 5.2 Slack Integration (via MCP)

- **Status updates:** Agents post to a dedicated Slack channel when they start a task, open a PR, or encounter a blocker.
- **On-the-go oversight:** Check Slack notifications on your phone to stay informed of agent activity without opening GitHub.

### 5.3 Claude Cowork (Browser-Based)

For more interactive sessions, Claude Cowork provides a GUI-based version of Claude Code accessible from any browser. It uses the same agentic execution model as Claude Code but wraps it in a graphical interface, making it suitable for use on tablets or phones when you need a richer interaction than GitHub comments allow.

---

## 6. Safety, Guardrails, and Risk Mitigation

Running AI agents unsupervised introduces real risks. This section specifies the controls that must be in place before expanding automation scope.

### 6.1 Core Principles

1. **Start supervised, expand gradually:** Begin with code review and test generation. Only move to implementation tasks after validating agent quality.
2. **Human review before merge:** No agent-created PR should be auto-merged. All PRs require at least one human approval.
3. **Least-privilege tool access:** Use `--allowedTools` to restrict agents to the minimum capabilities needed. Read-only agents should not have write access.
4. **Cost boundaries:** Set `--max-turns` on all CI workflows. Monitor daily token spend and set alerts for anomalies.

### 6.2 Protected Paths

Define paths in CLAUDE.md that require elevated review:

- Production configuration files (e.g., `terraform/`, `k8s/`)
- Database migrations
- Authentication and authorization code
- CI/CD pipeline definitions
- Environment variable and secrets management

### 6.3 Failure Modes and Mitigations

| Failure Mode                       | Impact                              | Mitigation                                                            |
|------------------------------------|-------------------------------------|-----------------------------------------------------------------------|
| Agent introduces subtle bugs       | Defects reach staging/production    | Mandatory test suite pass before PR; human review required            |
| Agent misunderstands the objective | Wasted tokens and incorrect changes | Clear issue templates; CLAUDE.md conventions; human spot-checks       |
| Runaway cost from too many turns   | Budget overrun                      | `--max-turns` on all CI jobs; daily spend alerts; budget caps         |
| Agent creates merge conflicts      | Blocked PRs, wasted rework          | Domain-based file ownership; parallel agents touch different files    |
| API outage or rate limiting        | Stalled pipeline                    | Retry logic with exponential backoff; `continue-on-error: true` in CI |

---

## 7. Cost Model and Optimization

Understanding and controlling costs is essential for sustainable 24/7 operation.

### 7.1 Cost Levers

- **Model selection:** Use Opus for planning and complex reasoning; Sonnet for focused subtasks. Set `CLAUDE_CODE_SUBAGENT_MODEL=claude-sonnet-4-6` to route subagents to a lighter model.
- **Turn limits:** A standard code review needs 2–3 turns. Feature implementation typically needs 5–10. Set `--max-turns` accordingly.
- **Tool restrictions:** Read-only agents (`--allowedTools Read,Grep,Glob`) are cheaper because they make fewer tool calls.
- **Prompt efficiency:** Invest in clear, specific CLAUDE.md instructions and issue templates. Ambiguous tasks cause more turns and higher costs.

### 7.2 Monitoring

Use the `--output-format json` flag to capture token usage and cost per invocation:

```json
{
  "result": "...",
  "cost": {
    "input_tokens": 1234,
    "output_tokens": 567,
    "total_cost": 0.01
  }
}
```

Aggregate these into a daily dashboard. Set alerts when daily spend exceeds your defined threshold.

---

## 8. Reference Workflow Configurations

The following are complete, ready-to-use GitHub Actions workflow definitions for common automation patterns.

### 8.1 Interactive Agent (responds to @claude)

```yaml
name: Claude Interactive Agent
on:
  issue_comment: { types: [created] }
  pull_request_review_comment: { types: [created] }
  issues: { types: [opened, assigned] }
permissions:
  contents: write
  pull-requests: write
  issues: write
jobs:
  claude:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
```

### 8.2 Automated PR Review

```yaml
name: Claude Code Review
on:
  pull_request: { types: [opened, synchronize] }
jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: "/review"
          claude_args: "--max-turns 5"
```

### 8.3 Scheduled Backlog Processor

```yaml
name: Backlog Processor
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:  # Manual trigger
jobs:
  process:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Find the highest-priority open issue labeled
            'auto-assign' that has not been started.
            Implement the requested changes following
            CLAUDE.md conventions. Run tests. Open a PR.
```

### 8.4 Weekly Security Audit

```yaml
name: Security Audit
on:
  schedule:
    - cron: '0 2 * * 1'  # Every Monday at 2 AM
jobs:
  audit:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: anthropics/claude-code-action@v1
        with:
          anthropic_api_key: ${{ secrets.ANTHROPIC_API_KEY }}
          prompt: |
            Perform a security audit of this codebase:
            1. Scan dependencies for known vulnerabilities
            2. Check for dangerous code patterns
            3. Identify potentially exposed secrets
            Open an issue with findings, sorted by severity.
          claude_args: "--max-turns 10"
```

---

## 9. Quick-Start Checklist

Use this checklist to track progress through the initial setup. All items in Phase 1 should be completed before proceeding to automated workflows.

| #  | Task                                                                 | Status        |
|----|----------------------------------------------------------------------|---------------|
| 1  | Install Claude Code (terminal + IDE extension)                       | ☐ Not started |
| 2  | Create CLAUDE.md at project root                                     | ☐ Not started |
| 3  | Add `ANTHROPIC_API_KEY` to GitHub repository secrets                 | ☐ Not started |
| 4  | Install Claude GitHub App (run `/install-github-app` in Claude Code) | ☐ Not started |
| 5  | Add interactive workflow (`.github/workflows/claude.yml`)            | ☐ Not started |
| 6  | Test @claude mention on a test issue                                 | ☐ Not started |
| 7  | Define custom subagents in `.claude/agents/`                         | ☐ Not started |
| 8  | Add automated review workflow for PRs                                | ☐ Not started |
| 9  | Configure MCP connections (Slack, Jira/Linear)                       | ☐ Not started |
| 10 | Set up scheduled backlog processor workflow                          | ☐ Not started |
| 11 | Implement cost monitoring and daily spend alerts                     | ☐ Not started |
| 12 | Define protected paths and review requirements                       | ☐ Not started |

---

## 10. Appendix: Key References

| Resource                    | URL                                              |
|-----------------------------|--------------------------------------------------|
| Claude Code Documentation   | https://code.claude.com/docs/en/overview         |
| GitHub Actions Reference    | https://code.claude.com/docs/en/github-actions   |
| Subagents Documentation     | https://code.claude.com/docs/en/sub-agents       |
| Claude Code Action (GitHub) | https://github.com/anthropics/claude-code-action |
| Claude Agents Overview      | https://claude.com/solutions/agents              |
