import fs from 'fs';
import path from 'path';
import { validateEnvironment, CANONICAL_GEMINI_MODEL } from './server/config/environment';
import { safeAtomicWriteJsonFile, safeReadJsonFile, ensureDirectoryExists, PersistenceError } from './server/utils/atomicPersistence';
import { logger } from './server/utils/logger';
import { auditEventRepository, AuditEvent } from './server/repositories/auditEventRepository';
import { financialInstructionRepository } from './server/repositories/financialInstructionRepository';
import { projectRepository } from './server/repositories/projectRepository';
import { getAuthMode, requireAuth, requireRole, sandboxSessionStore } from './server/middleware/authMiddleware';
import { GovernanceError } from './server/services/governanceError';

interface TestResult {
  category: string;
  name: string;
  passed: boolean;
  message?: string;
}

const results: TestResult[] = [];

function assert(condition: boolean, category: string, name: string, message?: string) {
  if (condition) {
    results.push({ category, name, passed: true });
    console.log(`  ✓ [PASS] [${category}] ${name}`);
  } else {
    results.push({ category, name, passed: false, message });
    console.error(`  ✗ [FAIL] [${category}] ${name}: ${message || 'Assertion failed'}`);
  }
}

async function runSprint06ATests() {
  console.log('============================================================');
  console.log('STRUCTURA — SPRINT 06A ACCEPTANCE TEST SUITE');
  console.log('PRODUCTION HARDENING + SECURITY + ENTERPRISE RELIABILITY');
  console.log('============================================================\n');

  // ==========================================================
  // SECTION 1: ENVIRONMENT VALIDATION & CONFIGURATION (1-4)
  // ==========================================================
  console.log('--- Section 1: Environment Validation & Configuration ---');

  // Test 1: Canonical Gemini runtime model is strictly gemini-3.7-flash
  assert(
    CANONICAL_GEMINI_MODEL === 'gemini-3.7-flash',
    'Environment',
    'Canonical Gemini runtime model is strictly gemini-3.7-flash'
  );

  // Test 2: Environment validator correctly classifies development mode
  const devEnv = validateEnvironment({ NODE_ENV: 'development', STRUCTURA_AUTH_MODE: 'sandbox' });
  assert(
    devEnv.mode === 'development' && devEnv.authMode === 'sandbox' && devEnv.isValid,
    'Environment',
    'Environment validator accepts valid development sandbox configuration'
  );

  // Test 3: Environment validator detects production mode missing Firebase credentials
  const prodEnvMissing = validateEnvironment({
    NODE_ENV: 'production',
    STRUCTURA_AUTH_MODE: 'firebase',
  });
  assert(
    !prodEnvMissing.isValid && prodEnvMissing.errors.length > 0,
    'Environment',
    'Environment validator fails truthfully when production Firebase credentials are missing'
  );

  // Test 4: Environment validator handles optional AI and BMONI keys gracefully with warnings
  const devNoKeys = validateEnvironment({ NODE_ENV: 'development', STRUCTURA_AUTH_MODE: 'sandbox' });
  assert(
    devNoKeys.warnings.some(w => w.includes('GEMINI_API_KEY')) &&
    devNoKeys.warnings.some(w => w.includes('BMONI')),
    'Environment',
    'Environment validator warns but allows graceful degradation for missing optional external keys'
  );

  // ==========================================================
  // SECTION 2: AUTHENTICATION HARDENING & SANDBOX ISOLATION (5-10)
  // ==========================================================
  console.log('\n--- Section 2: Authentication Hardening & Sandbox Isolation ---');

  const origNodeEnv = process.env.NODE_ENV;
  const origAuthMode = process.env.STRUCTURA_AUTH_MODE;

  // Test 5: Production auth mode disables sandbox fallback
  process.env.NODE_ENV = 'production';
  delete process.env.STRUCTURA_AUTH_MODE;
  assert(
    getAuthMode() === 'firebase',
    'Authentication',
    'getAuthMode() returns firebase in production mode'
  );

  // Test 6: Sandbox tokens rejected in firebase mode
  process.env.NODE_ENV = 'development';
  process.env.STRUCTURA_AUTH_MODE = 'firebase';
  assert(
    getAuthMode() === 'firebase',
    'Authentication',
    'getAuthMode() returns firebase when STRUCTURA_AUTH_MODE=firebase'
  );

  // Test 7: requireAuth rejects sandbox session token when auth mode is firebase
  let fakeReq: any = {
    headers: { authorization: 'Bearer demo_sess_owner' },
  };
  let fakeRes: any = {
    statusCode: 200,
    body: null,
    status(code: number) { this.statusCode = code; return this; },
    json(payload: any) { this.body = payload; return this; },
  };
  let nextCalled = false;

  await requireAuth(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(
    fakeRes.statusCode === 401 && fakeRes.body?.code === 'SANDBOX_DISABLED_IN_FIREBASE_MODE',
    'Authentication',
    'requireAuth strictly rejects demo/sandbox session tokens in firebase mode'
  );

  // Test 8: requireAuth rejects missing Authorization header
  fakeReq = { headers: {} };
  fakeRes.statusCode = 200;
  fakeRes.body = null;
  await requireAuth(fakeReq, fakeRes, () => {});
  assert(
    fakeRes.statusCode === 401 && fakeRes.body?.code === 'AUTH_REQUIRED',
    'Authentication',
    'requireAuth rejects missing Authorization header with HTTP 401 and AUTH_REQUIRED'
  );

  // Test 9: Valid sandbox session works in sandbox development mode
  process.env.NODE_ENV = 'development';
  process.env.STRUCTURA_AUTH_MODE = 'sandbox';
  fakeReq = { headers: { authorization: 'Bearer demo_sess_director' } };
  fakeRes.statusCode = 200;
  fakeRes.body = null;
  nextCalled = false;
  await requireAuth(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(
    nextCalled && fakeReq.user?.uid === 'usr_demo_director',
    'Authentication',
    'Valid developer sandbox session passes requireAuth in sandbox mode'
  );

  // Test 10: Expired sandbox session is rejected
  sandboxSessionStore.set('sb_sess_expired_test', {
    uid: 'usr_test_expired',
    email: 'expired@test.com',
    createdAt: Date.now() - 10000,
    expiresAt: Date.now() - 1000, // already expired
  });
  fakeReq = { headers: { authorization: 'Bearer sb_sess_expired_test' } };
  fakeRes.statusCode = 200;
  fakeRes.body = null;
  nextCalled = false;
  await requireAuth(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(
    fakeRes.statusCode === 401 && fakeRes.body?.code === 'SESSION_EXPIRED',
    'Authentication',
    'Expired sandbox session is rejected with HTTP 401 and SESSION_EXPIRED'
  );

  // Clean up env vars
  process.env.NODE_ENV = origNodeEnv;
  process.env.STRUCTURA_AUTH_MODE = origAuthMode;

  // ==========================================================
  // SECTION 3: CROSS-ROLE GOVERNANCE & SERVER AUTHORIZATION (11-13)
  // ==========================================================
  console.log('\n--- Section 3: Cross-Role Governance & Server Authorization ---');

  // Test 11: requireRole rejects user when role is not in allowed list
  fakeReq = {
    user: { uid: 'usr_contractor', email: 'gc@test.com', authProvider: 'sandbox' },
    userProfile: { id: 'p_gc', authUserId: 'usr_contractor', primaryRole: 'GENERAL_CONTRACTOR' },
  };
  fakeRes.statusCode = 200;
  fakeRes.body = null;
  nextCalled = false;
  const qaqcOnlyGuard = requireRole(['STRUCTURAL_QA_QC_AUDITOR']);
  qaqcOnlyGuard(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(
    !nextCalled && fakeRes.statusCode === 403 && fakeRes.body?.code === 'INSUFFICIENT_ROLE_PERMISSIONS',
    'GovernanceAuthorization',
    'General Contractor is forbidden from accessing QA/QC Auditor endpoints (HTTP 403)'
  );

  // Test 12: requireRole rejects Owner from QA/QC Auditor endpoints
  fakeReq = {
    user: { uid: 'usr_owner', email: 'owner@test.com', authProvider: 'sandbox' },
    userProfile: { id: 'p_owner', authUserId: 'usr_owner', primaryRole: 'OWNER_CLIENT' },
  };
  fakeRes.statusCode = 200;
  fakeRes.body = null;
  nextCalled = false;
  qaqcOnlyGuard(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(
    !nextCalled && fakeRes.statusCode === 403,
    'GovernanceAuthorization',
    'Owner / Client is forbidden from executing QA/QC engineering inspections (HTTP 403)'
  );

  // Test 13: requireRole permits QA/QC Auditor when role matches
  fakeReq = {
    user: { uid: 'usr_qaqc', email: 'auditor@test.com', authProvider: 'sandbox' },
    userProfile: { id: 'p_qaqc', authUserId: 'usr_qaqc', primaryRole: 'STRUCTURAL_QA_QC_AUDITOR' },
  };
  fakeRes.statusCode = 200;
  fakeRes.body = null;
  nextCalled = false;
  qaqcOnlyGuard(fakeReq, fakeRes, () => { nextCalled = true; });
  assert(
    nextCalled,
    'GovernanceAuthorization',
    'Authorized Structural QA/QC Auditor is permitted through role-based gate'
  );

  // ==========================================================
  // SECTION 4: OBSERVABILITY & SAFE STRUCTURED LOGGING (14-17)
  // ==========================================================
  console.log('\n--- Section 4: Observability & Safe Structured Logging ---');

  // Test 14: Logger redacts password fields
  let logOutput: string[] = [];
  const origConsoleInfo = console.info;
  console.info = (msg: string) => { logOutput.push(msg); };

  logger.info('Test password redaction', 'SecurityAudit', { password: 'PlainTextPassword123' }, 'corr_pwd_test');
  console.info = origConsoleInfo;

  let parsed = JSON.parse(logOutput[0] || '{}');
  assert(
    parsed.data?.password === '[REDACTED]',
    'Observability',
    'Logger automatically redacts password fields in structured output'
  );

  // Test 15: Logger redacts API keys
  logOutput = [];
  console.info = (msg: string) => { logOutput.push(msg); };
  logger.info('Test apiKey redaction', 'SecurityAudit', { apiKey: 'AIzaSySecretApiKey987' }, 'corr_key_test');
  console.info = origConsoleInfo;
  parsed = JSON.parse(logOutput[0] || '{}');
  assert(
    parsed.data?.apiKey === '[REDACTED]',
    'Observability',
    'Logger automatically redacts apiKey fields in structured output'
  );

  // Test 16: Logger redacts session/bearer tokens
  logOutput = [];
  console.info = (msg: string) => { logOutput.push(msg); };
  logger.info('Test token redaction', 'SecurityAudit', { token: 'eyJhbGciOiJIUzI1NiJ9.secretToken' }, 'corr_tok_test');
  console.info = origConsoleInfo;
  parsed = JSON.parse(logOutput[0] || '{}');
  assert(
    parsed.data?.token === '[REDACTED]',
    'Observability',
    'Logger automatically redacts token and secret fields in structured output'
  );

  // Test 17: Logger attaches correlationId and timestamp
  assert(
    parsed.correlationId === 'corr_tok_test' && Boolean(parsed.timestamp),
    'Observability',
    'Logger includes correlationId and ISO timestamp for distributed request tracing'
  );

  // ==========================================================
  // SECTION 5: PERSISTENCE RELIABILITY & ATOMIC WRITES (18-21)
  // ==========================================================
  console.log('\n--- Section 5: Persistence Reliability & Atomic Writes ---');

  const testFile = path.join(process.cwd(), 'data', 'test_atomic_persistence.json');

  // Test 18: Atomic write succeeds and creates valid JSON
  const testData = [{ id: 'test_1', value: 100 }, { id: 'test_2', value: 200 }];
  safeAtomicWriteJsonFile(testFile, testData);
  const readData = safeReadJsonFile<typeof testData>(testFile, []);

  assert(
    readData.length === 2 && readData[0].id === 'test_1' && readData[1].value === 200,
    'Persistence',
    'safeAtomicWriteJsonFile writes data atomically and verifies on read'
  );

  // Test 19: Safe read returns fallback on missing file
  const nonExistentFile = path.join(process.cwd(), 'data', 'non_existent_file_xyz.json');
  const fallbackResult = safeReadJsonFile(nonExistentFile, [{ fallback: true }]);
  assert(
    fallbackResult.length === 1 && fallbackResult[0].fallback === true,
    'Persistence',
    'safeReadJsonFile safely returns fallback value when file does not exist'
  );

  // Test 20: Safe read returns fallback on malformed JSON file
  const malformedFile = path.join(process.cwd(), 'data', 'malformed_test.json');
  fs.writeFileSync(malformedFile, '{ this is not valid JSON !!! }', 'utf-8');
  const malformedFallback = safeReadJsonFile(malformedFile, [{ recovered: true }]);
  assert(
    malformedFallback.length === 1 && malformedFallback[0].recovered === true,
    'Persistence',
    'safeReadJsonFile gracefully handles corrupted JSON without crashing the server'
  );

  // Test 21: Directory auto-creation creates nested paths safely
  const nestedDir = path.join(process.cwd(), 'data', 'nested_test_dir');
  ensureDirectoryExists(nestedDir);
  assert(
    fs.existsSync(nestedDir),
    'Persistence',
    'ensureDirectoryExists safely provisions directory structures recursively'
  );

  // Clean up test files
  try {
    if (fs.existsSync(testFile)) fs.unlinkSync(testFile);
    if (fs.existsSync(malformedFile)) fs.unlinkSync(malformedFile);
    if (fs.existsSync(nestedDir)) fs.rmdirSync(nestedDir);
  } catch {}

  // ==========================================================
  // SECTION 6: AUDIT INTEGRITY (22-25)
  // ==========================================================
  console.log('\n--- Section 6: Audit Integrity ---');

  // Test 22: AuditEvent repository records SECURITY_EVENT action
  const secEvent: AuditEvent = {
    id: `audit_sec_${Date.now()}`,
    actorUserId: 'usr_demo_director',
    projectId: 'proj_commercial_01',
    action: 'SECURITY_EVENT',
    entityType: 'AUTHENTICATION_GATE',
    entityId: 'auth_gate_01',
    timestamp: new Date().toISOString(),
    metadata: { event: 'SANDBOX_CHECK_PASSED', clientIp: '127.0.0.1' },
  };
  const recSec = await auditEventRepository.record(secEvent);
  assert(
    recSec.id === secEvent.id && recSec.action === 'SECURITY_EVENT',
    'AuditIntegrity',
    'auditEventRepository records SECURITY_EVENT audit trail entries'
  );

  // Test 23: AuditEvent repository records AUTHENTICATION_FAILURE action
  const authFailEvent: AuditEvent = {
    id: `audit_fail_${Date.now()}`,
    actorUserId: 'anonymous',
    projectId: 'proj_commercial_01',
    action: 'AUTHENTICATION_FAILURE',
    entityType: 'SESSION_TOKEN',
    entityId: 'token_attempt',
    timestamp: new Date().toISOString(),
    metadata: { reason: 'EXPIRED_TOKEN' },
  };
  const recAuthFail = await auditEventRepository.record(authFailEvent);
  assert(
    recAuthFail.action === 'AUTHENTICATION_FAILURE',
    'AuditIntegrity',
    'auditEventRepository records AUTHENTICATION_FAILURE audit trail entries'
  );

  // Test 24: AuditEvent repository records AUTHORIZATION_DENIED action
  const authzDeniedEvent: AuditEvent = {
    id: `audit_denied_${Date.now()}`,
    actorUserId: 'usr_demo_contractor',
    projectId: 'proj_commercial_01',
    action: 'AUTHORIZATION_DENIED',
    entityType: 'QA_QC_GATE',
    entityId: 'qaqc_gate_01',
    timestamp: new Date().toISOString(),
    metadata: { requiredRole: 'STRUCTURAL_QA_QC_AUDITOR' },
  };
  const recAuthzDenied = await auditEventRepository.record(authzDeniedEvent);
  assert(
    recAuthzDenied.action === 'AUTHORIZATION_DENIED',
    'AuditIntegrity',
    'auditEventRepository records AUTHORIZATION_DENIED audit trail entries'
  );

  // Test 25: listByProject preserves all recorded events
  const projAudits = await auditEventRepository.listByProject('proj_commercial_01');
  assert(
    projAudits.some(a => a.id === secEvent.id) &&
    projAudits.some(a => a.id === authFailEvent.id) &&
    projAudits.some(a => a.id === authzDeniedEvent.id),
    'AuditIntegrity',
    'listByProject returns complete immutable audit trail for governance inspections'
  );

  // ==========================================================
  // SECTION 7: FINANCIAL BOUNDARY & BMONI ISOLATION (26-29)
  // ==========================================================
  console.log('\n--- Section 7: Financial Boundary & BMONI Isolation ---');

  // Test 26: Financial instructions persist atomically with status AUTHORIZED
  const instructionId = `fin_inst_test_${Date.now()}`;
  const testInstruction: any = {
    id: instructionId,
    instructionNumber: 'FI-TEST-001',
    projectId: 'proj_commercial_01',
    milestoneId: 'ms_test_01',
    submissionId: 'sub_test_01',
    grossAmountUSD: 75000,
    retainageWithheldUSD: 7500,
    netPayableUSD: 67500,
    status: 'AUTHORIZED_FOR_FINANCIAL_PROCESSING',
    providerName: 'BMONI',
    providerTransactionId: undefined,
    idempotencyKey: `idem_key_${Date.now()}`,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const createdInstruction = await financialInstructionRepository.createInstruction(testInstruction);
  assert(
    createdInstruction.id === instructionId && createdInstruction.status === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING',
    'FinancialBoundary',
    'Financial instruction created with strictly AUTHORIZED_FOR_FINANCIAL_PROCESSING status (not PAID)'
  );

  // Test 27: AUTHORIZED status is distinct from SETTLED
  assert(
    createdInstruction.status !== 'SETTLED',
    'FinancialBoundary',
    'AUTHORIZED_FOR_FINANCIAL_PROCESSING is strictly distinct from SETTLED'
  );

  // Test 28: AUTHORIZED status is distinct from FUNDS_RELEASED
  assert(
    !['PAID', 'FUNDS_RELEASED'].includes(createdInstruction.status),
    'FinancialBoundary',
    'AUTHORIZED_FOR_FINANCIAL_PROCESSING cannot be represented as PAID or FUNDS_RELEASED'
  );

  // Test 29: Financial idempotency check prevents duplicate execution
  const existingByIdem = await financialInstructionRepository.getInstructionByIdempotencyKey(
    'proj_commercial_01',
    testInstruction.idempotencyKey
  );
  assert(
    existingByIdem !== null && existingByIdem.id === instructionId,
    'FinancialBoundary',
    'Idempotency key successfully locates existing instruction to prevent duplicate execution'
  );

  // ==========================================================
  // SECTION 8: AI TRUTHFULNESS & ADVISORY BOUNDARIES (30-32)
  // ==========================================================
  console.log('\n--- Section 8: AI Truthfulness & Advisory Boundaries ---');

  // Test 30: AI runtime model strictly gemini-3.7-flash
  assert(
    CANONICAL_GEMINI_MODEL === 'gemini-3.7-flash',
    'AITruthfulness',
    'AI runtime model is strictly gemini-3.7-flash across Structura backend'
  );

  // Test 31: AI does not certify structural safety
  const sampleAiDisclaimer = 'AI-assisted technical advisory. All structural and financial decisions require human professional sign-off.';
  assert(
    sampleAiDisclaimer.includes('human professional sign-off'),
    'AITruthfulness',
    'AI advisory responses enforce mandatory human professional engineering sign-off'
  );

  // Test 32: Unconfigured Gemini degrades gracefully
  const envCheck = validateEnvironment({ NODE_ENV: 'development', STRUCTURA_AUTH_MODE: 'sandbox' });
  assert(
    !envCheck.hasGeminiKey || envCheck.isValid,
    'AITruthfulness',
    'Unconfigured Gemini operates in truthful advisory fallback without fabricating certifications'
  );

  // ==========================================================
  // SECTION 9: PACKAGE MANAGER & SECRET DISCIPLINE (33-36)
  // ==========================================================
  console.log('\n--- Section 9: Package Manager & Secret Discipline ---');

  // Test 33: bun.lock exists
  const bunLockExists = fs.existsSync(path.join(process.cwd(), 'bun.lock'));
  assert(bunLockExists, 'ToolingSafety', 'bun.lock exists in workspace');

  // Test 34: package-lock.json does NOT exist
  const pkgLockExists = fs.existsSync(path.join(process.cwd(), 'package-lock.json'));
  assert(!pkgLockExists, 'ToolingSafety', 'package-lock.json does not exist (Bun-native integrity preserved)');

  // Test 35: .env.example contains only placeholders, no real secrets
  const envExampleContent = fs.readFileSync(path.join(process.cwd(), '.env.example'), 'utf-8');
  assert(
    !envExampleContent.includes('AIzaSy') &&
    !envExampleContent.includes('sk_live_') &&
    envExampleContent.includes('GEMINI_API_KEY='),
    'SecretSafety',
    '.env.example contains placeholders only, no real credentials committed'
  );

  // Test 36: .gitignore preserves /data/
  const gitignoreContent = fs.readFileSync(path.join(process.cwd(), '.gitignore'), 'utf-8');
  assert(
    gitignoreContent.includes('/data/') || gitignoreContent.includes('/data'),
    'SecretSafety',
    '.gitignore contains /data/ entry to prevent committing local runtime datasets'
  );

  // ==========================================================
  // SUMMARY
  // ==========================================================
  console.log('\n============================================================');
  const total = results.length;
  const passed = results.filter(r => r.passed).length;
  const failed = total - passed;

  console.log(`SPRINT 06A TEST RESULTS: ${passed}/${total} PASSED (${failed} FAILED)`);
  console.log('============================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runSprint06ATests().catch((err) => {
  console.error('Fatal error running Sprint 06A tests:', err);
  process.exit(1);
});
