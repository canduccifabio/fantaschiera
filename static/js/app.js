/**
 * FantaSchiera AI - Main Application Logic
 */

let currentFormation = 'auto';
let useDefenseModifier = true;
let currentLineupData = null;
let currentSquadData = null;
let currentLiveData = null;
let currentLiveFilter = 'starters';
let isRetrospectiveOpen = true;
let isSquadSectionOpen = true;

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
  } else if (tabName === 'live') {
    loadLiveVotes();
  } else if (tabName === 'rosa' || tabName === 'alert') {
    loadSquad();
  } else if (tabName === 'sosfanta') {
    loadSOSFantaAnalysis();
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
  const modTierEl = document.getElementById('modTierDetails');
  const goalsBadgeEl = document.getElementById('goalsExpectedBadge');
  const formationLabelEl = document.getElementById('recommendedFormationName');
  const defCheckbox = document.getElementById('defenseModifierCheckbox');

  if (scoreEl) scoreEl.innerText = data.total_expected_score;
  if (formationLabelEl) formationLabelEl.innerText = data.recommended_formation;
  if (defCheckbox) defCheckbox.checked = (data.defense_modifier_active !== false);

  if (modBonusEl) {
    if (data.defense_modifier_bonus > 0) {
      modBonusEl.style.display = 'inline-block';
      modBonusEl.className = 'badge-status badge-success';
      modBonusEl.innerText = `+${data.defense_modifier_bonus} Mod. Difesa`;
    } else {
      modBonusEl.style.display = data.defense_modifier_active ? 'inline-block' : 'none';
      modBonusEl.className = 'badge-status badge-primary';
      modBonusEl.innerText = 'Mod. Difesa Attivo';
    }
  }

  if (modTierEl) {
    if (data.defense_modifier_active && data.defense_modifier_tier) {
      modTierEl.innerText = `🛡️ ${data.defense_modifier_tier}`;
      modTierEl.style.display = 'block';
    } else {
      modTierEl.style.display = 'none';
    }
  }

  if (goalsBadgeEl) {
    goalsBadgeEl.innerText = `⚽ ${data.goals_expected} GOL (${data.goals_tier_text || ''})`;
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
        <div class="player-right" style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span class="badge-status badge-${p.badge_class}">${p.status}</span>
            <span class="score-pill">★ ${Math.round(p.score)}</span>
          </div>
          <div style="font-size:0.75rem; color:#f59e0b; font-weight:700;">FV: ${p.expected_fantavoto || 6.5} pt</div>
        </div>
      </div>
    `).join('');
  }

  // Render Bench
  const benchContainer = document.getElementById('benchListContainer');
  if (benchContainer) {
    benchContainer.innerHTML = data.bench.map((p, idx) => {
      const isInj = p.is_out || p.status === 'INFORTUNATO' || p.status === 'SQUALIFICATO';
      const rightMeta = isInj 
        ? `<span class="badge-status badge-danger" style="font-size:0.7rem; padding:2px 6px;">${p.status === 'SQUALIFICATO' ? '🚫 SQUAL' : '🚑 INF'}</span>`
        : `<span class="score-pill" style="font-size:0.8rem;">★ ${Math.round(p.score)}</span>
           <div style="font-size:0.7rem; color:var(--text-muted);">FV: ${p.expected_fantavoto || 6.0} pt</div>`;
      const rowStyle = isInj ? 'opacity: 0.65; background: rgba(239, 68, 68, 0.05);' : 'opacity: 0.88;';
      const subMeta = isInj ? (p.injury_type || p.injury_reason || 'Indisponibile') : (p.opponent ? 'vs ' + p.opponent : 'Riserva');

      return `
        <div class="player-row" style="${rowStyle}" onclick='openPlayerModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
          <div class="player-left">
            <span style="font-size:0.75rem; font-weight:700; color:#64748b; width:18px;">${idx + 1}°</span>
            <span class="role-badge role-${p.role}">${p.role}</span>
            <div>
              <div class="player-name-main" style="font-size:0.9rem;">${p.name} <span style="font-weight:400; font-size:0.75rem; color:#94a3b8;">(${p.team})</span> ${isInj ? '<span style="color:#ef4444; font-size:0.75rem;">🚑</span>' : ''}</div>
              <div class="player-meta">${subMeta}</div>
            </div>
          </div>
          <div class="player-right" style="display:flex; flex-direction:column; align-items:flex-end; gap:2px;">
            ${rightMeta}
          </div>
        </div>
      `;
    }).join('');
  }

  // Render Injured in Squad (if any)
  const injuredSquadContainer = document.getElementById('injuredSquadContainer');
  const injuredSquadList = document.getElementById('injuredSquadList');
  const injuredSquadBadge = document.getElementById('injuredSquadCountBadge');
  if (injuredSquadContainer && injuredSquadList) {
    const inj = data.injured_players || [];
    if (inj.length > 0) {
      injuredSquadContainer.style.display = 'block';
      if (injuredSquadBadge) injuredSquadBadge.innerText = `${inj.length} Assenti`;
      injuredSquadList.innerHTML = inj.map(p => `
        <div class="player-row player-injured-row" style="margin-top:6px;" onclick='openPlayerModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
          <div class="player-left">
            <span class="role-badge role-${p.role}">${p.role}</span>
            <img class="player-avatar" src="${p.photo || '/static/icon.svg'}" onerror="this.src='/static/icon.svg'" />
            <div>
              <div class="player-name-main" style="color:#f87171;">${p.name} <span style="font-weight:400; font-size:0.8rem; color:#94a3b8;">(${p.team})</span></div>
              <div class="player-meta" style="color:#fca5a5;">${p.advice || p.injury_reason || 'Indisponibile'}</div>
            </div>
          </div>
          <div class="player-right">
            <span class="badge-status badge-danger">${p.status}</span>
          </div>
        </div>
      `).join('');
    } else {
      injuredSquadContainer.style.display = 'none';
    }
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

// ================= LIVE & VOTI TAB LOGIC =================
function toggleRetrospectiveBody() {
  const body = document.getElementById('retrospectiveBody');
  const badge = document.getElementById('retrospectiveToggleBadge');
  if (!body) return;
  isRetrospectiveOpen = !isRetrospectiveOpen;
  body.style.display = isRetrospectiveOpen ? 'block' : 'none';
  if (badge) badge.innerText = isRetrospectiveOpen ? 'Report Giornata ▼' : 'Mostra Report ▶';
}

function toggleSquadSection() {
  const body = document.getElementById('squadManagementBody');
  if (!body) return;
  isSquadSectionOpen = !isSquadSectionOpen;
  body.style.display = isSquadSectionOpen ? 'block' : 'none';
}

let isLiveDemoMode = false;

function toggleLiveDemoMode() {
  isLiveDemoMode = !isLiveDemoMode;
  const demoBanner = document.getElementById('liveDemoAlertBanner');
  const toggleBtn = document.getElementById('btnToggleLiveDemo');
  
  if (demoBanner) {
    demoBanner.style.display = isLiveDemoMode ? 'flex' : 'none';
  }
  if (toggleBtn) {
    if (isLiveDemoMode) {
      toggleBtn.innerText = '🟢 Torna al Live Reale';
      toggleBtn.className = 'btn btn-warning btn-sm';
    } else {
      toggleBtn.innerText = '🧪 Prova Demo Live';
      toggleBtn.className = 'btn btn-secondary btn-sm';
    }
  }
  
  showToast(isLiveDemoMode ? '🧪 Attivata modalità Demo Live (simulazione matchday)' : '🟢 Ripristinata modalità Live Reale (orari Serie A)');
  loadLiveVotes();
}

function setLiveFilter(filterType) {
  currentLiveFilter = filterType;
  document.querySelectorAll('[data-livefilter]').forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-livefilter') === filterType);
  });
  if (currentLiveData) {
    renderLivePlayerCards(currentLiveData);
  }
}

async function loadLiveVotes() {
  const container = document.getElementById('livePlayersListContainer');
  if (container && !currentLiveData) {
    container.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);"><span class="live-dot" style="margin-right:8px;"></span>Connessione al live match center...</div>`;
  }
  try {
    const res = await fetch(`/api/live/votes?simulate=${isLiveDemoMode ? 'true' : 'false'}`);
    if (!res.ok) throw new Error("Errore nel recupero dei voti live");
    const data = await res.json();
    currentLiveData = data;
    renderLiveView(data);
  } catch (err) {
    console.error("Error loading live votes:", err);
    if (container) {
      container.innerHTML = `<div style="text-align:center; padding:24px; color:#f87171;">Impossibile recuperare i voti live. Verifica la connessione e riprova.</div>`;
    }
  }
}

