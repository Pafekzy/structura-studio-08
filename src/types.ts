export type MonitoringCadence = 'daily' | 'weekly' | 'fortnightly' | 'monthly';

export type NavigationTab =
  | 'cockpit'
  | 'monitoring'
  | 'inspection'
  | 'budget'
  | 'finished_render'
  | 'new_estimator'
  | 'operations'
  | 'stakeholder_hub'
  | 'stakeholder_owner'
  | 'stakeholder_director'
  | 'stakeholder_contractor'
  | 'stakeholder_qaqc';

export type UserRole = 'Owner / Client' | 'Senior Project Director' | 'General Contractor' | 'Structural QA/QC Auditor';

export interface LandSpecifications {
  plotAreaSqm: number;
  topography: 'Flat / Level Ground' | 'Sloped / Terraced' | 'Rocky Hillside' | 'Coastal / High Water Table';
  soilType: 'Standard Sandy Clay' | 'Dense Gravel / Rock' | 'Soft Clay / Silt' | 'Expansive Clay';
  zoningClassification: 'R-1 Low Density Residential' | 'R-3 Multi-Family Luxury' | 'Commercial Mixed-Use' | 'Light Industrial';
  setbackMeters: { front: number; rear: number; left: number; right: number };
  location: string;
}

export interface FloorPlanSpecifications {
  grossFloorAreaSqm: number;
  floors: number;
  buildingStyle: 'Contemporary Minimalist' | 'Industrial Modern Luxury' | 'Mediterranean Coastal' | 'Scandinavian Mass Timber' | 'Biophilic Sustainable';
  ceilingHeightMeters: number;
  bedroomCount: number;
  bathroomCount: number;
  hasBasement: boolean;
  hasSwimmingPool: boolean;
  hasRooftopDeck: boolean;
}

export interface MaterialSpecifications {
  structuralCore: 'Reinforced Concrete (RC Frame)' | 'Structural Steel & Composite Deck' | 'Mass Timber (CLT / Glulam)' | 'Reinforced Masonry & Precast' | 'Hybrid Steel-Concrete Core';
  foundationType: 'Raft / Mat Slab Foundation' | 'Deep Bored Piling & Grade Beams' | 'Continuous Strip Footing' | 'Reinforced Pad Footings & Tie Beams';
  facadeType: 'Unitized Glass Curtain Wall & Terracotta' | 'Natural Limestone & Architectural Concrete' | 'High-Performance EIFS & Timber Cladding' | 'Double-Skin Ventilated Facade';
  roofType: 'Standing Seam Zinc / Aluminum' | 'Intensive Green Living Roof' | 'Insulated Concrete Flat Deck with Solar PV' | 'Spanish Clay Tile on Trusses';
  mepTier: 'Standard Residential / Commercial Grade' | 'High-Efficiency VRF HVAC + Smart Building Controls' | 'Net-Zero Carbon (Geothermal/Solar PV + Smart Microgrid)';
  interiorGrade: 'Standard Commercial Finish' | 'Premium Contemporary Finish' | 'Ultra-Luxury Bespoke (Marble, Millwork, Smart Automation)' | 'Minimalist High-Spec Architectural';
}

export interface BOQItem {
  id: string;
  category: 'Substructure' | 'Superstructure' | 'Envelope & Facade' | 'Roofing' | 'MEP & HVAC' | 'Interior Finishes' | 'Site Works' | 'Prelims & Overheads';
  description: string;
  unit: string;
  quantity: number;
  unitRateUSD: number;
  totalCostUSD: number;
  spentUSD: number;
  variancePercentage: number;
  status: 'On Target' | 'Minor Overrun' | 'Favorable' | 'Critical Variance';
}

export interface ConstructionMilestone {
  id: string;
  name: string;
  phaseOrder: number;
  plannedStartDate: string;
  plannedEndDate: string;
  actualEndDate?: string;
  status: 'Completed' | 'In Progress' | 'Upcoming' | 'Delayed';
  progressPercentage: number;
  costAllocationUSD: number;
  payoutApproved: boolean;
  escrowStatus: 'Released' | 'Pending Sign-Off' | 'On Hold' | 'Not Reached';
  certificationsRequired: string[];
  certificationsCleared: boolean;
  contractorClaimUSD: number;
}

export interface SitePhotoInspection {
  id: string;
  timestamp: string;
  phaseId: string;
  phaseName: string;
  zone: string;
  imageUrl: string;
  caption: string;
  inspectedBy: string;
  aiAnalysis?: {
    overallHealth: 'Optimal' | 'Caution - Minor Deviations' | 'Critical - Immediate Action Required' | 'HUMAN_REVIEW_REQUIRED';
    completionEstimatePercent: number;
    detectedElements: string[];
    complianceScore: number;
    defectFindings: Array<{
      severity: 'Low' | 'Medium' | 'High';
      title: string;
      description: string;
      recommendation: string;
    }>;
    safetyObservations: string[];
    executiveSummary: string;
    isAiAssisted?: boolean;
    aiStatus?: string;
    disclaimer?: string;
    varianceAlert?: {
      hasAlert: boolean;
      varianceType: string;
      varianceNote: string;
    };
  };
}

export interface PeriodicLogEntry {
  id: string;
  date: string;
  cadence: MonitoringCadence;
  weather: 'Clear & Sunny (26°C)' | 'Overcast (19°C)' | 'Heavy Rain (14°C - Concrete Halted)' | 'Windy (18°C)';
  manpowerHeadcount: number;
  activeTrades: string[];
  tasksAccomplished: string[];
  materialsReceived: string[];
  safetyIncidentsCount: number;
  dailySpendUSD: number;
  author: string;
  notes: string;
}

export interface SituationReport {
  id: string;
  reportDate: string;
  cadence: MonitoringCadence;
  executiveHeadline: string;
  ownerConfidenceScore: number; // 0-100
  earnedValueAnalysis: {
    cpi: number; // Cost Performance Index
    spi: number; // Schedule Performance Index
    costVarianceAmount: number;
    scheduleVarianceDays: number;
    forecastAtCompletionStatus: string;
  };
  keyAccomplishments: string[];
  upcomingMilestones: string[];
  budgetVarianceAlerts: Array<{
    trade: string;
    status: string;
    detail: string;
    actionTaken: string;
  }>;
  ownerActionItems: string[];
  preparedBy: string;
}

