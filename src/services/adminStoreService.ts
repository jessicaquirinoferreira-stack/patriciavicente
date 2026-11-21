import { auth } from '../lib/firebase';
import {
  DEFAULT_EMPREENDIMENTOS,
  DEFAULT_LANDING_PAGE,
  DEFAULT_PROFESSIONAL_PROFILE,
  DEFAULT_PROPERTIES,
  DEFAULT_SITE_SETTINGS
} from '../lib/seedDefaults';
import {
  adminListAllEmpreendimentos as fsAdminListAllEmpreendimentos,
  adminListAllLandingPages as fsAdminListAllLandingPages,
  adminListAllProperties as fsAdminListAllProperties,
  adminListAnalytics as fsAdminListAnalytics,
  adminListClients as fsAdminListClients,
  adminListLeads as fsAdminListLeads,
  adminListMedia as fsAdminListMedia,
  adminListPipeline as fsAdminListPipeline,
  adminListProposals as fsAdminListProposals,
  adminListTasks as fsAdminListTasks,
  adminListUsers as fsAdminListUsers,
  adminListVisits as fsAdminListVisits,
  bootstrapInitialFirestoreData as fsBootstrapInitialFirestoreData,
  checkUserIsAdmin,
  convertLeadToCrm as fsConvertLeadToCrm,
  getProfessionalProfile as fsGetProfessionalProfile,
  getSiteSettings as fsGetSiteSettings,
  listPublishedEmpreendimentos as fsListPublishedEmpreendimentos,
  listPublishedLandingPages as fsListPublishedLandingPages,
  listPublishedProperties as fsListPublishedProperties,
  movePipelineStage as fsMovePipelineStage,
  removeAdminUser as fsRemoveAdminUser,
  removeClient as fsRemoveClient,
  removeEmpreendimento as fsRemoveEmpreendimento,
  removeLandingPage as fsRemoveLandingPage,
  removeLead as fsRemoveLead,
  removeMediaAsset as fsRemoveMediaAsset,
  removePipelineItem as fsRemovePipelineItem,
  removeProperty as fsRemoveProperty,
  removeProposal as fsRemoveProposal,
  removeTask as fsRemoveTask,
  removeVisit as fsRemoveVisit,
  saveAdminUser as fsSaveAdminUser,
  saveClient as fsSaveClient,
  saveEmpreendimento as fsSaveEmpreendimento,
  saveLandingPage as fsSaveLandingPage,
  saveMediaAsset as fsSaveMediaAsset,
  savePipelineItem as fsSavePipelineItem,
  saveProfessionalProfile as fsSaveProfessionalProfile,
  saveProperty as fsSaveProperty,
  saveProposal as fsSaveProposal,
  saveSiteSettings as fsSaveSiteSettings,
  saveTask as fsSaveTask,
  saveVisit as fsSaveVisit,
  submitPublicLead as fsSubmitPublicLead,
  trackAnalyticsEvent as fsTrackAnalyticsEvent,
  updateLeadAdmin as fsUpdateLeadAdmin
} from './firestoreService';
import type {
  AdminUser,
  AnalyticsEvent,
  Client,
  Empreendimento,
  LandingPage,
  Lead,
  MediaAsset,
  PipelineItem,
  PipelineStage,
  ProfessionalProfile,
  Property,
  Proposal,
  SiteSettings,
  Task,
  Visit
} from '../types/realEstate';
import { slugifyText } from '../utils/utm';

const LOCAL_STORE_KEY = 'pv_admin_local_store_v1';
const ADMIN_TOKEN_STORAGE_KEY = 'pv_admin_session_token';

interface LocalAdminStore {
  hasLocalEdits: boolean;
  siteSettings: SiteSettings;
  professionalProfile: ProfessionalProfile;
  properties: Property[];
  empreendimentos: Empreendimento[];
  landingPages: LandingPage[];
  leads: Lead[];
  clients: Client[];
  pipeline: PipelineItem[];
  visits: Visit[];
  proposals: Proposal[];
  tasks: Task[];
  media: MediaAsset[];
  analytics: AnalyticsEvent[];
  adminUsers: AdminUser[];
}

