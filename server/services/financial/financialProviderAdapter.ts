import { FinancialInstruction, FinancialProviderStatus } from '../../../src/types';

export interface ProviderSubmissionRequest {
  instructionId: string;
  instructionNumber: string;
  projectId: string;
  milestoneId?: string;
  amountUSD: number;
  currency: string;
  recipientUserId: string;
  recipientName?: string;
  idempotencyKey: string;
  governanceReference?: string; // Owner decision reference
  metadata?: Record<string, any>;
}

export interface ProviderSubmissionResponse {
  success: boolean;
  status: 'ACCEPTED' | 'REJECTED' | 'UNAVAILABLE' | 'FAILED';
  providerReference?: string;
  providerTransactionId?: string;
  providerStatus: FinancialProviderStatus;
  isSettled?: boolean;
  errorMessage?: string;
  rawResponse?: Record<string, any>;
}

export interface WebhookEventPayload {
  eventId: string;
  eventType: string;
  instructionId?: string;
  providerReference?: string;
  providerTransactionId?: string;
  status: 'ACCEPTED' | 'REJECTED' | 'PAYMENT_CONFIRMED' | 'SETTLED' | 'FAILED';
  amountUSD?: number;
  currency?: string;
  settledAt?: string;
  notes?: string;
  rawPayload: Record<string, any>;
}

export interface WebhookVerificationResult {
  verified: boolean;
  error?: string;
  event?: WebhookEventPayload;
}

export interface ReconciliationResult {
  instructionId: string;
  isConsistent: boolean;
  localStatus: string;
  providerStatus: string;
  discrepancy?: string;
  providerReference?: string;
  details?: Record<string, any>;
}

export interface IFinancialProviderAdapter {
  readonly providerId: string;
  isConfigured(): boolean;
  getConnectionStatus(): {
    status: 'NOT_CONNECTED' | 'CONNECTED' | 'UNAVAILABLE';
    reason?: string;
    provider: string;
  };
  submitInstruction(request: ProviderSubmissionRequest): Promise<ProviderSubmissionResponse>;
  verifyWebhook(payload: any, headers: Record<string, any>): Promise<WebhookVerificationResult>;
  reconcile(instruction: FinancialInstruction): Promise<ReconciliationResult>;
}
