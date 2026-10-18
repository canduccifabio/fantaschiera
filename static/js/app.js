/**
 * FantaSchiera AI - Main Application Logic
 */

let currentFormation = 'auto';
let useDefenseModifier = true;
let currentLineupData = null;
let currentSquadData = null;
let currentLiveData = null;
let currentLiveFilter = 'starters';
let isRetrospectiveOpen = false;
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
    if (!currentLiveMatchday && currentLiveData && currentLiveData.current_matchday) {
      currentLiveMatchday = currentLiveData.current_matchday;
    }
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
let currentSchieraMatchday = null;

function renderSchieraMatchdaySelector(availableMatchdays, currentMatchday, selectedMatchday) {
  const container = document.getElementById('schieraMatchdaySegments');
  const notice = document.getElementById('schieraMatchdayNotice');
  if (!container) return;

  const mds = (availableMatchdays && availableMatchdays.length > 0) ? availableMatchdays : [6, 7];
  const activeMd = selectedMatchday || currentMatchday || mds[mds.length - 1];

  container.innerHTML = mds.map(m => {
    const isCurrent = (m === currentMatchday);
    const isSelected = (m === activeMd);
    const label = isCurrent ? `${m}ª Giornata 🟢` : `${m}ª Giornata`;
    return `<button class="segment-btn ${isSelected ? 'active' : ''}" onclick="switchSchieraMatchday(${m})">${label}</button>`;
  }).join('');

  if (notice) {
    if (activeMd < currentMatchday) {
      notice.innerHTML = `🏁 ${activeMd}ª Giornata (Referti & Storico)`;
    } else {
      notice.innerHTML = `🟢 ${activeMd}ª Giornata • Calibrazione Reattiva AI Attiva`;
    }
  }
}

function switchSchieraMatchday(md) {
  currentSchieraMatchday = md;
  loadLineupRecommendation();
}

async function forceSyncLineups() {
  const spin = document.getElementById('syncIconSpin');
  if (spin) spin.style.animation = 'spin 0.8s linear infinite';
  showToast("🔄 Risincronizzo probabili formazioni live da Fantacalcio.it...");
  try {
    const res = await fetch(`/api/lineup/sync-lineups`, { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast(`✅ Formazioni aggiornate alle ${json.last_updated_human || 'adesso'}!`);
      await loadLineupRecommendation();
    } else {
      showToast("Errore durante la risincronizzazione.");
    }
  } catch (e) {
    console.error("forceSyncLineups error:", e);
    showToast("Errore di connessione.");
  } finally {
    if (spin) spin.style.animation = 'none';
  }
}

async function loadLineupRecommendation() {
  try {
    const mdParam = currentSchieraMatchday ? `&matchday=${currentSchieraMatchday}` : '';
    const url = `/api/lineup/recommendation?formation=${encodeURIComponent(currentFormation)}&use_modifier=${useDefenseModifier}${mdParam}&_t=${Date.now()}`;
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) throw new Error("Errore recupero formazione");
    
    currentLineupData = await res.json();
    if (!currentSchieraMatchday && currentLineupData.current_matchday) {
      currentSchieraMatchday = currentLineupData.selected_matchday || currentLineupData.current_matchday;
    }
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

  // Update formation last updated banner
  const updateBannerEl = document.getElementById('formationLastUpdatedText');
  if (updateBannerEl && data.last_updated_human) {
    updateBannerEl.innerText = `Aggiornate ${data.last_updated_human} (Fantacalcio.it, Sky, Gazzetta & SOS Fanta)`;
  }

  // Update dynamic matchday segmented control
  renderSchieraMatchdaySelector(data.available_matchdays, data.current_matchday, currentSchieraMatchday);

  // Populate Comparator dropdowns
  populateComparatorDropdowns(data);

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
      window.currentKeyDecisions = data.key_decisions;
      decisionsContainer.style.display = 'block';
      decisionsContainer.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:6px;">
          <div>
            <div class="card-title" style="color:#f59e0b; margin:0; display:flex; align-items:center; gap:8px;">
              <span>⚖️ Ballottaggi & Scelte Chiave dell'AI</span>
              <span class="badge-status badge-warning" style="font-size:0.7rem; font-weight:800;">Interattivi • Clicca per analisi</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
              💡 <strong>Come scegliere:</strong> Clicca su ciascun ballottaggio per aprire il testa a testa comparativo con motivazione AI, Opta xG, titolarità, coppe e arbitro.
            </div>
          </div>
          <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">${data.key_decisions.length} dubbi analizzati</span>
        </div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          ${data.key_decisions.map((d, idx) => {
            const roleBadgeClass = d.role === 'P' ? 'badge-primary' : (d.role === 'D' ? 'badge-success' : (d.role === 'C' ? 'badge-warning' : 'badge-danger'));
            const roleIcon = d.role === 'P' ? '🧤' : (d.role === 'D' ? '🛡️' : (d.role === 'C' ? '⚙️' : '🎯'));
            return `
              <div class="ballottaggio-card" onclick="openBallottaggioModal(${idx})" 
                   style="background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.3); border-radius:12px; padding:12px 14px; cursor:pointer; transition:all 0.2s ease; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                <div style="display:flex; align-items:center; gap:12px; flex:1; min-width:260px;">
                  <span class="badge-status ${roleBadgeClass}" style="font-size:0.75rem; padding:4px 8px; font-weight:800; display:flex; align-items:center; gap:4px; flex-shrink:0;">
                    <span>${roleIcon}</span>
                    <span>${d.role_label || d.role}</span>
                  </span>
                  <div>
                    <div style="font-size:0.92rem; font-weight:800; color:#f8fafc; display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
                      <span style="color:#34d399; display:flex; align-items:center; gap:3px;">
                        <span>⭐</span>
                        <span>${d.starter}</span>
                      </span>
                      <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">(★${d.starter_score})</span>
                      <span style="color:#94a3b8; font-size:0.8rem; font-weight:700;">vs</span>
                      <span style="color:#fbbf24; display:flex; align-items:center; gap:3px;">
                        <span>🔄</span>
                        <span>${d.benched}</span>
                      </span>
                      <span style="font-size:0.75rem; color:var(--text-muted); font-weight:600;">(★${d.benched_score})</span>
                    </div>
                    <div style="font-size:0.77rem; color:var(--text-muted); margin-top:3px; line-height:1.4;">
                      Vantaggio AI: <strong style="color:#34d399;">+${d.diff || 0} pt</strong> a favore di ${d.starter} • <span style="color:#cbd5e1;">${(d.comparison && d.comparison.headline) ? d.comparison.headline : d.note}</span>
                    </div>
                  </div>
                </div>
                <div style="display:flex; align-items:center; gap:6px; margin-left:auto;">
                  <span class="badge-status badge-warning" style="font-size:0.75rem; padding:5px 10px; font-weight:800; display:flex; align-items:center; gap:4px; box-shadow:0 2px 8px rgba(245, 158, 11, 0.2);">
                    <span>🔍 Analisi Decisionale AI</span>
                    <span>▶</span>
                  </span>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      `;
    } else {
      decisionsContainer.style.display = 'none';
    }
  }
}

// --- INTERACTIVE PLAYER COMPARATOR (TESTA A TESTA AI) ---
function populateComparatorDropdowns(data) {
  const sel1 = document.getElementById('comparatorPlayer1');
  const sel2 = document.getElementById('comparatorPlayer2');
  if (!sel1 || !sel2) return;

  const allPlayers = [
    ...(data.starters || []),
    ...(data.bench || []),
    ...(data.tribuna || [])
  ];

  if (allPlayers.length === 0) return;

  const roleOrder = { 'P': 1, 'D': 2, 'C': 3, 'A': 4 };
  allPlayers.sort((a, b) => {
    const rA = roleOrder[a.role] || 5;
    const rB = roleOrder[b.role] || 5;
    if (rA !== rB) return rA - rB;
    return (b.score || 0) - (a.score || 0);
  });

  const currentVal1 = sel1.value;
  const currentVal2 = sel2.value;

  const roleLabels = { 'P': '🧤 Portieri', 'D': '🛡️ Difensori', 'C': '⚙️ Centrocampisti', 'A': '🎯 Attaccanti' };
  let optGroups = {};

  allPlayers.forEach(p => {
    const r = p.role || 'C';
    if (!optGroups[r]) optGroups[r] = [];
    const titLabel = p.titolarita_pct ? ` • ${p.titolarita_pct}% titolare` : '';
    const oppLabel = p.opponent ? ` vs ${p.opponent}` : '';
    optGroups[r].push(`
      <option value="${p.name}">[${r}] ${p.name} (${p.team || ''}${oppLabel}${titLabel})</option>
    `);
  });

  let html = `<option value="">-- Seleziona calciatore --</option>`;
  ['P', 'D', 'C', 'A'].forEach(r => {
    if (optGroups[r] && optGroups[r].length > 0) {
      html += `<optgroup label="${roleLabels[r]}">${optGroups[r].join('')}</optgroup>`;
    }
  });

  sel1.innerHTML = html;
  sel2.innerHTML = html;

  if (currentVal1) sel1.value = currentVal1;
  if (currentVal2) sel2.value = currentVal2;

  // Pre-select Dybala vs Ramos G. if available and none selected
  if (!sel1.value && !sel2.value && allPlayers.length >= 2) {
    const dybala = allPlayers.find(p => p.name.toLowerCase().includes('dybala'));
    const ramos = allPlayers.find(p => p.name.toLowerCase().includes('ramos'));
    if (dybala && ramos) {
      sel1.value = dybala.name;
      sel2.value = ramos.name;
    } else {
      sel1.value = allPlayers[0].name;
      sel2.value = allPlayers[1].name;
    }
  }
}

function onComparatorSelectChange() {
  const resContainer = document.getElementById('comparatorResultContainer');
  if (resContainer) resContainer.style.display = 'none';
}

async function runPlayerComparison() {
  const p1 = document.getElementById('comparatorPlayer1')?.value;
  const p2 = document.getElementById('comparatorPlayer2')?.value;
  const resContainer = document.getElementById('comparatorResultContainer');
  const btn = document.getElementById('btnRunComparison');

  if (!p1 || !p2) {
    showToast("⚠️ Seleziona entrambi i calciatori da confrontare.");
    return;
  }

  if (p1.toLowerCase().trim() === p2.toLowerCase().trim()) {
    showToast("⚠️ Seleziona due calciatori differenti per il testa a testa.");
    return;
  }

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span>⏳</span> <span>Analisi AI in corso...</span>`;
  }

  if (resContainer) {
    resContainer.style.display = 'block';
    resContainer.innerHTML = `
      <div style="text-align:center; padding:24px; color:var(--text-muted);">
        <span class="live-dot" style="margin-right:8px;"></span> Elaborazione super-intelligence e incrocio dati (Fantacalcio.it + SOS Fanta + SofaScore)...
      </div>
    `;
  }

  try {
    const md = currentSchieraMatchday || 7;
    const url = `/api/lineup/compare?player1=${encodeURIComponent(p1)}&player2=${encodeURIComponent(p2)}&matchday=${md}&_t=${Date.now()}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error("Errore durante la comparazione");
    const data = await res.json();

    if (!data.success) {
      if (resContainer) {
        resContainer.innerHTML = `<div style="padding:14px; color:#f87171; background:rgba(239,68,68,0.1); border-radius:8px;">${data.error || 'Errore nella comparazione.'}</div>`;
      }
      return;
    }

    renderComparatorResult(data);
  } catch (e) {
    console.error("Comparison error:", e);
    if (resContainer) {
      resContainer.innerHTML = `<div style="padding:14px; color:#f87171; background:rgba(239,68,68,0.1); border-radius:8px;">Impossibile completare il confronto. Riprova più tardi.</div>`;
    }
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🧠 Chiedi all'AI chi schierare</span>`;
    }
  }
}

