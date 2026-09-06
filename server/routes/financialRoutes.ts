import { Router } from 'express';
import { requireAuth } from '../middleware/authMiddleware';
import { financialExecutionService } from '../services/financialExecutionService';
import {
  createFinancialInstructionSchema,
  processFinancialInstructionSchema,
  reconcileInstructionSchema,
  resolveReconciliationSchema,
  bmoniWebhookSchema,
} from '../validation/schemas';

export const financialRouter = Router();

// 1. Get truthful provider connection status
financialRouter.get('/financial/provider-status', async (_req, res) => {
  try {
    const status = financialExecutionService.getProviderStatus();
    res.json({ success: true, ...status });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.error || err.message || 'Failed to retrieve provider status',
      code: err.code || 'PROVIDER_STATUS_ERROR',
    });
  }
});

// 2. List financial instructions for project (role-scoped visibility)
financialRouter.get('/projects/:projectId/financial-instructions', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.uid;

    const instructions = await financialExecutionService.listInstructions(projectId, userId);
    res.json({ success: true, instructions });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.error || err.message || 'Failed to list financial instructions',
      code: err.code || 'FINANCIAL_LIST_ERROR',
    });
  }
});

// 3. Get single financial instruction
financialRouter.get('/projects/:projectId/financial-instructions/:instructionId', requireAuth, async (req, res) => {
  try {
    const { projectId, instructionId } = req.params;
    const userId = req.user!.uid;

    const instruction = await financialExecutionService.getInstruction(projectId, instructionId, userId);
    res.json({ success: true, instruction });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.error || err.message || 'Failed to get financial instruction',
      code: err.code || 'FINANCIAL_GET_ERROR',
    });
  }
});

// 4. Create financial instruction (Owner only, requires AUTHORIZED_FOR_FINANCIAL_PROCESSING milestone)
financialRouter.post('/projects/:projectId/financial-instructions', requireAuth, async (req, res) => {
  try {
    const { projectId } = req.params;
    const userId = req.user!.uid;

    const parsed = createFinancialInstructionSchema.parse(req.body);
    const instruction = await financialExecutionService.createFinancialInstruction(projectId, userId, parsed);
    res.status(201).json({ success: true, instruction });
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'ZodError' ? 400 : 500);
    res.status(status).json({
      error: err.error || err.message || 'Failed to create financial instruction',
      code: err.code || 'FINANCIAL_INSTRUCTION_CREATE_ERROR',
      details: err.issues || undefined,
    });
  }
});

// 5. Submit instruction to external provider (BMONI boundary)
financialRouter.post('/projects/:projectId/financial-instructions/:instructionId/process', requireAuth, async (req, res) => {
  try {
    const { projectId, instructionId } = req.params;
    const userId = req.user!.uid;

    processFinancialInstructionSchema.parse(req.body || {});
    const instruction = await financialExecutionService.processFinancialInstruction(projectId, instructionId, userId);
    res.json({ success: true, instruction });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.error || err.message || 'Failed to process financial instruction',
      code: err.code || 'FINANCIAL_PROCESS_ERROR',
    });
  }
});

// 6. Initiate reconciliation against provider
financialRouter.post('/projects/:projectId/financial-instructions/:instructionId/reconcile', requireAuth, async (req, res) => {
  try {
    const { projectId, instructionId } = req.params;
    const userId = req.user!.uid;

    const parsed = reconcileInstructionSchema.parse(req.body || {});
    const instruction = await financialExecutionService.reconcileInstruction(projectId, instructionId, userId, parsed);
    res.json({ success: true, instruction });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      error: err.error || err.message || 'Failed to reconcile financial instruction',
      code: err.code || 'FINANCIAL_RECONCILE_ERROR',
    });
  }
});

// 7. Resolve reconciliation discrepancy with formal rationale
financialRouter.post('/projects/:projectId/financial-instructions/:instructionId/resolve-reconciliation', requireAuth, async (req, res) => {
  try {
    const { projectId, instructionId } = req.params;
    const userId = req.user!.uid;

    const parsed = resolveReconciliationSchema.parse(req.body);
    const instruction = await financialExecutionService.resolveReconciliation(projectId, instructionId, userId, parsed);
    res.json({ success: true, instruction });
  } catch (err: any) {
    const status = err.statusCode || (err.name === 'ZodError' ? 400 : 500);
    res.status(status).json({
      error: err.error || err.message || 'Failed to resolve financial reconciliation',
      code: err.code || 'FINANCIAL_RESOLVE_RECONCILIATION_ERROR',
      details: err.issues || undefined,
    });
  }
});

// 8. BMONI Provider Webhook (Cryptographically verified)
financialRouter.post('/financial/webhooks/bmoni', async (req, res) => {
  try {
    const parsedPayload = bmoniWebhookSchema.parse(req.body);
    const result = await financialExecutionService.handleProviderWebhook(parsedPayload, req.headers);
    res.json(result);
  } catch (err: any) {
    const status = err.statusCode || 401;
    res.status(status).json({
      success: false,
      error: err.error || err.message || 'Webhook processing failed',
      code: err.code || 'WEBHOOK_ERROR',
    });
  }
});

// 9. AI Financial Governance Explainer (Sprint 05B AI Boundary)
financialRouter.post('/projects/:projectId/milestones/:milestoneId/ai-financial-explanation', requireAuth, async (req, res) => {
  try {
    const result = await financialExecutionService.explainFinancialStatusWithAI(
      req.params.projectId,
      req.params.milestoneId,
      req.user!.uid
    );
    res.json({ success: true, data: result });
  } catch (err: any) {
    const status = err.statusCode || 500;
    res.status(status).json({
      success: false,
      error: err.error || err.message || 'Failed to generate financial explanation',
      code: err.code || 'AI_FINANCIAL_EXPLANATION_ERROR',
    });
  }
});