function createInitialStore(): LocalAdminStore {
  return {
    hasLocalEdits: false,
    siteSettings: { ...DEFAULT_SITE_SETTINGS },
    professionalProfile: { ...DEFAULT_PROFESSIONAL_PROFILE },
    properties: [...DEFAULT_PROPERTIES],
    empreendimentos: [...DEFAULT_EMPREENDIMENTOS],
    landingPages: [{ ...DEFAULT_LANDING_PAGE }],
    leads: [],
    clients: [],
    pipeline: [],
    visits: [],
    proposals: [],
    tasks: [],
    media: [],
    analytics: [],
    adminUsers: []
  };
}

function readStore(): LocalAdminStore {
  try {
    const raw = window.localStorage.getItem(LOCAL_STORE_KEY);
    if (!raw) {
      const initial = createInitialStore();
      window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(initial));
      return initial;
    }
    const parsed = JSON.parse(raw) as Partial<LocalAdminStore>;
    const defaults = createInitialStore();
    const mergedProfile = parsed.professionalProfile
      ? { ...defaults.professionalProfile, ...parsed.professionalProfile }
      : defaults.professionalProfile;
    if (
      !mergedProfile.portraitUrl ||
      mergedProfile.portraitUrl.includes('patricia_construction_portrait_1794928223577')
    ) {
      mergedProfile.portraitUrl = defaults.professionalProfile.portraitUrl;
    }
    const mergedSettings = parsed.siteSettings
      ? { ...defaults.siteSettings, ...parsed.siteSettings }
      : defaults.siteSettings;
    if (
      !mergedSettings.logoUrl ||
      mergedSettings.logoUrl.includes('Logo-Dourado-Patricia-Vicente-Imoveis.png')
    ) {
      mergedSettings.logoUrl = defaults.siteSettings.logoUrl;
    }
    return {
      hasLocalEdits: Boolean(parsed.hasLocalEdits),
      siteSettings: mergedSettings,
      professionalProfile: mergedProfile,
      properties: Array.isArray(parsed.properties) ? parsed.properties : defaults.properties,
      empreendimentos: Array.isArray(parsed.empreendimentos) ? parsed.empreendimentos : defaults.empreendimentos,
      landingPages: Array.isArray(parsed.landingPages) ? parsed.landingPages : defaults.landingPages,
      leads: Array.isArray(parsed.leads) ? parsed.leads : [],
      clients: Array.isArray(parsed.clients) ? parsed.clients : [],
      pipeline: Array.isArray(parsed.pipeline) ? parsed.pipeline : [],
      visits: Array.isArray(parsed.visits) ? parsed.visits : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      tasks: Array.isArray(parsed.tasks) ? parsed.tasks : [],
      media: Array.isArray(parsed.media) ? parsed.media : [],
      analytics: Array.isArray(parsed.analytics) ? parsed.analytics : [],
      adminUsers: Array.isArray(parsed.adminUsers) ? parsed.adminUsers : []
    };
  } catch {
    return createInitialStore();
  }
}

