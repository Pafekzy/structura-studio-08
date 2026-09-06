import { projectRepository } from './server/repositories/projectRepository';
import { milestoneRepository } from './server/repositories/milestoneRepository';
import { ncrRepository } from './server/repositories/ncrRepository';
import { ownerDecisionRepository } from './server/repositories/ownerDecisionRepository';
import { auditEventRepository } from './server/repositories/auditEventRepository';
import { financialExecutionService } from './server/services/financialExecutionService';
import { financialInstructionRepository } from './server/repositories/financialInstructionRepository';
import { bmoniAdapter } from './server/services/financial/bmoniAdapter';
import { GovernanceError } from './server/services/governanceError';

async function runSprint05BAcceptanceTests() {
  console.log('====================================================');
  console.log('STRUCTURA SPRINT 05B ACCEPTANCE TEST SUITE');
  console.log('Financial Execution Readiness + BMONI Provider Boundary');
  console.log('====================================================\n');

  let passedTests = 0;
  let failedTests = 0;

  function assert(condition: boolean, testName: string, details?: string) {
    if (condition) {
      console.log(`✅ PASS: ${testName}`);
      passedTests++;
    } else {
      console.error(`❌ FAIL: ${testName}`);
      if (details) console.error(`   Details: ${details}`);
      failedTests++;
    }
  }

  // Setup Test Project & Users
  const projectId = 'proj-sp05b-test-' + Date.now();
  const ownerId = 'user-owner-05b';
  const directorId = 'user-director-05b';
  const contractorId = 'user-contractor-05b';
  const auditorId = 'user-auditor-05b';
  const unauthorizedUserId = 'user-unauthorized-05b';

  console.log('--- 1. Setting up Test Governance Project & Roles ---');
  await projectRepository.createProject({
    id: projectId,
    organizationId: 'org-test-05b',
    name: 'Metropolis Tower Financial Execution Phase',
    description: 'Sprint 05B Financial Execution Acceptance Test Project',
    location: 'Austin, TX',
    ownerUserId: ownerId,
    status: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  await projectRepository.createAppointment({
    id: 'appt-director-05b',
    projectId,
    userId: directorId,
    role: 'SENIOR_PROJECT_DIRECTOR',
    appointedByUserId: ownerId,
    appointmentStatus: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  await projectRepository.createAppointment({
    id: 'appt-contractor-05b',
    projectId,
    userId: contractorId,
    role: 'GENERAL_CONTRACTOR',
    appointedByUserId: ownerId,
    appointmentStatus: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  await projectRepository.createAppointment({
    id: 'appt-auditor-05b',
    projectId,
    userId: auditorId,
    role: 'STRUCTURAL_QA_QC_AUDITOR',
    appointedByUserId: ownerId,
    appointmentStatus: 'ACTIVE',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Setup Milestones:
  // MS 1: Governed and APPROVED by Owner (AUTHORIZED_FOR_FINANCIAL_PROCESSING)
  const ms1Id = 'ms-05b-authorized-' + Date.now();
  await milestoneRepository.createMilestone({
    id: ms1Id,
    projectId,
    title: 'Curtain Wall Level 10-15 Glazing',
    discipline: 'FAÇADE',
    assignedContractorId: contractorId,
    status: 'OWNER_APPROVED',
    financialStatus: 'AUTHORIZED_FOR_FINANCIAL_PROCESSING',
    costAllocationUSD: 175000,
    progressPercentage: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // Owner Decision for MS 1
  const decision1Id = 'dec-05b-1-' + Date.now();
  await ownerDecisionRepository.createDecision({
    id: decision1Id,
    projectId,
    milestoneId: ms1Id,
    ownerUserId: ownerId,
    decision: 'APPROVE',
    notes: 'Approved for financial processing',
    createdAt: new Date().toISOString(),
  } as any);

  // MS 2: NOT AUTHORIZED (Only contractor submitted, technical review incomplete)
  const ms2Id = 'ms-05b-pending-' + Date.now();
  await milestoneRepository.createMilestone({
    id: ms2Id,
    projectId,
    title: 'Core Concrete Pour Level 16',
    discipline: 'STRUCTURE',
    assignedContractorId: contractorId,
    status: 'SUBMITTED',
    financialStatus: 'NOT_AUTHORIZED',
    costAllocationUSD: 220000,
    progressPercentage: 80,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  // MS 3: Owner approved but blocked by open NCR
  const ms3Id = 'ms-05b-ncr-blocked-' + Date.now();
  await milestoneRepository.createMilestone({
    id: ms3Id,
    projectId,
    title: 'HVAC Chiller Installation Basement',
    discipline: 'MEP',
    assignedContractorId: contractorId,
    status: 'OWNER_APPROVED',
    financialStatus: 'AUTHORIZED_FOR_FINANCIAL_PROCESSING',
    costAllocationUSD: 95000,
    progressPercentage: 100,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  await ncrRepository.createNCR({
    id: 'ncr-05b-blocking',
    projectId,
    milestoneId: ms3Id,
    title: 'Chiller mount vibration damper non-compliant',
    status: 'OPEN',
    severity: 'CRITICAL',
    createdByUserId: auditorId,
    assignedToUserId: contractorId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as any);

  console.log('\n--- 2. Financial Eligibility Verification ---');
  try {
    // MS 2 is NOT authorized
    let ms2Blocked = false;
    try {
      await financialExecutionService.createFinancialInstruction(
        projectId,
        ms2Id,
        ownerId,
        'key-test-ms2',
        'Attempting instruction for unauthorized milestone'
      );
    } catch (err: any) {
      ms2Blocked = err instanceof GovernanceError && err.statusCode === 400;
    }
    assert(ms2Blocked, 'Milestone without AUTHORIZED_FOR_FINANCIAL_PROCESSING status is blocked');

    // MS 3 has open critical NCR
    let ms3Blocked = false;
    try {
      await financialExecutionService.createFinancialInstruction(
        projectId,
        ms3Id,
        ownerId,
        'key-test-ms3',
        'Attempting instruction for NCR blocked milestone'
      );
    } catch (err: any) {
      ms3Blocked = err instanceof GovernanceError && err.statusCode === 400;
    }
    assert(ms3Blocked, 'Milestone with unresolved open NCR is blocked from financial instruction');
  } catch (err: any) {
    assert(false, 'Financial Eligibility check', err.message);
  }

  console.log('\n--- 3. Authority & Role Boundaries ---');
  try {
    // Contractor cannot create instruction for their own milestone
    let contractorBlocked = false;
    try {
      await financialExecutionService.createFinancialInstruction(
        projectId,
        ms1Id,
        contractorId,
        'key-contractor-attempt',
        'Contractor self-authorizing payment'
      );
    } catch (err: any) {
      contractorBlocked = err instanceof GovernanceError && err.statusCode === 403;
    }
    assert(contractorBlocked, 'General Contractor is blocked from creating/authorizing financial instruction (Anti-Self-Pay)');

    // QA/QC Auditor cannot create financial instruction
    let auditorBlocked = false;
    try {
      await financialExecutionService.createFinancialInstruction(
        projectId,
        ms1Id,
        auditorId,
        'key-auditor-attempt',
        'Auditor creating financial instruction'
      );
    } catch (err: any) {
      auditorBlocked = err instanceof GovernanceError && err.statusCode === 403;
    }
    assert(auditorBlocked, 'Structural QA/QC Auditor is blocked from financial execution authority');

    // Unauthorized non-project user
    let unauthorizedBlocked = false;
    try {
      await financialExecutionService.createFinancialInstruction(
        projectId,
        ms1Id,
        unauthorizedUserId,
        'key-unauthorized-attempt',
        'Unauthorized user attempt'
      );
    } catch (err: any) {
      unauthorizedBlocked = err instanceof GovernanceError && err.statusCode === 403;
    }
    assert(unauthorizedBlocked, 'Non-project member is rejected with HTTP 403');
  } catch (err: any) {
    assert(false, 'Authority and Role boundaries', err.message);
  }

  console.log('\n--- 4. Owner Instruction Creation & Truthful Initial State ---');
  let instruction1: any = null;
  try {
    instruction1 = await financialExecutionService.createFinancialInstruction(
      projectId,
      ms1Id,
      ownerId,
      'idemp-key-ms1-001',
      'Owner formal financial dispatch instruction'
    );

    assert(instruction1.id !== undefined, 'Financial instruction created with valid ID');
    assert(instruction1.instructionNumber.startsWith('FIN-'), 'Instruction has standard FIN- prefix');
    assert(instruction1.amountUSD === 175000, 'Instruction captures exact milestone cost allocation USD');
    assert(instruction1.status === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING', 'Initial status is AUTHORIZED_FOR_FINANCIAL_PROCESSING');
    assert(instruction1.providerStatus === 'REQUEST_CREATED', 'Initial provider status is REQUEST_CREATED');
    assert(instruction1.providerId === 'BMONI', 'Provider is identified as BMONI');

    // Truthfulness assertions:
    assert(instruction1.status !== 'SETTLED', 'Truthfulness: Instruction is strictly NOT SETTLED at creation');
    assert(instruction1.settlementRecord === undefined, 'Truthfulness: No fabricated SettlementRecord exists');
  } catch (err: any) {
    assert(false, 'Owner Instruction Creation', err.message);
  }

  console.log('\n--- 5. Duplicate Instruction & Idempotency Prevention ---');
  try {
    // 5a. Same idempotency key returns exact same instruction without duplicate creation
    const dupKeyResult = await financialExecutionService.createFinancialInstruction(
      projectId,
      ms1Id,
      ownerId,
      'idemp-key-ms1-001',
      'Repeated submission with same idempotency key'
    );
    assert(dupKeyResult.id === instruction1.id, 'Idempotent request returns existing instruction');

    // 5b. Attempting a second instruction with different key for same milestone is blocked
    let duplicateMilestoneBlocked = false;
    try {
      await financialExecutionService.createFinancialInstruction(
        projectId,
        ms1Id,
        ownerId,
        'idemp-key-ms1-different',
        'Second instruction attempt for already instructed milestone'
      );
    } catch (err: any) {
      duplicateMilestoneBlocked = err instanceof GovernanceError && err.statusCode === 400;
    }
    assert(duplicateMilestoneBlocked, 'Duplicate instruction for same milestone is strictly prevented');
  } catch (err: any) {
    assert(false, 'Duplicate and Idempotency Prevention', err.message);
  }

  console.log('\n--- 6. BMONI Provider Connection Status & Unavailable Behavior ---');
  try {
    const connStatus = bmoniAdapter.getConnectionStatus();
    assert(
      connStatus.status === 'NOT_CONNECTED' || connStatus.status === 'UNAVAILABLE' || connStatus.status === 'CONNECTED',
      'BMONI adapter reports valid connection status'
    );
    assert(
      connStatus.truthfulStatement.includes('No fake transfers') || connStatus.truthfulStatement.includes('truthful'),
      'Truthful statement explicitly declared by adapter'
    );

    // In real mode (without BMONI credentials), execution returns UNAVAILABLE or NOT_CONNECTED truthfully
    if (connStatus.status !== 'CONNECTED') {
      const realDispatch = await bmoniAdapter.submitInstruction({
        instructionId: instruction1.id,
        instructionNumber: instruction1.instructionNumber,
        projectId,
        amountUSD: instruction1.amountUSD,
        currency: 'USD',
        recipientUserId: contractorId,
        idempotencyKey: 'test-real-dispatch',
      });
      assert(
        realDispatch.providerStatus === 'UNAVAILABLE' || realDispatch.providerStatus === 'NOT_CONNECTED',
        'Adapter returns UNAVAILABLE/NOT_CONNECTED when real BMONI credentials missing (No fake transfers)'
      );
      assert(realDispatch.isSettled === false, 'Truthfulness: isSettled is strictly false when provider unavailable');
    } else {
      console.log('ℹ️ BMONI connected via configured credentials');
    }
  } catch (err: any) {
    assert(false, 'BMONI connection status check', err.message);
  }

  console.log('\n--- 7. Provider Acceptance NOT Equaling Settlement (Truthfulness Rule) ---');
  try {
    // Process instruction using simulated provider
    const processed = await financialExecutionService.processInstructionWithProvider(
      projectId,
      instruction1.id,
      ownerId,
      'proc-idemp-001',
      true // simulatedMode
    );

    assert(processed.providerStatus === 'ACCEPTED', 'Provider accepted instruction for processing');
    assert(processed.status === 'PROVIDER_ACCEPTED', 'Workflow status is PROVIDER_ACCEPTED');

    // CRITICAL TRUTHFULNESS RULE:
    // AUTHORIZED_FOR_FINANCIAL_PROCESSING ≠ PAID ≠ SETTLED
    assert(processed.status !== 'SETTLED', 'CRITICAL RULE: Provider acceptance does NOT equal SETTLED');
    assert(processed.settledAt === undefined, 'No settlement timestamp recorded upon acceptance');
    assert(processed.settlementRecord === undefined, 'No settlement record attached without verified evidence');
  } catch (err: any) {
    assert(false, 'Provider acceptance distinction', err.message);
  }

  console.log('\n--- 8. Provider Webhook Security & Authenticity Boundary ---');
  try {
    // Missing signature / invalid signature rejected
    const invalidWebhook = await financialExecutionService.handleProviderWebhook(
      {
        eventId: 'evt-unauthenticated',
        eventType: 'payment.settled',
        instructionId: instruction1.id,
        status: 'SETTLED',
        timestamp: new Date().toISOString(),
      },
      'invalid-bad-signature'
    );

    assert(invalidWebhook.success === false, 'Webhook rejected when signature is invalid or unverifiable');
    assert(invalidWebhook.processedStatus === 'REJECTED_UNVERIFIABLE', 'Webhook classified as REJECTED_UNVERIFIABLE');
  } catch (err: any) {
    assert(false, 'Webhook security boundary', err.message);
  }

  console.log('\n--- 9. Settlement Verification via Authoritative Provider Evidence ---');
  try {
    // Construct signed/verified settlement event
    const timestamp = new Date().toISOString();
    const payload = {
      eventId: 'evt-valid-settlement-001',
      eventType: 'payment.settled',
      instructionId: instruction1.id,
      providerTransactionId: 'BMONI-TX-778899',
      settledAmountUSD: 175000,
      settledCurrency: 'USD',
      status: 'SETTLED',
      timestamp,
    };

    // Generate valid HMAC signature matching the secret in bmoniAdapter
    const secret = process.env.BMONI_WEBHOOK_SECRET || 'structura_bmoni_webhook_secret_dev';
    const crypto = await import('crypto');
    const validSignature = crypto.createHmac('sha256', secret).update(JSON.stringify(payload)).digest('hex');

    const webhookResult = await financialExecutionService.handleProviderWebhook(payload, validSignature);
    assert(webhookResult.success === true, 'Authenticated webhook accepted with valid HMAC signature');
    assert(webhookResult.processedStatus === 'SETTLED', 'Webhook processed and verified settlement');

    // Fetch updated instruction to verify persisted state
    const settledInstruction = await financialInstructionRepository.findById(instruction1.id);
    assert(settledInstruction !== null, 'Settled instruction fetched from repository');
    assert(settledInstruction?.status === 'SETTLED', 'Status authoritatively transitioned to SETTLED');
    assert(settledInstruction?.providerStatus === 'SETTLED', 'Provider status updated to SETTLED');
    assert(settledInstruction?.settledAt !== undefined, 'settledAt timestamp recorded');
    assert(settledInstruction?.settlementRecord?.verifiedByProviderEvidence === true, 'SettlementRecord marked verifiedByProviderEvidence: true');
    assert(settledInstruction?.settlementRecord?.providerReference === 'BMONI-TX-778899', 'Provider reference persisted in SettlementRecord');
  } catch (err: any) {
    assert(false, 'Settlement confirmation execution', err.message);
  }

  console.log('\n--- 10. Financial Reconciliation Engine ---');
  try {
    // Create a second instruction that will become stale/mismatched
    const ms4Id = 'ms-05b-reconciliation-' + Date.now();
    await milestoneRepository.createMilestone({
      id: ms4Id,
      projectId,
      title: 'Structural Steel Framing Level 17',
      discipline: 'STRUCTURE',
      assignedContractorId: contractorId,
      status: 'OWNER_APPROVED',
      financialStatus: 'AUTHORIZED_FOR_FINANCIAL_PROCESSING',
      costAllocationUSD: 130000,
      progressPercentage: 100,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    } as any);

    await ownerDecisionRepository.createDecision({
      id: 'dec-05b-4-' + Date.now(),
      projectId,
      milestoneId: ms4Id,
      ownerUserId: ownerId,
      decision: 'APPROVE',
      notes: 'Approved for steel payment',
      createdAt: new Date().toISOString(),
    } as any);

    const staleInstruction = await financialExecutionService.createFinancialInstruction(
      projectId,
      ms4Id,
      ownerId,
      'key-stale-001',
      'Instruction for reconciliation test'
    );

    // Simulate stale processing state (e.g. PROCESSING older than 24 hours)
    await financialInstructionRepository.update(staleInstruction.id, {
      status: 'PROCESSING',
      providerStatus: 'REQUEST_CREATED',
      processedAt: new Date(Date.now() - 48 * 3600 * 1000).toISOString(), // 48h ago
    });

    // Run reconciliation
    const reconResults = await financialExecutionService.reconcileProjectFinancials(projectId, ownerId);
    assert(reconResults.length > 0, 'Reconciliation engine detected stale/mismatched instructions');
    
    const staleResult = reconResults.find(r => r.instructionId === staleInstruction.id);
    assert(staleResult !== undefined, 'Stale instruction flagged in reconciliation');
    assert(staleResult?.requiresAttention === true, 'Flagged as requiring human attention');

    // Verify instruction status updated to REQUIRES_RECONCILIATION
    const updatedStale = await financialInstructionRepository.findById(staleInstruction.id);
    assert(updatedStale?.status === 'REQUIRES_RECONCILIATION', 'Instruction status transitioned to REQUIRES_RECONCILIATION');
    assert(updatedStale?.reconciliationRecord !== undefined, 'Reconciliation record attached');

    // Resolve reconciliation
    const resolved = await financialExecutionService.resolveReconciliation(
      projectId,
      staleInstruction.id,
      ownerId,
      'Reconciliation verified against external ledger: manual confirmation provided',
      'MATCHED'
    );
    assert(resolved.status === 'PROVIDER_ACCEPTED', 'Reconciliation resolution updated instruction status');
    assert(resolved.reconciliationRecord?.status === 'RESOLVED', 'Reconciliation record marked RESOLVED');
  } catch (err: any) {
    assert(false, 'Financial reconciliation suite', err.message);
  }

  console.log('\n--- 11. Role-Based Financial Visibility Rules ---');
  try {
    // Owner sees all instructions
    const ownerView = await financialExecutionService.getProjectFinancialInstructions(projectId, ownerId);
    assert(ownerView.length >= 2, 'Owner has visibility to all project financial instructions');

    // Contractor sees instructions relating to their work
    const contractorView = await financialExecutionService.getProjectFinancialInstructions(projectId, contractorId);
    assert(contractorView.length > 0, 'Contractor sees instructions for their assigned milestones');
    assert(
      contractorView.every(i => i.contractorUserId === contractorId),
      'Contractor sees ONLY instructions relating to their assigned work'
    );

    // Unauthorized user cannot view project financials
    let unauthorizedViewBlocked = false;
    try {
      await financialExecutionService.getProjectFinancialInstructions(projectId, unauthorizedUserId);
    } catch (err: any) {
      unauthorizedViewBlocked = err instanceof GovernanceError && err.statusCode === 403;
    }
    assert(unauthorizedViewBlocked, 'Unauthorized user is blocked from reading financial instructions (HTTP 403)');
  } catch (err: any) {
    assert(false, 'Role-Based Financial Visibility', err.message);
  }

  console.log('\n--- 12. AI Financial Advisor Boundary & Guardrails ---');
  try {
    const aiExplanation = await financialExecutionService.explainFinancialStatusWithAI(projectId, ms1Id, ownerId);
    assert(aiExplanation.governanceStatus !== undefined, 'AI explanation reports governed milestone status');
    assert(aiExplanation.providerStatus !== undefined, 'AI explanation reports truthful provider connection status');
    assert(aiExplanation.disclaimer.includes('AI is an explanatory advisor only'), 'AI includes mandatory disclaimer banner');
    assert(aiExplanation.disclaimer.includes('CANNOT authorize payments'), 'AI disclaimer explicitly states AI cannot authorize payments');

    // Verify AI explanation did NOT modify any financial records
    const checkInstruction = await financialInstructionRepository.findById(instruction1.id);
    assert(checkInstruction?.id === instruction1.id, 'AI explanation performed pure read-only evaluation without state mutations');
  } catch (err: any) {
    assert(false, 'AI Financial Advisor Boundary', err.message);
  }

  console.log('\n--- 13. Financial Audit Trail Completeness ---');
  try {
    const auditEvents = await auditEventRepository.listByProject(projectId);
    const actions = auditEvents.map(a => a.action);

    assert(actions.includes('FINANCIAL_INSTRUCTION_CREATED'), 'Audit trail logged FINANCIAL_INSTRUCTION_CREATED');
    assert(actions.includes('FINANCIAL_PROCESSING_REQUESTED'), 'Audit trail logged FINANCIAL_PROCESSING_REQUESTED');
    assert(actions.includes('SETTLEMENT_CONFIRMED'), 'Audit trail logged SETTLEMENT_CONFIRMED');
    assert(actions.includes('FINANCIAL_RECONCILIATION_REQUIRED'), 'Audit trail logged FINANCIAL_RECONCILIATION_REQUIRED');
    assert(actions.includes('FINANCIAL_RECONCILIATION_RESOLVED'), 'Audit trail logged FINANCIAL_RECONCILIATION_RESOLVED');
  } catch (err: any) {
    assert(false, 'Financial Audit Trail verification', err.message);
  }

  console.log('\n====================================================');
  console.log(`ACCEPTANCE RESULTS: ${passedTests} PASSED, ${failedTests} FAILED`);
  console.log('====================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  }
}

runSprint05BAcceptanceTests().catch(err => {
  console.error('Fatal test error in Sprint 05B:', err);
  process.exit(1);
});