function renderComparatorResult(data) {
  const container = document.getElementById('comparatorResultContainer');
  if (!container) return;

  const pA = data.player_a;
  const pB = data.player_b;
  const isAWinner = data.winner === 'player_a';
  const isBWinner = data.winner === 'player_b';

  const formatPlayerCard = (p, isWinner) => {
    const winBadge = isWinner ? `
      <div style="background:linear-gradient(135deg, #10b981, #059669); color:#ffffff; font-weight:800; font-size:0.75rem; border-radius:6px; padding:3px 8px; margin-bottom:8px; display:inline-flex; align-items:center; gap:4px; box-shadow:0 2px 8px rgba(16,185,129,0.3);">
        <span>👑 SCELTA CONSIGLIATA</span>
      </div>
    ` : `
      <div style="background:rgba(255,255,255,0.06); color:#94a3b8; font-weight:700; font-size:0.75rem; border-radius:6px; padding:3px 8px; margin-bottom:8px; display:inline-flex; align-items:center; gap:4px;">
        <span>RISERVA / IN PANCHINA</span>
      </div>
    `;

    const borderColor = isWinner ? 'rgba(16, 185, 129, 0.45)' : 'rgba(255,255,255,0.1)';
    const bgColor = isWinner ? 'rgba(16, 185, 129, 0.08)' : 'rgba(255,255,255,0.02)';

    return `
      <div style="background:${bgColor}; border:1.5px solid ${borderColor}; border-radius:12px; padding:14px; position:relative;">
        ${winBadge}
        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
          <img src="${p.photo || '/static/icon.svg'}" onerror="this.src='/static/icon.svg'" style="width:48px; height:48px; border-radius:50%; border:2px solid ${isWinner ? '#10b981' : '#64748b'}; object-fit:cover; background:rgba(0,0,0,0.3);" />
          <div>
            <div style="font-weight:900; font-size:1.02rem; color:#ffffff;">${p.name}</div>
            <div style="font-size:0.78rem; color:var(--text-muted);">${p.team_full || p.team} • Ruolo <strong>${p.role}</strong></div>
          </div>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; background:rgba(0,0,0,0.25); border-radius:8px; padding:8px 10px; font-size:0.8rem;">
          <div>
            <span style="color:var(--text-muted); font-size:0.7rem; display:block;">PUNTEGGIO AI:</span>
            <strong style="color:${isWinner ? '#34d399' : '#f8fafc'}; font-size:0.95rem;">★ ${p.score}</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); font-size:0.7rem; display:block;">FANTAVOTO ATTESO:</span>
            <strong style="color:#f59e0b; font-size:0.95rem;">${p.expected_fantavoto || '-'} pt</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); font-size:0.7rem; display:block;">TITOLARITÀ:</span>
            <strong style="color:#38bdf8;">${p.titolarita_pct || 70}%</strong>
          </div>
          <div>
            <span style="color:var(--text-muted); font-size:0.7rem; display:block;">PARTITA:</span>
            <span style="font-size:0.75rem; color:#e2e8f0;">${p.is_home ? 'Casa 🏠' : 'Trasferta ✈️'} vs ${p.opponent_name || p.opponent || '-'}</span>
          </div>
        </div>
      </div>
    `;
  };

  container.innerHTML = `
    <!-- Winner Headline Banner -->
    <div style="background:linear-gradient(135deg, rgba(16, 185, 129, 0.2), rgba(139, 92, 246, 0.2)); border:1.5px solid rgba(16, 185, 129, 0.4); border-radius:12px; padding:14px 16px; margin-bottom:14px; text-align:center;">
      <div style="font-size:1.15rem; font-weight:900; color:#34d399; margin-bottom:4px;">
        ${data.headline}
      </div>
      <div style="font-size:0.82rem; color:#cbd5e1;">
        Scarto calcolato: <strong style="color:#ffffff;">+${data.diff_score} pt</strong> sull'indice di schierabilità • <strong style="color:#f59e0b;">+${data.diff_fantavoto}</strong> di fantavoto atteso
      </div>
    </div>

    <!-- Side by Side Cards -->
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:14px;">
      ${formatPlayerCard(pA, isAWinner)}
      ${formatPlayerCard(pB, isBWinner)}
    </div>

    <!-- AI Narrative Reasoning Block -->
    <div style="background:rgba(139, 92, 246, 0.1); border:1px solid rgba(139, 92, 246, 0.3); border-radius:12px; padding:14px 16px; margin-bottom:14px;">
      <div style="font-size:0.88rem; font-weight:800; color:#c084fc; margin-bottom:6px; display:flex; align-items:center; gap:6px;">
        <span>🧠 Motivazione Tattica & Analisi AI:</span>
      </div>
      <div style="font-size:0.85rem; color:#f1f5f9; line-height:1.55;">
        ${data.ai_narrative}
      </div>
    </div>

    <!-- Factor by Factor Comparative Table -->
    <div style="background:rgba(0,0,0,0.25); border:1px solid rgba(255,255,255,0.08); border-radius:12px; padding:12px 14px;">
      <div style="font-size:0.85rem; font-weight:800; color:#e2e8f0; margin-bottom:10px; display:flex; align-items:center; gap:6px;">
        <span>📊 Confronto Dettagliato dei Fattori:</span>
      </div>
      <div style="display:flex; flex-direction:column; gap:8px;">
        ${(data.factors || []).map(f => {
          const aFav = (isAWinner && f.advantage === 'starter') || (!isAWinner && f.advantage === 'benched');
          const bFav = (!isAWinner && f.advantage === 'starter') || (isAWinner && f.advantage === 'benched');
          
          const aVal = isAWinner ? f.starter_val : f.benched_val;
          const bVal = isAWinner ? f.benched_val : f.starter_val;

          const aBadge = aFav ? 'color:#34d399; font-weight:800; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); border-radius:6px; padding:4px 8px;' : 'color:#cbd5e1; padding:4px 8px;';
          const bBadge = bFav ? 'color:#34d399; font-weight:800; background:rgba(16,185,129,0.15); border:1px solid rgba(16,185,129,0.3); border-radius:6px; padding:4px 8px;' : 'color:#cbd5e1; padding:4px 8px;';

          return `
            <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.06); border-radius:8px; padding:8px 10px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px; flex-wrap:wrap; gap:4px;">
                <span style="font-size:0.8rem; font-weight:700; color:#94a3b8; display:flex; align-items:center; gap:5px;">
                  <span>${f.icon || '📌'}</span>
                  <span>${f.label}</span>
                </span>
                <span style="font-size:0.75rem; color:#a78bfa; font-weight:600;">${f.detail || ''}</span>
              </div>
              <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.8rem; margin-top:4px;">
                <div style="${aBadge}">
                  <span style="color:var(--text-muted); font-size:0.7rem; font-weight:600; display:block;">${pA.name}:</span>
                  ${aVal}
                </div>
                <div style="${bBadge}">
                  <span style="color:var(--text-muted); font-size:0.7rem; font-weight:600; display:block;">${pB.name}:</span>
                  ${bVal}
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;
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

let isLivePlayersSectionOpen = true;
function toggleLivePlayersSection() {
  const body = document.getElementById('livePlayersBody');
  const badge = document.getElementById('livePlayersToggleBadge');
  if (!body) return;
  isLivePlayersSectionOpen = !isLivePlayersSectionOpen;
  body.style.display = isLivePlayersSectionOpen ? 'block' : 'none';
  if (badge) badge.innerText = isLivePlayersSectionOpen ? 'Mostra Pagelle ▼' : 'Mostra Pagelle ▶';
}

let isLiveMatchesSectionOpen = true;
function toggleLiveMatchesSection() {
  const body = document.getElementById('liveMatchesBody');
  const badge = document.getElementById('liveMatchesToggleBadge');
  if (!body) return;
  isLiveMatchesSectionOpen = !isLiveMatchesSectionOpen;
  body.style.display = isLiveMatchesSectionOpen ? 'block' : 'none';
  if (badge) badge.innerText = isLiveMatchesSectionOpen ? 'Mostra Partite ▼' : 'Mostra Partite ▶';
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

let currentLiveUseActual = true;
let currentLiveMatchday = null; // Automatically defaults to current matchday in progress

function switchLiveMatchday(md) {
  currentLiveMatchday = md;

  // If switching to an upcoming/current round and filter was 'active', reset to 'starters' so list isn't empty
  if (currentLiveFilter === 'active') {
    currentLiveFilter = 'starters';
    document.querySelectorAll('[data-livefilter]').forEach(btn => {
      btn.classList.toggle('active', btn.getAttribute('data-livefilter') === 'starters');
    });
  }

  // Immediate visual feedback in both player and matches containers
  const container = document.getElementById('livePlayersListContainer');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding:32px; color:var(--text-muted);"><span class="live-dot" style="margin-right:8px;"></span>Caricamento dati ${md}ª Giornata in corso...</div>`;
  }
  const matchesContainer = document.getElementById('liveMatchesListContainer');
  if (matchesContainer) {
    matchesContainer.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);"><span class="live-dot" style="margin-right:8px;"></span>Aggiornamento 10 partite ${md}ª Giornata...</div>`;
  }

  showToast(`📅 Carico dati ${md}ª Giornata...`);
  loadLiveVotes();
}