export interface ConstructionProject {
  id: string;
  name: string;
  clientName: string;
  contractorName: string;
  location: string;
  startDate: string;
  targetHandoverDate: string;
  currentPhaseIndex: number;
  overallProgressPercentage: number;
  totalBaselineBudgetUSD: number;
  actualCostIncurredUSD: number;
  forecastAtCompletionUSD: number;
  confidenceScore: number;

  landSpecs: LandSpecifications;
  floorPlanSpecs: FloorPlanSpecifications;
  materialSpecs: MaterialSpecifications;

  finishedBuildingRenderUrl: string;
  finishedBuildingRenderAltViews: string[];
  proposedBuildingRenderUrl?: string;
  proposedBuildingRenderAltViews?: string[];
  proposedBuilding360Views?: Array<{ angle: number; label: string; url: string }>;
  finishedBuilding360Views?: Array<{ angle: number; label: string; url: string }>;
  panoramic360Tours?: Array<{
    id: string;
    name: string;
    type: 'exterior' | 'interior' | 'rooftop' | 'structural';
    equirectangularUrl: string;
    description: string;
  }>;
  architecturalPrompt: string;

  milestones: ConstructionMilestone[];
  boq: BOQItem[];
  sitePhotos: SitePhotoInspection[];
  periodicLogs: PeriodicLogEntry[];
  situationReports: SituationReport[];

  curveData: Array<{
    month: string;
    plannedBudget: number;
    actualSpend: number;
    earnedValue: number;
    targetProgress: number;
    actualProgress: number;
  }>;

  // Organization & Governance Fields (Sprint 03)
  organizationId?: string;
  projectType?: string;
  description?: string;
  currency?: string;
  currentStage?: string;
  ownerUserId?: string;
  status?: 'ACTIVE' | 'ARCHIVED' | 'PLANNING';
  isDemo?: boolean;
}

// Estimation and Cost Takeoff Types
export interface CalculatedTakeoff {
  concreteVolumeM3: number;
  rebarSteelTonnes: number;
  glazingAreaM2: number;
  drywallAreaM2: number;
  estimatedLaborHours: number;
  estimatedDurationMonths: number;
}

export interface CalculatedBudget {
  substructure: number;
  superstructure: number;
  enclosureGlazing: number;
  roofing: number;
  mepHvac: number;
  interiorFitout: number;
  directSubtotal: number;
  prelimsAndSupervision: number;
  contractorMargin: number;
  contingency: number;
  totalEstimatedCost: number;
  costPerSqm: number;
  takeoff: CalculatedTakeoff;
}

export interface AiEstimationInsights {
  architecturalSummary: string;
  valueEngineeringNotes: string[];
  riskFactors: string[];
  renderingVisualPrompt: string;
  recommendedPhases?: Array<{ name: string; durationWeeks: number; costSharePercent: number }>;
  constructionMethodology?: string;
  isAiAssisted?: boolean;
  disclaimer?: string;
}

export interface EstimateAndProposeResponse {
  success: boolean;
  calculatedBudget: CalculatedBudget;
  aiInsights: AiEstimationInsights;
  error?: string;
}

export interface EstimateSpecsPayload {
  projectName?: string;
  location?: string;
  landArea: number;
  grossFloorArea: number;
  floors: number;
  buildingStyle: string;
  structuralCore: string;
  foundationType: string;
  facadeType: string;
  roofType: string;
  mepTier: string;
  interiorGrade: string;
  amenities?: {
    basement?: boolean;
    pool?: boolean;
    rooftop?: boolean;
  };
}

// Structura Authentication & User Profile Domain Models (Sprint 02)
export type PrimaryRole =
  | 'OWNER_CLIENT'
  | 'SENIOR_PROJECT_DIRECTOR'
  | 'GENERAL_CONTRACTOR'
  | 'STRUCTURAL_QA_QC_AUDITOR';

export type AccountStatus = 'ACTIVE' | 'SUSPENDED' | 'PENDING';
export type IdentityStatus = 'NOT_STARTED' | 'PENDING' | 'VERIFIED' | 'REJECTED';
export type ProfessionalVerificationStatus =
  | 'NOT_REQUIRED'
  | 'NOT_STARTED'
  | 'UNVERIFIED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED'
  | 'EXPIRED';

export interface UserRoleDetails {
  entityType?: 'Individual' | 'Organization';
  country?: string;
  city?: string;
  organizationName?: string;
  intendedUse?: 'Personal Development' | 'Real Estate Development' | 'Corporate Project' | 'Public / Institutional Project' | 'Other';
  yearsExperience?: number;
  primaryDiscipline?: string;
  professionalBody?: string;
  registrationNumber?: string;
  licenseNumber?: string;
  jurisdiction?: string;
  claimedCredentials?: string;
  companyName?: string;
  yearsOperating?: number;
  specialties?: string[];
}

export interface UserProfile {
  id: string;
  authUserId: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string;
  primaryRole: PrimaryRole;
  accountStatus: AccountStatus;
  identityStatus: IdentityStatus;
  professionalVerificationStatus: ProfessionalVerificationStatus;
  roleDetails?: UserRoleDetails;
  createdAt: string;
  updatedAt: string;
}

export interface AuthSessionState {
  isAuthenticated: boolean;
  isLoading: boolean;
  user: {
    uid: string;
    email: string;
    displayName?: string;
  } | null;
  userProfile: UserProfile | null;
  idToken: string | null;
  authProviderType: 'firebase' | 'server_sandbox';
  isDeveloperDemoMode: boolean;
}

// ==========================================
// Organization Governance Domain Models (Sprint 03)
// ==========================================

export type OrganizationType =
  | 'INDIVIDUAL_DEVELOPER'
  | 'REAL_ESTATE_DEVELOPER'
  | 'CORPORATE'
  | 'INSTITUTIONAL'
  | 'PUBLIC_SECTOR'
  | 'OTHER';

export type OrganizationVerificationStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED';

export type OwnerAuthorityStatus =
  | 'NOT_STARTED'
  | 'PENDING'
  | 'VERIFIED'
  | 'REJECTED';

export type OrganizationStatus =
  | 'ACTIVE'
  | 'SUSPENDED'
  | 'ARCHIVED';

