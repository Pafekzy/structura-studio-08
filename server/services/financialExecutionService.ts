import { GoogleGenAI } from '@google/genai';
import { financialInstructionRepository } from '../repositories/financialInstructionRepository';
import { milestoneRepository } from '../repositories/milestoneRepository';
import { projectRepository } from '../repositories/projectRepository';
import { organizationRepository } from '../repositories/organizationRepository';
import { userRepository } from '../repositories/userRepository';
import { ncrRepository } from '../repositories/ncrRepository';
import { ownerDecisionRepository } from '../repositories/ownerDecisionRepository';
import { auditEventRepository } from '../repositories/auditEventRepository';
import { bmoniAdapter } from './financial/bmoniAdapter';
import { IFinancialProviderAdapter, ProviderSubmissionResponse } from './financial/financialProviderAdapter';
import { GovernanceError } from './governanceError';
import {
  FinancialInstruction,
  FinancialExecutionStatus,
  ProjectRole,
  SettlementRecord,
  ReconciliationRecord,
} from '../../src/types';

export class FinancialExecutionService {
  private providerAdapter: IFinancialProviderAdapter;

  constructor(adapter: IFinancialProviderAdapter = bmoniAdapter) {
    this.providerAdapter = adapter;
  }

  /**
   * Resolves the user's role on a given project.
   */
  async resolveUserProjectRole(projectId: string, userId: string): Promise<ProjectRole | null> {
    const project = await projectRepository.getProjectById(projectId);
    if (!project) return null;

    if (project.ownerUserId === userId) {
      return 'OWNER_CLIENT';
    }

    const appointment = await projectRepository.getAppointmentByProjectAndUser(projectId, userId);
    if (appointment && appointment.appointmentStatus === 'ACTIVE') {
      return appointment.role;
    }

    if (project.organizationId) {
      const org = await organizationRepository.getOrganizationById(project.organizationId);
      if (org && org.ownerUserId === userId) {
        return 'OWNER_CLIENT';
      }
      const membership = await organizationRepository.getMembership(project.organizationId, userId);
      if (membership && membership.status === 'ACTIVE' && membership.organizationRole === 'OWNER_ADMIN') {
        return 'OWNER_CLIENT';
      }
    }

    return null;
  }

  /**
   * Retrieves actor display name and details.
   */
  async getActorDetails(userId: string): Promise<{ fullName: string }> {
    const user = (await userRepository.findByAuthUserId(userId)) || (await userRepository.findById(userId));
    if (user) {
      return { fullName: `${user.firstName} ${user.lastName}`.trim() };
    }
    const defaultNames: Record<string, string> = {
      'usr-demo-owner': 'Elena Rostova',
      'usr-demo-director': 'Dr. Arthur Sterling',
      'usr-demo-contractor': 'Marcus Vance',
      'usr-demo-auditor': 'Dr. David Chen',
    };
    return { fullName: defaultNames[userId] || `User (${userId})` };
  }

  /**
   * Returns provider connection status truthfully.
   */
  getProviderStatus() {
    return this.providerAdapter.getConnectionStatus();
  }

  /**
   * Creates a formal financial instruction for an approved milestone.
   *
   * Governance rules:
   * - Caller must be OWNER_CLIENT.
   * - GENERAL_CONTRACTOR cannot authorize/create their own payment instructions.
   * - QA/QC Auditor has no financial execution authority.
   * - Milestone must exist and have financialStatus === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING'.
   * - Milestone must NOT have open/blocking NCRs.
   * - Idempotency: repeated requests return the existing instruction.
   */
  async createFinancialInstruction(
    projectId: string,
    arg2: string,
    arg3: any,
    arg4?: string,
    arg5?: string
  ): Promise<FinancialInstruction> {
    let userId: string;
    let data: {
      milestoneId: string;
      idempotencyKey: string;
      amountUSD?: number;
      executionNotes?: string;
    };

    if (typeof arg3 === 'object' && arg3 !== null) {
      userId = arg2;
      data = arg3;
    } else {
      userId = arg3;
      data = {
        milestoneId: arg2,
        idempotencyKey: arg4 || `idemp-${Date.now()}`,
        executionNotes: arg5,
      };
    }

    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw new GovernanceError(403, 'INSUFFICIENT_PROJECT_AUTHORITY', 'Forbidden: You do not have authority on this project.');
    }