async function loadLiveVotes(useActual = null) {
  if (useActual !== null) currentLiveUseActual = useActual;
  const container = document.getElementById('livePlayersListContainer');
  if (container && !container.innerHTML.includes('live-dot') && !currentLiveData) {
    container.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);"><span class="live-dot" style="margin-right:8px;"></span>Connessione al live match center...</div>`;
  }
  try {
    const mdParam = currentLiveMatchday ? `&matchday=${currentLiveMatchday}` : '';
    const res = await fetch(`/api/live/votes?use_actual=${currentLiveUseActual}${mdParam}&_t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error("Errore nel recupero dei voti live");
    const data = await res.json();
    currentLiveData = data;
    if (!currentLiveMatchday && data.current_matchday) {
      currentLiveMatchday = data.matchday || data.current_matchday;
    }
    renderLiveView(data);
    updateLiveLineupModeIndicator(data);
  } catch (err) {
    console.error("Error loading live votes:", err);
    if (container) {
      container.innerHTML = `<div style="text-align:center; padding:24px; color:#f87171;">Impossibile recuperare i voti live. Verifica la connessione e riprova.</div>`;
    }
    showToast("⚠️ Errore caricamento voti live");
  }
}

async function refreshLiveVotes(btn) {
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span style="display:inline-block;">🔄</span> Aggiorno...`;
  }
  try {
    showToast("🔄 Sincronizzo voti e formazioni live...");
    const mdParam = currentLiveMatchday ? `&matchday=${currentLiveMatchday}` : '';
    const res = await fetch(`/api/live/refresh?use_actual=${currentLiveUseActual}${mdParam}&_t=${Date.now()}`, { method: 'POST', cache: 'no-store' });
    const json = await res.json();
    if (json.success && json.data) {
      currentLiveData = json.data;
      if (!currentLiveMatchday && json.data.current_matchday) {
        currentLiveMatchday = json.data.matchday || json.data.current_matchday;
      }
      renderLiveView(json.data);
      updateLiveLineupModeIndicator(json.data);
      loadLineupRecommendation();
      showToast("⚡ Orari e voti live sincronizzati!");
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

function updateLiveLineupModeIndicator(data) {
  const lbl = document.getElementById('liveLineupModeLabel');
  const btnActual = document.getElementById('btnToggleToActual');
  const btnRec = document.getElementById('btnToggleToRecommended');
  if (!lbl) return;

  if (data.is_actual_lineup) {
    lbl.innerHTML = `🟢 Titolari: <strong>Formazione Reale Schierata</strong> (${data.actual_formation || '11 Titolari'})`;
    if (btnActual) btnActual.style.display = 'none';
    if (btnRec) btnRec.style.display = 'inline-block';
  } else if (data.has_actual_lineup) {
    lbl.innerHTML = `🤖 Titolari: <strong>Formazione Consigliata (IA)</strong>`;
    if (btnActual) btnActual.style.display = 'inline-block';
    if (btnRec) btnRec.style.display = 'none';
  } else {
    lbl.innerHTML = `🤖 Titolari: <strong>Formazione Consigliata (IA)</strong> <span style="font-size:0.7rem; color:var(--text-muted);">(Carica screenshot in Schiera per la tua formazione reale)</span>`;
    if (btnActual) btnActual.style.display = 'none';
    if (btnRec) btnRec.style.display = 'none';
  }
}

function toggleLiveLineupMode(useActual) {
  loadLiveVotes(useActual);
  showToast(useActual ? "🟢 Visualizzo la tua Formazione Reale Schierata!" : "🤖 Visualizzo la Formazione Consigliata dall'IA!");
}

function renderLiveView(data) {
  if (!data) return;
  const summary = data.summary || {};
  const retro = data.ai_retrospective || {};

  // Dynamic Section Titles for Players and Matches
  const matchesTitle = document.getElementById('liveMatchesSectionTitle');
  if (matchesTitle && data.all_matches_title) {
    matchesTitle.innerText = data.all_matches_title;
  }
  const playersTitle = document.getElementById('livePlayersSectionTitle');
  if (playersTitle && data.players_title) {
    playersTitle.innerText = `📊 ${data.players_title}`;
  }
  const notice = document.getElementById('liveMatchdayNotice');
  if (notice && data.matchday) {
    if (data.matchday < (data.current_matchday || 7)) {
      notice.innerHTML = `🏁 ${data.matchday}ª Giornata (Referti & Voti Ufficiali Fantacalcio)`;
    } else {
      notice.innerHTML = `🟢 ${data.matchday}ª Giornata (${data.matchday_label || 'In Svolgimento • Live Match Center'})`;
    }
  }

  const liveSegmentsContainer = document.getElementById('liveMatchdaySegments');
  if (liveSegmentsContainer && data.available_matchdays) {
    liveSegmentsContainer.innerHTML = data.available_matchdays.map(m => {
      const isCur = (m === data.current_matchday);
      const isSel = (m === data.matchday);
      const label = isCur ? `${m}ª Giornata 🟢` : `${m}ª Giornata`;
      return `<button class="segment-btn ${isSel ? 'active' : ''}" onclick="switchLiveMatchday(${m})">${label}</button>`;
    }).join('');
  }

  // Header status badge
  const statusBadge = document.getElementById('liveStatusBadge');
  if (statusBadge) {
    if (summary.is_pre_match) {
      statusBadge.className = 'badge-status badge-warning';
      statusBadge.innerText = '⏳ In attesa del 1° match';
    } else if (summary.live_matches > 0 || summary.live_players > 0) {
      statusBadge.className = 'badge-status badge-danger';
      statusBadge.innerHTML = '<span class="live-dot" style="margin-right:4px;"></span> LIVE in Corso 🔴';
    } else if (summary.completed_matches > 0 && summary.upcoming_matches > 0) {
      statusBadge.className = 'badge-status badge-warning';
      statusBadge.innerHTML = `⚡ In Svolgimento (${summary.completed_matches}/10 concluse)`;
    } else {
      statusBadge.className = 'badge-status badge-secondary';
      statusBadge.innerText = '🏁 Tutte le Partite Concluse';
    }
  }

  // Header last update & dual source badge
  const dualSourceBadge = document.getElementById('liveDualSourceBadge');
  if (dualSourceBadge) {
    dualSourceBadge.innerText = summary.verification_badge || '✅ Doppia Fonte: Fantacalcio + ESPN';
  }
  const lastUp = document.getElementById('liveLastUpdateBadge');
  if (lastUp) lastUp.innerText = `Aggiornato: ${data.last_update || '--:--'}`;

  // Big score & delta
  const scoreDisp = document.getElementById('liveTotalScoreDisplay');
  if (scoreDisp) {
    if (summary.is_pre_match) {
      scoreDisp.innerHTML = `0.0 <span style="font-size:0.85rem; color:var(--text-muted);">pt</span>`;
    } else if (summary.completed_starters > 0 && summary.live_starters > 0) {
      scoreDisp.innerHTML = `${summary.total_live_score} <span style="font-size:0.85rem; color:var(--text-muted);">pt (${summary.completed_starters} a voto, ${summary.live_starters} in campo)</span>`;
    } else if (summary.completed_starters > 0) {
      scoreDisp.innerHTML = `${summary.total_live_score} <span style="font-size:0.85rem; color:var(--text-muted);">pt (${summary.completed_starters}/11 a voto)</span>`;
    } else if (summary.live_starters > 0) {
      scoreDisp.innerHTML = `${summary.total_live_score} <span style="font-size:0.85rem; color:#ef4444; font-weight:700;">pt (${summary.live_starters} in campo)</span>`;
    } else {
      scoreDisp.innerHTML = `0.0 <span style="font-size:0.85rem; color:var(--text-muted);">pt</span>`;
    }
  }

  const goalsDisp = document.getElementById('liveGoalsDisplay');
  if (goalsDisp) goalsDisp.innerText = summary.goals_tier_desc || '0 Gol';

  const deltaDisp = document.getElementById('liveDeltaScoreDisplay');
  if (deltaDisp) {
    if (summary.is_pre_match) {
      deltaDisp.innerHTML = `<span style="color:#60a5fa;">In attesa</span> <span style="font-size:0.82rem; color:var(--text-muted);">(${summary.total_expected_score} pt previsti)</span>`;
    } else if (summary.completed_starters === 0) {
      deltaDisp.innerHTML = `<span style="color:#ef4444; font-weight:800;">${summary.team_delta_formatted}</span> <span style="font-size:0.82rem; color:var(--text-muted);">(Proiezione: ${summary.projected_final_score || summary.total_expected_score} pt)</span>`;
    } else {
      const dVal = summary.team_delta || 0;
      deltaDisp.innerHTML = `<span style="color:${dVal >= 0 ? '#34d399' : '#f59e0b'}; font-weight:800;">${summary.team_delta_formatted}</span> <span style="font-size:0.82rem; color:var(--text-muted);">(Proiezione: ${summary.projected_final_score} pt)</span>`;
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

  // Live Matches badge
  const matchSumBadge = document.getElementById('liveMatchesSummaryBadge');
  if (matchSumBadge) {
    matchSumBadge.innerText = `${summary.live_matches || 0} Live • ${summary.upcoming_matches || 0} In Programma`;
    matchSumBadge.className = (summary.live_matches > 0) ? 'badge-status badge-danger' : 'badge-status badge-secondary';
  }

  // Load and render AI learning status
  loadAILearningStatus();

  // Render cards and all 10 matches
  renderLivePlayerCards(data);
  renderLiveMatches(data.all_matches || []);
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
      <span class="badge-status badge-secondary" title="Bonus punti per chi gioca in casa (ridotto per evitare illusioni)">🏠 Fattore Campo: ${w.home_bonus_weight} pt</span>
      <span class="badge-status badge-secondary" title="Severità con cui l'AI penalizza le partite contro difese chiuse">📈 Pendenza Matchup: ${w.matchup_difficulty_slope}</span>
      <span class="badge-status badge-secondary" title="Moltiplicatore sui gol attesi per attaccanti impegnati fuori casa">⚽ Attacco Trasf.: ${w.att_base_multiplier}</span>
      <span class="badge-status badge-secondary" title="Penalità su difensori fallosi per prevenire malus cartellino/autogol">🛡️ Rischio Difesa: x${w.def_risk_penalty || 1.45}</span>
      <span class="badge-status badge-secondary" title="Moltiplicatore voto puro per stimare la media reparto difensivo">📊 Mod. Difesa: x${w.def_base_multiplier}</span>
      <span class="badge-status badge-secondary" title="Buffer di sicurezza di 0.5 pt prima di proiettare bonus modificatore +3/+6">🛡️ Buffer Mod.: ${w.mod_safety_margin || 0.50} pt</span>
      <span class="badge-status badge-secondary" title="Incremento per i battitori designati di corner e punizioni da fermo">📐 Piazzati/Corner: +${w.corner_specialty_weight || 2.5} pt</span>
      <span class="badge-status badge-secondary" title="Peso dei gol attesi su azione pura senza penalty (Opta/Understat)">🎯 npxG Azione: x${w.npxg_weight || 5.5}</span>
      <span class="badge-status badge-secondary" title="Shot-Creating Actions: occasioni create da assist e passaggi chiave">👟 SCA Regia: x${w.sca_weight || 1.8}</span>
      <span class="badge-status badge-secondary" title="Smorzamento fatica per impegni infrasettimanali Champions/Europa League">⚖️ Turnover Coppe: ${w.turnover_damp_factor || 0.88}x</span>
      <span class="badge-status badge-secondary" title="Penalità disciplinare basata sulla severità dell'arbitro designato (AIA)">🟨 Rischio Arbitro: ${w.referee_strictness_weight || 1.35}x</span>
      <span class="badge-status badge-success" title="Mean Absolute Error: scarto medio assoluto tra fanta-voto previsto e reale (minore = più preciso)">🎯 MAE Globale: ${status.overall_mae} pt</span>
    `;
  }

  // Render Concise Real Observations Report
  const reportList = document.getElementById('aiObservationsReportList');
  if (reportList) {
    const report = status.last_report;
    if (report && report.observations && report.observations.length > 0) {
      reportList.innerHTML = report.observations.map(obs => `
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="color:#10b981; font-weight:800; font-size:0.9rem; line-height:1.2;">•</span>
          <div>${obs.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')}</div>
        </div>
      `).join('');
    } else {
      reportList.innerHTML = `
        <div style="display:flex; align-items:flex-start; gap:8px;">
          <span style="color:#10b981; font-weight:800; font-size:0.9rem; line-height:1.2;">•</span>
          <div><strong>Calibrazione Reattiva Attiva:</strong> Il sistema calibra dinamicamente i parametri a fronte dei referti della 6ª Giornata (soglia cauta rimossa, correzione gap -13.5 pt).</div>
        </div>
      `;
    }
  }

  const autoPill = document.getElementById('aiAutoStatusPill');
  if (autoPill) {
    autoPill.innerText = `🟢 Calibrazione Reattiva (Soglia Cauta Rimossa)`;
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

  let allPlayers = data.players || [];
  let players = allPlayers;
  if (currentLiveFilter === 'starters') {
    players = players.filter(p => p.is_starter);
  } else if (currentLiveFilter === 'active') {
    players = players.filter(p => p.match_status === 'TERMINATA' || p.match_status === 'IN CORSO');
  }

  if (countBadge) countBadge.innerText = `${players.length} Calciatori`;

  if (players.length === 0) {
    const emptyMsg = currentLiveFilter === 'active' 
      ? '⏳ Nessun calciatore ha ancora una partita in corso o conclusa.'
      : 'Nessun calciatore corrispondente al filtro selezionato.';
    container.innerHTML = `<div style="text-align:center; padding:24px; color:var(--text-muted);">${emptyMsg}</div>`;
    return;
  }

  function renderSingleRow(p) {
    let rowClass = p.is_starter ? 'row-starter' : 'row-bench';
    if (p.is_live_grade || p.match_status === 'IN CORSO') rowClass += ' row-live';

    // Event badges mini
    let eventsHtml = '';
    if (p.bonus_malus && p.bonus_malus.length > 0) {
      eventsHtml = p.bonus_malus.map(b => {
        let label = b.label || '';
        let icon = b.icon || '';
        return `<span class="event-badge-mini" title="${label}">${icon} ${label}</span>`;
      }).join(' ');
    }

    // Dynamic substitution check from verified match events
    if (p.is_sub_out && (p.match_status === 'IN CORSO' || p.match_status === 'TERMINATA')) {
      if (!eventsHtml.includes('⬇️')) {
        eventsHtml += ` <span class="event-badge-mini" title="Sostituito a gara in corso">⬇️ Sost.</span>`;
      }
    } else if (p.is_sub_in && (p.match_status === 'IN CORSO' || p.match_status === 'TERMINATA')) {
      if (!eventsHtml.includes('⬆️')) {
        eventsHtml += ` <span class="event-badge-mini" title="Subentrato a gara in corso">⬆️ Sub.</span>`;
      }
    }

    // Subtitle line (match info & time)
    let subLineHtml = '';
    if (p.match_status === 'IN CORSO') {
      subLineHtml = `<span style="color:#ef4444; font-weight:800;"><span class="live-dot" style="width:6px; height:6px; display:inline-block; margin-right:3px;"></span>LIVE ${p.match_min || '1°T'}</span> • ${p.match_info || ''}`;
    } else if (p.match_status === 'TERMINATA') {
      subLineHtml = `<span>${p.match_info || ''}</span> • <span style="color:#94a3b8;">Finale 🏁</span>`;
    } else {
      subLineHtml = `<span style="color:#fbbf24;">⏳ ${p.match_min || 'Prossimo turno'}</span> • ${p.match_info || ''}`;
    }

    // Score pill dual
    let baseDisp = p.base_grade !== null && p.base_grade !== undefined ? p.base_grade : '-';
    let fvDisp = '-';
    let fvClass = 'fv-none';

    if (p.real_fantavoto !== null && p.real_fantavoto !== undefined) {
      fvDisp = p.real_fantavoto;
      if (p.is_live_grade) {
        fvClass = 'fv-live';
      } else if (p.real_fantavoto >= 6.5) {
        fvClass = 'fv-good';
      } else if (p.real_fantavoto === 6.0) {
        fvClass = 'fv-avg';
      } else if (p.real_fantavoto >= 5.0) {
        fvClass = 'fv-warn';
      } else {
        fvClass = 'fv-bad';
      }
    } else if (p.match_status === 'IN CORSO') {
      fvDisp = 'LIVE';
      fvClass = 'fv-live';
    } else if (p.match_status === 'TERMINATA') {
      baseDisp = 's.v.';
      fvDisp = 's.v.';
      fvClass = 'fv-none';
    } else {
      baseDisp = 'Exp';
      const expNum = (p.expected_fantavoto !== undefined && p.expected_fantavoto !== null) ? Number(p.expected_fantavoto) : null;
      if (expNum !== null) {
        if (p.is_injured || expNum === 0) {
          baseDisp = '🚨';
          fvDisp = 'OUT';
          fvClass = 'fv-bad';
        } else {
          fvDisp = expNum.toFixed(1);
          fvClass = expNum >= 6.5 ? 'fv-good' : (expNum >= 6.0 ? 'fv-avg' : 'fv-warn');
        }
      }
    }

    return `
      <div class="live-player-row-compact ${rowClass}" onclick='openPlayerModal(${JSON.stringify(p).replace(/'/g, "&#39;")})'>
        <span class="role-circle role-${p.role}">${p.role}</span>
        
        <div class="player-row-info">
          <div class="player-row-name-line">
            <span class="player-row-name">${p.name}</span>
            <span class="player-row-team">${p.team}</span>
            ${eventsHtml ? `<div class="player-events-inline">${eventsHtml}</div>` : ''}
          </div>
          <div class="player-row-sub-line">
            ${subLineHtml}
          </div>
        </div>

        <div class="score-pill-container">
          <div class="score-pill-dual">
            <div class="score-pill-top">${baseDisp}</div>
            <div class="score-pill-bottom ${fvClass}">${fvDisp}</div>
          </div>
          <span class="player-row-chevron">›</span>
        </div>
      </div>
    `;
  }

  // If showing "all" filter, group into Starters and Bench headers
  if (currentLiveFilter === 'all') {
    const startersList = players.filter(p => p.is_starter);
    const benchList = players.filter(p => !p.is_starter);
    
    container.innerHTML = `
      <div class="live-section-divider">⭐ Titolari Schierati (${startersList.length})</div>
      ${startersList.map(renderSingleRow).join('')}
      <div class="live-section-divider" style="margin-top:14px;">🔄 Panchina (${benchList.length})</div>
      ${benchList.map(renderSingleRow).join('')}
    `;
  } else {
    container.innerHTML = players.map(renderSingleRow).join('');
  }
}

// --- SERIE A LIVE MATCH CENTER (TUTTE LE 10 PARTITE) ---
function renderLiveMatches(matches) {
  const container = document.getElementById('liveMatchesListContainer');
  if (!container) return;

  if (!matches || matches.length === 0) {
    container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Nessuna partita disponibile per questa giornata.</div>`;
    return;
  }

  // Build set of own player names (lowercased) for highlighting
  const myPlayerNames = new Set();
  if (currentLiveData && currentLiveData.players) {
    currentLiveData.players.forEach(p => {
      if (p.name) myPlayerNames.add(p.name.toLowerCase().trim());
    });
  }

  container.innerHTML = matches.map(m => {
    const isLive = m.is_live;
    const isFin = m.is_finished;

    let cardBorder = 'border-color: rgba(255,255,255,0.08);';
    if (isLive) cardBorder = 'border-color: rgba(239, 68, 68, 0.45); background: rgba(239, 68, 68, 0.04); box-shadow: 0 0 15px rgba(239, 68, 68, 0.15);';
    else if (isFin) cardBorder = 'border-color: rgba(148, 163, 184, 0.2);';

    // My players in this match
    let myPlayersHtml = '';
    if (m.my_players && m.my_players.length > 0) {
      const tags = m.my_players.map(p => {
        const fantaLabel = p.fanta_status || (p.is_starter ? 'Schierato' : 'Panchina');
        const pitchLabel = p.serie_a_status ? ` • <span style="opacity:0.85; font-size:0.68rem; font-weight:600;">${p.serie_a_status}</span>` : '';
        const badgeColor = p.is_starter ? 'rgba(16, 185, 129, 0.25)' : 'rgba(148, 163, 184, 0.15)';
        const textColor = p.is_starter ? '#34d399' : '#94a3b8';
        return `
          <span style="display:inline-flex; align-items:center; gap:4px; background:${badgeColor}; color:${textColor}; padding:2px 8px; border-radius:6px; font-size:0.75rem; font-weight:700;">
            ⭐ ${p.name} (${p.role}) • <span style="font-size:0.7rem; font-weight:800; text-transform:uppercase;">${fantaLabel}</span>${pitchLabel}
          </span>
        `;
      }).join(' ');

      myPlayersHtml = `
        <div style="background:rgba(16, 185, 129, 0.06); border:1px solid rgba(16, 185, 129, 0.2); border-radius:8px; padding:6px 10px; margin-top:8px;">
          <div style="font-size:0.7rem; color:#34d399; font-weight:800; text-transform:uppercase; margin-bottom:4px;">
            I Tuoi Calciatori in questa Gara:
          </div>
          <div style="display:flex; flex-wrap:wrap; gap:6px;">
            ${tags}
          </div>
        </div>
      `;
    }

    // Events (goals, assists, cards, subs) categorized & user players highlighted
    let eventsHtml = '';
    if ((isLive || isFin) && m.events && m.events.length > 0) {
      const goalsAndKey = [];
      const cards = [];
      const subs = [];

      // Helper to test if a player belongs to the user with token matching
      function getTokens(s) {
        return (s || '').toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(Boolean);
      }
      function matchesPlayerName(evName, myName) {
        if (!evName || !myName) return false;
        const e1 = evName.toLowerCase().trim();
        const m1 = myName.toLowerCase().trim();
        if (e1 === m1 || e1.includes(m1) || m1.includes(e1)) return true;
        const tE = getTokens(e1);
        const tM = getTokens(m1);
        if (tE.length > 0 && tM.length > 0) {
          const common = tE.filter(t => t.length >= 4 && tM.includes(t));
          if (common.length > 0) return true;
          const lastE = tE[0].length >= 4 ? tE[0] : tE[tE.length - 1];
          const lastM = tM[tM.length - 1].length >= 4 ? tM[tM.length - 1] : tM[0];
          if (lastE && lastM && lastE === lastM) return true;
        }
        return false;
      }

      function checkIsMyPlayer(name, outName, assistName) {
        return Array.from(myPlayerNames).some(myName => {
          if (!myName) return false;
          return matchesPlayerName(name, myName) ||
                 matchesPlayerName(outName, myName) ||
                 matchesPlayerName(assistName, myName);
        });
      }

      // Filter and categorize
      m.events.forEach(ev => {
        const isMy = ev.is_my_player || ev.is_my_assist || ev.is_my_sub_out || checkIsMyPlayer(ev.player_name, ev.player_out, ev.assist_player);
        const item = { ...ev, isMyPlayer: isMy };

        if (ev.type === 'goal' || ev.type === 'penalty' || ev.type === 'own_goal' || ev.type === 'potm') {
          goalsAndKey.push(item);
        } else if (ev.type === 'assist') {
          // If preceding goal already lists this assist, skip standalone assist unless it's user's player
          const alreadyLinked = goalsAndKey.some(g => g.assist_player && matchesPlayerName(g.assist_player, ev.player_name));
          if (!alreadyLinked || isMy) {
            goalsAndKey.push(item);
          }
        } else if (ev.type === 'card' || ev.type === 'card_yellow' || ev.type === 'card_red') {
          cards.push(item);
        } else if (ev.type === 'sub') {
          subs.push(item);
        } else if (ev.type === 'conceded') {
          if (isMy) {
            goalsAndKey.push(item);
          }
        }
      });

      function renderChip(ev) {
        const minText = ev.minute ? `<span style="opacity:0.75; font-size:0.7rem; margin-right:2px;">${ev.minute}</span>` : '';
        let chipBg = 'background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:var(--text-secondary);';
        let starBadge = '';
        if (ev.isMyPlayer) {
          chipBg = 'background:linear-gradient(135deg, rgba(245, 158, 11, 0.22), rgba(239, 68, 68, 0.22)); border:1px solid #f59e0b; color:#fbbf24; font-weight:800; box-shadow:0 0 8px rgba(245, 158, 11, 0.3);';
          starBadge = '⭐ ';
        }

        let label = '';
        if (ev.type === 'goal') {
          let assistHighlight = (ev.is_my_assist || checkIsMyPlayer(ev.assist_player, ''));
          let assistPart = ev.assist_player 
            ? ` <span style="color:${assistHighlight ? '#fbbf24; font-weight:800;' : '#a7f3d0; font-weight:600;'}; font-size:0.7rem;">(👟 Assist: ${assistHighlight ? '⭐ ' : ''}${ev.assist_player})</span>` 
            : '';
          label = `${ev.icon || '⚽'} ${minText}<strong>${ev.player_name}</strong>${assistPart}`;
        } else if (ev.type === 'own_goal') {
          label = `${ev.icon || '🔴'} ${minText}<strong>${ev.player_name}</strong> <span style="color:#f87171; font-size:0.7rem; font-weight:700;">(Autogol)</span>`;
        } else if (ev.type === 'card') {
          let cardColor = ev.icon === '🟥' ? '#f87171' : '#fbbf24';
          label = `${ev.icon || '🟨'} ${minText}<strong style="color:${ev.isMyPlayer ? '#fbbf24' : cardColor};">${ev.player_name}</strong>`;
        } else if (ev.type === 'sub') {
          let outIsMy = ev.is_my_sub_out || checkIsMyPlayer(ev.player_out, '');
          let inIsMy = ev.is_my_player || checkIsMyPlayer(ev.player_name, '');
          let inName = inIsMy ? `<strong style="color:#fbbf24;">${ev.player_name}</strong>` : `<strong>${ev.player_name}</strong>`;
          let outPart = ev.player_out 
            ? ` <span style="opacity:0.85; font-size:0.7rem; color:${outIsMy ? '#fbbf24; font-weight:700;' : 'inherit'};">(esce ${outIsMy ? '⭐ ' : ''}${ev.player_out})</span>` 
            : '';
          label = `${ev.icon || '⇄'} ${minText}${inName}${outPart}`;
        } else if (ev.type === 'assist') {
          label = `${ev.icon || '👟'} ${minText}<strong>${ev.player_name}</strong> <span style="opacity:0.8; font-size:0.7rem;">(Assist)</span>`;
        } else if (ev.type === 'conceded') {
          label = `${ev.icon || '🧤'} ${minText}<strong style="color:#fbbf24;">${ev.player_name}</strong> <span style="opacity:0.9; font-size:0.7rem; color:#f87171; font-weight:700;">(Gol subito -1.0)</span>`;
        } else {
          label = `${ev.icon || '•'} ${minText}<strong>${ev.player_name}</strong>`;
        }

        const verifiedTag = (ev.sources && ev.sources.length > 1) || (ev.verification_badge && ev.verification_badge.includes('Doppia'))
          ? `<span title="Convalidato da Fantacalcio.it ed ESPN Scoreboard" style="color:#60a5fa; font-size:0.68rem; margin-left:3px; font-weight:800;">✓</span>`
          : '';

        return `
          <span style="${chipBg} padding:2px 7px; border-radius:5px; font-size:0.73rem; display:inline-flex; align-items:center; gap:3px;">
            ${starBadge}${label}${verifiedTag}
          </span>
        `;
      }

      const goalsChips = goalsAndKey.map(renderChip).join(' ');
      const cardsChips = cards.map(renderChip).join(' ');

      // For subs: prioritize my players, then regular
      const mySubs = subs.filter(s => s.isMyPlayer);
      const otherSubs = subs.filter(s => !s.isMyPlayer);
      let subsHtml = '';
      if (subs.length > 0) {
        if (subs.length <= 4) {
          subsHtml = `
            <div style="margin-top:6px;">
              <div style="font-size:0.67rem; color:#94a3b8; font-weight:800; text-transform:uppercase; margin-bottom:3px;">
                ⇄ Sostituzioni (${subs.length}):
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:5px;">
                ${subs.map(renderChip).join(' ')}
              </div>
            </div>
          `;
        } else {
          subsHtml = `
            <div style="margin-top:6px;">
              ${mySubs.length > 0 ? `
                <div style="display:flex; flex-wrap:wrap; gap:5px; margin-bottom:4px;">
                  ${mySubs.map(renderChip).join(' ')}
                </div>
              ` : ''}
              <details style="font-size:0.72rem; color:var(--text-muted);">
                <summary style="cursor:pointer; font-size:0.68rem; color:#94a3b8; font-weight:800; text-transform:uppercase; user-select:none; padding:2px 0;">
                  ⇄ Tutte le Sostituzioni (${subs.length}) ▾
                </summary>
                <div style="display:flex; flex-wrap:wrap; gap:5px; margin-top:5px; padding-top:4px; border-top:1px dashed rgba(255,255,255,0.06);">
                  ${otherSubs.map(renderChip).join(' ')}
                </div>
              </details>
            </div>
          `;
        }
      }

      eventsHtml = `
        <div style="background:rgba(0,0,0,0.22); border-radius:8px; padding:7px 10px; margin-top:8px;">
          ${goalsAndKey.length > 0 ? `
            <div style="margin-bottom:6px;">
              <div style="font-size:0.68rem; color:#34d399; font-weight:800; text-transform:uppercase; margin-bottom:3px; letter-spacing:0.4px;">
                ⚽ Gol & Marcatori:
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:5px;">
                ${goalsChips}
              </div>
            </div>
          ` : ''}

          ${cards.length > 0 ? `
            <div style="margin-bottom:6px;">
              <div style="font-size:0.68rem; color:#fbbf24; font-weight:800; text-transform:uppercase; margin-bottom:3px; letter-spacing:0.4px;">
                🟨 Cartellini & Provvedimenti:
              </div>
              <div style="display:flex; flex-wrap:wrap; gap:5px;">
                ${cardsChips}
              </div>
            </div>
          ` : ''}

          ${subsHtml}
        </div>
      `;
    } else if (isLive || isFin) {
      eventsHtml = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:6px; padding:4px 0;">📊 Statistiche ed eventi in aggiornamento dai referti ufficiali...</div>`;
    } else {
      eventsHtml = `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:6px; padding:4px 0;">⏳ Gara in programma ${m.min || ''}. Eventi live e formazioni al calcio d'inizio.</div>`;
    }

    const officialBadge = m.is_official_lineup 
      ? `<span class="badge-status badge-success" style="font-size:0.68rem; padding:1px 6px;">🟢 UFFICIALI</span>`
      : '';
    const dualBadge = `<span class="badge-status" style="font-size:0.68rem; padding:1px 6px; background:rgba(59, 130, 246, 0.15); color:#60a5fa; border:1px solid rgba(59, 130, 246, 0.3);">✅ Fantacalcio + ESPN</span>`;

    return `
      <div class="card" style="padding:12px 14px; margin-bottom:10px; ${cardBorder}">
        <!-- Top row: Status, min, timing -->
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px; font-size:0.78rem; flex-wrap:wrap; gap:4px;">
          <div style="display:flex; align-items:center; gap:6px; flex-wrap:wrap;">
            <span class="badge-status ${m.status_class || 'badge-secondary'}" style="font-size:0.72rem;">${m.status_badge || '⏳'}</span>
            ${officialBadge}
            ${dualBadge}
          </div>
          <div style="color:var(--text-muted); font-size:0.75rem;">
            📅 ${m.date_str} • 🏟️ ${m.stadium || 'Serie A'}
          </div>
        </div>

        <!-- Middle row: Big Teams & Real Score -->
        <div style="display:flex; justify-content:space-between; align-items:center; padding:6px 0; border-top:1px solid rgba(255,255,255,0.04); border-bottom:1px solid rgba(255,255,255,0.04);">
          <!-- Home Team -->
          <div style="display:flex; align-items:center; gap:8px; width:40%;">
            <div style="font-weight:800; font-size:1.05rem; color:#ffffff;">${m.home_team}</div>
          </div>

          <!-- Score Box -->
          <div style="display:flex; flex-direction:column; align-items:center; width:20%;">
            ${(m.is_live || m.is_finished) ? `
              <div style="font-size:1.35rem; font-weight:900; color:${isLive ? '#ef4444' : '#34d399'}; letter-spacing:2px;">
                ${m.home_score} - ${m.away_score}
              </div>
              <div style="font-size:0.7rem; color:${isLive ? '#ef4444' : 'var(--text-muted)'}; font-weight:700;">
                ${isLive ? `<span class="live-dot" style="margin-right:3px;"></span>${m.min}` : 'FINALE'}
              </div>
            ` : `
              <div style="font-size:1.05rem; font-weight:800; color:var(--text-muted);">VS</div>
              <div style="font-size:0.7rem; color:var(--text-muted);">${m.min || 'In programma'}</div>
            `}
          </div>

          <!-- Away Team -->
          <div style="display:flex; align-items:center; justify-content:flex-end; gap:8px; width:40%;">
            <div style="font-weight:800; font-size:1.05rem; color:#ffffff; text-align:right;">${m.away_team}</div>
          </div>
        </div>

        <!-- Events row (goals, cards, assists) -->
        ${eventsHtml}

        <!-- Bottom row: My players involved -->
        ${myPlayersHtml}
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
let currentProbabiliMatchday = 7;

function switchProbabiliMatchday(md) {
  currentProbabiliMatchday = md;
  const btn6 = document.getElementById('btnMd6Probabili');
  const btn7 = document.getElementById('btnMd7Probabili');
  const banner = document.getElementById('probabiliMatchdayBannerText');
  if (btn6 && btn7) {
    if (md === 6) {
      btn6.classList.add('active');
      btn7.classList.remove('active');
      if (banner) banner.innerText = `🏁 6ª Giornata (Passata / Referti Ufficiali Fantacalcio)`;
    } else {
      btn7.classList.add('active');
      btn6.classList.remove('active');
      if (banner) banner.innerText = `🟢 7ª Giornata: Primo anticipo venerdì 16 ottobre ore 20:45 (Frosinone - Sassuolo)`;
    }
  }
  loadFixtures();
}

async function loadFixtures() {
  try {
    // Ensure squad data is available so player highlighting always works
    if (!currentSquadData && (!currentLineupData || !currentLineupData.starters)) {
      try {
        const sqRes = await fetch('/api/squad');
        if (sqRes.ok) currentSquadData = await sqRes.json();
      } catch (e) {}
    }
    const res = await fetch(`/api/fixtures?matchday=${currentProbabiliMatchday}&_t=${Date.now()}`, { cache: 'no-store' });
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

  function formatLineup(lineupList, percentagesMap, isOfficialLineup = false) {
    if (!lineupList || lineupList.length === 0) {
      return `<div style="color:var(--text-muted); font-size:0.8rem;">Formazione non ancora disponibile</div>`;
    }

    return lineupList.map(pName => {
      const pInfo = percentagesMap ? percentagesMap[pName.toLowerCase()] : null;
      const role = pInfo?.role || 'C';
      const isOfficial = isOfficialLineup || pInfo?.is_official;
      const pct = isOfficial ? 100 : (pInfo?.percentage || 90);
      const isMine = isUserPlayer(pName);

      if (isMine) {
        const officialBadge = isOfficial ? ' ✅ Ufficiale' : '';
        return `<span class="badge-my-starter" title="⭐ Giocatore nella tua rosa! ${isOfficial ? 'Titolare ufficiale confermato!' : ''}">⭐ ${pName} (${pct}%${officialBadge})</span>`;
      } else {
        const officialBadge = isOfficial ? ' <span style="color:#10b981; font-size:0.7rem; font-weight:700;">(100% ✅)</span>' : '';
        const ballotStr = !officialBadge && pct < 75 ? ` <span style="color:#f59e0b; font-size:0.7rem;">(${pct}%)</span>` : officialBadge;
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
      <div class="card" style="padding:14px; margin-bottom:14px; ${m.is_official_lineup ? 'border:1px solid rgba(16,185,129,0.3); box-shadow:0 0 15px rgba(16,185,129,0.08);' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; color:var(--text-muted); margin-bottom:8px; flex-wrap:wrap; gap:4px;">
          <span>📅 ${m.date_str} ${m.is_official_lineup ? '<span class="badge" style="background:rgba(16,185,129,0.18); color:#34d399; border:1px solid rgba(16,185,129,0.3); font-size:0.7rem; padding:2px 7px; border-radius:4px; font-weight:800; margin-left:6px;">🟢 FORMAZIONI UFFICIALI (100%)</span>' : ''}</span>
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
            ${formatLineup(m.home_lineup, m.player_percentages, m.is_official_lineup)}
          </div>
        </div>

        <!-- Complete 11 Away Lineup -->
        <div style="background:rgba(255,255,255,0.02); border-radius:10px; padding:10px; margin-bottom:10px;">
          <div style="font-size:0.75rem; font-weight:800; color:#f87171; margin-bottom:6px; text-transform:uppercase;">
            🔴 Titolari ${m.away_team} (${m.away_lineup?.length || 0}/11):
          </div>
          <div style="line-height:1.8;">
            ${formatLineup(m.away_lineup, m.player_percentages, m.is_official_lineup)}
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

// --- MODAL: BALLOTTAGGIO COMPARATIVO AI ---
function openBallottaggioModal(index) {
  if (!window.currentKeyDecisions || !window.currentKeyDecisions[index]) return;
  const decision = window.currentKeyDecisions[index];
  const dialog = document.getElementById('ballottaggioModal');
  if (!dialog) return;

  const st = decision.starter_player || {};
  const be = decision.benched_player || {};
  const comp = decision.comparison || {};

  // Title & Role
  const roleTitle = document.getElementById('balModalRoleTitle');
  const roleBadge = document.getElementById('balModalRoleBadge');
  if (roleTitle) roleTitle.innerText = `⚖️ Ballottaggio ${decision.role_label || decision.role}: ${decision.starter} vs ${decision.benched}`;
  if (roleBadge) {
    const roleIcon = decision.role === 'P' ? '🧤' : (decision.role === 'D' ? '🛡️' : (decision.role === 'C' ? '⚙️' : '🎯'));
    roleBadge.innerText = `${roleIcon} Ruolo ${decision.role_label || decision.role}`;
  }

  // Advantage banner
  const advText = document.getElementById('balModalAdvantageText');
  const advDiff = document.getElementById('balModalAdvantageDiff');
  if (advText) advText.innerText = `${decision.starter} favorito (+${decision.diff || 0} pt) su ${decision.benched}`;
  if (advDiff) advDiff.innerText = `+${decision.diff || 0} pt Vantaggio AI`;

  // Starter Card
  const stAvatar = document.getElementById('balStarterAvatar');
  const stName = document.getElementById('balStarterName');
  const stTeam = document.getElementById('balStarterTeam');
  const stScore = document.getElementById('balStarterScore');
  const stFV = document.getElementById('balStarterFV');
  const stTit = document.getElementById('balStarterTit');
  const stMatch = document.getElementById('balStarterMatch');

  if (stAvatar) stAvatar.src = st.photo || '/static/icon.svg';
  if (stName) stName.innerText = decision.starter;
  if (stTeam) stTeam.innerText = `${st.team_full || st.team || ''} • Ruolo ${st.role || decision.role}`;
  if (stScore) stScore.innerText = `★ ${decision.starter_score}`;
  if (stFV) stFV.innerText = `${st.expected_fantavoto || '-'} pt`;
  if (stTit) stTit.innerText = `${st.titolarita_pct || 70}% (${(st.super_intelligence && st.super_intelligence.consensus && st.super_intelligence.consensus.consensus_level) || 'Titolare'})`;
  if (stMatch) stMatch.innerText = `${st.is_home ? 'In Casa 🏠' : 'Trasferta ✈️'} vs ${st.opponent_name || st.opponent || '-'}`;

  const btnStProfile = document.getElementById('btnViewStarterProfile');
  if (btnStProfile) {
    btnStProfile.onclick = () => {
      closeBallottaggioModal();
      openPlayerModal(st);
    };
  }

  // Benched Card
  const beAvatar = document.getElementById('balBenchedAvatar');
  const beName = document.getElementById('balBenchedName');
  const beTeam = document.getElementById('balBenchedTeam');
  const beScore = document.getElementById('balBenchedScore');
  const beFV = document.getElementById('balBenchedFV');
  const beTit = document.getElementById('balBenchedTit');
  const beMatch = document.getElementById('balBenchedMatch');

  if (beAvatar) beAvatar.src = be.photo || '/static/icon.svg';
  if (beName) beName.innerText = decision.benched;
  if (beTeam) beTeam.innerText = `${be.team_full || be.team || ''} • Ruolo ${be.role || decision.role}`;
  if (beScore) beScore.innerText = `★ ${decision.benched_score}`;
  if (beFV) beFV.innerText = `${be.expected_fantavoto || '-'} pt`;
  if (beTit) beTit.innerText = `${be.titolarita_pct || 50}% (${(be.super_intelligence && be.super_intelligence.consensus && be.super_intelligence.consensus.consensus_level) || 'In Ballottaggio'})`;
  if (beMatch) beMatch.innerText = `${be.is_home ? 'In Casa 🏠' : 'Trasferta ✈️'} vs ${be.opponent_name || be.opponent || '-'}`;

  const btnBeProfile = document.getElementById('btnViewBenchedProfile');
  if (btnBeProfile) {
    btnBeProfile.onclick = () => {
      closeBallottaggioModal();
      openPlayerModal(be);
    };
  }

  // AI Narrative Reasoning
  const reasoningTitle = document.getElementById('balModalReasoningTitle');
  const reasoningBody = document.getElementById('balModalReasoningBody');
  if (reasoningTitle) reasoningTitle.innerText = comp.headline || `Perché l'AI sceglie ${decision.starter} rispetto a ${decision.benched}?`;
  if (reasoningBody) reasoningBody.innerText = comp.summary || decision.note;

  // Factors List
  const factorsContainer = document.getElementById('balModalFactorsList');
  if (factorsContainer) {
    const factors = comp.factors || [];
    if (factors.length === 0) {
      factorsContainer.innerHTML = `<div style="font-size:0.8rem; color:var(--text-muted);">Nessun fattore specifico da confrontare.</div>`;
    } else {
      factorsContainer.innerHTML = factors.map(f => {
        const isStWinner = f.advantage === 'starter';
        const isBeWinner = f.advantage === 'benched';
        const stStyle = isStWinner ? 'color:#34d399; font-weight:800; background:rgba(16, 185, 129, 0.15); border:1px solid rgba(16, 185, 129, 0.3); border-radius:6px; padding:2px 6px; display:inline-block;' : 'color:#cbd5e1;';
        const beStyle = isBeWinner ? 'color:#fbbf24; font-weight:800; background:rgba(245, 158, 11, 0.15); border:1px solid rgba(245, 158, 11, 0.3); border-radius:6px; padding:2px 6px; display:inline-block;' : 'color:#cbd5e1;';

        return `
          <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:10px; padding:10px 12px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px; flex-wrap:wrap; gap:4px;">
              <span style="font-size:0.82rem; font-weight:800; color:#f1f5f9; display:flex; align-items:center; gap:6px;">
                <span>${f.icon || '📌'}</span>
                <span>${f.label}</span>
              </span>
              <span style="font-size:0.7rem; font-weight:700;" class="${isStWinner ? 'badge-status badge-success' : (isBeWinner ? 'badge-status badge-warning' : 'badge-status badge-secondary')}">
                ${isStWinner ? `Vantaggio ${decision.starter} ✅` : (isBeWinner ? `Vantaggio ${decision.benched} ⚠️` : 'Equilibrato ⚖️')}
              </span>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:8px; font-size:0.76rem; margin-bottom:4px;">
              <div>
                <span style="color:var(--text-muted); font-size:0.7rem; display:block; margin-bottom:2px;">${decision.starter}:</span>
                <span style="${stStyle}">${f.starter_val}</span>
              </div>
              <div>
                <span style="color:var(--text-muted); font-size:0.7rem; display:block; margin-bottom:2px;">${decision.benched}:</span>
                <span style="${beStyle}">${f.benched_val}</span>
              </div>
            </div>
            ${f.detail ? `<div style="font-size:0.73rem; color:var(--text-muted); margin-top:4px; font-style:italic;">${f.detail}</div>` : ''}
          </div>
        `;
      }).join('');
    }
  }

  dialog.showModal();
}

function closeBallottaggioModal() {
  const dialog = document.getElementById('ballottaggioModal');
  if (dialog) dialog.close();
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
  let titText = `${player.titolarita_pct || player.titolarita_fonti || 70}%`;
  if (player.match_status === 'TERMINATA' || player.match_status === 'IN CORSO') {
    if (player.is_sub_in) {
      titText = 'Subentrato a gara in corso ⬆️';
    } else if (player.is_sub_out) {
      titText = 'Titolare (sostituito ⬇️)';
    } else if (player.base_grade !== null && player.base_grade !== undefined) {
      titText = 'Titolare in campo ✅';
    } else if (player.match_status === 'TERMINATA') {
      titText = 'Senza Voto / Non impiegato ⚪';
    }
  } else if (player.titolarita_pct === 100) {
    titText = '100% (Titolare Ufficiale ✅)';
  }
  document.getElementById('modalPlayerTitolarita').innerText = titText;
  document.getElementById('modalPlayerMatch').innerText = player.match_info || "Prossimo turno";
  document.getElementById('modalPlayerQA').innerText = player.qa || '-';
  document.getElementById('modalPlayerFVM').innerText = player.fvm || '-';

  // Live & Post-Match Performance Card Population
  const livePerfCard = document.getElementById('modalLivePerformanceCard');
  if (livePerfCard) {
    const isLiveMatch = player.match_status === 'IN CORSO' || player.is_live;
    const isLiveOrDone = player.real_fantavoto !== null && player.real_fantavoto !== undefined;
    const hasLiveContext = isLiveMatch || player.match_status !== undefined || isLiveOrDone;

    if (hasLiveContext) {
      livePerfCard.style.display = 'block';

      // Status & Dual Source Badge
      const statusBadge = document.getElementById('modalLiveStatusBadge');
      if (statusBadge) {
        statusBadge.innerText = player.status_badge || (player.match_status === 'TERMINATA' ? 'FINALE 🏁' : (isLiveMatch ? 'LIVE 🔴' : 'DA GIOCARE ⏳'));
        statusBadge.className = `badge-status ${player.status_class || (isLiveMatch ? 'badge-danger' : 'badge-warning')}`;
      }
      const dualBadge = document.getElementById('modalLiveDualSourceBadge');
      if (dualBadge) {
        dualBadge.innerText = player.verification_badge || '✅ Doppia Fonte: Fantacalcio + ESPN';
        dualBadge.style.display = 'inline-block';
      }

      // Fantavoto & Base Grade
      const fvDisp = document.getElementById('modalLiveFantavoto');
      const deltaDisp = document.getElementById('modalLiveDeltaBadge');
      const baseGradeVal = document.getElementById('modalLiveBaseGradeVal');
      const bonusHtml = document.getElementById('modalLiveBonusListHtml');

      if (player.real_fantavoto !== null && player.real_fantavoto !== undefined) {
        if (player.is_live_grade || isLiveMatch) {
          if (fvDisp) fvDisp.innerHTML = `<span style="color:#ef4444; font-weight:900;">${player.real_fantavoto}</span> <span style="font-size:0.8rem; font-weight:700; color:#ef4444;">LIVE FV</span> <span style="font-size:0.75rem; color:var(--text-muted); margin-left:6px;">(Atteso: ${player.expected_fantavoto || 6.5} pt)</span>`;
          if (deltaDisp) {
            deltaDisp.style.display = 'inline-block';
            deltaDisp.innerText = `🔴 In campo (${player.match_min || '1°T'}) • Parziale: ${player.real_fantavoto} pt`;
            deltaDisp.className = 'badge-status badge-danger';
          }
          if (baseGradeVal) baseGradeVal.innerHTML = `${player.base_grade !== null ? player.base_grade : '6.5'} <span style="color:#ef4444; font-size:0.75rem;">(Provvisorio)</span>`;
          if (bonusHtml) {
            if (player.bonus_malus && player.bonus_malus.length > 0) {
              bonusHtml.innerHTML = player.bonus_malus.map(b => 
                `<span class="bonus-pill ${b.val < 0 ? 'malus' : ''}">${b.icon} ${b.label} (${b.val > 0 ? '+' : ''}${b.val})</span>`
              ).join(' ') + ` <span style="color:#f87171; font-size:0.75rem;">(Live)</span>`;
            } else {
              bonusHtml.innerHTML = `<span style="color:#f87171; font-size:0.8rem;">⚡ Voto parziale stimato da statistiche live in attesa del referto finale Fantacalcio.it</span>`;
            }
          }
        } else {
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
        }
      } else if (isLiveMatch) {
        if (fvDisp) fvDisp.innerHTML = `<span style="color:#ef4444;"><span class="live-dot" style="margin-right:4px;"></span>LIVE</span> <span style="font-size:0.8rem; font-weight:400; color:var(--text-muted);">(Atteso: ${player.expected_fantavoto || 6.5} pt)</span>`;
        if (deltaDisp) {
          deltaDisp.style.display = 'inline-block';
          deltaDisp.innerText = `🔴 In campo (${player.match_min || '1°T'})`;
          deltaDisp.className = 'badge-status badge-danger';
        }
        if (baseGradeVal) baseGradeVal.innerText = 'In corso';
        if (bonusHtml) bonusHtml.innerHTML = `<span style="color:#f87171; font-size:0.8rem;">⚡ Gara in corso (${player.match_info || ''}): pagelle ufficiali Fantacalcio.it disponibili al termine del match</span>`;
      } else if (player.match_status === 'TERMINATA') {
        if (fvDisp) fvDisp.innerHTML = `s.v. <span style="font-size:0.8rem; font-weight:400; color:var(--text-muted);">(Atteso: ${player.expected_fantavoto || 6.5})</span>`;
        if (deltaDisp) {
          deltaDisp.style.display = 'inline-block';
          deltaDisp.innerText = `⚪ Senza Voto (s.v.)`;
          deltaDisp.className = 'badge-status badge-secondary';
        }
        if (baseGradeVal) baseGradeVal.innerText = 's.v.';
        if (bonusHtml) bonusHtml.innerText = "Gara conclusa. Calciatore non impiegato o senza voto ufficiale.";
      } else {
        if (fvDisp) fvDisp.innerHTML = `-.- <span style="font-size:0.8rem; font-weight:400; color:var(--text-muted);">(Atteso: ${player.expected_fantavoto || 6.5})</span>`;
        if (deltaDisp) {
          deltaDisp.style.display = 'inline-block';
          deltaDisp.innerText = `⏳ Da giocare`;
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
      factorsContainer.innerHTML = factors.map(f => {
        const isAIEvaluated = f.label.includes('Metriche') || f.label.includes('Piazzati') || f.label.includes('Disciplinare') || f.label.includes('Fatica') || f.label.includes('Modificatore') || f.label.includes('Partita');
        return `
          <div class="modal-factor-row">
            <div class="modal-factor-header">
              <span class="modal-factor-label" style="display:flex; align-items:center; gap:6px;">
                <span>${f.label}</span>
                ${isAIEvaluated ? '<span class="badge-status badge-primary" style="font-size:0.62rem; padding:1px 5px; font-weight:800;">🤖 Analisi AI</span>' : ''}
              </span>
              <span class="modal-factor-val">${f.val}</span>
            </div>
            <div class="modal-factor-desc">${f.desc}</div>
          </div>
        `;
      }).join('');
    } else {
      factorsContainer.innerHTML = `<div style="font-size:0.75rem; color:var(--text-muted); padding:6px;">Dati analizzati con modello standard.</div>`;
    }
  }

  // SOS Fanta Quote
  const sfBox = document.getElementById('modalSOSFantaBox');
  const sfTitle = document.getElementById('modalSOSFantaHeaderTitle');
  const targetMd = currentSchieraMatchday || 7;
  if (sfTitle) {
    sfTitle.innerText = `🔥 SOS FANTA PREVIEW (${targetMd}ª GIORNATA):`;
  }

  if (player.sosfanta && (player.sosfanta.is_published === false || player.sosfanta.category === 'IN ARRIVO')) {
    if (sfBox) {
      sfBox.style.display = 'block';
      document.getElementById('modalSOSFantaBadge').innerText = 'IN ARRIVO ⏳';
      document.getElementById('modalSOSFantaBadge').className = 'badge-status badge-secondary';
      document.getElementById('modalSOSFantaQuote').innerText = `"La preview ufficiale SOS Fanta per la ${targetMd}ª Giornata verrà pubblicata dalla redazione 24-48h prima dell'anticipo (giovedì/venerdì)."`;
      document.getElementById('modalSOSFantaSummary').innerText = 'Auto-sincronizzazione attiva: le citazioni verranno collegate appena pubblicate da SOS Fanta.';
    }
  } else if (player.sosfanta && player.sosfanta.mentioned) {
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

  // Backdrop click-to-close on all modals (<dialog>)
  document.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('click', (e) => {
      // In native HTML5 <dialog>, clicks on the ::backdrop have e.target === dialog
      if (e.target === dialog) {
        const rect = dialog.getBoundingClientRect();
        const isInDialog = (
          rect.top <= e.clientY &&
          e.clientY <= rect.top + rect.height &&
          rect.left <= e.clientX &&
          e.clientX <= rect.left + rect.width
        );
        if (!isInDialog) {
          dialog.close();
        }
      }
    });
  });

  // Initial load
  loadLineupRecommendation();
  loadActualLineupState();
  loadTunnelInfo();
  loadLiveVotes();

  // Global paste listener for easy screenshot upload (Ctrl+V)
  window.addEventListener('paste', handleClipboardPaste);

  // Automatic background refresh every 30 seconds for live data
  setInterval(() => {
    const liveView = document.getElementById('tab-live');
    if (liveView && liveView.classList.contains('active')) {
      loadLiveVotes();
    }
  }, 30000);

  // Pre-fetch SOS Fanta full article in the background so modal opens with 0 latency
  fetch('/api/sosfanta/full-article')
    .then(r => r.json())
    .then(d => { if (d.success) fullArticleDataCache = d; })
    .catch(() => {});
});

// --- TUNNEL INFO & COPY ---
let publicTunnelUrl = 'https://representatives-eleven-mae-briefing.trycloudflare.com';

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
let fullArticleDataCache = {};
let activeMatchFilter = 'all';
let currentSOSFantaMatchday = 7;

function switchSOSFantaMatchday(md) {
  currentSOSFantaMatchday = md;
  const btn6 = document.getElementById('btnMd6SOS');
  const btn7 = document.getElementById('btnMd7SOS');
  if (btn6 && btn7) {
    btn6.classList.toggle('active', md === 6);
    btn7.classList.toggle('active', md === 7);
  }
  loadSOSFantaAnalysis();
}

async function loadSOSFantaAnalysis() {
  const container = document.getElementById('sosfantaCardsContainer');
  const statsContainer = document.getElementById('sosfantaStatsContainer');
  const btnFullArticle = document.getElementById('btnOpenSOSArticle');
  if (container) container.innerHTML = `<div style="text-align:center; padding:20px; color:var(--text-muted);">Analisi preview SOS Fanta ${currentSOSFantaMatchday}ª Giornata in corso...</div>`;

  try {
    const res = await fetch(`/api/sosfanta/analysis?matchday=${currentSOSFantaMatchday}`);
    if (!res.ok) throw new Error("Errore recupero SOS Fanta");
    const data = await res.json();
    const results = data.results || [];
    const isPublished = data.is_published !== false;

    // Update matchday badge and url input
    const badge = document.getElementById('sosfantaMatchdayBadge');
    if (badge) {
      badge.innerText = isPublished ? `${data.matchday || currentSOSFantaMatchday + 'ª Giornata'}` : `${currentSOSFantaMatchday}ª Giornata (In Arrivo ⏳)`;
      badge.className = `badge-status ${isPublished ? 'badge-primary' : 'badge-secondary'}`;
    }
    if (data.preview_url) {
      const input = document.getElementById('sosfantaUrlInput');
      if (input) input.value = data.preview_url;
    }

    if (!isPublished) {
      if (statsContainer) {
        statsContainer.innerHTML = `
          <div class="counter-box" style="grid-column: 1 / -1; padding:14px; background:rgba(245, 158, 11, 0.08); border:1px solid rgba(245, 158, 11, 0.25); border-radius:12px;">
            <div style="font-weight:800; color:#fbbf24; font-size:0.95rem; margin-bottom:4px;">⏳ Preview 7ª Giornata non ancora pubblicata da SOS Fanta</div>
            <div style="font-size:0.8rem; color:#fde68a; line-height:1.5;">
              La redazione di SOS Fanta pubblica l'articolo integrale delle 10 partite <strong>24-48 ore prima del primo anticipo</strong> (previsto per giovedì 15 o venerdì 16 ottobre).
              Il sistema scansiona la fonte ogni 15 minuti e collegherà automaticamente tutti i consigli non appena disponibili online.
            </div>
          </div>
        `;
      }
      if (btnFullArticle) {
        btnFullArticle.style.opacity = '0.7';
        btnFullArticle.innerText = `⏳ Estratto Completo 7ª Giornata (In Arrivo)`;
      }
      if (container) {
        container.innerHTML = `
          <div style="background:rgba(255,255,255,0.03); border-radius:12px; padding:20px; text-align:center;">
            <div style="font-size:2rem; margin-bottom:8px;">⏳</div>
            <div style="font-weight:800; font-size:1rem; color:#ffffff; margin-bottom:6px;">Preview 7ª Giornata in Arrivo</div>
            <div style="font-size:0.84rem; color:var(--text-secondary); max-width:480px; margin:0 auto 16px; line-height:1.6;">
              Nessun consiglio obsoleto della 6ª Giornata viene mostrato per la 7ª Giornata per garantire la massima correttezza della formazione. Puoi consultare l'archivio ufficiale della 6ª Giornata premendo il pulsante in alto.
            </div>
            <button class="btn btn-secondary btn-sm" onclick="switchSOSFantaMatchday(6)">
              📂 Visualizza Archivio Consigli 6ª Giornata
            </button>
          </div>
        `;
      }
      return;
    }

    // Published branch
    if (btnFullArticle) {
      btnFullArticle.style.opacity = '1';
      btnFullArticle.innerText = `📖 Leggi l'Estratto Completo delle 10 Partite (${data.matchday || currentSOSFantaMatchday + 'ª Giornata'})`;
    }

    // Stats count
    const mentionedCount = results.filter(r => r.sosfanta && r.sosfanta.mentioned).length;
    const topCount = results.filter(r => r.sosfanta && r.sosfanta.category === 'SCHIERARE ASSOLUTO').length;
    const promossiCount = results.filter(r => r.sosfanta && (r.sosfanta.category === 'PROMOSSO' || r.sosfanta.category.includes('PROMOSSO'))).length;
    const alertCount = results.filter(r => r.sosfanta && (r.sosfanta.category.includes('PRUDENZA') || r.sosfanta.category.includes('RISCHIO') || r.sosfanta.category.includes('SCONSIGLIATO'))).length;

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
        ${alertCount > 0 ? `
        <div class="counter-box" style="border:1px solid rgba(239, 68, 68, 0.4);">
          <div class="counter-val" style="color:#f87171;">${alertCount}</div>
          <div class="counter-lbl">Prudenza / Rischio 🚨</div>
        </div>` : ''}
      `;
    }

    if (container) {
      container.innerHTML = results.map(r => {
        const sf = r.sosfanta || {};
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
                <span class="badge-status badge-${sf.badge || 'secondary'}">${sf.icon || '👉'} ${sf.category || 'NEUTRO'}</span>
              </div>
            </div>
            
            ${isMentioned ? `
              <div style="background:rgba(255,255,255,0.03); border-left:3px solid var(--accent-emerald); padding:8px 12px; border-radius:6px; font-size:0.83rem;">
                <div style="font-style:italic; color:#ffffff; margin-bottom:3px;">"${sf.quote}"</div>
                <div style="font-size:0.75rem; color:#94a3b8;">${sf.summary}</div>
              </div>
            ` : `
              <div style="font-size:0.75rem; color:var(--text-muted); padding:4px 8px;">
                ${sf.summary || 'Valutazione partita standard.'}
              </div>
            `}
          </div>
        `;
      }).join('');
    }

    // Silently pre-fetch full article in background for this matchday
    fetch(`/api/sosfanta/full-article?matchday=${currentSOSFantaMatchday}`)
      .then(res => res.json())
      .then(data => { if (data.success) fullArticleDataCache[currentSOSFantaMatchday] = data; })
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

  const md = currentSOSFantaMatchday || 7;
  // If already loaded in memory, display immediately with 0 delay!
  if (fullArticleDataCache && fullArticleDataCache[md] && fullArticleDataCache[md].slides) {
    populateFullArticleUI(fullArticleDataCache[md]);
    return;
  }

  const container = document.getElementById('fullArticleMatchesContainer');
  if (container) {
    container.innerHTML = `<div style="text-align:center; padding:30px; color:var(--text-muted);">Caricamento delle 10 partite (${md}ª Giornata)...</div>`;
  }

  try {
    const res = await fetch(`/api/sosfanta/full-article?matchday=${md}`);
    if (!res.ok) throw new Error("Errore caricamento articolo");
    const data = await res.json();
    if (!data.is_published && (!data.slides || data.slides.length === 0)) {
      if (container) {
        container.innerHTML = `
          <div style="text-align:center; padding:40px 20px;">
            <div style="font-size:2.5rem; margin-bottom:12px;">⏳</div>
            <h4 style="font-size:1.1rem; color:#ffffff; margin-bottom:8px;">Preview ${md}ª Giornata In Arrivo</h4>
            <p style="font-size:0.85rem; color:var(--text-secondary); max-width:440px; margin:0 auto 16px; line-height:1.6;">
              L'articolo completo di SOS Fanta con tutti i dettagli delle 10 partite verrà pubblicato tra giovedì e venerdì (24-48h prima del primo anticipo).
            </p>
            <button class="btn btn-primary btn-sm" onclick="closeSOSFantaFullArticleModal(); switchSOSFantaMatchday(6); openSOSFantaFullArticleModal();">
              📂 Leggi l'Articolo della 6ª Giornata
            </button>
          </div>
        `;
      }
      return;
    }
    if (!fullArticleDataCache) fullArticleDataCache = {};
    fullArticleDataCache[md] = data;
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
  const md = currentSOSFantaMatchday || 7;
  const currentSlides = (fullArticleDataCache && fullArticleDataCache[md]?.slides) || fullArticleDataCache?.slides || [];

  if (page === 'all') {
    renderFullArticleMatches(currentSlides, searchVal, false);
  } else {
    const singleSlide = currentSlides.filter(s => s.page === page);
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

function forceHardReload() {
  showToast("🔄 Svuoto la cache locale e ricarico...");
  setTimeout(() => {
    const sep = window.location.href.includes('?') ? '&' : '?';
    window.location.href = window.location.href.split('?')[0] + sep + '_bust=' + Date.now();
  }, 350);
}

// ================= AI RECALIBRATION INTERACTIVE REVIEW =================
let cachedRecalibrationData = null;

async function openAIRecalibrationModal() {
  const dialog = document.getElementById('aiRecalibrationModal');
  if (!dialog) return;
  dialog.showModal();

  const errList = document.getElementById('recalErrorBreakdownList');
  const paramsList = document.getElementById('recalParametersList');
  if (errList) errList.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:0.8rem;">Caricamento dettagli scostamenti...</div>`;
  if (paramsList) paramsList.innerHTML = `<div style="text-align:center; padding:15px; color:var(--text-muted); font-size:0.8rem;">Caricamento parametri modificati...</div>`;

  try {
    const res = await fetch(`/api/ai/recalibration-preview?_t=${Date.now()}`);
    if (!res.ok) throw new Error("Errore recupero preview calibrazione");
    const data = await res.json();
    cachedRecalibrationData = data;
    renderAIRecalibrationPreview(data);
  } catch (e) {
    console.error("Recalibration preview error:", e);
    if (paramsList) paramsList.innerHTML = `<div style="color:#f87171; text-align:center; padding:15px;">Errore nel caricamento dei dati di ricalibrazione.</div>`;
  }
}

function closeAIRecalibrationModal() {
  const dialog = document.getElementById('aiRecalibrationModal');
  if (dialog) dialog.close();
}

function renderAIRecalibrationPreview(data) {
  if (!data) return;

  // Render player breakdown
  const errList = document.getElementById('recalErrorBreakdownList');
  if (errList && data.error_breakdown) {
    errList.innerHTML = data.error_breakdown.map(item => `
      <div style="background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:10px; padding:8px 10px; font-size:0.78rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
          <div style="font-weight:800; color:#ffffff; display:flex; align-items:center; gap:4px;">
            <span class="role-badge role-${item.role}" style="font-size:0.65rem; padding:1px 5px;">${item.role}</span>
            <span>${item.player}</span>
            <span style="font-size:0.7rem; color:var(--text-muted); font-weight:400;">(${item.team})</span>
          </div>
          <span class="badge-status badge-danger" style="font-size:0.72rem; padding:1px 6px;">
            ${item.delta > 0 ? '+' : ''}${item.delta} pt
          </span>
        </div>
        <div style="color:#94a3b8; font-size:0.73rem; margin-bottom:4px;">
          🏟️ ${item.match} • Previsto: <strong>${item.expected}</strong> → Reale: <strong>${item.real}</strong>
        </div>
        <div style="color:#cbd5e1; font-size:0.72rem; line-height:1.3; background:rgba(0,0,0,0.2); padding:5px 7px; border-radius:6px; margin-bottom:3px;">
          ⚠️ <em>${item.cause}</em>
        </div>
        <div style="color:#34d399; font-size:0.7rem; font-weight:600;">
          💡 Rimedio AI: ${item.remedy}
        </div>
      </div>
    `).join('');
  }

  // Render parameters with inputs
  const paramsList = document.getElementById('recalParametersList');
  if (paramsList && data.parameters) {
    paramsList.innerHTML = data.parameters.map(p => {
      const isShifted = p.diff !== 0;
      const shiftColor = p.diff > 0 ? '#f59e0b' : (p.diff < 0 ? '#38bdf8' : '#94a3b8');
      const borderClass = isShifted ? 'border:1px solid rgba(139, 92, 246, 0.35);' : 'border:1px solid rgba(255,255,255,0.06);';
      return `
        <div style="background:rgba(255,255,255,0.02); ${borderClass} border-radius:10px; padding:10px 12px; font-size:0.8rem;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px; margin-bottom:4px;">
            <div>
              <span style="font-weight:800; color:#f8fafc; font-size:0.85rem;">${p.name}</span>
              <span style="font-size:0.7rem; color:var(--text-muted); margin-left:6px;">[${p.category}]</span>
            </div>
            <div style="display:flex; align-items:center; gap:8px;">
              <span style="color:${shiftColor}; font-weight:800; font-size:0.78rem;">
                ${p.diff_str} (${p.pct_str})
              </span>
              <div style="display:flex; align-items:center; gap:4px;">
                <span style="font-size:0.72rem; color:var(--text-muted);">Valore:</span>
                <input type="number" step="0.05" class="search-input" data-param-key="${p.key}" value="${p.new_value}" style="width:75px; padding:3px 6px; font-size:0.82rem; font-weight:700; text-align:center; color:#34d399;" />
              </div>
            </div>
          </div>
          <div style="font-size:0.73rem; color:var(--text-secondary); line-height:1.4;">
            ${p.description}
          </div>
        </div>
      `;
    }).join('');
  }
}

async function saveCustomRecalibrationWeights() {
  const inputs = document.querySelectorAll('#recalParametersList input[data-param-key]');
  const weights = {};
  inputs.forEach(inp => {
    const k = inp.getAttribute('data-param-key');
    const val = parseFloat(inp.value);
    if (k && !isNaN(val)) {
      weights[k] = val;
    }
  });

  try {
    showToast("💾 Applico i nuovi parametri calibrati...");
    const res = await fetch('/api/ai/apply-recalibration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ weights: weights })
    });
    const json = await res.json();
    if (json.success) {
      showToast(`🧠 Pesi AI Epoca ${json.epoch} applicati con successo!`);
      closeAIRecalibrationModal();
      loadAILearningStatus();
      loadLineupRecommendation();
      loadLiveVotes();
    } else {
      showToast(json.message || "Errore durante il salvataggio.");
    }
  } catch (e) {
    console.error("Save weights error:", e);
    showToast("Impossibile salvare i nuovi pesi.");
  }
}

async function resetAIWeightsToDefault() {
  if (!confirm("Vuoi ripristinare i parametri del modello ai valori standard?")) return;
  try {
    showToast("🔄 Ripristino pesi standard...");
    const res = await fetch('/api/ai/reset-weights', { method: 'POST' });
    const json = await res.json();
    if (json.success) {
      showToast("✅ Parametri standard ripristinati!");
      openAIRecalibrationModal();
      loadAILearningStatus();
      loadLineupRecommendation();
      loadLiveVotes();
    }
  } catch (e) {
    showToast("Errore durante il reset dei pesi.");
  }
}

// ================= ACTUAL LINEUP & LEGHE FC SCREENSHOT =================
let cachedActualLineup = null;

async function loadActualLineupState() {
  try {
    const res = await fetch(`/api/lineup/actual?_t=${Date.now()}`);
    if (!res.ok) return;
    const data = await res.json();
    cachedActualLineup = data.lineup;
    renderActualLineupCard(data.lineup);
  } catch (e) {
    console.warn("Could not load actual lineup state", e);
  }
}

function renderActualLineupCard(lineup) {
  const badge = document.getElementById('actualLineupStatusBadge');
  const detailsBanner = document.getElementById('actualLineupDetailsBanner');
  const btnView = document.getElementById('btnViewActualLineup');
  const btnClear = document.getElementById('btnClearActualLineup');
  const moduleTxt = document.getElementById('actualLineupModuleText');
  const sourceTxt = document.getElementById('actualLineupSourceText');
  const pillsContainer = document.getElementById('actualLineupStartersPills');

  if (!badge) return;

  if (lineup && lineup.starters && lineup.starters.length > 0) {
    badge.className = 'badge-status badge-success';
    badge.innerText = `🟢 Attiva (${lineup.starters.length} Titolari)`;
    if (detailsBanner) detailsBanner.style.display = 'block';
    if (btnView) btnView.style.display = 'inline-flex';
    if (btnClear) btnClear.style.display = 'inline-flex';
    if (moduleTxt) moduleTxt.innerText = lineup.formation || '4-3-3';
    if (sourceTxt) sourceTxt.innerText = `(${lineup.source || 'Leghe FC'})`;

    if (pillsContainer) {
      pillsContainer.innerHTML = lineup.starters.map(p => `
        <span style="background:rgba(16, 185, 129, 0.15); border:1px solid rgba(16, 185, 129, 0.3); color:#34d399; font-weight:700; font-size:0.7rem; padding:2px 7px; border-radius:6px; display:inline-flex; align-items:center; gap:3px;">
          <span class="role-badge role-${p.role}" style="font-size:0.6rem; padding:1px 3px;">${p.role}</span>
          ${p.name}
        </span>
      `).join('');
    }

    const benchPills = document.getElementById('actualLineupBenchPills');
    const benchSec = document.getElementById('actualLineupBenchSection');
    if (benchPills && benchSec) {
      if (lineup.bench && lineup.bench.length > 0) {
        benchSec.style.display = 'block';
        benchPills.innerHTML = lineup.bench.map((p, idx) => `
          <span style="background:rgba(255,255,255,0.04); border:1px solid rgba(255,255,255,0.08); color:var(--text-secondary); font-size:0.68rem; padding:2px 6px; border-radius:6px; display:inline-flex; align-items:center; gap:3px;">
            <span style="color:var(--text-muted); font-size:0.6rem; font-weight:800;">${idx + 1}.</span>
            <span class="role-badge role-${p.role}" style="font-size:0.55rem; padding:1px 3px;">${p.role}</span>
            ${p.name}
            ${(p.score !== undefined && p.score !== null && Number(p.score) > 0) ? `<span style="color:#fbbf24; font-size:0.62rem; font-weight:700;">★${Number(p.score).toFixed(1)}</span>` : ''}
          </span>
        `).join('');
      } else {
        benchSec.style.display = 'none';
      }
    }
  } else {
    badge.className = 'badge-status badge-secondary';
    badge.innerText = 'Nessuno screenshot attivo';
    if (detailsBanner) detailsBanner.style.display = 'none';
    if (btnView) btnView.style.display = 'none';
    if (btnClear) btnClear.style.display = 'none';
    const benchSec = document.getElementById('actualLineupBenchSection');
    if (benchSec) benchSec.style.display = 'none';
  }
}

async function handleScreenshotUpload(event) {
  const file = event.target.files ? event.target.files[0] : null;
  if (!file) return;

  const reader = new FileReader();
  reader.onload = async (e) => {
    const base64Data = e.target.result;
    await processScreenshotData(base64Data, file);
  };
  reader.readAsDataURL(file);
  event.target.value = '';
}

async function handleClipboardPaste(event) {
  const items = (event.clipboardData || event.originalEvent?.clipboardData)?.items;
  if (!items) return;

  for (let i = 0; i < items.length; i++) {
    if (items[i].type && items[i].type.indexOf('image') !== -1) {
      const file = items[i].getAsFile();
      if (file) {
        showToast("📸 Screenshot rilevato dagli appunti! Inizio analisi...");
        const reader = new FileReader();
        reader.onload = async (e) => {
          await processScreenshotData(e.target.result, file);
        };
        reader.readAsDataURL(file);
        break;
      }
    }
  }
}

async function preprocessImageForOCR(base64Data) {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      const scale = img.width < 900 ? 2 : 1;
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const d = imgData.data;
        for (let i = 0; i < d.length; i += 4) {
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
          const val = lum > 145 ? 255 : (lum < 75 ? 0 : lum);
          d[i] = val;
          d[i + 1] = val;
          d[i + 2] = val;
        }
        ctx.putImageData(imgData, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } catch (err) {
        resolve(base64Data);
      }
    };
    img.onerror = () => resolve(base64Data);
    img.src = base64Data;
  });
}

async function processScreenshotData(base64Data, file) {
  showToast("🧠 Analisi screenshot in corso (AI Vision & OCR)...");
  
  let extracted = null;
  try {
    const res = await fetch('/api/lineup/extract-screenshot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64Data })
    });
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.result && json.result.starters && json.result.starters.length >= 8) {
        extracted = json.result;
        showToast(`✅ Riconosciuti ${extracted.starters.length} titolari (${extracted.formation || '4-3-3'})!`);
      }
    }
  } catch (e) {
    console.warn("Backend vision failed, trying client OCR fallback", e);
  }

  // Client-side OCR Fallback with Tesseract.js if needed
  if (!extracted || !extracted.starters || extracted.starters.length < 8) {
    if (window.Tesseract) {
      try {
        showToast("🔍 Riconoscimento testo avanzato con OCR locale...");
        const processedImage = await preprocessImageForOCR(base64Data);
        const ocrRes = await Tesseract.recognize(processedImage, 'ita', {
          logger: m => {}
        });
        const ocrText = ocrRes.data.text || '';
        if (ocrText) {
          const res2 = await fetch('/api/lineup/extract-screenshot', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ocr_text: ocrText })
          });
          if (res2.ok) {
            const json2 = await res2.json();
            if (json2.success && json2.result && json2.result.starters && json2.result.starters.length >= 5) {
              extracted = json2.result;
              showToast(`✅ Riconosciuti ${extracted.starters.length} titolari via OCR!`);
            }
          }
        }
      } catch (ocrErr) {
        console.warn("Tesseract OCR fallback error:", ocrErr);
      }
    }
  }

  if (!extracted || !extracted.starters || extracted.starters.length < 5) {
    showToast("⚠️ Screenshot analizzato: seleziona i tuoi 11 titolari effettivi.");
  }

  await openActualLineupModal(extracted);
}