export interface Organization {
  id: string;
  name: string;
  type: OrganizationType;
  registrationNumber?: string;
  jurisdiction: string;
  country: string;
  address?: string;
  createdByUserId: string;
  ownerUserId: string;
  verificationStatus: OrganizationVerificationStatus;
  ownerAuthorityStatus: OwnerAuthorityStatus;
  status: OrganizationStatus;
  createdAt: string;
  updatedAt: string;
}

export type OrganizationRole = 'OWNER_ADMIN' | 'MEMBER';
export type MembershipStatus = 'ACTIVE' | 'INVITED' | 'SUSPENDED';

export interface OrganizationMembership {
  id: string;
  organizationId: string;
  userId: string;
  organizationRole: OrganizationRole;
  status: MembershipStatus;
  invitedByUserId?: string;
  invitedAt?: string;
  acceptedAt?: string;
  createdAt: string;
}

// ==========================================
// Project Governance Appointments (Sprint 03)
// ==========================================

export type ProjectRole =
  | 'OWNER_CLIENT'
  | 'SENIOR_PROJECT_DIRECTOR'
  | 'GENERAL_CONTRACTOR'
  | 'STRUCTURAL_QA_QC_AUDITOR';

export type AppointmentStatus =
  | 'INVITED'
  | 'ACCEPTED'
  | 'DECLINED'
  | 'ACTIVE'
  | 'REVOKED'
  | 'ENDED';

export interface ProjectAppointment {
  id: string;
  projectId: string;
  organizationId: string;
  userId: string;
  userEmail?: string;
  userName?: string;
  role: ProjectRole;
  appointmentStatus: AppointmentStatus;
  invitedByUserId: string;
  invitedAt: string;
  respondedAt?: string;
  activatedAt?: string;
  endedAt?: string;
  reason?: string;
}

// ==========================================
// Audit Event Domain Model (Sprint 03)
// ==========================================

export type AuditAction =
  | 'ORGANIZATION_CREATED'
  | 'PROJECT_CREATED'
  | 'PROJECT_INVITATION_SENT'
  | 'PROJECT_INVITATION_ACCEPTED'
  | 'PROJECT_INVITATION_DECLINED'
  | 'PROJECT_APPOINTMENT_REVOKED'
  | 'DIRECT_LINE_MESSAGE_SENT'
  | 'RFI_CREATED'
  | 'RFI_RESPONDED'
  | 'RFI_ACKNOWLEDGED'
  | 'RFI_CLOSED'
  | 'MILESTONE_CREATED'
  | 'MILESTONE_STARTED'
  | 'MILESTONE_UPDATED'
  | 'EVIDENCE_ADDED'
  | 'EVIDENCE_UPDATED'
  | 'CONTRACTOR_SUBMISSION_DRAFTED'
  | 'CONTRACTOR_SUBMISSION_SUBMITTED'
  | 'CONTRACTOR_SUBMISSION_RESUBMITTED'
  | 'TECHNICAL_REVIEW_STARTED'
  | 'TECHNICAL_REVIEW_CHANGES_REQUESTED'
  | 'TECHNICAL_SUBMISSION_ACCEPTED'
  | 'TECHNICAL_SUBMISSION_ESCALATED'
  | 'TECHNICAL_SUBMISSION_SENT_TO_QA_QC'
  | 'QA_QC_INSPECTION_STARTED'
  | 'QA_QC_INSPECTION_PASSED'
  | 'QA_QC_INSPECTION_FAILED'
  | 'NCR_CREATED'
  | 'NCR_CORRECTIVE_ACTION_SUBMITTED'
  | 'NCR_REINSPECTION_COMPLETED'
  | 'NCR_CLOSED'
  | 'AI_INSPECTION_REQUESTED'
  | 'AI_INSPECTION_COMPLETED'
  | 'AI_INSPECTION_FAILED'
  | 'OWNER_DECISION_APPROVED'
  | 'OWNER_DECISION_RETURNED'
  | 'OWNER_DECISION_REJECTED'
  | 'FINANCIAL_PROCESSING_AUTHORIZED'
  | 'PROJECT_DECISION_CREATED'
  | 'PROJECT_DECISION_PROPOSED'
  | 'PROJECT_DECISION_RECORDED'
  | 'PROJECT_DECISION_SUPERSEDED'
  | 'NOTIFICATION_READ'
  | 'PROJECT_MEMORY_SUMMARY_REQUESTED'
  | 'PROJECT_MEMORY_SUMMARY_COMPLETED'
  | 'PROJECT_MEMORY_SUMMARY_FAILED'
  | 'EXECUTIVE_REPORT_GENERATED'
  | 'CLOSEOUT_STARTED'
  | 'CLOSEOUT_ITEM_COMPLETED'
  | 'CLOSEOUT_READY_FOR_REVIEW'
  | 'CLOSEOUT_COMPLETED'
  | 'CLOSEOUT_RETURNED'
  | 'PUNCH_ITEM_CREATED'
  | 'PUNCH_ITEM_ASSIGNED'
  | 'PUNCH_ITEM_READY_FOR_VERIFICATION'
  | 'PUNCH_ITEM_VERIFIED'
  | 'PUNCH_ITEM_CLOSED'
  | 'HANDOVER_PREPARED'
  | 'HANDOVER_READY_FOR_REVIEW'
  | 'HANDOVER_RETURNED'
  | 'HANDOVER_ACCEPTED'
  | 'PROJECT_HANDOVER_COMPLETED'
  | 'AI_EXECUTIVE_BRIEFING_REQUESTED'
  | 'AI_EXECUTIVE_BRIEFING_COMPLETED'
  | 'AI_EXECUTIVE_BRIEFING_FAILED'
  | 'FINANCIAL_INSTRUCTION_CREATED'
  | 'FINANCIAL_PROCESSING_REQUESTED'
  | 'FINANCIAL_PROVIDER_UNAVAILABLE'
  | 'FINANCIAL_PROVIDER_ACCEPTED'
  | 'FINANCIAL_PROVIDER_REJECTED'
  | 'FINANCIAL_PROCESSING_FAILED'
  | 'PAYMENT_CONFIRMATION_RECEIVED'
  | 'SETTLEMENT_CONFIRMED'
  | 'FINANCIAL_RECONCILIATION_REQUIRED'
  | 'FINANCIAL_RECONCILIATION_COMPLETED';

