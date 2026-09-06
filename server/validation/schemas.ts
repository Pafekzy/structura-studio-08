import { z } from 'zod';

// Part A: Safe User Profile Update Schema (Protects security-sensitive fields from mass assignment)
export const updateProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  phone: z.string().max(50).optional(),
  profileSummary: z.string().max(1000).optional(),
  bio: z.string().max(1000).optional(),
  roleDetails: z.object({
    yearsExperience: z.number().min(0).max(100).optional(),
    primaryDiscipline: z.string().max(150).optional(),
    professionalBody: z.string().max(150).optional(),
    registrationNumber: z.string().max(100).optional(),
    companyName: z.string().max(150).optional(),
    yearsOperating: z.number().min(0).max(200).optional(),
    specialties: z.array(z.string()).optional(),
    entityType: z.enum(['Individual', 'Organization']).optional(),
    country: z.string().max(100).optional(),
    city: z.string().max(100).optional(),
    intendedUse: z.string().max(100).optional(),
  }).optional(),
  contactInformation: z.record(z.string(), z.any()).optional(),
}).strict(); // Strictly reject any unknown keys (e.g. primaryRole, authUserId, verificationStatus)

// Part B: Organization Creation Schema
export const createOrganizationSchema = z.object({
  name: z.string().min(2, 'Organization name must be at least 2 characters').max(120),
  type: z.enum([
    'INDIVIDUAL_DEVELOPER',
    'REAL_ESTATE_DEVELOPER',
    'CORPORATE',
    'INSTITUTIONAL',
    'PUBLIC_SECTOR',
    'OTHER'
  ]),
  jurisdiction: z.string().min(2, 'Jurisdiction is required').max(100),
  country: z.string().min(2, 'Country is required').max(100),
  registrationNumber: z.string().max(100).optional(),
  address: z.string().max(250).optional(),
});

// Part C: Project Creation Under Organization Schema
export const createProjectSchema = z.object({
  name: z.string().min(2, 'Project name is required').max(150),
  location: z.string().min(2, 'Location is required').max(200),
  projectType: z.string().max(100).optional().default('Commercial Mixed-Use'),
  description: z.string().max(2000).optional().default(''),
  startDate: z.string().min(4, 'Start date is required'),
  targetHandoverDate: z.string().min(4, 'Target handover date is required'),
  totalBaselineBudgetUSD: z.number().min(0, 'Initial budget must be non-negative'),
  currency: z.string().max(10).optional().default('USD'),
  currentStage: z.string().max(100).optional().default('Planning & Feasibility'),
});

// Part D: Project Governance Invitation Schema
export const createInvitationSchema = z.object({
  professionalUserId: z.string().min(1, 'Professional user ID is required'),
  role: z.enum([
    'SENIOR_PROJECT_DIRECTOR',
    'GENERAL_CONTRACTOR',
    'STRUCTURAL_QA_QC_AUDITOR'
  ]),
  reason: z.string().max(500).optional(),
});

// Part E: Direct Line Message Schema (Sprint 04A)
export const createDirectLineMessageSchema = z.object({
  content: z.string().min(1, 'Message content cannot be empty').max(5000),
  messageType: z.enum([
    'MESSAGE',
    'INFORMATION',
    'INSTRUCTION',
    'CLARIFICATION_REQUEST',
    'DECISION_REQUEST',
    'APPROVAL_REQUEST',
    'ESCALATION',
    'ACKNOWLEDGEMENT',
  ]).default('MESSAGE'),
  subject: z.string().max(200).optional(),
  relatedEntityId: z.string().max(100).optional(),
});

// Part F: RFI Creation Schema (Sprint 04A)
export const createRFISchema = z.object({
  title: z.string().min(3, 'RFI title must be at least 3 characters').max(200),
  question: z.string().min(10, 'RFI question must be at least 10 characters').max(5000),
  discipline: z.string().max(100).optional().default('General Operations'),
  priority: z.enum(['LOW', 'NORMAL', 'HIGH', 'CRITICAL']).default('NORMAL'),
  assignedToUserId: z.string().optional(),
  relatedMilestoneId: z.string().optional(),
  relatedEvidenceIds: z.array(z.string()).optional(),
  dueAt: z.string().optional(),
});

