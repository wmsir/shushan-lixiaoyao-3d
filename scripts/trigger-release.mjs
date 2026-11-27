import { execFileSync, execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';

const REPO = 'wmsir/shushan-lixiaoyao-3d';
const WORKFLOW = 'build-android-apk.yml';
const API_URL = `https://api.github.com/repos/${REPO}/actions/runs?per_page=5`;

function resolveGhBin() {
  try {
    const out = execSync('where.exe gh', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    const first = out.split(/\r?\n/).find(Boolean);
    if (first && existsSync(first)) return first;
  } catch {
    // ignore
  }
  const candidates = [
    'C:\\Program Files\\GitHub CLI\\gh.exe',
    `${process.env.LOCALAPPDATA ?? ''}\\Programs\\GitHub CLI\\gh.exe`,
  ];
  for (const c of candidates) {
    if (c && existsSync(c)) return c;
  }
  return null;
}

async function fetchRuns() {
  const res = await fetch(API_URL, { headers: { 'User-Agent': 'shushan-auto-release' } });
  if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data.workflow_runs) ? data.workflow_runs : [];
}

async function main() {
  const headSha = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const branch = execSync('git branch --show-current', { encoding: 'utf8' }).trim() || 'main';

  await delay(5000);
  let runs = await fetchRuns();
  let matching = runs.find((r) => r.head_sha === headSha);

  if (matching) {
    console.log(
      JSON.stringify(
        {
          triggered: false,
          reason: 'already_present',
          headSha,
          runId: matching.id,
          status: matching.status,
          conclusion: matching.conclusion,
          event: matching.event,
          htmlUrl: matching.html_url,
          releasesUrl: `https://github.com/${REPO}/releases`,
        },
        null,
        2,
      ),
    );
    return;
  }

  const ghBin = resolveGhBin();
  if (!ghBin) {
    console.error('GitHub CLI (gh) is not installed. Run: winget install --id GitHub.cli -e');
    process.exit(1);
  }

  try {
    execFileSync(ghBin, ['auth', 'status', '-h', 'github.com'], { stdio: 'pipe' });
  } catch {
    console.error('GitHub CLI (gh) is not authenticated. Run: gh auth login -h github.com -p https -w -s repo,workflow');
    process.exit(2);
  }

  execFileSync(ghBin, ['workflow', 'run', WORKFLOW, '--ref', branch, '--repo', REPO], { stdio: 'inherit' });
  matching = null;
  for (let attempt = 0; attempt < 5; attempt++) {
    await delay(4000);
    runs = await fetchRuns();
    matching = runs.find((r) => r.head_sha === headSha) ?? null;
    if (matching) break;
  }
  if (!matching) {
    matching = runs[0] ?? null;
  }

  console.log(
    JSON.stringify(
      {
        triggered: true,
        headSha,
        runId: matching?.id ?? null,
        status: matching?.status ?? 'dispatched',
        conclusion: matching?.conclusion ?? null,
        event: matching?.event ?? 'workflow_dispatch',
        htmlUrl: matching?.html_url ?? `https://github.com/${REPO}/actions/workflows/${WORKFLOW}`,
        releasesUrl: `https://github.com/${REPO}/releases`,
      },
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