export interface AuditEvent {
  id: string;
  actorUserId: string;
  organizationId?: string;
  projectId?: string;
  action: AuditAction;
  entityType: string;
  entityId: string;
  timestamp: string;
  metadata?: Record<string, any>;
}

// ==========================================
// Project Operations: Direct Line (Sprint 04A)
// ==========================================

export type ChannelType =
  | 'OWNER_DIRECTOR'
  | 'OWNER_QAQC'
  | 'DIRECTOR_CONTRACTOR';

export interface ProjectConversation {
  id: string;
  projectId: string;
  channelType: ChannelType;
  participantRoles: [ProjectRole, ProjectRole];
  createdAt: string;
  updatedAt: string;
  lastMessageSnippet?: string;
  lastMessageAt?: string;
}

export type DirectLineMessageType =
  | 'MESSAGE'
  | 'INFORMATION'
  | 'INSTRUCTION'
  | 'CLARIFICATION_REQUEST'
  | 'DECISION_REQUEST'
  | 'APPROVAL_REQUEST'
  | 'ESCALATION'
  | 'ACKNOWLEDGEMENT';

export interface ProjectMessage {
  id: string;
  conversationId: string;
  projectId: string;
  channelType: ChannelType;
  senderUserId: string;
  senderRole: ProjectRole;
  senderName: string;
  messageType: DirectLineMessageType;
  subject?: string;
  content: string;
  relatedEntityId?: string;
  createdAt: string;
}

// ==========================================
// Project Operations: RFI Workflow (Sprint 04A)
// ==========================================

export type RFIStatus =
  | 'OPEN'
  | 'UNDER_REVIEW'
  | 'ANSWERED'
  | 'ACKNOWLEDGED'
  | 'CLOSED';

export type RFIPriority =
  | 'LOW'
  | 'NORMAL'
  | 'HIGH'
  | 'CRITICAL';

export interface RFI {
  id: string;
  projectId: string;
  number: string;
  title: string;
  question: string;
  discipline: string;
  raisedByUserId: string;
  raisedByRole: ProjectRole;
  raisedByName: string;
  assignedToUserId: string;
  assignedToRole: ProjectRole;
  assignedToName: string;
  status: RFIStatus;
  priority: RFIPriority;
  relatedMilestoneId?: string;
  relatedEvidenceIds?: string[];
  response?: string;
  respondedByUserId?: string;
  respondedByName?: string;
  respondedAt?: string;
  acknowledgedAt?: string;
  acknowledgementNote?: string;
  closedAt?: string;
  closingNotes?: string;
  createdAt: string;
  dueAt?: string;
  updatedAt: string;
}

// ==========================================
// Project Operations: Milestones & Technical Review (Sprint 04B)
// ==========================================

export type ProjectMilestoneStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'SUBMITTED_FOR_REVIEW'
  | 'TECHNICAL_REVIEW'
  | 'QA_QC_HOLD'
  | 'READY_FOR_OWNER_REVIEW'
  | 'APPROVED'
  | 'REJECTED'
  | 'COMPLETE';

export type MilestoneDiscipline =
  | 'Substructure & Earthworks'
  | 'Structural Concrete & Frame'
  | 'Envelope & Curtain Wall'
  | 'MEP Rough-In'
  | 'Interior Fitout & Finishes'
  | 'Commissioning & Handover';

export type ContractorSubmissionStatus =
  | 'NONE'
  | 'DRAFT'
  | 'SUBMITTED'
  | 'RETURNED'
  | 'UNDER_REVIEW'
  | 'ACCEPTED'
  | 'REJECTED';

export type TechnicalReviewDecision =
  | 'REQUEST_CHANGES'
  | 'ACCEPT_TECHNICAL_SUBMISSION'
  | 'ESCALATE'
  | 'SEND_TO_QA_QC';

export type TechnicalReviewStatus =
  | 'NONE'
  | 'PENDING'
  | 'IN_REVIEW'
  | 'CHANGES_REQUESTED'
  | 'ACCEPTED'
  | 'ESCALATED'
  | 'SENT_TO_QA_QC';

export type QaQcStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PASSED'
  | 'FAILED'
  | 'ON_HOLD'
  | 'REINSPECTION_REQUIRED';

export type OwnerDecisionStatus =
  | 'NOT_REQUIRED'
  | 'PENDING'
  | 'APPROVED'
  | 'RETURNED'
  | 'REJECTED';

export type MilestoneFinancialStatus =
  | 'NOT_ELIGIBLE'
  | 'AWAITING_GOVERNANCE'
  | 'AUTHORIZED_FOR_FINANCIAL_PROCESSING'
  | 'AUTHORIZED_PENDING_SETTLEMENT'
  | 'PAID';

export interface ProjectMilestone {
  id: string;
  projectId: string;
  title: string;
  description: string;
  sequence: number;
  discipline: MilestoneDiscipline | string;
  status: ProjectMilestoneStatus;

  // Governance requirements
  requiresProjectDirectorReview: boolean;
  requiresQaQcReview: boolean;
  requiresOwnerApproval: boolean;

  // Governed workflow sub-statuses
  contractorSubmissionStatus: ContractorSubmissionStatus;
  technicalReviewStatus?: TechnicalReviewStatus;
  qaQcStatus: QaQcStatus;
  ownerDecisionStatus: OwnerDecisionStatus;
  financialStatus: MilestoneFinancialStatus;

  // Timeline & tracking
  plannedStartDate?: string;
  plannedEndDate?: string;
  startedAt?: string;
  submittedAt?: string;
  technicalReviewStartedAt?: string;
  technicalReviewCompletedAt?: string;
  qaQcCompletedAt?: string;
  ownerApprovedAt?: string;

  // Budget & Progress
  costAllocationUSD?: number;
  progressPercentage?: number;

  // Associations
  relatedEvidenceIds: string[];
  activeSubmissionId?: string;
  latestReviewId?: string;
  activeInspectionId?: string;
  activeNcrId?: string;
  latestOwnerDecisionId?: string;
  aiAnalysisId?: string;

  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: Project Evidence (Sprint 04B)
// ==========================================

export type EvidenceType =
  | 'SITE_PHOTO'
  | 'DRAWING'
  | 'DOCUMENT'
  | 'TEST_RESULT'
  | 'PROGRESS_RECORD'
  | 'TECHNICAL_ATTACHMENT'
  | 'CONTRACTOR_SUBMISSION'
  | 'OTHER';

export type EvidenceStorageProvider =
  | 'METADATA_ONLY'
  | 'LOCAL_SANDBOX'
  | 'CLOUD_STORAGE_PROVISIONAL';

export type EvidenceStorageStatus =
  | 'RECORDED_METADATA'
  | 'REFERENCED'
  | 'STORED';

export interface ProjectEvidence {
  id: string;
  projectId: string;
  milestoneId?: string;

