import fs from 'fs';
import path from 'path';
import { getFirebaseFirestore } from '../auth/firebaseAdmin';

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

export interface IAuditEventRepository {
  record(event: AuditEvent): Promise<AuditEvent>;
  listByProject(projectId: string): Promise<AuditEvent[]>;
  listByOrganization(organizationId: string): Promise<AuditEvent[]>;
  getByProjectId(projectId: string): Promise<AuditEvent[]>;
}

class FirestoreAuditEventRepository implements IAuditEventRepository {
  private getCol() {
    const firestore = getFirebaseFirestore();
    if (!firestore) throw new Error('Firestore not initialized');
    return firestore.collection('structura_audit_events');
  }

  async record(event: AuditEvent): Promise<AuditEvent> {
    await this.getCol().doc(event.id).set(event);
    return event;
  }

  async listByProject(projectId: string): Promise<AuditEvent[]> {
    const snap = await this.getCol().where('projectId', '==', projectId).orderBy('timestamp', 'desc').get();
    return snap.docs.map(d => d.data() as AuditEvent);
  }

  async getByProjectId(projectId: string): Promise<AuditEvent[]> {
    return this.listByProject(projectId);
  }

  async listByOrganization(organizationId: string): Promise<AuditEvent[]> {
    const snap = await this.getCol().where('organizationId', '==', organizationId).orderBy('timestamp', 'desc').get();
    return snap.docs.map(d => d.data() as AuditEvent);
  }
}

class FileAuditEventRepository implements IAuditEventRepository {
  private file = path.join(process.cwd(), 'data', 'audit_events.json');

  constructor() {
    this.ensureFile();
  }

  private ensureFile() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    if (!fs.existsSync(this.file)) {
      fs.writeFileSync(this.file, JSON.stringify([], null, 2));
    }
  }

  private readEvents(): AuditEvent[] {
    try {
      if (!fs.existsSync(this.file)) return [];
      const raw = fs.readFileSync(this.file, 'utf-8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  private writeEvents(events: AuditEvent[]) {
    fs.writeFileSync(this.file, JSON.stringify(events, null, 2));
  }

  async record(event: AuditEvent): Promise<AuditEvent> {
    const events = this.readEvents();
    events.unshift(event);
    this.writeEvents(events);
    return event;
  }

  async listByProject(projectId: string): Promise<AuditEvent[]> {
    const events = this.readEvents();
    return events.filter(e => e.projectId === projectId);
  }

  async getByProjectId(projectId: string): Promise<AuditEvent[]> {
    return this.listByProject(projectId);
  }

  async listByOrganization(organizationId: string): Promise<AuditEvent[]> {
    const events = this.readEvents();
    return events.filter(e => e.organizationId === organizationId);
  }
}

class HybridAuditEventRepository implements IAuditEventRepository {
  private firestore = new FirestoreAuditEventRepository();
  private file = new FileAuditEventRepository();

  private getDelegate(): IAuditEventRepository {
    if (process.env.STRUCTURA_AUTH_MODE !== 'sandbox' && getFirebaseFirestore()) {
      return this.firestore;
    }
    return this.file;
  }

  record(event: AuditEvent): Promise<AuditEvent> {
    return this.getDelegate().record(event);
  }
  listByProject(projectId: string): Promise<AuditEvent[]> {
    return this.getDelegate().listByProject(projectId);
  }
  getByProjectId(projectId: string): Promise<AuditEvent[]> {
    return this.getDelegate().getByProjectId(projectId);
  }
  listByOrganization(organizationId: string): Promise<AuditEvent[]> {
    return this.getDelegate().listByOrganization(organizationId);
  }
}

export const auditEventRepository = new HybridAuditEventRepository();
