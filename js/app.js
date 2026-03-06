// MAIN APP
class App {
    constructor() { this.db = new Database(); this.map = null; this.editor = new Editor(); this.currentProject = null; this.currentPhoto = null; this.tempContacts = []; this.editingId = null; this._locationTimer = null; this._locationReqId = 0; this._locationResults = []; this.currentUser = null; }
    async init() {
        await this.db.init();
        this._applyDarkTheme(localStorage.getItem('sitesketch_dark_theme') === 'true');
        // Check saved login
        const savedUser = localStorage.getItem('sitesketch_user');
        const savedPass = localStorage.getItem('sitesketch_pass');
        if (savedUser && savedPass && USERS[savedUser] && USERS[savedUser].password === savedPass) {
this.currentUser = savedUser;
CLOUD.user = savedUser;
this._showApp();
        } else {
document.getElementById('loginScreen').style.display = 'flex';
        }
    }

    doLogin() {
        const user = document.getElementById('loginUser').value.trim().toLowerCase();
        const pass = document.getElementById('loginPass').value;
        const err = document.getElementById('loginError');
        if (!USERS[user] || USERS[user].password !== pass) {
err.textContent = 'Benutzername oder Passwort falsch';
err.style.display = 'block';
return;
        }
        this.currentUser = user;
        CLOUD.user = user;
        if (document.getElementById('loginRemember').checked) {
localStorage.setItem('sitesketch_user', user);
localStorage.setItem('sitesketch_pass', pass);
        }
        this._showApp();
    }

    _showApp() {
        document.getElementById('loginScreen').style.display = 'none';
        document.getElementById('app').style.display = 'flex';
        // Set default auftraggeber based on user
        const userInfo = USERS[this.currentUser];
        if (userInfo) {
document.title = 'SiteSketch - ' + userInfo.label;
        }
        this.renderProjectList();
    }

    logout() {
        localStorage.removeItem('sitesketch_user');
        localStorage.removeItem('sitesketch_pass');
        this.currentUser = null;
        CLOUD.user = null;
        document.getElementById('app').style.display = 'none';
        document.getElementById('loginScreen').style.display = 'flex';
        document.getElementById('loginUser').value = '';
        document.getElementById('loginPass').value = '';
        document.getElementById('loginError').style.display = 'none';
    }

    async syncFromCloud() {
        this.toast('Cloud-Sync läuft...', 'info');
        try {
const cloudProjects = await CLOUD.loadAllProjects();
if (!cloudProjects || !Array.isArray(cloudProjects)) { this.toast('Cloud: ' + (cloudProjects?._error || 'nicht erreichbar'), 'error'); return; }
let synced = 0;
for (const cp of cloudProjects) {
    const fp = await CLOUD.loadProject(cp.id);
    if (!fp) continue;
    const photoMeta = fp._photos || []; delete fp._photos;
    await this.db.put('projects', fp);
    for (const pm of photoMeta) {
        const lp = await this.db.get('photos', pm.id);
        if (!lp || !lp.dataUrl) {
            const dataUrl = pm.hasPhoto ? await CLOUD.loadPhoto(cp.id, pm.id) : null;
            const po = { ...pm, dataUrl: dataUrl || '', thumbnail: dataUrl ? await this.createThumb(dataUrl, 300) : '' }; delete po.hasPhoto;
            await this.db.put('photos', po);
        }
    }
    synced++;
}
this.toast(`${synced} Projekt(e) synchronisiert`, 'success');
this.renderProjectList();
        } catch(e) { this.toast('Sync-Fehler: ' + e.message, 'error'); }
    }

    showView(id) {
        document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
        document.getElementById(id + 'View').classList.add('active');
        const back = document.getElementById('backBtn'), title = document.getElementById('headerTitle'), actions = document.getElementById('headerActions'), qfmLogo = document.getElementById('headerQfmLogo');
        if (id === 'projectList') { back.classList.remove('visible'); title.textContent = ''; actions.innerHTML = ''; if(qfmLogo) qfmLogo.style.display=''; }
        else if (id === 'projectForm') { back.classList.add('visible'); title.textContent = this.editingId ? 'Bearbeiten' : 'Neues Projekt'; actions.innerHTML = ''; if(qfmLogo) qfmLogo.style.display='none'; }
        else if (id === 'projectDetail') { back.classList.add('visible'); title.textContent = this.currentProject?.projectName || ''; if(qfmLogo) qfmLogo.style.display='none'; actions.innerHTML = '<button class="btn btn-secondary btn-sm" onclick="app.editProject()" style="padding:6px 8px;min-height:36px"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg></button><button class="btn btn-secondary btn-sm" onclick="app.deleteProject()" style="padding:6px 8px;min-height:36px;color:#dc2626"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button><button class="btn btn-secondary btn-sm" onclick="app.exportProject()" style="padding:6px 8px;min-height:36px"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button><button class="btn btn-primary btn-sm" onclick="app.exportPDF()" style="padding:6px 10px;min-height:36px">PDF</button>'; }
    }
    goBack() { this.showView('projectList'); this.renderProjectList(); }
    closePdfOverlay() { const el = document.getElementById('pdfOverlay'); if (el) el.remove(); }

    async renderProjectList() {
        const projects = await this.db.getAll('projects'), grid = document.getElementById('projectGrid');
        if (!projects.length) { grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><h3>Keine Projekte</h3><p>Erstellen Sie Ihr erstes Projekt</p><button class="btn btn-primary" onclick="app.showCreateProject()">+ Neues Projekt</button></div>'; return; }
        projects.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        grid.innerHTML = projects.map(p => {
const st = { 'offen': 'Offen', 'in-arbeit': 'In Arbeit', 'abgeschlossen': 'Abgeschlossen' }[p.status] || p.status;
return `<div class="project-card" data-auftraggeber="${this.esc(p.auftraggeber || '')}" onclick="app.openProject('${p.id}')"><div class="project-card-header"><div class="project-card-title">${this.esc(p.projectName)}</div><div class="project-card-subtitle">${this.esc(p.customer)}${p.auftraggeber ? ' <span style="font-size:11px;background:var(--primary-light);color:var(--primary);padding:2px 6px;border-radius:4px;margin-left:6px">' + this.esc(p.auftraggeber) + '</span>' : ''}</div></div><div class="project-card-meta"><span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> ${new Date(p.createdAt).toLocaleDateString('de-DE')}</span><span><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg> ${this.esc(p.location || '')}</span></div><div class="project-card-actions"><select class="project-status-select status-${p.status}" onclick="event.stopPropagation()" onchange="app.changeProjectStatus('${p.id}',this.value)"><option value="offen"${p.status==='offen'?' selected':''}>Offen</option><option value="in-arbeit"${p.status==='in-arbeit'?' selected':''}>In Arbeit</option><option value="abgeschlossen"${p.status==='abgeschlossen'?' selected':''}>Abgeschlossen</option></select><button class="project-action-btn" onclick="event.stopPropagation();app.exportProject('${p.id}')" title="Speichern"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg></button><button class="project-action-btn" onclick="event.stopPropagation();app.deleteProjectFromList('${p.id}')" title="Löschen" style="color:var(--danger)"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF3B30" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div></div>`;
        }).join('');
    }
    filterProjects() {
        const s = document.getElementById('searchInput').value.toLowerCase(), st = document.getElementById('statusFilter').value, ag = document.getElementById('auftraggeberFilter').value;
        document.querySelectorAll('.project-card').forEach(c => {
const t = (c.querySelector('.project-card-title')?.textContent || '').toLowerCase(), sub = (c.querySelector('.project-card-subtitle')?.textContent || '').toLowerCase();
const cardAg = c.getAttribute('data-auftraggeber') || '';
const statusSel = c.querySelector('.project-status-select');
const cardStatus = statusSel ? statusSel.value : '';
c.style.display = (!s || t.includes(s) || sub.includes(s)) && (!st || cardStatus === st) && (!ag || cardAg === ag) ? '' : 'none';
        });
    }

    showCreateProject() { this.editingId = null; this.tempContacts = []; document.getElementById('projectForm').reset(); this.renderContactList(); if (this.currentUser && USERS[this.currentUser]) { document.getElementById('auftraggeberSelect').value = USERS[this.currentUser].auftraggeber; } this.showView('projectForm'); }

    autoFillProject() {
        const f = document.getElementById('projectForm');
        const projektNr = 'P123456';
        f.projectNumber.value = projektNr;
        f.customer.value = 'Nhas City Chicken';
        f.location.value = 'Karl-Marx-Platz 3, 12043 Berlin';
        f.status.value = 'offen';
        f.description.value = 'Neuverlegung Glasfaser-Hausanschluss';

        // Ersteller: Raimon Goly auswählen
        f.creator.value = 'Raimon Goly|Raimon.Goly@qfm.eu|+49 151 14577 327';
        f.creatorCustom.style.display = 'none';

        // Ansprechpartner hinzufügen
        this.tempContacts = [
{ name: 'Max Mustermann', role: 'Bauleiter', phone: '+49 170 1234567', email: 'max.mustermann@beispiel.de' },
{ name: 'Erika Musterfrau', role: 'Eigentümerin', phone: '+49 171 9876543', email: 'erika.musterfrau@beispiel.de' }
        ];
        this.renderContactList();

        this.updateProjectName();
        this.toast('Beispieldaten eingefügt', 'success');
    }

    updateProjectName() {
        const f = document.getElementById('projectForm');
        const projektNr = f.projectNumber.value.trim();
        const kunde = f.customer.value.trim();
        const adresse = f.location.value.trim();

        // Extrahiere nur die Straße (ohne PLZ und Stadt)
        let strasse = adresse;
        // Entferne PLZ (5 Ziffern) und alles danach
        const plzMatch = adresse.match(/^(.+?),?\s*\d{5}/);
        if (plzMatch) {
strasse = plzMatch[1].trim().replace(/,\s*$/, '');
        } else {
// Falls kein PLZ-Muster, nimm alles vor dem ersten Komma
const kommaIdx = adresse.indexOf(',');
if (kommaIdx > 0) {
    strasse = adresse.substring(0, kommaIdx).trim();
}
        }

        // Generiere Projektname
        if (projektNr && kunde && strasse) {
f.projectName.value = `${projektNr}_${kunde}_${strasse}`;
        } else if (projektNr && kunde) {
f.projectName.value = `${projektNr}_${kunde}`;
        } else if (projektNr) {
f.projectName.value = projektNr;
        }
    }

    onCreatorChange(select) {
        const f = document.getElementById('projectForm');
        const customInput = f.creatorCustom;
        if (select.value === '_custom') {
customInput.style.display = 'block';
customInput.focus();
        } else {
customInput.style.display = 'none';
customInput.value = '';
        }
    }

    getCreatorData() {
        const f = document.getElementById('projectForm');
        if (f.creator.value === '_custom') {
return { name: f.creatorCustom.value, email: '', phone: '' };
        } else if (f.creator.value) {
const parts = f.creator.value.split('|');
return { name: parts[0] || '', email: parts[1] || '', phone: parts[2] || '' };
        }
        return { name: '', email: '', phone: '' };
    }

    async editProject() {
        if (!this.currentProject) return;
        this.editingId = this.currentProject.id; this.tempContacts = [...(this.currentProject.contacts || [])];
        const f = document.getElementById('projectForm');
        f.projectNumber.value = this.currentProject.projectNumber || ''; f.projectName.value = this.currentProject.projectName || ''; f.customer.value = this.currentProject.customer || '';
        f.status.value = this.currentProject.status || 'offen'; f.description.value = this.currentProject.description || '';
        f.auftraggeber.value = this.currentProject.auftraggeber || '';
        f.location.value = this.currentProject.location || '';
        // Ersteller aus gespeicherten Daten setzen
        const savedCreator = this.currentProject.creator || '';
        const savedEmail = this.currentProject.creatorEmail || '';
        const savedPhone = this.currentProject.creatorPhone || '';
        // Prüfe ob es ein vordefinierter Ersteller ist
        const predefinedValue = `${savedCreator}|${savedEmail}|${savedPhone}`;
        const options = Array.from(f.creator.options);
        const matchingOption = options.find(o => o.value === predefinedValue);
        if (matchingOption) {
f.creator.value = predefinedValue;
f.creatorCustom.style.display = 'none';
        } else if (savedCreator) {
f.creator.value = '_custom';
f.creatorCustom.value = savedCreator;
f.creatorCustom.style.display = 'block';
        } else {
f.creator.value = '';
f.creatorCustom.style.display = 'none';
        }
        this.renderContactList(); this.showView('projectForm');
    }
    async deleteProject() {
        if (!this.currentProject) return;
        const confirmed = confirm(`Projekt "${this.currentProject.projectName}" wirklich löschen?\n\nAlle Fotos werden ebenfalls gelöscht.`);
        if (!confirmed) return;

        try {
// Lösche alle Fotos des Projekts
const photos = await this.db.getByIndex('photos', 'projectId', this.currentProject.id);
for (const photo of photos) {
    await this.db.delete('photos', photo.id);
}
// Lösche das Projekt
await this.db.delete('projects', this.currentProject.id);
CLOUD.deleteProject(this.currentProject.id);
this.currentProject = null;
this.toast('Projekt gelöscht', 'success');
this.goBack();
        } catch (err) {
this.toast('Fehler beim Löschen: ' + err.message, 'error');
        }
    }
    async saveProject(e) {
        e.preventDefault(); const f = e.target;
        const creatorData = this.getCreatorData();
        const p = { id: this.editingId || 'p' + Date.now(), projectNumber: f.projectNumber.value, projectName: f.projectName.value, customer: f.customer.value, auftraggeber: f.auftraggeber.value, status: f.status.value, description: f.description.value, location: f.location.value, creator: creatorData.name, creatorEmail: creatorData.email, creatorPhone: creatorData.phone, contacts: this.tempContacts, owner: this.currentUser, lat: null, lon: null, createdAt: this.editingId ? (this.currentProject?.createdAt || new Date().toISOString()) : new Date().toISOString(), updatedAt: new Date().toISOString() };

        // Versuche Online-Geocoding mit Fallback-Kette
        try {
const coords = await this.geocodeAddress(p.location);
if (coords) {
    p.lat = coords.lat;
    p.lon = coords.lon;
    console.log('Geocoding erfolgreich:', coords);
} else {
    console.log('Keine Ergebnisse, nutze lokales Geocoding');
    this.setLocalCoordinates(p, p.location);
}
        } catch (err) {
console.warn('Online Geocoding nicht möglich, nutze lokales Fallback:', err);
this.setLocalCoordinates(p, p.location);
        }

        await this.db.put('projects', p); this.toast('Gespeichert', 'success'); this.currentProject = p;
        const _ph = await this.db.getByIndex('photos', 'projectId', p.id); CLOUD.saveProject(p, _ph);
        await this.openProject(p.id);
    }

    // Zentrale Geocoding-Methode mit Fallback-Kette
    // Reihenfolge: 1) JSONP (umgeht CSP/CORS bei Neocities etc.), 2) fetch, 3) Photon fetch
    async geocodeAddress(address) {
        const query = encodeURIComponent(address);

        // Hilfsfunktion: bestes Ergebnis aus Nominatim-Array wählen
        const pickBest = (results) => {
if (!results || !Array.isArray(results) || results.length === 0) return null;
let best = results[0];
for (const r of results) {
    if (r.type === 'house' || r.type === 'building' || r.class === 'building') { best = r; break; }
    if (r.type === 'street' || r.type === 'road' || r.class === 'highway') { best = r; }
}
return { lat: parseFloat(best.lat), lon: parseFloat(best.lon), display: best.display_name || address };
        };

        // Versuch 1: Nominatim JSONP (funktioniert auch bei CSP connect-src Einschränkungen)
        try {
const result = await this._geocodeJSONP(query);
if (result) { console.log('Geocoding via JSONP erfolgreich'); return result; }
        } catch (e1) {
console.warn('JSONP-Geocoding:', e1.message);
        }

        // Versuch 2: Nominatim fetch
        try {
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 8000);
const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=de&addressdetails=1&limit=5&email=app@qfm.eu`, { signal: ac.signal });
clearTimeout(t);
if (r.ok) { const result = pickBest(await r.json()); if (result) { console.log('Geocoding via fetch erfolgreich'); return result; } }
        } catch (e2) {
console.warn('Fetch-Geocoding:', e2.message);
        }

        // Versuch 3: Photon API (Komoot, OSM-basiert, anderer Server)
        try {
const ac = new AbortController();
const t = setTimeout(() => ac.abort(), 8000);
const r = await fetch(`https://photon.komoot.io/api/?q=${query}&lang=de&limit=5`, { signal: ac.signal });
clearTimeout(t);
if (r.ok) {
    const data = await r.json();
    if (data.features && data.features.length > 0) {
        const f = data.features[0], c = f.geometry.coordinates, p = f.properties || {};
        console.log('Geocoding via Photon erfolgreich');
        return { lat: c[1], lon: c[0], display: [p.street, p.housenumber, p.city].filter(Boolean).join(' ') || address };
    }
}
        } catch (e3) {
console.warn('Photon-Geocoding:', e3.message);
        }

        throw new Error('Alle Geocoding-Dienste fehlgeschlagen');
    }