async function getUserSquadList() {
  if (currentSquadData && currentSquadData.length > 0) return currentSquadData;
  try {
    const res = await fetch('/api/squad');
    if (res.ok) {
      const data = await res.json();
      currentSquadData = data.players || [];
      return currentSquadData;
    }
  } catch (e) {}
  return [];
}

async function openActualLineupModal(extractedData = null) {
  const dialog = document.getElementById('actualLineupModal');
  if (!dialog) return;

  const squad = await getUserSquadList();
  if (!squad || squad.length === 0) {
    showToast("Attenzione: Rosa non caricata. Verifica la tab La Tua Rosa.");
    return;
  }

  let data = extractedData;
  if (!data) {
    data = cachedActualLineup || {
      formation: currentFormation !== 'auto' ? currentFormation : '4-3-3',
      starters: (currentLineupData && currentLineupData.starters) ? currentLineupData.starters : squad.slice(0, 11),
      bench: (currentLineupData && currentLineupData.bench) ? currentLineupData.bench : squad.slice(11),
      source: "Formazione Attuale",
      notes: "Verifica e conferma gli 11 titolari."
    };
  }

  renderActualLineupEditor(data, squad);
  dialog.showModal();
}

function closeActualLineupModal() {
  const dialog = document.getElementById('actualLineupModal');
  if (dialog) dialog.close();
}

