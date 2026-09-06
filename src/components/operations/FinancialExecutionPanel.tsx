import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Clock,
  RefreshCw,
  Send,
  Sparkles,
  Info,
  Building2,
  Lock,
  ExternalLink,
  HelpCircle,
  FileText,
  AlertCircle,
} from 'lucide-react';
import {
  FinancialInstruction,
  ProjectMilestone,
  ProjectRole,
} from '../../types';
import { useAuth } from '../../context/AuthContext';

interface FinancialExecutionPanelProps {
  projectId: string;
  isDemo?: boolean;
}

interface ProviderStatusResponse {
  status: 'UNAVAILABLE' | 'NOT_CONNECTED' | 'CONNECTED';
  provider: string;
  reason?: string;
  truthfulStatement: string;
}

interface AIExplanation {
  explanation: string;
  isEligibleForFinancialProcessing: boolean;
  blockers: string[];
  governanceStatus: string;
  providerStatus: string;
  isAiAssisted: boolean;
  disclaimer: string;
}

export const FinancialExecutionPanel: React.FC<FinancialExecutionPanelProps> = ({
  projectId,
  isDemo,
}) => {
  const { userProfile, user, idToken } = useAuth();
  const [instructions, setInstructions] = useState<FinancialInstruction[]>([]);
  const [milestones, setMilestones] = useState<ProjectMilestone[]>([]);
  const [providerStatus, setProviderStatus] = useState<ProviderStatusResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [userRole, setUserRole] = useState<ProjectRole | null>(null);

  // Modals & action states
  const [selectedMilestoneId, setSelectedMilestoneId] = useState<string>('');
  const [creationNotes, setCreationNotes] = useState('');
  const [creatingInstruction, setCreatingInstruction] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [simulatedMode, setSimulatedMode] = useState(false);

  // AI explainer states
  const [explainingMilestoneId, setExplainingMilestoneId] = useState<string | null>(null);
  const [aiExplanation, setAiExplanation] = useState<AIExplanation | null>(null);
  const [aiLoading, setAiLoading] = useState(false);

  // Reconciliation modal state
  const [reconcilingId, setReconcilingId] = useState<string | null>(null);
  const [reconciliationResolution, setReconciliationResolution] = useState<'MATCHED' | 'DISCREPANCY_NOTED' | 'OVERRIDDEN'>('MATCHED');
  const [reconciliationNotes, setReconciliationNotes] = useState('');
  const [resolvingReconciliation, setResolvingReconciliation] = useState(false);

  // Fetch role
  const fetchUserRole = useCallback(async () => {
    try {
      const res = await fetch(`/api/projects/${projectId}/access`, {
        headers: { Authorization: `Bearer ${idToken}` },
      });
      if (res.ok) {
        const data = await res.json();
        setUserRole(data.userRole || null);
      }
    } catch {
      // Fallback to userProfile
      const r = (userProfile as any)?.projectRole || (userProfile as any)?.role;
      if (r) setUserRole(r);
    }
  }, [projectId, idToken, userProfile]);

  // Fetch provider status
  const fetchProviderStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/financial/provider-status`);
      if (res.ok) {
        const data = await res.json();
        setProviderStatus(data);
      }
    } catch {
      setProviderStatus({
        status: 'NOT_CONNECTED',
        provider: 'BMONI External Adapter',
        truthfulStatement: 'BMONI integration boundary active. No mock transfers.',
      });
    }
  }, []);

  // Fetch instructions & milestones
  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [instRes, msRes] = await Promise.all([
        fetch(`/api/projects/${projectId}/financial-instructions`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
        fetch(`/api/projects/${projectId}/milestones`, {
          headers: { Authorization: `Bearer ${idToken}` },
        }),
      ]);

      if (instRes.ok) {
        const instData = await instRes.json();
        setInstructions(instData.data || []);
      } else {
        const err = await instRes.json();
        setError(err.error || 'Failed to fetch financial instructions');
      }

      if (msRes.ok) {
        const msData = await msRes.json();
        setMilestones(msData.milestones || msData.data || []);
      }
    } catch (e: any) {
      setError(e.message || 'Error fetching financial data');
    } finally {
      setLoading(false);
    }
  }, [projectId, idToken]);

  useEffect(() => {
    fetchUserRole();
    fetchProviderStatus();
    fetchData();
  }, [fetchUserRole, fetchProviderStatus, fetchData]);

  // Create financial instruction
  const handleCreateInstruction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedMilestoneId) return;

    setCreatingInstruction(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const idempotencyKey = `fin-req-${projectId}-${selectedMilestoneId}-${Date.now()}`;
      const res = await fetch(`/api/projects/${projectId}/financial-instructions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({
          milestoneId: selectedMilestoneId,
          idempotencyKey,
          governanceNotes: creationNotes,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to create financial instruction');
      }

      setSuccessMsg(`Financial instruction ${data.data?.instructionNumber || ''} created successfully.`);
      setSelectedMilestoneId('');
      setCreationNotes('');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to create financial instruction');
    } finally {
      setCreatingInstruction(false);
    }
  };

  // Dispatch instruction to provider
  const handleProcessInstruction = async (instructionId: string) => {
    setProcessingId(instructionId);
    setError(null);
    setSuccessMsg(null);

    try {
      const idempotencyKey = `proc-${instructionId}-${Date.now()}`;
      const res = await fetch(
        `/api/projects/${projectId}/financial-instructions/${instructionId}/process`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            idempotencyKey,
            simulatedMode,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to process financial instruction');
      }

      setSuccessMsg(
        `Provider instruction dispatched. Outcome: ${data.data?.providerStatus}. Status: ${data.data?.status}`
      );
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to process instruction');
    } finally {
      setProcessingId(null);
    }
  };

  // AI Financial Explainer
  const handleAiExplain = async (milestoneId: string) => {
    setExplainingMilestoneId(milestoneId);
    setAiLoading(true);
    setAiExplanation(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/milestones/${milestoneId}/ai-financial-explanation`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${idToken}`,
          },
        }
      );

      const data = await res.json();
      if (res.ok) {
        setAiExplanation(data.data);
      } else {
        setError(data.error || 'Failed to generate AI financial explanation');
      }
    } catch (err: any) {
      setError(err.message || 'Error generating explanation');
    } finally {
      setAiLoading(false);
    }
  };

  // Resolve reconciliation
  const handleResolveReconciliation = async (instructionId: string) => {
    setResolvingReconciliation(true);
    setError(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(
        `/api/projects/${projectId}/financial-instructions/${instructionId}/resolve-reconciliation`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${idToken}`,
          },
          body: JSON.stringify({
            resolutionNotes: reconciliationNotes,
            resolutionAction: reconciliationResolution,
          }),
        }
      );

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to resolve reconciliation');
      }

      setSuccessMsg('Reconciliation resolved and recorded in audit trail.');
      setReconcilingId(null);
      setReconciliationNotes('');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to resolve reconciliation');
    } finally {
      setResolvingReconciliation(false);
    }
  };

  // Milestones authorized for financial processing that don't have an instruction yet
  const existingMilestoneIds = new Set(instructions.map((i) => i.milestoneId));
  const authorizedMilestones = milestones.filter(
    (m) =>
      m.financialStatus === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING' &&
      !existingMilestoneIds.has(m.id)
  );

  const isOwner = userRole === 'OWNER_CLIENT';
  const isContractor = userRole === 'GENERAL_CONTRACTOR';
  const isDirector = userRole === 'SENIOR_PROJECT_DIRECTOR';

  // Metrics
  const totalCostAllocationUSD = milestones.reduce((sum, m) => sum + (m.costAllocationUSD || 0), 0);
  const authorizedAmountUSD = milestones
    .filter((m) => m.financialStatus === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING')
    .reduce((sum, m) => sum + (m.costAllocationUSD || 0), 0);
  const instructionsAmountUSD = instructions.reduce((sum, i) => sum + i.amountUSD, 0);
  const settledAmountUSD = instructions
    .filter((i) => i.status === 'SETTLED')
    .reduce((sum, i) => sum + i.amountUSD, 0);

  return (
    <div className="space-y-6">
      {/* Truthful Boundary Banner */}
      <div className="bg-slate-900 border border-slate-700 text-white rounded-2xl p-5 shadow-lg relative overflow-hidden">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wider uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                <DollarSign className="w-3 h-3" />
                <span>Financial Execution Readiness</span>
              </span>
              <span
                className={`px-2 py-0.5 rounded text-[10px] font-mono border ${
                  providerStatus?.status === 'CONNECTED'
                    ? 'bg-emerald-950 text-emerald-300 border-emerald-700'
                    : 'bg-amber-950/80 text-amber-300 border-amber-800'
                }`}
              >
                BMONI: {providerStatus?.status || 'NOT_CONNECTED'}
              </span>
            </div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              Governed Construction Authorization → Financial Execution Boundary
            </h2>
            <p className="text-xs text-slate-300 max-w-3xl leading-relaxed">
              <strong className="text-emerald-400">STRUCTURA</strong> determines <em className="italic">WHY</em> a payment is authorized via governed milestone acceptance.
              <br />
              <strong className="text-indigo-400">BMONI</strong> is the external financial provider determining <em className="italic">HOW</em> authorized money moves.
            </p>
          </div>

          <div className="bg-slate-800/80 border border-slate-700 p-3 rounded-xl shrink-0 text-right space-y-1">
            <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
              Truthful Settlement Rule
            </div>
            <div className="text-[11px] font-mono text-amber-300">
              AUTHORIZED ≠ PAID ≠ SETTLED
            </div>
            <div className="text-[10px] text-slate-400">
              Settlement requires verified provider evidence
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 rounded-xl bg-red-50 text-red-700 border border-red-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold">×</button>
        </div>
      )}

      {successMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-500 hover:text-emerald-700 font-bold">×</button>
        </div>
      )}

      {/* Financial Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Total Project Budget
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            ${totalCostAllocationUSD.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {milestones.length} defined milestones
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Authorized for Processing
          </div>
          <div className="text-2xl font-bold text-indigo-600 mt-1">
            ${authorizedAmountUSD.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {milestones.filter((m) => m.financialStatus === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING').length} milestones approved by Owner
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Dispatched Instructions
          </div>
          <div className="text-2xl font-bold text-slate-900 mt-1">
            ${instructionsAmountUSD.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {instructions.length} financial instruction(s)
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-xs border border-slate-200 p-4">
          <div className="text-[11px] font-medium text-slate-500 uppercase tracking-wider">
            Authoritatively Settled
          </div>
          <div className="text-2xl font-bold text-emerald-600 mt-1">
            ${settledAmountUSD.toLocaleString()}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {instructions.filter((i) => i.status === 'SETTLED').length} settled via verified provider evidence
          </div>
        </div>
      </div>

      {/* Owner Creation Section */}
      {isOwner && (
        <div className="bg-white rounded-2xl shadow-xs border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <Send className="w-4 h-4 text-indigo-600" />
              Create Governed Financial Instruction
            </h3>
            <span className="text-xs text-indigo-600 font-semibold bg-indigo-50 px-2.5 py-1 rounded-full border border-indigo-100">
              Owner Client Authority
            </span>
          </div>

          <p className="text-xs text-slate-600">
            Dispatch a formally authorized financial instruction to the external provider adapter for an accepted milestone. Idempotency is enforced.
          </p>

          {authorizedMilestones.length === 0 ? (
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">
              No pending milestones currently authorized for financial processing. Milestones must complete Contractor Submission, Technical Review, QA/QC Audit, and Owner Approval first.
            </div>
          ) : (
            <form onSubmit={handleCreateInstruction} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Select Authorized Milestone
                  </label>
                  <select
                    value={selectedMilestoneId}
                    onChange={(e) => setSelectedMilestoneId(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                    required
                  >
                    <option value="">-- Choose Authorized Milestone --</option>
                    {authorizedMilestones.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.title} — ${(m.costAllocationUSD || 0).toLocaleString()} USD ({m.discipline})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Governance Authorization Notes (Optional)
                  </label>
                  <input
                    type="text"
                    value={creationNotes}
                    onChange={(e) => setCreationNotes(e.target.value)}
                    placeholder="e.g., Authorized per Owner milestone decision approval"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-2">
                <span className="text-[11px] text-slate-500 font-mono">
                  Idempotency Key auto-generated on submission
                </span>
                <button
                  type="submit"
                  disabled={creatingInstruction || !selectedMilestoneId}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-2 disabled:opacity-50"
                >
                  <Send className="w-3.5 h-3.5" />
                  {creatingInstruction ? 'Dispatching Instruction...' : 'Create Financial Instruction'}
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Contractor Notice if Contractor */}
      {isContractor && (
        <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-800 flex items-center gap-2">
          <Info className="w-4 h-4 shrink-0 text-amber-600" />
          <span>
            <strong>General Contractor Visibility:</strong> You have read-only visibility into payment authorizations relating to your work. Financial instructions are created and dispatched exclusively under Owner Client authority.
          </span>
        </div>
      )}

      {/* Financial Instructions Register */}
      <div className="bg-white rounded-2xl shadow-xs border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <FileText className="w-4 h-4 text-slate-600" />
              Financial Instructions Register
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Governed financial records, external provider statuses, and verified settlement evidence.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {isOwner && (
              <label className="flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer bg-slate-100 px-2.5 py-1.5 rounded-lg border border-slate-200">
                <input
                  type="checkbox"
                  checked={simulatedMode}
                  onChange={(e) => setSimulatedMode(e.target.checked)}
                  className="rounded text-indigo-600"
                />
                <span>Simulate Provider (for testing)</span>
              </label>
            )}
            <button
              onClick={fetchData}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors"
              title="Refresh Register"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {loading ? (
          <div className="p-12 text-center text-xs text-slate-500">
            <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-slate-400" />
            Loading financial instructions...
          </div>
        ) : instructions.length === 0 ? (
          <div className="p-12 text-center text-xs text-slate-500">
            No financial instructions have been issued for this project yet.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {instructions.map((inst) => {
              const isSettled = inst.status === 'SETTLED';
              const isRequiresReconciliation = inst.status === 'REQUIRES_RECONCILIATION';
              const isFailed = inst.status === 'FAILED';
              const isReadyToProcess = inst.status === 'AUTHORIZED_FOR_FINANCIAL_PROCESSING' || inst.status === 'PROCESSING_NOT_STARTED';

              return (
                <div key={inst.id} className="p-5 hover:bg-slate-50/50 transition-colors space-y-3">
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 flex-wrap">
                      <span className="font-mono text-xs font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        {inst.instructionNumber}
                      </span>

                      {/* Structura Workflow Status */}
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider border ${
                          isSettled
                            ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                            : isRequiresReconciliation
                            ? 'bg-amber-100 text-amber-800 border-amber-300'
                            : isFailed
                            ? 'bg-red-100 text-red-800 border-red-300'
                            : 'bg-indigo-100 text-indigo-800 border-indigo-200'
                        }`}
                      >
                        {inst.status}
                      </span>

                      {/* Provider Status */}
                      <span className="text-[10px] font-mono text-slate-500 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                        Provider: {inst.providerStatus}
                      </span>

                      {inst.isDemo && (
                        <span className="text-[9px] font-mono bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded">
                          SANDBOX
                        </span>
                      )}
                    </div>

                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-900">
                        ${inst.amountUSD.toLocaleString()} USD
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-600">
                    <div>
                      <span className="text-slate-400">Milestone:</span>{' '}
                      <strong className="text-slate-800">
                        {milestones.find((m) => m.id === inst.milestoneId)?.title || inst.milestoneId}
                      </strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Contractor:</span>{' '}
                      <strong className="text-slate-800">{inst.contractorName || 'Assigned Contractor'}</strong>
                    </div>
                    <div>
                      <span className="text-slate-400">Authorized By:</span>{' '}
                      <strong className="text-slate-800">{inst.createdByName}</strong>
                    </div>
                  </div>

                  {(inst.providerTransactionId || inst.providerReference) && (
                    <div className="text-[11px] font-mono text-slate-500 bg-slate-50 p-2 rounded border border-slate-200 flex items-center justify-between">
                      <span>Provider Ref: {inst.providerTransactionId || inst.providerReference}</span>
                      {inst.settledAt && (
                        <span className="text-emerald-700 font-semibold">
                          Settled At: {new Date(inst.settledAt).toLocaleString()}
                        </span>
                      )}
                    </div>
                  )}

                  {inst.reconciliationRecord && (
                    <div className="text-xs bg-amber-50 text-amber-900 p-2.5 rounded-lg border border-amber-200 space-y-1">
                      <div className="font-semibold flex items-center gap-1.5 text-amber-800">
                        <AlertTriangle className="w-3.5 h-3.5" />
                        Reconciliation Record: {inst.reconciliationRecord.reason}
                      </div>
                      <div className="text-[11px] text-amber-700">
                        Status: {inst.reconciliationRecord.status} • Recorded: {new Date(inst.reconciliationRecord.createdAt).toLocaleString()}
                      </div>
                      {inst.reconciliationRecord.resolutionNotes && (
                        <div className="text-[11px] text-slate-700 italic">
                          Resolution: {inst.reconciliationRecord.resolutionNotes}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Actions Row */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {/* AI Explainer Button */}
                      <button
                        onClick={() => handleAiExplain(inst.milestoneId)}
                        disabled={aiLoading && explainingMilestoneId === inst.milestoneId}
                        className="text-xs text-purple-700 hover:text-purple-900 bg-purple-50 hover:bg-purple-100 px-2.5 py-1 rounded-md border border-purple-200 flex items-center gap-1.5 transition-colors disabled:opacity-50"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-purple-600" />
                        <span>AI Financial Status Explainer</span>
                      </button>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Process button for Owner */}
                      {isOwner && isReadyToProcess && (
                        <button
                          onClick={() => handleProcessInstruction(inst.id)}
                          disabled={processingId === inst.id}
                          className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors flex items-center gap-1.5 disabled:opacity-50"
                        >
                          <Send className="w-3 h-3" />
                          <span>{processingId === inst.id ? 'Dispatching...' : 'Dispatch to Provider'}</span>
                        </button>
                      )}

                      {/* Reconcile button if discrepancy or owner desires status check */}
                      {isOwner && !isSettled && (
                        <button
                          onClick={() => setReconcilingId(inst.id)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg border border-slate-300 transition-colors flex items-center gap-1"
                        >
                          <RefreshCw className="w-3 h-3" />
                          <span>Reconcile</span>
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* AI Explanation Modal */}
      {aiExplanation && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-slate-900 text-white border border-purple-500/40 rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-purple-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-purple-300">
                  AI Financial Governance Advisor
                </h3>
              </div>
              <button
                onClick={() => setAiExplanation(null)}
                className="text-slate-400 hover:text-white text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <div className="p-4 bg-slate-800/80 rounded-xl border border-slate-700 text-xs text-slate-200 leading-relaxed">
              {aiExplanation.explanation}
            </div>

            {aiExplanation.blockers.length > 0 && (
              <div className="p-3 bg-red-950/40 border border-red-800/40 rounded-lg text-xs space-y-1">
                <div className="font-semibold text-red-300">Remaining Governance Blockers:</div>
                <ul className="list-disc list-inside text-red-200/90 text-[11px] space-y-0.5">
                  {aiExplanation.blockers.map((b, idx) => (
                    <li key={idx}>{b}</li>
                  ))}
                </ul>
              </div>
            )}

            <div className="text-[10px] text-slate-400 italic pt-2 border-t border-slate-800">
              {aiExplanation.disclaimer}
            </div>
          </div>
        </div>
      )}

      {/* Reconciliation Modal */}
      {reconcilingId && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                <RefreshCw className="w-4 h-4 text-indigo-600" />
                Audit Reconciliation Resolution
              </h3>
              <button
                onClick={() => setReconcilingId(null)}
                className="text-slate-400 hover:text-slate-700 text-lg font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Record a formal reconciliation finding for this financial instruction. All actions are written to the permanent audit trail.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Resolution Action
                </label>
                <select
                  value={reconciliationResolution}
                  onChange={(e) => setReconciliationResolution(e.target.value as any)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300"
                >
                  <option value="MATCHED">MATCHED (Provider record aligned)</option>
                  <option value="DISCREPANCY_NOTED">DISCREPANCY_NOTED (Pending investigation)</option>
                  <option value="OVERRIDDEN">OVERRIDDEN (Owner governed override)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Resolution Notes
                </label>
                <textarea
                  value={reconciliationNotes}
                  onChange={(e) => setReconciliationNotes(e.target.value)}
                  placeholder="Document the resolution rationale, provider transaction reference, or reconciliation outcome..."
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 h-24"
                  required
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setReconcilingId(null)}
                className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => handleResolveReconciliation(reconcilingId)}
                disabled={resolvingReconciliation || !reconciliationNotes}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors disabled:opacity-50"
              >
                {resolvingReconciliation ? 'Resolving...' : 'Confirm Resolution'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