    // Nominatim JSONP – umgeht CSP connect-src (Neocities u.a.)
    _geocodeJSONP(query) {
        return new Promise((resolve, reject) => {
const cb = '_gc' + Date.now() + Math.random().toString(36).slice(2, 7);
const timer = setTimeout(() => { done(); reject(new Error('Timeout')); }, 10000);
const done = () => { clearTimeout(timer); delete window[cb]; const s = document.getElementById(cb); if (s) s.remove(); };

window[cb] = (data) => {
    done();
    if (!data || !Array.isArray(data) || data.length === 0) { resolve(null); return; }
    let best = data[0];
    for (const r of data) {
        if (r.type === 'house' || r.type === 'building') { best = r; break; }
        if (r.type === 'street' || r.type === 'road') { best = r; }
    }
    resolve({ lat: parseFloat(best.lat), lon: parseFloat(best.lon), display: best.display_name || '' });
};

const s = document.createElement('script');
s.id = cb;
s.src = `https://nominatim.openstreetmap.org/search?format=json&q=${query}&countrycodes=de&limit=5&email=app@qfm.eu&json_callback=${cb}`;
s.onerror = () => { done(); reject(new Error('Script-Ladefehler')); };
document.head.appendChild(s);
        });
    }

    setLocalCoordinates(project, location) {
        const loc = location.toLowerCase();

        // PLZ-basierte Koordinaten (erste 2 Ziffern = Region)
        const plzMatch = location.match(/\b(\d{5})\b/);
        if (plzMatch) {
const plz = plzMatch[1];
const plz2 = plz.substring(0, 2);
const plzCoords = {
    '01': [51.05, 13.74], '02': [51.18, 14.43], '03': [51.75, 14.33], '04': [51.34, 12.37],
    '06': [51.48, 11.97], '07': [50.93, 11.59], '08': [50.72, 12.49], '09': [50.83, 12.92],
    '10': [52.52, 13.40], '12': [52.47, 13.43], '13': [52.57, 13.39], '14': [52.39, 13.07],
    '15': [52.34, 14.05], '16': [52.76, 13.28], '17': [53.63, 13.37], '18': [54.09, 12.13],
    '19': [53.63, 11.41], '20': [53.55, 10.00], '21': [53.46, 9.97], '22': [53.57, 10.02],
    '23': [53.87, 10.69], '24': [54.32, 10.14], '25': [53.87, 9.48], '26': [53.14, 8.22],
    '27': [53.08, 8.80], '28': [53.08, 8.80], '29': [52.97, 10.57], '30': [52.37, 9.73],
    '31': [52.16, 9.95], '32': [52.02, 8.53], '33': [51.93, 8.38], '34': [51.31, 9.48],
    '35': [50.56, 8.67], '36': [50.55, 9.68], '37': [51.53, 9.93], '38': [52.27, 10.52],
    '39': [52.13, 11.63], '40': [51.23, 6.77], '41': [51.19, 6.44], '42': [51.26, 7.15],
    '44': [51.51, 7.47], '45': [51.46, 7.01], '46': [51.54, 6.77], '47': [51.43, 6.76],
    '48': [51.96, 7.63], '49': [52.28, 8.05], '50': [50.94, 6.96], '51': [50.94, 7.13],
    '52': [50.78, 6.08], '53': [50.74, 7.10], '54': [49.75, 6.64], '55': [49.99, 8.25],
    '56': [50.36, 7.60], '57': [50.87, 7.73], '58': [51.36, 7.47], '59': [51.66, 7.82],
    '60': [50.11, 8.68], '61': [50.22, 8.62], '63': [50.00, 9.02], '64': [49.87, 8.65],
    '65': [50.08, 8.24], '66': [49.24, 7.00], '67': [49.45, 8.44], '68': [49.49, 8.47],
    '69': [49.41, 8.69], '70': [48.78, 9.18], '71': [48.73, 9.10], '72': [48.52, 9.05],
    '73': [48.70, 9.79], '74': [49.14, 9.22], '75': [48.89, 8.70], '76': [49.01, 8.40],
    '77': [48.53, 7.85], '78': [47.99, 8.53], '79': [47.99, 7.84], '80': [48.14, 11.58],
    '81': [48.12, 11.60], '82': [48.02, 11.47], '83': [47.86, 12.13], '84': [48.46, 12.17],
    '85': [48.40, 11.74], '86': [48.37, 10.90], '87': [47.73, 10.31], '88': [47.66, 9.48],
    '89': [48.40, 9.99], '90': [49.45, 11.08], '91': [49.60, 11.01], '92': [49.02, 12.10],
    '93': [49.02, 12.10], '94': [48.57, 13.45], '95': [50.09, 11.96], '96': [50.27, 10.96],
    '97': [49.79, 9.95], '98': [50.68, 10.93], '99': [50.98, 11.03]
};
if (plzCoords[plz2]) {
    project.lat = plzCoords[plz2][0];
    project.lon = plzCoords[plz2][1];
    return;
}
        }

        // Stadt-basierte Koordinaten
        const cities = {
'berlin': [52.520008, 13.404954], 'hamburg': [53.551086, 9.993682],
'münchen': [48.137154, 11.576124], 'munich': [48.137154, 11.576124],
'köln': [50.937531, 6.960279], 'cologne': [50.937531, 6.960279],
'frankfurt': [50.110924, 8.682127], 'stuttgart': [48.775846, 9.182932],
'düsseldorf': [51.227741, 6.773456], 'dortmund': [51.513587, 7.465298],
'essen': [51.455643, 7.011555], 'leipzig': [51.339695, 12.373075],
'bremen': [53.079296, 8.801694], 'dresden': [51.050409, 13.737262],
'hannover': [52.375892, 9.732010], 'nürnberg': [49.452030, 11.076750],
'duisburg': [51.434408, 6.762329], 'bochum': [51.481845, 7.216236],
'wuppertal': [51.256213, 7.150764], 'bielefeld': [52.021240, 8.534690],
'bonn': [50.737430, 7.098207], 'münster': [51.962940, 7.628690],
'karlsruhe': [49.006890, 8.403653], 'mannheim': [49.487459, 8.466039],
'augsburg': [48.370545, 10.897790], 'wiesbaden': [50.078218, 8.239761],
'gelsenkirchen': [51.517744, 7.085717], 'mönchengladbach': [51.180454, 6.442130],
'braunschweig': [52.268874, 10.526770], 'chemnitz': [50.827847, 12.921370],
'kiel': [54.323292, 10.122765], 'aachen': [50.775346, 6.083887],
'halle': [51.482990, 11.969620], 'magdeburg': [52.120533, 11.627624],
'freiburg': [47.999008, 7.842104], 'krefeld': [51.338470, 6.585170],
'lübeck': [53.869720, 10.686390], 'oberhausen': [51.496334, 6.863610],
'erfurt': [50.978565, 11.029541], 'mainz': [49.992862, 8.247253],
'rostock': [54.092441, 12.099147], 'kassel': [51.312711, 9.479746],
'hagen': [51.360561, 7.474755], 'hamm': [51.673580, 7.815980],
'saarbrücken': [49.240157, 6.996933], 'mülheim': [51.432470, 6.883090],
'potsdam': [52.390569, 13.064473], 'ludwigshafen': [49.477230, 8.445180],
'oldenburg': [53.143890, 8.213860], 'leverkusen': [51.049610, 6.987620],
'osnabrück': [52.279110, 8.047180], 'solingen': [51.165218, 7.067620],
'heidelberg': [49.398750, 8.672434], 'herne': [51.538570, 7.225850],
'neuss': [51.198280, 6.688450], 'darmstadt': [49.872825, 8.651193],
'paderborn': [51.718920, 8.754350], 'regensburg': [49.013430, 12.101620],
'ingolstadt': [48.764660, 11.423180], 'würzburg': [49.791304, 9.953355],
'wolfsburg': [52.423490, 10.786410], 'ulm': [48.401082, 9.987608],
'heilbronn': [49.142000, 9.218790], 'pforzheim': [48.892150, 8.694530],
'göttingen': [51.533970, 9.935350], 'bottrop': [51.524470, 6.928680],
'trier': [49.749920, 6.637140], 'recklinghausen': [51.586570, 7.194890],
'reutlingen': [48.493040, 9.204880], 'bremerhaven': [53.549720, 8.580360],
'koblenz': [50.356943, 7.594063], 'bergisch gladbach': [50.992530, 7.129970],
'jena': [50.927054, 11.586260], 'remscheid': [51.178950, 7.189620],
'erlangen': [49.589690, 11.007810], 'moers': [51.451270, 6.619470],
'siegen': [50.874270, 8.024090], 'hildesheim': [52.150780, 9.950820],
'salzgitter': [52.153810, 10.400790], 'cottbus': [51.756590, 14.332870]
        };

        for (const [city, coords] of Object.entries(cities)) {
if (loc.includes(city)) {
    project.lat = coords[0];
    project.lon = coords[1];
    return;
}
        }

        // Default: Deutschland Mitte
        project.lat = 51.165691;
        project.lon = 10.451526;
    }
    cancelProjectForm() { this.goBack(); }

    showContactModal() { ['contactName', 'contactRole', 'contactPhone', 'contactEmail'].forEach(id => document.getElementById(id).value = ''); document.getElementById('contactModal').classList.add('active'); }
    closeContactModal() { document.getElementById('contactModal').classList.remove('active'); }
    addContact() {
        const n = document.getElementById('contactName').value.trim(); if (!n) { this.toast('Name erforderlich', 'error'); return; }
        this.tempContacts.push({ id: 'c' + Date.now(), name: n, role: document.getElementById('contactRole').value.trim(), phone: document.getElementById('contactPhone').value.trim(), email: document.getElementById('contactEmail').value.trim() });
        this.renderContactList(); this.closeContactModal();
    }
    removeContact(id) { this.tempContacts = this.tempContacts.filter(c => c.id !== id); this.renderContactList(); }
    renderContactList() {
        const list = document.getElementById('contactList');
        if (!this.tempContacts.length) { list.innerHTML = '<p class="text-muted text-center">Keine Ansprechpartner</p>'; return; }
        list.innerHTML = this.tempContacts.map(c => `<div class="contact-item"><div class="contact-avatar">${c.name.charAt(0).toUpperCase()}</div><div class="contact-info"><div class="contact-name">${this.esc(c.name)}</div><div class="contact-role">${this.esc(c.role || '-')}${c.phone ? ' • ' + this.esc(c.phone) : ''}</div></div><button class="btn btn-secondary btn-sm" onclick="app.removeContact('${c.id}')">×</button></div>`).join('');
    }

    async openProject(id) { const p = await this.db.get('projects', id); if (!p) { this.toast('Nicht gefunden', 'error'); return; } this.currentProject = p; this.showView('projectDetail'); this.switchTab('photos'); }
    switchTab(tab) {
        document.querySelectorAll('.tab').forEach(t => t.classList.toggle('active', t.dataset.tab === tab));
        document.querySelectorAll('.tab-content').forEach(c => c.classList.toggle('active', c.id === tab + 'Tab'));
        if (tab === 'photos') this.renderPhotoGrid(); else if (tab === 'map') this.initMap(); else if (tab === 'quantities') this.renderQuantityTable(); else if (tab === 'notes') this.initNotepad();
    }

