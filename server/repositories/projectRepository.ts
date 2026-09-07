import fs from 'fs';
import path from 'path';
import { getFirebaseFirestore } from '../auth/firebaseAdmin';
import { ensureDemoDataSeeded, getDemoProjectById, getDemoAppointmentsByProject } from '../data/demoSeed';
import { safeAtomicWriteJsonFile, safeReadJsonFile, ensureDirectoryExists } from '../utils/atomicPersistence';

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
  discipline?: string;
  appointmentStatus: AppointmentStatus;
  invitedByUserId: string;
  invitedAt: string;
  respondedAt?: string;
  activatedAt?: string;
  endedAt?: string;
  reason?: string;
  isDemo?: boolean;
}

export interface StoredProject {
  id: string;
  organizationId: string;
  name: string;
  location: string;
  projectType: string;
  description: string;
  startDate: string;
  targetHandoverDate: string;
  totalBaselineBudgetUSD: number;
  currency: string;
  currentStage: string;
  ownerUserId: string;
  status: 'ACTIVE' | 'ARCHIVED' | 'PLANNING';
  createdAt: string;
  updatedAt: string;
  isDemo?: boolean;
}

export interface IProjectRepository {
  createProject(project: StoredProject): Promise<StoredProject>;
  getProjectById(id: string): Promise<StoredProject | null>;
  listProjectsByOrg(organizationId: string): Promise<StoredProject[]>;
  listProjectsByUser(userId: string): Promise<StoredProject[]>;
  updateProject(id: string, updates: Partial<StoredProject>): Promise<StoredProject | null>;

  createAppointment(appointment: ProjectAppointment): Promise<ProjectAppointment>;
  getAppointmentById(id: string): Promise<ProjectAppointment | null>;
  getAppointmentByProjectAndUser(projectId: string, userId: string): Promise<ProjectAppointment | null>;
  listAppointmentsByProject(projectId: string): Promise<ProjectAppointment[]>;
  listAppointmentsByUser(userId: string): Promise<ProjectAppointment[]>;
  updateAppointment(id: string, updates: Partial<ProjectAppointment>): Promise<ProjectAppointment | null>;
}

// 1. Cloud Firestore Implementation
class FirestoreProjectRepository implements IProjectRepository {
  private getProjectCol() {
    const firestore = getFirebaseFirestore();
    if (!firestore) throw new Error('Firestore not initialized');
    return firestore.collection('structura_projects');
  }

  private getApptCol() {
    const firestore = getFirebaseFirestore();
    if (!firestore) throw new Error('Firestore not initialized');
    return firestore.collection('structura_appointments');
  }

  async createProject(project: StoredProject): Promise<StoredProject> {
    await this.getProjectCol().doc(project.id).set(project);
    return project;
  }

  async getProjectById(id: string): Promise<StoredProject | null> {
    const snap = await this.getProjectCol().doc(id).get();
    return snap.exists ? (snap.data() as StoredProject) : null;
  }

  async listProjectsByOrg(organizationId: string): Promise<StoredProject[]> {
    const snap = await this.getProjectCol().where('organizationId', '==', organizationId).get();
    return snap.docs.map(d => d.data() as StoredProject);
  }

  async listProjectsByUser(userId: string): Promise<StoredProject[]> {
    // 1. Projects where user is owner
    const ownerSnap = await this.getProjectCol().where('ownerUserId', '==', userId).get();
    const map = new Map<string, StoredProject>();
    ownerSnap.docs.forEach(d => map.set(d.id, d.data() as StoredProject));

    // 2. Projects where user has an active appointment
    const apptSnap = await this.getApptCol()
      .where('userId', '==', userId)
      .where('appointmentStatus', '==', 'ACTIVE')
      .get();

    for (const doc of apptSnap.docs) {
      const appt = doc.data() as ProjectAppointment;
      if (!map.has(appt.projectId)) {
        const proj = await this.getProjectById(appt.projectId);
        if (proj) map.set(proj.id, proj);
      }
    }

    return Array.from(map.values());
  }