  uploadedByUserId: string;
  uploadedByRole: ProjectRole;
  uploadedByName: string;

  evidenceType: EvidenceType;
  title: string;
  description: string;

  fileName: string;
  mimeType: string;
  fileSize: number;

  storageProvider: EvidenceStorageProvider;
  storageStatus: EvidenceStorageStatus;
  storageReference: string;

  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: Contractor Submissions (Sprint 04B)
// ==========================================

export interface ContractorMilestoneSubmission {
  id: string;
  projectId: string;
  milestoneId: string;

  submittedByUserId: string;
  submittedByRole: ProjectRole;
  submittedByName: string;

  status: ContractorSubmissionStatus;
  title: string;
  summary: string;
  contractorNotes: string;

  evidenceIds: string[];
  revisionNumber: number;

  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
  returnedAt?: string;
  acceptedAt?: string;
  rejectedAt?: string;

  technicalReviewId?: string;
  returnNotes?: string;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: Technical Review (Sprint 04B)
// ==========================================

export interface ProjectDirectorTechnicalReview {
  id: string;
  projectId: string;
  milestoneId: string;
  submissionId: string;

  reviewedByUserId: string;
  reviewedByRole: ProjectRole;
  reviewedByName: string;

  decision: TechnicalReviewDecision;
  reviewNotes: string;

  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: QA/QC Inspection (Sprint 04C)
// ==========================================

export type QAQCInspectionStatus =
  | 'PENDING'
  | 'IN_PROGRESS'
  | 'PASSED'
  | 'FAILED'
  | 'HOLD'
  | 'REINSPECTION_REQUIRED';

export type QAQCInspectionType =
  | 'STRUCTURAL'
  | 'CONCRETE_POUR'
  | 'REBAR'
  | 'WATERPROOFING'
  | 'MEP_PENETRATION'
  | 'GENERAL';

export interface QAQCInspection {
  id: string;
  projectId: string;
  milestoneId: string;
  submissionId?: string;
  technicalReviewId?: string;

  inspectorUserId: string;
  inspectorRole: ProjectRole;
  inspectorName: string;

  inspectionStatus: QAQCInspectionStatus;
  inspectionType: QAQCInspectionType | string;
  inspectionNotes: string;

  evidenceIds: string[];
  aiInspectionAnalysisId?: string;

  startedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: Non-Conformance Reports (NCR) (Sprint 04C)
// ==========================================

export type NCRStatus =
  | 'OPEN'
  | 'CORRECTIVE_ACTION_REQUIRED'
  | 'CORRECTIVE_ACTION_SUBMITTED'
  | 'REINSPECTION_REQUIRED'
  | 'CLOSED';

export type NCRSeverity =
  | 'MINOR'
  | 'MODERATE'
  | 'MAJOR'
  | 'CRITICAL';

export interface NonConformanceReport {
  id: string;
  projectId: string;
  milestoneId: string;
  inspectionId?: string;

  number: string;
  title: string;
  description: string;
  severity: NCRSeverity;

  raisedByUserId: string;
  raisedByRole: ProjectRole;
  raisedByName: string;

  assignedToUserId: string;
  assignedToRole: ProjectRole;
  assignedToName: string;

  status: NCRStatus;

  requirementReference: string;
  observedCondition: string;
  correctiveActionRequired: string;

  contractorResponse?: string;
  correctiveActionDescription?: string;
  correctiveEvidenceIds?: string[];

  reinspectionNotes?: string;

  createdAt: string;
  correctiveActionSubmittedAt?: string;
  reinspectionAt?: string;
  closedAt?: string;

  closedByUserId?: string;
  closedByName?: string;
  isDemo?: boolean;
}

// Alias for convenience
export type NCR = NonConformanceReport;

// ==========================================
// Project Operations: AI Inspection Evidence (Sprint 04C)
// ==========================================

export type AIInspectionAnalysisStatus =
  | 'PENDING'
  | 'COMPLETED'
  | 'UNAVAILABLE'
  | 'ANALYSIS_FAILED'
  | 'HUMAN_REVIEW_REQUIRED';

export interface AIInspectionAnalysis {
  id: string;
  projectId: string;
  milestoneId: string;
  inspectionId?: string;

  evidenceIds: string[];
  analysisStatus: AIInspectionAnalysisStatus;
  model: string; // strictly 'gemini-3.7-flash'

  summary: string;
  observations: string[];
  potentialIssues: string[];
  riskIndicators: string[];
  recommendations: string[];

  humanReviewRequired: boolean; // Always true: preliminary analysis only
  rawResponseText?: string;
  errorMessage?: string;

  createdAt: string;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: Owner Governance Decisions (Sprint 04C)
// ==========================================

export type OwnerDecisionType =
  | 'APPROVE'
  | 'RETURN'
  | 'REJECT';

export interface OwnerMilestoneDecision {
  id: string;
  projectId: string;
  milestoneId: string;

  decidedByUserId: string;
  decidedByRole: ProjectRole;
  decidedByName: string;

  decision: OwnerDecisionType;
  decisionNotes: string;

  financialAuthorized: boolean;
  financialStatus: MilestoneFinancialStatus;
  financialProviderStatus: 'FINANCIAL_PROVIDER_NOT_CONNECTED' | 'NOT_CONFIGURED';