async function refreshLiveVotes(btn) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-block;">🔄</span> Aggiorno...`;
  }
  try {
    const res = await fetch(`/api/live/refresh?simulate=${isLiveDemoMode ? 'true' : 'false'}`, { method: 'POST' });
    const json = await res.json();
    if (json.success && json.data) {
      currentLiveData = json.data;
      renderLiveView(json.data);
      showToast(isLiveDemoMode ? "⚡ Simulazione live aggiornata!" : "⚡ Orari e voti live sincronizzati!");
    } else {
      await loadLiveVotes();
    }
  } catch (e) {
    console.error("Refresh live votes failed:", e);
    await loadLiveVotes();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>⚡ Aggiorna Voti Live</span>`;
    }
  }
}

function renderLiveView(data) {
  if (!data) return;
  const summary = data.summary || {};
  const retro = data.ai_retrospective || {};

  // Header status badge
  const statusBadge = document.getElementById('liveStatusBadge');
  if (statusBadge) {
    if (summary.is_simulated) {
      statusBadge.className = 'badge-status badge-warning';
      statusBadge.innerText = '🧪 Demo / Simulazione';
    } else if (summary.is_pre_match) {
      statusBadge.className = 'badge-status badge-warning';
      statusBadge.innerText = '⏳ In attesa del 1° match (Sab 15:00)';
    } else if (summary.live_matches > 0 || summary.live_players > 0) {
      statusBadge.className = 'badge-status badge-danger';
      statusBadge.innerHTML = '<span class="live-dot" style="margin-right:4px;"></span> LIVE in Corso 🔴';
    } else {
      statusBadge.className = 'badge-status badge-secondary';
      statusBadge.innerText = '🏁 Partite Concluse';
    }
  }

  // Header last update
  const lastUp = document.getElementById('liveLastUpdateBadge');
  if (lastUp) lastUp.innerText = `Aggiornato: ${data.last_update || '--:--'}`;

  // Big score & delta
  const scoreDisp = document.getElementById('liveTotalScoreDisplay');
  if (scoreDisp) {
    if (summary.is_pre_match) {
      scoreDisp.innerHTML = `0.0 <span style="font-size:0.85rem; color:var(--text-muted);">pt</span>`;
    } else {
      scoreDisp.innerHTML = `${summary.total_live_score || 0} <span style="font-size:0.85rem; color:var(--text-muted);">pt</span>`;
    }
  }

  const goalsDisp = document.getElementById('liveGoalsDisplay');
  if (goalsDisp) goalsDisp.innerText = summary.goals_tier_desc || '0 Gol';

  const deltaDisp = document.getElementById('liveDeltaScoreDisplay');
  if (deltaDisp) {
    if (summary.is_pre_match) {
      deltaDisp.innerHTML = `<span style="color:#60a5fa;">In attesa</span> <span style="font-size:0.82rem; color:var(--text-muted);">(${summary.total_expected_score} pt previsti)</span>`;
    } else {
      const dVal = summary.team_delta || 0;
      const sign = dVal >= 0 ? '+' : '';
      deltaDisp.innerHTML = `<span style="color:${dVal >= 0 ? '#34d399' : '#f59e0b'};">${sign}${dVal}</span> <span style="font-size:0.85rem; color:var(--text-muted);">pt (su ${summary.total_expected_score})</span>`;
    }
  }

  const modDisp = document.getElementById('liveModDisplay');
  if (modDisp) {
    if (summary.is_pre_match) {
      modDisp.innerText = `🛡️ Mod. Difesa: In attesa dei referti`;
    } else {
      modDisp.innerText = `🛡️ Mod. Difesa: +${summary.defense_modifier_bonus || 0} pt (Media ${summary.defense_modifier_avg || 0})`;
    }
  }

  const progDisp = document.getElementById('liveMatchesProgressDisplay');
  if (progDisp) {
    if (summary.is_pre_match) {
      progDisp.innerHTML = `🏁 0 Terminate • 🔴 0 In Corso • ⏳ ${summary.upcoming_matches || 10} da Giocare (11 Titolari)`;
    } else {
      const fin = summary.completed_matches !== undefined ? summary.completed_matches : (summary.completed_players || 0);
      const cur = summary.live_matches !== undefined ? summary.live_matches : (summary.live_players || 0);
      const up = summary.upcoming_matches !== undefined ? summary.upcoming_matches : (summary.upcoming_players || 0);
      progDisp.innerHTML = `🏁 ${fin} Terminate • 🔴 ${cur} In corso • ⏳ ${up} da Giocare`;
    }
  }

  const accDisp = document.getElementById('liveAccuracyDisplay');
  if (accDisp) accDisp.innerText = `🤖 ${summary.accuracy_pct || 88.6}% Accuratezza IA`;

  // AI Retrospective highlights
  const retroList = document.getElementById('retrospectiveHighlightsList');
  if (retroList && retro.highlights) {
    retroList.innerHTML = retro.highlights.map(h => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(139, 92, 246, 0.2); border-radius:10px; padding:8px 12px; font-size:0.84rem;">
        ${h.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}
      </div>
    `).join('');
  }

  // Load and render AI learning status
  loadAILearningStatus();

  renderLivePlayerCards(data);
}

