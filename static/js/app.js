/**
 * FantaSchiera AI - Main Application Logic
 */

let currentFormation = 'auto';
let useDefenseModifier = false;
let currentLineupData = null;
let currentSquadData = null;

// Tab Switching
function switchTab(tabName) {
  document.querySelectorAll('.tab-view').forEach(v => v.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(btn => btn.classList.remove('active'));

  const view = document.getElementById(`tab-${tabName}`);
  const navBtn = document.querySelector(`.nav-item[data-tab="${tabName}"]`);

  if (view) view.classList.add('active');
  if (navBtn) navBtn.classList.add('active');

  window.scrollTo({ top: 0, behavior: 'smooth' });

  if (tabName === 'schiera') {
    loadLineupRecommendation();
  } else if (tabName === 'rosa') {
    loadSquad();
  } else if (tabName === 'probabili') {
    loadFixtures();
  } else if (tabName === 'infortuni') {
    loadInjuries();
  }
}

// Toast notification helper
function showToast(message) {
  const toast = document.getElementById('appToast');
  if (!toast) return;
  toast.innerText = message;
  toast.classList.add('show');
  setTimeout(() => toast.classList.remove('show'), 2600);
}

// --- LINEUP TAB LOGIC ---
async function loadLineupRecommendation() {
  try {
    const url = `/api/lineup/recommendation?formation=${encodeURIComponent(currentFormation)}&use_modifier=${useDefenseModifier}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Errore recupero formazione");
    
    currentLineupData = await res.json();
    renderLineupView(currentLineupData);
  } catch (e) {
    console.error("Error loading lineup:", e);
    showToast("Errore nel calcolo della formazione.");
  }
}

function renderLineupView(data) {
  // Update header overview
  const scoreEl = document.getElementById('totalExpectedScore');
  const modBonusEl = document.getElementById('modBonusDisplay');
  const formationLabelEl = document.getElementById('recommendedFormationName');

  if (scoreEl) scoreEl.innerText = data.total_expected_score;
  if (formationLabelEl) formationLabelEl.innerText = data.recommended_formation;
  if (modBonusEl) {
    modBonusEl.style.display = data.defense_modifier_bonus > 0 ? 'inline-block' : 'none';
    modBonusEl.innerText = `+${data.defense_modifier_bonus} Mod. Difesa`;
  }

  // Render Pitch
  window.renderSoccerPitch(data.starters, data.recommended_formation, openPlayerModal);

  // Render Starters List
  const startersContainer = document.getElementById('startersListContainer');
  if (startersContainer) {
    startersContainer.innerHTML = data.starters.map(p => `
      <div class="player-row" onclick='openPlayerModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
        <div class="player-left">
          <span class="role-badge role-${p.role}">${p.role}</span>
          <img class="player-avatar" src="${p.photo || '/static/icon.svg'}" onerror="this.src='/static/icon.svg'" />
          <div>
            <div class="player-name-main">${p.name} <span style="font-weight:400; font-size:0.8rem; color:#94a3b8;">(${p.team})</span></div>
            <div class="player-meta">${p.match_info}</div>
          </div>
        </div>
        <div class="player-right">
          <span class="badge-status badge-${p.badge_class}">${p.status}</span>
          <span class="score-pill">★ ${Math.round(p.score)}</span>
        </div>
      </div>
    `).join('');
  }

  // Render Bench
  const benchContainer = document.getElementById('benchListContainer');
  if (benchContainer) {
    benchContainer.innerHTML = data.bench.map((p, idx) => `
      <div class="player-row" style="opacity: 0.85;" onclick='openPlayerModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
        <div class="player-left">
          <span style="font-size:0.75rem; font-weight:700; color:#64748b; width:18px;">${idx + 1}°</span>
          <span class="role-badge role-${p.role}">${p.role}</span>
          <div>
            <div class="player-name-main" style="font-size:0.9rem;">${p.name} <span style="font-weight:400; font-size:0.75rem; color:#94a3b8;">(${p.team})</span></div>
            <div class="player-meta">${p.opponent ? 'vs ' + p.opponent : 'Riserva'}</div>
          </div>
        </div>
        <div class="player-right">
          <span class="score-pill" style="font-size:0.8rem;">★ ${Math.round(p.score)}</span>
        </div>
      </div>
    `).join('');
  }

  // Render Key Decisions / Ballottaggi
  const decisionsContainer = document.getElementById('keyDecisionsContainer');
  if (decisionsContainer) {
    if (data.key_decisions && data.key_decisions.length > 0) {
      decisionsContainer.style.display = 'block';
      decisionsContainer.innerHTML = `
        <div class="card-title" style="margin-bottom:10px; color:#f59e0b;">⚖️ Ballottaggi & Dubbi di Giornata</div>
        ${data.key_decisions.map(d => `
          <div style="background:rgba(245, 158, 11, 0.1); border:1px solid rgba(245, 158, 11, 0.25); border-radius:10px; padding:10px; margin-bottom:8px; font-size:0.85rem;">
            <strong>[Ruolo ${d.role}]</strong> ${d.note}
          </div>
        `).join('')}
      `;
    } else {
      decisionsContainer.style.display = 'none';
    }
  }
}

// Copy lineup to clipboard
function copyLineupToClipboard() {
  if (!currentLineupData) return;

  const startersByRole = {
    'P': currentLineupData.starters.filter(p => p.role === 'P').map(p => p.name).join(', '),
    'D': currentLineupData.starters.filter(p => p.role === 'D').map(p => p.name).join(', '),
    'C': currentLineupData.starters.filter(p => p.role === 'C').map(p => p.name).join(', '),
    'A': currentLineupData.starters.filter(p => p.role === 'A').map(p => p.name).join(', ')
  };

  const benchStr = currentLineupData.bench.map(p => `${p.name} (${p.role})`).join(', ');

  const text = `⚽ FORMAZIONE FANTACALCIO (${currentLineupData.recommended_formation})\n` +
    `⭐ Titolari:\n` +
    `POR: ${startersByRole.P}\n` +
    `DIF: ${startersByRole.D}\n` +
    `CEN: ${startersByRole.C}\n` +
    `ATT: ${startersByRole.A}\n\n` +
    `🔄 Panchina:\n${benchStr}\n\n` +
    `🎯 Punti attesi: ${currentLineupData.total_expected_score} | Generato da FantaSchiera AI`;

  navigator.clipboard.writeText(text).then(() => {
    showToast("📋 Formazione copiata negli appunti!");
  }).catch(() => {
    showToast("Impossibile copiare negli appunti.");
  });
}

// --- SQUAD MANAGEMENT TAB ---
async function loadSquad() {
  try {
    const res = await fetch('/api/squad');
    if (!res.ok) throw new Error("Errore recupero rosa");
    currentSquadData = await res.json();
    renderSquadView(currentSquadData);
  } catch (e) {
    console.error("Error loading squad:", e);
    showToast("Errore nel caricamento della rosa.");
  }
}

function renderSquadView(data) {
  // Counters
  document.getElementById('countP').innerText = `${data.counts.P}/3`;
  document.getElementById('countD').innerText = `${data.counts.D}/8`;
  document.getElementById('countC').innerText = `${data.counts.C}/8`;
  document.getElementById('countA').innerText = `${data.counts.A}/6`;
  document.getElementById('countTotal').innerText = `${data.total} Giocatori`;

  // Render Player list grouped by role
  const container = document.getElementById('squadPlayersList');
  if (!container) return;

  const roles = ['P', 'D', 'C', 'A'];
  const roleNames = { 'P': 'PORTIERI', 'D': 'DIFENSORI', 'C': 'CENTROCAMPISTI', 'A': 'ATTACCANTI' };

  let html = '';
  roles.forEach(r => {
    const playersInRole = data.players.filter(p => p.role === r);
    html += `
      <div style="margin-top:16px; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
        <span style="font-weight:800; font-size:0.85rem; color:var(--text-secondary);">${roleNames[r]} (${playersInRole.length})</span>
        <button class="btn btn-secondary btn-sm" onclick="openAddPlayerModal('${r}')">+ Aggiungi ${r}</button>
      </div>
    `;

    if (playersInRole.length === 0) {
      html += `<div style="padding:12px; font-size:0.85rem; color:var(--text-muted); text-align:center; background:rgba(255,255,255,0.02); border-radius:10px;">Nessun calciatore inserito in questo ruolo.</div>`;
    } else {
      playersInRole.forEach(p => {
        html += `
          <div class="player-row">
            <div class="player-left">
              <span class="role-badge role-${p.role}">${p.role}</span>
              <img class="player-avatar" src="${p.photo || '/static/icon.svg'}" onerror="this.src='/static/icon.svg'" />
              <div>
                <div class="player-name-main">${p.name} <span style="font-weight:400; font-size:0.8rem; color:#94a3b8;">(${p.team})</span></div>
                <div class="player-meta">Quotaz: ${p.qa || '-'} • FVM: ${p.fvm || '-'} ${p.is_penalty_taker ? '• 🎯 Rigorista' : ''}</div>
              </div>
            </div>
            <div class="player-right">
              <button class="btn btn-secondary btn-sm" style="color:#ef4444;" onclick="removePlayerFromSquad('${p.name.replace(/'/g, "\\'")}')">Rimuovi</button>
            </div>
          </div>
        `;
      });
    }
  });

  container.innerHTML = html;
}

async function removePlayerFromSquad(name) {
  if (!confirm(`Sei sicuro di voler rimuovere ${name} dalla rosa?`)) return;
  try {
    const res = await fetch('/api/squad/remove', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: name })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`${name} rimosso dalla rosa.`);
      loadSquad();
    }
  } catch (e) {
    showToast("Errore durante la rimozione.");
  }
}

async function resetSquadToDefault() {
  if (!confirm("Vuoi ripristinare la rosa di esempio ufficiale?")) return;
  try {
    const res = await fetch('/api/squad/reset', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      showToast("Rosa reimpostata con successo!");
      loadSquad();
    }
  } catch (e) {
    showToast("Errore reset rosa.");
  }
}

// --- FIXTURES TAB ---
async function loadFixtures() {
  try {
    const res = await fetch('/api/fixtures');
    if (!res.ok) throw new Error("Errore recupero calendario");
    const data = await res.json();
    renderFixturesView(data.fixtures || []);
  } catch (e) {
    showToast("Errore caricamento calendario.");
  }
}

function renderFixturesView(fixtures) {
  const container = document.getElementById('fixturesListContainer');
  if (!container) return;

  if (fixtures.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Nessuna partita disponibile.</div>`;
    return;
  }

  container.innerHTML = fixtures.map(m => `
    <div class="card" style="padding:14px; margin-bottom:12px;">
      <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px;">
        <span>📅 ${m.date_str}</span>
        <span>🏟️ ${m.stadium || 'Stadio'}</span>
      </div>
      <div style="display:flex; align-items:center; justify-content:space-between; font-weight:800; font-size:1.05rem; margin-bottom:10px;">
        <span style="color:#60a5fa;">${m.home_team} (${m.home_formation})</span>
        <span style="color:var(--text-muted); font-size:0.85rem;">VS</span>
        <span style="color:#f87171;">${m.away_team} (${m.away_formation})</span>
      </div>
      
      <!-- Starting 11 preview -->
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:6px;">
        <strong>Titolari ${m.home_code}:</strong> ${(m.home_lineup || []).slice(0, 7).join(', ')}...
      </div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:8px;">
        <strong>Titolari ${m.away_code}:</strong> ${(m.away_lineup || []).slice(0, 7).join(', ')}...
      </div>

      <!-- Ballottaggi -->
      ${(m.ballottaggi && m.ballottaggi.length > 0) ? `
        <div style="background:rgba(255,255,255,0.03); border-radius:8px; padding:6px 10px; font-size:0.75rem; color:#f59e0b;">
          <strong>Ballottaggi:</strong> ${m.ballottaggi.join(' • ')}
        </div>
      ` : ''}
    </div>
  `).join('');
}