    if (role === 'GENERAL_CONTRACTOR') {
      throw new GovernanceError(403, 'CONTRACTOR_SELF_AUTHORIZATION_FORBIDDEN', 'Forbidden: General Contractor cannot authorize or create their own payment instructions.');
    }

    if (role === 'STRUCTURAL_QA_QC_AUDITOR') {
      throw new GovernanceError(403, 'INSUFFICIENT_ROLE_AUTHORITY', 'Forbidden: Structural QA/QC Auditor has no financial execution authority.');
    }

    if (role !== 'OWNER_CLIENT') {
      throw new GovernanceError(403, 'INSUFFICIENT_ROLE_AUTHORITY', 'Forbidden: Only Owner Client may create and authorize financial execution instructions.');
    }

    if (!data.milestoneId || !data.idempotencyKey) {
      throw new GovernanceError(400, 'VALIDATION_ERROR', 'milestoneId and idempotencyKey are mandatory.');
    }

    // Check idempotency first: existing instruction by idempotency key
    const existingByIdempotency = await financialInstructionRepository.getInstructionByIdempotencyKey(
      projectId,
      data.idempotencyKey
    );
    if (existingByIdempotency) {
      return existingByIdempotency;
    }

    // Check if an instruction already exists for this milestone
    const existingByMilestone = await financialInstructionRepository.getInstructionByMilestoneId(data.milestoneId);
    if (existingByMilestone) {
      if (existingByMilestone.idempotencyKey === data.idempotencyKey) {
        return existingByMilestone;
      }
      throw new GovernanceError(
        400,
        'DUPLICATE_INSTRUCTION_FOR_MILESTONE',
        `A financial instruction (${existingByMilestone.instructionNumber}) already exists for this milestone.`
      );
    }

    const milestone = await milestoneRepository.getMilestoneById(data.milestoneId);
    if (!milestone || milestone.projectId !== projectId) {
      throw new GovernanceError(404, 'MILESTONE_NOT_FOUND', 'Milestone not found on this project.');
    }

    // Verify milestone is formally authorized by Owner governance
    if (milestone.financialStatus !== 'AUTHORIZED_FOR_FINANCIAL_PROCESSING') {
      throw new GovernanceError(
        400,
        'MILESTONE_NOT_AUTHORIZED_FOR_FINANCIAL_PROCESSING',
        `Milestone is not authorized for financial processing. Current financial status: ${milestone.financialStatus}`
      );
    }

    // Verify no unresolved blocking NCRs exist on the milestone
    const ncrs = await ncrRepository.listNCRsByMilestone(data.milestoneId);
    const openNcrs = ncrs.filter((ncr) => ncr.status !== 'CLOSED');
    if (openNcrs.length > 0) {
      throw new GovernanceError(
        400,
        'BLOCKING_NCR_PRESENT',
        `Cannot create financial instruction: milestone has ${openNcrs.length} unresolved Non-Conformance Report(s).`
      );
    }

    // Find contractor appointment on project
    const appointments = await projectRepository.listAppointmentsByProject(projectId);
    const contractorAppointment = appointments.find(
      (a) => a.role === 'GENERAL_CONTRACTOR' && a.appointmentStatus === 'ACTIVE'
    );
    const contractorUserId = contractorAppointment?.userId || milestone.assignedContractorId || 'usr-demo-contractor';
    const contractorName = contractorAppointment?.userName || 'Marcus Vance';

    const { fullName } = await this.getActorDetails(userId);
    const instructionNumber = await financialInstructionRepository.getNextInstructionNumber(projectId);
    const now = new Date().toISOString();
    const instructionId = `fin-inst-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`;

    const amountUSD = data.amountUSD !== undefined ? data.amountUSD : (milestone.costAllocationUSD || 0);

    const instruction: FinancialInstruction = {
      id: instructionId,
      instructionNumber,
      projectId,
      milestoneId: data.milestoneId,
      ownerDecisionId: milestone.latestOwnerDecisionId || `dec-${data.milestoneId}`,
      amountUSD,
      currency: 'USD',
      contractorUserId,
      contractorName,
      status: 'AUTHORIZED_FOR_FINANCIAL_PROCESSING',
      idempotencyKey: data.idempotencyKey,
      providerId: this.providerAdapter.providerId,
      providerStatus: 'REQUEST_CREATED',
      executionNotes: data.executionNotes,
      createdByUserId: userId,
      createdByRole: role,
      createdByName: fullName,
      createdAt: now,
      updatedAt: now,
    };

    await financialInstructionRepository.createInstruction(instruction);