  async updateProject(id: string, updates: Partial<StoredProject>): Promise<StoredProject | null> {
    const docRef = this.getProjectCol().doc(id);
    await docRef.update({ ...updates, updatedAt: new Date().toISOString() });
    const snap = await docRef.get();
    return snap.exists ? (snap.data() as StoredProject) : null;
  }

  async createAppointment(appointment: ProjectAppointment): Promise<ProjectAppointment> {
    await this.getApptCol().doc(appointment.id).set(appointment);
    return appointment;
  }

  async getAppointmentById(id: string): Promise<ProjectAppointment | null> {
    const snap = await this.getApptCol().doc(id).get();
    return snap.exists ? (snap.data() as ProjectAppointment) : null;
  }

  async getAppointmentByProjectAndUser(projectId: string, userId: string): Promise<ProjectAppointment | null> {
    const snap = await this.getApptCol()
      .where('projectId', '==', projectId)
      .where('userId', '==', userId)
      .limit(1)
      .get();
    return snap.empty ? null : (snap.docs[0].data() as ProjectAppointment);
  }

  async listAppointmentsByProject(projectId: string): Promise<ProjectAppointment[]> {
    const snap = await this.getApptCol().where('projectId', '==', projectId).get();
    return snap.docs.map(d => d.data() as ProjectAppointment);
  }

  async listAppointmentsByUser(userId: string): Promise<ProjectAppointment[]> {
    const snap = await this.getApptCol().where('userId', '==', userId).get();
    return snap.docs.map(d => d.data() as ProjectAppointment);
  }

  async updateAppointment(id: string, updates: Partial<ProjectAppointment>): Promise<ProjectAppointment | null> {
    const docRef = this.getApptCol().doc(id);
    await docRef.update(updates);
    const snap = await docRef.get();
    return snap.exists ? (snap.data() as ProjectAppointment) : null;
  }
}

// 2. Local File Sandbox Implementation
class FileProjectRepository implements IProjectRepository {
  private projectsFile = path.join(process.cwd(), 'data', 'projects.json');
  private appointmentsFile = path.join(process.cwd(), 'data', 'appointments.json');

  constructor() {
    this.ensureDataDir();
  }

  private ensureDataDir() {
    const dataDir = path.join(process.cwd(), 'data');
    ensureDirectoryExists(dataDir);
    if (!fs.existsSync(this.projectsFile)) {
      safeAtomicWriteJsonFile(this.projectsFile, []);
    }
    if (!fs.existsSync(this.appointmentsFile)) {
      safeAtomicWriteJsonFile(this.appointmentsFile, []);
    }
    ensureDemoDataSeeded();
  }

  private readProjects(): StoredProject[] {
    return safeReadJsonFile<StoredProject[]>(this.projectsFile, []);
  }

  private writeProjects(projects: StoredProject[]) {
    safeAtomicWriteJsonFile(this.projectsFile, projects);
  }

  private readAppointments(): ProjectAppointment[] {
    return safeReadJsonFile<ProjectAppointment[]>(this.appointmentsFile, []);
  }

  private writeAppointments(appts: ProjectAppointment[]) {
    safeAtomicWriteJsonFile(this.appointmentsFile, appts);
  }

  async createProject(project: StoredProject): Promise<StoredProject> {
    const projects = this.readProjects();
    projects.push(project);
    this.writeProjects(projects);
    return project;
  }

  async getProjectById(id: string): Promise<StoredProject | null> {
    const projects = this.readProjects();
    return projects.find(p => p.id === id) || null;
  }

  async listProjectsByOrg(organizationId: string): Promise<StoredProject[]> {
    const projects = this.readProjects();
    return projects.filter(p => p.organizationId === organizationId);
  }

  async listProjectsByUser(userId: string): Promise<StoredProject[]> {
    const projects = this.readProjects();
    const appts = this.readAppointments();
    const activeApptProjectIds = new Set(
      appts.filter(a => a.userId === userId && a.appointmentStatus === 'ACTIVE').map(a => a.projectId)
    );

    return projects.filter(p => p.ownerUserId === userId || activeApptProjectIds.has(p.id) || p.isDemo);
  }