// --- INJURIES TAB ---
async function loadInjuries() {
  try {
    const res = await fetch('/api/injuries');
    if (!res.ok) throw new Error("Errore recupero infermeria");
    const data = await res.json();
    renderInjuriesView(data.injuries || []);
  } catch (e) {
    showToast("Errore caricamento indisponibili.");
  }
}

function renderInjuriesView(injuries) {
  const container = document.getElementById('injuriesListContainer');
  if (!container) return;

  if (injuries.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Nessun indisponibile registrato.</div>`;
    return;
  }

  container.innerHTML = injuries.map(item => `
    <div class="player-row" style="margin-bottom:8px;">
      <div class="player-left">
        <span class="role-badge" style="background:${item.type === 'Squalificati' ? '#ef4444' : '#f59e0b'};">${item.type === 'Squalificati' ? 'SQ' : 'INF'}</span>
        <div>
          <div class="player-name-main">${item.name} <span style="font-weight:400; font-size:0.8rem; color:#94a3b8;">(${item.team || 'Serie A'})</span></div>
          <div class="player-meta" style="color:#e2e8f0; font-size:0.8rem;">${item.reason}</div>
        </div>
      </div>
      <div class="player-right">
        <span class="badge-status badge-danger">${item.type}</span>
      </div>
    </div>
  `).join('');
}

// --- SYNC LIVE DATA ---
async function syncLiveData() {
  const syncBtn = document.getElementById('btnSyncData');
  if (syncBtn) {
    syncBtn.innerText = "Sincronizzo...";
    syncBtn.disabled = true;
  }

  try {
    showToast("🔄 Download aggiornamenti da Fantacalcio.it...");
    const res = await fetch('/api/sync', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      showToast("✅ Dati aggiornati con successo!");
      if (window.alertController) window.alertController.fetchAlertInfo();
      loadLineupRecommendation();
    }
  } catch (e) {
    showToast("Errore nella sincronizzazione dati.");
  } finally {
    if (syncBtn) {
      syncBtn.innerText = "Aggiorna Dati 🔄";
      syncBtn.disabled = false;
    }
  }
}

// --- MODALS (Modern HTML5 <dialog>) ---
function openPlayerModal(player) {
  const dialog = document.getElementById('playerDetailModal');
  if (!dialog) return;

  document.getElementById('modalPlayerAvatar').src = player.photo || '/static/icon.svg';
  document.getElementById('modalPlayerName').innerText = player.name;
  document.getElementById('modalPlayerTeam').innerText = `${player.team_full || player.team} • Ruolo ${player.role}`;
  document.getElementById('modalPlayerScore').innerText = `★ ${Math.round(player.score)} / 100`;
  document.getElementById('modalPlayerTitolarita').innerText = `${player.titolarita_pct || 70}%`;
  document.getElementById('modalPlayerAdvice').innerText = player.advice || "Nessun consiglio specifico.";
  document.getElementById('modalPlayerMatch').innerText = player.match_info || "Prossimo turno";
  document.getElementById('modalPlayerQA').innerText = player.qa || '-';
  document.getElementById('modalPlayerFVM').innerText = player.fvm || '-';

  dialog.showModal();
}

function closePlayerModal() {
  const dialog = document.getElementById('playerDetailModal');
  if (dialog) dialog.close();
}

// Add Player Dialog & Search
let addRoleSelected = 'C';
function openAddPlayerModal(role = 'C') {
  addRoleSelected = role;
  const dialog = document.getElementById('addPlayerModal');
  const title = document.getElementById('addPlayerModalTitle');
  if (title) title.innerText = `Aggiungi ${role === 'P' ? 'Portiere' : role === 'D' ? 'Difensore' : role === 'C' ? 'Centrocampista' : 'Attaccante'}`;
  
  const searchInput = document.getElementById('addPlayerSearchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.focus();
  }
  searchPlayersCatalog('');
  if (dialog) dialog.showModal();
}

function closeAddPlayerModal() {
  const dialog = document.getElementById('addPlayerModal');
  if (dialog) dialog.close();
}

async function searchPlayersCatalog(query) {
  const resultsContainer = document.getElementById('addPlayerSearchResults');
  if (!resultsContainer) return;

  try {
    const res = await fetch(`/api/players/search?query=${encodeURIComponent(query)}&role=${addRoleSelected}&limit=25`);
    const data = await res.json();

    if (data.results.length === 0) {
      resultsContainer.innerHTML = `<div style="text-align:center; padding:16px; color:var(--text-muted);">Nessun calciatore trovato.</div>`;
      return;
    }

    resultsContainer.innerHTML = data.results.map(p => `
      <div class="player-row" style="margin-bottom:6px;">
        <div class="player-left">
          <span class="role-badge role-${p.role}">${p.role}</span>
          <img class="player-avatar" src="${p.photo || '/static/icon.svg'}" onerror="this.src='/static/icon.svg'" />
          <div>
            <div class="player-name-main">${p.name} <span style="font-weight:400; font-size:0.8rem; color:#94a3b8;">(${p.team})</span></div>
            <div class="player-meta">Quotaz: ${p.qa} • FVM: ${p.fvm}</div>
          </div>
        </div>
        <div class="player-right">
          <button class="btn btn-primary btn-sm" onclick='executeAddPlayer(${JSON.stringify(p).replace(/'/g, "&#39;")})'>+ Aggiungi</button>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error(e);
  }
}