    async renderPhotoGrid() {
        const photos = await this.db.getByIndex('photos', 'projectId', this.currentProject.id), grid = document.getElementById('photoGrid');
        // Sort by sortOrder (fallback to createdAt for old photos)
        photos.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        // Assign sortOrder to old photos that don't have one
        let needsSave = false;
        photos.forEach((ph, i) => { if (ph.sortOrder === undefined) { ph.sortOrder = i; needsSave = true; } });
        if (needsSave) for (const ph of photos) await this.db.put('photos', ph);

        grid.innerHTML = `<div class="photo-card add-photo-card" onclick="document.getElementById('cameraInput').click()"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg><br>Aufnehmen</div><div class="photo-card add-photo-card" onclick="document.getElementById('importInput').click()"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><br>Importieren</div>`;
        photos.forEach((ph, idx) => {
const card = document.createElement('div'); card.className = 'photo-card'; card.style.position = 'relative';
card.innerHTML = `<img src="${ph.thumbnail || ph.dataUrl}" onclick="app.openEditor('${ph.id}')" style="cursor:pointer;width:100%;height:100%;object-fit:cover">${ph.isMapSnapshot ? '<span class="photo-card-badge">Karte</span>' : ''}
<div style="position:absolute;bottom:0;left:0;right:0;display:flex;justify-content:center;gap:4px;padding:4px;background:linear-gradient(transparent,rgba(0,0,0,0.5))">
    ${idx > 0 ? `<button onclick="event.stopPropagation();app.movePhoto('${ph.id}',-1)" style="width:28px;height:28px;border:none;background:rgba(255,255,255,0.85);border-radius:6px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Nach vorne">◀</button>` : ''}
    <span style="color:white;font-size:11px;font-weight:600;padding:4px 6px;text-shadow:0 1px 2px rgba(0,0,0,0.5)">${idx + 1}/${photos.length}</span>
    ${idx < photos.length - 1 ? `<button onclick="event.stopPropagation();app.movePhoto('${ph.id}',1)" style="width:28px;height:28px;border:none;background:rgba(255,255,255,0.85);border-radius:6px;font-size:14px;cursor:pointer;display:flex;align-items:center;justify-content:center" title="Nach hinten">▶</button>` : ''}
</div>`;
grid.appendChild(card);
        });
    }
    async movePhoto(photoId, direction) {
        const photos = await this.db.getByIndex('photos', 'projectId', this.currentProject.id);
        photos.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        // Assign sortOrder if missing
        photos.forEach((ph, i) => { if (ph.sortOrder === undefined) ph.sortOrder = i; });
        const idx = photos.findIndex(p => p.id === photoId);
        if (idx < 0) return;
        const targetIdx = idx + direction;
        if (targetIdx < 0 || targetIdx >= photos.length) return;
        // Swap sortOrder values
        const tmp = photos[idx].sortOrder;
        photos[idx].sortOrder = photos[targetIdx].sortOrder;
        photos[targetIdx].sortOrder = tmp;
        await this.db.put('photos', photos[idx]);
        await this.db.put('photos', photos[targetIdx]);
        this.renderPhotoGrid();
    }
    async handlePhotoCapture(e) { if (e.target.files.length) { await this.addPhotos(e.target.files); e.target.value = ''; } }
    async handlePhotoImport(e) { if (e.target.files.length) { await this.addPhotos(e.target.files); e.target.value = ''; } }
    async addPhotos(files) {
        const existingPhotos = await this.db.getByIndex('photos', 'projectId', this.currentProject.id);
        let maxSort = existingPhotos.reduce((max, ph) => Math.max(max, ph.sortOrder || 0), 0);
        for (const f of files) {
maxSort++;
const dataUrl = await this.readFile(f), thumb = await this.createThumb(dataUrl, 300);
await this.db.put('photos', { id: 'ph' + Date.now() + '_' + Math.random().toString(36).substr(2, 6), projectId: this.currentProject.id, name: f.name, dataUrl, thumbnail: thumb, annotations: [], isMapSnapshot: false, mapMetadata: null, createdAt: new Date().toISOString(), sortOrder: maxSort });
        }
        this.toast(files.length + ' Foto(s) hinzugefügt', 'success'); this.renderPhotoGrid();
        if (this.currentProject) { const _ap = await this.db.getByIndex('photos', 'projectId', this.currentProject.id); CLOUD.saveProject(this.currentProject, _ap); }
    }
    onLocationInput(input) {
        clearTimeout(this._locationTimer);
        var q = input.value.trim();
        var dropdown = document.getElementById('locationAutocomplete');
        if (q.length < 3) { dropdown.classList.remove('active'); return; }
        this._locationTimer = setTimeout(function() { app.fetchLocationSuggestions(q); }, 300);
    }
    showSettings() {
        var modal = document.getElementById('settingsModal');
        document.getElementById('settingsRegion').value = localStorage.getItem('sitesketch_region') || '';
        var darkOn = localStorage.getItem('sitesketch_dark_theme') === 'true';
        document.getElementById('settingsDarkTheme').checked = darkOn;
        this._updateDarkThemeUI(darkOn);
        modal.style.display = 'flex';
    }
    closeSettings() {
        document.getElementById('settingsModal').style.display = 'none';
    }
    saveDarkTheme() {
        var on = document.getElementById('settingsDarkTheme').checked;
        localStorage.setItem('sitesketch_dark_theme', on ? 'true' : 'false');
        this._applyDarkTheme(on); this._updateDarkThemeUI(on);
        this.toast(on ? 'Dark Theme aktiviert' : 'Dark Theme deaktiviert', 'success');
    }
    _updateDarkThemeUI(on) {
        var s = document.getElementById('darkThemeSlider'), bg = document.getElementById('settingsDarkTheme').parentElement.children[1], l = document.getElementById('darkThemeLabel');
        if (on) { s.style.transform='translateX(20px)'; bg.style.background='#34C759'; l.textContent='An'; }
        else { s.style.transform='translateX(0)'; bg.style.background='#E5E5EA'; l.textContent='Aus'; }
    }
    _applyDarkTheme(on) {
        if (on) {
document.body.classList.add('dark-theme');
document.querySelectorAll('img[src="assets/logo.png"]').forEach(img => img.src = 'assets/logo-dark.png');
document.querySelectorAll('img[src="assets/qfm-logo.png"]').forEach(img => { if (!img.closest('.page-logo-fixed') && !img.closest('.page-logo-inline')) img.src = 'assets/qfm-logo-dark.png'; });
        } else {
document.body.classList.remove('dark-theme');
document.querySelectorAll('img[src="assets/logo-dark.png"]').forEach(img => img.src = 'assets/logo.png');
document.querySelectorAll('img[src="assets/qfm-logo-dark.png"]').forEach(img => img.src = 'assets/qfm-logo.png');
        }
    }
    saveSettings() {
        var val = document.getElementById('settingsRegion').value;
        localStorage.setItem('sitesketch_region', val);
        this._gAutoService = null;
        var label = document.getElementById('settingsRegion').options[document.getElementById('settingsRegion').selectedIndex].text;
        this.toast('Region: ' + label, 'success');
    }
    fetchLocationSuggestions(query) {
        var dropdown = document.getElementById('locationAutocomplete');
        dropdown.innerHTML = '<div style="padding:12px;color:#8E8E93;font-size:13px;text-align:center">Suche...</div>';
        dropdown.classList.add('active');
        var self = this;

        if (!this._gAutoService) {
this._gAutoService = new google.maps.places.AutocompleteService();
        }
        var request = {
input: query,
componentRestrictions: { country: 'de' },
types: ['geocode', 'establishment']
        };
        var region = localStorage.getItem('sitesketch_region') || '';
        if (region) {
var parts = region.split(',');
var lat = parseFloat(parts[0]);
var lng = parseFloat(parts[1]);
var radius = parseInt(parts[2]);
request.location = new google.maps.LatLng(lat, lng);
request.radius = radius;
        }
        this._gAutoService.getPlacePredictions(request, function(predictions, status) {
if (status !== google.maps.places.PlacesServiceStatus.OK || !predictions || !predictions.length) {
    dropdown.innerHTML = '<div style="padding:12px;color:#8E8E93;font-size:13px;text-align:center">Keine Ergebnisse</div>';
    return;
}
self._locationPredictions = predictions;
dropdown.innerHTML = predictions.map(function(p, i) {
    var main = p.structured_formatting.main_text || '';
    var sub = p.structured_formatting.secondary_text || '';
    return '<div class="autocomplete-item" data-index="' + i + '">' +
        '<div class="autocomplete-item-icon"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg></div>' +
        '<div class="autocomplete-item-text"><div class="autocomplete-item-main">' + main.replace(/</g,'&lt;') + '</div>' +
        '<div class="autocomplete-item-sub">' + sub.replace(/</g,'&lt;') + '</div></div></div>';
}).join('');
dropdown.querySelectorAll('.autocomplete-item').forEach(function(item) {
    item.addEventListener('click', function(e) {
        e.stopPropagation();
        e.preventDefault();
        var idx = parseInt(item.getAttribute('data-index'));
        var pred = self._locationPredictions[idx];
        self.selectLocation(pred.place_id, pred.description);
    });
});
        });
    }
    selectLocation(placeId, fallback) {
        var input = document.querySelector('input[name="location"]');
        var dropdown = document.getElementById('locationAutocomplete');
        dropdown.classList.remove('active');

        if (!this._gPlacesDiv) {
this._gPlacesDiv = document.createElement('div');
this._gPlacesService = new google.maps.places.PlacesService(this._gPlacesDiv);
        }
        var self = this;
        this._gPlacesService.getDetails({
placeId: placeId,
fields: ['address_components']
        }, function(place, status) {
if (status === google.maps.places.PlacesServiceStatus.OK && place && place.address_components) {
    var c = {};
    place.address_components.forEach(function(comp) {
        comp.types.forEach(function(t) { c[t] = comp.long_name; });
    });
    var street = c.route || '';
    var nr = c.street_number || '';
    var plz = c.postal_code || '';
    var city = c.locality || c.sublocality || c.administrative_area_level_3 || c.administrative_area_level_2 || '';
    var parts = [];
    if (street) parts.push(street + (nr ? ' ' + nr : ''));
    if (plz || city) parts.push((plz + ' ' + city).trim());
    input.value = parts.join(', ') || fallback;
} else {
    input.value = fallback;
}
self.updateProjectName();
        });
    }
    async quickCamera(id) { this.currentProject = await this.db.get('projects', id); document.getElementById('cameraInput').click(); }
    async quickImport(id) { this.currentProject = await this.db.get('projects', id); document.getElementById('importInput').click(); }
    async changeProjectStatus(id, newStatus) {
        const p = await this.db.get('projects', id);
        if (!p) return;
        p.status = newStatus;
        p.updatedAt = new Date().toISOString();
        await this.db.put('projects', p);
        { const _sp = await this.db.getByIndex('photos', 'projectId', p.id); CLOUD.saveProject(p, _sp); }
        const st = { 'offen': 'Offen', 'in-arbeit': 'In Arbeit', 'abgeschlossen': 'Abgeschlossen' }[newStatus] || newStatus;
        this.toast(`Status → ${st}`, 'success');
        this.renderProjectList();
    }
    async deleteProjectFromList(id) {
        const p = await this.db.get('projects', id);
        if (!p) return;
        this.currentProject = p;
        await this.deleteProject();
    }

    initMap() {
        const p = this.currentProject;
        // Fallback-Koordinaten wenn keine vorhanden (Deutschland Mitte)
        const lat = p?.lat || 51.165691;
        const lon = p?.lon || 10.451526;
        const hasCoords = p?.lat && p?.lon;

        console.log('initMap aufgerufen, Projekt:', p?.projectName, 'lat:', lat, 'lon:', lon, 'hasCoords:', hasCoords);

        // Aktualisiere Location-Bar
        const locText = document.getElementById('mapLocationText');
        if (locText) {
if (hasCoords) {
    locText.textContent = `${p.location || 'Standort'} (${lat.toFixed(5)}, ${lon.toFixed(5)})`;
} else {
    locText.textContent = `${p?.location || 'Kein Standort'} – nicht georeferenziert`;
    locText.style.color = 'var(--warning)';
}
        }

        setTimeout(() => {
const mapEl = document.getElementById('map');
if (!mapEl) return;

// Falls Karte bereits existiert, zerstören
if (this.map) {
    try { this.map.remove(); } catch (e) { }
    this.map = null;
}

try {
    console.log('Erstelle Leaflet Karte bei:', lat, lon);

    // Karte initialisieren
    const map = L.map('map', {
        zoomControl: true,
        attributionControl: true,
        maxZoom: 22
    }).setView([lat, lon], hasCoords ? 16 : 6);
    this.map = map;

    // Cleaner Kartenstil mit Hausnummern, ohne POI-Symbole
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_nolabels/{z}/{x}/{y}{r}.png', {
        attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> © <a href="https://carto.com/">CARTO</a>',
        maxNativeZoom: 20,
        maxZoom: 22,
        subdomains: 'abcd',
        crossOrigin: 'anonymous'
    }).addTo(map);
    // Labels-Layer darüber (Straßennamen + Hausnummern, keine POIs)
    L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', {
        maxNativeZoom: 20,
        maxZoom: 22,
        subdomains: 'abcd',
        crossOrigin: 'anonymous',
        pane: 'overlayPane'
    }).addTo(map);

    // ALKIS Berlin WMS Overlays
    map.createPane('alkisPane');
    map.getPane('alkisPane').style.zIndex = 350;

    // 1. Flurstücke (Grundstücksgrenzen)
    this._alkisFlurstuecke = L.tileLayer.wms('https://gdi.berlin.de/services/wms/alkis_flurstuecke', {
        layers: 'flurstuecke',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        maxNativeZoom: 19,
        maxZoom: 22,
        opacity: 0.6,
        pane: 'alkisPane',
        attribution: '© Geoportal Berlin / ALKIS'
    });
    // 2. Gebäude
    this._alkisGebaeude = L.tileLayer.wms('https://gdi.berlin.de/services/wms/alkis_gebaeude', {
        layers: 'gebaeude',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        maxNativeZoom: 19,
        maxZoom: 22,
        opacity: 0.6,
        pane: 'alkisPane'
    });
    // 3. ALKIS Komplett (Flurkarte mit Nutzung, farbig)
    this._alkisKomplett = L.tileLayer.wms('https://gdi.berlin.de/services/wms/alkis', {
        layers: 'a_alkis_raster',
        format: 'image/png',
        transparent: true,
        version: '1.1.1',
        maxNativeZoom: 19,
        maxZoom: 22,
        opacity: 0.7,
        pane: 'alkisPane'
    });

    this._alkisFlurstuecke.on('tileerror', (e) => { console.error('ALKIS tile error:', e.tile?.src); });
    this._alkisFlurstuecke.on('tileload', () => { console.log('ALKIS tile loaded OK'); });
    this._alkisKomplett.on('tileerror', (e) => { console.error('ALKIS Komplett tile error:', e.tile?.src); });
    this._alkisMode = 'off'; // 'off' | 'flurstuecke' | 'nutzung'

    // Marker für Projektstandort (nur wenn Koordinaten vorhanden)
    if (hasCoords) {
        L.marker([lat, lon]).addTo(map).bindPopup(p.location || 'Projektstandort');
    }