  createdAt: string;
  decidedAt: string;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: Project Decisions (Sprint 04D)
// ==========================================

export type ProjectDecisionCategory =
  | 'MATERIAL_SELECTION'
  | 'DESIGN_VARIATION'
  | 'SCHEDULE_ADJUSTMENT'
  | 'BUDGET_CONTINGENCY'
  | 'SITE_LOGISTICS'
  | 'PROCUREMENT_STRATEGY'
  | 'QUALITY_COMPLIANCE'
  | 'GENERAL_GOVERNANCE';

export type ProjectDecisionStatus =
  | 'DRAFT'
  | 'PROPOSED'
  | 'DECIDED'
  | 'SUPERSEDED'
  | 'VOIDED';

export interface ProjectDecisionOption {
  id: string;
  title: string;
  description: string;
  costImpactUSD?: number;
  scheduleImpactDays?: number;
  isRecommended?: boolean;
}

export interface ProjectDecisionParticipant {
  userId: string;
  role: ProjectRole;
  name: string;
}

export interface ProjectRecordRef {
  entityType: string;
  entityId: string;
  title?: string;
  referenceCode?: string;
}

export interface ProjectDecision {
  id: string;
  projectId: string;
  number: string; // e.g. DEC-001
  title: string;
  subject: string;
  description: string;
  category: ProjectDecisionCategory;
  status: ProjectDecisionStatus;

  options?: ProjectDecisionOption[];
  selectedOptionId?: string;
  selectedOutcome?: string;
  rationale: string;

  proposedByUserId: string;
  proposedByRole: ProjectRole;
  proposedByName: string;

  decisionAuthorityUserId?: string;
  decisionAuthorityRole?: ProjectRole;
  decisionAuthorityName?: string;

  participants?: ProjectDecisionParticipant[];
  relatedRecordRefs?: ProjectRecordRef[];

  supersededByDecisionId?: string;
  supersedesDecisionId?: string;
  supersededReason?: string;

  createdAt: string;
  updatedAt: string;
  proposedAt?: string;
  decidedAt?: string;
  supersededAt?: string;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: Project Memory (Sprint 04D)
// ==========================================

export type ProjectMemorySourceType =
  | 'AUDIT_EVENT'
  | 'MILESTONE'
  | 'EVIDENCE'
  | 'SUBMISSION'
  | 'TECHNICAL_REVIEW'
  | 'QA_QC_INSPECTION'
  | 'NCR'
  | 'AI_INSPECTION'
  | 'OWNER_DECISION'
  | 'PROJECT_DECISION'
  | 'RFI'
  | 'DIRECT_LINE'
  | 'FINANCIAL_INSTRUCTION';

export type ProjectMemoryCategory =
  | 'ALL'
  | 'GOVERNANCE'
  | 'TECHNICAL'
  | 'QUALITY'
  | 'COMMUNICATION'
  | 'FINANCIAL';

export interface ProjectMemoryEntry {
  id: string;
  projectId: string;
  timestamp: string;
  sourceType: ProjectMemorySourceType;
  sourceId: string;
  eventType: string;
  category: ProjectMemoryCategory;
  title: string;
  summary: string;
  actorUserId: string;
  actorRole: ProjectRole | string;
  actorName: string;
  resultingState?: string;
  relatedMilestoneId?: string;
  milestoneId?: string;
  relatedRecordRefs?: ProjectRecordRef[];
  metadata?: Record<string, any>;
}

export interface AIMemorySummary {
  summaryId: string;
  projectId: string;
  model: string; // strictly 'gemini-3.7-flash'
  generatedAt: string;
  isAiAssisted: boolean;
  status: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED';
  executiveBriefing: string;
  keyMilestoneProgress: string[];
  activeRisksAndBlockers: string[];
  pendingDecisionsAndActions: string[];
  referencedSourcesCount: number;
  sourceRecordRefs: ProjectRecordRef[];
  disclaimer: string;
  errorMessage?: string;
}

// ==========================================
// Project Operations: In-App Notifications (Sprint 04D)
// ==========================================

export type NotificationType =
  | 'RFI_CREATED'
  | 'RFI_ASSIGNED'
  | 'RFI_ANSWERED'
  | 'SUBMISSION_RECEIVED'
  | 'TECHNICAL_REVIEW_COMPLETED'
  | 'CHANGES_REQUESTED'
  | 'QA_QC_INSPECTION_REQUIRED'
  | 'QA_QC_PASSED'
  | 'QA_QC_FAILED'
  | 'NCR_ASSIGNED'
  | 'CORRECTIVE_ACTION_SUBMITTED'
  | 'NCR_CLOSED'
  | 'OWNER_REVIEW_READY'
  | 'OWNER_DECISION_RECORDED'
  | 'PROJECT_DECISION_PROPOSED'
  | 'PROJECT_DECISION_DECIDED'
  | 'PROJECT_DECISION_SUPERSEDED'
  | 'CLOSEOUT_INITIATED'
  | 'CLOSEOUT_COMPLETED'
  | 'CLOSEOUT_RETURNED'
  | 'PUNCH_ITEM_ASSIGNED'
  | 'PUNCH_ITEM_READY_FOR_VERIFICATION'
  | 'PUNCH_ITEM_VERIFIED'
  | 'PUNCH_ITEM_CLOSED'
  | 'HANDOVER_PREPARED'
  | 'HANDOVER_READY_FOR_REVIEW'
  | 'HANDOVER_ACCEPTED'
  | 'HANDOVER_RETURNED'
  | 'SYSTEM_ANNOUNCEMENT';

export type NotificationSeverity =
  | 'INFO'
  | 'ACTION_REQUIRED'
  | 'WARNING'
  | 'CRITICAL';

export interface ProjectNotification {
  id: string;
  projectId: string;
  recipientUserId: string;
  recipientRole?: ProjectRole;
  type: NotificationType;
  title: string;
  message: string;
  severity: NotificationSeverity;
  relatedRecordType?: string;
  relatedRecordId?: string;
  isRead: boolean;
  readAt?: string;
  createdAt: string;
  isDemo?: boolean;
}

// ==========================================
// Project Operations: Punch / Outstanding Items (Sprint 05A)
// ==========================================

export type PunchItemStatus =
  | 'OPEN'
  | 'ASSIGNED'
  | 'IN_PROGRESS'
  | 'READY_FOR_VERIFICATION'
  | 'VERIFIED'
  | 'CLOSED';

export type PunchItemPriority =
  | 'LOW'
  | 'MEDIUM'
  | 'HIGH'
  | 'CRITICAL';

export type PunchItemCategory =
  | 'ARCHITECTURAL'
  | 'STRUCTURAL'
  | 'MEP'
  | 'FINISHING'
  | 'FINISH'
  | 'FINISHES'
  | 'DOCUMENTATION'
  | 'SAFETY'
  | 'GENERAL'
  | 'OTHER';

export interface PunchItem {
  id: string;
  projectId: string;
  number: string; // e.g. PUNCH-001
  milestoneId?: string;
  title: string;
  description: string;
  category: PunchItemCategory;
  priority: PunchItemPriority;
  status: PunchItemStatus;