let currentModalBench = [];

function renderBenchEditorList(bench) {
  const benchListEl = document.getElementById('actualBenchListEditor');
  if (!benchListEl) return;
  currentModalBench = Array.isArray(bench) ? bench : [];

  if (currentModalBench.length === 0) {
    benchListEl.innerHTML = `<div style="text-align:center; padding:10px; color:var(--text-muted); font-size:0.75rem;">Caricamento panchina AI...</div>`;
    return;
  }

  benchListEl.innerHTML = currentModalBench.map((p, idx) => {
    const isOut = p.is_out;
    const scoreVal = (p.score !== undefined && p.score !== null) ? Number(p.score).toFixed(1) : (p.qa || '-');
    const badgeClass = p.badge_class || (isOut ? 'danger' : (Number(p.score) >= 70 ? 'primary' : 'info'));
    const statusTxt = p.status || (isOut ? 'INFORTUNATO' : 'DISPONIBILE');
    const oppStr = p.opponent_code ? `vs ${p.opponent_code}` : (p.team || '');

    return `
      <div style="display:flex; align-items:center; justify-content:space-between; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.07); border-radius:8px; padding:6px 10px; font-size:0.78rem;">
        <div style="display:flex; align-items:center; gap:8px;">
          <span style="color:var(--text-muted); font-weight:800; width:22px; font-size:0.72rem;">#${idx + 1}</span>
          <span class="role-badge role-${p.role || 'C'}" style="font-size:0.65rem; padding:1px 5px;">${p.role || 'C'}</span>
          <span style="font-weight:700; color:#f8fafc;">${p.name}</span>
          <span style="color:var(--text-muted); font-size:0.72rem;">(${p.team || ''} ${oppStr})</span>
        </div>
        <div style="display:flex; align-items:center; gap:6px;">
          <span class="badge-status badge-${badgeClass}" style="font-size:0.65rem; padding:1px 6px;">${statusTxt}</span>
          <span style="color:#fbbf24; font-weight:800; font-size:0.75rem;">★ ${scoreVal}</span>
        </div>
      </div>
    `;
  }).join('');
}