function writeStore(next: LocalAdminStore): void {
  try {
    window.localStorage.setItem(LOCAL_STORE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage quota errors cleanly
  }
}

function makeId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

// ============================================================================
// Session Token Helpers (for Credential Login)
// ============================================================================

export function getStoredAdminToken(): string | null {
  try {
    return window.sessionStorage.getItem(ADMIN_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setStoredAdminToken(token: string | null): void {
  try {
    if (token) {
      window.sessionStorage.setItem(ADMIN_TOKEN_STORAGE_KEY, token);
    } else {
      window.sessionStorage.removeItem(ADMIN_TOKEN_STORAGE_KEY);
    }
  } catch {
    // Ignore storage errors
  }
}

export async function checkCredentialSession(): Promise<{ authenticated: boolean; email?: string }> {
  try {
    const token = getStoredAdminToken();
    const res = await fetch('/api/admin/session', {
      method: 'GET',
      credentials: 'include',
      headers: token ? { Authorization: `Bearer ${token}` } : undefined
    });
    if (!res.ok) return { authenticated: false };
    const json = (await res.json()) as { authenticated?: boolean; email?: string };
    return { authenticated: Boolean(json.authenticated), email: json.email };
  } catch {
    return { authenticated: false };
  }
}

export async function loginWithCredentials(
  email: string,
  password: string
): Promise<{ ok: boolean; email?: string; error?: string }> {
  try {
    const res = await fetch('/api/admin/login', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const json = (await res.json()) as {
      ok?: boolean;
      email?: string;
      sessionToken?: string;
      error?: string;
    };
    if (!res.ok || !json.ok) {
      return { ok: false, error: json.error || 'Login ou senha inválidos.' };
    }
    if (json.sessionToken) {
      setStoredAdminToken(json.sessionToken);
    }
    return { ok: true, email: json.email };
  } catch {
    return { ok: false, error: 'Falha de conexão ao autenticar. Tente novamente.' };
  }
}

export async function logoutCredentialSession(): Promise<void> {
  setStoredAdminToken(null);
  try {
    await fetch('/api/admin/logout', {
      method: 'POST',
      credentials: 'include'
    });
  } catch {
    // Ignore logout network error
  }
}

export async function isCloudFirebaseAdminActive(): Promise<boolean> {
  const current = auth.currentUser;
  if (!current || !current.emailVerified) return false;
  return checkUserIsAdmin(current.uid, current.email, current.emailVerified);
}

// ============================================================================
// Public Readers & Trackers (Respect local admin edits when present)
// ============================================================================

export async function getPublicSiteSettings(): Promise<SiteSettings> {
  const store = readStore();
  if (store.hasLocalEdits) {
    return store.siteSettings;
  }
  return fsGetSiteSettings();
}

export async function getPublicProfessionalProfile(): Promise<ProfessionalProfile> {
  const store = readStore();
  if (store.hasLocalEdits) {
    return store.professionalProfile;
  }
  return fsGetProfessionalProfile();
}

export async function listPublicProperties(): Promise<Property[]> {
  const store = readStore();
  if (store.hasLocalEdits) {
    return store.properties.filter((p) => p.published);
  }
  return fsListPublishedProperties();
}

export async function listPublicEmpreendimentos(): Promise<Empreendimento[]> {
  const store = readStore();
  if (store.hasLocalEdits) {
    return store.empreendimentos.filter((e) => e.published);
  }
  return fsListPublishedEmpreendimentos();
}

export async function listPublicLandingPages(): Promise<LandingPage[]> {
  const store = readStore();
  if (store.hasLocalEdits) {
    const published = store.landingPages.filter((lp) => lp.published);
    return published.length > 0 ? published : [{ ...DEFAULT_LANDING_PAGE }];
  }
  return fsListPublishedLandingPages();
}

export async function submitPublicLeadUnified(
  input: Parameters<typeof fsSubmitPublicLead>[0]
): Promise<string> {
  const score: Lead['score'] =
    input.interestType === 'agendamento_visita' || Boolean(input.preferredDate) || Boolean(input.propertyId)
      ? 'quente'
      : input.message && input.message.trim().length > 25
        ? 'morno'
        : 'frio';

  let id = makeId('lead');
  try {
    id = await fsSubmitPublicLead(input);
  } catch {
    // Fallback cleanly if offline/unconfigured while keeping lead captured locally
  }

  const store = readStore();
  const leadRecord: Lead = {
    id,
    name: input.name.trim(),
    phone: input.phone.trim(),
    email: input.email?.trim() || undefined,
    message: input.message?.trim() || undefined,
    interestType: input.interestType,
    preferredDate: input.preferredDate || undefined,
    propertyId: input.propertyId || undefined,
    propertyTitle: input.propertyTitle || undefined,
    empreendimentoId: input.empreendimentoId || undefined,
    source: input.source || 'site',
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    utmContent: input.utmContent,
    utmTerm: input.utmTerm,
    score,
    status: 'novo',
    lgpdConsent: true,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  writeStore({
    ...store,
    leads: [leadRecord, ...store.leads.filter((l) => l.id !== id)]
  });
  return id;
}

export async function trackAnalyticsEventUnified(
  input: Parameters<typeof fsTrackAnalyticsEvent>[0]
): Promise<void> {
  await fsTrackAnalyticsEvent(input);
  const store = readStore();
  const eventRecord: AnalyticsEvent = {
    id: makeId('evt'),
    eventType: input.eventType,
    path: input.path || '/',
    targetId: input.targetId,
    source: input.source,
    utmSource: input.utmSource,
    utmMedium: input.utmMedium,
    utmCampaign: input.utmCampaign,
    createdAt: new Date().toISOString()
  };
  writeStore({
    ...store,
    analytics: [eventRecord, ...store.analytics].slice(0, 500)
  });
}

// ============================================================================
// Admin Readers
// ============================================================================

export async function adminListAllProperties(): Promise<Property[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListAllProperties();
  return readStore().properties;
}

export async function adminListAllEmpreendimentos(): Promise<Empreendimento[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListAllEmpreendimentos();
  return readStore().empreendimentos;
}

export async function adminListAllLandingPages(): Promise<LandingPage[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListAllLandingPages();
  return readStore().landingPages;
}

export async function adminListLeads(): Promise<Lead[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListLeads();
  return readStore().leads;
}

export async function adminListClients(): Promise<Client[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListClients();
  return readStore().clients;
}

export async function adminListPipeline(): Promise<PipelineItem[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListPipeline();
  return readStore().pipeline;
}

export async function adminListVisits(): Promise<Visit[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListVisits();
  return readStore().visits;
}

export async function adminListProposals(): Promise<Proposal[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListProposals();
  return readStore().proposals;
}

export async function adminListTasks(): Promise<Task[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListTasks();
  return readStore().tasks;
}

export async function adminListMedia(): Promise<MediaAsset[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListMedia();
  return readStore().media;
}

export async function adminListAnalytics(): Promise<AnalyticsEvent[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListAnalytics();
  return readStore().analytics;
}

export async function adminListUsers(): Promise<AdminUser[]> {
  if (await isCloudFirebaseAdminActive()) return fsAdminListUsers();
  return readStore().adminUsers;
}

// ============================================================================
// Admin Writers
// ============================================================================

export async function bootstrapInitialAdminData(): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsBootstrapInitialFirestoreData();
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    properties: store.properties.length > 0 ? store.properties : [...DEFAULT_PROPERTIES],
    empreendimentos:
      store.empreendimentos.length > 0 ? store.empreendimentos : [...DEFAULT_EMPREENDIMENTOS],
    landingPages: store.landingPages.length > 0 ? store.landingPages : [{ ...DEFAULT_LANDING_PAGE }]
  });
}

export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsSaveSiteSettings(settings);
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    hasLocalEdits: true,
    siteSettings: { ...settings, id: 'main', updatedAt: new Date().toISOString() }
  });
}