  raisedByUserId: string;
  raisedByRole: ProjectRole;
  raisedByName: string;
  raisedAt: string;

  assignedToUserId?: string;
  assignedToRole?: ProjectRole;
  assignedToName?: string;
  assignedAt?: string;

  evidenceIds?: string[];

  resolutionDescription?: string;
  resolutionEvidenceIds?: string[];
  resolvedAt?: string;
  resolvedByUserId?: string;
  resolvedByName?: string;

  verificationNotes?: string;
  verifiedAt?: string;
  verifiedByUserId?: string;
  verifiedByName?: string;

  closedAt?: string;
  closedByUserId?: string;
  closedByName?: string;
  closingNotes?: string;

  location?: string;
  trade?: string;
  notes?: string;

  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

// Alias
export type ProjectPunchItem = PunchItem;

// ==========================================
// Project Operations: Project Closeout Domain (Sprint 05A)
// ==========================================

export type CloseoutStatus =
  | 'NOT_STARTED'
  | 'IN_PROGRESS'
  | 'READY_FOR_REVIEW'
  | 'COMPLETED'
  | 'RETURNED';

export type CloseoutCategory =
  | 'MILESTONES'
  | 'TECHNICAL_REVIEWS'
  | 'QA_QC'
  | 'NCRS'
  | 'OWNER_DECISIONS'
  | 'PROJECT_DECISIONS'
  | 'EVIDENCE'
  | 'PUNCH_ITEMS'
  | 'GOVERNANCE'
  | 'DOCUMENTATION';

export interface CloseoutChecklistItem {
  id: string;
  closeoutId: string;
  category: CloseoutCategory;
  title: string;
  description: string;
  isRequired: boolean;
  isCompleted: boolean;
  completedAt?: string;
  completedByUserId?: string;
  completedByName?: string;
  verifiedReferenceId?: string;
  notes?: string;
}

export interface ProjectCloseout {
  id: string;
  projectId: string;
  status: CloseoutStatus;

  initiatedByUserId?: string;
  initiatedByRole?: ProjectRole;
  initiatedByName?: string;
  initiatedAt?: string;

  completedByUserId?: string;
  completedByRole?: ProjectRole;
  completedByName?: string;
  completedAt?: string;

  returnedByUserId?: string;
  returnedByName?: string;
  returnedAt?: string;
  returnReason?: string;

  closeoutNotes?: string;
  summary?: string;
  checklist: CloseoutChecklistItem[];
  gateEvaluation?: CloseoutGateEvaluation;

  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface CloseoutGateEvaluation {
  canComplete: boolean;
  blockers: string[];
  gateDetails: {
    requiredMilestonesComplete: boolean;
    openBlockingNCRsCount: number;
    unresolvedQAQCCount: number;
    missingRequiredEvidenceCount: number;
    unresolvedCriticalPunchCount: number;
    allRequiredChecklistItemsPassed: boolean;
  };
}

// ==========================================
// Project Operations: Project Handover Domain (Sprint 05A)
// ==========================================

export type HandoverStatus =
  | 'NOT_READY'
  | 'IN_PREPARATION'
  | 'READY_FOR_REVIEW'
  | 'RETURNED'
  | 'ACCEPTED'
  | 'HANDOVER_COMPLETE';

export interface HandoverChecklistItem {
  id: string;
  title: string;
  description?: string;
  category: string;
  isRequired: boolean;
  isSatisfied?: boolean;
  isCompleted?: boolean;
  sourceReference?: string;
  verifiedReferenceId?: string;
  notes?: string;
  completedByUserId?: string;
  completedByName?: string;
  completedAt?: string;
}

export interface ProjectHandover {
  id: string;
  projectId: string;
  status: HandoverStatus;

  targetHandoverDate?: string;
  actualHandoverDate?: string;

  preparedByUserId?: string;
  preparedByRole?: ProjectRole;
  preparedByName?: string;
  preparedAt?: string;

  reviewedByUserId?: string;
  reviewedByRole?: ProjectRole;
  reviewedByName?: string;
  reviewedAt?: string;

  acceptedByUserId?: string;
  acceptedByRole?: ProjectRole;
  acceptedByName?: string;
  acceptedAt?: string;

  returnReason?: string;
  handoverNotes?: string;
  acceptanceNotes?: string;

  includedRecordCounts: {
    milestones: number;
    evidence: number;
    technicalReviews: number;
    qaqcInspections: number;
    ncrs: number;
    ownerDecisions: number;
    projectDecisions: number;
    rfis: number;
    punchItems: number;
    closeoutItems: number;
  };

