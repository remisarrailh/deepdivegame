window.DD = window.DD || {};

DD.HUD = {
  render(ctx, state, localRole) {
    const C = DD.Config;

    // Top bar: depth + platform energy
    this._renderTopBar(ctx, state);

    // Role panels (bottom)
    this._renderRolePanels(ctx, state, localRole);

    // Phase banner
    if (state.phaseBannerTimer > 0) {
      this._renderBanner(ctx, state.phaseBanner, state.phaseBannerTimer);
    }

    // Wave indicator
    if (state.phase === 'WAVE') {
      ctx.fillStyle = C.COLOR.TEXT_DIM;
      ctx.font = '12px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`WAVE ${state.waveNum}`, C.CANVAS_W - 8, 52);
    }

    // Enemies remaining
    if (state.phase === 'WAVE') {
      ctx.fillStyle = C.COLOR.DANGER;
      ctx.font = '11px monospace';
      ctx.textAlign = 'right';
      ctx.fillText(`${DD.Entities.enemies.length} enemies`, C.CANVAS_W - 8, 66);
    }

    ctx.textAlign = 'left';
  },

  _renderTopBar(ctx, state) {
    const C = DD.Config;
    const barW = C.CANVAS_W - 20;
    const barH = 12;
    const barX = 10;
    const barY = 8;

    // Background
    ctx.fillStyle = C.COLOR.HUD_BG;
    ctx.fillRect(0, 0, C.CANVAS_W, 34);

    // Platform energy bar
    ctx.fillStyle = C.COLOR.HP_BAR_BG;
    ctx.fillRect(barX, barY, barW, barH);

    const energyRatio = Math.max(0, state.platform.energy / C.PLATFORM_ENERGY_MAX);
    let energyColor;
    if (energyRatio > 0.5) energyColor = C.COLOR.ENERGY_BAR;
    else if (energyRatio > 0.25) energyColor = '#ff8800';
    else energyColor = C.COLOR.DANGER;

    ctx.fillStyle = energyColor;
    ctx.fillRect(barX, barY, barW * energyRatio, barH);

    // Energy label
    ctx.fillStyle = C.COLOR.TEXT;
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillText('PLATFORM', barX + 3, barY + barH - 1);

    // Depth
    ctx.textAlign = 'center';
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = C.COLOR.TEXT_DIM;
    ctx.fillText(`DEPTH: ${Math.floor(state.depth)}m`, C.CANVAS_W / 2, barY + barH - 1);

    // Shared ammo pool
    ctx.textAlign = 'right';
    ctx.fillStyle = C.COLOR.AMMO_BAR;
    ctx.fillText(`AMMO: ${Math.floor(state.sharedPool.ammo)}`, C.CANVAS_W - barX, barY + barH - 1);
  },

  _renderRolePanels(ctx, state, localRole) {
    const C = DD.Config;
    const panelH = 38;
    const panelY = C.CANVAS_H - panelH - 2;
    const panelW = C.CANVAS_W / 3 - 4;

    const roles = ['guardian', 'technician', 'gunner'];
    const colors = [C.COLOR.GUARDIAN, C.COLOR.TECHNICIAN, C.COLOR.GUNNER];
    const labels = ['GUARDIAN', 'TECHNIC', 'GUNNER'];

    for (let i = 0; i < 3; i++) {
      const role = roles[i];
      const p = DD.Entities.players[role];
      if (!p) continue;

      const x = 2 + i * (panelW + 4);

      // Panel background
      const isActive = role === localRole || DD.Game.testMode && role === DD.Game.activeRole;
      ctx.fillStyle = isActive ? 'rgba(0,0,0,0.8)' : 'rgba(0,0,0,0.5)';
      ctx.fillRect(x, panelY, panelW, panelH);

      // Border - brighter for active
      ctx.strokeStyle = isActive ? colors[i] : colors[i] + '55';
      ctx.lineWidth = isActive ? 2 : 1;
      ctx.strokeRect(x, panelY, panelW, panelH);

      if (!p.alive && !p.downed) {
        // Permanently dead
        ctx.fillStyle = 'rgba(0,0,0,0.7)';
        ctx.fillRect(x, panelY, panelW, panelH);
        ctx.fillStyle = '#444';
        ctx.font = 'bold 13px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('DEAD', x + panelW / 2, panelY + panelH / 2 + 5);
        continue;
      }

      if (p.downed) {
        // KO / downed state
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(x, panelY, panelW, panelH);
        // Flashing border
        const flash = Math.sin(Date.now() * 0.008) > 0;
        ctx.strokeStyle = flash ? C.COLOR.DANGER : C.COLOR.ENERGY_BAR;
        ctx.lineWidth = 2;
        ctx.strokeRect(x, panelY, panelW, panelH);
        ctx.fillStyle = C.COLOR.ENERGY_BAR;
        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('KO', x + panelW / 2, panelY + 16);
        // Revive progress bar
        if (p.reviveProgress > 0) {
          ctx.fillStyle = C.COLOR.HP_BAR;
          ctx.fillRect(x + 4, panelY + 22, (panelW - 8) * p.reviveProgress, 6);
        }
        ctx.fillStyle = C.COLOR.TEXT_DIM;
        ctx.font = '9px monospace';
        ctx.fillText('HOLD E TO REVIVE', x + panelW / 2, panelY + 36);
        continue;
      }

      // Role label
      ctx.fillStyle = colors[i];
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'left';
      ctx.fillText(labels[i], x + 4, panelY + 10);

      // HP bar
      const hpBarW = panelW - 8;
      const hpRatio = p.hp / p.hpMax;
      ctx.fillStyle = C.COLOR.HP_BAR_BG;
      ctx.fillRect(x + 4, panelY + 13, hpBarW, 5);
      ctx.fillStyle = hpRatio > 0.5 ? C.COLOR.HP_BAR : hpRatio > 0.25 ? '#ffaa00' : C.COLOR.DANGER;
      ctx.fillRect(x + 4, panelY + 13, hpBarW * hpRatio, 5);

      // Role-specific info
      ctx.font = '9px monospace';
      ctx.fillStyle = C.COLOR.TEXT_DIM;
      if (role === 'guardian') {
        const sRatio = p.shieldEnergy / C.GUARDIAN_SHIELD_ENERGY_MAX;
        ctx.fillStyle = C.COLOR.HP_BAR_BG;
        ctx.fillRect(x + 4, panelY + 21, hpBarW, 4);
        ctx.fillStyle = p.shieldActive ? C.COLOR.GUARDIAN_SHIELD : C.COLOR.FRIENDLY;
        ctx.fillRect(x + 4, panelY + 21, hpBarW * sRatio, 4);
        ctx.fillStyle = C.COLOR.TEXT_DIM;
        ctx.fillText('SHIELD', x + 4, panelY + 35);
      } else if (role === 'technician') {
        const status = p.repairing ? 'REPAIRING' : p.recharging ? 'RECHARGING' : 'STANDBY';
        const statusColor = p.repairing ? C.COLOR.INTERACTIVE : p.recharging ? C.COLOR.TECHNICIAN : C.COLOR.TEXT_DIM;
        ctx.fillStyle = statusColor;
        ctx.fillText(status, x + 4, panelY + 30);
      } else if (role === 'gunner') {
        const aRatio = p.ammo / C.GUNNER_AMMO_MAX;
        ctx.fillStyle = C.COLOR.HP_BAR_BG;
        ctx.fillRect(x + 4, panelY + 21, hpBarW, 4);
        ctx.fillStyle = aRatio > 0.3 ? C.COLOR.AMMO_BAR : C.COLOR.DANGER;
        ctx.fillRect(x + 4, panelY + 21, hpBarW * aRatio, 4);
        ctx.fillStyle = C.COLOR.TEXT_DIM;
        ctx.fillText(`AMMO: ${Math.floor(p.ammo)}/${C.GUNNER_AMMO_MAX}`, x + 4, panelY + 35);
      }
    }

    ctx.textAlign = 'left';
  },

  _renderBanner(ctx, text, timer) {
    const C = DD.Config;
    const alpha = Math.min(1, timer / 30);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(0, C.CANVAS_H / 2 - 30, C.CANVAS_W, 52);
    ctx.fillStyle = C.COLOR.INTERACTIVE;
    ctx.font = 'bold 24px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, C.CANVAS_W / 2, C.CANVAS_H / 2 + 8);
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  },

  renderDebug(ctx, state, fps) {
    if (!DD.Game.debugMode) return;
    const C = DD.Config;

    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.fillRect(4, 36, 180, 170);
    ctx.fillStyle = '#00ff44';
    ctx.font = '11px monospace';

    const lines = [
      `FPS: ${fps}`,
      `Phase: ${state.phase}`,
      `Wave: ${state.waveNum}`,
      `Depth: ${Math.floor(state.depth)}m`,
      `Enemies: ${DD.Entities.enemies.length}`,
      `Bullets: ${DD.Entities.bullets.length}`,
      `Particles: ${DD.Particles._particles.length}`,
      `Energy: ${state.platform.energy.toFixed(1)}%`,
      `Ammo pool: ${state.sharedPool.ammo.toFixed(1)}`,
      `Cores: ${state.sharedPool.cores}`,
      `Role: ${DD.Game.testMode ? DD.Game.activeRole : (DD.Game.localRole || 'host')}`,
      `Mode: ${DD.Game.testMode ? 'TEST' : DD.Network.isHostFlag ? 'HOST' : 'PEER'}`,
    ];

    for (let i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 8, 50 + i * 13);
    }
  },

  renderCores(ctx, state) {
    const C = DD.Config;
    ctx.fillStyle = C.COLOR.CORE;
    ctx.font = '11px monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`CORES: ${state.sharedPool.cores}`, 8, 52);
  },
};