async function executeAddPlayer(player) {
  try {
    const res = await fetch('/api/squad/add', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(player)
    });
    const result = await res.json();
    if (result.success) {
      showToast(`✅ ${player.name} aggiunto alla rosa!`);
      closeAddPlayerModal();
      loadSquad();
    } else {
      showToast(result.message || "Errore durante l'aggiunta.");
    }
  } catch (e) {
    showToast("Errore di rete.");
  }
}

// Paste Squad Dialog
function openPasteSquadModal() {
  const dialog = document.getElementById('pasteSquadModal');
  if (dialog) dialog.showModal();
}

function closePasteSquadModal() {
  const dialog = document.getElementById('pasteSquadModal');
  if (dialog) dialog.close();
}

async function executeImportPastedSquad() {
  const textarea = document.getElementById('pasteSquadTextarea');
  if (!textarea || !textarea.value.trim()) {
    showToast("Inserisci del testo prima di importare.");
    return;
  }

  try {
    showToast("Analizzo i calciatori...");
    const res = await fetch('/api/squad/import-text', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: textarea.value })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`✅ Riconosciuti ${result.matched_count} calciatori (aggiunti: ${result.added_count})!`);
      closePasteSquadModal();
      loadSquad();
    } else {
      showToast(result.message);
    }
  } catch (e) {
    showToast("Errore durante l'importazione.");
  }
}