  checklist: HandoverChecklistItem[];

  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface HandoverGateItem {
  id: string;
  name: string;
  status: 'PASSED' | 'BLOCKED' | 'PENDING' | 'ATTENTION';
  description: string;
  details?: string[];
}

export interface HandoverReadinessEvaluation {
  isReady: boolean;
  isReadyForReview?: boolean;
  blockingGatesCount?: number;
  blockers: string[];
  gates: HandoverGateItem[] | any;
}

// ==========================================
// Executive Project Reporting & Health (Sprint 05A)
// ==========================================

export type ProjectHealthStatus =
  | 'HEALTHY'
  | 'ATTENTION_REQUIRED'
  | 'AT_RISK'
  | 'BLOCKED';

export interface ProjectHealthFactor {
  id: string;
  name: string;
  category:
    | 'MILESTONES'
    | 'TECHNICAL_REVIEW'
    | 'QA_QC'
    | 'NCRS'
    | 'DECISIONS'
    | 'RFIS'
    | 'EVIDENCE'
    | 'PUNCH_LIST'
    | 'CLOSEOUT'
    | 'HANDOVER'
    | 'FINANCIAL';
  status: 'OPTIMAL' | 'ATTENTION' | 'CRITICAL' | 'BLOCKED';
  score: number; // 0 - 100
  weight: number; // Decimal weight summing to 1.0
  summary: string;
  details: string[];
  blockingItemsCount: number;
}

export interface ProjectHealthSummary {
  overallStatus: ProjectHealthStatus;
  overallScore: number; // 0 - 100
  evaluationTimestamp: string;
  executiveSummary: string;
  factors: ProjectHealthFactor[];
  criticalBlockers: string[];
  attentionItems: string[];
}

export interface MilestoneProgressSummary {
  totalMilestones: number;
  completedCount: number;
  inProgressCount: number;
  notStartedCount: number;
  blockedCount: number;
  awaitingTechnicalReviewCount: number;
  awaitingQAQCCount: number;
  awaitingOwnerReviewCount: number;
  approvedCount: number;
  financiallyAuthorizedCount: number;
  totalCostAllocationUSD: number;
  financiallyAuthorizedUSD: number;
  percentMilestonesApproved: number;
  percentMilestonesFinanciallyAuthorized: number;
}

export interface ExecutiveRiskSummary {
  totalOpenNCRs: number;
  blockingNCRsCount: number;
  failedQAQCCount: number;
  unansweredRFIsCount: number;
  unresolvedDecisionsCount: number;
  openCriticalPunchCount: number;
  missingEvidenceCount: number;
  items: Array<{
    id: string;
    type: string;
    title: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    referenceId: string;
    description: string;
    actionRequired: string;
  }>;
}

export interface ExecutiveProjectReport {
  projectId: string;
  projectName: string;
  generatedAt: string;
  generatedByUserId?: string;
  generatedByName?: string;
  health: ProjectHealthSummary;
  progress: MilestoneProgressSummary;
  risks: ExecutiveRiskSummary;
  closeoutStatus: CloseoutStatus;
  handoverStatus: HandoverStatus;
  punchItemCounts: {
    total: number;
    open: number;
    assigned: number;
    inProgress: number;
    readyForVerification: number;
    verified: number;
    closed: number;
    critical: number;
  };
  financialGovernance: {
    totalBaselineBudgetUSD: number;
    costAllocationTotalUSD: number;
    authorizedForFinancialProcessingUSD: number;
    financialProcessingStatus: string;
    note: string;
    activeInstructionsCount?: number;
    settledAmountUSD?: number;
    providerConnected?: boolean;
    requiresReconciliationCount?: number;
  };
  disclaimer: string;
}

export interface FinalProjectRecordPackage {
  project: ConstructionProject;
  report: ExecutiveProjectReport;
  records: {
    milestones: ProjectMilestone[];
    evidence: ProjectEvidence[];
    technicalReviews: ProjectDirectorTechnicalReview[];
    qaqcInspections: QAQCInspection[];
    ncrs: NonConformanceReport[];
    ownerDecisions: OwnerMilestoneDecision[];
    projectDecisions: ProjectDecision[];
    rfis: RFI[];
    punchItems: PunchItem[];
    closeout: ProjectCloseout | null;
    handover: ProjectHandover | null;
    financialInstructions?: FinancialInstruction[];
  };
  auditTrail: AuditEvent[];
  archivalStatus: 'ACTIVE_GOVERNANCE' | 'ARCHIVED';
}

export interface AIExecutiveBriefing {
  id: string;
  projectId: string;
  model: string; // strictly 'gemini-3.7-flash'
  generatedAt: string;
  isAiAssisted: boolean;
  status: 'COMPLETED' | 'UNAVAILABLE' | 'FAILED' | 'HUMAN_REVIEW_REQUIRED';
  executiveBriefing: string;
  healthDiagnosis: string;
  progressHighlights: string[];
  keyRisksAndBlockers: string[];
  closeoutAndHandoverReadiness: string;
  governanceActionsRequired: string[];
  referencedSourcesCount: number;
  sourceRecordRefs: ProjectRecordRef[];
  disclaimer: string;
  errorMessage?: string;
}

// ==========================================
// Financial Execution Domain & BMONI Provider Boundary (Sprint 05B)
// ==========================================

export type FinancialExecutionStatus =
  | 'NOT_AUTHORIZED'
  | 'AUTHORIZED_FOR_FINANCIAL_PROCESSING'
  | 'PROCESSING_NOT_STARTED'
  | 'PROCESSING'
  | 'PROVIDER_ACCEPTED'
  | 'PROVIDER_REJECTED'
  | 'PAYMENT_CONFIRMED'
  | 'SETTLEMENT_PENDING'
  | 'SETTLED'
  | 'FAILED'
  | 'CANCELLED'
  | 'REQUIRES_RECONCILIATION';

export type FinancialProviderStatus =
  | 'NOT_CONNECTED'
  | 'UNAVAILABLE'
  | 'REQUEST_CREATED'
  | 'ACCEPTED'
  | 'REJECTED'
  | 'CONFIRMED'
  | 'SETTLED'
  | 'FAILED'
  | 'UNKNOWN';

export interface SettlementRecord {
  settlementId: string;
  settledAmountUSD: number;
  settledCurrency: string;
  settledAt: string;
  providerReference: string;
  verifiedByProviderEvidence: boolean;
  evidencePayloadHash?: string;
  settlementNotes?: string;
}

export type ReconciliationStatus = 'PENDING' | 'IN_REVIEW' | 'RESOLVED' | 'DISMISSED';

export interface ReconciliationRecord {
  reconciliationId: string;
  status: ReconciliationStatus;
  reason: string;
  detectedDiscrepancy: string;
  localStatus: FinancialExecutionStatus;
  providerStatus: FinancialProviderStatus | string;
  resolutionNotes?: string;
  resolvedByUserId?: string;
  resolvedAt?: string;
  createdAt: string;
}

export interface FinancialInstruction {
  id: string;
  instructionNumber: string; // e.g. FIN-001
  projectId: string;
  milestoneId: string;
  ownerDecisionId: string;
  amountUSD: number;
  currency: string;
  contractorUserId: string;
  contractorName?: string;
  status: FinancialExecutionStatus;
  idempotencyKey: string;
  providerId: 'BMONI' | string;
  providerStatus: FinancialProviderStatus;
  providerReference?: string;
  providerTransactionId?: string;
  providerRawResponse?: Record<string, any>;
  executionNotes?: string;
  failureReason?: string;
  settlementRecord?: SettlementRecord;
  reconciliationRecord?: ReconciliationRecord;
  createdByUserId: string;
  createdByRole: ProjectRole;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  processedAt?: string;
  settledAt?: string;
  isDemo?: boolean;
}