// --- AI SELF-LEARNING & PARAMETER CALIBRATION ---
async function loadAILearningStatus() {
  try {
    const res = await fetch('/api/ai/learning-status');
    const json = await res.json();
    if (json.success && json.status) {
      renderAILearningUI(json.status);
    }
  } catch (e) {
    console.warn("Could not load AI learning status", e);
  }
}

function renderAILearningUI(status) {
  if (!status) return;
  const epochBadge = document.getElementById('aiLearningEpochBadge');
  if (epochBadge) epochBadge.innerText = `Epoca ${status.epoch}`;

  const rm = status.role_metrics || {};
  if (rm.P && document.getElementById('roleAccP')) document.getElementById('roleAccP').innerText = `${rm.P.accuracy}%`;
  if (rm.D && document.getElementById('roleAccD')) document.getElementById('roleAccD').innerText = `${rm.D.accuracy}%`;
  if (rm.C && document.getElementById('roleAccC')) document.getElementById('roleAccC').innerText = `${rm.C.accuracy}%`;
  if (rm.A && document.getElementById('roleAccA')) document.getElementById('roleAccA').innerText = `${rm.A.accuracy}%`;

  const weightsList = document.getElementById('aiWeightsBadgesList');
  const w = status.weights || {};
  if (weightsList && w) {
    weightsList.innerHTML = `
      <span class="badge-status badge-secondary">Fattore Campo: ${w.home_bonus_weight} pt</span>
      <span class="badge-status badge-secondary">Pendenza Matchup: ${w.matchup_difficulty_slope}</span>
      <span class="badge-status badge-secondary">Mod. Difesa: x${w.def_base_multiplier}</span>
      <span class="badge-status badge-secondary">SOS Fanta: x${w.editorial_bonus_multiplier}</span>
      <span class="badge-status badge-success">MAE: ${status.overall_mae} pt</span>
    `;
  }

  const autoPill = document.getElementById('aiAutoStatusPill');
  if (autoPill) {
    autoPill.innerText = `🟢 Rete Neurale Epoca ${status.epoch} (Allineata)`;
  }
}

async function triggerAILearning(btn) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `⚡ Calibro...`;
  }
  try {
    const res = await fetch('/api/ai/trigger-learning', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(`🧠 Rete Neurale Epoca ${json.epoch} ricalibrata! Accuratezza: ${json.accuracy}%`);
      if (json.data) renderAILearningUI(json.data);
      loadLineupRecommendation();
      loadLiveVotes();
    } else {
      showToast(json.message || "Auto-apprendimento completato.");
    }
  } catch (e) {
    console.error("Trigger learning error:", e);
    showToast("Errore durante la ricalibrazione.");
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `⚡ Forza Ricalibrazione`;
    }
  }
}