function renderActualLineupEditor(data, squad) {
  const modSelect = document.getElementById('actualLineupModuleSelect');
  if (modSelect) modSelect.value = data.formation || '4-3-3';

  const statusSource = document.getElementById('actualLineupStatusSource');
  const statusNotes = document.getElementById('actualLineupStatusNotes');
  if (statusSource) statusSource.innerText = `Fonte: ${data.source || 'Screenshot Leghe FC'}`;
  if (statusNotes) statusNotes.innerText = data.notes || "Seleziona gli 11 titolari effettivi schierati in campo.";

  let starters = data.starters ? [...data.starters] : [];
  if (starters.length < 11) {
    const existingNames = new Set(starters.map(p => p.name));
    for (const p of squad) {
      if (!existingNames.has(p.name)) {
        starters.push(p);
        existingNames.add(p.name);
        if (starters.length === 11) break;
      }
    }
  }

  const startersListEl = document.getElementById('actualStartersListEditor');
  if (startersListEl) {
    startersListEl.innerHTML = starters.slice(0, 11).map((s, idx) => {
      const optionsHtml = squad.map(p => `
        <option value="${p.name}" ${p.name.toLowerCase() === s.name.toLowerCase() ? 'selected' : ''}>
          [${p.role}] ${p.name} (${p.team})
        </option>
      `).join('');

      return `
        <div style="display:flex; align-items:center; gap:8px; background:rgba(255,255,255,0.03); border:1px solid rgba(255,255,255,0.08); border-radius:8px; padding:6px 10px;">
          <span style="font-weight:800; font-size:0.75rem; color:var(--text-muted); width:20px;">#${idx + 1}</span>
          <span class="role-badge role-${s.role || 'C'}" style="font-size:0.7rem; padding:2px 6px;">${s.role || 'C'}</span>
          <select class="search-input" data-starter-slot="${idx}" style="flex:1; padding:4px 8px; font-size:0.85rem;" onchange="handleStarterSlotChange(${idx}, this.value)">
            ${optionsHtml}
          </select>
        </div>
      `;
    }).join('');
  }

  if (data.bench && data.bench.length > 0) {
    renderBenchEditorList(data.bench);
  } else {
    // Request AI bench dynamically
    fetch('/api/lineup/reorder-bench', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starters: starters.slice(0, 11) })
    })
    .then(r => r.json())
    .then(res => {
      if (res.success && res.bench) {
        renderBenchEditorList(res.bench);
      }
    })
    .catch(() => {
      const starterNames = new Set(starters.map(p => p.name));
      renderBenchEditorList(squad.filter(p => !starterNames.has(p.name)));
    });
  }
}