// Part G: RFI Response Schema
export const respondRFISchema = z.object({
  response: z.string().min(5, 'Response must be at least 5 characters').max(5000),
});

// Part H: RFI Acknowledgement Schema
export const acknowledgeRFISchema = z.object({
  acknowledgementNote: z.string().max(1000).optional(),
});

// Part I: RFI Closure Schema
export const closeRFISchema = z.object({
  closingNotes: z.string().max(1000).optional(),
});

// Part J: Project Milestone Creation & Status Schema (Sprint 04B)
export const createMilestoneSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(2000),
  sequence: z.number().int().min(1),
  discipline: z.string().min(2).max(100),
  requiresProjectDirectorReview: z.boolean().default(true),
  requiresQaQcReview: z.boolean().default(true),
  requiresOwnerApproval: z.boolean().default(true),
  costAllocationUSD: z.number().min(0).optional().default(0),
  plannedStartDate: z.string().optional(),
  plannedEndDate: z.string().optional(),
});

export const updateMilestoneStatusSchema = z.object({
  status: z.enum([
    'NOT_STARTED',
    'IN_PROGRESS',
    'SUBMITTED_FOR_REVIEW',
    'TECHNICAL_REVIEW',
    'QA_QC_HOLD',
    'READY_FOR_OWNER_REVIEW',
    'APPROVED',
    'REJECTED',
    'COMPLETE',
  ]),
});

// Part K: Project Evidence Metadata Schema (Sprint 04B)
export const createEvidenceSchema = z.object({
  milestoneId: z.string().optional(),
  evidenceType: z.enum([
    'SITE_PHOTO',
    'DRAWING',
    'DOCUMENT',
    'TEST_RESULT',
    'PROGRESS_RECORD',
    'TECHNICAL_ATTACHMENT',
    'CONTRACTOR_SUBMISSION',
    'OTHER',
  ]),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(5, 'Description must be at least 5 characters').max(2000),
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1).max(100),
  fileSize: z.number().min(0),
  storageProvider: z.enum([
    'METADATA_ONLY',
    'LOCAL_SANDBOX',
    'CLOUD_STORAGE_PROVISIONAL',
  ]).default('METADATA_ONLY'),
  storageStatus: z.enum([
    'RECORDED_METADATA',
    'REFERENCED',
    'STORED',
  ]).default('RECORDED_METADATA'),
  storageReference: z.string().min(1, 'Storage reference/tag is required').max(200),
  metadata: z.record(z.string(), z.any()).optional(),
});

// Part L: Contractor Milestone Submission Schema (Sprint 04B)
export const createSubmissionDraftSchema = z.object({
  title: z.string().min(3, 'Submission title must be at least 3 characters').max(200),
  summary: z.string().min(10, 'Executive summary must be at least 10 characters').max(3000),
  contractorNotes: z.string().max(3000).optional().default(''),
  evidenceIds: z.array(z.string()).optional().default([]),
});

export const updateSubmissionDraftSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  summary: z.string().min(10).max(3000).optional(),
  contractorNotes: z.string().max(3000).optional(),
  evidenceIds: z.array(z.string()).optional(),
});

export const submitPackageSchema = z.object({
  notes: z.string().max(2000).optional(),
});

// Part M: Senior Project Director Technical Review Schema (Sprint 04B)
export const technicalReviewDecisionSchema = z.object({
  decision: z.enum([
    'REQUEST_CHANGES',
    'ACCEPT_TECHNICAL_SUBMISSION',
    'ESCALATE',
    'SEND_TO_QA_QC',
  ]),
  reviewNotes: z.string().min(5, 'Review notes must be at least 5 characters').max(4000),
});

