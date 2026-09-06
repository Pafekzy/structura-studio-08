import { projectRepository, ProjectRole } from '../repositories/projectRepository';
import { organizationRepository } from '../repositories/organizationRepository';
import { milestoneRepository } from '../repositories/milestoneRepository';
import { submissionRepository } from '../repositories/submissionRepository';
import { technicalReviewRepository } from '../repositories/technicalReviewRepository';
import { qaqcRepository } from '../repositories/qaqcRepository';
import { ncrRepository } from '../repositories/ncrRepository';
import { ownerDecisionRepository } from '../repositories/ownerDecisionRepository';
import { projectDecisionRepository } from '../repositories/projectDecisionRepository';
import { rfiRepository } from '../repositories/rfiRepository';
import { evidenceRepository } from '../repositories/evidenceRepository';
import { punchItemRepository } from '../repositories/punchItemRepository';
import { closeoutRepository } from '../repositories/closeoutRepository';
import { handoverRepository } from '../repositories/handoverRepository';
import { auditEventRepository } from '../repositories/auditEventRepository';
import { financialInstructionRepository } from '../repositories/financialInstructionRepository';
import { bmoniAdapter } from './financial/bmoniAdapter';
import { userRepository } from '../repositories/userRepository';
import { GovernanceError } from './governanceError';
import {
  ExecutiveProjectReport,
  ProjectHealthSummary,
  ProjectHealthStatus,
  ProjectHealthFactor,
  MilestoneProgressSummary,
  ExecutiveRiskSummary,
  FinalProjectRecordPackage,
} from '../../src/types';

export class ExecutiveReportingService {
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

  private async getActorDetails(userId: string) {
    const user = (await userRepository.findByAuthUserId(userId)) || (await userRepository.findById(userId));
    const fullName = user ? `${user.firstName} ${user.lastName}`.trim() : 'Project Participant';
    return { user, fullName };
  }