export async function saveProfessionalProfile(profile: ProfessionalProfile): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsSaveProfessionalProfile(profile);
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    hasLocalEdits: true,
    professionalProfile: { ...profile, id: 'main', updatedAt: new Date().toISOString() }
  });
}

export async function saveProperty(
  property: Omit<Property, 'id'> & { id?: string }
): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSaveProperty(property);
  }
  const store = readStore();
  const id = property.id || makeId('prop');
  const nextItem: Property = {
    ...property,
    id,
    slug: slugifyText(property.slug || property.title),
    updatedAt: new Date().toISOString(),
    createdAt: property.createdAt || new Date().toISOString()
  };
  const exists = store.properties.some((p) => p.id === id);
  const properties = exists
    ? store.properties.map((p) => (p.id === id ? nextItem : p))
    : [nextItem, ...store.properties];
  writeStore({ ...store, hasLocalEdits: true, properties });
  return id;
}

export async function removeProperty(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveProperty(id);
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    hasLocalEdits: true,
    properties: store.properties.filter((p) => p.id !== id)
  });
}

export async function saveEmpreendimento(
  emp: Omit<Empreendimento, 'id'> & { id?: string }
): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSaveEmpreendimento(emp);
  }
  const store = readStore();
  const id = emp.id || makeId('emp');
  const nextItem: Empreendimento = {
    ...emp,
    id,
    slug: slugifyText(emp.slug || emp.name),
    updatedAt: new Date().toISOString(),
    createdAt: emp.createdAt || new Date().toISOString()
  };
  const exists = store.empreendimentos.some((e) => e.id === id);
  const empreendimentos = exists
    ? store.empreendimentos.map((e) => (e.id === id ? nextItem : e))
    : [nextItem, ...store.empreendimentos];
  writeStore({ ...store, hasLocalEdits: true, empreendimentos });
  return id;
}