// Part N: QA/QC Inspection Schemas (Sprint 04C)
export const startQAQCInspectionSchema = z.object({
  inspectionType: z.string().min(2).max(100),
  inspectionNotes: z.string().min(5, 'Inspection notes must be at least 5 characters').max(4000),
  evidenceIds: z.array(z.string()).optional().default([]),
});

export const decideQAQCInspectionSchema = z.object({
  decision: z.enum(['PASSED', 'FAILED', 'HOLD', 'REINSPECTION_REQUIRED']),
  inspectionNotes: z.string().min(5, 'Inspection notes must be at least 5 characters').max(4000),
  evidenceIds: z.array(z.string()).optional().default([]),
});

// Part O: Non-Conformance Report (NCR) Schemas (Sprint 04C)
export const createNCRSchema = z.object({
  inspectionId: z.string().optional(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(10, 'Description must be at least 10 characters').max(3000),
  severity: z.enum(['MINOR', 'MODERATE', 'MAJOR', 'CRITICAL']),
  requirementReference: z.string().min(3).max(300),
  observedCondition: z.string().min(5).max(3000),
  correctiveActionRequired: z.string().min(5).max(3000),
  assignedToUserId: z.string().optional(),
});

export const submitCorrectiveActionSchema = z.object({
  contractorResponse: z.string().min(5, 'Response must be at least 5 characters').max(3000),
  correctiveActionDescription: z.string().min(10, 'Description of corrective action must be at least 10 characters').max(3000),
  correctiveEvidenceIds: z.array(z.string()).optional().default([]),
});

export const closeNCRSchema = z.object({
  reinspectionNotes: z.string().min(5, 'Re-inspection notes required').max(3000),
  decision: z.enum(['CLOSE', 'REQUIRE_REINSPECTION', 'REJECT_CORRECTIVE_ACTION']),
});

// Part P: AI Visual Inspection Analysis Schema (Sprint 04C)
export const requestAIInspectionSchema = z.object({
  evidenceIds: z.array(z.string()).optional().default([]),
  inspectionContext: z.string().max(1000).optional(),
});

// Part Q: Owner Milestone Governance Decision Schema (Sprint 04C)
export const ownerDecisionSchema = z.object({
  decision: z.enum(['APPROVE', 'RETURN', 'REJECT']),
  decisionNotes: z.string().min(5, 'Decision notes must be at least 5 characters').max(4000),
});

// Part R: Project Decision Schemas (Sprint 04D)
export const createProjectDecisionSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  subject: z.string().min(5, 'Decision subject must be at least 5 characters').max(300),
  description: z.string().min(10, 'Description must be at least 10 characters').max(4000),
  category: z.enum([
    'MATERIAL_SELECTION',
    'DESIGN_VARIATION',
    'SCHEDULE_ADJUSTMENT',
    'BUDGET_CONTINGENCY',
    'SITE_LOGISTICS',
    'PROCUREMENT_STRATEGY',
    'QUALITY_COMPLIANCE',
    'GENERAL_GOVERNANCE',
  ]),
  options: z.array(z.object({
    title: z.string().min(2).max(200),
    description: z.string().min(5).max(2000),
    costImpactUSD: z.number().optional(),
    scheduleImpactDays: z.number().optional(),
    isRecommended: z.boolean().optional(),
  })).optional().default([]),
  rationale: z.string().max(2000).optional().default(''),
  status: z.enum(['DRAFT', 'PROPOSED']).optional().default('PROPOSED'),
  relatedRecordRefs: z.array(z.object({
    entityType: z.string().min(1).max(50),
    entityId: z.string().min(1).max(100),
    title: z.string().max(200).optional(),
    referenceCode: z.string().max(100).optional(),
  })).optional().default([]),
});

export const proposeProjectDecisionSchema = z.object({
  rationale: z.string().max(2000).optional(),
});

