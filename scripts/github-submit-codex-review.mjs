#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { pathToFileURL } from 'node:url';

const ALLOWED_EVENTS = new Set(['COMMENT', 'REQUEST_CHANGES']);

export function parseArgs(argv) {
  const args = {};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }
    const key = token.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      args[key] = true;
      continue;
    }
    args[key] = value;
    index += 1;
  }
  return args;
}

export function parseCodexReview(raw) {
  const text = raw.trim();
  if (!text) {
    return { event: 'COMMENT', body: 'NO_FINDINGS', comments: [] };
  }

  try {
    return JSON.parse(text);
  } catch {
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenced) {
      return JSON.parse(fenced[1]);
    }
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
    }
    throw new Error('Codex review output is not valid JSON.');
  }
}

export function parseDiffPatch(patch) {
  const files = new Map();
  let currentPath = null;
  let oldLine = 0;
  let newLine = 0;
  let inHunk = false;

  for (const line of patch.split(/\r?\n/)) {
    if (line.startsWith('diff --git ')) {
      currentPath = null;
      inHunk = false;
      continue;
    }

    if (line.startsWith('+++ b/')) {
      currentPath = line.slice('+++ b/'.length);
      if (!files.has(currentPath)) {
        files.set(currentPath, { right: new Set(), left: new Set() });
      }
      continue;
    }

    if (!currentPath) {
      continue;
    }

    const hunk = line.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
    if (hunk) {
      oldLine = Number(hunk[1]);
      newLine = Number(hunk[2]);
      inHunk = true;
      continue;
    }

    if (!inHunk) {
      continue;
    }

    const file = files.get(currentPath);
    if (line.startsWith(' ')) {
      file.left.add(oldLine);
      file.right.add(newLine);
      oldLine += 1;
      newLine += 1;
    } else if (line.startsWith('+')) {
      file.right.add(newLine);
      newLine += 1;
    } else if (line.startsWith('-')) {
      file.left.add(oldLine);
      oldLine += 1;
    } else if (line.startsWith('\\')) {
      continue;
    }
  }

  return files;
}

export function buildReviewPayload({ review, patch, commitId }) {
  const event = ALLOWED_EVENTS.has(review.event) ? review.event : 'COMMENT';
  const body = typeof review.body === 'string' ? review.body.trim() : '';
  const comments = Array.isArray(review.comments) ? review.comments : [];
  const diffFiles = parseDiffPatch(patch);
  const filtered = [];
  const dropped = [];

  for (const comment of comments) {
    const path = typeof comment.path === 'string' ? comment.path.trim() : '';
    const line = Number(comment.line);
    const side = comment.side === 'LEFT' ? 'LEFT' : 'RIGHT';
    const commentBody = typeof comment.body === 'string' ? comment.body.trim() : '';
    const file = diffFiles.get(path);
    const allowedLines = file?.[side.toLowerCase()];

    if (!path || !Number.isInteger(line) || line < 1 || !commentBody || !allowedLines?.has(line)) {
      dropped.push({ path, line, side, body: commentBody });
      continue;
    }

    if (filtered.length < 3) {
      filtered.push({ path, line, side, body: commentBody });
    } else {
      dropped.push({ path, line, side, body: commentBody });
    }
  }

  if (body === 'NO_FINDINGS' && filtered.length === 0) {
    return { skip: true, reason: 'No material findings.' };
  }

  const droppedSummary = dropped
    .filter((comment) => comment.body)
    .map((comment) => `- ${comment.path || 'unknown path'}:${comment.line || 'unknown line'} ${comment.body}`)
    .join('\n');

  const payloadBody = [
    body && body !== 'NO_FINDINGS' ? body : '',
    dropped.length > 0
      ? `\n${dropped.length} Codex inline finding(s) could not be anchored to the current diff and were moved to this review body.${droppedSummary ? `\n${droppedSummary}` : ''}`
      : ''
  ].join('').trim() || 'Codex review findings.';

  return {
    skip: false,
    payload: {
      commit_id: commitId,
      event,
      body: payloadBody,
      comments: filtered
    },
    dropped
  };
}

export function submitReview({ repo, pr, payload }) {
  const input = JSON.stringify(payload);
  return execFileSync('gh', [
    'api',
    '--method',
    'POST',
    `repos/${repo}/pulls/${pr}/reviews`,
    '--input',
    '-'
  ], { input, encoding: 'utf8' });
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const required = ['repo', 'pr', 'commit', 'input'];
  for (const key of required) {
    if (!args[key]) {
      throw new Error(`Missing required --${key} argument.`);
    }
  }

  const patchPath = args.patch || '.git/codex-review-context/diff.patch';
  const review = parseCodexReview(readFileSync(args.input, 'utf8'));
  const patch = readFileSync(patchPath, 'utf8');
  const result = buildReviewPayload({ review, patch, commitId: args.commit });

  if (result.skip) {
    console.log(result.reason);
    return;
  }

  const payloadPath = args.output || 'codex-review-payload.json';
  writeFileSync(payloadPath, `${JSON.stringify(result.payload, null, 2)}\n`);
  const response = submitReview({ repo: args.repo, pr: args.pr, payload: result.payload });
  process.stdout.write(response);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main();
  } catch (error) {
    console.error(`${basename(process.argv[1])}: ${error.message}`);
    process.exitCode = 1;
  }
}