// Initialization on DOM Load
document.addEventListener('DOMContentLoaded', () => {
  // Navigation tab listeners
  document.querySelectorAll('.nav-item').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      const tab = btn.getAttribute('data-tab');
      switchTab(tab);
    });
  });

  // Module Segmented Control buttons
  document.querySelectorAll('.segment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.segment-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentFormation = btn.getAttribute('data-formation');
      loadLineupRecommendation();
    });
  });

  // Defense modifier toggle
  const modToggle = document.getElementById('defenseModifierCheckbox');
  if (modToggle) {
    modToggle.addEventListener('change', () => {
      useDefenseModifier = modToggle.checked;
      loadLineupRecommendation();
    });
  }

  // Player search debounce in add modal
  const searchInput = document.getElementById('addPlayerSearchInput');
  let searchTimeout = null;
  if (searchInput) {
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimeout);
      searchTimeout = setTimeout(() => {
        searchPlayersCatalog(searchInput.value.trim());
      }, 250);
    });
  }

  // Initial load
  loadLineupRecommendation();
  loadTunnelInfo();
});

// --- TUNNEL INFO & COPY ---
let publicTunnelUrl = 'https://trans-equipment-cove-commonwealth.trycloudflare.com';

async function loadTunnelInfo() {
  try {
    const res = await fetch('/api/tunnel-info');
    if (res.ok) {
      const data = await res.json();
      if (data.public_url) {
        publicTunnelUrl = data.public_url;
        const el = document.getElementById('publicTunnelUrlDisplay');
        if (el) el.innerText = data.public_url;
      }
    }
  } catch (e) {
    console.warn("Could not load tunnel info", e);
  }
}

function copyPublicTunnelUrl() {
  if (!publicTunnelUrl) return;
  navigator.clipboard.writeText(publicTunnelUrl).then(() => {
    showToast("📋 Link Pubblico copiato! Incollalo su Safari dell'iPhone.");
  }).catch(() => {
    showToast("Impossibile copiare negli appunti.");
  });
}