  async generateExecutiveReport(projectId: string, userId: string): Promise<ExecutiveProjectReport> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw new GovernanceError(403, 'FORBIDDEN', 'Forbidden: Active project appointment required to view executive reports.');
    }

    const project = await projectRepository.getProjectById(projectId);
    if (!project) {
      throw new GovernanceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }

    const { fullName } = await this.getActorDetails(userId);
    const now = new Date().toISOString();

    // Fetch all canonical project data concurrently
    const [
      milestones,
      submissions,
      technicalReviews,
      qaqcInspections,
      ncrs,
      ownerDecisions,
      projectDecisions,
      rfis,
      evidence,
      punchItems,
      closeout,
      handover,
      financialInstructions,
    ] = await Promise.all([
      milestoneRepository.listMilestonesByProject(projectId),
      submissionRepository.listSubmissionsByProject(projectId),
      technicalReviewRepository.listReviewsByProject(projectId),
      qaqcRepository.listInspectionsByProject(projectId),
      ncrRepository.listNCRsByProject(projectId),
      ownerDecisionRepository.listDecisionsByProject(projectId),
      projectDecisionRepository.listDecisionsByProject(projectId),
      rfiRepository.listRFIsByProject(projectId),
      evidenceRepository.listEvidenceByProject(projectId),
      punchItemRepository.listPunchItemsByProject(projectId),
      closeoutRepository.getCloseoutByProject(projectId),
      handoverRepository.getHandoverByProject(projectId),
      financialInstructionRepository.listByProject(projectId),
    ]);

    // Compute Milestone Progress Summary
    const totalMilestones = milestones.length;
    const completedCount = milestones.filter(m => m.status === 'APPROVED' || m.status === 'COMPLETE').length;
    const inProgressCount = milestones.filter(m => m.status === 'IN_PROGRESS').length;
    const notStartedCount = milestones.filter(m => m.status === 'NOT_STARTED').length;
    const blockedCount = milestones.filter(m => m.status === 'QA_QC_HOLD' || m.status === 'REJECTED').length;
    const awaitingTechnicalReviewCount = milestones.filter(m => m.status === 'SUBMITTED_FOR_REVIEW' || m.status === 'TECHNICAL_REVIEW').length;
    const awaitingQAQCCount = milestones.filter(m => m.qaQcStatus === 'PENDING' || m.qaQcStatus === 'IN_PROGRESS').length;
    const awaitingOwnerReviewCount = milestones.filter(m => m.status === 'READY_FOR_OWNER_REVIEW').length;
    const approvedCount = milestones.filter(m => m.status === 'APPROVED' || m.status === 'COMPLETE').length;
    const financiallyAuthorizedCount = milestones.filter(m => m.financialStatus === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING').length;

    const totalCostAllocationUSD = milestones.reduce((sum, m) => sum + (m.costAllocationUSD || 0), 0);
    const financiallyAuthorizedUSD = milestones
      .filter(m => m.financialStatus === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING')
      .reduce((sum, m) => sum + (m.costAllocationUSD || 0), 0);

    const percentMilestonesApproved = totalMilestones > 0
      ? Math.round((approvedCount / totalMilestones) * 100)
      : 0;

    const percentMilestonesFinanciallyAuthorized = totalMilestones > 0
      ? Math.round((financiallyAuthorizedCount / totalMilestones) * 100)
      : 0;

    const progress: MilestoneProgressSummary = {
      totalMilestones,
      completedCount,
      inProgressCount,
      notStartedCount,
      blockedCount,
      awaitingTechnicalReviewCount,
      awaitingQAQCCount,
      awaitingOwnerReviewCount,
      approvedCount,
      financiallyAuthorizedCount,
      totalCostAllocationUSD,
      financiallyAuthorizedUSD,
      percentMilestonesApproved,
      percentMilestonesFinanciallyAuthorized,
    };

    // Calculate Project Health & Explainable Factors
    const factors: ProjectHealthFactor[] = [];
    const criticalBlockers: string[] = [];
    const attentionItems: string[] = [];

    // Factor 1: Milestones
    const milestoneScore = totalMilestones > 0 ? (completedCount / totalMilestones) * 100 : 100;
    factors.push({
      id: 'f-milestones',
      name: 'Milestone Progress',
      category: 'MILESTONES',
      status: milestoneScore >= 75 ? 'OPTIMAL' : milestoneScore >= 40 ? 'ATTENTION' : 'CRITICAL',
      score: Math.round(milestoneScore),
      weight: 0.20,
      summary: `${completedCount} of ${totalMilestones} milestones completed (${Math.round(milestoneScore)}%).`,
      details: [`${inProgressCount} milestones in progress`, `${awaitingTechnicalReviewCount} awaiting review`],
      blockingItemsCount: blockedCount,
    });

    // Factor 2: QA/QC Inspections
    const passedInspections = qaqcInspections.filter(i => i.inspectionStatus === 'PASSED').length;
    const heldOrFailedInspections = qaqcInspections.filter(i => i.inspectionStatus === 'FAILED' || i.inspectionStatus === 'HOLD').length;
    let qaqcScore = 100;
    let qaqcStatus: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL' | 'BLOCKED' = 'OPTIMAL';
    if (heldOrFailedInspections > 0) {
      qaqcScore = Math.max(20, 100 - heldOrFailedInspections * 30);
      qaqcStatus = 'BLOCKED';
      criticalBlockers.push(`${heldOrFailedInspections} QA/QC inspection(s) held or failed.`);
    } else if (qaqcInspections.length > 0 && passedInspections < qaqcInspections.length) {
      qaqcScore = 75;
      qaqcStatus = 'ATTENTION';
      attentionItems.push(`${qaqcInspections.length - passedInspections} QA/QC inspections pending resolution.`);
    }
    factors.push({
      id: 'f-qaqc',
      name: 'QA/QC Compliance',
      category: 'QA_QC',
      status: qaqcStatus,
      score: qaqcScore,
      weight: 0.15,
      summary: `${passedInspections} passed, ${heldOrFailedInspections} hold/failed out of ${qaqcInspections.length} total.`,
      details: [`${passedInspections} passed`, `${heldOrFailedInspections} held/failed`],
      blockingItemsCount: heldOrFailedInspections,
    });

    // Factor 3: Non-Conformance Reports (NCR)
    const openNcrs = ncrs.filter(n => n.status !== 'CLOSED');
    const criticalNcrs = openNcrs.filter(n => n.severity === 'CRITICAL' || n.severity === 'MAJOR');
    let ncrScore = 100;
    let ncrStatus: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL' | 'BLOCKED' = 'OPTIMAL';
    if (criticalNcrs.length > 0) {
      ncrScore = Math.max(10, 100 - criticalNcrs.length * 40);
      ncrStatus = 'BLOCKED';
      criticalBlockers.push(`${criticalNcrs.length} high-severity NCR(s) open in registry.`);
    } else if (openNcrs.length > 0) {
      ncrScore = Math.max(50, 100 - openNcrs.length * 20);
      ncrStatus = 'ATTENTION';
      attentionItems.push(`${openNcrs.length} moderate/minor NCRs undergoing remediation.`);
    }
    factors.push({
      id: 'f-ncrs',
      name: 'NCR Clearance',
      category: 'NCRS',
      status: ncrStatus,
      score: ncrScore,
      weight: 0.15,
      summary: `${ncrs.length - openNcrs.length} resolved, ${openNcrs.length} open (${criticalNcrs.length} critical).`,
      details: openNcrs.map(n => `NCR ${n.number}: ${n.title}`),
      blockingItemsCount: criticalNcrs.length,
    });

    // Factor 4: Technical Reviews
    const rejectedReviews = technicalReviews.filter(r => r.decision === 'REQUEST_CHANGES' || r.decision === 'ESCALATE');
    let techReviewScore = 100;
    if (rejectedReviews.length > 0) {
      techReviewScore = Math.max(40, 100 - rejectedReviews.length * 25);
    }
    factors.push({
      id: 'f-tech-review',
      name: 'Technical Reviews',
      category: 'TECHNICAL_REVIEW',
      status: techReviewScore >= 80 ? 'OPTIMAL' : techReviewScore >= 50 ? 'ATTENTION' : 'CRITICAL',
      score: techReviewScore,
      weight: 0.10,
      summary: `${technicalReviews.length} total reviews, ${rejectedReviews.length} revisions requested.`,
      details: rejectedReviews.map(r => `Review on submission ${r.submissionId}: ${r.decision}`),
      blockingItemsCount: rejectedReviews.length,
    });

    // Factor 5: RFIs
    const openRfis = rfis.filter(r => r.status === 'OPEN' || r.status === 'UNDER_REVIEW');
    const criticalRfis = openRfis.filter(r => r.priority === 'CRITICAL' || r.priority === 'HIGH');
    let rfiScore = 100;
    let rfiStatus: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL' | 'BLOCKED' = 'OPTIMAL';
    if (criticalRfis.length > 0) {
      rfiScore = Math.max(30, 100 - criticalRfis.length * 25);
      rfiStatus = 'ATTENTION';
      attentionItems.push(`${criticalRfis.length} high priority RFI(s) awaiting response.`);
    } else if (openRfis.length > 3) {
      rfiScore = 75;
      rfiStatus = 'ATTENTION';
    }
    factors.push({
      id: 'f-rfis',
      name: 'RFI Resolution',
      category: 'RFIS',
      status: rfiStatus,
      score: rfiScore,
      weight: 0.10,
      summary: `${rfis.length - openRfis.length} of ${rfis.length} RFIs resolved (${openRfis.length} open).`,
      details: openRfis.map(r => `RFI ${r.number}: ${r.title}`),
      blockingItemsCount: criticalRfis.length,
    });

    // Factor 6: Outstanding Punch List Items
    const openPunch = punchItems.filter(p => p.status !== 'CLOSED' && p.status !== 'VERIFIED');
    const criticalPunch = openPunch.filter(p => p.priority === 'CRITICAL' || p.priority === 'HIGH');
    let punchScore = 100;
    let punchStatus: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL' | 'BLOCKED' = 'OPTIMAL';
    if (criticalPunch.length > 0) {
      punchScore = Math.max(30, 100 - criticalPunch.length * 20);
      punchStatus = 'ATTENTION';
      attentionItems.push(`${criticalPunch.length} critical punch items pending rectification.`);
    }
    factors.push({
      id: 'f-punch-items',
      name: 'Punch List Completion',
      category: 'PUNCH_LIST',
      status: punchStatus,
      score: punchScore,
      weight: 0.15,
      summary: `${punchItems.filter(p => p.status === 'CLOSED' || p.status === 'VERIFIED').length} of ${punchItems.length} punch items resolved.`,
      details: openPunch.map(p => `Punch ${p.number}: ${p.title} (${p.status})`),
      blockingItemsCount: criticalPunch.length,
    });

    // Factor 7: Closeout & Handover Governance
    let closeoutScore = 50;
    let closeoutStatus: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL' | 'BLOCKED' = 'ATTENTION';
    if (handover?.status === 'HANDOVER_COMPLETE') {
      closeoutScore = 100;
      closeoutStatus = 'OPTIMAL';
    } else if (closeout?.status === 'COMPLETED' || closeout?.status === 'READY_FOR_REVIEW') {
      closeoutScore = 90;
      closeoutStatus = 'OPTIMAL';
    } else if (closeout?.status === 'IN_PROGRESS') {
      closeoutScore = 70;
      closeoutStatus = 'ATTENTION';
    }
    factors.push({
      id: 'f-closeout',
      name: 'Closeout Governance',
      category: 'CLOSEOUT',
      status: closeoutStatus,
      score: closeoutScore,
      weight: 0.15,
      summary: `Closeout status: ${closeout?.status || 'NOT_STARTED'}; Handover: ${handover?.status || 'NOT_READY'}.`,
      details: [`Closeout state: ${closeout?.status || 'NOT_STARTED'}`, `Handover state: ${handover?.status || 'NOT_READY'}`],
      blockingItemsCount: closeout?.status === 'RETURNED' ? 1 : 0,
    });

    // Overall Weighted Health Score (0-100)
    let totalScore = 0;
    factors.forEach(f => {
      totalScore += f.score * f.weight;
    });
    const overallScore = Math.round(totalScore);

    let overallStatus: ProjectHealthStatus = 'HEALTHY';
    if (criticalBlockers.length > 0 || overallScore < 50) {
      overallStatus = criticalBlockers.length > 0 ? 'BLOCKED' : 'AT_RISK';
    } else if (overallScore < 75) {
      overallStatus = 'ATTENTION_REQUIRED';
    }

    const health: ProjectHealthSummary = {
      overallStatus,
      overallScore,
      evaluationTimestamp: now,
      executiveSummary: `Project evaluated as ${overallStatus} (Score ${overallScore}/100) across ${factors.length} governance dimensions.`,
      factors,
      criticalBlockers,
      attentionItems,
    };

    // Compile Risks & Issues Register
    const riskItems: Array<{
      id: string;
      type: string;
      title: string;
      severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
      referenceId: string;
      description: string;
      actionRequired: string;
    }> = [];

    // Add open critical NCRs
    criticalNcrs.forEach(n => {
      riskItems.push({
        id: `risk-ncr-${n.id}`,
        type: 'NCR',
        title: `Open ${n.severity} Non-Conformance: ${n.number}`,
        severity: n.severity === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        referenceId: n.id,
        description: n.description,
        actionRequired: 'Contractor must submit corrective remediation package for QA/QC Auditor reinspection.',
      });
    });

    // Add held/failed QA/QC
    heldOrFailedInspections && qaqcInspections.filter(i => i.inspectionStatus === 'FAILED' || i.inspectionStatus === 'HOLD').forEach(i => {
      riskItems.push({
        id: `risk-qaqc-${i.id}`,
        type: 'QA_QC',
        title: `QA/QC Inspection ${i.inspectionStatus}: ${i.inspectionType}`,
        severity: 'HIGH',
        referenceId: i.id,
        description: i.inspectionNotes || 'Inspection flagged non-compliance or pending technical data.',
        actionRequired: 'Resolve field hold condition and request formal auditor re-evaluation.',
      });
    });

    // Add critical punch items
    criticalPunch.forEach(p => {
      riskItems.push({
        id: `risk-punch-${p.id}`,
        type: 'PUNCH_ITEM',
        title: `Critical Punch Item: ${p.number} - ${p.title}`,
        severity: p.priority === 'CRITICAL' ? 'CRITICAL' : 'HIGH',
        referenceId: p.id,
        description: p.description,
        actionRequired: 'Expedite trade subcontractor resolution and submit for professional verification.',
      });
    });

    // Add unapproved Project Decisions
    projectDecisions.filter(d => d.status === 'PROPOSED' || d.status === 'DRAFT').forEach(d => {
      riskItems.push({
        id: `risk-dec-${d.id}`,
        type: 'PROJECT_DECISION',
        title: `Unresolved Project Decision: ${d.title}`,
        severity: 'MEDIUM',
        referenceId: d.id,
        description: d.description,
        actionRequired: 'Authorized governance participants must vote/concur on proposed decision.',
      });
    });

    const risks: ExecutiveRiskSummary = {
      totalOpenNCRs: openNcrs.length,
      blockingNCRsCount: criticalNcrs.length,
      failedQAQCCount: heldOrFailedInspections,
      unansweredRFIsCount: openRfis.length,
      unresolvedDecisionsCount: projectDecisions.filter(d => d.status === 'PROPOSED' || d.status === 'DRAFT').length,
      openCriticalPunchCount: criticalPunch.length,
      missingEvidenceCount: 0,
      items: riskItems,
    };

    // Compile Punch Counts
    const punchItemCounts = {
      total: punchItems.length,
      open: punchItems.filter(p => p.status === 'OPEN').length,
      assigned: punchItems.filter(p => p.status === 'ASSIGNED').length,
      inProgress: punchItems.filter(p => p.status === 'IN_PROGRESS').length,
      readyForVerification: punchItems.filter(p => p.status === 'READY_FOR_VERIFICATION').length,
      verified: punchItems.filter(p => p.status === 'VERIFIED').length,
      closed: punchItems.filter(p => p.status === 'CLOSED').length,
      critical: criticalPunch.length,
    };

    // Financial Governance Card
    const settledAmountUSD = financialInstructions
      .filter((i) => i.status === 'SETTLED')
      .reduce((sum, i) => sum + i.amountUSD, 0);
    const requiresReconciliationCount = financialInstructions.filter(
      (i) => i.status === 'REQUIRES_RECONCILIATION'
    ).length;
    const providerConnection = bmoniAdapter.getConnectionStatus();

    const financialGovernance = {
      totalBaselineBudgetUSD: totalCostAllocationUSD,
      costAllocationTotalUSD: totalCostAllocationUSD,
      authorizedForFinancialProcessingUSD: financiallyAuthorizedUSD,
      financialProcessingStatus: financiallyAuthorizedUSD === totalCostAllocationUSD && totalCostAllocationUSD > 0
        ? 'FULLY_AUTHORIZED'
        : financiallyAuthorizedUSD > 0
        ? 'PARTIALLY_AUTHORIZED'
        : 'PENDING_GOVERNANCE',
      note: 'STRUCTURA determines WHY payment is authorized via governed technical milestone acceptance. BMONI is NOT integrated directly for auto-settlement (No BMONI direct fund release without verified provider credentials). Financial execution instructions are dispatched via an idempotent adapter boundary. AUTHORIZED_FOR_FINANCIAL_PROCESSING ≠ PAID ≠ SETTLED.',
      activeInstructionsCount: financialInstructions.length,
      settledAmountUSD,
      providerConnected: providerConnection.status === 'CONNECTED',
      requiresReconciliationCount,
    };

    const report: ExecutiveProjectReport = {
      projectId,
      projectName: project.name,
      generatedAt: now,
      generatedByUserId: userId,
      generatedByName: fullName,
      health,
      progress,
      risks,
      closeoutStatus: closeout?.status || 'NOT_STARTED',
      handoverStatus: handover?.status || 'NOT_READY',
      punchItemCounts,
      financialGovernance,
      disclaimer:
        'This executive report is compiled deterministically from immutable project milestone submissions, technical reviews, QA/QC audits, NCRs, and punch lists under Structura project governance.',
    };

    // Audit event for reporting
    await auditEventRepository.record({
      id: `audit-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
      timestamp: now,
      actorUserId: userId,
      projectId,
      organizationId: project.organizationId || 'org-structura-demo',
      action: 'EXECUTIVE_REPORT_GENERATED',
      entityType: 'EXECUTIVE_REPORT',
      entityId: `rpt-${Date.now()}`,
      metadata: {
        generatedByRole: role,
        overallScore,
        overallStatus,
      },
    });

    return report;
  }

  async getFinalProjectRecordPackage(projectId: string, userId: string): Promise<FinalProjectRecordPackage> {
    const role = await this.resolveUserProjectRole(projectId, userId);
    if (!role) {
      throw new GovernanceError(403, 'FORBIDDEN', 'Forbidden: Active project appointment required to view project record package.');
    }

    const project = await projectRepository.getProjectById(projectId);
    if (!project) {
      throw new GovernanceError(404, 'PROJECT_NOT_FOUND', 'Project not found.');
    }

    const report = await this.generateExecutiveReport(projectId, userId);

    const [
      milestones,
      evidence,
      technicalReviews,
      qaqcInspections,
      ncrs,
      ownerDecisions,
      projectDecisions,
      rfis,
      punchItems,
      closeout,
      handover,
      recentAuditEvents,
      financialInstructions,
    ] = await Promise.all([
      milestoneRepository.listMilestonesByProject(projectId),
      evidenceRepository.listEvidenceByProject(projectId),
      technicalReviewRepository.listReviewsByProject(projectId),
      qaqcRepository.listInspectionsByProject(projectId),
      ncrRepository.listNCRsByProject(projectId),
      ownerDecisionRepository.listDecisionsByProject(projectId),
      projectDecisionRepository.listDecisionsByProject(projectId),
      rfiRepository.listRFIsByProject(projectId),
      punchItemRepository.listPunchItemsByProject(projectId),
      closeoutRepository.getCloseoutByProject(projectId),
      handoverRepository.getHandoverByProject(projectId),
      auditEventRepository.listByProject(projectId),
      financialInstructionRepository.listByProject(projectId),
    ]);

    return {
      project: project as any,
      report,
      records: {
        milestones,
        evidence,
        technicalReviews,
        qaqcInspections,
        ncrs,
        ownerDecisions,
        projectDecisions,
        rfis,
        punchItems,
        closeout,
        handover,
        financialInstructions,
      },
      auditTrail: recentAuditEvents.slice(0, 50) as any,
      archivalStatus: handover?.status === 'HANDOVER_COMPLETE' ? 'ARCHIVED' : 'ACTIVE_GOVERNANCE',
    };
  }
}

export const executiveReportingService = new ExecutiveReportingService();
