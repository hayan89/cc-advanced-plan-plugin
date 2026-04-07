import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Timeout-protected stdin reader (OMC pattern — plan-review와 동일)
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

// 디버깅 키워드 패턴 (한국어 + 영어)
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

function isDebugPlan(content) {
  const lower = content.toLowerCase();
  let matchCount = 0;
  for (const kw of DEBUG_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) {
      matchCount++;
    }
  }
  // 2개 이상의 디버깅 키워드가 존재하면 디버깅 플랜으로 판정
  return matchCount >= 2;
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw) { noop(); return; }

    const data = JSON.parse(raw);

    // 1. Check tool name — only Write/Edit
    const toolName = data.tool_name || data.toolName || '';
    if (!['Write', 'Edit', 'write', 'edit'].includes(toolName)) {
      noop();
      return;
    }

    // 2. Check file path — only ~/.claude/plans/
    const filePath = data.tool_input?.file_path || '';
    const home = process.env.HOME || homedir();
    const plansDir = join(home, '.claude', 'plans');

    if (!filePath.startsWith(plansDir)) {
      noop();
      return;
    }

    // 3. Read plan file content to check for debug keywords
    let planContent = '';
    try {
      planContent = readFileSync(filePath, 'utf-8');
    } catch {
      // 파일 읽기 실패 시 (아직 쓰기 중일 수 있음) — tool_input.content 사용
      planContent = data.tool_input?.content || '';
    }

    if (!isDebugPlan(planContent)) {
      // 디버깅 플랜이 아님 — plan-review에 양보
      noop();
      return;
    }

    // 4. Load session state
    const sessionId = data.session_id || data.sessionId || 'unknown';
    const dataDir = join(home, '.claude', 'plugins', 'data', 'debug-verify', 'sessions');
    mkdirSync(dataDir, { recursive: true });

    const stateFile = join(dataDir, `${sessionId}.json`);
    let state = {
      verify_count: 0,
      last_verdict: null,
      loop_count: 0,
      plan_path: '',
      last_verified_at: '',
      claims_summary: []
    };

    try {
      state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    } catch {
      // First run — use defaults
    }

    // 5. Debounce: max 2 auto-verifications, or skip if already confirmed/refuted
    if (state.verify_count >= 2 || ['CONFIRMED', 'REFUTED'].includes(state.last_verdict)) {
      noop();
      return;
    }

    // 6. Inject skill invocation via additionalContext
    console.log(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'PostToolUse',
        additionalContext: [
          `[MAGIC KEYWORD: debug-verify]`,
          ``,
          `디버깅 플랜이 감지되었습니다. debug-verify 스킬을 호출하여 카파시 루프 검증을 진행하세요.`,
          ``,
          `- 대상 파일: ${filePath}`,
          `- 세션 ID: ${sessionId}`,
          `- 현재 검증 횟수: ${state.verify_count}`,
          `- 이전 판정: ${state.last_verdict || '없음'}`,
          `- 루프 횟수: ${state.loop_count}`,
          ``,
          `Skill: debug-verify:debug-verify`,
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