function renderLivePlayerCards(data) {
  const container = document.getElementById('livePlayersListContainer');
  const countBadge = document.getElementById('livePlayersCountBadge');
  if (!container) return;

  let players = data.players || [];
  if (currentLiveFilter === 'starters') {
    players = players.filter(p => p.is_starter);
  } else if (currentLiveFilter === 'active') {
    players = players.filter(p => p.match_status === 'TERMINATA' || p.match_status === 'IN CORSO');
  }

  if (countBadge) countBadge.innerText = `${players.length} Calciatori`;

  if (players.length === 0) {
    const emptyMsg = currentLiveFilter === 'active' 
      ? '⏳ Nessun match è ancora iniziato (la 6ª giornata comincia sabato alle 15:00 con Genoa-Fiorentina).'
      : 'Nessun calciatore corrispondente al filtro selezionato.';
    container.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);">${emptyMsg}</div>`;
    return;
  }

  container.innerHTML = players.map(p => {
    // Bonus/malus pills
    let bonusHtml = '';
    if (p.bonus_malus && p.bonus_malus.length > 0) {
      bonusHtml = p.bonus_malus.map(b => {
        const isMalus = b.val < 0;
        return `<span class="bonus-pill ${isMalus ? 'malus' : ''}">${b.icon} ${b.val > 0 ? '+' : ''}${b.val}</span>`;
      }).join(' ');
    } else if (p.real_fantavoto !== null) {
      bonusHtml = `<span style="font-size:0.75rem; color:var(--text-muted);">Nessun bonus/malus</span>`;
    }

    const deltaClass = p.delta >= 0 ? 'delta-pos' : 'delta-neg';
    const isStarterBadge = p.is_starter ? `<span class="badge-status badge-success" style="font-size:0.68rem; padding:1px 6px;">TITOLARE</span>` : `<span class="badge-status badge-secondary" style="font-size:0.68rem; padding:1px 6px;">PANCHINA</span>`;

    const realVoteText = p.real_fantavoto !== null ? `
      <div style="text-align:right;">
        <div style="font-size:1.25rem; font-weight:900; color:#34d399;">${p.real_fantavoto} <span style="font-size:0.7rem; font-weight:600; color:var(--text-muted);">FV</span></div>
        <div style="font-size:0.72rem; color:var(--text-secondary);">Voto: <strong>${p.base_grade}</strong></div>
      </div>
    ` : `
      <div style="text-align:right;">
        <div style="font-size:1rem; font-weight:800; color:var(--text-muted);">-.-</div>
        <div style="font-size:0.72rem; color:var(--text-muted);">Da giocare</div>
      </div>
    `;

    return `
      <div class="live-player-card" onclick='openPlayerModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
        <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span class="role-badge role-${p.role}">${p.role}</span>
            <img src="${p.photo || '/static/icon.svg'}" onerror="this.src='/static/icon.svg'" style="width:34px; height:34px; border-radius:50%; object-fit:cover;" />
            <div>
              <div style="font-weight:800; font-size:0.95rem; color:#ffffff; display:flex; align-items:center; gap:6px;">
                ${p.name} <span style="font-size:0.78rem; font-weight:400; color:#94a3b8;">(${p.team})</span> ${isStarterBadge}
              </div>
              <div style="font-size:0.75rem; color:var(--text-muted);">
                ${p.match_info || ''}
              </div>
            </div>
          </div>
          <div style="display:flex; flex-direction:column; align-items:flex-end; gap:3px;">
            <span class="badge-status ${p.status_class || 'badge-secondary'}" style="font-size:0.72rem;">${p.status_badge || '⏳'}</span>
            ${realVoteText}
          </div>
        </div>

        <!-- Middle stats & comparison -->
        <div style="background:rgba(0,0,0,0.22); border-radius:8px; padding:6px 10px; margin:6px 0; display:flex; justify-content:space-between; align-items:center; font-size:0.75rem; flex-wrap:wrap; gap:6px;">
          <div style="display:flex; align-items:center; gap:6px;">
            <span>Bonus/Malus:</span>
            ${bonusHtml}
          </div>
          <div style="display:flex; align-items:center; gap:6px;">
            <span style="color:var(--text-muted);">Atteso: <strong>${p.expected_fantavoto || '-'}</strong></span>
            ${p.real_fantavoto !== null ? `<span class="delta-badge ${deltaClass}">Δ ${p.delta_formatted}</span>` : ''}
          </div>
        </div>

        <!-- AI Review line -->
        <div style="font-size:0.76rem; color:#c4b5fd; line-height:1.4; margin-top:4px;">
          🤖 ${p.ai_review || ''}
        </div>
      </div>
    `;
  }).join('');
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

    const injuredMap = {};
    (currentLineupData?.injured_players || []).forEach(ip => {
      injuredMap[ip.name.toLowerCase().replace('.', '').trim()] = ip;
    });

    if (playersInRole.length === 0) {
      html += `<div style="padding:12px; font-size:0.85rem; color:var(--text-muted); text-align:center; background:rgba(255,255,255,0.02); border-radius:10px;">Nessun calciatore inserito in questo ruolo.</div>`;
    } else {
      playersInRole.forEach(p => {
        const cleanPName = p.name.toLowerCase().replace('.', '').trim();
        const injInfo = injuredMap[cleanPName];
        const isInjured = Boolean(injInfo);

        html += `
          <div class="player-row ${isInjured ? 'player-injured-row' : ''}">
            <div class="player-left">
              <span class="role-badge role-${p.role}">${p.role}</span>
              <img class="player-avatar" src="${p.photo || '/static/icon.svg'}" onerror="this.src='/static/icon.svg'" />
              <div>
                <div class="player-name-main ${isInjured ? 'text-danger' : ''}">${p.name} <span style="font-weight:400; font-size:0.8rem; color:#94a3b8;">(${p.team})</span></div>
                <div class="player-meta">
                  ${isInjured ? `<span style="color:#f87171; font-weight:700;">🚑 ${injInfo.injury_type || 'INFORTUNATO'}: ${injInfo.injury_reason || 'Non disponibile'}</span>` : `Quotaz: ${p.qa || '-'} • FVM: ${p.fvm || '-'} ${p.is_penalty_taker ? '• 🎯 Rigorista' : ''}`}
                </div>
              </div>
            </div>
            <div class="player-right">
              ${isInjured ? `<span class="badge-status badge-danger" style="margin-right:6px;">ASSENTE</span>` : ''}
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
      loadLineupRecommendation();
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
      loadLineupRecommendation();
    }
  } catch (e) {
    showToast("Errore reset rosa.");
  }
}

// --- FIXTURES TAB ---
async function loadFixtures() {
  try {
    // Ensure squad data is available so player highlighting always works
    if (!currentSquadData && (!currentLineupData || !currentLineupData.starters)) {
      try {
        const sqRes = await fetch('/api/squad');
        if (sqRes.ok) currentSquadData = await sqRes.json();
      } catch (e) {}
    }
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

  // Gather all squad players from all available caches
  const allUserPlayers = [];
  if (currentSquadData && currentSquadData.players) {
    allUserPlayers.push(...currentSquadData.players);
  }
  if (currentLineupData) {
    if (currentLineupData.starters) allUserPlayers.push(...currentLineupData.starters);
    if (currentLineupData.bench) allUserPlayers.push(...currentLineupData.bench);
    if (currentLineupData.injured_players) allUserPlayers.push(...currentLineupData.injured_players);
  }

  // Build clean search tokens for robust surname/alias matching
  function cleanTokens(str) {
    if (!str) return [];
    return str.toLowerCase()
      .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length >= 3 && !['del', 'dei', 'della', 'degli', 'van', 'von', 'san'].includes(t));
  }

  const userTokensSet = new Set();
  allUserPlayers.forEach(p => {
    if (!p || !p.name) return;
    cleanTokens(p.name).forEach(t => userTokensSet.add(t));
  });

  function isUserPlayer(pName) {
    if (!pName || userTokensSet.size === 0) return false;
    const tokens = cleanTokens(pName);
    return tokens.some(t => userTokensSet.has(t));
  }

  function formatLineup(lineupList, percentagesMap) {
    if (!lineupList || lineupList.length === 0) {
      return `<div style="color:var(--text-muted); font-size:0.8rem;">Formazione non ancora disponibile</div>`;
    }

    return lineupList.map(pName => {
      const pInfo = percentagesMap ? percentagesMap[pName.toLowerCase()] : null;
      const role = pInfo?.role || 'C';
      const pct = pInfo?.percentage || 90;
      const isMine = isUserPlayer(pName);

      if (isMine) {
        return `<span class="badge-my-starter" title="⭐ Giocatore nella tua rosa!">⭐ ${pName} (${pct}%)</span>`;
      } else {
        const ballotStr = pct < 75 ? ` <span style="color:#f59e0b; font-size:0.7rem;">(${pct}%)</span>` : '';
        return `<span style="display:inline-flex; align-items:center; gap:3px; margin:2px 4px 2px 0; font-size:0.78rem; color:#cbd5e1;"><span class="role-badge role-${role}" style="font-size:0.65rem; padding:1px 4px;">${role}</span>${pName}${ballotStr}</span>`;
      }
    }).join(' • ');
  }

  container.innerHTML = fixtures.map(m => {
    // Separate ballottaggi cleanly between Home and Away team
    const homeLineupLower = (m.home_lineup || []).map(p => p.toLowerCase());
    const awayLineupLower = (m.away_lineup || []).map(p => p.toLowerCase());

    const homeBal = [];
    const awayBal = [];
    const otherBal = [];

    (m.ballottaggi || []).forEach(bal => {
      const bLow = bal.toLowerCase();
      const isHome = homeLineupLower.some(p => bLow.includes(p.split(' ')[0]));
      const isAway = awayLineupLower.some(p => bLow.includes(p.split(' ')[0]));
      if (isHome && !isAway) {
        homeBal.push(bal);
      } else if (isAway && !isHome) {
        awayBal.push(bal);
      } else {
        if (isHome) homeBal.push(bal);
        else if (isAway) awayBal.push(bal);
        else otherBal.push(bal);
      }
    });

    // Highlight user player inside ballottaggi
    function formatBalText(str) {
      let res = str;
      userTokensSet.forEach(t => {
        const reg = new RegExp(`\\b(${t})\\b`, 'gi');
        if (reg.test(res)) {
          res = res.replace(reg, '<strong style="color:#34d399; background:rgba(16,185,129,0.22); padding:1px 4px; border-radius:4px;">⭐ $1</strong>');
        }
      });
      return res;
    }

    return `
      <div class="card" style="padding:14px; margin-bottom:14px;">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; flex-wrap:wrap; gap:4px;">
          <span>📅 ${m.date_str}</span>
          <span>🏟️ ${m.stadium || 'Stadio Serie A'}</span>
        </div>
        <div style="display:flex; align-items:center; justify-content:space-between; font-weight:800; font-size:1.05rem; margin-bottom:12px; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:8px;">
          <span style="color:#60a5fa;">${m.home_team} (${m.home_formation})</span>
          <span style="color:var(--text-muted); font-size:0.8rem;">VS</span>
          <span style="color:#f87171;">${m.away_team} (${m.away_formation})</span>
        </div>
        
        <!-- Complete 11 Home Lineup -->
        <div style="background:rgba(255,255,255,0.02); border-radius:10px; padding:10px; margin-bottom:8px;">
          <div style="font-size:0.75rem; font-weight:800; color:#60a5fa; margin-bottom:6px; text-transform:uppercase;">
            🔵 Titolari ${m.home_team} (${m.home_lineup?.length || 0}/11):
          </div>
          <div style="line-height:1.8;">
            ${formatLineup(m.home_lineup, m.player_percentages)}
          </div>
        </div>

        <!-- Complete 11 Away Lineup -->
        <div style="background:rgba(255,255,255,0.02); border-radius:10px; padding:10px; margin-bottom:10px;">
          <div style="font-size:0.75rem; font-weight:800; color:#f87171; margin-bottom:6px; text-transform:uppercase;">
            🔴 Titolari ${m.away_team} (${m.away_lineup?.length || 0}/11):
          </div>
          <div style="line-height:1.8;">
            ${formatLineup(m.away_lineup, m.player_percentages)}
          </div>
        </div>

        <!-- Differentiated Ballottaggi -->
        ${(m.ballottaggi && m.ballottaggi.length > 0) ? `
          <div style="background:rgba(245, 158, 11, 0.05); border:1px solid rgba(245, 158, 11, 0.22); border-radius:10px; padding:10px 12px; margin-top:8px;">
            <div style="font-size:0.76rem; font-weight:800; color:#f59e0b; margin-bottom:6px; text-transform:uppercase;">
              ⚖️ Ballottaggi per Squadra:
            </div>
            
            <div style="display:flex; flex-direction:column; gap:6px; font-size:0.77rem; line-height:1.5;">
              <div style="background:rgba(96, 165, 250, 0.08); border-left:3px solid #60a5fa; padding:5px 8px; border-radius:4px;">
                <span style="font-weight:700; color:#60a5fa;">🔵 ${m.home_team}:</span> 
                <span style="color:#cbd5e1;">${homeBal.length > 0 ? homeBal.map(formatBalText).join(' • ') : '<em style="color:var(--text-muted);">Nessun ballottaggio</em>'}</span>
              </div>

              <div style="background:rgba(248, 113, 113, 0.08); border-left:3px solid #f87171; padding:5px 8px; border-radius:4px;">
                <span style="font-weight:700; color:#f87171;">🔴 ${m.away_team}:</span> 
                <span style="color:#cbd5e1;">${awayBal.length > 0 ? awayBal.map(formatBalText).join(' • ') : '<em style="color:var(--text-muted);">Nessun ballottaggio</em>'}</span>
              </div>

              ${otherBal.length > 0 ? `
                <div style="padding:4px 8px; color:#cbd5e1;">
                  <span style="font-weight:700; color:#f59e0b;">⚪ Altri:</span> ${otherBal.map(formatBalText).join(' • ')}
                </div>
              ` : ''}
            </div>
          </div>
        ` : ''}
      </div>
    `;
  }).join('');
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
  document.getElementById('modalPlayerScore').innerText = `★ ${Math.round(player.score || 0)}`;
  document.getElementById('modalPlayerExpectedFV').innerText = `${player.expected_fantavoto || 6.5} pt`;
  document.getElementById('modalPlayerTitolarita').innerText = `${player.titolarita_pct || player.titolarita_fonti || 70}%`;
  document.getElementById('modalPlayerMatch').innerText = player.match_info || "Prossimo turno";
  document.getElementById('modalPlayerQA').innerText = player.qa || '-';
  document.getElementById('modalPlayerFVM').innerText = player.fvm || '-';

  // Live & Post-Match Performance Card Population
  const livePerfCard = document.getElementById('modalLivePerformanceCard');
  if (livePerfCard) {
    const isLiveOrDone = player.real_fantavoto !== null && player.real_fantavoto !== undefined;
    const hasLiveContext = player.match_status !== undefined || isLiveOrDone;

    if (hasLiveContext) {
      livePerfCard.style.display = 'block';

      // Status Badge
      const statusBadge = document.getElementById('modalLiveStatusBadge');
      if (statusBadge) {
        statusBadge.innerText = player.status_badge || (player.match_status === 'TERMINATA' ? 'FINALE 🏁' : (player.match_status === 'IN CORSO' ? 'LIVE 🔴' : 'DA GIOCARE ⏳'));
        statusBadge.className = `badge-status ${player.status_class || 'badge-warning'}`;
      }

      // Fantavoto & Base Grade
      const fvDisp = document.getElementById('modalLiveFantavoto');
      const deltaDisp = document.getElementById('modalLiveDeltaBadge');
      const baseGradeVal = document.getElementById('modalLiveBaseGradeVal');
      const bonusHtml = document.getElementById('modalLiveBonusListHtml');

      if (isLiveOrDone) {
        if (fvDisp) fvDisp.innerText = `${player.real_fantavoto}`;
        if (deltaDisp) {
          deltaDisp.style.display = 'inline-block';
          deltaDisp.innerText = `Δ ${player.delta_formatted || '0 pt'} vs Atteso`;
          deltaDisp.className = `badge-status ${player.delta_class || 'badge-success'}`;
        }
        if (baseGradeVal) baseGradeVal.innerText = `${player.base_grade !== null ? player.base_grade : '-'}`;
        if (bonusHtml) {
          if (player.bonus_malus && player.bonus_malus.length > 0) {
            bonusHtml.innerHTML = player.bonus_malus.map(b => 
              `<span class="bonus-pill ${b.val < 0 ? 'malus' : ''}">${b.icon} ${b.label} (${b.val > 0 ? '+' : ''}${b.val})</span>`
            ).join(' ');
          } else {
            bonusHtml.innerText = 'Nessun bonus/malus';
          }
        }
      } else {
        if (fvDisp) fvDisp.innerHTML = `-.- <span style="font-size:0.8rem; font-weight:400; color:var(--text-muted);">(Atteso: ${player.expected_fantavoto || 6.5})</span>`;
        if (deltaDisp) {
          deltaDisp.style.display = 'inline-block';
          deltaDisp.innerText = `In attesa del fischio d'inizio`;
          deltaDisp.className = 'badge-status badge-secondary';
        }
        if (baseGradeVal) baseGradeVal.innerText = '-.-';
        if (bonusHtml) bonusHtml.innerText = "In attesa degli eventi ufficiali Fantacalcio.it";
      }

      // Advanced Stats from other sources (Sofascore & Understat)
      const statGrid = document.getElementById('modalLiveStatsGrid');
      const statSourceBadge = document.getElementById('modalLiveStatsSourceBadge');
      const ds = player.detailed_stats || {};

      if (statSourceBadge) {
        statSourceBadge.innerText = ds.rating_source || ds.source || "SofaScore Live + Understat";
      }

      if (statGrid) {
        const statBoxes = [];
        if (ds.minutes && ds.minutes !== '-') statBoxes.push({ label: 'MINUTI', val: ds.minutes });
        if (ds.xg && ds.xg !== '-') statBoxes.push({ label: 'xG (UNDERSTAT)', val: ds.xg });
        if (ds.xa && ds.xa !== '-') statBoxes.push({ label: 'xA (UNDERSTAT)', val: ds.xa });
        if (ds.shots_total) statBoxes.push({ label: 'TIRI (SPECCHIO)', val: `${ds.shots_total} (${ds.shots_on_target || 0})` });
        if (ds.passes && ds.passes !== '-') statBoxes.push({ label: 'PASSAGGI', val: ds.passes });
        if (ds.duels_won) statBoxes.push({ label: 'DUELLI VINTI', val: ds.duels_won });
        if (ds.tackles) statBoxes.push({ label: 'CONTRASTI', val: ds.tackles });
        if (ds.interceptions) statBoxes.push({ label: 'INTERCETTI', val: ds.interceptions });
        if (ds.recoveries) statBoxes.push({ label: 'RECUPERI', val: ds.recoveries });
        if (ds.saves) statBoxes.push({ label: 'PARATE', val: ds.saves });
        if (ds.clearances) statBoxes.push({ label: 'RESPINTE', val: ds.clearances });
        if (ds.key_passes) statBoxes.push({ label: 'CHIAVE', val: ds.key_passes });
        if (ds.assists) statBoxes.push({ label: 'ASSIST', val: ds.assists });

        if (statBoxes.length === 0) {
          statGrid.innerHTML = `<div style="grid-column:1/-1; font-size:0.75rem; color:var(--text-muted); padding:6px; text-align:center;">Metriche live Sofascore ed Understat disponibili al fischio d'inizio.</div>`;
        } else {
          statGrid.innerHTML = statBoxes.slice(0, 6).map(sb => `
            <div style="background:rgba(255,255,255,0.04); border-radius:8px; padding:6px; text-align:center;">
              <div style="font-size:0.65rem; color:var(--text-muted); font-weight:700;">${sb.label}</div>
              <div style="font-size:0.92rem; font-weight:800; color:#ffffff; margin-top:2px;">${sb.val}</div>
            </div>
          `).join('');
        }
      }

      // AI Performance Analysis
      const aiTitle = document.getElementById('modalLiveAITitle');
      const aiSummary = document.getElementById('modalLiveAISummary');
      const aiModImpact = document.getElementById('modalLiveAIModImpact');
      const aiP = player.ai_analysis || {};

      if (aiTitle) aiTitle.innerText = aiP.title || (isLiveOrDone ? `Analisi Rendimento • ${player.verdict || 'Valutazione IA'}` : `Pre-Match Report • ${player.match_min || ''}`);
      if (aiSummary) aiSummary.innerText = aiP.summary || player.ai_review || `Previsione di rendimento impostata a ${player.expected_fantavoto || 6.5} pt.`;
      if (aiModImpact) {
        aiModImpact.innerText = aiP.mod_impact || (player.role in {'P':1, 'D':1} ? `🛡️ Reparto Difensivo: Il voto base inciderà direttamente sul Modificatore Difesa.` : `🎯 Reparto Avanzato: Obiettivo bonus (+3 gol, +1 assist).`);
      }
    } else {
      livePerfCard.style.display = 'none';
    }
  }

  // Injury Alert Box
  const injAlert = document.getElementById('modalPlayerInjuryAlert');
  const injText = document.getElementById('modalPlayerInjuryText');
  if (player.is_out || player.is_injured) {
    if (injAlert) injAlert.style.display = 'block';
    if (injText) injText.innerText = `${player.injury_type || 'Indisponibile'}: ${player.injury_reason || player.advice || 'Calciatore attualmente non disponibile per la giornata.'}`;
  } else if (injAlert) {
    injAlert.style.display = 'none';
  }

  // Why Starter / Motivation Box
  const whyBox = document.getElementById('modalWhyStarterBox');
  const whyText = document.getElementById('modalWhyStarterText');
  if (whyText) {
    let mot = player.motivation?.why_starter_or_bench || player.why_starter || player.advice || "Consigliato per rendimento, xG e titolarità.";
    whyText.innerText = mot;
  }

  // Super Intelligence Factors List
  const factorsContainer = document.getElementById('modalSuperIntelFactors');
  if (factorsContainer) {
    const factors = player.motivation?.factors || [];
    if (factors.length > 0) {
      factorsContainer.innerHTML = factors.map(f => `
        <div class="modal-factor-row">
          <div class="modal-factor-header">
            <span class="modal-factor-label">${f.label}</span>
            <span class="modal-factor-val">${f.val}</span>
          </div>
          <div class="modal-factor-desc">${f.desc}</div>
        </div>
      `).join('');
    } else {
      factorsContainer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-muted); padding:6px;">Dati analizzati con modello standard.</div>`;
    }
  }

  // SOS Fanta Quote
  const sfBox = document.getElementById('modalSOSFantaBox');
  if (player.sosfanta && player.sosfanta.mentioned) {
    if (sfBox) {
      sfBox.style.display = 'block';
      document.getElementById('modalSOSFantaBadge').innerText = player.sosfanta.category;
      document.getElementById('modalSOSFantaBadge').className = `badge-status badge-${player.sosfanta.badge}`;
      document.getElementById('modalSOSFantaQuote').innerText = `"${player.sosfanta.quote}"`;
      document.getElementById('modalSOSFantaSummary').innerText = player.sosfanta.summary;
    }
  } else if (sfBox) {
    sfBox.style.display = 'none';
  }

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
  loadLiveVotes();

  // Pre-fetch SOS Fanta full article in the background so modal opens with 0 latency
  fetch('/api/sosfanta/full-article')
    .then(r => r.json())
    .then(d => { if (d.success) fullArticleDataCache = d; })
    .catch(() => {});
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

