import fs from 'fs';
import path from 'path';
import { getFirebaseFirestore } from '../auth/firebaseAdmin';
import { AIInspectionAnalysis } from '../../src/types';
import { safeAtomicWriteJsonFile, safeReadJsonFile, ensureDirectoryExists } from '../utils/atomicPersistence';

export interface IAIInspectionRepository {
  createAnalysis(analysis: AIInspectionAnalysis): Promise<AIInspectionAnalysis>;
  getAnalysisById(id: string): Promise<AIInspectionAnalysis | null>;
  listAnalysesByMilestone(milestoneId: string): Promise<AIInspectionAnalysis[]>;
  listAnalysesByProject(projectId: string): Promise<AIInspectionAnalysis[]>;
  updateAnalysis(id: string, updates: Partial<AIInspectionAnalysis>): Promise<AIInspectionAnalysis>;
}

export const INITIAL_DEMO_AI_ANALYSES: AIInspectionAnalysis[] = [];

export class HybridAIInspectionRepository implements IAIInspectionRepository {
  private dataDir: string;
  private file: string;

  constructor() {
    this.dataDir = path.join(process.cwd(), 'data');
    this.file = path.join(this.dataDir, 'ai_inspections.json');
    this.initFiles();
  }

  private initFiles(): void {
    ensureDirectoryExists(this.dataDir);
    if (!fs.existsSync(this.file)) {
      safeAtomicWriteJsonFile(this.file, INITIAL_DEMO_AI_ANALYSES);
    }
  }

  private readAll(): AIInspectionAnalysis[] {
    this.initFiles();
    return safeReadJsonFile<AIInspectionAnalysis[]>(this.file, INITIAL_DEMO_AI_ANALYSES);
  }

  private writeAll(items: AIInspectionAnalysis[]): void {
    this.initFiles();
    safeAtomicWriteJsonFile(this.file, items);
  }

  private getFirestoreCol() {
    const firestore = getFirebaseFirestore();
    if (!firestore) return null;
    return firestore.collection('structura_ai_inspections');
  }

  async createAnalysis(analysis: AIInspectionAnalysis): Promise<AIInspectionAnalysis> {
    const items = this.readAll();
    const existingIndex = items.findIndex(i => i.id === analysis.id);
    if (existingIndex >= 0) {
      items[existingIndex] = analysis;
    } else {
      items.push(analysis);
    }
    this.writeAll(items);

    const col = this.getFirestoreCol();
    if (col) {
      try {
        await col.doc(analysis.id).set(analysis);
      } catch (err) {
        console.warn('[HybridAIInspectionRepository] Firestore set failed, using local file:', err);
      }
    }

    return analysis;
  }

  async getAnalysisById(id: string): Promise<AIInspectionAnalysis | null> {
    const col = this.getFirestoreCol();
    if (col) {
      try {
        const snap = await col.doc(id).get();
        if (snap.exists) {
          return snap.data() as AIInspectionAnalysis;
        }
      } catch {
        // fallback
      }
    }

    const items = this.readAll();
    return items.find(i => i.id === id) || null;
  }

  async listAnalysesByMilestone(milestoneId: string): Promise<AIInspectionAnalysis[]> {
    const col = this.getFirestoreCol();
    if (col) {
      try {
        const snap = await col.where('milestoneId', '==', milestoneId).get();
        if (!snap.empty) {
          return snap.docs.map(doc => doc.data() as AIInspectionAnalysis);
        }
      } catch {
        // fallback
      }
    }

    const items = this.readAll();
    return items.filter(i => i.milestoneId === milestoneId);
  }

  async listAnalysesByProject(projectId: string): Promise<AIInspectionAnalysis[]> {
    const col = this.getFirestoreCol();
    if (col) {
      try {
        const snap = await col.where('projectId', '==', projectId).get();
        if (!snap.empty) {
          return snap.docs.map(doc => doc.data() as AIInspectionAnalysis);
        }
      } catch {
        // fallback
      }
    }

    const items = this.readAll();
    return items.filter(i => i.projectId === projectId);
  }

  async updateAnalysis(id: string, updates: Partial<AIInspectionAnalysis>): Promise<AIInspectionAnalysis> {
    const items = this.readAll();
    const index = items.findIndex(i => i.id === id);
    if (index === -1) {
      throw new Error(`Analysis with id ${id} not found`);
    }

    const updated: AIInspectionAnalysis = {
      ...items[index],
      ...updates,
    };
    items[index] = updated;
    this.writeAll(items);

    const col = this.getFirestoreCol();
    if (col) {
      try {
        await col.doc(id).update(updates);
      } catch {
        // ignore
      }
    }

    return updated;
  }
}

export const aiInspectionRepository = new HybridAIInspectionRepository();
