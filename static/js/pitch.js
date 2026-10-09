/**
 * FantaSchiera AI - Tactical Soccer Pitch Renderer
 */

const ROLE_COLORS = {
  'P': { main: '#eab308', collar: '#ca8a04', text: '#000000' }, // Yellow GK
  'D': { main: '#3b82f6', collar: '#1d4ed8', text: '#ffffff' }, // Blue DEF
  'C': { main: '#10b981', collar: '#047857', text: '#ffffff' }, // Green MID
  'A': { main: '#ef4444', collar: '#b91c1c', text: '#ffffff' }  // Red ATT
};

function renderJerseySVG(role, number = 10) {
  const colors = ROLE_COLORS[role] || ROLE_COLORS['C'];
  return `
    <svg class="jersey-svg" viewBox="0 0 100 100" xmlns="http://www.w3.org/2000/svg">
      <!-- Jersey Body -->
      <path d="M 25,25 L 38,10 L 62,10 L 75,25 L 88,38 L 76,50 L 70,44 L 70,88 L 30,88 L 30,44 L 24,50 L 12,38 Z" 
            fill="${colors.main}" stroke="rgba(255,255,255,0.7)" stroke-width="2.5" />
      <!-- Collar -->
      <path d="M 38,10 Q 50,26 62,10" fill="none" stroke="${colors.collar}" stroke-width="5" />
      <!-- Sleeve Trims -->
      <line x1="12" y1="38" x2="24" y2="50" stroke="${colors.collar}" stroke-width="3" />
      <line x1="88" y1="38" x2="76" y2="50" stroke="${colors.collar}" stroke-width="3" />
      <!-- Number -->
      <text x="50" y="66" font-size="28" font-family="-apple-system, sans-serif" font-weight="900" fill="${colors.text}" text-anchor="middle" opacity="0.9">
        ${number}
      </text>
    </svg>
  `;
}

function renderSoccerPitch(starters, formation = '3-4-3', onPlayerClickCallback = null) {
  const pitchEl = document.getElementById('soccerPitch');
  if (!pitchEl) return;

  // Split starters by role
  const gk = starters.filter(p => p.role === 'P');
  const def = starters.filter(p => p.role === 'D');
  const mid = starters.filter(p => p.role === 'C');
  const att = starters.filter(p => p.role === 'A');

  function buildRowHTML(players, rowClass) {
    let html = `<div class="pitch-row ${rowClass}">`;
    players.forEach((p, idx) => {
      const isBallottaggio = p.ballottaggio_note || p.titolarita_pct < 75;
      const ringClass = isBallottaggio ? 'titolarita-ring ballottaggio' : 'titolarita-ring';
      const number = p.role === 'P' ? 1 : (idx + 2);
      
      html += `
        <div class="pitch-player" data-player-id="${p.id || p.name}">
          <div class="player-jersey-wrapper">
            ${renderJerseySVG(p.role, number)}
            <span class="${ringClass}">${p.titolarita_pct}%</span>
          </div>
          <div class="player-tag">
            <span class="player-name-text">${p.name}</span>
            <span class="player-sub-text">
              <span>★${Math.round(p.score)}</span>
              <span class="player-matchup">${p.opponent ? p.opponent : ''}</span>
            </span>
          </div>
        </div>
      `;
    });
    html += `</div>`;
    return html;
  }

  // Pitch layout from top (Attackers) to bottom (Goalkeeper)
  const pitchContent = `
    <!-- Pitch Field Lines Markings -->
    <div class="pitch-lines">
      <div class="pitch-center-circle"></div>
      <div class="pitch-center-dot"></div>
      <div class="penalty-box-top"></div>
      <div class="penalty-arc-top"></div>
      <div class="penalty-box-bottom"></div>
      <div class="goal-box-bottom"></div>
      <div class="penalty-arc-bottom"></div>
    </div>
    
    <!-- Formation Rows -->
    ${buildRowHTML(att, 'pitch-row-att')}
    ${buildRowHTML(mid, 'pitch-row-mid')}
    ${buildRowHTML(def, 'pitch-row-def')}
    ${buildRowHTML(gk, 'pitch-row-gk')}
  `;

  pitchEl.innerHTML = pitchContent;

  // Attach click listeners to player pins
  if (onPlayerClickCallback) {
    pitchEl.querySelectorAll('.pitch-player').forEach(el => {
      el.addEventListener('click', () => {
        const pId = el.getAttribute('data-player-id');
        const playerObj = starters.find(p => (p.id || p.name) === pId);
        if (playerObj) {
          onPlayerClickCallback(playerObj);
        }
      });
    });
  }
}

window.renderSoccerPitch = renderSoccerPitch;
window.renderJerseySVG = renderJerseySVG;
