const CoordSystem = (() => {
    let canvas = null;
    let mapWidth = 0;
    let mapHeight = 0;

    function init(canvasEl, mapW, mapH) {
        canvas = canvasEl;
        mapWidth = mapW;
        mapHeight = mapH;
    }

    function setMapSize(w, h) {
        mapWidth = w;
        mapHeight = h;
    }

    function updateOffset(playerX, playerY) {
        if (!canvas) return;
        const targetOffsetX = canvas.width / 2 - playerX;
        const targetOffsetY = canvas.height / 2 - playerY;
        window.mapOffsetX = Math.max(Math.min(targetOffsetX, 0), canvas.width - mapWidth);
        window.mapOffsetY = Math.max(Math.min(targetOffsetY, 0), canvas.height - mapHeight);
    }

    function getOffset() {
        return { x: window.mapOffsetX || 0, y: window.mapOffsetY || 0 };
    }

    function screenToWorld(screenX, screenY) {
        return {
            x: screenX - (window.mapOffsetX || 0),
            y: screenY - (window.mapOffsetY || 0)
        };
    }

    function worldToScreen(worldX, worldY) {
        return {
            x: worldX + (window.mapOffsetX || 0),
            y: worldY + (window.mapOffsetY || 0)
        };
    }

    function getPlayerScreenPos() {
        if (!canvas) return { x: 0, y: 0 };
        return {
            x: canvas.width / 2,
            y: canvas.height / 2
        };
    }

    function getMouseWorldPos(mouseScreenX, mouseScreenY) {
        return screenToWorld(mouseScreenX, mouseScreenY);
    }

    function getAimAngle(playerWorldX, playerWorldY, mouseScreenX, mouseScreenY) {
        const mouseWorld = screenToWorld(mouseScreenX, mouseScreenY);
        return Math.atan2(mouseWorld.y - playerWorldY, mouseWorld.x - playerWorldX);
    }

    function getBulletSpawnPos(playerWorldX, playerWorldY, angle, bulletOffset) {
        return {
            x: playerWorldX + Math.cos(angle) * bulletOffset,
            y: playerWorldY + Math.sin(angle) * bulletOffset
        };
    }

    function isOnScreen(worldX, worldY, margin = 100) {
        if (!canvas) return false;
        const screen = worldToScreen(worldX, worldY);
        return screen.x >= -margin && screen.x <= canvas.width + margin &&
               screen.y >= -margin && screen.y <= canvas.height + margin;
    }

    function clampToMap(worldX, worldY, margin = 20) {
        return {
            x: Math.max(margin, Math.min(worldX, mapWidth - margin)),
            y: Math.max(margin, Math.min(worldY, mapHeight - margin))
        };
    }

    return {
        init,
        setMapSize,
        updateOffset,
        getOffset,
        screenToWorld,
        worldToScreen,
        getPlayerScreenPos,
        getMouseWorldPos,
        getAimAngle,
        getBulletSpawnPos,
        isOnScreen,
        clampToMap
    };
})();