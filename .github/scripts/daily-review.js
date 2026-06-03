const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const REPO_ROOT = path.resolve(__dirname, '../..');
const MAX_CHARS = 8000;

// Files to analyze - ordered by importance
const KEY_FILES = [
  'Web/index.html',
  'Web/style.css',
  'Web/medquiz/index.html',
  'Web/medquiz/styles.css',
  'Web/medquiz/quiz.html',
  'Web/decks/index.html',
  'Web/mini-game/index.html',
];

function readProjectFiles() {
  const files = {};
  for (const relPath of KEY_FILES) {
    const fullPath = path.join(REPO_ROOT, relPath);
    try {
      let content = fs.readFileSync(fullPath, 'utf-8');
      if (content.length > MAX_CHARS) {
        content = content.slice(0, MAX_CHARS) + '\n... [truncated]';
      }
      files[relPath] = content;
    } catch (e) {
      // File may not exist — skip silently
    }
  }
  return files;
}

function getProjectTree() {
  try {
    return execSync('find Web -type f -name "*.html" -o -name "*.css" -o -name "*.js" | grep -v node_modules | sort | head -40', {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    });
  } catch (e) {
    return '';
  }
}

function git(cmd, opts = {}) {
  return execSync(cmd, {
    cwd: REPO_ROOT,
    encoding: 'utf-8',
    stdio: ['pipe', 'pipe', 'pipe'],
    ...opts,
  });
}

async function getDesignProposal(files) {
  const fileContext = Object.entries(files)
    .map(([name, content]) => `### ${name}\n\`\`\`\n${content}\n\`\`\``)
    .join('\n\n');

  const tree = getProjectTree();
  const today = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 8000,
    messages: [
      {
        role: 'user',
        content: `You are a senior web designer specializing in educational websites for Thai medical students.

## Project
Medical education website with: main page, MedQuiz (quiz app), Pharmacology Decks, and a Mini-Game.
Tech stack: Vanilla JS, HTML5, CSS3, Supabase backend, Netlify hosting.

## File Tree
\`\`\`
${tree}
\`\`\`

## Current Code
${fileContext}

## Today: ${today}

Pick the SINGLE highest-impact improvement and implement it fully. Consider:
- Mobile responsiveness
- UX clarity for students
- Visual hierarchy and readability
- Loading performance
- Accessibility

Respond with ONLY valid JSON (no markdown fences, no explanation outside JSON):
{
  "proposal": {
    "title": "Short title (max 60 chars)",
    "description": "What you improved and why it matters",
    "impact": "Specific benefit for medical students"
  },
  "changes": [
    {
      "file": "Web/relative/path/to/file",
      "content": "COMPLETE new file content (full replacement, not a diff)"
    }
  ]
}`,
      },
    ],
  });

  const raw = message.content[0].text.trim();
  // Strip markdown code fences if present
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error(`No JSON found in Claude response:\n${raw}`);
  return JSON.parse(jsonMatch[0]);
}

function applyChanges(result, branchName) {
  git(`git config user.email "github-actions[bot]@users.noreply.github.com"`);
  git(`git config user.name "Daily Design Bot"`);

  // Reset to main and create fresh branch
  git(`git fetch origin main`);
  git(`git checkout main`);
  git(`git pull origin main`);

  // Remove branch if it already exists (re-run scenario)
  try { git(`git branch -D ${branchName}`); } catch (_) {}
  try { git(`git push origin --delete ${branchName}`); } catch (_) {}

  git(`git checkout -b ${branchName}`);

  for (const change of result.changes) {
    const fullPath = path.join(REPO_ROOT, change.file);
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(fullPath, change.content, 'utf-8');
    console.log(`  Written: ${change.file}`);
  }

  git(`git add -A`);
  git(`git commit -m "draft: ${result.proposal.title}"`);
  git(`git push -u origin ${branchName}`);
  console.log(`Branch pushed: ${branchName}`);
}

async function createPullRequest(result, branchName, today) {
  const [owner, repo] = process.env.GITHUB_REPOSITORY.split('/');
  const token = process.env.GITHUB_TOKEN;

  const body = `## Daily Design Review — ${today}

### ไอเดียวันนี้
**${result.proposal.title}**

${result.proposal.description}

### ผลที่คาดว่าจะได้
${result.proposal.impact}

### ไฟล์ที่เปลี่ยน
${result.changes.map((c) => `- \`${c.file}\``).join('\n')}

---
> สร้างโดย Daily Design Review อัตโนมัติ — ตรวจสอบ diff แล้ว merge เมื่อพร้อม`;

  const res = await fetch(`https://api.github.com/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/vnd.github.v3+json',
    },
    body: JSON.stringify({
      title: `[Daily Design] ${result.proposal.title}`,
      body,
      head: branchName,
      base: 'main',
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`GitHub API error ${res.status}: ${err}`);
  }

  return res.json();
}

async function main() {
  const todayISO = new Date().toISOString().split('T')[0];
  const todayTH = new Date().toLocaleDateString('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const branchName = `draft/daily-${todayISO}`;

  console.log('=== Daily Web Design Review ===');
  console.log(`Date: ${todayTH}`);
  console.log(`Branch: ${branchName}\n`);

  console.log('Reading project files...');
  const files = readProjectFiles();
  console.log(`Read ${Object.keys(files).length} files: ${Object.keys(files).join(', ')}\n`);

  console.log('Calling Claude for design proposal...');
  const result = await getDesignProposal(files);

  console.log(`\nProposal: ${result.proposal.title}`);
  console.log(`Impact: ${result.proposal.impact}`);
  console.log(`Files: ${result.changes.map((c) => c.file).join(', ')}\n`);

  console.log('Applying changes to branch...');
  applyChanges(result, branchName);

  console.log('\nCreating pull request...');
  const pr = await createPullRequest(result, branchName, todayTH);

  console.log(`\nDone! PR: ${pr.html_url}`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