// --- SOS FANTA INTELLIGENCE TAB ---
let fullArticleDataCache = null;
let activeMatchFilter = 'all';

async function loadSOSFantaAnalysis() {
  const container = document.getElementById('sosfantaCardsContainer');
  const statsContainer = document.getElementById('sosfantaStatsContainer');
  if (container) container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Analisi preview SOS Fanta in corso...</div>`;

  try {
    const res = await fetch('/api/sosfanta/analysis');
    if (!res.ok) throw new Error("Errore recupero SOS Fanta");
    const data = await res.json();
    const results = data.results || [];

    // Update matchday badge and url input
    if (data.matchday) {
      const badge = document.getElementById('sosfantaMatchdayBadge');
      if (badge) badge.innerText = data.matchday;
    }
    if (data.preview_url) {
      const input = document.getElementById('sosfantaUrlInput');
      if (input) input.value = data.preview_url;
    }

    // Stats count
    const mentionedCount = results.filter(r => r.sosfanta.mentioned).length;
    const topCount = results.filter(r => r.sosfanta.category === 'SCHIERARE ASSOLUTO').length;
    const promossiCount = results.filter(r => r.sosfanta.category === 'PROMOSSO').length;

    if (statsContainer) {
      statsContainer.innerHTML = `
        <div class="counter-box">
          <div class="counter-val" style="color:#ef4444;">${mentionedCount}/${results.length}</div>
          <div class="counter-lbl">Citati nell'articolo</div>
        </div>
        <div class="counter-box">
          <div class="counter-val" style="color:#10b981;">${topCount}</div>
          <div class="counter-lbl">Schierare Assoluto</div>
        </div>
        <div class="counter-box">
          <div class="counter-val" style="color:#3b82f6;">${promossiCount}</div>
          <div class="counter-lbl">Promossi / In Forma</div>
        </div>
      `;
    }

    if (container) {
      container.innerHTML = results.map(r => {
        const sf = r.sosfanta;
        const isMentioned = sf.mentioned;
        return `
          <div class="player-row" style="margin-bottom:10px; flex-direction:column; align-items:stretch; gap:8px;" onclick='openPlayerModal(${JSON.stringify(r).replace(/'/g, "&#39;")})'>
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div class="player-left">
                <span class="role-badge role-${r.role}">${r.role}</span>
                <img class="player-avatar" src="${r.photo || '/static/icon.svg'}" onerror="this.src='/static/icon.svg'" />
                <div>
                  <div class="player-name-main">${r.name} <span style="font-weight:400; font-size:0.8rem; color:#94a3b8;">(${r.team})</span></div>
                  <div class="player-meta">Quotaz: ${r.qa} • FVM: ${r.fvm}</div>
                </div>
              </div>
              <div>
                <span class="badge-status badge-${sf.badge}">${sf.icon} ${sf.category}</span>
              </div>
            </div>
            
            ${isMentioned ? `
              <div style="background:rgba(255,255,255,0.03); border-left:3px solid var(--accent-emerald); padding:8px 12px; border-radius:6px; font-size:0.83rem;">
                <div style="font-style:italic; color:#ffffff; margin-bottom:3px;">"${sf.quote}"</div>
                <div style="font-size:0.75rem; color:#94a3b8;">${sf.summary}</div>
              </div>
            ` : `
              <div style="font-size:0.75rem; color:var(--text-muted); padding:4px 8px;">
                ${sf.summary}
              </div>
            `}
          </div>
        `;
      }).join('');
    }

    // Silently pre-fetch full article in background so modal opens instantly on click
    fetch('/api/sosfanta/full-article')
      .then(res => res.json())
      .then(data => { if (data.success) fullArticleDataCache = data; })
      .catch(() => {});
  } catch (e) {
    if (container) container.innerHTML = `<div style="text-align:center; padding:20px; color:#ef4444;">Errore nel caricamento dei dati SOS Fanta.</div>`;
  }
}

// Helper to format clean full match names (e.g. "Sassuolo - Milan", "Atalanta - Venezia")
function formatMatchTitle(rawTitle) {
  if (!rawTitle) return '';
  // Split on hyphen/dash or whole word 'vs' or 'contro', NEVER character classes like [s]!
  const parts = rawTitle.split(/\s*[-–—]\s*|\s+(?:vs\.?|contro)\s+/i).map(p => p.trim()).filter(Boolean);
  if (parts.length >= 2) {
    const formatTeam = (str) => {
      const clean = str.trim();
      if (clean.length <= 3) return clean.toUpperCase();
      return clean.charAt(0).toUpperCase() + clean.slice(1).toLowerCase();
    };
    return `${formatTeam(parts[0])} - ${formatTeam(parts[1])}`;
  }
  return rawTitle.trim();
}

async function syncSOSFantaPreview() {
  const input = document.getElementById('sosfantaUrlInput');
  const url = input ? input.value.trim() : '';
  if (!url) {
    showToast("Inserisci un URL valido per la preview.");
    return;
  }

  showToast("🔄 Scarico e analizzo la preview di SOS Fanta...");
  try {
    const res = await fetch('/api/sosfanta/update-url', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: url })
    });
    const result = await res.json();
    if (result.success) {
      showToast(`✅ Analisi ${result.matchday || 'SOS Fanta'} aggiornata con successo!`);
      loadSOSFantaAnalysis();
      loadLineupRecommendation();
    }
  } catch (e) {
    showToast("Errore durante l'aggiornamento da SOS Fanta.");
  }
}

async function autoDiscoverSOSFanta() {
  showToast("⚡ Cerco l'ultima preview su SOS Fanta...");
  try {
    const res = await fetch('/api/sosfanta/auto-discover', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
      const input = document.getElementById('sosfantaUrlInput');
      if (input && data.preview_url) input.value = data.preview_url;
      showToast(`✅ Rilevata e aggiornata: ${data.matchday || 'Nuova Giornata'}!`);
      loadSOSFantaAnalysis();
      loadLineupRecommendation();
    } else {
      showToast("Nessun aggiornamento necessario.");
    }
  } catch (e) {
    showToast("Errore durante il controllo automatico.");
  }
}

// --- SOS FANTA FULL ARTICLE READER MODAL ---
function populateFullArticleUI(data) {
  const mday = data.matchday || "Giornata";
  const badge = document.getElementById('fullArticleMatchdayBadge');
  if (badge) badge.innerText = mday;
  
  const extLink = document.getElementById('fullArticleExternalLink');
  if (extLink && data.preview_url) extLink.href = data.preview_url;

  renderFullArticleNavPills(data.slides || []);
  renderFullArticleMatches(data.slides || [], '');

  const searchInput = document.getElementById('fullArticleSearchInput');
  if (searchInput) {
    searchInput.value = '';
    searchInput.oninput = (e) => {
      const query = e.target.value.trim().toLowerCase();
      renderFullArticleMatches(data.slides || [], query);
    };
  }
}

async function openSOSFantaFullArticleModal() {
  const dialog = document.getElementById('sosfantaFullModal');
  if (!dialog) return;
  dialog.showModal();

  // If already loaded in memory, display immediately with 0 delay!
  if (fullArticleDataCache && fullArticleDataCache.slides) {
    populateFullArticleUI(fullArticleDataCache);
    return;
  }

  const container = document.getElementById('fullArticleMatchesContainer');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Caricamento delle 10 partite...</div>`;
  }

  try {
    const res = await fetch('/api/sosfanta/full-article');
    if (!res.ok) throw new Error("Errore caricamento articolo");
    const data = await res.json();
    fullArticleDataCache = data;
    populateFullArticleUI(data);
  } catch (e) {
    if (container) {
      container.innerHTML = `<div style="text-align:center; padding:30px; color:#ef4444;">Impossibile recuperare l'articolo integrale.</div>`;
    }
  }
}