export async function removeEmpreendimento(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveEmpreendimento(id);
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    hasLocalEdits: true,
    empreendimentos: store.empreendimentos.filter((e) => e.id !== id)
  });
}

export async function saveLandingPage(
  lp: Omit<LandingPage, 'id'> & { id?: string }
): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSaveLandingPage(lp);
  }
  const store = readStore();
  const id = lp.id || makeId('lp');
  let landingPages = [...store.landingPages];
  if (lp.isPremiumShowcase && lp.published) {
    landingPages = landingPages.map((existing) =>
      existing.id !== id ? { ...existing, isPremiumShowcase: false } : existing
    );
  }
  const nextItem: LandingPage = {
    ...lp,
    id,
    slug: slugifyText(lp.slug || lp.title),
    updatedAt: new Date().toISOString(),
    createdAt: lp.createdAt || new Date().toISOString()
  };
  const exists = landingPages.some((item) => item.id === id);
  landingPages = exists
    ? landingPages.map((item) => (item.id === id ? nextItem : item))
    : [nextItem, ...landingPages];
  writeStore({ ...store, hasLocalEdits: true, landingPages });
  return id;
}

export async function removeLandingPage(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveLandingPage(id);
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    hasLocalEdits: true,
    landingPages: store.landingPages.filter((lp) => lp.id !== id)
  });
}

export async function updateLeadAdmin(
  leadId: string,
  updates: Partial<Pick<Lead, 'score' | 'status' | 'message'>>
): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsUpdateLeadAdmin(leadId, updates);
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    leads: store.leads.map((l) =>
      l.id === leadId ? { ...l, ...updates, updatedAt: new Date().toISOString() } : l
    )
  });
}

export async function removeLead(leadId: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveLead(leadId);
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    leads: store.leads.filter((l) => l.id !== leadId)
  });
}