export const recordDecisionOutcomeSchema = z.object({
  selectedOptionId: z.string().optional(),
  selectedOutcome: z.string().min(3, 'Selected outcome must be at least 3 characters').max(2000),
  rationale: z.string().min(5, 'Rationale must be at least 5 characters').max(4000),
});

export const supersedeDecisionSchema = z.object({
  supersedingDecisionId: z.string().min(1, 'Superseding decision ID is required').max(100),
  supersededReason: z.string().min(5, 'Superseded reason must be at least 5 characters').max(2000),
});

// Part S: Project Memory Query Schemas (Sprint 04D)
export const queryProjectMemorySchema = z.object({
  category: z.enum(['ALL', 'GOVERNANCE', 'TECHNICAL', 'QUALITY', 'COMMUNICATION', 'FINANCIAL']).optional().default('ALL'),
  sourceType: z.enum([
    'AUDIT_EVENT',
    'MILESTONE',
    'EVIDENCE',
    'SUBMISSION',
    'TECHNICAL_REVIEW',
    'QA_QC_INSPECTION',
    'NCR',
    'AI_INSPECTION',
    'OWNER_DECISION',
    'PROJECT_DECISION',
    'RFI',
    'DIRECT_LINE',
  ]).optional(),
  milestoneId: z.string().optional(),
  actorRole: z.string().optional(),
  search: z.string().max(100).optional(),
  order: z.enum(['asc', 'desc']).optional().default('desc'),
  limit: z.coerce.number().int().min(1).max(200).optional().default(100),
});

export const requestAIMemorySummarySchema = z.object({
  timeRangeDays: z.number().int().min(1).max(365).optional(),
  milestoneId: z.string().optional(),
  category: z.enum(['ALL', 'GOVERNANCE', 'TECHNICAL', 'QUALITY', 'COMMUNICATION', 'FINANCIAL']).optional().default('ALL'),
});

// Part T: Notification Mutation Schemas (Sprint 04D)
export const markNotificationReadSchema = z.object({
  isRead: z.boolean().default(true),
});

// Part U: Punch / Outstanding Item Schemas (Sprint 05A)
export const createPunchItemSchema = z.object({
  milestoneId: z.string().optional(),
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().min(5, 'Description must be at least 5 characters').max(3000),
  category: z.enum([
    'ARCHITECTURAL',
    'STRUCTURAL',
    'MEP',
    'FINISHING',
    'DOCUMENTATION',
    'SAFETY',
    'GENERAL',
  ]).default('GENERAL'),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).default('MEDIUM'),
  assignedToUserId: z.string().optional(),
  evidenceIds: z.array(z.string()).optional().default([]),
});

export const updatePunchItemSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(5).max(3000).optional(),
  category: z.enum([
    'ARCHITECTURAL',
    'STRUCTURAL',
    'MEP',
    'FINISHING',
    'DOCUMENTATION',
    'SAFETY',
    'GENERAL',
  ]).optional(),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'CRITICAL']).optional(),
  evidenceIds: z.array(z.string()).optional(),
});

export const assignPunchItemSchema = z.object({
  assignedToUserId: z.string().min(1, 'Assigned user ID is required'),
});

export const submitPunchResolutionSchema = z.object({
  resolutionDescription: z.string().min(5, 'Resolution description must be at least 5 characters').max(3000),
  resolutionEvidenceIds: z.array(z.string()).optional().default([]),
});

export const verifyPunchItemSchema = z.object({
  decision: z.enum(['VERIFIED', 'REQUIRE_REWORK']),
  verificationNotes: z.string().min(5, 'Verification notes must be at least 5 characters').max(3000),
});

export const closePunchItemSchema = z.object({
  closingNotes: z.string().max(2000).optional(),
});

