import fs from 'fs';
import path from 'path';
import { getFirebaseFirestore } from '../auth/firebaseAdmin';
import { FinancialInstruction } from '../../src/types';

export interface IFinancialInstructionRepository {
  createInstruction(instruction: FinancialInstruction): Promise<FinancialInstruction>;
  getInstructionById(id: string): Promise<FinancialInstruction | null>;
  getInstructionByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<FinancialInstruction | null>;
  getInstructionByMilestoneId(milestoneId: string): Promise<FinancialInstruction | null>;
  listInstructionsByProject(projectId: string): Promise<FinancialInstruction[]>;
  updateInstruction(id: string, updates: Partial<FinancialInstruction>): Promise<FinancialInstruction | null>;
  getNextInstructionNumber(projectId: string): Promise<string>;
  countInstructions(projectId: string): Promise<number>;
}

export const INITIAL_DEMO_FINANCIAL_INSTRUCTIONS: FinancialInstruction[] = [];

class FinancialInstructionRepository implements IFinancialInstructionRepository {
  private filePath: string;
  private cache: Map<string, FinancialInstruction> = new Map();
  private isLoaded = false;

  constructor() {
    const dataDir = path.join(process.cwd(), 'data');
    if (!fs.existsSync(dataDir)) {
      try {
        fs.mkdirSync(dataDir, { recursive: true });
      } catch (e) {
        // Ignored
      }
    }
    this.filePath = path.join(dataDir, 'financial_instructions.json');
    this.ensureLoaded();
  }

  private ensureLoaded(): void {
    if (this.isLoaded) return;
    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, 'utf-8');
        const items: FinancialInstruction[] = JSON.parse(raw);
        items.forEach((item) => this.cache.set(item.id, item));
      } else {
        INITIAL_DEMO_FINANCIAL_INSTRUCTIONS.forEach((item) => this.cache.set(item.id, item));
        this.persist();
      }
    } catch (e) {
      console.warn('[FinancialInstructionRepository] Failed to read from disk, using empty cache', e);
    }
    this.isLoaded = true;
  }

  private persist(): void {
    try {
      const items = Array.from(this.cache.values());
      fs.writeFileSync(this.filePath, JSON.stringify(items, null, 2), 'utf-8');
    } catch (e) {
      console.warn('[FinancialInstructionRepository] Failed to persist to disk', e);
    }
  }

  async createInstruction(instruction: FinancialInstruction): Promise<FinancialInstruction> {
    this.ensureLoaded();
    this.cache.set(instruction.id, instruction);
    this.persist();

    const db = getFirebaseFirestore();
    if (db) {
      try {
        await db.collection('financial_instructions').doc(instruction.id).set(instruction);
      } catch (e) {
        console.warn('[FinancialInstructionRepository] Firestore sync failed:', e);
      }
    }
    return instruction;
  }

  async getInstructionById(id: string): Promise<FinancialInstruction | null> {
    this.ensureLoaded();
    const item = this.cache.get(id);
    if (item) return item;

    const db = getFirebaseFirestore();
    if (db) {
      try {
        const doc = await db.collection('financial_instructions').doc(id).get();
        if (doc.exists) {
          const fetched = doc.data() as FinancialInstruction;
          this.cache.set(fetched.id, fetched);
          return fetched;
        }
      } catch (e) {
        // Ignored
      }
    }
    return null;
  }

  async getInstructionByIdempotencyKey(projectId: string, idempotencyKey: string): Promise<FinancialInstruction | null> {
    this.ensureLoaded();
    for (const item of this.cache.values()) {
      if (item.projectId === projectId && item.idempotencyKey === idempotencyKey) {
        return item;
      }
    }
    return null;
  }

  async getInstructionByMilestoneId(milestoneId: string): Promise<FinancialInstruction | null> {
    this.ensureLoaded();
    for (const item of this.cache.values()) {
      if (item.milestoneId === milestoneId) {
        return item;
      }
    }
    return null;
  }

  async listInstructionsByProject(projectId: string): Promise<FinancialInstruction[]> {
    this.ensureLoaded();
    const results: FinancialInstruction[] = [];
    for (const item of this.cache.values()) {
      if (item.projectId === projectId) {
        results.push(item);
      }
    }
    return results.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
  }

  async listByProject(projectId: string): Promise<FinancialInstruction[]> {
    return this.listInstructionsByProject(projectId);
  }

  async updateInstruction(id: string, updates: Partial<FinancialInstruction>): Promise<FinancialInstruction | null> {
    this.ensureLoaded();
    const existing = await this.getInstructionById(id);
    if (!existing) return null;

    const updated: FinancialInstruction = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.cache.set(id, updated);
    this.persist();

    const db = getFirebaseFirestore();
    if (db) {
      try {
        await db.collection('financial_instructions').doc(id).set(updated, { merge: true });
      } catch (e) {
        console.warn('[FinancialInstructionRepository] Firestore sync failed:', e);
      }
    }
    return updated;
  }

  async getNextInstructionNumber(projectId: string): Promise<string> {
    this.ensureLoaded();
    let count = 0;
    for (const item of this.cache.values()) {
      if (item.projectId === projectId) {
        count++;
      }
    }
    const nextSeq = count + 1;
    return `FIN-${nextSeq.toString().padStart(3, '0')}`;
  }

  async countInstructions(projectId: string): Promise<number> {
    this.ensureLoaded();
    let count = 0;
    for (const item of this.cache.values()) {
      if (item.projectId === projectId) {
        count++;
      }
    }
    return count;
  }
}

export const financialInstructionRepository = new FinancialInstructionRepository();
