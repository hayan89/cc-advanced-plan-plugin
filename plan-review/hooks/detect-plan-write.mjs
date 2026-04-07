import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Timeout-protected stdin reader (OMC pattern)
async function readStdin(timeoutMs = 5000) {
  return new Promise((resolve) => {
    const chunks = [];
    let settled = false;

    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        process.stdin.removeAllListeners();
        process.stdin.destroy();
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    }, timeoutMs);

    process.stdin.on('data', (chunk) => {
      chunks.push(chunk);
    });

    process.stdin.on('end', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    });

    process.stdin.on('error', () => {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve('');
      }
    });

    if (process.stdin.readableEnded) {
      if (!settled) {
        settled = true;
        clearTimeout(timeout);
        resolve(Buffer.concat(chunks).toString('utf-8'));
      }
    }
  });
}

function noop() {
  console.log(JSON.stringify({ continue: true, suppressOutput: true }));
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw) { noop(); return; }

    const data = JSON.parse(raw);

    // 1. Check tool name — only care about Write/Edit
    const toolName = data.tool_name || data.toolName || '';
    if (!['Write', 'Edit', 'write', 'edit'].includes(toolName)) {
      noop();
      return;
    }

    // 2. Check file path — only care about ~/.claude/plans/
    const filePath = data.tool_input?.file_path || '';
    const home = process.env.HOME || homedir();
    const plansDir = join(home, '.claude', 'plans');

    if (!filePath.startsWith(plansDir)) {
      noop();
      return;
    }

    // Guard: skip if this is a debugging plan — defer to debug-verify plugin
    const DEBUG_KEYWORDS = [
      'debug', 'debugging', '디버깅', '디버그',
      '버그', 'bug',
      '원인', 'root cause', 'root-cause',
      '가설', 'hypothesis', 'hypotheses',
      '증상', 'symptom',
      '재현', 'reproduce', 'reproduction',
      '스택트레이스', 'stacktrace', 'stack trace',
      '에러 분석', 'error analysis',
      '로그 분석', 'log analysis',
    ];

    let planContent = '';
    try {
      planContent = readFileSync(filePath, 'utf-8');
    } catch {
      planContent = data.tool_input?.content || '';
    }

    const lower = planContent.toLowerCase();
    let debugKeywordCount = 0;
    for (const kw of DEBUG_KEYWORDS) {
      if (lower.includes(kw.toLowerCase())) debugKeywordCount++;
    }
    if (debugKeywordCount >= 2) {
      noop();
      return;
    }

    // 3. Load session state
    const sessionId = data.session_id || data.sessionId || 'unknown';
    const dataDir = join(home, '.claude', 'plugins', 'data', 'plan-review', 'sessions');
    mkdirSync(dataDir, { recursive: true });

    const stateFile = join(dataDir, `${sessionId}.json`);
    let state = { review_count: 0, last_score: 100, plan_path: '', last_reviewed_at: '' };

    try {
      state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    } catch {
      // First run — use defaults
    }

    // 4. Debounce: max 2 auto-reviews, or skip if last score was good enough
    if (state.review_count >= 2 || state.last_score <= 24) {
      noop();
      return;
    }

    // 5. Inject skill invocation via additionalContext
    console.log(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: [
          `[MAGIC KEYWORD: plan-review]`,
          ``,
          `플랜 파일이 작성/수정되었습니다. plan-review 스킬을 호출하여 검토를 진행하세요.`,
          ``,
          `- 대상 파일: ${filePath}`,
          `- 세션 ID: ${sessionId}`,
          `- 현재 리뷰 횟수: ${state.review_count}`,
          `- 첫 번째 리뷰 여부: ${state.review_count === 0 ? 'yes' : 'no'}`,
          `- 이전 점수: ${state.last_score}`,
          ``,
          `Skill: plan-review:plan-review`,
          ``,
          `IMPORTANT: 위 스킬을 즉시 호출하세요. 스킬 호출 없이 진행하지 마세요.`
        ].join('\n')
      }
    }));

  } catch (err) {
    // On any error, never block Claude Code
    noop();
  }
}

main();