function closeSOSFantaFullArticleModal() {
  const dialog = document.getElementById('sosfantaFullModal');
  if (dialog) dialog.close();
}

function renderFullArticleNavPills(slides) {
  const pillsContainer = document.getElementById('fullArticleNavPills');
  if (!pillsContainer) return;

  let pillsHtml = `
    <button class="match-pill-btn active" onclick="filterMatchSlide('all', this)">
      Tutte (10)
    </button>
  `;

  slides.forEach((s) => {
    const fullMatchName = formatMatchTitle(s.title);
    const myCount = s.my_players ? s.my_players.length : 0;
    const badgeStr = myCount > 0 ? ` (${myCount}⭐)` : '';
    pillsHtml += `
      <button class="match-pill-btn" onclick="filterMatchSlide(${s.page}, this)">
        ${s.page}. ${fullMatchName}${badgeStr}
      </button>
    `;
  });

  pillsContainer.innerHTML = pillsHtml;
}

function filterMatchSlide(page, btnEl) {
  activeMatchFilter = page;
  document.querySelectorAll('#fullArticleNavPills .match-pill-btn').forEach(b => b.classList.remove('active'));
  if (btnEl) btnEl.classList.add('active');

  const searchVal = document.getElementById('fullArticleSearchInput')?.value.trim().toLowerCase() || '';

  if (page === 'all') {
    renderFullArticleMatches(fullArticleDataCache?.slides || [], searchVal, false);
  } else {
    const singleSlide = (fullArticleDataCache?.slides || []).filter(s => s.page === page);
    renderFullArticleMatches(singleSlide, searchVal, true);
  }
}