  async updateProject(id: string, updates: Partial<StoredProject>): Promise<StoredProject | null> {
    const projects = this.readProjects();
    const index = projects.findIndex(p => p.id === id);
    if (index === -1) return null;
    projects[index] = { ...projects[index], ...updates, updatedAt: new Date().toISOString() };
    this.writeProjects(projects);
    return projects[index];
  }

  async createAppointment(appointment: ProjectAppointment): Promise<ProjectAppointment> {
    const appts = this.readAppointments();
    appts.push(appointment);
    this.writeAppointments(appts);
    return appointment;
  }

  async getAppointmentById(id: string): Promise<ProjectAppointment | null> {
    const appts = this.readAppointments();
    return appts.find(a => a.id === id) || null;
  }

  async getAppointmentByProjectAndUser(projectId: string, userId: string): Promise<ProjectAppointment | null> {
    const appts = this.readAppointments();
    return appts.find(a => a.projectId === projectId && a.userId === userId) || null;
  }

  async listAppointmentsByProject(projectId: string): Promise<ProjectAppointment[]> {
    const appts = this.readAppointments();
    return appts.filter(a => a.projectId === projectId);
  }

  async listAppointmentsByUser(userId: string): Promise<ProjectAppointment[]> {
    const appts = this.readAppointments();
    return appts.filter(a => a.userId === userId);
  }

  async updateAppointment(id: string, updates: Partial<ProjectAppointment>): Promise<ProjectAppointment | null> {
    const appts = this.readAppointments();
    const index = appts.findIndex(a => a.id === id);
    if (index === -1) return null;
    appts[index] = { ...appts[index], ...updates };
    this.writeAppointments(appts);
    return appts[index];
  }
}

class HybridProjectRepository implements IProjectRepository {
  private firestore = new FirestoreProjectRepository();
  private file = new FileProjectRepository();

  private getDelegate(): IProjectRepository {
    if (process.env.STRUCTURA_AUTH_MODE !== 'sandbox' && getFirebaseFirestore()) {
      return this.firestore;
    }
    return this.file;
  }

  createProject(project: StoredProject): Promise<StoredProject> {
    return this.getDelegate().createProject(project);
  }
  async getProjectById(id: string): Promise<StoredProject | null> {
    const project = await this.getDelegate().getProjectById(id);
    if (!project) {
      return getDemoProjectById(id);
    }
    return project;
  }
  listProjectsByOrg(organizationId: string): Promise<StoredProject[]> {
    return this.getDelegate().listProjectsByOrg(organizationId);
  }
  listProjectsByUser(userId: string): Promise<StoredProject[]> {
    return this.getDelegate().listProjectsByUser(userId);
  }
  updateProject(id: string, updates: Partial<StoredProject>): Promise<StoredProject | null> {
    return this.getDelegate().updateProject(id, updates);
  }
  createAppointment(appointment: ProjectAppointment): Promise<ProjectAppointment> {
    return this.getDelegate().createAppointment(appointment);
  }
  getAppointmentById(id: string): Promise<ProjectAppointment | null> {
    return this.getDelegate().getAppointmentById(id);
  }
  async getAppointmentByProjectAndUser(projectId: string, userId: string): Promise<ProjectAppointment | null> {
    const appt = await this.getDelegate().getAppointmentByProjectAndUser(projectId, userId);
    if (!appt) {
      const demoAppts = getDemoAppointmentsByProject(projectId);
      return demoAppts.find(a => a.userId === userId) || null;
    }
    return appt;
  }
  async listAppointmentsByProject(projectId: string): Promise<ProjectAppointment[]> {
    const appts = await this.getDelegate().listAppointmentsByProject(projectId);
    if (!appts || appts.length === 0) {
      const demoAppts = getDemoAppointmentsByProject(projectId);
      if (demoAppts.length > 0) return demoAppts;
    }
    return appts;
  }
  listAppointmentsByUser(userId: string): Promise<ProjectAppointment[]> {
    return this.getDelegate().listAppointmentsByUser(userId);
  }
  updateAppointment(id: string, updates: Partial<ProjectAppointment>): Promise<ProjectAppointment | null> {
    return this.getDelegate().updateAppointment(id, updates);
  }
}

export const projectRepository = new HybridProjectRepository();
