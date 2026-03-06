const USERS = {
    'qfm_versatel': { password: 'VT123', label: '1&1 Versatel', auftraggeber: '1&1 Versatel' },
    'qfm_vodafone': { password: 'VF123', label: 'Vodafone', auftraggeber: 'Vodafone' }
};

// CLOUD SYNC (Cloudflare R2)
const CLOUD = {
    API: 'https://api.sitesketch.app',
    KEY: 'QFM_SS123',
    enabled: true,
    user: null, // wird beim Login gesetzt
    headers() { return { 'Authorization': `Bearer ${this.KEY}`, 'Content-Type': 'application/json' }; },
    _prefix() { return this.user ? this.user + '/' : ''; },
    async saveProject(project, photos) {
        if (!this.enabled || !this.user) return;
        try {
const projectData = { ...project };
projectData._photos = photos.map(ph => ({ id: ph.id, projectId: ph.projectId, name: ph.name, annotations: ph.annotations, notes: ph.notes, isMapSnapshot: ph.isMapSnapshot, mapMetadata: ph.mapMetadata, createdAt: ph.createdAt, sortOrder: ph.sortOrder, sizeMultiplier: ph.sizeMultiplier, hasPhoto: !!ph.dataUrl }));
await fetch(`${this.API}/projects/${this._prefix()}${project.id}`, { method: 'PUT', headers: this.headers(), body: JSON.stringify(projectData) });
for (const ph of photos) {
    if (ph.dataUrl) {
        try {
            const parts = ph.dataUrl.split(',');
            const mime = parts[0].match(/:(.*?);/)?.[1] || 'image/jpeg';
            const binary = atob(parts[1]);
            const arr = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) arr[i] = binary.charCodeAt(i);
            const blob = new Blob([arr], { type: mime });
            await fetch(`${this.API}/photos/${this._prefix()}${project.id}/${ph.id}`, {
                method: 'PUT',
                headers: { 'Authorization': `Bearer ${this.KEY}`, 'Content-Type': mime },
                body: blob
            });
            console.log('☁️ Foto hochgeladen:', ph.id, (blob.size/1024).toFixed(0)+'KB');
        } catch(e) { console.warn('☁️ Foto-Upload Fehler:', ph.id, e); }
    }
}
console.log('☁️ Sync OK:', project.id);
        } catch(e) { console.warn('☁️ Sync Fehler:', e); }
    },
    async deleteProject(id) { if (!this.enabled || !this.user) return; try { await fetch(`${this.API}/projects/${this._prefix()}${id}`, { method: 'DELETE', headers: this.headers() }); } catch(e) {} },
    async loadAllProjects() { if (!this.enabled || !this.user) return null; try { const r = await fetch(`${this.API}/projects?user=${this.user}`, { headers: this.headers() }); if (!r.ok) { return { _error: r.status + ' ' + r.statusText }; } return await r.json(); } catch(e) { return { _error: e.message }; } },
    async loadProject(id) { if (!this.enabled || !this.user) return null; try { const r = await fetch(`${this.API}/projects/${this._prefix()}${id}`, { headers: this.headers() }); return r.ok ? await r.json() : null; } catch(e) { return null; } },
    async loadPhoto(projectId, photoId) { if (!this.enabled || !this.user) return null; try { const r = await fetch(`${this.API}/photos/${this._prefix()}${projectId}/${photoId}`, { headers: { 'Authorization': `Bearer ${this.KEY}` } }); if (!r.ok) return null; const b = await r.blob(); return new Promise(res => { const fr = new FileReader(); fr.onloadend = () => res(fr.result); fr.readAsDataURL(b); }); } catch(e) { return null; } }
};

