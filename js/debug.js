const GameDebugger = (() => {
    let enabled = false;

    function setEnabled(value) {
        enabled = value;
    }

    function logPlayerState(player, mouseX, mouseY, mapOffsetX, mapOffsetY) {
        if (!enabled) return;
        console.log(`[DEBUG] Player: (${player.x.toFixed(1)}, ${player.y.toFixed(1)}), Mouse: (${mouseX}, ${mouseY}), Angle: ${(player.angle * 180 / Math.PI).toFixed(1)}deg, Offset: (${mapOffsetX.toFixed(1)}, ${mapOffsetY.toFixed(1)})`);
    }

    function logBulletSpawn(screenX, screenY, worldX, worldY) {
        if (!enabled) return;
        console.log(`[DEBUG] Bullet: Screen(${screenX.toFixed(1)}, ${screenY.toFixed(1)}), World(${worldX.toFixed(1)}, ${worldY.toFixed(1)})`);
    }

    function drawDebugInfo(ctx, canvas, player, playerAngle, mapOffsetX, mapOffsetY) {
        if (!enabled) return;

        ctx.save();

        const playerScreenX = canvas.width / 2;
        const playerScreenY = canvas.height / 2;

        const bulletOffset = PLAYER_SIZE + BULLET_SIZE + 5;
        const expectedSpawnX = playerScreenX + Math.cos(playerAngle) * bulletOffset;
        const expectedSpawnY = playerScreenY + Math.sin(playerAngle) * bulletOffset;

        ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(playerScreenX, playerScreenY);
        ctx.lineTo(expectedSpawnX, expectedSpawnY);
        ctx.stroke();

        ctx.fillStyle = 'rgba(255, 0, 0, 0.8)';
        ctx.beginPath();
        ctx.arc(expectedSpawnX, expectedSpawnY, 5, 0, Math.PI * 2);
        ctx.fill();

        ctx.fillStyle = 'rgba(0, 255, 255, 0.8)';
        ctx.font = '12px Arial';
        ctx.fillText(`Player: (${player.x.toFixed(0)}, ${player.y.toFixed(0)})`, 10, 20);
        ctx.fillText(`Spawn: (${expectedSpawnX.toFixed(0)}, ${expectedSpawnY.toFixed(0)})`, 10, 40);
        ctx.fillText(`Offset: (${mapOffsetX.toFixed(0)}, ${mapOffsetY.toFixed(0)})`, 10, 60);

        ctx.restore();
    }

    return {
        setEnabled,
        logPlayerState,
        logBulletSpawn,
        drawDebugInfo
    };
})();