async function handleStarterSlotChange(changedSlotIdx, newPlayerName) {
  const squad = await getUserSquadList();
  const selectElements = document.querySelectorAll('#actualStartersListEditor select[data-starter-slot]');
  
  const newPlayer = squad.find(p => p.name === newPlayerName);
  if (!newPlayer) return;

  selectElements.forEach((sel, idx) => {
    if (idx !== changedSlotIdx && sel.value === newPlayerName) {
      const currentStarters = Array.from(selectElements).map(s => s.value);
      const unused = squad.find(p => !currentStarters.includes(p.name));
      if (unused) sel.value = unused.name;
    }
    const p = squad.find(item => item.name === sel.value);
    const badge = sel.previousElementSibling;
    if (p && badge && badge.classList.contains('role-badge')) {
      badge.className = `role-badge role-${p.role}`;
      badge.innerText = p.role;
    }
  });

  // Reorder bench dynamically via AI
  const currentStartersList = Array.from(selectElements).map(s => {
    return squad.find(p => p.name === s.value) || { name: s.value };
  });

  try {
    const res = await fetch('/api/lineup/reorder-bench', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ starters: currentStartersList })
    });
    const data = await res.json();
    if (data.success && data.bench) {
      renderBenchEditorList(data.bench);
    }
  } catch (e) {
    const starterNames = new Set(Array.from(selectElements).map(s => s.value));
    renderBenchEditorList(squad.filter(p => !starterNames.has(p.name)));
  }
}