export async function convertLeadToCrm(
  lead: Lead
): Promise<{ clientId: string; pipelineId: string }> {
  if (await isCloudFirebaseAdminActive()) {
    return fsConvertLeadToCrm(lead);
  }
  const store = readStore();
  const clientId = makeId('client');
  const pipelineId = makeId('pipe');
  const taskId = makeId('task');
  const now = new Date().toISOString();

  const initialInteraction = `[${new Date().toLocaleDateString('pt-BR')}] Lead capturado via ${lead.source}: ${
    lead.message || lead.interestType
  }`;

  const newClient: Client = {
    id: clientId,
    name: lead.name,
    phone: lead.phone,
    email: lead.email,
    origin: lead.utmSource || lead.source,
    score: lead.score,
    stage: 'contato',
    preferredRegions: ['Sorocaba e região'],
    tags: [lead.interestType, lead.utmCampaign || 'organico'].filter(Boolean),
    interestPropertyIds: lead.propertyId ? [lead.propertyId] : [],
    interactions: [initialInteraction],
    notes: lead.message || '',
    createdAt: now,
    updatedAt: now
  };

  const newPipeline: PipelineItem = {
    id: pipelineId,
    clientId,
    clientName: lead.name,
    leadId: lead.id,
    propertyId: lead.propertyId,
    propertyTitle: lead.propertyTitle,
    stage: lead.interestType === 'agendamento_visita' ? 'visita_agendada' : 'contato',
    score: lead.score,
    tags: [lead.interestType],
    notes: lead.message,
    createdAt: now,
    updatedAt: now
  };

  const newTask: Task = {
    id: taskId,
    title: `Primeiro retorno para ${lead.name}`,
    description: `Contato via ${lead.phone}${lead.propertyTitle ? ` sobre ${lead.propertyTitle}` : ''}`,
    clientId,
    clientName: lead.name,
    dueDate: new Date(Date.now() + 86400000).toISOString().split('T')[0],
    priority: lead.score === 'quente' ? 'alta' : 'media',
    completed: false,
    automationTrigger: 'conversao_lead',
    createdAt: now,
    updatedAt: now
  };

  writeStore({
    ...store,
    clients: [newClient, ...store.clients],
    pipeline: [newPipeline, ...store.pipeline],
    tasks: [newTask, ...store.tasks],
    leads: store.leads.map((l) =>
      l.id === lead.id ? { ...l, status: 'contato', updatedAt: now } : l
    )
  });

  return { clientId, pipelineId };
}

export async function saveClient(client: Omit<Client, 'id'> & { id?: string }): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSaveClient(client);
  }
  const store = readStore();
  const id = client.id || makeId('client');
  const nextItem: Client = {
    ...client,
    id,
    updatedAt: new Date().toISOString(),
    createdAt: client.createdAt || new Date().toISOString()
  };
  const exists = store.clients.some((c) => c.id === id);
  const clients = exists
    ? store.clients.map((c) => (c.id === id ? nextItem : c))
    : [nextItem, ...store.clients];
  writeStore({ ...store, clients });
  return id;
}

export async function removeClient(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveClient(id);
    return;
  }
  const store = readStore();
  writeStore({ ...store, clients: store.clients.filter((c) => c.id !== id) });
}

export async function savePipelineItem(
  item: Omit<PipelineItem, 'id'> & { id?: string }
): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSavePipelineItem(item);
  }
  const store = readStore();
  const id = item.id || makeId('pipe');
  const nextItem: PipelineItem = {
    ...item,
    id,
    updatedAt: new Date().toISOString(),
    createdAt: item.createdAt || new Date().toISOString()
  };
  const exists = store.pipeline.some((p) => p.id === id);
  const pipeline = exists
    ? store.pipeline.map((p) => (p.id === id ? nextItem : p))
    : [nextItem, ...store.pipeline];
  writeStore({ ...store, pipeline });
  return id;
}

export async function movePipelineStage(itemId: string, stage: PipelineStage): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsMovePipelineStage(itemId, stage);
    return;
  }
  const store = readStore();
  writeStore({
    ...store,
    pipeline: store.pipeline.map((p) =>
      p.id === itemId ? { ...p, stage, updatedAt: new Date().toISOString() } : p
    )
  });
}

export async function removePipelineItem(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemovePipelineItem(id);
    return;
  }
  const store = readStore();
  writeStore({ ...store, pipeline: store.pipeline.filter((p) => p.id !== id) });
}