    await auditEventRepository.record({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      actorUserId: userId,
      projectId,
      action: 'FINANCIAL_INSTRUCTION_CREATED',
      entityType: 'FINANCIAL_INSTRUCTION',
      entityId: instructionId,
      timestamp: now,
      metadata: {
        instructionNumber,
        milestoneId: data.milestoneId,
        amountUSD,
        idempotencyKey: data.idempotencyKey,
        provider: this.providerAdapter.providerId,
      },
    });

    return instruction;
  }

  /**
   * Submits a financial instruction to the external financial provider (e.g. BMONI).
   *
   * Rules:
   * - Caller must be OWNER_CLIENT.
   * - Contractor / Auditor cannot trigger processing.
   * - Truthfully handles provider availability: if BMONI is not connected,
   *   transitions status to FAILED or remains un-settled. Strictly does NOT simulate settlement.
   */
  async processFinancialInstruction(
    projectId: string,
    instructionId: string,
    userId: string,
    options?: { simulatedMode?: boolean; idempotencyKey?: string }
  ): Promise<FinancialInstruction> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw new GovernanceError(403, 'INSUFFICIENT_PROJECT_AUTHORITY', 'Forbidden: You do not have authority on this project.');
    }

    if (role === 'GENERAL_CONTRACTOR') {
      throw new GovernanceError(403, 'CONTRACTOR_SELF_AUTHORIZATION_FORBIDDEN', 'Forbidden: General Contractor cannot trigger financial provider execution.');
    }

    if (role !== 'OWNER_CLIENT') {
      throw new GovernanceError(403, 'INSUFFICIENT_ROLE_AUTHORITY', 'Forbidden: Only Owner Client may trigger financial provider processing.');
    }

    const instruction = await financialInstructionRepository.getInstructionById(instructionId);
    if (!instruction || instruction.projectId !== projectId) {
      throw new GovernanceError(404, 'FINANCIAL_INSTRUCTION_NOT_FOUND', 'Financial instruction not found.');
    }

    if (instruction.status === 'SETTLED') {
      throw new GovernanceError(400, 'INSTRUCTION_ALREADY_SETTLED', 'Financial instruction is already settled.');
    }

    if (instruction.status === 'PROCESSING') {
      return instruction; // Idempotent handling for in-flight processing
    }

    const now = new Date().toISOString();

    // Mark as PROCESSING locally before contacting provider
    await financialInstructionRepository.updateInstruction(instructionId, {
      status: 'PROCESSING',
      processedAt: now,
    });

    await auditEventRepository.record({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      actorUserId: userId,
      projectId,
      action: 'FINANCIAL_PROCESSING_REQUESTED',
      entityType: 'FINANCIAL_INSTRUCTION',
      entityId: instructionId,
      timestamp: now,
      metadata: {
        instructionNumber: instruction.instructionNumber,
        provider: this.providerAdapter.providerId,
        amountUSD: instruction.amountUSD,
      },
    });

    // Submit to provider boundary (or simulated test mode)
    let providerResult: ProviderSubmissionResponse;
    if (options?.simulatedMode) {
      providerResult = {
        success: true,
        status: 'ACCEPTED',
        providerStatus: 'ACCEPTED',
        providerReference: `BMONI-SIM-REF-${instruction.id.substring(0, 8)}`,
        providerTransactionId: `BMONI-TX-${Date.now()}`,
        rawResponse: { simulated: true, acceptedAt: now },
      };
    } else {
      providerResult = await this.providerAdapter.submitInstruction({
        instructionId: instruction.id,
        instructionNumber: instruction.instructionNumber,
        projectId: instruction.projectId,
        milestoneId: instruction.milestoneId,
        amountUSD: instruction.amountUSD,
        currency: instruction.currency,
        recipientUserId: instruction.contractorUserId,
        recipientName: instruction.contractorName,
        idempotencyKey: options?.idempotencyKey || instruction.idempotencyKey,
        governanceReference: instruction.ownerDecisionId,
      });
    }

    if (providerResult.status === 'UNAVAILABLE' || !providerResult.success) {
      // Truthful boundary: BMONI is unavailable / not connected.
      const updated = await financialInstructionRepository.updateInstruction(instructionId, {
        status: 'FAILED',
        providerStatus: providerResult.providerStatus || 'NOT_CONNECTED',
        failureReason: providerResult.errorMessage || 'Provider is unavailable or not connected.',
        providerRawResponse: providerResult.rawResponse,
      });

      await auditEventRepository.record({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        actorUserId: userId,
        projectId,
        action: 'FINANCIAL_PROVIDER_UNAVAILABLE',
        entityType: 'FINANCIAL_INSTRUCTION',
        entityId: instructionId,
        timestamp: new Date().toISOString(),
        metadata: {
          instructionNumber: instruction.instructionNumber,
          provider: this.providerAdapter.providerId,
          error: providerResult.errorMessage,
        },
      });

      await auditEventRepository.record({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        actorUserId: userId,
        projectId,
        action: 'FINANCIAL_PROCESSING_FAILED',
        entityType: 'FINANCIAL_INSTRUCTION',
        entityId: instructionId,
        timestamp: new Date().toISOString(),
        metadata: {
          instructionNumber: instruction.instructionNumber,
          reason: providerResult.errorMessage,
        },
      });

      return updated!;
    }

    if (providerResult.status === 'REJECTED') {
      const updated = await financialInstructionRepository.updateInstruction(instructionId, {
        status: 'PROVIDER_REJECTED',
        providerStatus: 'REJECTED',
        failureReason: providerResult.errorMessage || 'Provider rejected disbursement request.',
        providerRawResponse: providerResult.rawResponse,
      });

      await auditEventRepository.record({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        actorUserId: userId,
        projectId,
        action: 'FINANCIAL_PROVIDER_REJECTED',
        entityType: 'FINANCIAL_INSTRUCTION',
        entityId: instructionId,
        timestamp: new Date().toISOString(),
        metadata: {
          instructionNumber: instruction.instructionNumber,
          provider: this.providerAdapter.providerId,
          error: providerResult.errorMessage,
        },
      });

      return updated!;
    }

    // Provider accepted: PROVIDER_ACCEPTED (Crucial: PROVIDER_ACCEPTED ≠ SETTLED)
    const updated = await financialInstructionRepository.updateInstruction(instructionId, {
      status: 'PROVIDER_ACCEPTED',
      providerStatus: 'ACCEPTED',
      providerReference: providerResult.providerReference,
      providerTransactionId: providerResult.providerTransactionId,
      providerRawResponse: providerResult.rawResponse,
    });

    await auditEventRepository.record({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      actorUserId: userId,
      projectId,
      action: 'FINANCIAL_PROVIDER_ACCEPTED',
      entityType: 'FINANCIAL_INSTRUCTION',
      entityId: instructionId,
      timestamp: new Date().toISOString(),
      metadata: {
        instructionNumber: instruction.instructionNumber,
        provider: this.providerAdapter.providerId,
        providerReference: providerResult.providerReference,
        note: 'Provider accepted instruction. Settlement pending external execution evidence.',
      },
    });

    return updated!;
  }

  /**
   * Alias for processing an instruction with the provider.
   */
  async processInstructionWithProvider(
    projectId: string,
    instructionId: string,
    userId: string,
    idempotencyKey?: string,
    simulatedMode?: boolean
  ): Promise<FinancialInstruction> {
    return this.processFinancialInstruction(projectId, instructionId, userId, { simulatedMode, idempotencyKey });
  }

  /**
   * Handles authenticated provider webhook events (e.g. BMONI disbursement callbacks).
   *
   * Verifies authenticity: unverified events are rejected.
   * State transitions require authoritative evidence.
   */
  async handleProviderWebhook(
    payload: any,
    signatureOrHeaders?: string | Record<string, any>
  ): Promise<{ success: boolean; instruction?: FinancialInstruction; message: string; processedStatus?: string }> {
    const headers: Record<string, any> =
      typeof signatureOrHeaders === 'string'
        ? { 'x-bmoni-signature': signatureOrHeaders }
        : signatureOrHeaders || {};

    const verification = await this.providerAdapter.verifyWebhook(payload, headers);
    if (!verification.verified || !verification.event) {
      return {
        success: false,
        processedStatus: 'REJECTED_UNVERIFIABLE',
        message: verification.error || 'Provider webhook verification failed. Unverified events rejected.',
      };
    }

    const event = verification.event;
    if (!event.instructionId) {
      return { success: false, processedStatus: 'INVALID_EVENT', message: 'Webhook event has no associated instructionId.' };
    }

    const instruction = await financialInstructionRepository.getInstructionById(event.instructionId);
    if (!instruction) {
      return { success: false, processedStatus: 'NOT_FOUND', message: `Instruction ${event.instructionId} not found.` };
    }

    const now = new Date().toISOString();

    // Idempotent webhook handling: if already settled and event is settled, do nothing
    if (instruction.status === 'SETTLED' && event.status === 'SETTLED') {
      return { success: true, instruction, message: 'Instruction already settled (idempotent callback).', processedStatus: 'SETTLED' };
    }

    if (event.status === 'SETTLED') {
      const settlementRecord: SettlementRecord = {
        settlementId: `stl-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        settledAmountUSD: event.amountUSD || instruction.amountUSD,
        settledCurrency: event.currency || 'USD',
        settledAt: event.settledAt || now,
        providerTransactionId: event.providerTransactionId,
        providerReference: event.providerReference || event.providerTransactionId || instruction.providerReference || 'BMONI-REF',
        verifiedByProviderEvidence: true,
        settlementNotes: event.notes || 'Verified by BMONI settlement callback evidence.',
        rawProviderEvidence: event.rawPayload,
      };

      const updated = await financialInstructionRepository.updateInstruction(instruction.id, {
        status: 'SETTLED',
        providerStatus: 'SETTLED',
        settledAt: event.settledAt || now,
        providerTransactionId: event.providerTransactionId,
        settlementRecord,
      });

      // Update milestone financial status to PAID/SETTLED
      await milestoneRepository.updateMilestone(instruction.milestoneId, {
        financialStatus: 'PAID',
      });

      await auditEventRepository.record({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        actorUserId: 'system-bmoni-provider',
        projectId: instruction.projectId,
        action: 'SETTLEMENT_CONFIRMED',
        entityType: 'FINANCIAL_INSTRUCTION',
        entityId: instruction.id,
        timestamp: now,
        metadata: {
          instructionNumber: instruction.instructionNumber,
          settlementId: settlementRecord.settlementId,
          amountUSD: settlementRecord.settledAmountUSD,
          providerReference: settlementRecord.providerReference,
        },
      });

      return { success: true, instruction: updated!, message: 'Settlement confirmed via provider evidence.', processedStatus: 'SETTLED' };
    }

    if (event.status === 'PAYMENT_CONFIRMED') {
      const updated = await financialInstructionRepository.updateInstruction(instruction.id, {
        status: 'PAYMENT_CONFIRMED',
        providerStatus: 'CONFIRMED',
      });

      await auditEventRepository.record({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        actorUserId: 'system-bmoni-provider',
        projectId: instruction.projectId,
        action: 'PAYMENT_CONFIRMATION_RECEIVED',
        entityType: 'FINANCIAL_INSTRUCTION',
        entityId: instruction.id,
        timestamp: now,
        metadata: {
          instructionNumber: instruction.instructionNumber,
          providerReference: event.providerReference,
        },
      });

      return { success: true, instruction: updated!, message: 'Payment confirmed; settlement pending.', processedStatus: 'PAYMENT_CONFIRMED' };
    }

    if (event.status === 'FAILED' || event.status === 'REJECTED') {
      const updated = await financialInstructionRepository.updateInstruction(instruction.id, {
        status: 'FAILED',
        providerStatus: event.status,
        failureReason: event.notes || 'Provider reported payment failure.',
      });

      await auditEventRepository.record({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        actorUserId: 'system-bmoni-provider',
        projectId: instruction.projectId,
        action: 'FINANCIAL_PROCESSING_FAILED',
        entityType: 'FINANCIAL_INSTRUCTION',
        entityId: instruction.id,
        timestamp: now,
        metadata: {
          instructionNumber: instruction.instructionNumber,
          reason: event.notes,
        },
      });

      return { success: true, instruction: updated!, message: 'Payment failure recorded.', processedStatus: 'FAILED' };
    }

    return { success: true, instruction, message: `Processed provider event status: ${event.status}`, processedStatus: event.status };
  }

  /**
   * Reconciles a financial instruction against the external provider.
   */
  async reconcileInstruction(
    projectId: string,
    instructionId: string,
    userId: string,
    data?: { forceDivergenceCheck?: boolean; reason?: string }
  ): Promise<FinancialInstruction> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw new GovernanceError(403, 'INSUFFICIENT_PROJECT_AUTHORITY', 'Forbidden: You do not have authority on this project.');
    }

    if (role !== 'OWNER_CLIENT' && role !== 'SENIOR_PROJECT_DIRECTOR') {
      throw new GovernanceError(403, 'INSUFFICIENT_ROLE_AUTHORITY', 'Forbidden: Only Owner Client or Senior Project Director may reconcile financial instructions.');
    }

    const instruction = await financialInstructionRepository.getInstructionById(instructionId);
    if (!instruction || instruction.projectId !== projectId) {
      throw new GovernanceError(404, 'FINANCIAL_INSTRUCTION_NOT_FOUND', 'Financial instruction not found.');
    }

    const reconciliation = await this.providerAdapter.reconcile(instruction);
    const now = new Date().toISOString();

    if (!reconciliation.isConsistent || data?.forceDivergenceCheck) {
      const record: ReconciliationRecord = {
        reconciliationId: `rec-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        status: 'PENDING',
        reason: data?.reason || 'Provider execution status divergence detected during reconciliation.',
        detectedDiscrepancy: reconciliation.discrepancy || 'Local status does not match remote provider confirmation.',
        localStatus: instruction.status,
        providerStatus: reconciliation.providerStatus,
        createdAt: now,
      };

      const updated = await financialInstructionRepository.updateInstruction(instructionId, {
        status: 'REQUIRES_RECONCILIATION',
        reconciliationRecord: record,
      });

      await auditEventRepository.record({
        id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        actorUserId: userId,
        projectId,
        action: 'FINANCIAL_RECONCILIATION_REQUIRED',
        entityType: 'FINANCIAL_INSTRUCTION',
        entityId: instructionId,
        timestamp: now,
        metadata: {
          instructionNumber: instruction.instructionNumber,
          reconciliationId: record.reconciliationId,
          discrepancy: record.detectedDiscrepancy,
        },
      });

      return updated!;
    }

    return instruction;
  }

  /**
   * Reconciles all financial instructions for a project.
   */
  async reconcileProjectFinancials(
    projectId: string,
    userId: string
  ): Promise<Array<{ instructionId: string; instructionNumber: string; requiresAttention: boolean; reason?: string }>> {
    const instructions = await this.listInstructions(projectId, userId);
    const results: Array<{ instructionId: string; instructionNumber: string; requiresAttention: boolean; reason?: string }> = [];

    for (const inst of instructions) {
      if (inst.status === 'SETTLED' || inst.status === 'CANCELLED') {
        continue;
      }
      const isStaleProcessing =
        inst.status === 'PROCESSING' &&
        inst.processedAt &&
        Date.now() - new Date(inst.processedAt).getTime() > 24 * 3600 * 1000;

      if (isStaleProcessing) {
        await this.reconcileInstruction(projectId, inst.id, userId, {
          forceDivergenceCheck: true,
          reason: 'Processing timeout: instruction has been in PROCESSING state for >24 hours.',
        });
        results.push({
          instructionId: inst.id,
          instructionNumber: inst.instructionNumber,
          requiresAttention: true,
          reason: 'Instruction in PROCESSING state for >24 hours without provider confirmation.',
        });
      } else {
        const reconciled = await this.reconcileInstruction(projectId, inst.id, userId);
        if (reconciled.status === 'REQUIRES_RECONCILIATION') {
          results.push({
            instructionId: inst.id,
            instructionNumber: inst.instructionNumber,
            requiresAttention: true,
            reason: reconciled.reconciliationRecord?.reason || 'Status mismatch detected.',
          });
        }
      }
    }

    return results;
  }

  /**
   * Formally resolves a reconciliation issue with governance rationale.
   */
  async resolveReconciliation(
    projectId: string,
    instructionId: string,
    userId: string,
    dataOrNotes: string | { resolutionNotes: string; targetStatus: FinancialExecutionStatus },
    resolutionAction?: string
  ): Promise<FinancialInstruction> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw new GovernanceError(403, 'INSUFFICIENT_PROJECT_AUTHORITY', 'Forbidden: You do not have authority on this project.');
    }

    if (role !== 'OWNER_CLIENT' && role !== 'SENIOR_PROJECT_DIRECTOR') {
      throw new GovernanceError(403, 'INSUFFICIENT_ROLE_AUTHORITY', 'Forbidden: Only Owner Client or Senior Project Director may resolve financial reconciliation.');
    }

    const data: { resolutionNotes: string; targetStatus: FinancialExecutionStatus } =
      typeof dataOrNotes === 'string'
        ? {
            resolutionNotes: dataOrNotes,
            targetStatus: (resolutionAction === 'MATCHED' ? 'PROVIDER_ACCEPTED' : 'REQUIRES_RECONCILIATION') as FinancialExecutionStatus,
          }
        : dataOrNotes;

    if (!data.resolutionNotes || !data.targetStatus) {
      throw new GovernanceError(400, 'VALIDATION_ERROR', 'resolutionNotes and targetStatus are mandatory.');
    }

    const instruction = await financialInstructionRepository.getInstructionById(instructionId);
    if (!instruction || instruction.projectId !== projectId) {
      throw new GovernanceError(404, 'FINANCIAL_INSTRUCTION_NOT_FOUND', 'Financial instruction not found.');
    }

    const now = new Date().toISOString();
    const updatedRecord: ReconciliationRecord = {
      reconciliationId: instruction.reconciliationRecord?.reconciliationId || `rec-${Date.now()}`,
      status: 'RESOLVED',
      reason: instruction.reconciliationRecord?.reason || 'Reconciliation resolved by authorized governance role.',
      detectedDiscrepancy: instruction.reconciliationRecord?.detectedDiscrepancy || 'Resolved.',
      localStatus: data.targetStatus,
      providerStatus: instruction.providerStatus,
      resolutionNotes: data.resolutionNotes,
      resolvedByUserId: userId,
      resolvedAt: now,
      createdAt: instruction.reconciliationRecord?.createdAt || now,
    };

    const updated = await financialInstructionRepository.updateInstruction(instructionId, {
      status: data.targetStatus,
      reconciliationRecord: updatedRecord,
    });

    await auditEventRepository.record({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      actorUserId: userId,
      projectId,
      action: 'FINANCIAL_RECONCILIATION_RESOLVED',
      entityType: 'FINANCIAL_INSTRUCTION',
      entityId: instructionId,
      timestamp: now,
      metadata: {
        instructionNumber: instruction.instructionNumber,
        targetStatus: data.targetStatus,
        notes: data.resolutionNotes,
      },
    });

    return updated!;
  }

  /**
   * Lists financial instructions for a project with role-scoped visibility.
   *
   * Rules:
   * - GENERAL_CONTRACTOR can only view instructions where they are the recipient.
   * - OWNER_CLIENT and SENIOR_PROJECT_DIRECTOR can view all instructions on the project.
   * - External non-project user receives HTTP 403.
   */
  async listInstructions(projectId: string, userId: string): Promise<FinancialInstruction[]> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw new GovernanceError(403, 'INSUFFICIENT_PROJECT_AUTHORITY', 'Forbidden: You do not have authority to view project financial records.');
    }

    const instructions = await financialInstructionRepository.listInstructionsByProject(projectId);

    if (role === 'GENERAL_CONTRACTOR') {
      return instructions.filter((inst) => inst.contractorUserId === userId);
    }

    return instructions;
  }

  /**
   * Alias for project financial instructions.
   */
  async getProjectFinancialInstructions(projectId: string, userId: string): Promise<FinancialInstruction[]> {
    return this.listInstructions(projectId, userId);
  }

  /**
   * Gets a specific financial instruction with role-scoped authority.
   */
  async getInstruction(projectId: string, instructionId: string, userId: string): Promise<FinancialInstruction> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw {
        statusCode: 403,
        error: 'Forbidden: You do not have authority on this project.',
        code: 'INSUFFICIENT_PROJECT_AUTHORITY',
      };
    }

    const instruction = await financialInstructionRepository.getInstructionById(instructionId);
    if (!instruction || instruction.projectId !== projectId) {
      throw {
        statusCode: 404,
        error: 'Financial instruction not found.',
        code: 'FINANCIAL_INSTRUCTION_NOT_FOUND',
      };
    }

    if (role === 'GENERAL_CONTRACTOR' && instruction.contractorUserId !== userId) {
      throw {
        statusCode: 403,
        error: 'Forbidden: You do not have authority to view this financial instruction.',
        code: 'INSUFFICIENT_PROJECT_AUTHORITY',
      };
    }

    return instruction;
  }

  /**
   * AI Financial Explainer (Sprint 05B AI Boundary)
   * AI may explain:
   * - why a milestone is or is not financially eligible
   * - what governance blockers remain
   * - what provider status has been persisted
   * - what requires human attention
   * AI must never:
   * - authorize payment
   * - trigger settlement autonomously
   * - invent provider confirmation
   * - invent PAID, SETTLED, or FUNDS_RELEASED
   * Runtime model: gemini-3.7-flash
   */
  async explainFinancialStatusWithAI(
    projectId: string,
    milestoneId: string,
    userId: string
  ): Promise<{
    explanation: string;
    isEligibleForFinancialProcessing: boolean;
    blockers: string[];
    governanceStatus: string;
    providerStatus: string;
    isAiAssisted: boolean;
    disclaimer: string;
  }> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw {
        statusCode: 403,
        error: 'Forbidden: You do not have authority on this project.',
        code: 'INSUFFICIENT_PROJECT_AUTHORITY',
      };
    }

    const milestone = await milestoneRepository.getMilestoneById(milestoneId);
    if (!milestone || milestone.projectId !== projectId) {
      throw {
        statusCode: 404,
        error: 'Milestone not found.',
        code: 'MILESTONE_NOT_FOUND',
      };
    }

    const ncrs = await ncrRepository.listNCRsByMilestone(milestoneId);
    const openNcrs = ncrs.filter((n) => n.status !== 'CLOSED');

    const instruction = await financialInstructionRepository.getInstructionByMilestoneId(milestoneId);
    const providerConnection = this.providerAdapter.getConnectionStatus();

    const blockers: string[] = [];
    if (milestone.financialStatus !== 'AUTHORIZED_FOR_FINANCIAL_PROCESSING') {
      blockers.push(`Milestone financial status is '${milestone.financialStatus}', not 'AUTHORIZED_FOR_FINANCIAL_PROCESSING'. Requires complete contractor submission, technical review, QA/QC clearance, and Owner client authorization.`);
    }
    if (openNcrs.length > 0) {
      blockers.push(`${openNcrs.length} unresolved Non-Conformance Report(s) must be closed prior to financial execution.`);
    }

    const isEligible = blockers.length === 0;
    const governanceStatus = milestone.financialStatus;
    const currentProviderStatus = instruction ? instruction.providerStatus : providerConnection.status;

    let explanation = isEligible
      ? `Milestone '${milestone.title}' is fully eligible and AUTHORIZED_FOR_FINANCIAL_PROCESSING. All technical reviews, QA/QC audits, and Owner approvals are satisfied with zero blocking NCRs. ` +
        (instruction
          ? `A financial instruction (${instruction.instructionNumber}) has been created with status '${instruction.status}' and provider status '${instruction.providerStatus}'.`
          : `An authorized financial instruction can now be dispatched to the external provider.`)
      : `Milestone '${milestone.title}' is NOT currently eligible for financial execution. Governance blockers: ${blockers.join('; ')}.`;

    let isAiAssisted = false;
    const apiKey = process.env.GEMINI_API_KEY;

    if (apiKey) {
      try {
        const ai = new GoogleGenAI({
          apiKey,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } },
        });

        const prompt = `You are the Structura Financial Governance AI Advisor.
Explain the financial eligibility and execution status for the following construction milestone:
- Project ID: ${projectId}
- Milestone: ${milestone.title} (ID: ${milestone.id})
- Cost Allocation: $${(milestone.costAllocationUSD || 0).toLocaleString()} USD
- Governed Financial Status: ${governanceStatus}
- Open Non-Conformance Reports (NCRs): ${openNcrs.length}
- Financial Instruction Status: ${instruction ? instruction.status : 'None created'}
- Financial Provider Connection: ${providerConnection.status} (${providerConnection.provider})
- Governance Blockers: ${JSON.stringify(blockers)}

STRICT GUARDRAILS:
1. You may only explain why the milestone is or is not eligible and what human governance actions are needed.
2. You CANNOT authorize payment, release funds, or trigger settlement.
3. AUTHORIZED_FOR_FINANCIAL_PROCESSING ≠ PAID ≠ SETTLED.
4. Keep the explanation concise, professional, and clear.`;

        const response = await ai.models.generateContent({
          model: 'gemini-3.7-flash',
          contents: prompt,
        });

        if (response.text) {
          explanation = response.text.trim();
          isAiAssisted = true;
        }
      } catch (e) {
        console.warn('[FinancialExecutionService] AI synthesis failed, using deterministic explanation:', e);
      }
    }

    return {
      explanation,
      isEligibleForFinancialProcessing: isEligible,
      blockers,
      governanceStatus,
      providerStatus: currentProviderStatus,
      isAiAssisted,
      disclaimer: 'AI is an explanatory advisor only. AI CANNOT authorize payments, release funds, or trigger settlement. All financial execution requires verified provider confirmation and governed human authorization.',
    };
  }
}

export const financialExecutionService = new FinancialExecutionService();