// Part V: Project Closeout Schemas (Sprint 05A)
export const initiateCloseoutSchema = z.object({
  summary: z.string().max(3000).optional().default('Project closeout initiated for governance inspection, checklist verification, and handover readiness.'),
  customChecklistItems: z.array(z.object({
    category: z.enum([
      'MILESTONES',
      'TECHNICAL_REVIEWS',
      'QA_QC',
      'NCRS',
      'OWNER_DECISIONS',
      'PROJECT_DECISIONS',
      'EVIDENCE',
      'PUNCH_ITEMS',
      'GOVERNANCE',
      'DOCUMENTATION',
    ]),
    title: z.string().min(3).max(200),
    description: z.string().min(5).max(1000),
    isRequired: z.boolean().default(true),
  })).optional(),
});

export const updateCloseoutChecklistItemSchema = z.object({
  isCompleted: z.boolean(),
  notes: z.string().max(2000).optional(),
  verifiedReferenceId: z.string().max(100).optional(),
});

export const completeCloseoutSchema = z.object({
  closeoutSummary: z.string().min(5, 'Closeout summary must be at least 5 characters').max(4000),
});

export const returnCloseoutSchema = z.object({
  returnReason: z.string().min(5, 'Return reason must be at least 5 characters').max(3000),
});

// Part W: Handover Schemas (Sprint 05A)
export const prepareHandoverSchema = z.object({
  targetHandoverDate: z.string().optional(),
  handoverNotes: z.string().max(4000).optional().default('Handover package compiled from canonical project records, milestone completions, and QA/QC certificates.'),
  customChecklist: z.array(z.object({
    title: z.string().min(3).max(200),
    category: z.string().min(2).max(100),
    isRequired: z.boolean().default(true),
    notes: z.string().max(1000).optional(),
  })).optional(),
});

export const recordHandoverDecisionSchema = z.object({
  decision: z.enum(['ACCEPT', 'RETURN']),
  notes: z.string().min(5, 'Decision notes must be at least 5 characters').max(4000),
  actualHandoverDate: z.string().optional(),
});

// Part X: Executive Reporting & AI Briefing Schemas (Sprint 05A)
export const requestAIExecutiveBriefingSchema = z.object({
  focusArea: z.enum(['FULL_BRIEFING', 'RISK_FOCUSED', 'CLOSEOUT_FOCUSED', 'FINANCIAL_GOVERNANCE']).optional().default('FULL_BRIEFING'),
  includeHistoricalDecisions: z.boolean().optional().default(true),
});

// Part Y: Financial Execution & BMONI Provider Boundary Schemas (Sprint 05B)
export const createFinancialInstructionSchema = z.object({
  milestoneId: z.string().min(1, 'Milestone ID is required'),
  idempotencyKey: z.string().min(1, 'Idempotency key is required').max(128),
  amountUSD: z.number().positive().optional(),
  executionNotes: z.string().max(2000).optional(),
});

export const processFinancialInstructionSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const reconcileInstructionSchema = z.object({
  forceDivergenceCheck: z.boolean().optional(),
  reason: z.string().max(2000).optional(),
});

export const resolveReconciliationSchema = z.object({
  resolutionNotes: z.string().min(5, 'Resolution notes are required').max(3000),
  targetStatus: z.enum([
    'NOT_AUTHORIZED',
    'AUTHORIZED_FOR_FINANCIAL_PROCESSING',
    'PROCESSING_NOT_STARTED',
    'PROCESSING',
    'PROVIDER_ACCEPTED',
    'PROVIDER_REJECTED',
    'PAYMENT_CONFIRMED',
    'SETTLEMENT_PENDING',
    'SETTLED',
    'FAILED',
    'CANCELLED',
    'REQUIRES_RECONCILIATION',
  ]),
});

export const bmoniWebhookSchema = z.object({
  eventId: z.string().optional(),
  id: z.string().optional(),
  eventType: z.string().optional(),
  type: z.string().optional(),
  status: z.string().optional(),
  instructionId: z.string().optional(),
  disbursementReference: z.string().optional(),
  providerReference: z.string().optional(),
  transactionId: z.string().optional(),
  amount: z.number().optional(),
  currency: z.string().optional(),
  settledAt: z.string().optional(),
  notes: z.string().optional(),
  reason: z.string().optional(),
}).passthrough();