export async function saveVisit(visit: Omit<Visit, 'id'> & { id?: string }): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSaveVisit(visit);
  }
  const store = readStore();
  const id = visit.id || makeId('visit');
  const now = new Date().toISOString();
  const nextItem: Visit = {
    ...visit,
    id,
    updatedAt: now,
    createdAt: visit.createdAt || now
  };
  const exists = store.visits.some((v) => v.id === id);
  const visits = exists
    ? store.visits.map((v) => (v.id === id ? nextItem : v))
    : [nextItem, ...store.visits];

  const tasks = exists
    ? store.tasks
    : [
        {
          id: makeId('task'),
          title: `Confirmar visita com ${visit.clientName}`,
          description: `Imóvel: ${visit.propertyTitle} · Horário: ${visit.scheduledAt}`,
          dueDate: visit.scheduledAt.slice(0, 10),
          priority: 'alta' as const,
          completed: false,
          automationTrigger: 'visita_agendada',
          createdAt: now,
          updatedAt: now
        },
        ...store.tasks
      ];

  writeStore({ ...store, visits, tasks });
  return id;
}

export async function removeVisit(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveVisit(id);
    return;
  }
  const store = readStore();
  writeStore({ ...store, visits: store.visits.filter((v) => v.id !== id) });
}

export async function saveProposal(
  proposal: Omit<Proposal, 'id'> & { id?: string }
): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSaveProposal(proposal);
  }
  const store = readStore();
  const id = proposal.id || makeId('prop-doc');
  const nextItem: Proposal = {
    ...proposal,
    id,
    updatedAt: new Date().toISOString(),
    createdAt: proposal.createdAt || new Date().toISOString()
  };
  const exists = store.proposals.some((p) => p.id === id);
  const proposals = exists
    ? store.proposals.map((p) => (p.id === id ? nextItem : p))
    : [nextItem, ...store.proposals];
  writeStore({ ...store, proposals });
  return id;
}

export async function removeProposal(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveProposal(id);
    return;
  }
  const store = readStore();
  writeStore({ ...store, proposals: store.proposals.filter((p) => p.id !== id) });
}

export async function saveTask(task: Omit<Task, 'id'> & { id?: string }): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSaveTask(task);
  }
  const store = readStore();
  const id = task.id || makeId('task');
  const nextItem: Task = {
    ...task,
    id,
    updatedAt: new Date().toISOString(),
    createdAt: task.createdAt || new Date().toISOString()
  };
  const exists = store.tasks.some((t) => t.id === id);
  const tasks = exists
    ? store.tasks.map((t) => (t.id === id ? nextItem : t))
    : [nextItem, ...store.tasks];
  writeStore({ ...store, tasks });
  return id;
}

export async function removeTask(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveTask(id);
    return;
  }
  const store = readStore();
  writeStore({ ...store, tasks: store.tasks.filter((t) => t.id !== id) });
}

export async function saveMediaAsset(asset: Omit<MediaAsset, 'id'>): Promise<string> {
  if (await isCloudFirebaseAdminActive()) {
    return fsSaveMediaAsset(asset);
  }
  const store = readStore();
  const id = makeId('media');
  const nextItem: MediaAsset = {
    ...asset,
    id,
    createdAt: new Date().toISOString()
  };
  writeStore({ ...store, media: [nextItem, ...store.media] });
  return id;
}

export async function removeMediaAsset(id: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveMediaAsset(id);
    return;
  }
  const store = readStore();
  writeStore({ ...store, media: store.media.filter((m) => m.id !== id) });
}

export async function saveAdminUser(uid: string, user: Omit<AdminUser, 'id'>): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsSaveAdminUser(uid, user);
    return;
  }
  const store = readStore();
  const nextItem: AdminUser = { ...user, id: uid, createdAt: new Date().toISOString() };
  const exists = store.adminUsers.some((u) => u.id === uid);
  const adminUsers = exists
    ? store.adminUsers.map((u) => (u.id === uid ? nextItem : u))
    : [nextItem, ...store.adminUsers];
  writeStore({ ...store, adminUsers });
}

export async function removeAdminUser(uid: string): Promise<void> {
  if (await isCloudFirebaseAdminActive()) {
    await fsRemoveAdminUser(uid);
    return;
  }
  const store = readStore();
  writeStore({ ...store, adminUsers: store.adminUsers.filter((u) => u.id !== uid) });
}
