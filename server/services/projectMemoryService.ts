import { projectRepository, ProjectRole } from '../repositories/projectRepository';
import { organizationRepository } from '../repositories/organizationRepository';
import { milestoneRepository } from '../repositories/milestoneRepository';
import { submissionRepository } from '../repositories/submissionRepository';
import { technicalReviewRepository } from '../repositories/technicalReviewRepository';
import { qaqcRepository } from '../repositories/qaqcRepository';
import { ncrRepository } from '../repositories/ncrRepository';
import { aiInspectionRepository } from '../repositories/aiInspectionRepository';
import { ownerDecisionRepository } from '../repositories/ownerDecisionRepository';
import { projectDecisionRepository } from '../repositories/projectDecisionRepository';
import { rfiRepository } from '../repositories/rfiRepository';
import { directLineRepository } from '../repositories/directLineRepository';
import { evidenceRepository } from '../repositories/evidenceRepository';
import { auditEventRepository } from '../repositories/auditEventRepository';
import { financialInstructionRepository } from '../repositories/financialInstructionRepository';
import { GovernanceError } from './governanceError';
import {
  ProjectMemoryEntry,
  ProjectMemoryCategory,
  ProjectMemorySourceType,
} from '../../src/types';

export interface ProjectMemoryQueryParams {
  category?: ProjectMemoryCategory;
  sourceType?: ProjectMemorySourceType;
  milestoneId?: string;
  actorRole?: string;
  search?: string;
  order?: 'asc' | 'desc';
  limit?: number;
}