    // Hinweis wenn keine Koordinaten
    if (!hasCoords) {
        this.toast('Standardposition – bitte "Neu suchen" oder "GPS" nutzen', 'info');
    }
} catch (err) {
    console.error('Kartenfehler:', err);
    this.toast('Kartenfehler – bitte Seite neu laden', 'error');
}
        }, 100);
    }

    toggleALKIS() {
        if (!this.map || !this._alkisFlurstuecke) {
this.toast('Karte nicht bereit', 'error');
return;
        }
        const btn = document.getElementById('alkisToggleBtn');
        const btnLabel = btn?.querySelector('.alkis-label');

        // Remove all layers first
        [this._alkisFlurstuecke, this._alkisGebaeude, this._alkisKomplett].forEach(l => {
if (this.map.hasLayer(l)) this.map.removeLayer(l);
        });

        // Cycle: off -> flurstuecke -> nutzung -> off
        if (this._alkisMode === 'off') {
this._alkisMode = 'flurstuecke';
const zoom = this.map.getZoom();
if (zoom > 19) this.map.setZoom(18);
else if (zoom < 15) this.map.setZoom(17);
this._alkisFlurstuecke.addTo(this.map);
this._alkisGebaeude.addTo(this.map);
if (btn) { btn.classList.remove('btn-secondary'); btn.classList.add('btn-primary'); }
if (btnLabel) btnLabel.textContent = 'Flurstücke';
this.toast('ALKIS Flurstücke + Gebäude', 'info');
        } else if (this._alkisMode === 'flurstuecke') {
this._alkisMode = 'nutzung';
const zoom = this.map.getZoom();
if (zoom > 19) this.map.setZoom(18);
else if (zoom < 15) this.map.setZoom(17);
this._alkisKomplett.addTo(this.map);
if (btn) { btn.classList.remove('btn-secondary'); btn.classList.add('btn-primary'); btn.style.background = '#16A34A'; }
if (btnLabel) btnLabel.textContent = 'Nutzung';
this.toast('ALKIS Flurkarte mit Nutzung (farbig)', 'info');
        } else {
this._alkisMode = 'off';
if (btn) { btn.classList.remove('btn-primary'); btn.classList.add('btn-secondary'); btn.style.background = ''; }
if (btnLabel) btnLabel.textContent = 'ALKIS';
this.toast('ALKIS ausgeblendet', 'info');
        }
    }

    mapZoom(d) {
        if (this.map) {
this.map.setZoom(this.map.getZoom() + d);
        }
    }

    async reGeocodeProject() {
        const p = this.currentProject;
        if (!p || !p.location) {
this.toast('Keine Adresse vorhanden', 'error');
return;
        }

        this.toast('Suche Adresse...', 'info');
        try {
const coords = await this.geocodeAddress(p.location);
if (coords) {
    p.lat = coords.lat;
    p.lon = coords.lon;
    await this.db.put('projects', p);
    this.toast(`Gefunden: ${coords.display.slice(0, 50)}`, 'success');
    this.initMap();
} else {
    this.toast('Adresse nicht gefunden – bitte GPS nutzen', 'error');
}
        } catch (err) {
console.error('Geocoding error:', err);
this.toast('Geocoding fehlgeschlagen – bitte GPS nutzen', 'error');
        }
    }

    async useGPSForProject() {
        const p = this.currentProject;
        if (!p) {
this.toast('Kein Projekt', 'error');
return;
        }

        if (!navigator.geolocation) {
this.toast('GPS nicht verfügbar', 'error');
return;
        }

        this.toast('Ermittle GPS-Position...', 'info');
        navigator.geolocation.getCurrentPosition(
async (position) => {
    p.lat = position.coords.latitude;
    p.lon = position.coords.longitude;
    await this.db.put('projects', p);
    this.toast(`GPS: ${p.lat.toFixed(5)}, ${p.lon.toFixed(5)}`, 'success');
    this.initMap();
},
(error) => {
    console.error('GPS error:', error);
    let msg = 'GPS-Fehler';
    if (error.code === 1) msg = 'GPS-Zugriff verweigert';
    else if (error.code === 2) msg = 'Position nicht verfügbar';
    else if (error.code === 3) msg = 'GPS Timeout';
    this.toast(msg, 'error');
},
{ enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
        );
    }

    async saveMapSnapshot() {
        const p = this.currentProject;
        if (!p) { this.toast('Kein Projekt', 'error'); return; }
        const mapEl = document.getElementById('map');
        if (!mapEl) { this.toast('Karte nicht bereit', 'error'); return; }

        try {
this.toast('Speichern...', 'info');

// Leaflet Controls temporär ausblenden
const ctrls = mapEl.querySelectorAll('.leaflet-control-container');
ctrls.forEach(c => c.style.display = 'none');

const snapshotScale = Math.max(3, Math.round(window.devicePixelRatio || 1) * 2);
const canvas = await html2canvas(mapEl, { useCORS: true, backgroundColor: '#E8E8E8', scale: snapshotScale });
const dataUrl = canvas.toDataURL('image/png');

// Wieder einblenden
ctrls.forEach(c => c.style.display = '');

const existingPhotos = await this.db.getByIndex('photos', 'projectId', p.id);
const maxSort = existingPhotos.reduce((max, ph) => Math.max(max, ph.sortOrder || 0), 0);
const thumb = await this.createThumb(dataUrl, 300);
await this.db.put('photos', {
    id: 'ph' + Date.now(),
    projectId: p.id,
    name: 'Karte_' + new Date().toISOString().split('T')[0] + '.png',
    dataUrl,
    thumbnail: thumb,
    annotations: [],
    isMapSnapshot: true,
    mapMetadata: this.map ? {
        centerLat: this.map.getCenter().lat,
        centerLon: this.map.getCenter().lng,
        zoomLevel: this.map.getZoom(),
        pixelWidth: canvas.width,
        pixelHeight: canvas.height,
        boundingBox: {
            north: this.map.getBounds().getNorth(),
            south: this.map.getBounds().getSouth(),
            west: this.map.getBounds().getWest(),
            east: this.map.getBounds().getEast()
        }
    } : null,
    createdAt: new Date().toISOString(),
    sortOrder: maxSort + 1
});
this.toast('Karte gespeichert', 'success');
this.switchTab('photos');
        } catch (e) {
console.error(e);
this.toast('Fehler beim Speichern', 'error');
        }
    }

    async openEditor(id) {
        const ph = await this.db.get('photos', id); if (!ph) return; this.currentPhoto = ph;
        const img = new Image();
        img.onload = () => {
document.getElementById('editorTitle').textContent = ph.name;
document.getElementById('editorContainer').classList.add('active');
document.getElementById('photoNotes').value = ph.notes || '';
this.editor.init(ph, img);
        };
        img.src = ph.dataUrl;
    }
    onPhotoNotesChange(val) { if (this.currentPhoto) this.currentPhoto.notes = val; }
    closeEditor() { document.getElementById('editorContainer').classList.remove('active'); this.currentPhoto = null; }
    async saveEditor() { if (!this.currentPhoto) return; this.currentPhoto.annotations = this.editor.getAnnotations(); this.currentPhoto.sizeMultiplier = this.editor.sizeMultiplier; this.currentPhoto.notes = document.getElementById('photoNotes').value || ''; await this.db.put('photos', this.currentPhoto); this.toast('Gespeichert', 'success'); this.closeEditor(); this.renderPhotoGrid(); if (this.currentProject) { const _p = await this.db.getByIndex('photos', 'projectId', this.currentProject.id); CLOUD.saveProject(this.currentProject, _p); } }
    editorUndo() { this.editor.undo(); }
    editorRedo() { this.editor.redo(); }
    async deletePhoto() { if (!this.currentPhoto || !confirm('Löschen?')) return; await this.db.delete('photos', this.currentPhoto.id); this.toast('Gelöscht', 'success'); this.closeEditor(); this.renderPhotoGrid(); }

    async renderQuantityTable() {
        const photos = await this.db.getByIndex('photos', 'projectId', this.currentProject.id), tbody = document.getElementById('quantityTableBody');
        const qty = {};
        const addQty = (key, name, unit, type = 'line') => { if (!qty[key]) qty[key] = { tool: { name, unit, type }, auto: 0, manual: null }; };
        // Init non-trasse tools
        Object.values(TOOLS).filter(t => t.unit && t.id !== 'TRASSE').forEach(t => { qty[t.id] = { tool: t, auto: 0, manual: null }; });
        // Iterate annotations
        photos.forEach(ph => (ph.annotations || []).forEach(a => {
const t = TOOLS[a.tool]; if (!t || !t.unit) return;
if (a.tool === 'TRASSE') {
    a.meta = a.meta || {};
    const surf = a.meta.surface || 'GEHWEGPLATTE';
    const dn = a.meta.dn || 'DN50';
    const surfLabel = (SURFACES.find(s => s.value === surf) || { label: surf }).label;
    const dnLabel = (DNS.find(d => d.value === dn) || { label: dn }).label;
    // overall trasse
    addQty('TRASSE_TOTAL', 'Trasse gesamt', t.unit);
    // per DN (label ohne "Trasse")
    addQty(`TRASSE_DN_${dn}`, dnLabel, t.unit);
    // per surface (label ohne "Trasse")
    addQty(`TRASSE_SURF_${surf}`, surfLabel, t.unit);
    if (a.computed?.lengthMeters) {
        qty['TRASSE_TOTAL'].auto += a.computed.lengthMeters;
        qty[`TRASSE_DN_${dn}`].auto += a.computed.lengthMeters;
        qty[`TRASSE_SURF_${surf}`].auto += a.computed.lengthMeters;
    }
} else if (t.type === 'line' && a.computed?.lengthMeters) {
    qty[t.id].auto += a.computed.lengthMeters;
} else if (t.type === 'point') {
    qty[t.id].auto += 1;
}
        }));
        const saved = this.currentProject.quantities || {};
        Object.keys(saved).forEach(k => { if (qty[k]) qty[k].manual = saved[k]; });

        // Sort: Trasse gesamt first, dann DN, dann Oberfläche, dann Rest alphabetisch
        const keys = Object.keys(qty);
        const orderValue = (k) => {
if (k === 'TRASSE_TOTAL') return 0;
if (k.startsWith('TRASSE_DN_')) return 1;
if (k.startsWith('TRASSE_SURF_')) return 2;
return 3;
        };
        keys.sort((a, b) => {
const oa = orderValue(a), ob = orderValue(b);
if (oa !== ob) return oa - ob;
return this.qtyLabel(a, qty[a].tool).localeCompare(this.qtyLabel(b, qty[b].tool), 'de');
        });

        let pos = 1;
        tbody.innerHTML = keys.map(id => {
const q = qty[id];
const autoD = q.tool.type === 'line' ? q.auto.toFixed(1) : q.auto;
const val = q.manual !== null ? q.manual : q.auto;
const name = this.qtyLabel(id, q.tool);
return `<tr><td>${pos++}</td><td>${name}</td><td>${q.tool.unit}</td><td style="color:#94A3B8">${autoD}</td><td><input type="number" class="quantity-input" value="${q.tool.type === 'line' ? val.toFixed(1) : val}" step="${q.tool.type === 'line' ? '0.1' : '1'}" onchange="app.updateQty('${id}',this.value)"></td></tr>`;
        }).join('');
    }
    async updateQty(id, val) { if (!this.currentProject.quantities) this.currentProject.quantities = {}; this.currentProject.quantities[id] = parseFloat(val); await this.db.put('projects', this.currentProject); { const _qp = await this.db.getByIndex('photos', 'projectId', this.currentProject.id); CLOUD.saveProject(this.currentProject, _qp); } }
    // ============ NOTEPAD ============
    initNotepad() {
        const canvas = document.getElementById('noteCanvas');
        if (!canvas) return;
        // Size canvas to container
        const container = canvas.parentElement;
        const rect = container.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        canvas.style.width = rect.width + 'px';
        canvas.style.height = rect.height + 'px';

        const ctx = canvas.getContext('2d');
        ctx.scale(dpr, dpr);

        // State
        if (!this._noteState) {
this._noteState = {
    color: '#1A1A2E',
    lineWidth: 2,
    eraser: false,
    strokes: [],       // Array of completed strokes
    currentStroke: null,
    undoStack: []
};
        }
        this._noteCtx = ctx;
        this._noteCanvas = canvas;
        this._noteDpr = dpr;
        this._noteW = rect.width;
        this._noteH = rect.height;

        // Load saved strokes from project
        if (this.currentProject && this.currentProject.noteStrokes) {
this._noteState.strokes = JSON.parse(JSON.stringify(this.currentProject.noteStrokes));
        } else {
this._noteState.strokes = [];
        }
        this._noteState.undoStack = [];

        this._noteRedraw();
        this._noteSetupEvents(canvas);
    }

    _noteSetupEvents(canvas) {
        // Remove old listeners by replacing element (clean approach)
        const newCanvas = canvas.cloneNode(true);
        canvas.parentNode.replaceChild(newCanvas, canvas);
        this._noteCanvas = newCanvas;
        this._noteCtx = newCanvas.getContext('2d');
        this._noteCtx.scale(this._noteDpr, this._noteDpr);
        this._noteRedraw();

        const getP = (e) => {
const r = newCanvas.getBoundingClientRect();
if (e.touches) {
    return { x: e.touches[0].clientX - r.left, y: e.touches[0].clientY - r.top };
}
return { x: e.clientX - r.left, y: e.clientY - r.top };
        };

        const startDraw = (e) => {
e.preventDefault();
const p = getP(e);
const st = this._noteState;
st.currentStroke = {
    points: [p],
    color: st.eraser ? '#FFFFFF' : st.color,
    lineWidth: st.eraser ? 20 : st.lineWidth,
    eraser: st.eraser
};
        };

        const moveDraw = (e) => {
e.preventDefault();
const st = this._noteState;
if (!st.currentStroke) return;
const p = getP(e);
st.currentStroke.points.push(p);
// Draw incremental
const pts = st.currentStroke.points;
const ctx = this._noteCtx;
ctx.strokeStyle = st.currentStroke.color;
ctx.lineWidth = st.currentStroke.lineWidth;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
if (st.currentStroke.eraser) ctx.globalCompositeOperation = 'destination-out';
else ctx.globalCompositeOperation = 'source-over';
if (pts.length >= 2) {
    ctx.beginPath();
    ctx.moveTo(pts[pts.length - 2].x, pts[pts.length - 2].y);
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
}
        };

        const endDraw = (e) => {
e.preventDefault();
const st = this._noteState;
if (!st.currentStroke) return;
if (st.currentStroke.points.length > 1) {
    st.strokes.push(st.currentStroke);
    st.undoStack = []; // clear redo on new stroke
}
st.currentStroke = null;
        };

        newCanvas.addEventListener('mousedown', startDraw);
        newCanvas.addEventListener('mousemove', moveDraw);
        newCanvas.addEventListener('mouseup', endDraw);
        newCanvas.addEventListener('mouseleave', endDraw);
        newCanvas.addEventListener('touchstart', startDraw, { passive: false });
        newCanvas.addEventListener('touchmove', moveDraw, { passive: false });
        newCanvas.addEventListener('touchend', endDraw, { passive: false });
        newCanvas.addEventListener('touchcancel', endDraw, { passive: false });
    }

    _noteRedraw() {
        const ctx = this._noteCtx;
        if (!ctx) return;
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = '#FFFFFF';
        ctx.fillRect(0, 0, this._noteW, this._noteH);

        // Draw grid lines
        ctx.strokeStyle = '#E5E7EB';
        ctx.lineWidth = 0.5;
        const spacing = 25;
        for (let y = spacing; y < this._noteH; y += spacing) {
ctx.beginPath();
ctx.moveTo(0, y);
ctx.lineTo(this._noteW, y);
ctx.stroke();
        }

        // Draw all strokes
        this._noteState.strokes.forEach(stroke => {
if (stroke.points.length < 2) return;
ctx.strokeStyle = stroke.color;
ctx.lineWidth = stroke.lineWidth;
ctx.lineCap = 'round';
ctx.lineJoin = 'round';
if (stroke.eraser) ctx.globalCompositeOperation = 'destination-out';
else ctx.globalCompositeOperation = 'source-over';
ctx.beginPath();
ctx.moveTo(stroke.points[0].x, stroke.points[0].y);
for (let i = 1; i < stroke.points.length; i++) {
    ctx.lineTo(stroke.points[i].x, stroke.points[i].y);
}
ctx.stroke();
        });
        ctx.globalCompositeOperation = 'source-over';
    }

    setNoteColor(color) {
        this._noteState.color = color;
        this._noteState.eraser = false;
        document.getElementById('noteEraserBtn').style.background = '';
        document.getElementById('noteEraserBtn').style.color = '';
        document.querySelectorAll('.note-color-btn').forEach(btn => {
btn.style.borderColor = btn.dataset.color === color ? 'var(--primary)' : 'transparent';
        });
    }

    setNoteSize(size) {
        this._noteState.lineWidth = size;
        document.querySelectorAll('.note-size-btn').forEach(btn => {
btn.classList.toggle('active', parseInt(btn.dataset.size) === size);
btn.style.borderColor = parseInt(btn.dataset.size) === size ? 'var(--primary)' : 'var(--border)';
        });
    }

    toggleNoteEraser() {
        this._noteState.eraser = !this._noteState.eraser;
        const btn = document.getElementById('noteEraserBtn');
        if (this._noteState.eraser) {
btn.style.background = 'var(--primary)';
btn.style.color = 'white';
        } else {
btn.style.background = '';
btn.style.color = '';
        }
    }

    noteUndo() {
        const st = this._noteState;
        if (st.strokes.length === 0) return;
        st.undoStack.push(st.strokes.pop());
        this._noteRedraw();
    }

    noteClear() {
        if (!confirm('Alle Notizen löschen?')) return;
        this._noteState.strokes = [];
        this._noteState.undoStack = [];
        this._noteRedraw();
    }

    async noteSave() {
        if (!this.currentProject) return;
        this.currentProject.noteStrokes = JSON.parse(JSON.stringify(this._noteState.strokes));
        // Also save a preview image
        if (this._noteCanvas) {
this.currentProject.notePreview = this._noteCanvas.toDataURL('image/png', 0.5);
        }
        await this.db.put('projects', this.currentProject);
        this.toast('Notiz gespeichert', 'success');
    }

    async exportNotePDF() {
        if (!this._noteCanvas) { this.toast('Kein Notizpad vorhanden', 'error'); return; }
        // Auto-save first
        await this.noteSave();
        const imgData = this._noteCanvas.toDataURL('image/png');
        const p = this.currentProject;
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Notiz - ${this.esc(p.projectName)}</title>
<style>@page { size: A4 portrait; margin: 12mm; } @media print { .no-print { display: none !important; } } body { font-family: 'Roboto', sans-serif; margin: 0; padding: 20px; } .print-bar { position:fixed;top:0;left:0;right:0;background:#fff;padding:10px 20px;box-shadow:0 2px 8px rgba(0,0,0,0.1);display:flex;gap:8px;z-index:999; } .print-bar button { padding:8px 16px;border:1px solid #ddd;border-radius:6px;cursor:pointer;font-size:13px;background:#f8f9fa; } .print-bar button:hover { background:#e9ecef; } img { max-width:100%; }</style></head><body>
<div class="print-bar no-print"><button onclick="window.print()">🖨 Drucken</button><button onclick="window.close()">✕ Schließen</button></div>
<div style="margin-top:50px">
<h2 style="margin-bottom:4px">${this.esc(p.projectName)}</h2>
<p style="color:#666;font-size:12px;margin-bottom:16px">${this.esc(p.projectNumber || '')} · ${this.esc(p.customer || '')} · ${new Date().toLocaleDateString('de-DE')}</p>
<img src="${imgData}" style="width:100%;border:1px solid #ddd;border-radius:6px">
</div></body></html>`;
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS) {
this.showPDFOverlay(html, 'Notiz_' + (p.projectNumber || p.id));
        } else {
const w = window.open('', '_blank');
if (w) { w.document.write(html); w.document.close(); setTimeout(() => w.print(), 300); }
        }
    }

    async recalculateQuantities() {
        this.currentProject.quantities = {};
        await this.db.put('projects', this.currentProject);
        await this.renderQuantityTable();
        this.toast('Neu berechnet', 'success');
    }

    async exportQuantityXLSX() {
        if (!this.currentProject) return;
        const photos = await this.db.getByIndex('photos', 'projectId', this.currentProject.id);

        // Mengendaten sammeln (gleiche Logik wie renderQuantityTable)
        const qty = {};
        const addQty = (key, name, unit, type = 'line') => { if (!qty[key]) qty[key] = { tool: { name, unit, type }, auto: 0, manual: null }; };
        Object.values(TOOLS).filter(t => t.unit && t.id !== 'TRASSE').forEach(t => { qty[t.id] = { tool: t, auto: 0, manual: null }; });
        photos.forEach(ph => (ph.annotations || []).forEach(a => {
const t = TOOLS[a.tool]; if (!t || !t.unit) return;
if (a.tool === 'TRASSE') {
    a.meta = a.meta || {};
    const surf = a.meta.surface || 'GEHWEGPLATTE', dn = a.meta.dn || 'DN50';
    const surfLabel = (SURFACES.find(s => s.value === surf) || { label: surf }).label;
    const dnLabel = (DNS.find(d => d.value === dn) || { label: dn }).label;
    addQty('TRASSE_TOTAL', 'Trasse gesamt', t.unit);
    addQty(`TRASSE_DN_${dn}`, dnLabel, t.unit);
    addQty(`TRASSE_SURF_${surf}`, surfLabel, t.unit);
    if (a.computed?.lengthMeters) {
        qty['TRASSE_TOTAL'].auto += a.computed.lengthMeters;
        qty[`TRASSE_DN_${dn}`].auto += a.computed.lengthMeters;
        qty[`TRASSE_SURF_${surf}`].auto += a.computed.lengthMeters;
    }
} else if (t.type === 'line' && a.computed?.lengthMeters) {
    qty[t.id].auto += a.computed.lengthMeters;
} else if (t.type === 'point') {
    qty[t.id].auto += 1;
}
        }));
        const saved = this.currentProject.quantities || {};
        Object.keys(saved).forEach(k => { if (qty[k]) qty[k].manual = saved[k]; });

        // Sortieren
        const keys = Object.keys(qty);
        const orderValue = (k) => { if (k === 'TRASSE_TOTAL') return 0; if (k.startsWith('TRASSE_DN_')) return 1; if (k.startsWith('TRASSE_SURF_')) return 2; return 3; };
        keys.sort((a, b) => { const oa = orderValue(a), ob = orderValue(b); if (oa !== ob) return oa - ob; return this.qtyLabel(a, qty[a].tool).localeCompare(this.qtyLabel(b, qty[b].tool), 'de'); });

        // Zeilen aufbauen
        const rows = [];
        let pos = 1;
        keys.forEach(id => {
const q = qty[id];
const autoVal = q.tool.type === 'line' ? parseFloat(q.auto.toFixed(1)) : q.auto;
const menge = q.manual !== null ? q.manual : q.auto;
const mengeVal = q.tool.type === 'line' ? parseFloat(menge.toFixed(1)) : menge;
rows.push([pos++, this.qtyLabel(id, q.tool), q.tool.unit, autoVal, mengeVal]);
        });

        // XLSX generieren (Office Open XML)
        const escXml = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
        const colLetter = (i) => String.fromCharCode(65 + i);

        // Projektinfo-Zeilen
        const pn = this.currentProject.projectName || '';
        const pnr = this.currentProject.projectNumber || '';
        const kunde = this.currentProject.customer || '';
        const ort = this.currentProject.location || '';
        const datum = new Date().toLocaleDateString('de-DE');

        let sheetRows = '';
        let r = 1;
        // Kopfzeilen Projektinfo
        sheetRows += `<row r="${r}"><c r="A${r}" t="inlineStr" s="2"><is><t>Projekt:</t></is></c><c r="B${r}" t="inlineStr" s="3"><is><t>${escXml(pn)}</t></is></c></row>`;
        r++;
        sheetRows += `<row r="${r}"><c r="A${r}" t="inlineStr" s="2"><is><t>Projektnr.:</t></is></c><c r="B${r}" t="inlineStr" s="3"><is><t>${escXml(pnr)}</t></is></c></row>`;
        r++;
        sheetRows += `<row r="${r}"><c r="A${r}" t="inlineStr" s="2"><is><t>Kunde:</t></is></c><c r="B${r}" t="inlineStr" s="3"><is><t>${escXml(kunde)}</t></is></c></row>`;
        r++;
        sheetRows += `<row r="${r}"><c r="A${r}" t="inlineStr" s="2"><is><t>Standort:</t></is></c><c r="B${r}" t="inlineStr" s="3"><is><t>${escXml(ort)}</t></is></c></row>`;
        r++;
        sheetRows += `<row r="${r}"><c r="A${r}" t="inlineStr" s="2"><is><t>Datum:</t></is></c><c r="B${r}" t="inlineStr" s="3"><is><t>${escXml(datum)}</t></is></c></row>`;
        r += 2; // Leerzeile

        // Tabellen-Header
        const headers = ['Pos.', 'Beschreibung', 'Einheit', 'Auto', 'Menge'];
        sheetRows += `<row r="${r}">` + headers.map((h, i) => `<c r="${colLetter(i)}${r}" t="inlineStr" s="1"><is><t>${escXml(h)}</t></is></c>`).join('') + `</row>`;
        r++;

        // Datenzeilen
        rows.forEach(row => {
sheetRows += `<row r="${r}">`;
sheetRows += `<c r="A${r}" s="4"><v>${row[0]}</v></c>`;
sheetRows += `<c r="B${r}" t="inlineStr" s="0"><is><t>${escXml(row[1])}</t></is></c>`;
sheetRows += `<c r="C${r}" t="inlineStr" s="0"><is><t>${escXml(row[2])}</t></is></c>`;
sheetRows += `<c r="D${r}" s="5"><v>${row[3]}</v></c>`;
sheetRows += `<c r="E${r}" s="6"><v>${row[4]}</v></c>`;
sheetRows += `</row>`;
r++;
        });

        // Summenzeile
        const sumRow = r;
        sheetRows += `<row r="${r}">`;
        sheetRows += `<c r="A${r}" s="1"/>`;
        sheetRows += `<c r="B${r}" t="inlineStr" s="1"><is><t>Gesamt</t></is></c>`;
        sheetRows += `<c r="C${r}" s="1"/>`;
        sheetRows += `<c r="D${r}" s="7"><f>SUM(D8:D${r - 1})</f></c>`;
        sheetRows += `<c r="E${r}" s="7"><f>SUM(E8:E${r - 1})</f></c>`;
        sheetRows += `</row>`;

        const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<cols><col min="1" max="1" width="8" customWidth="1"/><col min="2" max="2" width="35" customWidth="1"/><col min="3" max="3" width="10" customWidth="1"/><col min="4" max="4" width="12" customWidth="1"/><col min="5" max="5" width="12" customWidth="1"/></cols>
<sheetData>${sheetRows}</sheetData>
</worksheet>`;

        const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<fonts count="3">
<font><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><name val="Calibri"/></font>
<font><b/><sz val="11"/><color rgb="FF003C71"/><name val="Calibri"/></font>
</fonts>
<fills count="4">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FF003C71"/></patternFill></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFF1F5F9"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color auto="1"/></bottom><diagonal/></border>
</borders>
<cellXfs count="8">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" applyFont="1"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="0"/>
<xf numFmtId="0" fontId="0" fillId="0" borderId="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center"/></xf>
<xf numFmtId="2" fontId="0" fillId="0" borderId="1" applyNumberFormat="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="2" fontId="1" fillId="0" borderId="1" applyNumberFormat="1" applyFont="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
<xf numFmtId="2" fontId="1" fillId="3" borderId="1" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="right"/></xf>
</cellXfs>
</styleSheet>`;

        const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
</Types>`;

        const workbook = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheets><sheet name="Mengenaufmaß" sheetId="1" r:id="rId1"/></sheets>
</workbook>`;

        const wbRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`;

        const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
</Relationships>`;

        // ZIP erstellen (minimal, ohne Kompression – funktioniert überall)
        const files = [
{ path: '[Content_Types].xml', data: contentTypes },
{ path: '_rels/.rels', data: rootRels },
{ path: 'xl/workbook.xml', data: workbook },
{ path: 'xl/_rels/workbook.xml.rels', data: wbRels },
{ path: 'xl/styles.xml', data: styles },
{ path: 'xl/worksheets/sheet1.xml', data: sheet }
        ];

        const blob = this._createZipBlob(files);
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `Mengenaufmass_${this.currentProject.projectNumber || this.currentProject.id}.xlsx`;
        a.click();
        URL.revokeObjectURL(a.href);
        this.toast('Excel exportiert', 'success');
    }

    // Minimaler ZIP-Generator (Store-only, keine Kompression)
    _createZipBlob(files) {
        const enc = new TextEncoder();
        const entries = files.map(f => ({ path: enc.encode(f.path), data: enc.encode(f.data) }));

        let offset = 0;
        const localHeaders = [];
        const centralHeaders = [];

        entries.forEach(e => {
const localHeaderOffset = offset;
// Local file header
const lh = new Uint8Array(30 + e.path.length);
const lv = new DataView(lh.buffer);
lv.setUint32(0, 0x04034b50, true); // signature
lv.setUint16(4, 20, true); // version needed
lv.setUint16(6, 0, true); // flags
lv.setUint16(8, 0, true); // compression (store)
lv.setUint16(10, 0, true); // mod time
lv.setUint16(12, 0, true); // mod date
lv.setUint32(14, this._crc32(e.data), true); // crc32
lv.setUint32(18, e.data.length, true); // compressed size
lv.setUint32(22, e.data.length, true); // uncompressed size
lv.setUint16(26, e.path.length, true); // filename length
lv.setUint16(28, 0, true); // extra length
lh.set(e.path, 30);
localHeaders.push(lh);
offset += lh.length + e.data.length;

// Central directory header
const ch = new Uint8Array(46 + e.path.length);
const cv = new DataView(ch.buffer);
cv.setUint32(0, 0x02014b50, true);
cv.setUint16(4, 20, true);
cv.setUint16(6, 20, true);
cv.setUint16(8, 0, true);
cv.setUint16(10, 0, true);
cv.setUint16(12, 0, true);
cv.setUint16(14, 0, true);
cv.setUint32(16, this._crc32(e.data), true);
cv.setUint32(20, e.data.length, true);
cv.setUint32(24, e.data.length, true);
cv.setUint16(28, e.path.length, true);
cv.setUint16(30, 0, true);
cv.setUint16(32, 0, true);
cv.setUint16(34, 0, true);
cv.setUint16(36, 0, true);
cv.setUint32(38, 0, true);
cv.setUint32(42, localHeaderOffset, true);
ch.set(e.path, 46);
centralHeaders.push(ch);
        });

        const centralDirOffset = offset;
        let centralDirSize = 0;
        centralHeaders.forEach(ch => centralDirSize += ch.length);

        // End of central directory
        const eocd = new Uint8Array(22);
        const ev = new DataView(eocd.buffer);
        ev.setUint32(0, 0x06054b50, true);
        ev.setUint16(4, 0, true);
        ev.setUint16(6, 0, true);
        ev.setUint16(8, entries.length, true);
        ev.setUint16(10, entries.length, true);
        ev.setUint32(12, centralDirSize, true);
        ev.setUint32(16, centralDirOffset, true);
        ev.setUint16(20, 0, true);

        const parts = [];
        entries.forEach((e, i) => { parts.push(localHeaders[i]); parts.push(e.data); });
        centralHeaders.forEach(ch => parts.push(ch));
        parts.push(eocd);

        return new Blob(parts, { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    }

    _crc32(data) {
        let crc = 0xFFFFFFFF;
        if (!this._crc32Table) {
this._crc32Table = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    this._crc32Table[i] = c;
}
        }
        for (let i = 0; i < data.length; i++) crc = this._crc32Table[(crc ^ data[i]) & 0xFF] ^ (crc >>> 8);
        return (crc ^ 0xFFFFFFFF) >>> 0;
    }
    qtyLabel(id, tool) {
        if (id.startsWith('SCHACHT_AZK_')) return 'AZK ' + (tool.name || '');
        if (id.startsWith('SCHACHT_DAZK_')) return 'DAZK ' + (tool.name || '');
        if (id.startsWith('SCHACHT_APL_')) return 'APL ' + (tool.name || '');
        return tool.name || id;
    }

    async exportProject(id) {
        const pid = id || this.currentProject?.id; if (!pid) return;
        const p = await this.db.get('projects', pid), photos = await this.db.getByIndex('photos', 'projectId', pid);
        const blob = new Blob([JSON.stringify({ version: '1.0', exportedAt: new Date().toISOString(), project: p, photos }, null, 2)], { type: 'application/json' });
        const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `SiteSketch_${p.projectNumber || p.id}.json`; a.click();
        this.toast('Exportiert', 'success');
    }
    async handleJsonImport(e) {
        const f = e.target.files[0]; if (!f) return;
        try {
const text = await f.text();
const data = JSON.parse(text);
if (!data.project) throw new Error('Keine gültige SiteSketch-Datei');
const newId = 'p' + Date.now();
data.project.id = newId;
data.project.importedAt = new Date().toISOString();
await this.db.put('projects', data.project);
let photoCount = 0;
if (data.photos && Array.isArray(data.photos)) {
    for (const ph of data.photos) {
        ph.id = 'ph' + Date.now() + '_' + Math.random().toString(36).substr(2, 6);
        ph.projectId = newId;
        await this.db.put('photos', ph);
        photoCount++;
    }
}
this.toast(`"${data.project.projectName}" importiert (${photoCount} Fotos)`, 'success');
this.renderProjectList();
        } catch (err) {
this.toast('Import fehlgeschlagen: ' + err.message, 'error');
        }
        e.target.value = '';
    }

    async exportPDF() {
        if (!this.currentProject) return; this.toast('PDF wird erstellt...', 'info');
        const photos = await this.db.getByIndex('photos', 'projectId', this.currentProject.id);
        photos.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));

        // Sammle verwendete Werkzeuge
        const usedTools = new Set();
        photos.forEach(ph => (ph.annotations || []).forEach(a => {
if (TOOLS[a.tool]) usedTools.add(a.tool);
        }));

        // Erstelle Werkzeuglegende
        let toolsLegendHtml = '';
        if (usedTools.size > 0) {
toolsLegendHtml = '<h2 style="margin-top:30px">Verwendete Werkzeuge</h2><div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:8px;margin-bottom:20px">';
usedTools.forEach(toolId => {
    const t = TOOLS[toolId];
    let toolName = t.name;
    if (toolId === 'SCHACHT_AZK_NEU') toolName = 'Schacht AZK Neu';
    else if (toolId === 'SCHACHT_AZK_BESTAND') toolName = 'Schacht AZK Bestand';
    else if (toolId === 'SCHACHT_DAZK_NEU') toolName = 'Schacht DAZK Neu';
    else if (toolId === 'SCHACHT_DAZK_BESTAND') toolName = 'Schacht DAZK Bestand';
    else if (toolId === 'SCHACHT_APL_NEU') toolName = 'APL Neu';
    else if (toolId === 'SCHACHT_APL_BESTAND') toolName = 'APL Bestand';
    else if (toolId === 'SCHACHT_PATCHFELD_NEU') toolName = 'Patchfeld Neu';
    else if (toolId === 'SCHACHT_PATCHFELD_BESTAND') toolName = 'Patchfeld Bestand';

    // Generate SVG symbol matching actual appearance
    let symbolSvg = '';
    const c = t.color;
    if (t.type === 'line') {
        // Solid or dashed line
        const dashAttr = t.dash ? ` stroke-dasharray="${t.dash.join(',')}"` : '';
        symbolSvg = `<svg width="40" height="20" style="margin:0 auto 4px;display:block"><line x1="2" y1="10" x2="38" y2="10" stroke="${c}" stroke-width="${Math.min(t.lineWidth || 3, 5)}" stroke-linecap="round"${dashAttr}/></svg>`;
    } else if (t.type === 'arrow') {
        symbolSvg = `<svg width="40" height="20" style="margin:0 auto 4px;display:block"><line x1="2" y1="10" x2="32" y2="10" stroke="${c}" stroke-width="3" stroke-linecap="round"/><polygon points="38,10 30,5 30,15" fill="${c}"/></svg>`;
    } else if (t.type === 'dimension') {
        symbolSvg = `<svg width="40" height="20" style="margin:0 auto 4px;display:block"><line x1="5" y1="10" x2="35" y2="10" stroke="${c}" stroke-width="1.5"/><line x1="5" y1="4" x2="5" y2="16" stroke="${c}" stroke-width="1.5"/><line x1="35" y1="4" x2="35" y2="16" stroke="${c}" stroke-width="1.5"/></svg>`;
    } else if (t.type === 'text') {
        symbolSvg = `<svg width="40" height="20" style="margin:0 auto 4px;display:block"><rect x="4" y="3" width="32" height="14" rx="3" fill="#FFFBEB" stroke="#FCD34D" stroke-width="1"/><text x="20" y="14" text-anchor="middle" font-size="9" font-weight="bold" fill="#1A1A2E">Abc</text></svg>`;
    } else if (t.symbol === '□') {
        // AZK = Quadrat
        symbolSvg = `<svg width="40" height="24" style="margin:0 auto 4px;display:block"><rect x="10" y="2" width="20" height="20" fill="${c}" rx="2"/></svg>`;
    } else if (t.symbol === '▬') {
        // DAZK = breites Rechteck
        symbolSvg = `<svg width="40" height="24" style="margin:0 auto 4px;display:block"><rect x="6" y="5" width="28" height="14" fill="${c}" rx="2"/></svg>`;
    } else if (t.symbol === '▯') {
        // APL = hohes Rechteck
        symbolSvg = `<svg width="40" height="24" style="margin:0 auto 4px;display:block"><rect x="12" y="1" width="16" height="22" fill="${c}" rx="2"/></svg>`;
    } else if (t.symbol === '◆') {
        // Muffe = Raute
        symbolSvg = `<svg width="40" height="24" style="margin:0 auto 4px;display:block"><polygon points="20,2 34,12 20,22 6,12" fill="${c}"/></svg>`;
    } else if (t.symbol === '⊕') {
        // Bohrung HE = Kreis mit Kreuz
        symbolSvg = `<svg width="40" height="24" style="margin:0 auto 4px;display:block"><circle cx="20" cy="12" r="10" fill="${c}"/><line x1="20" y1="4" x2="20" y2="20" stroke="#fff" stroke-width="2"/><line x1="12" y1="12" x2="28" y2="12" stroke="#fff" stroke-width="2"/></svg>`;
    } else if (t.symbol === '○_empty') {
        // Bohrung WD = Hohler Kreis
        symbolSvg = `<svg width="40" height="24" style="margin:0 auto 4px;display:block"><circle cx="20" cy="12" r="9" fill="none" stroke="${c}" stroke-width="3"/></svg>`;
    } else if (t.symbol === '🛡') {
        // Brandschottung = Schild
        symbolSvg = `<svg width="40" height="24" style="margin:0 auto 4px;display:block"><path d="M20,2 L30,6 L30,14 Q30,20 20,22 Q10,20 10,14 L10,6 Z" fill="${c}"/></svg>`;
    } else if (t.symbol === '⚠') {
        // Hindernis = Dreieck
        symbolSvg = `<svg width="40" height="24" style="margin:0 auto 4px;display:block"><polygon points="20,2 35,22 5,22" fill="${c}"/><text x="20" y="19" text-anchor="middle" font-size="12" font-weight="bold" fill="#fff">!</text></svg>`;
    } else {
        // Fallback: farbiges Quadrat
        symbolSvg = `<div style="width:16px;height:16px;background:${c};border-radius:3px;margin:0 auto 4px"></div>`;
    }
    toolsLegendHtml += `<div style="border:1px solid #ddd;padding:8px;border-radius:6px;text-align:center">${symbolSvg}<div style="font-size:10px;font-weight:bold">${toolName}</div></div>`;
});
toolsLegendHtml += '</div>';
        }

        // Berechne Mengen
        const qty = {};
        const addQty = (key, name, unit, type = 'line') => { if (!qty[key]) qty[key] = { tool: { name, unit, type }, auto: 0 }; };
        Object.values(TOOLS).filter(t => t.unit && t.id !== 'TRASSE').forEach(t => { qty[t.id] = { tool: t, auto: 0 }; });
        photos.forEach(ph => (ph.annotations || []).forEach(a => {
const t = TOOLS[a.tool]; if (!t || !t.unit) return;
if (a.tool === 'TRASSE') {
    a.meta = a.meta || {};
    const surf = a.meta.surface || 'GEHWEGPLATTE';
    const dn = a.meta.dn || 'DN50';
    const surfLabel = (SURFACES.find(s => s.value === surf) || { label: surf }).label;
    const dnLabel = (DNS.find(d => d.value === dn) || { label: dn }).label;
    addQty('TRASSE_TOTAL', 'Trasse gesamt', t.unit);
    addQty(`TRASSE_DN_${dn}`, dnLabel, t.unit);
    addQty(`TRASSE_SURF_${surf}`, surfLabel, t.unit);
    if (a.computed?.lengthMeters) {
        qty['TRASSE_TOTAL'].auto += a.computed.lengthMeters;
        qty[`TRASSE_DN_${dn}`].auto += a.computed.lengthMeters;
        qty[`TRASSE_SURF_${surf}`].auto += a.computed.lengthMeters;
    }
} else if (t.type === 'line' && a.computed?.lengthMeters) {
    qty[t.id].auto += a.computed.lengthMeters;
} else if (t.type === 'point') {
    qty[t.id].auto += 1;
}
        }));
        const saved = this.currentProject.quantities || {};
        const qtyKeys = Object.keys(qty).filter(k => qty[k].auto > 0 || (saved[k] !== undefined && saved[k] > 0)).sort((a, b) => {
const orderValue = k => k === 'TRASSE_TOTAL' ? 0 : k.startsWith('TRASSE_DN_') ? 1 : k.startsWith('TRASSE_SURF_') ? 2 : 3;
const oa = orderValue(a), ob = orderValue(b);
if (oa !== ob) return oa - ob;
return this.qtyLabel(a, qty[a].tool).localeCompare(this.qtyLabel(b, qty[b].tool), 'de');
        });

        let mengenHtml = '';
        if (qtyKeys.length > 0) {
let pos = 1;
const rows = qtyKeys.map(id => {
    const q = qty[id];
    const val = saved[id] !== undefined ? saved[id] : q.auto;
    if (val <= 0) return '';
    const name = this.qtyLabel(id, q.tool);
    return `<tr><td>${pos++}</td><td>${name}</td><td>${q.tool.unit}</td><td style="text-align:right">${q.tool.type === 'line' ? val.toFixed(1) : val}</td></tr>`;
}).filter(r => r).join('');
if (rows) {
    mengenHtml = `<h2 style="margin-top:30px"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg> Mengenaufmaß</h2><table><thead><tr><th>Pos.</th><th>Beschreibung</th><th>Einheit</th><th style="text-align:right">Menge</th></tr></thead><tbody>${rows}</tbody></table>`;
}
        }

        let photosHtml = '';
        for (const ph of photos) {
let src = ph.dataUrl;
if (ph.annotations && ph.annotations.length) {
    const img = new Image(); await new Promise(r => { img.onload = r; img.src = ph.dataUrl; });
    this.editor.photo = ph; this.editor.image = img; this.editor.annotations = ph.annotations;
    src = await this.editor.renderToImage();
}
const notesHtml = ph.notes ? `<p style="margin:4px 0 0 0;font-size:11px;color:#475569;font-style:italic;text-align:center">${this.esc(ph.notes)}</p>` : '';
photosHtml += `<div style="page-break-inside:avoid;margin-bottom:15px"><img src="${src}" style="max-width:100%;max-height:350px;display:block;margin:0 auto">${notesHtml}</div>`;
        }

        const pdfTitle = `Trassenaufnahme_${this.currentProject.projectNumber || this.currentProject.projectName}`.replace(/[^a-zA-Z0-9_\-äöüÄÖÜß]/g, '_');
        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${pdfTitle}</title>
<link href='https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap' rel='stylesheet'>
<style>
@page { size: A4 portrait; margin: 12mm; }
@media print { .no-print { display: none !important; } body { padding: 0; } * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; } img { max-width: 100% !important; page-break-inside: avoid; } }
body { font-family: 'Roboto', -apple-system, BlinkMacSystemFont, Arial, sans-serif; padding: 15px; margin: 0; background: #fff; font-size: 12px; font-weight: 300; color: #3c3c3b; }
h1 { color: #003C71; font-weight: 700; border-bottom: 2px solid #003C71; padding-bottom: 8px; margin-bottom: 15px; font-size: 20px; }
h2 { color: #333; font-size: 14px; border-bottom: 1px solid #ddd; padding-bottom: 4px; margin-bottom: 10px; }
.info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 20px; }
.info-section { background: #f8f9fa; padding: 10px; border-radius: 6px; border: 1px solid #e2e8f0; }
.info-section-title { font-weight: bold; color: #003C71; margin-bottom: 6px; font-size: 11px; text-transform: uppercase; }
.info-row { display: flex; margin: 3px 0; font-size: 11px; }
.info-label { width: 70px; font-weight: 500; color: #64748b; }
.info-value { flex: 1; color: #1a1a2e; }
table { width: 100%; border-collapse: collapse; margin-bottom: 15px; }
th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: left; font-size: 10px; }
th { background: #003C71; color: white; }
.print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #003C71; padding: 12px; display: flex; gap: 10px; justify-content: center; }
.print-bar button { background: white; color: #003C71; border: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 600; }
.page-logo-fixed { position: fixed; bottom: 5mm; right: 5mm; opacity: 0.7; z-index: 9999; }
.page-logo-fixed img { height: 36px; }
.page-logo-inline { display: none; }
@media print {
    .page-logo-fixed { display: none !important; }
    .page-logo-inline { display: block !important; text-align: right; margin-top: 20px; opacity: 0.7; page-break-inside: avoid; }
    .page-logo-inline img { height: 36px; }
}
</style></head><body>
<div class="print-bar no-print"><button onclick="window.print()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Drucken</button><button onclick="window.close()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Schließen</button></div>
<div style="display:flex;align-items:center;gap:12px;margin-bottom:15px">
    <img src="assets/qfm-logo.png" alt="QFM" style="height:36px">
    <h1 style="margin:0;flex:1">Trassenaufnahme</h1>
</div>
<div class="info-grid">
    <div class="info-section">
        <div class="info-section-title"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Projekt</div>
        <div class="info-row"><span class="info-label">Nummer:</span><span class="info-value">${this.esc(this.currentProject.projectNumber || '-')}</span></div>
        <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${this.esc(this.currentProject.projectName)}</span></div>
        <div class="info-row"><span class="info-label">Datum:</span><span class="info-value">${new Date().toLocaleDateString('de-DE')}</span></div>
    </div>
    <div class="info-section">
        <div class="info-section-title"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Kunde</div>
        <div class="info-row"><span class="info-label">Name:</span><span class="info-value">${this.esc(this.currentProject.customer)}</span></div>
        <div class="info-row"><span class="info-label">Standort:</span><span class="info-value">${this.esc(this.currentProject.location || '')}</span></div>
    </div>
</div>
${this.currentProject.creator ? `<div class="info-section" style="margin-bottom:15px"><div class="info-section-title"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Ersteller</div><div class="info-row"><span class="info-label">Name:</span><span class="info-value">${this.esc(this.currentProject.creator)}</span></div>${this.currentProject.creatorEmail ? `<div class="info-row"><span class="info-label">E-Mail:</span><span class="info-value">${this.esc(this.currentProject.creatorEmail)}</span></div>` : ''}${this.currentProject.creatorPhone ? `<div class="info-row"><span class="info-label">Telefon:</span><span class="info-value">${this.esc(this.currentProject.creatorPhone)}</span></div>` : ''}</div>` : ''}
${this.currentProject.description ? '<div style="background:#f8f9fa;padding:10px;border-radius:6px;margin-bottom:15px;font-size:11px"><strong>Beschreibung:</strong> ' + this.esc(this.currentProject.description) + '</div>' : ''}
${(this.currentProject.contacts && this.currentProject.contacts.length > 0) ? `<div class="info-section" style="margin-bottom:15px"><div class="info-section-title"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg> Ansprechpartner</div>${this.currentProject.contacts.map(c => `<div style="margin-bottom:8px;padding-bottom:8px;border-bottom:1px solid #eee"><div class="info-row"><span class="info-label">Name:</span><span class="info-value">${this.esc(c.name || '-')}</span></div>${c.role ? `<div class="info-row"><span class="info-label">Funktion:</span><span class="info-value">${this.esc(c.role)}</span></div>` : ''}${c.phone ? `<div class="info-row"><span class="info-label">Telefon:</span><span class="info-value">${this.esc(c.phone)}</span></div>` : ''}${c.email ? `<div class="info-row"><span class="info-label">E-Mail:</span><span class="info-value">${this.esc(c.email)}</span></div>` : ''}</div>`).join('')}</div>` : ''}
${mengenHtml}
${toolsLegendHtml}
<h2 style="margin-top:20px"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/><circle cx="12" cy="13" r="4"/></svg> Fotos (${photos.length})</h2>
${photosHtml || '<p>Keine Fotos vorhanden</p>'}
<div class="page-logo-fixed"><img src="assets/qfm-logo.png" alt="QFM"></div>
<div class="page-logo-inline"><img src="assets/qfm-logo.png" alt="QFM"></div>
<div style="height:60px" class="no-print"></div>
</body></html>`;

        // iOS-kompatible Methode: Zeige PDF in einem Fullscreen-Overlay
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) {
// iOS: Zeige in einem Overlay mit Share-Funktion
this.showPDFOverlay(html, 'Trassenaufnahme_' + (this.currentProject.projectNumber || this.currentProject.id));
        } else {
// Desktop: Normales Popup
const w = window.open('', '_blank');
if (w) {
    w.document.write(html);
    w.document.close();
    await this._waitForImages(w.document);
    setTimeout(() => w.print(), 300);
} else {
    // Popup blockiert - Fallback
    this.showPDFOverlay(html, 'Trassenaufnahme_' + (this.currentProject.projectNumber || this.currentProject.id));
}
        }
    }

    showPDFOverlay(html, filename) {
        // Entferne eventuell vorhandenes Overlay
        const existing = document.getElementById('pdfOverlay');
        if (existing) existing.remove();

        // Erstelle Overlay
        const overlay = document.createElement('div');
        overlay.id = 'pdfOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:10000;display:flex;flex-direction:column;';

        // Toolbar
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;gap:10px;padding:12px 16px;background:#003C71;align-items:center;flex-shrink:0;padding-top:calc(12px + env(safe-area-inset-top));';
        toolbar.innerHTML = `
<button onclick="app.closePdfOverlay()" style="background:#fff;color:#003C71;border:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Zurück</button>
<span style="flex:1;color:#fff;font-weight:600;font-size:14px;text-align:center;">${this.esc(filename)}</span>
<button onclick="app.printPDFOverlay()" style="background:#fff;color:#003C71;border:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Drucken</button>
`;

        // iFrame für den Inhalt
        const iframe = document.createElement('iframe');
        iframe.id = 'pdfIframe';
        iframe.style.cssText = 'flex:1;border:none;width:100%;';

        overlay.appendChild(toolbar);
        overlay.appendChild(iframe);
        document.body.appendChild(overlay);

        // Schreibe HTML in iframe
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();
        doc.write(html);
        doc.close();

        this.toast('Tippe auf "Drucken" um als PDF zu speichern', 'info');
    }

    async printPDFOverlay() {
        const iframe = document.getElementById('pdfIframe');
        if (iframe && iframe.contentWindow) {
await this._waitForImages(iframe.contentDocument);
iframe.contentWindow.print();
        }
    }

    showAnleitung() {
        const existing = document.getElementById('pdfOverlay');
        if (existing) existing.remove();
        const overlay = document.createElement('div');
        overlay.id = 'pdfOverlay';
        overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;background:#fff;z-index:10000;display:flex;flex-direction:column;';
        const toolbar = document.createElement('div');
        toolbar.style.cssText = 'display:flex;gap:10px;padding:12px 16px;background:#003C71;align-items:center;flex-shrink:0;padding-top:calc(12px + env(safe-area-inset-top));';
        toolbar.innerHTML = `
<button onclick="app.closePdfOverlay()" style="background:#fff;color:#003C71;border:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg> Zurück</button>
<span style="flex:1;color:#fff;font-weight:600;font-size:14px;text-align:center;">SiteSketch – Arbeitsanweisung</span>
<a href="pdf/SiteSketch_Arbeitsanweisung.pdf" download="SiteSketch_Arbeitsanweisung.pdf" style="background:#ed6d0f;color:#fff;border:none;padding:10px 16px;border-radius:8px;font-weight:600;font-size:14px;cursor:pointer;text-decoration:none;display:flex;align-items:center;gap:6px"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> PDF</a>
`;
        const content = document.createElement('div');
        content.style.cssText = 'flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch;background:#f2f2f7;';
        // Versuche PDF einzubetten, Fallback auf HTML-Anleitung
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
        if (isIOS) {
// iOS kann kein PDF inline anzeigen — zeige die HTML-Version
const iframe = document.createElement('iframe');
iframe.style.cssText = 'width:100%;height:100%;border:none;';
content.appendChild(iframe);
overlay.appendChild(toolbar);
overlay.appendChild(content);
document.body.appendChild(overlay);
const idoc = iframe.contentDocument || iframe.contentWindow.document;
idoc.open(); idoc.write(this._anleitungHTML()); idoc.close();
        } else {
// Desktop: PDF direkt einbetten
const embed = document.createElement('iframe');
embed.src = 'SiteSketch_Arbeitsanweisung.pdf';
embed.style.cssText = 'width:100%;height:100%;border:none;';
content.appendChild(embed);
overlay.appendChild(toolbar);
overlay.appendChild(content);
document.body.appendChild(overlay);
        }
    }

    _anleitungHTML() {
        return `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>SiteSketch – Anleitung</title>
<link href='https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap' rel='stylesheet'>
<style>
body { font-family: 'Roboto', -apple-system, sans-serif; padding: 20px; max-width: 720px; margin: 0 auto; color: #1a1a2e; font-size: 15px; line-height: 1.7; }
h1 { color: #003C71; font-size: 24px; border-bottom: 3px solid #ed6d0f; padding-bottom: 10px; }
h2 { color: #003C71; font-size: 18px; margin-top: 36px; border-bottom: 1px solid #e2e8f0; padding-bottom: 6px; }
h3 { color: #ed6d0f; font-size: 15px; margin-top: 20px; }
p { margin: 8px 0; }
ul, ol { padding-left: 24px; }
li { margin: 4px 0; }
table { width: 100%; border-collapse: collapse; margin: 12px 0; font-size: 13px; }
th { background: #003C71; color: white; padding: 8px 10px; text-align: left; font-weight: 500; }
td { padding: 8px 10px; border-bottom: 1px solid #e2e8f0; }
tr:nth-child(even) td { background: #f8fafc; }
code { background: #f1f5f9; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
blockquote { border-left: 3px solid #ed6d0f; margin: 12px 0; padding: 8px 16px; background: #fff7ed; border-radius: 0 8px 8px 0; }
blockquote p { margin: 0; }
hr { border: none; border-top: 1px solid #e2e8f0; margin: 24px 0; }
.badge { display: inline-block; background: #ed6d0f; color: white; padding: 2px 8px; border-radius: 10px; font-size: 11px; font-weight: 600; vertical-align: middle; }
.footer { margin-top: 40px; padding-top: 16px; border-top: 2px solid #003C71; color: #64748b; font-size: 12px; text-align: center; }
.kbd { display: inline-block; background: #e2e8f0; border: 1px solid #cbd5e1; border-radius: 4px; padding: 1px 6px; font-size: 12px; font-family: monospace; }
</style></head><body>

<h1>SiteSketch – Benutzeranleitung</h1>
<p><strong>Trassenaufnahme &amp; Begehungsdokumentation für QFM</strong><br><span class="badge">Version 1.12</span></p>

<hr>

<h2>Was ist SiteSketch?</h2>
<p>SiteSketch ist eine mobile Web-App zur Dokumentation von Trassenbegehungen im Telekommunikations-Tiefbau. Sie läuft direkt im Browser – ohne Installation – und funktioniert auf Smartphones, Tablets und Desktop-PCs.</p>
<p>Alle Daten werden <strong>lokal auf dem Gerät</strong> gespeichert (IndexedDB). Es ist kein Login und keine Registrierung erforderlich.</p>
<p>Mit SiteSketch können Sie:</p>
<ul>
<li>Begehungsprojekte anlegen und verwalten</li>
<li>Fotos aufnehmen und mit Fachsymbolen annotieren</li>
<li>Kartenausschnitte erfassen und Trassen einzeichnen (automatische Meterberechnung)</li>
<li>Handskizzen und Notizen anfertigen</li>
<li>Ansprechpartner dokumentieren</li>
<li>Mengenaufmaße automatisch berechnen</li>
<li>PDF-Berichte und Excel-Exporte erstellen</li>
</ul>

<hr>

<h2>1. Startseite &amp; Projektverwaltung</h2>

<h3>Neues Projekt anlegen</h3>
<p>Tippen Sie auf <strong>„+ Neues Projekt"</strong> auf der Startseite.</p>
<p>Füllen Sie die Projektdaten aus:</p>
<ul>
<li><strong>Projektnummer</strong> (Pflichtfeld) – z.&nbsp;B. „P123456"</li>
<li><strong>Projektname</strong> (Pflichtfeld) – wird automatisch aus Projektnummer und Kunde vorgeschlagen</li>
<li><strong>Kunde</strong> (Pflichtfeld) – Auftraggeber des Projekts</li>
<li><strong>Status</strong> – Offen, In Arbeit oder Abgeschlossen</li>
<li><strong>Ersteller</strong> – aus Vorauswahl oder frei eingeben</li>
<li><strong>Beschreibung</strong> – allgemeine Bemerkungen zum Projekt</li>
<li><strong>Standort</strong> (Pflichtfeld) – Adresse der Baustelle (wird automatisch geocodiert für die Karte)</li>
</ul>
<blockquote><p><strong>Tipp:</strong> Über den Button „Beispieldaten" können Sie ein Demoprojekt einfügen, um sich mit der App vertraut zu machen.</p></blockquote>

<h3>Projekte suchen und filtern</h3>
<p>Auf der Startseite finden Sie eine <strong>Suchleiste</strong> und einen <strong>Status-Filter</strong> (Alle / Offen / In Arbeit / Abgeschlossen), um schnell das gewünschte Projekt zu finden.</p>

<h3>Projekt bearbeiten</h3>
<p>In der Projektansicht können Sie über <strong>„Bearbeiten"</strong> die Projektdaten jederzeit anpassen. Das Projekt kann hier auch <strong>gelöscht</strong> werden.</p>

<hr>

<h2>2. Projektübersicht – Die vier Tabs</h2>
<p>Nach dem Öffnen eines Projekts sehen Sie vier Tabs:</p>

<h3>📷 Fotos-Tab</h3>
<p>Zeigt alle aufgenommenen Fotos und Kartenausschnitte als Bildergalerie. Von hier aus können Sie:</p>
<ul>
<li><strong>Neue Fotos aufnehmen</strong> – Kamera-Symbol (öffnet die Gerätekamera)</li>
<li><strong>Bilder importieren</strong> – Ordner-Symbol (aus der Galerie, auch mehrere gleichzeitig)</li>
<li><strong>Kartenausschnitt erfassen</strong> – Satelliten-Symbol (Screenshot der aktuellen Karte)</li>
<li><strong>Fotos bearbeiten</strong> – durch Antippen eines Bildes öffnet sich der Editor</li>
</ul>

<h3>🗺 Karte-Tab</h3>
<p>Zeigt eine interaktive Karte (OpenStreetMap) mit dem Projektstandort.</p>
<ul>
<li><strong>„Karte speichern"</strong> – erstellt einen Screenshot des aktuellen Kartenausschnitts. Dieser wird als Foto dem Projekt hinzugefügt und kann annotiert werden. Auf Kartenausschnitten gezeichnete Linien werden <strong>automatisch in Metern berechnet</strong>.</li>
<li><strong>„Neu suchen"</strong> – geocodiert die Projektadresse erneut</li>
<li><strong>„GPS"</strong> – verwendet Ihren aktuellen GPS-Standort als Kartenmittelpunkt</li>
</ul>
<blockquote><p><strong>Hinweis:</strong> Wird eine Adresse nicht eindeutig gefunden, erscheint ein Auswahldialog mit mehreren Treffern.</p></blockquote>

<h3>📋 Mengen-Tab</h3>
<p>Zeigt das Mengenaufmaß als Tabelle. Details siehe Abschnitt 6.</p>

<h3>✏️ Notiz-Tab</h3>
<p>Ein Freihand-Zeichenfeld für schnelle Skizzen und handschriftliche Notizen direkt im Projekt.</p>
<ul>
<li><strong>Stiftfarben</strong> – Schwarz, Rot, Blau, Grün wählbar</li>
<li><strong>Stiftstärken</strong> – Drei Stärken (dünn, mittel, dick)</li>
<li><strong>Radierer</strong> – einzelne Striche löschen</li>
<li><strong>Rückgängig</strong> – letzten Strich entfernen</li>
<li><strong>Löschen</strong> – gesamte Notiz leeren</li>
<li><strong>Speichern</strong> – Notiz als Bild dem Projekt hinzufügen</li>
<li><strong>in PDF</strong> – Notiz direkt als PDF exportieren</li>
</ul>
<blockquote><p><strong>Tipp:</strong> Nutzen Sie den Notiz-Tab für schnelle Situationsskizzen, z.&nbsp;B. Kreuzungssituationen oder Querschnitte, die mit einem Foto schwer abzubilden sind.</p></blockquote>

<hr>

<h2>3. Ansprechpartner</h2>
<p>Im Projekt können Sie <strong>Ansprechpartner</strong> hinterlegen (z.&nbsp;B. Bauleiter, Hausverwaltung, Auftraggeber). Pro Kontakt stehen folgende Felder zur Verfügung:</p>
<ul>
<li><strong>Name</strong> (Pflichtfeld)</li>
<li><strong>Rolle</strong> – z.&nbsp;B. „Bauleiter", „Hausverwaltung"</li>
<li><strong>Telefon</strong> – direkt anrufbar über Tippen</li>
<li><strong>E-Mail</strong></li>
</ul>
<p>Ansprechpartner werden im PDF-Bericht mit aufgeführt.</p>

<hr>

<h2>4. Foto-Editor</h2>
<p>Tippen Sie auf ein Foto in der Galerie, um den Editor zu öffnen.</p>

<h3>Navigation &amp; Zoomen</h3>
<table>
<thead><tr><th>Geste</th><th>Aktion</th></tr></thead>
<tbody>
<tr><td>Zwei Finger spreizen/zusammenziehen</td><td>Pinch-to-Zoom</td></tr>
<tr><td>Doppeltipp + nach oben/unten ziehen</td><td>Stufenloses Zoomen mit einem Finger</td></tr>
<tr><td>Zwei Finger gleichzeitig bewegen</td><td>Bild im gezoomten Zustand verschieben</td></tr>
<tr><td><span class="kbd">+</span> / <span class="kbd">−</span> / <span class="kbd">1:1</span> Buttons</td><td>Zoom-Steuerung oben rechts</td></tr>
</tbody></table>

<h3>Zeichnen</h3>
<table>
<thead><tr><th>Geste</th><th>Aktion</th></tr></thead>
<tbody>
<tr><td>Mit einem Finger ziehen</td><td>Linie zeichnen (bei Linien-Werkzeugen)</td></tr>
<tr><td>Tippen</td><td>Punkt-Symbol platzieren (Schacht, Muffe, etc.)</td></tr>
<tr><td>Tippen + Ziehen (bei Schacht)</td><td>Schacht in benutzerdefinierter Größe aufziehen</td></tr>
</tbody></table>

<h3>Vollständige Werkzeug-Übersicht</h3>
<p>Die Toolbar befindet sich am linken Rand. Werkzeuge mit Untermenü öffnen ein Flyout-Menü bei Antippen.</p>

<table>
<thead><tr><th>Werkzeug</th><th>Symbol</th><th>Typ</th><th>Einheit</th><th>Beschreibung</th></tr></thead>
<tbody>
<tr><td><strong>Auswahl</strong></td><td>↖</td><td>Utility</td><td>–</td><td>Element auswählen, verschieben, Punkte nachziehen, drehen, skalieren</td></tr>
<tr><td><strong>Installationsrohr</strong></td><td>gestrichelte Linie</td><td>Linie</td><td>m</td><td>Installationsrohre markieren (cyan, gestrichelt)</td></tr>
<tr><td><strong>Trasse</strong></td><td>rote Linie</td><td>Linie</td><td>m</td><td>Kabeltrasse mit Oberfläche und DN-Auswahl</td></tr>
<tr><td><strong>Bestandstrasse</strong></td><td>graue Linie</td><td>Linie</td><td>–</td><td>Vorhandene Trasse markieren (keine Mengenberechnung)</td></tr>
<tr><td><strong>AZK Neu</strong></td><td>□ rot</td><td>Punkt</td><td>Stk</td><td>Abzweigkasten – neu zu setzen</td></tr>
<tr><td><strong>AZK Bestand</strong></td><td>□ blau</td><td>Punkt</td><td>Stk</td><td>Abzweigkasten – vorhandener Bestand</td></tr>
<tr><td><strong>DAZK Neu</strong></td><td>▬ rot</td><td>Punkt</td><td>Stk</td><td>Doppel-Abzweigkasten – neu zu setzen</td></tr>
<tr><td><strong>DAZK Bestand</strong></td><td>▬ blau</td><td>Punkt</td><td>Stk</td><td>Doppel-Abzweigkasten – vorhandener Bestand</td></tr>
<tr><td><strong>APL Neu</strong></td><td>▬ grün</td><td>Punkt</td><td>Stk</td><td>Abschlusspunkt Linientechnik – neu</td></tr>
<tr><td><strong>APL Bestand</strong></td><td>▬ grau</td><td>Punkt</td><td>Stk</td><td>Abschlusspunkt Linientechnik – Bestand</td></tr>
<tr><td><strong>Patchfeld Neu</strong></td><td>▬ teal (groß)</td><td>Punkt</td><td>Stk</td><td>Patchfeld – neu (größer als APL)</td></tr>
<tr><td><strong>Patchfeld Bestand</strong></td><td>▬ grau (groß)</td><td>Punkt</td><td>Stk</td><td>Patchfeld – Bestand (größer als APL)</td></tr>
<tr><td><strong>Muffe</strong></td><td>◆</td><td>Punkt</td><td>Stk</td><td>Muffen-Standort (Raute, violett)</td></tr>
<tr><td><strong>Bohrung HE</strong></td><td>⊕</td><td>Punkt</td><td>Stk</td><td>Bohrung Hauseinführung</td></tr>
<tr><td><strong>Bohrung WD</strong></td><td>⊗</td><td>Punkt</td><td>Stk</td><td>Bohrung Wanddurchführung</td></tr>
<tr><td><strong>Brandschottung</strong></td><td>🛡</td><td>Punkt</td><td>Stk</td><td>Brandschottung markieren (Schild-Symbol)</td></tr>
<tr><td><strong>Hindernis</strong></td><td>⚠</td><td>Punkt</td><td>Stk</td><td>Hindernisse und Gefahrenstellen (Dreieck)</td></tr>
<tr><td><strong>Kabel</strong></td><td>gestrichelte Linie</td><td>Linie</td><td>m</td><td>Kabelverläufe markieren (violett, gestrichelt)</td></tr>
<tr><td><strong>LF-Kanal</strong></td><td>breite Linie</td><td>Linie</td><td>m</td><td>Leitungsführungskanal (cyan, breit)</td></tr>
<tr><td><strong>Pfeil</strong></td><td>→</td><td>Pfeil</td><td>–</td><td>Richtungspfeile zeichnen</td></tr>
<tr><td><strong>Maßkette</strong></td><td>↔</td><td>Bemaßung</td><td>–</td><td>Bemaßungslinie mit manuellem Texteintrag</td></tr>
<tr><td><strong>Text</strong></td><td>T</td><td>Text</td><td>–</td><td>Freitextannotation an beliebiger Stelle</td></tr>
</tbody></table>

<h3>Trasse-Eigenschaften</h3>
<p>Wenn das Werkzeug <strong>Trasse</strong> aktiv ist (oder eine Trasse ausgewählt wird), erscheint oben eine Eigenschaftsleiste:</p>
<ul>
<li><strong>Oberfläche:</strong> Unbefestigt, Gehwegplatte, Asphalt, Beton, Pflaster, Mosaik, Granitplatten, Geschl.&nbsp;Bauweise</li>
<li><strong>Durchmesser:</strong> DN50, DN100</li>
</ul>
<p>Diese Eigenschaften werden <strong>pro Trassenabschnitt</strong> gespeichert und im Mengenaufmaß getrennt ausgewiesen (z.&nbsp;B. „Trasse DN50 Asphalt: 45,2 m").</p>

<h3>Auswahl-Werkzeug – Elemente bearbeiten</h3>
<p>Im <strong>Auswahl-Modus</strong> (↖) können Sie Annotationen interaktiv bearbeiten:</p>
<ul>
<li><strong>Tippen</strong> auf ein Element – wählt es aus (blaue Markierung)</li>
<li><strong>Verschieben</strong> – ausgewähltes Element mit dem Finger ziehen</li>
<li><strong>Einzelne Punkte nachziehen</strong> – bei Linien können Start- und Endpunkt separat verschoben werden</li>
<li><strong>Drehen</strong> – Schacht-Symbole (□, ▬) haben einen Rotations-Griff zum Drehen</li>
<li><strong>Größe ändern</strong> – Punkt-Symbole haben einen Resize-Griff zur individuellen Größenanpassung</li>
<li><strong>Label verschieben</strong> – das Beschriftungs-Label von Trassen und Installationsrohren kann frei positioniert werden. Eine gestrichelte Linie zeigt die Verbindung zum Ursprungspunkt.</li>
<li><strong>Label-Größe ändern</strong> – am rechten Rand des Labels befindet sich ein Resize-Griff</li>
<li><strong>Label zurücksetzen</strong> – Doppeltipp auf ein verschobenes Label setzt es auf die Standardposition zurück</li>
<li><strong>Text-Größe</strong> – Text-Annotationen haben ebenfalls einen Resize-Griff</li>
</ul>

<h3>Einstellungen (Zahnrad-Symbol)</h3>
<p>Im Toolbar-Menü unter dem Zahnrad-Symbol finden Sie den <strong>Größen-Schieberegler</strong>. Damit vergrößern oder verkleinern Sie alle Werkzeug-Symbole und Linienstärken gleichzeitig. Diese Einstellung gilt <strong>pro Foto</strong> – so können Sie bei Nahaufnahmen kleinere und bei Übersichtsfotos größere Symbole verwenden.</p>

<h3>Bemerkung pro Foto</h3>
<p>Unterhalb des Canvas befindet sich ein <strong>Textfeld für Bemerkungen</strong>. Nutzen Sie es für Beschreibungen wie „Schacht unter Gehwegplatte" oder „Querung Hauptstraße – Asphalt". Bemerkungen erscheinen im PDF-Export direkt unter dem entsprechenden Bild.</p>

<h3>Legende &amp; Ebenen (Desktop-Seitenleiste)</h3>
<p>Auf größeren Bildschirmen zeigt die rechte Seitenleiste:</p>
<ul>
<li><strong>Legende</strong> – alle im Foto verwendeten Werkzeuge mit Farbcodes</li>
<li><strong>Ebenen</strong> – alle einzelnen Annotationen aufgelistet, jeweils einzeln ein-/ausblendbar über das Augen-Symbol</li>
</ul>

<h3>Speichern</h3>
<p>Tippen Sie auf <strong>„Speichern"</strong>, um alle Annotationen, Einstellungen und Bemerkungen zu sichern. <strong>Ohne Speichern gehen Änderungen verloren!</strong></p>

<h3>Weitere Editor-Funktionen</h3>
<ul>
<li><strong>Rückgängig / Wiederherstellen</strong> – Pfeil-Buttons im Editor-Header</li>
<li><strong>Foto löschen</strong> – Mülleimer-Symbol entfernt das Foto dauerhaft aus dem Projekt</li>
</ul>

<hr>

<h2>5. Kartenausschnitte &amp; automatische Meterberechnung</h2>
<p>Kartenausschnitte sind besonders wertvoll für die Trassenbegehung, weil gezeichnete Linien (Trasse, Installationsrohr, Kabel, LF-Kanal) <strong>automatisch in Metern berechnet</strong> werden.</p>
<p><strong>So funktioniert es:</strong></p>
<ol>
<li>Wechseln Sie in den <strong>Karte-Tab</strong></li>
<li>Navigieren Sie zum gewünschten Kartenausschnitt (verschieben &amp; zoomen)</li>
<li>Tippen Sie auf <strong>„Karte speichern"</strong></li>
<li>Öffnen Sie den gespeicherten Kartenausschnitt im <strong>Fotos-Tab</strong></li>
<li>Zeichnen Sie Ihre Trasse ein – die Länge wird automatisch anhand der Kartenkoordinaten berechnet</li>
</ol>
<blockquote><p><strong>Hinweis:</strong> Die <strong>Bestandstrasse</strong> (graue Linie) wird bewusst nicht in Metern berechnet und taucht nicht im Mengenaufmaß auf. Sie dient nur zur visuellen Markierung bestehender Infrastruktur.</p></blockquote>

<hr>

<h2>6. Mengenaufmaß</h2>
<p>Im <strong>Mengen-Tab</strong> werden alle eingezeichneten Elemente über alle Fotos hinweg automatisch zusammengerechnet:</p>
<ul>
<li><strong>Linien</strong> (Trasse, Installationsrohr, Kabel, LF-Kanal) – Gesamtlänge in Metern</li>
<li><strong>Punkte</strong> (Schacht, Muffe, Bohrung, Brandschottung, Hindernis) – Stückzahl</li>
<li><strong>Trasse</strong> wird automatisch nach <strong>DN und Oberfläche</strong> aufgesplittet</li>
</ul>

<table>
<thead><tr><th>Spalte</th><th>Bedeutung</th></tr></thead>
<tbody>
<tr><td><strong>Pos.</strong></td><td>Laufende Positionsnummer</td></tr>
<tr><td><strong>Beschreibung</strong></td><td>Werkzeugname (bei Trasse: aufgeteilt nach DN und Oberfläche)</td></tr>
<tr><td><strong>Einheit</strong></td><td>m oder Stk</td></tr>
<tr><td><strong>Auto</strong></td><td>Automatisch berechneter Wert (aus Annotationen)</td></tr>
<tr><td><strong>Menge</strong></td><td>Editierbarer Wert – überschreibt den Auto-Wert bei manueller Eingabe</td></tr>
</tbody></table>

<p><strong>Aktionen:</strong></p>
<ul>
<li><strong>Berechnen</strong> – setzt alle manuellen Überschreibungen zurück und berechnet alle Mengen neu aus den Annotationen</li>
<li><strong>Excel</strong> (grüner Button) – exportiert als <code>.xlsx</code>-Datei mit Projektinfos, formatierter Tabelle und Summenformeln</li>
<li><strong>PDF</strong> – exportiert das Mengenaufmaß als druckbares PDF-Dokument</li>
</ul>

<hr>

<h2>7. Export &amp; Datensicherung</h2>

<h3>PDF-Trassenaufnahme</h3>
<p>Über den <strong>„PDF"</strong>-Button in der Projektansicht wird ein vollständiger Begehungsbericht erstellt:</p>
<ul>
<li>Deckblatt mit Projektinformationen und Ansprechpartnern</li>
<li>Werkzeug-Legende mit allen verwendeten Symbolen und Farben</li>
<li>Alle annotierten Fotos mit Bemerkungen</li>
<li>Mengenaufmaß-Tabelle</li>
</ul>
<blockquote><p><strong>iOS-Hinweis:</strong> Auf iPhones und iPads öffnet sich der Bericht in einem Overlay mit eigenem „Drucken"-Button, da Safari das direkte Öffnen neuer Fenster einschränkt.</p></blockquote>

<h3>Excel-Mengenaufmaß</h3>
<p>Der grüne <strong>„Excel"</strong>-Button im Mengen-Tab erzeugt eine <code>.xlsx</code>-Datei mit formatierter Tabelle und Summenformeln – direkt verwendbar für die Kalkulation.</p>

<h3>Mengenaufmaß-PDF</h3>
<p>Der <strong>„PDF"</strong>-Button im Mengen-Tab exportiert nur das Mengenaufmaß als separates PDF-Dokument.</p>

<h3>JSON-Export/Import (Backup)</h3>
<p>Über das <strong>Speichern-Symbol</strong> (💾) in der Projektansicht kann das gesamte Projekt als JSON-Datei exportiert werden. Diese Datei enthält alle Projektdaten, Fotos und Annotationen.</p>
<p>Über <strong>„JSON Import"</strong> auf der Startseite können exportierte Projekte auf einem anderen Gerät oder nach einem Browser-Reset wiederhergestellt werden.</p>
<blockquote><p><strong>Wichtig:</strong> Exportieren Sie Ihre Projekte regelmäßig als JSON-Backup! Browser-Daten können bei Updates, Speicherbereinigung oder Gerätewechsel verloren gehen.</p></blockquote>

<hr>

<h2>8. Tipps für die Begehung</h2>
<ol>
<li><strong>Kartenausschnitt zuerst</strong> – Erfassen Sie zu Beginn einen Kartenausschnitt des Begehungsgebiets und zeichnen Sie die Trasse ein. Die Meterangaben werden automatisch berechnet.</li>
<li><strong>GPS nutzen</strong> – Verwenden Sie den GPS-Button in der Karte, um direkt zu Ihrem aktuellen Standort zu navigieren.</li>
<li><strong>Fotos mit Kontext</strong> – Machen Sie Detailfotos von Schächten, Hindernissen und Oberflächenwechseln. Annotieren Sie diese direkt vor Ort, solange die Erinnerung frisch ist.</li>
<li><strong>Bemerkungen nutzen</strong> – Schreiben Sie zu jedem Foto eine kurze Beschreibung, z.&nbsp;B. „Schacht unter Gehwegplatte, Deckel beschädigt" oder „Querung Gasleitung".</li>
<li><strong>Notiz-Tab für Skizzen</strong> – Für Situationen die schwer zu fotografieren sind (Kreuzungen, Querschnitte), nutzen Sie den Notiz-Tab für eine schnelle Handskizze.</li>
<li><strong>Bestandstrasse verwenden</strong> – Markieren Sie vorhandene Infrastruktur mit der Bestandstrasse (grau, gestrichelt). So sieht der Planer sofort, was vorhanden ist und was neu gebaut werden muss.</li>
<li><strong>Regelmäßig speichern</strong> – Nach dem Annotieren immer auf „Speichern" tippen.</li>
<li><strong>Schacht-Größe anpassen</strong> – Halten und ziehen statt nur tippen, um Schächte in der passenden Größe aufzuziehen. Bei Nahaufnahmen die Symbolgröße im Zahnrad-Menü anpassen.</li>
<li><strong>Ansprechpartner dokumentieren</strong> – Hinterlegen Sie vor Ort Kontaktdaten von Anwohnern, Hausverwaltungen oder anderen Beteiligten.</li>
<li><strong>JSON-Backup am Ende des Tages</strong> – Exportieren Sie das Projekt als JSON-Datei, um ein Backup zu haben.</li>
</ol>

<hr>

<h2>9. Systemvoraussetzungen</h2>
<ul>
<li>Moderner Browser: Safari (iOS 15+), Chrome, Firefox, Edge</li>
<li>Optimiert für <strong>iOS Safari</strong> und mobile Geräte</li>
<li>Internetverbindung nur für <strong>Karte und Geocoding</strong> erforderlich – die restliche App funktioniert offline</li>
<li>Alle Projektdaten werden lokal im Browser gespeichert (IndexedDB)</li>
<li>Kamera-Zugriff für Fotoaufnahme erforderlich (Browser fragt beim ersten Mal nach Erlaubnis)</li>
<li>GPS-Zugriff optional (für Standortbestimmung in der Karte)</li>
</ul>

<hr>

<h2>10. Häufige Fragen</h2>

<p><strong>Wo werden meine Daten gespeichert?</strong><br>
Alle Daten liegen lokal im Browser auf Ihrem Gerät. Es werden keine Daten an einen Server übertragen.</p>

<p><strong>Was passiert wenn ich den Browser-Cache lösche?</strong><br>
Dann gehen alle Projekte verloren. Erstellen Sie vorher ein JSON-Backup über das Speichern-Symbol.</p>

<p><strong>Kann ich ein Projekt auf ein anderes Gerät übertragen?</strong><br>
Ja – exportieren Sie es als JSON-Datei und importieren Sie diese auf dem anderen Gerät über „JSON Import" auf der Startseite.</p>

<p><strong>Warum werden auf manchen Fotos keine Meter angezeigt?</strong><br>
Die automatische Meterberechnung funktioniert nur auf <strong>Kartenausschnitten</strong>, da nur dort die Geo-Referenzierung vorhanden ist. Bei regulären Fotos nutzen Sie die <strong>Maßkette</strong> für manuelle Bemaßungen.</p>

<p><strong>Was ist der Unterschied zwischen Trasse und Bestandstrasse?</strong><br>
Die <strong>Trasse</strong> (rot) markiert neu zu verlegende Kabelwege und wird im Mengenaufmaß gezählt. Die <strong>Bestandstrasse</strong> (grau, gestrichelt) markiert vorhandene Infrastruktur und erscheint nicht im Aufmaß.</p>

<div class="footer">
<strong>QFM Fernmelde- und Elektromontagen GmbH</strong><br>
SiteSketch v1.12
</div>

</body></html>`;
    }
    async exportQuantityPDF() {
        if (!this.currentProject) return;
        const photos = await this.db.getByIndex('photos', 'projectId', this.currentProject.id);
        photos.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
        const qty = {};
        const addQty = (key, name, unit, type = 'line') => { if (!qty[key]) qty[key] = { tool: { name, unit, type }, auto: 0 }; };
        Object.values(TOOLS).filter(t => t.unit && t.id !== 'TRASSE').forEach(t => { qty[t.id] = { tool: t, auto: 0 }; });
        photos.forEach(ph => (ph.annotations || []).forEach(a => {
const t = TOOLS[a.tool]; if (!t || !t.unit) return;
if (a.tool === 'TRASSE') {
    a.meta = a.meta || {};
    const surf = a.meta.surface || 'GEHWEGPLATTE';
    const dn = a.meta.dn || 'DN50';
    const surfLabel = (SURFACES.find(s => s.value === surf) || { label: surf }).label;
    const dnLabel = (DNS.find(d => d.value === dn) || { label: dn }).label;
    addQty('TRASSE_TOTAL', 'Trasse gesamt', t.unit);
    addQty(`TRASSE_DN_${dn}`, dnLabel, t.unit);
    addQty(`TRASSE_SURF_${surf}`, surfLabel, t.unit);
    if (a.computed?.lengthMeters) {
        qty['TRASSE_TOTAL'].auto += a.computed.lengthMeters;
        qty[`TRASSE_DN_${dn}`].auto += a.computed.lengthMeters;
        qty[`TRASSE_SURF_${surf}`].auto += a.computed.lengthMeters;
    }
} else if (t.type === 'line' && a.computed?.lengthMeters) {
    qty[t.id].auto += a.computed.lengthMeters;
} else if (t.type === 'point') {
    qty[t.id].auto += 1;
}
        }));
        const saved = this.currentProject.quantities || {};
        const keys = Object.keys(qty).sort((a, b) => {
const orderValue = k => k === 'TRASSE_TOTAL' ? 0 : k.startsWith('TRASSE_DN_') ? 1 : k.startsWith('TRASSE_SURF_') ? 2 : 3;
const oa = orderValue(a), ob = orderValue(b);
if (oa !== ob) return oa - ob;
return this.qtyLabel(a, qty[a].tool).localeCompare(this.qtyLabel(b, qty[b].tool), 'de');
        });
        let pos = 1, rows = keys.map(id => {
const q = qty[id];
const val = saved[id] !== undefined ? saved[id] : q.auto;
const name = this.qtyLabel(id, q.tool);
return `<tr><td>${pos++}</td><td>${name}</td><td>${q.tool.unit}</td><td style="text-align:right">${q.tool.type === 'line' ? val.toFixed(1) : val}</td></tr>`;
        }).join('');

        const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>Mengenaufmaß - ${this.esc(this.currentProject.projectName)}</title>
<link href='https://fonts.googleapis.com/css2?family=Roboto:wght@300;400;500;700&display=swap' rel='stylesheet'>
<style>
@page { size: landscape; margin: 15mm; }
@media print {
    @page { size: landscape; margin: 15mm; }
    .no-print { display: none !important; }
    body { padding: 0; }
    * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
}
body { font-family: -apple-system, BlinkMacSystemFont, Arial, sans-serif; padding: 20px; background: #fff; }
h1 { color: #003C71; font-weight: 700; margin-bottom: 20px; }
.info-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 20px; margin-bottom: 30px; }
.info-section { background: #f8f9fa; padding: 15px; border-radius: 8px; border: 1px solid #e2e8f0; }
.info-section-title { font-weight: bold; color: #003C71; margin-bottom: 10px; font-size: 13px; text-transform: uppercase; }
.info-row { margin: 5px 0; font-size: 13px; }
table { width: 100%; border-collapse: collapse; margin-top: 20px; }
th, td { border: 1px solid #ddd; padding: 10px; }
th { background: #003C71; color: white; }
.print-bar { position: fixed; bottom: 0; left: 0; right: 0; background: #003C71; padding: 15px 20px; display: flex; gap: 10px; justify-content: center; z-index: 1000; }
.print-bar button { background: white; color: #003C71; border: none; padding: 12px 24px; border-radius: 8px; font-size: 16px; font-weight: 600; cursor: pointer; min-width: 120px; }
.print-bar button:active { background: #d0d3d4; }
.page-logo-fixed { position: fixed; bottom: 5mm; right: 5mm; opacity: 0.7; z-index: 9999; }
.page-logo-fixed img { height: 36px; }
.page-logo-inline { display: none; }
@media print {
    .page-logo-fixed { display: none !important; }
    .page-logo-inline { display: block !important; text-align: right; margin-top: 20px; opacity: 0.7; page-break-inside: avoid; }
    .page-logo-inline img { height: 36px; }
}
</style></head><body>

<div class="print-bar no-print">
    <button onclick="window.print()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg> Drucken</button>
    <button onclick="window.close()"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg> Schließen</button>
</div>

<div style="display:flex;align-items:center;gap:15px;margin-bottom:20px">
    <img src="assets/qfm-logo.png" alt="QFM" style="height:36px">
    <h1 style="margin:0;flex:1">Mengenaufmaß</h1>
</div>

<div class="info-grid">
    <div class="info-section">
        <div class="info-section-title"><svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg> Projekt</div>
        <div class="info-row"><b>Nummer:</b> ${this.esc(this.currentProject.projectNumber || '-')}</div>
        <div class="info-row"><b>Name:</b> ${this.esc(this.currentProject.projectName)}</div>
    </div>
    <div class="info-section">
        <div class="info-section-title"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> Kunde</div>
        <div class="info-row"><b>Name:</b> ${this.esc(this.currentProject.customer)}</div>
        <div class="info-row"><b>Standort:</b> ${this.esc(this.currentProject.location || '')}</div>
    </div>
    <div class="info-section">
        <div class="info-section-title"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#ed6d0f" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:middle;display:inline-block;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg> Ersteller</div>
        <div class="info-row"><b>Name:</b> ${this.esc(this.currentProject.creator || '-')}</div>
        <div class="info-row"><b>Datum:</b> ${new Date().toLocaleDateString('de-DE')}</div>
    </div>
</div>

<table>
    <tr><th>Pos.</th><th>Beschreibung</th><th>Einheit</th><th style="text-align:right">Menge</th></tr>
    ${rows}
</table>


<div class="page-logo-fixed"><img src="assets/qfm-logo.png" alt="QFM"></div>
<div class="page-logo-inline"><img src="assets/qfm-logo.png" alt="QFM"></div>
<div style="height:80px" class="no-print"></div>
</body></html>`;

        // iOS-kompatible Methode
        const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

        if (isIOS) {
this.showPDFOverlay(html, 'Mengenaufmass_' + (this.currentProject.projectNumber || this.currentProject.id));
        } else {
const w = window.open('', '_blank');
if (w) {
    w.document.write(html);
    w.document.close();
    await this._waitForImages(w.document);
    setTimeout(() => w.print(), 300);
} else {
    this.showPDFOverlay(html, 'Mengenaufmass_' + (this.currentProject.projectNumber || this.currentProject.id));
}
        }
    }

    // Wartet bis alle Bilder in einem Dokument geladen sind (für PDF-Druck)
    _waitForImages(doc) {
        return new Promise(resolve => {
const imgs = doc.querySelectorAll('img');
const pending = Array.from(imgs).filter(img => !img.complete);
if (pending.length === 0) { resolve(); return; }
let loaded = 0;
const check = () => { if (++loaded >= pending.length) resolve(); };
pending.forEach(img => { img.onload = check; img.onerror = check; });
// Sicherheits-Timeout: nach 10s trotzdem drucken
setTimeout(resolve, 10000);
        });
    }

    readFile(f) { return new Promise((r, e) => { const fr = new FileReader(); fr.onload = () => r(fr.result); fr.onerror = e; fr.readAsDataURL(f); }); }
    createThumb(dataUrl, max) { return new Promise(r => { const img = new Image(); img.onload = () => { const c = document.createElement('canvas'), s = Math.min(max / img.width, max / img.height, 1); c.width = img.width * s; c.height = img.height * s; c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); r(c.toDataURL('image/jpeg', 0.7)); }; img.src = dataUrl; }); }
    esc(s) { return s ? String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;') : ''; }
    toast(msg, type = 'info') { const c = document.getElementById('toastContainer'), t = document.createElement('div'); t.className = 'toast ' + type; t.textContent = msg; c.appendChild(t); setTimeout(() => { t.style.opacity = '0'; setTimeout(() => t.remove(), 300); }, 3000); }
}

const app = new App();
document.addEventListener('click', e => { if (!e.target.closest('.autocomplete-wrapper')) { const dd = document.getElementById('locationAutocomplete'); if (dd) dd.classList.remove('active'); } });
window.app = app; // Make app globally accessible
app.init();
window.addEventListener('resize', () => { if (app.map) app.map.invalidateSize(); });