function updateActualLineupModule(newModule) {
  showToast(`Modulo impostato su ${newModule}`);
}

async function saveActualLineupFromModal() {
  const squad = await getUserSquadList();
  const modSelect = document.getElementById('actualLineupModuleSelect');
  const formation = modSelect ? modSelect.value : '4-3-3';

  const selectElements = document.querySelectorAll('#actualStartersListEditor select[data-starter-slot]');
  const starterNames = Array.from(selectElements).map(s => s.value);

  const starters = starterNames.map(name => {
    return squad.find(p => p.name === name) || { name: name, role: 'C', team: '' };
  });

  const benchToSave = (currentModalBench && currentModalBench.length > 0) ? currentModalBench : [];

  const payload = {
    formation: formation,
    starters: starters,
    bench: benchToSave,
    notes: `Formazione reale confermata (${formation}) con panchina ordinata dall'AI`
  };

  try {
    showToast("💾 Salvataggio formazione reale in corso...");
    const res = await fetch('/api/lineup/actual', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const json = await res.json();
    if (json.success) {
      cachedActualLineup = json.lineup;
      renderActualLineupCard(json.lineup);
      closeActualLineupModal();
      showToast("✅ Formazione reale sincronizzata con il Live Match Center!");
      loadLiveVotes(true);
    } else {
      showToast("Errore durante il salvataggio.");
    }
  } catch (e) {
    console.error("Save actual lineup error:", e);
    showToast("Impossibile salvare la formazione reale.");
  }
}

async function clearActualLineup() {
  if (!confirm("Vuoi cancellare la formazione reale schierata e tornare a quella consigliata dall'algoritmo?")) return;
  try {
    showToast("🗑️ Reset formazione reale...");
    const res = await fetch('/api/lineup/actual', { method: 'DELETE' });
    const json = await res.json();
    if (json.success) {
      cachedActualLineup = null;
      renderActualLineupCard(null);
      showToast("🔄 Ripristinata formazione consigliata dell'IA.");
      loadLiveVotes(false);
    }
  } catch (e) {
    showToast("Errore durante il reset della formazione reale.");
  }
}