function renderFullArticleMatches(slides, query, isSingle = false) {
  const container = document.getElementById('fullArticleMatchesContainer');
  if (!container) return;

  let filtered = slides;
  if (query) {
    filtered = slides.filter(s => {
      const inTitle = s.title.toLowerCase().includes(query);
      const inText = s.text.toLowerCase().includes(query);
      const inPlayers = (s.my_players || []).some(p => p.name.toLowerCase().includes(query));
      return inTitle || inText || inPlayers;
    });
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Nessuna partita corrisponde alla ricerca "<strong>${query}</strong>".</div>`;
    return;
  }

  let html = filtered.map(s => {
    const myPlayers = s.my_players || [];
    const myPlayersTags = myPlayers.map(p => {
      let tagClass = 'tag-good';
      if (p.category === 'SCHIERARE ASSOLUTO') tagClass = 'tag-top';
      else if (p.category === 'ATTENZIONE / RISCHIOSO') tagClass = 'tag-warn';
      return `<span class="match-player-tag ${tagClass}">⭐ ${p.name}: ${p.icon} ${p.category}</span>`;
    }).join(' ');

    let parasHtml = '';
    if (s.paragraphs && s.paragraphs.length > 0) {
      parasHtml = s.paragraphs.map(p => {
        let highlighted = p;
        // Make team name heading prominent at paragraph start (e.g. Genoa :, Milan :)
        highlighted = highlighted.replace(/^([A-Za-zÀ-ÿ\s]{3,25}\s*:)/, '<strong style="color:#60a5fa; font-weight:800; font-size:0.95rem; display:inline-block; margin-right:4px;">$1</strong>');
        myPlayers.forEach(mp => {
          const reg = new RegExp(`(${mp.name.split(' ')[0]})`, 'gi');
          highlighted = highlighted.replace(reg, `<strong style="color:#34d399; background:rgba(16,185,129,0.15); padding:1px 4px; border-radius:4px;">$1</strong>`);
        });
        if (query) {
          const qReg = new RegExp(`(${query})`, 'gi');
          highlighted = highlighted.replace(qReg, `<mark style="background:#f59e0b; color:#000; padding:1px 3px; border-radius:3px;">$1</mark>`);
        }
        return `<p style="margin-bottom:8px; line-height:1.6; font-size:0.86rem; color:#e2e8f0;">${highlighted}</p>`;
      }).join('');
    } else {
      parasHtml = `<p style="line-height:1.6; font-size:0.86rem; color:#e2e8f0;">${s.text}</p>`;
    }

    return `
      <div class="article-match-card" id="match-card-${s.page}">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; border-bottom:1px solid rgba(255,255,255,0.06); padding-bottom:6px; flex-wrap:wrap; gap:6px;">
          <div style="font-weight:800; font-size:1.02rem; color:#f87171; letter-spacing:0.3px;">
            ⚽ ${s.page}. ${formatMatchTitle(s.title)}
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">Partita ${s.page} di 10</span>
        </div>

        ${myPlayers.length > 0 ? `
          <div style="background:rgba(16,185,129,0.08); border:1px solid rgba(16,185,129,0.25); border-radius:8px; padding:6px 10px; margin-bottom:10px;">
            <div style="font-size:0.7rem; color:#34d399; font-weight:700; margin-bottom:3px; text-transform:uppercase;">I Tuoi Calciatori Coinvolti:</div>
            <div>${myPlayersTags}</div>
          </div>
        ` : ''}

        <div style="color:#cbd5e1;">
          ${parasHtml}
        </div>
      </div>
    `;
  }).join('');

  if (isSingle) {
    html += `
      <div style="text-align:center; padding:12px 0 6px;">
        <button class="btn btn-secondary btn-sm" onclick="filterMatchSlide('all', document.querySelector('#fullArticleNavPills button'))">
          📖 Mostra Tutte le 10 Partite
        </button>
      </div>
    `;
  }

  container.innerHTML = html;
}

function copyPublicTunnelUrl() {
  if (!publicTunnelUrl) return;
  navigator.clipboard.writeText(publicTunnelUrl).then(() => {
    showToast("📋 Link Pubblico copiato! Incollalo su Safari dell'iPhone.");
  }).catch(() => {
    showToast("Impossibile copiare negli appunti.");
  });
}
