import { mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

// Timeout-protected stdin reader (debug-verify/plan-review와 동일 패턴)
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

// 디버깅 신호 키워드 (debug-verify 기본 셋 + 사용자 프롬프트 특화 신호)
const DEBUG_KEYWORDS = [
  // debug-verify와 공유되는 기본 셋
  'debug', 'debugging', '디버깅', '디버그',
  '버그', 'bug',
  '원인', 'root cause', 'root-cause',
  '가설', 'hypothesis', 'hypotheses',
  '증상', 'symptom',
  '재현', 'reproduce', 'reproduction',
  '스택트레이스', 'stacktrace', 'stack trace',
  '에러 분석', 'error analysis',
  '로그 분석', 'log analysis',
  // 사용자 프롬프트 특화 신호
  '안 되', '안되', '안 돼', '안돼',
  'not working', "doesn't work", 'does not work',
  '왜 안', '왜 실패', '왜 오류',
  "why doesn't", 'why does not', 'why is not', "why isn't",
  'failing', 'failed',
  '오류', '에러', 'error',
];

function countKeywords(text) {
  const lower = text.toLowerCase();
  let count = 0;
  for (const kw of DEBUG_KEYWORDS) {
    if (lower.includes(kw.toLowerCase())) count++;
  }
  return count;
}

async function main() {
  try {
    const raw = await readStdin();
    if (!raw) { noop(); return; }

    const data = JSON.parse(raw);

    // 1. UserPromptSubmit 이벤트만 처리
    const eventName = data.hook_event_name || data.hookEventName || '';
    if (eventName && eventName !== 'UserPromptSubmit') {
      noop();
      return;
    }

    // 2. 사용자 프롬프트 추출
    const prompt = data.prompt || data.user_prompt || '';
    if (!prompt || typeof prompt !== 'string') {
      noop();
      return;
    }

    // 3. 디버깅 키워드 카운트 — 임계 ≥ 2
    const keywordCount = countKeywords(prompt);
    if (keywordCount < 2) {
      noop();
      return;
    }

    // 4. 세션 상태 로드 (디바운스)
    const home = process.env.HOME || homedir();
    const sessionId = data.session_id || data.sessionId || 'unknown';
    const dataDir = join(home, '.claude', 'plugins', 'data', 'data-grounding', 'sessions');
    mkdirSync(dataDir, { recursive: true });

    const stateFile = join(dataDir, `${sessionId}.json`);
    let state = {
      grounded: false,
      declined: false,
      run_count: 0,
      last_prompt_at: ''
    };

    try {
      state = JSON.parse(readFileSync(stateFile, 'utf-8'));
    } catch {
      // First run — use defaults
    }

    // 5. 디바운스: 이미 실행됐거나 사용자가 거부했으면 skip
    if (state.grounded || state.declined || state.run_count >= 1) {
      noop();
      return;
    }

    // 6. additionalContext로 스킬 사용 권유 주입
    console.log(JSON.stringify({
      continue: true,
      hookSpecificOutput: {
        hookEventName: 'UserPromptSubmit',
        additionalContext: [
          `[MAGIC KEYWORD: data-grounding]`,
          ``,
          `사용자 프롬프트에서 디버깅 신호가 감지되었습니다 (키워드 매칭: ${keywordCount}건).`,
          `플랜 작성 전 실 데이터(DB/로그/메트릭)를 read-only로 조회해 가설을 좁히려면 data-grounding 스킬을 사용하세요.`,
          ``,
          `- 세션 ID: ${sessionId}`,
          `- 매칭 키워드 수: ${keywordCount}`,
          `- 자동 트리거 횟수: ${state.run_count}`,
          ``,
          `Skill: data-grounding:data-grounding`,
          ``,
          `참고: 강제 호출이 아닙니다. 스킬은 AskUserQuestion으로 사용자 동의를 받은 뒤 진행되며, 사용자가 건너뛰기를 선택하면 일반 흐름으로 진행됩니다.`
        ].join('\n')
      }
    }));

  } catch (err) {
    // 에러 시 절대 사용자 흐름을 막지 않음
    noop();
  }
}

main();