export class ProjectMemoryService {
  /**
   * Resolves the authoritative role of a user on a given project.
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
   * Aggregates traceable Project Memory from all underlying canonical records.
   */
  async getProjectMemory(
    projectId: string,
    userId: string,
    query: ProjectMemoryQueryParams = {}
  ): Promise<{ entries: ProjectMemoryEntry[]; totalCount: number }> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw new GovernanceError(
        403,
        'INSUFFICIENT_PROJECT_AUTHORITY',
        'Forbidden: You do not have an active appointment or authority to access project memory.'
      );
    }

    // Parallel fetch from canonical records
    const [
      milestones,
      submissions,
      technicalReviews,
      inspections,
      ncrs,
      aiAnalyses,
      ownerDecisions,
      projectDecisions,
      rfis,
      directLineMessages,
      evidenceList,
      auditEvents,
      financialInstructions,
    ] = await Promise.all([
      milestoneRepository.listMilestonesByProject(projectId).catch(() => []),
      submissionRepository.listSubmissionsByProject(projectId).catch(() => []),
      technicalReviewRepository.listReviewsByProject(projectId).catch(() => []),
      qaqcRepository.listInspectionsByProject(projectId).catch(() => []),
      ncrRepository.listNCRsByProject(projectId).catch(() => []),
      aiInspectionRepository.listAnalysesByProject(projectId).catch(() => []),
      ownerDecisionRepository.listDecisionsByProject(projectId).catch(() => []),
      projectDecisionRepository.listDecisionsByProject(projectId).catch(() => []),
      rfiRepository.listRFIsByProject(projectId).catch(() => []),
      Promise.all([
        directLineRepository.getMessagesByChannel(projectId, 'OWNER_DIRECTOR').catch(() => []),
        directLineRepository.getMessagesByChannel(projectId, 'OWNER_QAQC').catch(() => []),
        directLineRepository.getMessagesByChannel(projectId, 'DIRECTOR_CONTRACTOR').catch(() => []),
      ]).then(([m1, m2, m3]) => [...m1, ...m2, ...m3]).catch(() => []),
      evidenceRepository.listEvidenceByProject(projectId).catch(() => []),
      auditEventRepository.listByProject(projectId).catch(() => []),
      financialInstructionRepository.listInstructionsByProject(projectId).catch(() => []),
    ]);

    const entries: ProjectMemoryEntry[] = [];

    // 1. Milestones
    for (const m of milestones) {
      entries.push({
        id: `mem-ms-${m.id}`,
        projectId,
        timestamp: m.createdAt,
        sourceType: 'MILESTONE',
        sourceId: m.id,
        eventType: 'MILESTONE_DEFINED',
        category: 'GOVERNANCE',
        title: `Milestone: ${m.title}`,
        summary: `${m.discipline} milestone created in sequence ${m.sequence}. Budget allocation: $${m.costAllocationUSD.toLocaleString()}. Status: ${m.status}`,
        actorUserId: 'SYSTEM',
        actorRole: 'OWNER_CLIENT',
        actorName: 'Project Governance',
        resultingState: m.status,
        relatedMilestoneId: m.id,
        milestoneId: m.id,
        metadata: {
          costAllocationUSD: m.costAllocationUSD,
          status: m.status,
          discipline: m.discipline,
        },
      });
    }

    // 2. Contractor Submissions
    for (const s of submissions) {
      entries.push({
        id: `mem-sub-${s.id}`,
        projectId,
        timestamp: s.submittedAt || s.createdAt,
        sourceType: 'SUBMISSION',
        sourceId: s.id,
        eventType: s.status === 'SUBMITTED' ? 'CONTRACTOR_PACKAGE_SUBMITTED' : 'SUBMISSION_DRAFT_CREATED',
        category: 'TECHNICAL',
        title: `Submission: ${s.title}`,
        summary: `Revision ${s.revisionNumber} submitted with ${s.evidenceIds.length} evidence attachment(s). Status: ${s.status}`,
        actorUserId: s.submittedByUserId || s.contractorUserId,
        actorRole: 'GENERAL_CONTRACTOR',
        actorName: s.contractorName || 'General Contractor',
        resultingState: s.status,
        relatedMilestoneId: s.milestoneId,
        milestoneId: s.milestoneId,
        metadata: {
          revisionNumber: s.revisionNumber,
          evidenceCount: s.evidenceIds.length,
          status: s.status,
        },
      });
    }

    // 3. Technical Reviews
    for (const tr of technicalReviews) {
      entries.push({
        id: `mem-tr-${tr.id}`,
        projectId,
        timestamp: tr.reviewedAt || tr.createdAt,
        sourceType: 'TECHNICAL_REVIEW',
        sourceId: tr.id,
        eventType: `TECHNICAL_REVIEW_${tr.decision}`,
        category: 'TECHNICAL',
        title: `Technical Review: ${tr.decision.replace(/_/g, ' ')}`,
        summary: `${tr.reviewerName} (${tr.reviewerRole}) decided ${tr.decision}. Notes: ${(tr.reviewNotes || '').slice(0, 150)}...`,
        actorUserId: tr.reviewerUserId,
        actorRole: tr.reviewerRole,
        actorName: tr.reviewerName,
        resultingState: tr.decision,
        relatedMilestoneId: tr.milestoneId,
        milestoneId: tr.milestoneId,
        metadata: {
          decision: tr.decision,
          notes: tr.reviewNotes,
        },
      });
    }

    // 4. QA/QC Inspections
    for (const insp of inspections) {
      entries.push({
        id: `mem-insp-${insp.id}`,
        projectId,
        timestamp: insp.decidedAt || insp.startedAt,
        sourceType: 'QA_QC_INSPECTION',
        sourceId: insp.id,
        eventType: `QA_QC_INSPECTION_${insp.status}`,
        category: 'QUALITY',
        title: `QA/QC Inspection: ${insp.inspectionType}`,
        summary: `${insp.inspectorName} (${insp.inspectorRole}) recorded status ${insp.status}. Notes: ${(insp.inspectionNotes || '').slice(0, 150)}...`,
        actorUserId: insp.inspectorUserId,
        actorRole: insp.inspectorRole,
        actorName: insp.inspectorName,
        resultingState: insp.status,
        relatedMilestoneId: insp.milestoneId,
        milestoneId: insp.milestoneId,
        metadata: {
          inspectionType: insp.inspectionType,
          status: insp.status,
          decision: insp.decision,
        },
      });
    }

    // 5. Non-Conformance Reports (NCR)
    for (const ncr of ncrs) {
      entries.push({
        id: `mem-ncr-${ncr.id}`,
        projectId,
        timestamp: ncr.createdAt,
        sourceType: 'NCR',
        sourceId: ncr.id,
        eventType: `NCR_${ncr.status}`,
        category: 'QUALITY',
        title: `NCR (${ncr.severity}): ${ncr.title}`,
        summary: `Raised by ${ncr.raisedByName}. Requirement: ${ncr.requirementReference}. Observed: ${(ncr.observedCondition || '').slice(0, 120)}... Status: ${ncr.status}`,
        actorUserId: ncr.raisedByUserId,
        actorRole: ncr.raisedByRole,
        actorName: ncr.raisedByName,
        resultingState: ncr.status,
        relatedMilestoneId: ncr.milestoneId,
        milestoneId: ncr.milestoneId,
        metadata: {
          severity: ncr.severity,
          requirementReference: ncr.requirementReference,
          status: ncr.status,
        },
      });

      if (ncr.closedAt) {
        entries.push({
          id: `mem-ncr-close-${ncr.id}`,
          projectId,
          timestamp: ncr.closedAt,
          sourceType: 'NCR',
          sourceId: ncr.id,
          eventType: 'NCR_CLOSED',
          category: 'QUALITY',
          title: `NCR Closed: ${ncr.title}`,
          summary: `Closed by ${ncr.closedByName}. Reinspection notes: ${ncr.reinspectionNotes || 'Completed and compliant.'}`,
          actorUserId: ncr.closedByUserId || ncr.raisedByUserId,
          actorRole: ncr.closedByRole || 'STRUCTURAL_QA_QC_AUDITOR',
          actorName: ncr.closedByName || 'Structural QA/QC Auditor',
          resultingState: 'CLOSED',
          relatedMilestoneId: ncr.milestoneId,
          milestoneId: ncr.milestoneId,
        });
      }
    }

    // 6. AI Inspection Analyses
    for (const ai of aiAnalyses) {
      entries.push({
        id: `mem-ai-${ai.id}`,
        projectId,
        timestamp: ai.createdAt,
        sourceType: 'AI_INSPECTION',
        sourceId: ai.id,
        eventType: `AI_INSPECTION_${ai.status}`,
        category: 'QUALITY',
        title: `AI Visual Inspection Analysis: ${ai.complianceStatus}`,
        summary: `Synthesized using ${ai.aiModel}. Confidence: ${ai.confidenceScore}%. Findings: ${(ai.findingsSummary || '').slice(0, 150)}...`,
        actorUserId: ai.requestedByUserId,
        actorRole: ai.requestedByRole,
        actorName: 'Structura AI Auditor',
        resultingState: ai.complianceStatus,
        relatedMilestoneId: ai.milestoneId,
        milestoneId: ai.milestoneId,
        metadata: {
          aiModel: ai.aiModel,
          confidenceScore: ai.confidenceScore,
          complianceStatus: ai.complianceStatus,
        },
      });
    }

    // 7. Owner Milestone Decisions
    for (const od of ownerDecisions) {
      entries.push({
        id: `mem-od-${od.id}`,
        projectId,
        timestamp: od.decidedAt || od.createdAt,
        sourceType: 'OWNER_DECISION',
        sourceId: od.id,
        eventType: `OWNER_DECISION_${od.decision}`,
        category: 'GOVERNANCE',
        title: `Owner Governance Decision: ${od.decision}`,
        summary: `${od.decidedByName} (${od.decidedByRole}) decided ${od.decision}. Financial status: ${od.financialStatus}. Authorized: ${od.financialAuthorized}`,
        actorUserId: od.decidedByUserId,
        actorRole: od.decidedByRole,
        actorName: od.decidedByName,
        resultingState: od.decision,
        relatedMilestoneId: od.milestoneId,
        milestoneId: od.milestoneId,
        metadata: {
          decision: od.decision,
          financialStatus: od.financialStatus,
          financialAuthorized: od.financialAuthorized,
        },
      });
    }

    // 8. Project Decisions (Sprint 04D)
    for (const pd of projectDecisions) {
      const msRef = pd.relatedRecordRefs?.find(r => r.entityType === 'MILESTONE');
      const msId = msRef?.entityId;
      entries.push({
        id: `mem-pd-${pd.id}`,
        projectId,
        timestamp: pd.decidedAt || pd.proposedAt || pd.createdAt,
        sourceType: 'PROJECT_DECISION',
        sourceId: pd.id,
        eventType: `PROJECT_DECISION_${pd.status}`,
        category: pd.category === 'BUDGET_CONTINGENCY' ? 'FINANCIAL' : pd.category === 'QUALITY_COMPLIANCE' ? 'QUALITY' : 'GOVERNANCE',
        title: pd.title,
        summary: `${pd.number}: ${pd.subject}. Status: ${pd.status}. Proposed by ${pd.proposedByName} (${pd.proposedByRole}). ${pd.status === 'DECIDED' ? `Decided by ${pd.decisionAuthorityName}. Outcome: ${pd.selectedOutcome}` : ''}`,
        actorUserId: pd.decisionAuthorityUserId || pd.proposedByUserId,
        actorRole: pd.decisionAuthorityRole || pd.proposedByRole,
        actorName: pd.decisionAuthorityName || pd.proposedByName,
        resultingState: pd.status,
        relatedMilestoneId: msId,
        milestoneId: msId,
        relatedRecordRefs: pd.relatedRecordRefs,
        metadata: {
          number: pd.number,
          category: pd.category,
          status: pd.status,
          outcome: pd.selectedOutcome,
        },
      });
    }

    // 9. RFIs
    for (const rfi of rfis) {
      entries.push({
        id: `mem-rfi-${rfi.id}`,
        projectId,
        timestamp: rfi.createdAt,
        sourceType: 'RFI',
        sourceId: rfi.id,
        eventType: `RFI_${rfi.status}`,
        category: 'COMMUNICATION',
        title: `RFI ${rfi.number}: ${rfi.title}`,
        summary: `Question: ${rfi.question.slice(0, 150)}... Status: ${rfi.status}. Priority: ${rfi.priority}`,
        actorUserId: rfi.raisedByUserId,
        actorRole: rfi.raisedByRole,
        actorName: rfi.raisedByName,
        resultingState: rfi.status,
        relatedMilestoneId: rfi.relatedMilestoneId,
        milestoneId: rfi.relatedMilestoneId,
        metadata: {
          number: rfi.number,
          priority: rfi.priority,
          status: rfi.status,
        },
      });
    }

    // 10. Direct Line Messages
    for (const dlm of directLineMessages) {
      entries.push({
        id: `mem-dl-${dlm.id}`,
        projectId,
        timestamp: dlm.createdAt,
        sourceType: 'DIRECT_LINE',
        sourceId: dlm.id,
        eventType: 'DIRECT_LINE_MESSAGE',
        category: 'COMMUNICATION',
        title: `Direct Line: ${dlm.messageType}`,
        summary: `${dlm.senderName} (${dlm.senderRole}): ${dlm.content.slice(0, 150)}...`,
        actorUserId: dlm.senderUserId,
        actorRole: dlm.senderRole,
        actorName: dlm.senderName,
        metadata: {
          messageType: dlm.messageType,
          subject: dlm.subject,
        },
      });
    }

    // 11. Evidence Records
    for (const ev of evidenceList) {
      entries.push({
        id: `mem-ev-${ev.id}`,
        projectId,
        timestamp: ev.createdAt,
        sourceType: 'EVIDENCE',
        sourceId: ev.id,
        eventType: 'EVIDENCE_RECORDED',
        category: 'TECHNICAL',
        title: `Evidence: ${ev.title}`,
        summary: `${ev.evidenceType} uploaded by ${ev.uploadedByName} (${ev.uploadedByRole}). Ref: ${ev.storageReference}`,
        actorUserId: ev.uploadedByUserId,
        actorRole: ev.uploadedByRole,
        actorName: ev.uploadedByName,
        relatedMilestoneId: ev.milestoneId,
        milestoneId: ev.milestoneId,
        metadata: {
          evidenceType: ev.evidenceType,
          fileName: ev.fileName,
          fileSize: ev.fileSize,
        },
      });
    }

    // 12. Financial Instructions (Sprint 05B)
    for (const fi of financialInstructions) {
      entries.push({
        id: `mem-fin-${fi.id}`,
        projectId,
        timestamp: fi.createdAt,
        sourceType: 'FINANCIAL_INSTRUCTION',
        sourceId: fi.id,
        eventType: `FINANCIAL_${fi.status}`,
        category: 'FINANCIAL',
        title: `Financial Instruction: ${fi.instructionNumber}`,
        summary: `Disbursement of $${fi.amountUSD.toLocaleString()} for milestone ${fi.milestoneTitle}. Status: ${fi.status}. Provider: ${fi.providerName} (${fi.providerStatus}).`,
        actorUserId: fi.authorizedByUserId,
        actorRole: fi.authorizedByRole,
        actorName: fi.authorizedByName,
        resultingState: fi.status,
        relatedMilestoneId: fi.milestoneId,
        milestoneId: fi.milestoneId,
        metadata: {
          instructionNumber: fi.instructionNumber,
          amountUSD: fi.amountUSD,
          status: fi.status,
          providerStatus: fi.providerStatus,
          providerTransactionReference: fi.providerTransactionReference,
          settlementConfirmedAt: fi.settlementConfirmedAt,
        },
      });
    }

    // Filter by criteria
    let filtered = entries;

    if (query.category && query.category !== 'ALL') {
      filtered = filtered.filter(e => e.category === query.category);
    }

    if (query.sourceType) {
      filtered = filtered.filter(e => e.sourceType === query.sourceType);
    }

    if (query.milestoneId) {
      filtered = filtered.filter(e => e.relatedMilestoneId === query.milestoneId || e.milestoneId === query.milestoneId);
    }

    if (query.actorRole) {
      filtered = filtered.filter(e => e.actorRole === query.actorRole);
    }

    if (query.search) {
      const q = query.search.toLowerCase();
      filtered = filtered.filter(
        e =>
          e.title.toLowerCase().includes(q) ||
          e.summary.toLowerCase().includes(q) ||
          e.actorName.toLowerCase().includes(q) ||
          (e.resultingState && e.resultingState.toLowerCase().includes(q))
      );
    }

    // Sort chronologically
    const order = query.order || 'desc';
    filtered.sort((a, b) => {
      const diff = new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime();
      return order === 'desc' ? diff : -diff;
    });

    const limit = query.limit || 100;
    const paginated = filtered.slice(0, limit);

    return {
      entries: paginated,
      totalCount: filtered.length,
    };
  }
}

export const projectMemoryService = new ProjectMemoryService();
